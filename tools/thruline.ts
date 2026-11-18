/* 일직선 스루패스 시험: 패서 바로 앞(같은 선)에서 같은 방향으로 달리는 동료에게 스루패스. 옆으로 비껴 있는 경우와 비교한다.
   앞에는 상대 포백(받는 선수 12m 앞)과 키퍼. 방향키는 계속 앞으로 누른 채. 사용: npx tsx tools/thruline.ts [--n 40] [--dbg] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, H } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import { gain } from '../src/sim/ball';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 40), DBG = process.argv.includes('--dbg');
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0, pct = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '-';
for (const sprint of [false, true]) for (const lat of [0, 5, 10]) for (const gap of [6, 10, 15, 22]) {
  let n = 0, got = 0, opp = 0, gk = 0, out = 0, none = 0, other = 0; const v0: number[] = [], trav: number[] = [], tim: number[] = [], lead: number[] = [], rsp: number[] = [];
  for (let seed = 1; seed <= N; seed++) {
    const s = createMatch({ teams: [A, B], len: 300, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed, squads: [squadOf(A), squadOf(B)] });
    for (let i = 0; i < 120; i++) { step(s, STEP); s.ev.length = 0; }
    const I = s.INP[0], P = s.team[0][6], R = s.team[0][9], px = 40 + (seed % 5) * 2, py = 26 + (seed % 7) * 2.5;
    for (const m of s.team[0]) if (m.role !== 'GK' && m !== P && m !== R) { m.x = px - 14 - m.i; m.y = (m.i % 2 ? 6 : 62); m.vx = m.vy = 0; }
    P.x = px; P.y = py; P.vx = 5.5; P.vy = 0; P.dir = 0; R.x = px + gap; R.y = py + lat; R.vx = 6.5; R.vy = 0; R.dir = 0;
    const defs = s.team[1].filter(o => o.role !== 'GK'), lx = Math.min(px + gap + 12, 90);
    defs.forEach((o, i) => { if (i < 4) { o.x = lx; o.y = py + lat * 0.5 + (i - 1.5) * 11; } else { o.x = px - 20 - i; o.y = 10 + i * 5; } o.vx = o.vy = 0; });
    s.M.phase = 'live'; s.M.protect = 0; gain(s, P); s.HU[0]!.ctrl = P; I.tx = 1; I.ty = 0;
    for (let i = 0; i < 6; i++) { step(s, STEP); s.ev.length = 0; R.vx = 6.5; }
    if (sprint) keyDown(I, 'sprint'); keyDown(I, 'through'); const shot = s.ball.shot; let kicked = false, kx = 0, rx0 = 0, t0 = 0, done = false;
    for (let i = 0; i < 480 && !done; i++) {
      step(s, STEP); s.ev.length = 0; if (i === 2) keyUp(I, 'through'); const b = s.ball;
      if (!kicked) { if (b.shot !== shot) { kicked = true; kx = b.x; rx0 = R.x; v0.push(Math.hypot(b.vx, b.vy)); n++; if (b.passTarget !== R) { other++; } if (DBG && seed <= 3) console.log(`  gap ${gap} lat ${lat}: v0 ${Math.hypot(b.vx, b.vy).toFixed(1)} 대상 ${b.passTarget?.num} (R=${R.num})`); } else if (i > 60) { none++; done = true; } continue; }
      t0 += STEP;
      if (b.owner) { if (b.owner.t === 0) { got++; trav.push(b.x - kx); tim.push(t0); lead.push(b.owner.x - rx0); rsp.push(Math.hypot(b.owner.vx, b.owner.vy)); } else if (b.owner.role === 'GK') gk++; else opp++; done = true; }
      else if (s.M.phase !== 'live' || b.x < 0 || b.x > W || b.y < 0 || b.y > H) { out++; done = true; }
    }
    if (kicked && !done) opp++;
  }
  console.log(`${sprint ? '질주 스루' : '보통 스루'} · 옆 ${String(lat).padStart(2)}m · 앞 ${String(gap).padStart(2)}m: 받음 ${pct(got, n).padStart(4)} · 수비 ${pct(opp, n)} · 키퍼 ${pct(gk, n)} · 아웃 ${pct(out, n)} | 초기 속도 ${med(v0).toFixed(0)}m/s · 공이 간 거리 ${med(trav).toFixed(0)}m · 받는 선수가 뛴 거리 ${med(lead).toFixed(0)}m · ${med(tim).toFixed(1)}s · 받을 때 속도 ${med(rsp).toFixed(1)}m/s` + (none ? ` · 킥 안 나감 ${none}` : '') + (other ? ` · 다른 대상 ${other}` : ''));
}
