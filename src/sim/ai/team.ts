import { H, CY } from '../consts';
import { clamp, d, wx } from '../util';
import { DIFF } from '../../data/teams';
import type { Sim, Player } from '../types';
import { slideCheck, intercept, interceptT, offsideLine } from '../ball';
import { chase, moveTo, targetFor } from '../move';
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
    const so = outs.slice().sort((a, b) => d(a, ball) - d(b, ball));
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
    const fx = t === 0 ? 1 : -1, c0 = carrier, cands = outs.filter(p => p !== c0 && p.role !== 'DF').sort((a, b) => d(a, c0) - d(b, c0)).slice(0, 2);
    cands.forEach((p, i) => { const side = (i === 0 ? (c0.y < CY ? 1 : -1) : (c0.y < CY ? -1 : 1)); supports.set(p, { x: c0.x + fx * 9, y: clamp(c0.y + side * 9, 3, H - 3) }); });
    if (knocker && !(h && h.ctrl === knocker)) chaser = knocker; // 우리 편 AI가 차 놓은 공은 그 선수가 쫓는다
  }
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
      const md = tac.press === 2 ? 1.6 : tac.press === 0 ? 2.8 : 2.2, mx = mk.x + ux / L * md, my = mk.y + uy / L * md; moveTo(p, mx * 0.75 + tg.x * 0.25, my * 0.75 + tg.y * 0.25, 1.05, dt);
      if (ball.passTarget === mk && !ball.owner) { // 마크 상대에게 오는 패스: 받기 전에 닿을 수 있으면 선로로 나가 끊는다
        const bs = Math.hypot(ball.vx, ball.vy) || 1, tm = d(ball, mk) / bs, ti = interceptT(s, p);
        if (ti < tm + 0.05 && ti < 1.5) { const q = intercept(s, p); chase(p, q.x, q.y, 1.25, dt); continue; }
      }
      if (ball.passTarget === mk) tryTackle(s, p, carrier, tk * 0.5); continue;
    }
    const sp = supports.get(p);
    if (sp) { const line = offsideLine(s, t), lx = Math.min(wx(sp.x, t), line - 0.8); moveTo(p, wx(lx, t), sp.y, 1.05, dt); continue; }
    const tg = targetFor(s, p, att, def), q = Math.hypot(tg.x - p.x, tg.y - p.y); moveTo(p, tg.x, tg.y, q > 7 ? 1.05 : 0.78, dt);
  }
}
