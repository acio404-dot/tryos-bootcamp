'use server';

/*
 * Действия админки. Серверные действия доступны по сети, поэтому каждое
 * первым делом проверяет, что вошёл администратор.
 */

import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { currentUser, isAdmin } from './auth';
import { makeStudentCode, type Access, type Section, type Slot } from './data';

export interface AdminResult { ok?: boolean; error?: string; id?: string }

async function guard(): Promise<string | null> {
  const u = await currentUser();
  return u && isAdmin(u) ? null : 'Нет доступа';
}

const clean = (s: unknown, n = 200) => String(s ?? '').trim().slice(0, n) || null;
const dateOrNull = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);
const intOrNull = (s: unknown) => {
  const n = parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

function accessOf(input: any): Access {
  if (input?.level !== 'partial') return { level: 'full' };
  const sections: Partial<Record<Section, boolean>> = {};
  for (const k of ['courses', 'schedule', 'scores', 'materials'] as Section[]) sections[k] = Boolean(input?.sections?.[k]);
  return { level: 'partial', sections };
}

/* ------------------------------------------------------------- ученики */

export interface StudentInput {
  name: string;
  phone?: string;
  note?: string;
  examName?: string;
  examDate?: string;
  examCity?: string;
  target?: string;
  access?: Access;
  groups?: number[];
}

async function setGroups(studentId: string, groups: number[] | undefined) {
  if (!groups) return;
  await db`delete from bc_members where student_id = ${studentId}`;
  for (const g of groups) {
    const id = intOrNull(g);
    if (id) await db`insert into bc_members (student_id, group_id) values (${studentId}, ${id}) on conflict do nothing`;
  }
}

export async function createStudent(input: StudentInput): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const name = clean(input.name, 80);
  if (!name) return { error: 'Укажи имя ученика' };
  let id = makeStudentCode();
  for (let i = 0; i < 5 && (await one`select 1 from bc_students where id = ${id}`); i++) id = makeStudentCode();
  await db`insert into bc_students (id, name, phone, note, access, exam_name, exam_date, exam_city, target_score)
    values (${id}, ${name}, ${clean(input.phone, 40)}, ${clean(input.note, 500)}, ${JSON.stringify(accessOf(input.access))}::jsonb,
      ${clean(input.examName, 80)}, ${dateOrNull(input.examDate)}, ${clean(input.examCity, 60)}, ${intOrNull(input.target)})`;
  await setGroups(id, input.groups);
  revalidatePath('/admin');
  return { ok: true, id };
}

export async function updateStudent(id: string, input: StudentInput): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const name = clean(input.name, 80);
  if (!name) return { error: 'Укажи имя ученика' };
  await db`update bc_students set name = ${name}, phone = ${clean(input.phone, 40)}, note = ${clean(input.note, 500)},
    access = ${JSON.stringify(accessOf(input.access))}::jsonb, exam_name = ${clean(input.examName, 80)},
    exam_date = ${dateOrNull(input.examDate)}, exam_city = ${clean(input.examCity, 60)}, target_score = ${intOrNull(input.target)}
    where id = ${id}`;
  await setGroups(id, input.groups);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Отвязать аккаунт от ID (например, ученик потерял доступ к аккаунту). */
export async function unbindStudent(id: string): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`update bc_students set user_id = null where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteStudent(id: string): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`delete from bc_members where student_id = ${id}`;
  await db`delete from bc_scores where student_id = ${id}`;
  await db`delete from bc_events where student_id = ${id}`;
  await db`delete from bc_students where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* --------------------------------------------------------------- баллы */

export async function addScore(studentId: string, input: { title: string; value: string; max: string; teacher?: string; date?: string }): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const title = clean(input.title, 120);
  const value = Number(String(input.value).replace(',', '.'));
  const max = Number(String(input.max).replace(',', '.'));
  if (!title) return { error: 'Укажи, за что балл' };
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return { error: 'Балл и максимум — числа, максимум больше нуля' };
  await db`insert into bc_scores (student_id, title, value, max, teacher, date)
    values (${studentId}, ${title}, ${value}, ${max}, ${clean(input.teacher, 80)}, coalesce(${dateOrNull(input.date)}::date, current_date))`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteScore(id: number): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`delete from bc_scores where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* -------------------------------------------------------------- группы */

export interface GroupInput {
  course: string;
  name?: string;
  teacher?: string;
  schedule?: Slot[];
  starts?: string;
  ends?: string;
  total?: string;
  link?: string;
  chat?: string;
  materials?: string;
  color?: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function slotsOf(list: Slot[] | undefined): Slot[] | string {
  const out: Slot[] = [];
  for (const s of list || []) {
    const dow = intOrNull(s.dow);
    if (!dow || dow < 1 || dow > 7) continue;
    if (!HHMM.test(s.start) || !HHMM.test(s.end)) return 'Время занятий — в формате 19:00';
    if (s.end <= s.start) return 'Конец занятия должен быть позже начала';
    out.push({ dow, start: s.start, end: s.end });
  }
  return out;
}

const url = (s: unknown) => {
  const v = clean(s, 400);
  return v && /^https?:\/\//i.test(v) ? v : v ? `https://${v}` : null;
};

export async function saveGroup(id: number | null, input: GroupInput): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const course = clean(input.course, 80);
  if (!course) return { error: 'Укажи название курса' };
  const slots = slotsOf(input.schedule);
  if (typeof slots === 'string') return { error: slots };
  const vals = {
    name: clean(input.name, 60) || '',
    teacher: clean(input.teacher, 120),
    schedule: JSON.stringify(slots),
    starts: dateOrNull(input.starts),
    ends: dateOrNull(input.ends),
    total: intOrNull(input.total),
    link: url(input.link),
    chat: url(input.chat),
    materials: url(input.materials),
    color: clean(input.color, 20),
  };
  if (id) {
    await db`update bc_groups set course = ${course}, name = ${vals.name}, teacher = ${vals.teacher}, schedule = ${vals.schedule}::jsonb,
      starts = ${vals.starts}, ends = ${vals.ends}, total_lessons = ${vals.total}, link = ${vals.link}, chat = ${vals.chat},
      materials = ${vals.materials}, color = ${vals.color} where id = ${id}`;
  } else {
    await db`insert into bc_groups (course, name, teacher, schedule, starts, ends, total_lessons, link, chat, materials, color)
      values (${course}, ${vals.name}, ${vals.teacher}, ${vals.schedule}::jsonb, ${vals.starts}, ${vals.ends}, ${vals.total},
        ${vals.link}, ${vals.chat}, ${vals.materials}, ${vals.color})`;
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteGroup(id: number): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`delete from bc_members where group_id = ${id}`;
  await db`delete from bc_events where group_id = ${id}`;
  await db`delete from bc_groups where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* ------------------------------------------- события: сроки, доп. занятия */

export async function addEvent(input: { groupId?: number | null; studentId?: string | null; kind: string; title: string; date: string; time?: string }): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const title = clean(input.title, 140);
  const date = dateOrNull(input.date);
  const time = HHMM.test(input.time || '') ? input.time : '23:59';
  if (!title || !date) return { error: 'Укажи название и дату' };
  if (!input.groupId && !input.studentId) return { error: 'Выбери группу или ученика' };
  const kind = ['deadline', 'lesson', 'exam'].includes(input.kind) ? input.kind : 'deadline';
  const tz = process.env.BOOTCAMP_TZ || 'Asia/Tashkent';
  await db`insert into bc_events (group_id, student_id, kind, title, at)
    values (${input.groupId || null}, ${input.studentId || null}, ${kind}, ${title}, (${`${date} ${time}`}::timestamp at time zone ${tz}))`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteEvent(id: number): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`delete from bc_events where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}
