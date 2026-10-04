/*
 * Числа для меню: смена на сегодня, ближайшая домашка, рекорд выживания,
 * последний балл пробника, очередь работы над ошибками и свет. Нужны на каждой
 * странице, поэтому считаются одним заходом и один раз на страницу (cache).
 */

import { cache } from 'react';
import { one } from './db';
import { TZ, nowInTz } from './data';
import { mistakeCount } from './runs';

export interface NavStats {
  /** Лучшая серия в выживании. */
  best: number;
  /** Балл последнего пробника (онлайн или очного), если он был. */
  score: number | null;
  /** Сколько задач ждут в работе над ошибками. */
  mistakes: number;
  /** Сегодняшняя смена: none — не начата, open — идёт, done — закрыта. */
  shift: { state: 'none' | 'open' | 'done'; cur: number; total: number };
  /** Домашки, которые ждут ученика, и срок ближайшей. */
  homework: { waiting: number; day: string | null; overdue: boolean };
  /** Свет за всё время. */
  light: number;
}

export const navStats = cache(async (userId: string, studentId?: string | null): Promise<NavStats> => {
  const sid = studentId || null;
  const today = nowInTz().date;
  const [row, mistakes, shift, hw] = await Promise.all([
    one<{ best: number; score: number | null; light: number }>`select
      (select coalesce(max(best), 0)::int from bc_survival where user_id = ${userId}) as best,
      (select score from bc_tests
        where user_id = ${userId} or (${sid}::text is not null and student_id = ${sid})
        order by created_at desc limit 1) as score,
      (select coalesce(sum(amount), 0)::int from bc_light where user_id = ${userId}) as light`,
    mistakeCount(userId),
    one<{ cur: number; total: number; finished: boolean }>`select cur, jsonb_array_length(items)::int as total, (finished_at is not null) as finished
      from bc_sets where user_id = ${userId} and kind = 'shift'
        and ((finished_at is null and started_at > now() - interval '12 hours') or (finished_at is not null and day = ${today}::date))
      order by (finished_at is null) desc, seq desc limit 1`,
    sid
      ? one<{ waiting: number; day: string | null; overdue: boolean }>`select count(*)::int as waiting,
          to_char(min(h.due_at) at time zone ${TZ}, 'YYYY-MM-DD') as day, coalesce(min(h.due_at) < now(), false) as overdue
        from bc_homework h
          join bc_members m on m.group_id = h.group_id and m.student_id = ${sid}
          left join bc_sets t on t.kind = 'homework' and t.hw_id = h.id and t.user_id = ${userId}
        where t.finished_at is null and h.due_at > now() - interval '21 days'`
      : Promise.resolve(null),
  ]);
  return {
    best: row?.best ?? 0,
    score: row?.score ?? null,
    light: row?.light ?? 0,
    mistakes,
    shift: shift
      ? { state: shift.finished ? 'done' : 'open', cur: shift.cur, total: shift.total }
      : { state: 'none', cur: 0, total: 0 },
    homework: { waiting: hw?.waiting ?? 0, day: hw?.day ?? null, overdue: Boolean(hw?.overdue) },
  };
});
