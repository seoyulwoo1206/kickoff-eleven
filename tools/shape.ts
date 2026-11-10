/* 대형 확인: 사람이 공을 한 자리에서 8초간 지킬 때(상대는 못 뺏게 보호) 동료들이 어디로 움직이는지 2초 간격으로 찍는다.
   사용: npx tsx tools/shape.ts [--team KOR] [--opp BRA]   (x는 우리 골에서부터의 거리, y 0~68, *는 침투 중) */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { STEP, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { offsideLine } from '../src/sim/ball';
applySquadStrength();
const argv = process.argv.slice(2), flag = (n: string, def: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : def; };
const A = TEAMS.find(t => t.code === flag('--team', 'KOR'))!, B = TEAMS.find(t => t.code === flag('--opp', 'BRA'))!;
const CASES: [string, number, number, 'MF' | 'FW'][] = [['중원 가운데', 58, CY, 'MF'], ['중원 왼쪽 측면', 60, 10, 'MF'], ['상대 진영 오른쪽 깊숙이', 90, 58, 'MF']];
for (const [label, bx, by, role] of CASES) {
  const s = createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [{ tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 4, squads: [squadOf(A), squadOf(B)] });
  const h = s.HU[0]!; s.M.phase = 'live'; s.M.protect = 0;
  for (let i = 0; i < 240; i++) { step(s, STEP); s.ev.length = 0; if (s.M.phase !== 'live') s.M.phase = 'live'; }
  const cands = s.team[0].filter(q => q.role === role); const p = cands.sort((a, b) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b.x - bx, b.y - by))[0];
  const hold = () => { p.x = bx; p.y = by; p.vx = p.vy = 0; p.stun = 0; p.shield = 1; placeBall(s, bx + 0.8, by); s.ball.owner = p; s.ball.knock = null; s.ball.passTarget = null; h.ctrl = p; s.M.phase = 'live'; };
  hold(); console.log(`\n=== ${label}: ${p.pos} ${p.name}가 (${bx}, ${by.toFixed(0)})에서 공을 지킴`);
  const show = (tt: number) => {
    const row = (r: string) => s.team[0].filter(q => q.role === r && q !== p).map(q => `${q.pos}(${q.x.toFixed(0)},${q.y.toFixed(0)})${q.runT > 0 ? '*' : ''}`).join(' ');
    console.log(`${tt}초  라인 ${offsideLine(s, 0).toFixed(0)} | 수비 ${row('DF')} | 미드 ${row('MF')} | 공격 ${row('FW')}`);
  };
  show(0);
  for (let k = 1; k <= 4; k++) { for (let i = 0; i < 120; i++) { hold(); step(s, STEP); s.ev.length = 0; } show(k * 2); }
}
