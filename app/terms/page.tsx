import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { CONTACT_TG, langOf } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Условия использования',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms', languages: { ru: '/terms', en: '/terms?lang=en' } },
};

export default function Terms({ searchParams }: { searchParams: { lang?: string } }) {
  const lang = langOf(searchParams?.lang);
  return lang === 'en' ? (
    <LegalPage lang="en" doc="terms" title="Terms of Service"><En /></LegalPage>
  ) : (
    <LegalPage lang="ru" doc="terms" title="Условия использования"><Ru /></LegalPage>
  );
}

const Tg = () => <a href={CONTACT_TG}>@tryos_zone</a>;

function Ru() {
  return (
    <>
      <p>
        Эти условия действуют для личного кабинета Bootcamp TR-YÖS Zone на bootcamp.tryoszone.com (далее —
        «кабинет»). Входя в кабинет, вы соглашаетесь с ними и с{' '}
        <Link href="/privacy">политикой конфиденциальности</Link>.
      </p>

      <h2>1. Что это за сервис</h2>
      <p>
        Кабинет помогает ученикам школы TR-YÖS Zone готовиться к экзамену TR-YÖS: показывает курсы,
        расписание, баллы и прогресс, даёт решать задачи, пробные тесты и режим «Выживание». Часть
        возможностей открыта всем, остальные — ученикам школы по ID, который выдаёт школа.
      </p>

      <h2>2. Аккаунт</h2>
      <ul>
        <li>Войти можно через Google, Telegram или по логину и паролю.</li>
        <li>Указывайте настоящее имя: по нему вас узнают преподаватели.</li>
        <li>Не передавайте другим свой аккаунт и ID ученика. Вы отвечаете за всё, что делается
          в вашем аккаунте.</li>
        <li>Если кто-то получил доступ к вашему аккаунту, сразу напишите нам: <Tg />.</li>
      </ul>

      <h2>3. Доступ к курсам</h2>
      <p>
        Какие разделы вам открыты, решает школа по договорённости с вами. Оплата, сроки обучения и возврат
        денег регулируются договором или офертой школы, а не этими условиями.
      </p>

      <h2>4. Что нельзя делать</h2>
      <ul>
        <li>Копировать, публиковать или продавать задачи, решения и материалы кабинета без разрешения школы.</li>
        <li>Подбирать чужие пароли и ID, обходить ограничения доступа, мешать работе кабинета.</li>
        <li>Накручивать результаты, стрик или таблицу лидеров скриптами и другими способами.</li>
        <li>Использовать кабинет для чего-либо незаконного.</li>
      </ul>

      <h2>5. Материалы</h2>
      <p>
        Задачи, объяснения, тексты и оформление кабинета принадлежат TR-YÖS Zone или используются
        с разрешения правообладателей. Их можно использовать только для своей подготовки.
      </p>

      <h2>6. Без гарантий результата</h2>
      <p>
        Кабинет помогает готовиться, но не гарантирует конкретный балл или поступление. Прогнозы и баллы
        пробных тестов ориентировочные. Официальные даты и правила экзамена публикуют университеты, их
        стоит проверять на официальных сайтах.
      </p>

      <h2>7. Работа сервиса</h2>
      <p>
        Мы стараемся, чтобы кабинет работал без перерывов, но он предоставляется «как есть»: возможны
        технические работы и сбои. Мы можем менять, добавлять и убирать функции. Насколько это позволяет
        закон, мы не отвечаем за косвенные убытки из-за перерывов в работе.
      </p>

      <h2>8. Приостановка и удаление</h2>
      <p>
        Мы можем ограничить или закрыть доступ, если условия нарушаются. Вы можете в любой момент перестать
        пользоваться кабинетом и попросить удалить аккаунт через <Tg />.
      </p>

      <h2>9. Изменения</h2>
      <p>
        Условия могут обновляться. Новая версия действует с даты, указанной вверху страницы. Если вы
        продолжаете пользоваться кабинетом, значит, согласны с новой версией.
      </p>

      <h2>10. Контакты</h2>
      <p>Вопросы по условиям — в Telegram <Tg />.</p>
    </>
  );
}

function En() {
  return (
    <>
      <p>
        These terms apply to the TR-YÖS Zone Bootcamp student portal at bootcamp.tryoszone.com (the “Bootcamp”).
        By signing in you agree to them and to the{' '}
        <Link href="/privacy?lang=en">Privacy Policy</Link>.
      </p>

      <h2>1. The service</h2>
      <p>
        The Bootcamp helps students of the TR-YÖS Zone school prepare for the TR-YÖS exam: it shows courses,
        schedule, scores and progress, and offers practice questions, mock tests and the “Survival” mode.
        Some features are open to everyone; others are available to school students via an ID issued
        by the school.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You can sign in with Google, Telegram, or a username and password.</li>
        <li>Use your real name so teachers can recognize you.</li>
        <li>Do not share your account or student ID. You are responsible for activity in your account.</li>
        <li>If someone else gains access to your account, contact us right away: <Tg />.</li>
      </ul>

      <h2>3. Course access</h2>
      <p>
        The school decides which sections are open to you, based on your agreement with it. Payment, study
        periods and refunds are governed by the school’s agreement or offer, not by these terms.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not copy, publish or sell questions, solutions or materials from the Bootcamp without the
          school’s permission.</li>
        <li>Do not guess other people’s passwords or IDs, bypass access restrictions, or disrupt the service.</li>
        <li>Do not inflate results, streaks or the leaderboard with scripts or other means.</li>
        <li>Do not use the Bootcamp for anything unlawful.</li>
      </ul>

      <h2>5. Content</h2>
      <p>
        Questions, explanations, texts and design of the Bootcamp belong to TR-YÖS Zone or are used with the
        permission of their owners. You may use them only for your own exam preparation.
      </p>

      <h2>6. No guarantee of results</h2>
      <p>
        The Bootcamp helps you prepare but does not guarantee any particular score or admission. Forecasts and
        mock test scores are estimates. Official exam dates and rules are published by universities; please
        check their official websites.
      </p>

      <h2>7. Availability</h2>
      <p>
        We aim to keep the Bootcamp running without interruptions, but it is provided “as is”: maintenance and
        outages may happen. We may change, add or remove features. To the extent permitted by law, we are not
        liable for indirect losses caused by interruptions.
      </p>

      <h2>8. Suspension and deletion</h2>
      <p>
        We may restrict or close access if these terms are violated. You may stop using the Bootcamp at any
        time and ask us to delete your account via <Tg />.
      </p>

      <h2>9. Changes</h2>
      <p>
        These terms may be updated. A new version applies from the date shown at the top of the page.
        Continuing to use the Bootcamp means you accept the new version.
      </p>

      <h2>10. Contact</h2>
      <p>Questions about these terms: Telegram <Tg />.</p>
    </>
  );
}
