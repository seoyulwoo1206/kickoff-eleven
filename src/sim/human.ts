import { clamp, d, angDiff, wx } from './util';
import { W, CY } from './consts';
import type { Sim, Human, Player } from './types';
import { sfx } from './events';
import { gain, knockOn, shortPass, longPass, throughPass, chipShot, shoot, slideTackle, slideCheck, standTackle, intercept, interceptT, queueKick, n } from './ball';
import { steer, chase, moveTo } from './move';

export function autoCursor(s: Sim, h: Human, dt: number) {
  const { ball, team, INP } = s;
  h.lock = Math.max(0, h.lock - dt);
  const own = ball.owner;
  if (own && own.t === h.t) { h.ctrl = own; h.had = true; return; } // 공을 가진 우리 선수가 커서 (키퍼 포함)
  if (h.ctrl && h.ctrl.role === 'GK') { const nn = nearestToBall(s, h); if (nn) { h.ctrl = nn; h.lock = 0.3; } } // 키퍼가 공을 잃으면 필드 선수로
  if (!own && ball.knock && ball.knock.t === h.t && ball.knock !== h.ctrl && ball.knock.role !== 'GK') { h.ctrl = ball.knock; return; } // 동료가 터치한 공은 그 선수가
  if (!own && ball.passTarget && ball.passTarget.t === h.t) { if (ball.passTarget.role !== 'GK') h.ctrl = ball.passTarget; return; } // 패스가 가는 동안엔 받는 선수에 고정
  if (!own && ball.knock === h.ctrl) return; // 질주 드리블 중
  if (h.cursor === 'manual') { // 수동: 패스 받을 때, 공을 뺏긴 직후 한 번, 그리고 전환 키로만 바뀐다
    if (own && own.t !== h.t && h.had) { h.had = false; const nn = nearestToBall(s, h); if (nn) { h.ctrl = nn; h.lock = 0.6; } }
    return;
  }
  if (h.lock > 0 || !h.ctrl) return;
  const I = INP[h.t], moving = Math.hypot(I.mx, I.my) > 0.15;
  const margin = moving ? 0.6 : 0.3; // 조작 중이면 훨씬 더 유리한 선수가 있을 때만 바꾼다
  let best: Player | null = null, bt = 1e9;
  if (own) {
    for (const p of team[h.t]) { if (p.role === 'GK' || p.off) continue; const q = d(p, own) / p.speed; if (q < bt) { bt = q; best = p; } }
    if (best && best !== h.ctrl && bt < d(h.ctrl, own) / h.ctrl.speed - margin) { h.ctrl = best; h.lock = 0.9; }
  } else {
    for (const p of team[h.t]) { if (p.role === 'GK' || p.off) continue; const q = interceptT(s, p); if (q < bt) { bt = q; best = p; } }
    if (best && best !== h.ctrl && bt < interceptT(s, h.ctrl) - margin) { h.ctrl = best; h.lock = 0.9; }
  }
}
/* 이동 어시스트 (FIFA·FC 온라인식): 조작 방향에 공 쪽 방향을 섞는다 */
export function assistDir(s: Sim, p: Player, ux: number, uy: number): [number, number] {
  const { ball } = s;
  const o = ball.owner; let tx: number, ty: number, w: number;
  if (!o && ball.passTarget && ball.passTarget !== p && ball.passTarget.t === p.t) return [ux, uy]; // 동료에게 가는 패스는 쫓지 않는다
  if (!o) { const q = intercept(s, p), L = Math.hypot(q.x - p.x, q.y - p.y); tx = q.x; ty = q.y; w = ball.passTarget === p ? (L > 2.5 ? 0.97 : 0.6) : ball.knock === p && L < 6 ? 0.95 : clamp(1 - L / 10, 0, 0.9); } // 내가 차 놓은 공은 스틱을 돌려도 먼저 줍는다
  else if (o.t !== p.t) { tx = o.x + o.vx * 0.25; ty = o.y + o.vy * 0.25; const h = s.HU[p.t], just = !!(h && h.ctrl === p && h.lostT > 0 && d(p, o) < 3.5); w = just ? 0.85 : clamp(0.7 - d(p, o) / 10, 0, 0.7); if (just) { const dx = tx - p.x, dy = ty - p.y, L = Math.hypot(dx, dy) || 1, ua = Math.atan2(uy, ux), ta = Math.atan2(dy / L, dx / L); const ra = ua + angDiff(ua, ta) * w; return [Math.cos(ra), Math.sin(ra)]; } } // 방금 뺏긴 공은 스틱이 앞을 향해도 돌아본다
  else return [ux, uy];
  const dx = tx - p.x, dy = ty - p.y, L = Math.hypot(dx, dy); if (L < 0.3 || w <= 0) return [ux, uy];
  const ax = dx / L, ay = dy / L, dot = ux * ax + uy * ay, mine = ball.passTarget === p || ball.knock === p;
  if (dot < -0.2 && !mine) return [ux, uy];
  const k = w * (mine ? 1 : clamp((dot + 0.6) / 1.4, 0, 1));
  const ua = Math.atan2(uy, ux), ta = Math.atan2(ay, ax), ra = ua + angDiff(ua, ta) * k;
  return [Math.cos(ra), Math.sin(ra)];
}
/** 개인기 (gkRush 키 = Q, 폰은 오른쪽 빈 공간 스와이프). 개인기 등급에 따라 가능한 기술이 다르다:
    1: 없음 · 2+: 헛다리(스틱 없음/전방) · 3+: 드래그백(스틱 뒤) · 4+: 마르세유 턴(질주 중 스틱 옆) · 5: 모두 더 빠르게 */
function skillMove(s: Sim, p: Player, sx: number, sy: number) {
  const { ball } = s, sk = p.skill; if (sk < 2 || p.spin > 0 || p.feint > 0 || p.stun > 0) return false;
  const mag = Math.hypot(sx, sy), fwd = mag > 0.3 ? (Math.cos(p.dir) * sx + Math.sin(p.dir) * sy) / mag : 1, side = mag > 0.3 ? (-Math.sin(p.dir) * sx + Math.cos(p.dir) * sy) / mag : 0;
  const sp = Math.hypot(p.vx, p.vy);
  if (mag > 0.3 && fwd < -0.5 && sk >= 3) { // 드래그백: 공을 뒤로 끌고 돌아선다
    p.dir += Math.PI; p.vx *= -0.2; p.vy *= -0.2; ball.x = p.x + Math.cos(p.dir) * 0.6; ball.y = p.y + Math.sin(p.dir) * 0.6; p.feint = 0.3; p.burst = 0.5; sfx(s, 'kick'); return true;
  }
  if (mag > 0.3 && Math.abs(side) > 0.6 && sp > 4 && sk >= 4) { // 마르세유 턴: 공을 몸으로 가리며 한 바퀴
    p.spin = 0.5; p.spinDir = side > 0 ? 1 : -1; p.feint = 0.6; p.burst = 0.6; return true;
  }
  // 헛다리: 잠깐 태클을 흘리고 가속
  p.feint = sk >= 5 ? 0.45 : 0.35; p.burst = 0.45; return true;
}
/** 침투 지시: 조준 방향(스틱, 없으면 얼굴 방향)에 있는 동료가 골 쪽 대각선으로 3초간 뛴다 (오프사이드 라인은 teamAI가 지킨다) */
export function triggerRun(s: Sim, h: Human, p: Player, aim: number) {
  const ax = Math.cos(aim), ay = Math.sin(aim); let best: Player | null = null, bs = -1e9;
  for (const m of s.team[h.t]) {
    if (m === p || m.role === 'GK' || m.off || m === s.ball.owner) continue;
    const dx = m.x - p.x, dy = m.y - p.y, q = Math.hypot(dx, dy); if (q < 2 || q > 45) continue;
    const c = (dx * ax + dy * ay) / q; if (c < 0.2) continue;
    const sc = c * 3 - q / 30 - (m.runT > 0 ? 1 : 0); if (sc > bs) { bs = sc; best = m; }
  }
  if (!best) return;
  const gx = h.t === 0 ? W : 0, ty = best.y + (CY - best.y) * 0.5; // 골 쪽 대각선으로
  best.runT = 3; best.runDir = Math.atan2(ty - best.y, gx - best.x); sfx(s, 'kick');
}
export function humanUpdate(s: Sim, h: Human, dt: number) {
  const { ball, M, INP } = s;
  const I = INP[h.t], p = h.ctrl; if (!p) return; if (p.off) { switchPlayer(s, h); return; }
  const mx = I.mx, my = I.my, mag = Math.hypot(mx, my), sprint = I.down.sprint; let own = ball.owner === p;
  if (!own && ball.knock === p && d(p, ball) < 2.0 && ball.z < 0.6 && (I.press.pass || I.press.shoot || I.press.lob || I.press.through || I.press.chip || I.rel.pass || I.rel.lob)) { gain(s, p); own = ball.owner === p; } // 질주 드리블 중에도 바로 차거나 패스할 수 있다
  h.second = false; h.gkRush = false; h.pressT = Math.max(0, h.pressT - dt); h.lostT = Math.max(0, h.lostT - dt);
  if (p.slide > 0) { slideCheck(s, p); return; }
  const aim = mag > 0.15 ? Math.atan2(my, mx) : p.dir;
  if (I.press.run) { // Q: 우리 공이면 침투 지시, 아니면 압박 지원
    const ours = (ball.owner && ball.owner.t === h.t) || (!ball.owner && ball.lastTouch === h.t && !(ball.kicker && ball.kicker.t !== h.t));
    if (ours) triggerRun(s, h, p, aim); else h.pressT = 2.5;
  }
  const kicking = p.kickWind > 0;
  // 이동
  if (p.spin > 0) { const sp0 = p.speed * 0.6; steer(p, Math.cos(p.dir) * sp0, Math.sin(p.dir) * sp0, dt); } // 룰렛 중엔 돌면서 전진
  else if (mag > 0.15) {
    const [ux, uy] = own ? [mx / mag, my / mag] : assistDir(s, p, mx / mag, my / mag);
    const toMe = !own && !ball.owner && ball.passTarget === p; // 나한테 오는 패스는 질주 키 없이도 전속으로
    let sp = p.speed * (sprint || toMe ? 1.24 : 1) * (own ? 0.93 : 1) * (p.stun > 0 ? 0.4 : 1) * clamp(mag / 0.7, 0.45, 1) * (p.burst > 0 ? 1.12 : 1) * (kicking ? 0.6 : 1); // 스틱을 살짝 밀면 걷는다
    if (!own && !ball.owner && ball.knock !== p && d(p, ball) < 1.6 && ball.z < 1) sp *= 0.75; // 공 바로 앞에선 속도를 줄여 흘리지 않게 (내가 앞에 차 놓은 공은 전속으로 쫓는다)
    steer(p, ux * sp, uy * sp, dt);
  }
  else if (!own && !ball.owner && (ball.passTarget === p || (!(ball.passTarget && ball.passTarget.t === p.t) && d(p, ball) < 10))) { const q = intercept(s, p); chase(p, q.x, q.y, ball.passTarget === p ? 1.24 : 1, dt); }
  else if (!own && ball.owner && ball.owner.t !== p.t && I.down.pass) { // 압박(컨테인): 가까우면 공과 골 사이에서 거리를 유지하며 따라붙는다
    const o = ball.owner, q = d(p, o);
    if (q < 2.6) { const g = wx(0, p.t), ux = g - o.x, uy = CY - o.y, L = Math.hypot(ux, uy) || 1; moveTo(p, o.x + ux / L * 1.5 + o.vx * 0.15, o.y + uy / L * 1.5 + o.vy * 0.15, 1.0, dt); }
    else moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, sprint ? 1.3 : 1.05, dt);
  }
  else if (!own && ball.owner && ball.owner.t !== p.t && d(p, ball.owner) < 4.5) { const o = ball.owner; moveTo(p, o.x, o.y, 0.55, dt); } // 손 놓고 있어도 가까운 상대는 천천히 따라붙는다
  else steer(p, 0, 0, dt);
  if (own) {
    if (I.press.pass || I.press.lob || I.press.through || I.press.shoot || I.press.chip) p.shield = 0.16; // 누른 순간 의도는 지켜준다: 떼기·와인드업 사이에 뺏기지 않는다
    if (kicking) return; // 와인드업 중엔 새 입력을 받지 않는다
    const anyPress = I.press.pass || I.press.lob || I.press.through || I.press.chip || I.press.shoot || I.down.pass || I.down.lob || I.down.shoot || I.rel.pass || I.rel.lob || I.rel.shoot; // 떼는 틱(rel)도 입력 중: 빠지면 질주 중 패스가 노크온에 먹힌다
    if (sprint && mag > 0.15 && Math.hypot(p.vx, p.vy) > 5.5 && !h.charging && !anyPress && p.spin <= 0 && Math.abs(angDiff(Math.atan2(p.vy, p.vx), Math.atan2(my, mx))) < 0.4) { knockOn(s, p); return; } // 질주 드리블은 공을 앞에 차 놓고 달린다 (도는 중엔 발에 붙여 돈다)
    // 개인기: Q 탭 (폰: 스와이프 → I.skill)
    if (I.press.gkRush) { const sv = I.skill ?? { x: mx, y: my }; I.skill = null; if (skillMove(s, p, sv.x, sv.y)) return; }
    // 패스는 떼는 순간, 누른 시간이 세기 (탭 = 보통). 터치는 pass 길게 = 롱패스
    if (I.rel.pass) { const pw = clamp((I.holdT.pass - 0.12) / 0.45, 0, 1); queueKick(s, p, () => shortPass(s, p, aim, pw), 0.04); h.charging = false; return; }
    if (I.rel.lob) { const pw = clamp((I.holdT.lob - 0.1) / 0.5, 0, 1); queueKick(s, p, () => longPass(s, p, aim, 0.35 + pw * 0.65)); h.charging = false; return; }
    if (I.press.through) { const pw = I.down.sprint ? 0.8 : 0; queueKick(s, p, () => throughPass(s, p, aim, pw), 0.04); h.charging = false; return; }
    if (I.press.chip) { queueKick(s, p, () => chipShot(s, p)); h.charging = false; return; }
    if (I.press.shoot) { h.charging = true; h.charge = 0; }
    if (h.charging) {
      if (I.down.shoot) h.charge = Math.min(1, h.charge + dt / 0.8);
      if (I.rel.shoot || !I.down.shoot) { const pw = Math.max(0.3, h.charge), ay = mag > 0.15 ? my / mag : 0, fin = I.down.gkRush; queueKick(s, p, () => shoot(s, p, pw, ay, fin)); h.charging = false; h.charge = 0; } // Q를 누른 채 슛 = 감아차기
    }
  } else {
    if (h.charging) { h.charging = false; h.charge = 0; }
    if (I.press.pass && !ball.owner && ball.z < 1.3 && d(p, ball) < 1.7 && p.kickCD <= 0 && !(ball.passTarget === p)) { // 가로채기 런지: 지나가는 공에 발을 뻗는다
      const sp = Math.hypot(ball.vx, ball.vy), dx = ball.x - p.x, dy = ball.y - p.y, q = Math.hypot(dx, dy) || 1; p.vx = dx / q * p.speed * 1.2; p.vy = dy / q * p.speed * 1.2; p.dir = Math.atan2(dy, dx);
      if (s.rnd() < clamp(1.4 - sp / 30, 0.4, 1) * (0.9 + n(p.attrs.int) * 0.2)) { gain(s, p); sfx(s, 'tackle'); } else p.kickCD = 0.3;
    }
    else if (I.press.pass) standTackle(s, p);
    else if (I.down.pass && I.holdT.pass > 0.25 && ball.owner && ball.owner.t !== p.t && d(p, ball.owner) < 1.8 && p.tackleCD <= 0 && (ball.owner.kickCD > 0 || Math.hypot(ball.owner.vx, ball.owner.vy) > 6)) standTackle(s, p); // 압박 중 공이 발에서 떨어지면 알아서 태클
    if (I.press.shoot) slideTackle(s, p, aim);
    if (I.press.lob) switchPlayer(s, h);
    if (I.down.through && (!I.touch || I.holdT.through > 0.12)) h.second = true;
    if (I.down.gkRush) h.gkRush = true;
    // 몸싸움: 공 가진 상대와 부딪히면 버튼 없이도 어깨 싸움으로 공을 뺏을 수 있다 (피지컬·밸런스 대결)
    const o = ball.owner;
    if (o && o.t !== p.t && o.role !== 'GK' && M.protect <= 0 && p.stun <= 0 && o.spin <= 0 && o.shield <= 0) {
      if (p.kickCD <= 0 && d(p, ball) < 0.7 && ball.z < 0.8) { // 발끝 포크
        p.kickCD = 0.3;
        if (s.rnd() < 0.55 + n(p.attrs.int) * 0.25 - (o.feint > 0 ? 0.3 : 0)) { gain(s, p); o.stun = 0.3; o.kickCD = 0.4; sfx(s, 'tackle'); }
        else { ball.owner = null; ball.vx = Math.cos(p.dir) * 5 + (s.rnd() - 0.5) * 3; ball.vy = Math.sin(p.dir) * 5 + (s.rnd() - 0.5) * 3; ball.vz = 0.8; ball.lastTouch = p.t; ball.kicker = p; ball.shot++; ball.passTarget = null; ball.curl = 0; o.kickCD = 0.35; sfx(s, 'tackle'); }
      }
      else if (p.bodyCD <= 0 && d(p, o) < 1.05) { // 몸싸움 (태클 쿨다운과 별개)
        p.bodyCD = 0.55; const front = Math.cos(o.dir) * (p.x - o.x) + Math.sin(o.dir) * (p.y - o.y) > 0;
        if (s.rnd() < (front ? 0.4 : 0.26) + (n(p.attrs.str) - n(o.attrs.str) * 0.6 - n(o.attrs.bal) * 0.4) * 0.3 - (o.feint > 0 ? 0.3 : 0)) { gain(s, p); o.stun = 0.35; o.kickCD = 0.4; sfx(s, 'tackle'); }
      }
    }
  }
}
/** 공(또는 공이 올 지점)에 가장 빨리 닿는 선수 */
export function nearestToBall(s: Sim, h: Human, exclude?: Player | null) {
  const { ball, team } = s;
  const key = ball.owner ? (p: Player) => d(p, ball) / p.speed : (p: Player) => interceptT(s, p);
  const list = team[h.t].filter(p => p.role !== 'GK' && p !== exclude && !p.off).sort((a, b) => key(a) - key(b)); return list[0] || null;
}
export function switchPlayer(s: Sim, h: Human) { const nn = nearestToBall(s, h, h.ctrl); if (nn) { h.ctrl = nn; h.lock = 1.2; } }
