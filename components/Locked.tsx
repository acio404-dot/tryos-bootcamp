import Link from 'next/link';
import { ILock } from './icons';

const TG = 'https://t.me/tryos_zone';

/* Раздел закрыт для этого аккаунта: объяснить, что внутри и как открыть. */
export default function Locked({ title, text, hasId }: { title: string; text: string; hasId: boolean }) {
  return (
    <div className="empty-card locked-card">
      <span className="locked-ico"><ILock /></span>
      <h2>{title}</h2>
      <p>{text}</p>
      <p className="muted">
        {hasId
          ? 'Этот раздел открывает школа. Напиши нам в Telegram — подключим.'
          : 'Раздел открыт ученикам школы. Если у тебя есть ID ученика, привяжи его в настройках.'}
      </p>
      <div className="modal-act" style={{ justifyContent: 'center' }}>
        {hasId ? null : <Link className="btn btn-primary" href="/settings">Привязать ID ученика</Link>}
        <a className={`btn ${hasId ? 'btn-primary' : 'btn-ghost'}`} href={TG} target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
        <Link className="btn btn-ghost" href="/survival">Режим выживания</Link>
      </div>
    </div>
  );
}
