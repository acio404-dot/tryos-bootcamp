'use client';

import { useState } from 'react';
import type { PublicQuestion } from '@/lib/bank-types';
import SheetOverlay from './SheetOverlay';

const LETTERS = 'ABCDE';

/*
 * «Решать на листе» в пробнике: таймер, карта задач и «Завершить» в верхней
 * панели, у каждой задачи свой лист для этого варианта.
 */
export default function ExamScratch({
  runId, questions, index, setIndex, answers, pick, clock, low, onClose, onFinish,
}: {
  runId: string;
  questions: PublicQuestion[];
  index: number;
  setIndex: (n: number) => void;
  answers: Record<string, number>;
  pick: (opt: number) => void;
  clock: string;
  low: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const q = questions[index];
  const [notes, setNotes] = useState<Record<string, boolean>>({});

  return (
    <SheetOverlay
      storageKey={`tryos-exam-${runId}`}
      sheetId={q.id}
      noteIds={questions.map((x) => x.id)}
      onNotes={setNotes}
      title={<>Задача {index + 1} <i>из {questions.length}</i></>}
      tag={q.section === 'iq' ? 'Логика' : 'Математика'}
      onClose={onClose}
      bar={
        <>
          <span className={`clock${low ? ' low' : ''}`}>{clock}</span>
          <div className="scr-map" aria-label="Задачи">
            {questions.map((qq, k) => {
              const done = answers[qq.id] !== undefined;
              const label = `Задача ${k + 1}${done ? `, ответ ${LETTERS[answers[qq.id]]}` : ', без ответа'}${notes[qq.id] ? ', есть записи' : ''}`;
              return (
                <button key={qq.id} type="button" title={label} aria-label={label} aria-current={k === index}
                  className={`${done ? 'done' : ''}${notes[qq.id] ? ' notes' : ''}${k === index ? ' cur' : ''}`}
                  onClick={() => setIndex(k)}>{k + 1}</button>
              );
            })}
          </div>
        </>
      }
      actions={<button type="button" className="btn btn-sm btn-light" onClick={onFinish}>Завершить</button>}
      footer={
        <>
          <button type="button" className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Назад</button>
          <span className="scr-hint">У каждой задачи свой лист</span>
          <button type="button" className="btn btn-sm btn-primary" disabled={index >= questions.length - 1} onClick={() => setIndex(index + 1)}>Дальше</button>
        </>
      }
    >
      <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
      {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}
      <div className="qopts" role="radiogroup" aria-label="Варианты ответа">
        {q.options.map((o, k) => (
          <button key={k} type="button" role="radio" aria-checked={answers[q.id] === k}
            className={`qopt${answers[q.id] === k ? ' on' : ''}`} onClick={() => pick(k)}>
            <span className="ql">{LETTERS[k]}</span>
            <span className="qo">{o}</span>
          </button>
        ))}
      </div>
    </SheetOverlay>
  );
}
