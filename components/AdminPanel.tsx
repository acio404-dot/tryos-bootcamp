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
  addEvent, addScore, createStudent, deleteEvent, deleteGroup, deleteScore, deleteStudent,
  saveGroup, unbindStudent, updateStudent, type AdminResult, type GroupInput, type StudentInput,
} from '@/lib/admin-actions';
import { SECTIONS, type Access, type Section } from '@/lib/access';
import { DOW, dateShort } from '@/lib/format';

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
}
export interface ASlot { dow: number; start: string; end: string }
export type AKind = 'group' | 'solo';
export interface AGroup {
  id: number;
  kind: AKind;
  course: string;
  name: string;
  teacher: string | null;
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
export interface AScore { id: number; student_id: string; title: string; value: number; max: number; teacher: string | null; date: string }
export interface AEvent { id: number; group_id: number | null; student_id: string | null; kind: string; title: string; at: string }

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

const invite = (id: string, name: string) =>
  `${name.split(' ')[0]}, привет! Твой ID ученика TR-YÖS Zone: ${id}\n\n` +
  `1. Открой ${SITE}\n2. Войди через Google, Telegram или создай логин и пароль\n3. Введи ID — откроются твои курсы, расписание и баллы.`;

/* ============================================================ панель */

export default function AdminPanel({
  students, groups, members, scores, events,
}: {
  students: AStudent[];
  groups: AGroup[];
  members: AMember[];
  scores: AScore[];
  events: AEvent[];
}) {
  const [tab, setTab] = useState<'students' | 'group' | 'solo'>('students');
  const inGroups = groups.filter((g) => !isSolo(g));
  const solos = groups.filter(isSolo);

  return (
    <>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>
          Ученики · {students.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'group'} className={tab === 'group' ? 'on' : ''} onClick={() => setTab('group')}>
          Группы · {inGroups.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>
          Индивидуально · {solos.length}
        </button>
      </div>
      {tab === 'students'
        ? <StudentsTab students={students} groups={groups} members={members} scores={scores} events={events} />
        : <CoursesTab kind={tab} students={students} groups={tab === 'solo' ? solos : inGroups} members={members} events={events} />}
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
          <b>{st.name}</b>
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
        <small>Тренажёр, пробные тесты и личный прогресс доступны всем, у кого есть аккаунт.</small>
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
              <span><span className={`pill ${ev.kind === 'exam' ? 'warn' : ''}`}>{KIND_RU[ev.kind] || ev.kind}</span> <b>{ev.title}</b></span>
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
          <Field label="Время" hint="Пусто — до 23:59"><input className="input" type="time" value={v.time} onChange={set('time')} /></Field>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={act.pending}>{act.pending ? 'Добавляю…' : '+ Добавить'}</button>
          {act.error ? <p className="err">{act.error}</p> : null}
        </div>
      </form>
    </>
  );
}

/* ============================== группы и индивидуальные занятия */

function CoursesTab({
  kind, students, groups, members, events,
}: {
  kind: AKind; students: AStudent[]; groups: AGroup[]; members: AMember[]; events: AEvent[];
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
          <GroupForm kind={kind} students={students} index={groups.length} onDone={() => setCreating(false)} />
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
                      <i>{scheduleText(g.schedule)}{g.teacher ? ` · ${g.teacher}` : ''}</i>
                    </div>
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
                          <GroupForm kind={kind} students={students} initial={g} studentId={people[0]?.id} index={i} />
                        </section>
                        <section>
                          <h3 className="a-h">{solo ? 'Ученик' : 'Ученики группы'}</h3>
                          {people.length ? (
                            <ul className="mini-list" style={{ marginTop: 0 }}>
                              {people.map((p) => (
                                <li key={p.id}><span>{p.name}</span><span className="code">{p.id}</span></li>
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
  kind, students, initial, studentId, index, onDone,
}: {
  kind: AKind; students: AStudent[]; initial?: AGroup; studentId?: string; index: number; onDone?: () => void;
}) {
  const act = useAction();
  const solo = kind === 'solo';
  const w = WORD[kind];
  const [saved, setSaved] = useState(false);
  const [who, setWho] = useState(studentId || '');
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
    const input: GroupInput = { ...v, kind, studentId: solo ? who : null, schedule: slots };
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
      <Field label="Преподаватель">
        <input className="input" value={v.teacher} onChange={set('teacher')} placeholder="Имя преподавателя" />
      </Field>

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
