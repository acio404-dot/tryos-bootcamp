/*
 * Бот Telegram: отправка сообщений и вебхук. Токен — TELEGRAM_BOT_TOKEN
 * (тот же бот, что и для входа через Telegram), имя — TELEGRAM_BOT_NAME.
 */

import { createHmac } from 'node:crypto';

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const api = (method: string) => `${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${token()}/${method}`;

export const botName = () => (process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_NAME || '' : '');
export const botReady = () => Boolean(token() && botName());

/** Секрет, который Telegram присылает в заголовке вебхука. Выводится из токена. */
export const webhookSecret = () => createHmac('sha256', token()).update('tryos-webhook').digest('hex').slice(0, 48);

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type SendResult = 'ok' | 'blocked' | 'error';

/** Сообщение в HTML-разметке Telegram; buttons — ссылки под сообщением. */
export async function sendMessage(chatId: string | number, html: string, buttons: { text: string; url: string }[] = []): Promise<SendResult> {
  if (!token()) return 'error';
  try {
    const r = await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
      }),
    });
    if (r.ok) return 'ok';
    // 403 — пользователь не нажал Start или заблокировал бота
    return r.status === 403 || r.status === 400 ? 'blocked' : 'error';
  } catch {
    return 'error';
  }
}

export async function setWebhook(url: string): Promise<{ ok: boolean; description?: string }> {
  if (!token()) return { ok: false, description: 'TELEGRAM_BOT_TOKEN не задан' };
  const r = await fetch(api('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: webhookSecret(), allowed_updates: ['message'] }),
  }).catch(() => null);
  if (!r) return { ok: false, description: 'Telegram не ответил' };
  return r.json().catch(() => ({ ok: false, description: 'Непонятный ответ Telegram' }));
}

export async function webhookInfo(): Promise<{ url: string; pending: number; error: string | null } | null> {
  if (!token()) return null;
  const r = await fetch(api('getWebhookInfo'), { signal: AbortSignal.timeout(4000) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (!j?.ok) return null;
  return { url: j.result.url || '', pending: j.result.pending_update_count || 0, error: j.result.last_error_message || null };
}
