/* 승부차기: 양 팀이 번갈아 페널티킥. 5개씩 뒤 서든데스. 토너먼트 연장 뒤에도, 승부차기 모드에서도 쓴다 */
import { W, H, CX, CY } from './consts';
import { wx } from './util';
import type { Sim } from './types';
import { banner, sfx } from './events';
import { setPiece } from './match';

export interface Shootout { kicks: [number[], number[]]; turn: number; first: number; t0: number; winner: number; kicker: number; }
export function startShootout(s: Sim) {
  const { M } = s;
  M.so = { kicks: [[], []], turn: M.firstKick, first: M.firstKick, t0: 0, winner: -1, kicker: -1 };
  for (const p of s.players) { p.sta = Math.max(p.sta, 0.6); p.pending = null; p.kickWind = 0; }
  banner(s, 'PENALTY SHOOTOUT', '승부차기', 2000); sfx(s, 'long');
  soNext(s);
}
/** 다음 키커 배치. 키커·키퍼 말고는 센터서클에 모인다 */
export function soNext(s: Sim) {
  const { M, team } = s, so = M.so!; const t = so.turn;
  so.t0 = 0;
  setPiece(s, 'penalty', t, wx(W - 11, t), CY);
  const kicker = s.ball.owner!, gk = team[1 - t][0]; so.kicker = s.players.indexOf(kicker);
  for (const p of s.players) { if (p === kicker || p === gk || p.off) continue; p.x = CX + (s.rnd() - 0.5) * 8; p.y = CY + (s.rnd() - 0.5) * 14; p.vx = p.vy = 0; }
  const h = s.HU[t]; if (h) h.ctrl = kicker;
  const g = (k: number[]) => k.filter(v => v).length;
  banner(s, '', `승부차기 ${M.teams[so.first].code} ${g(so.kicks[so.first])} - ${g(so.kicks[1 - so.first])} ${M.teams[1 - so.first].code} · ${M.teams[t].code} ${so.kicks[t].length + 1}번째 키커`, 1500);
  s.ev.push({ k: 'hud' });
}
/** 킥 결과 기록 → 승부 판정 → 다음 키커 또는 종료 */
export function soRecord(s: Sim, goal: boolean) {
  const { M } = s, so = M.so!; const t = so.turn;
  so.kicks[t].push(goal ? 1 : 0);
  const g = (k: number[]) => k.filter(v => v).length, a = so.first, b = 1 - a;
  const ga = g(so.kicks[a]), gb = g(so.kicks[b]), na = so.kicks[a].length, nb = so.kicks[b].length;
  const remA = Math.max(0, 5 - na), remB = Math.max(0, 5 - nb);
  let winner = -1;
  if (na <= 5 || nb <= 5) { if (ga > gb + remB) winner = a; else if (gb > ga + remA) winner = b; }
  if (na >= 5 && nb >= 5 && na === nb && ga !== gb) winner = ga > gb ? a : b; // 서든데스: 같은 수를 찼을 때 차이가 나면 끝
  if (winner < 0 && na >= 15 && nb >= 15 && na === nb) winner = s.rnd() < 0.5 ? a : b; // 안전장치: 15개씩 차도 못 가리면 동전
  if (winner >= 0) { so.winner = winner; M.phase = 'full'; banner(s, 'FULL TIME', `승부차기 ${M.teams[a].code} ${ga} - ${gb} ${M.teams[b].code}`, 2600); sfx(s, 'long'); s.ev.push({ k: 'full' }); return; }
  so.turn = 1 - t; soNext(s);
}
/** 매 틱: 킥이 끝났는지 본다 (골은 goal()에서 처리) */
export function soUpdate(s: Sim, dt: number) {
  const { M, ball } = s, so = M.so; if (!so || M.phase !== 'live') return;
  so.t0 += dt; const t = so.turn, kicker = s.players[so.kicker];
  const out = ball.x < -0.5 || ball.x > W + 0.5 || ball.y < 0 || ball.y > H;
  const taken = !!(ball.kicker && ball.kicker.t === t && !ball.owner) || !!(ball.owner && ball.owner.t !== t);
  if (out || (ball.owner && ball.owner.t !== t) || (taken && so.t0 > 3.2) || so.t0 > 8 || (ball.owner && ball.owner !== kicker && ball.owner.t === t)) soRecord(s, false);
}
