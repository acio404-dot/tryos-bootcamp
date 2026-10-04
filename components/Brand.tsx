import Link from 'next/link';

/*
 * Логотип TR-YÖS Bootcamp: тёмная версия для ночного фона, светлая — для бумаги.
 * anim — большой знак в две строки: лампа Nur загорается и гаснет (анимация внутри SVG,
 * цикл 7 с; при «уменьшить движение» горит ровно). Ему нужно место — от 180 px в ширину.
 */
export default function Brand({ href = '/', dark = false, stack = false, anim = false }: { href?: string; dark?: boolean; stack?: boolean; anim?: boolean }) {
  const src = anim ? '/logo-bootcamp-anim.svg' : stack ? '/logo-bootcamp-stack-dark.svg' : dark ? '/logo-bootcamp-dark.svg' : '/logo-bootcamp.svg';
  const [w, h] = anim ? [318, 140] : stack ? [227, 100] : [204, 40];
  const cls = anim ? 'brand brand-anim' : 'brand';
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="TR-YÖS Bootcamp" width={w} height={h} />
  );
  return /^https?:/.test(href)
    ? <a className={cls} href={href}>{img}</a>
    : <Link className={cls} href={href}>{img}</Link>;
}
