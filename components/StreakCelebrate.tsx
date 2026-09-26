'use client';

import { useEffect, useRef, useState } from 'react';
import { plural } from '@/lib/format';
import type { StreakUp } from '@/lib/streak-client';
import StreakBadge from './StreakBadge';

const KEY = 'tryos-streak-shown';

const MILESTONE: Record<number, string> = {
  3: 'Три дня подряд — так и появляется привычка.',
  7: 'Целая неделя без пропусков!',
  14: 'Две недели каждый день. Так готовятся к 450+.',
  30: 'Месяц подряд! Это уже система.',
  50: 'Пятьдесят дней подряд — ты в топе школы по упорству.',
  100: 'Сто дней подряд. Легенда.',
};

/*
 * Достижение «стрик продлился»: показывается один раз в день, когда ученик
 * решает первую задачу за сегодня (сразу после ответа или при следующем
 * открытии страницы, например после пробника).
 */
export default function StreakCelebrate({ current, today, date }: { current: number; today: boolean; date: string }) {
  const [n, setN] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const maybe = (s: StreakUp) => {
      if (!s || s.current < 1) return;
      let seen = '';
      try { seen = localStorage.getItem(KEY) || ''; } catch { return; }
      if (seen === s.date) return;
      try { localStorage.setItem(KEY, s.date); } catch { /* хранилище недоступно */ }
      setN(s.current);
    };
    if (today) maybe({ current, date });
    const on = (e: Event) => maybe((e as CustomEvent<StreakUp>).detail);
    window.addEventListener('tryos:streak', on);
    return () => window.removeEventListener('tryos:streak', on);
  }, [current, today, date]);

  useEffect(() => {
    if (!n) return;
    btn.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setN(0); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [n]);

  if (!n) return null;
  const days = `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  const title = n === 1 ? 'Стрик начался!' : `Стрик ${days} подряд!`;
  const text = n === 1
    ? 'Ты решил задачу сегодня. Заходи завтра и продлевай стрик — огонёк будет виден рядом с твоим именем.'
    : MILESTONE[n] || `Ты решаешь задачи ${days} подряд. Заходи завтра, чтобы не прервать стрик.`;

  return (
    <div className="streak-pop" role="dialog" aria-modal="true" aria-labelledby="streak-pop-title" onClick={() => setN(0)}>
      <div className="streak-pop-box" onClick={(e) => e.stopPropagation()}>
        <span className="streak-pop-kicker">Достижение</span>
        <div className="streak-pop-flame"><StreakBadge n={n} size="lg" /></div>
        <h3 id="streak-pop-title">{title}</h3>
        <p>{text}</p>
        <button ref={btn} type="button" className="btn btn-primary" onClick={() => setN(0)}>Продолжить</button>
      </div>
    </div>
  );
}
