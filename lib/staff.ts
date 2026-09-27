/*
 * Учителя и админы — сотрудники школы: им открыты все режимы решения
 * задач и пробники, даже без ID ученика.
 */

import { isAdmin, type User } from './auth';
import { teacherOfUser, type Access, type Student } from './data';

const FULL: Access = { level: 'full' };

export async function isStaff(user: User): Promise<boolean> {
  return isAdmin(user) || Boolean(await teacherOfUser(user.id).catch(() => null));
}

/** Доступ к тренажёру, работе над ошибками и пробникам: у сотрудников — полный. */
export async function practiceAccess(user: User, student: Student | null): Promise<Access | null | undefined> {
  return (await isStaff(user)) ? FULL : student?.access;
}
