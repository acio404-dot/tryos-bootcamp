'use client';

import { useState } from 'react';
import TelegramButton from './TelegramButton';

export default function LoginForm({ google, tgBot, initialError }: { google: boolean; tgBot: string; initialError: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [v, setV] = useState({ username: '', password: '', name: '' });
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не получилось. Попробуй ещё раз');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось. Попробуй ещё раз');
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>{mode === 'login' ? 'Вход в TR-YÖS Bootcamp' : 'Регистрация'}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {mode === 'login' ? 'Войди, чтобы увидеть курсы, расписание и прогресс.' : 'Аккаунт бесплатный. ID ученика можно привязать потом.'}
      </p>

      <div className="auth-tabs" role="tablist">
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
        <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
      </div>

      <form className="form" onSubmit={submit}>
        {mode === 'register' ? (
          <div className="field">
            <label htmlFor="f-name">Имя и фамилия</label>
            <input id="f-name" className="input" autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="f-user">Логин</label>
          <input id="f-user" className="input" autoComplete="username" autoCapitalize="none" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} />
          {mode === 'register' ? <small>Латинские буквы, цифры, точка, дефис, подчёркивание.</small> : null}
        </div>
        <div className="field">
          <label htmlFor="f-pass">Пароль</label>
          <input id="f-pass" type="password" className="input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          {mode === 'register' ? <small>Не короче 8 символов.</small> : null}
        </div>
        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>

      {google || tgBot ? (
        <>
          <div className="or">или</div>
          <div className="social">
            {google ? (
              <a className="btn btn-google" href="/api/auth/google">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Войти через Google
              </a>
            ) : null}
            {tgBot ? <TelegramButton bot={tgBot} /> : null}
          </div>
        </>
      ) : null}

      <p className="auth-note">Забыл пароль? Напиши в школу — администратор поможет восстановить доступ.</p>
    </div>
  );
}
