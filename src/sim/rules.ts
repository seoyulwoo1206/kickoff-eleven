/* 규칙: 파울 어드밴티지, 경고·퇴장, 추가시간, 프리킥 벽, 교체 */
import { W, H, CX, CY } from './consts';
import { clamp, d, wx } from './util';
import type { Sim, Player } from './types';
import type { PlayerDef } from '../data/squad';
import { banner, sfx } from './events';
import { setPiece, nearestOutfield } from './match';
import { detailOf, overall } from '../data/squads';

export const alive = (p: Player) => !p.off;
/** 파울 처리. reckless: 사람을 향한·빠른 슬라이딩, behind: 뒤에서. 어드밴티지는 1.6초 동안 본다 */
export function foulCommitted(s: Sim, by: Player, on: Player, reckless: boolean, behind: boolean) {
  const { M, ball } = s, t = on.t;
  M.stats.fouls[by.t]++; M.stops++;
  // 카드: 명백한 득점 기회 저지(골문 30m 안, 골 쪽에 키퍼 말고 아무도 없음)면 퇴장 가능
  const gx = wx(W, t), dG = Math.hypot(gx - on.x, CY - on.y);
  const lastMan = dG < 30 && !s.team[by.t].some(q => q !== by && q.role !== 'GK' && !q.off && Math.abs(wx(q.x, t) - wx(gx, t)) < Math.abs(wx(on.x, t) - wx(gx, t)));
  const r = s.rnd();
  if (lastMan && r < 0.55) card(s, by, 'R');
  else if ((reckless && r < 0.7) || (behind && r < 0.45) || (lastMan && r < 0.85)) card(s, by, 'Y');
  const inBox = wx(on.x, t) > W - 16.5 && Math.abs(on.y - CY) < 20.16;
  const spot = inBox ? { x: wx(W - 11, t), y: CY, pen: true } : { x: clamp(on.x, 1, W - 1), y: clamp(on.y, 1, H - 1), pen: false };
  // 공이 피파울 팀에 남아 있으면 어드밴티지를 본다 (페널티는 바로)
  if (!spot.pen && ball.owner && ball.owner.t === t) { M.adv = { t, x: spot.x, y: spot.y, timer: 1.6, on }; return; }
  award(s, t, spot.x, spot.y, spot.pen);
}
function award(s: Sim, t: number, x: number, y: number, pen: boolean) { if (pen) setPiece(s, 'penalty', t, x, y); else setPiece(s, 'freekick', t, x, y); }
/** 어드밴티지 판정 (매 틱). 피파울 팀이 압박 없이 공을 이어가면 플레이 온, 아니면 원래 자리에서 프리킥 */
export function updateAdvantage(s: Sim, dt: number) {
  const { M, ball } = s, a = M.adv; if (!a || M.phase !== 'live') return;
  a.timer -= dt;
  const o = ball.owner;
  if (o && o.t !== a.t) { M.adv = null; award(s, a.t, a.x, a.y, false); return; } // 상대가 뺏었다 → 파울 적용
  if (o && o.t === a.t && o !== a.on && o.stun <= 0) { let nd = 1e9; for (const q of s.team[1 - a.t]) if (!q.off) nd = Math.min(nd, d(q, o)); if (nd > 1.8) { M.adv = null; banner(s, '', '어드밴티지 · 플레이 온', 900); return; } }
  if (a.timer <= 0) { M.adv = null; if (o && o.t === a.t) return; award(s, a.t, a.x, a.y, false); }
}
export function card(s: Sim, p: Player, kind: 'Y' | 'R') {
  const { M } = s;
  if (kind === 'Y') { p.yellow++; M.stats.yel[p.t]++; if (p.yellow >= 2) { banner(s, '', `${p.name} 경고 누적 퇴장`, 1800); sfx(s, 'whistle'); sendOff(s, p); return; } banner(s, '', `${p.name} 경고`, 1400); s.ev.push({ k: 'card', t: p.t, num: p.num, kind: 'Y' }); }
  else { M.stats.red[p.t]++; banner(s, '', `${p.name} 퇴장`, 1800); sfx(s, 'whistle'); sendOff(s, p); }
}
export function sendOff(s: Sim, p: Player) {
  p.off = true; p.x = -8; p.y = -8; p.vx = p.vy = 0; p.pending = null; p.kickWind = 0;
  s.ev.push({ k: 'card', t: p.t, num: p.num, kind: 'R' });
  const h = s.HU[p.t]; if (h && h.ctrl === p) h.ctrl = nearestOutfield(s, p.t, s.ball);
  if (s.ball.owner === p) s.ball.owner = null;
}
/** 전반·후반 끝에 추가시간(분) 정하기: 중단 횟수(골·파울·교체) 기준 1~5분 */
export function addedMinutes(s: Sim) { return clamp(1 + Math.round(s.M.stops * 0.35 + s.rnd()), 1, 5); }
/** 프리킥 벽: 골문 30m 안 직접 프리킥이면 수비 3~5명을 공-골 선상 9.15m에 세운다 */
export function buildWall(s: Sim, t: number, x: number, y: number) {
  const gx = wx(W, t), dG = Math.hypot(gx - x, CY - y); if (dG > 32) return;
  const n = dG < 20 ? 5 : dG < 26 ? 4 : 3, ux = (gx - x) / dG, uy = (CY - y) / dG, px = -uy, py = ux;
  const defs = s.team[1 - t].filter(q => q.role !== 'GK' && !q.off).sort((a, b) => d(a, { x, y }) - d(b, { x, y })).slice(0, n);
  defs.forEach((q, i) => { const off = (i - (n - 1) / 2) * 0.8; q.x = clamp(x + ux * 9.3 + px * off, 1, W - 1); q.y = clamp(y + uy * 9.3 + py * off, 1, H - 1); q.vx = q.vy = 0; q.dir = Math.atan2(y - q.y, x - q.x); });
}
/** 교체: 나가는 선수 객체에 들어오는 선수의 데이터를 덮어쓴다 (객체·인덱스 유지 → 스냅샷 안전). 최대 5명 */
export function substitute(s: Sim, t: number, out: Player, inDef: PlayerDef): boolean {
  const { M } = s; if (M.subs[t] >= 5 || out.t !== t || out.off) return false;
  const bi = M.bench[t].indexOf(inDef); if (bi < 0) return false;
  M.bench[t].splice(bi, 1); M.subs[t]++; M.stops++;
  const det = detailOf(inDef);
  out.def = inDef; out.name = inDef.name; out.nameEn = inDef.nameEn; out.num = inDef.num; out.pos = inDef.pos; out.foot = inDef.foot; out.skill = inDef.skill; out.attrs = det; out.ovr = overall(inDef);
  out.speed0 = (6.0 + (det.spd - 60) / 40 * 1.7) * (out.role === 'GK' ? 0.92 : 1); out.sta = 1; out.yellow = 0; out.stun = 0; out.pending = null; out.kickWind = 0;
  banner(s, '', `교체 IN ${inDef.name}`, 1400); s.ev.push({ k: 'sub', t, num: inDef.num });
  return true;
}
export { CX };
