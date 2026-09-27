'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { linkStudentId } from '@/lib/actions';

/* Привязка ID ученика (курсы, расписание, баллы) или ID учителя (TZT-…, кабинет учителя). */
export default function LinkIdForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    start(async () => {
      const r = await linkStudentId(code);
      if (r.error) setError(r.error);
      else if (/^\s*TZT/i.test(code)) router.push('/teach');
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="form" style={compact ? { gap: 8, minWidth: 260 } : undefined}>
      <div className="row" style={{ alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: '1 1 180px', textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          placeholder="TZ-1234-ABCD"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          aria-label="ID ученика"
        />
        <button className="btn btn-primary" disabled={pending || code.trim().length < 6}>
          {pending ? 'Проверяю…' : 'Привязать'}
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
    </form>
  );
}
