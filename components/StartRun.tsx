'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IArrow } from './icons';

/*
 * Кнопка «Начать смену» / «Начать домашку»: создаёт набор задач на сервере
 * и открывает экран задачи. to — куда перейти (с главной — на страницу смены);
 * без него страница просто обновляется и показывает первую задачу.
 */
export default function StartRun({
  action, hw, to, label, busyLabel = 'Собираю задачи…', className = 'btn btn-dark btn-lg',
}: {
  action: 'start-shift' | 'open-homework';
  hw?: string;
  to?: string;
  label: string;
  busyLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hw }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'Не получилось начать. Попробуй ещё раз.');
      if (to) router.push(to);
      router.refresh();
      // кнопка остаётся «занятой», пока страница не сменится
    } catch (e) {
      setError(e instanceof TypeError ? 'Нет связи. Проверь интернет и попробуй ещё раз.' : e instanceof Error ? e.message : 'Не получилось начать.');
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={go}>
        {busy ? busyLabel : <>{label} <IArrow /></>}
      </button>
      {error ? <span className="qerr" role="alert" style={{ margin: 0 }}>{error}</span> : null}
    </>
  );
}
