/*
 * Напоминания в Telegram. runReminders() запускается по расписанию
 * (/api/cron/reminders, раз в 10–15 минут) и отправляет:
 * - за час до занятия по расписанию — ученикам группы и учителю
 *   (учителю — с предупреждением, если у занятия нет ссылки);
 * - за час до доп. занятия или теста;
 * - за сутки до срока сдачи;
 * - вечером (20:00–21:00 по школе) — если стрик сгорит, а сегодня задач не было.
 * Каждое напоминание записывается в bc_notify_log и больше не повторяется.
 */

import { db, one } from './db';
import { TZ, can, nowInTz, upcomingLessons, withLessonInfo, type Access, type Group } from './data';
import { streaksOf } from './streak';
import { esc, sendMessage } from './telegram';
import { plural, whenRu } from './format';

export const SITE = () => (process.env.SITE_URL || 'https://bootcamp.tryoszone.com').replace(/\/$/, '');

export type NotifyKind = 'lessons' | 'deadlines' | 'streak';
export const NOTIFY: { key: NotifyKind; label: string; hint: string }[] = [
  { key: 'lessons', label: 'Занятия', hint: 'за час до урока — со ссылкой; новые доп. занятия и тесты' },
  { key: 'deadlines', label: 'Сроки сдачи', hint: 'за сутки до срока' },
  { key: 'streak', label: 'Стрик', hint: 'вечером, если сегодня ещё не решал задачи' },
];

interface Person { user_id: string; chat: string; notify: Partial<Record<NotifyKind, boolean>> }
interface StudentR extends Person { student_id: string; access: Access }
interface TeacherR extends Person { teacher_id: string }

const wants = (p: Person, k: NotifyKind) => p.notify?.[k] !== false;

async function people() {
  const [students, teachers, members] = await Promise.all([
    db<StudentR>`select s.id as student_id, s.access, u.id as user_id, coalesce(u.tg_chat_id, u.tg_id)::text as chat, u.notify
      from bc_students s join bc_users u on u.id = s.user_id where coalesce(u.tg_chat_id, u.tg_id) is not null`,
    db<TeacherR>`select t.id as teacher_id, u.id as user_id, coalesce(u.tg_chat_id, u.tg_id)::text as chat, u.notify
      from bc_teachers t join bc_users u on u.id = t.user_id where coalesce(u.tg_chat_id, u.tg_id) is not null`,
    db<{ student_id: string; group_id: number }>`select student_id, group_id from bc_members`,
  ]);
  return { students, teachers, members };
}

export interface RunResult { sent: number; skipped: number; failed: number; blocked: number; details: string[] }

/** Отправка с защитой от повторов: сначала «занимаем» ключ, потом шлём. */
async function deliver(res: RunResult, key: string, chat: string, html: string, buttons: { text: string; url: string }[] = []) {
  const claimed = await one`insert into bc_notify_log (key) values (${key}) on conflict do nothing returning key`;
  if (!claimed) { res.skipped++; return; }
  const r = await sendMessage(chat, html, buttons);
  if (r === 'ok') { res.sent++; res.details.push(key); return; }
  if (r === 'blocked') { res.blocked++; return; } // не нажал Start — повторять бессмысленно
  res.failed++;
  await db`delete from bc_notify_log where key = ${key}`; // сбой сети — попробуем в следующий раз
}

const groupTitle = (g: Group) => (g.name ? `${g.course} · ${g.name}` : g.course);
const KIND_RU: Record<string, string> = { lesson: 'доп. занятие', exam: 'тест', deadline: 'срок сдачи' };

export async function runReminders(): Promise<RunResult> {
  const res: RunResult = { sent: 0, skipped: 0, failed: 0, blocked: 0, details: [] };
  const now = nowInTz();
  const { students, teachers, members } = await people();
  if (!students.length && !teachers.length) return res;
  const inGroup = (gid: number) => new Set(members.filter((m) => m.group_id === gid).map((m) => m.student_id));
  const site = SITE();

  // ---------- занятия по расписанию: начинаются в ближайший час
  const groups = await db<Group>`select id, kind, course, name, teacher, teacher_id, schedule, to_char(starts, 'YYYY-MM-DD') as starts,
    to_char(ends, 'YYYY-MM-DD') as ends, total_lessons, link, chat, materials, color from bc_groups`;
  const soon = (await withLessonInfo(upcomingLessons(groups, 2, 500))).filter((l) => {
    const [h, m] = l.start.split(':').map(Number);
    const mins = h * 60 + m + (l.date === now.date ? 0 : 1440) - now.minutes;
    return mins >= 0 && mins <= 60;
  });
  for (const l of soon) {
    const g = l.group;
    const [h, m] = l.start.split(':').map(Number);
    const left = h * 60 + m + (l.date === now.date ? 0 : 1440) - now.minutes;
    const inText = left <= 5 ? 'Сейчас начнётся' : `Через ${left} мин`;
    const who = inGroup(g.id);
    for (const s of students) {
      if (!who.has(s.student_id) || !wants(s, 'lessons') || !can(s.access, 'schedule')) continue;
      await deliver(res, `L:${s.user_id}:${g.id}:${l.date}:${l.start}`, s.chat,
        `⏰ <b>${inText}</b> — ${esc(groupTitle(g))}\n${l.start}–${l.end}${l.topic ? `\nТема: ${esc(l.topic)}` : ''}${l.link ? '' : '\nСсылку пришлёт преподаватель.'}`,
        [...(l.link ? [{ text: 'Подключиться', url: l.link }] : []), { text: 'Расписание', url: `${site}/schedule` }]);
    }
    const t = teachers.find((x) => x.teacher_id === g.teacher_id);
    if (t && wants(t, 'lessons')) {
      await deliver(res, `LT:${t.user_id}:${g.id}:${l.date}:${l.start}`, t.chat,
        `⏰ <b>${inText}</b> ваше занятие — ${esc(groupTitle(g))}\n${l.start}–${l.end} · ${who.size} ${plural(who.size, 'ученик', 'ученика', 'учеников')}`
        + (l.link ? '' : '\n⚠️ <b>Ссылки на урок нет</b> — ученики не смогут подключиться.'),
        l.link ? [{ text: 'Открыть урок', url: l.link }] : [{ text: 'Поставить ссылку', url: `${site}/teach` }]);
    }
  }

  // ---------- доп. занятия и тесты (за час) и сроки (за сутки)
  const events = await db<{ id: number; group_id: number | null; student_id: string | null; scope: string; kind: string; title: string;
    link: string | null; note: string | null; day: string; time: string; mins: number }>`
    select id, group_id, student_id, scope, kind, title, link, note,
      to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(at at time zone ${TZ}, 'HH24:MI') as time,
      (extract(epoch from at - now()) / 60)::int as mins
    from bc_events where at > now() and at <= now() + interval '24 hours'`;
  const groupOf = (id: number | null) => groups.find((g) => g.id === id);
  for (const e of events) {
    const isDeadline = e.kind === 'deadline';
    if (!isDeadline && e.mins > 60) continue;
    const kind: NotifyKind = isDeadline ? 'deadlines' : 'lessons';
    const g = groupOf(e.group_id);
    const targets = students.filter((s) => (e.scope === 'all' ? true : e.student_id ? s.student_id === e.student_id : e.group_id ? inGroup(e.group_id).has(s.student_id) : false));
    const when = `${whenRu(now.date, e.day).toLowerCase()}${isDeadline && e.time === '23:59' ? ' до конца дня' : `, ${e.time}`}`;
    const html = isDeadline
      ? `📝 <b>Срок сдачи</b> — ${esc(e.title)}\n${when}${e.note ? `\n${esc(e.note)}` : ''}${g ? `\n${esc(groupTitle(g))}` : ''}`
      : `📌 <b>Через ${Math.max(1, e.mins)} мин</b> — ${KIND_RU[e.kind] || 'занятие'} «${esc(e.title)}»\n${e.time}${e.note ? ` · ${esc(e.note)}` : ''}${g ? `\n${esc(groupTitle(g))}` : ''}`;
    const buttons = [...(e.link ? [{ text: isDeadline ? 'Открыть' : 'Подключиться', url: e.link }] : []), { text: 'Расписание', url: `${site}/schedule` }];
    for (const s of targets) {
      if (!wants(s, kind) || !can(s.access, 'schedule')) continue;
      await deliver(res, `E:${s.user_id}:${e.id}`, s.chat, html, buttons);
    }
    const t = g?.teacher_id ? teachers.find((x) => x.teacher_id === g.teacher_id) : null;
    if (t && !isDeadline && wants(t, 'lessons')) {
      await deliver(res, `ET:${t.user_id}:${e.id}`, t.chat, html + (e.link ? '' : '\n⚠️ Ссылки нет.'),
        e.link ? [{ text: 'Открыть', url: e.link }] : [{ text: 'Поставить ссылку', url: `${site}/teach` }]);
    }
  }

  // ---------- стрик: вечером, если сегодня ещё не решал
  if (now.minutes >= 20 * 60 && now.minutes < 21 * 60) {
    const ids = [...new Set(students.map((s) => s.user_id))];
    const [streaks, today] = await Promise.all([
      streaksOf(ids),
      db<{ user_id: string }>`select distinct user_id from bc_attempts where user_id = any(${ids}::text[])
        and to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') = ${now.date} and created_at > now() - interval '2 days'`,
    ]);
    const done = new Set(today.map((r) => r.user_id));
    const seen = new Set<string>();
    for (const s of students) {
      if (seen.has(s.user_id)) continue;
      seen.add(s.user_id);
      const n = streaks[s.user_id] || 0;
      if (n < 1 || done.has(s.user_id) || !wants(s, 'streak')) continue;
      await deliver(res, `S:${s.user_id}:${now.date}`, s.chat,
        `🔥 Стрик <b>${n} ${plural(n, 'день', 'дня', 'дней')}</b> сгорит в полночь.\nРеши хотя бы одну задачу — хватит пары минут.`,
        [{ text: 'Решать', url: `${site}/practice` }]);
    }
  }

  // старые ключи больше не нужны
  await db`delete from bc_notify_log where sent_at < now() - interval '14 days'`;
  return res;
}

/** Сразу сообщить ученикам о новом доп. занятии, тесте или сроке. */
export async function notifyNewEvents(eventIds: number[]): Promise<void> {
  if (!eventIds.length || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const now = nowInTz();
    const { students, members } = await people();
    if (!students.length) return;
    const rows = await db<{ id: number; group_id: number | null; student_id: string | null; scope: string; kind: string; title: string;
      link: string | null; note: string | null; day: string; time: string }>`
      select id, group_id, student_id, scope, kind, title, link, note,
        to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day, to_char(at at time zone ${TZ}, 'HH24:MI') as time
      from bc_events where id = any(${eventIds}::int[]) and at > now()`;
    const res: RunResult = { sent: 0, skipped: 0, failed: 0, blocked: 0, details: [] };
    const sentTo = new Set<string>();
    for (const e of rows) {
      const kind: NotifyKind = e.kind === 'deadline' ? 'deadlines' : 'lessons';
      const ids = new Set(members.filter((m) => m.group_id === e.group_id).map((m) => m.student_id));
      const when = `${whenRu(now.date, e.day)}${e.kind === 'deadline' && e.time === '23:59' ? ', до конца дня' : `, ${e.time}`}`;
      for (const s of students) {
        const hit = e.scope === 'all' || (e.student_id ? s.student_id === e.student_id : e.group_id ? ids.has(s.student_id) : false);
        // одно назначение на несколько групп — одно сообщение ученику
        const dedupe = `${s.user_id}:${e.title}:${e.day}:${e.time}`;
        if (!hit || sentTo.has(dedupe) || !wants(s, kind) || !can(s.access, 'schedule')) continue;
        sentTo.add(dedupe);
        await deliver(res, `N:${s.user_id}:${e.id}`, s.chat,
          `🆕 <b>${e.kind === 'deadline' ? 'Новый срок сдачи' : e.kind === 'exam' ? 'Назначен тест' : 'Новое занятие'}</b> — ${esc(e.title)}\n${when}${e.note ? ` · ${esc(e.note)}` : ''}`,
          [...(e.link ? [{ text: 'Ссылка', url: e.link }] : []), { text: 'Расписание', url: `${SITE()}/schedule` }]);
      }
    }
  } catch {
    // напоминание — не повод сорвать сохранение занятия
  }
}
