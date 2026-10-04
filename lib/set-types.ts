/*
 * Типы и подписи набора задач (смена, домашка). Отдельный файл без сервера:
 * его берут и сервер (lib/sets.ts), и экран задачи в браузере — банк задач
 * и база в браузер при этом не попадают.
 */

import type { PublicQuestion } from './bank-types';

/** Сколько задач в смене и сколько минут она занимает (по 90 секунд на задачу). */
export const SHIFT_SIZE = 8;
export const SHIFT_MINUTES = 12;
/** Темп экзамена: секунд на задачу. Быстрее — бонус к свету. */
export const TEMPO = 75;

export type SetKind = 'shift' | 'homework';
/** Откуда задача: слабая тема, новая тема, из ошибок, повторение, разные темы (без доступа к тренажёру), домашка. */
export type ItemKind = 'weak' | 'new' | 'mistake' | 'mix' | 'any' | 'hw';
export interface SetItem { id: string; kind: ItemKind }
export interface SetAnswer {
  /** Выбранные варианты по порядку попыток. */
  tries: number[];
  /** null — первая попытка неверная, идёт вторая. */
  ok: boolean | null;
  /** Секунды до первого ответа. */
  seconds: number | null;
  light: number;
  /** Задачи больше нет в банке: пропущена без ответа. */
  skipped?: boolean;
}


export type Mark = 'ok' | 'second' | 'wrong' | null;

export interface RunTask {
  n: number;
  kind: ItemKind;
  question: PublicQuestion;
  /** Тень темы: имя и рисунок. */
  shadow: { id: string; name: string } | null;
  /** Варианты, которые уже выбраны и оказались неверными. */
  wrong: number[];
  /** Подсказка после первой ошибки: реплика Nur и первый шаг (или слабое место тени). */
  hint: { nur: string; step: string | null; from: 'task' | 'shadow' | null } | null;
  /** Итог задачи: верный вариант и разбор. */
  verdict: {
    correct: number;
    explanation: string;
    result: 'ok' | 'second' | 'wrong';
    light: number;
    parts: { label: string; amount: number }[];
    seconds: number | null;
    /** Реплика Nur к итогу задачи. */
    say: string;
  } | null;
  /** Сколько секунд задача уже на экране (для таймера темпа). */
  elapsed: number;
}

export interface RunSummary {
  ok1: number;
  ok2: number;
  wrong: number;
  light: number;
  /** Сколько минут ушло. */
  minutes: number;
  /** Верных с первой попытки быстрее темпа экзамена. */
  fast: number;
  tasks: { label: string; kind: ItemKind; mark: Mark }[];
}

export interface RunState {
  id: string;
  kind: SetKind;
  step: number;
  cur: number;
  total: number;
  light: number;
  finished: boolean;
  marks: Mark[];
  task: RunTask | null;
  summary: RunSummary | null;
}


export const KIND_LABEL: Record<ItemKind, string> = {
  weak: 'слабая тема',
  new: 'новая тема',
  mistake: 'из ошибок',
  mix: 'повторение',
  any: 'разные темы',
  hw: 'домашка',
};
