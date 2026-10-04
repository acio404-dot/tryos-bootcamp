/*
 * Тени — персонажи тем. У каждой из 78 тем тренажёра своя тень: имя, рисунок,
 * слабое место, ловушка, реплики Nur и голос самой тени. Плюс общий пул реплик
 * на события выживания. Содержимое лежит в content/shadows.json; ключ темы
 * банка — поле key.
 */

import data from '@/content/shadows.json';
import type { Section } from './bank-types';

export interface Shadow {
  id: string;
  /** Ключ темы в банке задач. */
  key: string;
  topic: string;
  section: string;
  sectionKey: Section;
  /** Вид (семейство) теней: «Четырёхлапые». */
  species: string;
  name: string;
  art: string;
  look: string;
  weak: string;
  trap: string;
  exam_format: boolean;
  lines: { meet: string[]; hint: string[]; win: string[]; lose: string[]; tamed: string[] };
  voice: { taunt: string; yield: string };
}

export const SHADOWS = data.shadows as unknown as Shadow[];

const BY_KEY = new Map(SHADOWS.map((s) => [s.key, s]));
const BY_ID = new Map(SHADOWS.map((s) => [s.id, s]));

/** Тень темы по ключу банка (trapezoid, sifre…). */
export const shadowOf = (topicKey: string): Shadow | null => BY_KEY.get(topicKey) ?? null;
export const shadowById = (id: string): Shadow | null => BY_ID.get(id) ?? null;

/** То, что уходит в браузер вместе с задачей. */
export interface PublicShadow {
  id: string;
  name: string;
  species: string;
  meet: string[];
  hint: string[];
  win: string[];
  lose: string[];
  taunt: string;
  yield: string;
}

export function publicShadow(topicKey: string): PublicShadow | null {
  const s = BY_KEY.get(topicKey);
  if (!s) return null;
  return {
    id: s.id, name: s.name, species: s.species,
    meet: s.lines.meet, hint: s.lines.hint, win: s.lines.win, lose: s.lines.lose,
    taunt: s.voice.taunt, yield: s.voice.yield,
  };
}

/** Общий пул реплик Nur: старт, волна, мало времени, потеря лампочки, рекорд, финал… */
export type PoolKey =
  | 'start' | 'wave' | 'low_time' | 'bulb_lost' | 'last_bulb' | 'record' | 'game_over' | 'idle'
  | 'guardian_intro' | 'guardian_win' | 'guardian_lose' | 'hunt' | 'trial' | 'round_wait' | 'escaped' | 'night_off';

export const POOL = data.pool as unknown as Record<PoolKey, string[]>;

/** Реплики, которые нужны экрану выживания. */
export function survivalPool() {
  const { start, wave, low_time, last_bulb, record, game_over, idle } = POOL;
  return { start, wave, low_time, last_bulb, record, game_over, idle };
}
export type SurvivalPool = ReturnType<typeof survivalPool>;
