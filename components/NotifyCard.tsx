'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setNotify, tgConnectLink, tgDisconnect, tgTest, type NotifyResult } from '@/lib/notify-actions';
import type { NotifyKind } from '@/lib/reminders';

/* Напоминания в Telegram: подключить бота, выбрать напоминания, проверить. */
export default function NotifyCard({
  ready, connected, viaLogin, prefs, items,
}: {
  ready: boolean;
  /** Боту есть куда писать: чат после /start или вход через Telegram. */
  connected: boolean;
  /** Подключено только входом через Telegram (без /start в боте). */
  viaLogin: boolean;
  prefs: Partial<Record<NotifyKind, boolean>>;
  items: { key: NotifyKind; label: string; hint: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [waiting, setWaiting] = useState(false);

  const run = (fn: () => Promise<NotifyResult>, then?: (r: NotifyResult) => void) => {
    setMsg({});
    start(async () => {
      const r = await fn();
      if (r.error) { setMsg({ err: r.error }); return; }
      then?.(r);
      if (r.text) setMsg({ ok: r.text });
      router.refresh();
    });
  };

  const connect = () => run(tgConnectLink, (r) => {
    if (r.url) {
      window.open(r.url, '_blank', 'noopener');
      setWaiting(true);
    }
  });

  if (!ready) {
    return <p className="muted" style={{ margin: 0 }}>Скоро: школа подключает бота для напоминаний.</p>;
  }

  if (!connected) {
    return (
      <div className="nt">
        <p style={{ marginTop: 0 }}>
          Бот напомнит за час до занятия (сразу со ссылкой), за сутки до срока сдачи и вечером — если стрик вот-вот сгорит.
        </p>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={connect}>Подключить Telegram</button>
        {waiting ? (
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 0 }}>
            В Telegram нажми «Start» — бот ответит «Напоминания подключены».{' '}
            <button type="button" className="linklike" onClick={() => router.refresh()}>Я нажал(а) Start</button>
          </p>
        ) : null}
        {msg.err ? <p className="err">{msg.err}</p> : null}
      </div>
    );
  }

  return (
    <div className="nt">
      <p style={{ marginTop: 0 }}>
        <span className="pill on">подключено</span>
        {viaLogin ? <span className="muted" style={{ fontSize: 13 }}> · через вход Telegram</span> : null}
      </p>
      <ul className="nt-list">
        {items.map((it) => {
          const on = prefs[it.key] !== false;
          return (
            <li key={it.key}>
              <label className="nt-row">
                <input type="checkbox" checked={on} disabled={pending} onChange={() => run(() => setNotify(it.key, !on))} />
                <span><b>{it.label}</b><i>{it.hint}</i></span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="row" style={{ alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(tgTest)}>Проверить</button>
        {viaLogin ? <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={connect}>Открыть бота</button> : null}
        <button type="button" className="linklike" disabled={pending}
          onClick={() => { if (confirm('Отключить все напоминания в Telegram?')) run(tgDisconnect); }}>Отключить</button>
      </div>
      {msg.ok ? <p className="okmsg" style={{ marginTop: 8 }}>{msg.ok}</p> : null}
      {msg.err ? <p className="err" style={{ marginTop: 8 }}>{msg.err}</p> : null}
    </div>
  );
}
