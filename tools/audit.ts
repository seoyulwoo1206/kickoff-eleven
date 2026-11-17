/* 플레이 감사: 사람처럼 조작하는 간단한 스크립트(패스·스루·크로스·슛·압박)로 AI와 경기를 돌리며 이상한 장면을 찾는다.
   세트피스 횟수와 그 뒤 소유, 골 기록(거리·헤딩), 멈춤·공 방치·몰림·커서가 먼 선수에 묶임·NaN 같은 이상 징후를 센다.
   사용: npx tsx tools/audit.ts [--n 8] [--len 300] [--ai] (--ai는 AI끼리) */
import { TEAMS } from '../src/data/teams';
import { createMatch, step } from '../src/sim/match';
import { STEP, W, H, CY } from '../src/sim/consts';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import type { Player } from '../src/sim/types';
applySquadStrength();
const arg = (k: string, dflt: number) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : dflt; };
const N = arg('--n', 8), LEN = arg('--len', 300), AI = process.argv.includes('--ai');
const cnt: Record<string, number> = {}; const inc = (k: string, v = 1) => { cnt[k] = (cnt[k] || 0) + v; };
const notes: string[] = []; const note = (m: string) => { if (notes.length < 40) notes.push(m); };
const goals: string[] = [];
for (let g = 0; g < N; g++) {
  const a = TEAMS[(g * 5) % TEAMS.length], b = TEAMS[(g * 7 + 3) % TEAMS.length]; if (a === b) continue; inc('경기');
  const s = createMatch({ teams: [a, b], len: LEN, diff: 'normal', tempo: 1, firstKick: g % 2, humans: [AI ? null : { tag: 'P1', col: '#fff', cursor: 'manual' }, null], net: false, seed: 7000 + g, squads: [squadOf(a), squadOf(b)] });
  const I = s.INP[0], h = s.HU[0], bl = s.ball; let t = 0, lastPhase = '', spT = -1, spType = '', spTeam = -1, idleT = 0, holdT = 0, holder: Player | null = null, crowdT = 0, farT = 0, airT = 0, act = 0, sc = [0, 0], lastShot: { d: number; head: boolean; t: number; who: string } | null = null, shotId = -1, deadT = 0, rel = 0, relKey: 'pass' | 'lob' | 'through' | 'shoot' = 'pass', liveSince = 0, kickoffAt = -1, koTeam = -1;
  let sp0: { p: Player; t: number; nd: number; shot: number } | null = null;
  const tag = () => `[${a.code}-${b.code} ${(s.M.time / s.M.len * 90).toFixed(0)}']`;
  while (s.M.phase !== 'full' && t < LEN * 3) {
    // ── 조작 스크립트 (사람 팀) ──
    if (h) {
      const p = h.ctrl; I.tx = 0; I.ty = 0;
      if (rel > 0 && --rel === 0) keyUp(I, relKey);
      if (p && s.M.phase === 'live') {
        if (bl.owner === p) {
          if (I.down.shoot && rel === 0) keyUp(I, 'shoot'); // 수비 때 누르던 압박 키
          const gx = W - p.x, gy = CY - p.y, dG = Math.hypot(gx, gy); act++;
          I.tx = gx / dG; I.ty = gy / dG * 0.6; const sp = s.M.setTaker === p && s.M.setAim; if (sp) { I.tx = 0; I.ty = 0; }
          let nd = 99; for (const o of s.team[1]) nd = Math.min(nd, Math.hypot(o.x - p.x, o.y - p.y));
          const ms = s.team[0].filter(m => m !== p && m.role !== 'GK' && !m.off && m.x > p.x - 4).sort((x, y) => (y.x - x.x));
          const fwd = ms.find(m => Math.hypot(m.x - p.x, m.y - p.y) < 26 && Math.hypot(m.x - p.x, m.y - p.y) > 5);
          if (rel === 0 && p.kickWind <= 0 && !p.pending && !I.down.pass && !I.down.lob && !I.down.shoot && !I.down.through) {
            if (sp) { if (s.M.setT > 0.6) { relKey = s.M.aimX > W - 6 ? 'shoot' : s.M.spType === 'corner' ? 'lob' : 'pass'; keyDown(I, relKey); rel = relKey === 'shoot' ? 33 : relKey === 'lob' ? 12 : 3; } } // 세트피스: 조준점 그대로 — 코너킥 롱패스, 골문 조준이면 슛, 나머지는 짧게
            else if (s.M.throwIn === p) { if (s.M.throwT > 0.8) { relKey = 'pass'; keyDown(I, relKey); rel = 3; } }
            else if (dG < 19 && Math.abs(gy) < 14) { I.ty = 0; relKey = 'shoot'; keyDown(I, relKey); rel = 18; inc('슛 누름'); sp0 = { p, t, nd, shot: bl.shot }; }
            else if (p.x > 80 && Math.abs(p.y - CY) > 15 && act > 20) { relKey = 'lob'; keyDown(I, relKey); rel = 10; inc('크로스 누름'); act = 0; }
            else if ((nd < 3 || act > 70) && fwd) { const q = Math.hypot(fwd.x - p.x, fwd.y - p.y); I.tx = (fwd.x - p.x) / q; I.ty = (fwd.y - p.y) / q; relKey = (g + (act | 0)) % 3 === 0 ? 'through' : 'pass'; keyDown(I, relKey); rel = 4; act = 0; }
            else if (act > 150) { relKey = 'lob'; keyDown(I, relKey); rel = 14; act = 0; inc('롱패스 누름'); }
          }
        } else { act = 0; const o = bl.owner && bl.owner.t === 1 ? bl.owner : bl; const q = Math.hypot(o.x - p.x, o.y - p.y) || 1; I.tx = (o.x - p.x) / q; I.ty = (o.y - p.y) / q; if (bl.owner && bl.owner.t === 1) { if (!I.down.shoot && rel === 0) keyDown(I, 'shoot'); } else if (I.down.shoot && rel === 0) keyUp(I, 'shoot'); }
      }
    }
    step(s, STEP); t += STEP; s.ev.length = 0;
    const M = s.M, o = bl.owner;
    if (sp0) { const k = sp0.nd < 2 ? ' (누를 때 상대 2m 안)' : sp0.nd < 4 ? ' (2~4m)' : ' (4m 밖)'; if (bl.isShot && bl.kicker === sp0.p && bl.shot !== sp0.shot) { inc('슛 나감' + k); sp0 = null; } else if (o && o.t === 1) { if (process.argv.includes('--dbg')) note(`${tag()} 슛 누르고 ${(t - sp0.t).toFixed(2)}초 뒤 ${o.role}에게 뺏김: 슈터 shield ${sp0.p.shield.toFixed(2)} stun ${sp0.p.stun.toFixed(2)} kickCD ${sp0.p.kickCD.toFixed(2)} 거리 ${Math.hypot(o.x - sp0.p.x, o.y - sp0.p.y).toFixed(1)} charging ${h!.charging} 공kicker ${bl.kicker === sp0.p ? '슈터' : bl.kicker ? bl.kicker.role + bl.kicker.t : '-'} knock ${bl.knock ? 'y' : 'n'}`); inc('슛 전에 뺏김' + k); inc(`뺏긴 시점 ${(t - sp0.t) < 0.2 ? '0.2초 안' : (t - sp0.t) < 0.4 ? '0.2~0.4초' : '0.4초 뒤'}`); sp0 = null; } else if (t - sp0.t > 1.2 || M.phase !== 'live') { inc('슛 안 나감(기타)' + k); sp0 = null; } }
    // ── 기록·이상 징후 ──
    for (const p of s.players) if (!(p.x === p.x) || !(p.y === p.y) || Math.abs(p.x) > 200) { note(`${tag()} 선수 좌표 이상 ${p.x},${p.y}`); inc('NaN'); }
    if (!(bl.x === bl.x) || !(bl.z === bl.z)) { note(`${tag()} 공 좌표 NaN`); inc('NaN'); break; }
    if (M.phase !== lastPhase) {
      if (M.phase === 'setpiece') { spT = t; spType = M.spType || '?'; spTeam = o ? o.t : -1; inc('세트피스 ' + spType); }
      if (M.phase === 'kickoff') { kickoffAt = t; koTeam = o ? o.t : bl.lastTouch; }
      if (M.phase === 'live') liveSince = t;
      lastPhase = M.phase;
    }
    if (M.score[0] + M.score[1] > sc[0] + sc[1]) { const tm = M.score[0] > sc[0] ? 0 : 1; sc = [M.score[0], M.score[1]]; goals.push(`${tag()} ${[a, b][tm].code} ${lastShot && t - lastShot.t < 6 ? `${lastShot.d.toFixed(0)}m ${lastShot.head ? '헤딩' : '슛'} (${lastShot.who})` : '슛 기록 없음(몰고 들어감·자책?)'}${kickoffAt > 0 && t - kickoffAt < 12 ? ' ★킥오프 12초 안' : ''}`); inc(tm === 0 && h ? '골 사람팀' : 'AI 골'); if (lastShot && lastShot.head && t - lastShot.t < 6) inc('헤딩 골'); }
    if (bl.isShot && bl.shot !== shotId && bl.kicker) { shotId = bl.shot; const k = bl.kicker, gx = k.t === 0 ? W : 0; lastShot = { d: Math.hypot(gx - k.x, CY - k.y), head: bl.z > 1.2, t, who: k.role }; inc(bl.z > 1.2 ? '헤딩슛' : '슛'); }
    if (M.phase !== 'live') { deadT += STEP; idleT = 0; holdT = 0; continue; }
    // 세트피스 뒤 첫 소유
    if (spT >= 0 && o && t - spT > 1.2 && o !== holder && spTeam >= 0) { if (o.t !== spTeam) inc(`세트피스 ${spType} 뒤 상대가 먼저`); spT = -1; }
    if (spT >= 0 && t - spT > 9) { note(`${tag()} 세트피스 ${spType} 9초 넘게 진행 안 됨 (owner ${o ? o.role + o.t : '없음'})`); inc('세트피스 지연'); spT = -1; }
    // 공 방치·오래 들고 있기
    if (!o) { if (Math.hypot(bl.vx, bl.vy) < 0.6 && bl.z < 0.2) idleT += STEP; else idleT = 0; if (idleT > 2.5) { let nd = 99; for (const p of s.players) nd = Math.min(nd, Math.hypot(p.x - bl.x, p.y - bl.y)); note(`${tag()} 공이 2.5초 넘게 멈춰 있음 (${bl.x.toFixed(0)},${bl.y.toFixed(0)}) 가장 가까운 선수 ${nd.toFixed(1)}m`); inc('공 방치'); idleT = -5; } airT = bl.z > 0.5 ? airT + STEP : 0; if (airT > 4) { note(`${tag()} 공이 4초 넘게 공중에`); inc('공중 체류'); airT = -5; } holder = null; holdT = 0; }
    else {
      idleT = 0; airT = 0; if (o === holder) holdT += STEP; else { holder = o; holdT = 0; }
      const lim = o.role === 'GK' ? 3 : (h && o.t === 0) ? 99 : 9;
      if (holdT > lim) { note(`${tag()} ${o.t === 0 ? a.code : b.code} ${o.role}가 공을 ${lim}초 넘게 들고 있음 (${o.x.toFixed(0)},${o.y.toFixed(0)}) 속도 ${Math.hypot(o.vx, o.vy).toFixed(1)}`); inc(o.role === 'GK' ? '키퍼 오래 보유' : 'AI 오래 보유'); holdT = -30; }
    }
    if (bl.x < -2 || bl.x > W + 2 || bl.y < -2 || bl.y > H + 2) { if (!M.throwIn) { note(`${tag()} 경기 중 공이 경기장 밖 (${bl.x.toFixed(1)},${bl.y.toFixed(1)})`); inc('공 밖'); } }
    let near = 0; for (const p of s.players) if (!p.off && Math.hypot(p.x - bl.x, p.y - bl.y) < 4) near++; crowdT = near >= 7 ? crowdT + STEP : 0; if (crowdT > 2) { note(`${tag()} 공 4m 안에 ${near}명이 2초 넘게 몰림 (${bl.x.toFixed(0)},${bl.y.toFixed(0)})`); inc('몰림'); crowdT = -8; }
    if (h && h.ctrl && o && o.t === 1) { farT = Math.hypot(h.ctrl.x - bl.x, h.ctrl.y - bl.y) > 28 ? farT + STEP : 0; if (farT > 4) { note(`${tag()} 수비 중 커서 선수가 공에서 28m 넘게 4초 (${h.ctrl.role})`); inc('커서 멀리'); farT = -10; } } else farT = 0;
    for (const p of s.players) if (!p.off && (p.y < -2.2 || p.y > H + 2.2 || p.x < -2.4 || p.x > W + 2.4) && M.throwIn !== p) { inc('선수 경기장 밖 틱'); }
  }
  inc('죽은 시간(초)', Math.round(deadT)); inc('경기 시간(초)', Math.round(t)); inc('파울', s.M.stats.fouls[0] + s.M.stats.fouls[1]); inc('오프사이드', s.M.stats.offs[0] + s.M.stats.offs[1]); inc('경고', s.M.stats.yel[0] + s.M.stats.yel[1]); inc('퇴장', s.M.stats.red[0] + s.M.stats.red[1]);
  if (h) { const I2 = I; for (const k of ['pass', 'lob', 'through', 'shoot'] as const) if (I2.down[k]) keyUp(I2, k); }
}
const G = cnt['경기'] || 1;
console.log(`${G}경기 (${AI ? 'AI끼리' : '사람 스크립트 vs AI'}) 경기당: ` + Object.entries(cnt).filter(([k]) => k !== '경기').map(([k, v]) => `${k} ${(v / G).toFixed(1)}`).join(' · '));
console.log('── 골 ──'); console.log(goals.join('\n') || '(없음)');
console.log('── 이상 징후 ──'); console.log(notes.join('\n') || '(없음)');
