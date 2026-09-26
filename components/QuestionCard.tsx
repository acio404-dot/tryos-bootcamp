'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicQuestion, Verdict } from '@/lib/bank-types';
import { announceStreak } from '@/lib/streak-client';

const LETTERS = 'ABCDE';

export interface Answered extends Verdict {
  chosen: number;
}

/*
 * Одна задача с разбором сразу: выбрать вариант → «Проверить» → правильный
 * подсвечивается зелёным, ошибка красным, ниже разбор. Используется в
 * тренажёре, работе над ошибками и режиме выживания.
 */
export default function QuestionCard({
  q, mode, head, footer, saved = null, onResult, onNext, disabled = false,
}: {
  q: PublicQuestion;
  /** Куда записать попытку: practice | mistakes | survival. */
  mode: 'practice' | 'mistakes' | 'survival';
  head?: React.ReactNode;
  footer?: React.ReactNode;
  saved?: Answered | null;
  onResult?: (a: Answered) => void;
  onNext?: () => void;
  disabled?: boolean;
}) {
  const [chosen, setChosen] = useState<number | null>(saved ? saved.chosen : null);
  const [verdict, setVerdict] = useState<Verdict | null>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChosen(saved ? saved.chosen : null);
    setVerdict(saved);
    setError('');
  }, [q.id, saved]);

  const check = async () => {
    if (chosen === null || busy || verdict || disabled) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: q.id, chosen, mode }),
      });
      if (res.status === 404) {
        setError('Банк задач обновился, загружаю свежие задачи…');
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось проверить');
      setVerdict(data);
      announceStreak(data.streakUp);
      onResult?.({ ...data, chosen });
      setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось проверить. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        if (verdict) {
          if (onNext) { e.preventDefault(); onNext(); }
        } else if (chosen !== null) {
          e.preventDefault();
          checkRef.current();
        }
        return;
      }
      if (verdict) return;
      const k = e.key.toUpperCase();
      const byDigit = '12345'.indexOf(k);
      const byLetter = LETTERS.indexOf(k);
      const i = byDigit >= 0 ? byDigit : byLetter;
      if (i >= 0 && i < q.options.length) setChosen(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict, chosen, onNext, q.options.length]);

  return (
    <div className="qcard">
      {head ?? <div className="qtag">{q.topicLabel}</div>}
      <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
      {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

      <div className="qopts" role="radiogroup" aria-label="Варианты ответа">
        {q.options.map((o, i) => {
          let cls = 'qopt';
          if (verdict) {
            if (i === verdict.correct) cls += ' ok';
            else if (i === chosen) cls += ' bad';
            else cls += ' dim';
          } else if (i === chosen) {
            cls += ' on';
          }
          return (
            <button key={i} type="button" role="radio" aria-checked={i === chosen} className={cls}
              disabled={!!verdict || disabled} onClick={() => setChosen(i)}>
              <span className="ql">{LETTERS[i]}</span>
              <span className="qo">{o}</span>
              {verdict && i === verdict.correct ? <em className="qmark">правильный</em> : null}
              {verdict && i === chosen && i !== verdict.correct ? <em className="qmark">твой ответ</em> : null}
            </button>
          );
        })}
      </div>

      {verdict ? (
        <div ref={box}>
          <div className={`qverdict ${verdict.isCorrect ? 'ok' : 'bad'}`}>
            {verdict.isCorrect ? 'Верно!' : `Неверно. Правильный ответ — ${LETTERS[verdict.correct]}.`}
          </div>
          <div className="qexp">
            <b>Разбор</b>
            <div dangerouslySetInnerHTML={{ __html: verdict.explanation }} />
          </div>
          {footer}
        </div>
      ) : (
        <div className="qact">
          <span className="qhint">{chosen === null ? 'Выбери вариант ответа' : `Выбран вариант ${LETTERS[chosen]}`}</span>
          <button type="button" className="btn btn-primary" disabled={chosen === null || busy || disabled} onClick={check}>
            {busy ? 'Проверяю…' : 'Проверить'}
          </button>
        </div>
      )}
      {error ? <p className="qerr">{error}</p> : null}
    </div>
  );
}
