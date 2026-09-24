/* Доступ по ID ученика — общий для сервера и браузера (без базы). */

export type Section = 'courses' | 'schedule' | 'scores' | 'materials' | 'exams';

export const SECTIONS: { key: Section; label: string }[] = [
  { key: 'courses', label: 'Курсы и группа' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'scores', label: 'Баллы и оценки преподавателей' },
  { key: 'materials', label: 'Материалы курса и чат группы' },
  { key: 'exams', label: 'Большие пробники (80 задач и другие форматы)' },
];

export interface Access {
  level: 'full' | 'partial';
  sections?: Partial<Record<Section, boolean>>;
}

export function can(access: Access | null | undefined, s: Section): boolean {
  if (!access) return false;
  if (access.level === 'full') return true;
  return Boolean(access.sections?.[s]);
}
