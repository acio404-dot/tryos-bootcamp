import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { homeworkForStudent } from '@/lib/homework';
import { answerSet, nextInSet, openHomeworkSet, setById, skipMissing, startShift, stateOf, type AnswerResult } from '@/lib/sets';
import { practiceAccess } from '@/lib/staff';
import { solvedToday, streakUpdate } from '@/lib/streak';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/*
 * Смена и домашка: набор задач с подсказкой и второй попыткой.
 *   start-shift               → состояние новой (или незаконченной) смены
 *   open-homework {hw}        → набор задач домашки, создаётся при первом открытии
 *   answer {id, step, chosen} → проверка ответа: подсказка либо итог с разбором
 *   next {id, step}           → следующая задача
 *   state {id}                → текущее состояние (после перезагрузки страницы)
 * step — номер состояния, которое видит ученик. Если на сервере он уже другой
 * (повторный запрос, вторая вкладка), приходит 409 и свежее состояние.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad('Сначала войди', 401);

  let body: { action?: unknown; id?: unknown; step?: unknown; chosen?: unknown; hw?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad('Плохой запрос');
  }
  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';

  if (action === 'start-shift') {
    const student = await studentOfUser(user.id);
    const set = await startShift(user.id, can(await practiceAccess(user, student), 'trainer'));
    if (!set) return bad('Не получилось собрать смену. Попробуй ещё раз.', 500);
    return NextResponse.json({ state: stateOf(set) });
  }

  if (action === 'open-homework') {
    const student = await studentOfUser(user.id);
    const hwId = typeof body.hw === 'string' ? body.hw.slice(0, 40) : '';
    const hw = student && hwId ? await homeworkForStudent(student.id, user.id, hwId) : null;
    if (!hw) return bad('Этой домашки нет или она задана другой группе', 404);
    const set = await openHomeworkSet(user.id, hw);
    if (!set) return bad('В темах этой домашки сейчас нет задач. Напиши учителю.', 422);
    return NextResponse.json({ state: stateOf(set) });
  }

  if (!id) return bad('Плохой запрос');

  if (action === 'state') {
    const set = await setById(user.id, id);
    return set ? NextResponse.json({ state: stateOf(await skipMissing(set)) }) : bad('Набор задач не найден', 404);
  }

  const step = typeof body.step === 'number' && Number.isInteger(body.step) ? body.step : -1;
  if (step < 0) return bad('Плохой запрос');

  let r: AnswerResult;
  let streakUp: Awaited<ReturnType<typeof streakUpdate>> = null;
  if (action === 'answer') {
    const chosen = typeof body.chosen === 'number' && Number.isInteger(body.chosen) ? body.chosen : -1;
    if (chosen < 0 || chosen > 4) return bad('Плохой запрос');
    const before = await solvedToday(user.id);
    r = await answerSet(user.id, id, step, chosen);
    if (r.status === 'ok') streakUp = await streakUpdate(user.id, before);
  } else if (action === 'next') {
    r = await nextInSet(user.id, id, step);
  } else {
    return bad('Плохой запрос');
  }

  if (r.status === 'bad') return bad(r.error, r.error.includes('не найден') ? 404 : 400);
  if (r.status === 'stale') return NextResponse.json({ error: 'Состояние обновилось', state: stateOf(r.set) }, { status: 409 });
  return NextResponse.json({ state: stateOf(r.set), streakUp });
}
