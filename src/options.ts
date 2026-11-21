import { TEAMS } from './data/teams';
import type { DiffKey } from './data/teams';
import { TEMPO, type TempoKey } from './sim/consts';

export type Mode = 'ai' | '2p' | 'net' | 'cup' | 'pk';
export type Gfx = 'low' | 'mid' | 'high';
export type Names = 'real' | 'alias';
export interface Options { sel: [number, number]; len: number; diff: DiffKey; mode: Mode; tempo: TempoKey; cursor: 'manual' | 'auto'; sound: boolean; gfx: Gfx; names: Names;
  /** 터치: 스틱 끝까지 밀면 질주, 진동, 버튼 크기·투명도 */
  stickSprint: boolean; vibrate: boolean; btnSize: 'small' | 'normal' | 'large'; btnAlpha: 'light' | 'normal' | 'solid';
  /** 시야 배율 (1 가깝게 ~ 2.4 전체) */
  view: number;
  /** 중계 카메라가 내려다보는 각(rad): 0.36 낮게 ~ 0.92 아주 높게 */
  camH: number;
  /** xT 패널에서 고른 격자·모델·T (패널을 열었는지는 저장하지 않는다) */
  xt: { part: string; model: string; T: string };
  /** 해설: 음성(자막 포함) · 자막만 · 끄기 */
  cmt: 'voice' | 'text' | 'off';
  /** 고른 해설 목소리 (`commentary.ts` `CMT.voice`, '' = 알아서) */
  voice: string; }
export const opts: Options = { sel: [0, 2], len: 300, diff: 'normal', mode: 'ai', tempo: 'normal', cursor: 'manual', sound: true, gfx: (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'mid' : 'high', names: 'real', stickSprint: true, vibrate: true, btnSize: 'normal', btnAlpha: 'normal', view: 1.35, camH: 0.5, xt: { part: 'tree', model: 'dtmc', T: '10' }, cmt: 'voice', voice: '' };
const KEY = 'ko11v2';
export function loadOpts() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(s.sel)) { opts.sel = [s.sel[0] | 0, s.sel[1] | 0]; }
    if (s.len) opts.len = +s.len; if (s.diff) opts.diff = s.diff; if (s.mode && s.mode !== 'net') opts.mode = s.mode; if (s.snd === false) opts.sound = false;
    if (s.view >= 1 && s.view <= 2.4) opts.view = +s.view; if (s.cmt === 'text' || s.cmt === 'off' || s.cmt === 'voice') opts.cmt = s.cmt; if (typeof s.voice === 'string') opts.voice = s.voice;
    if (s.xt && typeof s.xt === 'object') { for (const k of ['part', 'model', 'T'] as const) if (typeof s.xt[k] === 'string') opts.xt[k] = s.xt[k]; }
    if ((s.tempo as string) in TEMPO) opts.tempo = s.tempo; opts.cursor = (s.v2 && s.cursor === 'auto') ? 'auto' : 'manual'; if (s.gfx === 'low' || s.gfx === 'mid' || s.gfx === 'high') opts.gfx = s.gfx; if (s.names === 'alias') opts.names = 'alias'; if (s.stickSprint === false) opts.stickSprint = false; if (s.vibrate === false) opts.vibrate = false; if (['small', 'normal', 'large'].includes(s.btnSize)) opts.btnSize = s.btnSize; if (['light', 'normal', 'solid'].includes(s.btnAlpha)) opts.btnAlpha = s.btnAlpha;
  } catch { /* 저장값 없음 */ }
  for (const i of [0, 1]) if (!(opts.sel[i] >= 0 && opts.sel[i] < TEAMS.length)) opts.sel[i] = i * 2;
  if (opts.sel[0] === opts.sel[1]) opts.sel[1] = (opts.sel[0] + 1) % TEAMS.length;
}
export function saveOpts() {
  try { localStorage.setItem(KEY, JSON.stringify({ sel: opts.sel, len: opts.len, diff: opts.diff, mode: opts.mode, snd: opts.sound, tempo: opts.tempo, cursor: opts.cursor, gfx: opts.gfx, names: opts.names, stickSprint: opts.stickSprint, vibrate: opts.vibrate, btnSize: opts.btnSize, btnAlpha: opts.btnAlpha, view: opts.view, camH: opts.camH, xt: opts.xt, cmt: opts.cmt, voice: opts.voice, v2: true })); } catch { /* */ }
}
