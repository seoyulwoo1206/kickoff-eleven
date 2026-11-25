import { clamp, d, angDiff, wx } from './util';
import { W, H, CY, FA, FB, STEP } from './consts';
import { DIFF } from '../data/teams';
import { shortCorner } from './quick';
import type { Sim, Human, Player } from './types';
import type { Inp } from '../input/actions';
import { sfx, banner } from './events';
import { gkHands, headSpot, passTo, kick, throwTo, throwPick, offsideLine, gain, knockOn, bigKnock, setKick, setShotAim, shortPass, shortPick, longPass, fakeShot, groundDist, throughPass, throughPlan, type ThruPlan, chipShot, shoot, slideTackle, slideCheck, standTackle, intercept, interceptT, queueKick, n } from './ball';
import { steer, chase, moveTo, gapY } from './move';
import { bestAIPass } from './ai/carrier';

export function autoCursor(s: Sim, h: Human, dt: number) {
  const { ball, team, INP } = s;
  h.lock = Math.max(0, h.lock - dt);
  const own = ball.owner;
  if (own && own.t === h.t) { h.ctrl = own; h.had = true; return; } // 공을 가진 우리 선수가 커서 (키퍼 포함)
  if (!own && ball.knock === h.ctrl) return; // 질주 드리블 중 (키퍼가 발로 몰고 나올 때도)
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
  if (!o) { const hs = headSpot(s, p); if (hs) { const L = Math.hypot(hs.x - p.x, hs.y - p.y); if (L < 0.4) return [0, 0]; if (L < 9) { const ua = Math.atan2(uy, ux), ra = ua + angDiff(ua, Math.atan2(hs.y - p.y, hs.x - p.x)) * 0.9; return [Math.cos(ra), Math.sin(ra)]; } } // 상대가 띄운 공: 머리 높이로 내려오는 자리로 (9m 안이면 방향키와 상관없이)
    const q = intercept(s, p), L = Math.hypot(q.x - p.x, q.y - p.y); tx = q.x; ty = q.y;
    if (ball.passTarget === p && ball.z > 1.0) { if (L < 0.5) return [0, 0]; const dx = (tx - p.x) / L, dy = (ty - p.y) / L, ua = Math.atan2(uy, ux), ra = ua + angDiff(ua, Math.atan2(dy, dx)) * 0.97; return [Math.cos(ra), Math.sin(ra)]; } // 나한테 오는 뜬 공: 떨어질 자리로 가서 기다린다 (전엔 자리에 다 오면 누르고 있던 방향키대로 달려 나가 크로스를 놓쳤다 — 탭 크로스 첫 터치 92→77%)
    // (47차에 '방향키 쪽으로 나아가며 받기'를 시험했으나 뺐다: 공이 굴러가길 기다리는 사이 상대가 끊어 벤치 숏패스 수신 83 → 56%)
    w = ball.passTarget === p ? (L > 2.5 ? 0.97 : 0.6) : ball.knock === p && L < 11 ? 0.95 : clamp(1 - L / 10, 0, 0.9); } // 내가 차 놓은 공은 스틱을 돌려도 먼저 줍는다
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
/** 달리는 방향 앞 5.2m 안(±75°)에 상대가 있는가 — 있으면 질주해도 공을 차 놓지 않고 발에 붙여 몬다 (차 놓으면 그대로 뺏긴다) */
function oppAhead(s: Sim, p: Player) {
  const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
  for (const o of s.team[1 - p.t]) { if (o.off) continue; const dx = o.x - p.x, dy = o.y - p.y, q = Math.hypot(dx, dy); if (q < 5.2 && (dx * ux + dy * uy) / (q || 1) > 0.26) return true; }
  return false;
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
  // 골 쪽 안으로 꺾되, 수비 사이 가장 넓은 틈을 겨냥해 대각선으로
  const line = offsideLine(s, h.t), gy = gapY(s, h.t, best.y + clamp(CY - best.y, -12, 12) * 0.6, line), tx = wx(Math.min(Math.max(line, wx(best.x, h.t)) + 12, 102), h.t);
  best.runT = 3; best.runDir = Math.atan2(gy - best.y, tx - best.x); sfx(s, 'kick'); h.runP = best; // runP: Q를 길게 누르다 떼면 그때 방향키 쪽으로 방향을 바꾼다 (53차)
}
/** 주고 뛰기(50차, Q를 누른 채 패스 / 폰은 패스 버튼을 아래로 밀기 — FC의 Pass and Go): 패스를 준 선수가 2.5초 동안 골 쪽으로 뛰어 들어간다.
    자동 주고 뛰기(43차, `passTo` — 미드필더·공격수가 자기 골 40m 밖에서 1.4초)와 달리 자리·역할을 가리지 않는다. 방향은 골 쪽에서 받는 선수 반대편으로 25° */
function passGo(s: Sim, p: Player) {
  const b = s.ball, m = b.passTarget; if (!m || m === p || b.owner === p || p.role === 'GK' || s.M.phase !== 'live') return;
  const gx = p.t === 0 ? W : 0, ga = Math.atan2(CY - p.y, gx - p.x), side = Math.sin(Math.atan2(m.y - p.y, m.x - p.x) - ga) > 0 ? -1 : 1;
  p.runT = 2.5; p.runDir = ga + side * 0.44;
}
/** 동료 호출(49차, 공격 때 jockey 키): 가까운 동료 하나가 `callT` 3.2초 동안 공 가진 선수 6.5m 앞까지 받으러 온다(teamAI) — 짧은 패스를 주고받을 상대를 만든다.
    대상: 4~34m 안 필드 선수 중 가까운 쪽, 방향키를 누르고 있으면 그쪽 동료 우대. 이미 부른 선수가 있으면 그 선수는 풀고 다른 선수를 부른다 */
export function callSupport(s: Sim, h: Human, p: Player, aim: number | null) {
  const two = h.callAt > 0 && s.team[h.t].some(m => m.callT > 0 && !m.off); h.callAt = two ? 0 : 0.5; // 52차: 0.5초 안에 한 번 더 누르면 먼저 부른 동료는 그대로 두고 둘째 동료도 부른다 (FC의 Double Teammate Support)
  let best: Player | null = null, bs = -1e9;
  for (const m of s.team[h.t]) {
    if (m === p || m.role === 'GK' || m.off || (two && m.callT > 0)) continue; const dx = m.x - p.x, dy = m.y - p.y, q = Math.hypot(dx, dy); if (q < 4 || q > 34) continue;
    const c = aim === null ? 0 : (dx * Math.cos(aim) + dy * Math.sin(aim)) / q;
    const sc = -q / 7 + c * 2.5 - (m.callT > 0 ? 3 : 0); if (sc > bs) { bs = sc; best = m; }
  }
  for (const m of s.team[h.t]) m.callT = two && m.callT > 0 ? 3.2 : 0;
  if (!best) return;
  best.callT = 3.2; best.runT = 0; sfx(s, 'kick');
}
/** 스로인을 알아서 던질 때의 대상: 24m 안에서 가장 열린(가까운 상대가 먼) 동료, 너무 멀면 감점, 안쪽 우대 */
function throwOpen(s: Sim, p: Player): Player | null {
  let best: Player | null = null, bs = -1e9;
  for (const m of s.team[p.t]) {
    if (m === p || m.role === 'GK' || m.off) continue; const q = d(m, p); if (q < 3 || q > 24) continue;
    let open = 9; for (const o of s.team[1 - p.t]) if (!o.off) open = Math.min(open, d(o, m));
    const sc = Math.min(open, 7) - Math.abs(q - 9) / 4 + Math.min(Math.abs(m.y - p.y), 8) / 3; if (sc > bs) { bs = sc; best = m; } // 터치라인에서 안쪽으로 들어온 동료 우대 (선을 따라 던지면 흘러서 다시 나간다)
  }
  return best;
}
/** 흘리기(53차, 나한테 오는 땅볼 패스가 8m 안에 왔을 때 호출 키 — FC의 Let Ball Run / Dummy, 사람만): 공을 건드리지 않고 지나가게 둔다.
    공이 가는 쪽 뒤(2.5m ~ 굴러갈 거리 + 4m, 옆으로 2m + 거리×0.4 안)에 동료가 있으면 그 동료가 받는 선수(`passTarget`)·커서가 되고, 없으면 내가 돌아서 쫓는다(`ball.knock`).
    흘린 공은 마찰 배율 1로 구른다(사람 팀 패스의 1.8배 마찰이면 6m도 못 간다). 나에게 붙어 있던(3.5m 안) AI 수비수는 `DUM_PB` 확률로 속아 휘청인다(`stun` .4·`beatT` .9·`kickCD` .9 — 그동안 공에 발을 못 댄다). 안 속은 수비가 공이 가는 길에 서 있으면 그대로 뺏긴다 */
const DUM_PB = 0.7;
export function dummy(s: Sim, h: Human, p: Player): boolean {
  const { ball: b, M } = s, sp = Math.hypot(b.vx, b.vy); if (b.owner || b.passTarget !== p || b.z > 0.8 || sp < 6 || M.phase !== 'live' || M.dead) return false;
  const ux = b.vx / sp, uy = b.vy / sp, toMe = (p.x - b.x) * ux + (p.y - b.y) * uy; if (toMe < 0.4 || toMe > 8) return false;
  let v = sp, x = 0; while (x < toMe && v > 1) { v -= (FA + FB * v) * b.wt * STEP; x += v * STEP; } if (v < 5) return false; // 내 앞에서 거의 멎을 공은 흘릴 수 없다
  const reach = groundDist(v, 3); let best: Player | null = null, bs = -1e9;
  for (const m of s.team[p.t]) {
    if (m === p || m.off || m.role === 'GK' || m.offs) continue; const dx = m.x + m.vx * 0.4 - p.x, dy = m.y + m.vy * 0.4 - p.y, f = dx * ux + dy * uy, l = Math.abs(dy * ux - dx * uy);
    if (f < 2.5 || f > reach + 4 || l > 2 + f * 0.4) continue; const sc = -l - Math.abs(f - 7) * 0.15; if (sc > bs) { bs = sc; best = m; }
  }
  b.wt = 1; b.thru = false; p.dumT = toMe / sp + 0.3; h.bufK = 0; h.bufT = 0; h.preShot = false;
  if (best) { b.passTarget = best; h.ctrl = best; h.lock = 0.4; if (p.role !== 'GK') { const gx = p.t === 0 ? W : 0; p.runT = 2.2; p.runDir = Math.atan2(CY - p.y, gx - p.x) + (Math.sin(Math.atan2(best.y - p.y, best.x - p.x) - Math.atan2(CY - p.y, gx - p.x)) > 0 ? -0.44 : 0.44); } } // 흘린 선수는 돌아서 골 쪽으로 뛴다(받은 동료가 다시 내줄 수 있게 — 주고 뛰기와 같은 방향 규칙)
  else { b.passTarget = null; b.knock = p; }
  for (const o of s.team[1 - p.t]) {
    if (o.off || o.role === 'GK' || o.stun > 0 || o.beatT > 0 || d(o, p) > 3.5) continue; const h2 = s.HU[o.t]; if (h2 && h2.ctrl === o) continue;
    const diff = h2 ? 1 : clamp(DIFF[M.diff].react / 0.28, 0.6, 1.4);
    if (s.rnd() < clamp(DUM_PB + (p.skill - 3) * 0.04 - n(o.attrs.rea) * 0.2 - n(o.attrs.int) * 0.1, 0.1, 0.85) * diff) { o.stun = Math.max(o.stun, 0.4); o.beatT = 0.9; o.kickCD = Math.max(o.kickCD, 0.9); o.lunge = 0.3; } // 받는 선수에게 발을 뻗다 헛디뎠다: 0.9초 동안 지나가는 공을 못 건드린다
  }
  return true;
}
/** 우리 공인가: 우리 선수가 갖고 있거나, 우리가 마지막으로 찬 공이 아직 주인 없이 가는 중 */
/** 패스 조준(51차): 스틱 방향 → 방금(0.25초 안) 뗐으면 그때 방향 → 없으면 보는 방향(free). sharp = 아날로그 스틱(8방향에 딱 맞지 않는 각 — 폰·패드): 겨눈 각을 더 엄격히 본다 */
export function aimOf(I: Inp, p: Player): { a: number; free: boolean; sharp: boolean } {
  const on = Math.hypot(I.mx, I.my) > 0.15; if (!on && I.aimT <= 0) return { a: p.dir, free: true, sharp: false };
  const a = on ? Math.atan2(I.my, I.mx) : I.aimA, f = a / (Math.PI / 4); return { a, free: false, sharp: Math.abs(f - Math.round(f)) > 0.03 };
}
const passPw = (I: Inp) => clamp((I.holdT.pass - 0.12) / 0.45, 0, 1);
/** 스루패스 세기(51차): 누른 시간 0~1 (0.14초까지는 탭) + 질주 중이면 0.35 */
export const thruPw = (I: Inp) => clamp((I.down.through || I.rel.through ? clamp((I.holdT.through - 0.14) / 0.5, 0, 1) : 0) + (I.down.sprint ? 0.35 : 0), 0, 1);
const calledMate = (s: Sim, p: Player) => s.team[p.t].find(m => m.callT > 0 && !m.off && m !== p && Math.hypot(m.x - p.x, m.y - p.y) < 30) ?? null;
/** 지금 패스·스루패스를 누르면 누구에게 가는가 (51차, 차지 않는다) — 화면의 받을 선수 표시와 온라인 게스트의 선수 지정이 쓴다. 실제 킥(`humanUpdate`)과 같은 식 */
export function passPreview(s: Sim, p: Player, I: Inp): { short: Player | null; thru: ThruPlan | null } {
  const am = aimOf(I, p), pw = I.down.pass || I.rel.pass ? passPw(I) : 0, cm = am.free ? calledMate(s, p) : null;
  return { short: cm ?? shortPick(s, p, am.a, pw, am.free ? 0.4 : am.sharp ? 0.1 : 0.2, am.sharp), thru: throughPlan(s, p, am.a, thruPw(I), undefined, { sharp: am.sharp }) };
}
/** 온라인 게스트가 보낸 '받을 선수'가 아직 쓸 만한가 (같은 팀·경기 중·45m 안) */
function hinted(s: Sim, I: Inp, p: Player, kind: number): Player | null { if (I.hintP < 0 || I.hintK !== kind || I.hintT <= 0) return null; const m = s.players[I.hintP]; I.hintP = -1; return m && m !== p && m.t === p.t && !m.off && Math.hypot(m.x - p.x, m.y - p.y) < 45 ? m : null; }
export function oursBall(s: Sim, t: number) { const { ball } = s; return !!((ball.owner && ball.owner.t === t) || (!ball.owner && ball.lastTouch === t && !(ball.kicker && ball.kicker.t !== t))); }
export function humanUpdate(s: Sim, h: Human, dt: number) {
  const { ball, M, INP } = s;
  const I = INP[h.t], p = h.ctrl; if (!p) return; if (p.off) { switchPlayer(s, h); return; }
  let mx = I.mx, my = I.my, mag = Math.hypot(mx, my); const sprint = I.down.sprint; let own = ball.owner === p;
  h.swT = Math.max(0, h.swT - dt); if (!I.down.pass) h.swHold = false; if (I.press.chip) h.zUsed = false;
  h.callAt = Math.max(0, h.callAt - dt); h.fakeT = Math.max(0, h.fakeT - dt);
  // 주고 뛰기 방향(53차): Q+패스를 준 뒤 0.6초 안에 방향키를 패스 방향과 다른 쪽(34° 넘게)으로 누르면 준 선수가 그쪽으로 뛴다 (안 누르면 골 쪽)
  if (h.goT > 0) { h.goT -= dt; const g = h.goP; if (!g || g.off || g === p || g.runT <= 0) h.goT = 0; else if (mag > 0.3 && Math.abs(angDiff(Math.atan2(my, mx), h.goA)) > 0.6) { g.runDir = Math.atan2(my, mx); g.runT = Math.max(g.runT, 2.2); h.goT = 0; } }
  // 침투 방향 지정(53차): Q를 0.25초 넘게 누르고 있다가 떼면, 방금 부른 동료가 그때의 방향키 쪽으로 뛴다 (탭이면 전처럼 골 쪽 대각선)
  if (I.rel.run) { const r = h.runP; if (r && !r.off && r.runT > 0 && I.holdT.run > 0.25 && mag > 0.3 && oursBall(s, h.t)) { r.runDir = Math.atan2(my, mx); r.runT = 3; } h.runP = null; }
  { const mineIn = own || (!ball.owner && (ball.passTarget === p || ball.knock === p)); // 원터치(52차): 미리 뗀 키는 공이 나한테 오는 동안만 기억한다 (끊기거나 커서가 바뀌면 버린다)
    if (h.bufT > 0) { h.bufT -= dt; if (h.bufT <= 0 || !mineIn) { h.bufT = 0; h.bufK = 0; h.bufM = null; } }
    if (h.preShot && (!mineIn || !(I.down.shoot || I.rel.shoot))) h.preShot = false; }
  if (M.throwIn === p) { // 스로인: 움직일 수 없고 스틱으로 방향만. 패스·스루 = 가까운 동료, 롱패스 = 먼 동료. 6초 넘기면 알아서 던진다
    steer(p, 0, 0, dt); p.vx = p.vy = 0; h.second = false; h.gkRush = false; h.charging = false;
    if (mag > 0.15) { h.lockA = Math.atan2(my, mx); h.lockT = 1.5; } else h.lockT = 0;
    if (mag > 0.15) { const top = p.y < CY, ux = mx / mag; let uy = my / mag; uy = top ? Math.max(uy, 0.15) : Math.min(uy, -0.15); p.dir = Math.atan2(uy, ux); }
    const far = I.press.lob, auto = M.throwT > 6 && !(I.press.pass || I.press.through || far); // 6초를 넘겨 알아서 던질 땐 스틱 방향이 아니라 가장 열린 동료에게
    if (I.press.pass || I.press.through || far || auto) { const m = auto ? throwOpen(s, p) ?? throwPick(s, p, p.dir, false) : throwPick(s, p, p.dir, far); if (m) throwTo(s, p, m); }
    return;
  }
  // 코너킥·프리킥·골킥·페널티: 찰 때까지 제자리, 스틱은 방향만 (패스·롱패스·스루·슛은 평소처럼). 8초를 넘기면 가까운 동료에게 짧게 준다
  const dead = M.setTaker === p && own;
  if (dead) { if (mag > 0.15) { h.lockA = Math.atan2(my, mx); h.lockT = 1.5; } else h.lockT = 0; }
  if (dead && M.spType === 'corner' && M.dead === p) { // 53차: 호출 키 = 짧은 코너킥(한 명이 깃발 8.5m 자리로 나오고 조준점이 그 선수에게)
    if (I.press.jockey && shortCorner(s, h.t)) banner(s, '', '짧은 코너킥 · 패스로 줍니다', 1000);
  }
  else if (h.lockT > 0) { // 찰 때부터 누르고 있던 방향키는 받는 선수의 이동으로 치지 않는다 — 떼거나 방향을 바꾸면 풀린다 (전엔 던지자마자 받는 선수가 그 방향으로 공을 몰고 나갔다)
    h.lockT -= dt; if (mag < 0.15 || Math.abs(angDiff(Math.atan2(my, mx), h.lockA)) > 0.6) h.lockT = 0; else { mx = 0; my = 0; mag = 0; }
  }
  // 치달 예약(43차): 질주 드리블로 공을 앞에 차 놓은 사이(주인 없음·`ball.knock`)에 누른 치달은 다시 닿는 순간까지 0.5초 기억했다가 친다.
  // 전엔 누른 그 틱에 공이 2m 안·kickCD 0이어야만 먹어, 달리는 중엔 대부분 씹혔다. 폰의 '달리는 쪽으로 밀기'는 아예 이 경우를 안 봐서 키퍼 나오기로 샜다
  if (!own && ball.knock === p) {
    const fl = I.press.gkRush && I.skill && (Math.cos(p.dir) * I.skill.x + Math.sin(p.dir) * I.skill.y) / (Math.hypot(I.skill.x, I.skill.y) || 1) > 0.5; // 폰: 달리는 쪽으로 밀기
    if (I.press.switch || fl) { h.chiT = 0.5; h.chiA = fl ? Math.atan2(I.skill!.y, I.skill!.x) : NaN; if (fl) { I.skill = null; I.press.gkRush = false; } }
    if (h.chiT > 0 && d(p, ball) < 2.2 && ball.z < 0.6 && p.kickCD <= 0 && p.stun <= 0 && p.spin <= 0) {
      gain(s, p); if (ball.owner === p) { h.chiT = 0; const sa = isNaN(h.chiA) ? (mag > 0.15 ? Math.atan2(my, mx) : p.dir) : h.chiA; bigKnock(s, p, Math.abs(angDiff(p.dir, sa)) < 1.75 ? sa : p.dir); return; }
    }
  }
  h.chiT = Math.max(0, h.chiT - dt);
  if (!own && ball.knock === p && d(p, ball) < 2.0 && ball.z < 0.6 && (I.press.pass || I.press.shoot || I.press.lob || I.press.through || (I.press.switch && p.kickCD <= 0) || I.rel.chip || I.rel.pass || I.rel.lob || I.rel.through)) { gain(s, p); own = ball.owner === p; } // 질주 드리블 중에도 바로 차거나 패스할 수 있다
  h.second = false; h.gkRush = false; h.pressT = Math.max(0, h.pressT - dt); h.lostT = Math.max(0, h.lostT - dt);
  if (p.slide > 0) { slideCheck(s, p); return; }
  // 키퍼가 공을 잡았다: 0.5초는 잡는 동작(그동안 누른 키는 버린다 — 수비하며 누르던 태클·전환 키가 그대로 킥이 됐다), 그 뒤 천천히 걸으며 S 던지기·A 롱킥·D 멀리 차기. 6초를 넘기면 알아서 준다
  let hands = own && gkHands(s, p);
  if (hands) {
    p.holdT += dt;
    if (p.holdT <= dt * 1.5 && h.gkTips < 2) { h.gkTips++; banner(s, '', '골키퍼가 잡았습니다 · 패스 = 짧게 · 롱패스 = 길게 · 슛 = 멀리 차기 · 스루 = 내려놓고 드리블', 2600); }
    if (p.holdT < 0.5) { steer(p, 0, 0, dt); h.armP = h.armL = h.armT = false; h.charging = false; return; }
    if (I.press.through && !h.charging && p.kickWind <= 0) { p.atFeet = true; hands = false; h.armT = false; steer(p, 0, 0, dt); return; } // 스루 키: 공을 발밑에 내려놓는다 — 그 뒤로는 필드 선수처럼 드리블·패스·슛 (다시 손으로 못 잡고, 상대가 뺏을 수 있다)
    if (p.holdT > 6 && !h.charging && p.kickWind <= 0 && !I.down.pass && !I.down.lob) { const m = bestAIPass(s, p); if (m) passTo(s, p, m.p, m.loft); else kick(s, p, (p.t === 0 ? 1 : -1) * 22, (s.rnd() - 0.5) * 8, 7); return; }
  }
  const aim = mag > 0.15 ? Math.atan2(my, mx) : p.dir;
  if (I.press.run && !h.charging) { if (oursBall(s, h.t)) triggerRun(s, h, p, aim); else h.pressT = 2.5; } // 슛을 모으는 중의 Q는 칩슛 수식키(폰: 슛 버튼을 아래로 밀기) // Q: 우리 공이면 침투 요청, 아니면 동료 압박
  if (I.press.jockey && own && !dead && !M.throwIn) callSupport(s, h, p, mag > 0.15 ? aim : null); // C: 동료 호출 (수비 때의 C는 자세 낮추기)
  const kicking = p.kickWind > 0;
  // 이동
  if (dead) { // 공 뒤에 서서 조준 방향으로 돈다 (초당 6rad), 공은 놓인 자리에
    steer(p, 0, 0, dt); p.vx = p.vy = 0;
    if (M.setAim) { // 방향키는 조준점을 옮긴다 (초속 13m, 질주 키를 누르면 두 배). 공에서 6m 안으로는 못 들어온다
      if (mag > 0.15) { const v = (sprint ? 26 : 13) * dt; M.aimX = clamp(M.aimX + mx * v, 0.5, W - 0.5); M.aimY = clamp(M.aimY + my * v, 1, H - 1); }
      const dx = M.aimX - M.setX, dy = M.aimY - M.setY, q = Math.hypot(dx, dy);
      if (q < 6) { const a = q > 0.01 ? Math.atan2(dy, dx) : p.dir; M.aimX = clamp(M.setX + Math.cos(a) * 6, 0.5, W - 0.5); M.aimY = clamp(M.setY + Math.sin(a) * 6, 1, H - 1); }
      p.dir += clamp(angDiff(p.dir, Math.atan2(M.aimY - M.setY, M.aimX - M.setX)), -6 * dt, 6 * dt);
    } else if (mag > 0.15) p.dir += clamp(angDiff(p.dir, Math.atan2(my, mx)), -6 * dt, 6 * dt);
    p.x = clamp(M.setX - Math.cos(p.dir) * 0.75, -1.2, W + 1.2); p.y = clamp(M.setY - Math.sin(p.dir) * 0.75, -1.2, H + 1.2);
  }
  else if (p.spin > 0) { const sp0 = p.speed * 0.6; steer(p, Math.cos(p.dir) * sp0, Math.sin(p.dir) * sp0, dt); } // 룰렛 중엔 돌면서 전진
  else if (p.lunge > 0 && p.stun > 0 && !own) { const v = p.speed * 0.95 * (p.lunge / 0.34); steer(p, Math.cos(p.dir) * v, Math.sin(p.dir) * v, dt); } // 헛디딘 태클: 방향키와 상관없이 발을 뻗은 쪽으로 쓸려 간다 (역동작)
  else if (mag > 0.15) {
    const [ux, uy] = own ? [mx / mag, my / mag] : assistDir(s, p, mx / mag, my / mag);
    const toMe = !own && !ball.owner && (ball.passTarget === p || (ball.knock === p && d(p, ball) > 2.5) || !!headSpot(s, p)); // 공중볼 경합도 전속 // 나한테 오는 패스·치달로 멀리 차 놓은 공은 질주 키 없이도 전속으로
    let sp = p.speed * (hands ? 0.5 : sprint || toMe ? 1.24 : 1) * (own ? 0.93 : 1) * (p.stun > 0 ? 0.4 : 1) * clamp(mag / 0.7, 0.45, 1) * (p.burst > 0 ? 1.12 : 1) * (kicking ? 0.6 : 1); // 스틱을 살짝 밀면 걷는다
    if (!own && !ball.owner && ball.knock !== p && d(p, ball) < 1.6 && ball.z < 1) sp *= 0.75; // 공 바로 앞에선 속도를 줄여 흘리지 않게 (내가 앞에 차 놓은 공은 전속으로 쫓는다)
    steer(p, ux * sp, uy * sp, dt);
  }
  else if (!own && !ball.owner && (ball.passTarget === p || (!(ball.passTarget && ball.passTarget.t === p.t) && d(p, ball) < 10))) { const hs = headSpot(s, p), q = hs && Math.hypot(hs.x - p.x, hs.y - p.y) < 6 ? hs : intercept(s, p); chase(p, q.x, q.y, ball.passTarget === p ? 1.24 : 1, dt); }
  else if (!own && ball.owner && ball.owner.t !== p.t && (I.down.shoot || I.down.jockey)) { // 압박(슛 키를 누른 채)·자세 낮추기(C): 가까우면 공과 골 사이에서 거리를 유지하며 따라붙는다
    const o = ball.owner, q = d(p, o);
    if (q < 2.6) { const g = wx(0, p.t), ux = g - o.x, uy = CY - o.y, L = Math.hypot(ux, uy) || 1; moveTo(p, o.x + ux / L * 1.5 + o.vx * 0.15, o.y + uy / L * 1.5 + o.vy * 0.15, 1.0, dt); }
    else moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, sprint ? 1.3 : 1.05, dt);
  }
  else if (!own && ball.owner && ball.owner.t !== p.t && d(p, ball.owner) < 4.5) { const o = ball.owner; moveTo(p, o.x, o.y, 0.55, dt); } // 손 놓고 있어도 가까운 상대는 천천히 따라붙는다
  else steer(p, 0, 0, dt);
  if (own) {
    if (I.press.pass || I.press.lob || I.press.through || I.press.shoot || I.press.chip) p.shield = 0.16; // 누른 순간 의도는 지켜준다: 떼기·와인드업 사이에 뺏기지 않는다
    if (kicking) return; // 와인드업 중엔 새 입력을 받지 않는다
    if (dead && M.setAim) { // 코너킥·프리킥·골킥: 조준점으로 찬다. 롱패스 = 띄우기(누른 시간 = 낮고 빠르게), 슛 = 조준점이 골문이면 직접 슛(누른 시간 = 세기·높이)·아니면 낮고 빠른 공, 패스·스루 = 조준 방향 동료에게
      const aa = Math.atan2(M.aimY - M.setY, M.aimX - M.setX);
      if (I.rel.pass && h.armP) { const pw = clamp((I.holdT.pass - 0.12) / 0.45, 0, 1); queueKick(s, p, () => shortPass(s, p, aa, pw), 0.04); return; }
      if (I.rel.lob && h.armL) { const pw = clamp((I.holdT.lob - 0.1) / 0.5, 0, 1); queueKick(s, p, () => setKick(s, p, 'loft', pw)); return; }
      if (I.press.through) { queueKick(s, p, () => throughPass(s, p, aa, 0), 0.04); return; }
      if (I.press.shoot) { h.charging = true; h.charge = 0; }
      if (h.charging) {
        if (I.down.shoot) h.charge = Math.min(1, h.charge + dt / 0.9);
        if (I.rel.shoot || !I.down.shoot) { const c = h.charge, shot = setShotAim(s); queueKick(s, p, () => setKick(s, p, shot ? 'shot' : 'drive', c)); h.charging = false; h.charge = 0; }
        return;
      }
      if (M.setT > 8 && !I.down.lob && !I.down.pass) queueKick(s, p, () => shortPass(s, p, aa, 0.3), 0.04); // 8초를 넘기면 가까운 동료에게 짧게
      return;
    }
    if (dead && M.setT > 8 && !h.charging) { queueKick(s, p, () => shortPass(s, p, p.dir, 0.3), 0.04); return; }
    // 킥 묶음: 떼는 순간과 원터치(미리 뗀 키)가 같은 식을 쓴다
    const kPass = (pw: number, go: boolean, hm: Player | null) => { const am = aimOf(I, p), tie = am.free ? 0.4 : am.sharp ? 0.1 : 0.2, cm = hm ?? (am.free ? calledMate(s, p) : null); /* 방향키 없이 누르면 방금 부른 동료에게 (49차). Q를 누른 채면 주고 뛰기 (50차). 온라인 게스트가 자기 화면에서 고른 동료가 있으면 그 동료에게 (51차) */ queueKick(s, p, () => { if (cm && !cm.off) passTo(s, p, cm, false, pw); else shortPass(s, p, am.a, pw, tie, am.sharp); if (go) { passGo(s, p); if (p.runT > 0 && ball.owner !== p) { h.goP = p; h.goT = 0.6; h.goA = am.a; h.runP = null; } } }, 0.04); };
    const kLob = (pw: number, low: boolean) => queueKick(s, p, () => longPass(s, p, aim, 0.35 + pw * 0.65, low));
    const kThru = (pw: number, hm: Player | null) => { const am = aimOf(I, p); /* 스루패스(51차): 떼는 순간 나가고 누른 시간이 세기 — 탭은 받는 선수 3m 앞, 끝까지 누르면 11m 앞·먼 동료 */ queueKick(s, p, () => throughPass(s, p, am.a, pw, undefined, { only: hm && !hm.off ? hm : null, sharp: am.sharp }), 0.04); };
    // 원터치(52차): 나한테 오는 패스가 닿기 전에 뗀 패스·롱패스·스루·슛은 닿자마자 나간다. 슛 키를 누른 채 받으면 누른 시간만큼 이미 모은 것으로 친다. 전엔 닿기 전에 뗀 키는 버려져, 받은 뒤 다시 눌러야 했다
    if (h.bufK && !dead && !hands) { const k = h.bufK, pw = h.bufPw, op = h.bufOpt, bm = h.bufM && h.bufM !== p ? h.bufM : null; h.bufK = 0; h.bufT = 0; h.bufM = null; p.shield = Math.max(p.shield, 0.16);
      if (k === 1) kPass(pw, op === 1, bm); else if (k === 2) kLob(pw, op === 1); else if (k === 3) kThru(pw, bm);
      else { const ay = mag > 0.15 ? my / mag : 0; queueKick(s, p, op === 2 ? () => chipShot(s, p) : () => shoot(s, p, 0.5 + pw * 0.5, ay, op === 1)); }
      h.charging = false; return; }
    if (h.preShot && I.down.shoot && !h.charging && !dead && !hands) { h.preShot = false; h.charging = true; h.charge = Math.min(1, I.holdT.shoot / 0.8); h.mod = 0; p.shield = Math.max(p.shield, 0.4); }
    const anyPress = I.press.pass || I.press.lob || I.press.through || I.press.shoot || I.press.switch || I.press.gkRush || I.down.pass || I.down.lob || I.down.shoot || I.down.through || I.rel.pass || I.rel.lob || I.rel.shoot || I.rel.chip || I.rel.through; // 떼는 틱(rel)도 입력 중: 빠지면 질주 중 패스가 노크온에 먹힌다
    // 치달 (Shift, 폰은 질주 중 앞으로 스와이프): 스틱 방향(없으면 보는 방향, 몸에서 100° 안)으로 공을 길게 차 놓고 달린다
    if (I.press.switch && !dead && !hands && !h.charging && p.spin <= 0 && p.stun <= 0) { const sa = mag > 0.15 ? Math.atan2(my, mx) : p.dir; bigKnock(s, p, Math.abs(angDiff(p.dir, sa)) < 1.75 ? sa : p.dir); return; }
    if (sprint && mag > 0.15 && Math.hypot(p.vx, p.vy) > 5.5 && !h.charging && !anyPress && p.spin <= 0 && Math.abs(angDiff(Math.atan2(p.vy, p.vx), Math.atan2(my, mx))) < 0.4 && !oppAhead(s, p) && !dead) { knockOn(s, p); return; } // 질주 드리블은 공을 앞에 차 놓고 달린다 (도는 중엔 발에 붙여 돈다)
    // 개인기: X 탭 (폰: 스와이프 → I.skill)
    if (I.press.gkRush && !dead && !hands) {
      const sw = I.skill, sv = sw ?? { x: mx, y: my }; I.skill = null;
      if (sw && sprint && Math.hypot(p.vx, p.vy) > 4 && (Math.cos(p.dir) * sv.x + Math.sin(p.dir) * sv.y) / (Math.hypot(sv.x, sv.y) || 1) > 0.5) { bigKnock(s, p, Math.atan2(sv.y, sv.x)); return; }
      if (skillMove(s, p, sv.x, sv.y)) return;
    }
    // 패스는 떼는 순간, 누른 시간이 세기 (탭 = 보통). 우리 공일 때 누른 것만 (수비 때 누른 전환·슬라이딩 키를 공을 뺏은 뒤에 떼도 패스가 나가지 않는다)
    if (I.rel.pass && h.armP) { kPass(passPw(I), I.down.run, hinted(s, I, p, 1)); h.charging = false; return; } // 방향키 없이 누르면 보는 쪽 넓게
    if (I.rel.lob && h.armL) { const low = I.down.chip; if (low) h.zUsed = true; /* 감아차기 키(Z)를 누른 채 롱패스 = 땅볼 크로스·낮은 롱패스 (52차) — Z를 떼도 칩슛은 안 나간다 */ kLob(clamp((I.holdT.lob - 0.1) / 0.5, 0, 1), low); h.charging = false; return; }
    if (I.rel.through && h.armT) { kThru(thruPw(I), hinted(s, I, p, 2)); h.charging = false; return; }
    if (I.rel.chip && !h.zUsed && !h.charging) { queueKick(s, p, () => chipShot(s, p)); return; } // Z만 눌렀다 떼면 칩슛 (Z를 누른 채 슛 = 감아차기)
    if (I.press.shoot) { h.charging = true; h.charge = 0; h.mod = 0; p.shield = Math.max(p.shield, 0.4); } // 슛은 누른 뒤 0.4초까지 지켜 준다: 게이지 절반 이하의 슛은 반드시 나간다 (.16초로는 모으는 사이 3번 중 2번을 뺏겼다). 끝까지 모으려면 공간이 있어야 한다
    if (h.charging && I.press.pass && !dead && !hands) { h.armP = false; h.charging = false; h.charge = 0; fakeShot(s, p, h); return; } // 페이크 슛(52차): 슛을 모으는 중 패스 키 — 차는 척만 하고 방향키 쪽으로 꺾는다 (떼도 패스는 안 나간다)
    if (h.charging) {
      if (I.down.run) h.mod = 2; else if ((I.down.chip || I.down.gkRush) && h.mod < 1) h.mod = 1; // Q를 누른 채 슛 = 칩슛, Z(또는 X)를 누른 채 슛 = 감아차기 (FC 온라인)
      if (I.down.chip) h.zUsed = true;
      if (I.down.shoot) h.charge = Math.min(1, h.charge + dt / 0.8);
      if (I.rel.shoot || !I.down.shoot) { const pw = 0.5 + h.charge * 0.5, ay = mag > 0.15 ? my / mag : 0, md = h.mod; p.shield = Math.max(p.shield, 0.13); queueKick(s, p, md === 2 ? () => chipShot(s, p) : () => shoot(s, p, pw, ay, md === 1)); h.charging = false; h.charge = 0; }
    }
  } else {
    if (h.charging) { h.charging = false; h.charge = 0; }
    const o0 = ball.owner, theirs = !!o0 && o0.t !== p.t, inbound = (!!o0 && o0.t === p.t) || (!o0 && !!ball.passTarget && ball.passTarget.t === p.t); // inbound: 우리 편이 갖고 있거나 우리 편에게 가는 패스 — 그동안 누른 패스·롱패스는 미리 누른 것이지 전환·슬라이딩이 아니다
    // 수비 (FC 온라인): 슛 키 = 태클(탭)·압박(누른 채), 롱패스 키 = 슬라이딩, 패스 키 = 커서 전환, 스루 키 = 골키퍼 나오기, Q = 동료 압박
    // 원터치(52차): 나한테 오는 패스(내가 차 놓은 공도)가 닿기 전에 뗀 키를 기억해 둔다 — 닿는 순간 `own` 쪽에서 실행
    const mineIn = !o0 && (ball.passTarget === p || ball.knock === p) && M.phase === 'live' && !M.dead;
    if (mineIn) {
      const buf = (k: number, pw: number, op: number, hm: Player | null) => { h.bufK = k; h.bufPw = pw; h.bufOpt = op; h.bufT = 1.2; h.bufM = hm; };
      if (I.rel.pass && h.armP) buf(1, passPw(I), I.down.run ? 1 : 0, hinted(s, I, p, 1));
      else if (I.rel.lob && h.armL) { const low = I.down.chip; if (low) h.zUsed = true; buf(2, clamp((I.holdT.lob - 0.1) / 0.5, 0, 1), low ? 1 : 0, null); }
      else if (I.rel.through && h.armT) buf(3, thruPw(I), 0, hinted(s, I, p, 2));
      if (I.press.shoot) h.preShot = true;
      else if (I.rel.shoot && h.preShot) { h.preShot = false; if (I.down.chip) h.zUsed = true; buf(4, clamp(I.holdT.shoot / 0.8, 0, 1), I.down.run ? 2 : I.down.chip || I.down.gkRush ? 1 : 0, null); }
    }
    if (I.press.jockey && mineIn && dummy(s, h, p)) return; // 흘리기(53차): 나한테 오는 패스에 호출 키
    const tk = (I.press.shoot && !mineIn) || I.press.tackle; // 태클: 슛 키 탭 또는 태클 키(Space)
    if (tk && !ball.owner && ball.z < 1.3 && d(p, ball) < 1.7 && p.kickCD <= 0 && !(ball.passTarget === p)) { p.lunge = 0.3; // 가로채기 런지: 지나가는 공에 발을 뻗는다
      const sp = Math.hypot(ball.vx, ball.vy), dx = ball.x - p.x, dy = ball.y - p.y, q = Math.hypot(dx, dy) || 1; p.vx = dx / q * p.speed * 1.2; p.vy = dy / q * p.speed * 1.2; p.dir = Math.atan2(dy, dx);
      if (s.rnd() < clamp(1.4 - sp / 30, 0.4, 1) * (0.9 + n(p.attrs.int) * 0.2)) { gain(s, p); sfx(s, 'tackle'); } else p.kickCD = 0.3;
    }
    else if (tk) standTackle(s, p);
    else if (I.down.shoot && I.holdT.shoot > 0.25 && theirs && d(p, o0!) < 1.8 && p.tackleCD <= 0 && (o0!.kickCD > 0 || Math.hypot(o0!.vx, o0!.vy) > 6)) standTackle(s, p); // 압박 중 공이 발에서 떨어지면 알아서 태클
    if (I.press.lob && !inbound) slideTackle(s, p, aim);
    if (I.press.pass && !inbound) switchPlayer(s, h); // 공에 가장 가까운 선수 (연달아 누르면 그다음 가까운 선수)
    else if ((I.press.switch && !inbound && ball.knock !== p) || (I.down.pass && I.holdT.pass > 0.32 && !h.swHold && !inbound)) { h.swHold = true; switchBack(s, h); } // Shift(또는 전환 길게): 공과 우리 골 사이를 지키는 뒤쪽 수비수
    if (I.down.run && I.holdT.run > 0.2) h.second = true; // Q를 누르고 있으면 둘째 수비수도 같이 압박
    if (!inbound && (I.down.gkRush || (I.down.through && (!I.touch || I.holdT.through > 0.12)))) h.gkRush = true; // 우리 공일 때 누르고 있는 스루 키는 미리 누른 패스다 (52차 — 키퍼를 내보내지 않는다)
    // 몸싸움: 공 가진 상대와 부딪히면 버튼 없이도 어깨 싸움으로 공을 뺏을 수 있다 (피지컬·밸런스 대결)
    const o = ball.owner;
    if (o && o.t !== p.t && !(o.role === 'GK' && !o.atFeet) && M.protect <= 0 && p.stun <= 0 && o.spin <= 0 && o.shield <= 0) {
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
/** 커서 전환 공통: key가 가장 작은 선수로. 1.2초 안에 다시 누르면 방금 거쳐 간 선수들은 건너뛴다(둘 사이만 오가지 않게). commit=false면 누가 될지만 알려 준다 */
function pickSwitch(s: Sim, h: Human, key: (p: Player) => number, commit = true) {
  const seen = h.swT > 0 ? h.swSeen : [], all = s.team[h.t].filter(p => p.role !== 'GK' && !p.off && p !== h.ctrl);
  let list = all.filter(p => !seen.includes(p)), wrapped = false; if (!list.length) { list = all; wrapped = true; }
  let best: Player | null = null, bk = 1e9; for (const p of list) { const k = key(p); if (k < bk) { bk = k; best = p; } }
  if (best && commit) { if (h.swT <= 0 || wrapped) h.swSeen.length = 0; if (h.ctrl) h.swSeen.push(h.ctrl); h.ctrl = best; h.lock = 1.2; h.swT = 1.2; }
  return best;
}
export function switchPlayer(s: Sim, h: Human) { const { ball } = s; pickSwitch(s, h, ball.owner ? p => d(p, ball) / p.speed : p => interceptT(s, p)); }
/** 뒤쪽 수비수: 공에서 우리 골 쪽으로 (거리의 절반, 최대 18m) 내려간 지점에 가장 가까운, 공보다 골 쪽에 있는 선수 */
const backKey = (s: Sim, h: Human) => {
  const { ball } = s, g = wx(0, h.t), ux = g - ball.x, uy = CY - ball.y, L = Math.hypot(ux, uy) || 1, k = Math.min(L * 0.5, 18), tx = ball.x + ux / L * k, ty = ball.y + uy / L * k, bl = wx(ball.x, h.t);
  return (p: Player) => Math.hypot(p.x - tx, p.y - ty) + (wx(p.x, h.t) < bl + 1 ? 0 : 9);
};
export function switchBack(s: Sim, h: Human) { pickSwitch(s, h, backKey(s, h)); }
/** Shift를 누르면 넘어갈 선수 (화면에 작은 표시로 미리 보여 준다) */
export function backTarget(s: Sim, h: Human) { return pickSwitch(s, h, backKey(s, h), false); }
