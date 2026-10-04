/*
 * База данных: Postgres (Neon), подключается к проекту через Vercel → Storage.
 * Строка подключения приходит в DATABASE_URL (или POSTGRES_URL).
 *
 * Таблицы создаются сами при первом обращении — отдельных миграций не нужно.
 */

import { createHash } from 'node:crypto';
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

/*
 * Схема базы: таблицы и колонки. Раньше все команды выполнялись по одной на
 * каждом холодном старте функции — это 35+ запросов к базе подряд. Теперь
 * на старте один запрос сверяет версию схемы (хеш этого списка), и только
 * если схема поменялась, все команды уходят одним пакетом.
 */
type Q = (strings: TemplateStringsArray, ...values: unknown[]) => any;

const SCHEMA: ((q: Q) => any)[] = [
  (q) => q`create table if not exists bc_meta (key text primary key, value text not null)`,
  (q) => q`create table if not exists bc_users (
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
  )`,
  (q) => q`create table if not exists bc_students (
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
  )`,
  (q) => q`create table if not exists bc_groups (
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
  )`,
  // kind: 'group' — обычная группа, 'solo' — индивидуальные занятия с одним
  // учеником. Колонка добавляется отдельно, чтобы уже созданная таблица
  // на рабочей базе тоже её получила.
  (q) => q`alter table bc_groups add column if not exists kind text not null default 'group'`,
  // Учителя: карточку заводит админ, учитель привязывает её к своему
  // аккаунту по ID вида TZT-1234-ABCD — так же, как ученик.
  (q) => q`create table if not exists bc_teachers (
    id text primary key,
    name text not null,
    phone text,
    note text,
    user_id text unique,
    created_at timestamptz not null default now()
  )`,
  // У группы — учитель из списка. Колонка teacher остаётся: в ней имя,
  // его видят ученики (и у старых групп без учителя из списка).
  (q) => q`alter table bc_groups add column if not exists teacher_id text`,
  // Отдельное занятие по расписанию: своя ссылка и тема на конкретную дату.
  (q) => q`create table if not exists bc_lesson_info (
    group_id int not null,
    date date not null,
    start text not null,
    link text,
    topic text,
    updated_at timestamptz not null default now(),
    primary key (group_id, date, start)
  )`,
  (q) => q`create table if not exists bc_members (
    student_id text not null,
    group_id int not null,
    primary key (student_id, group_id)
  )`,
  (q) => q`create table if not exists bc_scores (
    id serial primary key,
    student_id text not null,
    title text not null,
    value numeric not null,
    max numeric not null,
    teacher text,
    date date not null default current_date,
    created_at timestamptz not null default now()
  )`,
  // Кто из учителей поставил оценку: учитель может удалить только свои.
  (q) => q`alter table bc_scores add column if not exists teacher_id text`,
  // Напоминания в Telegram: чат (после /start в боте) и какие напоминания
  // включены. Если чата нет, пишем на tg_id — вход через Telegram уже
  // даёт боту право писать. notify: {"lessons":false,...} — выключенные.
  (q) => q`alter table bc_users add column if not exists tg_chat_id bigint`,
  (q) => q`alter table bc_users add column if not exists notify jsonb not null default '{}'::jsonb`,
  (q) => q`create table if not exists bc_tg_links (
    code text primary key,
    user_id text not null,
    created_at timestamptz not null default now()
  )`,
  // Что уже отправлено — чтобы одно напоминание не пришло дважды.
  (q) => q`create table if not exists bc_notify_log (
    key text primary key,
    sent_at timestamptz not null default now()
  )`,
  (q) => q`create table if not exists bc_events (
    id serial primary key,
    group_id int,
    student_id text,
    kind text not null default 'deadline',
    title text not null,
    at timestamptz not null,
    created_at timestamptz not null default now()
  )`,
  // scope = 'all' — событие для всех учеников школы; 'target' — для группы
  // или ученика из этой же строки. batch связывает строки, созданные одним
  // назначением (например, доп. занятие сразу для трёх групп).
  (q) => q`alter table bc_events add column if not exists scope text not null default 'target'`,
  (q) => q`alter table bc_events add column if not exists batch text`,
  (q) => q`alter table bc_events add column if not exists link text`,
  (q) => q`alter table bc_events add column if not exists note text`,
  (q) => q`create index if not exists bc_events_at on bc_events (at)`,
  (q) => q`create table if not exists bc_attempts (
    id bigserial primary key,
    user_id text not null,
    question_id text,
    topic text not null,
    topic_label text,
    section text,
    correct boolean not null,
    mode text not null default 'practice',
    created_at timestamptz not null default now()
  )`,
  (q) => q`create index if not exists bc_attempts_user on bc_attempts (user_id, created_at)`,
  (q) => q`create table if not exists bc_tests (
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
  )`,
  // Очные пробные тестирования: балл вносит учитель или админ. Строка
  // привязана к ученику (student_id), поэтому видна ему, даже если он
  // привязал ID позже. batch объединяет результаты одного тестирования.
  (q) => q`alter table bc_tests add column if not exists student_id text`,
  (q) => q`alter table bc_tests add column if not exists source text not null default 'online'`,
  (q) => q`alter table bc_tests add column if not exists batch text`,
  (q) => q`alter table bc_tests add column if not exists entered_by text`,
  (q) => q`alter table bc_tests add column if not exists teacher text`,
  (q) => q`create index if not exists bc_tests_student on bc_tests (student_id)`,
  // Пробник: вариант хранится на сервере, чтобы перезагрузка страницы
  // не обнуляла стомнутный тест.
  (q) => q`create table if not exists bc_exam_runs (
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
  )`,
  (q) => q`create index if not exists bc_exam_runs_user on bc_exam_runs (user_id, started_at desc)`,
  // Режим выживания: серия считается на сервере, иначе таблицу лидеров
  // можно было бы нарисовать из браузера.
  (q) => q`create table if not exists bc_survival (
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
  )`,
  (q) => q`create index if not exists bc_survival_board on bc_survival (best desc, ended_at)`,
  // Таймер задачи в выживании: когда задача выдана и когда ученик её увидел.
  (q) => q`alter table bc_survival add column if not exists cur_issued timestamptz`,
  (q) => q`alter table bc_survival add column if not exists cur_at timestamptz`,
  // Кто погасил лампочки: [{n, id, topic, timedOut}] — для финала серии и «Реванша».
  (q) => q`alter table bc_survival add column if not exists lost jsonb not null default '[]'::jsonb`,
  // Таблица недели: лучшие серии, начатые с понедельника.
  (q) => q`create index if not exists bc_survival_week on bc_survival (started_at)`,
  // Сколько секунд ушло на задачу (там, где идёт таймер): нужно для «победы над тенью» — верно и быстрее 75 секунд.
  (q) => q`alter table bc_attempts add column if not exists seconds real`,
  // Смена и домашка: после первой ошибки даётся подсказка и вторая попытка. На задачу — одна строка:
  // correct — верен ли первый ответ (так честнее точность по темам), try — сколько попыток ушло,
  // fixed — решена со второй попытки.
  (q) => q`alter table bc_attempts add column if not exists try smallint not null default 1`,
  (q) => q`alter table bc_attempts add column if not exists fixed boolean not null default false`,
  // Набор задач с подсказкой и второй попыткой: смена дня (kind = 'shift') и домашка от учителя ('homework').
  // items: [{id, kind}] — задачи и откуда они (слабая тема, новая, из ошибок, домашка);
  // answers: [{tries, ok, seconds, light}] — по записи на задачу; step растёт с каждым изменением:
  // по нему отсекаются повторные и параллельные ответы.
  (q) => q`create table if not exists bc_sets (
    id text primary key,
    user_id text not null,
    kind text not null,
    day date,
    seq int not null default 1,
    hw_id text,
    items jsonb not null,
    answers jsonb not null default '[]'::jsonb,
    cur int not null default 0,
    step int not null default 0,
    cur_at timestamptz,
    light int not null default 0,
    done int not null default 0,
    ok1 int not null default 0,
    ok2 int not null default 0,
    started_at timestamptz not null default now(),
    finished_at timestamptz
  )`,
  (q) => q`create unique index if not exists bc_sets_shift on bc_sets (user_id, day, seq) where kind = 'shift'`,
  (q) => q`create unique index if not exists bc_sets_hw on bc_sets (user_id, hw_id) where kind = 'homework'`,
  // Свет — валюта кабинета: начисляется за верные ответы. Одна строка — одно начисление.
  (q) => q`create table if not exists bc_light (
    id bigserial primary key,
    user_id text not null,
    amount int not null,
    reason text not null,
    ref text,
    created_at timestamptz not null default now()
  )`,
  (q) => q`create index if not exists bc_light_user on bc_light (user_id, created_at)`,
  // Домашка от учителя: темы, сколько задач и срок. Каждому ученику группы — свой набор задач (bc_sets).
  (q) => q`create table if not exists bc_homework (
    id text primary key,
    group_id int not null,
    teacher_id text,
    author text,
    title text not null,
    topics jsonb not null,
    count int not null,
    due_at timestamptz not null,
    note text,
    created_at timestamptz not null default now()
  )`,
  (q) => q`create index if not exists bc_homework_group on bc_homework (group_id, due_at)`,
  // Одно задание сразу нескольким группам — строки с общим batch: ученик двух групп видит его один раз.
  (q) => q`alter table bc_homework add column if not exists batch text`,
];

const SCHEMA_VERSION = createHash('sha1').update(SCHEMA.map((f) => f.toString()).join('\n')).digest('hex').slice(0, 16);

let ready: Promise<void> | null = null;

/** Проверяет схему один раз на запуск функции: обычно это один запрос. */
function ensureSchema(): Promise<void> {
  if (!ready) {
    const q = raw() as any;
    ready = (async () => {
      try {
        const cur = await q`select value from bc_meta where key = 'schema'`;
        if (cur?.[0]?.value === SCHEMA_VERSION) return;
      } catch {
        // таблицы bc_meta ещё нет — первый запуск
      }
      try {
        // одним HTTP-запросом (у PGlite в локальных тестах транзакции нет — по одной)
        if (typeof q.transaction === 'function') await q.transaction(SCHEMA.map((f) => f(q)));
        else for (const f of SCHEMA) await f(q);
      } catch {
        // параллельный старт другой функции мог создать то же самое — повторяем по одной
        for (const f of SCHEMA) await f(q);
      }
      await q`insert into bc_meta (key, value) values ('schema', ${SCHEMA_VERSION})
        on conflict (key) do update set value = excluded.value`;
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
