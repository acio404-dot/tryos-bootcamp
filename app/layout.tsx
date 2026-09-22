import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
