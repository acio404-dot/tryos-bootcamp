'use client';

import { useEffect, useState } from 'react';

const SEEN = 'tryos-sheet-seen';

export const PenIcon = ({ size }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.17 6.81a2.82 2.82 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" />
  </svg>
);

/*
 * Кнопка «Решать на листе». Пока ученик ни разу не открывал лист, она помечена
 * «новое» и один раз показывает подсказку, что это и зачем.
 */
export default function SheetButton({ open, onOpen, small = false }: { open: boolean; onOpen: () => void; small?: boolean }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN) === '1'); } catch { /* хранилище недоступно */ }
  }, []);
  const markSeen = () => {
    setSeen(true);
    try { localStorage.setItem(SEEN, '1'); } catch { /* хранилище недоступно */ }
  };
  const go = () => { markSeen(); onOpen(); };

  return (
    <span className="sheet-anchor">
      <button type="button" className={`btn sheet-btn${small ? ' btn-sm' : ''}`} onClick={go}
        title="Пиши и черти прямо на экране: у каждой задачи свой лист">
        <PenIcon />
        Решать на листе
        {!seen ? <span className="sheet-new">новое</span> : null}
      </button>
      {!seen && !open ? (
        <div className="sheet-intro" role="note" aria-label="Подсказка: решать на листе">
          <svg className="sheet-intro-art" viewBox="0 0 120 84" aria-hidden="true">
            <rect x="1" y="1" width="118" height="82" rx="10" fill="#fff" />
            <path d="M12 21h96M12 41h96M12 61h96M34 1v82M60 1v82M86 1v82" stroke="#DCE6EF" strokeWidth="1" />
            <path d="M18 66 L46 20 L74 66 Z" fill="none" stroke="#2563EB" strokeWidth="2.6" strokeLinejoin="round" />
            <path d="M24 66v-7h7" fill="none" stroke="#2563EB" strokeWidth="1.8" />
            <path d="M84 30c4-6 12-6 14 0s-8 10-12 14h14" fill="none" stroke="#1F2937" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M58 47c10 2 18 1 26-3" fill="none" stroke="#FDE047" strokeWidth="9" strokeLinecap="round" opacity=".8" />
            <path d="M52 44h8M56 40v8" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div>
            <b>Решай прямо на экране</b>
            <p>Пиши, черти треугольники и считай столбиком, как на бумаге. У каждой задачи свой лист,
              записи сохраняются. Со стилусом ещё удобнее.</p>
            <div className="sheet-intro-act">
              <button type="button" className="btn btn-sm btn-primary" onClick={go}>Попробовать</button>
              <button type="button" className="btn btn-sm sheet-later" onClick={markSeen}>Не сейчас</button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}

/** Маленькая кнопка в шапке карточки задачи. */
export function SheetChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="qsheet" onClick={onOpen} title="Открыть лист для решения этой задачи">
      <PenIcon size={15} />
      Решить на листе
    </button>
  );
}
