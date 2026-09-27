'use server';

/*
 * Действия админки. Серверные действия доступны по сети, поэтому каждое
 * первым делом проверяет, что вошёл администратор.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { currentUser, isAdmin } from './auth';
import { SECTIONS, makeStudentCode, type Access, type Section, type Slot } from './data';

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
  // все разделы из SECTIONS: раньше здесь был ручной список без «пробников», и их нельзя было открыть частично
  for (const { key } of SECTIONS) sections[key as Section] = Boolean(input?.sections?.[key]);
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

/**
 * Переписывает список групп ученика. Индивидуальные занятия (kind = 'solo')
 * не трогаем: у них ученик задаётся в карточке самого занятия.
 */
async function setGroups(studentId: string, groups: number[] | undefined) {
  if (!groups) return;
  await db`delete from bc_members m using bc_groups g
    where m.group_id = g.id and m.student_id = ${studentId} and g.kind <> 'solo'`;
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

export interface ExamInput {
  /** Пусто — название экзамена у учеников не меняется. */
  examName?: string;
  /** Пусто — дата экзамена убирается. */
  examDate?: string;
  /** Пусто — город у учеников не меняется. */
  examCity?: string;
  audience: 'all' | 'groups' | 'students';
  groups?: number[];
  students?: string[];
}

/**
 * Меняет дату экзамена сразу многим ученикам: всем, выбранным группам или
 * выбранным ученикам. Отсчёт до экзамена у них на главной обновится сразу.
 */
export async function setExamDate(input: ExamInput): Promise<AdminResult & { count?: number }> {
  const err = await guard();
  if (err) return { error: err };
  const date = dateOrNull(input.examDate);
  if (input.examDate && !date) return { error: 'Неверная дата' };
  const name = clean(input.examName, 80);
  const city = clean(input.examCity, 60);

  let ids: string[] | null = null;
  if (input.audience === 'groups') {
    const gids = (input.groups || []).map(intOrNull).filter((x): x is number => x !== null);
    if (!gids.length) return { error: 'Выбери хотя бы одну группу' };
    const rows = await db<{ student_id: string }>`select distinct student_id from bc_members where group_id = any(${gids}::int[])`;
    ids = rows.map((r) => r.student_id);
    if (!ids.length) return { error: 'В выбранных группах нет учеников' };
  } else if (input.audience === 'students') {
    ids = (input.students || []).map((s) => clean(s, 40)).filter((x): x is string => Boolean(x));
    if (!ids.length) return { error: 'Выбери хотя бы одного ученика' };
  } else if (input.audience !== 'all') {
    return { error: 'Выбери, кому менять дату' };
  }

  const rows = ids
    ? await db<{ id: string }>`update bc_students set exam_date = ${date},
        exam_name = coalesce(${name}, exam_name), exam_city = coalesce(${city}, exam_city)
        where id = any(${ids}::text[]) returning id`
    : await db<{ id: string }>`update bc_students set exam_date = ${date},
        exam_name = coalesce(${name}, exam_name), exam_city = coalesce(${city}, exam_city)
        returning id`;
  revalidatePath('/', 'layout');
  return { ok: true, count: rows.length };
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
  // Индивидуальные занятия существуют только ради одного ученика — уходят вместе с ним.
  const solo = await db<{ id: number }>`select g.id from bc_groups g join bc_members m on m.group_id = g.id
    where m.student_id = ${id} and g.kind = 'solo'`;
  for (const g of solo) {
    await db`delete from bc_members where group_id = ${g.id}`;
    await db`delete from bc_events where group_id = ${g.id}`;
    await db`delete from bc_groups where id = ${g.id}`;
  }
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
  /** 'group' — набор учеников, 'solo' — индивидуальные занятия с одним. */
  kind?: string;
  /** Только для 'solo': ID ученика, с которым идут занятия. */
  studentId?: string | null;
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
  const kind = input.kind === 'solo' ? 'solo' : 'group';
  const studentId = kind === 'solo' ? clean(input.studentId, 40) : null;
  if (kind === 'solo') {
    if (!studentId) return { error: 'Выбери ученика для индивидуальных занятий' };
    if (!(await one`select 1 from bc_students where id = ${studentId}`)) return { error: 'Такого ученика нет' };
  }
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
  let gid = id;
  if (gid) {
    await db`update bc_groups set kind = ${kind}, course = ${course}, name = ${vals.name}, teacher = ${vals.teacher}, schedule = ${vals.schedule}::jsonb,
      starts = ${vals.starts}, ends = ${vals.ends}, total_lessons = ${vals.total}, link = ${vals.link}, chat = ${vals.chat},
      materials = ${vals.materials}, color = ${vals.color} where id = ${gid}`;
  } else {
    const row = await one<{ id: number }>`insert into bc_groups (kind, course, name, teacher, schedule, starts, ends, total_lessons, link, chat, materials, color)
      values (${kind}, ${course}, ${vals.name}, ${vals.teacher}, ${vals.schedule}::jsonb, ${vals.starts}, ${vals.ends}, ${vals.total},
        ${vals.link}, ${vals.chat}, ${vals.materials}, ${vals.color}) returning id`;
    gid = row?.id ?? null;
  }
  // У индивидуальных занятий участник ровно один — переписываем состав целиком.
  if (kind === 'solo' && gid && studentId) {
    await db`delete from bc_members where group_id = ${gid} and student_id <> ${studentId}`;
    await db`insert into bc_members (student_id, group_id) values (${studentId}, ${gid}) on conflict do nothing`;
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

const KINDS = ['deadline', 'lesson', 'exam'];
const TZONE = () => process.env.BOOTCAMP_TZ || 'Asia/Tashkent';

/** Общая проверка полей события. Возвращает либо текст ошибки, либо готовые значения. */
function eventFields(input: { kind?: string; title?: string; date?: string; time?: string; link?: unknown; note?: unknown }) {
  const title = clean(input.title, 140);
  const date = dateOrNull(input.date);
  if (!title || !date) return 'Укажи название и дату';
  const kind = KINDS.includes(input.kind || '') ? String(input.kind) : 'deadline';
  // Срок сдачи без времени — до конца дня; занятие и тест по умолчанию с утра.
  const time = HHMM.test(input.time || '') ? String(input.time) : kind === 'deadline' ? '23:59' : '10:00';
  return { kind, title, at: `${date} ${time}`, link: url(input.link), note: clean(input.note, 300) };
}

/** Одно событие для группы или ученика — из карточки группы и карточки ученика. */
export async function addEvent(input: { groupId?: number | null; studentId?: string | null; kind: string; title: string; date: string; time?: string }): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const f = eventFields(input);
  if (typeof f === 'string') return { error: f };
  if (!input.groupId && !input.studentId) return { error: 'Выбери группу или ученика' };
  await db`insert into bc_events (group_id, student_id, kind, title, at)
    values (${input.groupId || null}, ${input.studentId || null}, ${f.kind}, ${f.title}, (${f.at}::timestamp at time zone ${TZONE()}))`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export interface EventInput {
  kind: string;
  title: string;
  date: string;
  time?: string;
  link?: string;
  note?: string;
  /** Кому: всем ученикам школы, выбранным группам или выбранным ученикам. */
  audience: 'all' | 'groups' | 'students';
  groups?: number[];
  students?: string[];
}

/**
 * Назначает доп. занятие, пробный экзамен или срок сразу нескольким адресатам.
 * На каждого адресата заводится своя строка, все они связаны общим batch —
 * так событие можно удалить целиком, а расписание ученика остаётся простым.
 */
export async function addEvents(input: EventInput): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const f = eventFields(input);
  if (typeof f === 'string') return { error: f };

  const batch = randomUUID();
  const tz = TZONE();
  const ins = (groupId: number | null, studentId: string | null, scope: 'all' | 'target') =>
    db`insert into bc_events (group_id, student_id, kind, title, at, scope, batch, link, note)
      values (${groupId}, ${studentId}, ${f.kind}, ${f.title}, (${f.at}::timestamp at time zone ${tz}), ${scope}, ${batch}, ${f.link}, ${f.note})`;

  if (input.audience === 'all') {
    await ins(null, null, 'all');
  } else if (input.audience === 'groups') {
    const ids = (input.groups || []).map(intOrNull).filter((x): x is number => x !== null);
    if (!ids.length) return { error: 'Выбери хотя бы одну группу' };
    for (const id of ids) await ins(id, null, 'target');
  } else {
    const ids = (input.students || []).map((s) => clean(s, 40)).filter((x): x is string => Boolean(x));
    if (!ids.length) return { error: 'Выбери хотя бы одного ученика' };
    for (const id of ids) await ins(null, id, 'target');
  }

  revalidatePath('/', 'layout');
  return { ok: true, id: batch };
}

export async function deleteEvent(id: number): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  await db`delete from bc_events where id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Удаляет назначение целиком — все строки, созданные одним действием. */
export async function deleteEventBatch(batch: string): Promise<AdminResult> {
  const err = await guard();
  if (err) return { error: err };
  const key = clean(batch, 64);
  if (!key) return { error: 'Нечего удалять' };
  await db`delete from bc_events where batch = ${key}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}
