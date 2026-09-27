import { NextResponse, type NextRequest } from 'next/server';
import { runReminders } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
 * Напоминания в Telegram. Вызывать раз в 10–15 минут (GitHub Actions,
 * cron-job.org или Vercel Cron) с заголовком Authorization: Bearer CRON_SECRET
 * или с ?key=CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET не задан' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  const key = req.nextUrl.searchParams.get('key') || '';
  if (auth !== `Bearer ${secret}` && key !== secret) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN не задан' }, { status: 503 });
  const r = await runReminders();
  return NextResponse.json({ ok: true, sent: r.sent, skipped: r.skipped, blocked: r.blocked, failed: r.failed });
}

export const GET = handle;
export const POST = handle;
