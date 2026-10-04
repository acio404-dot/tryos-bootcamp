import Link from 'next/link';
import Shell from '@/components/Shell';
import ModeCards from '@/components/ModeCards';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { hhmm } from '@/lib/bank-types';
import { navStats } from '@/lib/nav';
import { openExamRun } from '@/lib/runs';
import { dateRu } from '@/lib/format';
import { practiceAccess } from '@/lib/staff';
import { Ico } from '@/components/icons';
import { SHIFT_SIZE } from '@/lib/set-types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Режимы' };

/* «Режимы» — все способы решать задачи в одном месте: вкладка нижней панели на телефоне. */
export default async function Practice() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [stats, open, access] = await Promise.all([
    navStats(user.id, student?.id), openExamRun(user.id), practiceAccess(user, student),
  ]);

  return (
    <Shell user={user} student={student} active="practice">
      <div className="top">
        <div>
          <h1>Режимы</h1>
          <p className="m-hide">Смена на сегодня, выживание на время, пробник с таймером, тренажёр по темам и работа над ошибками.</p>
        </div>
      </div>

      {open ? (
        <div className="card resume">
          <div>
            <b>Незаконченный пробник: {open.title}</b>
            <i>начат {dateRu(open.started_at, true)} · {hhmm(open.minutes)} на всё</i>
          </div>
          <Link className="btn btn-dark" href={`/exam/${open.id}`}>Продолжить</Link>
        </div>
      ) : null}

      <Link className="rowlink shift-row" href="/shift">
        <Ico name="shift" />
        <span className="txt">
          <b>Смена на сегодня</b>
          <i>{stats.shift.state === 'open' ? `идёт: задача ${stats.shift.cur + 1} из ${stats.shift.total}` : stats.shift.state === 'done' ? 'закрыта · можно ещё одну' : `${SHIFT_SIZE} задач, которые собрала платформа`}</i>
        </span>
        <span className="act">{stats.shift.state === 'open' ? 'Продолжить →' : stats.shift.state === 'done' ? 'Итоги →' : 'Начать →'}</span>
      </Link>

      <ModeCards mistakes={stats.mistakes} best={stats.best} score={stats.score} lockedMistakes={!can(access, 'trainer')} />
    </Shell>
  );
}
