/*
 * Данные кабинета: ученик по ID, группы и расписание, баллы, прогресс.
 */

import { randomInt } from 'node:crypto';
import { db, one } from './db';
import type { User } from './auth';

export { SECTIONS, can } from './access';
export type { Access, Section } from './access';
import type { Access } from './access';

/* ------------------------------------------------------------- ученик */

export interface Student {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  access: Access;
  exam_name: string | null;
  exam_date: string | null;
  exam_city: string | null;
  target_score: number | null;
  user_id: string | null;
}

export async function studentOfUser(userId: string): Promise<Student | null> {
  return one<Student>`select id, name, phone, note, access, exam_name, to_char(exam_date, 'YYYY-MM-DD') as exam_date,
    exam_city, target_score, user_id from bc_students where user_id = ${userId}`;
}

/* -------------------------------------------------------------- экзамен */

export interface Exam {
  name: string;
  date: string | null;
  city: string | null;
  target: number | null;
  fromSchool: boolean;
}

export function examOf(user: User, st: Student | null): Exam | null {
  if (st && (st.exam_name || st.exam_date)) {
    return { name: st.exam_name || 'TR-YÖS', date: st.exam_date, city: st.exam_city, target: st.target_score, fromSchool: true };
  }
  if (user.exam_name || user.exam_date) {
    return { name: user.exam_name || 'TR-YÖS', date: user.exam_date, city: null, target: null, fromSchool: false };
  }
  return null;
}

/* ------------------------------------------------------ группы и время */

export interface Slot { dow: number; start: string; end: string }

/** 'group' — занятия в группе, 'solo' — индивидуальные с одним учеником. */
export type GroupKind = 'group' | 'solo';

export interface Group {
  id: number;
  kind: GroupKind;
  course: string;
  name: string;
  teacher: string | null;
  /** Учитель из списка учителей (bc_teachers), если назначен. */
  teacher_id?: string | null;
  schedule: Slot[];
  starts: string | null;
  ends: string | null;
  total_lessons: number | null;
  link: string | null;
  chat: string | null;
  materials: string | null;
  color: string | null;
}

export async function groupsOfStudent(studentId: string): Promise<Group[]> {
  return db<Group>`select g.id, g.kind, g.course, g.name, g.teacher, g.teacher_id, g.schedule, to_char(g.starts, 'YYYY-MM-DD') as starts,
    to_char(g.ends, 'YYYY-MM-DD') as ends, g.total_lessons, g.link, g.chat, g.materials, g.color
    from bc_groups g join bc_members m on m.group_id = g.id
    where m.student_id = ${studentId} order by g.course`;
}

export interface EventRow {
  id: number;
  group_id: number | null;
  student_id: string | null;
  kind: string;
  title: string;
  at: string;
  /** Дата и время в часовом поясе школы — их и показываем ученику. */
  day: string;
  time: string;
  link: string | null;
  note: string | null;
}

/** События ученика: его личные, его групп и общешкольные (scope = 'all'). */
export async function eventsOf(studentId: string, groupIds: number[], fromIso: string, toIso: string): Promise<EventRow[]> {
  return db<EventRow>`select id, group_id, student_id, kind, title, link, note,
      to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
      to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day,
      to_char(at at time zone ${TZ}, 'HH24:MI') as time
    from bc_events
    where (scope = 'all' or student_id = ${studentId} or group_id = any(${groupIds}::int[]))
      and at >= ${fromIso}::timestamptz and at < ${toIso}::timestamptz
    order by at`;
}

/** Часовой пояс школы: время в расписании задаётся в нём. */
export const TZ = process.env.BOOTCAMP_TZ || 'Asia/Tashkent';

/** Дата и время «сейчас» в часовом поясе школы. */
export function nowInTz(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dow: wd,
    minutes: hour * 60 + Number(get('minute')),
  };
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const dowOfIso = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const toMin = (hhmm: string) => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface Lesson {
  date: string;
  start: string;
  end: string;
  group: Group;
  /** Ссылка на это занятие: своя на эту дату или постоянная ссылка группы. */
  link?: string | null;
  /** Тема, если учитель её указал. */
  topic?: string | null;
}

/** Подставляет ссылки и темы, которые учитель задал для конкретных занятий. */
export async function withLessonInfo<T extends Lesson>(lessons: T[]): Promise<T[]> {
  if (!lessons.length) return lessons;
  const ids = [...new Set(lessons.map((l) => l.group.id))];
  const dates = lessons.map((l) => l.date).sort();
  const rows = await db<{ group_id: number; date: string; start: string; link: string | null; topic: string | null }>`
    select group_id, to_char(date, 'YYYY-MM-DD') as date, start, link, topic from bc_lesson_info
    where group_id = any(${ids}::int[]) and date between ${dates[0]}::date and ${dates[dates.length - 1]}::date`;
  const key = (g: number, d: string, s: string) => `${g}|${d}|${s}`;
  const map = new Map(rows.map((r) => [key(r.group_id, r.date, r.start), r]));
  return lessons.map((l) => {
    const r = map.get(key(l.group.id, l.date, l.start));
    return { ...l, link: r?.link || l.group.link, topic: r?.topic || null };
  });
}

/** Занятия групп на ближайшие дни, начиная с текущего момента. */
export function upcomingLessons(groups: Group[], days = 14, limit = 20): Lesson[] {
  const now = nowInTz();
  const out: Lesson[] = [];
  for (let k = 0; k < days; k++) {
    const date = addDays(now.date, k);
    const dow = dowOfIso(date);
    for (const g of groups) {
      if (g.starts && date < g.starts) continue;
      if (g.ends && date > g.ends) continue;
      for (const s of g.schedule || []) {
        if (Number(s.dow) !== dow) continue;
        if (k === 0 && toMin(s.end) <= now.minutes) continue;
        out.push({ date, start: s.start, end: s.end, group: g });
      }
    }
  }
  out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return out.slice(0, limit);
}

/** Сколько занятий группы уже прошло (по расписанию с даты старта). */
export function lessonsDone(g: Group): number {
  if (!g.starts) return 0;
  const now = nowInTz();
  let n = 0;
  for (let date = g.starts; date <= now.date && (!g.ends || date <= g.ends); date = addDays(date, 1)) {
    const dow = dowOfIso(date);
    for (const s of g.schedule || []) {
      if (Number(s.dow) !== dow) continue;
      if (date === now.date && toMin(s.end) > now.minutes) continue;
      n++;
    }
    if (n > 2000) break;
  }
  return n;
}

/* --------------------------------------------------------------- баллы */

export interface Score { id: number; title: string; value: number; max: number; teacher: string | null; date: string }

export async function scoresOf(studentId: string): Promise<Score[]> {
  return db<Score>`select id, title, value::float as value, max::float as max, teacher, to_char(date, 'YYYY-MM-DD') as date
    from bc_scores where student_id = ${studentId} order by date desc, id desc limit 100`;
}

/* ------------------------------------------------------------ прогресс */

export interface TopicStat { topic: string; label: string; section: string | null; total: number; ok: number }
export interface TestRow {
  title: string; score: number; correct: number; wrong: number; blank: number; total: number; at: string;
  /** 'offline' — очное тестирование, балл внёс учитель или админ. */
  source?: string;
  teacher?: string | null;
}

/** studentId — чтобы подтянуть очные тестирования, внесённые на ученика. */
export async function progressOf(userId: string, studentId?: string | null) {
  const [topics, tests, week, month, days] = await Promise.all([
    db<TopicStat>`select topic, max(coalesce(topic_label, topic)) as label, max(section) as section,
      count(*)::int as total, count(*) filter (where correct)::int as ok
      from bc_attempts where user_id = ${userId} group by topic order by max(section), count(*) desc`,
    db<TestRow>`select title, score, correct, wrong, blank, total, source, teacher,
        to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as at
      from bc_tests where user_id = ${userId} or (${studentId || null}::text is not null and student_id = ${studentId || null})
      order by created_at desc limit 50`,
    one<{ n: number }>`select count(*)::int as n from bc_attempts where user_id = ${userId} and created_at > now() - interval '7 days'`,
    one<{ n: number; r: number }>`select count(*)::int as n, count(*) filter (where correct)::int as r
      from bc_attempts where user_id = ${userId} and created_at > now() - interval '30 days'`,
    db<{ d: string }>`select distinct to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as d
      from bc_attempts where user_id = ${userId} and created_at > now() - interval '120 days' order by d desc`,
  ]);

  // серия: дни подряд с решёнными задачами, по сегодня или по вчера
  const set = new Set(days.map((x) => x.d));
  let cur = nowInTz().date;
  if (!set.has(cur)) cur = addDays(cur, -1);
  let streak = 0;
  while (set.has(cur)) {
    streak += 1;
    cur = addDays(cur, -1);
  }

  return {
    topics,
    tests,
    week: week?.n || 0,
    monthTotal: month?.n || 0,
    monthAcc: month && month.n ? Math.round((month.r / month.n) * 100) : null,
    streak,
  };
}

/* -------------------------------------------------------- ID ученика */

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** ID вида TZ-4821-KQ7M: номер + случайная часть, чтобы ID нельзя было подобрать. */
export function makeStudentCode(): string {
  const num = String(1000 + randomInt(9000));
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPH[randomInt(ALPH.length)];
  return `TZ-${num}-${tail}`;
}

/** ID учителя: TZT-4821-KQ7M. По нему учитель привязывает карточку к своему аккаунту. */
export function makeTeacherCode(): string {
  return makeStudentCode().replace(/^TZ-/, 'TZT-');
}

export const normCode = (s: unknown) =>
  String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/^TZT(\d{4})([A-Z0-9]{4})$/, 'TZT-$1-$2')
    .replace(/^TZ(\d{4})([A-Z0-9]{4})$/, 'TZ-$1-$2');

export const STUDENT_CODE = /^TZ-\d{4}-[A-Z0-9]{4}$/;
export const TEACHER_CODE = /^TZT-\d{4}-[A-Z0-9]{4}$/;

/* ------------------------------------------------------------- учитель */

export interface Teacher { id: string; name: string; phone: string | null; note: string | null; user_id: string | null }

export async function teacherOfUser(userId: string): Promise<Teacher | null> {
  return one<Teacher>`select id, name, phone, note, user_id from bc_teachers where user_id = ${userId}`;
}

/** Группы и индивидуальные занятия, которые ведёт учитель. */
export async function groupsOfTeacher(teacherId: string): Promise<Group[]> {
  return db<Group>`select g.id, g.kind, g.course, g.name, g.teacher, g.teacher_id, g.schedule, to_char(g.starts, 'YYYY-MM-DD') as starts,
    to_char(g.ends, 'YYYY-MM-DD') as ends, g.total_lessons, g.link, g.chat, g.materials, g.color
    from bc_groups g where g.teacher_id = ${teacherId} order by g.kind, g.course, g.name`;
}
