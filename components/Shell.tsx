import Link from 'next/link';
import { isAdmin, type User } from '@/lib/auth';
import { teacherOfUser, type Student } from '@/lib/data';
import { initials } from '@/lib/format';
import { streakOf, type StreakInfo } from '@/lib/streak';
import StreakBadge from './StreakBadge';
import TeacherTag from './TeacherTag';
import StreakCelebrate from './StreakCelebrate';
import MobileMenu, { MenuButton } from './MobileMenu';
import { IBook, ICal, IChart, ICheck, IFlame, IGear, IGrid, IHome, ILogout, IPlay, IRedo, IShield, ITarget, IUsers } from './icons';

export type Tab = 'home' | 'practice' | 'exam' | 'trainer' | 'survival' | 'courses' | 'schedule' | 'progress' | 'settings' | 'admin' | 'teach';

const MAIN = 'https://www.tryoszone.com';

const Brand = () => (
  <Link className="brand" href="/">
    <span className="brand-mark"><img src="/logo.png" alt="TR-YÖS Zone" width={32} height={28} /></span>
    <span><b>TR-YÖS</b><span>Bootcamp</span></span>
  </Link>
);

/* Каркас кабинета: слева меню, на телефоне — нижняя панель. */
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
  // Стрик нужен на каждой странице: огонёк у имени и достижение, когда стрик продлился.
  const [s, teacher] = await Promise.all([
    streak ?? streakOf(user.id).catch(() => null),
    teacherOfUser(user.id).catch(() => null),
  ]);
  const admin = isAdmin(user);
  const level = student ? (student.access?.level === 'partial' ? 'Частичный доступ' : 'Полный доступ') : teacher ? 'Кабинет учителя' : 'Без ID ученика';
  const idLine = student ? `ID ${student.id}` : teacher ? `ID ${teacher.id}` : user.username ? `@${user.username}` : 'ID не привязан';
  const nav: [Tab, string, string, () => JSX.Element][] = [
    ['home', '/', 'Главная', IHome],
    ['exam', '/exam', 'Пробники', ITarget],
    ['trainer', '/trainer', 'Тренажёр', ICheck],
    ['survival', '/survival', 'Выживание', IFlame],
    ['progress', '/progress', 'Прогресс', IChart],
    ['courses', '/courses', 'Мои курсы', IBook],
    ['schedule', '/schedule', 'Расписание', ICal],
    ['settings', '/settings', 'Настройки', IGear],
  ];
  // Учитель: его кабинет первым пунктом. Все режимы решения задач ему открыты;
  // если он не ученик, разделы про курсы и расписание ученика не нужны.
  if (teacher) {
    if (student) nav.splice(1, 0, ['teach', '/teach', 'Мои группы', IUsers]);
    else {
      nav.splice(0, nav.length,
        ['teach', '/teach', 'Мои группы', IUsers],
        ['exam', '/exam', 'Пробники', ITarget],
        ['trainer', '/trainer', 'Тренажёр', ICheck],
        ['survival', '/survival', 'Выживание', IFlame],
        ['progress', '/progress', 'Прогресс', IChart],
        ['settings', '/settings', 'Настройки', IGear]);
    }
  }
  if (admin) nav.push(['admin', '/admin', 'Админка', IShield]);
  // Телефон: внизу пять вкладок — главная, расписание, «Решать» (все режимы), прогресс и меню со всем остальным.
  const practiceTabs: Tab[] = ['practice', 'exam', 'trainer', 'survival'];
  const tabs: [string, string, () => JSX.Element, boolean][] = teacher && !student
    ? [
      ['/teach', 'Группы', IUsers, active === 'teach'],
      ['/practice', 'Решать', ITarget, practiceTabs.includes(active)],
      ['/progress', 'Прогресс', IChart, active === 'progress'],
    ]
    : [
      ['/', 'Главная', IHome, active === 'home'],
      teacher ? ['/teach', 'Группы', IUsers, active === 'teach'] : ['/schedule', 'Расписание', ICal, active === 'schedule'],
      ['/practice', 'Решать', ITarget, practiceTabs.includes(active)],
      ['/progress', 'Прогресс', IChart, active === 'progress'],
    ];
  const menuItems: [string, string, () => JSX.Element][] = [
    ['/exam', 'Пробники', ITarget],
    ['/trainer', 'Тренажёр', ICheck],
    ['/mistakes', 'Ошибки', IRedo],
    ['/survival', 'Выживание', IFlame],
    ['/schedule', 'Расписание', ICal],
    ['/courses', 'Мои курсы', IBook],
    ['/progress', 'Прогресс', IChart],
    ['/settings', 'Настройки', IGear],
  ];
  if (teacher) menuItems.unshift(['/teach', 'Мои группы', IUsers]);
  if (admin) menuItems.push(['/admin', 'Админка', IShield]);

  return (
    <div className="app">
      <aside className="side">
        <Brand />
        <nav className="nav">
          {nav.map(([k, href, label, Icon]) => (
            <Link key={k} href={href} className={active === k ? 'on' : undefined}><Icon />{label}</Link>
          ))}
          <div className="nav-lab">На сайте</div>
          <a href={MAIN} target="_blank" rel="noopener noreferrer"><IPlay />Сайт школы<span className="ext">↗</span></a>
        </nav>
        <div className="me">
          <div className="me-top">
            <span className="ava">{initials(user.name)}</span>
            <span><b className="me-name">{user.name || 'Ученик'}{s ? <StreakBadge n={s.current} /> : null}{teacher ? <TeacherTag /> : null}</b><i>{idLine}</i></span>
          </div>
          <span className="access">{level}</span>
          <a href="/api/auth/logout">Выйти</a>
        </div>
      </aside>

      <main className="main">
        <div className="mob-head">
          <Brand />
          <MenuButton className="ava ava-streak" label="Меню и профиль">
            {initials(user.name)}
            {s ? <StreakBadge n={s.current} /> : null}
          </MenuButton>
        </div>
        {children}
      </main>
      {s ? <StreakCelebrate current={s.current} today={s.today} date={s.date} /> : null}

      <nav className="tabbar" aria-label="Разделы">
        {tabs.map(([href, label, Icon, on]) => (
          <Link key={href} href={href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}><Icon />{label}</Link>
        ))}
        <MenuButton className={['courses', 'settings', 'admin', 'mistakes'].includes(active) ? 'on' : undefined} label="Меню: все разделы">
          <IGrid />Меню
        </MenuButton>
      </nav>

      <MobileMenu>
        <div className="mm-me">
          <span className="ava">{initials(user.name)}</span>
          <span className="mm-who">
            <b className="me-name">{user.name || 'Ученик'}{s ? <StreakBadge n={s.current} /> : null}{teacher ? <TeacherTag /> : null}</b>
            <i>{idLine} · {level}</i>
          </span>
        </div>
        <nav className="mm-grid" aria-label="Все разделы">
          {menuItems.map(([href, label, Icon]) => (
            <Link key={href} href={href} className={nav.some(([k, h]) => h === href && k === active) ? 'on' : undefined}><Icon />{label}</Link>
          ))}
        </nav>
        <div className="mm-foot">
          <a href={MAIN} target="_blank" rel="noopener noreferrer"><IPlay />Сайт школы ↗</a>
          <a href="/api/auth/logout" className="mm-out"><ILogout />Выйти</a>
        </div>
      </MobileMenu>
    </div>
  );
}
