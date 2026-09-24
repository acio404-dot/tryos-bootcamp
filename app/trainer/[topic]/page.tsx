import Link from 'next/link';
import { notFound } from 'next/navigation';
import Shell from '@/components/Shell';
import SeriesFlow from '@/components/SeriesFlow';
import { requireUser } from '@/lib/auth';
import { studentOfUser } from '@/lib/data';
import { topicInfo, topicQuestions } from '@/lib/bank';
import { sourceLine } from '@/lib/bank-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { topic: string } }) {
  const t = topicInfo(params.topic);
  return { title: t ? t.label : 'Тренажёр' };
}

export default async function TopicPage({ params }: { params: { topic: string } }) {
  const info = topicInfo(params.topic);
  if (!info) notFound();

  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const questions = topicQuestions(params.topic, 20);

  return (
    <Shell user={user} student={student} active="trainer">
      <div className="top">
        <div>
          <span className="eyebrow">{sourceLine(info)}</span>
          <h1>{info.label}</h1>
        </div>
        <div className="top-actions">
          <Link className="btn btn-ghost" href="/trainer">Все темы</Link>
        </div>
      </div>

      <SeriesFlow
        questions={questions}
        mode="practice"
        backHref="/trainer"
        backLabel="Все темы"
        emptyText="В этой теме пока нет задач."
      />
    </Shell>
  );
}
