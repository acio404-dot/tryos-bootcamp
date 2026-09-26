import Link from 'next/link';
import { isAdmin, type User } from '@/lib/auth';
import type { Student } from '@/lib/data';
import { initials } from '@/lib/format';
import { streakOf, type StreakInfo } from '@/lib/streak';
import StreakBadge from './StreakBadge';
import StreakCelebrate from './StreakCelebrate';
import { IBook, ICal, IChart, ICheck, IFlame, IGear, IHome, IPlay, IShield, ITarget } from './icons';

export type Tab = 'home' | 'exam' | 'trainer' | 'survival' | 'courses' | 'schedule' | 'progress' | 'settings' | 'admin';

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
  const s = streak ?? await streakOf(user.id).catch(() => null);
  const admin = isAdmin(user);
  const level = student ? (student.access?.level === 'partial' ? 'Частичный доступ' : 'Полный доступ') : 'Без ID ученика';
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
  if (admin) nav.push(['admin', '/admin', 'Админка', IShield]);
  // Внизу на телефоне помещается пять кнопок — самые частые.
  const MOB: Tab[] = ['home', 'exam', 'trainer', 'progress', 'settings'];

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
            <span><b className="me-name">{user.name || 'Ученик'}{s ? <StreakBadge n={s.current} /> : null}</b><i>{student ? `ID ${student.id}` : user.username ? `@${user.username}` : 'ID не привязан'}</i></span>
          </div>
          <span className="access">{level}</span>
          <a href="/api/auth/logout">Выйти</a>
        </div>
      </aside>

      <main className="main">
        <div className="mob-head">
          <Brand />
          <Link className="ava ava-streak" href="/settings" aria-label="Настройки">
            {initials(user.name)}
            {s ? <StreakBadge n={s.current} /> : null}
          </Link>
        </div>
        {children}
      </main>
      {s ? <StreakCelebrate current={s.current} today={s.today} date={s.date} /> : null}

      <nav className="tabbar" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {nav.filter(([k]) => MOB.includes(k)).map(([k, href, label, Icon]) => (
          <Link key={k} href={href} className={active === k ? 'on' : undefined}><Icon />{label === 'Настройки' ? 'Ещё' : label}</Link>
        ))}
      </nav>
    </div>
  );
}
