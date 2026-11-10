/* 입력 시험: 달리기·질주 드리블 중 임의 시점에 키를 눌러 0.8초 안에 킥이 나가는 비율. 사용: npx tsx tools/keys.ts */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { STEP, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp, type Act } from '../src/input/actions';
import { mulberry32 } from '../src/sim/rng';
applySquadStrength();
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const rnd = mulberry32(5);
for (const sprint of [false, true]) for (const act of ['pass', 'through', 'shoot', 'lob', 'chip'] as Act[]) {
  let ok = 0, n = 0; const fails: string[] = [];
  for (let k = 0; k < 60; k++) {
    const s = createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: (rnd() * 1e9) >>> 0, squads: [squadOf(A), squadOf(B)] });
    const I = s.INP[0], h = s.HU[0]!; s.M.phase = 'live'; s.M.protect = 0;
    for (const q of s.players) { if (q.t === 1) { q.x = 102; q.y = 3 + (q.i * 5) % 60; } q.vx = q.vy = 0; }
    const p = s.team[0][7]; p.x = 30; p.y = CY; p.dir = 0; placeBall(s, 30.8, CY); s.ball.owner = p; h.ctrl = p; if (sprint) keyDown(I, 'sprint'); I.tx = 1; I.ty = 0;
    const pressAt = 1.2 + rnd() * 0.6, hold = act === 'shoot' ? 0.3 : 0.05 + rnd() * 0.1; let t = 0, kicked = false, state = '';
    while (t < pressAt + 0.8) {
      if (t >= pressAt && t < pressAt + STEP) { keyDown(I, act); state = `own=${s.ball.owner === p} knock=${s.ball.knock === p} d=${Math.hypot(p.x - s.ball.x, p.y - s.ball.y).toFixed(2)} cd=${p.kickCD.toFixed(2)}`; }
      if (t >= pressAt + hold && t < pressAt + hold + STEP) keyUp(I, act);
      const before = s.ball.shot; step(s, STEP); s.ev.length = 0; t += STEP;
      if (t > pressAt && (s.ball.passTarget || s.ball.isShot || (s.ball.shot !== before && s.ball.knock !== p && s.ball.kicker === p && s.ball.owner !== p))) { kicked = true; break; }
    }
    n++; if (kicked) ok++; else if (fails.length < 3) fails.push(state);
  }
  console.log(`${sprint ? '질주' : '달리기'} + ${act.padEnd(7)}: ${ok}/${n}${fails.length ? '  실패 예: ' + fails.join(' | ') : ''}`);
}
