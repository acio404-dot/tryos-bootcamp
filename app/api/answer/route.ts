import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { answerAndRecord, type Mode } from '@/lib/runs';
import { can, studentOfUser } from '@/lib/data';
import { solvedToday, streakUpdate } from '@/lib/streak';
import { practiceAccess } from '@/lib/staff';
import { practiceItem } from '@/lib/bank';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MODES: Mode[] = ['practice', 'mistakes', 'survival'];

/** Проверка ответа в тренажёре: правильный вариант, разбор и запись попытки. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Сначала войди' }, { status: 401 });

  let body: { id?: unknown; chosen?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const chosen = typeof body.chosen === 'number' ? body.chosen : -1;
  const mode = (MODES as string[]).includes(String(body.mode)) ? (body.mode as Mode) : 'practice';
  if (!id || chosen < 0 || chosen > 4) return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });

  if (mode === 'mistakes') {
    const student = await studentOfUser(user.id);
    if (!can(await practiceAccess(user, student), 'trainer')) return NextResponse.json({ error: 'Работа над ошибками открыта ученикам школы' }, { status: 403 });
  }

  // Задачи пробников здесь проверяются только в работе над ошибками, то есть после того,
  // как ученик уже сдал пробник с этой задачей. Иначе ответы идущего пробника можно было бы узнать отсюда.
  if (!practiceItem(id)) {
    const met = await one`select 1 from bc_attempts where user_id = ${user.id} and question_id = ${id} limit 1`;
    if (!met) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
  }

  const before = await solvedToday(user.id);
  const v = await answerAndRecord(user.id, id, chosen, mode);
  if (!v) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });

  return NextResponse.json({
    correct: v.correct, isCorrect: v.isCorrect, explanation: v.explanation,
    streakUp: await streakUpdate(user.id, before),
  });
}
