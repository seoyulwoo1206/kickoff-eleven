/* 진단: 공격이 왜 어려운가를 세 가지로 잰다.
   1) 1대1 드리블: 수비수 한 명을 여러 방법(직진·방향 전환·헛다리·멈췄다 가기)으로 제칠 수 있는가 (2m 앞선 채 0.5초)
   2) 패스 분포: 땅볼 패스의 거리·초기 속도 (AI와 사람 탭 패스) — 운동장을 가르는 긴 땅볼이 얼마나 나오는가
   3) 압박: 중원에서 공을 잡은 뒤 상대가 2m 안에 붙기까지 걸리는 시간, 뺏기기까지 시간, 앞을 막은 상대 수
   사용: npx tsx tools/diagnose.ts [--n 60] [--only 1|2|3] */
import { TEAMS } from '../src/data/teams';
import { createMatch, step, placeBall } from '../src/sim/match';
import { STEP, W, CY } from '../src/sim/consts';
import { d } from '../src/sim/util';
import { squadOf, applySquadStrength } from '../src/data/squads';
import { keyDown, keyUp } from '../src/input/actions';
import { mulberry32 } from '../src/sim/rng';
import type { Sim, Player } from '../src/sim/types';
applySquadStrength();
const argv = process.argv.slice(2), flag = (n: string, def: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : def; };
const N = +flag('--n', '60'), ONLY = flag('--only', '');
const A = TEAMS.find(t => t.code === 'KOR')!, B = TEAMS.find(t => t.code === 'BRA')!;
const rnd = mulberry32(77);
const mk = (human: boolean, seed: number) => createMatch({ teams: [A, B], len: 600, diff: 'normal', tempo: 1, firstKick: 0, humans: [human ? { tag: 'P1', col: '#fff', cursor: 'manual' } : null, null], net: false, seed, squads: [squadOf(A), squadOf(B)] });
const pct = (a: number, b: number) => b ? `${(a / b * 100).toFixed(0)}%` : '-';

/* ---------- 1) 1대1 드리블 ---------- */
if (!ONLY || ONLY === '1') {
  const MODES = ['직진', '직진 + 질주', '방향 전환(45°)', '방향 전환 + 질주', '헛다리 후 전환', '멈췄다 가기'] as const;
  console.log('== 1대1 드리블: 공을 가진 채 수비수보다 2m 넘게 앞선 상태를 0.5초 유지하면 돌파 (6초 안)'); for (const i of [9, 6]) { const q = mk(false, 1).team[0][i]; console.log(`  (${q.name} ${q.pos} 속도 ${q.attrs.spd} 민첩 ${q.attrs.agi} 볼컨 ${q.attrs.ctl} 개인기 ${q.skill})`); }
  for (const who of [[9, '공격수'], [6, '미드필더']] as const) for (const mode of MODES) {
    let ok = 0, lost = 0, tsum = 0, bites = 0; const why: Record<string, number> = {};
    for (let k = 0; k < N; k++) {
      const s = mk(true, (rnd() * 1e9) >>> 0), I = s.INP[0], h = s.HU[0]!; s.M.phase = 'live'; s.M.protect = 0;
      const p = s.team[0][who[0]], o = s.team[1][2 + (k % 4)], gk = s.team[1][0];
      const park = () => { for (const q of s.players) { if (q === p || q === o || q === gk) continue; q.x = q.t === 0 ? 2 : 3; q.y = 2 + q.i * 2.5; q.vx = q.vy = 0; } };
      park(); p.x = 40; p.y = CY + (rnd() - 0.5) * 8; p.dir = 0; p.vx = p.vy = 0; o.x = 52; o.y = p.y + (rnd() - 0.5) * 3; o.vx = o.vy = 0; o.tackleCD = 0; o.bodyCD = 0;
      placeBall(s, p.x + 0.8, p.y); s.ball.owner = p; h.ctrl = p;
      let t = 0, phase = 0, t1 = 0, side = rnd() < 0.5 ? 1 : -1, res = '', bit = false, pastT = 0;
      while (t < 6) {
        park(); const q = d(p, o), gdx = W - p.x, gdy = (CY - p.y) * 0.3, gl = Math.hypot(gdx, gdy) || 1; let sx = gdx / gl, sy = gdy / gl, sprint = false, mag = 1;
        if (mode === '직진 + 질주') sprint = true;
        if (mode !== '직진' && mode !== '직진 + 질주') {
          if (phase === 0 && q < (mode === '헛다리 후 전환' ? 3.6 : 4.2)) { phase = 1; t1 = t; if (mode === '헛다리 후 전환') { keyDown(I, 'gkRush'); } }
          if (phase === 1) {
            if (mode === '헛다리 후 전환' && t - t1 > 0.05) keyUp(I, 'gkRush');
            if (mode === '멈췄다 가기') { if (t - t1 < 0.35) { mag = 0; } else { const a = 0.75 * side; sx = Math.cos(a); sy = Math.sin(a); sprint = true; if (t - t1 > 1.3) phase = 2; } }
            else { const a = (mode === '헛다리 후 전환' ? 0.95 : 0.8) * side; sx = Math.cos(a); sy = Math.sin(a); sprint = mode !== '방향 전환(45°)'; if (t - t1 > 0.9) phase = 2; }
          } else if (phase === 2) sprint = mode !== '방향 전환(45°)';
        }
        I.tx = sx * mag; I.ty = sy * mag; if (sprint && !I.down.sprint) keyDown(I, 'sprint'); if (!sprint && I.down.sprint) keyUp(I, 'sprint');
        const wasOwn = s.ball.owner === p, st0 = o.stun; step(s, STEP); s.ev.length = 0; t += STEP;
        const own = s.ball.owner; if (o.stun > st0 + 0.1 && !bit) { bit = true; bites++; }
        if (own && own.t === 1) { res = 'lost'; const c = !wasOwn ? '차 놓은 공을 뺏김' : o.bodyCD > 0.5 ? '몸싸움' : o.tackleCD > 0.4 ? '태클' : '기타'; why[c] = (why[c] || 0) + 1; break; }
        if (!own && s.ball.knock !== p && d(p, s.ball) > 4) { res = 'lost'; break; }
        if (p.x > o.x + 2 && (own === p || s.ball.knock === p)) { pastT += STEP; if (pastT > 0.5) { res = 'ok'; break; } } else pastT = 0;
        if (s.M.phase !== 'live') { res = 'dead'; break; }
      }
      if (res === 'ok') { ok++; tsum += t; } else if (res === 'lost') lost++;
    }
    console.log(`  ${who[1]} ${mode.padEnd(12)}: 돌파 ${pct(ok, N)} · 뺏김 ${pct(lost, N)} · 그 외(막힘) ${pct(N - ok - lost, N)}${ok ? ` · 돌파까지 ${(tsum / ok).toFixed(1)}s` : ''} · 수비가 속은 횟수 ${bites} · 뺏긴 이유 ${Object.entries(why).map(([k, v]) => k + ' ' + v).join(', ') || '-'}`);
  }
}

/* ---------- 2) 패스 분포 ---------- */
if (!ONLY || ONLY === '2') {
  console.log('== 패스 분포 (땅볼 패스의 거리와 초기 속도)');
  for (const human of [false, true]) {
    const rec: { q: number; v: number; loft: boolean; t: number; ok: boolean | null }[] = [];
    for (let g = 0; g < 3; g++) {
      const s = mk(human, 100 + g), I = s.INP[0]; s.M.len = 240; let last = s.ball.shot, cur: typeof rec[number] | null = null, curTarget: Player | null = null, holdT = 0, pressT = -1, tt = 0;
      while (s.M.phase !== 'full') {
        const h = s.HU[0];
        if (h && h.ctrl) { const p = h.ctrl, own = s.ball.owner === p; // 사람: 공 잡으면 0.5초 뒤 가장 가까운 앞쪽 동료를 조준해 탭 패스
          if (own) { holdT += STEP; let best: Player | null = null, bd = 1e9; for (const m of s.team[0]) { if (m === p || m.role === 'GK') continue; const q = d(m, p); if (m.x > p.x + 2 && q < bd) { bd = q; best = m; } }
            const tx = best ? best.x - p.x : 1, ty = best ? best.y - p.y : 0, L = Math.hypot(tx, ty) || 1; I.tx = tx / L; I.ty = ty / L;
            if (holdT > 0.5 && pressT < 0) { keyDown(I, 'pass'); pressT = tt; } if (pressT >= 0 && tt - pressT > 0.06) { keyUp(I, 'pass'); pressT = -1; holdT = 0; }
          } else { holdT = 0; if (pressT >= 0) { keyUp(I, 'pass'); pressT = -1; } const o = s.ball.owner && s.ball.owner.t === 1 ? s.ball.owner : s.ball, dx = o.x - p.x, dy = o.y - p.y, L = Math.hypot(dx, dy) || 1; I.tx = dx / L; I.ty = dy / L; }
        }
        step(s, STEP); s.ev.length = 0; tt += STEP; const b = s.ball;
        if (b.shot !== last) { last = b.shot; if (cur && cur.ok === null) cur.ok = false; cur = null;
          if (b.passTarget && b.kicker && !b.isShot && (!human || b.kicker.t === 0)) { cur = { q: d(b.kicker, b.passTarget), v: Math.hypot(b.vx, b.vy), loft: b.vz > 2, t: b.kicker.t, ok: null }; curTarget = b.passTarget; rec.push(cur); } }
        if (cur && cur.ok === null && b.owner) { cur.ok = b.owner === curTarget; cur = null; }
      }
    }
    const G = rec.filter(r => !r.loft), L = rec.filter(r => r.loft), sorted = G.map(r => r.q).sort((a, b) => a - b), vs = G.map(r => r.v).sort((a, b) => a - b), q = (arr: number[], f: number) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * f))] : 0;
    const long = G.filter(r => r.q > 25), fast = G.filter(r => r.v > 24);
    console.log(`  ${human ? '사람 탭 패스(가장 가까운 앞쪽 동료 조준)' : 'AI끼리'}: 땅볼 ${G.length}개 · 거리 중앙값 ${q(sorted, 0.5).toFixed(0)}m, 상위 10% ${q(sorted, 0.9).toFixed(0)}m, 최대 ${q(sorted, 0.999).toFixed(0)}m · 25m 넘는 땅볼 ${pct(long.length, G.length)} (성공 ${pct(long.filter(r => r.ok).length, long.length)}) · 초기 속도 중앙값 ${q(vs, 0.5).toFixed(0)}m/s, 24m/s 넘는 공 ${pct(fast.length, G.length)}, 최대 ${q(vs, 0.999).toFixed(0)}m/s · 띄운 패스 ${L.length}개`);
  }
}

/* ---------- 3) 압박 ---------- */
if (!ONLY || ONLY === '3') {
  console.log('== 압박: 중원에서 공을 잡고 조깅으로 전진할 때');
  let trials = 0; const tp: number[] = [], tl: number[] = []; let ahead = 0, near0 = 0, kept = 0;
  for (let sd = 0; sd < 3; sd++) {
    const s = mk(true, 300 + sd), I = s.INP[0], h = s.HU[0]!; let guard = 0, done = 0;
    while (done < N / 3 && guard++ < 3000) {
      s.HU[0] = null; let found = false; for (const q of s.players) q.sta = 1;
      for (let i = 0; i < 1500; i++) { step(s, STEP); s.ev.length = 0; s.M.time = 0; if (s.M.phase === 'full') s.M.phase = 'live'; const o = s.ball.owner; if (i >= 150 && s.M.phase === 'live' && o && o.t === 0 && o.role !== 'GK' && o.x > 35 && o.x < 70 && s.M.protect <= 0 && o.holdT < 0.1) { found = true; break; } }
      s.HU[0] = h; if (!found) continue;
      const p = s.ball.owner as Player; h.ctrl = p; trials++; done++;
      let n0 = 1e9, ah = 0; for (const o of s.team[1]) { const q = d(o, p); n0 = Math.min(n0, q); if (o.role !== 'GK' && o.x > p.x && q < 12 && Math.abs(o.y - p.y) < 8) ah++; }
      near0 += n0; ahead += ah; let pressed = -1, lost = -1;
      for (let i = 1; i <= 300; i++) {
        const dx = W - p.x, dy = (CY - p.y) * 0.5, q = Math.hypot(dx, dy) || 1; I.tx = dx / q * 0.8; I.ty = dy / q * 0.8;
        step(s, STEP); s.ev.length = 0; s.M.time = 0;
        if (pressed < 0) { let nn = 1e9; for (const o of s.team[1]) nn = Math.min(nn, d(o, p)); if (nn < 2) pressed = i / 60; }
        if (s.ball.owner !== p) { lost = i / 60; break; }
      }
      I.tx = 0; I.ty = 0; tp.push(pressed < 0 ? 5 : pressed); if (lost < 0) kept++; else tl.push(lost);
    }
  }
  tp.sort((a, b) => a - b); tl.sort((a, b) => a - b);
  console.log(`  ${trials}번: 잡는 순간 가장 가까운 상대 ${(near0 / trials).toFixed(1)}m · 앞 12m 안에서 길을 막은 상대 ${(ahead / trials).toFixed(1)}명 · 2m 안에 붙기까지 중앙값 ${tp[tp.length >> 1].toFixed(1)}s · 뺏기기까지 중앙값 ${tl.length ? tl[tl.length >> 1].toFixed(1) : '-'}s · 5초 버팀 ${pct(kept, trials)}`);
}
