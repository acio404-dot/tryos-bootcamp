import { createHash, createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db, hasDb, one } from '@/lib/db';
import {
  USERNAME_RE, checkPassword, clearedCookie, currentUser, hashPassword, newId, normUsername, sessionCookie, sign, verify,
} from '@/lib/auth';

/*
 * Все способы входа в одном месте (маршруты — тонкие файлы в app/api/auth/*):
 *   POST /api/auth/register   — логин и пароль, регистрация
 *   POST /api/auth/login      — логин и пароль, вход
 *   GET  /api/auth/logout     — выход
 *   GET  /api/auth/google     — вход через Google (если заданы ключи)
 *   GET  /api/auth/google/callback
 *   GET  /api/auth/telegram   — вход через Telegram Login Widget (если задан бот)
 * Если пользователь уже вошёл, Google и Telegram привязываются к его аккаунту.
 */

const host = (req: NextRequest) => req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
const origin = (req: NextRequest) => `https://${host(req)}`;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

function login(req: NextRequest, userId: string, to = '/') {
  const res = NextResponse.redirect(new URL(to, origin(req)));
  res.cookies.set(sessionCookie(userId, host(req)));
  return res;
}

function fail(req: NextRequest, msg: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin(req)));
}

/* Простая защита от перебора паролей: не больше 8 ошибок за 15 минут
   с одного адреса на один логин (в пределах экземпляра функции). */
const failures = new Map<string, { n: number; t: number }>();
function tooMany(k: string) {
  const f = failures.get(k);
  return Boolean(f && f.n >= 8 && Date.now() - f.t < 15 * 60_000);
}
function noteFail(k: string) {
  const f = failures.get(k);
  if (!f || Date.now() - f.t > 15 * 60_000) failures.set(k, { n: 1, t: Date.now() });
  else f.n += 1;
}

/* ------------------------------------------------------------------ POST */

export async function authPost(req: NextRequest, action: string) {
  if (!hasDb()) return json({ error: 'База ещё не подключена' }, 503);
  let body: any = {};
  try { body = await req.json(); } catch { /* пустое тело */ }

  if (action === 'register') {
    const username = normUsername(body.username);
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 80);
    if (!USERNAME_RE.test(username)) {
      return json({ error: 'Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или подчёркивание' }, 400);
    }
    if (password.length < 8) return json({ error: 'Пароль — не короче 8 символов' }, 400);
    if (!name) return json({ error: 'Укажи имя' }, 400);
    const exists = await one`select 1 from bc_users where username = ${username}`;
    if (exists) return json({ error: 'Такой логин уже занят' }, 409);
    const id = newId();
    await db`insert into bc_users (id, username, pass_hash, name) values (${id}, ${username}, ${hashPassword(password)}, ${name})`;
    const res = json({ ok: true });
    res.cookies.set(sessionCookie(id, host(req)));
    return res;
  }

  if (action === 'login') {
    const username = normUsername(body.username);
    const password = String(body.password || '');
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const k = `${ip}|${username}`;
    if (tooMany(k)) return json({ error: 'Слишком много попыток. Подожди 15 минут' }, 429);
    const u = await one<{ id: string; pass_hash: string | null }>`select id, pass_hash from bc_users where username = ${username}`;
    if (!u || !checkPassword(password, u.pass_hash)) {
      noteFail(k);
      return json({ error: 'Неверный логин или пароль' }, 401);
    }
    const res = json({ ok: true });
    res.cookies.set(sessionCookie(u.id, host(req)));
    return res;
  }

  return json({ error: 'Неизвестное действие' }, 404);
}

/* ------------------------------------------------------------------- GET */

export async function authGet(req: NextRequest, action: string) {

  if (action === 'logout') {
    const res = NextResponse.redirect(new URL('/login', origin(req)));
    res.cookies.set(clearedCookie(host(req)));
    return res;
  }

  if (!hasDb()) return fail(req, 'База ещё не подключена');

  /* ---------------- Google ---------------- */
  if (action === 'google') {
    const id = process.env.GOOGLE_CLIENT_ID;
    if (!id || !process.env.GOOGLE_CLIENT_SECRET) return fail(req, 'Вход через Google ещё не настроен');
    const state = randomBytes(16).toString('hex');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', id);
    url.searchParams.set('redirect_uri', `${origin(req)}/api/auth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    const res = NextResponse.redirect(url);
    res.cookies.set({ name: 'tz_oauth', value: sign({ s: state, e: Date.now() + 10 * 60_000 }), httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
    return res;
  }

  if (action === 'google/callback') {
    const st = verify<{ s: string }>(req.cookies.get('tz_oauth')?.value);
    const code = req.nextUrl.searchParams.get('code');
    if (!st || st.s !== req.nextUrl.searchParams.get('state') || !code) return fail(req, 'Вход через Google не удался, попробуй ещё раз');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${origin(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.id_token) return fail(req, 'Google не подтвердил вход');
    // id_token получен напрямую от Google по TLS, поэтому достаточно прочитать его содержимое
    const claims = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64url').toString('utf8'));
    const sub = String(claims.sub || '');
    const email = claims.email_verified ? String(claims.email || '').toLowerCase() : null;
    const name = String(claims.name || claims.given_name || '').slice(0, 80);
    if (!sub) return fail(req, 'Google не подтвердил вход');

    const me = await currentUser();
    const owner = await one<{ id: string }>`select id from bc_users where google_sub = ${sub}`;
    if (me) {
      if (owner && owner.id !== me.id) return NextResponse.redirect(new URL('/settings?error=google-taken', origin(req)));
      await db`update bc_users set google_sub = ${sub}, email = coalesce(email, ${email}) where id = ${me.id}`;
      return NextResponse.redirect(new URL('/settings?linked=google', origin(req)));
    }
    if (owner) return login(req, owner.id);
    const byEmail = email ? await one<{ id: string }>`select id from bc_users where email = ${email}` : null;
    if (byEmail) {
      await db`update bc_users set google_sub = ${sub} where id = ${byEmail.id}`;
      return login(req, byEmail.id);
    }
    const id = newId();
    await db`insert into bc_users (id, name, email, google_sub) values (${id}, ${name || 'Ученик'}, ${email}, ${sub})`;
    return login(req, id);
  }

  /* ---------------- Telegram ---------------- */
  if (action === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return fail(req, 'Вход через Telegram ещё не настроен');
    const p = Object.fromEntries(req.nextUrl.searchParams.entries());
    const hash = p.hash;
    delete p.hash;
    const check = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('\n');
    const secret = createHash('sha256').update(token).digest();
    const good = createHmac('sha256', secret).update(check).digest('hex');
    const fresh = Date.now() / 1000 - Number(p.auth_date || 0) < 86_400;
    if (!hash || good !== hash || !fresh) return fail(req, 'Telegram не подтвердил вход');
    const tgId = String(p.id);
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').slice(0, 80);

    const me = await currentUser();
    const owner = await one<{ id: string }>`select id from bc_users where tg_id = ${tgId}`;
    if (me) {
      if (owner && owner.id !== me.id) return NextResponse.redirect(new URL('/settings?error=telegram-taken', origin(req)));
      await db`update bc_users set tg_id = ${tgId}, tg_username = ${p.username || null} where id = ${me.id}`;
      return NextResponse.redirect(new URL('/settings?linked=telegram', origin(req)));
    }
    if (owner) {
      await db`update bc_users set tg_username = ${p.username || null} where id = ${owner.id}`;
      return login(req, owner.id);
    }
    const id = newId();
    await db`insert into bc_users (id, name, tg_id, tg_username) values (${id}, ${name || 'Ученик'}, ${tgId}, ${p.username || null})`;
    return login(req, id);
  }

  return json({ error: 'Не найдено' }, 404);
}
