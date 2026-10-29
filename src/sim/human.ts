import { clamp, d, angDiff } from './util';
import type { Sim, Human, Player } from './types';
import { sfx } from './events';
import { gain, knockOn, shortPass, longPass, throughPass, chipShot, shoot, slideTackle, slideCheck, standTackle, intercept, interceptT } from './ball';
import { steer, chase, moveTo } from './move';

export function autoCursor(s: Sim, h: Human, dt: number) {
  const { ball, team, INP } = s;
  h.lock = Math.max(0, h.lock - dt);
  const own = ball.owner;
  if (own && own.t === h.t) { if (own.role !== 'GK') h.ctrl = own; h.had = true; return; }
  if (!own && ball.passTarget && ball.passTarget.t === h.t) { if (ball.passTarget.role !== 'GK') h.ctrl = ball.passTarget; return; } // 패스가 가는 동안엔 받는 선수에 고정
  if (!own && ball.knock === h.ctrl) return; // 질주 드리블 중
  if (h.cursor === 'manual') { // 수동: 패스 받을 때, 공을 뺏긴 직후 한 번, 그리고 전환 키로만 바뀐다
    if (own && own.t !== h.t && h.had) { h.had = false; const n = nearestToBall(s, h); if (n) { h.ctrl = n; h.lock = 0.6; } }
    return;
  }
  if (h.lock > 0 || !h.ctrl) return;
  const I = INP[h.t], moving = Math.hypot(I.mx, I.my) > 0.15;
  const margin = moving ? 0.6 : 0.3; // 조작 중이면 훨씬 더 유리한 선수가 있을 때만 바꾼다
  let best: Player | null = null, bt = 1e9;
  if (own) {
    for (const p of team[h.t]) { if (p.role === 'GK') continue; const q = d(p, own) / p.speed; if (q < bt) { bt = q; best = p; } }
    if (best && best !== h.ctrl && bt < d(h.ctrl, own) / h.ctrl.speed - margin) { h.ctrl = best; h.lock = 0.9; }
  } else {
    for (const p of team[h.t]) { if (p.role === 'GK') continue; const q = interceptT(s, p); if (q < bt) { bt = q; best = p; } }
    if (best && best !== h.ctrl && bt < interceptT(s, h.ctrl) - margin) { h.ctrl = best; h.lock = 0.9; }
  }
}
/* 이동 어시스트 (FIFA·FC 온라인식): 조작 방향에 공 쪽 방향을 섞는다.
   - 나한테 오는 패스: 어느 방향을 눌러도 강하게 끌림
   - 흐르는 공: 가까울수록·스틱이 공 쪽일수록 보정, 공 반대쪽 의도는 존중
   - 상대가 공을 가진 경우: 상대 쪽으로 달리면 몸 쪽으로 살짝 끌려 몸싸움이 걸리게 */
export function assistDir(s: Sim, p: Player, ux: number, uy: number): [number, number] {
  const { ball } = s;
  const o = ball.owner; let tx: number, ty: number, w: number;
  if (!o && ball.passTarget && ball.passTarget !== p && ball.passTarget.t === p.t) return [ux, uy]; // 동료에게 가는 패스는 쫓지 않는다
  if (!o) { const q = intercept(s, p), L = Math.hypot(q.x - p.x, q.y - p.y); tx = q.x; ty = q.y; w = ball.passTarget === p ? (L > 2.5 ? 0.97 : 0.6) : clamp(1 - L / 10, 0, 0.9); }
  else if (o.t !== p.t) { tx = o.x + o.vx * 0.25; ty = o.y + o.vy * 0.25; w = clamp(0.7 - d(p, o) / 10, 0, 0.7); }
  else return [ux, uy];
  const dx = tx - p.x, dy = ty - p.y, L = Math.hypot(dx, dy); if (L < 0.3 || w <= 0) return [ux, uy];
  const ax = dx / L, ay = dy / L, dot = ux * ax + uy * ay, mine = ball.passTarget === p || ball.knock === p;
  if (dot < -0.2 && !mine) return [ux, uy];
  const k = w * (mine ? 1 : clamp((dot + 0.6) / 1.4, 0, 1));
  const ua = Math.atan2(uy, ux), ta = Math.atan2(ay, ax), ra = ua + angDiff(ua, ta) * k; // 각도를 k만큼 공 쪽으로 돌린다
  return [Math.cos(ra), Math.sin(ra)];
}
export function humanUpdate(s: Sim, h: Human, dt: number) {
  const { ball, M, INP } = s;
  const I = INP[h.t], p = h.ctrl; if (!p) return;
  const mx = I.mx, my = I.my, mag = Math.hypot(mx, my), sprint = I.down.sprint; let own = ball.owner === p;
  if (!own && ball.knock === p && d(p, ball) < 1.4 && ball.z < 0.6 && (I.press.pass || I.press.shoot || I.press.lob || I.press.through || I.press.chip)) { gain(s, p); own = ball.owner === p; } // 질주 드리블 중에도 바로 차거나 패스할 수 있다
  h.second = false; h.gkRush = false;
  if (p.slide > 0) { slideCheck(s, p); return; }
  const aim = mag > 0.15 ? Math.atan2(my, mx) : p.dir;
  // 이동
  if (mag > 0.15) {
    const [ux, uy] = own ? [mx / mag, my / mag] : assistDir(s, p, mx / mag, my / mag);
    let sp = p.speed * (sprint ? 1.32 : 1) * (own ? 0.93 : 1) * (p.stun > 0 ? 0.4 : 1) * clamp(mag / 0.7, 0.45, 1); // 스틱을 살짝 밀면 걷는다
    if (!own && !ball.owner && d(p, ball) < 1.6 && ball.z < 1) sp *= 0.75; // 공 바로 앞에선 속도를 줄여 흘리지 않게
    steer(p, ux * sp, uy * sp, dt);
  }
  else if (!own && !ball.owner && (ball.passTarget === p || (!(ball.passTarget && ball.passTarget.t === p.t) && d(p, ball) < 10))) { const q = intercept(s, p); chase(p, q.x, q.y, 1, dt); }
  else if (!own && ball.owner && I.down.pass) { const o = ball.owner; moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, sprint ? 1.3 : 1.05, dt); } // 압박
  else if (!own && ball.owner && ball.owner.t !== p.t && d(p, ball.owner) < 4.5) { const o = ball.owner; moveTo(p, o.x, o.y, 0.55, dt); } // 손 놓고 있어도 가까운 상대는 천천히 따라붙는다
  else steer(p, 0, 0, dt);
  if (own) {
    if (sprint && mag > 0.15 && Math.hypot(p.vx, p.vy) > 5.5 && !h.charging && !I.press.pass && !I.press.lob && !I.press.through && !I.press.chip && !I.press.shoot) { knockOn(s, p); return; } // 질주 드리블
    if (I.press.pass && !I.touch) { shortPass(s, p, aim); h.charging = false; return; }
    if (I.touch && I.rel.pass) { if (I.holdT.pass < 0.3) shortPass(s, p, aim); else longPass(s, p, aim); return; }
    if (I.press.lob) { longPass(s, p, aim); h.charging = false; return; }
    if (I.press.through) { throughPass(s, p, aim); h.charging = false; return; }
    if (I.press.chip) { chipShot(s, p); h.charging = false; return; }
    if (I.press.shoot) { h.charging = true; h.charge = 0; }
    if (h.charging) {
      if (I.down.shoot) h.charge = Math.min(1, h.charge + dt / 0.8);
      if (I.rel.shoot || !I.down.shoot) { shoot(s, p, Math.max(0.3, h.charge), mag > 0.15 ? my / mag : 0); h.charging = false; h.charge = 0; }
    }
  } else {
    if (h.charging) { h.charging = false; h.charge = 0; }
    if (I.press.pass) standTackle(s, p);
    else if (I.down.pass && I.holdT.pass > 0.25 && ball.owner && ball.owner.t !== p.t && d(p, ball.owner) < 1.8 && p.tackleCD <= 0) standTackle(s, p); // 압박 중 붙으면 알아서 태클
    if (I.press.shoot) slideTackle(s, p, aim);
    if (I.press.lob || (I.touch && I.press.through)) switchPlayer(s, h);
    if (I.down.through && !I.touch) h.second = true;
    if (I.down.gkRush) h.gkRush = true;
    // 몸싸움: 공 가진 상대와 부딪히면 버튼 없이도 어깨 싸움으로 공을 뺏을 수 있다
    const o = ball.owner;
    if (o && o.t !== p.t && o.role !== 'GK' && M.protect <= 0 && p.stun <= 0) {
      if (p.kickCD <= 0 && d(p, ball) < 0.7 && ball.z < 0.8) { // 발끝 포크
        p.kickCD = 0.3;
        if (s.rnd() < 0.65 + (M.teams[p.t].def - 80) / 100) { gain(s, p); o.stun = 0.3; o.kickCD = 0.4; sfx(s, 'tackle'); }
        else { ball.owner = null; ball.vx = Math.cos(p.dir) * 5 + (s.rnd() - 0.5) * 3; ball.vy = Math.sin(p.dir) * 5 + (s.rnd() - 0.5) * 3; ball.vz = 0.8; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; ball.passTarget = null; o.kickCD = 0.35; sfx(s, 'tackle'); }
      }
      else if (p.bodyCD <= 0 && d(p, o) < 1.05) { // 몸싸움 (태클 쿨다운과 별개)
        p.bodyCD = 0.55; const front = Math.cos(o.dir) * (p.x - o.x) + Math.sin(o.dir) * (p.y - o.y) > 0;
        if (s.rnd() < (front ? 0.42 : 0.28) + (M.teams[p.t].def - 80) / 80) { gain(s, p); o.stun = 0.35; o.kickCD = 0.4; sfx(s, 'tackle'); }
      }
    }
  }
}
/** 공(또는 공이 올 지점)에 가장 빨리 닿는 선수 */
export function nearestToBall(s: Sim, h: Human, exclude?: Player | null) {
  const { ball, team } = s;
  const key = ball.owner ? (p: Player) => d(p, ball) / p.speed : (p: Player) => interceptT(s, p);
  const list = team[h.t].filter(p => p.role !== 'GK' && p !== exclude).sort((a, b) => key(a) - key(b)); return list[0] || null;
}
export function switchPlayer(s: Sim, h: Human) { const n = nearestToBall(s, h, h.ctrl); if (n) { h.ctrl = n; h.lock = 1.2; } }
