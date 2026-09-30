'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/*
 * Полоска загрузки сверху: появляется сразу после клика по ссылке кабинета
 * и исчезает, когда новая страница пришла. Без неё медленный ответ сервера
 * выглядит так, будто сайт «завис».
 */
export default function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (timer.current) clearTimeout(timer.current);
      setState('run');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // адрес сменился — страница пришла
  useEffect(() => {
    setState((s) => (s === 'run' ? 'done' : s));
    timer.current = setTimeout(() => setState('idle'), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [path, search]);

  if (state === 'idle') return null;
  return <div className={`navp navp-${state}`} role="progressbar" aria-label="Загрузка страницы" />;
}
