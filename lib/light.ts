/*
 * Свет — валюта кабинета. Начисляется за верные ответы в смене, домашке
 * и выживании; копится и показывается в меню и на главной.
 */

import { cache } from 'react';
import { db, one } from './db';
import { TZ, addDays, nowInTz } from './data';

/** Сколько света за что. tempo — темп экзамена: 75 секунд на задачу. */
export const LIGHT = { correct: 10, clean: 5, fast: 3, second: 5, tempo: 75 } as const;

/** Свет за задачу: с первой попытки 10 + 5 (без подсказки) + 3 (быстрее темпа экзамена); со второй — половина. */
export function lightFor(tryNo: number, seconds: number | null): { total: number; parts: { label: string; amount: number }[] } {
  if (tryNo > 1) return { total: LIGHT.second, parts: [{ label: 'со второй попытки', amount: LIGHT.second }] };
  const parts: { label: string; amount: number }[] = [
    { label: 'верно', amount: LIGHT.correct },
    { label: 'без подсказки', amount: LIGHT.clean },
  ];
  if (seconds !== null && seconds <= LIGHT.tempo) parts.push({ label: 'быстрее 75 секунд', amount: LIGHT.fast });
  return { total: parts.reduce((n, p) => n + p.amount, 0), parts };
}

export async function addLight(userId: string, amount: number, reason: string, ref: string | null = null): Promise<void> {
  if (amount <= 0) return;
  await db`insert into bc_light (user_id, amount, reason, ref) values (${userId}, ${amount}, ${reason}, ${ref})`;
}

export interface LightInfo { total: number; today: number; week: number }

/** cache — свет нужен и странице, и меню: один запрос на страницу. */
export const lightOf = cache(async (userId: string): Promise<LightInfo> => {
  const now = nowInTz();
  const monday = addDays(now.date, -(now.dow - 1));
  const r = await one<LightInfo>`select
      coalesce(sum(amount), 0)::int as total,
      coalesce(sum(amount) filter (where created_at >= (${now.date}::date)::timestamp at time zone ${TZ}), 0)::int as today,
      coalesce(sum(amount) filter (where created_at >= (${monday}::date)::timestamp at time zone ${TZ}), 0)::int as week
    from bc_light where user_id = ${userId}`;
  return r || { total: 0, today: 0, week: 0 };
});
