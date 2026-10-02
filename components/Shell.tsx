import Link from 'next/link';
import { isAdmin, type User } from '@/lib/auth';
import { can, teacherOfUser, type Student } from '@/lib/data';
import { TOTAL_TOPICS } from '@/lib/bank';
import { plural } from '@/lib/format';
import { navStats } from '@/lib/nav';
import { practiceAccess } from '@/lib/staff';
import { streakOf, type StreakInfo } from '@/lib/streak';
import Brand from './Brand';
import { NurAvatar } from './Nur';
import StreakBadge from './StreakBadge';
import TeacherTag from './TeacherTag';
import StreakCelebrate from './StreakCelebrate';
import MobileMenu, { MenuButton } from './MobileMenu';
import { Ico, ILogout, type IcoName } from './icons';

export type Tab = 'home' | 'practice' | 'exam' | 'trainer' | 'mistakes' | 'survival' | 'courses' | 'schedule' | 'progress' | 'settings' | 'admin' | 'teach';

const MAIN = 'https://www.tryoszone.com';

interface Item { tab: Tab; href: string; label: string; ico: IcoName; note?: string }

/* Каркас кабинета: слева меню из трёх блоков, на телефоне — нижняя панель из пяти вкладок. */
export default async function Shell({
  user, student, active, children, streak,
}: {
  user: User;
  student: Student | null;
  active: Tab;
  children: React.ReactNode;
  /** Стрик, если страница его уже посчитала; иначе посчитаем здесь. */
  streak?: StreakInfo;
}) {
  // Стрик и числа для меню нужны на каждой странице.
  const [s, teacher, stats, access] = await Promise.all([
    streak ?? streakOf(user.id).catch(() => null),
    teacherOfUser(user.id).catch(() => null),
    navStats(user.id, student?.id).catch(() => null),
    practiceAccess(user, student).catch(() => null),
  ]);
  // Работа над ошибками открыта ученикам школы и сотрудникам.
  const mistakesOpen = can(access, 'trainer');
  const admin = isAdmin(user);
  const level = student ? (student.access?.level === 'partial' ? 'Частичный доступ' : 'Полный доступ') : teacher ? 'Кабинет учителя' : 'Без ID ученика';
  const idLine = student ? `ID ${student.id}` : teacher ? `ID ${teacher.id}` : user.username ? `@${user.username}` : 'ID не привязан';
  const name = user.name || 'Ученик';

  // Роли без ID ученика: учитель начинает с «Мои группы», админ — с админки.
  // Разделы про курсы ученика им не нужны; режимы решения задач открыты.
  const staffOnly = !student && Boolean(teacher || admin);

  const today: Item[] = staffOnly ? [] : [{ tab: 'home', href: '/', label: 'Главная', ico: 'home' }];
  const work: Item[] = [
    ...(teacher ? [{ tab: 'teach', href: '/teach', label: 'Мои группы', ico: 'teach' }] as Item[] : []),
    ...(admin ? [{ tab: 'admin', href: '/admin', label: 'Админка', ico: 'admin' }] as Item[] : []),
  ];
  const schedule: Item = { tab: 'schedule', href: '/schedule', label: 'Расписание', ico: 'schedule' };
  const mine: Item[] = [
    { tab: 'progress', href: '/progress', label: 'Прогресс', ico: 'progress' },
    ...(!staffOnly || teacher ? [schedule] : []),
    ...(!staffOnly ? [{ tab: 'courses', href: '/courses', label: 'Мои курсы', ico: 'courses' }] as Item[] : []),
    { tab: 'settings', href: '/settings', label: 'Настройки', ico: 'settings' },
  ];
  const modes: (Item & { cls: string })[] = [
    { tab: 'survival', href: '/survival', label: 'Выживание', ico: 'survival', cls: 'sm-survival', note: stats?.best ? `рекорд ${stats.best}` : 'три лампочки' },
    { tab: 'exam', href: '/exam', label: 'Пробники', ico: 'exam', cls: 'sm-exam', note: stats?.score != null ? `последний ${stats.score}` : 'балл 0–500' },
    { tab: 'trainer', href: '/trainer', label: 'Тренажёр', ico: 'trainer', cls: 'sm-trainer', note: `${TOTAL_TOPICS} ${plural(TOTAL_TOPICS, 'тема', 'темы', 'тем')}` },
    { tab: 'mistakes', href: '/mistakes', label: 'Ошибки', ico: 'mistakes', cls: 'sm-mistakes', note: !mistakesOpen ? 'открывает школа' : stats?.mistakes ? `${stats.mistakes} в работе` : 'пока пусто' },
  ];

  // Телефон: внизу пять вкладок, последняя — «Я» (профиль и остальные разделы).
  const practiceTabs: Tab[] = ['practice', 'exam', 'trainer', 'mistakes', 'survival'];
  const T: Record<string, { href: string; label: string; ico: IcoName; on: boolean }> = {
    home: { href: '/', label: 'Сегодня', ico: 'home', on: active === 'home' },
    modes: { href: '/practice', label: 'Режимы', ico: 'survival', on: practiceTabs.includes(active) },
    progress: { href: '/progress', label: 'Прогресс', ico: 'progress', on: active === 'progress' },
    schedule: { href: '/schedule', label: 'Расписание', ico: 'schedule', on: active === 'schedule' },
    teach: { href: '/teach', label: 'Группы', ico: 'teach', on: active === 'teach' },
    admin: { href: '/admin', label: 'Админка', ico: 'admin', on: active === 'admin' },
  };
  const tabs = !staffOnly
    ? [T.home, T.modes, T.progress, teacher ? T.teach : T.schedule]
    : teacher
      ? [T.teach, T.schedule, T.modes, T.progress]
      : [T.admin, T.modes, T.progress];
  const inTabs = new Set(tabs.map((t) => t.href));
  const sheet = [...work, ...mine].filter((i) => !inTabs.has(i.href));
  const meOn = sheet.some((i) => i.tab === active);

  const row = (i: Item) => (
    <Link key={i.tab} href={i.href} className={active === i.tab ? 'on' : undefined} aria-current={active === i.tab ? 'page' : undefined}>
      <Ico name={i.ico} /><span className="lbl">{i.label}</span>
    </Link>
  );

  return (
    <div className="app">
      <aside className="side">
        <Brand dark href={staffOnly ? work[0]?.href || '/' : '/'} />
        <nav className="nav" aria-label="Разделы">
          {today.length ? <div className="nav-lab">Сегодня</div> : null}
          {today.map(row)}
          {work.length ? <div className="nav-lab">Школа</div> : null}
          {work.map(row)}
        </nav>
        <div className="nav-lab">Режимы</div>
        <nav className="side-modes" aria-label="Режимы">
          {modes.map((m) => (
            <Link key={m.tab} href={m.href} className={`side-mode ${m.cls}${active === m.tab ? ' on' : ''}`} aria-current={active === m.tab ? 'page' : undefined}>
              <Ico name={m.ico} /><b>{m.label}</b><i>{m.note}</i>
            </Link>
          ))}
        </nav>
        <nav className="nav" aria-label="Моё">
          <div className="nav-lab">Моё</div>
          {mine.map(row)}
          <a href={MAIN} target="_blank" rel="noopener noreferrer"><Ico name="site" /><span className="lbl">Сайт школы</span><span className="ext">↗</span></a>
        </nav>
        <div className="me">
          <div className="me-top">
            <span className="ava"><NurAvatar /></span>
            <span>
              <b className="me-name">{name}{s ? <StreakBadge n={s.current} /> : null}{teacher ? <TeacherTag /> : null}</b>
              <i>{idLine}</i>
            </span>
          </div>
          <div className="me-row">
            <span className="access">{level}</span>
            <a href="/api/auth/logout">Выйти</a>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
      {s ? <StreakCelebrate current={s.current} today={s.today} date={s.date} /> : null}

      <nav className="tabbar" aria-label="Разделы">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t.on ? 'on' : undefined} aria-current={t.on ? 'page' : undefined}><Ico name={t.ico} />{t.label}</Link>
        ))}
        <MenuButton className={meOn ? 'on' : undefined} label="Я: профиль и остальные разделы">
          <Ico name="me" />Я
        </MenuButton>
      </nav>

      <MobileMenu>
        <div className="mm-me">
          <span className="ava"><NurAvatar /></span>
          <span className="mm-who">
            <b className="me-name">{name}{s ? <StreakBadge n={s.current} /> : null}{teacher ? <TeacherTag /> : null}</b>
            <i>{idLine} · {level}</i>
          </span>
        </div>
        <nav className="mm-grid" aria-label="Остальные разделы">
          {sheet.map((i) => (
            <Link key={i.tab} href={i.href} className={active === i.tab ? 'on' : undefined} aria-current={active === i.tab ? 'page' : undefined}>
              <Ico name={i.ico} /><span className="lbl">{i.label}</span><span className="cnt" aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
        <div className="mm-foot">
          <a href={MAIN} target="_blank" rel="noopener noreferrer">Сайт школы ↗</a>
          <a href="/api/auth/logout" className="mm-out"><ILogout />Выйти</a>
        </div>
      </MobileMenu>
    </div>
  );
}
