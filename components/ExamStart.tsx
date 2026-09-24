'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormatSpec } from '@/lib/bank-types';
import { hhmm } from '@/lib/bank-types';

/** Карточки форматов: клик — создаём вариант на сервере и уходим решать. */
export default function ExamStart({
  formats, locked,
}: {
  formats: FormatSpec[];
  /** Форматы, закрытые уровнем доступа. */
  locked: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const start = async (key: string) => {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      const res = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', format: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось начать');
      router.push(`/exam/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать');
      setBusy('');
    }
  };

  return (
    <>
      <div className="fmt-grid">
        {formats.map((f) => {
          const off = locked.includes(f.key);
          const n = f.iq + f.math;
          return (
            <div className={`fmt${off ? ' off' : ''}`} key={f.key}>
              <div className="fmt-h">
                <b>{f.title}</b>
                <span className="st">{n} задач · {hhmm(f.minutes)}</span>
              </div>
              <p>{f.note}</p>
              <div className="fmt-mix">
                {f.iq ? <span>Логика · {f.iq}</span> : null}
                {f.math ? <span>Математика · {f.math}</span> : null}
              </div>
              {off ? (
                <span className="fmt-lock">Формат открывает школа</span>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => start(f.key)}>
                  {busy === f.key ? 'Собираю вариант…' : 'Начать'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error ? <p className="qerr">{error}</p> : null}
    </>
  );
}
