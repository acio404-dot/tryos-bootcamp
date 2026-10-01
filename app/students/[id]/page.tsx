import Link from 'next/link';
import Shell from '@/components/Shell';
import StreakBadge from '@/components/StreakBadge';
import { TestsBlock, TopicsBlock } from '@/components/ProgressBlocks';
import { SECTION_RU, tone } from '@/components/widgets';
import { requireUser } from '@/lib/auth';
import { normCode, scoresOf, studentOfUser } from '@/lib/data';
import { dateRu, dateShort, plural } from '@/lib/format';
import { canViewStudent, studentStats } from '@/lib/student-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Статистика ученика' };

const MODE_RU: Record<string, string> = {
  practice: 'Тренажёр', mistakes: 'Работа над ошибками', survival: 'Выживание', exam: 'Пробники',
};

export default async function StudentPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const me = await studentOfUser(user.id);
  const id = normCode(decodeURIComponent(params.id));
  const role = await canViewStudent(user, id);
  const data = role ? await studentStats(id) : null;

  if (!role || !data) {
    return (
      <Shell user={user} student={me} active="teach">
        <div className="card empty-card">
          <h2>Нет доступа</h2>
          <p>Статистику ученика видят администраторы и учителя его групп.</p>
          <Link className="btn btn-ghost" href="/teach">К моим группам</Link>
        </div>
      </Shell>
    );
  }

  const { st, progress, streak, activity, modes, mistakes, survival, groups } = data;
  const scores = await scoresOf(st.id);
  const back = role === 'admin' ? '/admin' : '/teach';
  const maxDay = Math.max(1, ...activity.map((d) => d.n));
  const days14 = activity.reduce((a, d) => a + d.n, 0);
  const active14 = activity.filter((d) => d.n).length;
  // слабые темы: не меньше 5 задач, точность ниже 70 %
  const weak = progress.topics
    .filter((t) => t.total >= 5)
    .map((t) => ({ ...t, pct: Math.round((t.ok / t.total) * 100) }))
    .filter((t) => t.pct < 70)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);
  const last = progress.tests[0];

  return (
    <Shell user={user} student={me} active={role === "admin" ? "admin" : "teach"}>
      <div className="top">
        <div>
          <p className="crumbs"><Link href={back}>{role === 'admin' ? 'Админка' : 'Мои группы'}</Link> · статистика ученика</p>
          <h1 className="s-name">{st.name}{streak ? <StreakBadge n={streak.current} size="md" /> : null}</h1>
          <p>
            {groups.map((g) => (g.kind === 'solo' ? `${g.course} (инд.)` : g.name ? `${g.course} · ${g.name}` : g.course)).join(', ') || 'без групп'}
            {' · '}<span className="code">{st.id}</span>
          </p>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            {st.user_id ? (st.last_seen ? `Последний вход: ${dateRu(st.last_seen, false)}` : 'Заходил на платформу') : 'Ещё не заходил на платформу — решённых задач нет, но очные пробники видны'}
            {st.exam_date ? ` · экзамен ${dateRu(st.exam_date)}` : ''}
            {st.target_score ? ` · цель ${st.target_score}` : ''}
          </p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><span>За неделю</span><b>{progress.week}</b><i>{plural(progress.week, 'задача', 'задачи', 'задач')}</i></div>
        <div className="tile">
          <span>За 30 дней</span><b>{progress.monthTotal}</b>
          <i>{progress.monthAcc !== null ? `${plural(progress.monthTotal, 'задача', 'задачи', 'задач')} · точность ${progress.monthAcc} %` : 'задач пока нет'}</i>
        </div>
        <div className="tile"><span>Стрик</span><b>{streak?.current ?? 0}</b><i>{streak ? `лучший ${streak.best}` : 'дней подряд'}</i></div>
        <div className="tile">
          <span>Последний пробник</span><b>{last ? last.score : '—'}</b>
          <i>{last ? `${dateRu(last.at, false)}${st.target_score ? ` · цель ${st.target_score}` : ''}` : 'балл из 500'}</i>
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head">
            <h2>Активность</h2>
            <span className="note" style={{ margin: 0 }}>{days14} {plural(days14, 'задача', 'задачи', 'задач')} за 14 дней · {active14} {plural(active14, 'день', 'дня', 'дней')} с задачами</span>
          </div>
          <div className="s-bars" role="img" aria-label="Задач по дням за 14 дней">
            {activity.map((d) => (
              <div key={d.date} className="s-bar" title={`${dateRu(d.date, false)}: ${d.n} ${plural(d.n, 'задача', 'задачи', 'задач')}${d.n ? `, верно ${d.ok}` : ''}`}>
                <div className="s-col">
                  <i style={{ height: `${Math.round((d.n / maxDay) * 100)}%` }}><em style={{ height: d.n ? `${Math.round((d.ok / d.n) * 100)}%` : 0 }} /></i>
                </div>
                <span>{dateShort(d.date).day}</span>
              </div>
            ))}
          </div>
          <p className="note" style={{ margin: '8px 0 0' }}>Высота — сколько задач решено, зелёная часть — верно.</p>
          {modes.length ? (
            <ul className="mini-list">
              {modes.map((m) => (
                <li key={m.mode}>
                  <span className="who">{MODE_RU[m.mode] || m.mode}</span>
                  <span>{m.n} {plural(m.n, 'задача', 'задачи', 'задач')} · <span className={`pct ${tone(Math.round((m.ok / m.n) * 100))}`}>{Math.round((m.ok / m.n) * 100)} %</span></span>
                </li>
              ))}
              {survival?.runs ? (
                <li><span className="who">Рекорд в «Выживании»</span><span>{survival.best ?? 0} подряд · {survival.runs} {plural(survival.runs, 'серия', 'серии', 'серий')}</span></li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head"><h2>Пробные тесты</h2><span className="note" style={{ margin: 0 }}>онлайн и очные</span></div>
          <TestsBlock tests={progress.tests} target={st.target_score} limit={10} />
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><h2>Слабые темы</h2><span className="note" style={{ margin: 0 }}>от 5 задач, точность ниже 70 %</span></div>
          {weak.length ? (
            <ul className="list">
              {weak.map((t) => (
                <li key={t.topic}>
                  <span className="txt"><b>{t.label}</b><i>{SECTION_RU[t.section || ''] || 'Другое'} · {t.ok} из {t.total} верно</i></span>
                  <span className={`pct ${tone(t.pct)}`}>{t.pct} %</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>{progress.topics.length ? 'Слабых тем нет — или задач по ним пока мало.' : 'Задач пока нет.'}</p>}
        </div>

        <div className="card">
          <div className="card-head"><h2>Последние ошибки</h2></div>
          {mistakes.length ? (
            <ul className="mini-list" style={{ marginTop: 0 }}>
              {mistakes.map((m, i) => (
                <li key={i}>
                  <span className="who">{m.label}<span className="muted"> · {SECTION_RU[m.section || ''] || ''}</span></span>
                  <span className="muted s-when">{MODE_RU[m.mode] || m.mode} · {m.at.slice(8, 10)}.{m.at.slice(5, 7)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>Ошибок нет.</p>}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Точность по темам</h2>
          <span className="note" style={{ margin: 0 }}>за всё время · слабые сверху</span>
        </div>
        <TopicsBlock topics={progress.topics} weakFirst empty={<p className="muted" style={{ margin: 0 }}>Ученик ещё не решал задачи в тренажёре.</p>} />
      </div>

      <div className="card mt">
        <div className="card-head"><h2>Оценки преподавателей</h2></div>
        {scores.length ? (
          <ul className="list">
            {scores.slice(0, 20).map((s) => {
              const pct = Math.round((s.value / s.max) * 100);
              return (
                <li key={s.id}>
                  <span className="txt"><b>{s.title}</b><i>{s.teacher ? `${s.teacher} · ` : ''}{dateRu(s.date, false)}</i></span>
                  <span className={`pct ${tone(pct)}`}>{s.value} / {s.max}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted" style={{ margin: 0 }}>Оценок пока нет.</p>}
      </div>
    </Shell>
  );
}
