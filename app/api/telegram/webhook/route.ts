import { NextResponse, type NextRequest } from 'next/server';
import { db, one } from '@/lib/db';
import { esc, sendMessage, webhookSecret } from '@/lib/telegram';
import { SITE } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * Вебхук бота. /start КОД — привязать чат к аккаунту (код выдаёт
 * «Настройки → Напоминания в Telegram»), /stop — отключить напоминания.
 */
export async function POST(req: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN || req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const upd = await req.json().catch(() => null);
  const msg = upd?.message;
  const chat = msg?.chat;
  const text: string = String(msg?.text || '').trim();
  if (!chat?.id || chat.type !== 'private') return NextResponse.json({ ok: true });
  const site = SITE();
  const open = [{ text: 'Открыть кабинет', url: `${site}/` }];

  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] || '';
    const link = code
      ? await one<{ user_id: string }>`delete from bc_tg_links where code = ${code} and created_at > now() - interval '1 day' returning user_id`
      : null;
    if (!link) {
      await sendMessage(chat.id,
        'Привет! Это бот TR-YÖS Zone Bootcamp — напоминания о занятиях, сроках и стрике.\n\n'
        + 'Чтобы подключить напоминания, открой кабинет → <b>Настройки</b> → «Напоминания в Telegram» → «Подключить».',
        [{ text: 'Открыть настройки', url: `${site}/settings#notify` }]);
      return NextResponse.json({ ok: true });
    }
    // этот чат мог быть привязан к другому аккаунту — отвязываем
    await db`update bc_users set tg_chat_id = null where tg_chat_id = ${String(chat.id)} and id <> ${link.user_id}`;
    const u = await one<{ name: string }>`update bc_users set tg_chat_id = ${String(chat.id)}, notify = '{}'::jsonb where id = ${link.user_id} returning name`;
    await sendMessage(chat.id,
      `Готово, ${esc(u?.name?.split(' ')[0] || 'привет')}! Напоминания подключены ✅\n\n`
      + 'Буду писать за час до занятия (со ссылкой), за сутки до срока сдачи и вечером, если стрик под угрозой. '
      + 'Что присылать — выбирается в настройках кабинета. Отключить всё — /stop.', open);
    return NextResponse.json({ ok: true });
  }

  if (text === '/stop') {
    const n = await db`update bc_users set notify = notify || '{"lessons":false,"deadlines":false,"streak":false}'::jsonb
      where tg_chat_id = ${String(chat.id)} or tg_id = ${String(chat.id)} returning id`;
    await sendMessage(chat.id, n.length
      ? 'Напоминания выключены. Включить снова — в настройках кабинета.'
      : 'Этот чат не привязан к кабинету.', [{ text: 'Настройки', url: `${site}/settings#notify` }]);
    return NextResponse.json({ ok: true });
  }

  await sendMessage(chat.id, 'Я присылаю напоминания о занятиях, сроках и стрике. Настроить — в кабинете.', open);
  return NextResponse.json({ ok: true });
}
