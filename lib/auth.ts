/*
 * Вход и сессии.
 *
 * Сессия — подписанная cookie `tz_session` (id пользователя + срок).
 * На *.tryoszone.com cookie ставится на весь домен, чтобы основной сайт
 * со временем тоже узнавал вошедшего ученика.
 *
 * Пароли хранятся только как scrypt-хеш с солью.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, dbUrl, hasDb, one } from './db';

export const SESSION_COOKIE = 'tz_session';
const SESSION_DAYS = 30;

/* --------------------------------------------------------------- ключи */

function key(): Buffer {
  const base = process.env.AUTH_SECRET || dbUrl() || 'tryos-bootcamp-dev';
  return createHash('sha256').update(`tz-session:${base}`).digest();
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sign(payload: object): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac('sha256', key()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify<T = any>(token: string | undefined | null): T | null {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const good = b64url(createHmac('sha256', key()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64url(body).toString('utf8'));
    if (data?.e && Date.now() > data.e) return null;
    return data as T;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- пароли */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function checkPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, h] = stored.split('$');
  const expected = Buffer.from(h || '', 'base64');
  if (!s || expected.length < 16) return false;
  const got = scryptSync(password, Buffer.from(s, 'base64'), expected.length);
  return timingSafeEqual(expected, got);
}

export const newId = (prefix = 'u') => `${prefix}_${b64url(randomBytes(12))}`;

/* ------------------------------------------------------------- cookies */

export function cookieDomain(host: string | null | undefined): string | undefined {
  const h = (host || '').split(':')[0];
  return h === 'tryoszone.com' || h.endsWith('.tryoszone.com') ? '.tryoszone.com' : undefined;
}

export function sessionCookie(userId: string, host: string | null | undefined) {
  const e = Date.now() + SESSION_DAYS * 86_400_000;
  return {
    name: SESSION_COOKIE,
    value: sign({ u: userId, e }),
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
    domain: cookieDomain(host),
  };
}

export function clearedCookie(host: string | null | undefined) {
  return { name: SESSION_COOKIE, value: '', httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0, domain: cookieDomain(host) };
}

/* -------------------------------------------------------- пользователь */

export interface User {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  google_sub: string | null;
  tg_id: string | null;
  tg_username: string | null;
  role: 'student' | 'admin';
  exam_name: string | null;
  exam_date: string | null;
  pass_hash?: string | null;
}

const admins = () =>
  (process.env.BOOTCAMP_ADMINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const isAdmin = (u: Pick<User, 'role' | 'username'> | null) =>
  Boolean(u && (u.role === 'admin' || (u.username && admins().includes(u.username.toLowerCase()))));

export async function currentUser(): Promise<User | null> {
  if (!hasDb()) return null;
  const s = verify<{ u: string }>(cookies().get(SESSION_COOKIE)?.value);
  if (!s?.u) return null;
  const u = await one<User>`select id, username, name, email, google_sub, tg_id::text as tg_id, tg_username, role,
    exam_name, to_char(exam_date, 'YYYY-MM-DD') as exam_date, pass_hash
    from bc_users where id = ${s.u}`;
  if (u) {
    // отмечаем визит не чаще, чем нужно: достаточно раз за запрос страницы
    db`update bc_users set last_seen = now() where id = ${u.id}`.catch(() => {});
  }
  return u;
}

/** Для страниц кабинета: нет входа — на /login. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u as User;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect('/');
  return u;
}

export const hostOf = () => headers().get('x-forwarded-host') || headers().get('host');

/* ----------------------------------------------------------- проверки */

export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

export function normUsername(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}
