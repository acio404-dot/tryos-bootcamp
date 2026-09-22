import Link from 'next/link';
import { isAdmin, type User } from '@/lib/auth';
import type { Student } from '@/lib/data';
import { initials } from '@/lib/format';
import { IBook, ICal, IChart, ICheck, IGear, IHome, IPlay, IShield } from './icons';

export type Tab = 'home' | 'courses' | 'schedule' | 'progress' | 'settings' | 'admin';

const MAIN = 'https://www.tryoszone.com';

const Brand = () => (
  <Link className="brand" href="/">
    <span className="brand-mark"><img src="/logo.png" alt="TR-YÖS Zone" width={32} height={28} /></span>
    <span><b>TR-YÖS</b><span>Bootcamp</span></span>
  </Link>
);

/* Каркас кабинета: слева меню, на телефоне — нижняя панель. */
export default function Shell({
  user, student, active, children,
}: {
  user: User;
  student: Student | null;
  active: Tab;
  children: React.ReactNode;
}) {
  const admin = isAdmin(user);
  const level = student ? (student.access?.level === 'partial' ? 'Частичный доступ' : 'Полный доступ') : 'Без ID ученика';
  const nav: [Tab, string, string, () => JSX.Element][] = [
    ['home', '/', 'Главная', IHome],
    ['courses', '/courses', 'Мои курсы', IBook],
    ['schedule', '/schedule', 'Расписание', ICal],
    ['progress', '/progress', 'Прогресс', IChart],
    ['settings', '/settings', 'Настройки', IGear],
  ];
  if (admin) nav.push(['admin', '/admin', 'Админка', IShield]);

  return (
    <div className="app">
      <aside className="side">
        <Brand />
        <nav className="nav">
          {nav.map(([k, href, label, Icon]) => (
            <Link key={k} href={href} className={active === k ? 'on' : undefined}><Icon />{label}</Link>
          ))}
          <div className="nav-lab">На сайте</div>
          <a href={`${MAIN}/practice`} target="_blank" rel="noopener noreferrer"><ICheck />Тренажёр<span className="ext">↗</span></a>
          <a href={`${MAIN}/test`} target="_blank" rel="noopener noreferrer"><IPlay />Пробный тест<span className="ext">↗</span></a>
        </nav>
        <div className="me">
          <div className="me-top">
            <span className="ava">{initials(user.name)}</span>
            <span><b>{user.name || 'Ученик'}</b><i>{student ? `ID ${student.id}` : user.username ? `@${user.username}` : 'ID не привязан'}</i></span>
          </div>
          <span className="access">{level}</span>
          <a href="/api/auth/logout">Выйти</a>
        </div>
      </aside>

      <main className="main">
        <div className="mob-head">
          <Brand />
          <Link className="ava" href="/settings" aria-label="Настройки">{initials(user.name)}</Link>
        </div>
        {children}
      </main>

      <nav className="tabbar" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {nav.filter(([k]) => k !== 'admin').map(([k, href, label, Icon]) => (
          <Link key={k} href={href} className={active === k ? 'on' : undefined}><Icon />{label === 'Мои курсы' ? 'Курсы' : label === 'Настройки' ? 'Ещё' : label}</Link>
        ))}
      </nav>
    </div>
  );
}
