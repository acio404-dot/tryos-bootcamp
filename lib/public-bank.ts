/*
 * Открытая часть банка — для сайта tryoszone.com.
 *
 * Задача дня на главной сайта и быстрый пробный тест берут задачи отсюда,
 * из того же банка, что и тренажёр кабинета. Банк один на оба сайта: новые
 * задачи и задачи, снятые с выдачи, сразу учитываются и там, и там.
 *
 * Наружу уходят только задачи тренажёра (PRACTICE): их ответ и разбор ученик
 * и так видит сразу после проверки. Задачи пробников кабинета (EXAM) через
 * это API не отдаются никогда. Снятые с выдачи задачи в задачу дня и в новые
 * варианты не попадают, но по id находятся — чтобы досчитать тест, начатый
 * до того, как задачу сняли.
 */

import {
  CATALOG, PRACTICE, practiceByTopic, practiceItem, toPublic,
  type Item, type PublicQuestion, type Section, type Topic, type Verdict,
} from './bank';

/** Задача целиком — для сервера сайта. В браузер он отдаёт её без ответа и разбора. */
export interface OpenQuestion {
  id: string;
  category: 'IQ' | 'Math';
  section: Section;
  topic: string;
  topicLabel: string;
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  options: string[];
  correct: number;
  explanation: string;
  figure?: string;
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export const toOpen = (q: Item): OpenQuestion => ({
  id: q.id,
  category: q.section === 'iq' ? 'IQ' : 'Math',
  section: q.section,
  topic: q.topic,
  topicLabel: q.topicLabel,
  difficulty: (DIFFICULTIES.has(q.difficulty || '') ? q.difficulty : 'hard') as OpenQuestion['difficulty'],
  text: q.text,
  options: q.options,
  correct: q.correct,
  explanation: q.explanation,
  ...(q.figure ? { figure: q.figure } : {}),
});

/** Логику и геометрию показываем только с чертежом: так они выглядят на экзамене. */
const presentable = (q: Item) => q.section === 'algebra' || Boolean(q.figure);

/* ----------------------------------------------------------- задача дня */

/* Сутки считаются по времени Турции: экзамен турецкий, и задача меняется
   в полночь по Стамбулу одинаково для всех. */
const TZ = 'Europe/Istanbul';

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Выбор по дате, устойчивый к пополнению банка: побеждает элемент с наименьшим
 * хешем «соль:ключ». Новая задача меняет выбор дня, только если выиграла сама,
 * а не сдвигает по кругу задачи всех остальных дней.
 */
function pickBy<T>(salt: string, list: T[], key: (x: T) => string): T {
  let best = list[0];
  let bestHash = Infinity;
  for (const x of list) {
    const h = fnv(`${salt}:${key(x)}`);
    if (h < bestHash) {
      bestHash = h;
      best = x;
    }
  }
  return best;
}

export interface Daily {
  dateKey: string;
  dateLabel: string;
  question: PublicQuestion;
  topic: Topic;
}

/** Одна задача на день: разделы по кругу (логика → алгебра → геометрия), тема и задача — по дате. */
export function dailyTask(now = new Date()): Daily | null {
  if (!CATALOG.length) return null;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, day: 'numeric', month: 'long',
  }).format(now);
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  const group = CATALOG[((day % CATALOG.length) + CATALOG.length) % CATALOG.length];
  const topics = group.topics.filter((t) => practiceByTopic(t.key).some(presentable));
  if (!topics.length) return null;
  const topic = pickBy(dateKey, topics, (t) => t.key);
  const q = pickBy(`${dateKey}:${topic.key}`, practiceByTopic(topic.key).filter(presentable), (x) => x.id);
  return { dateKey, dateLabel, question: toPublic(q), topic };
}

/* --------------------------------------------- быстрый пробный тест сайта */

export type Composition = Record<Section, number>;

/** 20 задач: 10 логики, 7 алгебры, 3 геометрии — пропорции реального TR-YÖS. */
export const QUICK: Composition = { iq: 10, algebra: 7, geometry: 3 };

const DIFFICULTY_MIX = { hard: 0.7, medium: 0.3 };

const TEST_POOL = PRACTICE.filter((q) => q.difficulty !== 'easy' && presentable(q));

/* Одна тема — одна задача варианта. Виет и квадратные уравнения — один и тот
   же приём, поэтому они склеены. */
const METHOD_ALIAS: Record<string, string> = { viet: 'quadratic' };
const methodOf = (q: Item) => METHOD_ALIAS[q.topic] || q.topic;

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Задачи раздела: сначала сложные, потом средние, и каждый раз из новой темы. */
function pickSection(section: Section, count: number): Item[] {
  if (count <= 0) return [];
  const pool = TEST_POOL.filter((q) => q.section === section);
  const byMethod = new Map<string, Item[]>();
  for (const q of pool) {
    const m = methodOf(q);
    const list = byMethod.get(m);
    if (list) list.push(q);
    else byMethod.set(m, [q]);
  }

  const picked: Item[] = [];
  const usedMethods = new Set<string>();
  const fill = (limit: number, difficulty: string | null) => {
    for (const method of shuffle([...byMethod.keys()])) {
      if (picked.length >= limit) break;
      if (usedMethods.has(method)) continue;
      const list = byMethod.get(method) as Item[];
      const candidates = difficulty ? list.filter((q) => q.difficulty === difficulty) : list;
      if (!candidates.length) continue;
      picked.push(candidates[Math.floor(Math.random() * candidates.length)]);
      usedMethods.add(method);
    }
  };

  fill(Math.min(count, Math.round(count * DIFFICULTY_MIX.hard)), 'hard');
  fill(count, 'medium');
  fill(count, null); // средних не хватило — любая сложность, но новая тема

  // Крайний случай: разных тем в разделе меньше, чем нужно задач.
  if (picked.length < count) {
    const ids = new Set(picked.map((q) => q.id));
    for (const q of shuffle(pool)) {
      if (picked.length >= count) break;
      if (!ids.has(q.id)) {
        picked.push(q);
        ids.add(q.id);
      }
    }
  }
  return shuffle(picked).slice(0, count);
}

/** Вариант теста: сначала логика, потом математика — как на реальном экзамене. */
export function buildVariant(comp: Composition = QUICK): OpenQuestion[] {
  const iq = pickSection('iq', comp.iq);
  const algebra = pickSection('algebra', comp.algebra);
  const geometry = pickSection('geometry', comp.geometry);
  return [...shuffle(iq), ...shuffle([...algebra, ...geometry])].map(toOpen);
}

/* ------------------------------------------------------ проверка по id */

/** Задачи по id в том же порядке; чужие и неизвестные id пропускаются. */
export function openByIds(ids: string[]): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  for (const id of ids) {
    const q = practiceItem(id);
    if (q) out.push(toOpen(q));
  }
  return out;
}

/** Проверка одной задачи (задача дня): правильный вариант и разбор. */
export function openVerdict(id: string, chosen: number): Verdict | null {
  const q = practiceItem(id);
  if (!q) return null;
  return { correct: q.correct, isCorrect: chosen === q.correct, explanation: q.explanation };
}
