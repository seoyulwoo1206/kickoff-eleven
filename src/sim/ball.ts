import { W, H, CX, CY, GH, GZ, G, FA, FB } from './consts';
import { clamp, d, wx, angDiff } from './util';
import { DIFF } from '../data/teams';
import type { Sim, Player, Pred } from './types';
import { banner, sfx, crowdSwell, puff } from './events';
import { setPiece } from './match';
import { foulCommitted } from './rules';

/** 능력치 정규화: 50 → 0, 100 → 1, 0 → -1 */
export const n = (v: number) => (v - 50) / 50;
/** 가장 가까운 상대까지 거리로 압박도 0~1 (2.5m 안이면 1) */
export function pressure(s: Sim, p: Player) { let nd = 1e9; for (const o of s.team[1 - p.t]) if (!o.off) nd = Math.min(nd, d(o, p)); return clamp(1 - (nd - 1) / 2.5, 0, 1); }

/* ---------- 공 소유·킥 ---------- */
/** 질주 드리블: 공을 앞에 차 놓고 쫓아간다. 볼컨트롤이 높을수록 짧고 정확 */
export function knockOn(s: Sim, p: Player) {
  const { ball, M } = s;
  let nd = 1e9; for (const o of s.team[1 - p.t]) if (!o.off) nd = Math.min(nd, d(o, p));
  const close = nd < 3.5; // 상대가 가까우면 공을 짧게 차 놓는다 (긴 터치는 바로 뺏긴다)
  const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(p.vy, p.vx) + (s.rnd() - 0.5) * (0.12 - n(p.attrs.ctl) * 0.08), v = sp * 1.0 + (close ? 1.0 : 2.4) - n(p.attrs.ctl) * 1.0; // 공이 2~3m 앞에서 다시 발에 붙을 정도
  if (!s.HU[1 - p.t]) M.react[1 - p.t] = Math.max(M.react[1 - p.t], DIFF[M.diff].react * 0.3); // 상대 AI는 터치를 읽는 데 잠깐 걸린다 (0.5면 AI끼리 골 1.57, 0이면 .95)
  ball.owner = null; ball.x = clamp(p.x + Math.cos(a) * 0.8, 0.3, W - 0.3); ball.y = clamp(p.y + Math.sin(a) * 0.8, 0.3, H - 0.3); ball.z = 0; ball.vz = 0;
  ball.vx = Math.cos(a) * v; ball.vy = Math.sin(a) * v; ball.lastTouch = p.t; ball.kicker = p; ball.passTarget = null; ball.knock = p; ball.isShot = false; ball.curl = 0; p.kickCD = close ? 0.15 : 0.22; ball.spin += 0.5;
}
export function kick(s: Sim, p: Player, vx: number, vy: number, vz = 0, curl = 0) {
  const { ball, M, team } = s;
  ball.owner = null; ball.knock = null; ball.x = clamp(p.x + Math.cos(p.dir) * 0.8, 0.3, W - 0.3); ball.y = clamp(p.y + Math.sin(p.dir) * 0.8, 0.3, H - 0.3); ball.z = 0.01;
  ball.vx = vx; ball.vy = vy; ball.vz = vz; ball.curl = curl; p.kickCD = 0.3; p.kickWind = 0; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; ball.isShot = false; sfx(s, 'kick');
  if (!s.HU[1 - p.t]) M.react[1 - p.t] = DIFF[M.diff].react * 0.8; // 상대 AI는 패스를 읽는 데 잠깐 걸린다
  // 찬 순간의 오프사이드 위치 기록 (스로인은 제외)
  if (M.phase === 'live' || M.spType !== 'throw') { const line = offsideLine(s, p.t); for (const m of team[p.t]) m.offs = m !== p && wx(m.x, p.t) > line + 0.3; }
  else for (const m of team[p.t]) m.offs = false;
  if (Math.hypot(vx, vy) > 20) puff(s, ball.x, ball.y, 4, 2);
}
/** 킥 와인드업: 0.1초 뒤에 실행 (애니메이션 발 접촉 프레임에 공이 출발). 그 사이 공을 잃으면 취소 */
export function queueKick(s: Sim, p: Player, fn: () => void, wind = 0.1) {
  if (p.kickWind > 0) return; // 이미 차는 중
  p.kickWind = wind; p.pending = fn;
}
export function runPending(s: Sim, p: Player, dt: number) {
  if (p.kickWind <= 0 || !p.pending) return;
  p.kickWind -= dt;
  if (s.ball.owner !== p) { p.kickWind = 0; p.pending = null; return; }
  if (p.kickWind <= 0) { const fn = p.pending; p.pending = null; p.kickWind = 0; fn(); }
}
/** 팀 t 기준 좌표의 오프사이드 라인 (뒤에서 두 번째 상대 또는 공 위치, 상대 진영에서만) */
export function offsideLine(s: Sim, t: number) {
  const xs = s.team[1 - t].filter(o => !o.off).map(o => wx(o.x, t)).sort((a, b) => b - a); return Math.max(xs[1] || 0, wx(s.ball.x, t), 52.5);
}
export function offside(s: Sim, p: Player) {
  const { M, players } = s;
  const t = p.t; M.stats.offs[t]++;
  banner(s, 'OFFSIDE', `${M.teams[t].name} ${p.name}`, 1400); sfx(s, 'whistle');
  for (const q of players) q.offs = false;
  setPiece(s, 'freekick', 1 - t, clamp(p.x, 1, W - 1), clamp(p.y, 1, H - 1));
}
export function gain(s: Sim, p: Player) {
  const { ball, M, players, HU } = s;
  if (p.offs && M.phase === 'live' && ball.kicker && ball.kicker.t === p.t && ball.kicker !== p) { offside(s, p); return; }
  for (const q of players) q.offs = false;
  if (ball.passTarget === p && ball.kicker && ball.kicker.t === p.t) M.stats.passC[p.t]++; // 패스 성공
  ball.owner = p; ball.knock = null; ball.lastTouch = p.t; ball.passTarget = null; ball.isShot = false; ball.z = 0; ball.vz = 0; ball.curl = 0; p.holdT = 0; p.decT = Math.max(p.decT, 0.15);
  if (p.role === 'GK') p.dir = p.t === 0 ? 0 : Math.PI;
  const h = HU[p.t]; if (h) { h.ctrl = p; h.lock = 0; } // 공을 잡은 선수에게 커서 (키퍼 포함)
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
    if (o.off) continue; const u = ((o.x - p.x) * ax + (o.y - p.y) * ay) / L2; if (u < 0.05 || u > 1.05) continue;
    const q = Math.hypot(o.x - (p.x + ax * u), o.y - (p.y + ay * u)); if (q < 2) r += (2 - q) / 2 + 0.3;
  }
  return r;
}
/** 패스 방향 오차 (rad): 패스 능력치·압박·약발·체력 */
function passErr(s: Sim, p: Player, long: boolean) {
  const skill = long ? p.attrs.lp : p.attrs.sp;
  const base = 0.01 + (1 - skill / 100) * 0.09, pr = pressure(s, p);
  const tired = p.sta < 0.4 ? (0.4 - p.sta) * 0.6 : 0;
  return (s.rnd() - 0.5) * 2 * base * (1 + pr * 0.6 + tired);
}
function rot(vx: number, vy: number, a: number): [number, number] { const c = Math.cos(a), si = Math.sin(a); return [vx * c - vy * si, vx * si + vy * c]; }
/** power 0~1: 숏패스 도착 속도 11→16m/s, 로빙은 더 멀리·세게 */
export function passTo(s: Sim, p: Player, m: Player, loft: boolean, power = 0) {
  const { ball, HU } = s;
  let q = d(p, m);
  const e = passErr(s, p, loft);
  if (loft || q > 34) { // 로빙: 체공 시간으로 리드
    let L = { x: m.x, y: m.y }, T = 0.9, vz = 6;
    for (let i = 0; i < 3; i++) { L = lead(m, T); q = Math.hypot(L.x - p.x, L.y - p.y) || 1; vz = clamp(q * 0.24, 4.5, 9.5); T = 2 * vz / G; }
    const dx = L.x - p.x, dy = L.y - p.y, v = q / T * (1.08 + power * 0.08); p.dir = Math.atan2(dy, dx) + e; const [kx, ky] = rot(dx / q * v, dy / q * v, e); kick(s, p, kx, ky, vz);
  } else { // 지면: 받는 자리에 11m/s(+세기)로 도착
    const g = groundLead(p, m, 11 + power * 5), dx = g.x - p.x, dy = g.y - p.y, gv = Math.max(14, g.v); q = Math.hypot(dx, dy) || 1;
    p.dir = Math.atan2(dy, dx) + e; const [kx, ky] = rot(dx / q * gv, dy / q * gv, e); kick(s, p, kx, ky, 0);
  }
  ball.passTarget = m; s.M.stats.passA[p.t]++;
  const h = HU[p.t]; if (h && m.role !== 'GK') { h.ctrl = m; h.lock = 0.5; } // 커서는 차는 순간 받는 선수로
}
export function shortPass(s: Sim, p: Player, ang: number, power = 0) {
  const ax = Math.cos(ang), ay = Math.sin(ang); let best: Player | null = null, bs = -1e9;
  const maxD = 32 + power * 10;
  for (const minC of [0.45, 0.1, -1]) { // 조준 방향 안에 없으면 각도를 넓히고, 그래도 없으면 방향에 가장 가까운 동료에게라도 준다
    for (const m of s.team[p.t]) {
      if (m === p || m.off) continue; const L = leadPos(p, m), dx = L.x - p.x, dy = L.y - p.y, q = Math.hypot(dx, dy);
      if (q < 2.5 || q > (minC < 0 ? 45 : maxD)) continue; const c = (dx * ax + dy * ay) / q; if (c < minC) continue;
      const sc = Math.min(c, 0.92) / 0.92 * 4 - Math.max(0, q - 9 - power * 20) / 16 - laneRisk(s, p, L, p.t) * 1.2 - (m.role === 'GK' ? 2 : 0) + (m.runT > 0 ? 0.8 : 0); // 조준 방향(±23° 안은 동점)이 가장 중요, 같은 방향이면 가까운 동료(탭) · 길게 누르면 먼 동료, 선로 위험은 참고만
      if (sc > bs) { bs = sc; best = m; }
    }
    if (best) break;
  }
  if (best) passTo(s, p, best, false, power); else { p.dir = ang; kick(s, p, ax * 13, ay * 13, 0); }
}
export function longPass(s: Sim, p: Player, ang: number, power = 0.5) {
  const t = p.t, ax = Math.cos(ang), ay = Math.sin(ang), lx = wx(p.x, t), wide = Math.abs(p.y - CY) > 13 && lx > 72;
  let best: Player | null = null, bs = -1e9;
  const maxD = 35 + power * 30;
  for (const m of s.team[t]) {
    if (m === p || m.role === 'GK' || m.off) continue; const L = leadPos(p, m), dx = L.x - p.x, dy = L.y - p.y, q = Math.hypot(dx, dy);
    if (q < 10 || q > maxD) continue;
    let sc: number;
    if (wide) { const mlx = wx(L.x, t); if (mlx < 84 || Math.abs(L.y - CY) > 16) continue; let open = 99; for (const o of s.team[1 - t]) open = Math.min(open, d(o, L)); sc = Math.min(open, 6) + mlx / 20; }
    else { const c = (dx * ax + dy * ay) / q; if (c < 0.4) continue; sc = c * 3 + q / 25 - laneRisk(s, p, L, t) * 0.3 - Math.abs(q - (20 + power * 35)) / 30; }
    if (sc > bs) { bs = sc; best = m; }
  }
  if (best) passTo(s, p, best, true, power); else { p.dir = ang; kick(s, p, ax * (16 + power * 10), ay * (16 + power * 10), 6 + power * 3); }
}
/** 스루패스: 조준 방향(±12° 보정)으로 공을 차고, 그 공 선로에 가장 먼저 뛰어들 수 있는 동료를 받는 선수로 정한다 */
export function throughPass(s: Sim, p: Player, ang: number, power = 0) {
  const t = p.t; let best: { sc: number; m: Player; a: number; v: number } | null = null;
  const speeds = power > 0.5 ? [30, 26, 22, 18] : [26, 22, 18, 15];
  for (const off of [0, -0.21, 0.21]) {
    const a = ang + off, ax = Math.cos(a), ay = Math.sin(a);
    for (const m of s.team[t]) {
      if (m === p || m.role === 'GK' || m.off) continue;
      const rx = m.x - p.x, ry = m.y - p.y, rq = Math.hypot(rx, ry); if (rq < 2 || rq > 45) continue;
      if ((rx * ax + ry * ay) / rq < 0.6) continue; // 선로 기준 ±53° 밖의 동료는 제외
      for (const v0 of speeds) {
        let v = v0, dist = 0, meet: { x: number; y: number; s: number; tt: number } | null = null;
        for (let tt = 0.1; tt <= 2.6; tt += 0.1) {
          v = Math.max(0, v - (FA + FB * v) * 0.1); dist += v * 0.1;
          const bx = p.x + ax * dist, by = p.y + ay * dist; if (bx < 0.5 || bx > W - 0.5 || by < 0.5 || by > H - 0.5) break;
          if (Math.hypot(m.x + m.vx * tt * 0.5 - bx, m.y + m.vy * tt * 0.5 - by) <= m.speed * 1.2 * tt + 0.8) { meet = { x: bx, y: by, s: dist, tt }; break; }
        }
        if (!meet) continue;
        let open = 99; for (const o of s.team[1 - t]) open = Math.min(open, Math.hypot(o.x + o.vx * meet.tt * 0.5 - meet.x, o.y + o.vy * meet.tt * 0.5 - meet.y));
        const sc = (wx(meet.x, t) - wx(p.x, t)) / 10 + Math.min(open, 8) / 3 - meet.tt * 0.6 - laneRisk(s, p, meet, t) * 1.2 + v0 * 0.04 - (off ? 0.5 : 0) + Math.max(0, m.vx * ax + m.vy * ay) / 4 - (wx(m.x, t) > offsideLine(s, t) + 1.0 ? 3 : 0) + ((rx * Math.cos(ang) + ry * Math.sin(ang)) / rq) * 2.5 + (m.runT > 0 ? 1.5 : 0); // 조준 방향에 있는 동료·침투 중인 동료 우대
        if (!best || sc > best.sc) best = { sc, m, a, v: v0 };
        break;
      }
    }
  }
  if (!best) { shortPass(s, p, ang, power); return; } // 뛰어들 동료가 없으면 숏패스로
  const e = passErr(s, p, false) * 0.8;
  p.dir = best.a + e; kick(s, p, Math.cos(best.a + e) * best.v, Math.sin(best.a + e) * best.v, 0); s.ball.passTarget = best.m; s.M.stats.passA[t]++;
  const h = s.HU[t]; if (h) { h.ctrl = best.m; h.lock = 0.6; }
}
export function chipShot(s: Sim, p: Player) {
  const { ball, M, team } = s;
  const t = p.t, gx = t === 0 ? W : 0, k = team[1 - t][0];
  const L = Math.abs(gx - ball.x) + 0.8, T = clamp(L / 15, 0.9, 1.5), vz = G * T / 2, sp = L / T;
  const ty = CY + (s.rnd() - 0.5) * (3.5 - n(p.attrs.fin) * 2) + (k.y < CY ? 1.2 : -1.2);
  const dx = gx - ball.x, dy = ty - ball.y, q = Math.hypot(dx, dy) || 1;
  p.dir = Math.atan2(dy, dx); kick(s, p, dx / q * sp, dy / q * sp, vz); ball.isShot = true; M.stats.shots[t]++; k.reactT = 0.3;
}
/** 약발로 차는가: 목표 방향이 몸 기준으로 주발 반대쪽에 있으면 */
function weakFoot(p: Player, aimAng: number) { const rel = angDiff(p.dir, aimAng); return p.foot === 'R' ? rel < -0.25 : rel > 0.25; }
/** 슛. finesse면 감아차기(휘고 느리고 정확), 공중볼이면 발리(세고 부정확) */
export function shoot(s: Sim, p: Player, power: number, aimY: number, finesseIn = false) {
  let finesse = finesseIn;
  const { ball, M, team, HU } = s;
  const t = p.t, A = p.attrs, gx = t === 0 ? W + 0.3 : -0.3;
  const dist = Math.hypot(gx - p.x, CY - p.y);
  const kp = team[1 - t][0];
  let ty = CY + (Math.abs(aimY) > 0.2 ? Math.sign(aimY) * 2.7 : (kp.y < CY ? 1 : -1) * 2.4); // 조준 없으면 키퍼 반대쪽 포스트 안쪽
  const volley = ball.z > 0.4;
  if (M.spType === 'freekick' && M.protect > 0.3) finesse = true; // 프리킥은 감아찬다
  const aimAng = Math.atan2(ty - ball.y, gx - ball.x);
  let err = (s.rnd() * 2 - 1) * (0.35 + dist * 0.05) * (1.22 - A.fin / 100) * (1 + power * 0.5) * (1 + pressure(s, p) * 0.4);
  if (power > 0.9) err *= 1 + (power - 0.9) * 6; // 끝까지 채우면(사람 풀파워) 많이 흔들린다
  if (weakFoot(p, aimAng) && p.def) err *= 1 + (5 - p.def.weak) * 0.09;
  if (finesse) err *= 0.7; if (volley) err *= 1.6;
  if (p.sta < 0.4) err *= 1 + (0.4 - p.sta) * 0.8;
  if (!HU[t]) err *= DIFF[M.diff].err;
  ty = clamp(ty + err, CY - GH - 1.5, CY + GH + 1.5);
  const sp = (16 + 17 * power) * (0.92 + n(A.pow) * 0.1) * (finesse ? 0.85 : 1) * (volley ? 1.08 : 1), dx = gx - ball.x, dy = ty - ball.y, q = Math.hypot(dx, dy);
  let vz = 1 + power * 4 * (0.3 + s.rnd() * 0.6); if (power > 0.85) vz *= 1.25; if (volley) vz += 1.5; // 최고 높이 1m 안팎
  // 감아차기: 조준점 바깥쪽으로 향했다가 안으로 휘어 들어온다
  const curlDir = finesse ? Math.sign(ty - CY) || 1 : 0, curl = finesse ? curlDir * (t === 0 ? 1 : -1) * (3.5 + n(A.fin) * 1.5) : 0;
  const a0 = Math.atan2(dy, dx) + (finesse ? -curlDir * (t === 0 ? 1 : -1) * 0.14 : 0);
  p.dir = a0; kick(s, p, Math.cos(a0) * sp, Math.sin(a0) * sp, vz, curl); ball.isShot = true;
  kp.reactT = (HU[1 - t] ? 0.3 - n(kp.attrs.rea) * 0.08 : (0.32 - n(kp.attrs.rea) * 0.08) / DIFF[M.diff].gk) * (dist < 12 ? 0.8 : 1); // 키퍼 반응 지연
  M.stats.shots[t]++;
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
  const sideways = Math.abs(angDiff(ma, ba)) > 1.1; // 공이 아니라 사람을 향한 슬라이딩
  const fast = Math.hypot(p.vx, p.vy) > 9;
  const win = !behind && !sideways && s.rnd() < 0.55 + n(p.attrs.slt) * 0.3 - (o.feint > 0 ? 0.25 : 0);
  p.slide = 0; p.stun = 0.7;
  if (win) { ball.owner = null; ball.vx = Math.cos(ma) * 9; ball.vy = Math.sin(ma) * 9; ball.vz = 1.5; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; o.stun = 0.5; o.kickCD = 0.5; p.kickCD = 0.3; }
  else { o.stun = 0.6; foulCommitted(s, p, o, sideways && fast, behind); }
}
export function foul(s: Sim, by: Player, on: Player) { foulCommitted(s, by, on, false, false); }
/** 스탠딩 태클: 공이 발에서 떨어진 순간(노크온·터치 직후)이 기회. 밸런스 높은 상대는 잘 안 뺏긴다 */
export function standTackle(s: Sim, p: Player) {
  const { ball, M } = s;
  const o = ball.owner; if (!o || o.t === p.t || o.role === 'GK' || p.tackleCD > 0 || M.protect > 0 || o.shield > 0) return;
  const q = d(p, o); if (q > 2.4) return; p.tackleCD = 0.5;
  const ux = (o.x - p.x) / (q || 1), uy = (o.y - p.y) / (q || 1); p.vx = ux * p.speed * 1.3; p.vy = uy * p.speed * 1.3; p.dir = Math.atan2(uy, ux); // 발을 뻗는 런지
  const front = Math.cos(o.dir) * (p.x - o.x) + Math.sin(o.dir) * (p.y - o.y) > 0;
  const loose = o.kickCD > 0 || Math.hypot(o.vx, o.vy) > 6.5; // 질주 중·터치 직후엔 공이 발에서 떨어져 있다
  const pr = (front ? 0.6 : 0.42) + n(p.attrs.stk) * 0.25 - n(o.attrs.bal) * 0.12 + (loose ? 0.18 : 0) - (o.feint > 0 ? 0.4 : 0) - (o.spin > 0 ? 0.5 : 0);
  if (s.rnd() < pr) { gain(s, p); o.stun = 0.45; o.kickCD = 0.5; sfx(s, 'tackle'); } else p.stun = 0.3;
}

/* ---------- 공 물리 ---------- */
/** 공중: 공기저항(속도 비례 증가) + 마그누스(curl, 진행 방향에 수직 가속) */
function airStep(b: { vx: number; vy: number; vz: number; z: number; curl: number }, dt: number) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const drag = (0.05 + 0.0038 * sp) * dt; b.vx *= 1 - drag; b.vy *= 1 - drag; b.vz *= 1 - drag * 0.6;
  if (b.curl && sp > 1) { const hs = Math.hypot(b.vx, b.vy) || 1, ax = -b.vy / hs * b.curl, ay = b.vx / hs * b.curl; b.vx += ax * dt; b.vy += ay * dt; }
}
export function computePred(s: Sim) {
  const { ball, pred } = s;
  pred.length = 0; const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, curl: ball.curl }; const PDT = 0.05;
  for (let i = 0; i < 60; i++) {
    if (b.z > 0 || b.vz > 0) { b.vz -= G * PDT; b.z += b.vz * PDT; airStep(b, PDT); if (b.z <= 0) { b.z = 0; b.vz = b.vz < -2 ? -b.vz * 0.45 : 0; b.curl *= 0.5; } }
    else { const sp = Math.hypot(b.vx, b.vy); if (sp > 0) { const ns = Math.max(0, sp - (FA + FB * sp) * PDT); b.vx *= ns / sp; b.vy *= ns / sp; } if (b.curl) { const hs = Math.hypot(b.vx, b.vy) || 1; b.vx += -b.vy / hs * b.curl * 0.5 * PDT; b.vy += b.vx / hs * b.curl * 0.5 * PDT; b.curl *= 1 - 1.5 * PDT; } }
    b.x += b.vx * PDT; b.y += b.vy * PDT; pred.push({ x: clamp(b.x, -1, W + 1), y: clamp(b.y, -1, H + 1), z: b.z, t: (i + 1) * PDT });
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
    if (o.spin > 0) { const a = o.dir + Math.PI / 2 * (o.spinDir || 1); ball.x = o.x + Math.cos(a) * 0.55; ball.y = o.y + Math.sin(a) * 0.55; } // 룰렛: 공이 몸 옆에서 돈다
    else { ball.x = o.x + Math.cos(o.dir) * ah; ball.y = o.y + Math.sin(o.dir) * ah; }
    ball.z = 0; ball.vx = o.vx; ball.vy = o.vy; ball.vz = 0; ball.spin += osp * dt * 3; return;
  }
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= G * dt; ball.z += ball.vz * dt; airStep(ball, dt);
    if (ball.z <= 0) { ball.z = 0; if (ball.vz < -2) { ball.vz = -ball.vz * 0.45; ball.vx *= 0.85; ball.vy *= 0.85; ball.curl *= 0.5; } else ball.vz = 0; }
  } else {
    const sp = Math.hypot(ball.vx, ball.vy); if (sp > 0) { const ns = Math.max(0, sp - (FA + FB * sp) * dt); ball.vx *= ns / sp; ball.vy *= ns / sp; }
    if (ball.curl) { const hs = Math.hypot(ball.vx, ball.vy) || 1; ball.vx += -ball.vy / hs * ball.curl * 0.5 * dt; ball.vy += ball.vx / hs * ball.curl * 0.5 * dt; ball.curl *= 1 - 1.5 * dt; }
  }
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
/** 트래핑·헤딩. 동료에게 가는 패스는 받는 선수 외의 우리 편(패서 포함)은 건드리지 않는다. 퍼스트 터치 품질은 볼컨트롤·공 속도·높이에 따라 */
export function ballControl(s: Sim) {
  const { ball, M, players } = s;
  if (ball.owner) return;
  const sp = Math.hypot(ball.vx, ball.vy); let best: Player | null = null, bd = 1e9;
  const pt = ball.passTarget;
  for (const p of players) {
    if (p.kickCD > 0 || p.stun > 0 || p.off) continue; const gk = p.role === 'GK', mine = pt === p; if (ball.z > (gk ? 2.4 : mine ? 2.2 : 1.7)) continue;
    if (pt && !mine && pt.t === p.t && !gk && sp > 5) continue;
    const q = d(p, ball), reach = gk ? 1.1 : mine ? 1.5 : 0.95; if (q < reach && q < bd) { bd = q; best = p; }
  }
  if (!best) return;
  if (ball.z > 0.9 && best.role !== 'GK') { // 헤딩 / 가슴 트래핑
    const t = best.t, gx = t === 0 ? W : 0; const dG = Math.hypot(gx - best.x, CY - best.y), mine = ball.passTarget === best;
    if (dG < 22 && sp > 8 && (!mine || ball.z > 1.5)) { const dx = gx - ball.x, dy = CY + (s.rnd() - 0.5) * (6 - n(best.attrs.hea) * 3) - ball.y, q = Math.hypot(dx, dy); const hv = 13 + n(best.attrs.hea) * 4; ball.vx = dx / q * hv; ball.vy = dy / q * hv; ball.vz = -1; ball.lastTouch = t; ball.kicker = best; ball.shot++; ball.isShot = true; best.kickCD = 0.3; M.stats.shots[t]++; sfx(s, 'kick'); }
    else { ball.vx *= 0.2; ball.vy *= 0.2; ball.vz = 0; ball.z = 0; gain(s, best); }
    return;
  }
  const toMe = ball.passTarget === best, ctl = best.attrs.ctl;
  const clean = (toMe ? 17 : 11) + ctl * 0.15 + (ball.z > 0.3 ? -4 : 0); // 이 속도까지는 발에 붙는다 (ctl 85: 29.8 / 23.8)
  if (sp < clean || (best.role === 'GK' && sp < 23)) gain(s, best);
  else if (best.role !== 'GK') { // 튀어나가는 퍼스트 터치: 볼컨트롤이 낮을수록 멀리·엉뚱하게
    const bad = clamp((sp - clean) / 12, 0.2, 1) * (1.3 - n(ctl) * 0.6);
    const a = Math.atan2(ball.vy, ball.vx) + (s.rnd() - 0.5) * (toMe ? 0.6 : 1.4) * bad, ns = sp * (toMe ? 0.2 : 0.33) * (0.6 + bad * 0.6);
    if (toMe && ball.kicker && ball.kicker.t === best.t) M.stats.passC[best.t]++; // 받긴 받았다 (터치가 컸을 뿐)
    ball.vx = Math.cos(a) * ns; ball.vy = Math.sin(a) * ns; ball.vz = toMe ? 0.6 : 1.8; ball.lastTouch = best.t; best.kickCD = 0.2; ball.kicker = best; ball.shot++; ball.passTarget = null; ball.knock = best; ball.curl = 0;
  }
}
export const inBoxOf = (x: number, y: number, t: number) => wx(x, t) > W - 16.5 && Math.abs(y - CY) < 20.16;
export { CX };
