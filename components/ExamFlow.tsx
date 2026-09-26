'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicQuestion } from '@/lib/bank-types';
import ExamScratch from './ExamScratch';

const LETTERS = 'ABCDE';

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
};

/*
 * Пробник: одна задача на экране, таймер, карта вариантов внизу.
 * Ответы уходят на сервер каждые 15 секунд и при каждом выборе — перезагрузка
 * страницы или потеря связи не обнуляют стоминутную работу.
 */
export default function ExamFlow({
  runId, questions, minutes, startedAt, initial,
}: {
  runId: string;
  questions: PublicQuestion[];
  minutes: number;
  startedAt: string;
  initial: (number | null)[];
}) {
  const router = useRouter();
  const deadline = useMemo(() => Date.parse(startedAt) + minutes * 60_000, [startedAt, minutes]);
  // Ответы держим картой «id задачи → вариант»: так они не съедут,
  // даже если банк обновится и порядок задач в варианте изменится.
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    questions.forEach((q, k) => {
      const v = initial[k];
      if (typeof v === 'number') m[q.id] = v;
    });
    return m;
  });
  const [i, setI] = useState(() => {
    const first = questions.findIndex((q, k) => initial[k] === null || initial[k] === undefined);
    return first < 0 ? 0 : first;
  });
  const [left, setLeft] = useState(() => Math.max(0, (deadline - Date.now()) / 1000));
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  // Черновик во весь экран; открытым или закрытым он остаётся и после перезагрузки.
  const [scratch, setScratch] = useState(false);
  useEffect(() => {
    try { setScratch(localStorage.getItem('tryos-scratch-open') === '1'); } catch { /* хранилище недоступно */ }
  }, []);
  const toggleScratch = (on: boolean) => {
    setScratch(on);
    try { localStorage.setItem('tryos-scratch-open', on ? '1' : '0'); } catch { /* хранилище недоступно */ }
  };
  const dirty = useRef(false);
  const finished = useRef(false);

  const answered = questions.filter((q) => answers[q.id] !== undefined).length;

  const save = useCallback(async (list: Record<string, number>) => {
    try {
      await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: runId, answers: list }),
      });
      dirty.current = false;
    } catch {
      /* попробуем в следующий раз — ответы остаются в состоянии страницы */
    }
  }, [runId]);

  const finish = useCallback(async (list: Record<string, number>) => {
    if (finished.current) return;
    finished.current = true;
    setSending(true);
    try {
      const res = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', id: runId, answers: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось завершить');
      router.replace(`/exam/${runId}/result`);
    } catch (e) {
      finished.current = false;
      setSending(false);
      setError(e instanceof Error ? e.message : 'Не удалось завершить');
    }
  }, [router, runId]);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Таймер и автосохранение.
  useEffect(() => {
    const t = setInterval(() => {
      const sec = Math.max(0, (deadline - Date.now()) / 1000);
      setLeft(sec);
      if (sec <= 0) finishRef.current(answersRef.current);
    }, 1000);
    const s = setInterval(() => {
      if (dirty.current) save(answersRef.current);
    }, 15_000);
    return () => { clearInterval(t); clearInterval(s); };
  }, [deadline, save]);

  // Уход со страницы — предупредить и попытаться сохранить.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (finished.current) return;
      if (dirty.current) save(answersRef.current);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [save]);

  const pick = (opt: number) => {
    const qid = questions[i]?.id;
    if (!qid) return;
    setAnswers((prev) => {
      const next = { ...prev };
      if (next[qid] === opt) delete next[qid];
      else next[qid] = opt;
      dirty.current = true;
      return next;
    });
  };

  // Горячие клавиши: 1–5 или A–E выбирают, стрелки листают.
  // В черновике буквы переключают инструменты, поэтому там ответ выбирается только цифрами.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (confirm) return;
      if (scratch && e.key === 'Enter') return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); setI((n) => Math.min(n + 1, questions.length - 1)); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); return; }
      const k = e.key.toUpperCase();
      const byDigit = '12345'.indexOf(k);
      const byLetter = scratch ? -1 : LETTERS.indexOf(k);
      const idx = byDigit >= 0 ? byDigit : byLetter;
      if (idx >= 0 && idx < 5) { e.preventDefault(); pick(idx); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, questions.length, scratch, confirm]);

  const q = questions[i];
  const low = left < 300;

  return (
    <div className="exam-run">
      <div className="exam-bar">
        <span className={`clock${low ? ' low' : ''}`}>{mmss(left)}</span>
        <span className="st">Задача {i + 1} из {questions.length}</span>
        <span className="st">Отвечено {answered}</span>
        <span className="bar-act">
          <button type="button" className="btn btn-ghost" onClick={() => toggleScratch(true)}
            title="Лист для записей и чертежей: у каждой задачи свой">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.17 6.81a2.82 2.82 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" />
            </svg>
            Черновик
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)} disabled={sending}>
            Завершить
          </button>
        </span>
      </div>

      {scratch ? (
        <ExamScratch
          runId={runId}
          questions={questions}
          index={i}
          setIndex={setI}
          answers={answers}
          pick={pick}
          clock={mmss(left)}
          low={low}
          onClose={() => toggleScratch(false)}
          onFinish={() => setConfirm(true)}
        />
      ) : null}

      <div className="qcard">
        <div className="qtag">{q.section === 'iq' ? 'Логика' : 'Математика'}</div>
        <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
        {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

        <div className="qopts" role="radiogroup" aria-label="Варианты ответа">
          {q.options.map((o, k) => (
            <button key={k} type="button" role="radio" aria-checked={answers[q.id] === k}
              className={`qopt${answers[q.id] === k ? ' on' : ''}`} onClick={() => pick(k)}>
              <span className="ql">{LETTERS[k]}</span>
              <span className="qo">{o}</span>
            </button>
          ))}
        </div>

        <div className="qact">
          <span className="qhint">Правильный ответ и разбор будут после завершения</span>
          <span className="nav-pair">
            <button type="button" className="btn btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Назад</button>
            <button type="button" className="btn btn-primary" disabled={i >= questions.length - 1} onClick={() => setI(i + 1)}>Дальше</button>
          </span>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><h2>Карта варианта</h2><span className="note" style={{ margin: 0 }}>серым — без ответа</span></div>
        <div className="map">
          {questions.map((qq, k) => (
            <button key={qq.id} type="button"
              className={`mapb${answers[qq.id] !== undefined ? ' done' : ''}${k === i ? ' cur' : ''}`}
              onClick={() => setI(k)}>{k + 1}</button>
          ))}
        </div>
      </div>

      {confirm ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-box">
            <h3>Завершить пробник?</h3>
            <p>Отвечено {answered} из {questions.length}. Пустые ответы считаются как пропуск —
              они не отнимают баллы, но и не добавляют.</p>
            <div className="modal-act">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Вернуться</button>
              <button type="button" className="btn btn-primary" disabled={sending} onClick={() => finish(answers)}>
                {sending ? 'Считаю балл…' : 'Завершить и увидеть балл'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="qerr">{error}</p> : null}
    </div>
  );
}
