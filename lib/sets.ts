/*
 * Набор задач с подсказкой и второй попыткой: смена дня и домашка от учителя.
 *
 * Правила одной задачи:
 *   — верно с первой попытки: +10 света, +5 за то, что без подсказки, +3, если быстрее 75 секунд;
 *   — ошибка: Nur даёт направление (не ответ), неверный вариант гаснет, вторая попытка за половину света;
 *   — вторая ошибка: показываем верный ответ и разбор.
 * Состояние хранится на сервере (bc_sets): страницу можно закрыть и продолжить с той же задачи.
 * Ответ проверяется здесь; до проверки в браузер уходит задача без ответа и без разбора.
 */

import { db, one } from './db';
import {
  catalogTopics, isActiveId, isActiveTopic, itemById, pickFromTopic, toPublic,
  type Item, type Section,
} from './bank';
import { TZ, nowInTz } from './data';
import { hintOf } from './hint';
import { addLight, lightFor } from './light';
import { aliasId, mistakesOf, newId, recordAttempt } from './runs';
import { shadowOf } from './shadows';

import {
  SHIFT_SIZE,
  type ItemKind, type Mark, type RunState, type RunSummary, type RunTask, type SetAnswer, type SetItem, type SetKind,
} from './set-types';

export { KIND_LABEL, SHIFT_MINUTES, SHIFT_SIZE } from './set-types';
export type { ItemKind, Mark, RunState, RunSummary, RunTask, SetAnswer, SetItem, SetKind } from './set-types';

export interface TaskSet {
  id: string;
  user_id: string;
  kind: SetKind;
  day: string | null;
  seq: number;
  hw_id: string | null;
  items: SetItem[];
  answers: SetAnswer[];
  cur: number;
  step: number;
  light: number;
  done: number;
  ok1: number;
  ok2: number;
  /** Секунд с момента выдачи текущей задачи. */
  elapsed: number | null;
  /** Секунд от начала до конца набора (или до сейчас). */
  took: number;
  finished: boolean;
}

/* --------------------------------------------------------------- чтение */

export async function setById(userId: string, id: string): Promise<TaskSet | null> {
  return one<TaskSet>`select id, user_id, kind, to_char(day, 'YYYY-MM-DD') as day, seq, hw_id, items, answers, cur, step, light, done, ok1, ok2,
      extract(epoch from now() - cur_at)::float as elapsed,
      extract(epoch from coalesce(finished_at, now()) - started_at)::int as took,
      (finished_at is not null) as finished
    from bc_sets where id = ${id} and user_id = ${userId}`;
}

/** Смены ученика за сегодня (по времени школы), от первой к последней. */
export async function shiftsToday(userId: string): Promise<TaskSet[]> {
  const day = nowInTz().date;
  return db<TaskSet>`select id, user_id, kind, to_char(day, 'YYYY-MM-DD') as day, seq, hw_id, items, answers, cur, step, light, done, ok1, ok2,
      extract(epoch from now() - cur_at)::float as elapsed,
      extract(epoch from coalesce(finished_at, now()) - started_at)::int as took,
      (finished_at is not null) as finished
    from bc_sets where user_id = ${userId} and kind = 'shift' and day = ${day}::date order by seq`;
}

/**
 * Незаконченная смена. Ищем и за вчера: смена, начатая вечером и законченная
 * после полуночи, не должна пропасть.
 */
export async function openShift(userId: string): Promise<TaskSet | null> {
  return one<TaskSet>`select id, user_id, kind, to_char(day, 'YYYY-MM-DD') as day, seq, hw_id, items, answers, cur, step, light, done, ok1, ok2,
      extract(epoch from now() - cur_at)::float as elapsed,
      extract(epoch from coalesce(finished_at, now()) - started_at)::int as took,
      (finished_at is not null) as finished
    from bc_sets where user_id = ${userId} and kind = 'shift' and finished_at is null
      and started_at > now() - interval '12 hours'
    order by started_at desc limit 1`;
}

export async function homeworkSet(userId: string, hwId: string): Promise<TaskSet | null> {
  return one<TaskSet>`select id, user_id, kind, to_char(day, 'YYYY-MM-DD') as day, seq, hw_id, items, answers, cur, step, light, done, ok1, ok2,
      extract(epoch from now() - cur_at)::float as elapsed,
      extract(epoch from coalesce(finished_at, now()) - started_at)::int as took,
      (finished_at is not null) as finished
    from bc_sets where user_id = ${userId} and kind = 'homework' and hw_id = ${hwId}`;
}

/* ------------------------------------------------------- сборка смены */

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SECTIONS: Section[] = ['iq', 'algebra', 'geometry'];
/** Порядок задач в смене: начинаем со слабой темы, ошибки — в середине и в конце. */
const PATTERN: ItemKind[] = ['weak', 'new', 'mistake', 'weak', 'new', 'weak', 'new', 'mistake'];

/**
 * Восемь задач на сегодня. personal — ученик школы: 3 задачи из слабых тем,
 * 3 из новых и 2 из ошибок; чего не хватает, добирается из соседних корзин.
 * Без доступа к тренажёру — восемь задач из разных тем вперемешку.
 */
export async function buildShift(userId: string, personal: boolean): Promise<SetItem[]> {
  const [stats, attempted] = await Promise.all([
    db<{ topic: string; total: number; ok: number; last: string }>`select topic, count(*)::int as total,
        count(*) filter (where correct)::int as ok, to_char(max(created_at), 'YYYY-MM-DD') as last
      from bc_attempts where user_id = ${userId} group by topic`,
    db<{ question_id: string }>`select distinct question_id from bc_attempts where user_id = ${userId} and question_id is not null`,
  ]);
  const avoid = new Set(attempted.map((r) => r.question_id));
  const byTopic = new Map(stats.filter((t) => isActiveTopic(t.topic)).map((t) => [t.topic, t]));
  const catalog = catalogTopics();
  const usedTopics = new Set<string>();
  const usedIds = new Set<string>();
  const queues: Record<ItemKind, SetItem[]> = { weak: [], new: [], mistake: [], mix: [], any: [], hw: [] };

  /** Одна задача темы, которой ещё нет в смене. */
  const take = (topic: string, kind: ItemKind): boolean => {
    if (usedTopics.has(topic)) return false;
    const q = pickFromTopic(topic, 6, avoid).find((x) => !usedIds.has(x.id));
    if (!q) return false;
    usedTopics.add(topic);
    usedIds.add(q.id);
    queues[kind].push({ id: q.id, kind });
    return true;
  };
  const size = () => usedIds.size;

  if (personal) {
    // 1. Две задачи из ошибок: самые свежие, из разных тем.
    for (const m of await mistakesOf(userId, 30)) {
      if (queues.mistake.length >= 2) break;
      if (usedTopics.has(m.topic) || !isActiveId(m.question_id)) continue;
      usedTopics.add(m.topic);
      usedIds.add(m.question_id);
      queues.mistake.push({ id: m.question_id, kind: 'mistake' });
    }
    // 2. Три слабые темы: точность ниже 70 % хотя бы на четырёх задачах, от самой слабой.
    const acc = (t: { ok: number; total: number }) => t.ok / t.total;
    const weak = [...byTopic.values()].filter((t) => t.total >= 4 && acc(t) < 0.7).sort((a, b) => acc(a) - acc(b) || b.total - a.total);
    for (const t of weak) {
      if (queues.weak.length >= 3) break;
      take(t.topic, 'weak');
    }
    // 3. Три новые темы: по одной из раздела, от простых форматов к сложным.
    const fresh = SECTIONS.map((s) => catalog.filter((t) => t.section === s && !byTopic.has(t.key)));
    for (let round = 0; round < 40 && queues.new.length < 3; round++) {
      for (const list of fresh) {
        if (queues.new.length >= 3) break;
        if (list[round]) take(list[round].key, 'new');
      }
    }
    // 4. Добор до восьми: ещё слабые (ниже 85 %), ещё новые, потом давно не решённые темы.
    const softer = [...byTopic.values()].filter((t) => t.total >= 3 && acc(t) < 0.85).sort((a, b) => acc(a) - acc(b));
    for (const t of softer) {
      if (size() >= SHIFT_SIZE) break;
      take(t.topic, 'weak');
    }
    for (let round = 0; round < 40 && size() < SHIFT_SIZE; round++) {
      for (const list of fresh) {
        if (size() >= SHIFT_SIZE) break;
        if (list[round]) take(list[round].key, 'new');
      }
    }
    const stale = [...byTopic.values()].sort((a, b) => a.last.localeCompare(b.last));
    for (const t of stale) {
      if (size() >= SHIFT_SIZE) break;
      take(t.topic, 'mix');
    }
  }

  // Вперемешку: разделы по кругу, темы случайные. Так собирается вся смена без доступа
  // к тренажёру и так же добирается остаток, если у ученика мало данных.
  const pools = SECTIONS.map((s) => shuffle(catalog.filter((t) => t.section === s)));
  for (let round = 0; round < 40 && size() < SHIFT_SIZE; round++) {
    for (const pool of pools) {
      if (size() >= SHIFT_SIZE) break;
      if (pool[round]) take(pool[round].key, personal ? 'mix' : 'any');
    }
  }

  const out: SetItem[] = [];
  for (const kind of PATTERN) {
    const item = queues[kind].shift();
    if (item) out.push(item);
  }
  for (const kind of ['weak', 'new', 'mix', 'any', 'mistake'] as ItemKind[]) out.push(...queues[kind]);
  return out.slice(0, SHIFT_SIZE);
}

export type Counts = Record<ItemKind, number>;
export const countKinds = (items: SetItem[]): Counts => {
  const c: Counts = { weak: 0, new: 0, mistake: 0, mix: 0, any: 0, hw: 0 };
  for (const i of items) c[i.kind] += 1;
  return c;
};

/* ----------------------------------------------------- создание набора */

/**
 * Новая смена на сегодня. Если есть незаконченная — возвращается она:
 * две смены одновременно не идут.
 */
export async function startShift(userId: string, personal: boolean): Promise<TaskSet | null> {
  const open = await openShift(userId);
  if (open) return open;
  const today = await shiftsToday(userId);
  const items = await buildShift(userId, personal);
  if (!items.length) return null;
  const day = nowInTz().date;
  const seq = (today[today.length - 1]?.seq ?? 0) + 1;
  const id = newId();
  // двойное нажатие «Начать»: вторая вставка с тем же номером смены не пройдёт
  await db`insert into bc_sets (id, user_id, kind, day, seq, items, cur_at)
    values (${id}, ${userId}, 'shift', ${day}::date, ${seq}, ${JSON.stringify(items)}::jsonb, now())
    on conflict (user_id, day, seq) where kind = 'shift' do nothing`;
  return (await openShift(userId)) || (await shiftsToday(userId)).pop() || null;
}

/** Набор задач домашки для ученика: создаётся при первом открытии. */
export async function openHomeworkSet(userId: string, hw: { id: string; topics: string[]; count: number }): Promise<TaskSet | null> {
  const have = await homeworkSet(userId, hw.id);
  if (have) return have;
  const attempted = await db<{ question_id: string }>`select distinct question_id from bc_attempts
    where user_id = ${userId} and question_id is not null`;
  const avoid = new Set(attempted.map((r) => r.question_id));
  const topics = hw.topics.filter(isActiveTopic);
  if (!topics.length) return null;
  // задачи по темам по кругу: при 15 задачах и двух темах — 8 и 7
  const lists = topics.map((t) => pickFromTopic(t, hw.count, avoid));
  const items: SetItem[] = [];
  for (let round = 0; items.length < hw.count && round < hw.count; round++) {
    for (const l of lists) {
      if (items.length >= hw.count) break;
      if (l[round]) items.push({ id: l[round].id, kind: 'hw' });
    }
  }
  if (!items.length) return null;
  await db`insert into bc_sets (id, user_id, kind, hw_id, items, cur_at)
    values (${newId()}, ${userId}, 'homework', ${hw.id}, ${JSON.stringify(items)}::jsonb, now())
    on conflict (user_id, hw_id) where kind = 'homework' do nothing`;
  return homeworkSet(userId, hw.id);
}

/* ------------------------------------------------- вид для ученика */

const markOf = (a: SetAnswer | undefined): Mark =>
  !a || a.ok === null ? null : a.ok ? (a.tries.length > 1 ? 'second' : 'ok') : 'wrong';

/* Реплики Nur. Они не про конкретную задачу, поэтому ничего не утверждают о том,
   где именно ученик ошибся: содержательная часть подсказки — в блоке «С чего начать». */
const HINT_SAY = [
  'Не то. Свечу на первый шаг.',
  'Этот вариант гаснет. Смотри, с чего начать.',
  'Мимо, но попытка ещё есть. Начни вот с этого.',
  'Не спеши. Первый шаг ниже, остальное сам.',
];
const SECOND_SAY = ['Сам дошёл. Так и запоминается.', 'Со второй попытки — тоже победа. Запомни ход.', 'Вот теперь верно. Первый шаг решает всё.'];
const WIN_SAY = ['Верно. Свет стал ярче.', 'Чисто. Дальше.', 'С первой попытки. Тень отступила.'];
const LOSE_SAY = [
  'Не вышло. Разбор ниже: прочти его до конца.',
  'Мимо. Посмотри, на каком шаге разошлось.',
  'Эта тень устояла. Задача вернётся в работе над ошибками.',
];

function hintFor(q: Item, seed: number): RunTask['hint'] {
  const shadow = shadowOf(q.topic);
  const step = hintOf(q.explanation, q.text, q.options, q.correct);
  return {
    nur: HINT_SAY[seed % HINT_SAY.length],
    step: step || shadow?.weak || null,
    from: step ? 'task' : shadow?.weak ? 'shadow' : null,
  };
}

function sayFor(mark: Mark, seed: number): string {
  const list = mark === 'second' ? SECOND_SAY : mark === 'ok' ? WIN_SAY : LOSE_SAY;
  return list[seed % list.length];
}

export function stateOf(set: TaskSet): RunState {
  const marks = set.items.map((_, i) => markOf(set.answers[i]));
  const item = set.items[set.cur];
  const q = item ? itemById(item.id) : undefined;
  const a = set.answers[set.cur];
  let task: RunTask | null = null;
  if (item && q) {
    const shadow = shadowOf(q.topic);
    const final = Boolean(a && a.ok !== null);
    const mark = markOf(a);
    task = {
      n: set.cur,
      kind: item.kind,
      // настоящий id задачи в браузер не уходит: по нему ответ можно узнать в тренажёре
      question: toPublic(q, aliasId(set.id, item.id)),
      shadow: shadow ? { id: shadow.id, name: shadow.name } : null,
      wrong: a ? a.tries.filter((t) => t !== q.correct) : [],
      hint: a && a.tries.length >= 1 && a.tries[0] !== q.correct ? hintFor(q, set.cur + set.seq) : null,
      verdict: final && mark ? {
        correct: q.correct,
        explanation: q.explanation,
        result: mark,
        light: a!.light,
        parts: a!.ok ? lightFor(a!.tries.length, a!.seconds).parts : [],
        seconds: a!.seconds,
        say: sayFor(mark, set.cur + set.seq),
      } : null,
      elapsed: final ? Math.round(a!.seconds ?? 0) : Math.max(0, Math.round(set.elapsed ?? 0)),
    };
  }
  const summary: RunSummary | null = set.finished ? {
    ok1: set.ok1,
    ok2: set.ok2,
    wrong: set.items.length - set.ok1 - set.ok2,
    light: set.light,
    minutes: Math.max(1, Math.round(set.took / 60)),
    fast: set.answers.filter((x) => x && x.ok && x.tries.length === 1 && x.seconds !== null && x.seconds <= 75).length,
    tasks: set.items.map((it, i) => ({
      label: itemById(it.id)?.topicLabel || 'Задача',
      kind: it.kind,
      mark: marks[i],
    })),
  } : null;
  return {
    id: set.id, kind: set.kind, step: set.step, cur: set.cur, total: set.items.length,
    light: set.light, finished: set.finished, marks, task, summary,
  };
}

/**
 * Задачи, которых больше нет в банке (файл банка заменили), пропускаются:
 * иначе набор застрял бы на них навсегда. Вызывается перед показом набора.
 */
export async function skipMissing(set: TaskSet): Promise<TaskSet> {
  let cur = set;
  for (let guard = 0; guard < cur.items.length && !cur.finished; guard++) {
    const item = cur.items[cur.cur];
    if (item && itemById(item.id)) break;
    const answers = cur.answers.slice();
    for (let i = answers.length; i < cur.cur; i++) answers[i] = { tries: [], ok: false, seconds: null, light: 0, skipped: true };
    answers[cur.cur] = { tries: [], ok: false, seconds: null, light: 0, skipped: true };
    const last = cur.cur >= cur.items.length - 1;
    await db`update bc_sets set answers = ${JSON.stringify(answers)}::jsonb, step = step + 1, done = done + 1,
        cur = case when ${last} then cur else cur + 1 end, cur_at = now(),
        finished_at = case when ${last} then now() else finished_at end
      where id = ${cur.id} and user_id = ${cur.user_id} and step = ${cur.step} and finished_at is null`;
    const fresh = await setById(cur.user_id, cur.id);
    if (!fresh) break;
    cur = fresh;
  }
  return cur;
}

/* ------------------------------------------------------ ответ и переход */

export type AnswerResult =
  | { status: 'ok'; set: TaskSet }
  /** Состояние на сервере ушло вперёд (ответ уже принят, другая вкладка): отдаём свежее. */
  | { status: 'stale'; set: TaskSet }
  | { status: 'bad'; error: string };

/**
 * Ответ на текущую задачу. step — номер состояния, которое видел ученик:
 * если на сервере он уже другой, ответ не засчитывается (повтор, вторая вкладка).
 */
export async function answerSet(userId: string, id: string, step: number, chosen: number): Promise<AnswerResult> {
  const set = await setById(userId, id);
  if (!set) return { status: 'bad', error: 'Набор задач не найден' };
  if (set.finished || set.step !== step) return { status: 'stale', set };
  const item = set.items[set.cur];
  const q = item ? itemById(item.id) : undefined;
  // задачи больше нет в банке: пропускаем её и отдаём свежее состояние
  if (!item || !q) return { status: 'stale', set: await skipMissing(set) };
  const prev: SetAnswer = set.answers[set.cur] || { tries: [], ok: null, seconds: null, light: 0 };
  if (prev.ok !== null) return { status: 'stale', set };
  if (chosen < 0 || chosen >= q.options.length) return { status: 'bad', error: 'Плохой запрос' };
  if (prev.tries.includes(chosen)) return { status: 'bad', error: 'Этот вариант уже выбран' };

  const tryNo = prev.tries.length + 1;
  const isCorrect = chosen === q.correct;
  const seconds = tryNo === 1 ? Math.max(0, Math.round((set.elapsed ?? 0) * 10) / 10) : prev.seconds;
  const final = isCorrect || tryNo >= 2;
  const light = isCorrect ? lightFor(tryNo, seconds).total : 0;
  const next: SetAnswer = { tries: [...prev.tries, chosen], ok: final ? isCorrect : null, seconds, light };
  const answers = set.answers.slice();
  for (let i = answers.length; i < set.cur; i++) answers[i] = { tries: [], ok: false, seconds: null, light: 0 };
  answers[set.cur] = next;
  const last = set.cur >= set.items.length - 1;
  const finish = final && last;

  // Засчитывает ответ только тот запрос, который застал прежний step.
  const won = await one<{ id: string }>`update bc_sets set
      answers = ${JSON.stringify(answers)}::jsonb, step = step + 1, light = light + ${light},
      done = done + ${final ? 1 : 0},
      ok1 = ok1 + ${isCorrect && tryNo === 1 ? 1 : 0},
      ok2 = ok2 + ${isCorrect && tryNo > 1 ? 1 : 0},
      finished_at = case when ${finish} then now() else finished_at end
    where id = ${id} and user_id = ${userId} and step = ${step} and finished_at is null
    returning id`;
  const fresh = await setById(userId, id);
  if (!fresh) return { status: 'bad', error: 'Набор задач не найден' };
  if (!won) return { status: 'stale', set: fresh };

  // В прогресс задача попадает один раз, когда она решена или разобрана: верным считается первый ответ.
  if (final) {
    await recordAttempt(userId, { id: q.id, topic: q.topic, topicLabel: q.topicLabel, section: q.section },
      isCorrect && tryNo === 1, set.kind, seconds, tryNo, isCorrect && tryNo > 1);
  }
  if (light > 0) await addLight(userId, light, set.kind, `${id}:${set.cur}`);
  return { status: 'ok', set: fresh };
}

/** Следующая задача — после того как текущая решена (или разобрана). */
export async function nextInSet(userId: string, id: string, step: number): Promise<AnswerResult> {
  const set = await setById(userId, id);
  if (!set) return { status: 'bad', error: 'Набор задач не найден' };
  if (set.finished || set.step !== step) return { status: 'stale', set };
  const a = set.answers[set.cur];
  if (!a || a.ok === null) return { status: 'bad', error: 'Сначала ответь на задачу' };
  if (set.cur >= set.items.length - 1) return { status: 'stale', set };
  const won = await one<{ id: string }>`update bc_sets set cur = cur + 1, step = step + 1, cur_at = now()
    where id = ${id} and user_id = ${userId} and step = ${step} and finished_at is null returning id`;
  const fresh = await setById(userId, id);
  if (!fresh) return { status: 'bad', error: 'Набор задач не найден' };
  return { status: won ? 'ok' : 'stale', set: fresh };
}

/* ------------------------------------------------------- подписи и итоги */

/** «3 слабые темы, 3 новые, 2 из ошибок». */
export function planText(c: Counts): string {
  const plural = (n: number, one: string, few: string, many: string) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  const parts = [
    c.weak ? `${c.weak} ${plural(c.weak, 'слабая тема', 'слабые темы', 'слабых тем')}` : '',
    c.new ? `${c.new} ${plural(c.new, 'новая', 'новые', 'новых')}${c.weak ? '' : ` ${plural(c.new, 'тема', 'темы', 'тем')}`}` : '',
    c.mistake ? `${c.mistake} из ошибок` : '',
    c.mix ? `${c.mix} на повторение` : '',
    c.any ? `${c.any} ${plural(c.any, 'тема вперемешку', 'темы вперемешку', 'тем вперемешку')}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** Сколько смен ученик закрыл и когда — для главной и итогов. */
export async function shiftDays(userId: string, days = 7): Promise<Set<string>> {
  const rows = await db<{ d: string }>`select distinct to_char(day, 'YYYY-MM-DD') as d from bc_sets
    where user_id = ${userId} and kind = 'shift' and finished_at is not null
      and day > (now() at time zone ${TZ})::date - ${days}::int`;
  return new Set(rows.map((r) => r.d));
}
