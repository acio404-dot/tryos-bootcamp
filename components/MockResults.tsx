'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { MockBatch, MockInput } from '@/lib/mock';
import { dateShort, plural } from '@/lib/format';

export interface MGroup { id: number; course: string; name: string; kind?: string; color?: string | null }
export interface MStudent { id: string; name: string; group_id: number | null }
export interface MExam { title: string; day: string; group_id: number | null }

type Res = { error?: string; count?: number };

const MAX = 500;
const COLORS = ['#1E8F8A', '#2C7FB0', '#7A5AC8', '#C9791C', '#1F9D6B'];
const gTitle = (g: MGroup) => (g.name ? `${g.course} · ${g.name}` : g.course);
const blankRow = { score: '', correct: '', wrong: '' };

/*
 * Результаты очного пробного тестирования: выбрать группу, вписать баллы.
 * Балл попадает ученику на главную и в «Прогресс» вместе с онлайн-пробниками.
 */
export default function MockResults({
  groups, students, batches, exams, today, save, remove, everyone = false,
}: {
  groups: MGroup[];
  students: MStudent[];
  batches: MockBatch[];
  exams: MExam[];
  today: string;
  save: (input: MockInput) => Promise<Res>;
  remove: (batch: string) => Promise<Res>;
  /** Админ может вносить баллы любым ученикам, не только по группам. */
  everyone?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  // проведённые тестирования из расписания: одно на несколько групп — один пункт
  const held = useMemo(
    () => exams.filter((x, i) => x.day <= today && exams.findIndex((y) => y.title === x.title && y.day === x.day) === i),
    [exams, today],
  );
  const entered = (x: MExam) => batches.find((b) => b.title === x.title && b.date === x.day);
  const firstNew = held.findIndex((x) => !entered(x));
  const start0 = firstNew >= 0 ? held[firstNew] : null;
  const groupOk = (id: number | null) => id != null && groups.some((g) => g.id === id);

  // что выбрано в «Тестирование»: ev:N — из расписания, b:ID — уже внесённое, new — своё
  const [pick, setPick] = useState<string>(start0 ? `ev:${firstNew}` : 'new');
  const [gid, setGid] = useState<string>(
    start0 && groupOk(start0.group_id) ? String(start0.group_id) : groups.length === 1 ? String(groups[0].id) : '',
  );
  const [title, setTitle] = useState(start0?.title || 'Пробное тестирование');
  const [date, setDate] = useState(start0?.day || today);
  const [batch, setBatch] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, typeof blankRow>>({});
  const [q, setQ] = useState('');

  // ученики выбранной группы (или все — для админа), без повторов
  const list = useMemo(() => {
    const seen = new Set<string>();
    const src = gid === 'all' ? students : students.filter((s) => String(s.group_id) === gid);
    const out = src.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    // при правке показываем и тех, кто уже в тестировании, даже если его нет в группе
    for (const id of Object.keys(vals)) {
      if (!seen.has(id)) {
        const st = students.find((s) => s.id === id);
        if (st) { out.push(st); seen.add(id); }
      }
    }
    const s = q.trim().toLowerCase();
    return (s ? out.filter((x) => x.name.toLowerCase().includes(s)) : out).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [gid, students, vals, q]);

  const filled = Object.values(vals).filter((v) => v.score.trim() !== '').length;
  const setVal = (id: string, k: keyof typeof blankRow, v: string) => {
    setOk('');
    setVals({ ...vals, [id]: { ...(vals[id] || blankRow), [k]: v.replace(/[^\d]/g, '').slice(0, 3) } });
  };

  const reset = () => { setBatch(null); setVals({}); setTitle('Пробное тестирование'); setDate(today); setPick('new'); };

  const choose = (v: string) => {
    setOk(''); setError('');
    if (v.startsWith('b:')) {
      const b = batches.find((x) => x.batch === v.slice(2));
      if (b) edit(b);
      return;
    }
    setBatch(null); setVals({}); setPick(v);
    if (v.startsWith('ev:')) {
      const x = held[Number(v.slice(3))];
      if (x) {
        const b = entered(x);
        if (b) { edit(b); return; }
        setTitle(x.title); setDate(x.day);
        if (groupOk(x.group_id)) setGid(String(x.group_id));
      }
    } else {
      setTitle('Пробное тестирование'); setDate(today);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setOk('');
    const rows = Object.entries(vals).map(([studentId, v]) => ({ studentId, ...v }));
    start(async () => {
      try {
        const r = await save({ batch, title, date, rows });
        if (r.error) { setError(r.error); return; }
        setOk(`${batch ? 'Обновлено' : 'Сохранено'}: ${r.count} ${plural(r.count || 0, 'результат', 'результата', 'результатов')}. Ученики уже видят балл на главной.`);
        reset();
        router.refresh();
      } catch {
        setError('Не получилось сохранить. Обнови страницу и попробуй ещё раз');
      }
    });
  };

  const edit = (b: MockBatch) => {
    setOk(''); setError('');
    setBatch(b.batch); setTitle(b.title); setDate(b.date); setPick(`b:${b.batch}`);
    setVals(Object.fromEntries(b.rows.map((r) => [r.student_id, { score: String(r.score), correct: r.correct ? String(r.correct) : '', wrong: r.wrong ? String(r.wrong) : '' }])));
    // группа, в которой больше всего учеников этого тестирования
    const counts = new Map<number, number>();
    for (const r of b.rows) for (const s of students) if (s.id === r.student_id && s.group_id != null) counts.set(s.group_id, (counts.get(s.group_id) || 0) + 1);
    const best = [...counts.entries()].sort((a, c) => c[1] - a[1])[0];
    setGid(best ? String(best[0]) : everyone ? 'all' : gid);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const del = (b: MockBatch) => {
    if (!confirm(`Удалить результаты «${b.title}» (${b.rows.length} уч.)? Баллы пропадут у учеников.`)) return;
    setError('');
    start(async () => {
      const r = await remove(b.batch);
      if (r.error) setError(r.error);
      else { if (batch === b.batch) reset(); router.refresh(); }
    });
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>{batch ? 'Изменить результаты' : 'Результаты пробного тестирования'}</h2>
          <span className="note" style={{ margin: 0 }}>балл из {MAX} · появится на главной ученика</span>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="fields-2">
            <label className="field">
              <span className="field-label">Тестирование</span>
              <select className="select" value={pick} onChange={(e) => choose(e.target.value)}>
                {held.length ? (
                  <optgroup label="Проведённые по расписанию">
                    {held.map((x, i) => {
                      const g = groups.find((y) => y.id === x.group_id);
                      return (
                        <option key={i} value={`ev:${i}`}>
                          {x.title} · {dateShort(x.day).day} {dateShort(x.day).mon}{g ? ` · ${gTitle(g)}` : ''}{entered(x) ? ' · внесено' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ) : null}
                {batches.length ? (
                  <optgroup label="Уже внесённые — изменить">
                    {batches.map((x) => (
                      <option key={x.batch} value={`b:${x.batch}`}>{x.title} · {dateShort(x.date).day} {dateShort(x.date).mon} · {x.rows.length} уч.</option>
                    ))}
                  </optgroup>
                ) : null}
                <option value="new">+ Своё тестирование</option>
              </select>
              {!held.length ? <small>Тестирования из расписания появятся здесь, когда пройдут. Пока можно добавить своё.</small> : null}
            </label>
            <label className="field">
              <span className="field-label">Группа</span>
              <select className="select" value={gid} onChange={(e) => { setOk(''); setGid(e.target.value); }}>
                <option value="">— выбери группу —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{gTitle(g)}{g.kind === 'solo' ? ' · инд.' : ''}</option>)}
                {everyone ? <option value="all">Все ученики</option> : null}
              </select>
            </label>
          </div>

          {pick === 'new' || batch ? (
            <div className="fields-2">
              <label className="field">
                <span className="field-label">Название</span>
                <input className="input" required value={title} onChange={(e) => { setOk(''); setTitle(e.target.value); }} placeholder="Пробник в центре, 12 октября" />
              </label>
              <label className="field">
                <span className="field-label">Дата</span>
                <input className="input" type="date" required max={today} value={date} onChange={(e) => { setOk(''); setDate(e.target.value); }} />
              </label>
            </div>
          ) : null}

          {gid ? (
            <div className="field">
              <span className="field-label">
                Баллы {filled ? <span className="muted">· вписано {filled}</span> : null}
              </span>
              {gid === 'all' || list.length > 12 ? (
                <input className="input" type="search" placeholder="Поиск ученика" value={q} onChange={(e) => setQ(e.target.value)} />
              ) : null}
              {list.length ? (
                <div className="mk-table" role="table" aria-label="Баллы учеников">
                  <div className="mk-row mk-head" role="row">
                    <span role="columnheader">Ученик</span>
                    <span role="columnheader">Балл</span>
                    <span role="columnheader" className="mk-opt">Верно</span>
                    <span role="columnheader" className="mk-opt">Неверно</span>
                  </div>
                  {list.map((s, i) => {
                    const v = vals[s.id] || blankRow;
                    const bad = v.score !== '' && Number(v.score) > MAX;
                    return (
                      <div className="mk-row" role="row" key={s.id}>
                        <span role="cell" className="mk-name">{s.name}</span>
                        <span role="cell">
                          <input className={`input mk-in${bad ? ' bad' : ''}`} inputMode="numeric" aria-label={`Балл: ${s.name}`}
                            placeholder="—" value={v.score} onChange={(e) => setVal(s.id, 'score', e.target.value)}
                            onKeyDown={(e) => {
                              // Enter — к следующему ученику, как в таблице
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const next = document.querySelectorAll<HTMLInputElement>('.mk-in')[i + 1];
                                next?.focus();
                              }
                            }} />
                        </span>
                        <span role="cell" className="mk-opt">
                          <input className="input mk-in2" inputMode="numeric" aria-label={`Верно: ${s.name}`} placeholder="—"
                            value={v.correct} onChange={(e) => setVal(s.id, 'correct', e.target.value)} />
                        </span>
                        <span role="cell" className="mk-opt">
                          <input className="input mk-in2" inputMode="numeric" aria-label={`Неверно: ${s.name}`} placeholder="—"
                            value={v.wrong} onChange={(e) => setVal(s.id, 'wrong', e.target.value)} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : <small>{q ? 'Никого не нашлось.' : 'В этой группе пока нет учеников.'}</small>}
              <small>Пустой балл — ученик не писал. «Верно» и «Неверно» — по желанию. Enter — к следующему ученику.</small>
            </div>
          ) : null}

          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn btn-dark" disabled={pending || !filled}>{pending ? 'Сохраняю…' : batch ? 'Сохранить изменения' : 'Сохранить баллы'}</button>
            {batch ? <button type="button" className="btn btn-ghost" onClick={reset} disabled={pending}>Отмена</button> : null}
            {ok ? <p className="okmsg">{ok}</p> : null}
            {error ? <p className="err">{error}</p> : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head"><h2>Внесённые тестирования</h2></div>
        {batches.length ? (
          <div className="a-list">
            {batches.map((b, i) => {
              const avg = Math.round(b.rows.reduce((a, r) => a + r.score, 0) / b.rows.length);
              const best = b.rows.reduce((a, r) => (r.score > a.score ? r : a), b.rows[0]);
              return (
                <div className="a-row" key={b.batch}>
                  <div className="a-row-head">
                    <span className="c-dot" style={{ background: COLORS[i % COLORS.length], width: 12, height: 12 }} />
                    <div className="grow">
                      <b>{b.title}</b>
                      <i>
                        {dateShort(b.date).day} {dateShort(b.date).mon} · {b.rows.length} уч. · средний {avg} · лучший {best.score} ({best.name})
                        {b.teacher ? ` · внёс ${b.teacher}` : ''}
                      </i>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(b)} disabled={pending}>Изменить</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => del(b)} disabled={pending}>Удалить</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>Пока ничего не внесено.</p>}
      </div>
    </div>
  );
}
