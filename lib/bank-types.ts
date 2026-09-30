/*
 * Типы банка задач. Отдельный файл, чтобы клиентские компоненты брали
 * только типы и не тянули в браузер сам банк (10 МБ JSON).
 */

export type Section = 'iq' | 'algebra' | 'geometry';

/** Задача без ответа и без разбора — то, что видит ученик до проверки. */
export interface PublicQuestion {
  id: string;
  topic: string;
  topicLabel: string;
  section: Section;
  text: string;
  options: string[];
  figure?: string;
}

/** Ответ сервера на «Проверить». */
export interface Verdict {
  correct: number;
  isCorrect: boolean;
  explanation: string;
}

export interface Topic {
  key: string;
  label: string;
  section: Section;
  /** Турецкое название темы: «Teraziler». */
  source: string;
  count: number;
  /** «Вперемешку» — задачи из всех тем раздела. */
  mixed?: boolean;
}

export interface Group {
  key: Section;
  label: string;
  book: string;
  topics: Topic[];
}

export const SECTION_LABEL: Record<Section, string> = {
  iq: 'Логика',
  algebra: 'Алгебра',
  geometry: 'Геометрия',
};

/** Часть экзамена TR-YÖS, к которой относится раздел. */
export const SECTION_BOOK: Record<Section, string> = {
  iq: 'Sayısal Yetenek',
  algebra: 'Temel Matematik',
  geometry: 'Temel Matematik',
};

/** Подпись темы: часть экзамена и турецкое название темы — «Sayısal Yetenek · Teraziler». */
export function sourceLine(t: Pick<Topic, 'section' | 'source' | 'mixed'>): string {
  if (t.mixed) return `${SECTION_BOOK[t.section]} · все темы раздела`;
  if (!t.source || /экзамен/.test(t.source)) return 'Тип задач с экзаменов TR-YÖS';
  return `${SECTION_BOOK[t.section]} · ${t.source}`;
}

/* ------------------------------------------------------------ пробники */

export type ExamFormat = 'full' | 'half' | 'quick' | 'iq' | 'math';

export interface FormatSpec {
  key: ExamFormat;
  title: string;
  /** Сколько задач из раздела «Логика». */
  iq: number;
  /** Сколько задач из математики (алгебра + геометрия). */
  math: number;
  minutes: number;
  note: string;
}

export const FORMATS: FormatSpec[] = [
  {
    key: 'full', title: 'Полный пробник', iq: 40, math: 40, minutes: 100,
    note: 'Формат настоящего экзамена: 40 задач логики и 40 математики подряд.',
  },
  {
    key: 'half', title: 'Половина', iq: 20, math: 20, minutes: 50,
    note: 'Та же пропорция разделов, вдвое короче. Удобно в будни.',
  },
  {
    key: 'quick', title: 'Быстрая диагностика', iq: 10, math: 10, minutes: 25,
    note: 'Двадцать задач, чтобы увидеть текущий уровень и слабые темы.',
  },
  {
    key: 'iq', title: 'Только логика', iq: 40, math: 0, minutes: 50,
    note: 'Сорок задач на логику с таймером — тренировать скорость в разделе.',
  },
  {
    key: 'math', title: 'Только математика', iq: 0, math: 40, minutes: 50,
    note: 'Сорок задач алгебры и геометрии с таймером.',
  },
];

export const formatByKey = (k: string): FormatSpec | null =>
  FORMATS.find((f) => f.key === k) || null;

/* ------------------------------------------------------------ результат */

export interface PartResult {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  /** correct − 0,25 · wrong, но не меньше нуля. */
  net: number;
  accuracyPct: number;
  score: number;
  maxScore: number;
}

export interface ExamResult {
  total: number;
  answered: number;
  iq: PartResult;
  math: PartResult;
  score: number;
  weak: { topic: string; label: string; total: number; correct: number }[];
  strong: { topic: string; label: string; total: number; correct: number }[];
}

/** 1 задача, 2 задачи, 5 задач. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** 100 минут → «1 ч 40 мин». */
export function hhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
