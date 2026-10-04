/*
 * Хранение того, что ученик решает: попытки, пробники, серии выживания.
 * Всё пишется от имени вошедшего пользователя — id берётся не из запроса.
 */

import { cache } from 'react';
import { createHmac, randomBytes } from 'node:crypto';
import { db, one } from './db';
import { checkAnswer, isActiveId, type Section } from './bank';
import { addDays, nowInTz, TZ } from './data';

export const newId = () => randomBytes(9).toString('base64url');

/**
 * Подставной id задачи внутри серии или набора (см. toPublic в lib/bank.ts).
 * Один и тот же для пары «набор + задача», по нему нельзя восстановить настоящий id.
 */
export function aliasId(scope: string, questionId: string): string {
  const key = process.env.AUTH_SECRET || 'tryos-bootcamp';
  return `q${createHmac('sha256', key).update(`${scope}:${questionId}`).digest('hex').slice(0, 20)}`;
}

/* ------------------------------------------------------------- попытки */

export type Mode = 'practice' | 'exam' | 'survival' | 'mistakes' | 'shift' | 'homework';

/** Одна решённая задача. Отсюда растут «Прогресс» и «Работа над ошибками». */
export async function recordAttempt(
  userId: string,
  q: { id: string; topic: string; topicLabel: string; section: Section },
  correct: boolean,
  mode: Mode,
  /** Сколько секунд ушло на задачу — там, где идёт таймер. */
  seconds: number | null = null,
  /** Сколько попыток ушло на задачу: 2 — была подсказка и вторая попытка (смена, домашка). */
  tries = 1,
  /** Задача решена со второй попытки. correct при этом false: в статистике считается первый ответ. */
  fixed = false,
): Promise<void> {
  await db`insert into bc_attempts (user_id, question_id, topic, topic_label, section, correct, mode, seconds, try, fixed)
    values (${userId}, ${q.id}, ${q.topic}, ${q.topicLabel}, ${q.section}, ${correct}, ${mode}, ${seconds}, ${tries}, ${fixed})`;
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
    asked = asked + 1, cur_issued = now(), cur_at = now() where id = ${id}`;
}

/**
 * Забрать текущую задачу серии под ответ. Только один запрос получит строку:
 * повторный или параллельный ответ на ту же задачу вернёт null. Так ответ
 * нельзя засчитать дважды, а ответ «в догонку» не попадёт на следующую задачу.
 */
export async function claimSurvivalAnswer(userId: string, id: string, questionId: string): Promise<Survival | null> {
  return one<Survival>`update bc_survival set cur_id = null
    where id = ${id} and user_id = ${userId} and alive and cur_id = ${questionId}
    returning id, user_id, streak, best, lives, asked, ${questionId}::text as cur_id, seen, alive,
      extract(epoch from now() - coalesce(cur_at, cur_issued))::float as elapsed`;
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

/** lost — кто погасил лампочку: запись добавляется при неверном или просроченном ответе. */
export async function applySurvivalAnswer(
  run: Survival, ok: boolean, lost?: { id: string; topic: string; timedOut: boolean },
): Promise<Survival> {
  const streak = ok ? run.streak + 1 : 0;
  const best = Math.max(run.best, streak);
  const lives = ok ? run.lives : run.lives - 1;
  const alive = lives > 0;
  const add = !ok && lost ? JSON.stringify([{ n: run.asked, ...lost }]) : '[]';
  await db`update bc_survival set streak = ${streak}, best = ${best}, lives = ${lives}, alive = ${alive},
    cur_id = null, lost = lost || ${add}::jsonb,
    ended_at = case when ${alive} then ended_at else coalesce(ended_at, now()) end
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

export interface WeekRow { userId: string; name: string; best: number; me: boolean }
export interface WeekBoard {
  /** group — одногруппники; school — все ученики (если группы нет или в ней пока один человек). */
  scope: 'group' | 'school';
  title: string;
  /** Лучшие по убыванию серии; своя строка есть всегда. */
  rows: WeekRow[];
  /** Сколько человек в таблице всего и какое место у ученика (среди всех, а не только показанных). */
  total: number;
  place: number;
  /** Ближайший соперник выше в таблице. */
  above: { name: string; best: number } | null;
  /** Понедельник текущей недели по времени школы, 'YYYY-MM-DD'. */
  since: string;
}

/** В таблице школы фамилии не показываем: «Regina A.». */
const publicName = (name: string, username?: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return username ? `@${username}` : 'Ученик';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
};

function boardOf(scope: 'group' | 'school', title: string, since: string, all: WeekRow[], limit: number): WeekBoard {
  const sorted = [...all].sort((a, b) => b.best - a.best || Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
  const i = sorted.findIndex((r) => r.me);
  const mine = sorted[i];
  // соперник выше — ближайший с серией больше моей
  const above = [...sorted.slice(0, Math.max(0, i))].reverse().find((r) => r.best > (mine?.best ?? 0)) || null;
  const rows = sorted.slice(0, limit);
  if (mine && !rows.some((r) => r.me)) rows.push(mine);
  return { scope, title, since, rows, total: sorted.length, place: i + 1, above: above ? { name: above.name, best: above.best } : null };
}

/**
 * Таблица недели: лучшая серия каждого с понедельника (по времени школы).
 * Ученику показываем его группу — соревноваться интереснее со своими;
 * если группы нет, показываем школу (без сотрудников). В понедельник таблица начинается заново.
 */
export async function survivalWeek(userId: string, studentId?: string | null, limit = 8): Promise<WeekBoard> {
  const now = nowInTz();
  const since = addDays(now.date, -(now.dow - 1));
  if (studentId) {
    const rows = await db<{ user_id: string; name: string; best: number; course: string; gname: string; groups: number }>`
      with mates as (
        select distinct s2.user_id, s2.name
        from bc_members m1
          join bc_groups g on g.id = m1.group_id and g.kind = 'group'
          join bc_members m2 on m2.group_id = m1.group_id
          join bc_students s2 on s2.id = m2.student_id
        where m1.student_id = ${studentId} and s2.user_id is not null
      ), grp as (
        select min(g.course) as course, min(g.name) as gname, count(*)::int as groups
        from bc_members m join bc_groups g on g.id = m.group_id and g.kind = 'group'
        where m.student_id = ${studentId}
      )
      select mates.user_id, mates.name, grp.course, grp.gname, grp.groups,
        coalesce((select max(s.best) from bc_survival s
          where s.user_id = mates.user_id and s.started_at >= (${since}::date)::timestamp at time zone ${TZ}), 0)::int as best
      from mates, grp`;
    if (rows.length >= 2 && rows.some((r) => r.user_id === userId)) {
      const g = rows[0];
      const title = g.groups === 1 ? `${g.course}${g.gname ? ` · ${g.gname}` : ''}` : 'Твои группы';
      return boardOf('group', title, since,
        rows.map((r) => ({ userId: r.user_id, name: r.name || 'Ученик', best: r.best, me: r.user_id === userId })), limit);
    }
  }
  // школа: все, кто играл на этой неделе, кроме сотрудников (учителей и админов)
  const rows = await db<{ user_id: string; name: string; username: string | null; best: number }>`
    select s.user_id, u.name, u.username, max(s.best)::int as best
    from bc_survival s join bc_users u on u.id = s.user_id
    where s.started_at >= (${since}::date)::timestamp at time zone ${TZ} and s.best > 0
      and (s.user_id = ${userId} or (u.role <> 'admin' and not exists (select 1 from bc_teachers t where t.user_id = u.id)))
    group by s.user_id, u.name, u.username
    order by best desc
    limit 500`;
  const all = rows.map((r) => ({ userId: r.user_id, name: publicName(r.name, r.username), best: r.best, me: r.user_id === userId }));
  if (!all.some((r) => r.me)) all.push({ userId, name: 'Ты', best: 0, me: true });
  return boardOf('school', 'Школа', since, all, limit);
}

/** Рекорд школы за всё время. */
export async function schoolBestSurvival(): Promise<number> {
  const r = await one<{ b: number }>`select coalesce(max(best), 0)::int as b from bc_survival`;
  return r?.b ?? 0;
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
