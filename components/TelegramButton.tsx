'use client';

import { useEffect, useRef } from 'react';

/* Официальная кнопка «Войти через Telegram». После подтверждения
   Telegram перенаправляет на /api/auth/telegram с подписанными данными. */
export default function TelegramButton({ bot }: { bot: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box || box.childElementCount) return;
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', bot);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-auth-url', `${window.location.origin}/api/auth/telegram`);
    s.setAttribute('data-request-access', 'write');
    box.appendChild(s);
  }, [bot]);

  return <div className="tg-wrap" ref={ref} />;
}
