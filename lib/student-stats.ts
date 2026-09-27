/*
 * Статистика ученика для учителя и админа: задачи по темам, активность,
 * ошибки, пробники. Кто что может смотреть — canViewStudent.
 */

import { db, one } from './db';
import { isAdmin, type User } from './auth';
import { TZ, addDays, nowInTz, progressOf, teacherOfUser } from './data';
import { streakOf } from './streak';

export interface StudentCard {
  id: string; name: string; phone: string | null; note: string | null; user_id: string | null;
  exam_name: string | null; exam_date: string | null; target_score: number | null;
  last_seen: string | null; username: string | null;
}

/** Админ видит всех, учитель — учеников своих групп и индивидуальных занятий. */
export async function canViewStudent(user: User, studentId: string): Promise<'admin' | 'teacher' | null> {
  if (isAdmin(user)) return 'admin';
  const t = await teacherOfUser(user.id);
  if (!t) return null;
  const ok = await one`select 1 from bc_members m join bc_groups g on g.id = m.group_id
    where m.student_id = ${studentId} and g.teacher_id = ${t.id}`;
  return ok ? 'teacher' : null;
}

export async function studentStats(studentId: string) {
  const st = await one<StudentCard>`select s.id, s.name, s.phone, s.note, s.user_id, s.exam_name,
      to_char(s.exam_date, 'YYYY-MM-DD') as exam_date, s.target_score,
      to_char(u.last_seen at time zone ${TZ}, 'YYYY-MM-DD') as last_seen, u.username
    from bc_students s left join bc_users u on u.id = s.user_id where s.id = ${studentId}`;
  if (!st) return null;
  // без аккаунта попыток нет; очные пробники найдутся по student_id
  const uid = st.user_id || '-';
  const since = addDays(nowInTz().date, -13);

  const [progress, streak, days, modes, mistakes, survival, groups] = await Promise.all([
    progressOf(uid, st.id),
    st.user_id ? streakOf(st.user_id) : Promise.resolve(null),
    db<{ d: string; n: number; ok: number }>`select to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as d,
        count(*)::int as n, count(*) filter (where correct)::int as ok
      from bc_attempts where user_id = ${uid} and created_at > now() - interval '15 days' group by 1 order by 1`,
    db<{ mode: string; n: number; ok: number }>`select mode, count(*)::int as n, count(*) filter (where correct)::int as ok
      from bc_attempts where user_id = ${uid} and created_at > now() - interval '30 days' group by mode order by n desc`,
    db<{ label: string; section: string | null; mode: string; at: string }>`select coalesce(topic_label, topic) as label, section, mode,
        to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD HH24:MI') as at
      from bc_attempts where user_id = ${uid} and not correct order by created_at desc limit 12`,
    one<{ best: number | null; runs: number }>`select max(best)::int as best, count(*)::int as runs from bc_survival where user_id = ${uid}`,
    db<{ id: number; course: string; name: string; kind: string; teacher: string | null }>`select g.id, g.course, g.name, g.kind, g.teacher
      from bc_members m join bc_groups g on g.id = m.group_id where m.student_id = ${st.id} order by g.course`,
  ]);

  const byDay = new Map(days.map((d) => [d.d, d]));
  const activity = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(since, i);
    const d = byDay.get(date);
    return { date, n: d?.n || 0, ok: d?.ok || 0 };
  });

  return { st, progress, streak, activity, modes, mistakes, survival, groups };
}
