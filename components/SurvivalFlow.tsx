'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { PublicQuestion, Verdict } from '@/lib/bank-types';
import { IArrow, IFlame, IHeart } from './icons';

const LETTERS = 'ABCDE';

interface State {
  id: string;
  question: PublicQuestion | null;
  streak: number;
  best: number;
  lives: number;
  alive: boolean;
}

/*
 * Режим выживания: задачи идут без конца, пока не кончатся три жизни.
 * Серия и жизни живут на сервере — здесь только экран.
 */
export default function SurvivalFlow({ myBest }: { myBest: number }) {
  const [run, setRun] = useState<State | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/survival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Не удалось начать');
      setRun({ id: d.id, question: d.question, streak: 0, best: 0, lives: d.lives, alive: true });
      setChosen(null);
      setVerdict(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать');
    } finally {
      setBusy(false);
    }
  };

  const answer = async () => {
    if (!run || chosen === null || busy || verdict) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/survival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', id: run.id, chosen }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Не удалось проверить');
      setVerdict(d.verdict);
      setRun((p) => (p ? { ...p, streak: d.streak, best: d.best, lives: d.lives, alive: d.alive, question: d.question ?? p.question } : p));
      setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось проверить');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setChosen(null);
    setVerdict(null);
  };

  const answerRef = useRef(answer);
  answerRef.current = answer;
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
        else answerRef.current();
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
        <p>Задачи идут одна за другой без остановки. Верный ответ удлиняет серию,
          неверный забирает одну жизнь из трёх. Когда жизни кончатся, лучшая серия
          уйдёт в таблицу лидеров.</p>
        <p className="muted">Твой рекорд: <b>{myBest || 0}</b></p>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={start}>
          {busy ? 'Готовлю…' : <>Начать серию <IArrow /></>}
        </button>
        {error ? <p className="qerr">{error}</p> : null}
      </div>
    );
  }

  if (!run.alive) {
    const record = run.best > myBest;
    return (
      <div className="empty-card">
        <h2 style={{ margin: '0 0 6px' }}>Серия окончена</h2>
        <p>Лучшая серия: <b>{run.best}</b> подряд.{record ? ' Это твой новый рекорд.' : ''}</p>
        <div className="modal-act" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-ghost" href="/mistakes">Разобрать ошибки</Link>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>Ещё раз</button>
        </div>
      </div>
    );
  }

  const q = run.question;
  if (!q) return <div className="empty-card"><p>Задачи закончились. Попробуй позже.</p></div>;

  return (
    <>
      <div className="surv-bar">
        <span className="flame"><IFlame />{run.streak}</span>
        <span className="lives" aria-label={`Жизней: ${run.lives}`}>
          {[0, 1, 2].map((k) => <i key={k} className={k < run.lives ? 'on' : undefined}><IHeart /></i>)}
        </span>
        <span className="st">Рекорд серии: {Math.max(run.best, myBest)}</span>
      </div>

      <div className="qcard">
        <div className="qtag">{q.topicLabel}</div>
        <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
        {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

        <div className="qopts" role="radiogroup" aria-label="Варианты ответа">
          {q.options.map((o, i) => {
            let cls = 'qopt';
            if (verdict) {
              if (i === verdict.correct) cls += ' ok';
              else if (i === chosen) cls += ' bad';
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
                : `Неверно. Правильный ответ — ${LETTERS[verdict.correct]}. Жизней осталось ${run.lives}.`}
            </div>
            <div className="qexp">
              <b>Разбор</b>
              <div dangerouslySetInnerHTML={{ __html: verdict.explanation }} />
            </div>
            <div className="qact end">
              <span className="qhint">Enter — дальше</span>
              <button type="button" className="btn btn-primary" onClick={next}>Следующая задача</button>
            </div>
          </div>
        ) : (
          <div className="qact">
            <span className="qhint">{chosen === null ? 'Выбери вариант ответа' : `Выбран вариант ${LETTERS[chosen]}`}</span>
            <button type="button" className="btn btn-primary" disabled={chosen === null || busy} onClick={answer}>
              {busy ? 'Проверяю…' : 'Ответить'}
            </button>
          </div>
        )}
        {error ? <p className="qerr">{error}</p> : null}
      </div>
    </>
  );
}
