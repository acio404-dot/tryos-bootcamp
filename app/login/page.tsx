import Link from 'next/link';
import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import LoginForm from '@/components/LoginForm';
import { Nur } from '@/components/Nur';
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
        <Brand anim href="https://www.tryoszone.com" />
        <div>
          <div className="auth-nur">
            <Nur mood="default" width={112} />
            <p className="say" style={{ margin: 0 }}>Я свечу, ты решаешь. Hadi!</p>
          </div>
          <h1>Подготовка к <span className="nw">TR-YÖS</span> <em>каждый день</em></h1>
          <p>TR-YÖS Bootcamp — платформа подготовки к экзамену от школы TR-YÖS Zone.</p>
          <ul className="auth-list">
            <li>Тренажёр по всем темам экзамена с разбором каждой задачи</li>
            <li>Пробные экзамены с таймером и баллом 0–500</li>
            <li>Режим выживания: задачи на время и три лампочки</li>
            <li>Курсы, группа, расписание и оценки преподавателей</li>
          </ul>
        </div>
        <p className="auth-foot">
          © TR-YÖS Zone · <a href="https://www.tryoszone.com">tryoszone.com</a>
          {' · '}<Link href="/privacy">Конфиденциальность</Link>
          {' · '}<Link href="/terms">Условия</Link>
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
