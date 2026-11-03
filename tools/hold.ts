/* 드리블 유지 시험: 수비 한 명이 바로 앞에 붙은 상태에서 공을 얼마나 오래 지키는가 (still 정지·away 수비 반대로 걷기·side 옆으로 달리기·into 수비 쪽 직진). 사용: npx tsx tools/hold.ts */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { STEP, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { mulberry32 } from '../src/sim/rng';
applySquadStrength();
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const rnd = mulberry32(11);
function trial(mode: string, who: number, defIdx: number) {
  const s = createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: (rnd() * 1e9) >>> 0, squads: [squadOf(A), squadOf(B)] });
  const I = s.INP[0], h = s.HU[0]!; s.M.phase = 'live'; s.M.protect = 0; s.M.react[1] = 0;
  for (const q of s.players) { q.x = q.t === 0 ? 8 : 100; q.y = 5 + (q.i * 5) % 58; q.vx = q.vy = 0; q.sta = 1; }
  const p = s.team[0][who], o = s.team[1][defIdx]; p.x = 52; p.y = CY; p.dir = 0; o.x = 53.2; o.y = CY + (rnd() - 0.5) * 1.5; // 수비는 바로 앞
  placeBall(s, p.x + 0.8, p.y); s.ball.owner = p; h.ctrl = p;
  let t = 0;
  while (t < 8) {
    const ang = Math.atan2(o.y - p.y, o.x - p.x); // 수비 방향
    if (mode === 'still') { I.tx = 0; I.ty = 0; }
    else if (mode === 'away') { I.tx = -Math.cos(ang) * 0.55; I.ty = -Math.sin(ang) * 0.55; } // 수비 반대로 천천히
    else if (mode === 'side') { I.tx = -Math.sin(ang); I.ty = Math.cos(ang); } // 옆으로 달리기
    else if (mode === 'into') { I.tx = 1; I.ty = 0; } // 수비 쪽으로 직진
    step(s, STEP); s.ev.length = 0; t += STEP;
    if (s.ball.owner !== p && !(s.ball.knock === p)) break;
    if (s.ball.owner && s.ball.owner.t === 1) break;
  }
  return t;
}
for (const mode of ['still', 'away', 'side', 'into']) {
  const res: number[] = []; for (let k = 0; k < 40; k++) res.push(trial(mode, 9, 3 + (k % 4))); // 손흥민(9) vs 수비수들
  res.sort((a, b) => a - b); const kept = res.filter(v => v >= 8).length;
  console.log(`${mode.padEnd(5)} 중앙값 ${res[20].toFixed(1)}s · 2초 안 손실 ${res.filter(v => v < 2).length}/40 · 8초 유지 ${kept}/40`);
}
