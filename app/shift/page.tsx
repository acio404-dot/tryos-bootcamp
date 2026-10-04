import Link from 'next/link';
import Shell from '@/components/Shell';
import TaskRun from '@/components/TaskRun';
import StartRun from '@/components/StartRun';
import { RunList, RunStats } from '@/components/RunSummary';
import { NurSay } from '@/components/Nur';
import { Ico } from '@/components/icons';
import { requireUser } from '@/lib/auth';
import { itemById } from '@/lib/bank';
import { addDays, can, nowInTz, studentOfUser } from '@/lib/data';
import { DOW, dateRu, plural } from '@/lib/format';
import { LIGHT } from '@/lib/light';
import { SHIFT_MINUTES, SHIFT_SIZE, buildShift, countKinds, openShift, planText, setById, shiftDays, shiftsToday, skipMissing, stateOf } from '@/lib/sets';
import { practiceAccess } from '@/lib/staff';
import './run.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Смена' };

/* Смена — восемь задач на сегодня, которые платформа собирает сама:
   слабые темы, новые темы и задачи из ошибок. Одна кнопка вместо выбора из 78 тем. */
export default async function Shift({ searchParams }: { searchParams?: { done?: string } }) {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [access, shifts, days, running] = await Promise.all([
    practiceAccess(user, student), shiftsToday(user.id), shiftDays(user.id, 7), openShift(user.id),
  ]);
  const personal = can(access, 'trainer');
  const now = nowInTz();
  const hour = Math.floor(now.minutes / 60);
  const asleep = hour >= 2 && hour < 6;

  const open = running ? await skipMissing(running) : null;
  if (open && !open.finished) {
    return (
      <Shell user={user} student={student} active="shift">
        <TaskRun initial={stateOf(open)} title="Смена" exitHref="/" exitLabel="На главную" />
      </Shell>
    );
  }

  const week = Array.from({ length: 7 }, (_, k) => {
    const d = addDays(now.date, k - 6);
    const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    return { d, label: DOW[dow], done: days.has(d), today: d === now.date };
  });
  const weekDone = week.filter((w) => w.done).length;
  const weekStrip = (
    <div className="card sh-week">
      <div className="card-head"><h2>Смены за 7 дней</h2><span className="note" style={{ margin: 0 }}>{weekDone} из 7</span></div>
      <ol className="sh-days">
        {week.map((w) => (
          <li key={w.d} className={`${w.done ? 'done' : ''}${w.today ? ' today' : ''}`} title={`${dateRu(w.d, false)}: ${w.done ? 'смена закрыта' : w.today ? 'сегодня' : 'смены не было'}`}>
            <i aria-hidden="true" /><span>{w.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  /* ---------------------------------------------- сегодня смена уже закрыта */
  // Смена, которую только что закрыли (в том числе начатая вчера и законченная после полуночи), — по ссылке ?done=
  const justDone = typeof searchParams?.done === 'string' ? await setById(user.id, searchParams.done.slice(0, 40)) : null;
  const finished = shifts.filter((x) => x.finished);
  const last = justDone && justDone.kind === 'shift' && justDone.finished ? justDone : finished[finished.length - 1];
  if (last) {
    const st = stateOf(last);
    const s = st.summary!;
    const lightToday = Math.max(last.light, finished.reduce((n, x) => n + x.light, 0));
    return (
      <Shell user={user} student={student} active="shift">
        <div className="top">
          <div>
            <span className="eyebrow">Смена · {dateRu(now.date, false)}</span>
            <h1>Смена закрыта</h1>
          </div>
        </div>
        {asleep ? null : (
          <NurSay mood={s.ok1 === st.total ? 'party' : 'proud'} lamp>
            {s.ok1} из {st.total} с первой попытки, <b>+{lightToday} света</b> за сегодня.
            {finished.length > 1 ? ` Смен сегодня: ${finished.length}.` : ''}
          </NurSay>
        )}
        <RunStats s={s} />
        <div className="grid g-2e mt">
          <div className="sh-next">
            <div className="card">
              <div className="card-head"><h2>Что дальше</h2></div>
              <div className="sh-links">
                {s.wrong > 0 && personal ? (
                  <Link className="rowlink" href="/mistakes">
                    <Ico name="mistakes" />
                    <span className="txt"><b>Разобрать {s.wrong} {plural(s.wrong, 'ошибку', 'ошибки', 'ошибок')}</b><i>задачи вернутся и в завтрашнюю смену</i></span>
                    <span className="act">Открыть →</span>
                  </Link>
                ) : null}
                <Link className="rowlink" href="/survival">
                  <Ico name="survival" />
                  <span className="txt"><b>Выживание</b><i>серия на время: три лампочки</i></span>
                  <span className="act">Зажечь свет →</span>
                </Link>
              </div>
              <div className="sh-more">
                <StartRun action="start-shift" label="Ещё одна смена" className="btn btn-lg" />
                <span className="muted">Новые {SHIFT_SIZE} задач, свет начисляется как обычно.</span>
              </div>
            </div>
            {weekStrip}
          </div>
          <div className="card">
            <div className="card-head"><h2>{finished.length > 1 ? 'Последняя смена по задачам' : 'Смена по задачам'}</h2></div>
            <RunList s={s} total={st.total} />
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------- смена ещё не начата */
  const plan = await buildShift(user.id, personal);
  const counts = countKinds(plan);
  const names = (kind: string) => plan.filter((i) => i.kind === kind).map((i) => itemById(i.id)?.topicLabel).filter(Boolean) as string[];
  const rows = [
    counts.weak ? { ico: 'trainer' as const, n: counts.weak, title: plural(counts.weak, 'слабая тема', 'слабые темы', 'слабых тем'), text: names('weak').join(', ') } : null,
    counts.new ? { ico: 'bestiary' as const, n: counts.new, title: plural(counts.new, 'новая тема', 'новые темы', 'новых тем'), text: names('new').join(', ') } : null,
    counts.mistake ? { ico: 'mistakes' as const, n: counts.mistake, title: 'из ошибок', text: 'задачи, где последний ответ был неверным' } : null,
    counts.mix ? { ico: 'city' as const, n: counts.mix, title: 'на повторение', text: 'темы, которые давно не решал' } : null,
    counts.any ? { ico: 'city' as const, n: counts.any, title: plural(counts.any, 'тема вперемешку', 'темы вперемешку', 'тем вперемешку'), text: 'логика, алгебра и геометрия по кругу' } : null,
  ].filter(Boolean) as { ico: 'trainer' | 'bestiary' | 'mistakes' | 'city'; n: number; title: string; text: string }[];

  return (
    <Shell user={user} student={student} active="shift">
      <div className="top">
        <div>
          <span className="eyebrow">Смена · {dateRu(now.date, false)}</span>
          <h1>{plan.length} {plural(plan.length, 'задача', 'задачи', 'задач')} · {SHIFT_MINUTES} минут</h1>
        </div>
      </div>
      {asleep ? null : (
        <NurSay>
          {personal
            ? <>Я собрал смену сам: <b>{planText(counts)}</b>. Выбирать не нужно.</>
            : <>Восемь задач из разных тем. <b>Ошибёшься — подскажу</b> и дам вторую попытку.</>}
        </NurSay>
      )}

      <div className="grid g-2e">
        <section className="plan sh-plan" aria-label="Смена на сегодня">
          <span className="kicker">Смена на сегодня</span>
          <ul className="sh-rows">
            {rows.map((r) => (
              <li key={r.title}>
                <Ico name={r.ico} />
                <span><b>{r.n} {r.title}</b><i>{r.text}</i></span>
              </li>
            ))}
          </ul>
          <div className="plan-act">
            <StartRun action="start-shift" label="Начать смену" />
            <span>{weekDone ? `За 7 дней закрыто смен: ${weekDone}` : 'Первая смена за неделю'}</span>
          </div>
        </section>

        <div className="sh-next">
          <div className="card sh-rules">
            <div className="card-head"><h2>Как идёт смена</h2></div>
            <ul>
              <li><b>Ошибся — Nur подскажет.</b> Неверный вариант гаснет, даётся вторая попытка за половину света. Разбор — только после второй ошибки.</li>
              <li><b>Свет.</b> +{LIGHT.correct} за верный ответ, +{LIGHT.clean} без подсказки, +{LIGHT.fast}, если быстрее {LIGHT.tempo} секунд — это темп экзамена.</li>
              <li><b>Можно прерваться.</b> Смена сохраняется: вернёшься к той же задаче.</li>
            </ul>
          </div>
          {weekStrip}
          {!personal ? (
            <p className="note">Ученикам школы смена собирается из их слабых тем и ошибок. {student ? 'Доступ к тренажёру открывает школа.' : 'Привяжи ID ученика в настройках.'}</p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
