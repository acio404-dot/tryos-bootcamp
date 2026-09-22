import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import { scheduleText } from '@/components/widgets';
import { requireUser } from '@/lib/auth';
import { SECTIONS, can, groupsOfStudent, lessonsDone, studentOfUser } from '@/lib/data';
import { dateRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Мои курсы' };

const COLORS = ['#1E8F8A', '#2C7FB0', '#7A5AC8', '#C9791C', '#1F9D6B'];

export default async function Courses() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const access = student?.access;
  const groups = student && can(access, 'courses') ? await groupsOfStudent(student.id) : [];

  return (
    <Shell user={user} student={student} active="courses">
      <div className="top"><div><h1>Мои курсы</h1><p>Курсы и группы добавляет школа по твоему ID ученика.</p></div></div>

      {!student ? (
        <div className="card empty-card">
          <h2>Привяжи ID ученика</h2>
          <p>ID выдаёт школа после записи на курс. С ним здесь появятся твои курсы, группа, преподаватели и материалы.</p>
          <div style={{ maxWidth: 420, margin: '0 auto' }}><LinkIdForm /></div>
        </div>
      ) : !can(access, 'courses') ? (
        <div className="card empty-card">
          <h2>Раздел закрыт</h2>
          <p>В твоём уровне доступа этот раздел не открыт. Если это ошибка — напиши в школу.</p>
        </div>
      ) : !groups.length ? (
        <div className="card empty-card">
          <h2>Курсов пока нет</h2>
          <p>Школа ещё не добавила тебя в группу. Как только добавит — курс появится здесь.</p>
        </div>
      ) : (
        <div className="grid g-2e">
          {groups.map((g, i) => {
            const color = g.color || COLORS[i % COLORS.length];
            const done = lessonsDone(g);
            const total = g.total_lessons || null;
            return (
              <div className="card course" key={g.id}>
                <div className="course-head">
                  <div>
                    <span className="kicker"><span className="c-dot" style={{ background: color }} />{g.ends && g.ends < new Date().toISOString().slice(0, 10) ? 'Завершён' : 'Идёт'}</span>
                    <h3>{g.course}</h3>
                  </div>
                  {g.name ? <span className="chip" style={{ color, background: `${color}1f` }}>{g.name}</span> : null}
                </div>
                <div className="facts">
                  <div><span>Расписание</span><b>{scheduleText(g.schedule)}</b></div>
                  <div><span>Период</span><b>{g.starts ? dateRu(g.starts, false) : '—'}{g.ends ? ` — ${dateRu(g.ends)}` : ''}</b></div>
                  <div><span>Преподаватель</span><b>{g.teacher || '—'}</b></div>
                  <div><span>Занятия</span><b>{total ? `${Math.min(done, total)} из ${total}` : `${done} прошло`}</b></div>
                </div>
                {total ? (
                  <div>
                    <div className="prog-top"><b>Пройдено занятий</b><span>{Math.min(done, total)} из {total}</span></div>
                    <div className="hbar"><i style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%`, background: color }} /></div>
                  </div>
                ) : null}
                <div className="row">
                  {g.link ? <a className="btn btn-dark" href={g.link} target="_blank" rel="noopener noreferrer">Ссылка на занятие</a> : null}
                  {can(access, 'materials') && g.materials ? <a className="btn btn-ghost" href={g.materials} target="_blank" rel="noopener noreferrer">Материалы</a> : null}
                  {can(access, 'materials') && g.chat ? <a className="btn btn-ghost" href={g.chat} target="_blank" rel="noopener noreferrer">Чат группы</a> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {student ? (
        <div className="card mt">
          <div className="card-head"><h2>Твой доступ</h2></div>
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            ID <span className="code">{student.id}</span> · {access?.level === 'partial' ? 'частичный доступ' : 'полный доступ'}
          </p>
          <ul className="mini-list">
            {SECTIONS.map((s) => (
              <li key={s.key}><span>{s.label}</span><span className={`pill ${can(access, s.key) ? 'on' : ''}`}>{can(access, s.key) ? 'открыто' : 'закрыто'}</span></li>
            ))}
            <li><span>Тренажёр и пробные тесты</span><span className="pill on">открыто</span></li>
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}
