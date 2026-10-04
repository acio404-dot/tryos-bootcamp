import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Caveat, JetBrains_Mono, Manrope, Unbounded } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import NavProgress from '@/components/NavProgress';
import './globals.css';

// Шрифты — внутри сайта (next/font), без запроса к Google при каждом открытии.
const manrope = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--f-text', display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800'], variable: '--f-display', display: 'swap' });
// Подписи и счётчики — моноширинным, реплики Nur — рукописным.
const mono = JetBrains_Mono({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['500', '700'], variable: '--f-mono', display: 'swap' });
const hand = Caveat({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['700'], variable: '--f-hand', display: 'swap' });

/* Версия значков: браузеры держат значок в кеше неделями; меняется рисунок — меняем номер. */
const V = '?v=3';
const TITLE = 'TR-YÖS Bootcamp — платформа подготовки к TR-YÖS';
const DESCRIPTION = 'Платформа подготовки к экзамену TR-YÖS от школы TR-YÖS Zone: 16 249 задач с разбором по 78 темам, пробные экзамены с баллом 0–500, режим выживания, расписание и прогресс.';

export const metadata: Metadata = {
  metadataBase: new URL('https://bootcamp.tryoszone.com'),
  applicationName: 'TR-YÖS Bootcamp',
  title: { default: TITLE, template: '%s · TR-YÖS Bootcamp' },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: `/favicon.ico${V}`, sizes: '48x48' },
      { url: `/icon.svg${V}`, type: 'image/svg+xml' },
      { url: `/icon-96.png${V}`, type: 'image/png', sizes: '96x96' },
      { url: `/icon-192.png${V}`, type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: `/apple-touch-icon.png${V}`, sizes: '180x180' }],
  },
  // превью ссылки в Telegram и WhatsApp: картинка, заголовок и описание
  openGraph: {
    type: 'website', siteName: 'TR-YÖS Bootcamp', locale: 'ru_RU', url: '/', title: TITLE, description: DESCRIPTION,
    images: [{ url: `/og.jpg${V}`, width: 1200, height: 630, alt: 'TR-YÖS Bootcamp' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`/og.jpg${V}`] },
  // название под значком на главном экране телефона
  appleWebApp: { capable: false, title: 'Bootcamp' },
  formatDetection: { telephone: false },
  // в поиске платформа не нужна: внутри данные учеников
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0b1730', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
