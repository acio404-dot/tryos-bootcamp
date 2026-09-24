import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import ExamReview from '@/components/ExamReview';
import { requireUser } from '@/lib/auth';
import { examOf, studentOfUser } from '@/lib/data';
import { gradeExam, itemById } from '@/lib/bank';
import { plural } from '@/lib/bank-types';
import { examRun } from '@/lib/runs';
import { dateRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Результат пробника' };

const LETTERS = 'ABCDE';

export default async function Result({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const run = await examRun(user.id, params.id);
  if (!run) notFound();
  if (!run.finished_at) redirect(`/exam/${run.id}`);

  const student = await studentOfUser(user.id);
  const exam = examOf(user, student);
  const res = gradeExam(run.ids, run.answers);
  const target = exam?.target ?? null;

  const review = run.ids.map((id, i) => {
    const q = itemById(id);
    if (!q) return null;
    const chosen = run.answers[i] ?? null;
    return {
      n: i + 1,
      id,
      topicLabel: q.topicLabel,
      section: q.section,
      text: q.text,
      options: q.options,
      figure: q.figure,
      explanation: q.explanation,
      correct: q.correct,
      chosen,
      state: chosen === null ? 'blank' : chosen === q.correct ? 'ok' : 'bad',
    };
  }).filter(Boolean) as any[];

  return (
    <Shell user={user} student={student} active="exam">
      <div className="top">
        <div>
          <span className="eyebrow">{run.title} · {dateRu(run.finished_at, false)}</span>
          <h1>Балл {res.score}</h1>
          <p>
            {target
              ? res.score >= target
                ? `Цель ${target} взята. Держи темп и не теряй разделы, где пока проседает точность.`
                : `До цели ${target} осталось ${target - res.score} ${plural(target - res.score, 'балл', 'балла', 'баллов')}.`
              : 'Балл считается по формуле экзамена: каждая ошибка съедает четверть верного ответа.'}
          </p>
        </div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/mistakes">Работа над ошибками</Link>
          <Link className="btn btn-primary" href="/exam">Ещё пробник</Link>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><b>{res.iq.correct} / {res.iq.total}</b><i>логика · точность {res.iq.accuracyPct} %</i></div>
        <div className="tile"><b>{res.math.correct} / {res.math.total}</b><i>математика · точность {res.math.accuracyPct} %</i></div>
        <div className="tile"><b>{res.iq.wrong + res.math.wrong}</b><i>ошибок · минус {((res.iq.wrong + res.math.wrong) * 0.25).toFixed(2)} верных</i></div>
        <div className="tile"><b>{res.iq.blank + res.math.blank}</b><i>пропущено</i></div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><h2>Что просело</h2></div>
          {res.weak.length ? (
            <ul className="list">
              {res.weak.map((w) => (
                <li key={w.topic}>
                  <span className="txt"><b>{w.label}</b><i>{w.correct} из {w.total} верно</i></span>
                  <Link className="st" href={`/trainer/${w.topic}`}>порешать</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Слабых тем в этом варианте нет — везде 60 % и выше.</p>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Что получается</h2></div>
          {res.strong.length ? (
            <ul className="list">
              {res.strong.map((w) => (
                <li key={w.topic}>
                  <span className="txt"><b>{w.label}</b><i>{w.correct} из {w.total} верно</i></span>
                  <span className="st good">ок</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Пока нет темы, где больше 80 % верных ответов.</p>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Разбор всех задач</h2>
          <span className="note" style={{ margin: 0 }}>зелёная — верно, красная — ошибка, серая — пропуск</span>
        </div>
        <ExamReview items={review} letters={LETTERS} />
      </div>
    </Shell>
  );
}
