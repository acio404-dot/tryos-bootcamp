import Link from 'next/link';
import Shell from '@/components/Shell';
import ExamStart from '@/components/ExamStart';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { FORMATS, TOTAL_EXAM } from '@/lib/bank';
import { hhmm } from '@/lib/bank-types';
import { examHistory, openExamRun } from '@/lib/runs';
import { dateRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Пробники' };

const FREE = ['quick'];

export default async function Exam() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [history, open] = await Promise.all([examHistory(user.id, 15), openExamRun(user.id)]);

  const allowed = can(student?.access, 'exams');
  const locked = allowed ? [] : FORMATS.map((f) => f.key).filter((k) => !FREE.includes(k));
  const best = history.length ? Math.max(...history.map((h) => h.score)) : 0;

  return (
    <Shell user={user} student={student} active="exam">
      <div className="top">
        <div>
          <h1>Пробники</h1>
          <p>Формат настоящего экзамена с таймером. Балл 0–500 считается по той же формуле,
            что и на сайте: ошибка съедает четверть верного ответа, поэтому наугад отвечать невыгодно.</p>
        </div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/progress">Прогресс</Link>
        </div>
      </div>

      {open ? (
        <div className="card resume mt">
          <div>
            <b>Незаконченный пробник: {open.title}</b>
            <i>начат {dateRu(open.started_at, true)} · {hhmm(open.minutes)} на всё</i>
          </div>
          <Link className="btn btn-primary" href={`/exam/${open.id}`}>Продолжить</Link>
        </div>
      ) : null}

      <div className="tiles mt">
        <div className="tile"><b>{TOTAL_EXAM}</b><i>задач в банке пробников</i></div>
        <div className="tile"><b>{history.length}</b><i>пройдено пробников</i></div>
        <div className="tile"><b>{best || '—'}</b><i>лучший балл</i></div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Выбери формат</h2>
          {!allowed ? <span className="note" style={{ margin: 0 }}>полные форматы открывает школа</span> : null}
        </div>
        <ExamStart formats={FORMATS} locked={locked} />
      </div>

      <div className="card mt">
        <div className="card-head"><h2>История</h2></div>
        {history.length ? (
          <table className="tbl">
            <thead><tr><th>Дата</th><th>Формат</th><th className="num hide-m">Верно / неверно / пусто</th><th className="num">Балл</th><th /></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{dateRu(h.at, false)}</td>
                  <td>{h.title}</td>
                  <td className="num hide-m">{h.correct} / {h.wrong} / {h.blank}</td>
                  <td className="num score">{h.score}</td>
                  <td className="num"><Link className="back" href={`/exam/${h.id}/result`}>разбор</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Пройденных пробников пока нет.</p>
        )}
      </div>
    </Shell>
  );
}
