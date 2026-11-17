/* 역습 시험: 사람 팀이 자기 진영(하프라인 근처까지)에서 공을 뺏는 순간과 그 뒤 8초.
   뺏는 순간 공보다 앞에 있는 동료 수·가장 앞선 동료 위치·공보다 골 쪽에 있는 상대 수, 3초 뒤 앞쪽 동료 수,
   8초 안에 상대 진영 깊숙이(70m) 갔는지·슛·골. 조작 스크립트: 뺏으면 가장 앞선 열린 동료 쪽으로 바로 스루, 받은 선수는 질주 드리블 후 골 앞에서 슛.
   사용: npx tsx tools/counter.ts [--n 10] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 10);
const A = { n: 0, ahead: 0, far: 0, oppBack: 0, ahead3: 0, n3: 0, third: 0, shot: 0, goal: 0, lost3: 0, outnum: 0, tThird: 0 };
for (let g = 0; g < N; g++) {
  const a = TEAMS[(g * 5) % TEAMS.length], b = TEAMS[(g * 7 + 3) % TEAMS.length]; if (a === b) continue;
  const s = createMatch({ teams: [a, b], len: 300, diff: 'normal', tempo: 1, firstKick: g % 2, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 5000 + g, squads: [squadOf(a), squadOf(b)] });
  const I = s.INP[0], h = s.HU[0]!, bl = s.ball; let prevT = -1, ev: { t: number; x: number; done3: boolean; third: boolean; shots: number; sc: number } | null = null, t = 0, hold = 0, rel = 0, relKey: 'through' | 'shoot' | 'pass' = 'through';
  while (s.M.phase !== 'full') {
    const p = h.ctrl, o = bl.owner; I.tx = 0; I.ty = 0;
    if (rel > 0 && --rel === 0) keyUp(I, relKey);
    if (p && s.M.phase === 'live') {
      if (o === p) {
        hold++; const gx = W - p.x, gy = CY - p.y, dG = Math.hypot(gx, gy); I.tx = gx / dG; I.ty = gy / dG * 0.5;
        if (!I.down.sprint) keyDown(I, 'sprint');
        let nd = 99; for (const q of s.team[1]) nd = Math.min(nd, Math.hypot(q.x - p.x, q.y - p.y));
        if (rel === 0 && p.kickWind <= 0 && !p.pending) {
          if (dG < 20 && Math.abs(gy) < 13) { relKey = 'shoot'; keyDown(I, relKey); rel = 10; }
          else if (hold > 12 && (nd < 4 || hold > 80)) { // 가장 앞선 열린 동료 쪽으로 스루
            const ms = s.team[0].filter(m => m !== p && m.role !== 'GK' && !m.off && m.x > p.x + 4 && Math.hypot(m.x - p.x, m.y - p.y) < 36).sort((x, y) => y.x - x.x);
            if (ms[0]) { const m = ms[0], q = Math.hypot(m.x - p.x, m.y - p.y); I.tx = (m.x - p.x) / q; I.ty = (m.y - p.y) / q; relKey = 'through'; keyDown(I, relKey); rel = 3; hold = 0; }
          }
        }
      } else { hold = 0; if (I.down.sprint) keyUp(I, 'sprint'); const tg = o && o.t === 1 ? o : bl, q = Math.hypot(tg.x - p.x, tg.y - p.y) || 1; I.tx = (tg.x - p.x) / q; I.ty = (tg.y - p.y) / q; if (o && o.t === 1) { if (!I.down.pass && rel === 0) keyDown(I, 'pass'); } else if (I.down.pass && rel === 0) keyUp(I, 'pass'); }
    }
    step(s, STEP); t += STEP; s.ev.length = 0;
    const ow = bl.owner;
    if (s.M.phase !== 'live') { prevT = -1; if (ev) { ev = null; } continue; }
    if (ow) {
      if (ow.t === 0 && prevT === 1 && bl.x < 56 && ow.role !== 'GK' && !ev) { // 뺏었다
        const mates = s.team[0].filter(m => m !== ow && m.role !== 'GK' && !m.off), opp = s.team[1].filter(m => m.role !== 'GK' && !m.off);
        const ah = mates.filter(m => m.x > bl.x + 8).length, far = Math.max(...mates.map(m => m.x)) - bl.x, ob = opp.filter(m => m.x > bl.x + 1).length;
        if (process.argv.includes('--dbg') && A.n < 6) console.log(`공 x=${bl.x.toFixed(0)} · 우리 ${mates.map(m => m.role[0] + m.x.toFixed(0) + '(bx' + m.bx.toFixed(0) + ')').join(' ')} · 상대 ${opp.map(m => m.x.toFixed(0)).sort().join(' ')}`);
        A.n++; A.ahead += ah; A.far += far; A.oppBack += ob; if (ah + 1 >= ob) A.outnum++;
        ev = { t, x: bl.x, done3: false, third: false, shots: s.M.stats.shots[0], sc: s.M.score[0] };
      }
      if (ev && ow.t === 1) { if (t - ev.t < 3) A.lost3++; ev = null; }
      prevT = ow.t;
    }
    if (ev) {
      if (!ev.done3 && t - ev.t >= 3) { ev.done3 = true; const mates = s.team[0].filter(m => m.role !== 'GK' && !m.off); A.n3++; A.ahead3 += mates.filter(m => m.x > bl.x + 8).length; }
      if (!ev.third && bl.x > 70 && (!bl.owner || bl.owner.t === 0)) { ev.third = true; A.third++; A.tThird += t - ev.t; }
      if (t - ev.t > 8) { if (s.M.stats.shots[0] > ev.shots) A.shot++; if (s.M.score[0] > ev.sc) A.goal++; ev = null; }
    }
  }
}
const pc = (x: number) => Math.round(x / (A.n || 1) * 100) + '%';
console.log(`자기 진영에서 뺏은 ${A.n}번 (경기당 ${(A.n / N).toFixed(1)}): 그 순간 공보다 8m 넘게 앞선 동료 ${(A.ahead / A.n).toFixed(1)}명 · 가장 앞선 동료는 공보다 ${(A.far / A.n).toFixed(0)}m 앞 · 공보다 골 쪽에 있는 상대 ${(A.oppBack / A.n).toFixed(1)}명 · 수적으로 같거나 우세 ${pc(A.outnum)}`);
console.log(`그 뒤: 3초 안에 다시 뺏김 ${pc(A.lost3)} · 3초 뒤 앞선 동료 ${(A.ahead3 / (A.n3 || 1)).toFixed(1)}명 · 8초 안에 상대 진영 70m 도달 ${pc(A.third)} (평균 ${(A.tThird / (A.third || 1)).toFixed(1)}초) · 슛 ${pc(A.shot)} · 골 ${pc(A.goal)}`);
