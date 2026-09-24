'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormatSpec } from '@/lib/bank-types';
import { hhmm } from '@/lib/bank-types';
import { IArrow, IBolt, IBrain, IClock, ILock, ISigma, ITarget } from './icons';

const ICON: Record<string, () => JSX.Element> = {
  full: ITarget,
  half: IClock,
  quick: IBolt,
  iq: IBrain,
  math: ISigma,
};

/** Карточки форматов: клик — собираем вариант на сервере и уходим решать. */
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
          const Icon = ICON[f.key] || ITarget;
          const iqPct = n ? Math.round((f.iq / n) * 100) : 0;
          return (
            <div className={`fmt fmt-${f.key}${off ? ' off' : ''}`} key={f.key}>
              <span className="fmt-ico"><Icon /></span>
              <b className="fmt-title">{f.title}</b>

              <div className="fmt-nums">
                <span><b>{n}</b><i>задач</i></span>
                <span><b>{hhmm(f.minutes)}</b><i>на всё</i></span>
                <span><b>{Math.round((f.minutes * 60) / n)} с</b><i>на задачу</i></span>
              </div>

              <div className="fmt-bar" aria-hidden="true">
                <i style={{ width: `${iqPct}%` }} />
              </div>
              <div className="fmt-mix">
                {f.iq ? <span className="mix-iq">Логика · {f.iq}</span> : null}
                {f.math ? <span className="mix-ma">Математика · {f.math}</span> : null}
              </div>

              <p>{f.note}</p>

              {off ? (
                <span className="fmt-lock"><ILock />Открывает школа</span>
              ) : (
                <button type="button" className="btn btn-primary fmt-go" disabled={!!busy}
                  onClick={() => start(f.key)}>
                  {busy === f.key ? 'Собираю вариант…' : <>Начать <IArrow /></>}
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
