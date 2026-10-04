/*
 * Подсказка после первой ошибки: Nur даёт направление, а не ответ.
 * Берём первое предложение первого шага разбора и оставляем от него мысль
 * («с чего начать»): без результата вычислений и без ответа. Правила строгие —
 * если подсказка могла бы выдать ответ, её нет совсем, и ученик видит слабое
 * место тени (общий совет по теме из content/shadows.json).
 */

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Разбор по шагам: «Шаг 1 — … Шаг 2 — …», строки через <br> или предложения. */
function stepsOf(explanation: string): string[] {
  const e = explanation.trim();
  if (/Шаг\s*1\s*[—–:.-]/.test(e)) {
    return e.split(/(?:<br\s*\/?>\s*)?Шаг\s*\d+\s*[—–:.-]\s*/).map((s) => s.trim()).filter(Boolean);
  }
  const lines = e.split(/<br\s*\/?>/).map((s) => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return sentences(e);
}

/** Предложения: точка, пробел и заглавная буква (не режем «2,5. » внутри чисел). */
const sentences = (s: string): string[] =>
  s.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ«(])/).map((x) => x.trim()).filter(Boolean);

/** Числа в тексте без знака: «−2,5» → «2.5». Знак не учитываем: «(x + 3)² − 17» выдаёт ответ −17. */
const numbers = (s: string): string[] => (strip(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));

const norm = (s: string) => strip(s).replace(/−/g, '-').replace(/\s+/g, ' ').toLowerCase();

/** Ответ вида «I»…«V» или одна буква: в тексте подсказки такие «совпадения» случайны. */
const tooShort = (answer: string) => answer.length < 2 || /^[IVX]{1,3}$/.test(answer);

/** Вариант ответа «виден» в подсказке, хотя в условии его нет. */
function reveals(hint: string, question: string, option: string): boolean {
  const opt = norm(option);
  if (!opt) return false;
  const optNums = numbers(opt);
  const pure = optNums.length === 1 && opt.replace(/[^\d]/g, '').length > 0 && opt.replace(/[\d.,\s°%-]/g, '').length <= 3;
  if (pure) {
    // числовой ответ: его значения не должно быть среди чисел подсказки, если его нет в условии
    return numbers(hint).includes(optNums[0]) && !numbers(question).includes(optNums[0]);
  }
  if (tooShort(option.trim())) return false;
  return norm(hint).includes(opt) && !norm(question).includes(opt);
}

/**
 * Подсказка по задаче или null.
 * question — условие (числа из условия называть можно), options и correct — варианты ответа.
 */
export function hintOf(explanation: string, question: string, options: string[], correct: number): string | null {
  const steps = stepsOf(explanation || '');
  if (steps.length < 2) return null;
  const whole = strip(explanation).length;

  // первое предложение первого шага
  let first = sentences(steps[0])[0] || '';
  if (!first || /<b>/.test(first)) return null;

  // «переводим в десятичную по степеням основания: 1·2⁹ + …» → только мысль до двоеточия
  const colon = first.search(/[а-яёa-z)»]:\s/i);
  if (colon >= 15) first = first.slice(0, colon + 1);

  // результат вычисления не называем: режем перед «=», за которым идёт число, которого нет в условии
  const known = new Set(numbers(question));
  let cut = -1;
  const re = /=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(first))) {
    const rest = first.slice(m.index + 1);
    const next = rest.search(/=/);
    const rhs = next >= 0 ? rest.slice(0, next) : rest;
    if (numbers(rhs).some((n) => !known.has(n))) { cut = m.index; break; }
  }
  if (cut >= 0) {
    first = first.slice(0, cut);
    // «Выделим полный квадрат: A» — после обрезки осталось одно обозначение: убираем его вместе с двоеточием
    const tail = first.search(/[:;,—–]\s*[^:;,—–]{0,12}$/);
    if (tail >= 15 && strip(first.slice(tail + 1)).length <= 12) first = first.slice(0, tail);
    // «…, поэтому f(196)», «… и ∠BOC» — оборванный вывод после обрезки тоже убираем
    const links = [...first.matchAll(/,?\s+(?:поэтому|то есть|значит|откуда|тогда|следовательно|и|а)\s+/g)];
    const link = links[links.length - 1];
    if (link && link.index >= 15 && first.length - link.index <= 48) first = first.slice(0, link.index);
  }

  first = first.replace(/[\s;,:—–-]+$/, '').trim();
  if (!first) return null;
  if (!/[.!?…]$/.test(first)) first += '.';
  // с заглавной — только русское слово; «x, y ≠ 0» остаётся как есть
  if (/^[а-яё]/.test(first)) first = first[0].toUpperCase() + first.slice(1);

  const plain = strip(first);
  if (plain.length < 18 || plain.length > 200) return null;
  // подсказка — начало пути, а не пересказ разбора
  if (plain.length > whole * 0.6) return null;
  // незакрытые теги и скобки после обрезки
  if ((first.match(/<(sup|sub|b|i)>/g) || []).length !== (first.match(/<\/(sup|sub|b|i)>/g) || []).length) return null;
  if ((plain.match(/\(/g) || []).length !== (plain.match(/\)/g) || []).length) return null;

  // подсказка не должна выдавать верный вариант
  const answer = options[correct] ?? '';
  if (reveals(first, question, answer)) return null;
  return first;
}
