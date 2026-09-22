'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { savePassword, saveProfile } from '@/lib/actions';

export function ProfileForm({
  name, examName, examDate, examFromSchool,
}: {
  name: string;
  examName: string;
  examDate: string;
  examFromSchool: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState({ name, examName: examName || 'TR-YÖS', examDate });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({});
    start(async () => {
      const r = await saveProfile(v);
      if (r.error) setMsg({ err: r.error });
      else { setMsg({ ok: 'Сохранено' }); router.refresh(); }
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="pf-name">Имя и фамилия</label>
        <input id="pf-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      {examFromSchool ? (
        <p className="muted" style={{ margin: 0 }}>Экзамен, на который ты записан, указала школа — он показан на главной.</p>
      ) : (
        <div className="fields-2">
          <div className="field">
            <label htmlFor="pf-exam">Экзамен</label>
            <input id="pf-exam" className="input" value={v.examName} onChange={(e) => setV({ ...v, examName: e.target.value })} placeholder="TR-YÖS 2027/1" />
          </div>
          <div className="field">
            <label htmlFor="pf-date">Дата экзамена</label>
            <input id="pf-date" type="date" className="input" value={v.examDate} onChange={(e) => setV({ ...v, examDate: e.target.value })} />
          </div>
        </div>
      )}
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить'}</button>
        {msg.ok ? <p className="okmsg">{msg.ok}</p> : null}
        {msg.err ? <p className="err">{msg.err}</p> : null}
      </div>
    </form>
  );
}

export function PasswordForm({ username, hasPassword }: { username: string | null; hasPassword: boolean }) {
  const [v, setV] = useState({ username: username || '', current: '', next: '' });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({});
    start(async () => {
      const r = await savePassword(v);
      if (r.error) setMsg({ err: r.error });
      else { setMsg({ ok: hasPassword ? 'Пароль изменён' : 'Логин и пароль сохранены' }); setV({ ...v, current: '', next: '' }); router.refresh(); }
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      {username ? (
        <p className="muted" style={{ margin: 0 }}>Логин: <span className="code">{username}</span></p>
      ) : (
        <div className="field">
          <label htmlFor="pw-user">Придумай логин</label>
          <input id="pw-user" className="input" autoComplete="username" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} placeholder="например, aziz_k" />
          <small>Латинские буквы, цифры, точка, дефис, подчёркивание.</small>
        </div>
      )}
      <div className="fields-2">
        {hasPassword ? (
          <div className="field">
            <label htmlFor="pw-cur">Текущий пароль</label>
            <input id="pw-cur" type="password" className="input" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="pw-new">{hasPassword ? 'Новый пароль' : 'Пароль'}</label>
          <input id="pw-new" type="password" className="input" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
          <small>Не короче 8 символов.</small>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn btn-dark" disabled={pending}>{pending ? 'Сохраняю…' : hasPassword ? 'Сменить пароль' : 'Сохранить'}</button>
        {msg.ok ? <p className="okmsg">{msg.ok}</p> : null}
        {msg.err ? <p className="err">{msg.err}</p> : null}
      </div>
    </form>
  );
}
