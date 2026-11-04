/* 가로채기 시험: 패스 선로 옆에 선 수비수가 지나가는 공을 끊는가.
   A) AI 수비수: 선로에서 옆으로 L m, 공 속도 v. 받는 동료는 22m 앞. 수비수가 먼저 잡으면 성공
   B) 사람 커서 수비수: 선로 옆 L m에서 스틱을 공 쪽으로 밀고 압박(pass) 홀드
   사용: npx tsx tools/intercept.ts [--n 40] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { STEP, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { kick } from '../src/sim/ball';
import { keyDown } from '../src/input/actions';
import { mulberry32 } from '../src/sim/rng';
import type { Player } from '../src/sim/types';
applySquadStrength();
const argv = process.argv.slice(2), N = +(argv[argv.indexOf('--n') + 1] || 40);
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const rnd = mulberry32(21);

function trial(mode: 'ai' | 'human', off: number, v: number, defIdx: number) {
  const s = createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [null, mode === 'human' ? { tag: 'P2', col: '#fff', cursor: 'manual' } : null], net: false, seed: (rnd() * 1e9) >>> 0, squads: [squadOf(A), squadOf(B)] });
  s.M.phase = 'live'; s.M.protect = 0;
  for (const q of s.players) { q.x = q.t === 0 ? 5 : 100; q.y = 3 + (q.i * 5) % 60; q.vx = q.vy = 0; q.sta = 1; }
  const p = s.team[0][7], m = s.team[0][9], o = s.team[1][defIdx];
  p.x = 40; p.y = CY; p.dir = 0; m.x = 62; m.y = CY; m.dir = Math.PI; m.vx = m.vy = 0;
  const side = rnd() < 0.5 ? 1 : -1; o.x = 50 + (rnd() - 0.5) * 2; o.y = CY + side * off; o.dir = Math.PI; o.vx = o.vy = 0; o.tackleCD = 0; o.stun = 0; o.kickCD = 0;
  placeBall(s, 40.8, CY); s.ball.owner = p;
  const h = s.HU[1]; if (h) { h.ctrl = o; }
  kick(s, p, v, (rnd() - 0.5) * 0.4, 0); s.ball.passTarget = m; s.M.react[1] = 0; // AI는 반응 지연 없이 (순수 판정)
  let t = 0, who: Player | null = null;
  while (t < 2.5) {
    if (h) { const I = s.INP[1]; const dx = s.ball.x - o.x, dy = s.ball.y - o.y, q = Math.hypot(dx, dy) || 1; I.tx = dx / q; I.ty = dy / q; if (q < 2.5 && !I.down.pass) keyDown(I, 'pass'); }
    step(s, STEP); s.ev.length = 0; t += STEP;
    if (s.ball.owner) { who = s.ball.owner; break; }
    if (s.ball.x > 70 || s.M.phase !== 'live') break;
  }
  return who === o ? 'int' : who && who.t === 1 ? 'opp' : who === m ? 'mate' : who ? 'other' : 'none';
}
for (const mode of ['ai', 'human'] as const) {
  console.log(`--- ${mode === 'ai' ? 'AI 수비수 (반응 지연 0)' : '사람 커서 수비수 (공 쪽으로 스틱 + 압박)'}`);
  for (const v of [14, 20, 26]) {
    const row: string[] = [];
    for (const off of [0.5, 1.0, 1.5, 2.5, 3.5]) { let ok = 0; for (let k = 0; k < N; k++) if (trial(mode, off, v, 3 + (k % 4)) === 'int') ok++; row.push(`${off}m ${(ok / N * 100).toFixed(0)}%`); }
    console.log(`공 ${v}m/s: ${row.join(' · ')}`);
  }
}
