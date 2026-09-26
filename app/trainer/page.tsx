import Link from 'next/link';
import Shell from '@/components/Shell';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { CATALOG, TOTAL_PRACTICE, TOTAL_TOPICS } from '@/lib/bank';
import { plural, sourceLine } from '@/lib/bank-types';
import { mistakeCount } from '@/lib/runs';
import { IArrow, IBrain, ILock, ISigma, ITarget } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Тренажёр' };

export default async function Trainer() {
  const user = await requireUser();
  const [student, mistakes] = await Promise.all([studentOfUser(user.id), mistakeCount(user.id)]);
  const open = can(student?.access, 'trainer');

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
            {open ? null : <ILock />}Работа над ошибками{open && mistakes ? ` · ${mistakes}` : ''}
          </Link>
          <Link className="btn btn-primary" href="/exam">Пробники</Link>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><b>{TOTAL_TOPICS}</b><i>тем по трём учебникам</i></div>
        <div className="tile"><b>{TOTAL_PRACTICE}</b><i>задач с разбором</i></div>
        <div className="tile"><b>{mistakes}</b><i>{plural(mistakes, 'задача ждёт', 'задачи ждут', 'задач ждут')} в работе над ошибками</i></div>
      </div>

      {CATALOG.map((g) => {
        const Icon = g.key === 'iq' ? IBrain : g.key === 'algebra' ? ISigma : ITarget;
        return (
          <div className={`card mt sec sec-${g.key}`} key={g.key}>
            <div className="card-head sec-head">
              <span className="sec-ico"><Icon /></span>
              <h2>{g.label}</h2>
              <span className="note" style={{ margin: 0 }}>{g.book} · {g.topics.length} тем</span>
            </div>
            <Link className="topic-row mix" href={`/trainer/mix-${g.key}`}>
              <span className="txt"><b>Все темы вперемешку</b><i>по одной задаче из каждой темы раздела</i></span>
              <span className="go-ico"><IArrow /></span>
            </Link>
            <div className="topic-list">
              {g.topics.map((t) => (
                <Link className="topic-row" key={t.key} href={`/trainer/${t.key}`}>
                  <span className="txt"><b>{t.label}</b><i>{sourceLine(t)}</i></span>
                  {open ? <span className="st">{t.count}</span> : <span className="st lock-st"><ILock />школа</span>}
                  <span className="go-ico"><IArrow /></span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
