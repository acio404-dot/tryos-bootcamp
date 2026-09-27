import { SECTION_RU, ScoreChart, tone } from './widgets';
import type { TestRow, TopicStat } from '@/lib/data';
import { dateRu, plural } from '@/lib/format';

/*
 * Блоки прогресса, общие для «Прогресса» ученика и его статистики у
 * учителя и админа: пробные тесты и точность по темам.
 */

const BAR: Record<string, string> = { good: 'var(--green)', mid: 'var(--amber)', low: 'var(--red)' };
const WORD: Record<string, string> = { good: 'уверенно', mid: 'средне', low: 'слабо' };

export function TestsBlock({ tests, target, limit = 15 }: { tests: TestRow[]; target: number | null; limit?: number }) {
  if (!tests.length) return <ScoreChart tests={[]} target={null} />;
  return (
    <>
      <ScoreChart tests={tests} target={target} />
      <table className="tbl mt">
        <thead><tr><th>Дата</th><th>Тест</th><th className="num hide-m">Верно / неверно</th><th className="num">Балл</th></tr></thead>
        <tbody>
          {tests.slice(0, limit).map((t, i) => (
            <tr key={i}>
              <td>{dateRu(t.at, false)}</td>
              <td>{t.title}{t.source === 'offline' ? <span className="off-tag" title={t.teacher ? `Балл внёс: ${t.teacher}` : 'Балл внесла школа'}>очно</span> : null}</td>
              <td className="num hide-m">{t.total ? `${t.correct} / ${t.wrong}` : '—'}</td>
              <td className="num score">{t.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Точность по темам, по разделам. weakFirst — слабые темы сверху (для учителя). */
export function TopicsBlock({ topics, weakFirst = false, empty }: { topics: TopicStat[]; weakFirst?: boolean; empty: React.ReactNode }) {
  const bySection: Record<string, TopicStat[]> = {};
  for (const t of topics) (bySection[t.section || 'other'] ||= []).push(t);
  const order = ['iq', 'algebra', 'geometry', 'other'].filter((k) => bySection[k]?.length);
  if (!order.length) return <>{empty}</>;
  const pctOf = (t: TopicStat) => Math.round((t.ok / t.total) * 100);
  return (
    <div className="topics">
      {order.map((sec) => (
        <div className="topic-sec" key={sec}>
          <h3>{SECTION_RU[sec] || 'Другое'}</h3>
          {(weakFirst ? [...bySection[sec]].sort((a, b) => pctOf(a) - pctOf(b) || b.total - a.total) : bySection[sec]).map((t) => {
            const pct = pctOf(t);
            const k = tone(pct);
            return (
              <div className="topic" key={t.topic}>
                <span><b>{t.label}</b><i>{t.total} {plural(t.total, 'задача', 'задачи', 'задач')} · {WORD[k]}</i></span>
                <div className="hbar"><i style={{ width: `${pct}%`, background: BAR[k] }} /></div>
                <span className="v">{pct} %</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
