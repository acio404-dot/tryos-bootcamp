import Link from 'next/link';
import Shell from '@/components/Shell';
import LinkIdForm from '@/components/LinkIdForm';
import TelegramButton from '@/components/TelegramButton';
import { PasswordForm, ProfileForm } from '@/components/SettingsForms';
import { isAdmin, requireUser } from '@/lib/auth';
import { SECTIONS, can, examOf, studentOfUser } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Настройки' };

const ERRORS: Record<string, string> = {
  'google-taken': 'Этот Google-аккаунт уже привязан к другому ученику.',
  'telegram-taken': 'Этот Telegram уже привязан к другому ученику.',
};

export default async function Settings({ searchParams }: { searchParams: { linked?: string; error?: string } }) {
  const user = await requireUser();
  const student = await studentOfUser(user.id);
  const exam = examOf(user, student);
  const googleOn = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const tgBot = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_NAME : '';

  return (
    <Shell user={user} student={student} active="settings">
      <div className="top"><div><h1>Настройки</h1><p>Профиль, экзамен, ID ученика и способы входа.</p></div></div>

      {searchParams?.linked ? <p className="flash ok">{searchParams.linked === 'google' ? 'Google' : 'Telegram'} привязан — теперь можно входить и так.</p> : null}
      {searchParams?.error && ERRORS[searchParams.error] ? <p className="flash err">{ERRORS[searchParams.error]}</p> : null}

      <div className="grid g-2e">
        <div className="card">
          <div className="card-head"><h2>Профиль и экзамен</h2></div>
          <ProfileForm
            name={user.name}
            examName={user.exam_name || ''}
            examDate={user.exam_date || ''}
            examFromSchool={Boolean(exam?.fromSchool)}
          />
        </div>

        <div className="card">
          <div className="card-head"><h2>ID ученика</h2></div>
          {student ? (
            <>
              <p style={{ margin: 0 }}>Привязан ID <span className="code">{student.id}</span></p>
              <ul className="mini-list">
                {SECTIONS.map((s) => (
                  <li key={s.key}><span>{s.label}</span><span className={`pill ${can(student.access, s.key) ? 'on' : ''}`}>{can(student.access, s.key) ? 'открыто' : 'закрыто'}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>ID выдаёт школа. С ним откроются курсы, расписание и оценки преподавателей.</p>
              <LinkIdForm />
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h2>Логин и пароль</h2></div>
          <PasswordForm username={user.username} hasPassword={Boolean(user.pass_hash)} />
        </div>

        <div className="card">
          <div className="card-head"><h2>Другие способы входа</h2></div>
          <ul className="mini-list" style={{ marginTop: 0 }}>
            <li>
              <span>Google{user.email ? ` · ${user.email}` : ''}</span>
              {user.google_sub ? <span className="pill on">привязан</span>
                : googleOn ? <a className="linklike" href="/api/auth/google">Привязать</a>
                : <span className="pill">скоро</span>}
            </li>
            <li>
              <span>Telegram{user.tg_username ? ` · @${user.tg_username}` : ''}</span>
              {user.tg_id ? <span className="pill on">привязан</span> : tgBot ? null : <span className="pill">скоро</span>}
            </li>
          </ul>
          {!user.tg_id && tgBot ? <div style={{ marginTop: 12 }}><TelegramButton bot={tgBot} /></div> : null}
          <div className="row" style={{ marginTop: 18 }}>
            {isAdmin(user) ? <Link className="btn btn-dark" href="/admin">Админка</Link> : null}
            <a className="btn btn-danger" href="/api/auth/logout">Выйти</a>
          </div>
        </div>
      </div>
    </Shell>
  );
}
