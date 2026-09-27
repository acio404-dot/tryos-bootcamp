'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Group } from '@/lib/data';
import { DOW, dateShort, plural, whenRu } from '@/lib/format';
import {
  addTeacherEvent, addTeacherScore, deleteTeacherEvent, deleteTeacherScore, saveGroupLinks, setEventLink, setLessonInfo,
  type TeacherResult,
} from '@/lib/teacher-actions';
import StreakBadge from './StreakBadge';

export interface TStudent { id: string; name: string; group_id: number; streak: number }
export interface TLesson { date: string; start: string; end: string; group_id: number; link: string | null; own: boolean; topic: string | null }
export interface TEvent { id: number; group_id: number; kind: string; title: string; link: string | null; note: string | null; batch: string | null; day: string; time: string }
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

type Tab = 'lessons' | 'groups' | 'scores';

export default function TeachPanel({
  groups, students, lessons, events, scores, today,
}: {
  groups: Group[]; students: TStudent[]; lessons: TLesson[]; events: TEvent[]; scores: TScore[]; today: string;
}) {
  const [tab, setTab] = useState<Tab>('lessons');
  const colorOf = (id: number) => {
    const i = groups.findIndex((g) => g.id === id);
    return groups[i]?.color || COLORS[Math.max(0, i) % COLORS.length];
  };
  const groupOf = (id: number) => groups.find((g) => g.id === id);

  return (
    <div className="teach">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'lessons'} className={tab === 'lessons' ? 'on' : ''} onClick={() => setTab('lessons')}>Занятия</button>
        <button type="button" role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Мои группы · {groups.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'scores'} className={tab === 'scores' ? 'on' : ''} onClick={() => setTab('scores')}>Оценки</button>
      </div>

      {tab === 'lessons' ? (
        <div className="grid" style={{ gap: 16 }}>
          <Upcoming lessons={lessons} events={events} today={today} groupOf={groupOf} colorOf={colorOf} />
          <NewLesson groups={groups} today={today} colorOf={colorOf} />
        </div>
      ) : tab === 'groups' ? (
        <div className="t-groups">
          {groups.map((g) => (
            <GroupCard key={g.id} g={g} color={colorOf(g.id)} people={students.filter((s) => s.group_id === g.id)}
              deadlines={events.filter((e) => e.group_id === g.id && e.kind === 'deadline')} />
          ))}
        </div>
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
  lessons, events, today, groupOf, colorOf,
}: {
  lessons: TLesson[]; events: TEvent[]; today: string; groupOf: (id: number) => Group | undefined; colorOf: (id: number) => string;
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
                      {r.type === 'event' ? ` · ${KIND_RU[r.e.kind] || 'занятие'} · ${g ? title(g) : ''}` : g?.kind === 'solo' ? ' · индивидуально' : ''}
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
          onClick={() => { if (confirm(`Отменить «${e.title}»? Ученики перестанут его видеть.`)) act.run(() => deleteTeacherEvent(e.id), onDone); }}>Отменить занятие</button>
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

function GroupCard({ g, color, people, deadlines }: { g: Group; color: string; people: TStudent[]; deadlines: TEvent[] }) {
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
        <span className="pill">{g.kind === 'solo' ? people[0]?.name || 'ученик не выбран' : `${people.length} уч.`}</span>
      </div>

      {g.kind !== 'solo' ? (
        people.length ? (
          <ul className="t-people">
            {people.map((p) => <li key={p.id}>{p.name}<StreakBadge n={p.streak} /></li>)}
          </ul>
        ) : <p className="muted" style={{ fontSize: 13.5 }}>В группе пока нет учеников — их добавляет администратор.</p>
      ) : null}

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
