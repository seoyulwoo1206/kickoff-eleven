/* 공중볼 시험: 사람 팀(팀 0, 왼쪽 골)이 수비. 상대(팀 1)가 띄운 공을 누가 처리하나.
   ① 6야드 크로스: 측면에서 골라인 4m 앞 공격수에게 띄움 (수비수 한 명이 붙어 있음) → 키퍼가 잡음/쳐냄 · 공격수 헤딩 · 수비
   ② 주인 없는 로빙: 중원에서 박스 안(골라인 9~12m 앞) 빈 곳으로 띄움, 공격수는 18m 뒤에서 쫓음 → 키퍼가 먼저 잡나
   ③ 사람 수비수 헤딩: 22m 앞 공격수에게 띄운 공, 사람이 조작하는 수비수가 골 쪽 1.2m에 붙어 공이 떨어질 자리로 방향키 → 누가 처음 건드리나
   사용: npx tsx tools/aerial.ts [--n 80] [--only 1|2|3] [--nostick] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, H, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { gain, passTo, kick, intercept } from '../src/sim/ball';
import type { Player, Sim } from '../src/sim/types';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 80), only = arg('--only', 0), noStick = process.argv.includes('--nostick');
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '-';
function setup(i: number) {
  const s = createMatch({ teams: [A, B], len: 300, diff: 'normal', tempo: 1, firstKick: 1, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 4100 + i, squads: [squadOf(A), squadOf(B)] });
  for (let k = 0; k < 150; k++) { step(s, STEP); s.ev.length = 0; }
  s.M.phase = 'live'; return s;
}
const put = (p: Player, x: number, y: number) => { p.x = x; p.y = y; p.vx = p.vy = 0; p.kickCD = 0; p.stun = 0; };
const of = (s: Sim, t: number, role: string) => s.team[t].filter(p => p.role === role && !p.off);
function give(s: Sim, p: Player) { const b = s.ball; b.owner = null; b.x = p.x; b.y = p.y; b.z = 0; b.vx = b.vy = b.vz = 0; gain(s, p); }
/** 찬 뒤 처음 건드린 선수와 결과 */
function watch(s: Sim, kicker: Player, secs: number, drive?: (t: number) => void) {
  const b = s.ball, sh = b.shot, g0 = s.M.score[1]; let first: Player | null = null, how = '', t = 0;
  for (let k = 0; k < secs * 60; k++) {
    drive?.(t); step(s, STEP); s.ev.length = 0; t += STEP;
    if (!first) { if (b.owner && b.owner !== kicker) { first = b.owner; how = 'own'; } else if (b.shot !== sh && b.kicker && b.kicker !== kicker) { first = b.kicker; how = b.isShot ? 'shot' : 'touch'; } if (first) { if (how !== 'shot') break; } }
    if (s.M.phase !== 'live') break;
  }
  return { first, how, t, goal: s.M.score[1] > g0, out: !first && s.M.phase !== 'live' };
}
if (!only || only === 1) {
  const r = { n: 0, gkCatch: 0, gkPunch: 0, head: 0, goal: 0, def: 0, att: 0, none: 0 };
  for (let i = 0; i < N; i++) {
    const s = setup(i), top = i % 2 === 0, fw = of(s, 1, 'FW'), mf = of(s, 1, 'MF'), df = of(s, 0, 'DF'), w = mf[0], st = fw[0];
    put(w, 7 + (i % 4) * 3, top ? 5 + (i % 3) * 2 : H - 5 - (i % 3) * 2); put(st, 3.2 + (i % 3) * 0.8, CY + ((i % 5) - 2) * 1.6); put(df[0], st.x - 1.2, st.y + (top ? 0.8 : -0.8)); put(df[1], st.x + 1.5, st.y + (top ? -3 : 3));
    const gk = s.team[0][0]; put(gk, 1.6, CY + (top ? -1.2 : 1.2)); s.HU[0]!.ctrl = of(s, 0, 'FW')[0];
    give(s, w); w.dir = Math.atan2(st.y - w.y, st.x - w.x); passTo(s, w, st, true); r.n++;
    const o = watch(s, w, 3.5);
    if (!o.first) r.none++; else if (o.first.role === 'GK' && o.first.t === 0) { if (o.how === 'own') r.gkCatch++; else r.gkPunch++; } else if (o.first.t === 1) { if (o.how === 'shot') r.head++; else r.att++; if (o.goal) r.goal++; } else r.def++;
  }
  console.log(`① 6야드 크로스 n=${r.n}: 키퍼가 잡음 ${pct(r.gkCatch, r.n)} · 쳐냄 ${pct(r.gkPunch, r.n)} · 공격수 헤딩슛 ${pct(r.head, r.n)} (골 ${pct(r.goal, r.n)}) · 공격수가 잡음 ${pct(r.att, r.n)} · 수비 ${pct(r.def, r.n)} · 아무도 ${pct(r.none, r.n)}`);
}
if (!only || only === 2) {
  const r = { n: 0, gk: 0, att: 0, def: 0, none: 0 }; const ts: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = setup(i), fw = of(s, 1, 'FW'), mf = of(s, 1, 'MF'), w = mf[0], st = fw[0];
    put(w, 44, CY + ((i % 5) - 2) * 6); const lx = 9 + (i % 4), ly = CY + ((i % 7) - 3) * 2.2; put(st, lx + 18, ly + ((i % 3) - 1) * 4);
    for (const p of of(s, 0, 'DF')) put(p, 30 + (p.i % 3) * 2, p.by); s.HU[0]!.ctrl = of(s, 0, 'FW')[0];
    give(s, w); const dx = lx - w.x, dy = ly - w.y, q = Math.hypot(dx, dy), T = 1.5, v = q / T * 1.1; w.dir = Math.atan2(dy, dx); kick(s, w, dx / q * v, dy / q * v, 22 * T / 2); s.ball.passTarget = st; r.n++;
    const o = watch(s, w, 5);
    if (!o.first) r.none++; else if (o.first.role === 'GK' && o.first.t === 0) { r.gk++; ts.push(o.t); } else if (o.first.t === 1) r.att++; else r.def++;
  }
  ts.sort((a, b) => a - b);
  console.log(`② 주인 없는 로빙 n=${r.n}: 키퍼가 먼저 ${pct(r.gk, r.n)} (중앙값 ${ts.length ? ts[ts.length >> 1].toFixed(1) : '-'}초) · 공격수 ${pct(r.att, r.n)} · 수비 ${pct(r.def, r.n)} · 아무도/아웃 ${pct(r.none, r.n)}`);
}
if (!only || only === 3) {
  const r = { n: 0, cbHead: 0, cbOwn: 0, st: 0, stShot: 0, other: 0, none: 0 };
  for (let i = 0; i < N; i++) {
    const s = setup(i), fw = of(s, 1, 'FW'), mf = of(s, 1, 'MF'), df = of(s, 0, 'DF'), w = mf[0], st = fw[0], cb = df[i % df.length], I = s.INP[0];
    put(w, 50, CY + ((i % 5) - 2) * 7); put(st, 20 + (i % 4) * 2, CY + ((i % 7) - 3) * 2.5); put(cb, st.x - 1.2, st.y + ((i % 3) - 1) * 0.5); s.HU[0]!.ctrl = cb;
    give(s, w); s.HU[0]!.ctrl = cb; w.dir = Math.atan2(st.y - w.y, st.x - w.x); passTo(s, w, st, true); s.HU[0]!.ctrl = cb; r.n++;
    const o = watch(s, w, 4, () => { s.HU[0]!.ctrl = cb; if (noStick) { I.tx = I.ty = 0; return; } const q = intercept(s, cb), dx = q.x - cb.x, dy = q.y - cb.y, L = Math.hypot(dx, dy); if (L > 0.3) { I.tx = dx / L; I.ty = dy / L; } else { I.tx = I.ty = 0; } });
    if (!o.first) r.none++; else if (o.first === cb) { if (o.how === 'own') r.cbOwn++; else r.cbHead++; } else if (o.first === st) { if (o.how === 'shot') r.stShot++; else r.st++; } else r.other++;
  }
  console.log(`③ 사람 수비수 헤딩${noStick ? '(방향키 없음)' : ''} n=${r.n}: 수비수가 머리로 걷어 냄 ${pct(r.cbHead, r.n)} · 수비수가 잡음 ${pct(r.cbOwn, r.n)} · 공격수가 받음 ${pct(r.st + r.stShot, r.n)} · 다른 선수 ${pct(r.other, r.n)} · 아무도 ${pct(r.none, r.n)}`);
}
