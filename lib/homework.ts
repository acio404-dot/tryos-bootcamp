/*
 * Домашка: учитель выбирает темы, число задач и срок для группы; каждый ученик
 * получает свой набор задач из этих тем (lib/sets.ts) и решает его с подсказкой
 * и второй попыткой, как смену. Учитель видит таблицу сдачи.
 */

import { cache } from 'react';
import { db, one } from './db';
import { TZ } from './data';
import { catalogTopics } from './bank';

export const HW_COUNTS = [5, 10, 15, 20];
export const HW_MAX_TOPICS = 5;

export interface Homework {
  id: string;
  group_id: number;
  title: string;
  topics: string[];
  count: number;
  /** Срок по времени школы: дата 'YYYY-MM-DD' и время 'HH:MM'. */
  day: string;
  time: string;
  note: string | null;
  author: string | null;
  /** Срок прошёл. */
  overdue: boolean;
}

/** Домашка ученика вместе с его прогрессом. */
export interface StudentHomework extends Homework {
  course: string;
  group: string;
  started: boolean;
  done: number;
  ok1: number;
  ok2: number;
  finished: boolean;
  /** Сдано после срока. */
  late: boolean;
}

/**
 * Домашки групп ученика: несданные (включая просроченные за последние три недели)
 * и сданные за последние две недели. Сначала те, что ждут, по сроку.
 * Задание, выданное сразу нескольким группам (общий batch), ученик двух групп видит один раз.
 */
export const homeworkOfStudent = cache(async (studentId: string, userId: string): Promise<StudentHomework[]> => {
  const rows = await db<StudentHomework & { key: string }>`select h.id, h.group_id, h.title, h.topics, h.count, h.note, h.author,
      coalesce(h.batch, h.id) as key,
      to_char(h.due_at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(h.due_at at time zone ${TZ}, 'HH24:MI') as time,
      (h.due_at < now()) as overdue, g.course, g.name as "group",
      (t.id is not null) as started, coalesce(t.done, 0)::int as done, coalesce(t.ok1, 0)::int as ok1, coalesce(t.ok2, 0)::int as ok2,
      (t.finished_at is not null) as finished, coalesce(t.finished_at > h.due_at, false) as late
    from bc_homework h
      join bc_members m on m.group_id = h.group_id and m.student_id = ${studentId}
      join bc_groups g on g.id = h.group_id
      left join bc_sets t on t.kind = 'homework' and t.user_id = ${userId}
        and t.hw_id in (select id from bc_homework x where coalesce(x.batch, x.id) = coalesce(h.batch, h.id))
    where (t.finished_at is null and h.due_at > now() - interval '21 days')
       or (t.finished_at is not null and t.finished_at > now() - interval '14 days')
    order by (t.finished_at is not null), h.due_at, h.id`;
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))).map(({ key: _key, ...r }) => r);
});

/**
 * Домашка, если ученик состоит в её группе. Для задания, выданного нескольким группам,
 * возвращается одна и та же строка (с наименьшим id среди групп ученика): набор задач у ученика один.
 */
export async function homeworkForStudent(studentId: string, userId: string, id: string): Promise<StudentHomework | null> {
  return one<StudentHomework>`select h.id, h.group_id, h.title, h.topics, h.count, h.note, h.author,
      to_char(h.due_at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(h.due_at at time zone ${TZ}, 'HH24:MI') as time,
      (h.due_at < now()) as overdue, g.course, g.name as "group",
      (t.id is not null) as started, coalesce(t.done, 0)::int as done, coalesce(t.ok1, 0)::int as ok1, coalesce(t.ok2, 0)::int as ok2,
      (t.finished_at is not null) as finished, coalesce(t.finished_at > h.due_at, false) as late
    from bc_homework asked
      join bc_homework h on coalesce(h.batch, h.id) = coalesce(asked.batch, asked.id)
      join bc_members m on m.group_id = h.group_id and m.student_id = ${studentId}
      join bc_groups g on g.id = h.group_id
      left join bc_sets t on t.kind = 'homework' and t.hw_id = h.id and t.user_id = ${userId}
    where asked.id = ${id}
    order by (t.id is null), h.id
    limit 1`;
}

/** Группа домашки — чтобы учителя и админа, открывших ссылку из расписания, отправить в их кабинет. */
export async function homeworkOwner(id: string): Promise<{ group_id: number; teacher_id: string | null } | null> {
  return one<{ group_id: number; teacher_id: string | null }>`select h.group_id, g.teacher_id
    from bc_homework h join bc_groups g on g.id = h.group_id where h.id = ${id}`;
}

/* ------------------------------------------------------ кабинет учителя */

export interface HwRow {
  student_id: string;
  name: string;
  /** У ученика есть аккаунт (привязан ID) — без него решать негде. */
  bound: boolean;
  started: boolean;
  done: number;
  ok1: number;
  ok2: number;
  /** Когда сдал, 'YYYY-MM-DD HH:MM' по времени школы. */
  finished: string | null;
  late: boolean;
}
export interface TeacherHomework extends Homework { rows: HwRow[] }

/** Домашки групп (за последние 60 дней и все будущие) с таблицей сдачи. */
export async function homeworkOfGroups(groupIds: number[]): Promise<TeacherHomework[]> {
  if (!groupIds.length) return [];
  const list = await db<Homework>`select id, group_id, title, topics, count, note, author,
      to_char(due_at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(due_at at time zone ${TZ}, 'HH24:MI') as time,
      (due_at < now()) as overdue
    from bc_homework where group_id = any(${groupIds}::int[]) and due_at > now() - interval '60 days'
    order by due_at desc limit 60`;
  if (!list.length) return [];
  const ids = list.map((h) => h.id);
  const rows = await db<HwRow & { hw_id: string }>`select h.id as hw_id, s.id as student_id, s.name, (s.user_id is not null) as bound,
      (t.id is not null) as started, coalesce(t.done, 0)::int as done, coalesce(t.ok1, 0)::int as ok1, coalesce(t.ok2, 0)::int as ok2,
      to_char(t.finished_at at time zone ${TZ}, 'YYYY-MM-DD HH24:MI') as finished, coalesce(t.finished_at > h.due_at, false) as late
    from bc_homework h
      join bc_members m on m.group_id = h.group_id
      join bc_students s on s.id = m.student_id
      left join bc_sets t on t.kind = 'homework' and t.user_id = s.user_id
        and t.hw_id in (select id from bc_homework x where coalesce(x.batch, x.id) = coalesce(h.batch, h.id))
    where h.id = any(${ids}::text[])
    order by s.name`;
  return list.map((h) => ({ ...h, rows: rows.filter((r) => r.hw_id === h.id).map(({ hw_id: _hw, ...r }) => r) }));
}

/** Темы для выбора в форме домашки: ключ, название и раздел. */
export function homeworkTopics(): { key: string; label: string; section: string; count: number }[] {
  return catalogTopics().map((t) => ({ key: t.key, label: t.label, section: t.section, count: t.count }));
}
