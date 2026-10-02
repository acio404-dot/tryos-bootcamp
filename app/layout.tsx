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

export const metadata: Metadata = {
  metadataBase: new URL('https://bootcamp.tryoszone.com'),
  title: { default: 'TR-YÖS Bootcamp — платформа подготовки к TR-YÖS', template: '%s · TR-YÖS Bootcamp' },
  description: 'TR-YÖS Bootcamp — платформа подготовки к экзамену TR-YÖS от школы TR-YÖS Zone: тренажёр по всем темам, пробные экзамены, курсы, расписание и прогресс.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
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
