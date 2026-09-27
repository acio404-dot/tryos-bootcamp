import Link from 'next/link';
import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import ModeCards from '@/components/ModeCards';
import { ExamCard, NextLessonCard, ScoreChart, SECTION_RU, SectionBars, tone } from '@/components/widgets';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  addDays, can, eventsOf, examOf, groupsOfStudent, nowInTz, progressOf, scoresOf, studentOfUser, teacherOfUser, upcomingLessons, withLessonInfo,
} from '@/lib/data';
import { mistakeCount, myBestSurvival } from '@/lib/runs';
import { streakOf } from '@/lib/streak';
import StreakCard from '@/components/StreakCard';
import { DOW_FULL, dateRu, firstName, plural } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  // Учитель без ID ученика сразу попадает в свой кабинет.
  if (!student && (await teacherOfUser(user.id))) redirect('/teach');
  const now = nowInTz();
  const access = student?.access;

  const [groups, progress, scores, mistakes, bestStreak, streak] = await Promise.all([
    student && can(access, 'schedule') ? groupsOfStudent(student.id) : Promise.resolve([]),
    progressOf(user.id),
    student && can(access, 'scores') ? scoresOf(student.id) : Promise.resolve([]),
    mistakeCount(user.id),
    myBestSurvival(user.id),
    streakOf(user.id),
  ]);
  const lessons = await withLessonInfo(upcomingLessons(groups, 14, 1));
  const events = student && can(access, 'schedule')
    ? await eventsOf(student.id, groups.map((g) => g.id), new Date().toISOString(), new Date(Date.now() + 21 * 86_400_000).toISOString())
    : [];

  const exam = examOf(user, student);
  const lastScore = progress.tests[0]?.score ?? null;
  const prevMonth = progress.tests.find((t) => t.at <= addDays(now.date, -28));
  const weak = progress.topics
    .filter((t) => t.total >= 5)
    .map((t) => ({ ...t, pct: Math.round((t.ok / t.total) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  return (
    <Shell user={user} student={student} active="home" streak={streak}>
      {/* на телефоне блоки выстраиваются по порядку из CSS: сначала ближайшее занятие, потом стрик и режимы */}
      <div className="home">
      <div className="top">
        <div>
          <h1>Привет, {firstName(user.name) || 'ученик'}!</h1>
          <p>Сегодня {DOW_FULL[now.dow - 1]}, {dateRu(now.date, false)}.</p>
        </div>
        <div className="top-actions m-hide">
          <Link className="btn btn-ghost" href="/trainer">Тренажёр</Link>
          <Link className="btn btn-primary" href="/exam">Пробник</Link>
        </div>
      </div>

      <div className="h-streak"><StreakCard s={streak} /></div>

      {!student ? (
        <div className="banner">
          <div>
            <b>Есть ID ученика?</b>
            <span>Привяжи его — откроются твои курсы, расписание и баллы от преподавателей.</span>
          </div>
          <LinkIdForm compact />
        </div>
      ) : null}

      <div className="h-modes"><ModeCards mistakes={mistakes} best={bestStreak} lockedMistakes={!can(access, 'trainer')} /></div>

      <div className="grid g-2 mt home-duo">
        <div className="h-exam"><ExamCard exam={exam} today={now.date} lastScore={lastScore} /></div>
        <div className="h-lesson"><NextLessonCard lesson={lessons[0] || null} today={now.date} /></div>
      </div>

      <div className="grid g-3 mt">
        <div className="tile">
          <span>Последний тест</span>
          <b>{lastScore ?? '—'}</b>
          <i>
            {lastScore === null ? 'балл из 500' : prevMonth ? (
              <><span className="up">{lastScore - prevMonth.score >= 0 ? '+' : ''}{lastScore - prevMonth.score}</span> за месяц</>
            ) : 'балл из 500'}
          </i>
        </div>
        <div className="tile"><span>Решено за неделю</span><b>{progress.week}</b><i>{plural(progress.week, 'задача', 'задачи', 'задач')} в тренажёре</i></div>
        <div className="tile"><span>Точность</span><b>{progress.monthAcc === null ? '—' : `${progress.monthAcc} %`}</b><i>за последние 30 дней</i></div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><h2>Баллы за пробные тесты</h2><Link href="/progress">Все тесты</Link></div>
          <ScoreChart tests={progress.tests} target={exam?.target ?? null} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Точность по разделам</h2><span className="note" style={{ margin: 0 }}>всё время</span></div>
          <SectionBars topics={progress.topics} />
        </div>
      </div>

      <div className="grid g-2e mt">
        <div className="card">
          <div className="card-head"><h2>Подтянуть в первую очередь</h2></div>
          {weak.length ? (
            <ul className="list">
              {weak.map((t) => (
                <li key={t.topic}>
                  <span className="txt"><b>{t.label}</b><i>{SECTION_RU[t.section || ''] || 'Тема'} · {t.total} {plural(t.total, 'задача', 'задачи', 'задач')}</i></span>
                  <span className={`pct ${tone(t.pct)}`}>{t.pct} %</span>
                  <Link className="go" href={`/trainer/${encodeURIComponent(t.topic)}`}>Тренировать →</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Когда решишь хотя бы по 5 задач в нескольких темах, здесь появятся темы, которые тянут балл вниз.</p>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>{events.length ? 'Ближайшие события' : 'Оценки преподавателей'}</h2><Link href={events.length ? '/schedule' : '/progress'}>{events.length ? 'Расписание' : 'Прогресс'}</Link></div>
          {events.length ? (
            <ul className="list">
              {events.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <span className="txt">
                    <b>{e.title}</b>
                    <i>
                      {e.kind === 'deadline' ? 'Срок сдачи' : e.kind === 'exam' ? 'Тестирование' : 'Доп. занятие'}
                      {' · '}{dateRu(e.day, false)}
                      {e.kind !== 'deadline' ? `, ${e.time}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </i>
                  </span>
                  {e.link ? <a className="go" href={e.link} target="_blank" rel="noopener noreferrer">Ссылка →</a> : null}
                </li>
              ))}
            </ul>
          ) : scores.length ? (
            <ul className="list">
              {scores.slice(0, 4).map((s) => {
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
            <p className="muted" style={{ margin: 0 }}>{student ? 'Пока нет оценок и сроков — они появятся, когда их добавит преподаватель.' : 'Оценки преподавателей видны после привязки ID ученика.'}</p>
          )}
        </div>
      </div>
      </div>
    </Shell>
  );
}
