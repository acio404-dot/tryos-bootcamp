import { notFound, redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import ExamFlow from '@/components/ExamFlow';
import { requireUser } from '@/lib/auth';
import { studentOfUser } from '@/lib/data';
import { publicById } from '@/lib/bank';
import { hhmm } from '@/lib/bank-types';
import { examRun } from '@/lib/runs';
import type { PublicQuestion } from '@/lib/bank-types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Пробник' };

export default async function Run({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const run = await examRun(user.id, params.id);
  if (!run) notFound();
  if (run.finished_at) redirect(`/exam/${run.id}/result`);

  const student = await studentOfUser(user.id);
  const questions = run.ids.map((id) => publicById(id)).filter(Boolean) as PublicQuestion[];

  return (
    <Shell user={user} student={student} active="exam">
      <div className="top">
        <div>
          <span className="eyebrow">Пробник · {questions.length} задач · {hhmm(run.minutes)}</span>
          <h1>{run.title}</h1>
        </div>
      </div>

      <ExamFlow
        runId={run.id}
        questions={questions}
        minutes={run.minutes}
        startedAt={run.started_at}
        initial={run.answers}
      />
    </Shell>
  );
}
