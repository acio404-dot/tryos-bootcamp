/*
 * Стрик — сколько дней подряд ученик заходит и решает задачи
 * (тренажёр, работа над ошибками, выживание, пробники). День считается
 * по часовому поясу школы. Стрик жив, пока есть решённые задачи сегодня
 * или вчера: вчерашний стрик ещё можно продлить сегодня.
 */

import { cache } from 'react';
import { db, one } from './db';
import { addDays, nowInTz, TZ } from './data';

export interface StreakInfo {
  /** Текущий стрик, дней. */
  current: number;
  /** Лучший стрик за последний год. */
  best: number;
  /** Сегодня уже решал — стрик на сегодня засчитан. */
  today: boolean;
  /** Последние 7 дней, от старого к сегодняшнему: решал ли в этот день. */
  week: { date: string; done: boolean }[];
  /** Сегодняшняя дата в часовом поясе школы. */
  date: string;
}

function runFrom(days: Set<string>, today: string): number {
  let cur = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cur)) {
    n += 1;
    cur = addDays(cur, -1);
  }
  return n;
}

function longest(sorted: string[]): number {
  let best = 0, run = 0, prev = '';
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** cache — стрик нужен и странице, и меню (огонёк у имени): считаем один раз. */
export const streakOf = cache(async (userId: string): Promise<StreakInfo> => {
  const rows = await db<{ d: string }>`select distinct to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as d
    from bc_attempts where user_id = ${userId} and created_at > now() - interval '370 days' order by d`;
  const date = nowInTz().date;
  const days = new Set(rows.map((r) => r.d));
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = addDays(date, k - 6);
    return { date: d, done: days.has(d) };
  });
  return {
    current: runFrom(days, date),
    best: longest(rows.map((r) => r.d)),
    today: days.has(date),
    week,
    date,
  };
});

/** Текущие стрики сразу для многих учеников — для таблиц и списков. */
export async function streaksOf(userIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db<{ user_id: string; d: string }>`select distinct user_id, to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as d
    from bc_attempts where user_id = any(${ids}::text[]) and created_at > now() - interval '370 days'`;
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
    byUser.get(r.user_id)!.add(r.d);
  }
  const today = nowInTz().date;
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = runFrom(byUser.get(id) || new Set(), today);
  return out;
}

/** Решал ли ученик сегодня хоть одну задачу (до записи новой попытки). */
export async function solvedToday(userId: string): Promise<boolean> {
  const r = await one<{ n: number }>`select count(*)::int as n from bc_attempts
    where user_id = ${userId}
      and to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') = ${nowInTz().date}
      and created_at > now() - interval '2 days'`;
  return (r?.n ?? 0) > 0;
}

/**
 * Если эта попытка — первая за сегодня, стрик только что продлился:
 * вернуть новый стрик, чтобы показать ученику достижение.
 */
export async function streakUpdate(userId: string, wasSolvedToday: boolean): Promise<{ current: number; date: string } | null> {
  if (wasSolvedToday) return null;
  const s = await streakOf(userId);
  return s.today ? { current: s.current, date: s.date } : null;
}
