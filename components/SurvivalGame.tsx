'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicQuestion, Section, Verdict } from '@/lib/bank-types';
import type { PublicShadow, SurvivalPool } from '@/lib/shadows';
import type { WeekBoard } from '@/lib/runs';
import { SCHOOL_TZ, plural } from '@/lib/format';
import { announceStreak, type StreakUp } from '@/lib/streak-client';
import { IArrow } from './icons';
import { nurSrc, type NurMood } from './Nur';
import SheetOverlay from './SheetOverlay';
import { SheetChip } from './SheetButton';
import { PRACTICE_SHEETS, useSheetOpen } from '@/lib/use-sheet';

const LETTERS = 'ABCDE';
const SECONDS = 90;
const LIVES = 3;
const WAVE = 5;
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const SECTION_GEN: Record<Section, string> = { iq: 'логики', algebra: 'алгебры', geometry: 'геометрии' };
const SECTION_NAME: Record<Section, string> = { iq: 'Логика', algebra: 'Алгебра', geometry: 'Геометрия' };

interface Run {
  id: string;
  /** Задача на экране и её тень. */
  question: PublicQuestion | null;
  shadow: PublicShadow | null;
  streak: number;
  best: number;
  lives: number;
  alive: boolean;
  /** Номер задачи в серии, с единицы. */
  n: number;
  /** Сколько задач уже отвечено (или просрочено). */
  done: number;
  /** Серию закончил сам ученик кнопкой. */
  stopped?: boolean;
}

type Result = Verdict & { timedOut?: boolean };

/** Кто погасил лампочку — для финала. */
interface Lost {
  n: number;
  topic: string;
  name: string;
  shadowId: string | null;
  timedOut: boolean;
  chosen: string | null;
  right: string;
  explanation: string;
}

/** Ошибка запроса: код ответа и то, что сервер прислал вместе с ней. */
class ApiError extends Error {
  status: number;
  state?: ServerState;
  constructor(message: string, status: number, state?: ServerState) {
    super(message);
    this.status = status;
    this.state = state;
  }
}

/** Состояние серии на сервере — по нему экран догоняет сервер после обрыва связи. */
interface ServerState {
  streak: number;
  best: number;
  lives: number;
  alive: boolean;
  n: number;
  question: PublicQuestion | null;
  shadow: PublicShadow | null;
}

const NO_NET = 'Нет связи. Проверь интернет и попробуй ещё раз.';

/** Час по времени школы: с 02:00 до 06:00 Nur выключен и молчит. */
function nurAsleep(): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: SCHOOL_TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
    return h >= 2 && h < 6;
  } catch {
    return false;
  }
}

/** Короткие ответы (числа) показываем пятью плитками в ряд. */
const isShort = (opts: string[]) => opts.length === 5 && opts.every((o) => o.length <= 4);

/*
 * Режим выживания. Свет отключили, Nur — последняя лампа, из темноты выходят
 * тени задач. Три лампочки, 90 секунд на задачу; неверный или просроченный
 * ответ гасит одну. Волна — каждые пять верных подряд. Серия, лампочки и время
 * считаются на сервере.
 */
export default function SurvivalGame({
  myBest, schoolBest, week, pool, canMistakes = true,
}: {
  myBest: number;
  schoolBest: number;
  week: WeekBoard;
  pool: SurvivalPool;
  canMistakes?: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [over, setOver] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(SECONDS);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sheet, setSheet] = useSheetOpen();
  const [say, setSay] = useState('');
  const [mood, setMood] = useState<NurMood>('default');
  const [lost, setLost] = useState<Lost[]>([]);
  const [asleep, setAsleep] = useState(false);
  /** Время вышло, но сообщить об этом серверу не удалось (нет связи). */
  const [timedOutOffline, setTimedOutOffline] = useState(false);
  const deadline = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  /** Сцена во весь экран прокручивается сама: к новой задаче и к финалу возвращаемся наверх. */
  const scene = useRef<HTMLDivElement>(null);
  const toTop = () => { requestAnimationFrame(() => scene.current?.scrollTo(0, 0)); };
  const lastLine = useRef<Record<string, string>>({});
  const met = useRef<Set<string>>(new Set());
  const pendingStreak = useRef<StreakUp | null>(null);
  /** Рекорд до начала серии: чтобы понять, побит ли он. */
  const bestBefore = useRef(myBest);

  /** Случайная реплика из набора; одна и та же не идёт два раза подряд. */
  const pick = useCallback((key: string, list: string[] | undefined): string => {
    if (!list?.length) return '';
    const prev = lastLine.current[key];
    const pool2 = list.length > 1 ? list.filter((l) => l !== prev) : list;
    const line = pool2[Math.floor(Math.random() * pool2.length)];
    lastLine.current[key] = line;
    return line;
  }, []);

  const post = async (payload: Record<string, unknown>) => {
    let res: Response;
    try {
      res = await fetch('/api/survival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ApiError(NO_NET, 0);
    }
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(d?.error || 'Не получилось. Попробуй ещё раз.', res.status, d?.state);
    return d;
  };

  /** Серии на сервере нет (или вход слетел): остаётся только выйти в лобби. */
  const [fatal, setFatal] = useState(false);
  const fail = (e: unknown, fallback: string) => {
    const err = e instanceof ApiError ? e : null;
    setError(err?.message || fallback);
    if (err && (err.status === 401 || err.status === 404)) setFatal(true);
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'start' });
      // «Реванш» можно нажать раньше, чем страница узнает новый рекорд
      bestBefore.current = Math.max(myBest, bestBefore.current, run?.best ?? 0);
      setFatal(false);
      met.current = new Set(d.shadow ? [d.shadow.id] : []);
      lastLine.current = {};
      setLost([]);
      setOver(false);
      setAsleep(nurAsleep());
      setRun({ id: d.id, question: d.question, shadow: d.shadow ?? null, streak: 0, best: 0, lives: d.lives, alive: true, n: 1, done: 0 });
      setChosen(null);
      setVerdict(null);
      setConfirmEnd(false);
      setSay(pick('start', pool.start));
      setMood('default');
      toTop();
    } catch (e) {
      fail(e, 'Не удалось начать');
    } finally {
      setBusy(false);
    }
  };

  /** Экран разошёлся с сервером (ответ дошёл, а вердикт потерялся): показываем то, что на сервере. */
  const resync = (st: ServerState) => {
    setRun((p) => (p ? {
      ...p, streak: st.streak, best: st.best, lives: st.lives, alive: st.alive, n: st.n || p.n,
      done: st.n ? (st.question ? st.n - 1 : st.n) : p.done,
      question: st.question ?? p.question, shadow: st.question ? st.shadow : p.shadow,
    } : p));
    setChosen(null);
    setVerdict(null);
    if (!st.alive) { finishRef.current(false); return; }
    setError(st.question ? 'Связь прерывалась: прошлый ответ уже засчитан. Вот текущая задача.' : '');
    // ответ засчитан, а следующей задачи ещё нет — берём её, когда закончится текущий запрос
    if (!st.question) setTimeout(() => loadNextRef.current(), 60);
  };

  const submit = useCallback(async (timeout: boolean) => {
    if (!run || busy || verdict || !run.question || !run.alive) return;
    if (!timeout && chosen === null) return;
    setBusy(true);
    setError('');
    const q = run.question;
    const sh = run.shadow;
    try {
      const d = await post(timeout
        ? { action: 'answer', id: run.id, qid: q.id, timeout: true }
        : { action: 'answer', id: run.id, qid: q.id, chosen });
      const v: Result = d.verdict;
      setVerdict(v);
      setTimedOutOffline(false);
      if (d.streakUp) pendingStreak.current = d.streakUp;
      setRun((p) => (p ? { ...p, streak: d.streak, best: d.best, lives: d.lives, alive: d.alive, done: p.done + 1 } : p));
      if (v.isCorrect) {
        const record = bestBefore.current > 0 && d.streak === bestBefore.current + 1;
        const wave = d.streak > 0 && d.streak % WAVE === 0;
        setMood(wave ? 'laugh' : record ? 'proud' : 'eureka');
        setSay(wave ? pick('wave', pool.wave) : record ? pick('record', pool.record) : pick(`win-${sh?.id}`, sh?.win));
      } else {
        setLost((l) => [...l, {
          n: run.n, topic: q.topicLabel, name: sh?.name || q.topicLabel, shadowId: sh?.id ?? null,
          timedOut: Boolean(v.timedOut), chosen: v.timedOut || chosen === null ? null : q.options[chosen],
          right: q.options[v.correct], explanation: v.explanation,
        }]);
        setMood(d.alive ? (d.lives === 1 ? 'panic' : 'angry') : 'sad');
        setSay(d.alive && d.lives === 1 ? pick('last', pool.last_bulb) : pick(`lose-${sh?.id}`, sh?.lose));
      }
      setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.state) resync(e.state);
      else if (timeout && e instanceof ApiError && e.status === 0) {
        // время вышло, а связи нет: задача останется просроченной на сервере, ждём связь
        setError(`${NO_NET} Время на эту задачу вышло.`);
        setTimedOutOffline(true);
      } else fail(e, 'Не удалось проверить');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, busy, verdict, chosen, pick, pool]);

  const finish = useCallback((stopped = false) => {
    setOver(true);
    // погасший Nur молчит; реплика нужна, только если серию остановил сам ученик
    setSay(stopped ? 'На сегодня всё. Тени тоже устали.' : pick('over', pool.game_over));
    announceStreak(pendingStreak.current);
    pendingStreak.current = null;
    router.refresh();
    toTop();
  }, [pick, pool, router]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Следующая задача: сервер выдаёт её по запросу, с этого момента идут 90 секунд. */
  const loadNext = async () => {
    if (!run || busy) return;
    setBusy(true);
    setError('');
    try {
      const d: ServerState = await post({ action: 'next', id: run.id });
      const sh = d.shadow ?? null;
      const first = sh ? !met.current.has(sh.id) : false;
      if (sh) met.current.add(sh.id);
      setRun((p) => (p ? { ...p, question: d.question, shadow: sh, streak: d.streak, best: d.best, lives: d.lives, alive: d.alive, n: d.n || p.n + 1 } : p));
      setChosen(null);
      setVerdict(null);
      setTimedOutOffline(false);
      setMood(d.lives === 1 ? 'panic' : 'focus');
      setSay(first ? pick(`meet-${sh?.id}`, sh?.meet) : pick('idle', pool.idle));
      toTop();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.state) resync(e.state);
      else fail(e, 'Не удалось получить задачу');
    } finally {
      setBusy(false);
    }
  };
  const loadNextRef = useRef(loadNext);
  loadNextRef.current = loadNext;

  const next = () => {
    if (!run || busy) return;
    if (!run.alive) { finish(); return; }
    loadNext();
  };

  const end = async () => {
    if (!run) return;
    setBusy(true);
    setError('');
    try {
      const d = await post({ action: 'end', id: run.id });
      setRun((p) => (p ? { ...p, best: d.best, alive: false, stopped: true } : p));
      setConfirmEnd(false);
      setVerdict(null);
      finish(true);
    } catch (e) {
      fail(e, 'Не удалось закончить');
    } finally {
      setBusy(false);
    }
  };

  // Таймер: 90 секунд на задачу, отсчёт с момента, когда задача появилась на экране.
  const playing = Boolean(run && !over);
  const qid = playing && run?.alive && !verdict && !timedOutOffline ? run.question?.id : undefined;
  const runId = run?.id;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const shadowRef = useRef(run?.shadow ?? null);
  shadowRef.current = run?.shadow ?? null;
  useEffect(() => {
    if (!qid || !runId) return;
    deadline.current = Date.now() + SECONDS * 1000;
    setLeft(SECONDS);
    let prev = SECONDS;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      if (s === prev) return;
      // под таймером: подсказка направления на 30-й секунде, дальше — отсчёт
      const crossed = (mark: number) => prev > mark && s <= mark;
      if (crossed(30)) { setMood('wink'); setSay(pick(`hint-${shadowRef.current?.id}`, shadowRef.current?.hint)); }
      else if (crossed(20)) { setMood('grit'); setSay(pool.low_time[0] || ''); }
      else if (crossed(10)) { setMood('panic'); setSay(pool.low_time[pool.low_time.length - 1] || ''); }
      prev = s;
      setLeft(s);
      if (s <= 0) {
        clearInterval(t);
        // время вышло: отправляем отсюда, а не из эффекта — иначе «ноль» прошлой задачи
        // сработал бы на следующей
        submitRef.current(true);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid, runId]);

  // Ночью Nur выключен; узнаём это в браузере, чтобы серверная и клиентская вёрстка совпали.
  useEffect(() => { setAsleep(nurAsleep()); }, []);

  // Пока идёт серия, страница под сценой не прокручивается, а меню под ней недоступно с клавиатуры.
  const inRun = Boolean(run);
  useEffect(() => {
    if (!inRun) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const hidden = Array.from(document.querySelectorAll<HTMLElement>('.side, .tabbar'));
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      document.body.style.overflow = prev;
      hidden.forEach((el) => el.removeAttribute('inert'));
    };
  }, [inRun]);

  const nextRef = useRef(next);
  nextRef.current = next;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const liveRef = useRef(playing);
  liveRef.current = playing;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!liveRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        // Enter на кнопке или ссылке нажимает её саму («Закончить серию», «Да», «Решить на листе»)
        const el = (e.target as HTMLElement | null)?.closest('button, a');
        if (el && !el.classList.contains('qopt')) return;
        e.preventDefault();
        if (verdict) nextRef.current();
        else submitRef.current(false);
        return;
      }
      if (verdict) return;
      const k = e.key.toUpperCase();
      const byDigit = '12345'.indexOf(k);
      // на листе буквы переключают инструменты рисования, ответ — цифрами
      const byLetter = sheetRef.current ? -1 : LETTERS.indexOf(k);
      const i = byDigit >= 0 ? byDigit : byLetter;
      if (i >= 0 && i < 5) setChosen(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict]);

  /*
   * Таблица недели с учётом только что сыгранной серии. Место и ближайшего соперника
   * считает сервер (в таблице школы показаны не все). Пока страница не обновилась
   * после серии, оцениваем по показанным строкам.
   */
  const board = useMemo(() => {
    const weekMine = week.rows.find((r) => r.me)?.best ?? 0;
    const mine = Math.max(run?.best ?? 0, weekMine);
    const rows = week.rows.map((r) => (r.me ? { ...r, best: mine } : r)).sort((a, b) => b.best - a.best || Number(b.me) - Number(a.me));
    const top = Math.max(1, ...rows.map((r) => r.best));
    if (mine === weekMine) return { rows, place: week.place, total: week.total, above: week.above, top, mine };
    const i = rows.findIndex((r) => r.me);
    const above = [...rows.slice(0, i)].reverse().find((r) => r.best > mine) || null;
    return { rows, place: Math.min(week.place, i + 1), total: week.total, above, top, mine };
  }, [week, run?.best]);

  const exit = () => { setRun(null); setOver(false); setError(''); setFatal(false); setTimedOutOffline(false); };

  /* ------------------------------------------------------------------ лобби */
  if (!run) {
    const sleeping = asleep;
    return (
      <>
        <section className="sv-hero">
          <div>
            <span className="kicker">Режим · три лампочки · 90 секунд</span>
            <h1>Выживание</h1>
            <p>Свет отключили. У Nur три лампочки, а из темноты выходят тени задач. Сколько ты продержишься?</p>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={start}>
              {busy ? 'Зажигаю…' : <>Зажечь свет <IArrow /></>}
            </button>
            {error ? <p className="qerr">{error}</p> : null}
            <span className="sv-rec">
              <i>Твой рекорд</i>
              <b>{myBest ? `${myBest} ${plural(myBest, 'задача', 'задачи', 'задач')} подряд` : 'пока нет: первая серия впереди'}</b>
            </span>
            {sleeping ? <p className="sv-off">Сейчас ночь: после 02:00 Nur выключен и реплик не будет. Задачи открыты, но лучше поспать.</p> : null}
          </div>
          <div className="sv-art" aria-hidden="true">
            {/* eslint-disable @next/next/no-img-element */}
            <img className="a-e1" src="/art/eyes.svg" alt="" />
            <img className="a-e2" src="/art/eyes.svg" alt="" />
            <img className="a-s4" src="/shadows/s-cube-count.svg" alt="" />
            <img className="a-s3" src="/shadows/s-tri-angles.svg" alt="" />
            <img className="a-s2" src="/shadows/s-roots.svg" alt="" />
            <span className="a-glow" />
            <img className="a-books" src="/art/books.svg" alt="" />
            <img className="a-nur" src={nurSrc(sleeping ? 'off' : 'grit')} alt="" />
            <img className="a-s1" src="/shadows/s-trapezoid.svg" alt="" />
            {/* eslint-enable @next/next/no-img-element */}
          </div>
        </section>

        <div className="sv-cards">
          <div className="sv-card">
            <div className="sv-card-top">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {[0, 1, 2].map((k) => <img key={k} src="/art/bulb-on.svg" alt="" />)}
            </div>
            <h2>Три лампочки</h2>
            <p><span className="m-hide">Ошибка или вышедшее время гасит одну. Погасли все три — серия окончена.</span><span className="only-m">ошибка гасит одну</span></p>
          </div>
          <div className="sv-card">
            <div className="sv-card-top"><span className="mono">1:30</span><span className="tbar"><i /></span></div>
            <h2><span className="m-hide">90 секунд на тень</span><span className="only-m">90 секунд</span></h2>
            <p><span className="m-hide">Пока ты думаешь, тень подходит ближе, а круг света сужается. Верный ответ отбрасывает её назад.</span><span className="only-m">тень идёт к столу</span></p>
          </div>
          <div className="sv-card">
            <div className="sv-card-top"><span className="sv-dots"><i /><i /><i /><i /><i /><b>волна 2</b></span></div>
            <h2>Волны</h2>
            <p><span className="m-hide">Каждые пять верных подряд — новая волна: идут тени одного раздела, и поблажек меньше.</span><span className="only-m">каждые 5 верных подряд</span></p>
          </div>
        </div>

        <WeekCard week={week} schoolBest={schoolBest} />
      </>
    );
  }

  /* ------------------------------------------------------------------ финал */
  if (over) {
    const record = run.best > bestBefore.current;
    const last = lost[lost.length - 1];
    const lit = Math.max(0, run.lives);
    const sub = [
      record
        ? (bestBefore.current ? `Новый личный рекорд, было ${bestBefore.current}.` : 'Первый рекорд записан.')
        : bestBefore.current ? `Твой рекорд — ${bestBefore.current}.` : 'Рекорда пока нет: он появится с первой верной задачей.',
      board.total > 1 && board.mine > 0
        ? (board.place === 1
          ? `Первое место ${week.scope === 'group' ? 'в группе' : 'в школе'} на этой неделе.`
          : `${week.scope === 'group' ? 'В группе' : 'В школе'} ты на ${board.place}-м месте${board.above ? `, до ${board.above.name.split(' ')[0]} ${board.above.best - board.mine + 1} ${plural(board.above.best - board.mine + 1, 'задача', 'задачи', 'задач')}` : ''}.`)
        : '',
    ].filter(Boolean).join(' ');
    return (
      <div className="sv" ref={scene}>
        {/* eslint-disable @next/next/no-img-element */}
        <img className="sv-eyes" src="/art/eyes.svg" alt="" style={{ left: '6%', top: '44%' }} />
        <img className="sv-eyes" src="/art/eyes.svg" alt="" style={{ left: '40%', top: '38%', width: 30 }} />
        <div className="sv-over">
          <div>
            <span className="kick">{run.stopped ? 'Серия остановлена' : 'Свет погас'}</span>
            <h1>{run.best} {plural(run.best, 'задача', 'задачи', 'задач')} подряд</h1>
            <p className="sub">{sub}</p>
            <div className="sv-over-art" aria-hidden="true">
              <img className="n" src={nurSrc(asleep || !run.stopped ? 'off' : record ? 'proud' : 'default')} alt="" />
              {last?.shadowId && !run.stopped ? <img className="s" src={`/shadows/s-${last.shadowId}.svg`} alt="" /> : null}
            </div>
            {!asleep && say && run.stopped ? <p className="sv-say sv-over-say">{say}</p> : null}
            <div className="sv-acts">
              <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={start}>{busy ? 'Зажигаю…' : 'Реванш'}</button>
              {canMistakes && lost.length ? (
                <Link className="btn btn-lg btn-night" href="/mistakes">Разобрать {lost.length} {plural(lost.length, 'ошибку', 'ошибки', 'ошибок')}</Link>
              ) : null}
            </div>
            {error ? <p className="qerr">{error}</p> : null}
            <button type="button" className="sv-back" onClick={exit}>К режиму выживания</button>
          </div>

          <div className="sv-panels">
            <div className="sv-card">
              <h2 style={{ margin: 0, fontSize: 19 }}>{lost.length ? 'Кто погасил лампочки' : 'Лампочки целы'}</h2>
              <ul className="sv-lost">
                {lost.map((l, i) => {
                  const isLast = i === lost.length - 1 && !run.stopped && lit === 0;
                  return (
                    <li key={l.n} className={isLast ? 'last' : undefined}>
                      <img src={isLast && l.shadowId ? `/shadows/s-${l.shadowId}.svg` : '/art/bulb-off.svg'} alt="" />
                      <div>
                        <b>{l.name}{isLast ? ': последняя лампочка' : ''}</b>
                        <i>
                          {l.topic} · задача {l.n} · {l.timedOut ? 'вышло время' : isLast && l.chosen !== null ? `твой ответ ${l.chosen}, верно ${l.right}` : 'ошибка'}
                        </i>
                        {isLast ? <div className="ex" dangerouslySetInnerHTML={{ __html: l.explanation }} /> : null}
                      </div>
                    </li>
                  );
                })}
                {Array.from({ length: lit }, (_, k) => (
                  <li key={`on${k}`} className="keep">
                    <img src="/art/bulb-on.svg" alt="" />
                    <div><b>Горит</b><i>эта лампочка дожила до конца серии</i></div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sv-card sv-nums">
              <div><b>{run.best}</b><span>лучшая серия{record ? ', рекорд' : ''}</span></div>
              <div><b>{board.total > 1 && board.mine > 0 ? `${board.place} из ${board.total}` : '—'}</b><span>{week.scope === 'group' ? 'место в группе' : 'место в школе'} за неделю</span></div>
              <div><b>{run.done}</b><span>{plural(run.done, 'задача', 'задачи', 'задач')} в серии</span></div>
            </div>
            {board.rows.length > 1 ? (
              <div className="sv-card">
                <h2 style={{ margin: 0, fontSize: 19 }}>{week.scope === 'group' ? 'Где погас свет у группы' : 'Где погас свет у других'}</h2>
                <Track rows={board.rows} me={run.best} label={`ты · ${run.best}`} />
              </div>
            ) : null}
          </div>
        </div>
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    );
  }

  /* ------------------------------------------------------------------ серия */
  const q = run.question;
  const sh = run.shadow;
  if (!q) {
    return (
      <div className="sv">
        <div className="sv-over" style={{ gridTemplateColumns: 'minmax(0,1fr)', textAlign: 'center' }}>
          <div>
            <h1 style={{ fontSize: 40 }}>Тени закончились</h1>
            <p className="sub" style={{ margin: '0 auto 20px' }}>Ты прошёл все задачи, которые были в банке. Такое бывает редко.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => finish()}>Итог серии</button>
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, (left / SECONDS) * 100));
  const hurry = !verdict && left <= 15;
  const wave = Math.floor(run.streak / WAVE) + 1;
  const toWave = WAVE - (run.streak % WAVE);
  const t = verdict ? 1 : Math.max(0, Math.min(1, left / SECONDS));
  const dazed = Boolean(verdict?.isCorrect);
  const bite = Boolean(verdict && !verdict.isCorrect);
  const nurMood: NurMood = asleep ? 'off' : mood;
  const voice = dazed ? sh?.yield : sh?.taunt;
  const tiles = isShort(q.options);

  // после последней лампочки заканчивать нечего: дальше только итог серии
  const endCtl = !run.alive ? null : confirmEnd ? (
    <span className="sv-end">
      <span>Закончить серию?</span>
      <button type="button" className="sv-btn danger" disabled={busy} onClick={end}>Да</button>
      <button type="button" className="sv-btn" onClick={() => setConfirmEnd(false)}>Нет</button>
    </span>
  ) : (
    <button type="button" className="sv-btn" disabled={busy} onClick={() => setConfirmEnd(true)}>Закончить серию</button>
  );
  const errBox = error ? (
    <p className="qerr" role="alert">
      {error}{' '}
      {fatal ? <button type="button" className="linklike" onClick={exit}>Выйти к режиму</button> : null}
      {timedOutOffline ? <button type="button" className="linklike" onClick={() => submit(true)}>Повторить</button> : null}
    </p>
  ) : null;

  const body = (
    <>
      <div className="qtext" dangerouslySetInnerHTML={{ __html: q.text }} />
      {q.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: q.figure }} /> : null}

      <div className={`qopts${tiles ? ' tiles' : ''}`} role="radiogroup" aria-label="Варианты ответа">
        {q.options.map((o, i) => {
          let cls = 'qopt';
          if (verdict) {
            if (i === verdict.correct) cls += ' ok';
            else if (i === chosen && !verdict.timedOut) cls += ' bad';
            else cls += ' dim';
          } else if (i === chosen) cls += ' on';
          return (
            <button key={i} type="button" role="radio" aria-checked={i === chosen} className={cls}
              disabled={!!verdict} onClick={() => setChosen(i)}>
              <span className="ql">{LETTERS[i]}</span>
              <span className="qo">{o}</span>
            </button>
          );
        })}
      </div>

      {verdict ? (
        <div ref={box} aria-live="polite">
          <div className={`qverdict ${verdict.isCorrect ? 'ok' : 'bad'}`}>
            {verdict.isCorrect
              ? `Верно! ${sh ? `Тень «${sh.name}» отброшена. ` : ''}Серия ${run.streak}.`
              : `${verdict.timedOut ? 'Время вышло.' : 'Неверно.'} Правильный ответ — ${LETTERS[verdict.correct]}. ${run.alive ? `Лампочек осталось: ${run.lives}.` : 'Погасла последняя лампочка.'}`}
          </div>
          <div className="qexp">
            <b>Разбор</b>
            <div dangerouslySetInnerHTML={{ __html: verdict.explanation }} />
          </div>
          <div className="qact end">
            <span className="qhint">Enter — дальше</span>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={next}>
              {busy ? 'Секунду…' : run.alive ? 'Следующая задача' : 'Итог серии'}
            </button>
          </div>
        </div>
      ) : (
        <div className="qact">
          <span className="qhint">
            {chosen === null
              ? `Верный ответ отбросит тень и сделает серию ${run.streak + 1}. Ошибка гасит лампочку.`
              : `Выбран вариант ${LETTERS[chosen]}`}
          </span>
          <button type="button" className="btn btn-primary" disabled={chosen === null || busy || timedOutOffline} onClick={() => submit(false)}>
            {busy ? 'Проверяю…' : 'Ответить'}
          </button>
        </div>
      )}
      {errBox}
    </>
  );

  const bulbs = (
    <span className="row" role="img" aria-label={`Лампочек горит: ${run.lives} из ${LIVES}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {Array.from({ length: LIVES }, (_, k) => <img key={`${k}-${k < run.lives}`} className={k === run.lives && bite ? 'pop' : undefined} src={k < run.lives ? '/art/bulb-on.svg' : '/art/bulb-off.svg'} alt="" />)}
    </span>
  );

  if (sheet) {
    return (
      <SheetOverlay
        storageKey={PRACTICE_SHEETS}
        sheetId={q.id}
        title={<>Серия {run.streak}</>}
        tag={q.topicLabel}
        bar={(
          <span className="scr-grow surv-dark">
            <span className="flame">{run.streak}</span>
            <span className="st">лампочек {run.lives} из {LIVES}</span>
            <span className={`surv-clock${hurry ? ' hurry' : ''}${verdict ? ' paused' : ''}`} role="timer">{verdict ? 'пауза' : mss(left)}</span>
          </span>
        )}
        actions={endCtl}
        onClose={() => setSheet(false)}
      >
        {!verdict ? <div className="surv-time" aria-hidden="true"><i style={{ width: `${pct}%` }} className={hurry ? 'hurry' : undefined} /></div> : null}
        {!asleep && say ? <p className="muted" style={{ margin: '0 0 10px', fontWeight: 700 }}>Nur: {say}</p> : null}
        {body}
      </SheetOverlay>
    );
  }

  return (
    <div className="sv" ref={scene} style={{ ['--t' as string]: t } as React.CSSProperties}>
      {/* eslint-disable @next/next/no-img-element */}
      <img className="sv-eyes" src="/art/eyes.svg" alt="" style={{ left: '4%', top: '30%' }} />
      <img className="sv-eyes" src="/art/eyes.svg" alt="" style={{ left: '12%', bottom: '18%', width: 30 }} />
      <img className="sv-eyes" src="/art/eyes.svg" alt="" style={{ right: '24%', top: '19%', width: 30 }} />

      <header className="sv-top">
        <div className="sv-bulbs">
          {bulbs}
          <span><i className="sv-lab" style={{ fontStyle: 'normal' }}>Лампочки</i><b>{run.lives} из {LIVES}</b></span>
        </div>
        <div className="sv-streak">
          <span className="sv-lab">Серия</span>
          <b key={run.streak} className={dazed ? 'up' : undefined}>{run.streak}</b>
          <span className="sv-wave">Волна {wave} · тени {SECTION_GEN[q.section]}</span>
        </div>
        <div className="sv-clock">
          <span className="row">
            <span className={`sv-time${hurry ? ' hurry' : ''}${verdict ? ' paused' : ''}`} role="timer"
              aria-label={verdict ? 'Таймер на паузе' : `Осталось ${left} ${plural(left, 'секунда', 'секунды', 'секунд')}`}>
              {verdict ? 'пауза' : mss(left)}
            </span>
            <span className="sv-end">{endCtl}</span>
          </span>
          <span className="sv-tbar" aria-hidden="true"><i style={{ width: `${verdict ? 0 : pct}%` }} className={hurry ? 'hurry' : undefined} /></span>
        </div>
      </header>
      <div className="sv-mtbar" aria-hidden="true"><span className="sv-tbar" style={{ display: 'block' }}><i style={{ width: `${verdict ? 0 : pct}%` }} className={hurry ? 'hurry' : undefined} /></span></div>

      <div className="sv-stage">
        <div className="sv-cast">
          <div className="sv-nur">
            {!asleep && say ? <p key={say} className="sv-say">{say}</p> : null}
            <img src={nurSrc(nurMood)} alt="" width={228} height={251} />
          </div>
          {sh ? (
            <div className={`sv-foe${dazed ? ' dazed' : ''}${bite ? ' bite' : ''}`}>
              <span className="sv-foe-name">{sh.name}</span>
              <img key={`${sh.id}-${dazed}`} src={`/${dazed ? 'shadows_dazed' : 'shadows'}/s-${sh.id}.svg`} alt={`Тень темы «${q.topicLabel}»`} width={240} height={220} />
              {voice ? <p className="sv-voice">{voice}</p> : null}
            </div>
          ) : <div className="sv-foe" />}
        </div>
        {voice ? <p className={`sv-mvoice${dazed ? ' dazed' : ''}`}>{sh?.name}: {voice}</p> : null}

        <section className="sv-task">
          <div className="sv-task-head">
            <span className="tp">{SECTION_NAME[q.section]} · {q.topicLabel}</span>
            <span className="no">Задача {run.n}</span>
            <SheetChip onOpen={() => setSheet(true)} />
          </div>
          {body}
        </section>
      </div>

      <footer className="sv-path">
        <div className="sv-path-top">
          <span>Путь в темноте · {week.scope === 'group' ? week.title : 'школа, эта неделя'}</span>
          <span>{toWave === WAVE && run.streak > 0 ? 'новая волна' : `ещё ${toWave} до новой волны`}</span>
        </div>
        <Track rows={board.rows} me={run.streak} label={`ты · ${run.streak}${run.streak > bestBefore.current && bestBefore.current > 0 ? ', твой рекорд' : ''}`} />
      </footer>
      <div className="sv-mend">{endCtl}</div>
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}

/** Шкала «путь в темноте»: отметки остальных (их лучшая серия за неделю) и своя. */
function Track({ rows, me, label }: { rows: { userId: string; name: string; best: number; me: boolean }[]; me: number; label: string }) {
  const others = rows.filter((r) => !r.me && r.best > 0).sort((a, b) => a.best - b.best).slice(-8);
  const max = Math.max(10, me + 3, ...others.map((r) => r.best + 2));
  const pos = (v: number) => Math.min(97, Math.max(3, (v / max) * 100));
  // подписываем только лидера и ближайшего соперника впереди: остальные подписи слипались бы
  const leader = others[others.length - 1];
  const rival = others.find((r) => r.best > me);
  const named = new Set([leader?.userId, rival?.userId].filter(Boolean) as string[]);
  // подпись соперника не должна лезть под свою
  if (rival && leader && rival !== leader && pos(leader.best) - pos(rival.best) < 16) named.delete(rival.userId);
  for (const id of [...named]) {
    const r = others.find((o) => o.userId === id);
    if (r && Math.abs(pos(r.best) - pos(me)) < 12) named.delete(id);
  }
  return (
    <div className="sv-track">
      <div className="fill" style={{ width: `${pos(me)}%` }} />
      {others.map((r) => (
        <div key={r.userId} className="sv-mark" style={{ left: `${pos(r.best)}%` }} title={`${r.name}: ${r.best}`}>
          {named.has(r.userId) ? <span>{r.name.split(' ')[0]} · {r.best}</span> : null}<i />
        </div>
      ))}
      <div className="sv-mark you" style={{ left: `${pos(me)}%` }}><span>{label}</span><i /></div>
    </div>
  );
}

/** Таблица недели в лобби. Место и ближайшего соперника считает сервер. */
function WeekCard({ week, schoolBest }: { week: WeekBoard; schoolBest: number }) {
  const mine = week.rows.find((r) => r.me)?.best ?? 0;
  const top = Math.max(1, ...week.rows.map((r) => r.best));
  const shown = week.rows.filter((r) => r.best > 0 || r.me);
  const gap = week.above ? week.above.best - mine + 1 : 0;
  const note = [
    mine > 0 && week.above ? `До ${week.above.name.split(' ')[0]} тебе ${gap} ${plural(gap, 'задача', 'задачи', 'задач')}.` : '',
    mine > 0 && week.place === 1 && week.total > 1 ? 'На этой неделе первое место твоё.' : '',
    mine === 0 ? 'На этой неделе у тебя ещё нет серии.' : '',
    'Таблица обнуляется в понедельник.',
    schoolBest ? `Рекорд школы: ${schoolBest}.` : '',
  ].filter(Boolean).join(' ');
  return (
    <section className="sv-card sv-week">
      <div className="sv-week-head">
        <h2>{week.scope === 'group' ? `${week.title} на этой неделе` : 'Школа на этой неделе'}</h2>
        <span>лучшая серия</span>
      </div>
      <ol className="sv-rows">
        {shown.map((r, i) => (
          <li key={r.userId} className={r.me ? 'you' : undefined}>
            <span className="pl">{r.me ? (mine > 0 ? week.place : '—') : i + 1}</span>
            <span className="nm">{r.me ? 'Ты' : r.name}</span>
            <span className="br" aria-hidden="true"><i style={{ width: `${Math.round((r.best / top) * 100)}%` }} /></span>
            <span className="vl">{r.best}</span>
          </li>
        ))}
      </ol>
      <p className="sv-week-note">{note}</p>
    </section>
  );
}
