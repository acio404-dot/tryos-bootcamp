'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SCHOOL_TZ } from '@/lib/format';
import { KIND_LABEL, TEMPO, type RunState } from '@/lib/set-types';
import { announceStreak, type StreakUp } from '@/lib/streak-client';
import { PRACTICE_SHEETS, useSheetOpen } from '@/lib/use-sheet';
import { nurSrc, type NurMood } from './Nur';
import { SheetChip } from './SheetButton';
import SheetOverlay from './SheetOverlay';

const LETTERS = 'ABCDE';
const NO_NET = 'Нет связи. Проверь интернет и нажми ещё раз.';
const NO_NET_ANSWER = 'Нет связи. Ответ не отправлен: проверь интернет и нажми ещё раз.';
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Короткие ответы (числа) показываем плитками в ряд. */
const isShort = (opts: string[]) => opts.length === 5 && opts.every((o) => o.length <= 4);

/** Час по времени школы: с 02:00 до 06:00 Nur выключен и молчит. */
function nurAsleep(): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: SCHOOL_TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
    return h >= 2 && h < 6;
  } catch {
    return false;
  }
}

class ApiError extends Error {
  status: number;
  state?: RunState;
  constructor(message: string, status: number, state?: RunState) {
    super(message);
    this.status = status;
    this.state = state;
  }
}

/*
 * Экран задачи для смены и домашки. Во весь экран, без меню: только задача и выход.
 * Первая ошибка — подсказка Nur и вторая попытка за половину света; вторая — разбор.
 * Ответы проверяет сервер, состояние хранится там же: экран можно закрыть и вернуться.
 */
export default function TaskRun({
  initial, title, exitHref, exitLabel,
}: {
  initial: RunState;
  /** «Смена» или название домашки. */
  title: string;
  exitHref: string;
  exitLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RunState>(initial);
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [sheet, setSheet] = useSheetOpen();
  const [left, setLeft] = useState(TEMPO);
  const scene = useRef<HTMLDivElement>(null);
  const pendingStreak = useRef<StreakUp | null>(null);
  const hintBox = useRef<HTMLDivElement>(null);
  const verdictBox = useRef<HTMLDivElement>(null);

  const task = state.task;
  const q = task?.question;
  const verdict = task?.verdict ?? null;
  const hint = task && !verdict ? task.hint : null;
  const lastTask = state.cur >= state.total - 1;
  const what = state.kind === 'shift' ? 'смены' : 'домашки';

  const toTop = () => { requestAnimationFrame(() => scene.current?.scrollTo(0, 0)); };

  const post = async (payload: Record<string, unknown>) => {
    let res: Response;
    try {
      res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ApiError(NO_NET, 0);
    }
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(d?.error || 'Не получилось. Попробуй ещё раз.', res.status, d?.state);
    return d as { state: RunState; streakUp?: StreakUp | null };
  };

  /** Ошибка запроса. 409 — на сервере состояние уже другое (ответ дошёл, вторая вкладка): показываем его. */
  const fail = (e: unknown, answering = false) => {
    const err = e instanceof ApiError ? e : null;
    if (err?.status === 409 && err.state) {
      setState(err.state);
      setChosen(null);
      setError('');
      return;
    }
    const gone = err?.status === 404 && state.kind === 'homework';
    setError(gone ? 'Этой домашки больше нет: учитель её убрал.' : err?.status === 0 && answering ? NO_NET_ANSWER : err?.message || 'Не получилось. Попробуй ещё раз.');
    if (err && (err.status === 401 || err.status === 404)) setFatal(true);
  };

  const submit = async () => {
    if (chosen === null || busy || verdict || !task) return;
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'answer', id: state.id, step: state.step, chosen });
      if (d.streakUp) pendingStreak.current = d.streakUp;
      setState(d.state);
      setChosen(null);
    } catch (e) {
      fail(e, true);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Набор закрыт: итоги показывает сама страница. Сначала проверяем связь —
   * без неё переход увёл бы на страницу браузера «нет интернета».
   */
  const showFinale = async () => {
    if (leaving) return;
    setLeaving(true);
    setError('');
    try {
      await post({ action: 'state', id: state.id });
    } catch (e) {
      setLeaving(false);
      fail(e);
      return;
    }
    announceStreak(pendingStreak.current);
    pendingStreak.current = null;
    setSheet(false);
    if (state.kind === 'shift') router.replace(`/shift?done=${encodeURIComponent(state.id)}`);
    router.refresh();
  };

  const next = async () => {
    if (busy || !verdict) return;
    if (state.finished) { showFinale(); return; }
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'next', id: state.id, step: state.step });
      setState(d.state);
      setChosen(null);
      toTop();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // Таймер темпа: 75 секунд, как на экзамене. Идёт только до первого ответа.
  const taskKey = `${state.id}:${state.cur}`;
  const ticking = Boolean(task && !verdict && !hint);
  useEffect(() => {
    if (!ticking || !task) return;
    const started = performance.now() - task.elapsed * 1000;
    const tick = () => setLeft(Math.ceil(TEMPO - (performance.now() - started) / 1000));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, ticking]);

  useEffect(() => { setAsleep(nurAsleep()); }, []);

  // Подсказка и итог задачи появляются ниже условия: подводим их под глаза.
  const phase = verdict ? 'verdict' : hint ? 'hint' : 'task';
  useEffect(() => {
    if (phase === 'task') return;
    const el = phase === 'hint' ? hintBox.current : verdictBox.current;
    const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => {
      // фокус — на подсказку или итог: кнопка, на которой он был, стала недоступной
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: phase === 'hint' ? 'center' : 'nearest' });
    }, 60);
    return () => clearTimeout(t);
  }, [phase, taskKey]);

  // Экран задачи закрывает меню: страница под ним не прокручивается и недоступна с клавиатуры.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const hidden = Array.from(document.querySelectorAll<HTMLElement>('.side, .tabbar'));
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      document.body.style.overflow = prev;
      hidden.forEach((el) => el.removeAttribute('inert'));
    };
  }, []);

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const nextRef = useRef(next);
  nextRef.current = next;
  const wrongKey = (task?.wrong || []).join(',');
  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        // Enter на ссылке или посторонней кнопке нажимает её саму; на варианте ответа — отправляет ответ
        if (tag === 'A' || (tag === 'BUTTON' && !el?.classList.contains('qopt'))) return;
        e.preventDefault();
        if (verdict) nextRef.current();
        else submitRef.current();
        return;
      }
      if (verdict) return;
      const byDigit = '12345'.indexOf(e.key);
      // буквы — по клавише, а не по символу: на русской раскладке A–E тоже работают
      const byLetter = sheet ? -1 : ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE'].indexOf(e.code);
      const i = byDigit >= 0 ? byDigit : byLetter;
      if (i >= 0 && i < q.options.length && !(task?.wrong || []).includes(i)) setChosen(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, Boolean(verdict), wrongKey, sheet]);

  // Задачи на экране нет: набор уже закрыт (итоги покажет страница) или что-то разошлось с сервером.
  if (!task || !q) {
    return (
      <div className="tr tr-over" ref={scene}>
        <div className="tr-in">
          <p className="muted" role="status">{error || (state.finished ? 'Открываю итоги…' : 'Не получилось открыть задачу. Обнови страницу.')}</p>
          <div className="tr-over-act">
            <a className="btn btn-dark btn-lg" href={state.kind === 'shift' ? '/shift' : exitHref}>{state.finished ? 'К итогам' : 'Обновить'}</a>
            <Link className="btn btn-lg" href={exitHref}>{exitLabel}</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------- задача */

  const tiles = isShort(q.options);
  const overTempo = left <= 0;
  const head = `${q.topicLabel} · ${KIND_LABEL[task.kind]}`;
  const verdictText = !verdict ? '' : verdict.result === 'ok'
    ? `Верно!${task.shadow ? ` Тень «${task.shadow.name}» отступила.` : ''}`
    : verdict.result === 'second'
      ? 'Верно со второй попытки.'
      : `Неверно. Правильный ответ — ${LETTERS[verdict.correct]}.`;
  const nurMood: NurMood = verdict ? (verdict.result === 'ok' ? 'proud' : verdict.result === 'second' ? 'wink' : 'support') : 'think';

  /* Что случилось после ответа — одной строкой для программ чтения с экрана. */
  const announce = verdict
    ? `${verdictText}${verdict.light ? ` Плюс ${verdict.light} света.` : ''}`
    : hint ? `Неверно. Вторая попытка за половину света. ${hint.nur}` : '';

  const errBox = error ? (
    <p className="qerr" role="alert">
      {error}{' '}
      {fatal ? <Link className="linklike" href={exitHref}>{exitLabel}</Link> : null}
    </p>
  ) : null;

  const action = verdict ? (
    <button type="button" className="btn btn-dark btn-lg tr-go" disabled={busy || leaving} onClick={next}>
      {leaving ? 'Открываю итоги…' : busy ? 'Секунду…' : state.finished ? `Итоги ${what}` : lastTask ? 'Дальше' : 'Следующая задача'}
    </button>
  ) : (
    <button type="button" className="btn btn-primary btn-lg tr-go" disabled={chosen === null || busy} onClick={submit}>
      {busy ? 'Проверяю…' : chosen === null ? 'Выбери ответ' : hint ? `Ответить ещё раз: ${LETTERS[chosen]}` : `Ответить: ${LETTERS[chosen]}`}
    </button>
  );

  const body = (
    <>
      <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
      {q.figure ? <div className={`qfig${hint ? ' lit' : ''}`} dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

      {hint ? (
        <div className="tr-hint" ref={hintBox} tabIndex={-1}>
          {!asleep ? (
            <div className="tr-nur">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nurSrc('think')} alt="" width={64} height={70} />
              <p className="say">{hint.nur}</p>
            </div>
          ) : null}
          {hint.step ? (
            <div className="tr-step">
              <b>{hint.from === 'task' ? 'С чего начать' : task.shadow ? `Слабое место тени «${task.shadow.name}»` : 'Совет по теме'}</b>
              <div dangerouslySetInnerHTML={{ __html: hint.step }} />
            </div>
          ) : null}
          <span className="chip chip-lamp">вторая попытка · половина света</span>
        </div>
      ) : null}

      <div className={`qopts${tiles ? ' tiles' : ''}`} role="group" aria-label="Варианты ответа">
        {q.options.map((o, i) => {
          const tried = task.wrong.includes(i);
          let cls = 'qopt';
          if (verdict) cls += i === verdict.correct ? ' ok' : tried ? ' bad' : ' dim';
          else if (tried) cls += ' bad';
          else if (i === chosen) cls += ' on';
          return (
            <button key={i} type="button" aria-pressed={i === chosen} className={cls}
              aria-label={`${LETTERS[i]}: ${o}${tried ? ', неверно' : verdict && i === verdict.correct ? ', верный ответ' : ''}`}
              disabled={Boolean(verdict) || tried} onClick={() => setChosen(i)}>
              <span className="ql">{LETTERS[i]}</span>
              <span className="qo">{o}</span>
            </button>
          );
        })}
      </div>

      {verdict ? (
        <div className="tr-verdict" ref={verdictBox} tabIndex={-1}>
          <div className={`qverdict ${verdict.result === 'wrong' ? 'bad' : 'ok'}`}>
            <span>{verdictText}</span>
            {verdict.light ? <b className="tr-plus">+{verdict.light} света</b> : null}
          </div>
          {verdict.parts.length > 1 ? (
            <div className="tr-parts">
              {verdict.parts.map((p) => <span key={p.label} className="chip">+{p.amount} {p.label}</span>)}
            </div>
          ) : null}
          {!asleep && verdict.say ? (
            <div className="tr-nur small">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nurSrc(nurMood)} alt="" width={52} height={57} />
              <p className="say">{verdict.say}</p>
            </div>
          ) : null}
          <div className="qexp">
            <b>Разбор</b>
            <div dangerouslySetInnerHTML={{ __html: verdict.explanation }} />
          </div>
        </div>
      ) : null}
      {errBox}
    </>
  );

  const timer = verdict
    ? <span className="tr-timer done">{verdict.seconds !== null ? `за ${mss(Math.round(verdict.seconds))}` : ''}</span>
    : hint
      ? <span className="tr-timer done">2-я попытка</span>
      : (
        <span className={`tr-timer${overTempo ? ' over' : left <= 15 ? ' low' : ''}`} role="timer"
          title={overTempo ? 'Темп экзамена — 75 секунд. Бонуса за скорость уже нет, но задача всё ещё твоя.' : 'Темп экзамена: успеешь за 75 секунд — плюс 3 света'}>
          {overTempo ? 'без спешки' : mss(Math.max(0, left))}
        </span>
      );

  const progress = (
    <ol className="tr-prog" aria-label={`Задача ${state.cur + 1} из ${state.total}`}>
      {state.marks.map((m, i) => (
        <li key={i} className={m ? m : i === state.cur ? 'cur' : undefined} />
      ))}
    </ol>
  );

  if (sheet) {
    return (
      <SheetOverlay
        storageKey={PRACTICE_SHEETS}
        sheetId={q.id}
        title={<>Задача {state.cur + 1} <i>из {state.total}</i></>}
        tag={q.topicLabel}
        bar={<span className="scr-grow"><span className="st">{title}</span>{timer}</span>}
        onClose={() => setSheet(false)}
      >
        {body}
        <div className="qact end">
          <span className="qhint">{verdict ? 'Enter — дальше' : 'Цифры 1–5 выбирают ответ'}</span>
          {action}
        </div>
      </SheetOverlay>
    );
  }

  return (
    <div className="tr" ref={scene}>
      <header className="tr-top">
        <Link className="tr-x" href={exitHref} aria-label={`Выйти. Прогресс ${what} сохранится`} title="Выйти: прогресс сохранится">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </Link>
        {progress}
        {timer}
      </header>

      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="tr-in">
        <div className="tr-meta">
          <span className="kicker">{head}</span>
          <span className="tr-n">Задача {state.cur + 1} из {state.total}</span>
        </div>
        <div className="tr-card">
          {body}
        </div>
        <div className="tr-side">
          <SheetChip onOpen={() => setSheet(true)} />
          {state.light ? <span className="tr-light" title={`Свет за ${state.kind === 'shift' ? 'смену' : 'домашку'}`}>свет: +{state.light}</span> : null}
        </div>
      </div>

      <footer className="tr-bar">
        <div className="tr-bar-in">
          <span className="qhint">
            {verdict ? 'Enter — дальше' : hint ? 'Неверный вариант погас. Выбери другой.' : 'Ошибка не страшна: Nur подскажет и даст вторую попытку.'}
          </span>
          {action}
        </div>
      </footer>
    </div>
  );
}
