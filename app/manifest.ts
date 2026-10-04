import type { MetadataRoute } from 'next';

/* Значок и название, когда платформу добавляют на главный экран телефона.
   minimal-ui: вход через Google и Telegram идёт как в обычном браузере. */
export default function manifest(): MetadataRoute.Manifest {
  const v = '?v=3';
  return {
    name: 'TR-YÖS Bootcamp',
    short_name: 'Bootcamp',
    description: 'Платформа подготовки к экзамену TR-YÖS от школы TR-YÖS Zone.',
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'minimal-ui',
    background_color: '#0b1730',
    theme_color: '#0b1730',
    icons: [
      { src: `/icon-192.png${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icon-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icon-maskable-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
