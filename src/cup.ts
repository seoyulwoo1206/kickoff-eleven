/* 월드컵 토너먼트: 24팀 → 6조 × 4팀 조별리그 → 16강(각 조 1·2위 + 3위 상위 4팀) → 8강 → 4강 → 결승.
   사용자 경기만 실제로 플레이하고 나머지는 헤드리스로 돌린다. localStorage 'ko11cup'에 저장 */
import { TEAMS } from './data/teams';
import { createMatch, step } from './sim/match';
import { STEP } from './sim/consts';
import { squadOf, strengthOf } from './data/squads';
import { mulberry32 } from './sim/rng';

export type Stage = 'group' | 'r16' | 'qf' | 'sf' | 'f' | 'done';
export interface Fixture { a: number; b: number; stage: Stage; round: number; score?: [number, number]; so?: [number, number]; winner?: number; }
export interface Cup { seed: number; user: number; groups: number[][]; fixtures: Fixture[]; stage: Stage; round: number; ko: Record<string, number[]>; champion: number; eliminated: boolean; }
export const STAGE_NAMES: Record<Stage, string> = { group: '조별리그', r16: '16강', qf: '8강', sf: '4강', f: '결승', done: '종료' };
const KEY = 'ko11cup';
export const GROUP_NAMES = 'ABCDEF';

export function newCup(user: number, seed = (Math.random() * 1e9) >>> 0): Cup {
  const rnd = mulberry32(seed), idx = TEAMS.map((_, i) => i).filter(i => i !== user);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  idx.splice(Math.floor(rnd() * 24), 0, user);
  const groups: number[][] = []; for (let g = 0; g < 6; g++) groups.push(idx.slice(g * 4, g * 4 + 4));
  const fixtures: Fixture[] = [];
  for (let g = 0; g < 6; g++) { const [a, b, c, d] = groups[g]; fixtures.push({ a, b, stage: 'group', round: 1 }, { a: c, b: d, stage: 'group', round: 1 }, { a, b: c, stage: 'group', round: 2 }, { a: b, b: d, stage: 'group', round: 2 }, { a, b: d, stage: 'group', round: 3 }, { a: b, b: c, stage: 'group', round: 3 }); }
  return { seed, user, groups, fixtures, stage: 'group', round: 1, ko: {}, champion: -1, eliminated: false };
}
export function loadCup(): Cup | null { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && Array.isArray(c.groups) ? c : null; } catch { return null; } }
export function saveCup(c: Cup | null) { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* */ } }

/** 현재 라운드에서 사용자가 뛸 경기 */
export function userFixture(c: Cup): Fixture | null { return c.fixtures.find(f => f.stage === c.stage && f.round === c.round && !f.score && (f.a === c.user || f.b === c.user)) ?? null; }
export function pendingFixtures(c: Cup) { return c.fixtures.filter(f => f.stage === c.stage && f.round === c.round && !f.score); }
/** 헤드리스로 한 경기 (조별 90초, 토너먼트는 연장·승부차기까지) */
function simFixture(c: Cup, f: Fixture, n: number) {
  const A = TEAMS[f.a], B = TEAMS[f.b], ko = f.stage !== 'group';
  const s = createMatch({ teams: [A, B], len: 90, diff: 'normal', tempo: 1, firstKick: n & 1, humans: [null, null], net: false, seed: (c.seed + n * 7919) >>> 0, squads: [squadOf(A), squadOf(B)], knockout: ko });
  let ticks = 0; while (s.M.phase !== 'full' && ticks++ < 90 * 60 * 4) { step(s, STEP); s.ev.length = 0; }
  recordResult(f, [s.M.score[0], s.M.score[1]], s.M.so ? [s.M.so.kicks[0].filter(v => v).length, s.M.so.kicks[1].filter(v => v).length] : undefined, s.M.so ? s.M.so.winner : undefined);
}
export function recordResult(f: Fixture, score: [number, number], so?: [number, number], soWinner?: number) {
  f.score = score; if (so) f.so = so;
  if (f.stage !== 'group') f.winner = score[0] !== score[1] ? (score[0] > score[1] ? f.a : f.b) : soWinner === 1 ? f.b : f.a;
}
/** 사용자 경기 결과를 넣고 나머지 경기를 돌린 뒤 다음 라운드로 */
export function advance(c: Cup, userScore?: [number, number], so?: [number, number], soWinner?: number) {
  const uf = userFixture(c); if (uf && userScore) recordResult(uf, userScore, so, soWinner);
  let n = c.round * 100 + c.fixtures.indexOf(uf!) + 1;
  for (const f of pendingFixtures(c)) { if (f === uf && userScore) continue; simFixture(c, f, n++); }
  if (c.stage === 'group') {
    if (c.round < 3) { c.round++; return; }
    const q = qualifiers(c); c.ko.r16 = q; c.stage = 'r16'; c.round = 1; makeKo(c, 'r16', q);
  } else {
    const ws = c.fixtures.filter(f => f.stage === c.stage).map(f => f.winner!);
    if (c.stage === 'f') { c.stage = 'done'; c.champion = ws[0]; return; }
    const next: Stage = c.stage === 'r16' ? 'qf' : c.stage === 'qf' ? 'sf' : 'f';
    c.ko[next] = ws; c.stage = next; c.round = 1; makeKo(c, next, ws);
  }
  if (!c.fixtures.some(f => f.stage === c.stage && (f.a === c.user || f.b === c.user))) c.eliminated = true;
}
function makeKo(c: Cup, stage: Stage, teams: number[]) { for (let i = 0; i < teams.length; i += 2) c.fixtures.push({ a: teams[i], b: teams[i + 1], stage, round: 1 }); }
export interface Row { team: number; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; }
export function table(c: Cup, g: number): Row[] {
  const rows = new Map<number, Row>(); for (const t of c.groups[g]) rows.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const f of c.fixtures) { if (f.stage !== 'group' || !f.score || !rows.has(f.a)) continue; const A = rows.get(f.a)!, B = rows.get(f.b)!, [x, y] = f.score; A.p++; B.p++; A.gf += x; A.ga += y; B.gf += y; B.ga += x; if (x > y) { A.w++; B.l++; A.pts += 3; } else if (x < y) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; } }
  return [...rows.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || ovr(b.team) - ovr(a.team));
}
const ovr = (i: number) => { const sq = squadOf(TEAMS[i]); return sq ? strengthOf(sq).ovr : 70; };
/** 16강 진출: 각 조 1·2위 + 3위 중 상위 4팀. 1위 그룹끼리 안 만나게 1위-하위 순으로 짝 */
function qualifiers(c: Cup) {
  const firsts: Row[] = [], seconds: Row[] = [], thirds: Row[] = [];
  for (let g = 0; g < 6; g++) { const t = table(c, g); firsts.push(t[0]); seconds.push(t[1]); thirds.push(t[2]); }
  const cmp = (a: Row, b: Row) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
  const best3 = thirds.sort(cmp).slice(0, 4), others = [...seconds, ...best3].sort(cmp);
  const top = firsts.sort(cmp), out: number[] = [];
  for (let i = 0; i < 8; i++) { if (i < 6) out.push(top[i].team, others[others.length - 1 - i].team); else out.push(others[i - 6].team, others[others.length - 1 - i].team); }
  return out;
}
