/* 크로스 시험: 측면 깊숙이(골라인에서 9~17m, 터치라인에서 4~9m) 공을 잡은 사람이 골문 쪽을 조준해 롱패스(A)를 탭/반/풀로 찬다.
   윙어가 30m 밖에서 터치라인을 따라 몰고 올라간 뒤 찬다.
   공이 받는 선수 머리 높이(2.2m)로 내려왔을 때 받는 선수와의 거리, 누가 처음 건드렸나, 그 뒤 3초 안의 슛·골.
   --low: 감아차기 키를 누른 채 롱패스 = 땅볼 크로스(52차). --shot: 크로스가 날아오는 동안 받는 선수가 슛 키를 미리 눌렀다 뗀다(원터치 슛). --after: 받은 뒤 0.2초에 슛 키를 눌러 0.23초 뒤 뗀다(원터치와 비교용).
   사용: npx tsx tools/cross.ts [--n 80] [--hold] [--low] [--byline] [--shot | --after] [--dbg] */
/* --byline: 터치라인이 아니라 박스 옆(가운데에서 16~19m)으로 골라인 5~7m 앞까지 파고든 뒤 페널티 스폿 쪽을 겨눠 찬다 (컷백 자리) */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, H, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import { gain } from '../src/sim/ball';
import type { Player } from '../src/sim/types';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 80), LOW = process.argv.includes('--low'), SHOT = process.argv.includes('--shot'), AFTER = process.argv.includes('--after'), DBG = process.argv.includes('--dbg'), BY = process.argv.includes('--byline');
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0, p90 = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)] : 0;
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '-';
for (const [name, hold] of [['탭', 0.06], ['반', 0.35], ['풀', 0.7]] as [string, number][]) {
  const r = { n: 0, noTgt: 0, tgt: 0, mate: 0, gk: 0, opp: 0, out: 0, none: 0, shot: 0, goal: 0, head: 0 }; const err: number[] = [], dist: number[] = [], time: number[] = [];
  for (let i = 0; r.n < N && i < N * 3; i++) {
    const s = createMatch({ teams: [A, B], len: 300, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 900 + i, squads: [squadOf(A), squadOf(B)] });
    const I = s.INP[0], h = s.HU[0]!, b = s.ball;
    for (let k = 0; k < 150; k++) { step(s, STEP); s.ev.length = 0; }
    // 윙어를 측면 깊숙이 세우고 2초 동안 공을 지키게 해 동료·수비가 박스에 자리 잡게 한다
    const top = i % 2 === 0, wingers = s.team[0].filter(p => p.role !== 'GK' && !p.off).sort((a, c) => (top ? a.by - c.by : c.by - a.by)); const p = wingers[0];
    const stopX = BY ? W - 5 - (i % 3) : W - 9 - (i % 5) * 2; p.x = BY ? W - 36 : W - 30; p.y = BY ? CY + (top ? -1 : 1) * (16 + (i % 3) * 1.5) : top ? 4 + (i % 3) * 2.5 : H - 4 - (i % 3) * 2.5; p.vx = p.vy = 0; b.x = p.x; b.y = p.y; b.z = 0; b.vx = b.vy = b.vz = 0; s.M.phase = 'live'; gain(s, p); h.ctrl = p;
    for (let k = 0; k < 400 && p.x < stopX; k++) { s.M.protect = 1; I.tx = 1; I.ty = 0; step(s, STEP); s.ev.length = 0; if (b.owner !== p) break; } // 터치라인을 따라 몰고 올라간다 (동료·수비가 박스에 자리 잡는다)
    if (b.owner !== p || s.M.phase !== 'live') continue;
    const ax = W - (BY ? 11 : 5) - p.x, ay = CY - p.y, al = Math.hypot(ax, ay); I.tx = ax / al; I.ty = ay / al; s.M.protect = 0.6; // 골문 앞(골라인 5m 앞 가운데)을 조준
    const shot0 = b.shot; if (LOW) keyDown(I, 'chip'); keyDown(I, 'lob'); for (let k = 0; k < Math.round(hold * 60); k++) { step(s, STEP); s.ev.length = 0; } keyUp(I, 'lob');
    let tgt: Player | null = null, kicked = false; for (let k = 0; k < 30 && !kicked; k++) { step(s, STEP); s.ev.length = 0; if (b.shot !== shot0 && b.kicker === p) { kicked = true; tgt = b.passTarget; } }
    if (LOW) keyUp(I, 'chip'); if (!kicked) continue; r.n++; if (!process.argv.includes('--hold')) { I.tx = 0; I.ty = 0; } // --hold: 찬 뒤에도 조준하던 방향키를 계속 누르고 있다 (사람은 보통 그런다)
    if (!tgt) { r.noTgt++; continue; }
    dist.push(Math.hypot(tgt.x - p.x, tgt.y - p.y));
    const kx = p.x, ky = p.y, v0 = Math.hypot(b.vx, b.vy), tx0 = tgt.x, ty0 = tgt.y; let gT = -1;
    let hd = ''; let first: Player | null = null, measured = false, up = false, t = 0, sc = s.M.score[0], shots0 = s.M.stats.shots[0], sh = b.shot, res = '';
    for (let k = 0; k < 60 * 5; k++) {
      if (SHOT) { if (k === 6) keyDown(I, 'shoot'); if (k === 20) keyUp(I, 'shoot'); }
      if (AFTER) { if (gT < 0 && b.owner && b.owner.t === 0 && b.owner !== p) gT = k; if (gT >= 0 && k === gT + 12) keyDown(I, 'shoot'); if (gT >= 0 && k === gT + 26) keyUp(I, 'shoot'); }
      step(s, STEP); s.ev.length = 0; t += STEP;
      if (b.z > 2.3) up = true;
      if (!measured && up && b.z <= 2.2 && !b.owner) { measured = true; err.push(Math.hypot(b.x - tgt.x, b.y - tgt.y)); time.push(t); }
      if (!first) { if (b.owner) first = b.owner; else if (b.shot !== sh && b.kicker && b.kicker !== p) first = b.kicker; if (first) { res = first === tgt ? 'tgt' : first.t === 0 ? 'mate' : first.role === 'GK' ? 'gk' : 'opp'; if (first.t === 0 && b.isShot && !b.owner) { r.head++; if (process.argv.includes('--dbg')) { const kp = s.team[1][0]; hd = `헤딩 위치(${first.x.toFixed(0)},${first.y.toFixed(0)}) 골까지 ${Math.hypot(W - first.x, CY - first.y).toFixed(0)}m 속도 ${Math.hypot(b.vx, b.vy).toFixed(0)} vz ${b.vz.toFixed(1)} z ${b.z.toFixed(1)} 방향y→${(b.y + b.vy / b.vx * (W - b.x)).toFixed(1)} 키퍼(${kp.x.toFixed(0)},${kp.y.toFixed(1)})`; } } } }
      if (hd && first && (b.owner || s.M.phase !== 'live' || t > 3.4)) { console.log(hd + ' → ' + (s.M.score[0] > sc ? '골' : b.owner ? (b.owner.role === 'GK' ? '키퍼가 잡음' : b.owner.t === 1 ? '수비' : '우리 편') : s.M.phase !== 'live' ? '아웃(' + s.M.spType + ')' : '?') + ` 공(${b.x.toFixed(0)},${b.y.toFixed(1)},z${b.z.toFixed(1)})`); hd = ''; }
      if (!first && s.M.phase !== 'live') { res = 'out'; break; }
      if (first && t > 3.5) break;
    }
    if (!res) res = 'none'; (r as any)[res]++;
    if (DBG && LOW && first) console.log(`  ${res} 찬 곳(${kx.toFixed(0)},${ky.toFixed(0)}) 대상(${tx0.toFixed(0)},${ty0.toFixed(0)}) ${Math.hypot(tx0 - kx, ty0 - ky).toFixed(0)}m 처음 속도 ${v0.toFixed(0)} → 처음 건드린 ${first.role}(${first.x.toFixed(0)},${first.y.toFixed(0)}) 찬 곳에서 ${Math.hypot(first.x - kx, first.y - ky).toFixed(0)}m`);
    if (s.M.stats.shots[0] > shots0) r.shot++; if (s.M.score[0] > sc) r.goal++;
  }
  const k = r.n - r.noTgt;
  console.log(`크로스 ${name}: n=${r.n} (박스 안 대상 없음 ${r.noTgt}) · 받는 선수까지 ${med(dist).toFixed(0)}m · 머리 높이로 내려올 때 받는 선수와 거리 중앙값 ${med(err).toFixed(1)}m (상위 10% ${p90(err).toFixed(1)}m) · 체공 ${med(time).toFixed(1)}s · 처음 건드린 선수: 받는 선수 ${pct(r.tgt, k)} · 다른 동료 ${pct(r.mate, k)} · 키퍼 ${pct(r.gk, k)} · 수비 ${pct(r.opp, k)} · 아웃 ${pct(r.out, k)} · 아무도 ${pct(r.none, k)} | 헤딩슛 ${pct(r.head, k)} · 3초 안 슛 ${pct(r.shot, k)} · 골 ${pct(r.goal, k)}`);
}
