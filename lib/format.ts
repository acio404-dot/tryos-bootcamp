/* Русские даты и склонения — общие для сервера и браузера. */

/** Часовой пояс школы — Стамбул (турецкое время, UTC+3): по нему расписание, сроки, «сегодня» и задача дня. */
export const SCHOOL_TZ = 'Europe/Istanbul';

/** Сегодняшняя дата 'YYYY-MM-DD' по времени школы — одинаково на сервере и в браузере. */
export function todayIso(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DOW_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/** '2027-04-11' → '11 апреля 2027' (год можно опустить). */
export function dateRu(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function dateShort(iso: string): { day: number; mon: string } {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { day: d, mon: MONTHS_SHORT[m - 1] || '' };
}

/** Разница в днях между двумя датами 'YYYY-MM-DD'. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** «Сегодня», «Завтра» или день недели с большой буквы. */
export function whenRu(todayIso: string, iso: string): string {
  const diff = daysBetween(todayIso, iso);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  const dow = ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7);
  const w = DOW_FULL[dow];
  return `${w[0].toUpperCase()}${w.slice(1)}, ${dateRu(iso, false)}`;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('') || 'У';

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || '';

const DOW_GEN = ['понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'];

/** Срок сдачи: «сегодня до 16:30», «завтра до конца дня», «до субботы, 16:30», «до 21 октября». */
export function dueRu(todayIso: string, dayIso: string, time: string): string {
  const diff = daysBetween(todayIso, dayIso);
  const endOfDay = time === '23:59';
  if (diff === 0) return endOfDay ? 'сегодня до конца дня' : `сегодня до ${time}`;
  if (diff === 1) return endOfDay ? 'завтра до конца дня' : `завтра до ${time}`;
  const dow = (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  // в пределах недели — день недели, дальше — дата
  const day = diff > 1 && diff < 7 ? `до ${DOW_GEN[dow]}` : `до ${dateRu(dayIso, false)}`;
  return endOfDay ? day : `${day}, ${time}`;
}

/** Срок коротко, для меню: «сегодня», «завтра», «до сб», «до 21.10». */
export function dueShort(todayIso: string, dayIso: string): string {
  const diff = daysBetween(todayIso, dayIso);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  const dow = (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return diff > 1 && diff < 7 ? `до ${DOW[dow].toLowerCase()}` : `до ${dayIso.slice(8, 10)}.${dayIso.slice(5, 7)}`;
}
