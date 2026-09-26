'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicQuestion, Verdict } from '@/lib/bank-types';
import { announceStreak } from '@/lib/streak-client';
import { IArrow, IClock, IFlame, IHeart } from './icons';

const LETTERS = 'ABCDE';
const SECONDS = 90;
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface State {
  id: string;
  /** Задача на экране. */
  question: PublicQuestion | null;
  /** Следующая задача: сервер присылает её вместе с вердиктом, показываем после «Следующая задача». */
  upcoming: PublicQuestion | null;
  streak: number;
  best: number;
  lives: number;
  alive: boolean;
  /** Серию закончил сам ученик кнопкой. */
  stopped?: boolean;
}

type Result = Verdict & { timedOut?: boolean };

/*
 * Режим выживания: задачи идут без конца, пока не кончатся три жизни
 * или ученик не закончит серию сам. На каждую задачу 90 секунд — не успел,
 * задача считается неверной. Серия, жизни и время проверяются на сервере.
 */
export default function SurvivalFlow({ myBest, canMistakes = true }: { myBest: number; canMistakes?: boolean }) {
  const [run, setRun] = useState<State | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(SECONDS);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const deadline = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/survival', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || 'Не получилось');
    return d;
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'start' });
      setRun({ id: d.id, question: d.question, upcoming: null, streak: 0, best: 0, lives: d.lives, alive: true });
      setChosen(null);
      setVerdict(null);
      setConfirmEnd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать');
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(async (timeout: boolean) => {
    if (!run || busy || verdict) return;
    if (!timeout && chosen === null) return;
    setBusy(true);
    setError('');
    try {
      const d = await post(timeout ? { action: 'answer', id: run.id, timeout: true } : { action: 'answer', id: run.id, chosen });
      setVerdict(d.verdict);
      announceStreak(d.streakUp);
      setRun((p) => (p ? {
        ...p, streak: d.streak, best: d.best, lives: d.lives, alive: d.alive, upcoming: d.question ?? null,
      } : p));
      setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось проверить');
    } finally {
      setBusy(false);
    }
  }, [run, busy, verdict, chosen]);

  const next = () => {
    setRun((p) => (p ? { ...p, question: p.upcoming, upcoming: null } : p));
    setChosen(null);
    setVerdict(null);
  };

  const end = async () => {
    if (!run) return;
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'end', id: run.id });
      setRun((p) => (p ? { ...p, best: d.best, alive: false, stopped: true } : p));
      setConfirmEnd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось закончить');
    } finally {
      setBusy(false);
    }
  };

  // Таймер: 90 секунд на задачу, отсчёт с момента, когда задача появилась на экране.
  const qid = run?.alive && !verdict ? run.question?.id : undefined;
  const runId = run?.id;
  useEffect(() => {
    if (!qid || !runId) return;
    deadline.current = Date.now() + SECONDS * 1000;
    setLeft(SECONDS);
    post({ action: 'shown', id: runId }).catch(() => { /* сервер посчитает время с момента выдачи задачи */ });
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [qid, runId]);

  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (qid && left <= 0) submitRef.current(true);
  }, [left, qid]);

  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (verdict) nextRef.current();
        else submitRef.current(false);
        return;
      }
      if (verdict) return;
      const k = e.key.toUpperCase();
      const byDigit = '12345'.indexOf(k);
      const byLetter = LETTERS.indexOf(k);
      const i = byDigit >= 0 ? byDigit : byLetter;
      if (i >= 0 && i < 5) setChosen(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict]);

  if (!run) {
    return (
      <div className="empty-card">
        <p>Задачи идут одна за другой, на каждую — 90 секунд. Верный ответ удлиняет серию,
          неверный или просроченный забирает одну жизнь из трёх. Закончить серию можно
          в любой момент — лучшая попадёт в таблицу лидеров.</p>
        <p className="muted">Твой рекорд: <b>{myBest || 0}</b></p>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={start}>
          {busy ? 'Готовлю…' : <>Начать серию <IArrow /></>}
        </button>
        {error ? <p className="qerr">{error}</p> : null}
      </div>
    );
  }

  // Серия окончена: ученик закончил сам или кончились жизни (после разбора последней задачи).
  if (!run.alive && (run.stopped || !verdict)) {
    const record = run.best > myBest;
    return (
      <div className="empty-card">
        <h2 style={{ margin: '0 0 6px' }}>{run.stopped ? 'Серия завершена' : 'Жизни закончились'}</h2>
        <p>Лучшая серия: <b>{run.best}</b> подряд.{record ? ' Это твой новый рекорд!' : ''}</p>
        <div className="modal-act" style={{ justifyContent: 'center' }}>
          {canMistakes ? <Link className="btn btn-ghost" href="/mistakes">Разобрать ошибки</Link> : null}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>Ещё раз</button>
        </div>
      </div>
    );
  }

  const q = run.question;
  if (!q) return <div className="empty-card"><p>Задачи закончились. Попробуй позже.</p></div>;

  const pct = Math.max(0, Math.min(100, (left / SECONDS) * 100));
  const hurry = !verdict && left <= 15;

  return (
    <>
      <div className="surv-bar">
        <span className="flame"><IFlame />{run.streak}</span>
        <span className="lives" aria-label={`Жизней: ${run.lives}`}>
          {[0, 1, 2].map((k) => <i key={k} className={k < run.lives ? 'on' : undefined}><IHeart /></i>)}
        </span>
        <span className={`surv-clock${hurry ? ' hurry' : ''}${verdict ? ' paused' : ''}`}
          role="timer" aria-label={verdict ? 'Таймер на паузе' : `Осталось ${left} секунд`}>
          <IClock />{verdict ? 'пауза' : mss(left)}
        </span>
        <span className="st">Рекорд: {Math.max(run.best, myBest)}</span>
        {confirmEnd ? (
          <span className="surv-end">
            <span>Закончить серию?</span>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={end}>Да, закончить</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmEnd(false)}>Нет</button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost surv-end-btn" disabled={busy} onClick={() => setConfirmEnd(true)}>
            Закончить серию
          </button>
        )}
      </div>
      {!verdict ? (
        <div className="surv-time" aria-hidden="true"><i style={{ width: `${pct}%` }} className={hurry ? 'hurry' : undefined} /></div>
      ) : null}

      <div className="qcard">
        <div className="qtag">{q.topicLabel}</div>
        <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
        {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

        <div className="qopts" role="radiogroup" aria-label="Варианты ответа">
          {q.options.map((o, i) => {
            let cls = 'qopt';
            if (verdict) {
              if (i === verdict.correct) cls += ' ok';
              else if (i === chosen && !verdict.timedOut) cls += ' bad';
              else cls += ' dim';
            } else if (i === chosen) cls += ' on';
            return (
              <button key={i} type="button" role="radio" aria-checked={i === chosen} className={cls}
                disabled={!!verdict} onClick={() => setChosen(i)}>
                <span className="ql">{LETTERS[i]}</span>
                <span className="qo">{o}</span>
              </button>
            );
          })}
        </div>

        {verdict ? (
          <div ref={box}>
            <div className={`qverdict ${verdict.isCorrect ? 'ok' : 'bad'}`}>
              {verdict.isCorrect
                ? `Верно! Серия ${run.streak}.`
                : `${verdict.timedOut ? 'Время вышло.' : 'Неверно.'} Правильный ответ — ${LETTERS[verdict.correct]}. ${run.alive ? `Жизней осталось: ${run.lives}.` : 'Жизни закончились.'}`}
            </div>
            <div className="qexp">
              <b>Разбор</b>
              <div dangerouslySetInnerHTML={{ __html: verdict.explanation }} />
            </div>
            <div className="qact end">
              <span className="qhint">Enter — дальше</span>
              <button type="button" className="btn btn-primary" onClick={next}>
                {run.alive ? 'Следующая задача' : 'Итог серии'}
              </button>
            </div>
          </div>
        ) : (
          <div className="qact">
            <span className="qhint">{chosen === null ? 'Выбери вариант ответа' : `Выбран вариант ${LETTERS[chosen]}`}</span>
            <button type="button" className="btn btn-primary" disabled={chosen === null || busy} onClick={() => submit(false)}>
              {busy ? 'Проверяю…' : 'Ответить'}
            </button>
          </div>
        )}
        {error ? <p className="qerr">{error}</p> : null}
      </div>
    </>
  );
}
