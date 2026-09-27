'use client';

/*
 * Админка: ученики (ID, доступ, экзамен, группы, баллы), группы и
 * индивидуальные занятия (курс, расписание, ссылки, сроки). Группа и
 * индивидуалка устроены одинаково и отличаются полем kind: у индивидуальной
 * ученик ровно один и выбирается прямо в карточке занятия.
 * Все изменения идут через серверные действия из lib/admin-actions —
 * они сами проверяют, что вошёл админ.
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  addEvent, addEvents, addScore, createStudent, deleteEvent, deleteEventBatch, deleteGroup, deleteScore,
  deleteStudent, saveGroup, setExamDate, unbindStudent, updateStudent,
  createTeacher, deleteTeacher, unbindTeacher, updateTeacher,
  type AdminResult, type EventInput, type GroupInput, type StudentInput, type TeacherInput,
} from '@/lib/admin-actions';
import { SECTIONS, type Access, type Section } from '@/lib/access';
import StreakBadge from './StreakBadge';
import TeacherTag, { TeacherName } from './TeacherTag';
import { DOW, dateShort, plural } from '@/lib/format';

/** '2027-04-11' → '11 апр 2027' (год — только если не текущий). */
function short(iso: string | null | undefined): string {
  if (!iso) return '';
  const { day, mon } = dateShort(iso);
  const y = iso.slice(0, 4);
  return `${day} ${mon}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
}

/* ---------------------------------------------------------------- типы */

export interface AStudent {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  access: Access | null;
  exam_name: string | null;
  exam_date: string | null;
  exam_city: string | null;
  target_score: number | null;
  user_id: string | null;
  username: string | null;
  user_name: string | null;
  tg_username: string | null;
  email: string | null;
  last_seen: string | null;
  /** Текущий стрик ученика (дней подряд с решёнными задачами). */
  streak?: number;
}
export interface ASlot { dow: number; start: string; end: string }
export type AKind = 'group' | 'solo';
export interface AGroup {
  id: number;
  kind: AKind;
  course: string;
  name: string;
  teacher: string | null;
  teacher_id?: string | null;
  schedule: ASlot[] | null;
  starts: string | null;
  ends: string | null;
  total_lessons: number | null;
  link: string | null;
  chat: string | null;
  materials: string | null;
  color: string | null;
}
export interface AMember { student_id: string; group_id: number }
export interface ATeacher {
  id: string; name: string; phone: string | null; note: string | null; user_id: string | null;
  username?: string | null; tg_username?: string | null; email?: string | null; last_seen?: string | null;
}
export interface AScore { id: number; student_id: string; title: string; value: number; max: number; teacher: string | null; date: string }
export interface AEvent {
  id: number;
  group_id: number | null;
  student_id: string | null;
  kind: string;
  title: string;
  at: string;
  scope?: string | null;
  batch?: string | null;
  link?: string | null;
  note?: string | null;
}

const COLORS = ['#1E8F8A', '#2C7FB0', '#7A5AC8', '#C9791C', '#1F9D6B'];
const KIND_RU: Record<string, string> = { deadline: 'Срок', lesson: 'Доп. занятие', exam: 'Пробный экзамен' };
const SITE = 'bootcamp.tryoszone.com';

/** Как называется сущность в текстах: группа или индивидуальные занятия. */
const WORD = {
  group: {
    one: 'группа', oneAcc: 'группу', title: 'Группы', newOne: 'Новая группа',
    add: '+ Новая группа', create: 'Создать группу', del: 'Удалить группу',
    about: 'Группа — это курс с преподавателем и расписанием. Ученики видят свои группы в «Мои курсы» и «Расписание».',
    none: 'Групп пока нет.',
  },
  solo: {
    one: 'индивидуальные занятия', oneAcc: 'индивидуальные занятия', title: 'Индивидуально', newOne: 'Новые индивидуальные занятия',
    add: '+ Новые занятия', create: 'Создать занятия', del: 'Удалить занятия',
    about: 'Индивидуальные занятия — тот же курс с расписанием, но с одним учеником. Он видит их в «Мои курсы» и «Расписание» наравне с группами.',
    none: 'Индивидуальных занятий пока нет.',
  },
} as const;

/* --------------------------------------------------------- общие штуки */

/** Запуск серверного действия с сообщением об ошибке и обновлением страницы. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const run = (fn: () => Promise<AdminResult>, then?: (r: AdminResult) => void) => {
    setError('');
    start(async () => {
      try {
        const r = await fn();
        if (r.error) { setError(r.error); return; }
        then?.(r);
        router.refresh();
      } catch {
        setError('Не получилось сохранить. Обнови страницу и попробуй ещё раз');
      }
    });
  };
  return { pending, error, setError, run };
}

function scheduleText(slots: ASlot[] | null): string {
  if (!slots?.length) return 'без расписания';
  const sorted = [...slots].sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
  const same = sorted.every((s) => s.start === sorted[0].start && s.end === sorted[0].end);
  if (same) return `${sorted.map((s) => DOW[s.dow - 1]).join(', ')} · ${sorted[0].start}–${sorted[0].end}`;
  return sorted.map((s) => `${DOW[s.dow - 1]} ${s.start}`).join(', ');
}

const groupTitle = (g: AGroup) => (g.name ? `${g.course} · ${g.name}` : g.course);
const colorOf = (g: AGroup, i: number) => g.color || COLORS[i % COLORS.length];
const isSolo = (g: AGroup) => g.kind === 'solo';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function CopyButton({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{done ? 'Скопировано ✓' : label}</button>;
}

const teacherInvite = (id: string, name: string) =>
  `${name.split(' ')[0]}, здравствуйте! Ваш ID учителя TR-YÖS Zone: ${id}\n\n` +
  `1. Откройте ${SITE}\n2. Войдите через Google, Telegram или создайте логин и пароль\n3. Введите ID — откроется кабинет учителя с вашими группами.`;

const invite = (id: string, name: string) =>
  `${name.split(' ')[0]}, привет! Твой ID ученика TR-YÖS Zone: ${id}\n\n` +
  `1. Открой ${SITE}\n2. Войди через Google, Telegram или создай логин и пароль\n3. Введи ID — откроются твои курсы, расписание и баллы.`;

/* ============================================================ панель */

export default function AdminPanel({
  students, groups, members, scores, events, teachers,
}: {
  students: AStudent[];
  groups: AGroup[];
  members: AMember[];
  scores: AScore[];
  events: AEvent[];
  teachers: ATeacher[];
}) {
  const [tab, setTab] = useState<'students' | 'teachers' | 'group' | 'solo' | 'events' | 'exam'>('students');
  const inGroups = groups.filter((g) => !isSolo(g));
  const solos = groups.filter(isSolo);
  const planned = events.filter((e) => e.batch).length;

  return (
    <>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>
          Ученики · {students.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'teachers'} className={tab === 'teachers' ? 'on' : ''} onClick={() => setTab('teachers')}>
          Учителя · {teachers.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'group'} className={tab === 'group' ? 'on' : ''} onClick={() => setTab('group')}>
          Группы · {inGroups.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>
          Индивидуально · {solos.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>
          Занятия и тесты{planned ? ` · ${planned}` : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'exam'} className={tab === 'exam' ? 'on' : ''} onClick={() => setTab('exam')}>
          Дата экзамена
        </button>
      </div>
      {tab === 'students' ? (
        <StudentsTab students={students} groups={groups} members={members} scores={scores} events={events} />
      ) : tab === 'teachers' ? (
        <TeachersTab teachers={teachers} groups={groups} members={members} />
      ) : tab === 'exam' ? (
        <ExamTab students={students} groups={groups} members={members} />
      ) : tab === 'events' ? (
        <EventsTab students={students} groups={groups} members={members} events={events} />
      ) : (
        <CoursesTab kind={tab} students={students} groups={tab === 'solo' ? solos : inGroups} members={members} events={events} teachers={teachers} />
      )}
    </>
  );
}

/* ============================================================ ученики */

function StudentsTab({
  students, groups, members, scores, events,
}: {
  students: AStudent[]; groups: AGroup[]; members: AMember[]; scores: AScore[]; events: AEvent[];
}) {
  const [creating, setCreating] = useState(students.length === 0);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'bound' | 'free'>('all');
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return students.filter((st) => {
      if (filter === 'bound' && !st.user_id) return false;
      if (filter === 'free' && st.user_id) return false;
      if (!s) return true;
      return [st.name, st.id, st.phone, st.username, st.tg_username, st.email, st.user_name]
        .some((v) => v && v.toLowerCase().includes(s));
    });
  }, [students, q, filter]);

  const bound = students.filter((s) => s.user_id).length;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {created ? (
        <div className="newcode">
          <div style={{ flex: '1 1 240px' }}>
            <b>ID для {created.name}</b>
            <div className="muted" style={{ fontSize: 13 }}>Отправь ученику — он введёт ID после входа на {SITE}.</div>
          </div>
          <span className="code">{created.id}</span>
          <CopyButton text={created.id} label="Копировать ID" />
          <CopyButton text={invite(created.id, created.name)} label="Копировать приглашение" />
          <button type="button" className="linklike" onClick={() => setCreated(null)}>Скрыть</button>
        </div>
      ) : null}

      {creating ? (
        <div className="card">
          <div className="card-head">
            <h2>Новый ученик</h2>
            {students.length ? <button type="button" className="linklike" onClick={() => setCreating(false)}>Отмена</button> : null}
          </div>
          <StudentForm
            groups={groups}
            onDone={(r, name) => { setCreating(false); if (r.id) setCreated({ id: r.id, name }); }}
          />
        </div>
      ) : null}

      <div className="card">
        <div className="a-toolbar">
          <input className="input" type="search" placeholder="Поиск: имя, ID, логин, телефон" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">
            <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Все · {students.length}</button>
            <button type="button" className={filter === 'bound' ? 'on' : ''} onClick={() => setFilter('bound')}>Вошли · {bound}</button>
            <button type="button" className={filter === 'free' ? 'on' : ''} onClick={() => setFilter('free')}>Ждут входа · {students.length - bound}</button>
          </div>
          {!creating ? <button type="button" className="btn btn-primary" onClick={() => { setCreating(true); setCreated(null); }}>+ Новый ученик</button> : null}
        </div>

        {list.length ? (
          <div className="a-list" style={{ marginTop: 14 }}>
            {list.map((st) => (
              <StudentRow
                key={st.id}
                st={st}
                open={open === st.id}
                onToggle={() => setOpen(open === st.id ? null : st.id)}
                groups={groups}
                myGroups={members.filter((m) => m.student_id === st.id).map((m) => m.group_id)}
                scores={scores.filter((s) => s.student_id === st.id)}
                events={events.filter((e) => e.student_id === st.id)}
              />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: '16px 0 0' }}>
            {students.length ? 'Никого не нашлось.' : 'Учеников пока нет. Добавь первого — система выдаст ему ID.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StudentRow({
  st, open, onToggle, groups, myGroups, scores, events,
}: {
  st: AStudent; open: boolean; onToggle: () => void; groups: AGroup[]; myGroups: number[]; scores: AScore[]; events: AEvent[];
}) {
  const act = useAction();
  const partial = st.access?.level === 'partial';
  const account = st.username ? `@${st.username}` : st.tg_username ? `TG @${st.tg_username}` : st.email || 'аккаунт привязан';
  const mine = groups.filter((g) => myGroups.includes(g.id));
  const gNames = mine.filter((g) => !isSolo(g)).map(groupTitle);
  const sNames = mine.filter(isSolo).map((g) => `${g.course} (индивидуально)`);
  const where = [...gNames, ...sNames];

  return (
    <div className="a-row">
      <div className="a-row-head">
        <div className="grow">
          <b className="who">{st.name}<StreakBadge n={st.streak || 0} /></b>
          <i>
            {where.length ? where.join(', ') : 'без занятий'}
            {st.exam_date ? ` · экзамен ${short(st.exam_date)}` : ''}
          </i>
        </div>
        <span className="code">{st.id}</span>
        {st.user_id
          ? <span className="pill on" title={st.last_seen ? `Последний вход: ${short(st.last_seen)}` : undefined}>{account}</span>
          : <span className="pill warn">ждёт входа</span>}
        <span className={`pill ${partial ? 'warn' : ''}`}>{partial ? 'частичный доступ' : 'полный доступ'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={open}>{open ? 'Свернуть' : 'Открыть'}</button>
      </div>

      {open ? (
        <div className="a-row-body">
          <div className="a-split">
            <section>
              <h3 className="a-h">Данные и доступ</h3>
              <StudentForm initial={st} myGroups={myGroups} groups={groups} />
            </section>
            <section>
              <h3 className="a-h">Баллы и оценки преподавателей</h3>
              <ScoresBlock studentId={st.id} scores={scores} />

              <h3 className="a-h" style={{ marginTop: 22 }}>Личные сроки</h3>
              <EventsBlock studentId={st.id} events={events} />

              <h3 className="a-h" style={{ marginTop: 22 }}>ID и аккаунт</h3>
              <div className="row" style={{ alignItems: 'center' }}>
                <CopyButton text={st.id} label="Копировать ID" />
                <CopyButton text={invite(st.id, st.name)} label="Копировать приглашение" />
              </div>
              {st.user_id ? (
                <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
                  Вошёл как {account}{st.user_name && st.user_name !== st.name ? ` (${st.user_name})` : ''}
                  {st.last_seen ? `, последний раз ${short(st.last_seen)}` : ''}.
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Ученик ещё не ввёл этот ID в своём аккаунте.</p>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {st.user_id ? (
                  <button
                    type="button" className="btn btn-ghost btn-sm" disabled={act.pending}
                    onClick={() => { if (confirm(`Отвязать аккаунт от ${st.id}? Ученик сможет ввести ID заново — например, с другого аккаунта.`)) act.run(() => unbindStudent(st.id)); }}
                  >Отвязать аккаунт</button>
                ) : null}
                <button
                  type="button" className="btn btn-danger btn-sm" disabled={act.pending}
                  onClick={() => { if (confirm(`Удалить ученика ${st.name} (${st.id}) вместе с его баллами? Аккаунт ученика останется, но без доступа.`)) act.run(() => deleteStudent(st.id)); }}
                >Удалить ученика</button>
              </div>
              {act.error ? <p className="err" style={{ marginTop: 8 }}>{act.error}</p> : null}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentForm({
  initial, myGroups = [], groups, onDone,
}: {
  initial?: AStudent; myGroups?: number[]; groups: AGroup[]; onDone?: (r: AdminResult, name: string) => void;
}) {
  const act = useAction();
  const [saved, setSaved] = useState(false);
  const [v, setV] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '',
    note: initial?.note || '',
    examName: initial?.exam_name || (initial ? '' : 'TR-YÖS'),
    examDate: initial?.exam_date || '',
    examCity: initial?.exam_city || '',
    target: initial?.target_score != null ? String(initial.target_score) : '',
  });
  const [level, setLevel] = useState<'full' | 'partial'>(initial?.access?.level === 'partial' ? 'partial' : 'full');
  const [sections, setSections] = useState<Partial<Record<Section, boolean>>>(
    initial?.access?.sections || { courses: true, schedule: true, scores: true, materials: true },
  );
  const inGroups = groups.filter((g) => !isSolo(g));
  const mySolo = groups.filter((g) => isSolo(g) && myGroups.includes(g.id));
  // В чекбоксах живут только группы: состав индивидуальных занятий задаётся
  // в их собственной карточке, поэтому сюда они не попадают и не стираются.
  const [picked, setPicked] = useState<number[]>(myGroups.filter((id) => inGroups.some((g) => g.id === id)));

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setV({ ...v, [k]: e.target.value });
  };
  const toggleGroup = (id: number) => { setSaved(false); setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]); };
  const uid = initial?.id || 'new';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: StudentInput = { ...v, access: level === 'full' ? { level: 'full' } : { level: 'partial', sections }, groups: picked };
    act.run(
      () => (initial ? updateStudent(initial.id, input) : createStudent(input)),
      (r) => {
        setSaved(true);
        onDone?.(r, v.name.trim());
        if (!initial) {
          setV({ name: '', phone: '', note: '', examName: 'TR-YÖS', examDate: '', examCity: '', target: '' });
          setPicked([]);
        }
      },
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="fields-2">
        <Field label="Имя и фамилия">
          <input className="input" required value={v.name} onChange={set('name')} placeholder="Азиз Каримов" />
        </Field>
        <Field label="Телефон или Telegram">
          <input className="input" value={v.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" />
        </Field>
      </div>

      <div className="fields-3">
        <Field label="Экзамен">
          <input className="input" value={v.examName} onChange={set('examName')} placeholder="TR-YÖS 2027" />
        </Field>
        <Field label="Дата экзамена">
          <input className="input" type="date" value={v.examDate} onChange={set('examDate')} />
        </Field>
        <Field label="Цель, баллов">
          <input className="input" inputMode="numeric" value={v.target} onChange={set('target')} placeholder="70" />
        </Field>
      </div>
      <Field label="Город / университет экзамена">
        <input className="input" value={v.examCity} onChange={set('examCity')} placeholder="Стамбул, İstanbul Üniversitesi" />
      </Field>

      <div className="field">
        <span className="field-label">Группы</span>
        {inGroups.length ? (
          <div className="checks">
            {inGroups.map((g, i) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                <span className="c-dot" style={{ background: colorOf(g, i) }} />
                {groupTitle(g)}
              </label>
            ))}
          </div>
        ) : <small>Групп пока нет — создай их на вкладке «Группы».</small>}
      </div>

      {initial ? (
        <div className="field">
          <span className="field-label">Индивидуальные занятия</span>
          {mySolo.length ? (
            <div className="checks">
              {mySolo.map((g, i) => (
                <span key={g.id} className="check as-tag">
                  <span className="c-dot" style={{ background: colorOf(g, i) }} />
                  {groupTitle(g)}
                </span>
              ))}
            </div>
          ) : <small>Индивидуальных занятий нет.</small>}
          <small>Добавляются и меняются на вкладке «Индивидуально» — там же выбирается ученик.</small>
        </div>
      ) : null}

      <div className="field">
        <span className="field-label">Доступ по ID</span>
        <div className="checks">
          <label className="check">
            <input type="radio" name={`lvl-${uid}`} checked={level === 'full'} onChange={() => { setSaved(false); setLevel('full'); }} />
            Полный — всё открыто
          </label>
          <label className="check">
            <input type="radio" name={`lvl-${uid}`} checked={level === 'partial'} onChange={() => { setSaved(false); setLevel('partial'); }} />
            Частичный — выбрать разделы
          </label>
        </div>
        {level === 'partial' ? (
          <div className="checks" style={{ marginTop: 6 }}>
            {SECTIONS.map((s) => (
              <label key={s.key} className="check">
                <input
                  type="checkbox" checked={Boolean(sections[s.key])}
                  onChange={() => { setSaved(false); setSections({ ...sections, [s.key]: !sections[s.key] }); }}
                />
                {s.label}
              </label>
            ))}
          </div>
        ) : null}
        <small>Всем, у кого есть аккаунт, открыты: быстрая диагностика, тренажёр «все темы вперемешку», режим выживания и личный прогресс.</small>
      </div>

      <Field label="Заметка (видит только админ)">
        <textarea className="textarea" value={v.note} onChange={set('note')} placeholder="Оплата, откуда пришёл, особенности…" />
      </Field>

      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark" disabled={act.pending}>
          {act.pending ? 'Сохраняю…' : initial ? 'Сохранить' : 'Создать и выдать ID'}
        </button>
        {saved && initial ? <p className="okmsg">Сохранено</p> : null}
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

function ScoresBlock({ studentId, scores }: { studentId: string; scores: AScore[] }) {
  const act = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ title: '', value: '', max: '100', teacher: '', date: today });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(() => addScore(studentId, v), () => setV({ ...v, title: '', value: '' }));
  };

  return (
    <>
      {scores.length ? (
        <ul className="mini-list" style={{ marginTop: 0 }}>
          {scores.map((s) => (
            <li key={s.id}>
              <span>
                <b>{s.title}</b>
                <span className="muted"> · {short(s.date)}{s.teacher ? ` · ${s.teacher}` : ''}</span>
              </span>
              <span className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <b className="nw">{+s.value.toFixed(1)} / {+s.max.toFixed(1)}</b>
                <button
                  type="button" className="linklike danger" disabled={act.pending} aria-label="Удалить балл"
                  onClick={() => { if (confirm(`Удалить «${s.title}»?`)) act.run(() => deleteScore(s.id)); }}
                >Удалить</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Баллов пока нет.</p>}

      <form className="form a-inline" onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="fields-2">
          <Field label="За что">
            <input className="input" value={v.title} onChange={set('title')} placeholder="Пробник №3" />
          </Field>
          <Field label="Преподаватель">
            <input className="input" value={v.teacher} onChange={set('teacher')} placeholder="необязательно" />
          </Field>
        </div>
        <div className="fields-3">
          <Field label="Балл"><input className="input" inputMode="decimal" value={v.value} onChange={set('value')} placeholder="64" /></Field>
          <Field label="Из"><input className="input" inputMode="decimal" value={v.max} onChange={set('max')} /></Field>
          <Field label="Дата"><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={act.pending}>{act.pending ? 'Добавляю…' : '+ Добавить балл'}</button>
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>
    </>
  );
}

/* ================================================== сроки и события */

function EventsBlock({ groupId, studentId, events }: { groupId?: number; studentId?: string; events: AEvent[] }) {
  const act = useAction();
  const [v, setV] = useState({ kind: 'deadline', title: '', date: '', time: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(
      () => addEvent({ groupId: groupId ?? null, studentId: studentId ?? null, ...v }),
      () => setV({ ...v, title: '', date: '', time: '' }),
    );
  };

  return (
    <>
      {events.length ? (
        <ul className="mini-list" style={{ marginTop: 0 }}>
          {events.map((ev) => (
            <li key={ev.id}>
              <span>
                <span className={`pill ${ev.kind === 'exam' ? 'warn' : ''}`}>{KIND_RU[ev.kind] || ev.kind}</span> <b>{ev.title}</b>
                {ev.batch ? <span className="muted" style={{ fontSize: 12.5 }}> · из общего назначения</span> : null}
              </span>
              <span className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <span className="nw muted">{short(ev.at)}, {ev.at.slice(11, 16)}</span>
                <button
                  type="button" className="linklike danger" disabled={act.pending}
                  onClick={() => { if (confirm(`Удалить «${ev.title}»?`)) act.run(() => deleteEvent(ev.id)); }}
                >Удалить</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Ближайших сроков нет.</p>}

      <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="fields-2">
          <Field label="Тип">
            <select className="select" value={v.kind} onChange={set('kind')}>
              <option value="deadline">Срок сдачи</option>
              <option value="lesson">Доп. занятие</option>
              <option value="exam">Пробный экзамен</option>
            </select>
          </Field>
          <Field label="Название">
            <input className="input" value={v.title} onChange={set('title')} placeholder="Домашка: логарифмы" />
          </Field>
        </div>
        <div className="fields-2">
          <Field label="Дата"><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
          <Field label="Время" hint={v.kind === 'deadline' ? 'Пусто — до 23:59' : 'Пусто — 10:00'}>
            <input className="input" type="time" value={v.time} onChange={set('time')} />
          </Field>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={act.pending}>{act.pending ? 'Добавляю…' : '+ Добавить'}</button>
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>
    </>
  );
}

const AUDIENCE = [
  { key: 'all', label: 'Всем ученикам' },
  { key: 'groups', label: 'Группам' },
  { key: 'students', label: 'Отдельным ученикам' },
] as const;
type Audience = (typeof AUDIENCE)[number]['key'];

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** Выбор адресатов: все, группы или отдельные ученики. Общий для экзамена и занятий. */
function AudiencePicker({
  audience, setAudience, groups, students, pickedGroups, setPickedGroups, pickedStudents, setPickedStudents, reach, allText, onChange,
}: {
  audience: Audience; setAudience: (a: Audience) => void;
  groups: AGroup[]; students: AStudent[];
  pickedGroups: number[]; setPickedGroups: (x: number[]) => void;
  pickedStudents: string[]; setPickedStudents: (x: string[]) => void;
  reach: number; allText: string; onChange: () => void;
}) {
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return students;
    return students.filter((st) => [st.name, st.id, st.phone].some((x) => x && x.toLowerCase().includes(s)));
  }, [students, q]);

  return (
    <div className="field">
      <span className="field-label">Кому</span>
      <div className="seg">
        {AUDIENCE.map((a) => (
          <button key={a.key} type="button" className={audience === a.key ? 'on' : ''} onClick={() => { onChange(); setAudience(a.key); }}>
            {a.label}
          </button>
        ))}
      </div>

      {audience === 'groups' ? (
        groups.length ? (
          <div className="checks" style={{ marginTop: 10 }}>
            {groups.map((g, i) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={pickedGroups.includes(g.id)} onChange={() => { onChange(); setPickedGroups(toggle(pickedGroups, g.id)); }} />
                <span className="c-dot" style={{ background: colorOf(g, i) }} />
                {groupTitle(g)}{isSolo(g) ? ' · инд.' : ''}
              </label>
            ))}
          </div>
        ) : <small>Групп пока нет.</small>
      ) : null}

      {audience === 'students' ? (
        <div style={{ marginTop: 10 }}>
          <input className="input" type="search" placeholder="Поиск ученика" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="checks pick-list">
            {found.map((st) => (
              <label key={st.id} className="check">
                <input type="checkbox" checked={pickedStudents.includes(st.id)} onChange={() => { onChange(); setPickedStudents(toggle(pickedStudents, st.id)); }} />
                {st.name}
              </label>
            ))}
            {!found.length ? <small>Никого не нашлось.</small> : null}
          </div>
        </div>
      ) : null}

      <small>{audience === 'all' ? allText : `Выбрано учеников: ${reach}.`}</small>
    </div>
  );
}

function reachOf(audience: Audience, students: AStudent[], members: AMember[], pickedGroups: number[], pickedStudents: string[]): number {
  if (audience === 'all') return students.length;
  if (audience === 'students') return pickedStudents.length;
  return new Set(members.filter((m) => pickedGroups.includes(m.group_id)).map((m) => m.student_id)).size;
}

/* ============================================================ экзамен */

function ExamTab({
  students, groups, members,
}: {
  students: AStudent[]; groups: AGroup[]; members: AMember[];
}) {
  const act = useAction();
  const [v, setV] = useState({ examName: '', examDate: '', examCity: '' });
  const [audience, setAudience] = useState<Audience>('all');
  const [pickedGroups, setPickedGroups] = useState<number[]>([]);
  const [pickedStudents, setPickedStudents] = useState<string[]>([]);
  const [okMsg, setOkMsg] = useState('');
  const reach = reachOf(audience, students, members, pickedGroups, pickedStudents);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOkMsg('');
    setV({ ...v, [k]: e.target.value });
  };

  // Сводка: у кого какая дата сейчас — ближайшие сверху, «без даты» в конце.
  const byDate = useMemo(() => {
    const map = new Map<string, AStudent[]>();
    for (const st of students) {
      const k = st.exam_date || '';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(st);
    }
    return [...map.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  }, [students]);

  const apply = (clear: boolean) => {
    setOkMsg('');
    const who = audience === 'all' ? 'всем ученикам' : `${reach} ${plural(reach, 'ученику', 'ученикам', 'ученикам')}`;
    const what = clear ? 'Убрать дату экзамена' : `Поставить дату экзамена ${short(v.examDate)}`;
    if (!confirm(`${what} ${who}?`)) return;
    act.run(
      () => setExamDate({
        ...v, examDate: clear ? '' : v.examDate, audience,
        groups: audience === 'groups' ? pickedGroups : undefined,
        students: audience === 'students' ? pickedStudents : undefined,
      }),
      (r) => {
        const n = (r as { count?: number }).count ?? 0;
        setOkMsg(`${clear ? 'Дата убрана' : 'Дата обновлена'} · ${n} ${plural(n, 'ученик', 'ученика', 'учеников')}`);
      },
    );
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>Дата экзамена</h2>
          <span className="note" style={{ margin: 0 }}>отсчёт на главной у ученика</span>
        </div>

        <form className="form" onSubmit={(e) => { e.preventDefault(); apply(false); }}>
          <div className="fields-3">
            <Field label="Дата экзамена">
              <input className="input" type="date" required value={v.examDate} onChange={set('examDate')} />
            </Field>
            <Field label="Экзамен" hint="Пусто — не менять">
              <input className="input" value={v.examName} onChange={set('examName')} placeholder="TR-YÖS 2027" />
            </Field>
            <Field label="Город / университет" hint="Пусто — не менять">
              <input className="input" value={v.examCity} onChange={set('examCity')} placeholder="Стамбул" />
            </Field>
          </div>

          <AudiencePicker
            audience={audience} setAudience={setAudience} groups={groups} students={students}
            pickedGroups={pickedGroups} setPickedGroups={setPickedGroups}
            pickedStudents={pickedStudents} setPickedStudents={setPickedStudents}
            reach={reach} allText={`Дата поменяется у всех учеников — сейчас их ${students.length}.`}
            onChange={() => setOkMsg('')}
          />

          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn btn-dark" disabled={act.pending || !v.examDate}>{act.pending ? 'Сохраняю…' : 'Поставить дату'}</button>
            <button type="button" className="btn btn-ghost" disabled={act.pending} onClick={() => apply(true)}>Убрать дату</button>
            {okMsg ? <p className="okmsg">{okMsg}</p> : null}
            {act.error ? <p className="err">{act.error}</p> : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Сейчас у учеников</h2>
          <span className="note" style={{ margin: 0 }}>одному ученику дату можно поменять в его карточке</span>
        </div>
        {students.length ? (
          <div className="a-list">
            {byDate.map(([date, list]) => (
              <div key={date || 'none'} className="a-row">
                <div className="a-row-head">
                  <div className="grow">
                    <b>{date ? short(date) : 'Без даты'}</b>
                    <i>{list.map((s) => s.name).join(', ')}</i>
                  </div>
                  <span className={`pill${date ? '' : ' warn'}`}>{list.length} {plural(list.length, 'ученик', 'ученика', 'учеников')}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    setOkMsg('');
                    setAudience('students');
                    setPickedStudents(list.map((s) => s.id));
                    setV({ ...v, examDate: date });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}>Изменить</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>Учеников пока нет.</p>}
      </div>
    </div>
  );
}

/* ================================ занятия и тесты для всех и выборочно */

/** Одно назначение: строки события, созданные разом (общий batch). */
interface Plan { key: string; batch: string | null; head: AEvent; rows: AEvent[] }

function planList(events: AEvent[]): Plan[] {
  const out: Plan[] = [];
  const byBatch = new Map<string, Plan>();
  for (const e of events) {
    if (!e.batch) continue; // одиночные из карточек группы и ученика живут там же
    const found = byBatch.get(e.batch);
    if (found) { found.rows.push(e); continue; }
    const plan: Plan = { key: e.batch, batch: e.batch, head: e, rows: [e] };
    byBatch.set(e.batch, plan);
    out.push(plan);
  }
  return out;
}

function EventsTab({
  students, groups, members, events,
}: {
  students: AStudent[]; groups: AGroup[]; members: AMember[]; events: AEvent[];
}) {
  const act = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ kind: 'lesson', title: '', date: '', time: '', link: '', note: '' });
  const [audience, setAudience] = useState<Audience>('all');
  const [pickedGroups, setPickedGroups] = useState<number[]>([]);
  const [pickedStudents, setPickedStudents] = useState<string[]>([]);
  const [okMsg, setOkMsg] = useState('');

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setOkMsg('');
    setV({ ...v, [k]: e.target.value });
  };

  // сколько учеников затронет назначение — видно до отправки
  const reach = reachOf(audience, students, members, pickedGroups, pickedStudents);

  const plans = useMemo(() => planList(events), [events]);
  const nameOfGroup = (id: number) => { const g = groups.find((x) => x.id === id); return g ? groupTitle(g) : `группа ${id}`; };
  const nameOfStudent = (id: string) => students.find((x) => x.id === id)?.name || id;

  const audienceText = (p: Plan) => {
    if (p.head.scope === 'all') return 'Все ученики';
    const names = p.rows[0].group_id != null
      ? p.rows.map((r) => nameOfGroup(r.group_id as number))
      : p.rows.map((r) => nameOfStudent(r.student_id as string));
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} и ещё ${names.length - 3}` : names.join(', ');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOkMsg('');
    const input: EventInput = {
      ...v, audience,
      groups: audience === 'groups' ? pickedGroups : undefined,
      students: audience === 'students' ? pickedStudents : undefined,
    };
    act.run(() => addEvents(input), () => {
      setOkMsg(`Назначено${reach ? ` · ${reach} ${plural(reach, 'ученик', 'ученика', 'учеников')}` : ''}`);
      setV({ ...v, title: '', date: '', time: '', link: '', note: '' });
      setPickedGroups([]);
      setPickedStudents([]);
    });
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>Новое занятие или тест</h2>
          <span className="note" style={{ margin: 0 }}>появится в расписании ученика</span>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="fields-2">
            <Field label="Что это">
              <select className="select" value={v.kind} onChange={set('kind')}>
                <option value="lesson">Дополнительное занятие</option>
                <option value="exam">Тестирование / пробный экзамен</option>
                <option value="deadline">Срок сдачи</option>
              </select>
            </Field>
            <Field label="Название">
              <input className="input" required value={v.title} onChange={set('title')} placeholder={v.kind === 'exam' ? 'Пробный экзамен №4' : 'Разбор геометрии'} />
            </Field>
          </div>

          <div className="fields-3">
            <Field label="Дата"><input className="input" type="date" required value={v.date} min={today} onChange={set('date')} /></Field>
            <Field label="Время" hint={v.kind === 'deadline' ? 'Пусто — до 23:59' : 'Пусто — 10:00'}>
              <input className="input" type="time" value={v.time} onChange={set('time')} />
            </Field>
            <Field label="Где" hint="Кабинет, «онлайн» — необязательно">
              <input className="input" value={v.note} onChange={set('note')} placeholder="Онлайн" />
            </Field>
          </div>

          <Field label="Ссылка" hint="Zoom, Meet или ссылка на тест — ученик увидит её в расписании">
            <input className="input" value={v.link} onChange={set('link')} placeholder="https://meet.google.com/…" />
          </Field>

          <AudiencePicker
            audience={audience} setAudience={setAudience} groups={groups} students={students}
            pickedGroups={pickedGroups} setPickedGroups={setPickedGroups}
            pickedStudents={pickedStudents} setPickedStudents={setPickedStudents}
            reach={reach} allText={`Увидят все ученики с привязанным ID — сейчас их ${students.length}.`}
            onChange={() => setOkMsg('')}
          />

          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn btn-dark" disabled={act.pending}>{act.pending ? 'Назначаю…' : 'Назначить'}</button>
            {okMsg ? <p className="okmsg">{okMsg}</p> : null}
            {act.error ? <p className="err">{act.error}</p> : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Назначенные занятия и тесты</h2>
          <span className="note" style={{ margin: 0 }}>за последний месяц и вперёд</span>
        </div>
        {plans.length ? (
          <div className="a-list" style={{ marginTop: 14 }}>
            {plans.map((p) => (
              <PlanRow key={p.key} plan={p} who={audienceText(p)} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: '16px 0 0' }}>
            Пока ничего не назначено. Сроки из карточек групп и учеников показываются там же, в их карточках.
          </p>
        )}
      </div>
    </div>
  );
}

function PlanRow({ plan, who }: { plan: Plan; who: string }) {
  const act = useAction();
  const e = plan.head;
  const past = e.at.slice(0, 10) < new Date().toLocaleDateString('en-CA');
  return (
    <div className="a-row">
      <div className="a-row-head">
        <div className="grow">
          <b>{e.title}</b>
          <i>
            {short(e.at)}, {e.at.slice(11, 16)} · {who}
            {e.note ? ` · ${e.note}` : ''}
          </i>
        </div>
        <span className={`pill ${e.kind === 'exam' ? 'warn' : ''}`}>{KIND_RU[e.kind] || e.kind}</span>
        {past ? <span className="pill">прошло</span> : null}
        {e.link ? <a className="btn btn-ghost btn-sm" href={e.link} target="_blank" rel="noopener noreferrer">Ссылка</a> : null}
        <button
          type="button" className="linklike danger" disabled={act.pending}
          onClick={() => { if (confirm(`Удалить «${e.title}» у всех, кому назначено?`)) act.run(() => deleteEventBatch(plan.batch || '')); }}
        >Удалить</button>
      </div>
      {act.error ? <p className="err" style={{ margin: '0 0 10px' }}>{act.error}</p> : null}
    </div>
  );
}

/* ============================================================ учителя */

function TeachersTab({ teachers, groups, members }: { teachers: ATeacher[]; groups: AGroup[]; members: AMember[] }) {
  const [creating, setCreating] = useState(teachers.length === 0);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const free = groups.filter((g) => !g.teacher_id);

  return (
    <div className="grid" style={{ gap: 16 }}>
      {created ? (
        <div className="newcode">
          <div style={{ flex: '1 1 240px' }}>
            <b>ID учителя для {created.name}</b>
            <div className="muted" style={{ fontSize: 13 }}>Отправь учителю — он войдёт на {SITE} и введёт ID, откроется кабинет учителя.</div>
          </div>
          <span className="code">{created.id}</span>
          <CopyButton text={created.id} label="Копировать ID" />
          <CopyButton text={teacherInvite(created.id, created.name)} label="Копировать приглашение" />
          <button type="button" className="linklike" onClick={() => setCreated(null)}>Скрыть</button>
        </div>
      ) : null}

      {creating ? (
        <div className="card">
          <div className="card-head">
            <h2>Новый учитель</h2>
            {teachers.length ? <button type="button" className="linklike" onClick={() => setCreating(false)}>Отмена</button> : null}
          </div>
          <TeacherForm groups={groups} onDone={(r, name) => { setCreating(false); if (r.id) setCreated({ id: r.id, name }); }} />
        </div>
      ) : null}

      <div className="card">
        <div className="a-toolbar">
          <p className="muted" style={{ margin: 0, flex: '1 1 260px' }}>
            У учителя свой кабинет: его группы и индивидуальные занятия, ученики, расписание. Там он ставит ссылки на уроки,
            доп. занятия и оценки. Учитель входит как обычно и вводит свой ID учителя.
          </p>
          {!creating ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>+ Новый учитель</button> : null}
        </div>
        {free.length && teachers.length ? (
          <p className="note" style={{ margin: '12px 0 0' }}>
            Без учителя: {free.map(groupTitle).join(', ')}.
          </p>
        ) : null}

        {teachers.length ? (
          <div className="a-list" style={{ marginTop: 14 }}>
            {teachers.map((t) => {
              const mine = groups.filter((g) => g.teacher_id === t.id);
              const people = new Set(members.filter((m) => mine.some((g) => g.id === m.group_id)).map((m) => m.student_id)).size;
              const account = t.username ? `@${t.username}` : t.tg_username ? `TG @${t.tg_username}` : t.email || 'аккаунт привязан';
              const isOpen = open === t.id;
              return (
                <div className="a-row" key={t.id}>
                  <div className="a-row-head">
                    <div className="grow">
                      <b className="who">{t.name}<TeacherTag /></b>
                      <i>
                        {mine.length ? mine.map((g) => (isSolo(g) ? `${g.course} (инд.)` : groupTitle(g))).join(', ') : 'без групп'}
                        {people ? ` · ${people} уч.` : ''}
                      </i>
                    </div>
                    <span className="code">{t.id}</span>
                    {t.user_id
                      ? <span className="pill on" title={t.last_seen ? `Последний вход: ${short(t.last_seen)}` : undefined}>{account}</span>
                      : <span className="pill warn">ждёт входа</span>}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                      {isOpen ? 'Свернуть' : 'Открыть'}
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="a-row-body">
                      <div className="a-split">
                        <section>
                          <h3 className="a-h">Данные и группы</h3>
                          <TeacherForm initial={t} groups={groups} />
                        </section>
                        <section>
                          <h3 className="a-h">ID и аккаунт</h3>
                          <div className="row" style={{ alignItems: 'center' }}>
                            <CopyButton text={t.id} label="Копировать ID" />
                            <CopyButton text={teacherInvite(t.id, t.name)} label="Копировать приглашение" />
                          </div>
                          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
                            {t.user_id
                              ? `Вошёл как ${account}${t.last_seen ? `, последний раз ${short(t.last_seen)}` : ''}.`
                              : 'Учитель ещё не ввёл этот ID в своём аккаунте.'}
                          </p>
                          <TeacherDanger t={t} />
                        </section>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : !creating ? <p className="muted" style={{ margin: '16px 0 0' }}>Учителей пока нет.</p> : null}
      </div>
    </div>
  );
}

function TeacherDanger({ t }: { t: ATeacher }) {
  const act = useAction();
  return (
    <>
      <div className="row" style={{ marginTop: 12 }}>
        {t.user_id ? (
          <button
            type="button" className="btn btn-ghost btn-sm" disabled={act.pending}
            onClick={() => { if (confirm(`Отвязать аккаунт от ${t.id}? Учитель сможет ввести ID заново.`)) act.run(() => unbindTeacher(t.id)); }}
          >Отвязать аккаунт</button>
        ) : null}
        <button
          type="button" className="btn btn-danger btn-sm" disabled={act.pending}
          onClick={() => { if (confirm(`Удалить учителя ${t.name}? Группы останутся, в них останется только имя.`)) act.run(() => deleteTeacher(t.id)); }}
        >Удалить учителя</button>
      </div>
      {act.error ? <p className="err" style={{ marginTop: 8 }}>{act.error}</p> : null}
    </>
  );
}

function TeacherForm({
  initial, groups, onDone,
}: {
  initial?: ATeacher; groups: AGroup[]; onDone?: (r: AdminResult, name: string) => void;
}) {
  const act = useAction();
  const [saved, setSaved] = useState(false);
  const [v, setV] = useState({ name: initial?.name || '', phone: initial?.phone || '', note: initial?.note || '' });
  const [picked, setPicked] = useState<number[]>(initial ? groups.filter((g) => g.teacher_id === initial.id).map((g) => g.id) : []);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setV({ ...v, [k]: e.target.value }); };
  const other = (g: AGroup) => g.teacher_id && g.teacher_id !== initial?.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: TeacherInput = { ...v, groups: picked };
    act.run(
      () => (initial ? updateTeacher(initial.id, input) : createTeacher(input)),
      (r) => {
        setSaved(true);
        onDone?.(r, v.name.trim());
        if (!initial) { setV({ name: '', phone: '', note: '' }); setPicked([]); }
      },
    );
  };

  const list = (solo: boolean) => groups.filter((g) => isSolo(g) === solo);
  const block = (solo: boolean) => {
    const gs = list(solo);
    if (!gs.length) return <small>{solo ? 'Индивидуальных занятий пока нет.' : 'Групп пока нет.'}</small>;
    return (
      <div className="checks">
        {gs.map((g, i) => (
          <label key={g.id} className="check" title={other(g) ? `Сейчас ведёт: ${g.teacher}` : undefined}>
            <input type="checkbox" checked={picked.includes(g.id)} onChange={() => { setSaved(false); setPicked(toggle(picked, g.id)); }} />
            <span className="c-dot" style={{ background: colorOf(g, i) }} />
            {groupTitle(g)}
            {other(g) && !picked.includes(g.id) ? <span className="muted"> · {g.teacher}</span> : null}
          </label>
        ))}
      </div>
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="fields-2">
        <Field label="Имя и фамилия">
          <input className="input" required value={v.name} onChange={set('name')} placeholder="Дилноза Рахимова" />
        </Field>
        <Field label="Телефон или Telegram">
          <input className="input" value={v.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Ведёт группы</span>
        {block(false)}
      </div>
      <div className="field">
        <span className="field-label">Индивидуальные занятия</span>
        {block(true)}
        <small>Если занятия уже ведёт другой учитель, при сохранении они перейдут к этому.</small>
      </div>
      <Field label="Заметка" hint="Видна только админам">
        <textarea className="input" rows={2} value={v.note} onChange={set('note')} placeholder="Предметы, часы, оплата…" />
      </Field>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark" disabled={act.pending}>{act.pending ? 'Сохраняю…' : initial ? 'Сохранить' : 'Добавить учителя'}</button>
        {saved && initial ? <p className="okmsg">Сохранено</p> : null}
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}

/* ============================== группы и индивидуальные занятия */

function CoursesTab({
  kind, students, groups, members, events, teachers,
}: {
  kind: AKind; students: AStudent[]; groups: AGroup[]; members: AMember[]; events: AEvent[]; teachers: ATeacher[];
}) {
  const w = WORD[kind];
  const solo = kind === 'solo';
  const [creating, setCreating] = useState(groups.length === 0 && !(solo && !students.length));
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="grid" style={{ gap: 16 }}>
      {creating ? (
        <div className="card">
          <div className="card-head">
            <h2>{w.newOne}</h2>
            {groups.length ? <button type="button" className="linklike" onClick={() => setCreating(false)}>Отмена</button> : null}
          </div>
          <GroupForm kind={kind} students={students} teachers={teachers} index={groups.length} onDone={() => setCreating(false)} />
        </div>
      ) : null}

      <div className="card">
        <div className="a-toolbar">
          <p className="muted" style={{ margin: 0, flex: '1 1 260px' }}>{w.about}</p>
          {!creating ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>{w.add}</button> : null}
        </div>

        {solo && !students.length ? (
          <p className="muted" style={{ margin: '16px 0 0' }}>
            Сначала заведи ученика на вкладке «Ученики» — индивидуальные занятия привязываются к нему.
          </p>
        ) : null}

        {groups.length ? (
          <div className="a-list" style={{ marginTop: 14 }}>
            {groups.map((g, i) => {
              const ids = members.filter((m) => m.group_id === g.id).map((m) => m.student_id);
              const people = students.filter((s) => ids.includes(s.id));
              const isOpen = open === g.id;
              return (
                <div className="a-row" key={g.id}>
                  <div className="a-row-head">
                    <span className="c-dot" style={{ background: colorOf(g, i), width: 12, height: 12 }} />
                    <div className="grow">
                      <b>{groupTitle(g)}</b>
                      <i>{scheduleText(g.schedule)}</i>
                    </div>
                    {g.teacher ? (
                      g.teacher_id
                        ? <span className="pill"><TeacherName name={g.teacher} /></span>
                        : <span className="pill warn" title="Учитель не выбран из списка — у него нет кабинета">{g.teacher} · без аккаунта</span>
                    ) : <span className="pill warn">учитель не назначен</span>}
                    <span className={`pill${solo && !people.length ? ' warn' : ''}`}>
                      {solo ? people[0]?.name || 'ученик не выбран' : `${people.length} уч.`}
                    </span>
                    {g.starts || g.ends ? <span className="pill">{g.starts ? short(g.starts) : '…'} – {g.ends ? short(g.ends) : '…'}</span> : null}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}>
                      {isOpen ? 'Свернуть' : 'Открыть'}
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="a-row-body">
                      <div className="a-split">
                        <section>
                          <h3 className="a-h">Курс и расписание</h3>
                          <GroupForm kind={kind} students={students} teachers={teachers} initial={g} studentId={people[0]?.id} index={i} />
                        </section>
                        <section>
                          <h3 className="a-h">{solo ? 'Ученик' : 'Ученики группы'}</h3>
                          {people.length ? (
                            <ul className="mini-list" style={{ marginTop: 0 }}>
                              {people.map((p) => (
                                <li key={p.id}><span className="who">{p.name}<StreakBadge n={p.streak || 0} /></span><span className="code">{p.id}</span></li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                              {solo
                                ? 'Ученик не выбран — выбери его слева, иначе занятия никому не видны.'
                                : 'Пока никого. Добавить ученика в группу — в его карточке на вкладке «Ученики».'}
                            </p>
                          )}

                          <h3 className="a-h" style={{ marginTop: 22 }}>
                            {solo ? 'Сроки и отдельные занятия' : 'Сроки и доп. занятия группы'}
                          </h3>
                          <EventsBlock groupId={g.id} events={events.filter((e) => e.group_id === g.id)} />

                          <DeleteGroup g={g} count={people.length} kind={kind} />
                        </section>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : !creating ? <p className="muted" style={{ margin: '16px 0 0' }}>{w.none}</p> : null}
      </div>
    </div>
  );
}

function DeleteGroup({ g, count, kind }: { g: AGroup; count: number; kind: AKind }) {
  const act = useAction();
  const w = WORD[kind];
  return (
    <div style={{ marginTop: 22 }}>
      <button
        type="button" className="btn btn-danger btn-sm" disabled={act.pending}
        onClick={() => {
          const who = kind === 'solo'
            ? ' Ученик перестанет их видеть.'
            : count ? ` ${count} уч. потеряют к ней доступ.` : '';
          if (confirm(`Удалить ${w.oneAcc} «${groupTitle(g)}» и её сроки?${who}`)) act.run(() => deleteGroup(g.id));
        }}
      >{w.del}</button>
      {act.error ? <p className="err" style={{ marginTop: 8 }}>{act.error}</p> : null}
    </div>
  );
}

function GroupForm({
  kind, students, teachers, initial, studentId, index, onDone,
}: {
  kind: AKind; students: AStudent[]; teachers: ATeacher[]; initial?: AGroup; studentId?: string; index: number; onDone?: () => void;
}) {
  const act = useAction();
  const solo = kind === 'solo';
  const w = WORD[kind];
  const [saved, setSaved] = useState(false);
  const [who, setWho] = useState(studentId || '');
  // Учитель из списка ('' — не выбран, 'other' — просто имя без кабинета)
  const [tid, setTid] = useState<string>(initial?.teacher_id || (initial?.teacher ? 'other' : ''));
  const [v, setV] = useState({
    course: initial?.course || '',
    name: initial?.name || '',
    teacher: initial?.teacher || '',
    starts: initial?.starts || '',
    ends: initial?.ends || '',
    total: initial?.total_lessons != null ? String(initial.total_lessons) : '',
    link: initial?.link || '',
    chat: initial?.chat || '',
    materials: initial?.materials || '',
    color: initial?.color || COLORS[index % COLORS.length],
  });
  const [slots, setSlots] = useState<ASlot[]>(initial?.schedule?.length ? initial.schedule : [{ dow: 1, start: '19:00', end: '20:30' }]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setSaved(false); setV({ ...v, [k]: e.target.value }); };
  const setSlot = (i: number, patch: Partial<ASlot>) => { setSaved(false); setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s))); };
  const addSlot = () => {
    setSaved(false);
    const last = slots[slots.length - 1];
    setSlots([...slots, last ? { dow: Math.min(7, last.dow + 2), start: last.start, end: last.end } : { dow: 1, start: '19:00', end: '20:30' }]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: GroupInput = {
      ...v, kind, studentId: solo ? who : null, schedule: slots,
      teacherId: tid && tid !== 'other' ? tid : null,
      teacher: tid === 'other' ? v.teacher : '',
    };
    act.run(() => saveGroup(initial?.id ?? null, input), () => { setSaved(true); onDone?.(); });
  };

  return (
    <form className="form" onSubmit={submit}>
      {solo ? (
        <Field label="Ученик" hint="Занятия увидит только он — в «Мои курсы» и «Расписании»">
          <select className="select" required value={who} onChange={(e) => { setSaved(false); setWho(e.target.value); }}>
            <option value="">— выбери ученика —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.id}</option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="fields-2">
        <Field label={solo ? 'Предмет' : 'Курс'}>
          <input className="input" required value={v.course} onChange={set('course')} placeholder={solo ? 'Математика, индивидуально' : 'Математика TR-YÖS'} />
        </Field>
        <Field label={solo ? 'Пометка' : 'Группа'}>
          <input className="input" value={v.name} onChange={set('name')} placeholder={solo ? 'Интенсив, 2 раза в неделю' : 'Вечерняя, М-3'} />
        </Field>
      </div>
      <Field
        label="Учитель"
        hint={teachers.length ? 'Учитель увидит эти занятия в своём кабинете и сможет ставить ссылки и доп. занятия' : 'Учителей пока нет — добавь их на вкладке «Учителя»'}
      >
        <select className="select" value={tid} onChange={(e) => { setSaved(false); setTid(e.target.value); }}>
          <option value="">— не назначен —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.user_id ? '' : ' (ещё не вошёл)'}</option>)}
          <option value="other">Другой (только имя, без кабинета)</option>
        </select>
      </Field>
      {tid === 'other' ? (
        <Field label="Имя учителя">
          <input className="input" value={v.teacher} onChange={set('teacher')} placeholder="Имя преподавателя" />
        </Field>
      ) : null}

      <div className="field">
        <span className="field-label">Занятия по неделям</span>
        <div className="grid" style={{ gap: 8 }}>
          {slots.map((s, i) => (
            <div className="slot" key={i}>
              <select className="select" value={s.dow} onChange={(e) => setSlot(i, { dow: Number(e.target.value) })} aria-label="День недели">
                {['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'].map((d, k) => (
                  <option key={k} value={k + 1}>{d}</option>
                ))}
              </select>
              <input className="input" type="time" value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label="Начало" />
              <input className="input" type="time" value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label="Конец" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSaved(false); setSlots(slots.filter((_, j) => j !== i)); }} aria-label="Убрать занятие">✕</button>
            </div>
          ))}
        </div>
        <div><button type="button" className="linklike" onClick={addSlot} style={{ marginTop: 4 }}>+ Ещё день</button></div>
        <small>
          Время — по часовому поясу школы.
          {solo ? ' Если занятия плавающие, убери все дни и ставь их по одному в «Сроки и отдельные занятия».' : ''}
        </small>
      </div>

      <div className="fields-3">
        <Field label="Старт"><input className="input" type="date" value={v.starts} onChange={set('starts')} /></Field>
        <Field label="Конец"><input className="input" type="date" value={v.ends} onChange={set('ends')} /></Field>
        <Field label="Всего занятий"><input className="input" inputMode="numeric" value={v.total} onChange={set('total')} placeholder="48" /></Field>
      </div>

      <Field label="Ссылка на урок" hint="Zoom, Google Meet — ученик увидит кнопку «Подключиться»">
        <input className="input" value={v.link} onChange={set('link')} placeholder="https://meet.google.com/…" />
      </Field>
      <div className="fields-2">
        <Field label={solo ? 'Чат с преподавателем' : 'Чат группы'}><input className="input" value={v.chat} onChange={set('chat')} placeholder="https://t.me/…" /></Field>
        <Field label="Материалы"><input className="input" value={v.materials} onChange={set('materials')} placeholder="Google Drive, Notion…" /></Field>
      </div>

      <div className="field">
        <span className="field-label">Цвет в расписании</span>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c} type="button" className={`swatch ${v.color === c ? 'on' : ''}`} style={{ background: c }}
              onClick={() => { setSaved(false); setV({ ...v, color: c }); }} aria-label={`Цвет ${c}`} aria-pressed={v.color === c}
            />
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark" disabled={act.pending}>{act.pending ? 'Сохраняю…' : initial ? 'Сохранить' : w.create}</button>
        {saved && initial ? <p className="okmsg">Сохранено</p> : null}
        {act.error ? <p className="err">{act.error}</p> : null}
      </div>
    </form>
  );
}
