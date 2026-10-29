import { W, H, CY } from '../consts';
import { d, wx } from '../util';
import { DIFF } from '../../data/teams';
import type { Sim, Player } from '../types';
import { sfx } from '../events';
import { gain, knockOn, passTo, throughPass, chipShot, shoot, slideTackle, leadPos, laneRisk, offsideLine, queueKick, n } from '../ball';
import { steer } from '../move';

export function tryTackle(s: Sim, p: Player, own: Player | null, rate: number) {
  const { M, HU, INP, ball } = s;
  if (!own || own.t === p.t || own.role === 'GK' || M.protect > 0 || p.tackleCD > 0 || p.stun > 0 || p.slide > 0) return;
  const q = d(p, own);
  if (q < 1.25) {
    p.tackleCD = 0.45; let r = rate * (0.85 + n(p.attrs.stk) * 0.4) * (1 - n(own.attrs.bal) * 0.2); const h = HU[own.t]; if (h && h.ctrl === own && INP[h.t].down.sprint) r *= 0.85;
    if (own.feint > 0) r *= 0.5; if (own.spin > 0) r *= 0.3;
    if (s.rnd() < r) { gain(s, p); own.stun = 0.45; own.kickCD = 0.5; sfx(s, 'tackle'); }
  }
  else if (q < 3.2 && !HU[p.t] && s.rnd() < rate * 0.08) { // AI 슬라이딩: 앞에서 공을 향해
    const front = Math.cos(own.dir) * (p.x - own.x) + Math.sin(own.dir) * (p.y - own.y) > -0.3;
    if (front) slideTackle(s, p, Math.atan2(ball.y - p.y, ball.x - p.x));
  }
}
export interface PassChoice { p: Player; score: number; loft: boolean; thru: boolean; }
export function bestAIPass(s: Sim, p: Player): PassChoice | null {
  let best: PassChoice | null = null, bs = -1e9;
  const line = offsideLine(s, p.t);
  for (const m of s.team[p.t]) {
    if (m === p || m.role === 'GK' || wx(m.x, p.t) > line + 0.3) continue;
    const L = leadPos(p, m), q = Math.hypot(L.x - p.x, L.y - p.y); if (q < 5 || q > 42) continue;
    const prog = wx(L.x, p.t) - wx(p.x, p.t), fwd = prog / 10; // 전진 거리를 가장 크게 본다
    let open = 99; for (const o of s.team[1 - p.t]) open = Math.min(open, Math.hypot(o.x - L.x, o.y - L.y));
    const risk = laneRisk(s, p, L, p.t), loft = risk > 0.8 && q > 14;
    const run = (m.vx * (p.t === 0 ? 1 : -1)) > 3 && prog > 4 && open > 4;
    const deep = wx(L.x, p.t) > 70 ? 0.6 : 0; // 상대 진영 깊숙이 넣는 패스 가산
    const sc = fwd + Math.min(open, 8) / 5 - (loft ? risk * 0.5 : risk * 1.5) - q / 45 + (run ? 0.9 : 0) + deep - (prog < -6 ? 1 : 0); // 6m 넘게 뒤로 가는 패스는 감점
    if (sc > bs) { bs = sc; best = { p: m, score: sc, loft, thru: run && !loft }; }
  }
  return best;
}
export function aiShoot(s: Sim, p: Player) { const kp = s.team[1 - p.t][0]; shoot(s, p, 0.55 + s.rnd() * 0.3, kp.y < CY ? 1 : -1); }
export function aiCarrier(s: Sim, p: Player, dt: number) {
  const { M, team } = s;
  const t = p.t, D = DIFF[M.diff], gx = t === 0 ? W : 0, dG = Math.hypot(gx - p.x, CY - p.y);
  let nearest: Player | null = null, nd = 1e9; for (const o of team[1 - t]) { const q = d(o, p); if (q < nd) { nd = q; nearest = o; } }
  p.decT -= dt;
  if (p.kickWind > 0) { steer(p, p.vx * 0.5, p.vy * 0.5, dt); p.holdT += dt; return; } // 와인드업 중
  if (p.decT <= 0 && M.phase === 'live') {
    p.decT = D.react * (0.8 + s.rnd() * 0.6);
    if (p.forceShot) { p.forceShot = false; const pw = 0.75 + s.rnd() * 0.1, ay = s.rnd() < 0.5 ? 1 : -1; queueKick(s, p, () => shoot(s, p, pw, ay)); return; }
    if (p.forcePass) { p.forcePass = false; const m = bestAIPass(s, p); if (m) { queueKick(s, p, () => passTo(s, p, m.p, m.loft)); return; } }
    // 압박받으면 개인기로 흘리기도 한다 (개인기 등급이 높을수록)
    if (nd < 2.2 && p.skill >= 3 && p.feint <= 0 && s.rnd() < 0.03 * p.skill) { p.feint = 0.35; p.burst = 0.45; }
    const kp = team[1 - t][0], kpOut = Math.abs(kp.x - gx) > 7;
    if (dG < 28 && Math.abs(p.y - CY) < 22) { const pr = (dG < 11 ? 0.92 : dG < 18 ? 0.62 : 0.28) * (0.8 + n(p.attrs.fin) * 0.4); if (s.rnd() < pr) { if (kpOut && dG > 10 && s.rnd() < 0.6) queueKick(s, p, () => chipShot(s, p)); else { const fin = dG > 14 && dG < 24 && p.attrs.fin > 78 && s.rnd() < 0.5; const pw = 0.55 + s.rnd() * 0.3, ay = kp.y < CY ? 1 : -1; queueKick(s, p, () => shoot(s, p, pw, ay, fin)); } return; } }
    const pressed = nd < 2.0;
    if (pressed || p.holdT > 1.2 || s.rnd() < 0.08) {
      const m = bestAIPass(s, p);
      // 압박이면 괜찮은 패스, 아니면 좋은 전진 패스만. 오래 끌면 아무 데나
      if (m && ((pressed && m.score > -0.3) || m.score > 1.2 || (p.holdT > 2.4 && m.score > -1))) { if (m.thru) { const a = Math.atan2(m.p.y - p.y, m.p.x - p.x); queueKick(s, p, () => throughPass(s, p, a)); } else queueKick(s, p, () => passTo(s, p, m.p, m.loft)); return; }
    }
  }
  let dx = t === 0 ? 1 : -1, dy = (CY - p.y) / 40;
  if (nearest && nd < 6) { const w = (6 - nd) / 6 * 1.4; dx += (p.x - nearest.x) / nd * w; dy += (p.y - nearest.y) / nd * w * 1.3; }
  if (p.y < 4) dy += 0.8; if (p.y > H - 4) dy -= 0.8;
  const m = Math.hypot(dx, dy) || 1, sp = p.speed * (nd > 6 ? 1.28 : nd > 3 ? 1.12 : 1.02) * 0.93 * (p.burst > 0 ? 1.12 : 1); steer(p, dx / m * sp, dy / m * sp, dt); // 공간이 있으면 질주, 압박 땐 몸으로 버티며 전진
  p.holdT += dt; if (nd > 7 && p.holdT > 0.3 && Math.hypot(p.vx, p.vy) > 5 && wx(p.x, t) < 82 && M.phase === 'live') knockOn(s, p);
}
