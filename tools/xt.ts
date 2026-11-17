/* xT 헤드리스 확인: AI 대 AI 경기를 돌려 'xt' 사건으로 선수별 ΔxT를 분할 4종으로 집계해 출력한다.
   경기당 사건·행동 수, 분할별 상위 선수, 분할 간 순위상관, (덤) 게임 속 "T초 안 같은 drive 득점" 비율과 표 값 비교.
   표는 public/xt/xt_tables.json, 없으면 dev/xt_tables.placeholder.json(임시 — npx tsx tools/xt-placeholder.ts로 생성).
   사용: npx tsx tools/xt.ts [--n 4] [--len 300] [--model dtmc|smp] [--T 5|10|15|inf] [--a KOR --b BRA] [--csv out.csv] */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, H } from '../src/sim/consts';
import { squadOf, applySquadStrength, displayName } from '../src/data/squads';
import { validate, partsOf, partsWith, modelsOf, zoneOf, PART_NAME, MODEL_NAME, type Model, type TKey } from '../src/xt/table';
import { XtTracker, compare, pkey } from '../src/xt/tracker';
applySquadStrength();
const opt = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +opt('--n', '4'), LEN = +opt('--len', '300'), model = opt('--model', 'dtmc') as Model, T = opt('--T', '10') as TKey, csv = opt('--csv', '');
const path = existsSync('public/xt/xt_tables.json') ? 'public/xt/xt_tables.json' : 'dev/xt_tables.placeholder.json';
if (!existsSync(path)) { console.log('표가 없습니다. 연구에서 뽑은 xt_tables.json을 public/xt/에 두거나, npx tsx tools/xt-placeholder.ts 로 임시 표를 만드세요.'); process.exit(1); }
const tb = validate(JSON.parse(readFileSync(path, 'utf8')));
if (!tb) { console.log(path + ': 형식이 맞지 않습니다 (zone 9,600칸·번호 0..M-1·값 표 길이 M 확인).'); process.exit(1); }
console.log(`표: ${path}${tb.placeholder ? '  ※ 개발용 임시 표 (연구 값 아님)' : ''} · 분할 ${partsOf(tb).map(p => `${PART_NAME[p]} ${tb.partitions[p]!.M}`).join(', ')} · 모델 ${modelsOf(tb).map(m => MODEL_NAME[m]).join(', ')} · ${model} T=${T}`);
if (!partsWith(tb, model, T).length) { console.log(`${model} T=${T} 값 표가 없습니다.`); process.exit(1); }
const pick = (c: string, d: number) => TEAMS.find(t => t.code === c) ?? TEAMS[d];
const rows: string[] = ['match_id,tick,t_sec,team,num,x,y,drive,goal_t'];
const lab = partsWith(tb, model, T).map(p => ({ p, n: new Array<number>(tb.partitions[p]!.M).fill(0), g: new Array<number>(tb.partitions[p]!.M).fill(0) }));
const Tsec = T === 'inf' ? Infinity : +T; let evN = 0, actN = 0, gainN = 0, driveN = 0, goals = 0;
for (let g = 0; g < N; g++) {
  const a = opt('--a', '') ? pick(opt('--a', ''), 0) : TEAMS[(g * 5) % TEAMS.length], b = opt('--b', '') ? pick(opt('--b', ''), 1) : TEAMS[(g * 7 + 3) % TEAMS.length]; if (a === b) continue;
  const s = createMatch({ teams: [a, b], len: LEN, diff: 'normal', tempo: 1, firstKick: g % 2, humans: [null, null], net: false, seed: 7000 + g, squads: [squadOf(a), squadOf(b)] });
  const tr = new XtTracker(), names = new Map<string, string>();
  while (s.M.phase !== 'full') {
    step(s, STEP);
    for (const e of s.ev) if (e.k === 'xt') { evN++; tr.push(e); if (e.e !== 'out' && e.e !== 'goal') { const p = s.team[e.t].find(q => q.num === e.num); if (p) names.set(pkey(e.t, e.num), `${s.M.teams[e.t].code} ${displayName(p, 'real')}`); } }
    s.ev.length = 0;
  }
  actN += tr.actions.length; gainN += tr.gains.length; driveN += tr.gains.length ? tr.gains[tr.gains.length - 1].drive : 0; goals += s.M.score[0] + s.M.score[1];
  for (const q of tr.gains) {
    const hit = q.goalTick >= 0 && (q.goalTick - q.tick) / 60 <= Tsec;
    for (const l of lab) { const z = zoneOf(tb, l.p, q.x, q.y, q.t); l.n[z]++; if (hit) l.g[z]++; }
    if (csv) { const X = q.t === 0 ? q.x : W - q.x, Y = q.t === 0 ? q.y : H - q.y; rows.push([g, q.tick, (q.tick / 60).toFixed(2), q.t, q.num, (X / W * 120).toFixed(2), (Y / H * 80).toFixed(2), q.drive, q.goalTick >= 0 ? ((q.goalTick - q.tick) / 60).toFixed(2) : ''].join(',')); }
  }
  const c = compare(tb, tr, model, T, 3), nm = (k: string) => names.get(k) ?? k;
  console.log(`\n[${g}] ${a.code} ${s.M.score[0]}-${s.M.score[1]} ${b.code} · 행동 ${tr.actions.length}(패스 ${tr.actions.filter(x => x.kind === 'pass').length}·드리블 ${tr.actions.filter(x => x.kind === 'carry').length}) · 받음 ${tr.gains.length} · 선수 ${c.rows.length}명`);
  c.parts.forEach((p, i) => { const top = [...c.rows].sort((x, y) => x.rank[p]! - y.rank[p]!).slice(0, 3); console.log(`  ${PART_NAME[p].padEnd(13)} 팀 합 ${c.team[i].map(v => v.toFixed(3)).join(' / ')} · ` + top.map(r => `${r.rank[p]}. ${nm(r.key)} ${r.val[p]!.toFixed(3)}`).join('  ')); });
  console.log('  순위상관 ' + c.rho.map(r => `${r.a}–${r.b} ${r.r.toFixed(2)}`).join(' · '));
}
console.log(`\n경기당: xt 사건 ${(evN / N).toFixed(0)} · 행동 ${(actN / N).toFixed(0)} · 받음 ${(gainN / N).toFixed(0)} · drive ${(driveN / N).toFixed(0)} · 골 ${(goals / N).toFixed(2)}`);
// 게임 속 실제 득점률 vs 표 값 (구역별, 받은 횟수 가중 상관)
for (const l of lab) {
  const v = tb.partitions[l.p]!.xt[model]![T]!, tot = l.n.reduce((a, b) => a + b, 0), hit = l.g.reduce((a, b) => a + b, 0); let sw = 0, sx = 0, sy = 0; const pts: [number, number, number][] = [];
  l.n.forEach((n, z) => { if (n > 0) { pts.push([v[z], l.g[z] / n, n]); sw += n; sx += v[z] * n; sy += l.g[z]; } });
  const mx = sx / sw, my = sy / sw; let cxy = 0, cxx = 0, cyy = 0; for (const [x, y, n] of pts) { cxy += n * (x - mx) * (y - my); cxx += n * (x - mx) ** 2; cyy += n * (y - my) ** 2; }
  console.log(`${PART_NAME[l.p].padEnd(13)} 게임 속 T=${T} 득점률 ${(hit / tot * 100).toFixed(2)}% (받음 ${tot}) · 표 평균 ${(mx * 100).toFixed(2)}% · 구역별 상관 ${cxx > 0 && cyy > 0 ? (cxy / Math.sqrt(cxx * cyy)).toFixed(2) : '-'}`);
}
if (csv) { writeFileSync(csv, rows.join('\n')); console.log(`${csv} 저장 (${rows.length - 1}행: 받은 순간마다 한 줄, 좌표는 오른쪽 공격 기준 야드, goal_t는 같은 drive 골까지 초)`); }
