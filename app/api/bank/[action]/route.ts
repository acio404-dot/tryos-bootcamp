import { NextResponse } from 'next/server';
import {
  QUICK, buildVariant, dailyTask, openByIds, openVerdict, type Composition,
} from '@/lib/public-bank';

export const dynamic = 'force-dynamic';

/*
 * Открытое API банка для сайта tryoszone.com (см. lib/public-bank.ts):
 *
 *   GET  /api/bank/daily    задача дня, без ответа
 *   GET  /api/bank/variant  вариант быстрого теста: ?iq=10&algebra=7&geometry=3
 *   POST /api/bank/items    { ids } → задачи с ответами, чтобы проверить тест
 *   POST /api/bank/check    { id, chosen } → проверка задачи дня
 *
 * Отдаются только задачи тренажёра: их ответы ученик и так видит после
 * проверки. Задачи пробников кабинета сюда не попадают.
 */

type Ctx = { params: { action: string } };

const NO_STORE = { 'Cache-Control': 'no-store' };
const bad = (error = 'Неверный запрос', status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

const count = (v: string | null, fallback: number) => {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 40 ? n : fallback;
};

export async function GET(req: Request, { params }: Ctx) {
  if (params.action === 'daily') {
    const daily = dailyTask();
    if (!daily) return bad('В банке нет задач', 503);
    // Задача меняется в полночь по Стамбулу; CDN держит ответ не дольше пары минут.
    return NextResponse.json(daily, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }
  if (params.action === 'variant') {
    const p = new URL(req.url).searchParams;
    const comp: Composition = {
      iq: count(p.get('iq'), QUICK.iq),
      algebra: count(p.get('algebra'), QUICK.algebra),
      geometry: count(p.get('geometry'), QUICK.geometry),
    };
    return NextResponse.json({ questions: buildVariant(comp) }, { headers: NO_STORE });
  }
  return bad('Нет такого метода', 404);
}

export async function POST(req: Request, { params }: Ctx) {
  if (params.action !== 'items' && params.action !== 'check') return bad('Нет такого метода', 404);
  let body: { ids?: unknown; id?: unknown; chosen?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad();
  }

  if (params.action === 'items') {
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, 80)
      : [];
    if (!ids.length) return bad();
    return NextResponse.json({ questions: openByIds(ids) }, { headers: NO_STORE });
  }

  const id = typeof body?.id === 'string' ? body.id.slice(0, 80) : '';
  const chosen = typeof body?.chosen === 'number' && Number.isInteger(body.chosen) ? body.chosen : -1;
  if (!id || chosen < 0 || chosen > 4) return bad();
  const verdict = openVerdict(id, chosen);
  if (!verdict) return bad('Задача не найдена', 404);
  return NextResponse.json(verdict, { headers: NO_STORE });
}
