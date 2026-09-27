'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Group, Slot } from '@/lib/data';
import { DOW, dateShort, plural, whenRu } from '@/lib/format';
import {
  addStudentEvent, addTeacherEvent, addTeacherScore, deleteStudentEvent, deleteTeacherEvent, deleteTeacherMock, deleteTeacherScore,
  saveGroupLinks, saveTeacherMock, saveTeacherSchedule, setEventLink, setLessonInfo, updateTeacherStudent,
  type TeacherResult,
} from '@/lib/teacher-actions';
import StreakBadge from './StreakBadge';
import MockResults, { type MExam } from './MockResults';
import type { MockBatch } from '@/lib/mock';

export interface TStudent {
  id: string; name: string; group_id: number; streak: number; bound: boolean;
  phone: string | null; note: string | null; exam_name: string | null; exam_date: string | null; exam_city: string | null;
  target_score: number | null; last_score: number | null;
}
export interface TLesson { date: string; start: string; end: string; group_id: number; link: string | null; own: boolean; topic: string | null }
export interface TEvent { id: number; group_id: number | null; student_id?: string | null; kind: string; title: string; link: string | null; note: string | null; batch: string | null; day: string; time: string }
export interface TScore { id: number; student_id: string; student: string; title: string; value: number; max: number; date: string }

const COLORS = ['#1E8F8A', '#2C7FB0', '#7A5AC8', '#C9791C', '#1F9D6B'];
/** Сколько ближайших занятий видно сразу, остальные — по кнопке. */
const SHOWN = 8;
const KIND_RU: Record<string, string> = { lesson: 'доп. занятие', exam: 'тест', deadline: 'срок сдачи' };

const title = (g: Group) => (g.name ? `${g.course} · ${g.name}` : g.course);

function scheduleText(g: Group): string {
  const s = [...(g.schedule || [])].sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
  if (!s.length) return 'без постоянного расписания';
  return s.map((x) => `${DOW[x.dow - 1]} ${x.start}`).join(', ');
}

/** Серверное действие + обновление страницы + текст ошибки. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const run = (fn: () => Promise<TeacherResult>, then?: () => void) => {
    setError('');
    start(async () => {
      try {
        const r = await fn();
        if (r.error) { setError(r.error); return; }
        then?.();
        router.refresh();
      } catch {
        setError('Не получилось сохранить. Обнови страницу и попробуй ещё раз');
      }
    });
  };
  return { pending, error, run };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

type Tab = 'lessons' | 'groups' | 'students' | 'mocks' | 'scores';

export default function TeachPanel({
  groups, students, lessons, events, scores, mocks, exams, today,
}: {
  groups: Group[]; students: TStudent[]; lessons: TLesson[]; events: TEvent[]; scores: TScore[];
  mocks: MockBatch[]; exams: MExam[]; today: string;
}) {
  const [tab, setTab] = useState<Tab>('lessons');
  // ученик, открытый во вкладке «Ученики» (по нажатию на имя в группе)
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const showStudent = (id: string) => { setOpenStudent(id); setTab('students'); window.scrollTo({ top: 0 }); };
  const people = useMemo(() => {
    const seen = new Set<string>();
    return students.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [students]);
  const nameOf = (id: string | null | undefined) => people.find((p) => p.id === id)?.name || '';
  const colorOf = (id: number | null) => {
    const i = groups.findIndex((g) => g.id === id);
    return groups[i]?.color || COLORS[Math.max(0, i) % COLORS.length];
  };
  const groupOf = (id: number | null) => groups.find((g) => g.id === id);

  return (
    <div className="teach">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'lessons'} className={tab === 'lessons' ? 'on' : ''} onClick={() => setTab('lessons')}>Занятия</button>
        <button type="button" role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Мои группы · {groups.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>Ученики · {people.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'mocks'} className={tab === 'mocks' ? 'on' : ''} onClick={() => setTab('mocks')}>Баллы за пробники</button>
        <button type="button" role="tab" aria-selected={tab === 'scores'} className={tab === 'scores' ? 'on' : ''} onClick={() => setTab('scores')}>Оценки</button>
      </div>

      {tab === 'lessons' ? (
        <div className="grid" style={{ gap: 16 }}>
          <Upcoming lessons={lessons} events={events} today={today} groupOf={groupOf} colorOf={colorOf} nameOf={nameOf} />
          <NewLesson groups={groups} today={today} colorOf={colorOf} />
        </div>
      ) : tab === 'groups' ? (
        <div className="t-groups">
          {groups.map((g) => (
            <GroupCard key={g.id} g={g} color={colorOf(g.id)} people={students.filter((s) => s.group_id === g.id)}
              deadlines={events.filter((e) => e.group_id === g.id && e.kind === 'deadline')} onStudent={showStudent} />
          ))}
        </div>
      ) : tab === 'students' ? (
        <StudentsTab groups={groups} students={students} people={people} events={events} today={today}
          open={openStudent} setOpen={setOpenStudent} colorOf={colorOf} />
      ) : tab === 'mocks' ? (
        <MockResults groups={groups} students={students} batches={mocks} exams={exams} today={today} save={saveTeacherMock} remove={deleteTeacherMock} />
      ) : (
        <Scores groups={groups} students={students} scores={scores} today={today} />
      )}
    </div>
  );
}

/* ------------------------------------------------- ближайшие занятия */

type Row =
  | { type: 'lesson'; key: string; date: string; time: string; l: TLesson }
  | { type: 'event'; key: string; date: string; time: string; e: TEvent };

function Upcoming({
  lessons, events, today, groupOf, colorOf, nameOf,
}: {
  lessons: TLesson[]; events: TEvent[]; today: string; groupOf: (id: number | null) => Group | undefined;
  colorOf: (id: number | null) => string; nameOf: (id: string | null | undefined) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows: Row[] = useMemo(() => [
    ...lessons.map((l) => ({ type: 'lesson' as const, key: `l-${l.group_id}-${l.date}-${l.start}`, date: l.date, time: l.start, l })),
    ...events.filter((e) => e.kind !== 'deadline' && e.day >= today)
      .map((e) => ({ type: 'event' as const, key: `e-${e.id}`, date: e.day, time: e.time, e })),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 30), [lessons, events, today]);
  const noLink = rows.filter((r) => (r.type === 'lesson' ? !r.l.link : !r.e.link) && r.date <= today).length;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Ближайшие занятия</h2>
        <span className="note" style={{ margin: 0 }}>2 недели · нажми «Ссылка», чтобы вставить ссылку на урок</span>
      </div>
      {noLink ? <p className="t-warn">Сегодня без ссылки: {noLink} {plural(noLink, 'занятие', 'занятия', 'занятий')}. Ученики не смогут подключиться.</p> : null}
      {rows.length ? (
        <>
        <ul className="list t-lessons">
          {(all ? rows : rows.slice(0, SHOWN)).map((r) => {
            const gid = r.type === 'lesson' ? r.l.group_id : r.e.group_id;
            const g = groupOf(gid);
            const link = r.type === 'lesson' ? r.l.link : r.e.link;
            const isOpen = open === r.key;
            return (
              <li key={r.key} className={isOpen ? 'on' : undefined}>
                <div className="t-row">
                  <span className="date-box" style={{ boxShadow: `inset 3px 0 0 ${colorOf(gid)}` }}>
                    <b>{dateShort(r.date).day}</b><span>{dateShort(r.date).mon}</span>
                  </span>
                  <span className="txt">
                    <b>{r.type === 'event' ? r.e.title : g ? title(g) : 'Группа'}</b>
                    <i>
                      {whenRu(today, r.date)}, {r.type === 'lesson' ? `${r.l.start}–${r.l.end}` : r.e.time}
                      {r.type === 'event' ? ` · ${KIND_RU[r.e.kind] || 'занятие'} · ${g ? title(g) : nameOf(r.e.student_id) ? `лично: ${nameOf(r.e.student_id)}` : ''}` : g?.kind === 'solo' ? ' · индивидуально' : ''}
                      {r.type === 'lesson' && r.l.topic ? ` · ${r.l.topic}` : ''}
                    </i>
                    {link
                      ? <a className="t-link" href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, '').slice(0, 42)}</a>
                      : <span className="t-nolink">без ссылки</span>}
                  </span>
                  <button type="button" className={`btn btn-sm ${link ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}>
                    {isOpen ? 'Закрыть' : link ? 'Ссылка' : '+ Ссылка'}
                  </button>
                </div>
                {isOpen ? (
                  r.type === 'lesson'
                    ? <LessonEditor l={r.l} groupLink={g?.link || null} onDone={() => setOpen(null)} />
                    : <EventEditor e={r.e} onDone={() => setOpen(null)} />
                ) : null}
              </li>
            );
          })}
        </ul>
        {rows.length > SHOWN ? (
          <button type="button" className="btn btn-ghost btn-sm t-more" onClick={() => setAll(!all)}>
            {all ? 'Свернуть' : `Показать все · ${rows.length}`}
          </button>
        ) : null}
        </>
      ) : <p className="muted" style={{ margin: 0 }}>В ближайшие две недели занятий нет. Поставь занятие ниже.</p>}
    </div>
  );
}

/** Вставка из буфера обмена: на телефоне так проще, чем долгое нажатие. */
function PasteButton({ onPaste }: { onPaste: (s: string) => void }) {
  // проверяем после монтирования: на сервере буфера обмена нет, иначе разметка разойдётся
  const [can, setCan] = useState(false);
  useEffect(() => { setCan(Boolean(navigator.clipboard?.readText)); }, []);
  if (!can) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
      try { const t = (await navigator.clipboard.readText()).trim(); if (t) onPaste(t); } catch { /* нет доступа к буферу */ }
    }}>Вставить</button>
  );
}

function LinkInput({ value, onChange, autoFocus }: { value: string; onChange: (s: string) => void; autoFocus?: boolean }) {
  return (
    <div className="t-linkin">
      <input className="input" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="https://zoom.us/j/… или meet.google.com/…" autoFocus={autoFocus} />
      <PasteButton onPaste={onChange} />
    </div>
  );
}

function LessonEditor({ l, groupLink, onDone }: { l: TLesson; groupLink: string | null; onDone: () => void }) {
  const act = useAction();
  const [link, setLink] = useState(l.own ? l.link || '' : '');
  const [topic, setTopic] = useState(l.topic || '');
  return (
    <form className="form t-edit" onSubmit={(e) => { e.preventDefault(); act.run(() => setLessonInfo(l.group_id, l.date, l.start, { link, topic }), onDone); }}>
      <Field label="Ссылка на это занятие" hint={groupLink ? `Пусто — постоянная ссылка группы: ${groupLink.replace(/^https?:\/\//, '')}` : 'У группы нет постоянной ссылки — её можно задать во вкладке «Мои группы»'}>
        <LinkInput value={link} onChange={setLink} autoFocus />
      </Field>
      <Field label="Тема" hint="Необязательно — ученики увидят её на главной">
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Логарифмы, разбор пробника…" />
      </Field>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Сохранить'}</button>
        {l.own || l.topic ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={act.pending}
            onClick={() => act.run(() => setLessonInfo(l.group_id, l.date, l.start, {}), onDone)}>Сбросить</button>
        ) : null}
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

function EventEditor({ e, onDone }: { e: TEvent; onDone: () => void }) {
  const act = useAction();
  const [link, setLink] = useState(e.link || '');
  return (
    <form className="form t-edit" onSubmit={(ev) => { ev.preventDefault(); act.run(() => setEventLink(e.id, link), onDone); }}>
      <Field label="Ссылка"><LinkInput value={link} onChange={setLink} autoFocus /></Field>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Сохранить'}</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={act.pending}
          onClick={() => { if (confirm(`Отменить «${e.title}»? Ученики перестанут его видеть.`)) act.run(() => (e.group_id ? deleteTeacherEvent(e.id) : deleteStudentEvent(e.id)), onDone); }}>Отменить занятие</button>
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

/* -------------------------------------------------- поставить занятие */

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function NewLesson({ groups, today, colorOf }: { groups: Group[]; today: string; colorOf: (id: number) => string }) {
  const act = useAction();
  const blank = { kind: 'lesson', title: '', date: '', time: '', link: '', note: '' };
  const [v, setV] = useState(blank);
  const [picked, setPicked] = useState<number[]>(groups.length === 1 ? [groups[0].id] : []);
  const [ok, setOk] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setOk(''); setV({ ...v, [k]: e.target.value }); };
  const toggle = (id: number) => { setOk(''); setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]); };
  const quick = [['Сегодня', today], ['Завтра', addDaysIso(today, 1)], ['Через неделю', addDaysIso(today, 7)]] as const;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(() => addTeacherEvent({ ...v, groups: picked }), () => {
      setOk(`Поставлено: ${v.title}, ${whenRu(today, v.date).toLowerCase()}${v.time ? ` в ${v.time}` : ''}`);
      setV({ ...blank, kind: v.kind });
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Поставить занятие</h2>
        <span className="note" style={{ margin: 0 }}>появится в расписании учеников</span>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="seg">
          {[['lesson', 'Доп. занятие'], ['exam', 'Тест'], ['deadline', 'Срок сдачи']].map(([k, label]) => (
            <button key={k} type="button" className={v.kind === k ? 'on' : ''} onClick={() => { setOk(''); setV({ ...v, kind: k }); }}>{label}</button>
          ))}
        </div>

        <div className="field">
          <span className="field-label">Кому</span>
          <div className="checks">
            {groups.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} />
                <span className="c-dot" style={{ background: colorOf(g.id) }} />
                {title(g)}{g.kind === 'solo' ? ' · инд.' : ''}
              </label>
            ))}
          </div>
        </div>

        <Field label="Название">
          <input className="input" required value={v.title} onChange={set('title')}
            placeholder={v.kind === 'exam' ? 'Пробный тест по геометрии' : v.kind === 'deadline' ? 'Домашнее задание №5' : 'Разбор ошибок пробника'} />
        </Field>

        <div className="fields-2">
          <Field label="Дата">
            <input className="input" type="date" required min={today} value={v.date} onChange={set('date')} />
            <span className="t-quick">
              {quick.map(([label, d]) => (
                <button key={label} type="button" className={v.date === d ? 'on' : ''} onClick={() => { setOk(''); setV({ ...v, date: d }); }}>{label}</button>
              ))}
            </span>
          </Field>
          <Field label="Время" hint={v.kind === 'deadline' ? 'Пусто — до 23:59' : 'Пусто — 10:00'}>
            <input className="input" type="time" value={v.time} onChange={set('time')} />
          </Field>
        </div>

        {v.kind !== 'deadline' ? (
          <Field label="Ссылка" hint="Zoom, Meet или ссылка на тест. Можно добавить позже">
            <LinkInput value={v.link} onChange={(s) => { setOk(''); setV({ ...v, link: s }); }} />
          </Field>
        ) : null}
        <Field label={v.kind === 'deadline' ? 'Что сдать' : 'Где'} hint="Необязательно">
          <input className="input" value={v.note} onChange={set('note')} placeholder={v.kind === 'deadline' ? 'Задачи 1–20 из пробника' : 'Онлайн'} />
        </Field>

        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-dark" disabled={act.pending || !picked.length}>{act.pending ? 'Ставлю…' : 'Поставить'}</button>
          {ok ? <p className="okmsg">{ok}</p> : null}
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------ группы */

function GroupCard({
  g, color, people, deadlines, onStudent,
}: {
  g: Group; color: string; people: TStudent[]; deadlines: TEvent[]; onStudent: (id: string) => void;
}) {
  const [editSchedule, setEditSchedule] = useState(false);
  const act = useAction();
  const [v, setV] = useState({ link: g.link || '', chat: g.chat || '', materials: g.materials || '' });
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof v) => (s: string) => { setSaved(false); setV({ ...v, [k]: s }); };

  return (
    <div className="card t-group">
      <div className="t-group-head">
        <span className="c-dot" style={{ background: color, width: 12, height: 12 }} />
        <div className="grow">
          <b>{title(g)}</b>
          <i>{g.kind === 'solo' ? 'индивидуально · ' : ''}{scheduleText(g)}</i>
        </div>
        <span className="pill">{`${people.length} уч.`}</span>
      </div>

      {people.length ? (
        <ul className="t-people">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onStudent(p.id)} title="Открыть карточку ученика">{p.name}<StreakBadge n={p.streak} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ fontSize: 13.5 }}>{g.kind === 'solo' ? 'Ученик не выбран' : 'В группе пока нет учеников'} — их добавляет администратор.</p>}

      <div className="t-sched">
        <div className="t-sched-head">
          <span><b>Расписание</b>{g.starts || g.ends ? <i> · {g.starts ? g.starts.split('-').reverse().join('.') : '…'} – {g.ends ? g.ends.split('-').reverse().join('.') : '…'}</i> : null}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditSchedule(!editSchedule)} aria-expanded={editSchedule}>
            {editSchedule ? 'Закрыть' : 'Изменить'}
          </button>
        </div>
        {editSchedule ? <ScheduleEditor g={g} onDone={() => setEditSchedule(false)} /> : null}
      </div>

      <form className="form" onSubmit={(e) => { e.preventDefault(); act.run(() => saveGroupLinks(g.id, v), () => setSaved(true)); }}>
        <Field label="Постоянная ссылка на урок" hint="Ученики увидят кнопку «Подключиться» перед каждым занятием">
          <LinkInput value={v.link} onChange={set('link')} />
        </Field>
        <div className="fields-2">
          <Field label={g.kind === 'solo' ? 'Чат с учеником' : 'Чат группы'}>
            <input className="input" value={v.chat} onChange={(e) => set('chat')(e.target.value)} placeholder="https://t.me/…" />
          </Field>
          <Field label="Материалы">
            <input className="input" value={v.materials} onChange={(e) => set('materials')(e.target.value)} placeholder="Google Drive, Notion…" />
          </Field>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Сохранить ссылки'}</button>
          {saved ? <p className="okmsg">Сохранено</p> : null}
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>

      {deadlines.length ? (
        <>
          <h3 className="a-h" style={{ marginTop: 16 }}>Сроки сдачи</h3>
          <ul className="mini-list" style={{ marginTop: 0 }}>
            {deadlines.map((d) => (
              <li key={d.id}>
                <span className="who">{d.title}<span className="muted"> · {d.day.slice(8)}.{d.day.slice(5, 7)}{d.time !== '23:59' ? ` ${d.time}` : ''}</span></span>
                <button type="button" className="linklike" disabled={act.pending}
                  onClick={() => { if (confirm(`Убрать срок «${d.title}»?`)) act.run(() => deleteTeacherEvent(d.id)); }}>Убрать</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ оценки */

function Scores({ groups, students, scores, today }: { groups: Group[]; students: TStudent[]; scores: TScore[]; today: string }) {
  const act = useAction();
  const [who, setWho] = useState('');
  const [v, setV] = useState({ title: '', value: '', max: '100', date: today });
  const [ok, setOk] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setOk(''); setV({ ...v, [k]: e.target.value }); };
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || '';

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>Поставить оценку</h2>
          <span className="note" style={{ margin: 0 }}>ученик увидит её в «Прогрессе»</span>
        </div>
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          act.run(() => addTeacherScore(who, v), () => { setOk(`${nameOf(who)}: ${v.title} — ${v.value}/${v.max}`); setV({ ...v, value: '' }); });
        }}>
          <Field label="Ученик">
            <select className="select" required value={who} onChange={(e) => { setOk(''); setWho(e.target.value); }}>
              <option value="">— выбери ученика —</option>
              {groups.map((g) => {
                const ps = students.filter((s) => s.group_id === g.id);
                return ps.length ? (
                  <optgroup key={g.id} label={title(g)}>
                    {ps.map((p) => <option key={`${g.id}-${p.id}`} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </Field>
          <Field label="За что">
            <input className="input" required value={v.title} onChange={set('title')} placeholder="Домашка №5, контрольная по геометрии…" />
          </Field>
          <div className="fields-3">
            <Field label="Балл"><input className="input" required inputMode="decimal" value={v.value} onChange={set('value')} placeholder="18" /></Field>
            <Field label="Из"><input className="input" required inputMode="decimal" value={v.max} onChange={set('max')} /></Field>
            <Field label="Дата"><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn btn-dark" disabled={act.pending || !who}>{act.pending ? 'Сохраняю…' : 'Поставить'}</button>
            {ok ? <p className="okmsg">{ok}</p> : null}
            {act.error ? <p className="err">{act.error}</p> : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head"><h2>Мои оценки</h2></div>
        {scores.length ? (
          <ul className="mini-list" style={{ marginTop: 0 }}>
            {scores.map((s) => (
              <li key={s.id}>
                <span className="who">
                  <b>{s.student}</b> · {s.title}
                  <span className="muted"> · {s.date.slice(8)}.{s.date.slice(5, 7)}</span>
                </span>
                <b>{s.value}/{s.max}</b>
                <button type="button" className="linklike" disabled={act.pending}
                  onClick={() => { if (confirm(`Удалить оценку «${s.title}» у ${s.student}?`)) act.run(() => deleteTeacherScore(s.id)); }}>Удалить</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0 }}>Пока нет оценок.</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- расписание */

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function ScheduleEditor({ g, onDone }: { g: Group; onDone: () => void }) {
  const act = useAction();
  const [slots, setSlots] = useState<Slot[]>(g.schedule?.length ? g.schedule.map((x) => ({ ...x, dow: Number(x.dow) })) : [{ dow: 1, start: '19:00', end: '20:30' }]);
  const [v, setV] = useState({ starts: g.starts || '', ends: g.ends || '', total: g.total_lessons != null ? String(g.total_lessons) : '' });
  const setSlot = (i: number, patch: Partial<Slot>) => setSlots(slots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => {
    const last = slots[slots.length - 1];
    setSlots([...slots, last ? { dow: Math.min(7, last.dow + 2), start: last.start, end: last.end } : { dow: 1, start: '19:00', end: '20:30' }]);
  };

  return (
    <form className="form t-edit t-edit-flat" onSubmit={(e) => {
      e.preventDefault();
      if (!confirm('Сохранить новое расписание? Ученики сразу увидят его в «Расписании».')) return;
      act.run(() => saveTeacherSchedule(g.id, { schedule: slots, ...v }), onDone);
    }}>
      <div className="field">
        <span className="field-label">Занятия по неделям</span>
        <div className="grid" style={{ gap: 8 }}>
          {slots.map((x, i) => (
            <div className="slot" key={i}>
              <select className="select" value={x.dow} onChange={(e) => setSlot(i, { dow: Number(e.target.value) })} aria-label="День недели">
                {DAYS.map((d, k) => <option key={k} value={k + 1}>{d}</option>)}
              </select>
              <input className="input" type="time" value={x.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label="Начало" />
              <input className="input" type="time" value={x.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label="Конец" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label="Убрать день">✕</button>
            </div>
          ))}
        </div>
        <div><button type="button" className="linklike" onClick={add} style={{ marginTop: 4 }}>+ Ещё день</button></div>
        <small>Время — по часовому поясу школы. Разовое занятие лучше поставить во вкладке «Занятия».</small>
      </div>
      <div className="fields-3">
        <Field label="Начало курса"><input className="input" type="date" value={v.starts} onChange={(e) => setV({ ...v, starts: e.target.value })} /></Field>
        <Field label="Конец курса"><input className="input" type="date" value={v.ends} onChange={(e) => setV({ ...v, ends: e.target.value })} /></Field>
        <Field label="Всего занятий"><input className="input" inputMode="numeric" value={v.total} onChange={(e) => setV({ ...v, total: e.target.value.replace(/\D/g, '') })} placeholder="48" /></Field>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Сохранить расписание'}</button>
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ ученики */

function StudentsTab({
  groups, students, people, events, today, open, setOpen, colorOf,
}: {
  groups: Group[]; students: TStudent[]; people: TStudent[]; events: TEvent[]; today: string;
  open: string | null; setOpen: (id: string | null) => void; colorOf: (id: number | null) => string;
}) {
  const [q, setQ] = useState('');
  const list = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groupsOf = (id: string) => students.filter((s) => s.id === id).map((s) => groups.find((g) => g.id === s.group_id)).filter(Boolean) as Group[];

  return (
    <div className="card">
      <div className="a-toolbar">
        <p className="muted" style={{ margin: 0, flex: '1 1 260px' }}>
          Все ученики твоих групп и индивидуальных занятий. Можно поменять данные, экзамен, цель и поставить личный срок.
        </p>
        {people.length > 8 ? <input className="input" type="search" placeholder="Поиск ученика" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} /> : null}
      </div>
      <div className="a-list" style={{ marginTop: 14 }}>
        {list.map((p) => {
          const gs = groupsOf(p.id);
          const isOpen = open === p.id;
          return (
            <div className="a-row" key={p.id}>
              <div className="a-row-head">
                <div className="grow">
                  <b className="who">{p.name}<StreakBadge n={p.streak} /></b>
                  <i>
                    {gs.map((g) => (g.kind === 'solo' ? `${g.course} (инд.)` : title(g))).join(', ')}
                    {p.exam_date ? ` · экзамен ${p.exam_date.split('-').reverse().join('.')}` : ''}
                  </i>
                </div>
                {p.last_score != null ? <span className="pill" title="Последний пробник">{p.last_score}{p.target_score ? ` / цель ${p.target_score}` : ''}</span> : null}
                {p.bound ? null : <span className="pill warn" title="Ученик ещё не ввёл свой ID">не вошёл</span>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                  {isOpen ? 'Свернуть' : 'Открыть'}
                </button>
              </div>
              {isOpen ? (
                <div className="a-row-body">
                  <div className="a-split">
                    <section>
                      <h3 className="a-h">Данные ученика</h3>
                      <StudentEditor p={p} />
                    </section>
                    <section>
                      <h3 className="a-h">Личные сроки и занятия</h3>
                      <StudentEvents p={p} events={events.filter((e) => e.student_id === p.id)} today={today} />
                      <h3 className="a-h" style={{ marginTop: 22 }}>Группы</h3>
                      <ul className="t-people">
                        {gs.map((g) => (
                          <li key={g.id}><span className="c-dot" style={{ background: colorOf(g.id) }} />{title(g)}{g.kind === 'solo' ? ' · инд.' : ''}</li>
                        ))}
                      </ul>
                      <small className="muted">Перевести в другую группу или поменять доступ может администратор.</small>
                    </section>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!list.length ? <p className="muted" style={{ margin: 0 }}>Никого не нашлось.</p> : null}
      </div>
    </div>
  );
}

function StudentEditor({ p }: { p: TStudent }) {
  const act = useAction();
  const [saved, setSaved] = useState(false);
  const [v, setV] = useState({
    name: p.name, phone: p.phone || '', note: p.note || '',
    examName: p.exam_name || '', examDate: p.exam_date || '', examCity: p.exam_city || '',
    target: p.target_score != null ? String(p.target_score) : '',
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setV({ ...v, [k]: e.target.value }); };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act.run(() => updateTeacherStudent(p.id, v), () => setSaved(true)); }}>
      <div className="fields-2">
        <Field label="Имя и фамилия"><input className="input" required value={v.name} onChange={set('name')} /></Field>
        <Field label="Телефон или Telegram"><input className="input" value={v.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" /></Field>
      </div>
      <div className="fields-3">
        <Field label="Экзамен"><input className="input" value={v.examName} onChange={set('examName')} placeholder="TR-YÖS 2027" /></Field>
        <Field label="Дата экзамена"><input className="input" type="date" value={v.examDate} onChange={set('examDate')} /></Field>
        <Field label="Цель, баллов"><input className="input" inputMode="numeric" value={v.target} onChange={set('target')} placeholder="400" /></Field>
      </div>
      <Field label="Город / университет экзамена"><input className="input" value={v.examCity} onChange={set('examCity')} placeholder="Стамбул" /></Field>
      <Field label="Заметка" hint="Видят учителя и админ, ученик — нет">
        <textarea className="input" rows={2} value={v.note} onChange={set('note')} placeholder="Слабые темы, договорённости…" />
      </Field>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Сохранить'}</button>
        {saved ? <p className="okmsg">Сохранено</p> : null}
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

function StudentEvents({ p, events, today }: { p: TStudent; events: TEvent[]; today: string }) {
  const act = useAction();
  const blank = { kind: 'deadline', title: '', date: '', time: '', link: '' };
  const [v, setV] = useState(blank);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <>
      {events.length ? (
        <ul className="mini-list" style={{ marginTop: 0 }}>
          {events.map((e) => (
            <li key={e.id}>
              <span className="who">
                {e.title}<span className="muted"> · {KIND_RU[e.kind] || 'срок'} · {e.day.slice(8)}.{e.day.slice(5, 7)}{e.time !== '23:59' ? ` ${e.time}` : ''}</span>
              </span>
              <button type="button" className="linklike" disabled={act.pending}
                onClick={() => { if (confirm(`Убрать «${e.title}»?`)) act.run(() => deleteStudentEvent(e.id)); }}>Убрать</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: '0 0 10px', fontSize: 13.5 }}>Личных сроков нет.</p>}
      <form className="form" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); act.run(() => addStudentEvent(p.id, v), () => setV({ ...blank, kind: v.kind })); }}>
        <div className="fields-2">
          <Field label="Что">
            <select className="select" value={v.kind} onChange={set('kind')}>
              <option value="deadline">Срок сдачи</option>
              <option value="lesson">Отдельное занятие</option>
              <option value="exam">Тест</option>
            </select>
          </Field>
          <Field label="Название"><input className="input" required value={v.title} onChange={set('title')} placeholder="Исправить ошибки пробника" /></Field>
        </div>
        <div className="fields-2">
          <Field label="Дата"><input className="input" type="date" required min={today} value={v.date} onChange={set('date')} /></Field>
          <Field label="Время" hint={v.kind === 'deadline' ? 'Пусто — до 23:59' : 'Пусто — 10:00'}><input className="input" type="time" value={v.time} onChange={set('time')} /></Field>
        </div>
        {v.kind !== 'deadline' ? <Field label="Ссылка"><LinkInput value={v.link} onChange={(s) => setV({ ...v, link: s })} /></Field> : null}
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-dark btn-sm" disabled={act.pending}>{act.pending ? 'Сохраняю…' : 'Поставить'}</button>
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>
    </>
  );
}
