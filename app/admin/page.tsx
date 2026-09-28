import Shell from '@/components/Shell';
import AdminPanel from '@/components/AdminPanel';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentOfUser } from '@/lib/data';
import { streaksOf } from '@/lib/streak';
import { mockBatches } from '@/lib/mock';
import { botName, botReady, webhookInfo } from '@/lib/telegram';
import { nowInTz } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Админка' };

export default async function Admin() {
  const user = await requireAdmin();
  const me = await studentOfUser(user.id);

  const [students, groups, members, scores, events, users, teachers] = await Promise.all([
    db`select s.id, s.name, s.phone, s.note, s.access, s.exam_name, to_char(s.exam_date, 'YYYY-MM-DD') as exam_date, s.exam_city,
         s.target_score, s.user_id, u.username, u.name as user_name, u.tg_username, u.email,
         to_char(u.last_seen, 'YYYY-MM-DD') as last_seen
       from bc_students s left join bc_users u on u.id = s.user_id
       order by s.created_at desc`,
    db`select id, kind, course, name, teacher, teacher_id, schedule, to_char(starts, 'YYYY-MM-DD') as starts, to_char(ends, 'YYYY-MM-DD') as ends,
         total_lessons, link, chat, materials, color from bc_groups order by course, name`,
    db`select student_id, group_id from bc_members`,
    db`select id, student_id, title, value::float as value, max::float as max, teacher, to_char(date, 'YYYY-MM-DD') as date
       from bc_scores order by date desc, id desc`,
    db`select id, group_id, student_id, kind, title, scope, batch, link, note,
         to_char(at at time zone ${process.env.BOOTCAMP_TZ || 'Asia/Tashkent'}, 'YYYY-MM-DD HH24:MI') as at
       from bc_events where at > now() - interval '30 days' order by at`,
    db`select count(*)::int as n from bc_users`,
    db`select t.id, t.name, t.phone, t.note, t.user_id, u.username, u.tg_username, u.email,
         to_char(u.last_seen, 'YYYY-MM-DD') as last_seen
       from bc_teachers t left join bc_users u on u.id = t.user_id order by t.name`,
  ]);

  const [streaks, mocks, mockExams] = await Promise.all([
    streaksOf(students.map((s: any) => s.user_id)),
    mockBatches(),
    // проведённые тестирования из расписания — чтобы внести по ним баллы
    db<{ title: string; day: string; group_id: number | null }>`select title, group_id,
        to_char(at at time zone ${process.env.BOOTCAMP_TZ || 'Asia/Tashkent'}, 'YYYY-MM-DD') as day
      from bc_events where kind = 'exam' and at > now() - interval '180 days' and at < now() + interval '1 day'
      order by at desc limit 80`,
  ]);
  for (const s of students as any[]) s.streak = s.user_id ? streaks[s.user_id] || 0 : 0;

  const [hook, tgCount] = await Promise.all([
    botReady() ? webhookInfo() : Promise.resolve(null),
    db`select count(*)::int as n from bc_users where tg_chat_id is not null or tg_id is not null`,
  ]);
  const tg = {
    ready: botReady(), bot: botName(), connected: tgCount[0]?.n ?? 0, cron: Boolean(process.env.CRON_SECRET),
    webhook: hook ? { url: hook.url, error: hook.error } : null,
  };

  return (
    <Shell user={user} student={me} active="admin">
      <div className="top">
        <div>
          <h1>Админка</h1>
          <p>Ученики и учителя, группы, индивидуальные занятия, расписание, доступ и баллы.
            Зарегистрировано аккаунтов: {users[0]?.n ?? 0}.</p>
        </div>
      </div>
      <AdminPanel
        students={students as any}
        groups={groups as any}
        members={members as any}
        scores={scores as any}
        events={events as any}
        teachers={teachers as any}
        mocks={mocks}
        mockExams={mockExams}
        tg={tg}
        today={nowInTz().date}
      />
    </Shell>
  );
}
