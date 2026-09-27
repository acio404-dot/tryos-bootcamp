import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { currentUser } from '@/lib/auth';
import { hasDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Вход' };

export default async function Login({ searchParams }: { searchParams: { error?: string } }) {
  if (await currentUser()) redirect('/');
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const tgBot = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_NAME || '' : '';

  return (
    <div className="auth">
      <aside className="auth-side">
        <a className="brand" href="https://www.tryoszone.com">
          <span className="brand-mark"><img src="/logo.png" alt="TR-YÖS Zone" width={32} height={28} /></span>
          <span><b>TR-YÖS</b><span>Bootcamp</span></span>
        </a>
        <div>
          <h1>Твоя подготовка к TR-YÖS — в одном месте</h1>
          <p>Личный кабинет учеников TR-YÖS Zone.</p>
          <ul className="auth-list">
            <li>Сколько дней осталось до твоего экзамена</li>
            <li>Курсы, группа и расписание занятий</li>
            <li>Прогресс по задачам и баллы за пробные тесты</li>
            <li>Оценки преподавателей</li>
          </ul>
        </div>
        <p style={{ fontSize: 13 }}>
          © TR-YÖS Zone · <a href="https://www.tryoszone.com" style={{ color: 'var(--teal-2)' }}>tryoszone.com</a>
          {' · '}<Link href="/privacy" style={{ color: 'var(--teal-2)' }}>Конфиденциальность</Link>
          {' · '}<Link href="/terms" style={{ color: 'var(--teal-2)' }}>Условия</Link>
        </p>
      </aside>
      <main className="auth-main">
        {hasDb() ? (
          <>
            <LoginForm google={google} tgBot={tgBot} initialError={searchParams?.error || ''} />
            <p className="auth-legal">
              Входя, ты соглашаешься с <Link href="/terms">условиями использования</Link> и{' '}
              <Link href="/privacy">политикой конфиденциальности</Link>.
            </p>
          </>
        ) : (
          <div className="auth-card">
            <h2>Почти готово</h2>
            <p className="muted">Bootcamp запущен, но база данных ещё не подключена. Подключите базу Neon в Vercel → Storage — вход заработает сразу.</p>
          </div>
        )}
      </main>
    </div>
  );
}
