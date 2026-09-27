'use client';

import { useEffect, useState } from 'react';

const OPEN = 'tryos-scratch-open';

/**
 * Открыт ли «Решать на листе». Выбор общий для всех режимов и переживает
 * перезагрузку: кто решает на листе, тот и в следующей задаче на листе.
 */
export function useSheetOpen(): [boolean, (on: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN) === '1'); } catch { /* хранилище недоступно */ }
  }, []);
  const set = (on: boolean) => {
    setOpen(on);
    try {
      localStorage.setItem(OPEN, on ? '1' : '0');
      if (on) localStorage.setItem('tryos-sheet-seen', '1');
    } catch { /* хранилище недоступно */ }
  };
  return [open, set];
}

/** Листы тренажёра, работы над ошибками и выживания: общие по id задачи. */
export const PRACTICE_SHEETS = 'tryos-sheets';
