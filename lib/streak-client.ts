/* Браузерная часть стрика: сервер сообщил, что стрик продлился, — показать достижение. */

export interface StreakUp { current: number; date: string }

export function announceStreak(s: StreakUp | null | undefined): void {
  if (!s || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StreakUp>('tryos:streak', { detail: s }));
}
