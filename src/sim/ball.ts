import { W, H, CX, CY, GH, GZ, G, FA, FB } from './consts';
import { clamp, d, wx, angDiff } from './util';
import { DIFF } from '../data/teams';
import type { Sim, Player, Pred } from './types';
import { banner, sfx, crowdSwell, puff } from './events';
import { setPiece } from './match';

/* ---------- 공 소유·킥 ---------- */
/** 질주 드리블: 공을 2~3m 앞에 차 놓고 쫓아간다. 공이 발에서 떨어져 있는 동안은 상대가 끊을 수 있다 */
export function knockOn(s: Sim, p: Player) {
  const { ball } = s;
  const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(p.vy, p.vx), v = sp * 1.1 + 2.5;
  ball.owner = null; ball.x = clamp(p.x + Math.cos(a) * 0.8, 0.3, W - 0.3); ball.y = clamp(p.y + Math.sin(a) * 0.8, 0.3, H - 0.3); ball.z = 0; ball.vz = 0;
  ball.vx = Math.cos(a) * v; ball.vy = Math.sin(a) * v; ball.lastTouch = p.t; ball.kicker = p; ball.passTarget = null; ball.knock = p; ball.isShot = false; p.kickCD = 0.22; ball.spin += 0.5;
}
export function kick(s: Sim, p: Player, vx: number, vy: number, vz = 0) {
  const { ball, M, team } = s;
  ball.owner = null; ball.knock = null; ball.x = clamp(p.x + Math.cos(p.dir) * 0.8, 0.3, W - 0.3); ball.y = clamp(p.y + Math.sin(p.dir) * 0.8, 0.3, H - 0.3); ball.z = 0.01;
  ball.vx = vx; ball.vy = vy; ball.vz = vz; p.kickCD = 0.3; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; ball.isShot = false; sfx(s, 'kick');
  // 찬 순간의 오프사이드 위치 기록 (스로인은 제외)
  if (M.phase === 'live' || M.spType !== 'throw') { const line = offsideLine(s, p.t); for (const m of team[p.t]) m.offs = m !== p && wx(m.x, p.t) > line + 0.3; }
  else for (const m of team[p.t]) m.offs = false;
  if (Math.hypot(vx, vy) > 20) puff(s, ball.x, ball.y, 4, 2);
}
/** 팀 t 기준 좌표의 오프사이드 라인 (뒤에서 두 번째 상대 또는 공 위치, 상대 진영에서만) */
export function offsideLine(s: Sim, t: number) {
  const xs = s.team[1 - t].map(o => wx(o.x, t)).sort((a, b) => b - a); return Math.max(xs[1] || 0, wx(s.ball.x, t), 52.5);
}
export function offside(s: Sim, p: Player) {
  const { M, players } = s;
  const t = p.t; M.stats.offs[t]++;
  banner(s, 'OFFSIDE', `${M.teams[t].name} ${p.num}번`, 1400); sfx(s, 'whistle');
  for (const q of players) q.offs = false;
  setPiece(s, 'freekick', 1 - t, clamp(p.x, 1, W - 1), clamp(p.y, 1, H - 1));
}
export function gain(s: Sim, p: Player) {
  const { ball, M, players, HU } = s;
  if (p.offs && M.phase === 'live' && ball.kicker && ball.kicker.t === p.t && ball.kicker !== p) { offside(s, p); return; }
  for (const q of players) q.offs = false;
  ball.owner = p; ball.knock = null; ball.lastTouch = p.t; ball.passTarget = null; ball.isShot = false; ball.z = 0; ball.vz = 0; p.holdT = 0; p.decT = Math.max(p.decT, 0.15);
  if (p.role === 'GK') p.dir = p.t === 0 ? 0 : Math.PI;
  const h = HU[p.t]; if (h && p.role !== 'GK') { h.ctrl = p; h.lock = 0; }
}

/* ---------- 지면 패스 모델 ----------
   공 마찰은 dv/dt=-(FA+FB·v) (updateBall과 동일). 거리 s를 굴러가 v1로 도착하는 초기 속도와 걸리는 시간을 닫힌 식으로 구한다 */
export const groundTime = (v0: number, v1: number) => Math.log((v0 + FA / FB) / (v1 + FA / FB)) / FB;
export const groundDist = (v0: number, v1: number) => (v0 - v1) / FB - (FA / FB) * groundTime(v0, v1);
export function groundSpeed(dist: number, v1: number) {
  let lo = v1, hi = 34;
  for (let i = 0; i < 16; i++) { const v = (lo + hi) / 2; if (groundDist(v, v1) < dist) lo = v; else hi = v; }
  return (lo + hi) / 2;
}
const lead = (m: Player, t: number) => ({ x: clamp(m.x + m.vx * t * 0.9, 1, W - 1), y: clamp(m.y + m.vy * t * 0.9, 1, H - 1) });
/** 받는 선수가 공 도착 시점에 있을 자리와, 거기 맞춘 초기 속도 */
export function groundLead(p: Player, m: Player, arrive: number) {
  let L = { x: m.x, y: m.y }, q = d(p, m), v = 0, t = 0;
  for (let i = 0; i < 3; i++) { v = groundSpeed(q, arrive); t = groundTime(v, arrive); L = lead(m, t); q = Math.hypot(L.x - p.x, L.y - p.y); }
  return { x: L.x, y: L.y, v, t };
}
export const leadPos = (p: Player, m: Player) => groundLead(p, m, 11);
export function laneRisk(s: Sim, p: Player, tg: { x: number; y: number }, t: number) {
  const ax = tg.x - p.x, ay = tg.y - p.y, L2 = ax * ax + ay * ay || 1; let r = 0;
  for (const o of s.team[1 - t]) {
    const u = ((o.x - p.x) * ax + (o.y - p.y) * ay) / L2; if (u < 0.05 || u > 1.05) continue;
    const q = Math.hypot(o.x - (p.x + ax * u), o.y - (p.y + ay * u)); if (q < 2) r += (2 - q) / 2 + 0.3;
  }
  return r;
}
export function passTo(s: Sim, p: Player, m: Player, loft: boolean) {
  const { ball, HU } = s;
  let q = d(p, m);
  if (loft || q > 34) { // 로빙: 체공 시간으로 리드
    let L = { x: m.x, y: m.y }, T = 0.9, vz = 6;
    for (let i = 0; i < 3; i++) { L = lead(m, T); q = Math.hypot(L.x - p.x, L.y - p.y) || 1; vz = clamp(q * 0.24, 4.5, 9.5); T = 2 * vz / G; }
    const dx = L.x - p.x, dy = L.y - p.y, v = q / T * 1.08; p.dir = Math.atan2(dy, dx); kick(s, p, dx / q * v, dy / q * v, vz);
  } else { // 지면: 받는 자리에 11m/s로 도착
    const g = groundLead(p, m, 11), dx = g.x - p.x, dy = g.y - p.y, gv = Math.max(14, g.v); q = Math.hypot(dx, dy) || 1;
    p.dir = Math.atan2(dy, dx); kick(s, p, dx / q * gv, dy / q * gv, 0);
  }
  ball.passTarget = m;
  const h = HU[p.t]; if (h && m.role !== 'GK') { h.ctrl = m; h.lock = 0.5; } // 커서는 차는 순간 받는 선수로
}
export function shortPass(s: Sim, p: Player, ang: number) {
  const ax = Math.cos(ang), ay = Math.sin(ang); let best: Player | null = null, bs = -1e9;
  for (const minC of [0.45, 0.1, -1]) { // 조준 방향 안에 없으면 각도를 넓히고, 그래도 없으면 방향에 가장 가까운 동료에게라도 준다
    for (const m of s.team[p.t]) {
      if (m === p) continue; const L = leadPos(p, m), dx = L.x - p.x, dy = L.y - p.y, q = Math.hypot(dx, dy);
      if (q < 2.5 || q > (minC < 0 ? 45 : 32)) continue; const c = (dx * ax + dy * ay) / q; if (c < minC) continue;
      const sc = c * 3 - Math.abs(q - 13) / 16 - laneRisk(s, p, L, p.t) * 1.3 - (m.role === 'GK' ? 2 : 0);
      if (sc > bs) { bs = sc; best = m; }
    }
    if (best) break;
  }
  if (best) passTo(s, p, best, false); else { p.dir = ang; kick(s, p, ax * 13, ay * 13, 0); }
}
export function longPass(s: Sim, p: Player, ang: number) {
  const t = p.t, ax = Math.cos(ang), ay = Math.sin(ang), lx = wx(p.x, t), wide = Math.abs(p.y - CY) > 13 && lx > 72;
  let best: Player | null = null, bs = -1e9;
  for (const m of s.team[t]) {
    if (m === p || m.role === 'GK') continue; const L = leadPos(p, m), dx = L.x - p.x, dy = L.y - p.y, q = Math.hypot(dx, dy);
    if (q < 10 || q > 60) continue;
    let sc: number;
    if (wide) { const mlx = wx(L.x, t); if (mlx < 84 || Math.abs(L.y - CY) > 16) continue; let open = 99; for (const o of s.team[1 - t]) open = Math.min(open, d(o, L)); sc = Math.min(open, 6) + mlx / 20; }
    else { const c = (dx * ax + dy * ay) / q; if (c < 0.4) continue; sc = c * 3 + q / 25 - laneRisk(s, p, L, t) * 0.3; }
    if (sc > bs) { bs = sc; best = m; }
  }
  if (best) passTo(s, p, best, true); else { p.dir = ang; kick(s, p, ax * 20, ay * 20, 7); }
}
/** 스루패스: 조준 방향(±12° 보정)으로 공을 차고, 그 공 선로에 가장 먼저 뛰어들 수 있는 동료를 받는 선수로 정한다.
    동료 위치가 아니라 "선로 위의 만나는 지점"을 찾으므로 찬 방향과 공이 가는 방향이 늘 일치한다. 속도는 빠른 것부터 시도해 닿을 수 있는 가장 빠른 공을 찬다 */
export function throughPass(s: Sim, p: Player, ang: number) {
  const t = p.t; let best: { sc: number; m: Player; a: number; v: number } | null = null;
  for (const off of [0, -0.21, 0.21]) {
    const a = ang + off, ax = Math.cos(a), ay = Math.sin(a);
    for (const m of s.team[t]) {
      if (m === p || m.role === 'GK') continue;
      const rx = m.x - p.x, ry = m.y - p.y, rq = Math.hypot(rx, ry); if (rq < 2 || rq > 45) continue;
      if ((rx * ax + ry * ay) / rq < 0.6) continue; // 선로 기준 ±53° 밖의 동료는 제외
      for (const v0 of [26, 22, 18, 15]) {
        let v = v0, dist = 0, meet: { x: number; y: number; s: number; tt: number } | null = null;
        for (let tt = 0.1; tt <= 2.6; tt += 0.1) { // 0.1초 간격으로 공을 따라가며 동료가 먼저 닿는 첫 지점
          v = Math.max(0, v - (FA + FB * v) * 0.1); dist += v * 0.1;
          const bx = p.x + ax * dist, by = p.y + ay * dist; if (bx < 0.5 || bx > W - 0.5 || by < 0.5 || by > H - 0.5) break;
          if (Math.hypot(m.x + m.vx * tt * 0.5 - bx, m.y + m.vy * tt * 0.5 - by) <= m.speed * 1.2 * tt + 0.8) { meet = { x: bx, y: by, s: dist, tt }; break; }
        }
        if (!meet) continue;
        let open = 99; for (const o of s.team[1 - t]) open = Math.min(open, Math.hypot(o.x + o.vx * meet.tt * 0.5 - meet.x, o.y + o.vy * meet.tt * 0.5 - meet.y));
        // 선로 방향으로 이미 뛰는 동료 우대, 오프사이드 동료 감점
        const sc = (wx(meet.x, t) - wx(p.x, t)) / 10 + Math.min(open, 8) / 3 - meet.tt * 0.6 - laneRisk(s, p, meet, t) * 1.2 + v0 * 0.04 - (off ? 0.5 : 0) + Math.max(0, m.vx * ax + m.vy * ay) / 4 - (wx(m.x, t) > offsideLine(s, t) + 0.3 ? 3 : 0);
        if (!best || sc > best.sc) best = { sc, m, a, v: v0 };
        break; // 이 동료에겐 닿는 가장 빠른 공만 본다
      }
    }
  }
  if (!best) { shortPass(s, p, ang); return; } // 뛰어들 동료가 없으면 숏패스로
  p.dir = best.a; kick(s, p, Math.cos(best.a) * best.v, Math.sin(best.a) * best.v, 0); s.ball.passTarget = best.m;
  const h = s.HU[t]; if (h) { h.ctrl = best.m; h.lock = 0.6; }
}
export function chipShot(s: Sim, p: Player) {
  const { ball, M, team } = s;
  const t = p.t, gx = t === 0 ? W : 0, k = team[1 - t][0];
  const L = Math.abs(gx - ball.x) + 0.8, T = clamp(L / 15, 0.9, 1.5), vz = G * T / 2, sp = L / T;
  const ty = CY + (s.rnd() - 0.5) * 3 + (k.y < CY ? 1.2 : -1.2);
  const dx = gx - ball.x, dy = ty - ball.y, q = Math.hypot(dx, dy) || 1;
  p.dir = Math.atan2(dy, dx); kick(s, p, dx / q * sp, dy / q * sp, vz); ball.isShot = true; M.stats.shots[t]++; M.stats.onT[t]++; k.reactT = 0.3;
}
export function shoot(s: Sim, p: Player, power: number, aimY: number) {
  const { ball, M, team, HU } = s;
  const t = p.t, T = M.teams[t], gx = t === 0 ? W + 0.3 : -0.3;
  const dist = Math.hypot(gx - p.x, CY - p.y);
  const kp = team[1 - t][0];
  let ty = CY + (Math.abs(aimY) > 0.2 ? Math.sign(aimY) * 2.7 : (kp.y < CY ? 1 : -1) * 2.4); // 조준 없으면 키퍼 반대쪽 포스트 안쪽
  let err = (s.rnd() * 2 - 1) * (0.35 + dist * 0.05) * (1.25 - T.atk / 100) * (1 + power * 0.5);
  if (power > 0.85) err *= 1 + (power - 0.85) * 4; // 끝까지 채우면 조금 더 흔들린다
  if (!HU[t]) err *= DIFF[M.diff].err;
  ty = clamp(ty + err, CY - GH - 1.5, CY + GH + 1.5);
  const sp = 17 + 17 * power, dx = gx - ball.x, dy = ty - ball.y, q = Math.hypot(dx, dy);
  let vz = 1 + power * 4 * (0.3 + s.rnd() * 0.6); if (power > 0.85) vz *= 1.25; // 최고 높이 1m 안팎
  p.dir = Math.atan2(dy, dx); kick(s, p, dx / q * sp, dy / q * sp, vz); ball.isShot = true;
  kp.reactT = (HU[1 - t] ? 0.24 : 0.26 / DIFF[M.diff].gk) * (dist < 12 ? 0.8 : 1); // 키퍼 반응 지연
  M.stats.shots[t]++; if (Math.abs(ty - CY) < GH) M.stats.onT[t]++;
  if (dist < 30) crowdSwell(s, 0.1, 1.2);
}

/* ---------- 태클·파울 ---------- */
export function slideTackle(s: Sim, p: Player, ang: number) {
  if (p.slide > 0 || p.stun > 0 || p.tackleCD > 0) return;
  p.slide = 0.55; p.tackleCD = 0.9; p.vx = Math.cos(ang) * 11; p.vy = Math.sin(ang) * 11; p.dir = ang; sfx(s, 'tackle'); puff(s, p.x, p.y, 8, 3);
}
export function slideCheck(s: Sim, p: Player) {
  const { ball, M } = s;
  const o = ball.owner;
  if (!o) {
    if (d(p, ball) < 1.2 && ball.z < 0.8 && p.kickCD <= 0) { const a = Math.atan2(p.vy, p.vx); ball.vx = Math.cos(a) * 12; ball.vy = Math.sin(a) * 12; ball.vz = 1.5; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; p.kickCD = 0.4; }
    return;
  }
  if (o.t === p.t || o.role === 'GK' || M.protect > 0) return;
  const q = d(p, o); if (q > 1.8) return;
  const ba = Math.atan2(ball.y - p.y, ball.x - p.x), ma = Math.atan2(p.vy, p.vx);
  const behind = Math.cos(o.dir) * Math.cos(ma) + Math.sin(o.dir) * Math.sin(ma) > 0.6 && d(p, ball) > q;
  const win = !behind && Math.abs(angDiff(ma, ba)) < 1.1 && s.rnd() < 0.62 + (M.teams[p.t].def - 80) / 50;
  p.slide = 0; p.stun = 0.7;
  if (win) { ball.owner = null; ball.vx = Math.cos(ma) * 9; ball.vy = Math.sin(ma) * 9; ball.vz = 1.5; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; o.stun = 0.5; o.kickCD = 0.5; p.kickCD = 0.3; }
  else { o.stun = 0.6; foul(s, p, o); }
}
export function foul(s: Sim, by: Player, on: Player) {
  const t = on.t; s.M.stats.fouls[by.t]++;
  const inBox = wx(on.x, t) > W - 16.5 && Math.abs(on.y - CY) < 20.16;
  if (inBox) setPiece(s, 'penalty', t, wx(W - 11, t), CY);
  else setPiece(s, 'freekick', t, clamp(on.x, 1, W - 1), clamp(on.y, 1, H - 1));
}
export function standTackle(s: Sim, p: Player) {
  const { ball, M } = s;
  const o = ball.owner; if (!o || o.t === p.t || o.role === 'GK' || p.tackleCD > 0 || M.protect > 0) return;
  const q = d(p, o); if (q > 2.4) return; p.tackleCD = 0.5;
  const ux = (o.x - p.x) / (q || 1), uy = (o.y - p.y) / (q || 1); p.vx = ux * p.speed * 1.3; p.vy = uy * p.speed * 1.3; p.dir = Math.atan2(uy, ux); // 발을 뻗는 런지
  const front = Math.cos(o.dir) * (p.x - o.x) + Math.sin(o.dir) * (p.y - o.y) > 0;
  if (s.rnd() < (front ? 0.7 : 0.5) + (M.teams[p.t].def - 80) / 60) { gain(s, p); o.stun = 0.45; o.kickCD = 0.5; sfx(s, 'tackle'); } else p.stun = 0.3;
}

/* ---------- 공 물리 ---------- */
export function computePred(s: Sim) {
  const { ball, pred } = s;
  pred.length = 0; let x = ball.x, y = ball.y, z = ball.z, vx = ball.vx, vy = ball.vy, vz = ball.vz; const PDT = 0.05;
  for (let i = 0; i < 60; i++) {
    if (z > 0 || vz > 0) { vz -= G * PDT; z += vz * PDT; vx *= 1 - 0.12 * PDT; vy *= 1 - 0.12 * PDT; if (z <= 0) { z = 0; vz = vz < -2 ? -vz * 0.45 : 0; } }
    else { const sp = Math.hypot(vx, vy); if (sp > 0) { const ns = Math.max(0, sp - (FA + FB * sp) * PDT); vx *= ns / sp; vy *= ns / sp; } }
    x += vx * PDT; y += vy * PDT; pred.push({ x: clamp(x, -1, W + 1), y: clamp(y, -1, H + 1), z, t: (i + 1) * PDT });
  }
}
export function interceptT(s: Sim, p: Player) {
  const sp = p.speed * 1.25;
  for (const q of s.pred) if (q.z < 1.8 && Math.hypot(q.x - p.x, q.y - p.y) <= sp * q.t + 0.6) return q.t;
  const q = s.pred[s.pred.length - 1]; return q ? q.t + Math.hypot(q.x - p.x, q.y - p.y) / sp : 0;
}
export function intercept(s: Sim, p: Player): { x: number; y: number } {
  const { ball, pred } = s;
  if (ball.owner || !pred.length) return ball; const sp = p.speed * 1.25;
  for (const q of pred) if (q.z < 1.8 && Math.hypot(q.x - p.x, q.y - p.y) <= sp * q.t + 0.6) return q;
  return pred[pred.length - 1] as Pred;
}
export function updateBall(s: Sim, dt: number) {
  const { ball, M, HU, INP } = s;
  const o = ball.owner;
  if (o) {
    const h = HU[o.t], osp = Math.hypot(o.vx, o.vy), spr = h && h.ctrl === o && INP[o.t].down.sprint && osp > 4, ah = spr ? 1.1 : 0.75; // 질주 드리블은 공을 더 앞에
    ball.x = o.x + Math.cos(o.dir) * ah; ball.y = o.y + Math.sin(o.dir) * ah; ball.z = 0; ball.vx = o.vx; ball.vy = o.vy; ball.vz = 0; ball.spin += osp * dt * 3; return;
  }
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= G * dt; ball.z += ball.vz * dt; ball.vx *= 1 - 0.12 * dt; ball.vy *= 1 - 0.12 * dt;
    if (ball.z <= 0) { ball.z = 0; if (ball.vz < -2) { ball.vz = -ball.vz * 0.45; ball.vx *= 0.85; ball.vy *= 0.85; } else ball.vz = 0; }
  } else { const sp = Math.hypot(ball.vx, ball.vy); if (sp > 0) { const ns = Math.max(0, sp - (FA + FB * sp) * dt); ball.vx *= ns / sp; ball.vy *= ns / sp; } }
  const px = ball.x; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.spin += Math.hypot(ball.vx, ball.vy) * dt * 3;
  // 골포스트·크로스바
  for (const gx of [0, W]) {
    if ((px - gx) * (ball.x - gx) <= 0 && px !== ball.x) {
      const yy = ball.y, inY = Math.abs(yy - CY) < GH;
      if (inY && ball.z > GZ && ball.z < GZ + 0.35) { ball.vz = -Math.abs(ball.vz) * 0.5 - 2; ball.vx *= -0.5; ball.x = px; sfx(s, 'post'); }
      else if (!inY && Math.abs(Math.abs(yy - CY) - GH) < 0.3 && ball.z < GZ + 0.3) { ball.vx *= -0.55; ball.vy *= 0.6; ball.x = px; sfx(s, 'post'); }
    }
  }
  if (M.phase === 'goal') { // 그물 안에서 튕김
    if (ball.x < -2) { ball.x = -2; ball.vx *= -0.2; } if (ball.x > W + 2) { ball.x = W + 2; ball.vx *= -0.2; }
    if ((ball.x < 0 || ball.x > W) && Math.abs(ball.y - CY) > GH - 0.2) { ball.y = CY + Math.sign(ball.y - CY) * (GH - 0.2); ball.vy *= -0.2; }
    if ((ball.x < 0 || ball.x > W) && ball.z > GZ - 0.2) { ball.z = GZ - 0.2; ball.vz = -Math.abs(ball.vz) * 0.3; }
  }
}
/** 트래핑·헤딩. 동료에게 가는 패스는 받는 선수 외의 우리 편(패서 포함)은 건드리지 않는다 */
export function ballControl(s: Sim) {
  const { ball, M, players } = s;
  if (ball.owner) return;
  const sp = Math.hypot(ball.vx, ball.vy); let best: Player | null = null, bd = 1e9;
  const pt = ball.passTarget;
  for (const p of players) {
    if (p.kickCD > 0 || p.stun > 0) continue; const gk = p.role === 'GK', mine = pt === p; if (ball.z > (gk ? 2.4 : mine ? 2.2 : 1.7)) continue;
    if (pt && !mine && pt.t === p.t && !gk && sp > 5) continue;
    const q = d(p, ball), reach = gk ? 1.1 : mine ? 1.5 : 0.95; if (q < reach && q < bd) { bd = q; best = p; }
  }
  if (!best) return;
  if (ball.z > 0.9 && best.role !== 'GK') { // 헤딩 / 가슴 트래핑
    const t = best.t, gx = t === 0 ? W : 0; const dG = Math.hypot(gx - best.x, CY - best.y), mine = ball.passTarget === best;
    if (dG < 22 && sp > 8 && (!mine || ball.z > 1.5)) { const dx = gx - ball.x, dy = CY + (s.rnd() - 0.5) * 5 - ball.y, q = Math.hypot(dx, dy); ball.vx = dx / q * 16; ball.vy = dy / q * 16; ball.vz = -1; ball.lastTouch = t; ball.kicker = best; ball.shot++; ball.isShot = true; best.kickCD = 0.3; M.stats.shots[t]++; sfx(s, 'kick'); }
    else { ball.vx *= 0.2; ball.vy *= 0.2; ball.vz = 0; ball.z = 0; gain(s, best); }
    return;
  }
  const toMe = ball.passTarget === best; // 자기한테 온 패스는 더 빠른 공도 받아낸다
  if (sp < (toMe ? 30 : 21) || (best.role === 'GK' && sp < 23)) gain(s, best);
  else if (best.role !== 'GK') { const a = Math.atan2(ball.vy, ball.vx) + (s.rnd() - 0.5) * (toMe ? 0.6 : 1.4), ns = sp * (toMe ? 0.22 : 0.35); ball.vx = Math.cos(a) * ns; ball.vy = Math.sin(a) * ns; ball.vz = toMe ? 0.8 : 2; ball.lastTouch = best.t; best.kickCD = 0.2; ball.kicker = best; ball.shot++; ball.passTarget = null; }
}
export const inBoxOf = (x: number, y: number, t: number) => wx(x, t) > W - 16.5 && Math.abs(y - CY) < 20.16;
export { CX };
