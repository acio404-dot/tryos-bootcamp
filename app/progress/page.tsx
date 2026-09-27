import Link from 'next/link';
import Shell from '@/components/Shell';
import { tone } from '@/components/widgets';
import { TestsBlock, TopicsBlock } from '@/components/ProgressBlocks';
import { requireUser } from '@/lib/auth';
import { can, examOf, progressOf, scoresOf, studentOfUser } from '@/lib/data';
import { dateRu, plural } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Прогресс' };


export default async function Progress() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [progress, scores] = await Promise.all([
    progressOf(user.id, student?.id),
    student && can(student.access, 'scores') ? scoresOf(student.id) : Promise.resolve([]),
  ]);
  const exam = examOf(user, student);


  return (
    <Shell user={user} student={student} active="progress">
      <div className="top">
        <div><h1>Прогресс</h1><p>Задачи из тренажёра, пробные тесты и оценки преподавателей.</p></div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/trainer">Тренажёр</Link>
          <Link className="btn btn-primary" href="/exam">Пробник</Link>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h2>Пробные тесты</h2></div>
          <TestsBlock tests={progress.tests} target={exam?.target ?? null} />
        </div>

        <div className="card">
          <div className="card-head"><h2>Оценки преподавателей</h2></div>
          {!student ? (
            <p className="muted" style={{ margin: 0 }}>Видны после привязки ID ученика.</p>
          ) : !can(student.access, 'scores') ? (
            <p className="muted" style={{ margin: 0 }}>В твоём уровне доступа этот раздел закрыт.</p>
          ) : scores.length ? (
            <ul className="list">
              {scores.map((s) => {
                const pct = Math.round((s.value / s.max) * 100);
                return (
                  <li key={s.id}>
                    <span className="txt"><b>{s.title}</b><i>{s.teacher ? `${s.teacher} · ` : ''}{dateRu(s.date, false)}</i></span>
                    <span className={`pct ${tone(pct)}`}>{s.value} / {s.max}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Оценок пока нет.</p>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Точность по темам</h2>
          <span className="note" style={{ margin: 0 }}>
            {progress.monthTotal ? `за 30 дней: ${progress.monthTotal} ${plural(progress.monthTotal, 'задача', 'задачи', 'задач')}` : 'по тренажёру и тестам'}
          </span>
        </div>
        <TopicsBlock
          topics={progress.topics}
          empty={(
            <div className="empty-card" style={{ padding: '14px 0' }}>
              <p>Здесь появится точность по каждой теме, когда начнёшь решать задачи в тренажёре.</p>
              <Link className="btn btn-primary" href="/trainer">Открыть тренажёр</Link>
            </div>
          )}
        />
      </div>
    </Shell>
  );
}
