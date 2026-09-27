import Link from 'next/link';

export const CONTACT_TG = 'https://t.me/tryos_zone';
export const UPDATED = { ru: '27 сентября 2026', en: 'September 27, 2026' };

export type Lang = 'ru' | 'en';
export const langOf = (v?: string): Lang => (v === 'en' ? 'en' : 'ru');

/*
 * Оформление юридических страниц (политика конфиденциальности, условия).
 * Они открыты без входа: ссылки на них указаны в настройках входа через
 * Google и Telegram.
 */
export default function LegalPage({
  lang, doc, title, children,
}: {
  lang: Lang;
  doc: 'privacy' | 'terms';
  title: string;
  children: React.ReactNode;
}) {
  const other = doc === 'privacy' ? 'terms' : 'privacy';
  const otherTitle = lang === 'en'
    ? (other === 'terms' ? 'Terms of Service' : 'Privacy Policy')
    : (other === 'terms' ? 'Условия использования' : 'Политика конфиденциальности');

  return (
    <div className="legal" lang={lang}>
      <header className="legal-head">
        <Link className="brand" href="/login">
          <span className="brand-mark"><img src="/logo.png" alt="TR-YÖS Zone" width={32} height={28} /></span>
          <span><b>TR-YÖS</b><span>Bootcamp</span></span>
        </Link>
        <nav className="seg" aria-label={lang === 'en' ? 'Language' : 'Язык'}>
          <Link href={`/${doc}`} className={lang === 'ru' ? 'on' : ''} hrefLang="ru">Русский</Link>
          <Link href={`/${doc}?lang=en`} className={lang === 'en' ? 'on' : ''} hrefLang="en">English</Link>
        </nav>
      </header>

      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-date">{lang === 'en' ? `Last updated: ${UPDATED.en}` : `Обновлено ${UPDATED.ru}`}</p>
        {children}
      </article>

      <footer className="legal-foot">
        <Link href={`/${other}${lang === 'en' ? '?lang=en' : ''}`}>{otherTitle}</Link>
        <Link href="/login">{lang === 'en' ? 'Sign in' : 'Вход'}</Link>
        <a href="https://www.tryoszone.com">tryoszone.com</a>
        <span>© TR-YÖS Zone</span>
      </footer>
    </div>
  );
}
