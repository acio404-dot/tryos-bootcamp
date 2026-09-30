import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Manrope, Unbounded } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import NavProgress from '@/components/NavProgress';
import './globals.css';

// Шрифты — внутри сайта (next/font), без запроса к Google при каждом открытии.
const manrope = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--f-text', display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700'], variable: '--f-display', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://bootcamp.tryoszone.com'),
  title: { default: 'Bootcamp · TR-YÖS Zone', template: '%s · Bootcamp TR-YÖS Zone' },
  description: 'Личный кабинет учеников TR-YÖS Zone: курсы, расписание, прогресс и отсчёт до экзамена.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  // личный кабинет не нужен в поиске
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body>
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
