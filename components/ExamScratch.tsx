'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicQuestion } from '@/lib/bank-types';
import type { Whiteboard } from '@/lib/tryos-whiteboard';

const LETTERS = 'ABCDE';

/*
 * Черновик пробника: во весь экран белый лист, задача — в карточке поверх него.
 * У каждой задачи свой лист (по id задачи), листы хранятся в браузере для этого варианта:
 * переход к другой задаче открывает её лист, возврат назад — прежние записи.
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
  const boardRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<Whiteboard | null>(null);
  const qid = useRef(q.id);
  qid.current = q.id;
  const [notes, setNotes] = useState<Record<string, boolean>>({});
  const [min, setMin] = useState(false);

  // Лист создаётся один раз на вариант; библиотека грузится только в браузере.
  useEffect(() => {
    let alive = true;
    import('@/lib/tryos-whiteboard').then((m) => {
      const api = m.default;
      if (!alive || !boardRef.current) return;
      const pad = api.create({
        container: boardRef.current,
        storageKey: `tryos-exam-${runId}`,
        sheet: qid.current,
        textFont: 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif',
        onChange: (id, data) => setNotes((n) => ({ ...n, [id]: data.items.length > 0 })),
      });
      padRef.current = pad;
      setNotes(Object.fromEntries(questions.map((qq) => [qq.id, pad.hasContent(qq.id)])));
    });
    return () => {
      alive = false;
      padRef.current?.destroy();
      padRef.current = null;
    };
  }, [runId, questions]);

  useEffect(() => { padRef.current?.setSheet(q.id); }, [q.id]);

  // Пока открыт черновик, страница под ним не прокручивается.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Карточку задачи можно перетащить, чтобы освободить место на листе.
  useEffect(() => {
    const head = headRef.current, card = cardRef.current, board = boardRef.current;
    if (!head || !card || !board) return;
    let drag: { id: number; dx: number; dy: number } | null = null;
    const place = (x: number, y: number) => {
      const maxX = Math.max(8, board.clientWidth - card.offsetWidth - 8);
      const maxY = Math.max(8, board.clientHeight - head.offsetHeight - 8);
      card.style.left = `${Math.min(Math.max(8, x), maxX)}px`;
      card.style.top = `${Math.min(Math.max(8, y), maxY)}px`;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      head.setPointerCapture(e.pointerId);
      const br = board.getBoundingClientRect(), cr = card.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - cr.left, dy: e.clientY - cr.top };
      place(cr.left - br.left, cr.top - br.top);
      head.classList.add('dragging');
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const br = board.getBoundingClientRect();
      place(e.clientX - br.left - drag.dx, e.clientY - br.top - drag.dy);
    };
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      head.classList.remove('dragging');
    };
    // после перетаскивания позиция задана в style; при смене размера окна держим карточку в пределах листа
    const keep = () => { if (card.style.left) place(card.offsetLeft, card.offsetTop); };
    head.addEventListener('pointerdown', down);
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
    window.addEventListener('resize', keep);
    return () => {
      head.removeEventListener('pointerdown', down);
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      window.removeEventListener('resize', keep);
    };
  }, []);

  return (
    <div className="scr" role="dialog" aria-modal="true" aria-label="Черновик">
      <div className="scr-bar">
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
        <span className="scr-act">
          <button type="button" className="btn btn-sm btn-light" onClick={onFinish}>Завершить</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>Закрыть черновик</button>
        </span>
      </div>

      <div className="scr-board" ref={boardRef}>
        <div className={`scr-card${min ? ' min' : ''}`} ref={cardRef}>
          <div className="scr-head" ref={headRef} title="Перетащите, чтобы подвинуть задачу">
            <svg className="scr-grip" width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
              <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
            </svg>
            <b>Задача {index + 1} <i>из {questions.length}</i></b>
            <span className="qtag">{q.section === 'iq' ? 'Логика' : 'Математика'}</span>
            <button type="button" className="scr-min" aria-expanded={!min}
              aria-label={min ? 'Развернуть задачу' : 'Свернуть задачу'} title={min ? 'Развернуть задачу' : 'Свернуть задачу'}
              onClick={() => setMin(!min)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
            </button>
          </div>
          <div className="scr-body">
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
          </div>
          <div className="scr-foot">
            <button type="button" className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Назад</button>
            <span className="scr-hint">У каждой задачи свой лист</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={index >= questions.length - 1} onClick={() => setIndex(index + 1)}>Дальше</button>
          </div>
        </div>
      </div>
    </div>
  );
}
