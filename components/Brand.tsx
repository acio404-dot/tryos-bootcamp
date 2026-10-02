import Link from 'next/link';

/* Логотип TR-YÖS Bootcamp: тёмная версия для ночного фона, светлая — для бумаги. */
export default function Brand({ href = '/', dark = false, stack = false }: { href?: string; dark?: boolean; stack?: boolean }) {
  const src = stack ? '/logo-bootcamp-stack-dark.svg' : dark ? '/logo-bootcamp-dark.svg' : '/logo-bootcamp.svg';
  const [w, h] = stack ? [227, 100] : [204, 40];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="TR-YÖS Bootcamp" width={w} height={h} />
  );
  return /^https?:/.test(href)
    ? <a className="brand" href={href}>{img}</a>
    : <Link className="brand" href={href}>{img}</Link>;
}
