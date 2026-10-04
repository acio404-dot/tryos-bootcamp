import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import TaskRun from '@/components/TaskRun';
import StartRun from '@/components/StartRun';
import { RunList, RunStats } from '@/components/RunSummary';
import { NurSay } from '@/components/Nur';
import { Ico } from '@/components/icons';
import { isAdmin, requireUser } from '@/lib/auth';
import { topicInfo } from '@/lib/bank';
import { can, nowInTz, studentOfUser, teacherOfUser } from '@/lib/data';
import { dueRu, plural } from '@/lib/format';
import { homeworkForStudent, homeworkOwner } from '@/lib/homework';
import { homeworkSet, skipMissing, stateOf } from '@/lib/sets';
import { practiceAccess } from '@/lib/staff';
import '../../shift/run.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Домашка' };

export default async function HomeworkRun({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const hw = student ? await homeworkForStudent(student.id, user.id, params.id) : null;
  if (!hw) {
    // Учитель группы и админ попадают сюда по ссылке из расписания: их место — таблица сдачи.
    const owner = await homeworkOwner(params.id);
    if (owner) {
      const teacher = await teacherOfUser(user.id);
      if (teacher && owner.teacher_id === teacher.id) redirect('/teach');
      if (isAdmin(user)) redirect('/admin');
    }
    notFound();
  }
  const [found, access] = await Promise.all([homeworkSet(user.id, hw.id), practiceAccess(user, student)]);
  const set = found ? await skipMissing(found) : null;
  const now = nowInTz();
  const hour = Math.floor(now.minutes / 60);
  const asleep = hour >= 2 && hour < 6;
  const topics = hw.topics.map((k) => topicInfo(k)?.label).filter(Boolean) as string[];
  const due = dueRu(now.date, hw.day, hw.time);

  if (set && !set.finished) {
    return (
      <Shell user={user} student={student} active="homework">
        <TaskRun initial={stateOf(set)} title={hw.title} exitHref="/homework" exitLabel="К домашке" />
      </Shell>
    );
  }

  const top = (
    <div className="top">
      <div>
        <span className="eyebrow">Домашка · {hw.course}{hw.group ? ` · ${hw.group}` : ''}</span>
        <h1>{hw.title}</h1>
      </div>
      <div className="top-actions"><Link className="btn btn-ghost" href="/homework">Все задания</Link></div>
    </div>
  );

  if (set?.finished) {
    const st = stateOf(set);
    const s = st.summary!;
    return (
      <Shell user={user} student={student} active="homework">
        {top}
        {asleep ? null : (
          <NurSay mood={s.wrong === 0 ? 'proud' : 'support'} lamp>
            Сдано{hw.late ? ' после срока' : ''}: верно <b>{s.ok1 + s.ok2} из {st.total}</b>, +{s.light} света. Учитель это уже видит.
          </NurSay>
        )}
        <RunStats s={s} />
        <div className="grid g-2e mt">
          <div className="card">
            <div className="card-head"><h2>По задачам</h2></div>
            <RunList s={s} total={st.total} />
          </div>
          <div className="sh-next">
            <div className="card">
              <div className="card-head"><h2>Что дальше</h2></div>
              <div className="sh-links">
                {s.wrong > 0 && can(access, 'trainer') ? (
                  <Link className="rowlink" href="/mistakes">
                    <Ico name="mistakes" />
                    <span className="txt"><b>Разобрать {s.wrong} {plural(s.wrong, 'ошибку', 'ошибки', 'ошибок')}</b><i>с разбором каждой задачи</i></span>
                    <span className="act">Открыть →</span>
                  </Link>
                ) : null}
                <Link className="rowlink" href="/shift">
                  <Ico name="shift" />
                  <span className="txt"><b>Смена на сегодня</b><i>восемь задач, которые собрала платформа</i></span>
                  <span className="act">К смене →</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={user} student={student} active="homework">
      {top}
      {asleep ? null : (
        <NurSay mood={hw.overdue ? 'nervous' : 'default'}>
          {hw.overdue
            ? <>Срок прошёл, но сдать ещё можно. <b>Лучше поздно</b>, чем темно.</>
            : <>{hw.count} {plural(hw.count, 'задача', 'задачи', 'задач')}, срок — <b>{due}</b>. Ошибёшься — подскажу.</>}
        </NurSay>
      )}
      <section className="plan sh-plan" aria-label="Задание">
        <span className="kicker">{hw.author && hw.author !== 'Школа' ? `Задание от: ${hw.author}` : 'Задание от школы'}</span>
        <h2>{hw.count} {plural(hw.count, 'задача', 'задачи', 'задач')} · {hw.overdue ? 'срок прошёл' : due}</h2>
        <p>{topics.length > 1 ? 'Темы' : 'Тема'}: {topics.join(', ')}. Задачи у каждого свои, решать можно частями: прогресс сохраняется.</p>
        {hw.note ? <p className="hw-teacher">«{hw.note}»</p> : null}
        <div className="plan-act">
          <StartRun action="open-homework" hw={hw.id} label="Начать домашку" />
          <span>Подсказка после первой ошибки, разбор — после второй.</span>
        </div>
      </section>
    </Shell>
  );
}
