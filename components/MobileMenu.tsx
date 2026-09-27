'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const EVENT = 'tryos:menu';

/** Кнопка, открывающая меню на телефоне (в нижней панели и аватар в шапке). */
export function MenuButton({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} aria-label={label} aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new Event(EVENT))}>
      {children}
    </button>
  );
}

/*
 * Меню на телефоне: панель снизу со всеми разделами кабинета, профилем и выходом.
 * Содержимое рисует сервер (Shell), здесь только открытие и закрытие.
 */
export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="mm" onClick={() => setOpen(false)}>
      <div className="mm-sheet" role="dialog" aria-modal="true" aria-label="Меню"
        onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
        <div className="mm-grip" aria-hidden="true" />
        <button type="button" className="mm-close" aria-label="Закрыть меню" onClick={() => setOpen(false)}>×</button>
        {children}
      </div>
    </div>
  );
}
