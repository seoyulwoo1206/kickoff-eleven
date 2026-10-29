import { keyDown, keyUp, type Act, type Dir, type Inp } from './actions';

type Key = Act | Dir;
/* P1: 방향키 + S/A/W/D/Z/Q/E (FC 온라인 배치). P2: IJKL + B/V/N/M/./,/Space */
export const K1: Record<string, Key> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyS: 'pass', KeyA: 'lob', KeyW: 'through', KeyD: 'shoot', KeyZ: 'chip', KeyQ: 'gkRush', KeyE: 'sprint', ShiftLeft: 'sprint' };
export const K2: Record<string, Key> = { KeyJ: 'left', KeyL: 'right', KeyI: 'up', KeyK: 'down', KeyB: 'pass', KeyV: 'lob', KeyN: 'through', KeyM: 'shoot', Period: 'chip', Comma: 'gkRush', Space: 'sprint', ShiftRight: 'sprint' };

export interface KeyboardHooks {
  inp: [Inp, Inp];
  /** 경기 중(play)인가. 아니면 키를 먹지 않는다 */
  isPlaying: () => boolean;
  /** 같은 키보드 2인 대전 중이면 P2 키를 받는다 */
  hasLocalP2: () => boolean;
  /** P/Esc */
  togglePause: () => void;
  /** C: 카메라 전환 */
  cycleCamera: () => void;
}
export function installKeyboard(h: KeyboardHooks) {
  const route = (code: string): [number, Key] | null => {
    if (K1[code]) return [0, K1[code]];
    if (h.hasLocalP2() && K2[code]) return [1, K2[code]];
    return null;
  };
  window.addEventListener('keydown', e => {
    if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { h.togglePause(); e.preventDefault(); return; }
    if (e.code === 'KeyC' && !e.repeat) { h.cycleCamera(); return; }
    if (!h.isPlaying()) return; const r = route(e.code); if (!r) return; e.preventDefault(); keyDown(h.inp[r[0]], r[1], e.repeat);
  });
  window.addEventListener('keyup', e => { const r = route(e.code); if (!r) return; keyUp(h.inp[r[0]], r[1]); });
}
