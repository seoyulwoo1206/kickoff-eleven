/* 지원 움직임 시험: 실제 경기 흐름에서 우리 선수가 공을 잡은 순간부터 사람이 공을 지키며 천천히 전진할 때(--jog면 조깅),
   1·2·3초 뒤 동료들이 어디에 있는가 (앞에 줄 곳, 침투, 라인 간격).
   사용: npx tsx tools/support.ts [--n 60] [--seeds 3] [--team KOR] [--opp BRA] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { d } from '../src/sim/util';
import { laneRisk } from '../src/sim/ball';
import { squadOf, applySquadStrength } from '../src/data/squads';
import type { Sim, Player } from '../src/sim/types';
applySquadStrength();
const argv = process.argv.slice(2), flag = (n: string, def: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : def; };
const N = +flag('--n', '60'), SEEDS = +flag('--seeds', '3'), MAG = argv.includes('--jog') ? 0.8 : 0.35; // 기본: 공을 지키며 천천히 전진(동료를 기다림), --jog: 조깅으로 계속 전진
const A = TEAMS.find(t => t.code === flag('--team', 'KOR'))!, B = TEAMS.find(t => t.code === flag('--opp', 'BRA'))!;
const TS = [0, 1, 2, 3];
const acc = TS.map(() => ({ n: 0, ahead: 0, open: 0, none: 0, runners: 0, onLine: 0, dfUp: 0, fwNear: 0, fwSep: 0, dfGap: 0, mfGap: 0, fwGap: 0, nearOpt: 0, nearN: 0 }));
let trials = 0, lostEarly = 0, progress = 0;

function sample(s: Sim, p: Player, k: number) {
  const S = acc[k], lbx = p.x; S.n++;
  const xs = s.team[1].filter(o => !o.off).map(o => o.x).sort((x, y) => y - x), line = Math.max(xs[1] || 0, lbx, 52.5);
  const fwy: number[] = []; let dfUp = 0, fwNear = 0; let ahead = 0, open = 0, runners = 0, onLine = 0, dfx = 0, ndf = 0, mfx = 0, nmf = 0, fwx = 0, nfw = 0, near = 1e9;
  for (const m of s.team[0]) {
    if (m === p || m.role === 'GK' || m.off) continue;
    const q = d(m, p); let op = 99; for (const o of s.team[1]) op = Math.min(op, d(o, m));
    const isOpen = op > 3 && laneRisk(s, p, m, 0) < 0.3 && m.x <= line + 0.5;
    if (m.x > lbx + 4 && q < 40) { ahead++; if (isOpen) { open++; near = Math.min(near, q); } }
    if (m.runT > 0 || (m.x > line - 5 && m.vx > 3.5 && m.x > lbx + 4)) runners++;
    if (m.role !== 'DF' && m.x > line - 3 && m.x <= line + 0.5 && m.x > lbx - 2 && q < 40) onLine++;
    if (m.role === 'DF' && m.x > lbx - 4) dfUp++; if (m.role === 'FW') { fwy.push(m.y); if (q < 12) fwNear++; }
    if (m.role === 'DF') { dfx += m.x; ndf++; } else if (m.role === 'MF') { mfx += m.x; nmf++; } else { fwx += m.x; nfw++; }
  }
  S.ahead += ahead; S.open += open; S.none += open === 0 ? 1 : 0; S.runners += runners; S.onLine += onLine; S.dfUp += dfUp; S.fwNear += fwNear; S.fwSep += fwy.length > 1 ? Math.abs(fwy[0] - fwy[1]) : 0;
  S.dfGap += lbx - dfx / Math.max(1, ndf); S.mfGap += lbx - mfx / Math.max(1, nmf); S.fwGap += fwx / Math.max(1, nfw) - lbx; if (near < 1e9) { S.nearOpt += near; S.nearN++; }
}
for (let sd = 0; sd < SEEDS; sd++) {
  const s = createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: sd & 1, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 31 + sd, squads: [squadOf(A), squadOf(B)] });
  const I = s.INP[0], h = s.HU[0]!; let guard = 0, done = 0;
  while (done < N / SEEDS && guard++ < 3000) {
    // AI끼리 흘려 보내다가 우리 필드 선수가 중원(30~75m)에서 공을 잡는 순간을 찾는다
    s.HU[0] = null; let found = false; for (const q of s.players) q.sta = 1;
    for (let i = 0; i < 1500; i++) { step(s, STEP); s.ev.length = 0; s.M.time = 0; if (s.M.phase === 'full') s.M.phase = 'live'; const o = s.ball.owner; if (i >= 150 && s.M.phase === 'live' && o && o.t === 0 && o.role !== 'GK' && o.x > 30 && o.x < 75 && s.M.protect <= 0 && o.holdT < 0.1) { found = true; break; } }
    s.HU[0] = h; if (!found) continue;
    const p = s.ball.owner as Player; h.ctrl = p; const x0 = p.x; trials++; done++;
    sample(s, p, 0); let lost = false;
    for (let i = 1; i <= 180; i++) { // 사람: 골 쪽으로 조깅 드리블 (질주 없음, 패스 없음)
      const dx = W - p.x, dy = (CY - p.y) * 0.5, q = Math.hypot(dx, dy) || 1; I.tx = dx / q * MAG; I.ty = dy / q * MAG;
      step(s, STEP); s.ev.length = 0; s.M.time = 0;
      if (s.ball.owner !== p) { lost = true; if (i < 120) lostEarly++; break; }
      if (i % 60 === 0) sample(s, p, i / 60);
    }
    I.tx = 0; I.ty = 0; if (!lost) progress += p.x - x0;
  }
}
console.log(`${A.code} vs ${B.code}: 공 잡은 순간 ${trials}번 (2초 안에 뺏김 ${lostEarly}, 3초 버틴 경우 평균 전진 ${(progress / Math.max(1, acc[3].n)).toFixed(1)}m)`);
TS.forEach((tt, k) => { const S = acc[k]; if (!S.n) return; const f = (v: number) => (v / S.n).toFixed(1);
  console.log(`${tt}초 뒤 (n=${S.n}): 앞쪽 동료 ${f(S.ahead)}명 · 받을 수 있는 ${f(S.open)}명 (가장 가까운 ${(S.nearOpt / Math.max(1, S.nearN)).toFixed(0)}m) · 줄 곳 없음 ${(S.none / S.n * 100).toFixed(0)}% · 침투 중 ${f(S.runners)}명 · 최종 라인에 선 동료 ${f(S.onLine)}명 · 공 근처까지 올라온 수비수 ${f(S.dfUp)}명 · 공 12m 안 공격수 ${f(S.fwNear)}명 · 공격수 좌우 간격 ${f(S.fwSep)}m · 수비 라인 공 뒤 ${f(S.dfGap)}m · 미드필더 공 뒤 ${f(S.mfGap)}m · 공격수 공 앞 ${f(S.fwGap)}m`); });
