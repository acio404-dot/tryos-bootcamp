'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { dateRu, dueRu, plural } from '@/lib/format';
import { assignHomework, deleteHomework, type HomeworkResult } from '@/lib/homework-actions';
import type { TeacherHomework } from '@/lib/homework';

export interface HwGroup { id: number; title: string; solo: boolean }
export interface HwTopic { key: string; label: string; section: string; count: number }

const COUNTS = [5, 10, 15, 20];
const MAX_TOPICS = 5;
const SECTIONS: [string, string][] = [['iq', 'Логика'], ['algebra', 'Алгебра'], ['geometry', 'Геометрия']];

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Серверное действие + обновление страницы + текст ошибки. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const run = (fn: () => Promise<HomeworkResult>, then?: (r: HomeworkResult) => void) => {
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
  return { pending, error, run };
}

/*
 * Домашка в кабинете учителя (и в админке): задать темы, число задач и срок
 * своим группам и видеть таблицу сдачи. Каждый ученик получает свой набор задач
 * из выбранных тем — списать не получится.
 */
export default function HomeworkPanel({
  groups, topics, list, today,
}: {
  groups: HwGroup[];
  topics: HwTopic[];
  list: TeacherHomework[];
  today: string;
}) {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <NewHomework groups={groups} topics={topics} today={today} />
      <div className="card">
        <div className="card-head">
          <h2>Заданные домашки</h2>
          <span className="note" style={{ margin: 0 }}>за последние два месяца</span>
        </div>
        {list.length ? (
          <div className="hwp-list">
            {list.map((h) => (
              <HomeworkCard key={h.id} h={h} today={today} group={groups.find((g) => g.id === h.group_id)?.title || 'Группа'} labelOf={(k) => topics.find((t) => t.key === k)?.label || ''} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Пока ничего не задано. Выбери темы выше — ученики увидят домашку на главной и в расписании.</p>
        )}
      </div>
    </div>
  );
}

function NewHomework({ groups, topics, today }: { groups: HwGroup[]; topics: HwTopic[]; today: string }) {
  const act = useAction();
  const [picked, setPicked] = useState<number[]>(groups.length === 1 ? [groups[0].id] : []);
  const [chosen, setChosen] = useState<string[]>([]);
  const [section, setSection] = useState('iq');
  const [q, setQ] = useState('');
  const [count, setCount] = useState(10);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [ok, setOk] = useState('');

  const touch = () => setOk('');
  const toggleGroup = (id: number) => { touch(); setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]); };
  const toggleTopic = (key: string) => {
    touch();
    if (chosen.includes(key)) setChosen(chosen.filter((x) => x !== key));
    else if (chosen.length < MAX_TOPICS) setChosen([...chosen, key]);
  };
  const labelOf = (key: string) => topics.find((t) => t.key === key)?.label || key;
  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () => topics.filter((t) => (query ? t.label.toLowerCase().includes(query) : t.section === section)),
    [topics, section, query],
  );
  const auto = chosen.length <= 2 ? chosen.map(labelOf).join(' и ') : `${chosen.slice(0, 2).map(labelOf).join(', ')} и ещё ${chosen.length - 2}`;
  const quick = [['Завтра', addDaysIso(today, 1)], ['Через 3 дня', addDaysIso(today, 3)], ['Через неделю', addDaysIso(today, 7)]] as const;
  const ready = picked.length > 0 && chosen.length > 0 && Boolean(date);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(() => assignHomework({ groups: picked, topics: chosen, count, date, time, title, note }), (r) => {
      setOk(`Задано: ${title.trim() || auto}, ${count} ${plural(count, 'задача', 'задачи', 'задач')}, срок ${dueRu(today, date, time || '23:59')}${(r.count || 1) > 1 ? ` · групп: ${r.count}` : ''}`);
      setChosen([]);
      setQ('');
      setTitle('');
      setNote('');
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Задать домашку</h2>
        <span className="note" style={{ margin: 0 }}>у каждого ученика свои задачи из этих тем</span>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span className="field-label">Кому</span>
          <div className="checks">
            {groups.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                {g.title}{g.solo ? ' · инд.' : ''}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Темы · {chosen.length} из {MAX_TOPICS}</span>
          {chosen.length ? (
            <div className="hwp-chosen">
              {chosen.map((k) => (
                <button key={k} type="button" className="chip chip-lamp" onClick={() => toggleTopic(k)} title="Убрать тему">{labelOf(k)} ×</button>
              ))}
            </div>
          ) : null}
          <div className="hwp-pick">
            <div className="seg hwp-seg" role="tablist" aria-label="Раздел">
              {SECTIONS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={!query && section === k} className={!query && section === k ? 'on' : ''} onClick={() => { setQ(''); setSection(k); }}>{label}</button>
              ))}
            </div>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти тему" aria-label="Найти тему" />
          </div>
          <div className="hwp-topics">
            {shown.map((t) => {
              const on = chosen.includes(t.key);
              return (
                <button key={t.key} type="button" className={`hwp-topic${on ? ' on' : ''}`} aria-pressed={on}
                  disabled={!on && chosen.length >= MAX_TOPICS} onClick={() => toggleTopic(t.key)}>
                  {t.label}<i>{t.count}</i>
                </button>
              );
            })}
            {!shown.length ? <span className="muted">Такой темы нет. Попробуй другое слово.</span> : null}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Сколько задач</span>
          <div className="seg hwp-seg">
            {COUNTS.map((n) => (
              <button key={n} type="button" className={count === n ? 'on' : ''} onClick={() => { touch(); setCount(n); }}>{n}</button>
            ))}
          </div>
          <small>Примерно {Math.round(count * 1.5)} {plural(Math.round(count * 1.5), 'минута', 'минуты', 'минут')}: по полторы минуты на задачу.</small>
        </div>

        <div className="fields-2">
          <label className="field">
            <span className="field-label">Срок</span>
            <input className="input" type="date" required min={today} value={date} onChange={(e) => { touch(); setDate(e.target.value); }} />
            <span className="t-quick">
              {quick.map(([label, d]) => (
                <button key={label} type="button" className={date === d ? 'on' : ''} onClick={() => { touch(); setDate(d); }}>{label}</button>
              ))}
            </span>
          </label>
          <label className="field">
            <span className="field-label">Время</span>
            <input className="input" type="time" value={time} onChange={(e) => { touch(); setTime(e.target.value); }} />
            <small>Пусто — до конца дня</small>
          </label>
        </div>

        <div className="fields-2">
          <label className="field">
            <span className="field-label">Название</span>
            <input className="input" value={title} maxLength={100} onChange={(e) => { touch(); setTitle(e.target.value); }} placeholder={auto || 'Само: по названиям тем'} />
            <small>Необязательно</small>
          </label>
          <label className="field">
            <span className="field-label">Комментарий ученикам</span>
            <input className="input" value={note} maxLength={300} onChange={(e) => { touch(); setNote(e.target.value); }} placeholder="Решайте с черновиком" />
            <small>Необязательно</small>
          </label>
        </div>

        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn btn-dark" disabled={act.pending || !ready}>{act.pending ? 'Задаю…' : 'Задать домашку'}</button>
          {!ready ? <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Нужны группа, хотя бы одна тема и срок</span> : null}
          {ok ? <p className="okmsg" role="status">{ok}</p> : null}
          {act.error ? <p className="err" role="alert">{act.error}</p> : null}
        </div>
      </form>
    </div>
  );
}

function HomeworkCard({ h, group, today, labelOf }: { h: TeacherHomework; group: string; today: string; labelOf: (k: string) => string }) {
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const done = h.rows.filter((r) => r.finished).length;
  const started = h.rows.filter((r) => r.started && !r.finished).length;
  // темы, которых больше нет в каталоге, не показываем
  const topics = h.topics.map(labelOf).filter(Boolean).join(', ');

  return (
    <div className={`hwp-card${h.overdue ? ' past' : ''}`}>
      <div className="hwp-head">
        <div>
          <b>{h.title}</b>
          <i>{group} · {h.count} {plural(h.count, 'задача', 'задачи', 'задач')} · {h.overdue ? `срок был ${dateRu(h.day, false)}` : dueRu(today, h.day, h.time)}</i>
          {topics && topics !== h.title ? <i>{topics}</i> : null}
          {h.note ? <i>«{h.note}»</i> : null}
        </div>
        <span className={`chip${done === h.rows.length && h.rows.length ? ' chip-ok' : done ? ' chip-lamp' : ''}`}>сдали {done} из {h.rows.length}</span>
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${h.rows.length ? Math.round((done / h.rows.length) * 100) : 0}%` }} /></div>
      <div className="hwp-act">
        <button type="button" className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Скрыть таблицу' : `Таблица сдачи${started ? ` · в работе ${started}` : ''}`}
        </button>
        {ask ? (
          <span className="hwp-ask">
            Удалить домашку у всех?
            <button type="button" className="linklike danger" disabled={act.pending} onClick={() => act.run(() => deleteHomework(h.id))}>{act.pending ? 'Удаляю…' : 'Да, удалить'}</button>
            <button type="button" className="linklike" onClick={() => setAsk(false)}>Нет</button>
          </span>
        ) : (
          <button type="button" className="linklike danger" onClick={() => setAsk(true)}>Удалить</button>
        )}
      </div>
      {act.error ? <p className="err" role="alert">{act.error}</p> : null}
      {open ? (
        <div className="table-wrap">
          <table className="tbl hwp-tbl">
            <thead><tr><th>Ученик</th><th>Статус</th><th className="num">Решено</th><th className="num">С первой</th><th className="num">Со второй</th></tr></thead>
            <tbody>
              {h.rows.map((r) => {
                const status = !r.bound ? 'нет аккаунта' : r.finished ? (r.late ? 'сдано после срока' : 'сдано') : r.started ? 'в работе' : h.overdue ? 'не сдано' : 'не начато';
                const when = r.finished ? `${r.finished.slice(8, 10)}.${r.finished.slice(5, 7)} в ${r.finished.slice(11)}` : '';
                const cls = !r.bound ? '' : r.finished ? (r.late ? 'warn' : 'ok') : r.started ? 'warn' : h.overdue ? 'bad' : '';
                return (
                  <tr key={r.student_id}>
                    <td><a href={`/students/${r.student_id}`}>{r.name}</a></td>
                    <td><span className={`hwp-st ${cls}`}>{status}</span>{when ? <i className="hwp-when">{when}</i> : null}</td>
                    <td className="num">{r.started ? `${r.done} из ${h.count}` : '—'}</td>
                    <td className="num">{r.started ? r.ok1 : '—'}</td>
                    <td className="num">{r.started ? r.ok2 : '—'}</td>
                  </tr>
                );
              })}
              {!h.rows.length ? <tr><td colSpan={5} className="muted">В группе пока нет учеников.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
