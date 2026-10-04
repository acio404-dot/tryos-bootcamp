import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { checkAnswer, itemById, survivalPick, toPublic } from '@/lib/bank';
import { publicShadow } from '@/lib/shadows';
import {
  applySurvivalAnswer, claimSurvivalAnswer, createSurvival, endSurvival, recordAttempt, setSurvivalCurrent,
  survivalRun, SURVIVAL_GRACE, SURVIVAL_LIVES, SURVIVAL_SECONDS, type Survival,
} from '@/lib/runs';
import { solvedToday, streakUpdate } from '@/lib/streak';

export const dynamic = 'force-dynamic';

/** Сколько последних тем не повторяем: одна и та же тень не выходит несколько задач подряд. */
const RECENT_TOPICS = 6;

/** Выдать следующую задачу (и её тень) и запомнить задачу на сервере. */
async function nextQuestion(runId: string, streak: number, seen: string[]) {
  const recent = seen.slice(-RECENT_TOPICS).map((id) => itemById(id)?.topic).filter(Boolean) as string[];
  const item = survivalPick(streak, new Set(seen), recent);
  if (!item) return { question: null, shadow: null };
  const keep = [...seen, item.id].slice(-400);
  await setSurvivalCurrent(runId, item.id, keep);
  return { question: toPublic(item), shadow: publicShadow(item.topic) };
}

/*
 * Режим выживания. Серия, лампочки и время на задачу считаются на сервере:
 * иначе таблицу недели можно было бы нарисовать прямо из браузера.
 *
 * POST { action: 'start' }                               → новая серия и первая задача
 * POST { action: 'answer', id, qid, chosen | timeout }   → вердикт и состояние серии
 * POST { action: 'next', id }                            → следующая задача (часы идут с этого момента)
 * POST { action: 'end', id }                             → закончить серию досрочно
 *
 * Следующая задача выдаётся отдельным запросом, а не вместе с вердиктом:
 * пока ученик читает разбор, новой задачи у него ещё нет, и решать её «вне
 * времени» нельзя. Ответ привязан к задаче (qid): запоздавший повтор не
 * попадёт на следующую.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Сначала войди' }, { status: 401 });

  let body: { action?: unknown; id?: unknown; qid?: unknown; chosen?: unknown; timeout?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
  }
  const runId = String(body.id || '');

  /** Состояние серии для браузера, который разошёлся с сервером. */
  const stateOf = (run: Survival) => {
    const item = run.alive && run.cur_id ? itemById(run.cur_id) : undefined;
    return {
      streak: run.streak, best: run.best, lives: run.lives, alive: run.alive, n: run.asked,
      question: item ? toPublic(item) : null,
      shadow: item ? publicShadow(item.topic) : null,
    };
  };

  if (body.action === 'start') {
    const run = await createSurvival(user.id);
    const next = await nextQuestion(run.id, 0, []);
    return NextResponse.json({
      id: run.id, streak: 0, best: 0, lives: SURVIVAL_LIVES, alive: true, n: 1, ...next,
      seconds: SURVIVAL_SECONDS,
    });
  }

  // старые открытые вкладки ещё шлют «shown»; часы теперь идут с выдачи задачи
  if (body.action === 'shown') return NextResponse.json({ ok: true });

  if (body.action === 'end') {
    const run = await survivalRun(user.id, runId);
    if (!run) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
    await endSurvival(user.id, run.id);
    return NextResponse.json({ streak: run.streak, best: run.best, lives: run.lives, alive: false });
  }

  if (body.action === 'next') {
    const run = await survivalRun(user.id, runId);
    if (!run) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
    if (!run.alive) return NextResponse.json({ error: 'Серия уже закончилась', state: stateOf(run) }, { status: 409 });
    // задача уже выдана (повторный запрос после обрыва связи) — отдаём её же
    if (run.cur_id) return NextResponse.json(stateOf(run));
    const next = await nextQuestion(run.id, run.streak, run.seen);
    return NextResponse.json({ streak: run.streak, best: run.best, lives: run.lives, alive: true, n: run.asked + 1, ...next });
  }

  if (body.action === 'answer') {
    // Вкладка, открытая до обновления сайта, не присылает qid и ждёт следующую задачу вместе с вердиктом.
    const legacy = typeof body.qid !== 'string';
    let qid = legacy ? '' : String(body.qid);
    if (legacy) {
      const cur = await survivalRun(user.id, runId);
      if (!cur) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
      qid = cur.cur_id || '';
    }
    const run = qid ? await claimSurvivalAnswer(user.id, runId, qid) : null;
    if (!run) {
      // серии нет, она закончилась, или ответ на эту задачу уже принят
      const cur = await survivalRun(user.id, runId);
      if (!cur) return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 });
      return NextResponse.json({
        error: cur.alive ? 'Ответ на эту задачу уже принят' : 'Серия уже закончилась', state: stateOf(cur),
      }, { status: 409 });
    }

    // Время вышло: браузер сообщил сам, или ответ пришёл позже 90 секунд.
    const late = typeof run.elapsed === 'number' && run.elapsed > SURVIVAL_SECONDS + SURVIVAL_GRACE;
    const chosen = typeof body.chosen === 'number' && body.chosen >= 0 && body.chosen <= 4 ? body.chosen : -1;
    // ответ без варианта считаем просроченным: задача уже забрана, вернуть её нельзя
    const timedOut = body.timeout === true || late || chosen < 0;

    const v = checkAnswer(qid, timedOut ? 0 : chosen);
    if (!v) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
    const ok = !timedOut && v.isCorrect;

    const before = await solvedToday(user.id);
    const seconds = typeof run.elapsed === 'number' ? Math.min(SURVIVAL_SECONDS, Math.max(0, Math.round(run.elapsed * 10) / 10)) : null;
    await recordAttempt(
      user.id,
      { id: qid, topic: v.topic, topicLabel: v.topicLabel, section: v.section },
      ok,
      'survival',
      seconds,
    );

    const after = await applySurvivalAnswer(run, ok, { id: qid, topic: v.topic, timedOut });
    const next = legacy && after.alive ? await nextQuestion(after.id, after.streak, after.seen) : {};

    return NextResponse.json({
      verdict: { correct: v.correct, isCorrect: ok, explanation: v.explanation, timedOut },
      streak: after.streak,
      best: after.best,
      lives: after.lives,
      alive: after.alive,
      ...next,
      streakUp: await streakUpdate(user.id, before),
    });
  }

  return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
}
