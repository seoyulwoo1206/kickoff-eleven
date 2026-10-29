import { W, CY } from '../consts';
import { clamp, d, wx } from '../util';
import { DIFF } from '../../data/teams';
import type { Sim, Player } from '../types';
import { sfx } from '../events';
import { gain, kick, passTo } from '../ball';
import { steer, moveTo } from '../move';
import { bestAIPass } from './carrier';

export function gkAI(s: Sim, k: Player, dt: number) {
  const { ball, M, team, HU } = s;
  const t = k.t, gx = t === 0 ? 0 : W, sg = t === 0 ? 1 : -1, own = ball.owner;
  const skill = (0.62 + (M.teams[t].def - 70) / 22 * 0.22) * (!HU[t] ? DIFF[M.diff].gk : 1);
  if (own === k) {
    k.holdT += dt; steer(k, 0, 0, dt); k.dir = t === 0 ? 0 : Math.PI;
    if (k.holdT > 1.0 && M.phase === 'live') { const m = bestAIPass(s, k); if (m) passTo(s, k, m.p, m.loft); else kick(s, k, sg * 22, (s.rnd() - 0.5) * 8, 7); }
    return;
  }
  const lb = wx(ball.x, t), lk = wx(k.x, t), dG = Math.hypot(ball.x - gx, ball.y - CY);
  let tx = 1.3 + Math.max(0, (32 - dG) / 32) * 3.2, ty = clamp(CY + (ball.y - CY) * 0.32, CY - 3.3, CY + 3.3), f = 0.85;
  const h = HU[t];
  if (h && h.gkRush && lb < 30) { // 골키퍼 돌진
    moveTo(k, ball.x, ball.y, 1.3, dt);
    if (own && own.t !== t && d(k, own) < 1.2 && k.tackleCD <= 0 && M.protect <= 0) { k.tackleCD = 0.4; if (s.rnd() < 0.55) { gain(s, k); own.kickCD = 0.5; } }
    return;
  }
  if (!own) {
    const vlx = ball.vx * sg;
    if (vlx < -5 && k.reactT <= 0) { const th = (lb - lk) / (-vlx); if (th > 0 && th < 2) { ty = clamp(ball.y + ball.vy * th, CY - 4.6, CY + 4.6); tx = lk; f = 1.2; } }
    if (lb < 17 && Math.abs(ball.y - CY) < 21 && Math.hypot(ball.vx, ball.vy) < 14 && ball.z < 2) { // 흐르는 공 줍기
      const dk = d(k, ball); let dop = 1e9; for (const o of team[1 - t]) dop = Math.min(dop, d(o, ball));
      if (dk < dop - 1) { tx = lb; ty = ball.y; f = 1.3; }
    }
    if (ball.kicker && ball.kicker.t !== t && ball.shot !== k.lastSave && vlx < -4 && lb <= lk + 0.5 && lb > lk - 1.8 && Math.abs(ball.y - k.y) < 2.9 && ball.z < 2.7) { // 선방 판정
      k.lastSave = ball.shot; const dy = Math.abs(ball.y - k.y), sp = Math.hypot(ball.vx, ball.vy), hi = ball.z > 1.6;
      const pr = (dy < 0.9 && !hi ? 0.95 : skill * (1 - (dy - 0.6) / 2.6) * (1 - Math.max(0, sp - 20) / 30)) * (hi ? 0.85 : 1);
      k.dive = 0.5; k.diveDir = Math.sign(ball.y - k.y) || 1;
      if (s.rnd() < pr) {
        if (sp < 21 && ball.z < 1.8) gain(s, k);
        else { ball.vx = -ball.vx * 0.3; ball.vy = (ball.y > k.y ? 1 : -1) * (6 + s.rnd() * 6); ball.vz = 3 + s.rnd() * 3; ball.lastTouch = t; ball.kicker = k; ball.shot++; k.lastSave = ball.shot; k.kickCD = 0.3; sfx(s, 'tackle'); }
      }
    }
  } else if (own.t !== t) {
    if (lb < 16 && Math.abs(ball.y - CY) < 12 && d(k, own) < 9) { tx = Math.min(lb - 1.2, 7); ty = ball.y; f = 1.1; } // 1대1: 각도 좁히기
    if (d(k, own) < 1.1 && k.tackleCD <= 0 && M.protect <= 0) { k.tackleCD = 0.4; if (s.rnd() < 0.5 * skill) { gain(s, k); own.kickCD = 0.5; } }
  }
  moveTo(k, wx(tx, t), ty, f, dt);
}
