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
  const D = DIFF[M.diff], own = ball.owner, att = !!own && own.t === t, def = !!own && own.t !== t, h = HU[t];
  const outs = team[t].filter(p => p.role !== 'GK' && p !== (h && h.ctrl));
  let chaser: Player | null = null, cover: Player | null = null; const marks = new Map<Player, Player>(), supports = new Map<Player, { x: number; y: number }>();
  if (!own) {
    if (ball.passTarget && ball.passTarget.t === t) chaser = ball.passTarget;
    else if (ball.knock && ball.knock.t === t) chaser = (h && h.ctrl === ball.knock) ? null : ball.knock;
    else if (M.react[t] <= 0 || (ball.kicker && ball.kicker.t === t)) { // 상대 패스엔 반응 지연 뒤에 쫓는다
      let bt = 1e9; for (const p of outs) { const tt = interceptT(s, p); if (tt < bt) { bt = tt; chaser = p; } }
      if (h && h.ctrl && interceptT(s, h.ctrl) <= bt - 0.35) chaser = null; // 사람이 확실히 빠를 때만 양보
    }
  } else if (def) {
    const so = outs.slice().sort((a, b) => d(a, ball) - d(b, ball));
    chaser = so[0]; cover = so[1];
    if (h && h.second && so[2]) cover = so[2]; // 세컨드 디펜더: 둘째도 같이 압박
    // 마크: 공 없는 상대를 위협 순(우리 골에 가까운 순)으로, 가까운 수비·미드필더가 골 쪽에서 막는다
    const g = wx(0, t), threats = team[1 - t].filter(o => o !== own && o.role !== 'GK').sort((a, b) => Math.abs(a.x - g) - Math.abs(b.x - g)).slice(0, 6);
    const free = outs.filter(p => p !== chaser && p !== cover && p.role !== 'FW');
    for (const o of threats) { let best: Player | null = null, bd = 14; for (const p of free) { if (marks.has(p)) continue; const q = d(p, o); if (q < bd) { bd = q; best = p; } } if (best) marks.set(best, o); }
  } else if (att && own && own.role !== 'GK') {
    const fx = t === 0 ? 1 : -1, cands = outs.filter(p => p !== own && p.role !== 'DF').sort((a, b) => d(a, own) - d(b, own)).slice(0, 2);
    cands.forEach((p, i) => { const side = (i === 0 ? (own.y < CY ? 1 : -1) : (own.y < CY ? -1 : 1)); supports.set(p, { x: own.x + fx * 9, y: clamp(own.y + side * 9, 3, H - 3) }); });
  }
  const tk = h ? 0.45 : D.tackle, press = h ? 1.18 : D.press;
  for (const p of team[t]) {
    if (h && p === h.ctrl) continue;
    if (p.slide > 0) { slideCheck(s, p); continue; }
    if (p.role === 'GK') { gkAI(s, p, dt); continue; }
    if (own === p) { aiCarrier(s, p, dt); continue; }
    if (p === chaser) {
      if (own) {
        let tx = own.x + own.vx * 0.25, ty = own.y + own.vy * 0.25;
        if (M.protect > 0) { const g = wx(0, t), ux = g - ball.x, uy = CY - ball.y, L = Math.hypot(ux, uy) || 1; tx = ball.x + ux / L * 5.5; ty = ball.y + uy / L * 5.5; }
        chase(p, tx, ty, press, dt); tryTackle(s, p, own, tk);
      } else { const q = intercept(s, p); chase(p, q.x, q.y, 1.25, dt); }
      continue;
    }
    if (p === cover) { const g = wx(0, t), ux = g - ball.x, uy = CY - ball.y, L = Math.hypot(ux, uy) || 1, k = Math.min(6, L * 0.35); moveTo(p, ball.x + ux / L * k, ball.y + uy / L * k, 1.1, dt); tryTackle(s, p, own, tk * 0.8); continue; }
    const mk = marks.get(p);
    if (mk) {
      const g = wx(0, t), ux = g - mk.x, uy = CY - mk.y, L = Math.hypot(ux, uy) || 1, tg = targetFor(s, p, att, def);
      const mx = mk.x + ux / L * 2.2, my = mk.y + uy / L * 2.2; moveTo(p, mx * 0.75 + tg.x * 0.25, my * 0.75 + tg.y * 0.25, 1.05, dt);
      if (ball.passTarget === mk) tryTackle(s, p, own, tk * 0.5); continue;
    }
    const sp = supports.get(p);
    if (sp) { const line = offsideLine(s, t), lx = Math.min(wx(sp.x, t), line - 0.8); moveTo(p, wx(lx, t), sp.y, 1.05, dt); continue; }
    const tg = targetFor(s, p, att, def), q = Math.hypot(tg.x - p.x, tg.y - p.y); moveTo(p, tg.x, tg.y, q > 7 ? 1.05 : 0.78, dt);
  }
}
