'use server';

/*
 * Напоминания в Telegram: подключение, выбор напоминаний, проверка.
 * Для админа — подключение вебхука бота и ручной запуск напоминаний.
 */

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, one } from './db';
import { currentUser, hostOf, isAdmin } from './auth';
import { botName, botReady, sendMessage, setWebhook } from './telegram';
import { NOTIFY, runReminders, type NotifyKind } from './reminders';

export interface NotifyResult { ok?: boolean; error?: string; url?: string; text?: string }

/** Код для ссылки t.me/бот?start=КОД — действует сутки, одноразовый. */
export async function tgConnectLink(): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  if (!botReady()) return { error: 'Бот ещё не настроен — напиши в школу' };
  const code = randomBytes(12).toString('base64url');
  await db`delete from bc_tg_links where user_id = ${u.id} or created_at < now() - interval '1 day'`;
  await db`insert into bc_tg_links (code, user_id) values (${code}, ${u.id})`;
  return { ok: true, url: `https://t.me/${botName()}?start=${code}` };
}

export async function tgDisconnect(): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  await db`update bc_users set tg_chat_id = null,
    notify = notify || '{"lessons":false,"deadlines":false,"streak":false}'::jsonb where id = ${u.id}`;
  revalidatePath('/settings');
  return { ok: true };
}

export async function setNotify(kind: NotifyKind, on: boolean): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  if (!NOTIFY.some((n) => n.key === kind)) return { error: 'Неизвестное напоминание' };
  await db`update bc_users set notify = notify || ${JSON.stringify({ [kind]: Boolean(on) })}::jsonb where id = ${u.id}`;
  revalidatePath('/settings');
  return { ok: true };
}

export async function tgTest(): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u) return { error: 'Сначала войди' };
  const row = await one<{ chat: string | null }>`select coalesce(tg_chat_id, tg_id)::text as chat from bc_users where id = ${u.id}`;
  if (!row?.chat) return { error: 'Telegram не подключён' };
  const r = await sendMessage(row.chat, '👋 Проверка связи: напоминания TR-YÖS Zone приходят сюда.');
  if (r === 'blocked') return { error: 'Бот не может тебе написать: открой бота и нажми «Start», затем попробуй снова' };
  if (r === 'error') return { error: 'Telegram не ответил, попробуй позже' };
  return { ok: true, text: 'Отправлено — проверь Telegram' };
}

/* ---------------------------------------------------------------- админ */

export async function adminConnectWebhook(): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u || !isAdmin(u)) return { error: 'Нет доступа' };
  if (!botReady()) return { error: 'Задай TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_NAME в настройках Vercel' };
  const host = hostOf();
  const r = await setWebhook(`https://${host}/api/telegram/webhook`);
  return r.ok ? { ok: true, text: `Бот подключён к https://${host}` } : { error: r.description || 'Не получилось' };
}

export async function adminRunReminders(): Promise<NotifyResult> {
  const u = await currentUser();
  if (!u || !isAdmin(u)) return { error: 'Нет доступа' };
  if (!botReady()) return { error: 'Бот не настроен' };
  const r = await runReminders();
  return { ok: true, text: `Отправлено ${r.sent}, уже отправлялись ${r.skipped}, не дошло ${r.blocked + r.failed}` };
}
