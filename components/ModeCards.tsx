import Link from 'next/link';
import { TOTAL_TOPICS } from '@/lib/bank';
import { IArrow, ICheck, IFlame, ILock, IRedo, ITarget } from './icons';

const topicsWord = (n: number) => {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'тема';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'темы';
  return 'тем';
};

const MODES = [
  {
    href: '/exam', key: 'exam', Icon: ITarget, title: 'Пробники',
    text: 'Полный формат 80 задач за 100 минут, половина, быстрая диагностика и отдельные разделы.',
    meta: 'балл 0–500',
  },
  {
    href: '/trainer', key: 'trainer', Icon: ICheck, title: 'Тренажёр по темам',
    text: 'Темы по учебникам Galata: задача — ответ — разбор сразу.',
    meta: `${TOTAL_TOPICS} ${topicsWord(TOTAL_TOPICS)}`,
  },
  {
    href: '/mistakes', key: 'mistakes', Icon: IRedo, title: 'Работа над ошибками',
    text: 'Задачи, где последний ответ был неверным. Решишь правильно — уходит из списка.',
    meta: 'по твоим промахам',
  },
  {
    href: '/survival', key: 'survival', Icon: IFlame, title: 'Режим выживания',
    text: 'Задачи без конца, 90 секунд на каждую, три жизни. Лучшая серия — в таблицу лидеров школы.',
    meta: 'рекорд школы',
  },
];

/** Четыре режима тренажёра — главный вход в кабинет. */
export default function ModeCards({ mistakes = 0, best = 0, lockedMistakes = false }: { mistakes?: number; best?: number; lockedMistakes?: boolean }) {
  return (
    <div className="modes">
      {MODES.map(({ href, key, Icon, title, text, meta }) => (
        <Link className={`mode mode-${key}`} href={href} key={key}>
          <span className="mode-ico"><Icon /></span>
          <b>{title}</b>
          <i>{text}</i>
          <span className="mode-foot">
            <em>
              {key === 'mistakes' && lockedMistakes ? <><ILock /> открывает школа</> : null}
              {key === 'mistakes' && !lockedMistakes && mistakes ? `${mistakes} в работе` : null}
              {key === 'survival' && best ? `твой рекорд ${best}` : null}
              {(key !== 'mistakes' && key !== 'survival') || (key === 'mistakes' && !mistakes && !lockedMistakes) || (key === 'survival' && !best) ? meta : null}
            </em>
            <IArrow />
          </span>
        </Link>
      ))}
    </div>
  );
}
