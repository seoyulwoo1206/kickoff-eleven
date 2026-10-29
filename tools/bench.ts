/* 상황 벤치마크 (사람 조작 흐름을 입력으로 흉내): 패스 수신률, 슛 성공률, 수비 회수율.
   사용: npx tsx tools/bench.ts [--seed N] [--n 160] [--nosquad] [--team KOR] [--opp BRA]
   숫자 튜닝 전후로 돌려 비교할 것. 결과는 PROGRESS.md에 기록 */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { shoot } from '../src/sim/ball';
import { STEP, W, CY } from '../src/sim/consts';
import { d } from '../src/sim/util';
import { keyDown, keyUp, type Act } from '../src/input/actions';
import { applySquadStrength, squadOf } from '../src/data/squads';
import type { Sim, Player } from '../src/sim/types';
import { mulberry32 } from '../src/sim/rng';

const argv = process.argv.slice(2);
const flag = (n: string, def: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : def; };
const noSquad = argv.includes('--nosquad'); if (!noSquad) applySquadStrength();
const SEED = +flag('--seed', '7'), N = +flag('--n', '160'), SEEDS = +flag('--seeds', '1');
const pick = (c: string) => TEAMS.find(t => t.code === c.toUpperCase()) ?? TEAMS[0];
const A = pick(flag('--team', 'KOR')), B = pick(flag('--opp', 'BRA'));
let seed = SEED; let rnd = mulberry32(SEED);

function mk(human: boolean): Sim {
  return createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [human ? { tag: 'P1', col: '#fff', cursor: 'manual' } : null, null], net: false, seed, squads: noSquad ? [null, null] : [squadOf(A), squadOf(B)] });
}
/** AI끼리 돌리다가 조건이 맞는 순간을 찾는다 (경기 시계는 매번 0으로) */
function untilLive(s: Sim, cond: () => boolean, max = 1200) {
  const h = s.HU[0]; s.HU[0] = null; for (const p of s.players) p.sta = 1; // 매 시험 새 다리로
  for (let i = 0; i < max; i++) { step(s, STEP); s.ev.length = 0; s.M.time = 0; if (s.M.phase === 'full') { s.M.phase = 'live'; } if (i >= 180 && s.M.phase === 'live' && cond()) { s.HU[0] = h; return true; } } // 시험 사이엔 최소 3초 AI끼리 흘러가게 (같은 두 선수가 주고받는 루프 방지)
  s.HU[0] = h; return false;
}
const tap = (s: Sim, a: Act, ticks = 5) => { keyDown(s.INP[0], a); for (let i = 0; i < ticks; i++) { step(s, STEP); s.ev.length = 0; } keyUp(s.INP[0], a); };

// 1) 패스: 공 가진 순간 스틱 전방 + 숏/스루 탭 → 받는 선수가 잡는가
function passBench(res: Record<string, Record<string, number>>) {
  const s = mk(true), I = s.INP[0];
  let trial = 0, guard = 0;
  while (trial < N && guard++ < 4000) {
    if (!untilLive(s, () => !!s.ball.owner && s.ball.owner.t === 0 && s.ball.owner.role !== 'GK' && s.M.protect <= 0)) continue;
    const p = s.ball.owner as Player, h = s.HU[0]!; h.ctrl = p; const kind = trial % 2 ? 'thru' : 'short';
    I.tx = 1; I.ty = 0; tap(s, kind === 'short' ? 'pass' : 'through');
    let target: Player | null = null, gainedBy: Player | null = null, t = 5 / 60;
    for (let i = 0; i < 240; i++) {
      step(s, STEP); s.ev.length = 0; t += STEP; if (!target && s.ball.passTarget) target = s.ball.passTarget;
      if (s.ball.owner && s.ball.owner !== p) { gainedBy = s.ball.owner; break; }
      if (s.ball.owner === p && t > 0.5 && !s.ball.passTarget) { gainedBy = p; break; }
      if (s.M.phase !== 'live') break;
    }
    I.tx = 0; I.ty = 0;
    const r = !target ? (gainedBy ? (gainedBy.t === 1 ? 'lostBeforeKick' : 'mateBeforeKick') : s.M.phase !== 'live' ? 'dead' : 'noTarget') : !gainedBy ? (s.M.phase !== 'live' ? 'dead' : 'none') : gainedBy === target ? 'ok' : gainedBy.t === 1 ? 'opp' : gainedBy === p ? 'passerAgain' : 'otherMate';
    res[kind][r] = (res[kind][r] || 0) + 1; trial++;
  }
}
function passReport(res: Record<string, Record<string, number>>) {
  const pct = (k: string) => { const o = res[k], n = Object.values(o).reduce((a, b) => a + b, 0); return `${((o.ok || 0) / n * 100).toFixed(0)}% (n=${n}, ${Object.entries(o).filter(([k]) => k !== 'ok').map(([k, v]) => `${k} ${v}`).join(', ')})`; };
  console.log(`패스 수신: 숏 ${pct('short')} · 스루 ${pct('thru')}`);
}
// 2) 슛: 거리·파워별 득점률 (키퍼는 AI, 수비 없음)
const SHOTS = [[10, 0.7], [18, 1.0], [25, 1.0], [14, 0.6]] as const;
function shotBench(acc: number[][]) {
  const s = mk(true);
  SHOTS.forEach(([dist, power], si) => {
    let goals = 0, n = 0;
    for (let k = 0; k < 120; k++) {
      s.M.phase = 'live'; s.M.time = 0; s.M.protect = 0; const p = s.team[0][9];
      for (const q of s.players) { q.x = q.t === 0 ? 30 : 75; q.y = 10 + (q.i * 5) % 50; q.vx = q.vy = 0; q.stun = 0; q.kickCD = 0; }
      const k0 = s.team[1][0]; k0.x = W - 1.5; k0.y = CY; k0.reactT = 0; k0.dive = 0;
      const ang = (rnd() - 0.5) * 0.9; p.x = W - dist * Math.cos(ang); p.y = CY + dist * Math.sin(ang); p.dir = Math.atan2(CY - p.y, W - p.x); p.vx = p.vy = 0;
      placeBall(s, p.x + Math.cos(p.dir) * 0.8, p.y + Math.sin(p.dir) * 0.8); s.ball.owner = p; s.ball.lastTouch = 0;
      shoot(s, p, power, 0); const before = s.M.score[0];
      for (let i = 0; i < 150 && s.M.phase === 'live'; i++) { step(s, STEP); s.ev.length = 0; }
      if (s.M.score[0] > before) goals++; n++; s.M.score[0] = 0; s.M.phase = 'live';
    }
    acc[si][0] += goals; acc[si][1] += n;
  });
}
// 3) 수비: 상대가 공을 가지면 가장 가까운 내 선수로 압박(pass 홀드)만 → 4초 안 회수율
function defenseBench(acc: number[]) {
  const s = mk(true), I = s.INP[0]; let trial = 0, won = 0, tsum = 0, guard = 0, byMe = 0;
  while (trial < N / 2 && guard++ < 4000) {
    if (!untilLive(s, () => !!s.ball.owner && s.ball.owner.t === 1 && s.ball.owner.role !== 'GK' && s.M.protect <= 0)) continue;
    const h = s.HU[0]!; const list = s.team[0].filter(q => q.role !== 'GK').sort((a, b) => d(a, s.ball) - d(b, s.ball)); h.ctrl = list[0];
    I.tx = 0; I.ty = 0; keyDown(I, 'pass'); let got = false;
    for (let i = 0; i < 240; i++) { step(s, STEP); s.ev.length = 0; const o = s.ball.owner; if (o && o.t === 0) { got = true; if (o === h.ctrl) byMe++; tsum += i / 60; break; } if (s.M.phase !== 'live') break; }
    keyUp(I, 'pass'); if (got) won++; trial++;
  }
  acc[0] += won; acc[1] += trial; acc[2] += tsum; acc[3] += byMe;
}
console.log(`${A.code} vs ${B.code}${noSquad ? ' (선수단 없이)' : ''} seed ${SEED}${SEEDS > 1 ? `~${SEED + SEEDS - 1}` : ''}`);
const pres: Record<string, Record<string, number>> = { short: {}, thru: {} }, sacc = SHOTS.map(() => [0, 0]), dacc = [0, 0, 0, 0];
for (let k = 0; k < SEEDS; k++) { seed = SEED + k; rnd = mulberry32(seed); passBench(pres); shotBench(sacc); defenseBench(dacc); }
passReport(pres);
SHOTS.forEach(([dist, power], si) => console.log(`슛 ${dist}m 파워 ${power}: ${(sacc[si][0] / sacc[si][1] * 100).toFixed(0)}%`));
console.log(`수비 회수(4초, 압박만): ${(dacc[0] / dacc[1] * 100).toFixed(0)}% (n=${dacc[1]}, 평균 ${(dacc[2] / Math.max(1, dacc[0])).toFixed(2)}초, 커서 선수가 직접 ${dacc[3]})`);
