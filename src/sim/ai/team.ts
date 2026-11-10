import { W, H, CY } from '../consts';
import { clamp, d, wx } from '../util';
import { DIFF } from '../../data/teams';
import type { Sim, Player } from '../types';
import { slideCheck, intercept, interceptT, offsideLine } from '../ball';
import { chase, moveTo, targetFor, gapY, defLine } from '../move';
import { tryTackle, aiCarrier } from './carrier';
import { gkAI } from './gk';

/* 팀 AI: 공 없을 땐 가장 빨리 닿는 선수가 추격. 수비 땐 가장 가까운 AI가 (사람과 별개로) 항상 압박, 둘째는 골 쪽 커버,
   나머지 DF/MF는 근처 상대를 골 쪽에서 마크. 공격 땐 공 가진 선수 주변 둘이 앞 좌우로 패스 받을 자리를 잡는다 */
export function teamAI(s: Sim, t: number, dt: number) {
  const { ball, M, team, HU } = s;
  const D = DIFF[M.diff], own = ball.owner, h = HU[t];
  // 노크온(질주 드리블로 공을 2~3m 앞에 차 놓은 상태)은 공 주인이 없지만 공 가진 것처럼 본다 — 안 그러면 질주 드리블에 수비 대형(커버·마크)이 풀린다
  const knocker = !own && ball.knock && !ball.knock.off && d(ball.knock, ball) < 2.5 ? ball.knock : null, carrier = own ?? knocker;
  const att = !!carrier && carrier.t === t, def = !!carrier && carrier.t !== t;
  const tac = M.tac[t], outs = team[t].filter(p => p.role !== 'GK' && p !== (h && h.ctrl) && !p.off);
  const humanOn = !!(h && h.ctrl && carrier && carrier.t !== t && d(h.ctrl, carrier) < 3); // 사람 커서 선수가 이미 붙어 있으면 수비수는 마크를 지킨다 (셋이 몰리면 뒷공간이 빈다)
  let chaser: Player | null = null, cover: Player | null = null; const marks = new Map<Player, Player>(), supports = new Map<Player, { x: number; y: number }>();
  if (!carrier) {
    if (ball.passTarget && ball.passTarget.t === t) chaser = ball.passTarget;
    else if (ball.knock && ball.knock.t === t) chaser = (h && h.ctrl === ball.knock) ? null : ball.knock;
    else if (M.react[t] <= 0 || (ball.kicker && ball.kicker.t === t)) { // 상대 패스엔 반응 지연 뒤에 쫓는다
      let bt = 1e9; for (const p of outs) { const tt = interceptT(s, p); if (tt < bt) { bt = tt; chaser = p; } }
      if (h && h.ctrl && interceptT(s, h.ctrl) <= bt - 0.35) chaser = null; // 사람이 확실히 빠를 때만 양보
    }
  } else if (def) {
    let outlet: Player | null = null; for (const p of outs) if (p.role === 'FW' && (!outlet || p.bx > outlet.bx)) outlet = p; // 역습 출구: 가장 앞선 공격수
    const so = outs.filter(p => !h || p !== outlet || d(p, ball) < 5 || wx(ball.x, t) > 62).sort((a, b) => d(a, ball) - d(b, ball)); // 출구 공격수는 공이 코앞이거나 상대 진영 깊숙할 때만 압박에 가담
    chaser = so[0]; cover = so[1];
    if (!own) { // 노크온 공은 가장 먼저 닿는 선수가 쫓는다 (뒤에서 따라가는 선수가 아니라 앞에서 끊을 수 있는 선수)
      let bt = 1e9, bp: Player | null = null; for (const p of outs) { const tt = interceptT(s, p); if (tt < bt) { bt = tt; bp = p; } }
      if (bp) { chaser = bp; cover = so.find(p => p !== bp) ?? null; }
      if (h && h.ctrl && interceptT(s, h.ctrl) <= bt - 0.35) chaser = null;
    }
    if (carrier && !humanOn && wx(carrier.x, t) < 38) { const df = so.find(p => p !== chaser && p.role === 'DF' && d(p, carrier) < 14); if (df) cover = df; } // 수비 지역에선 가장 가까운 수비수가 마크를 버리고 드리블러 앞을 막는다
    if (h && h.second && so[2]) cover = so[2]; // 세컨드 디펜더: 둘째도 같이 압박
    // 마크: 공 없는 상대를 위협 순(우리 골에 가까운 순)으로, 가까운 수비·미드필더가 골 쪽에서 막는다
    const g = wx(0, t), threats = team[1 - t].filter(o => o !== carrier && o.role !== 'GK' && !o.off).sort((a, b) => Math.abs(a.x - g) - Math.abs(b.x - g)).slice(0, 6);
    const free = outs.filter(p => p !== chaser && p !== cover && p.role !== 'FW');
    for (const o of threats) { let best: Player | null = null, bd = tac.press === 2 ? 18 : 14; for (const p of free) { if (marks.has(p)) continue; const q = d(p, o); if (q < bd) { bd = q; best = p; } } if (best) marks.set(best, o); }
  } else if (att && carrier && carrier.role !== 'GK') {
    const fx = t === 0 ? 1 : -1, c0 = carrier;
    if (h) { // 사람 팀: 가까운 미드필더 둘이 안쪽 앞(원투 받을 자리)과 뒤(되돌려 받을 자리)에 선다. 공격수는 자기 역할대로, 박스 플레이 땐 각자 박스 자리로
      const bs = Math.sign(c0.y - CY) || 1, box = wx(c0.x, t) > 76 && Math.abs(c0.y - CY) > 9;
      if (!box) { const ms = outs.filter(p => p !== c0 && p.role === 'MF' && p.runT <= 0 && Math.abs(p.by - CY) <= 14).sort((a, b) => d(a, c0) - d(b, c0)); // 가운데 미드필더만 (윙어는 폭을 지킨다)
        if (ms[0]) supports.set(ms[0], { x: c0.x + fx * 6, y: clamp(c0.y - bs * 8, 4, H - 4) });
        if (ms[1]) supports.set(ms[1], { x: c0.x - fx * 7, y: clamp(c0.y - bs * 5, 4, H - 4) }); }
    } else {
      const cands = outs.filter(p => p !== c0 && p.role !== 'DF').sort((a, b) => d(a, c0) - d(b, c0)).slice(0, 2);
      cands.forEach((p, i) => { const side = (i === 0 ? (c0.y < CY ? 1 : -1) : (c0.y < CY ? -1 : 1)); supports.set(p, { x: c0.x + fx * 9, y: clamp(c0.y + side * 9, 3, H - 3) }); });
    }
    if (knocker && !(h && h.ctrl === knocker)) chaser = knocker; // 우리 편 AI가 차 놓은 공은 그 선수가 쫓는다
    // 자동 침투: 공격수·앞선 미드필더가 번갈아 뒷공간으로 뛴다 (Q 침투와 같은 runT). 공이 하프라인 근처를 넘었을 때만
    if (M.lastAtt !== t) { M.lastAtt = t; M.autoRun[t] = Math.min(M.autoRun[t], 0.35); } // 공을 막 뺏었으면 곧바로 한 명이 뛴다
    M.autoRun[t] -= dt;
    if (h && M.autoRun[t] <= 0 && wx(c0.x, t) > 38 && !(wx(c0.x, t) > 76 && Math.abs(c0.y - CY) > 9)) { // 사람 팀만: AI끼리는 침투하는 동료에게 주는 패스가 끊겨 패스 성공률이 73→58%로 떨어졌다
      const line = offsideLine(s, t), gx = t === 0 ? W : 0;
      const lbx = wx(c0.x, t), isFB = (p: Player) => p.role === 'DF' && Math.abs(p.by - CY) > 14 && (p.by - CY) * (c0.y - CY) > 0 && lbx > 50; // 공 쪽 풀백
      const cs = outs.filter(p => p !== c0 && p.runT <= 0 && (p.role === 'FW' || isFB(p) || (p.role === 'MF' && (p.bx >= 48 || Math.abs(p.by - CY) > 14))) && wx(p.x, t) <= line + 0.3 && wx(p.x, t) > lbx - (isFB(p) ? 16 : 8) && d(p, c0) < 38 && wx(p.x, t) < 96);
      // 가장 넓은 틈 앞에 선 선수가 뛴다 (조금의 무작위). 풀백은 터치라인을 따라 곧장, 나머지는 수비 사이 틈으로
      let r: Player | null = null, bsc = -1e9, ry = 0;
      for (const p of cs) { const gy = isFB(p) ? p.y : gapY(s, t, p.y, line); let w = 30; for (const o of team[1 - t]) { if (o.off || o.role === 'GK' || wx(o.x, t) < line - 7) continue; w = Math.min(w, Math.abs(o.y - gy)); } const sc = Math.min(w, 8) + (p.role === 'FW' ? 2 : 0) + s.rnd() * 4; if (sc > bsc) { bsc = sc; r = p; ry = gy; } }
      if (r) { const tx = wx(Math.min(line + 14, 101), t); r.runT = 2.5; r.runDir = Math.atan2((isFB(r) ? r.y : ry) - r.y, (isFB(r) ? gx : tx) - r.x); }
      M.autoRun[t] = (lbx > 52 ? 1.5 : 2.2) + s.rnd() * 1.6;
    }
  }
  // 패스 길 열기: 공 가진 동료와 내 목표 사이 선로에 상대가 서 있으면(1.6m) 그 반대쪽으로 3.5m 비켜 선다
  const openLane = (x: number, y: number) => {
    if (!h || !carrier || carrier.t !== t) return { x, y };
    const ax = x - carrier.x, ay = y - carrier.y, L2 = ax * ax + ay * ay; if (L2 < 16) return { x, y };
    let worst = 0, sideSum = 0;
    for (const o of team[1 - t]) { if (o.off) continue; const u = ((o.x - carrier.x) * ax + (o.y - carrier.y) * ay) / L2; if (u < 0.1 || u > 0.95) continue; const cr = ((o.x - carrier.x) * ay - (o.y - carrier.y) * ax) / Math.sqrt(L2); if (Math.abs(cr) < 1.6 && 1.6 - Math.abs(cr) > worst) { worst = 1.6 - Math.abs(cr); sideSum = cr >= 0 ? 1 : -1; } }
    if (!worst) return { x, y };
    const L = Math.sqrt(L2), nx = ay / L, ny = -ax / L; // 선로의 수직 방향 (cr > 0 쪽)
    return { x: clamp(x - nx * sideSum * 3.5, 1, W - 1), y: clamp(y - ny * sideSum * 3.5, 2, H - 2) };
  };
  const pressing = !!(h && h.pressT > 0); // Q 압박 지원: 추격자는 더 빠르고 세게, 커버도 같이 붙는다
  const pressMul = (tac.press === 0 ? 0.88 : tac.press === 2 ? 1.12 : 1) * (pressing ? 1.15 : 1), tk = (h ? 0.45 : D.tackle) * (tac.press === 2 ? 1.15 : tac.press === 0 ? 0.85 : 1) * (pressing ? 1.3 : 1), press = (h ? 1.18 : D.press) * pressMul;
  // 압박 트리거: 공 가진 상대가 자기 골을 보고 있거나 터치가 커졌을 때 더 세게 달라붙는다
  const trig = carrier && carrier.t !== t && (carrier.kickCD > 0 || Math.cos(carrier.dir) * (t === 0 ? -1 : 1) > 0.3) ? 1.12 : 1;
  for (const p of team[t]) {
    if (p.off) continue;
    if (h && p === h.ctrl) continue;
    if (p.slide > 0) { slideCheck(s, p); continue; }
    if (p.role === 'GK') { gkAI(s, p, dt); continue; }
    if (own === p) { aiCarrier(s, p, dt); continue; }
    if (p.runT > 0 && (att || (!own && ball.lastTouch === t))) { // 침투 지시: 지시 방향으로 질주하되 오프사이드 라인 안에서
      const line = offsideLine(s, t); let tx = p.x + Math.cos(p.runDir) * 12, ty = clamp(p.y + Math.sin(p.runDir) * 12, 2, H - 2);
      if (wx(tx, t) > line - 0.4) tx = wx(line - 0.4, t);
      moveTo(p, tx, ty, 1.2, dt); continue;
    }
    if (p === chaser) {
      if (own || (knocker && knocker.t === t)) { if (!own) { const q = intercept(s, p); chase(p, q.x, q.y, 1.25, dt); continue; }
        let tx = own.x + own.vx * 0.25, ty = own.y + own.vy * 0.25;
        if (M.protect > 0) { const g = wx(0, t), ux = g - ball.x, uy = CY - ball.y, L = Math.hypot(ux, uy) || 1; tx = ball.x + ux / L * 5.5; ty = ball.y + uy / L * 5.5; }
        chase(p, tx, ty, press * trig, dt); tryTackle(s, p, own, tk * trig);
      } else { const q = intercept(s, p); chase(p, q.x, q.y, 1.25, dt); if (knocker && knocker.t !== t) tryTackle(s, p, knocker, tk * trig); } // 노크온 중인 상대는 공이 발에서 떨어져 있으니 발을 뻗어 끊는다
      continue;
    }
    if (p === cover) {
      if (carrier && carrier.t !== t && (pressing || (!humanOn && (d(p, carrier) < 3.6 || (wx(carrier.x, t) < 40 && d(p, carrier) < 9))))) { chase(p, carrier.x + carrier.vx * 0.2, carrier.y + carrier.vy * 0.2, press, dt); tryTackle(s, p, carrier, tk); continue; } // 드리블러가 코앞까지 오면 물러서지 않고 맞붙는다
      const g = wx(0, t), ux = g - ball.x, uy = CY - ball.y, L = Math.hypot(ux, uy) || 1, k = Math.min(6, L * 0.35); moveTo(p, ball.x + ux / L * k, ball.y + uy / L * k, 1.1, dt); tryTackle(s, p, carrier, tk * 0.8); continue;
    }
    const mk = marks.get(p);
    if (mk) {
      const g = wx(0, t), ux = g - mk.x, uy = CY - mk.y, L = Math.hypot(ux, uy) || 1, tg = targetFor(s, p, att, def);
      const md = tac.press === 2 ? 1.6 : tac.press === 0 ? 2.8 : 2.2, mx = mk.x + ux / L * md, my = mk.y + uy / L * md;
      let px = mx * 0.75 + tg.x * 0.25 + Math.sin(M.time * 1.3 + p.i * 2.1) * 0.6; const py = my * 0.75 + tg.y * 0.25 + Math.cos(M.time * 1.1 + p.i * 1.4) * 0.6;
      if (p.role === 'DF' && own) { const hold = defLine(wx(ball.x, t)) + tac.line * 3 - 1.5; if (wx(px, t) < hold) px = wx(Math.min(hold, Math.max(wx(ball.x, t) - 3, 6)), t); } // 마크를 따라가도 수비 라인 밑으로는 내려가지 않는다 (공이 발에 있는 동안. 패스가 뜨면 따라 내려감)
      moveTo(p, px, py, 1.05, dt);
      if (ball.passTarget === mk && !ball.owner) { // 마크 상대에게 오는 패스: 받기 전에 닿을 수 있으면 선로로 나가 끊는다
        const bs = Math.hypot(ball.vx, ball.vy) || 1, tm = d(ball, mk) / bs, ti = interceptT(s, p);
        if (ti < tm + 0.05 && ti < 1.5) { const q = intercept(s, p); chase(p, q.x, q.y, 1.25, dt); continue; }
      }
      if (ball.passTarget === mk) tryTackle(s, p, carrier, tk * 0.5); continue;
    }
    const sp = supports.get(p);
    if (sp) { const line = offsideLine(s, t), lx = Math.min(wx(sp.x, t), line - 0.8), o = openLane(wx(lx, t), sp.y); moveTo(p, o.x, o.y, h && Math.hypot(o.x - p.x, o.y - p.y) > 6 ? 1.2 : 1.05, dt); continue; }
    let tg = targetFor(s, p, att, def); if (att && carrier && p.role !== 'DF') tg = openLane(tg.x, tg.y);
    const q = Math.hypot(tg.x - p.x, tg.y - p.y), ahead = wx(tg.x, t) - wx(p.x, t);
    moveTo(p, tg.x, tg.y, h && att && ahead > 5 ? (p.role === 'DF' ? 1.1 : 1.2) : q > 7 ? 1.05 : 0.78, dt); // 공격 때 앞으로 멀리 가야 하면 질주로 따라붙는다
  }
}
