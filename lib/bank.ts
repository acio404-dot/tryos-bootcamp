/*
 * Банк задач кабинета. Только сервер: файлы весят около 10 МБ, в браузер
 * они не уходят никогда — наружу отдаются только PublicQuestion без ответа.
 *
 * Два независимых банка:
 *   PRACTICE — тренажёр, работа над ошибками, режим выживания;
 *   EXAM     — пробники. Задачи пробников не встречаются в тренажёре,
 *              поэтому вариант нельзя «выучить» заранее.
 */

import ex1 from '@/content/bank-v2-iq-1.json';
import ex2 from '@/content/bank-v2-iq-2.json';
import ex3 from '@/content/bank-v2-iq-3.json';
import ex4 from '@/content/bank-v2-algebra-1.json';
import ex5 from '@/content/bank-v2-geometry-1.json';
import ex6 from '@/content/bank-v2-geometry-2.json';
import pr1 from '@/content/bank-v2-practice-1.json';
import pr2 from '@/content/bank-v2-practice-2.json';
import pr3 from '@/content/bank-v2-practice-3.json';
import pr4 from '@/content/bank-v2-practice-4.json';
// Банк v3 (сентябрь 2026): +2000 новых задач, по нескольку разных типов на каждую тему.
import v3p1 from '@/content/bank-v3-practice-algebra.json';
import v3p2 from '@/content/bank-v3-practice-geometry.json';
import v3p3 from '@/content/bank-v3-practice-iq.json';
import v3e1 from '@/content/bank-v3-exam-algebra.json';
import v3e2 from '@/content/bank-v3-exam-geometry.json';
import v3e3 from '@/content/bank-v3-exam-iq.json';
// Банк v4 (октябрь 2026): последние форматы TR-YÖS (цепочка диаграмм, кольца, часы, развёртки,
// складывание) и добор тонких тем — часы, подсчёт фигур, пропорции, делимость, Виет, системы, дельтоид.
import v4p1 from '@/content/bank-v4-practice-algebra.json';
import v4p2 from '@/content/bank-v4-practice-geometry.json';
import v4p3 from '@/content/bank-v4-practice-iq.json';
import v4e1 from '@/content/bank-v4-exam-algebra.json';
import v4e2 from '@/content/bank-v4-exam-geometry.json';
import v4e3 from '@/content/bank-v4-exam-iq.json';
// Банк v5 (октябрь 2026): каждая тема тренажёра — 200+ задач. Только форматы, которые уже были в теме
// (генераторы v3/v4 и форматы старого банка v2), каждая задача проверена независимым решателем.
import v5pa from '@/content/bank-v5-practice-algebra.json';
import v5ea from '@/content/bank-v5-exam-algebra.json';
import v5pg from '@/content/bank-v5-practice-geometry.json';
import v5eg from '@/content/bank-v5-exam-geometry.json';
// Снятые с выдачи задачи: темы, которых нет на экзамене, и слишком лёгкие шаблоны.
import retired from '@/content/bank-retired.json';

import {
  FORMATS, SECTION_BOOK, SECTION_LABEL, formatByKey,
  type ExamFormat, type ExamResult, type FormatSpec, type Group,
  type PartResult, type PublicQuestion, type Section, type Topic, type Verdict,
} from './bank-types';

export interface Item {
  id: string;
  topic: string;
  topicLabel: string;
  section: Section;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
  figure?: string;
  difficulty?: string;
  /** Тип задачи внутри темы (генератор). У старых задач его заменяет код в id. */
  family?: string;
}

/* Мелкие огрехи разметки в старых файлах: дважды экранированные сущности
   (&amp;rarr; вместо стрелки) и теги <sup> в вариантах ответа, которые
   показываются как обычный текст. Чиним при загрузке, не трогая JSON. */
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', x: 'ˣ',
};
const fixEntities = (s: string) => s.replace(/&amp;(#\d+|[a-zA-Z]+);/g, '&$1;');
const fixOption = (s: string) =>
  s
    .replace(/<sup>([^<]*)<\/sup>/g, (_m, d: string) => [...d].map((c) => SUP[c] ?? c).join(''))
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));

/* Названия тем, которые изменились: из «часов» ушли календарные задачи, в «развёртках» появились
   кубики, которые катятся, и виды одного кубика, в «поворотах» — отражения в зеркалах. */
const LABEL: Record<string, string> = {
  clock: 'Часы',
  cube_net: 'Кубики и развёртки',
  rotate: 'Повороты и отражения',
};

function tidy(q: Item): Item {
  const text = fixEntities(q.text);
  const explanation = fixEntities(q.explanation);
  const options = q.options.map(fixOption);
  const topicLabel = LABEL[q.topic] ?? q.topicLabel;
  if (text === q.text && explanation === q.explanation && topicLabel === q.topicLabel
    && options.every((o, i) => o === q.options[i])) return q;
  return { ...q, text, explanation, options, topicLabel };
}

const asItems = (v: unknown) => (v as unknown as Item[]).map(tidy);

const ALL_PRACTICE: Item[] = [
  ...asItems(pr1), ...asItems(pr2), ...asItems(pr3), ...asItems(pr4),
  ...asItems(v3p1), ...asItems(v3p2), ...asItems(v3p3),
  ...asItems(v4p1), ...asItems(v4p2), ...asItems(v4p3),
  ...asItems(v5pa), ...asItems(v5pg),
];

const ALL_EXAM: Item[] = [
  ...asItems(ex1), ...asItems(ex2), ...asItems(ex3),
  ...asItems(ex4), ...asItems(ex5), ...asItems(ex6),
  ...asItems(v3e1), ...asItems(v3e2), ...asItems(v3e3),
  ...asItems(v4e1), ...asItems(v4e2), ...asItems(v4e3),
  ...asItems(v5ea), ...asItems(v5eg),
];

/* Снятые с выдачи задачи (content/bank-retired.json): сравнения по модулю,
   системы счисления, все текстовые задачи — их нет на экзамене, — и слишком
   лёгкие шаблоны. Они не попадают ни в тренажёр, ни в пробники, ни в выживание,
   ни в работу над ошибками, но остаются в BY_ID: старые результаты и история
   попыток открываются как раньше. */
const RETIRED_TOPICS = new Set<string>(retired.topics);
const RETIRED_IDS = new Set<string>(retired.groups.flatMap((g) => g.ids));
const isRetired = (q: Item) => RETIRED_TOPICS.has(q.topic) || RETIRED_IDS.has(q.id);

export const PRACTICE: Item[] = ALL_PRACTICE.filter((q) => !isRetired(q));
export const EXAM: Item[] = ALL_EXAM.filter((q) => !isRetired(q));

/** Задача по id — ищем в обоих банках, включая снятые с выдачи. */
const BY_ID = new Map<string, Item>();
for (const q of ALL_PRACTICE) BY_ID.set(q.id, q);
for (const q of ALL_EXAM) BY_ID.set(q.id, q);

/** Задача есть в банке и выдаётся ученикам (не снята с выдачи). */
export function isActiveId(id: string): boolean {
  const q = BY_ID.get(id);
  return Boolean(q && !isRetired(q));
}

/* Задачи тренажёра по id, включая снятые с выдачи. Задач пробников здесь нет:
   через открытое API сайта (lib/public-bank.ts) они не отдаются никогда. */
const PRACTICE_IDS = new Set(ALL_PRACTICE.map((q) => q.id));

export function practiceItem(id: string): Item | undefined {
  return PRACTICE_IDS.has(id) ? BY_ID.get(id) : undefined;
}

const BY_TOPIC = new Map<string, Item[]>();
for (const q of PRACTICE) {
  const list = BY_TOPIC.get(q.topic) || [];
  list.push(q);
  BY_TOPIC.set(q.topic, list);
}

/** Выдаваемые задачи тренажёра по теме. */
export function practiceByTopic(key: string): Item[] {
  return BY_TOPIC.get(key) || [];
}

export const TOTAL_PRACTICE = PRACTICE.length;
export const TOTAL_EXAM = EXAM.length;

/* --------------------------------------------------------------- каталог */

const EXAM_SOURCE = 'формат экзамена TR-YÖS';

/**
 * [тема, как она называется в турецкой программе подготовки]. Порядок —
 * от простых форматов к сложным; так темы идут и в каталоге тренажёра.
 * EXAM_SOURCE — форматы, взятые прямо с вариантов экзамена.
 */
const ORDER: Record<Section, [string, string][]> = {
  iq: [
    ['sifre', 'Şifreler'],
    ['numseq', 'Sayı dizileri'],
    ['numfig', 'Sayı bağıntıları'],
    ['num_rule', 'Sayı bağıntıları'],
    ['optable', 'Tablolar'],
    ['tablo', 'İşlem tabloları'],
    ['balance', 'Teraziler'],
    ['esleme', 'Eşleştirme'],
    ['denklem_sekil', 'Denklem eşleştirme'],
    ['cube_count', 'Küpler'],
    ['charts', 'Grafikler'],
    ['perim_area', 'Çevre ve alan'],
    ['klm', 'KLM'],
    ['fig_sum', 'Şekil tamamlama'],
    ['fig_table', 'Şekil tabloları'],
    ['fig_series', 'Şekil sıralama'],
    ['fig_compare', 'Farklı olan şekli bulma'],
    ['odd_one', 'Farklı olan şekli bulma'],
    ['rotate', EXAM_SOURCE],
    ['fig_ops', EXAM_SOURCE],
    ['cube_net', '3 boyutlu cisimler'],
    ['paper_fold', 'Kağıt kesme-katlama'],
    ['tri_count', 'Üçgen sayma'],
    ['fig_count', 'Şekil sayma'],
    ['clock', 'Saat'],
    ['magic', 'Sihirli kare'],
    ['sudoku', 'Sudoku'],
    ['iq_problem', 'Problemler'],
    ['mantik', 'Mantık problemleri'],
    ['discs', EXAM_SOURCE],
  ],
  algebra: [
    ['temel_kavram', 'Temel kavramlar'],
    ['rational', 'Rasyonel sayılar'],
    ['linear', 'Birinci dereceden denklemler'],
    ['exponent', 'Üslü ifadeler'],
    ['radical', 'Köklü ifadeler'],
    ['factor', 'Çarpanlara ayırma'],
    ['polinom', EXAM_SOURCE],
    ['system', 'Denklem sistemleri'],
    ['inequality', 'Basit eşitsizlikler'],
    ['absolute', 'Mutlak değer'],
    ['digits_num', 'Basamak kavramı'],
    ['kripto', EXAM_SOURCE],
    ['taban', 'Sayı sistemleri'],
    ['series', 'Sayılar'],
    ['digits', 'Bölünebilme'],
    ['sayilar', 'Bölenler ve faktöriyel'],
    ['oran', 'Oran-orantı'],
    ['sets', 'Kümeler'],
    ['kartezyen', 'Kartezyen çarpım'],
    ['fonksiyon', 'Fonksiyonlar'],
    ['grafik', 'Fonksiyon grafikleri'],
    ['operation', 'İşlem'],
    ['modular', 'Modüler aritmetik'],
    ['percent', 'Problemler: yüzde'],
    ['problem_yas', 'Problemler: yaş'],
    ['problem_hareket', 'Problemler: hareket'],
    ['problem_isci', 'Problemler: işçi'],
    ['problem_havuz', 'Problemler: havuz'],
    ['problem_karisim', 'Problemler: karışım'],
    ['problem_faiz', 'Problemler: faiz'],
    ['problem_kar', 'Problemler: kâr-zarar'],
    ['viet', EXAM_SOURCE],
    ['quadratic', EXAM_SOURCE],
    ['sequence', EXAM_SOURCE],
  ],
  geometry: [
    ['geo_kavram', 'Doğruda açı'],
    ['tri_angles', 'Üçgende açılar'],
    ['geo_height', 'Dik üçgen'],
    ['ikizkenar', 'İkizkenar üçgen'],
    ['equilateral', 'Eşkenar üçgen'],
    ['geo_bisector', 'Açıortay'],
    ['kenarortay', 'Kenarortay'],
    ['geo_similar', 'Üçgende benzerlik'],
    ['tri_area', 'Üçgende alan'],
    ['merkezler', 'Üçgende merkezler'],
    ['geo_incircle', 'İç teğet çember'],
    ['aci_kenar', 'Açı-kenar bağıntıları'],
    ['polygon', 'Çokgenler'],
    ['geo_hexagon', 'Düzgün altıgen'],
    ['dortgen', 'Dörtgenler'],
    ['parallelogram', 'Paralelkenar'],
    ['geo_rhombus', 'Eşkenar dörtgen'],
    ['trapezoid', 'Yamuk'],
    ['deltoid', 'Deltoid'],
    ['square_rect', 'Dikdörtgen ve kare'],
    ['circle_angle', 'Çemberde açı'],
    ['circle_len', 'Çemberde uzunluk'],
    ['circle_area', 'Dairede alan'],
    ['analytic', 'Analitik geometri'],
    ['simetri', 'Simetri'],
    ['cember_analitik', 'Çemberin analitiği'],
  ],
};

function buildCatalog(): Group[] {
  const out: Group[] = [];
  for (const section of ['iq', 'algebra', 'geometry'] as Section[]) {
    const topics: Topic[] = [];
    const seen = new Set<string>();
    for (const [key, source] of ORDER[section]) {
      const list = BY_TOPIC.get(key);
      if (!list?.length) continue;
      seen.add(key);
      topics.push({ key, label: list[0].topicLabel || key, section, source, count: list.length });
    }
    // Тема, которой нет в списке выше, всё равно должна попасть в каталог.
    for (const [key, list] of BY_TOPIC) {
      if (seen.has(key) || list[0].section !== section) continue;
      topics.push({ key, label: list[0].topicLabel || key, section, source: EXAM_SOURCE, count: list.length });
    }
    if (topics.length) {
      out.push({ key: section, label: SECTION_LABEL[section], book: SECTION_BOOK[section], topics });
    }
  }
  return out;
}

export const CATALOG: Group[] = buildCatalog();
export const TOTAL_TOPICS = CATALOG.reduce((n, g) => n + g.topics.length, 0);

const MIX = 'mix-';

export function topicInfo(key: string): Topic | null {
  if (key.startsWith(MIX)) {
    const g = CATALOG.find((x) => x.key === key.slice(MIX.length));
    if (!g) return null;
    return {
      key,
      label: `${g.label}: все темы вперемешку`,
      section: g.key,
      source: g.book,
      count: g.topics.reduce((n, t) => n + t.count, 0),
      mixed: true,
    };
  }
  for (const g of CATALOG) {
    const t = g.topics.find((x) => x.key === key);
    if (t) return t;
  }
  return null;
}

/* ------------------------------------------------------- вид для ученика */

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/* Классы и id внутри чертежа получают префикс задачи: на одной странице
   могут оказаться два SVG, и стили одного не должны менять другой. */
function scopeFigure(svg: string | undefined, id: string): string | undefined {
  if (!svg) return svg;
  const p = `z${id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}-`;
  return svg
    .replace(/\.f(\d+)\s*\{/g, (_m, n) => `.${p}f${n}{`)
    .replace(/class='f(\d+)'/g, (_m, n) => `class='${p}f${n}'`)
    .replace(/id='([^']+)'/g, (_m, v) => `id='${p}${v}'`)
    .replace(/href='#([^']+)'/g, (_m, v) => `href='#${p}${v}'`)
    .replace(/\{([^}]*font-[^}]*fill:#ffffff)\}/g, '{$1;stroke:none !important}')
    .replace(/style='([^']*font-[^']*fill:#ffffff)'/g, "style='$1;stroke:none !important'");
}

export const toPublic = (q: Item): PublicQuestion => ({
  id: q.id,
  topic: q.topic,
  topicLabel: q.topicLabel,
  section: q.section,
  text: q.text,
  options: q.options.map(decode),
  figure: scopeFigure(q.figure, q.id),
});

export function itemById(id: string): Item | undefined {
  return BY_ID.get(id);
}

export function publicById(id: string): PublicQuestion | null {
  const q = BY_ID.get(id);
  return q ? toPublic(q) : null;
}

export function checkAnswer(id: string, chosen: number): (Verdict & { topic: string; topicLabel: string; section: Section }) | null {
  const q = BY_ID.get(id);
  if (!q) return null;
  return {
    correct: q.correct,
    isCorrect: chosen === q.correct,
    explanation: q.explanation,
    topic: q.topic,
    topicLabel: q.topicLabel,
    section: q.section,
  };
}

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Тип задачи: поле family, иначе код генератора из id (P-IQ-WH-…, IQ-NR-…). */
function familyOf(q: Item): string {
  if (q.family) return q.family;
  const parts = q.id.split('-');
  if ((parts[0] === 'P' || parts[0] === 'E') && parts.length > 3) return parts[2];
  return parts.length > 2 ? parts[1] : q.id;
}

/**
 * Случайный порядок, в котором типы задач чередуются по кругу: сначала по одной
 * задаче каждого типа, потом по второй и т. д. Так в подборке из 20 задач
 * встречаются все типы темы, а не 20 вариаций одного шаблона.
 */
function diversified(list: Item[]): Item[] {
  const byFamily = new Map<string, Item[]>();
  for (const q of list) {
    const k = familyOf(q);
    const l = byFamily.get(k) || [];
    l.push(q);
    byFamily.set(k, l);
  }
  const lists = shuffle([...byFamily.values()].map((l) => shuffle(l)));
  const out: Item[] = [];
  for (let round = 0; out.length < list.length; round++) {
    for (const l of lists) if (l[round]) out.push(l[round]);
  }
  return out;
}

/** Задачи темы в случайном порядке (типы чередуются); «mix-algebra» — по кругу из всех тем раздела. */
export function topicQuestions(key: string, limit = 20): PublicQuestion[] {
  const info = topicInfo(key);
  if (!info) return [];
  if (!info.mixed) return diversified(BY_TOPIC.get(info.key) || []).slice(0, limit).map(toPublic);

  const group = CATALOG.find((g) => g.key === info.section);
  if (!group) return [];
  const pools = shuffle(group.topics).map((t) => diversified(BY_TOPIC.get(t.key) || []));
  const out: Item[] = [];
  for (let round = 0; out.length < limit && round < 60; round++) {
    for (const pool of pools) {
      if (out.length >= limit) break;
      if (pool[round]) out.push(pool[round]);
    }
  }
  return out.map(toPublic);
}

/* --------------------------------------------------------------- пробник */

const isIq = (q: Item) => q.section === 'iq';

/** Набрать n задач, равномерно размазав их по темам. */
function spread(pool: Item[], n: number): Item[] {
  if (n <= 0) return [];
  const byTopic = new Map<string, Item[]>();
  for (const q of pool) {
    const l = byTopic.get(q.topic) || [];
    l.push(q);
    byTopic.set(q.topic, l);
  }
  const lists = shuffle([...byTopic.values()].map((l) => diversified(l)));
  const out: Item[] = [];
  for (let round = 0; out.length < n && round < 200; round++) {
    for (const l of lists) {
      if (out.length >= n) break;
      if (l[round]) out.push(l[round]);
    }
  }
  return out;
}

/** Вариант пробника: сначала все задачи логики, потом вся математика. */
export function buildExam(spec: FormatSpec): Item[] {
  const iq = spread(EXAM.filter(isIq), spec.iq);
  const math = spread(EXAM.filter((q) => !isIq(q)), spec.math);
  return [...shuffle(iq), ...shuffle(math)];
}

/* ------------------------------------------------- подсчёт балла 0–500 */

const SCORING = {
  base: 100,
  min: 0,
  max: 500,
  wrongPenalty: 0.25,
  iqMax: 40 * 4.5,     // 180
  mathMax: 40 * 5.5,   // 220
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function part(total: number, correct: number, wrong: number, blank: number, maxScore: number): PartResult {
  const net = Math.max(0, correct - wrong * SCORING.wrongPenalty);
  const accuracy = total > 0 ? clamp(net / total, 0, 1) : 0;
  return {
    total, correct, wrong, blank, net,
    accuracyPct: Math.round(accuracy * 1000) / 10,
    score: accuracy * maxScore,
    maxScore,
  };
}

/**
 * Балл считается ровно по той же формуле, что и быстрый тест на сайте
 * и в телеграм-боте: 100 + точность логики · 180 + точность математики · 220,
 * каждая ошибка съедает четверть верного ответа. Пробник из одного раздела
 * растягивает свой вес на всю шкалу, поэтому баллы сравнимы между форматами.
 */
export function gradeExam(ids: string[], answers: (number | null)[]): ExamResult {
  const rows = ids.map((id, i) => {
    const q = BY_ID.get(id);
    const chosen = answers[i] ?? null;
    return {
      q,
      chosen,
      ok: q && chosen !== null ? chosen === q.correct : null,
    };
  }).filter((r) => r.q) as { q: Item; chosen: number | null; ok: boolean | null }[];

  const bucket = (want: boolean) => {
    const items = rows.filter((r) => isIq(r.q) === want);
    return {
      total: items.length,
      correct: items.filter((r) => r.ok === true).length,
      wrong: items.filter((r) => r.ok === false).length,
      blank: items.filter((r) => r.ok === null).length,
    };
  };

  const bi = bucket(true);
  const bm = bucket(false);
  const iq = part(bi.total, bi.correct, bi.wrong, bi.blank, SCORING.iqMax);
  const math = part(bm.total, bm.correct, bm.wrong, bm.blank, SCORING.mathMax);

  const both = SCORING.iqMax + SCORING.mathMax;
  if (iq.total === 0 && math.total > 0) {
    math.score = (math.accuracyPct / 100) * both;
    math.maxScore = both;
  } else if (math.total === 0 && iq.total > 0) {
    iq.score = (iq.accuracyPct / 100) * both;
    iq.maxScore = both;
  }

  const score = Math.round(clamp(SCORING.base + iq.score + math.score, SCORING.min, SCORING.max));

  const byTopic = new Map<string, { topic: string; label: string; total: number; correct: number }>();
  for (const r of rows) {
    const e = byTopic.get(r.q.topic) || { topic: r.q.topic, label: r.q.topicLabel || r.q.topic, total: 0, correct: 0 };
    e.total += 1;
    if (r.ok === true) e.correct += 1;
    byTopic.set(r.q.topic, e);
  }
  const stats = [...byTopic.values()];
  const acc = (e: { total: number; correct: number }) => (e.total ? e.correct / e.total : 0);

  return {
    total: rows.length,
    answered: rows.filter((r) => r.chosen !== null).length,
    iq,
    math,
    score,
    weak: stats.filter((e) => acc(e) < 0.6 && BY_TOPIC.has(e.topic)).sort((a, b) => acc(a) - acc(b) || b.total - a.total).slice(0, 5),
    strong: stats.filter((e) => acc(e) >= 0.8 && e.total >= 2).sort((a, b) => acc(b) - acc(a)).slice(0, 3),
  };
}

/* ------------------------------------------------------ режим выживания */

/** Чем длиннее серия, тем реже попадаются короткие темы и тем чаще — тяжёлые. */
export function survivalPick(streak: number, exclude: Set<string>): Item | null {
  const pool = PRACTICE.filter((q) => !exclude.has(q.id));
  if (!pool.length) return null;
  // До 5 верных подряд — любая тема; дальше упор на геометрию и математику,
  // где задачи в банке длиннее и считаются дольше.
  const hard = streak >= 5 ? pool.filter((q) => q.section !== 'iq') : pool;
  const from = hard.length > 40 ? hard : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export { FORMATS, SECTION_LABEL, SECTION_BOOK, formatByKey };
export type { ExamFormat, ExamResult, FormatSpec, Group, PublicQuestion, Section, Topic, Verdict };
