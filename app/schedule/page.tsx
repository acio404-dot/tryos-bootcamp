import Link from 'next/link';
import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import { requireUser } from '@/lib/auth';
import {
  TZ, addDays, can, dowOfIso, eventsOf, groupsOfStudent, nowInTz, studentOfUser, upcomingLessons,
} from '@/lib/data';
import { DOW, dateRu, dateShort, whenRu } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Расписание' };

const COLORS = ['#1E8F8A', '#2C7FB0', '#7A5AC8', '#C9791C', '#1F9D6B'];
const KIND: Record<string, string> = { deadline: 'Сдать', lesson: 'Доп. занятие', exam: 'Экзамен' };

/** Время события в часовом поясе школы: 'HH:MM' и дата. */
function local(iso: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

export default async function Schedule({ searchParams }: { searchParams: { w?: string } }) {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const access = student?.access;
  const allowed = Boolean(student && can(access, 'schedule'));
  const groups = allowed ? await groupsOfStudent(student!.id) : [];

  const shift = Math.max(-12, Math.min(12, parseInt(searchParams?.w || '0', 10) || 0));
  const now = nowInTz();
  const monday = addDays(now.date, -(now.dow - 1) + shift * 7);
  const sunday = addDays(monday, 6);
  const color = (gid: number) => {
    const g = groups.find((x) => x.id === gid);
    return g?.color || COLORS[Math.max(0, groups.findIndex((x) => x.id === gid)) % COLORS.length];
  };

  const events = allowed
    ? await eventsOf(student!.id, groups.map((g) => g.id), `${addDays(monday, -1)}T00:00:00Z`, `${addDays(sunday, 2)}T00:00:00Z`)
    : [];
  const upcoming = upcomingLessons(groups, 14, 8);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const dow = dowOfIso(date);
    const items: { key: string; time: string; html: JSX.Element }[] = [];
    for (const g of groups) {
      if (g.starts && date < g.starts) continue;
      if (g.ends && date > g.ends) continue;
      for (const s of g.schedule || []) {
        if (Number(s.dow) !== dow) continue;
        items.push({
          key: `${g.id}-${s.start}`,
          time: s.start,
          html: (
            <div className="ev tr" style={{ borderColor: color(g.id), background: `${color(g.id)}1a` }}>
              <b>{s.start}–{s.end}</b>{g.course}
              <i>{g.kind === 'solo' ? `индивидуально${g.teacher ? ` · ${g.teacher}` : ''}` : g.name || g.teacher || ''}</i>
            </div>
          ),
        });
      }
    }
    for (const e of events) {
      const l = local(e.at);
      if (l.date !== date) continue;
      items.push({
        key: `e${e.id}`,
        time: l.time,
        html: (
          <div className={`ev ${e.kind === 'deadline' ? 'dl' : 'tk'}`}>
            <b>{KIND[e.kind] || 'Событие'}{e.kind !== 'deadline' ? ` · ${l.time}` : ''}</b>{e.title}
          </div>
        ),
      });
    }
    items.sort((a, b) => a.time.localeCompare(b.time));
    return { date, items };
  });

  return (
    <Shell user={user} student={student} active="schedule">
      <div className="top">
        <div>
          <h1>Расписание</h1>
          <p className="legend" style={{ marginTop: 8 }}>
            {groups.map((g) => (<span key={g.id}><span className="c-dot" style={{ background: color(g.id) }} />{g.course}</span>))}
            {allowed ? <span><span className="c-dot" style={{ background: 'var(--amber)' }} />Срок сдачи</span> : null}
          </p>
        </div>
        {allowed ? (
          <div className="week-nav">
            <Link className="btn btn-ghost btn-sm" href={`/schedule?w=${shift - 1}`} aria-label="Прошлая неделя">‹</Link>
            <b>{dateShort(monday).day} {dateShort(monday).mon} — {dateRu(sunday, false)}</b>
            <Link className="btn btn-ghost btn-sm" href={`/schedule?w=${shift + 1}`} aria-label="Следующая неделя">›</Link>
          </div>
        ) : null}
      </div>

      {!student ? (
        <div className="card empty-card">
          <h2>Привяжи ID ученика</h2>
          <p>Расписание твоих занятий появится здесь после привязки ID.</p>
          <div style={{ maxWidth: 420, margin: '0 auto' }}><LinkIdForm /></div>
        </div>
      ) : !allowed ? (
        <div className="card empty-card"><h2>Раздел закрыт</h2><p>В твоём уровне доступа расписание не открыто. Если это ошибка — напиши в школу.</p></div>
      ) : (
        <>
          <div className="week">
            {days.map((d, i) => (
              <div key={d.date} className={`day${d.date === now.date ? ' today' : ''}${d.items.length ? '' : ' empty'}`}>
                <div className="day-h"><b>{DOW[i]}{d.date === now.date ? ' · сегодня' : ''}</b><span>{dateShort(d.date).day}</span></div>
                {d.items.length ? d.items.map((it) => <div key={it.key}>{it.html}</div>) : <span className="note" style={{ margin: 0 }}>Свободно</span>}
              </div>
            ))}
          </div>
          <p className="note">Время указано по часовому поясу школы ({TZ.replace('Asia/', '').replace('Europe/', '')}).</p>

          <div className="card mt upcoming">
            <div className="card-head"><h2>Ближайшие занятия</h2></div>
            {upcoming.length ? (
              <ul className="list">
                {upcoming.map((l) => (
                  <li key={`${l.date}-${l.group.id}-${l.start}`}>
                    <span className="date-box"><b>{dateShort(l.date).day}</b><span>{dateShort(l.date).mon}</span></span>
                    <span className="txt">
                      <b>{l.group.course}{l.group.name ? ` · ${l.group.name}` : ''}</b>
                      <i>
                        {whenRu(now.date, l.date)}, {l.start}–{l.end}
                        {l.group.kind === 'solo' ? ' · индивидуально' : ''}
                        {l.group.teacher ? ` · ${l.group.teacher}` : ''}
                      </i>
                    </span>
                    {l.group.link ? <a className="go" href={l.group.link} target="_blank" rel="noopener noreferrer">Ссылка →</a> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>В ближайшие две недели занятий нет.</p>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
