'use client';

import { useState } from 'react';

export interface ReviewItem {
  n: number;
  id: string;
  topicLabel: string;
  section: string;
  text: string;
  options: string[];
  figure?: string;
  explanation: string;
  correct: number;
  chosen: number | null;
  state: 'ok' | 'bad' | 'blank';
}

const WORD: Record<string, string> = { ok: 'верно', bad: 'ошибка', blank: 'пропуск' };

/* Разбор варианта: сетка номеров сверху, под ней раскрытая задача. */
export default function ExamReview({ items, letters }: { items: ReviewItem[]; letters: string }) {
  const firstBad = items.findIndex((x) => x.state !== 'ok');
  const [open, setOpen] = useState(firstBad < 0 ? 0 : firstBad);
  const [filter, setFilter] = useState<'all' | 'bad'>(firstBad < 0 ? 'all' : 'bad');

  const shown = filter === 'all' ? items : items.filter((x) => x.state !== 'ok');
  const cur = items[open];

  return (
    <>
      <div className="rev-tabs">
        <button type="button" className={filter === 'bad' ? 'on' : undefined} onClick={() => setFilter('bad')}>
          Ошибки и пропуски ({items.filter((x) => x.state !== 'ok').length})
        </button>
        <button type="button" className={filter === 'all' ? 'on' : undefined} onClick={() => setFilter('all')}>
          Все задачи ({items.length})
        </button>
      </div>

      <div className="map">
        {shown.map((x) => (
          <button key={x.id} type="button"
            className={`mapb ${x.state}${x.n - 1 === open ? ' cur' : ''}`}
            onClick={() => setOpen(x.n - 1)}>{x.n}</button>
        ))}
      </div>

      {cur ? (
        <div className="qcard mt">
          <div className="qtag">
            Задача {cur.n} · {cur.topicLabel} · <span className={`st ${cur.state}`}>{WORD[cur.state]}</span>
          </div>
          <div className="qtext" dangerouslySetInnerHTML={{ __html: cur.text }} />
          {cur.figure ? <div className="qfig" dangerouslySetInnerHTML={{ __html: cur.figure }} /> : null}
          <div className="qopts">
            {cur.options.map((o, k) => {
              let cls = 'qopt';
              if (k === cur.correct) cls += ' ok';
              else if (k === cur.chosen) cls += ' bad';
              else cls += ' dim';
              return (
                <div key={k} className={cls}>
                  <span className="ql">{letters[k]}</span>
                  <span className="qo">{o}</span>
                  {k === cur.correct ? <em className="qmark">правильный</em> : null}
                  {k === cur.chosen && k !== cur.correct ? <em className="qmark">твой ответ</em> : null}
                </div>
              );
            })}
          </div>
          <div className="qexp">
            <b>Разбор</b>
            <div dangerouslySetInnerHTML={{ __html: cur.explanation }} />
          </div>
        </div>
      ) : null}
    </>
  );
}
