import Link from 'next/link';
import { TOTAL_TOPICS } from '@/lib/bank';
import { plural } from '@/lib/format';
import { Ico, ILock, type IcoName } from './icons';

const MODES: { href: string; key: string; ico: IcoName; title: string; text: string; meta: string }[] = [
  {
    href: '/survival', key: 'survival', ico: 'survival', title: 'Выживание',
    text: 'Свет отключили. Задачи без конца, 90 секунд на каждую и три лампочки.',
    meta: 'три лампочки',
  },
  {
    href: '/exam', key: 'exam', ico: 'exam', title: 'Пробники',
    text: 'Полный формат 80 задач за 100 минут, половина, быстрая диагностика и отдельные разделы.',
    meta: 'балл 0–500',
  },
  {
    href: '/trainer', key: 'trainer', ico: 'trainer', title: 'Тренажёр',
    text: 'Все темы экзамена: задача — ответ — разбор сразу. Без таймера.',
    meta: `${TOTAL_TOPICS} ${plural(TOTAL_TOPICS, 'тема', 'темы', 'тем')}`,
  },
  {
    href: '/mistakes', key: 'mistakes', ico: 'mistakes', title: 'Ошибки',
    text: 'Задачи, где последний ответ был неверным. Решишь правильно — уходит из списка.',
    meta: 'пока пусто',
  },
];

/** Четыре режима решения задач — вкладка «Режимы». */
export default function ModeCards({
  mistakes = 0, best = 0, score = null, lockedMistakes = false,
}: { mistakes?: number; best?: number; score?: number | null; lockedMistakes?: boolean }) {
  const note = (key: string, meta: string) => {
    if (key === 'survival' && best) return `рекорд ${best}`;
    if (key === 'exam' && score !== null) return `последний балл ${score}`;
    if (key === 'mistakes' && lockedMistakes) return <><ILock /> открывает школа</>;
    if (key === 'mistakes' && mistakes) return `${mistakes} ${plural(mistakes, 'задача ждёт', 'задачи ждут', 'задач ждут')}`;
    return meta;
  };
  return (
    <div className="modes">
      {MODES.map(({ href, key, ico, title, text, meta }) => (
        <Link className={`mode mode-${key}`} href={href} key={key}>
          <Ico name={ico} />
          {key === 'survival' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mode-art" src="/shadows/s-trapezoid.svg" alt="" width={132} height={121} />
          ) : null}
          <b>{title}</b>
          <i>{text}</i>
          <span className="mode-foot"><em>{note(key, meta)}</em></span>
        </Link>
      ))}
    </div>
  );
}
