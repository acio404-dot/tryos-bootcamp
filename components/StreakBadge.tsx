import { plural } from '@/lib/format';

/*
 * Стрик ученика: красный огонёк с числом дней внутри. Ставится рядом с именем
 * (профиль, таблица лидеров, админка). Без стрика ничего не показывает.
 */
export default function StreakBadge({ n, size = 'sm' }: { n: number; size?: 'sm' | 'md' | 'lg' }) {
  if (!n || n < 1) return null;
  const label = `Стрик: ${n} ${plural(n, 'день', 'дня', 'дней')} подряд`;
  return (
    <span className={`streak-badge sb-${size}${n >= 100 ? ' sb-3' : ''}`} title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 24 28" aria-hidden="true">
        <path d="M12 .8c1.1 3.3 3.4 5.3 5.4 7.6 1.9 2.2 3.4 4.6 3.4 7.9A8.8 8.8 0 0 1 12 25.2a8.8 8.8 0 0 1-8.8-8.9c0-3.1 1.4-5.5 3.3-7.3.3 1.9 1.2 3.2 2.6 3.7C8.6 8.4 9.6 3.9 12 .8Z" fill="#EF4444" />
        <path d="M12 9.5c2.2 2.3 4.6 4.3 4.6 7.6A4.6 4.6 0 0 1 12 21.8a4.6 4.6 0 0 1-4.6-4.7c0-2.7 2.3-4.8 4.6-7.6Z" fill="#F97316" opacity=".55" />
      </svg>
      <b aria-hidden="true">{n}</b>
    </span>
  );
}
