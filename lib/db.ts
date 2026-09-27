/*
 * База данных: Postgres (Neon), подключается к проекту через Vercel → Storage.
 * Строка подключения приходит в DATABASE_URL (или POSTGRES_URL).
 *
 * Таблицы создаются сами при первом обращении — отдельных миграций не нужно.
 */

import { neon } from '@neondatabase/serverless';

export const dbUrl = (): string => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const hasDb = (): boolean => Boolean(dbUrl());

type Sql = ReturnType<typeof neon>;
let client: Sql | null = null;

function raw(): Sql {
  if (!hasDb()) throw new Error('DATABASE_URL не задан: подключите базу Neon в Vercel → Storage');
  if (!client) client = neon(dbUrl());
  return client;
}

let ready: Promise<void> | null = null;

/** Создаёт таблицы один раз на запуск функции. */
function ensureSchema(): Promise<void> {
  if (!ready) {
    const q = raw();
    ready = (async () => {
      await q`create table if not exists bc_users (
        id text primary key,
        username text unique,
        pass_hash text,
        name text not null default '',
        email text unique,
        google_sub text unique,
        tg_id bigint unique,
        tg_username text,
        role text not null default 'student',
        exam_name text,
        exam_date date,
        created_at timestamptz not null default now(),
        last_seen timestamptz
      )`;
      await q`create table if not exists bc_students (
        id text primary key,
        name text not null,
        phone text,
        note text,
        access jsonb not null default '{"level":"full"}',
        exam_name text,
        exam_date date,
        exam_city text,
        target_score int,
        user_id text unique,
        created_at timestamptz not null default now()
      )`;
      await q`create table if not exists bc_groups (
        id serial primary key,
        course text not null,
        name text not null default '',
        teacher text,
        schedule jsonb not null default '[]',
        starts date,
        ends date,
        total_lessons int,
        link text,
        chat text,
        materials text,
        color text,
        created_at timestamptz not null default now()
      )`;
      // kind: 'group' — обычная группа, 'solo' — индивидуальные занятия с одним
      // учеником. Колонка добавляется отдельно, чтобы уже созданная таблица
      // на рабочей базе тоже её получила.
      await q`alter table bc_groups add column if not exists kind text not null default 'group'`;
      // Учителя: карточку заводит админ, учитель привязывает её к своему
      // аккаунту по ID вида TZT-1234-ABCD — так же, как ученик.
      await q`create table if not exists bc_teachers (
        id text primary key,
        name text not null,
        phone text,
        note text,
        user_id text unique,
        created_at timestamptz not null default now()
      )`;
      // У группы — учитель из списка. Колонка teacher остаётся: в ней имя,
      // его видят ученики (и у старых групп без учителя из списка).
      await q`alter table bc_groups add column if not exists teacher_id text`;
      // Отдельное занятие по расписанию: своя ссылка и тема на конкретную дату.
      await q`create table if not exists bc_lesson_info (
        group_id int not null,
        date date not null,
        start text not null,
        link text,
        topic text,
        updated_at timestamptz not null default now(),
        primary key (group_id, date, start)
      )`;
      await q`create table if not exists bc_members (
        student_id text not null,
        group_id int not null,
        primary key (student_id, group_id)
      )`;
      await q`create table if not exists bc_scores (
        id serial primary key,
        student_id text not null,
        title text not null,
        value numeric not null,
        max numeric not null,
        teacher text,
        date date not null default current_date,
        created_at timestamptz not null default now()
      )`;
      // Кто из учителей поставил оценку: учитель может удалить только свои.
      await q`alter table bc_scores add column if not exists teacher_id text`;
      await q`create table if not exists bc_events (
        id serial primary key,
        group_id int,
        student_id text,
        kind text not null default 'deadline',
        title text not null,
        at timestamptz not null,
        created_at timestamptz not null default now()
      )`;
      // scope = 'all' — событие для всех учеников школы; 'target' — для группы
      // или ученика из этой же строки. batch связывает строки, созданные одним
      // назначением (например, доп. занятие сразу для трёх групп).
      await q`alter table bc_events add column if not exists scope text not null default 'target'`;
      await q`alter table bc_events add column if not exists batch text`;
      await q`alter table bc_events add column if not exists link text`;
      await q`alter table bc_events add column if not exists note text`;
      await q`create index if not exists bc_events_at on bc_events (at)`;
      await q`create table if not exists bc_attempts (
        id bigserial primary key,
        user_id text not null,
        question_id text,
        topic text not null,
        topic_label text,
        section text,
        correct boolean not null,
        mode text not null default 'practice',
        created_at timestamptz not null default now()
      )`;
      await q`create index if not exists bc_attempts_user on bc_attempts (user_id, created_at)`;
      await q`create table if not exists bc_tests (
        id bigserial primary key,
        user_id text not null,
        attempt_id text unique,
        title text not null,
        score int not null,
        correct int not null default 0,
        wrong int not null default 0,
        blank int not null default 0,
        total int not null default 0,
        created_at timestamptz not null default now()
      )`;
      // Пробник: вариант хранится на сервере, чтобы перезагрузка страницы
      // не обнуляла стомнутный тест.
      await q`create table if not exists bc_exam_runs (
        id text primary key,
        user_id text not null,
        format text not null,
        title text not null,
        minutes int not null,
        ids jsonb not null,
        answers jsonb not null default '[]'::jsonb,
        score int,
        correct int not null default 0,
        wrong int not null default 0,
        blank int not null default 0,
        started_at timestamptz not null default now(),
        finished_at timestamptz
      )`;
      await q`create index if not exists bc_exam_runs_user on bc_exam_runs (user_id, started_at desc)`;
      // Режим выживания: серия считается на сервере, иначе таблицу лидеров
      // можно было бы нарисовать из браузера.
      await q`create table if not exists bc_survival (
        id text primary key,
        user_id text not null,
        streak int not null default 0,
        best int not null default 0,
        lives int not null default 3,
        asked int not null default 0,
        cur_id text,
        seen jsonb not null default '[]'::jsonb,
        alive boolean not null default true,
        started_at timestamptz not null default now(),
        ended_at timestamptz
      )`;
      await q`create index if not exists bc_survival_board on bc_survival (best desc, ended_at)`;
      // Таймер задачи в выживании: когда задача выдана и когда ученик её увидел.
      await q`alter table bc_survival add column if not exists cur_issued timestamptz`;
      await q`alter table bc_survival add column if not exists cur_at timestamptz`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/**
 * Запрос к базе. Пользоваться как тегированным шаблоном:
 *   const rows = await db`select * from bc_users where id = ${id}`;
 * Значения подставляются параметрами — SQL-инъекции исключены.
 */
export async function db<T = Record<string, any>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  await ensureSchema();
  const q = raw() as any;
  return (await q(strings, ...values)) as T[];
}

export async function one<T = Record<string, any>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await db<T>(strings, ...values);
  return rows[0] ?? null;
}
