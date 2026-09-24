import Link from 'next/link';
import Shell from '@/components/Shell';
import { requireUser } from '@/lib/auth';
import { studentOfUser } from '@/lib/data';
import { CATALOG, TOTAL_PRACTICE, TOTAL_TOPICS } from '@/lib/bank';
import { plural, sourceLine } from '@/lib/bank-types';
import { mistakeCount } from '@/lib/runs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Тренажёр' };

export default async function Trainer() {
  const user = await requireUser();
  const [student, mistakes] = await Promise.all([studentOfUser(user.id), mistakeCount(user.id)]);

  return (
    <Shell user={user} student={student} active="trainer">
      <div className="top">
        <div>
          <h1>Тренажёр</h1>
          <p>Темы идут в том же порядке, что в учебниках Galata. Задачи по одной: выбери ответ,
            нажми «Проверить» — и сразу увидишь правильный вариант и разбор.</p>
        </div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/mistakes">
            Работа над ошибками{mistakes ? ` · ${mistakes}` : ''}
          </Link>
          <Link className="btn btn-primary" href="/exam">Пробники</Link>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><b>{TOTAL_TOPICS}</b><i>тем по трём учебникам</i></div>
        <div className="tile"><b>{TOTAL_PRACTICE}</b><i>задач с разбором</i></div>
        <div className="tile"><b>{mistakes}</b><i>{plural(mistakes, 'задача ждёт', 'задачи ждут', 'задач ждут')} в работе над ошибками</i></div>
      </div>

      {CATALOG.map((g) => (
        <div className="card mt" key={g.key}>
          <div className="card-head">
            <h2>{g.label}</h2>
            <span className="note" style={{ margin: 0 }}>{g.book}</span>
          </div>
          <Link className="topic-row mix" href={`/trainer/mix-${g.key}`}>
            <span className="txt"><b>Все темы вперемешку</b><i>по одной задаче из каждой темы раздела</i></span>
            <span className="st">→</span>
          </Link>
          <div className="topic-list">
            {g.topics.map((t) => (
              <Link className="topic-row" key={t.key} href={`/trainer/${t.key}`}>
                <span className="txt"><b>{t.label}</b><i>{sourceLine(t)}</i></span>
                <span className="st">{t.count}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  );
}
