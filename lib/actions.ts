'use server';

/*
 * Действия ученика: привязка ID, профиль, дата экзамена, логин и пароль.
 * Каждое действие само проверяет, кто вошёл.
 */

import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { USERNAME_RE, checkPassword, currentUser, hashPassword, normUsername } from './auth';
import { STUDENT_CODE, TEACHER_CODE, normCode } from './data';

export interface Result { ok?: boolean; error?: string }

export async function linkStudentId(raw: string): Promise<Result> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  const code = normCode(raw);
  if (TEACHER_CODE.test(code)) return linkTeacher(u.id, code);
  if (!STUDENT_CODE.test(code)) return { error: 'ID выглядит так: TZ-1234-ABCD' };
  const st = await one<{ id: string; user_id: string | null }>`select id, user_id from bc_students where id = ${code}`;
  if (!st) return { error: 'Такого ID нет. Проверь буквы и цифры или спроси у школы' };
  if (st.user_id && st.user_id !== u.id) return { error: 'Этот ID уже привязан к другому аккаунту. Напиши в школу' };
  const mine = await one<{ id: string }>`select id from bc_students where user_id = ${u.id}`;
  if (mine && mine.id !== code) return { error: `К аккаунту уже привязан ID ${mine.id}` };
  await db`update bc_students set user_id = ${u.id} where id = ${code}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** ID учителя (TZT-…) вводится в то же поле, что и ID ученика. */
async function linkTeacher(userId: string, code: string): Promise<Result> {
  const t = await one<{ id: string; user_id: string | null }>`select id, user_id from bc_teachers where id = ${code}`;
  if (!t) return { error: 'Такого ID учителя нет. Проверь буквы и цифры или спроси у администратора' };
  if (t.user_id && t.user_id !== userId) return { error: 'Этот ID уже привязан к другому аккаунту. Напиши администратору' };
  const mine = await one<{ id: string }>`select id from bc_teachers where user_id = ${userId}`;
  if (mine && mine.id !== code) return { error: `К аккаунту уже привязан ID учителя ${mine.id}` };
  await db`update bc_teachers set user_id = ${userId} where id = ${code}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveProfile(input: { name: string; examName: string; examDate: string }): Promise<Result> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) return { error: 'Укажи имя' };
  const examName = String(input.examName || '').trim().slice(0, 80) || null;
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(input.examDate || '') ? input.examDate : null;
  await db`update bc_users set name = ${name}, exam_name = ${examName}, exam_date = ${examDate} where id = ${u.id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Логин и пароль: задать (для тех, кто вошёл через Google/Telegram) или сменить. */
export async function savePassword(input: { username: string; current: string; next: string }): Promise<Result> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  const next = String(input.next || '');
  if (next.length < 8) return { error: 'Новый пароль — не короче 8 символов' };
  if (u.pass_hash && !checkPassword(String(input.current || ''), u.pass_hash)) return { error: 'Текущий пароль неверный' };
  let username = u.username;
  if (!username) {
    username = normUsername(input.username);
    if (!USERNAME_RE.test(username)) return { error: 'Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или подчёркивание' };
    const taken = await one`select 1 from bc_users where username = ${username}`;
    if (taken) return { error: 'Такой логин уже занят' };
  }
  await db`update bc_users set username = ${username}, pass_hash = ${hashPassword(next)} where id = ${u.id}`;
  revalidatePath('/settings');
  return { ok: true };
}
