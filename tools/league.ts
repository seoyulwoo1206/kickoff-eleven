/* 리그 시뮬: 24팀을 무작위로 짝지어 N경기 돌리고 축구다운지 본다.
   사용: npx tsx tools/league.ts [경기수=100] [경기길이초=300] [--seed N]
   출력: 경기당 골·슈팅·유효·패스 수/성공률·파울·오프사이드·카드·루즈볼, 전력차(선발 평균 차)별 승률 */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP } from '../src/sim/consts';
import { applySquadStrength, squadOf, strengthOf } from '../src/data/squads';
import { mulberry32 } from '../src/sim/rng';
applySquadStrength();
const argv = process.argv.slice(2), flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--seed');
const N = +(pos[0] ?? 100), LEN = +(pos[1] ?? 300), seed0 = +(flag('--seed') ?? 1);
const rnd = mulberry32(seed0);
const ovr = (c: string) => { const sq = squadOf(TEAMS.find(t => t.code === c)!); return sq ? strengthOf(sq).ovr : 75; };
const acc = { goals: 0, shots: 0, onT: 0, passA: 0, passC: 0, fouls: 0, offs: 0, yel: 0, red: 0, loose: 0, ticks: 0, draws: 0 };
const byDiff: Record<string, [number, number, number]> = { '0-2': [0, 0, 0], '3-5': [0, 0, 0], '6-8': [0, 0, 0], '9+': [0, 0, 0] }; // 강팀 승/무/패
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const ia = Math.floor(rnd() * TEAMS.length); let ib = Math.floor(rnd() * (TEAMS.length - 1)); if (ib >= ia) ib++;
  const A = TEAMS[ia], B = TEAMS[ib];
  const s = createMatch({ teams: [A, B], len: LEN, diff: 'normal', tempo: 1, firstKick: g & 1, humans: [null, null], net: false, seed: seed0 * 1000 + g, squads: [squadOf(A), squadOf(B)] });
  let ticks = 0;
  while (s.M.phase !== 'full' && ticks < LEN * 60 * 1.6) { step(s, STEP); s.ev.length = 0; ticks++; if (s.M.phase === 'live' && !s.ball.owner) acc.loose++; }
  const st = s.M.stats;
  acc.goals += s.M.score[0] + s.M.score[1]; acc.shots += st.shots[0] + st.shots[1]; acc.onT += st.onT[0] + st.onT[1]; acc.passA += st.passA[0] + st.passA[1]; acc.passC += st.passC[0] + st.passC[1];
  acc.fouls += st.fouls[0] + st.fouls[1]; acc.offs += st.offs[0] + st.offs[1]; acc.yel += st.yel[0] + st.yel[1]; acc.red += st.red[0] + st.red[1]; acc.ticks += ticks;
  const oa = ovr(A.code), ob = ovr(B.code), diff = Math.abs(oa - ob), strong = oa >= ob ? 0 : 1, sc = s.M.score;
  const key = diff <= 2 ? '0-2' : diff <= 5 ? '3-5' : diff <= 8 ? '6-8' : '9+';
  const res = sc[strong] > sc[1 - strong] ? 0 : sc[strong] === sc[1 - strong] ? 1 : 2; byDiff[key][res]++; if (res === 1) acc.draws++;
}
const per = (v: number) => (v / N).toFixed(2);
console.log(`${N}경기 × ${LEN}초 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`경기당 골 ${per(acc.goals)} · 슈팅 ${per(acc.shots)} (유효 ${per(acc.onT)}) · 패스 ${per(acc.passA)}회 성공 ${(acc.passC / Math.max(1, acc.passA) * 100).toFixed(0)}% · 파울 ${per(acc.fouls)} · 오프사이드 ${per(acc.offs)} · 경고 ${per(acc.yel)} · 퇴장 ${per(acc.red)} · 루즈볼 ${(acc.loose / acc.ticks * 100).toFixed(0)}% · 무승부 ${(acc.draws / N * 100).toFixed(0)}%`);
for (const [k, v] of Object.entries(byDiff)) { const n = v[0] + v[1] + v[2]; if (n) console.log(`전력차 ${k.padEnd(4)}: 강팀 승 ${(v[0] / n * 100).toFixed(0)}% 무 ${(v[1] / n * 100).toFixed(0)}% 패 ${(v[2] / n * 100).toFixed(0)}% (n=${n})`); }
