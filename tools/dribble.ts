/* 드리블 시험: 스틱만 앞으로 밀고(--sprint면 질주) 2분. 골·골 앞 소유 시간·노크온 손실. --chi면 공을 잡을 때마다 치달(가장 가까운 상대 반대쪽 대각선). 사용: npx tsx tools/dribble.ts [seed] [--sprint] [--chi] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
applySquadStrength();
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const CHI = process.argv.includes('--chi'), SPR = process.argv.includes('--sprint') || CHI, SEED = +(process.argv[2] || 3);
const s = createMatch({ teams: [A, B], len: 120, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: SEED, squads: [squadOf(A), squadOf(B)] });
const I = s.INP[0], h = s.HU[0]!; let t = 0, near = 0, lost = 0, knocks = 0, wasKnock = false, ownT = 0;
while (s.M.phase !== 'full') {
  const p = h.ctrl, b = s.ball, own = b.owner;
  if (p && own === p) { if (Math.hypot(W - p.x, CY - p.y) < 22) near++; I.tx = 1; I.ty = (CY - p.y) / 34; if (SPR && !I.down.sprint) keyDown(I, 'sprint');
    if (CHI) { ownT++; if (I.down.switch) keyUp(I, 'switch'); else if (ownT > 12) { let o: typeof p | null = null, od = 9; for (const q of s.team[1]) { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (q.x > p.x - 1 && dd < od) { od = dd; o = q; } } if (o) I.ty = o.y > p.y ? -0.8 : 0.8; keyDown(I, 'switch'); ownT = 0; } } }
  else if (p && !own && b.knock === p) { if (!wasKnock) knocks++; wasKnock = true; step(s, STEP); s.ev.length = 0; t += STEP; continue; }
  else if (p) { if (wasKnock && own && own.t === 1) lost++; if (I.down.sprint) keyUp(I, 'sprint'); const o = own && own.t === 1 ? own : b; I.tx = Math.sign(o.x - p.x); I.ty = Math.sign(o.y - p.y); }
  wasKnock = false; step(s, STEP); s.ev.length = 0; t += STEP;
}
console.log(`seed ${SEED}${SPR ? ' sprint' : ''}: score ${s.M.score.join(':')} · 골 22m 안 소유 ${(near / 60).toFixed(0)}s${SPR ? ` · 노크온 ${knocks} 손실 ${lost}` : ''}`);
