/* 체감 벤치: 사람처럼 조작하는 간단한 컨트롤러가 KOR(사람)로 AI와 경기를 뛰며 패스·슛·수비 체감 지표를 잰다.
   사용: npx tsx tools/flow.ts [--n 4] [--len 300] [--team KOR] [--opp BRA] [--diff normal] [--seed 1]
   지표: 조준한 동료에게 패스가 갔는가(의도 일치), 수신률, 가로채기, 누르고 차기까지 지연, 받는 선수가 잡기까지 시간, 트래핑 바운스, 점유·슈팅·골 */
import { TEAMS, type DiffKey } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { d, angDiff } from '../src/sim/util';
import { laneRisk, leadPos } from '../src/sim/ball';
import { keyDown, keyUp } from '../src/input/actions';
import { squadOf, applySquadStrength } from '../src/data/squads';
import type { Player } from '../src/sim/types';

const argv = process.argv.slice(2);
const flag = (n: string, def: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : def; };
applySquadStrength();
const NODEF = argv.includes('--nodef'), DBG = argv.includes('--dbg'); const N = +flag('--n', '4'), LEN = +flag('--len', '300'), SEED = +flag('--seed', '1'), DIFF = flag('--diff', 'normal') as DiffKey;
const pick = (c: string) => TEAMS.find(t => t.code === c) ?? TEAMS[0];
const A = pick(flag('--team', 'KOR')), B = pick(flag('--opp', 'BRA'));

interface PassRec { passer: Player; kind: 'short' | 'thru'; intended: Player | null; target: Player | null; pressT: number; kickT: number; gotT: number; result: string; bobble: boolean; back: boolean; stick: number; risk: number; no: number; ang: number; }
const recv: number[] = []; const hist = new Array(11).fill(0); // 공을 받은 순간 가장 가까운 상대 거리
const passes: PassRec[] = []; let shots = 0, shotPress = 0; const agg = { goals: [0, 0], poss: [0, 0], shotsFor: [0, 0], onT: [0, 0], aiPassA: 0, aiPassC: 0, lostHold: 0, holdSum: 0, holdN: 0, cursorSwitch: 0, tackledWhileHolding: 0, nearTicks: 0 };

for (let g = 0; g < N; g++) {
  const s = createMatch({ teams: [A, B], len: LEN, diff: DIFF, tempo: 1, firstKick: g & 1, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: SEED + g, squads: [squadOf(A), squadOf(B)] });
  const I = s.INP[0], h = s.HU[0]!; let t = 0, holdSince = -1, shootT = -1, cur: PassRec | null = null, lastCtrl: Player | null = null, nextKind: 'short' | 'thru' = 'short', lastPassT = -9;
  const simT = () => t;
  while (s.M.phase !== 'full') {
    const p = h.ctrl, ball = s.ball, own = ball.owner;
    if (p && lastCtrl && p !== lastCtrl) agg.cursorSwitch++; lastCtrl = p;
    // 진행 중인 패스 기록 추적
    if (cur) {
      if (cur.kickT < 0 && ball.owner !== cur.passer) { cur.kickT = t; cur.target = ball.passTarget; if (cur.target) cur.ang = Math.abs(angDiff(cur.stick, Math.atan2(cur.target.y - cur.passer.y, cur.target.x - cur.passer.x))); if (!ball.passTarget && ball.owner && ball.owner.t === 1) { cur.result = 'lostBeforeKick'; passes.push(cur); cur = null; } }
      else if (cur.kickT >= 0 && ball.owner) { const o = ball.owner; cur.gotT = t; cur.bobble = ball.knock === o && false; cur.result = o === cur.target ? 'ok' : o.t === 1 ? 'opp' : o === cur.passer ? 'passerAgain' : 'otherMate'; passes.push(cur); cur = null; }
      else if (cur.kickT >= 0 && (t - cur.kickT > 4 || s.M.phase !== 'live')) { cur.result = s.M.phase !== 'live' ? 'dead' : 'none'; passes.push(cur); cur = null; }
      else if (cur.kickT < 0 && t - cur.pressT > 0.6) { cur.result = 'noKick'; passes.push(cur); cur = null; }
    }
    if (p && s.M.phase === 'live') {
      if (own === p) {
        const gx = W, dxg = gx - p.x, dyg = CY - p.y, dG = Math.hypot(dxg, dyg); let no = 1e9; for (const o of s.team[1]) no = Math.min(no, d(o, p));
        if (holdSince < 0) { holdSince = t; recv.push(no); }
        // 기본 스틱: 골 방향, 중앙으로 살짝
        let sx = dxg / dG, sy = dyg / dG * 0.6; const m = Math.hypot(sx, sy); sx /= m; sy /= m;
        I.tx = sx; I.ty = sy; if (no > 5 && dG > 28 && !I.down.sprint) keyDown(I, 'sprint'); if ((no <= 5 || dG <= 28) && I.down.sprint) keyUp(I, 'sprint');
        if (dG < 20) agg.nearTicks++; hist[Math.min(10, Math.floor(p.x / 10))]++;
        if (shootT >= 0) { if (t - shootT > 0.35) { keyUp(I, 'shoot'); shootT = -1; } }
        else if (dG < 20 && Math.abs(Math.atan2(dyg, dxg)) < 0.9 && p.kickWind <= 0) { keyDown(I, 'shoot'); shootT = t; shots++; shotPress++; }
        else if (!cur && p.kickWind <= 0 && t - lastPassT > 0.5 && (no < 2.6 || t - holdSince > 1.6)) {
          // 조준: 앞쪽 25m 안에서 가장 열린 동료를 고르고 스틱을 그쪽으로
          let best: Player | null = null, bs = -1e9;
          for (const q of s.team[0]) { if (q === p || q.role === 'GK' || q.off) continue; const dx = q.x - p.x, dy = q.y - p.y, qd = Math.hypot(dx, dy); if (qd < 3 || qd > 28 || dx < -4) continue; let op = 99; for (const o of s.team[1]) op = Math.min(op, d(o, q)); const sc = Math.min(op, 8) + dx / 10 - Math.abs(qd - 14) / 10; if (sc > bs) { bs = sc; best = q; } }
          if (best) { const dx = best.x - p.x, dy = best.y - p.y, qd = Math.hypot(dx, dy); I.tx = dx / qd; I.ty = dy / qd; }
          const kind = nextKind; nextKind = (agg.holdN % 3) === 1 ? 'thru' : 'short'; // 숏 2 : 스루 1
          if (DBG && best && kind === 'short') { const sc = (m: Player) => { const L = leadPos(p, m), dx = L.x - p.x, dy = L.y - p.y, q = Math.hypot(dx, dy), c = (dx * I.tx + dy * I.ty) / q; return { n: m.name.slice(0, 3), q: +q.toFixed(1), c: +c.toFixed(2), risk: +laneRisk(s, p, L, 0).toFixed(2), sc: +(Math.min(c, 0.92) / 0.92 * 4 - Math.max(0, q - 9) / 16 - laneRisk(s, p, L, 0) * 1.2).toFixed(2) }; }; const all = s.team[0].filter(m => m !== p && m.role !== 'GK').map(sc).sort((x, y) => y.sc - x.sc); if (all[0].n !== best.name.slice(0, 3)) console.log('MISMATCH aim', JSON.stringify(sc(best)), 'top', JSON.stringify(all.slice(0, 2)), 'no', no.toFixed(1)); }
          keyDown(I, kind === 'short' ? 'pass' : 'through'); cur = { kind, intended: best, target: null, pressT: t, kickT: -1, gotT: -1, result: '?', bobble: false, back: !!best && best.x < p.x - 6, passer: p, stick: Math.atan2(I.ty, I.tx), risk: best ? laneRisk(s, p, best, 0) : 0, no, ang: 0 };
          lastPassT = t; agg.holdSum += t - holdSince; agg.holdN++;
          step(s, STEP); s.ev.length = 0; t += STEP; keyUp(I, kind === 'short' ? 'pass' : 'through'); continue;
        }
      } else {
        const mineKnock = !own && ball.knock === p; // 질주 드리블 중 (공을 앞에 차 놓은 상태)
        if (holdSince >= 0 && !mineKnock) { holdSince = -1; }
        if (mineKnock) { const dG = Math.hypot(W - p.x, CY - p.y); if (dG < 22 && d(p, ball) < 1.4 && shootT < 0) { keyUp(I, 'sprint'); keyDown(I, 'shoot'); shootT = t; shots++; } else if (dG < 26 && I.down.sprint) keyUp(I, 'sprint'); step(s, STEP); s.ev.length = 0; t += STEP; continue; }
        if (I.down.sprint) keyUp(I, 'sprint'); if (shootT >= 0 && t - shootT > 0.35) { keyUp(I, 'shoot'); shootT = -1; }
        if (NODEF) { I.tx = 0; I.ty = 0; if (I.down.pass) keyUp(I, 'pass'); }
        else if (own && own.t === 1) { const dx = own.x - p.x, dy = own.y - p.y, q = Math.hypot(dx, dy) || 1; I.tx = dx / q; I.ty = dy / q; if (!I.down.pass) keyDown(I, 'pass'); }
        else { if (I.down.pass) keyUp(I, 'pass'); const dx = ball.x - p.x, dy = ball.y - p.y, q = Math.hypot(dx, dy) || 1; I.tx = dx / q; I.ty = dy / q; }
      }
    }
    step(s, STEP); s.ev.length = 0; t += STEP;
  }
  const st = s.M.stats; agg.goals[0] += s.M.score[0]; agg.goals[1] += s.M.score[1]; agg.poss[0] += st.poss[0]; agg.poss[1] += st.poss[1]; agg.shotsFor[0] += st.shots[0]; agg.shotsFor[1] += st.shots[1]; agg.onT[0] += st.onT[0]; agg.onT[1] += st.onT[1]; agg.aiPassA += st.passA[1]; agg.aiPassC += st.passC[1];
  console.log(`경기 ${g + 1}: ${A.code} ${s.M.score[0]} : ${s.M.score[1]} ${B.code} · 슈팅 ${st.shots[0]}(유효 ${st.onT[0]}) vs ${st.shots[1]}(${st.onT[1]}) · 점유 ${Math.round(st.poss[0] / (st.poss[0] + st.poss[1] || 1) * 100)}%`);
}
const by = (k: 'short' | 'thru') => passes.filter(x => x.kind === k);
const pct = (a: number, b: number) => b ? `${(a / b * 100).toFixed(0)}%` : '-';
for (const k of ['short', 'thru'] as const) {
  const L = by(k), ok = L.filter(x => x.result === 'ok'), kicked = L.filter(x => x.kickT >= 0 && x.target);
  const match = kicked.filter(x => x.intended && x.target === x.intended).length, intended = kicked.filter(x => x.intended).length;
  const res: Record<string, number> = {}; for (const x of L) res[x.result] = (res[x.result] || 0) + 1;
  const delay = kicked.reduce((a, x) => a + (x.kickT - x.pressT), 0) / (kicked.length || 1), arrive = ok.reduce((a, x) => a + (x.gotT - x.kickT), 0) / (ok.length || 1);
  const mis = kicked.filter(x => x.intended && x.target !== x.intended), misAng = mis.reduce((a, x) => a + x.ang, 0) / (mis.length || 1) * 180 / Math.PI, misRisk = mis.filter(x => x.risk > 0.3).length, misOk = mis.filter(x => x.result === 'ok').length, matchOk = kicked.filter(x => x.intended && x.target === x.intended && x.result === 'ok').length;
  console.log(`${k === 'short' ? '숏패스' : '스루패스'} n=${L.length}: 수신 ${pct(ok.length, L.length)} · 조준한 동료에게 ${pct(match, intended)} (n=${intended}, 그때 수신 ${pct(matchOk, match)}) · 빗나간 ${mis.length}건: 평균 ${misAng.toFixed(0)}° 다른 동료, 조준 선로 막힘 ${misRisk}, 수신 ${pct(misOk, mis.length)} · 누르고 차기까지 ${(delay * 1000).toFixed(0)}ms · 도착까지 ${arrive.toFixed(2)}s · ${Object.entries(res).map(([a, b]) => `${a} ${b}`).join(', ')}`);
}
console.log('사람 소유 x 분포(10m 단위, 초):', hist.map(v => (v / 60).toFixed(0)).join(' ')); recv.sort((a, b) => a - b); console.log(`받는 순간 가장 가까운 상대: 중앙값 ${recv[recv.length >> 1]?.toFixed(1)}m · 2m 안 ${pct(recv.filter(v => v < 2).length, recv.length)} · 4m 밖 ${pct(recv.filter(v => v > 4).length, recv.length)}`);
console.log(`합계 ${N}경기: 골 22m 안 소유 ${(agg.nearTicks / 60).toFixed(0)}s · 슛 시도 ${shots} · 골 ${agg.goals[0]}:${agg.goals[1]} · 슈팅 ${agg.shotsFor[0]}(유효 ${agg.onT[0]}) vs ${agg.shotsFor[1]}(${agg.onT[1]}) · 점유 ${pct(agg.poss[0], agg.poss[0] + agg.poss[1])} · AI 패스 ${pct(agg.aiPassC, agg.aiPassA)} · 공 잡고 평균 ${(agg.holdSum / (agg.holdN || 1)).toFixed(2)}s 뒤 패스 · 커서 전환 ${(agg.cursorSwitch / N).toFixed(0)}/경기`);
