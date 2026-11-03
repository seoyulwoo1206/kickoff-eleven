/* 드리블 시험: 스틱만 앞으로 밀고(--sprint면 질주) 2분. 골·골 앞 소유 시간·노크온 손실. 사용: npx tsx tools/dribble.ts [seed] [--sprint] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
applySquadStrength();
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const SPR = process.argv.includes('--sprint'), SEED = +(process.argv[2] || 3);
const s = createMatch({ teams: [A, B], len: 120, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: SEED, squads: [squadOf(A), squadOf(B)] });
const I = s.INP[0], h = s.HU[0]!; let t = 0, near = 0, lost = 0, knocks = 0, wasKnock = false;
while (s.M.phase !== 'full') {
  const p = h.ctrl, b = s.ball, own = b.owner;
  if (p && own === p) { if (Math.hypot(W - p.x, CY - p.y) < 22) near++; I.tx = 1; I.ty = (CY - p.y) / 34; if (SPR && !I.down.sprint) keyDown(I, 'sprint'); }
  else if (p && !own && b.knock === p) { if (!wasKnock) knocks++; wasKnock = true; step(s, STEP); s.ev.length = 0; t += STEP; continue; }
  else if (p) { if (wasKnock && own && own.t === 1) lost++; if (I.down.sprint) keyUp(I, 'sprint'); const o = own && own.t === 1 ? own : b; I.tx = Math.sign(o.x - p.x); I.ty = Math.sign(o.y - p.y); }
  wasKnock = false; step(s, STEP); s.ev.length = 0; t += STEP;
}
console.log(`seed ${SEED}${SPR ? ' sprint' : ''}: score ${s.M.score.join(':')} · 골 22m 안 소유 ${(near / 60).toFixed(0)}s${SPR ? ` · 노크온 ${knocks} 손실 ${lost}` : ''}`);
