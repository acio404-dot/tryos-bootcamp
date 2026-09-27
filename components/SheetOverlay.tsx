'use client';

import { useEffect, useRef, useState } from 'react';
import type { Whiteboard } from '@/lib/tryos-whiteboard';

/*
 * «Решать на листе»: во весь экран белый лист, задача — в карточке поверх него
 * (карточку можно перетащить и свернуть). У каждой задачи свой лист (sheetId),
 * листы хранятся в браузере под storageKey: вернулся к задаче — записи на месте.
 * Используется во всех режимах: пробник, тренажёр, работа над ошибками, выживание.
 */
export default function SheetOverlay({
  storageKey, sheetId, noteIds, onNotes, title, tag, bar, actions, footer, onClose, children,
}: {
  storageKey: string;
  sheetId: string;
  /** Задачи, для которых нужно знать, есть ли на листе записи (точки на карте задач). */
  noteIds?: string[];
  onNotes?: (notes: Record<string, boolean>) => void;
  title: React.ReactNode;
  tag?: React.ReactNode;
  /** Левая часть верхней панели: таймер, карта задач, жизни. */
  bar?: React.ReactNode;
  /** Кнопки перед «Закрыть лист». */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<Whiteboard | null>(null);
  const sid = useRef(sheetId);
  sid.current = sheetId;
  const notesRef = useRef(onNotes);
  notesRef.current = onNotes;
  const [min, setMin] = useState(false);
  const idsKey = (noteIds || []).join('|');

  // Лист создаётся один раз; библиотека грузится только в браузере.
  useEffect(() => {
    let alive = true;
    const known: Record<string, boolean> = {};
    import('@/lib/tryos-whiteboard').then((m) => {
      if (!alive || !boardRef.current) return;
      const pad = m.default.create({
        container: boardRef.current,
        storageKey,
        sheet: sid.current,
        textFont: 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif',
        onChange: (id, data) => {
          known[id] = data.items.length > 0;
          notesRef.current?.({ ...known });
        },
      });
      padRef.current = pad;
      for (const id of idsKey ? idsKey.split('|') : []) known[id] = pad.hasContent(id);
      notesRef.current?.({ ...known });
    });
    return () => {
      alive = false;
      padRef.current?.destroy();
      padRef.current = null;
    };
  }, [storageKey, idsKey]);

  useEffect(() => { padRef.current?.setSheet(sheetId); }, [sheetId]);

  // Пока открыт лист, страница под ним не прокручивается.
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
    <div className="scr" role="dialog" aria-modal="true" aria-label="Лист для решения">
      <div className="scr-bar">
        {bar ?? <span className="scr-grow" />}
        <span className="scr-act">
          {actions}
          <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>Закрыть лист</button>
        </span>
      </div>

      <div className="scr-board" ref={boardRef}>
        <div className={`scr-card${min ? ' min' : ''}`} ref={cardRef}>
          <div className="scr-head" ref={headRef} title="Перетащите, чтобы подвинуть задачу">
            <svg className="scr-grip" width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
              <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
            </svg>
            <b>{title}</b>
            {tag ? <span className="qtag">{tag}</span> : null}
            <button type="button" className="scr-min" aria-expanded={!min}
              aria-label={min ? 'Развернуть задачу' : 'Свернуть задачу'} title={min ? 'Развернуть задачу' : 'Свернуть задачу'}
              onClick={() => setMin(!min)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
            </button>
          </div>
          <div className="scr-body">{children}</div>
          {footer ? <div className="scr-foot">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
