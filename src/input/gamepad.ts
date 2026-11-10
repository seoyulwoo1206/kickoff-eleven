import { keyDown, keyUp, type Act, type Inp } from './actions';

/* 게임패드 (표준 매핑). 왼스틱/십자키 이동, A 패스·압박, B 슛·슬라이딩, X 스루·세컨드, Y 롱패스·전환,
   RT/RB 질주, LB 칩슛, LT 침투 지시/압박 지원, L3 개인기/골키퍼 돌진, Start 일시정지. 프레임마다 poll해서 눌림/뗌을 키 이벤트처럼 만든다 */
const BTN: Record<number, Act> = { 0: 'pass', 1: 'shoot', 2: 'through', 3: 'lob', 4: 'chip', 5: 'sprint', 7: 'sprint', 6: 'run', 10: 'gkRush', 11: 'switch' };
const prev: Record<number, Record<number, boolean>> = {};
let startWas = false;
export interface GamepadHooks { inp: Inp; isPlaying: () => boolean; togglePause: () => void; }
export function pollGamepads(h: GamepadHooks) {
  if (!navigator.getGamepads) return false;
  const pads = navigator.getGamepads(); let any = false, sx = 0, sy = 0, start = false;
  for (const gp of pads) {
    if (!gp || !gp.connected) continue; any = true;
    const P = prev[gp.index] ?? (prev[gp.index] = {});
    let ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    const m = Math.hypot(ax, ay); if (m < 0.15) { ax = 0; ay = 0; } else if (m > 1) { ax /= m; ay /= m; }
    if (gp.buttons[12]?.pressed) ay = -1; if (gp.buttons[13]?.pressed) ay = 1; if (gp.buttons[14]?.pressed) ax = -1; if (gp.buttons[15]?.pressed) ax = 1;
    sx += ax; sy += ay;
    for (const k in BTN) {
      const i = +k, act = BTN[i], down = !!gp.buttons[i]?.pressed || (i === 7 && (gp.buttons[7]?.value ?? 0) > 0.4);
      if (down !== !!P[i]) { P[i] = down; if (h.isPlaying()) { if (down) keyDown(h.inp, act); else keyUp(h.inp, act); } }
    }
    if (gp.buttons[9]?.pressed) start = true;
  }
  if (!any) return false;
  if (h.isPlaying() || !start) { const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; } if (m > 0 || h.inp.touch === false) { h.inp.tx = sx; h.inp.ty = sy; } }
  if (start && !startWas) h.togglePause(); startWas = start;
  return true;
}
