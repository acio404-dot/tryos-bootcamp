/*
 * Очные пробные тестирования: результаты вносит учитель или админ, и они
 * попадают в ту же историю тестов (bc_tests), что и онлайн-пробники, —
 * на главную ученика, в график и в «Прогресс».
 */

import { randomUUID } from 'node:crypto';
import { db } from './db';
import { clean, dateOrNull, intOrNull } from './fields';
import { TZ } from './data';

/** Максимальный балл TR-YÖS — как у онлайн-пробников. */
export const MOCK_MAX = 500;

export interface MockRowInput { studentId: string; score: string | number; correct?: string | number; wrong?: string | number }

export interface MockInput {
  /** Если задан — результаты этого тестирования заменяются (редактирование). */
  batch?: string | null;
  title: string;
  date: string;
  rows: MockRowInput[];
}

export interface MockRow { student_id: string; name: string; score: number; correct: number; wrong: number }
export interface MockBatch { batch: string; title: string; date: string; teacher: string | null; entered_by: string | null; rows: MockRow[] }

const num = (v: unknown) => (String(v ?? '').trim() === '' ? null : intOrNull(v));

/** Проверка ввода. Ошибка — строкой, иначе готовые строки. Пустой балл — «не писал», строка пропускается. */
export function mockFields(input: MockInput) {
  const title = clean(input.title, 120);
  const date = dateOrNull(input.date);
  if (!title || !date) return 'Укажи название и дату тестирования';
  const rows: { studentId: string; score: number; correct: number; wrong: number }[] = [];
  for (const r of input.rows || []) {
    const score = num(r.score);
    if (score === null) continue;
    if (score < 0 || score > MOCK_MAX) return `Балл — от 0 до ${MOCK_MAX}`;
    const correct = num(r.correct) ?? 0;
    const wrong = num(r.wrong) ?? 0;
    if (correct < 0 || wrong < 0 || correct > 200 || wrong > 200) return 'Верно и неверно — числа от 0 до 200';
    const id = clean(r.studentId, 40);
    if (id) rows.push({ studentId: id, score, correct, wrong });
  }
  if (!rows.length) return 'Впиши балл хотя бы одному ученику';
  if (new Set(rows.map((r) => r.studentId)).size !== rows.length) return 'У одного ученика два результата';
  return { title, date, rows, batch: clean(input.batch, 64) };
}

/** Сохраняет тестирование. enteredBy — кто вносил (ID учителя или admin:…), teacher — имя для ученика. */
export async function saveMock(f: Exclude<ReturnType<typeof mockFields>, string>, enteredBy: string, teacher: string | null): Promise<number> {
  const batch = f.batch || randomUUID();
  if (f.batch) await db`delete from bc_tests where batch = ${batch} and source = 'offline'`;
  const ids = f.rows.map((r) => r.studentId);
  const bound = await db<{ id: string; user_id: string | null }>`select id, user_id from bc_students where id = any(${ids}::text[])`;
  const userOf = new Map(bound.map((b) => [b.id, b.user_id]));
  let n = 0;
  for (const r of f.rows) {
    if (!userOf.has(r.studentId)) continue;
    // user_id — если ученик уже вошёл; иначе пусто, а найдём по student_id
    await db`insert into bc_tests (user_id, student_id, title, score, correct, wrong, blank, total, source, batch, entered_by, teacher, created_at)
      values (${userOf.get(r.studentId) || ''}, ${r.studentId}, ${f.title}, ${r.score}, ${r.correct}, ${r.wrong}, 0,
        ${r.correct + r.wrong}, 'offline', ${batch}, ${enteredBy}, ${teacher}, (${`${f.date} 12:00`}::timestamp at time zone ${TZ}))`;
    n++;
  }
  return n;
}

/** Внесённые тестирования, свежие сверху. enteredBy — только свои (для учителя). */
export async function mockBatches(enteredBy?: string): Promise<MockBatch[]> {
  const rows = await db<MockRow & { batch: string; title: string; date: string; teacher: string | null; entered_by: string | null }>`
    select t.batch, t.title, to_char(t.created_at at time zone ${TZ}, 'YYYY-MM-DD') as date, t.teacher, t.entered_by,
      t.student_id, coalesce(s.name, t.student_id) as name, t.score, t.correct, t.wrong
    from bc_tests t left join bc_students s on s.id = t.student_id
    where t.source = 'offline' and t.batch is not null
      and (${enteredBy ?? null}::text is null or t.entered_by = ${enteredBy ?? null})
      and t.created_at > now() - interval '400 days'
    order by t.created_at desc, name`;
  const map = new Map<string, MockBatch>();
  for (const r of rows) {
    if (!map.has(r.batch)) map.set(r.batch, { batch: r.batch, title: r.title, date: r.date, teacher: r.teacher, entered_by: r.entered_by, rows: [] });
    map.get(r.batch)!.rows.push({ student_id: r.student_id, name: r.name, score: r.score, correct: r.correct, wrong: r.wrong });
  }
  return [...map.values()].slice(0, 40);
}

export async function deleteMock(batch: string, enteredBy?: string): Promise<number> {
  const rows = enteredBy
    ? await db`delete from bc_tests where batch = ${batch} and source = 'offline' and entered_by = ${enteredBy} returning id`
    : await db`delete from bc_tests where batch = ${batch} and source = 'offline' returning id`;
  return rows.length;
}
