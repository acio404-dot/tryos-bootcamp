/*
 * Хранение того, что ученик решает: попытки, пробники, серии выживания.
 * Всё пишется от имени вошедшего пользователя — id берётся не из запроса.
 */

import { cache } from 'react';
import { randomBytes } from 'node:crypto';
import { db, one } from './db';
import { checkAnswer, isActiveId, type Section } from './bank';

export const newId = () => randomBytes(9).toString('base64url');

/* ------------------------------------------------------------- попытки */

export type Mode = 'practice' | 'exam' | 'survival' | 'mistakes';

/** Одна решённая задача. Отсюда растут «Прогресс» и «Работа над ошибками». */
export async function recordAttempt(
  userId: string,
  q: { id: string; topic: string; topicLabel: string; section: Section },
  correct: boolean,
  mode: Mode,
): Promise<void> {
  await db`insert into bc_attempts (user_id, question_id, topic, topic_label, section, correct, mode)
    values (${userId}, ${q.id}, ${q.topic}, ${q.topicLabel}, ${q.section}, ${correct}, ${mode})`;
}

export async function recordAttempts(
  userId: string,
  rows: { id: string; topic: string; topicLabel: string; section: Section; correct: boolean }[],
  mode: Mode,
): Promise<void> {
  for (const r of rows) {
    await recordAttempt(userId, r, r.correct, mode);
  }
}

/* -------------------------------------------------- работа над ошибками */

export interface MistakeRow {
  question_id: string;
  topic: string;
  topic_label: string;
  section: Section;
  wrong: number;
  last_at: string;
}

/**
 * Задачи, где последняя попытка оказалась неверной. Решил её потом правильно —
 * задача уходит из списка сама. Задачи, снятые с выдачи (их нет на экзамене
 * или они слишком лёгкие), сюда не попадают.
 */
export async function mistakesOf(userId: string, limit = 40): Promise<MistakeRow[]> {
  const rows = await db<MistakeRow>`
    with last as (
      select distinct on (question_id) question_id, topic, topic_label, section, correct, created_at
      from bc_attempts
      where user_id = ${userId} and question_id is not null
      order by question_id, created_at desc
    )
    select l.question_id, l.topic, l.topic_label, l.section,
      (select count(*)::int from bc_attempts a
        where a.user_id = ${userId} and a.question_id = l.question_id and a.correct = false) as wrong,
      to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_at
    from last l
    where l.correct = false
    order by l.created_at desc
    limit ${limit * 3 + 60}`;
  return rows.filter((r) => isActiveId(r.question_id)).slice(0, limit);
}

/** cache — число нужно и странице, и меню: один запрос на страницу. */
export const mistakeCount = cache(async (userId: string): Promise<number> => {
  const rows = await db<{ question_id: string }>`
    with last as (
      select distinct on (question_id) question_id, correct
      from bc_attempts
      where user_id = ${userId} and question_id is not null
      order by question_id, created_at desc
    )
    select question_id from last where correct = false`;
  return rows.filter((r) => isActiveId(r.question_id)).length;
});

/* -------------------------------------------------------------- пробник */

export interface ExamRun {
  id: string;
  user_id: string;
  format: string;
  title: string;
  minutes: number;
  ids: string[];
  answers: (number | null)[];
  score: number | null;
  correct: number;
  wrong: number;
  blank: number;
  started_at: string;
  finished_at: string | null;
}

export async function createExamRun(
  userId: string, format: string, title: string, minutes: number, ids: string[],
): Promise<string> {
  const id = newId();
  await db`insert into bc_exam_runs (id, user_id, format, title, minutes, ids, answers)
    values (${id}, ${userId}, ${format}, ${title}, ${minutes},
      ${JSON.stringify(ids)}::jsonb, ${JSON.stringify(ids.map(() => null))}::jsonb)`;
  return id;
}

export async function examRun(userId: string, id: string): Promise<ExamRun | null> {
  return one<ExamRun>`select id, user_id, format, title, minutes, ids, answers, score, correct, wrong, blank,
    to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as started_at,
    to_char(finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as finished_at
    from bc_exam_runs where id = ${id} and user_id = ${userId}`;
}

export async function saveExamAnswers(userId: string, id: string, answers: (number | null)[]): Promise<void> {
  await db`update bc_exam_runs set answers = ${JSON.stringify(answers)}::jsonb
    where id = ${id} and user_id = ${userId} and finished_at is null`;
}

export async function finishExamRun(
  userId: string, id: string, answers: (number | null)[],
  totals: { score: number; correct: number; wrong: number; blank: number },
): Promise<void> {
  await db`update bc_exam_runs
    set answers = ${JSON.stringify(answers)}::jsonb, score = ${totals.score},
        correct = ${totals.correct}, wrong = ${totals.wrong}, blank = ${totals.blank},
        finished_at = now()
    where id = ${id} and user_id = ${userId} and finished_at is null`;
}

/** Незаконченный пробник — чтобы предложить «Продолжить». */
export async function openExamRun(userId: string): Promise<ExamRun | null> {
  return one<ExamRun>`select id, user_id, format, title, minutes, ids, answers, score, correct, wrong, blank,
    to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as started_at,
    null as finished_at
    from bc_exam_runs
    where user_id = ${userId} and finished_at is null
      and started_at > now() - interval '1 day'
    order by started_at desc limit 1`;
}

export interface ExamRow {
  id: string; format: string; title: string; score: number;
  correct: number; wrong: number; blank: number; total: number; at: string;
}

export async function examHistory(userId: string, limit = 20): Promise<ExamRow[]> {
  return db<ExamRow>`select id, format, title, coalesce(score, 0) as score, correct, wrong, blank,
    jsonb_array_length(ids) as total,
    to_char(finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from bc_exam_runs where user_id = ${userId} and finished_at is not null
    order by finished_at desc limit ${limit}`;
}

/* ----------------------------------------------------------- выживание */

export interface Survival {
  id: string;
  /** Сколько секунд прошло с момента, когда ученик увидел текущую задачу. */
  elapsed?: number | null;
  user_id: string;
  streak: number;
  best: number;
  lives: number;
  asked: number;
  cur_id: string | null;
  seen: string[];
  alive: boolean;
}

export const SURVIVAL_LIVES = 3;
/** Время на одну задачу в выживании. */
export const SURVIVAL_SECONDS = 90;
/** Запас на сеть: ответ, пришедший чуть позже 90 секунд, ещё засчитывается. */
export const SURVIVAL_GRACE = 4;

export async function createSurvival(userId: string): Promise<Survival> {
  const id = newId();
  await db`insert into bc_survival (id, user_id, lives) values (${id}, ${userId}, ${SURVIVAL_LIVES})`;
  return { id, user_id: userId, streak: 0, best: 0, lives: SURVIVAL_LIVES, asked: 0, cur_id: null, seen: [], alive: true };
}

export async function survivalRun(userId: string, id: string): Promise<Survival | null> {
  return one<Survival>`select id, user_id, streak, best, lives, asked, cur_id, seen, alive,
      extract(epoch from now() - coalesce(cur_at, cur_issued))::float as elapsed
    from bc_survival where id = ${id} and user_id = ${userId}`;
}

export async function setSurvivalCurrent(id: string, questionId: string, seen: string[]): Promise<void> {
  await db`update bc_survival set cur_id = ${questionId}, seen = ${JSON.stringify(seen)}::jsonb,
    asked = asked + 1, cur_issued = now(), cur_at = null where id = ${id}`;
}

/**
 * Ученик увидел задачу — с этого момента идут 90 секунд. Срабатывает один раз
 * на задачу, поэтому повторным вызовом таймер не продлить; без вызова отсчёт
 * идёт с момента выдачи задачи (так времени только меньше).
 */
export async function markSurvivalShown(userId: string, id: string): Promise<void> {
  await db`update bc_survival set cur_at = now()
    where id = ${id} and user_id = ${userId} and cur_id is not null and cur_at is null and alive`;
}

export async function applySurvivalAnswer(run: Survival, ok: boolean): Promise<Survival> {
  const streak = ok ? run.streak + 1 : 0;
  const best = Math.max(run.best, streak);
  const lives = ok ? run.lives : run.lives - 1;
  const alive = lives > 0;
  await db`update bc_survival set streak = ${streak}, best = ${best}, lives = ${lives}, alive = ${alive},
    cur_id = null, ended_at = case when ${alive} then ended_at else coalesce(ended_at, now()) end
    where id = ${run.id}`;
  return { ...run, streak, best, lives, alive, cur_id: null };
}

export async function endSurvival(userId: string, id: string): Promise<void> {
  await db`update bc_survival set alive = false, ended_at = coalesce(ended_at, now())
    where id = ${id} and user_id = ${userId}`;
}

export interface BoardRow { userId: string; name: string; best: number; asked: number; at: string; me: boolean }

/** Таблица лидеров: лучшая серия каждого ученика. */
export async function survivalBoard(userId: string, limit = 20): Promise<BoardRow[]> {
  const rows = await db<{ user_id: string; name: string; username: string | null; best: number; asked: number; at: string }>`
    select s.user_id, u.name, u.username, max(s.best) as best, max(s.asked) as asked,
      to_char(max(s.ended_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from bc_survival s join bc_users u on u.id = s.user_id
    where s.best > 0
    group by s.user_id, u.name, u.username
    order by best desc, at asc
    limit ${limit}`;
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name || (r.username ? `@${r.username}` : 'Ученик'),
    best: r.best,
    asked: r.asked,
    at: r.at,
    me: r.user_id === userId,
  }));
}

export async function myBestSurvival(userId: string): Promise<number> {
  const r = await one<{ b: number }>`select coalesce(max(best), 0)::int as b from bc_survival where user_id = ${userId}`;
  return r?.b ?? 0;
}

/* --------------------------------------------- проверка ответа + запись */

/** Проверить ответ и сразу записать попытку. */
export async function answerAndRecord(userId: string, id: string, chosen: number, mode: Mode) {
  const v = checkAnswer(id, chosen);
  if (!v) return null;
  await recordAttempt(userId, { id, topic: v.topic, topicLabel: v.topicLabel, section: v.section }, v.isCorrect, mode);
  return v;
}
