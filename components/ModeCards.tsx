import Link from 'next/link';
import { IArrow, ICheck, IFlame, IRedo, ITarget } from './icons';

const MODES = [
  {
    href: '/exam', key: 'exam', Icon: ITarget, title: 'Пробники',
    text: 'Полный формат 80 задач за 100 минут, половина, быстрая диагностика и отдельные разделы.',
    meta: 'балл 0–500',
  },
  {
    href: '/trainer', key: 'trainer', Icon: ICheck, title: 'Тренажёр по темам',
    text: 'Темы по учебникам Galata: задача — ответ — разбор сразу.',
    meta: '82 темы',
  },
  {
    href: '/mistakes', key: 'mistakes', Icon: IRedo, title: 'Работа над ошибками',
    text: 'Задачи, где последний ответ был неверным. Решишь правильно — уходит из списка.',
    meta: 'по твоим промахам',
  },
  {
    href: '/survival', key: 'survival', Icon: IFlame, title: 'Режим выживания',
    text: 'Задачи без конца, три жизни, серия. Лучшая попадает в таблицу лидеров школы.',
    meta: 'рекорд школы',
  },
];

/** Четыре режима тренажёра — главный вход в кабинет. */
export default function ModeCards({ mistakes = 0, best = 0 }: { mistakes?: number; best?: number }) {
  return (
    <div className="modes">
      {MODES.map(({ href, key, Icon, title, text, meta }) => (
        <Link className={`mode mode-${key}`} href={href} key={key}>
          <span className="mode-ico"><Icon /></span>
          <b>{title}</b>
          <i>{text}</i>
          <span className="mode-foot">
            <em>
              {key === 'mistakes' && mistakes ? `${mistakes} в работе` : null}
              {key === 'survival' && best ? `твой рекорд ${best}` : null}
              {(key !== 'mistakes' && key !== 'survival') || (key === 'mistakes' && !mistakes) || (key === 'survival' && !best) ? meta : null}
            </em>
            <IArrow />
          </span>
        </Link>
      ))}
    </div>
  );
}
