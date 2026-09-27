import Link from 'next/link';
import Shell from '@/components/Shell';
import { SECTION_RU, ScoreChart, tone } from '@/components/widgets';
import { requireUser } from '@/lib/auth';
import { can, examOf, progressOf, scoresOf, studentOfUser } from '@/lib/data';
import { dateRu, plural } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Прогресс' };

const BAR: Record<string, string> = { good: 'var(--green)', mid: 'var(--amber)', low: 'var(--red)' };
const WORD: Record<string, string> = { good: 'уверенно', mid: 'средне', low: 'слабо' };

export default async function Progress() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [progress, scores] = await Promise.all([
    progressOf(user.id, student?.id),
    student && can(student.access, 'scores') ? scoresOf(student.id) : Promise.resolve([]),
  ]);
  const exam = examOf(user, student);

  const bySection: Record<string, typeof progress.topics> = {};
  for (const t of progress.topics) (bySection[t.section || 'other'] ||= []).push(t);
  const order = ['iq', 'algebra', 'geometry', 'other'].filter((k) => bySection[k]?.length);

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
          {progress.tests.length ? (
            <>
              <ScoreChart tests={progress.tests} target={exam?.target ?? null} />
              <table className="tbl mt">
                <thead><tr><th>Дата</th><th>Тест</th><th className="num hide-m">Верно / неверно</th><th className="num">Балл</th></tr></thead>
                <tbody>
                  {progress.tests.slice(0, 15).map((t, i) => (
                    <tr key={i}>
                      <td>{dateRu(t.at, false)}</td>
                      <td>{t.title}{t.source === 'offline' ? <span className="off-tag" title={t.teacher ? `Балл внёс: ${t.teacher}` : 'Балл внесла школа'}>очно</span> : null}</td>
                      <td className="num hide-m">{t.total ? `${t.correct} / ${t.wrong}` : '—'}</td>
                      <td className="num score">{t.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <ScoreChart tests={[]} target={null} />
          )}
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
        {order.length ? (
          <div className="topics">
            {order.map((sec) => (
              <div className="topic-sec" key={sec}>
                <h3>{SECTION_RU[sec] || 'Другое'}</h3>
                {bySection[sec].map((t) => {
                  const pct = Math.round((t.ok / t.total) * 100);
                  const k = tone(pct);
                  return (
                    <div className="topic" key={t.topic}>
                      <span><b>{t.label}</b><i>{t.total} {plural(t.total, 'задача', 'задачи', 'задач')} · {WORD[k]}</i></span>
                      <div className="hbar"><i style={{ width: `${pct}%`, background: BAR[k] }} /></div>
                      <span className="v">{pct} %</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-card" style={{ padding: '14px 0' }}>
            <p>Здесь появится точность по каждой теме, когда начнёшь решать задачи в тренажёре.</p>
            <Link className="btn btn-primary" href="/trainer">Открыть тренажёр</Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
