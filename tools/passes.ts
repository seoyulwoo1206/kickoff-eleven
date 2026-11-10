/* 롱패스·스루패스 결과 시험: 실제 흐름에서 우리 선수가 공을 잡으면 앞쪽 동료를 조준해 롱패스(탭/반/풀) 또는 스루패스(보통/질주)를 찬다.
   받는 선수까지 거리·초기 속도·첫 바운드 오차·결과(받는 선수/다른 동료/상대/아웃). 사용: npx tsx tools/passes.ts [--n 60] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, H } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import type { Player } from '../src/sim/types';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
(globalThis as any).DBG = process.argv.includes('--dbg'); const N = arg('--n', 60);
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '-';

type Mode = { name: string; key: 'lob' | 'through'; hold: number; sprint?: boolean };
const MODES: Mode[] = [
  { name: '롱패스 탭', key: 'lob', hold: 0.06 }, { name: '롱패스 반', key: 'lob', hold: 0.35 }, { name: '롱패스 풀', key: 'lob', hold: 0.7 },
  { name: '스루 보통', key: 'through', hold: 0.05 }, { name: '스루 + 질주', key: 'through', hold: 0.05, sprint: true },
];
for (const mode of MODES) {
  const out = { n: 0, tgt: 0, mate: 0, opp: 0, oob: 0, behind: 0 }; const dist: number[] = [], v0: number[] = [], err: number[] = [], arr: number[] = [];
  for (let seed = 1; out.n < N && seed < 40; seed++) {
    const s = createMatch({ teams: [A, B], len: 300, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed, squads: [squadOf(A), squadOf(B)] });
    const I = s.INP[0], h = s.HU[0]!; let wait = 0, st = 0, holdT = 0, shot = -1, tgt: Player | null = null, kicker: Player | null = null, bounced = false, t0 = 0;
    while (s.M.phase !== 'full' && out.n < N) {
      const p = h.ctrl, b = s.ball;
      if (st === 0) { // 공을 잡고 0.5초 뒤, 앞쪽에 동료가 있으면 그쪽을 조준해 누른다
        if (p && b.owner === p && s.M.phase === 'live' && p.x > 25 && p.x < 80) {
          wait += STEP;
          const ms = s.team[0].filter(m => m !== p && m.role !== 'GK' && !m.off && m.x > p.x + 4 && Math.hypot(m.x - p.x, m.y - p.y) > (mode.key === 'lob' ? 14 : 6));
          if (wait > 0.5 && ms.length) { const m = ms.sort((a, c) => Math.abs(a.y - p.y) - Math.abs(c.y - p.y))[0], q = Math.hypot(m.x - p.x, m.y - p.y); I.tx = (m.x - p.x) / q; I.ty = (m.y - p.y) / q; if (mode.sprint) keyDown(I, 'sprint'); keyDown(I, mode.key); st = 1; holdT = 0; shot = b.shot; kicker = p; }
          else { I.tx = 0.6; I.ty = 0; }
        } else { wait = 0; if (p) { const o = b.owner && b.owner.t === 1 ? b.owner : b; I.tx = Math.sign(o.x - p.x) * 0.7; I.ty = Math.sign(o.y - p.y) * 0.7; } }
      } else if (st === 1) { holdT += STEP; if (holdT >= mode.hold) { keyUp(I, mode.key); if (mode.sprint) keyUp(I, 'sprint'); st = 2; t0 = 0; } }
      else if (st === 2) { // 킥이 나가길 기다린다
        t0 += STEP; if (b.shot !== shot && b.kicker === kicker) { tgt = b.passTarget; if (!tgt) { st = 0; wait = 0; } else { st = 3; t0 = 0; bounced = false; out.n++; dist.push(Math.hypot(tgt.x - kicker!.x, tgt.y - kicker!.y)); v0.push(Math.hypot(b.vx, b.vy)); if (tgt.x < kicker!.x - 2) out.behind++; } }
        else if (t0 > 1 || b.owner !== kicker && b.kicker !== kicker) { st = 0; wait = 0; }
      } else { // 결과
        t0 += STEP; I.tx = 0; I.ty = 0;
        if (!bounced && mode.key === 'lob' && b.z < 0.3 && t0 > 0.3 && !b.owner) { bounced = true; err.push(Math.hypot(b.x - tgt!.x, b.y - tgt!.y)); arr.push(Math.hypot(b.vx, b.vy)); }
        if (b.owner) { if (b.owner === tgt) out.tgt++; else if (b.owner.t === 0) out.mate++; else out.opp++; if (mode.key !== 'lob' && b.owner === tgt) arr.push(0); st = 0; wait = 0; }
        else if (s.M.phase !== 'live' || b.x < 0 || b.x > W || b.y < 0 || b.y > H) { out.oob++; st = 0; wait = 0; }
        else if (t0 > 6) { out.opp++; st = 0; wait = 0; }
      }
      step(s, STEP); s.ev.length = 0;
    }
  }
  console.log(`${mode.name}: n=${out.n} · 받는 선수까지 중앙값 ${med(dist).toFixed(0)}m (최대 ${Math.max(0, ...dist).toFixed(0)}m) · 초기 속도 ${med(v0).toFixed(0)}m/s · 받음 ${pct(out.tgt, out.n)} · 다른 동료 ${pct(out.mate, out.n)} · 상대 ${pct(out.opp, out.n)} · 아웃 ${pct(out.oob, out.n)} · 뒤쪽 동료가 대상 ${pct(out.behind, out.n)}` + (mode.key === 'lob' ? ` · 첫 바운드 오차 ${med(err).toFixed(1)}m · 그때 공 속도 ${med(arr).toFixed(0)}m/s` : ''));
}
