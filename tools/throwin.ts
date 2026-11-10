/* 스로인 시험: 사람 팀(스틱만 앞으로) vs AI. 스로인마다 던지기 전 이동 거리·든 높이·던지기까지 시간·결과. 사용: npx tsx tools/throwin.ts [--press] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import type { Player } from '../src/sim/types';
applySquadStrength();
const PRESS = process.argv.includes('--press');
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const r = { hN: 0, hMove: 0, hZ: 0, hT: 0, hGot: 0, hOpp: 0, hOut: 0, aN: 0, aT: 0, aGot: 0, aOpp: 0, aOut: 0, offs: 0 };
const SEEDS = process.argv.includes('--seeds') ? +process.argv[process.argv.indexOf('--seeds') + 1] : 8;
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = createMatch({ teams: [A, B], len: 300, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed, squads: [squadOf(A), squadOf(B)] });
  const I = s.INP[0], h = s.HU[0]!; let th: Player | null = null, x0 = 0, y0 = 0, tt = 0, mv = 0, zmin = 9, wait: { t: number; hum: boolean } | null = null, wt = 0, down = 0;
  const offs0 = () => s.M.stats.offs[0] + s.M.stats.offs[1]; let of0 = 0;
  while (s.M.phase !== 'full') {
    const p = h.ctrl, b = s.ball;
    I.tx = 1; I.ty = p ? Math.sign(34 - p.y) * 0.5 : 0; // 스틱은 늘 밀고 있다 (스로인 중 움직이면 안 됨)
    if (down > 0 && --down === 0) keyUp(I, 'pass');
    if (!th && s.M.throwIn) { th = s.M.throwIn; x0 = th.x; y0 = th.y; tt = 0; mv = 0; zmin = 9; of0 = offs0(); }
    if (th) {
      if (s.M.throwIn === th) { if (s.M.phase === 'live') { tt += STEP; mv = Math.max(mv, Math.hypot(th.x - x0, th.y - y0)); zmin = Math.min(zmin, b.z); if (PRESS && th.t === 0 && tt > 0.8 && down === 0 && !I.down.pass) { keyDown(I, 'pass'); down = 3; } } }
      else { const hum = th.t === 0; if (hum) { r.hN++; r.hMove = Math.max(r.hMove, mv); r.hZ += zmin; r.hT += tt; } else { r.aN++; r.aT += tt; } wait = { t: th.t, hum }; wt = 0; th = null; }
    }
    if (wait) { wt += STEP; const done = b.owner ? (b.owner.t === wait.t ? 'got' : 'opp') : (s.M.phase !== 'live' || wt > 5) ? 'out' : null; if (done) { const k = (wait.hum ? 'h' : 'a') + (done === 'got' ? 'Got' : done === 'opp' ? 'Opp' : 'Out') as keyof typeof r; r[k]++; if (offs0() > of0) r.offs++; wait = null; } }
    step(s, STEP); s.ev.length = 0;
  }
}
console.log(`사람 팀 스로인 ${r.hN}번${PRESS ? ' (0.8초 뒤 패스 키)' : ' (키 안 누름)'}: 던지기 전 최대 이동 ${r.hMove.toFixed(2)}m · 든 높이 ${(r.hZ / (r.hN || 1)).toFixed(2)}m · 던지기까지 ${(r.hT / (r.hN || 1)).toFixed(1)}s · 우리 편 ${r.hGot} · 상대 ${r.hOpp} · 아웃/기타 ${r.hOut}`);
console.log(`AI 스로인 ${r.aN}번: 던지기까지 ${(r.aT / (r.aN || 1)).toFixed(1)}s · 우리 편 ${r.aGot} · 상대 ${r.aOpp} · 아웃/기타 ${r.aOut} | 스로인 직후 오프사이드 ${r.offs}`);
