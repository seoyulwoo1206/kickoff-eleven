import { TEAMS } from './data/teams';
import type { DiffKey } from './data/teams';
import { TEMPO, type TempoKey } from './sim/consts';

export type Mode = 'ai' | '2p' | 'net';
export type Gfx = 'low' | 'mid' | 'high';
export type Names = 'real' | 'alias';
export interface Options { sel: [number, number]; len: number; diff: DiffKey; mode: Mode; tempo: TempoKey; cursor: 'manual' | 'auto'; sound: boolean; gfx: Gfx; names: Names;
  /** 터치: 스틱 끝까지 밀면 질주, 진동, 버튼 크기·투명도 */
  stickSprint: boolean; vibrate: boolean; btnSize: 'small' | 'normal' | 'large'; btnAlpha: 'light' | 'normal' | 'solid'; }
export const opts: Options = { sel: [0, 2], len: 300, diff: 'normal', mode: 'ai', tempo: 'normal', cursor: 'manual', sound: true, gfx: (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'mid' : 'high', names: 'real', stickSprint: true, vibrate: true, btnSize: 'normal', btnAlpha: 'normal' };
const KEY = 'ko11v2';
export function loadOpts() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(s.sel)) { opts.sel = [s.sel[0] | 0, s.sel[1] | 0]; }
    if (s.len) opts.len = +s.len; if (s.diff) opts.diff = s.diff; if (s.mode && s.mode !== 'net') opts.mode = s.mode; if (s.snd === false) opts.sound = false;
    if ((s.tempo as string) in TEMPO) opts.tempo = s.tempo; opts.cursor = (s.v2 && s.cursor === 'auto') ? 'auto' : 'manual'; if (s.gfx === 'low' || s.gfx === 'mid' || s.gfx === 'high') opts.gfx = s.gfx; if (s.names === 'alias') opts.names = 'alias'; if (s.stickSprint === false) opts.stickSprint = false; if (s.vibrate === false) opts.vibrate = false; if (['small', 'normal', 'large'].includes(s.btnSize)) opts.btnSize = s.btnSize; if (['light', 'normal', 'solid'].includes(s.btnAlpha)) opts.btnAlpha = s.btnAlpha;
  } catch { /* 저장값 없음 */ }
  for (const i of [0, 1]) if (!(opts.sel[i] >= 0 && opts.sel[i] < TEAMS.length)) opts.sel[i] = i * 2;
  if (opts.sel[0] === opts.sel[1]) opts.sel[1] = (opts.sel[0] + 1) % TEAMS.length;
}
export function saveOpts() {
  try { localStorage.setItem(KEY, JSON.stringify({ sel: opts.sel, len: opts.len, diff: opts.diff, mode: opts.mode, snd: opts.sound, tempo: opts.tempo, cursor: opts.cursor, gfx: opts.gfx, names: opts.names, stickSprint: opts.stickSprint, vibrate: opts.vibrate, btnSize: opts.btnSize, btnAlpha: opts.btnAlpha, v2: true })); } catch { /* */ }
}
