import { TEAMS } from './data/teams';
import type { DiffKey } from './data/teams';
import { TEMPO, type TempoKey } from './sim/consts';

export type Mode = 'ai' | '2p' | 'net';
export interface Options { sel: [number, number]; len: number; diff: DiffKey; mode: Mode; tempo: TempoKey; cursor: 'manual' | 'auto'; sound: boolean; }
export const opts: Options = { sel: [0, 2], len: 300, diff: 'normal', mode: 'ai', tempo: 'normal', cursor: 'manual', sound: true };
const KEY = 'ko11v2';
export function loadOpts() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(s.sel)) { opts.sel = [s.sel[0] | 0, s.sel[1] | 0]; }
    if (s.len) opts.len = +s.len; if (s.diff) opts.diff = s.diff; if (s.mode && s.mode !== 'net') opts.mode = s.mode; if (s.snd === false) opts.sound = false;
    if ((s.tempo as string) in TEMPO) opts.tempo = s.tempo; opts.cursor = (s.v2 && s.cursor === 'auto') ? 'auto' : 'manual';
  } catch { /* 저장값 없음 */ }
  for (const i of [0, 1]) if (!(opts.sel[i] >= 0 && opts.sel[i] < TEAMS.length)) opts.sel[i] = i * 2;
  if (opts.sel[0] === opts.sel[1]) opts.sel[1] = (opts.sel[0] + 1) % TEAMS.length;
}
export function saveOpts() {
  try { localStorage.setItem(KEY, JSON.stringify({ sel: opts.sel, len: opts.len, diff: opts.diff, mode: opts.mode, snd: opts.sound, tempo: opts.tempo, cursor: opts.cursor, v2: true })); } catch { /* */ }
}
