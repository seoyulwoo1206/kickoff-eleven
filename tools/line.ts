/* 수비 라인 깊이 시험. 사용: npx tsx tools/line.ts
   수비 라인 깊이: 공 위치(수비 팀 골에서부터의 거리)별로 수비 4명의 평균 위치(자기 골에서부터 m). 사람(스크립트: 공 잡으면 천천히 전진) vs AI, AI vs AI */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
applySquadStrength();
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
for (const human of [true, false]) {
  const acc = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ n: 0, df: 0, min: 0 })));
  for (let g = 0; g < 3; g++) {
    const s = createMatch({ teams: [A, B], len: 240, diff: 'normal', tempo: 1, firstKick: g & 1, humans: [human ? { tag: 'P1', col: '#fff', cursor: 'manual' } : null, null], net: false, seed: 50 + g, squads: [squadOf(A), squadOf(B)] });
    const I = s.INP[0]; let i = 0;
    while (s.M.phase !== 'full') {
      const h = s.HU[0];
      if (h && h.ctrl) { const p = h.ctrl, own = s.ball.owner === p; const tx = own ? W : s.ball.x, ty = own ? CY : s.ball.y, dx = tx - p.x, dy = ty - p.y, q = Math.hypot(dx, dy) || 1; I.tx = dx / q * (own ? 0.45 : 1); I.ty = dy / q * (own ? 0.45 : 1); }
      step(s, STEP); s.ev.length = 0;
      if (++i % 20 === 0 && s.M.phase === 'live' && s.ball.owner) for (const t of [0, 1]) {
        if (s.ball.owner.t === t) continue; // 수비 중인 팀만
        const bd = t === 0 ? s.ball.x : W - s.ball.x, zone = bd < 25 ? 0 : bd < 45 ? 1 : bd < 65 ? 2 : 3, dfs = s.team[t].filter(p => p.role === 'DF' && !p.off).map(p => t === 0 ? p.x : W - p.x);
        const S = acc[t][zone]; S.n++; S.df += dfs.reduce((a, b) => a + b, 0) / dfs.length; S.min += Math.min(...dfs);
      }
    }
  }
  const zn = ['공이 자기 골 25m 안', '25~45m', '45~65m', '65m 밖'];
  console.log(human ? '== 사람(KOR, 공 잡으면 천천히 전진) vs AI(BRA)' : '== AI vs AI');
  for (const t of [0, 1]) console.log(`  ${t === 0 ? 'KOR' : 'BRA'} 수비 라인(자기 골에서 m): ` + acc[t].map((S, z) => `${zn[z]} → 평균 ${(S.df / Math.max(1, S.n)).toFixed(0)}m·맨 뒤 ${(S.min / Math.max(1, S.n)).toFixed(0)}m (n=${S.n})`).join(' | '));
}
