import { keyDown, keyUp, ACTS, type Act, type Dir, type Inp } from './actions';

export type Key = Act | Dir;
/* P1: 방향키 + S/A/W/D/Z/Q/X/E (FC 온라인 배치, Q 침투/압박 지원, X 개인기/GK 돌진). P2: IJKL + B/V/N/M/./U/,/Space */
const K1_DEFAULT: Record<string, Key> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyS: 'pass', KeyA: 'lob', KeyW: 'through', KeyD: 'shoot', KeyZ: 'chip', KeyQ: 'run', KeyX: 'gkRush', KeyE: 'sprint', ShiftLeft: 'switch' };
export let K1: Record<string, Key> = { ...K1_DEFAULT };
/** 키 설정 변경 (null이면 기본으로). 저장된 설정에 없는 새 액션은 기본 키를 붙인다 (그 키를 쓰던 액션은 자기 기본 키로 옮김) */
export function setK1(m: Record<string, Key> | null) {
  K1 = m ? { ...m } : { ...K1_DEFAULT };
  if (!m) return;
  const have = new Set(Object.values(K1));
  for (const act of ACTS) {
    if (have.has(act)) continue;
    for (const code in K1_DEFAULT) {
      if (K1_DEFAULT[code] !== act) continue;
      const other = K1[code];
      if (other && other !== act) { const oc = Object.keys(K1_DEFAULT).find(c => K1_DEFAULT[c] === other && !K1[c]); if (oc) K1[oc] = other; }
      K1[code] = act; have.add(act);
    }
  }
}
export const K2: Record<string, Key> = { KeyJ: 'left', KeyL: 'right', KeyI: 'up', KeyK: 'down', KeyB: 'pass', KeyV: 'lob', KeyN: 'through', KeyM: 'shoot', Period: 'chip', KeyU: 'run', Comma: 'gkRush', Space: 'sprint', ShiftRight: 'sprint', KeyH: 'switch' };

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
  cycleView: () => void;
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
    if (e.code === 'KeyR' && !e.repeat && !route('KeyR')) { h.cycleView(); return; }
    if (!h.isPlaying()) return; const r = route(e.code); if (!r) return; e.preventDefault(); keyDown(h.inp[r[0]], r[1], e.repeat);
  });
  window.addEventListener('keyup', e => { const r = route(e.code); if (!r) return; keyUp(h.inp[r[0]], r[1]); });
}
