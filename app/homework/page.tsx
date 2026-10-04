import Link from 'next/link';
import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import { NurSay } from '@/components/Nur';
import { requireUser } from '@/lib/auth';
import { topicInfo } from '@/lib/bank';
import { nowInTz, studentOfUser } from '@/lib/data';
import { dueRu, plural } from '@/lib/format';
import { homeworkOfStudent, type StudentHomework } from '@/lib/homework';
import '../shift/run.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Домашка' };

function status(h: StudentHomework): { text: string; cls: string } {
  if (h.finished) return h.late ? { text: 'сдано после срока', cls: 'chip' } : { text: 'сдано', cls: 'chip chip-ok' };
  if (h.overdue) return { text: 'срок прошёл', cls: 'chip chip-coral' };
  if (h.started) return { text: `${h.done} из ${h.count}`, cls: 'chip chip-lamp' };
  return { text: 'ждёт', cls: 'chip chip-lamp' };
}

/* Домашка: задания от учителя группе. У каждого ученика свой набор задач из заданных тем. */
export default async function Homework() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const today = nowInTz().date;
  const list = student ? await homeworkOfStudent(student.id, user.id) : [];
  const waiting = list.filter((h) => !h.finished);
  const done = list.filter((h) => h.finished);
  const hour = Math.floor(nowInTz().minutes / 60);
  const asleep = hour >= 2 && hour < 6;

  const card = (h: StudentHomework) => {
    const st = status(h);
    const topics = h.topics.map((k) => topicInfo(k)?.label).filter(Boolean).join(', ');
    return (
      <Link key={h.id} className={`hw-card${h.finished ? ' done' : ''}${h.overdue && !h.finished ? ' late' : ''}`} href={`/homework/${h.id}`}>
        <span className="hw-head">
          <b>{h.title}</b>
          <span className={st.cls}>{st.text}</span>
        </span>
        <span className="hw-meta">
          {h.count} {plural(h.count, 'задача', 'задачи', 'задач')} · {h.finished ? `верно ${h.ok1 + h.ok2} из ${h.count}` : dueRu(today, h.day, h.time)}
          {' · '}{h.course}{h.group ? ` · ${h.group}` : ''}
        </span>
        {topics && topics !== h.title ? <span className="hw-topics">{topics}</span> : null}
        {h.note ? <span className="hw-note">{h.author ? `${h.author}: ` : ''}{h.note}</span> : null}
        <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round((h.done / h.count) * 100)}%` }} /></span>
        <span className="hw-go">{h.finished ? 'Посмотреть итоги →' : h.started ? 'Продолжить →' : 'Начать →'}</span>
      </Link>
    );
  };

  return (
    <Shell user={user} student={student} active="homework">
      <div className="top">
        <div>
          <span className="eyebrow">Задания от учителя</span>
          <h1>Домашка</h1>
        </div>
      </div>

      {!student ? (
        <div className="card empty-card">
          <h2>Домашку задаёт учитель</h2>
          <p>Она приходит ученикам группы. Привяжи ID ученика — и задания появятся здесь и на главной.</p>
          <div style={{ maxWidth: 420, margin: '0 auto' }}><LinkIdForm /></div>
        </div>
      ) : !list.length ? (
        <>
          {asleep ? null : <NurSay mood="zen">Домашки нет. Учитель задаст — она появится здесь и на главной.</NurSay>}
          <div className="card empty-card">
            <p>Пока заданий нет. Не теряй день: смена на сегодня уже собрана.</p>
            <Link className="btn btn-dark" href="/shift">К смене</Link>
          </div>
        </>
      ) : (
        <>
          {waiting.length && !asleep ? (
            <NurSay mood={waiting.some((h) => h.overdue) ? 'nervous' : 'default'}>
              {waiting.some((h) => h.overdue)
                ? <>Срок прошёл, но сдать ещё можно: <b>учитель увидит</b>, что работа сделана.</>
                : <>{plural(waiting.length, 'Ждёт', 'Ждут', 'Ждут')} {waiting.length} {plural(waiting.length, 'задание', 'задания', 'заданий')}. Ближайший срок — <b>{dueRu(today, waiting[0].day, waiting[0].time)}</b>.</>}
            </NurSay>
          ) : null}
          {waiting.length ? <div className="hw-list">{waiting.map(card)}</div> : (
            <div className="card empty-card"><p>Все задания сданы. Новых пока нет.</p><Link className="btn btn-dark" href="/shift">К смене</Link></div>
          )}
          {done.length ? (
            <>
              <h2 className="hw-h">Сданные</h2>
              <div className="hw-list">{done.map(card)}</div>
            </>
          ) : null}
        </>
      )}
    </Shell>
  );
}
