import Link from 'next/link';
import Shell from '@/components/Shell';
import SeriesFlow from '@/components/SeriesFlow';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import Locked from '@/components/Locked';
import { publicById } from '@/lib/bank';
import { plural } from '@/lib/bank-types';
import { mistakesOf } from '@/lib/runs';
import type { PublicQuestion } from '@/lib/bank-types';
import { practiceAccess } from '@/lib/staff';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Работа над ошибками' };

export default async function Mistakes() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  if (!can(await practiceAccess(user, student), 'trainer')) {
    return (
      <Shell user={user} student={student} active="mistakes">
        <div className="top"><div><span className="eyebrow">Тренажёр</span><h1>Работа над ошибками</h1></div></div>
        <Locked hasId={Boolean(student)} title="Работа над ошибками закрыта"
          text="Здесь собираются задачи, в которых ты ошибся в тренажёре, пробниках и выживании, — чтобы дорешать их и закрыть пробелы." />
      </Shell>
    );
  }
  const rows = await mistakesOf(user.id, 30);

  const questions = rows
    .map((r) => publicById(r.question_id))
    .filter(Boolean) as PublicQuestion[];

  const byTopic = new Map<string, number>();
  for (const r of rows) byTopic.set(r.topic_label || r.topic, (byTopic.get(r.topic_label || r.topic) || 0) + 1);
  const top = [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <Shell user={user} student={student} active="mistakes">
      <div className="top">
        <div>
          <span className="eyebrow">Тренажёр</span>
          <h1>Работа над ошибками</h1>
          <p>Здесь собираются задачи, в которых последний ответ был неверным.
            Решишь такую правильно — она уходит из списка сама.</p>
        </div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/trainer">Все темы</Link>
        </div>
      </div>

      {questions.length ? (
        <>
          <div className="tiles">
            <div className="tile"><b>{questions.length}</b><i>{plural(questions.length, 'задача в работе', 'задачи в работе', 'задач в работе')}</i></div>
            {top.map(([label, n]) => (
              <div className="tile" key={label}><b>{n}</b><i>{label}</i></div>
            ))}
          </div>
          <div className="mt">
            <SeriesFlow
              questions={questions}
              mode="mistakes"
              backHref="/trainer"
              backLabel="Все темы"
            />
          </div>
        </>
      ) : (
        <div className="empty-card">
          <p>Ошибок нет — либо ты ещё не решал задачи, либо все прошлые промахи уже закрыты.
            Порешай тему в тренажёре или пройди пробник, и всё, что не получится, соберётся здесь.</p>
          <Link className="btn btn-primary" href="/trainer">Открыть тренажёр</Link>
        </div>
      )}
    </Shell>
  );
}
