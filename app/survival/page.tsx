import Shell from '@/components/Shell';
import SurvivalFlow from '@/components/SurvivalFlow';
import { requireUser } from '@/lib/auth';
import { studentOfUser } from '@/lib/data';
import { myBestSurvival, survivalBoard } from '@/lib/runs';
import { dateRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Режим выживания' };

export default async function Survival() {
  const user = await requireUser();
  const [student, best, board] = await Promise.all([
    studentOfUser(user.id),
    myBestSurvival(user.id),
    survivalBoard(user.id, 20),
  ]);

  const myPlace = board.findIndex((r) => r.me) + 1;

  return (
    <Shell user={user} student={student} active="survival">
      <div className="top">
        <div>
          <h1>Режим выживания</h1>
          <p>Задачи без конца, три жизни, серия растёт с каждым верным ответом.
            После пятого подряд чаще идут математика и геометрия — там дольше считать.</p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><b>{best || '—'}</b><i>твоя лучшая серия</i></div>
        <div className="tile"><b>{myPlace || '—'}</b><i>место в таблице</i></div>
        <div className="tile"><b>{board.length ? board[0].best : '—'}</b><i>рекорд школы</i></div>
      </div>

      <div className="grid g-2 mt">
        <div>
          <SurvivalFlow myBest={best} />
        </div>

        <div className="card">
          <div className="card-head"><h2>Таблица лидеров</h2><span className="note" style={{ margin: 0 }}>по лучшей серии</span></div>
          {board.length ? (
            <table className="tbl">
              <thead><tr><th>#</th><th>Ученик</th><th className="num">Серия</th></tr></thead>
              <tbody>
                {board.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className={r.me ? 'is-me' : undefined}>
                    <td><span className={`place${i < 3 ? ` m${i + 1}` : ''}`}>{i + 1}</span></td>
                    <td>{r.name}{r.me ? ' · ты' : ''}</td>
                    <td className="num score">{r.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Пока никто не сыграл. Будь первым.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}
