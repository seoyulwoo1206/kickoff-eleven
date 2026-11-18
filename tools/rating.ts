/* 평점 확인: AI 대 AI 경기를 돌려 rating.ts의 평점을 역할별로 모아 본다 (평균·표준편차·범위, 최우수 선수의 역할 분포, 구성 요소 평균).
   역할별 평균이 비슷하게(6.5~6.8) 나와야 한다 — 수비수가 낮게 깔리면 KD·BASE를 고칠 것.
   사용: npx tsx tools/rating.ts [--n 30] [--fallback] [--list] */
import { readFileSync, existsSync } from 'node:fs';
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { RatingTracker, rate, fallbackXt, type ValueFn, type Rated } from '../src/rating';
import { validate, xtAt, has } from '../src/xt/table';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 30);
let V: ValueFn = fallbackXt, src = '어림값(표 없음)';
if (!process.argv.includes('--fallback') && existsSync('public/xt/xt_tables.json')) {
  const tb = validate(JSON.parse(readFileSync('public/xt/xt_tables.json', 'utf8')));
  if (tb && has(tb, 'tree', 'dtmc', '10')) { V = (x, y, t) => xtAt(tb, 'tree', 'dtmc', '10', x, y, t); src = '연구 표 (tree · DTMC · 10초)'; }
}
const all: Rated[] = [], mvps: Rated[] = [];
for (let g = 0; g < N; g++) {
  const a = TEAMS[(g * 7) % TEAMS.length], b = TEAMS[(g * 11 + 5) % TEAMS.length]; if (a === b) continue;
  const s = createMatch({ teams: [a, b], len: 300, diff: 'normal', tempo: 1, firstKick: g % 2, humans: [null, null], net: false, seed: 700 + g, squads: [squadOf(a), squadOf(b)] });
  const tr = new RatingTracker(V); for (const t of [0, 1]) tr.roster(t, s.team[t].map(p => ({ num: p.num, name: p.name, role: p.role, lane: p.by })));
  for (let i = 0; i < 300 * 60 * 1.5 && s.M.phase !== 'full'; i++) { step(s, STEP); for (const e of s.ev) if (e.k === 'xt') tr.push(e); s.ev.length = 0; }
  const r = rate(tr); all.push(...r.list); if (r.mvp) mvps.push(r.mvp);
  if (process.argv.includes('--list') && g < 2) { console.log(`── ${a.code} ${s.M.score[0]} : ${s.M.score[1]} ${b.code} ──`); for (const p of r.list) console.log(`  ${p.rating.toFixed(1)} ${p.t === 0 ? a.code : b.code} ${p.role} ${p.name.padEnd(8)} 공격 ${p.att.toFixed(2)} 수비 ${p.def.toFixed(2)} 잃음 ${p.loss.toFixed(2)} · 골 ${p.goals} 도움 ${p.assists} 슛 ${p.shots} 패스 ${p.passes} 따냄 ${p.recov} 걷어냄 ${p.clears} 뺏김 ${p.lost} 선방 ${p.saves}`); }
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1), sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
console.log(`평점 ${N}경기 · 값 함수: ${src}`);
for (const r of ['GK', 'DF', 'MF', 'FW']) {
  const L = all.filter(p => p.role === r), v = L.map(p => p.rating);
  console.log(`${r}: 평균 ${mean(v).toFixed(2)} · 표준편차 ${sd(v).toFixed(2)} · ${Math.min(...v).toFixed(1)}~${Math.max(...v).toFixed(1)} | 공격 ${mean(L.map(p => p.att)).toFixed(3)} · 수비 ${mean(L.map(p => p.def)).toFixed(3)} · 잃음 ${mean(L.map(p => p.loss)).toFixed(3)} · 따냄 ${mean(L.map(p => p.recov)).toFixed(1)} · 걷어냄 ${mean(L.map(p => p.clears)).toFixed(1)} · 선방 ${mean(L.map(p => p.saves)).toFixed(1)} · 골 ${mean(L.map(p => p.goals)).toFixed(2)} · 패스 ${mean(L.map(p => p.passes)).toFixed(1)} · 터치 ${mean(L.map(p => p.touches)).toFixed(1)} · 뺏김 ${mean(L.map(p => p.lost)).toFixed(1)}` + (r === 'DF' ? ` · 내준 위협 ${mean(L.map(p => p.allow)).toFixed(3)}(sd ${sd(L.map(p => p.allow)).toFixed(3)}) · 내준 슛 ${mean(L.map(p => p.shotsAllowed)).toFixed(2)}` : ''));
}
const cnt: Record<string, number> = {}; for (const m of mvps) cnt[m.role] = (cnt[m.role] ?? 0) + 1;
console.log(`최우수 선수 역할: ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(' · ')} · 평점 평균 ${mean(mvps.map(m => m.rating)).toFixed(2)} (${Math.min(...mvps.map(m => m.rating)).toFixed(1)}~${Math.max(...mvps.map(m => m.rating)).toFixed(1)})`);
