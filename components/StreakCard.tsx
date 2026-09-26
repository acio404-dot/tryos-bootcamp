import type { StreakInfo } from '@/lib/streak';
import { DOW, plural } from '@/lib/format';
import StreakBadge from './StreakBadge';

const dowOf = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/*
 * Стрик на главной: сколько дней подряд ученик заходит и решает задачи,
 * отметки за последние 7 дней и рекорд. Полоса во всю ширину — первое, что
 * видно после приветствия.
 */
export default function StreakCard({ s }: { s: StreakInfo }) {
  const days = `${s.current} ${plural(s.current, 'день', 'дня', 'дней')}`;
  const status = s.today
    ? 'Сегодня засчитано. Возвращайся завтра, чтобы продлить стрик.'
    : s.current
      ? 'Реши сегодня хотя бы одну задачу, иначе стрик сгорит в полночь.'
      : 'Реши любую задачу — и стрик начнётся. Огонёк появится рядом с твоим именем.';
  return (
    <section className={`streak-strip${s.today ? ' is-today' : s.current ? ' at-risk' : ' is-off'}`} aria-label="Стрик">
      <div className="streak-flame">
        {s.current ? <StreakBadge n={s.current} size="md" /> : <span className="streak-off" aria-hidden="true" />}
      </div>
      <div className="streak-txt">
        <span className="streak-kicker">Стрик</span>
        <b>{s.current ? `${days} подряд` : 'Пока нет стрика'}</b>
        <i>{status}</i>
      </div>
      <div className="streak-week" aria-label="Последние 7 дней">
        {s.week.map((d) => (
          <span key={d.date} className={`${d.done ? 'on' : ''}${d.date === s.date ? ' now' : ''}`}
            title={`${DOW[dowOf(d.date)]}: ${d.done ? 'решал задачи' : 'без задач'}`}>
            <em>{DOW[dowOf(d.date)]}</em>
            <i aria-hidden="true">{d.done ? '✓' : ''}</i>
          </span>
        ))}
      </div>
      <div className="streak-best">
        <b>{s.best}</b>
        <span>{plural(s.best, 'день', 'дня', 'дней')} — рекорд</span>
      </div>
    </section>
  );
}
