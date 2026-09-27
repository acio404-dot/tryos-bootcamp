'use server';

/*
 * Действия учителя в его кабинете. Каждое проверяет, что вошёл учитель и
 * что группа (или ученик) — его: чужие группы учитель не видит и не меняет.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { currentUser } from './auth';
import { HHMM, TZONE, clean, dateOrNull, eventFields, scoreFields, url } from './fields';
import { deleteMock, mockFields, saveMock, type MockInput } from './mock';

export interface TeacherResult { ok?: boolean; error?: string }

interface Me { id: string; name: string }

async function me(): Promise<Me | null> {
  const u = await currentUser();
  if (!u) return null;
  return one<Me>`select id, name from bc_teachers where user_id = ${u.id}`;
}

/** Учитель и его группа. Ошибка, если это не его группа. */
async function myGroup(groupId: unknown): Promise<{ t: Me; gid: number } | string> {
  const t = await me();
  if (!t) return 'Нет доступа: войди как учитель';
  const gid = Number(groupId);
  if (!Number.isInteger(gid)) return 'Группа не найдена';
  const g = await one`select 1 from bc_groups where id = ${gid} and teacher_id = ${t.id}`;
  return g ? { t, gid } : 'Это не твоя группа';
}

const done = (): TeacherResult => {
  revalidatePath('/', 'layout');
  return { ok: true };
};

/** Постоянные ссылки группы: урок, чат, материалы. */
export async function saveGroupLinks(groupId: number, input: { link?: string; chat?: string; materials?: string }): Promise<TeacherResult> {
  const r = await myGroup(groupId);
  if (typeof r === 'string') return { error: r };
  await db`update bc_groups set link = ${url(input.link)}, chat = ${url(input.chat)}, materials = ${url(input.materials)} where id = ${r.gid}`;
  return done();
}

/**
 * Ссылка и тема для одного занятия по расписанию (например, новая ссылка
 * Zoom на эту дату). Пустые поля — вернуть постоянную ссылку группы.
 */
export async function setLessonInfo(groupId: number, date: string, start: string, input: { link?: string; topic?: string }): Promise<TeacherResult> {
  const r = await myGroup(groupId);
  if (typeof r === 'string') return { error: r };
  const d = dateOrNull(date);
  if (!d || !HHMM.test(start || '')) return { error: 'Неверная дата или время занятия' };
  const link = url(input.link);
  const topic = clean(input.topic, 140);
  if (!link && !topic) {
    await db`delete from bc_lesson_info where group_id = ${r.gid} and date = ${d}::date and start = ${start}`;
  } else {
    await db`insert into bc_lesson_info (group_id, date, start, link, topic) values (${r.gid}, ${d}::date, ${start}, ${link}, ${topic})
      on conflict (group_id, date, start) do update set link = excluded.link, topic = excluded.topic, updated_at = now()`;
  }
  return done();
}

export interface TeacherEventInput {
  groups: number[];
  kind: string;
  title: string;
  date: string;
  time?: string;
  link?: string;
  note?: string;
}

/** Доп. занятие, тест или срок сдачи — сразу для одной или нескольких своих групп. */
export async function addTeacherEvent(input: TeacherEventInput): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const f = eventFields(input);
  if (typeof f === 'string') return { error: f };
  const ids = [...new Set((input.groups || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { error: 'Выбери группу' };
  const mine = await db<{ id: number }>`select id from bc_groups where teacher_id = ${t.id} and id = any(${ids}::int[])`;
  if (mine.length !== ids.length) return { error: 'Можно ставить занятия только своим группам' };
  const batch = randomUUID();
  const tz = TZONE();
  for (const { id } of mine) {
    await db`insert into bc_events (group_id, student_id, kind, title, at, scope, batch, link, note)
      values (${id}, null, ${f.kind}, ${f.title}, (${f.at}::timestamp at time zone ${tz}), 'target', ${batch}, ${f.link}, ${f.note})`;
  }
  return done();
}

/** Поменять ссылку у уже назначенного доп. занятия. */
export async function setEventLink(id: number, link: string): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const ev = await one`select 1 from bc_events e join bc_groups g on g.id = e.group_id where e.id = ${id} and g.teacher_id = ${t.id}`;
  if (!ev) return { error: 'Это занятие не из твоих групп' };
  await db`update bc_events set link = ${url(link)} where id = ${id}`;
  return done();
}

export async function deleteTeacherEvent(id: number): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const ev = await one`select 1 from bc_events e join bc_groups g on g.id = e.group_id where e.id = ${id} and g.teacher_id = ${t.id}`;
  if (!ev) return { error: 'Это занятие не из твоих групп' };
  await db`delete from bc_events where id = ${id}`;
  return done();
}

/** Оценка ученику из своей группы. Имя учителя подставляется само. */
export async function addTeacherScore(studentId: string, input: { title: string; value: string; max: string; date?: string }): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const ok = await one`select 1 from bc_members m join bc_groups g on g.id = m.group_id where m.student_id = ${studentId} and g.teacher_id = ${t.id}`;
  if (!ok) return { error: 'Это не твой ученик' };
  const f = scoreFields(input);
  if (typeof f === 'string') return { error: f };
  await db`insert into bc_scores (student_id, title, value, max, teacher, teacher_id, date)
    values (${studentId}, ${f.title}, ${f.value}, ${f.max}, ${t.name}, ${t.id}, coalesce(${f.date}::date, current_date))`;
  return done();
}

export async function deleteTeacherScore(id: number): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const row = await one`select 1 from bc_scores where id = ${id} and teacher_id = ${t.id}`;
  if (!row) return { error: 'Удалить можно только свои оценки' };
  await db`delete from bc_scores where id = ${id}`;
  return done();
}

/** Результаты очного пробника для учеников своих групп. */
export async function saveTeacherMock(input: MockInput): Promise<TeacherResult & { count?: number }> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const f = mockFields(input);
  if (typeof f === 'string') return { error: f };
  const ids = f.rows.map((r) => r.studentId);
  const mine = await db<{ student_id: string }>`select distinct m.student_id from bc_members m join bc_groups g on g.id = m.group_id
    where g.teacher_id = ${t.id} and m.student_id = any(${ids}::text[])`;
  if (mine.length !== new Set(ids).size) return { error: 'Можно вносить баллы только своим ученикам' };
  // править можно только своё тестирование
  if (f.batch && (await one`select 1 from bc_tests where batch = ${f.batch} and (entered_by is distinct from ${t.id})`)) {
    return { error: 'Это тестирование вносил другой человек' };
  }
  const count = await saveMock(f, t.id, t.name);
  revalidatePath('/', 'layout');
  return { ok: true, count };
}

export async function deleteTeacherMock(batch: string): Promise<TeacherResult> {
  const t = await me();
  if (!t) return { error: 'Нет доступа: войди как учитель' };
  const n = await deleteMock(String(batch || '').slice(0, 64), t.id);
  if (!n) return { error: 'Удалить можно только свои тестирования' };
  return done();
}
