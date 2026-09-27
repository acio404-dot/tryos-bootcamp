/*
 * Проверка полей форм: общая для админки и кабинета учителя.
 */

import type { Slot } from './data';

export const clean = (s: unknown, n = 200) => String(s ?? '').trim().slice(0, n) || null;
export const dateOrNull = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);
export const intOrNull = (s: unknown) => {
  const n = parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ссылка: если вставили без https:// — добавляем. */
export const url = (s: unknown) => {
  const v = clean(s, 400);
  return v && /^https?:\/\//i.test(v) ? v : v ? `https://${v}` : null;
};

export const KINDS = ['deadline', 'lesson', 'exam'];
export const TZONE = () => process.env.BOOTCAMP_TZ || 'Asia/Tashkent';

/** Общая проверка полей события. Возвращает либо текст ошибки, либо готовые значения. */
export function eventFields(input: { kind?: string; title?: string; date?: string; time?: string; link?: unknown; note?: unknown }) {
  const title = clean(input.title, 140);
  const date = dateOrNull(input.date);
  if (!title || !date) return 'Укажи название и дату';
  const kind = KINDS.includes(input.kind || '') ? String(input.kind) : 'deadline';
  // Срок сдачи без времени — до конца дня; занятие и тест по умолчанию с утра.
  const time = HHMM.test(input.time || '') ? String(input.time) : kind === 'deadline' ? '23:59' : '10:00';
  return { kind, title, at: `${date} ${time}`, link: url(input.link), note: clean(input.note, 300) };
}

/** Балл или оценка: название, значение и максимум. */
export function scoreFields(input: { title?: string; value?: string; max?: string; date?: string }) {
  const title = clean(input.title, 120);
  const value = Number(String(input.value ?? '').replace(',', '.'));
  const max = Number(String(input.max ?? '').replace(',', '.'));
  if (!title) return 'Укажи, за что балл';
  if (String(input.value ?? '').trim() === '' || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 'Балл и максимум — числа, максимум больше нуля';
  }
  return { title, value, max, date: dateOrNull(input.date) };
}

/** Расписание по неделям: день 1–7 и время начала и конца. */
export function slotsOf(list: Slot[] | undefined): Slot[] | string {
  const out: Slot[] = [];
  for (const s of list || []) {
    const dow = intOrNull(s.dow);
    if (!dow || dow < 1 || dow > 7) continue;
    if (!HHMM.test(s.start) || !HHMM.test(s.end)) return 'Время занятий — в формате 19:00';
    if (s.end <= s.start) return 'Конец занятия должен быть позже начала';
    out.push({ dow, start: s.start, end: s.end });
  }
  return out;
}
