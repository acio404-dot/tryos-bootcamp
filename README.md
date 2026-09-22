# TR-YÖS Zone · Bootcamp

Личный кабинет учеников школы TR-YÖS Zone: bootcamp.tryoszone.com.

- вход: логин и пароль, Google, Telegram;
- ID ученика открывает курсы, расписание, баллы и уровень доступа;
- отсчёт до экзамена, ближайшее занятие, прогресс по задачам;
- админка (/admin): ученики, ID, группы, расписание, доступ, баллы.

## Переменные окружения

| Переменная | Откуда |
|---|---|
| `DATABASE_URL` | появляется сама, когда к проекту подключена база Neon (Vercel → Storage) |
| `BOOTCAMP_ADMINS` | логины администраторов через запятую |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud → OAuth client; redirect: `https://bootcamp.tryoszone.com/api/auth/google/callback` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME` | бот школы; в BotFather: `/setdomain` → bootcamp.tryoszone.com |
| `AUTH_SECRET` | необязательно: ключ подписи сессий (по умолчанию выводится из `DATABASE_URL`) |

Таблицы в базе создаются сами при первом запросе.
