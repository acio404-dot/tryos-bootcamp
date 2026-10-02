import Link from 'next/link';
import { TeacherName } from './TeacherTag';
import type { Exam, Lesson, TestRow, TopicStat } from '@/lib/data';
import { dateRu, daysBetween, plural, whenRu } from '@/lib/format';

export const SECTION_RU: Record<string, string> = { iq: 'Логика', algebra: 'Алгебра', geometry: 'Геометрия' };
export const MAIN = 'https://www.tryoszone.com';

const dowList = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** «Пн, Ср, Пт · 19:00–20:30» — если у всех занятий одно время. */
export function scheduleText(slots: { dow: number; start: string; end: string }[]): string {
  if (!slots?.length) return 'Расписание уточняется';
  const sorted = [...slots].sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
  const same = sorted.every((s) => s.start === sorted[0].start && s.end === sorted[0].end);
  if (same) return `${sorted.map((s) => dowList[s.dow - 1]).join(', ')} · ${sorted[0].start}–${sorted[0].end}`;
  return sorted.map((s) => `${dowList[s.dow - 1]} ${s.start}`).join(', ');
}

/* ---------------------------------------------------------- экзамен */

export function ExamCard({ exam, today, lastScore }: { exam: Exam | null; today: string; lastScore: number | null }) {
  if (!exam || !exam.date) {
    return (
      <div className="card exam">
        <div className="exam-top"><span className="kicker">Твой экзамен</span></div>
        <h3>{exam?.name || 'Когда экзамен?'}</h3>
        <p className="exam-meta" style={{ margin: '6px 0 18px' }}>
          Укажи дату экзамена — здесь появится отсчёт дней и цель по баллам.
        </p>
        <Link className="btn btn-primary" href="/settings">Указать дату экзамена</Link>
      </div>
    );
  }
  const left = Math.max(0, daysBetween(today, exam.date));
  const gap = exam.target && lastScore !== null ? exam.target - lastScore : null;
  return (
    <div className="card exam">
      <div className="exam-top">
        <span className="kicker">Твой экзамен</span>
        {exam.fromSchool ? <span className="chip chip-ok">✓ Зарегистрирован</span> : null}
      </div>
      <h3>{exam.name}</h3>
      <div className="exam-meta">{dateRu(exam.date)}{exam.city ? ` · ${exam.city}` : ''}</div>
      <div className="days">
        <b>{left}</b>
        <span>{left === 0 ? 'экзамен сегодня — удачи!' : `${plural(left, 'день', 'дня', 'дней')} до экзамена`}</span>
      </div>
      <div className="exam-goals">
        <div><b>{exam.target ?? '—'}</b><span>цель, балл</span></div>
        <div><b>{lastScore ?? '—'}</b><span>последний тест</span></div>
        <div><b>{gap === null ? '—' : gap > 0 ? `+${gap}` : '✓'}</b><span>{gap !== null && gap <= 0 ? 'цель достигнута' : 'осталось набрать'}</span></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- ближайшее занятие */

export function NextLessonCard({ lesson, today }: { lesson: Lesson | null; today: string }) {
  if (!lesson) {
    return (
      <div className="card">
        <span className="kicker">Ближайшее занятие</span>
        <div className="lesson-when">Пока нет</div>
        <p className="muted" style={{ margin: '8px 0 16px' }}>Когда школа добавит тебя на курс — в группу или индивидуально, — здесь появится ближайшее занятие.</p>
        <Link className="btn btn-ghost" href="/schedule">Расписание</Link>
      </div>
    );
  }
  const g = lesson.group;
  const link = lesson.link !== undefined ? lesson.link : g.link;
  return (
    <div className="card">
      <span className="kicker">Ближайшее занятие</span>
      <div className="lesson-when">{whenRu(today, lesson.date)}, {lesson.start}</div>
      <div className="lesson-topic">{g.course}{g.name ? ` · ${g.name}` : ''}</div>
      <div className="lesson-meta">
        <div><span>Время</span><b>{lesson.start}–{lesson.end}</b></div>
        {lesson.topic ? <div><span>Тема</span><b>{lesson.topic}</b></div> : null}
        {g.teacher ? <div><span>Преподаватель</span><b><TeacherName name={g.teacher} /></b></div> : null}
        <div><span>Где</span><b>{link ? 'онлайн, по ссылке' : 'ссылку пришлёт школа'}</b></div>
      </div>
      <div className="row">
        {link ? <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">Подключиться</a> : null}
        <Link className="btn btn-ghost" href="/schedule">Всё расписание</Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------ график баллов тестов */

function chartSvg(tests: TestRow[], target: number | null, W: number) {
  const pts = [...tests].reverse().slice(-12);
  const H = W < 420 ? 200 : 230;
  const L = 38, R = 64, T = 14, B = 28;
  const vals = pts.map((p) => p.score).concat(target ? [target] : []);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 20) / 20) * 20);
  const hi = Math.min(500, Math.ceil((Math.max(...vals) + 20) / 20) * 20);
  const x = (i: number) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / Math.max(1, hi - lo);
  const step = Math.max(20, Math.ceil((hi - lo) / 3 / 20) * 20);
  const grid: JSX.Element[] = [];
  for (let v = lo; v <= hi; v += step) {
    grid.push(<line key={`g${v}`} className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />);
    grid.push(<text key={`t${v}`} className="ax" x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>);
  }
  const every = Math.ceil(pts.length / (W < 420 ? 3 : 5));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Баллы за тесты: последний ${last.score}`}>
      <defs>
        <linearGradient id={`fg${W}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6fe3d3" stopOpacity=".22" />
          <stop offset="100%" stopColor="#6fe3d3" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid}
      {target ? (
        <>
          <line className="target" x1={L} x2={W - R} y1={y(target)} y2={y(target)} />
          <text className="target-l" x={W - R + 6} y={y(target) + 4}>цель {target}</text>
        </>
      ) : null}
      {pts.length > 1 ? (
        <path d={`${path} L${x(pts.length - 1)} ${y(lo)} L${x(0)} ${y(lo)} Z`} fill={`url(#fg${W})`} />
      ) : null}
      <path className="line" d={path} />
      {pts.map((p, i) => (
        <circle key={i} className="dot" cx={x(i)} cy={y(p.score)} r={i === pts.length - 1 ? 5.5 : 4}>
          <title>{`${p.score} баллов · ${dateRu(p.at, false)}`}</title>
        </circle>
      ))}
      {pts.map((p, i) => ((pts.length - 1 - i) % every === 0 ? (
        <text key={`x${i}`} className="ax" x={x(i)} y={H - 8} textAnchor="middle">{dateRu(p.at, false).replace(/ (\S{3})\S*$/, ' $1')}</text>
      ) : null))}
      <text className="last" x={x(pts.length - 1) + 10} y={y(last.score) + 4}>{last.score}</text>
    </svg>
  );
}

export function ScoreChart({ tests, target }: { tests: TestRow[]; target: number | null }) {
  if (!tests.length) {
    return (
      <div className="empty-card" style={{ padding: '20px 0' }}>
        <p>Пройди пробный тест — здесь будет видно, как растёт балл.</p>
        <a className="btn btn-primary" href={`${MAIN}/test`} target="_blank" rel="noopener noreferrer">Пройти пробный тест</a>
      </div>
    );
  }
  return (
    <div className="chart-wrap">
      <div className="chart-wide">{chartSvg(tests, target, 560)}</div>
      <div className="chart-narrow">{chartSvg(tests, target, 340)}</div>
    </div>
  );
}

/* ---------------------------------------------- точность по разделам */

export function SectionBars({ topics }: { topics: TopicStat[] }) {
  const agg: Record<string, { t: number; r: number }> = {};
  for (const t of topics) {
    const k = t.section || 'other';
    agg[k] = agg[k] || { t: 0, r: 0 };
    agg[k].t += t.total;
    agg[k].r += t.ok;
  }
  const rows = ['iq', 'algebra', 'geometry'].filter((k) => agg[k]?.t);
  if (!rows.length) {
    return (
      <div className="empty-card" style={{ padding: '20px 0' }}>
        <p>Реши задачи в тренажёре — здесь появится точность по логике, алгебре и геометрии.</p>
        <a className="btn btn-ghost" href={`${MAIN}/practice`} target="_blank" rel="noopener noreferrer">Открыть тренажёр</a>
      </div>
    );
  }
  return (
    <div className="acc">
      {rows.map((k) => {
        const pct = Math.round((agg[k].r / agg[k].t) * 100);
        return (
          <div key={k}>
            <div className="acc-row-top"><b>{SECTION_RU[k]}</b><span>{pct} % · {agg[k].t} {plural(agg[k].t, 'задача', 'задачи', 'задач')}</span></div>
            <div className="hbar"><i style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export const tone = (pct: number) => (pct >= 80 ? 'good' : pct >= 55 ? 'mid' : 'low');
