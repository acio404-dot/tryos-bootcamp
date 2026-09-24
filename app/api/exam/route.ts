import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { buildExam, formatByKey, gradeExam, itemById } from '@/lib/bank';
import {
  createExamRun, examRun, finishExamRun, openExamRun, recordAttempts, saveExamAnswers,
} from '@/lib/runs';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Форматы, открытые всем: короткая диагностика. Остальные — по доступу. */
const FREE = new Set(['quick']);

/** Клиент шлёт { id задачи: выбранный вариант } — так порядок не съедет. */
const clean = (v: unknown, ids: string[]): (number | null)[] => {
  const map = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return ids.map((qid) => {
    const x = map[qid];
    return typeof x === 'number' && x >= 0 && x <= 4 ? x : null;
  });
};

/*
 * Пробник целиком:
 *   { action: 'start',  format }          → создать вариант
 *   { action: 'save',   id, answers }     → автосохранение
 *   { action: 'finish', id, answers }     → посчитать балл и закрыть
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Сначала войди' }, { status: 401 });

  let body: { action?: unknown; format?: unknown; id?: unknown; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
  }

  if (body.action === 'start') {
    const spec = formatByKey(String(body.format || ''));
    if (!spec) return NextResponse.json({ error: 'Неизвестный формат' }, { status: 400 });

    if (!FREE.has(spec.key)) {
      const student = await studentOfUser(user.id);
      if (!can(student?.access, 'exams')) {
        return NextResponse.json({ error: 'Этот формат открывает школа. Напиши преподавателю.' }, { status: 403 });
      }
    }

    // Незаконченный пробник не бросаем: возвращаем его же.
    const open = await openExamRun(user.id);
    if (open) return NextResponse.json({ id: open.id, resumed: true });

    const items = buildExam(spec);
    if (items.length < spec.iq + spec.math) {
      return NextResponse.json({ error: 'Не хватает задач в банке' }, { status: 500 });
    }
    const id = await createExamRun(user.id, spec.key, spec.title, spec.minutes, items.map((q) => q.id));
    return NextResponse.json({ id });
  }

  const run = await examRun(user.id, String(body.id || ''));
  if (!run) return NextResponse.json({ error: 'Пробник не найден' }, { status: 404 });
  if (run.finished_at) return NextResponse.json({ ok: true, finished: true });

  const answers = clean(body.answers, run.ids);

  if (body.action === 'save') {
    await saveExamAnswers(user.id, run.id, answers);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'finish') {
    const res = gradeExam(run.ids, answers);
    await finishExamRun(user.id, run.id, answers, {
      score: res.score,
      correct: res.iq.correct + res.math.correct,
      wrong: res.iq.wrong + res.math.wrong,
      blank: res.iq.blank + res.math.blank,
    });

    // Попытки — чтобы пробник питал «Прогресс» и работу над ошибками.
    const rows = run.ids.map((id, i) => {
      const q = itemById(id);
      if (!q || answers[i] === null) return null;
      return { id, topic: q.topic, topicLabel: q.topicLabel, section: q.section, correct: answers[i] === q.correct };
    }).filter(Boolean) as { id: string; topic: string; topicLabel: string; section: any; correct: boolean }[];
    await recordAttempts(user.id, rows, 'exam');

    // Строка в общей истории тестов кабинета (её читает «Прогресс»).
    await db`insert into bc_tests (user_id, attempt_id, title, score, correct, wrong, blank, total)
      values (${user.id}, ${run.id}, ${run.title}, ${res.score},
        ${res.iq.correct + res.math.correct}, ${res.iq.wrong + res.math.wrong},
        ${res.iq.blank + res.math.blank}, ${run.ids.length})
      on conflict (attempt_id) do nothing`;

    return NextResponse.json({ ok: true, score: res.score });
  }

  return NextResponse.json({ error: 'Плохой запрос' }, { status: 400 });
}
