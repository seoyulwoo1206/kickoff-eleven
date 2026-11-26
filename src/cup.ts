/* 월드컵 토너먼트: 24팀 → 6조 × 4팀 조별리그 → 16강(각 조 1·2위 + 3위 상위 4팀) → 8강 → 4강 → 결승.
   사용자 경기만 실제로 플레이하고 나머지는 헤드리스로 돌린다. localStorage 'ko11cup'에 저장 */
import { TEAMS, NATIONS } from './data/teams';
import { createMatch, step } from './sim/match';
import { STEP } from './sim/consts';
import { squadOf, strengthOf } from './data/squads';
import { UCL } from './data/clubs';
import { mulberry32 } from './sim/rng';

export type Stage = 'group' | 'r16' | 'qf' | 'sf' | 'f' | 'done';
export interface Fixture { a: number; b: number; stage: Stage; round: number; score?: [number, number]; so?: [number, number]; winner?: number; }
export interface Cup { /** 'club'이면 클럽 컵(55차), 없으면 월드컵 */ kind?: 'club'; seed: number; user: number; groups: number[][]; fixtures: Fixture[]; stage: Stage; round: number; ko: Record<string, number[]>; champion: number; eliminated: boolean; }
export const STAGE_NAMES: Record<Stage, string> = { group: '조별리그', r16: '16강', qf: '8강', sf: '4강', f: '결승', done: '종료' };
export type CupKey = 'ko11cup' | 'ko11ccup'; // 월드컵 / 클럽 컵 저장 열쇠
export const GROUP_NAMES = 'ABCDEFGHIJKL';

/** 클럽 컵 참가팀(55차): 2026/27 챔피언스리그 본선 36팀(`UCL`) — 내 팀이 거기 없으면 가장 약한 팀 대신 들어간다. 4의 배수로 맞춘다(자료가 빠진 팀이 있으면 약한 팀부터 뺀다) */
export function clubPool(user: number): number[] {
  let pool = TEAMS.map((_, i) => i).filter(i => i >= NATIONS && UCL.includes(TEAMS[i].code) && i !== user).sort((a, b) => ovr(b) - ovr(a));
  pool = pool.slice(0, UCL.includes(TEAMS[user].code) ? pool.length : pool.length - 1); while ((pool.length + 1) % 4) pool.pop();
  return [...pool, user];
}
/** 새 대회. pool = 참가팀 순번(내 팀 포함, 4의 배수 — 기본은 국가대표 24팀 = 월드컵). 4팀씩 조를 짠다 */
export function newCup(user: number, pool?: number[], seed = (Math.random() * 1e9) >>> 0): Cup {
  const rnd = mulberry32(seed), idx = (pool ?? TEAMS.map((_, i) => i).filter(i => i < NATIONS)).filter(i => i !== user); // 기본: 국가대표 24팀만 (클럽은 TEAMS의 뒤쪽)
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  idx.splice(Math.floor(rnd() * (idx.length + 1)), 0, user);
  const G = idx.length / 4, groups: number[][] = []; for (let g = 0; g < G; g++) groups.push(idx.slice(g * 4, g * 4 + 4));
  const fixtures: Fixture[] = [];
  for (let g = 0; g < G; g++) { const [a, b, c, d] = groups[g]; fixtures.push({ a, b, stage: 'group', round: 1 }, { a: c, b: d, stage: 'group', round: 1 }, { a, b: c, stage: 'group', round: 2 }, { a: b, b: d, stage: 'group', round: 2 }, { a, b: d, stage: 'group', round: 3 }, { a: b, b: c, stage: 'group', round: 3 }); }
  return { kind: pool ? 'club' : undefined, seed, user, groups, fixtures, stage: 'group', round: 1, ko: {}, champion: -1, eliminated: false };
}
export function loadCup(key: CupKey = 'ko11cup'): Cup | null { try { const c = JSON.parse(localStorage.getItem(key) || 'null'); return c && Array.isArray(c.groups) && c.groups.flat().every((i: number) => i >= 0 && i < TEAMS.length) ? c : null; } catch { return null; } }
export function saveCup(c: Cup | null, key: CupKey = 'ko11cup') { try { if (c) localStorage.setItem(key, JSON.stringify(c)); else localStorage.removeItem(key); } catch { /* */ } }

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
/** `advance`와 같되 다른 경기를 한 경기씩 타이머로 나눠 돌린다(55차 — 클럽 컵은 한 라운드에 17경기라 한꺼번에 돌리면 화면이 4초쯤 멈춘다). 끝나면 done */
export function advanceAsync(c: Cup, userScore: [number, number] | undefined, so: [number, number] | undefined, soWinner: number | undefined, done: () => void) {
  const uf = userFixture(c); if (uf && userScore) recordResult(uf, userScore, so, soWinner);
  let n = c.round * 100 + c.fixtures.indexOf(uf!) + 1; const list = pendingFixtures(c).filter(f => !(f === uf && userScore));
  const one = () => { const f = list.shift(); if (!f) { advance(c); done(); return; } simFixture(c, f, n++); setTimeout(one, 0); }; // 남은 경기가 없으면 advance는 다음 라운드로만 넘긴다
  one();
}
function makeKo(c: Cup, stage: Stage, teams: number[]) { for (let i = 0; i < teams.length; i += 2) c.fixtures.push({ a: teams[i], b: teams[i + 1], stage, round: 1 }); }
export interface Row { team: number; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; }
export function table(c: Cup, g: number): Row[] {
  const rows = new Map<number, Row>(); for (const t of c.groups[g]) rows.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const f of c.fixtures) { if (f.stage !== 'group' || !f.score || !rows.has(f.a)) continue; const A = rows.get(f.a)!, B = rows.get(f.b)!, [x, y] = f.score; A.p++; B.p++; A.gf += x; A.ga += y; B.gf += y; B.ga += x; if (x > y) { A.w++; B.l++; A.pts += 3; } else if (x < y) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; } }
  return [...rows.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || ovr(b.team) - ovr(a.team));
}
const ovr = (i: number) => { const sq = squadOf(TEAMS[i]); return sq ? strengthOf(sq).ovr : 70; };
/** 16강 진출 (조 수 G): G가 8보다 적으면(월드컵 6조) 각 조 1·2위 + 3위 중 상위 (16−2G)팀, 8 이상이면(클럽 컵 9조) 각 조 1위 + 2위 중 상위 (16−G)팀.
    1위들을 성적순으로 앞에, 나머지를 성적순으로 뒤에 세워 i번째와 (15−i)번째가 붙는다 — 좋은 1위가 가장 낮은 팀과 */
function qualifiers(c: Cup) {
  const G = c.groups.length, firsts: Row[] = [], seconds: Row[] = [], thirds: Row[] = [];
  for (let g = 0; g < G; g++) { const t = table(c, g); firsts.push(t[0]); seconds.push(t[1]); thirds.push(t[2]); }
  const cmp = (a: Row, b: Row) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
  const others = G >= 8 ? seconds.sort(cmp).slice(0, 16 - G) : [...seconds, ...thirds.sort(cmp).slice(0, 16 - 2 * G)].sort(cmp);
  const seeds = [...firsts.sort(cmp), ...others], out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(seeds[i].team, seeds[15 - i].team);
  return out;
}
