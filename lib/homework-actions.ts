'use server';

/*
 * Действия с домашкой: задать и удалить. Учитель — только своим группам,
 * админ — любым.
 */

import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { currentUser, isAdmin } from './auth';
import { topicInfo } from './bank';
import { HHMM, TZONE, clean, dateOrNull } from './fields';
import { HW_COUNTS, HW_MAX_TOPICS } from './homework';
import { SITE, notifyNewEvents } from './reminders';
import { newId } from './runs';

export interface HomeworkResult { ok?: boolean; error?: string; count?: number }

export interface HomeworkInput {
  groups: number[];
  topics: string[];
  count: number;
  date: string;
  time?: string;
  title?: string;
  note?: string;
}

interface Who { admin: boolean; teacher: { id: string; name: string } | null; name: string }

async function who(): Promise<Who | null> {
  const u = await currentUser();
  if (!u) return null;
  const teacher = await one<{ id: string; name: string }>`select id, name from bc_teachers where user_id = ${u.id}`;
  const admin = isAdmin(u);
  if (!teacher && !admin) return null;
  // имя аккаунта админа («Admin») ученикам ни о чём не говорит — подписываем школой
  return { admin, teacher, name: teacher?.name || 'Школа' };
}

/** Задать домашку одной или нескольким группам: каждому ученику — свой набор задач из выбранных тем. */
export async function assignHomework(input: HomeworkInput): Promise<HomeworkResult> {
  const me = await who();
  if (!me) return { error: 'Нет доступа: домашку задаёт учитель или админ' };
  if (!input || typeof input !== 'object') return { error: 'Плохой запрос' };

  const ids = [...new Set((input.groups || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { error: 'Выбери группу' };
  const groups = me.admin
    ? await db<{ id: number }>`select id from bc_groups where id = any(${ids}::int[])`
    : await db<{ id: number }>`select id from bc_groups where teacher_id = ${me.teacher!.id} and id = any(${ids}::int[])`;
  if (groups.length !== ids.length) return { error: 'Можно задавать домашку только своим группам' };

  const topics = [...new Set((input.topics || []).map(String))].filter((k) => {
    const t = topicInfo(k);
    return t && !t.mixed;
  });
  if (!topics.length) return { error: 'Выбери хотя бы одну тему' };
  if (topics.length > HW_MAX_TOPICS) return { error: `Не больше ${HW_MAX_TOPICS} тем в одной домашке` };
  const count = Number(input.count);
  if (!HW_COUNTS.includes(count)) return { error: 'Выбери число задач' };

  const date = dateOrNull(input.date);
  // 2026-13-45 по виду похоже на дату, но такой даты нет
  if (!date || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return { error: 'Укажи срок сдачи' };
  const time = HHMM.test(input.time || '') ? String(input.time) : '23:59';
  const tz = TZONE();
  const when = await one<{ future: boolean; far: boolean }>`select
    ((${`${date} ${time}`}::timestamp at time zone ${tz}) > now()) as future,
    ((${`${date} ${time}`}::timestamp at time zone ${tz}) > now() + interval '120 days') as far`;
  if (!when?.future) return { error: 'Срок уже прошёл: выбери дату и время позже' };
  if (when.far) return { error: 'Срок слишком далеко: не позже чем через четыре месяца' };

  const labels = topics.map((k) => topicInfo(k)!.label);
  const auto = labels.length <= 2 ? labels.join(' и ') : `${labels.slice(0, 2).join(', ')} и ещё ${labels.length - 2}`;
  const title = clean(input.title, 100) || auto;
  const note = clean(input.note, 300);
  const site = SITE();

  const events: number[] = [];
  // одно задание нескольким группам — общий batch: ученик двух групп получит его один раз
  const batch = groups.length > 1 ? newId() : null;
  for (const { id: gid } of groups) {
    const id = newId();
    await db`insert into bc_homework (id, group_id, teacher_id, author, title, topics, count, due_at, note, batch)
      values (${id}, ${gid}, ${me.teacher?.id ?? null}, ${me.name}, ${title}, ${JSON.stringify(topics)}::jsonb, ${count},
        (${`${date} ${time}`}::timestamp at time zone ${tz}), ${note}, ${batch})`;
    // Срок попадает в расписание ученика и в напоминания Telegram (за сутки) — как любой срок сдачи.
    const ev = await one<{ id: number }>`insert into bc_events (group_id, student_id, kind, title, at, scope, batch, link, note)
      values (${gid}, null, 'deadline', ${`Домашка: ${title}`}, (${`${date} ${time}`}::timestamp at time zone ${tz}), 'target',
        ${`hw:${id}`}, ${`${site}/homework/${id}`}, ${`${count} задач на платформе${note ? ` · ${note}` : ''}`})
      returning id`;
    if (ev) events.push(ev.id);
  }
  await notifyNewEvents(events);
  revalidatePath('/', 'layout');
  return { ok: true, count: groups.length };
}

/** Удалить домашку: вместе со сроком в расписании и наборами задач учеников. Решённые задачи остаются в прогрессе. */
export async function deleteHomework(id: string): Promise<HomeworkResult> {
  const me = await who();
  if (!me) return { error: 'Нет доступа: домашку удаляет учитель или админ' };
  const hwId = String(id || '').slice(0, 40);
  const hw = me.admin
    ? await one<{ id: string }>`select id from bc_homework where id = ${hwId}`
    : await one<{ id: string }>`select h.id from bc_homework h join bc_groups g on g.id = h.group_id
        where h.id = ${hwId} and g.teacher_id = ${me.teacher!.id}`;
  if (!hw) return { error: 'Это домашка не твоей группы' };
  // сначала само задание: после этого ученик уже не откроет его и не создаст новый набор
  await db`delete from bc_homework where id = ${hwId}`;
  await db`delete from bc_events where batch = ${`hw:${hwId}`}`;
  await db`delete from bc_sets where kind = 'homework' and hw_id = ${hwId}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}
