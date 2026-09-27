import Link from 'next/link';
import Shell from '@/components/Shell';
import ModeCards from '@/components/ModeCards';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { hhmm } from '@/lib/bank-types';
import { mistakeCount, myBestSurvival, openExamRun } from '@/lib/runs';
import { dateRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Решать' };

/* «Решать» — все режимы в одном месте: вкладка нижней панели на телефоне. */
export default async function Practice() {
  const user = await requireUser();
  const [student, mistakes, best, open] = await Promise.all([
    studentOfUser(user.id), mistakeCount(user.id), myBestSurvival(user.id), openExamRun(user.id),
  ]);

  return (
    <Shell user={user} student={student} active="practice">
      <div className="top">
        <div>
          <h1>Решать</h1>
          <p>Выбери режим: пробник с таймером, тренажёр по темам, работу над ошибками или выживание.</p>
        </div>
      </div>

      {open ? (
        <div className="card resume">
          <div>
            <b>Незаконченный пробник: {open.title}</b>
            <i>начат {dateRu(open.started_at, true)} · {hhmm(open.minutes)} на всё</i>
          </div>
          <Link className="btn btn-primary" href={`/exam/${open.id}`}>Продолжить</Link>
        </div>
      ) : null}

      <div className="practice-modes"><ModeCards mistakes={mistakes} best={best} lockedMistakes={!can(student?.access, 'trainer')} /></div>
    </Shell>
  );
}
