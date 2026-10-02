/*
 * Числа для меню: рекорд выживания, последний балл пробника и очередь работы
 * над ошибками. Нужны на каждой странице, поэтому считаются одним заходом
 * и один раз на страницу (cache).
 */

import { cache } from 'react';
import { one } from './db';
import { mistakeCount } from './runs';

export interface NavStats {
  /** Лучшая серия в выживании. */
  best: number;
  /** Балл последнего пробника (онлайн или очного), если он был. */
  score: number | null;
  /** Сколько задач ждут в работе над ошибками. */
  mistakes: number;
}

export const navStats = cache(async (userId: string, studentId?: string | null): Promise<NavStats> => {
  const sid = studentId || null;
  const [row, mistakes] = await Promise.all([
    one<{ best: number; score: number | null }>`select
      (select coalesce(max(best), 0)::int from bc_survival where user_id = ${userId}) as best,
      (select score from bc_tests
        where user_id = ${userId} or (${sid}::text is not null and student_id = ${sid})
        order by created_at desc limit 1) as score`,
    mistakeCount(userId),
  ]);
  return { best: row?.best ?? 0, score: row?.score ?? null, mistakes };
});
