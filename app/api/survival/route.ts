import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { checkAnswer, survivalPick, toPublic } from '@/lib/bank';
import {
  applySurvivalAnswer, createSurvival, endSurvival, markSurvivalShown, recordAttempt, setSurvivalCurrent,
  survivalRun, SURVIVAL_GRACE, SURVIVAL_LIVES, SURVIVAL_SECONDS,
} from '@/lib/runs';
import { solvedToday, streakUpdate } from '@/lib/streak';

export const dynamic = 'force-dynamic';

/** Выдать следующую задачу и запомнить её на сервере. */
async function nextQuestion(runId: string, streak: number, seen: string[]) {
  const item = survivalPick(streak, new Set(seen));
  if (!item) return null;
  const keep = [...seen, item.id].slice(-400);
  await setSurvivalCurrent(runId, item.id, keep);
  return toPublic(item);
}

/*
 * Режим выживания. Серия, жизни и время на задачу считаются на сервере:
 * иначе таблицу лидеров можно было бы нарисовать прямо из браузера.
 *
 * POST { action: 'start' }                          → новая серия и первая задача
 * POST { action: 'shown', id }                      → ученик увидел задачу, пошли 90 секунд
 * POST { action: 'answer', id, chosen | timeout }   → вердикт, серия и следующая задача
 * POST { action: 'end', id }                        → закончить серию досрочно
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Сначала войди' }, { status: 401 });

  let body: { action?: unknown; id?: unknown; chosen?: unknown; timeout?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
  }

  if (body.action === 'start') {
    const run = await createSurvival(user.id);
    const q = await nextQuestion(run.id, 0, []);
    return NextResponse.json({
      id: run.id, streak: 0, best: 0, lives: SURVIVAL_LIVES, alive: true, asked: 1, question: q,
      seconds: SURVIVAL_SECONDS,
    });
  }

  if (body.action === 'shown') {
    await markSurvivalShown(user.id, String(body.id || ''));
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'end') {
    const run = await survivalRun(user.id, String(body.id || ''));
    if (!run) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
    await endSurvival(user.id, run.id);
    return NextResponse.json({ streak: run.streak, best: run.best, lives: run.lives, alive: false });
  }

  if (body.action === 'answer') {
    const run = await survivalRun(user.id, String(body.id || ''));
    if (!run) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
    if (!run.alive) return NextResponse.json({ error: 'Серия уже закончилась' }, { status: 409 });
    if (!run.cur_id) return NextResponse.json({ error: 'Нет текущей задачи' }, { status: 409 });

    // Время вышло: браузер сообщил сам, или ответ пришёл позже 90 секунд.
    const late = typeof run.elapsed === 'number' && run.elapsed > SURVIVAL_SECONDS + SURVIVAL_GRACE;
    const timedOut = body.timeout === true || late;
    const chosen = typeof body.chosen === 'number' ? body.chosen : -1;
    if (!timedOut && (chosen < 0 || chosen > 4)) return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });

    const v = checkAnswer(run.cur_id, timedOut ? 0 : chosen);
    if (!v) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
    const ok = !timedOut && v.isCorrect;

    const before = await solvedToday(user.id);
    await recordAttempt(
      user.id,
      { id: run.cur_id, topic: v.topic, topicLabel: v.topicLabel, section: v.section },
      ok,
      'survival',
    );

    const after = await applySurvivalAnswer(run, ok);
    const question = after.alive ? await nextQuestion(after.id, after.streak, after.seen) : null;

    return NextResponse.json({
      verdict: { correct: v.correct, isCorrect: ok, explanation: v.explanation, timedOut },
      streak: after.streak,
      best: after.best,
      lives: after.lives,
      alive: after.alive,
      question,
      streakUp: await streakUpdate(user.id, before),
    });
  }

  return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
}
