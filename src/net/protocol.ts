/* 온라인 프로토콜 (호스트 권한). 호스트는 2틱마다 스냅샷(t:'s'), 게스트는 60Hz로 입력(t:'i')을 보낸다.
   게스트는 받은 스냅샷을 호스트 시계 기준 80ms 전으로 보간해서 그린다 */
import { ACTS, type Inp } from '../input/actions';
import { clamp, lerp, lerpAng } from '../sim/util';
import type { Sim, Phase } from '../sim/types';

export const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100, r3 = (v: number) => Math.round(v * 1000) / 1000;
export interface Snap { t: 's'; tm: number; P: number[]; B: number[]; M: [number, number, number, number, Phase, number, number]; S: number[]; H: ([number, number, number] | null)[]; sh: number; }
export interface InputMsg { t: 'i'; x: number; y: number; d: number; p: number; r: number; tc: number; }
export type StartCfg = { sel: [number, number]; len: number; fk: number; tempo: string; seed: number };
export type NetMsg = Snap | InputMsg | { t: 'lobby'; sel: number; len?: number } | { t: 'start'; c: StartCfg } | { t: 'ev'; k: string; a?: unknown }
  | { t: 'pause' } | { t: 'resume' } | { t: 'quit' } | { t: 'pg'; ts: number } | { t: 'po'; ts: number };

export function makeSnap(s: Sim, perf: number, shake: number): Snap {
  const { players, ball, M, HU } = s;
  const P: number[] = []; for (const p of players) P.push(r2(p.x), r2(p.y), r2(p.dir), r1(p.vx), r1(p.vy), r2(p.slide), r2(p.dive), p.diveDir, r2(p.stun), r2(p.kickCD), r2(p.run % 1000), p.cele ? 1 : 0, r2(p.sta), r2(p.kickWind), r2(p.spin), r2(p.feint), p.off ? 1 : 0);
  const o = ball.owner ? players.indexOf(ball.owner) : -1, st = M.stats;
  return {
    t: 's', tm: r3(perf), P, B: [r2(ball.x), r2(ball.y), r2(ball.z), r1(ball.vx), r1(ball.vy), r1(ball.vz), o, r2(ball.spin % 100), ball.isShot ? 1 : 0],
    M: [M.score[0], M.score[1], r2(M.time), M.half, M.phase, r2(M.protect), r2(M.slow)],
    S: [st.shots[0], st.shots[1], st.onT[0], st.onT[1], st.fouls[0], st.fouls[1], r2(st.poss[0]), r2(st.poss[1])],
    H: HU.map(h => h ? [h.ctrl ? players.indexOf(h.ctrl) : -1, h.charging ? 1 : 0, r2(h.charge)] as [number, number, number] : null), sh: r2(shake),
  };
}
export function applySnap(s: Sim, sa: Snap, sb: Snap, f: number, newest: Snap, onSlide: (x: number, y: number) => void) {
  const { players, ball, M, HU } = s;
  const A = sa.P, B = sb.P;
  players.forEach((p, i) => {
    const k = i * 17;
    p.x = lerp(A[k], B[k], f); p.y = lerp(A[k + 1], B[k + 1], f); p.dir = lerpAng(A[k + 2], B[k + 2], f); p.vx = lerp(A[k + 3], B[k + 3], f); p.vy = lerp(A[k + 4], B[k + 4], f);
    if (B[k + 5] > 0 && p.slide <= 0) onSlide(p.x, p.y);
    p.slide = B[k + 5]; p.dive = B[k + 6]; p.diveDir = B[k + 7]; p.stun = B[k + 8]; p.kickCD = B[k + 9]; p.run = lerp(A[k + 10], B[k + 10], f); p.cele = !!B[k + 11]; p.sta = B[k + 12] ?? 1; p.kickWind = B[k + 13] ?? 0; p.spin = B[k + 14] ?? 0; p.feint = B[k + 15] ?? 0; p.off = !!B[k + 16];
  });
  const a = sa.B, b = sb.B;
  ball.x = lerp(a[0], b[0], f); ball.y = lerp(a[1], b[1], f); ball.z = Math.max(0, lerp(a[2], b[2], f)); ball.vx = b[3]; ball.vy = b[4]; ball.vz = b[5]; ball.owner = b[6] >= 0 ? players[b[6]] : null; ball.spin = lerp(a[7], b[7], f); ball.isShot = !!b[8];
  const m = newest.M, st = newest.S;
  M.score[0] = m[0]; M.score[1] = m[1]; M.time = m[2]; M.half = m[3]; M.phase = m[4]; M.protect = m[5]; M.slow = m[6];
  M.stats.shots = [st[0], st[1]]; M.stats.onT = [st[2], st[3]]; M.stats.fouls = [st[4], st[5]]; M.stats.poss = [st[6], st[7]];
  newest.H.forEach((h, i) => { const hu = HU[i]; if (!h || !hu) return; hu.ctrl = h[0] >= 0 ? players[h[0]] : null; hu.charging = !!h[1]; hu.charge = h[2]; });
}
export interface SnapBuf { buf: { at: number; s: Snap }[]; off: number | null; }
export function netInterp(s: Sim, nb: SnapBuf, perf: number, onSlide: (x: number, y: number) => void) {
  const buf = nb.buf; if (!buf.length) return;
  const last = buf[buf.length - 1];
  if (nb.off == null) nb.off = last.at - last.s.tm; else nb.off += ((last.at - last.s.tm) - nb.off) * 0.04;
  const rt = perf - nb.off - 0.08;
  let a = buf[0], b = last;
  for (let i = buf.length - 1; i > 0; i--) { if (buf[i - 1].s.tm <= rt) { a = buf[i - 1]; b = buf[i]; break; } }
  const f = b.s.tm > a.s.tm ? clamp((rt - a.s.tm) / (b.s.tm - a.s.tm), 0, 1.2) : 1;
  applySnap(s, a.s, b.s, f, last.s, onSlide);
  while (buf.length > 3 && buf[1].s.tm < rt - 0.3) buf.shift();
}
export function applyNetInput(I: Inp, m: InputMsg) {
  I.tx = +m.x || 0; I.ty = +m.y || 0; I.keys.clear(); I.touch = !!m.tc;
  ACTS.forEach((a, i) => { const b = 1 << i; const dn = !!(m.d & b); if (m.p & b) { I.press[a] = true; I.holdT[a] = 0; } if (m.r & b) I.rel[a] = true; I.down[a] = dn; });
}
/** 바뀐 게 있거나 6틱마다 입력을 보낸다. 반환값이 null이면 보낼 필요 없음 */
export function encodeInput(I: Inp, st: { lastIn: string; hb: number }): InputMsg | null {
  let dbits = 0, pbits = 0, rbits = 0;
  ACTS.forEach((a, i) => { if (I.down[a]) dbits |= 1 << i; if (I.press[a]) pbits |= 1 << i; if (I.rel[a]) rbits |= 1 << i; });
  const x = r2(I.mx), y = r2(I.my), key = x + ',' + y + ',' + dbits + ',' + I.touch;
  st.hb++;
  if (pbits || rbits || key !== st.lastIn || st.hb >= 6) { st.lastIn = key; st.hb = 0; return { t: 'i', x, y, d: dbits, p: pbits, r: rbits, tc: I.touch ? 1 : 0 }; }
  return null;
}
