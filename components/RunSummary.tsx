import { plural } from '@/lib/format';
import { KIND_LABEL, type RunSummary } from '@/lib/set-types';

const MARK_TEXT = { ok: 'с первой попытки', second: 'со второй попытки', wrong: 'ошибка' } as const;

/* Итоги смены или домашки: четыре числа и список задач с отметками. */
export function RunStats({ s }: { s: RunSummary }) {
  return (
      <div className="rs-stats">
        <div className="rs-stat lamp"><b>+{s.light}</b><span>света</span></div>
        <div className="rs-stat"><b>{s.ok2}</b><span>{plural(s.ok2, 'задача', 'задачи', 'задач')} со второй попытки</span></div>
        <div className="rs-stat"><b>{s.fast}</b><span>быстрее 75 секунд</span></div>
        <div className="rs-stat"><b>{s.minutes}</b><span>{plural(s.minutes, 'минута', 'минуты', 'минут')}</span></div>
      </div>
  );
}

export function RunList({ s, total }: { s: RunSummary; total: number }) {
  return (
      <ol className="rs-list" aria-label={`Задачи: ${total}`}>
        {s.tasks.map((t, i) => (
          <li key={i} className={t.mark || undefined}>
            <span className="rs-n">{i + 1}</span>
            <span className="rs-txt"><b>{t.label}</b><i>{KIND_LABEL[t.kind]}</i></span>
            <span className="rs-mark">{t.mark ? MARK_TEXT[t.mark] : 'не решена'}</span>
          </li>
        ))}
      </ol>
  );
}
