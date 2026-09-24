'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import QuestionCard, { type Answered } from './QuestionCard';
import type { PublicQuestion } from '@/lib/bank-types';

/*
 * Серия задач с разбором: тренажёр по теме и работа над ошибками.
 * Счётчик «верно» и переход к следующей задаче; в конце — итог.
 */
export default function SeriesFlow({
  questions, mode, backHref, backLabel, emptyText,
}: {
  questions: PublicQuestion[];
  mode: 'practice' | 'mistakes';
  backHref: string;
  backLabel: string;
  emptyText?: string;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answered>>({});

  const done = useMemo(() => Object.keys(answers).length, [answers]);
  const right = useMemo(() => Object.values(answers).filter((a) => a.isCorrect).length, [answers]);

  if (!questions.length) {
    return (
      <div className="empty-card">
        <p>{emptyText || 'Задач пока нет.'}</p>
        <Link className="btn btn-primary" href={backHref}>{backLabel}</Link>
      </div>
    );
  }

  if (i >= questions.length) {
    return (
      <div className="empty-card">
        <p>Серия пройдена: {right} из {done} верно.</p>
        <Link className="btn btn-primary" href={backHref}>{backLabel}</Link>
      </div>
    );
  }

  const q = questions[i];
  const last = i >= questions.length - 1;
  const saved = answers[q.id] ?? null;

  return (
    <>
      <div className="series-head">
        <Link className="back" href={backHref}>← {backLabel}</Link>
        <span className="st">Задача {i + 1} из {questions.length}</span>
        <span className="st good">Верно: {right}</span>
      </div>

      <QuestionCard
        q={q}
        mode={mode}
        saved={saved}
        onResult={(a) => setAnswers((p) => ({ ...p, [q.id]: a }))}
        onNext={() => setI((n) => Math.min(n + 1, questions.length))}
        footer={
          <div className="qact end">
            <span className="qhint">Enter — дальше</span>
            {last ? (
              <Link className="btn btn-primary" href={backHref}>Завершить</Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setI((n) => n + 1)}>
                Следующая задача
              </button>
            )}
          </div>
        }
      />
    </>
  );
}
