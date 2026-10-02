import Link from 'next/link';
import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import { NurSay, type NurMood } from '@/components/Nur';
import { Ico, IArrow } from '@/components/icons';
import { ExamCard, NextLessonCard, ScoreChart, SECTION_RU, SectionBars, tone } from '@/components/widgets';
import { redirect } from 'next/navigation';
import { isAdmin, requireUser } from '@/lib/auth';
import {
  addDays, can, eventsOf, examOf, groupsOfStudent, nowInTz, progressOf, scoresOf, studentOfUser, teacherOfUser, upcomingLessons, withLessonInfo,
} from '@/lib/data';
import { navStats } from '@/lib/nav';
import { topicInfo } from '@/lib/bank';
import { streakOf } from '@/lib/streak';
import StreakCard from '@/components/StreakCard';
import { DOW_FULL, dateRu, daysBetween, firstName, plural, whenRu } from '@/lib/format';
import { practiceAccess } from '@/lib/staff';

export const dynamic = 'force-dynamic';

const Flame = () => (
  <svg viewBox="0 0 16 18" fill="none" aria-hidden="true"><path d="M8 1c1 3 5 5 5 9.5A5 5 0 0 1 3 10.5C3 8.5 4 7.5 5 6c.5 2 1.5 2.5 2 2.5C7 6 6.5 3.5 8 1z" fill="currentColor" /></svg>
);

export default async function Home() {
  const user = await requireUser();
  // ученик и учитель — параллельно (оба нужны и меню)
  const [student, teacher] = await Promise.all([studentOfUser(user.id), teacherOfUser(user.id)]);
  // Учитель без ID ученика сразу попадает в свой кабинет.
  if (!student && teacher) redirect('/teach');
  // Админ без ID ученика: главная ученика ему не нужна — сразу в админку.
  if (!student && isAdmin(user)) redirect('/admin');
  const now = nowInTz();
  const access = student?.access;

  const [groups, progress, scores, stats, streak, practice] = await Promise.all([
    student && can(access, 'schedule') ? groupsOfStudent(student.id) : Promise.resolve([]),
    progressOf(user.id, student?.id),
    student && can(access, 'scores') ? scoresOf(student.id) : Promise.resolve([]),
    navStats(user.id, student?.id),
    streakOf(user.id),
    practiceAccess(user, student),
  ]);
  const lessons = await withLessonInfo(upcomingLessons(groups, 14, 1));
  const events = student && can(access, 'schedule')
    ? await eventsOf(student.id, groups.map((g) => g.id), new Date().toISOString(), new Date(Date.now() + 21 * 86_400_000).toISOString())
    : [];

  const exam = examOf(user, student);
  const lastScore = progress.tests[0]?.score ?? null;
  const prevMonth = progress.tests.find((t) => t.at <= addDays(now.date, -28));
  const weak = progress.topics
    // темы, снятые с выдачи (их нет на экзамене), в «подтянуть» не предлагаем
    .filter((t) => t.total >= 5 && topicInfo(t.topic))
    .map((t) => ({ ...t, pct: Math.round((t.ok / t.total) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  const who = firstName(user.name);
  const name = who || 'ученик';
  /** Обращение в реплике Nur: «John, до экзамена…»; без имени фраза начинается с заглавной. */
  const hey = (rest: string) => (who ? `${who}, ${rest}` : `${rest[0].toUpperCase()}${rest.slice(1)}`);
  const daysLeft = exam?.date ? daysBetween(now.date, exam.date) : null;
  const trainerOpen = can(practice, 'trainer');
  const solved = progress.topics.reduce((n, t) => n + t.total, 0);
  const lesson = lessons[0] || null;
  const lessonLink = lesson ? (lesson.link !== undefined ? lesson.link : lesson.group.link) : null;

  /* Одно главное дело на сегодня: долги из ошибок → слабая тема → диагностика → выживание. */
  const worst = weak.find((t) => t.pct < 70);
  const plan = trainerOpen && stats.mistakes > 0
    ? {
      title: `Работа над ошибками: ${stats.mistakes} ${plural(stats.mistakes, 'задача', 'задачи', 'задач')}`,
      text: 'Здесь задачи, где последний ответ был неверным. Решишь верно — задача уходит из списка сама.',
      href: '/mistakes', cta: 'Разобрать ошибки',
      say: <>Сначала долги: <b>{stats.mistakes} {plural(stats.mistakes, 'задача', 'задачи', 'задач')}</b> из ошибок {plural(stats.mistakes, 'ждёт', 'ждут', 'ждут')} второго захода.</>,
    }
    : trainerOpen && worst
      ? {
        title: `Подтянуть: ${worst.label}`,
        text: `Точность ${worst.pct} % на ${worst.total} ${plural(worst.total, 'задаче', 'задачах', 'задачах')}. Двадцать задач темы, разбор сразу после ответа.`,
        href: `/trainer/${encodeURIComponent(worst.topic)}`, cta: 'Тренировать',
        say: <>Слабое место сегодня — <b>{worst.label.toLowerCase()}</b>. Посветить?</>,
      }
      : !progress.tests.length
        ? {
          title: 'Быстрая диагностика: 20 задач',
          text: 'Двадцать задач за 25 минут в формате экзамена. Покажет текущий балл и темы, которые тянут его вниз.',
          href: '/exam', cta: 'К пробникам',
          say: <>Начнём с диагностики: <b>20 задач</b>, и станет видно, куда светить.</>,
        }
        : {
          title: 'Проверь темп: выживание',
          text: 'Задачи одна за другой, 90 секунд на каждую и три лампочки. Экзамен даёт на задачу 75 секунд.',
          href: '/survival', cta: 'Зажечь свет',
          say: trainerOpen ? <>Долгов нет. Проверим <b>темп</b>: 90 секунд на задачу?</> : <>Проверим <b>темп</b>: 90 секунд на задачу?</>,
        };

  /* Настроение и первая фраза Nur. С 02:00 до 06:00 он выключен и молчит. */
  const hour = Math.floor(now.minutes / 60);
  const asleep = hour >= 2 && hour < 6;
  let mood: NurMood = 'default';
  let lead: React.ReactNode = <>{hey('свет есть. ')}</>;
  if (hour === 1) { mood = 'yawn'; lead = <>{hey('час ночи, я зеваю. Одно дело, и спать. ')}</>; }
  else if (daysLeft === 0) { mood = 'support'; lead = <>{hey('экзамен ')}<b>сегодня</b>. Дыши ровно, всё получится. Kolay gelsin!</>; }
  else if (daysLeft === 1) { mood = 'nervous'; lead = <>{hey('экзамен ')}<b>завтра</b>. Сегодня без подвигов. </>; }
  else if (!streak.current && streak.best > 0) { mood = 'sad'; lead = <>{hey('без тебя было темно. Хорошо, что ты здесь. ')}</>; }
  else if (streak.current > 0 && !streak.today) { mood = hour >= 22 ? 'late' : 'waiting'; lead = <>{hey('стрик ')}<b>{streak.current} {plural(streak.current, 'день', 'дня', 'дней')}</b> ждёт сегодняшней задачи. </>; }
  else if (daysLeft !== null && daysLeft > 1) { lead = <>{hey('до экзамена ')}<b>{daysLeft} {plural(daysLeft, 'день', 'дня', 'дней')}</b>. </>; }
  else if (!solved) { lead = <>{hey('я Nur. Я свечу, ты решаешь. ')}</>; }

  const streakLabel = streak.current
    ? `${streak.current} ${plural(streak.current, 'день', 'дня', 'дней')}${streak.today ? '' : ' · реши сегодня'}`
    : 'стрика пока нет';

  return (
    <Shell user={user} student={student} active="home" streak={streak}>
      <header className="hello">
        <div>
          <span className="date-line">{DOW_FULL[now.dow - 1]}, {dateRu(now.date, false)}{exam?.date ? <span className="m-hide"> · {exam.name}{exam.city ? `, ${exam.city}` : ''} {dateRu(exam.date, false)}</span> : null}</span>
          <h1>Привет, {name}</h1>
        </div>
        <span className={`streak-pill${streak.current ? '' : ' off'}`} title="Стрик: дни подряд с решёнными задачами"><Flame />{streakLabel}</span>
      </header>

      {asleep ? (
        <div className="nur-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nur/off.svg" alt="" width={84} height={92} />
          <p className="muted" style={{ margin: '0 0 10px', fontWeight: 600 }}>Nur выключается в 02:00 и спит до утра. Задачи открыты, но лучше тоже поспать.</p>
        </div>
      ) : (
        <NurSay mood={mood}>{lead}{daysLeft === 0 ? null : plan.say}</NurSay>
      )}

      {!student ? (
        <div className="banner">
          <div>
            <b>Есть ID ученика?</b>
            <span>Привяжи его — откроются твои курсы, расписание и баллы от преподавателей.</span>
          </div>
          <LinkIdForm compact />
        </div>
      ) : null}

      <div className="grid g-2 home-main">
        <section className="plan" aria-label="Главное на сегодня">
          <span className="kicker">Главное на сегодня</span>
          <h2>{plan.title}</h2>
          <p>{plan.text}</p>
          {trainerOpen && weak.some((t) => t.pct < 70) ? (
            <div className="plan-chips">
              {weak.filter((t) => t.pct < 70).slice(0, 3).map((t) => (
                <Link key={t.topic} className={`chip${t.pct < 55 ? ' chip-coral' : ''}`} href={`/trainer/${encodeURIComponent(t.topic)}`}>{t.label} · {t.pct} %</Link>
              ))}
            </div>
          ) : null}
          <div className="plan-act">
            <Link className="btn btn-dark btn-lg" href={plan.href}>{plan.cta} <IArrow /></Link>
            <span>{streak.today ? `Стрик на сегодня засчитан: ${streak.current} ${plural(streak.current, 'день', 'дня', 'дней')}` : streak.current ? `Решишь задачу — стрик станет ${streak.current + 1} ${plural(streak.current + 1, 'день', 'дня', 'дней')}` : 'Реши любую задачу — начнётся стрик'}</span>
          </div>
        </section>

        <div className="m-hide"><NextLessonCard lesson={lesson} today={now.date} /></div>
        {lesson ? (
          <a className="rowlink only-m" href={lessonLink || '/schedule'} {...(lessonLink ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <Ico name="lesson" />
            <span className="txt"><b>Занятие: {whenRu(now.date, lesson.date).toLowerCase()}, {lesson.start}</b><i>{lesson.group.course}{lesson.group.name ? ` · ${lesson.group.name}` : ''}{lesson.topic ? ` · ${lesson.topic}` : ''}</i></span>
            <span className="act">{lessonLink ? 'Войти →' : 'Расписание →'}</span>
          </a>
        ) : null}

        <div className="stats only-m">
          <Link className="stat" href={daysLeft !== null && daysLeft >= 0 ? '/progress' : '/settings'}>
            <b>{daysLeft === null || daysLeft < 0 ? '—' : daysLeft === 0 ? 'сегодня' : daysLeft}</b>
            <span>{daysLeft === null ? 'укажи дату экзамена' : daysLeft < 0 ? 'экзамен прошёл' : daysLeft === 0 ? 'экзамен, удачи!' : `${plural(daysLeft, 'день', 'дня', 'дней')} до экзамена`}</span>
          </Link>
          <Link className="stat" href="/progress">
            <b className="warm">{lastScore ?? '—'}</b>
            <span>{lastScore === null ? 'балл пробника' : exam?.target ? `балл · цель ${exam.target}` : 'последний балл'}</span>
          </Link>
          <Link className="stat" href="/progress">
            <b>{progress.week}</b>
            <span>{plural(progress.week, 'задача', 'задачи', 'задач')} за неделю</span>
          </Link>
        </div>
      </div>

      <div className="grid g-3 mt home-trio">
        <div className="m-hide"><ExamCard exam={exam} today={now.date} lastScore={lastScore} /></div>
        <StreakCard s={streak} />
        <Link className="night-card m-hide" href="/survival">
          <span className="kicker">Режим</span>
          <h2>Выживание</h2>
          <p>Свет отключили. {stats.best ? `Твой рекорд — ${stats.best} подряд.` : 'Три лампочки, 90 секунд на задачу.'}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="art" src="/shadows/s-trapezoid.svg" alt="" width={150} height={138} />
          <span className="btn btn-primary">Зажечь свет <IArrow /></span>
        </Link>
      </div>

      <div className="grid g-3 mt m-hide">
        <div className="tile">
          <span>Последний тест</span>
          <b>{lastScore ?? '—'}</b>
          <i>
            {lastScore === null ? 'балл из 500' : prevMonth ? (
              <><span className={lastScore - prevMonth.score >= 0 ? 'up' : 'down'}>{lastScore - prevMonth.score >= 0 ? '+' : '−'}{Math.abs(lastScore - prevMonth.score)}</span> за месяц</>
            ) : 'балл из 500'}
          </i>
        </div>
        <div className="tile"><span>Решено за неделю</span><b>{progress.week}</b><i>{plural(progress.week, 'задача', 'задачи', 'задач')} во всех режимах</i></div>
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
    </Shell>
  );
}
