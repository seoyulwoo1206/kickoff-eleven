import { W, H, CY } from './consts';
import { clamp, wx, angApproach, angDiff } from './util';
import type { Sim, Player } from './types';
import { offsideLine } from './ball';

/* 움직임 모델: 정지에서 8.5m/s²로 가속(빠를수록 둔해짐), 감속은 11m/s². 회전 속도는 빠를수록 느려 전력질주 중엔 크게 돈다.
   가려는 방향과 현재 방향이 많이 다르면 속도를 줄여서 돈다 */
export function steer(p: Player, dvx: number, dvy: number, dt: number) {
  const sp = Math.hypot(p.vx, p.vy), dsp = Math.hypot(dvx, dvy);
  const A = p.attrs, nAcc = (A.acc - 50) / 50, nAgi = (A.agi - 50) / 50, nBal = (A.bal - 50) / 50;
  if (dsp < 0.05) { const dec = (sp > 7 ? 8 : 10 + nBal * 2) * dt; if (sp <= dec) { p.vx = p.vy = 0; } else { p.vx -= p.vx / sp * dec; p.vy -= p.vy / sp * dec; } return; } // 질주하다 멈추면 조금 미끄러진다
  const ag = p.role === 'GK' ? 1.7 : 1; // 키퍼는 짧은 거리 반응이 빠르다
  const ta = Math.atan2(dvy, dvx); let ca = sp > 0.3 ? Math.atan2(p.vy, p.vx) : ta;
  const turn = clamp((14 + nAgi * 4) - sp * (1.25 - nAgi * 0.3), 3.6, 18) * ag * dt; ca = angApproach(ca, ta, turn); // 민첩할수록 빠르게·질주 중에도 잘 돈다
  const df = Math.abs(angDiff(ca, ta));
  const want = dsp * Math.max(0.3, Math.cos(df));
  const acc = (want > sp ? Math.max(3, (7.3 + nAcc * 2.4) - sp * 0.35) : 10 + nBal * 2) * ag * dt * (p.burst > 0 ? 1.4 : 1);
  const ns = want > sp ? Math.min(want, sp + acc) : Math.max(want, sp - acc);
  p.vx = Math.cos(ca) * ns; p.vy = Math.sin(ca) * ns;
}
/** 움직이는 공을 쫓을 땐 끝까지 전속 */
export function chase(p: Player, tx: number, ty: number, f: number, dt: number) {
  const dx = tx - p.x, dy = ty - p.y, q = Math.hypot(dx, dy); if (q < 0.3) { steer(p, 0, 0, dt); return; }
  const sp = p.speed * f * (p.stun > 0 ? 0.4 : 1); steer(p, dx / q * sp, dy / q * sp, dt);
}
/** 정지 목표: 가까워지면 감속 */
export function moveTo(p: Player, tx: number, ty: number, f: number, dt: number) {
  const dx = tx - p.x, dy = ty - p.y, q = Math.hypot(dx, dy); if (q < 0.25) { steer(p, 0, 0, dt); return; }
  const sp = Math.min(p.speed * f * (p.stun > 0 ? 0.4 : 1), q * 2.6); steer(p, dx / q * sp, dy / q * sp, dt);
}
/** 대형 위치: 공 위치에 따라 블록이 움직이고, 공격 땐 FW는 공보다 앞, MF는 공 근처까지 전진. 오프사이드 라인 뒤에 선다 */
export function targetFor(s: Sim, p: Player, att: boolean, def: boolean) {
  const { ball, M } = s;
  const t = p.t, lb = wx(ball.x, t), tac = M.tac[t];
  let x = p.bx + (lb - 52.5) * 0.62 + (att ? 10 : def ? -3 : 0) + (att && p.role === 'FW' ? 6 : 0) + tac.line * (p.role === 'DF' ? 6 : p.role === 'MF' ? 4 : 2); // 라인 높이
  if (att) { if (p.role === 'FW') x = Math.max(x, lb + 9); else if (p.role === 'MF') x = Math.max(x, lb - 4); }
  let y = p.by + (ball.y - CY) * (p.role === 'DF' ? 0.3 : 0.45);
  const wideSide = Math.abs(p.by - CY) > 14, sameSide = (p.by - CY) * (ball.y - CY) > 0;
  if (att && wideSide) {
    if ((p.pos === 'LB' || p.pos === 'RB') && sameSide && lb > 50) x += 12; // 풀백 오버래핑 (공이 자기 쪽일 때)
    if ((p.pos === 'LW' || p.pos === 'RW' || p.pos === 'LM' || p.pos === 'RM') && lb > 55) { x += 6; y += (CY - p.by) * 0.25; } // 윙어 침투: 안쪽으로 파고든다
    if (tac.style === 'wide') y += (p.by - CY) * 0.15; // 측면 전술: 더 넓게
  }
  if (att && p.role === 'FW' && tac.style === 'counter') x += 4;
  if (!att && tac.style === 'possession' && p.role === 'MF') x -= 2;
  x += Math.sin(M.time * 0.6 + p.i * 1.7) * 1.1; y += Math.cos(M.time * 0.5 + p.i * 2.3) * 1.1;
  if (att || (!ball.owner && ball.lastTouch === t)) { const line = offsideLine(s, t); if (x > line - 0.8) x = line - 0.8; }
  const lim = ({ DF: [7, 68], MF: [14, 86], FW: [22, 99], GK: [0, 20] } as Record<string, [number, number]>)[p.role];
  return { x: wx(clamp(x, lim[0], lim[1]), t), y: clamp(y, 2, H - 2) };
}
/** 위치 적분 + 선수끼리 겹침 밀어내기 */
export function integrate(s: Sim, dt: number) {
  const { players, ball } = s;
  for (const p of players) {
    p.x = clamp(p.x + p.vx * dt, -2.5, W + 2.5); p.y = clamp(p.y + p.vy * dt, -2.5, H + 2.5);
    const sp = Math.hypot(p.vx, p.vy); if (sp > 0.5) p.dir = angApproach(p.dir, Math.atan2(p.vy, p.vx), (ball.owner === p ? 9 : 16) * dt); p.run += sp * dt;
  }
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j], dx = b.x - a.x, dy = b.y - a.y, q2 = dx * dx + dy * dy;
      if (q2 < 1.21 && q2 > 1e-6) { const q = Math.sqrt(q2), push = (1.1 - q) / 2, ux = dx / q, uy = dy / q; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
    }
  }
}
