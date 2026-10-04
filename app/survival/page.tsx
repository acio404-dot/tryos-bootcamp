import Shell from '@/components/Shell';
import SurvivalGame from '@/components/SurvivalGame';
import { requireUser } from '@/lib/auth';
import { can, studentOfUser } from '@/lib/data';
import { myBestSurvival, schoolBestSurvival, survivalWeek } from '@/lib/runs';
import { survivalPool } from '@/lib/shadows';
import { practiceAccess } from '@/lib/staff';
import './survival.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Выживание' };

/* Выживание: лобби режима, сама серия и финал — всё в SurvivalGame. */
export default async function Survival() {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const [best, schoolBest, week, access] = await Promise.all([
    myBestSurvival(user.id),
    schoolBestSurvival(),
    survivalWeek(user.id, student?.id),
    practiceAccess(user, student),
  ]);

  return (
    <Shell user={user} student={student} active="survival" tone="night">
      <SurvivalGame myBest={best} schoolBest={schoolBest} week={week} pool={survivalPool()} canMistakes={can(access, 'trainer')} />
    </Shell>
  );
}
