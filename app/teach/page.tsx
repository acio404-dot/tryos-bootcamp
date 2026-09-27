import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import TeacherTag from '@/components/TeacherTag';
import TeachPanel, { type TEvent, type TLesson, type TScore, type TStudent } from '@/components/TeachPanel';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  TZ, groupsOfTeacher, nowInTz, studentOfUser, teacherOfUser, upcomingLessons, withLessonInfo,
} from '@/lib/data';
import { plural } from '@/lib/format';
import { streaksOf } from '@/lib/streak';
import { mockBatches } from '@/lib/mock';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Кабинет учителя' };

export default async function Teach() {
  const user = await requireUser();
  const [teacher, student] = await Promise.all([teacherOfUser(user.id), studentOfUser(user.id)]);

  if (!teacher) {
    return (
      <Shell user={user} student={student} active="teach">
        <div className="top"><div><h1>Кабинет учителя</h1><p>Здесь учитель видит свои группы, ставит занятия и ссылки.</p></div></div>
        <div className="card empty-card">
          <h2>Введи ID учителя</h2>
          <p>ID учителя выдаёт администратор школы. Он выглядит так: TZT-1234-ABCD.</p>
          <div style={{ maxWidth: 420, margin: '0 auto' }}><LinkIdForm /></div>
        </div>
      </Shell>
    );
  }

  const groups = await groupsOfTeacher(teacher.id);
  const ids = groups.map((g) => g.id);
  const now = nowInTz();

  const [students, events, scores, mocks, exams] = await Promise.all([
    db<TStudent & { user_id: string | null }>`select s.id, s.name, s.user_id, m.group_id from bc_members m
      join bc_students s on s.id = m.student_id where m.group_id = any(${ids}::int[]) order by s.name`,
    db<TEvent>`select id, group_id, kind, title, link, note, batch,
        to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(at at time zone ${TZ}, 'HH24:MI') as time
      from bc_events where group_id = any(${ids}::int[]) and at > now() - interval '1 day' order by at limit 60`,
    db<TScore>`select sc.id, sc.student_id, s.name as student, sc.title, sc.value::float as value, sc.max::float as max,
        to_char(sc.date, 'YYYY-MM-DD') as date
      from bc_scores sc join bc_students s on s.id = sc.student_id
      where sc.teacher_id = ${teacher.id} order by sc.date desc, sc.id desc limit 40`,
    mockBatches(teacher.id),
    // прошедшие тестирования из расписания — чтобы внести по ним баллы в один клик
    db<{ title: string; day: string; group_id: number }>`select title, group_id, to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day
      from bc_events where kind = 'exam' and group_id = any(${ids}::int[]) and at > now() - interval '45 days' and at < now() + interval '1 day'
      order by at desc limit 20`,
  ]);
  const streaks = await streaksOf(students.map((s) => s.user_id || ''));
  const people: TStudent[] = students.map((s) => ({ id: s.id, name: s.name, group_id: s.group_id, streak: s.user_id ? streaks[s.user_id] || 0 : 0 }));

  const lessons: TLesson[] = (await withLessonInfo(upcomingLessons(groups, 14, 40))).map((l) => ({
    date: l.date, start: l.start, end: l.end, group_id: l.group.id,
    link: l.link || null, own: Boolean(l.link && l.link !== l.group.link), topic: l.topic || null,
  }));

  const count = new Set(people.map((p) => p.id)).size;
  const nGroups = groups.filter((g) => g.kind !== 'solo').length;
  const nSolo = groups.length - nGroups;
  const summary = [
    nGroups ? `${nGroups} ${plural(nGroups, 'группа', 'группы', 'групп')}` : '',
    nSolo ? `${nSolo} ${plural(nSolo, 'ученик', 'ученика', 'учеников')} индивидуально` : '',
    `${count} ${plural(count, 'ученик', 'ученика', 'учеников')} всего`,
  ].filter(Boolean).join(' · ');

  return (
    <Shell user={user} student={student} active="teach">
      <div className="top">
        <div>
          <h1>Кабинет учителя</h1>
          <p className="t-me">
            <b>{teacher.name}</b><TeacherTag />
            <span className="muted">
              {groups.length ? summary : 'Групп пока нет'}
            </span>
          </p>
        </div>
      </div>
      {groups.length ? (
        <TeachPanel groups={groups} students={people} lessons={lessons} events={events} scores={scores} mocks={mocks} exams={exams} today={now.date} />
      ) : (
        <div className="card empty-card">
          <h2>Групп пока нет</h2>
          <p>Когда администратор назначит тебя учителем группы или индивидуальных занятий, они появятся здесь.</p>
        </div>
      )}
    </Shell>
  );
}
