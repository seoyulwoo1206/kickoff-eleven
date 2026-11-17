/* 공격 흐름 분석: 공격이 어디까지 가고 어디서 끊기는가. AI끼리(기본) 또는 --human(스크립트 없이 AI가 사람 팀 규칙으로)…은 없음.
   소유 연속(한 팀이 공을 잡은 뒤 상대가 잡거나 공이 죽을 때까지)마다 가장 깊이 간 곳·끝난 이유·슛을 센다.
   사용: npx tsx tools/attack.ts [--n 30] [--len 300] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, CY } from '../src/sim/consts';
import { wx } from '../src/sim/util';
import { keyDown, keyUp } from '../src/input/actions';
import { squadOf, applySquadStrength } from '../src/data/squads';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 30), LEN = arg('--len', 300), HUM = process.argv.includes('--human'); // --human: 팀 0은 사람 팀(커서 선수는 압박만 누름), 팀 1(AI)의 공격만 센다
let games = 0, goals = 0;
const zone = { seq: 0, half: 0, third: 0, box: 0 }, shots = { n: 0, box: 0, dist: [] as number[], goal: 0, onT: 0 };
const endIn: Record<string, Record<string, number>> = { mid: {}, third: {}, box: {} };
const carry = { boxT: 0, thirdT: 0 };
for (let g = 0; g < N; g++) {
  const a = TEAMS[(g * 7 + 1) % TEAMS.length], b = TEAMS[(g * 11 + 5) % TEAMS.length]; if (a === b) continue; games++;
  const s = createMatch({ teams: [a, b], len: LEN, diff: 'normal', tempo: 1, firstKick: g % 2, humans: [HUM ? { tag: 'P1', col: '#fff', cursor: 'manual' } : null, null], net: false, seed: 100 + g, squads: [squadOf(a), squadOf(b)] });
  let team = -1, maxX = 0, shot = false, lastShot = -1, prevOwnerT = -1, prevKickPass = false, sc0 = 0;
  const close = (why: string) => {
    if (team < 0) return; if (HUM && team !== 1) { team = -1; return; } zone.seq++; if (maxX > 52.5) zone.half++; if (maxX > 70) zone.third++; const inBox = maxX > 88.5;
    if (inBox) zone.box++;
    const z = inBox ? 'box' : maxX > 70 ? 'third' : 'mid'; const k = shot ? '슛' : why; endIn[z][k] = (endIn[z][k] || 0) + 1; team = -1;
  };
  while (s.M.phase !== 'full') {
    if (HUM) { const I = s.INP[0], p = s.HU[0]!.ctrl, bo = s.ball.owner; if (p && bo && bo.t === 1) { const q = Math.hypot(bo.x - p.x, bo.y - p.y) || 1; I.tx = (bo.x - p.x) / q; I.ty = (bo.y - p.y) / q; if (!I.down.shoot) keyDown(I, 'shoot'); } else { if (I.down.shoot) keyUp(I, 'shoot'); if (p && bo === p) { I.tx = 1; I.ty = 0; if (s.M.tick % 40 === 0) { keyDown(I, 'pass'); } else if (I.down.pass) keyUp(I, 'pass'); } else { I.tx = 0; I.ty = 0; } } }
    step(s, STEP); s.ev.length = 0; const b2 = s.ball, o = b2.owner;
    { const sc = HUM ? s.M.score[1] : s.M.score[0] + s.M.score[1]; if (sc > sc0) { sc0 = sc; goals++; shots.goal++; } }
    if (s.M.phase !== 'live') { if (team >= 0) close('아웃·파울'); prevOwnerT = -1; continue; }
    if (o) {
      if (o.t !== team) { if (team >= 0) close(prevOwnerT === team ? '태클·몸싸움' : prevKickPass ? '패스 끊김' : '루즈볼 뺏김'); team = o.t; maxX = 0; shot = false; }
      const x = wx(o.x, o.t); if (Math.abs(o.y - CY) < 20.2 || x <= 88.5) maxX = Math.max(maxX, x); else maxX = Math.max(maxX, Math.min(x, 88));
      if (!HUM || o.t === 1) { if (x > 88.5 && Math.abs(o.y - CY) < 20.2) carry.boxT += STEP; else if (x > 70) carry.thirdT += STEP; }
      prevOwnerT = o.t;
    } else {
      if (prevOwnerT >= 0) prevKickPass = !!b2.passTarget; prevOwnerT = -1;
      if (b2.isShot && b2.shot !== lastShot && b2.kicker) { lastShot = b2.shot; const k = b2.kicker; if (HUM && k.t !== 1) { if (k.t === team) shot = true; continue; } const dG = Math.hypot(wx(k.x, k.t) - 105, k.y - CY); shots.n++; shots.dist.push(dG); if (wx(k.x, k.t) > 88.5 && Math.abs(k.y - CY) < 20.2) shots.box++; if (k.t === team) shot = true; }
    }
  }
  shots.onT += (HUM ? 0 : s.M.stats.onT[0]) + s.M.stats.onT[1];
}
const TM = HUM ? 1 : 2, per = (v: number) => (v / games / TM).toFixed(1), pc = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '-';
const sd = shots.dist.sort((x, y) => x - y);
console.log(`${games}경기${HUM ? ' (사람 팀 상대 AI의 공격)' : ''} · 팀당 경기당: 소유 연속 ${per(zone.seq)} · 하프라인 넘음 ${per(zone.half)} · 공격 진영(70m+) ${per(zone.third)} · 박스 진입 ${per(zone.box)} · 슈팅 ${per(shots.n)} (박스 안 ${per(shots.box)}, 유효 ${per(shots.onT)}) · 골 ${per(goals)}`);
console.log(`슛 거리: 중앙값 ${sd[sd.length >> 1]?.toFixed(0)}m · 25% ${sd[sd.length >> 2]?.toFixed(0)}m · 75% ${sd[(sd.length * 3) >> 2]?.toFixed(0)}m · 골/슛 ${pc(shots.goal, shots.n)} · 공격 진영에서 공 가진 시간 팀당 ${(carry.thirdT / games / TM).toFixed(0)}s, 박스 안 ${(carry.boxT / games / TM).toFixed(1)}s`);
for (const z of ['mid', 'third', 'box']) { const e = endIn[z], tot = Object.values(e).reduce((x, y) => x + y, 0); console.log(`  ${z === 'mid' ? '70m 못 가고' : z === 'third' ? '공격 진영까지' : '박스까지'} 간 ${tot}번이 끝난 이유: ` + Object.entries(e).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${pc(v, tot)}`).join(' · ')); }
