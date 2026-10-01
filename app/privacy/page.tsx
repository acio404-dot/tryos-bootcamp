import type { Metadata } from 'next';
import LegalPage, { CONTACT_TG, langOf } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy', languages: { ru: '/privacy', en: '/privacy?lang=en' } },
};

export default function Privacy({ searchParams }: { searchParams: { lang?: string } }) {
  const lang = langOf(searchParams?.lang);
  return lang === 'en' ? (
    <LegalPage lang="en" doc="privacy" title="Privacy Policy"><En /></LegalPage>
  ) : (
    <LegalPage lang="ru" doc="privacy" title="Политика конфиденциальности"><Ru /></LegalPage>
  );
}

const Tg = () => <a href={CONTACT_TG}>@tryos_zone</a>;

function Ru() {
  return (
    <>
      <p>
        TR-YÖS Bootcamp (bootcamp.tryoszone.com, далее — «платформа») — платформа подготовки к экзамену TR-YÖS
        от школы TR-YÖS Zone. Здесь описано, какие данные собирает платформа, зачем они нужны, кто их
        видит и как их удалить.
      </p>

      <h2>1. Какие данные мы собираем</h2>
      <h3>При входе</h3>
      <ul>
        <li><b>Вход через Google.</b> Мы запрашиваем только <code>openid email profile</code> и получаем
          идентификатор аккаунта Google, имя и подтверждённый адрес почты. Доступа к письмам, контактам, файлам
          и другим данным Google у платформы нет.</li>
        <li><b>Вход через Telegram.</b> Идентификатор Telegram, имя и @username — то, что Telegram передаёт
          через официальный виджет входа.</li>
        <li><b>Логин и пароль.</b> Логин и имя. Пароль хранится только в виде хеша (scrypt с солью),
          сам пароль мы не знаем.</li>
      </ul>
      <h3>Данные ученика, которые вносит школа</h3>
      <ul>
        <li>Имя, телефон или Telegram для связи, заметка преподавателя.</li>
        <li>Экзамен, его дата и город, целевой балл.</li>
        <li>Группы, расписание, личные сроки, оценки и баллы преподавателей.</li>
      </ul>
      <h3>Учёба на платформе</h3>
      <ul>
        <li>Ответы на задачи (верно или нет, тема, время), результаты пробных тестов и режима «Выживание».
          По ним считаются прогресс и стрик — сколько дней подряд ученик решает задачи.</li>
        <li>Время последнего входа.</li>
      </ul>
      <h3>Что хранится только на вашем устройстве</h3>
      <ul>
        <li>Записи и рисунки на листах «Решать на листе» и мелкие настройки (например, показана ли подсказка)
          хранятся в памяти браузера (localStorage) и на наш сервер не отправляются.</li>
      </ul>

      <h2>2. Зачем</h2>
      <ul>
        <li>Чтобы вы могли войти и увидеть свои курсы, расписание, баллы и прогресс.</li>
        <li>Чтобы преподаватели видели успехи учеников и помогали им готовиться.</li>
        <li>Чтобы защищать платформу: например, ограничивать число попыток ввода пароля.</li>
      </ul>
      <p>Мы не продаём данные, не показываем рекламу и не используем данные для рекламных профилей.</p>

      <h2>3. Данные Google</h2>
      <p>
        Данные, полученные через API Google (идентификатор, имя, почта), используются только для входа
        на платформу и привязки аккаунта к карточке ученика. Мы не передаём их третьим лицам, кроме
        перечисленных ниже поставщиков хостинга, и не используем для рекламы. Использование соответствует{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        включая требования Limited Use.
      </p>

      <h2>4. Кто видит данные</h2>
      <ul>
        <li><b>Вы</b> — свои данные на платформе.</li>
        <li><b>Администраторы и преподаватели школы</b> — данные учеников, чтобы вести занятия.</li>
        <li><b>Другие ученики</b> — только имя и стрик: в списке группы, в чате и в таблице лидеров
          «Выживания».</li>
        <li><b>Поставщики, на серверах которых работает платформа:</b> Vercel (хостинг), Neon (база данных
          Postgres). Анонимную статистику посещений без cookie собирает Vercel Web Analytics. Шрифты
          загружаются с Google Fonts.</li>
      </ul>
      <p>Данные могут раскрываться, если этого требует закон.</p>

      <h2>5. Cookie</h2>
      <p>
        Кабинет ставит одну cookie — <code>tz_session</code>. Это подписанный идентификатор сессии, чтобы вы
        оставались в аккаунте. Она действует 30 дней, недоступна скриптам (httpOnly) и передаётся только по
        HTTPS. Рекламных и отслеживающих cookie нет.
      </p>

      <h2>6. Хранение и удаление</h2>
      <p>
        Данные хранятся, пока у вас есть аккаунт или вы учитесь в школе. Чтобы удалить аккаунт и все
        связанные данные или получить их копию, напишите нам в Telegram <Tg />. Мы удалим данные в течение
        30 дней. Отвязать доступ Google можно в любой момент на странице{' '}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>

      <h2>7. Безопасность</h2>
      <p>
        Соединение шифруется (HTTPS), пароли хранятся только в виде хеша, доступ к админке есть только у
        администраторов школы. Абсолютной защиты не даёт ни один сервис, но мы делаем всё разумное, чтобы
        данные не попали к посторонним.
      </p>

      <h2>8. Дети</h2>
      <p>
        Кабинетом пользуются школьники и абитуриенты. Если ученику нет 16 лет, аккаунт стоит заводить
        с согласия родителя или опекуна. Родитель может в любой момент попросить удалить данные ребёнка
        через <Tg />.
      </p>

      <h2>9. Изменения</h2>
      <p>
        Если политика изменится, мы обновим эту страницу и дату вверху. О существенных изменениях
        предупредим на платформе или в Telegram.
      </p>

      <h2>10. Контакты</h2>
      <p>По любым вопросам о данных пишите в Telegram <Tg />.</p>
    </>
  );
}

function En() {
  return (
    <>
      <p>
        TR-YÖS Bootcamp (bootcamp.tryoszone.com, the “Bootcamp”) is the TR-YÖS exam preparation platform of
        TR-YÖS Zone, a school that prepares students for the TR-YÖS exam. This policy explains what data the Bootcamp
        collects, why, who can see it, and how to delete it.
      </p>

      <h2>1. Data we collect</h2>
      <h3>When you sign in</h3>
      <ul>
        <li><b>Sign in with Google.</b> We request only the <code>openid email profile</code> scopes and receive
          your Google account ID, name and verified email address. The Bootcamp has no access to your mail,
          contacts, files or any other Google data.</li>
        <li><b>Sign in with Telegram.</b> Your Telegram ID, name and @username, as provided by the official
          Telegram Login Widget.</li>
        <li><b>Username and password.</b> Your username and name. Passwords are stored only as a salted scrypt
          hash; we never know the password itself.</li>
      </ul>
      <h3>Student data entered by the school</h3>
      <ul>
        <li>Name, phone or Telegram contact, a teacher’s note.</li>
        <li>Exam, exam date and city, target score.</li>
        <li>Groups, schedule, personal deadlines, teachers’ grades and scores.</li>
      </ul>
      <h3>Learning activity</h3>
      <ul>
        <li>Answers to practice questions (correct or not, topic, time), mock test and “Survival” results.
          These are used to show progress and your streak — the number of days in a row you practiced.</li>
        <li>Time of your last visit.</li>
      </ul>
      <h3>Stored only on your device</h3>
      <ul>
        <li>Notes and drawings on “Solve on a sheet” pages and small preferences (such as whether a hint was
          shown) are kept in your browser’s localStorage and are not sent to our servers.</li>
      </ul>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To let you sign in and see your courses, schedule, scores and progress.</li>
        <li>To let teachers follow students’ progress and help them prepare.</li>
        <li>To protect the service, for example by limiting password attempts.</li>
      </ul>
      <p>We do not sell data, show ads, or build advertising profiles.</p>

      <h2>3. Google user data</h2>
      <p>
        Data received through Google APIs (account ID, name, email) is used only to sign you in and to link
        your account to your student record. We do not share it with third parties other than the hosting
        providers listed below, and we do not use it for advertising. The Bootcamp’s use and transfer of
        information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>

      <h2>4. Who can see your data</h2>
      <ul>
        <li><b>You</b> — your own data in the Bootcamp.</li>
        <li><b>School administrators and teachers</b> — students’ data, to run the classes.</li>
        <li><b>Other students</b> — only your name and streak: in group lists, chats and the “Survival”
          leaderboard.</li>
        <li><b>Service providers that run the Bootcamp:</b> Vercel (hosting), Neon (Postgres database).
          Vercel Web Analytics collects anonymous, cookieless visit statistics. Fonts are loaded from
          Google Fonts.</li>
      </ul>
      <p>We may disclose data when required by law.</p>

      <h2>5. Cookies</h2>
      <p>
        The Bootcamp sets one cookie, <code>tz_session</code>: a signed session identifier that keeps you signed
        in. It lasts 30 days, is not readable by scripts (httpOnly) and is sent over HTTPS only. There are no
        advertising or tracking cookies.
      </p>

      <h2>6. Retention and deletion</h2>
      <p>
        We keep data while you have an account or study at the school. To delete your account and all related
        data, or to get a copy of it, message us on Telegram at <Tg />. We delete data within 30 days. You can
        revoke Google access at any time at{' '}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>

      <h2>7. Security</h2>
      <p>
        Connections are encrypted (HTTPS), passwords are stored only as hashes, and only school administrators
        can open the admin panel. No service can guarantee absolute security, but we take reasonable measures
        to keep your data from unauthorized access.
      </p>

      <h2>8. Children</h2>
      <p>
        The Bootcamp is used by high-school students and applicants. Students under 16 should create an account
        with the consent of a parent or guardian. A parent may ask us to delete a child’s data at any time via{' '}
        <Tg />.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes, we will update this page and the date at the top. We will announce significant
        changes in the Bootcamp or on Telegram.
      </p>

      <h2>10. Contact</h2>
      <p>For any questions about your data, message us on Telegram at <Tg />.</p>
    </>
  );
}
