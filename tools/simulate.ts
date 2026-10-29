/* 헤드리스 AI vs AI 시뮬레이션. 사용: npx tsx tools/simulate.ts [경기수] [경기길이초] [팀A코드] [팀B코드] [--seed N]
   같은 시드·같은 설정이면 같은 결과가 나와야 한다 (결정론 검사 포함) */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP } from '../src/sim/consts';
import type { Sim } from '../src/sim/types';
import { applySquadStrength, squadOf } from '../src/data/squads';

const noSquad = process.argv.includes('--nosquad');
if (!noSquad) applySquadStrength();

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--seed');
const N = +(pos[0] ?? 20), LEN = +(pos[1] ?? 300);
const codeA = pos[2], codeB = pos[3];
const seed0 = +(flag('--seed') ?? 1);

function pick(code: string | undefined, fallback: number) { const i = code ? TEAMS.findIndex(t => t.code === code.toUpperCase()) : -1; return TEAMS[i >= 0 ? i : fallback]; }

interface Res { score: number[]; shots: number[]; onT: number[]; poss: number[]; fouls: number[]; offs: number[]; loose: number; ticks: number; nan: boolean; passA: number[]; passC: number[]; yel: number[]; red: number[]; }
function run(seed: number, a = pick(codeA, 0), b = pick(codeB, 2)): Res {
  const s: Sim = createMatch({ teams: [a, b], len: LEN, diff: 'normal', tempo: 1, firstKick: seed & 1, humans: [null, null], net: false, seed, squads: noSquad ? [null, null] : [squadOf(a), squadOf(b)] });
  let loose = 0, ticks = 0, nan = false;
  while (s.M.phase !== 'full' && ticks < LEN * 60 * 1.5) {
    step(s, STEP); s.ev.length = 0; ticks++;
    if (s.M.phase === 'live' && !s.ball.owner) loose++;
    if (!Number.isFinite(s.ball.x) || !Number.isFinite(s.ball.y)) { nan = true; break; }
  }
  const st = s.M.stats, tp = st.poss[0] + st.poss[1];
  return { score: s.M.score.slice(), shots: st.shots.slice(), onT: st.onT.slice(), poss: [st.poss[0] / tp, st.poss[1] / tp], fouls: st.fouls.slice(), offs: st.offs.slice(), loose: loose / Math.max(1, ticks), ticks, nan, passA: st.passA.slice(), passC: st.passC.slice(), yel: st.yel.slice(), red: st.red.slice() };
}
function fp(s: Sim) { return s.players.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join('|') + '#' + s.ball.x.toFixed(3) + ',' + s.ball.y.toFixed(3); }
function determinism() {
  const mk = () => createMatch({ teams: [TEAMS[0], TEAMS[2]], len: 60, diff: 'normal', tempo: 1, firstKick: 0, humans: [null, null], net: false, seed: 42, squads: noSquad ? [null, null] : [squadOf(TEAMS[0]), squadOf(TEAMS[2])] });
  const a = mk(), b = mk();
  for (let i = 0; i < 60 * 40; i++) { step(a, STEP); step(b, STEP); a.ev.length = 0; b.ev.length = 0; }
  return fp(a) === fp(b);
}

const t0 = Date.now();
const rs: Res[] = [];
for (let i = 0; i < N; i++) rs.push(run(seed0 + i));
const ms = Date.now() - t0;
const sum = (f: (r: Res) => number) => rs.reduce((x, r) => x + f(r), 0);
const avg = (f: (r: Res) => number) => (sum(f) / N).toFixed(2);
const a = pick(codeA, 0), b = pick(codeB, 2);
const wins = [sum(r => +(r.score[0] > r.score[1])), sum(r => +(r.score[0] < r.score[1])), sum(r => +(r.score[0] === r.score[1]))];
console.log(`${a.code}(${a.atk}/${a.def}/${a.spd}) vs ${b.code}(${b.atk}/${b.def}/${b.spd}) · ${N}경기 × ${LEN}초 · ${ms}ms (${(ms / N).toFixed(0)}ms/경기)${noSquad ? ' · 선수단 없이' : ''}`);
console.log(`승/패/무 ${wins.join('/')} · 골 ${avg(r => r.score[0])} - ${avg(r => r.score[1])} (경기당 ${avg(r => r.score[0] + r.score[1])})`);
console.log(`슈팅 ${avg(r => r.shots[0])} - ${avg(r => r.shots[1])} · 유효 ${avg(r => r.onT[0])} - ${avg(r => r.onT[1])} · 점유 ${(sum(r => r.poss[0]) / N * 100).toFixed(0)}% · 파울 ${avg(r => r.fouls[0] + r.fouls[1])} · 오프사이드 ${avg(r => r.offs[0] + r.offs[1])} · 루즈볼 ${(sum(r => r.loose) / N * 100).toFixed(0)}%`);
const pa = sum(r => r.passA[0] + r.passA[1]), pc = sum(r => r.passC[0] + r.passC[1]);
console.log(`패스 ${(pa / N).toFixed(0)}회/경기 성공 ${(pc / Math.max(1, pa) * 100).toFixed(0)}% · 경고 ${avg(r => r.yel[0] + r.yel[1])} · 퇴장 ${avg(r => r.red[0] + r.red[1])}`);
if (rs.some(r => r.nan)) console.log('!! NaN 발생');
if (rs.some(r => r.ticks >= LEN * 60 * 1.5)) console.log('!! 경기가 끝나지 않음');
console.log('결정론:', determinism() ? 'OK (같은 시드 → 같은 결과)' : '!! 실패');
