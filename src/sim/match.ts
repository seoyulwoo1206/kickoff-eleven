import { W, H, CX, CY, GH, GZ } from './consts';
import { clamp, d, wx } from './util';
import { mulberry32 } from './rng';
import { DIFF, FORM, NUMS, HAIR, SKIN, kitFor, kitsClash } from '../data/teams';
import { lineupOf, slotsOf, overall, detailOf } from '../data/squads';
import { defaultTactics } from './tactics';
import { updateAdvantage, addedMinutes, buildWall, alive } from './rules';
import { startShootout, soRecord, soUpdate } from './shootout';
import type { PlayerDef } from '../data/squad';
import { FORMATIONS, type Slot } from '../data/formations';
import { newInp, readInput, clearPresses, type Inp } from '../input/actions';
import type { Sim, MatchCfg, Player, Human, HumanCfg, SetPieceType } from './types';
import { banner, sfx, crowdSwell, shake } from './events';
import { computePred, updateBall, ballControl, runPending } from './ball';
import { steer, moveTo, integrate } from './move';
import { autoCursor, humanUpdate } from './human';
import { teamAI } from './ai/team';

function makeHuman(t: number, c: HumanCfg | null): Human | null {
  return c ? { t, ctrl: null, lock: 0, charge: 0, charging: false, second: false, gkRush: false, col: c.col, tag: c.tag, cursor: c.cursor, had: false } : null;
}
/** 경기 생성. inp를 주면 그 입력 객체를 그대로 읽는다 (앱의 키보드/터치/네트워크 입력). */
export function createMatch(cfg: MatchCfg, inp?: [Inp, Inp]): Sim {
  const [a, b] = cfg.teams;
  const s: Sim = {
    M: {
      teams: [a, b], kit: [kitFor(a, false), kitFor(b, kitsClash(a, b))], score: [0, 0], time: 0, len: cfg.len, diff: cfg.diff, half: 1,
      phase: 'kickoff', phaseT: 0, protect: 0, stats: { shots: [0, 0], onT: [0, 0], poss: [0.001, 0.001], fouls: [0, 0], offs: [0, 0], yel: [0, 0], red: [0, 0], passA: [0, 0], passC: [0, 0] },
      firstKick: cfg.firstKick, nextKick: 0, twoP: !!cfg.humans[1], net: cfg.net, tick: 0, slow: 0, scorer: null, tempo: cfg.tempo, spType: null, react: [0, 0],
      tac: [cfg.tactics?.[0] ?? defaultTactics(cfg.squads?.[0]?.formation), cfg.tactics?.[1] ?? defaultTactics(cfg.squads?.[1]?.formation)],
      bench: [[], []], subs: [0, 0], stops: 0, added: [0, 0, 0, 0], adv: null, knockout: !!cfg.knockout, so: null,
    },
    ball: { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: 0, passTarget: null, kicker: null, shot: 0, isShot: false, spin: 0, knock: null, curl: 0 },
    players: [], team: [[], []], HU: [makeHuman(0, cfg.humans[0]), makeHuman(1, cfg.humans[1])], INP: inp ?? [newInp(), newInp()], pred: [],
    rnd: mulberry32(cfg.seed), ev: [],
  };
  makePlayers(s, cfg.squads ?? [null, null], cfg.lineups ?? [null, null]);
  if (cfg.guest) { for (const p of s.players) { p.x = wx(p.bx, p.t); p.y = p.by; } placeBall(s, CX, CY); }
  else if (cfg.shootoutOnly) { s.M.phase = 'live'; startShootout(s); }
  else kickoff(s, cfg.firstKick);
  return s;
}
function makePlayers(s: Sim, squads: [import('../data/squad').SquadDef | null, import('../data/squad').SquadDef | null], lineups: [number[] | null, number[] | null]) {
  const { M, HU } = s;
  s.players.length = 0; s.team[0].length = 0; s.team[1].length = 0;
  for (let t = 0; t < 2; t++) {
    const T = M.teams[t], mult = HU[t] ? 1 : DIFF[M.diff].spd, sq = squads[t];
    const slots: Slot[] = (sq && FORMATIONS[M.tac[t].form]) ? FORMATIONS[M.tac[t].form] : sq ? slotsOf(sq) : FORM.map(f => ({ pos: f[0] === 'GK' ? 'GK' : f[0] === 'DF' ? 'CB' : f[0] === 'MF' ? 'CM' : 'ST', role: f[0], x: f[1], y: f[2] }));
    const lu = lineups[t], byNum = sq ? new Map(sq.players.map(p => [p.num, p])) : null;
    const xi: (PlayerDef | null)[] = sq ? (lu && lu.length === 11 && lu.every(n => byNum!.has(n)) ? lu.map(n => byNum!.get(n)!) : lineupOf(sq)) : [];
    if (sq) M.bench[t] = sq.players.filter(p => !xi.includes(p));
    slots.forEach((f, i) => {
      const d = xi[i] ?? null;
      // 선수단 없으면 팀 능력치로 가짜 PlayerDef를 만들어 세부 능력치를 전개 (코드 경로를 하나로)
      const det = detailOf(d ?? { name: '', nameEn: '', num: NUMS[i], pos: f.pos, foot: 'R', weak: 3, skill: 2, height: 180,
        r: f.role === 'GK' ? { pac: 58, sho: 60, pas: 62, dri: 55, def: T.def, phy: T.def } : { pac: T.spd, sho: f.role === 'FW' ? T.atk : f.role === 'MF' ? T.atk - 8 : T.atk - 25, pas: f.role === 'MF' ? T.atk : T.atk - 8, dri: f.role === 'DF' ? T.atk - 15 : T.atk - 3, def: f.role === 'DF' ? T.def : f.role === 'MF' ? T.def - 12 : T.def - 35, phy: (T.def + T.spd) / 2 },
        gk: f.role === 'GK' ? { div: T.def, han: T.def - 2, kic: 65, ref: T.def + 2, pos: T.def } : undefined });
      const p: Player = {
        t, i, role: f.role, bx: f.x, by: f.y, num: d ? d.num : NUMS[i], x: 0, y: 0, vx: 0, vy: 0, dir: t === 0 ? 0 : Math.PI, speed: 0,
        kickCD: 0, stun: 0, tackleCD: 0, bodyCD: 0, reactT: 0, offs: false, slide: 0, decT: 0, holdT: 0, lastSave: -1, dive: 0, diveDir: 0, run: s.rnd() * 10,
        forcePass: false, forceShot: false, cele: false, hair: HAIR[(i * 7 + t * 3) % HAIR.length], skin: SKIN[(i * 5 + t * 2) % SKIN.length],
        name: d ? d.name : `${T.code} ${NUMS[i]}`, nameEn: d ? d.nameEn : `${T.code} ${NUMS[i]}`, pos: d ? d.pos : f.pos, ovr: d ? overall(d) : Math.round((T.atk + T.def + T.spd) / 3),
        foot: d ? d.foot : 'R', skill: d ? d.skill : 2, attrs: det, def: d,
        speed0: 0, sta: 1, kickWind: 0, pending: null, feint: 0, burst: 0, spin: 0, spinDir: 1, off: false, yellow: 0,
      };
      // 속력: 개인 능력치(spd 60→6.2m/s, 80→7.0, 99→7.8)가 있으면 그걸로, 없으면 팀 속도
      p.speed0 = p.speed = (6.5 + (det.spd - 60) / 40 * 1.8) * mult * (f.role === 'GK' ? 0.92 : 1);
      s.players.push(p); s.team[t].push(p);
    });
  }
}
export function nearestOutfield(s: Sim, t: number, pt: { x: number; y: number }, exclude?: Player | null) {
  let best: Player | null = null, bd = 1e9;
  for (const p of s.team[t]) { if (p.role === 'GK' || p === exclude || p.off) continue; const q = d(p, pt); if (q < bd) { bd = q; best = p; } }
  return best as Player;
}
const setCtrl = (h: Human | null, p: Player | null) => { if (h && p) h.ctrl = p; };
export function placeBall(s: Sim, x: number, y: number) {
  const { ball } = s;
  ball.x = x; ball.y = y; ball.z = 0; ball.vx = ball.vy = ball.vz = 0; ball.passTarget = null; ball.kicker = null; ball.isShot = false; ball.knock = null;
}
export function kickoff(s: Sim, kt: number) {
  const { M, players, team, ball, HU } = s;
  M.scorer = null;
  for (const p of players) { if (p.off) continue; let x = p.bx; if (p.role !== 'GK') x = Math.min(x, p.t === kt ? 46 : 41); p.x = wx(x, p.t); p.y = p.by; p.vx = p.vy = 0; p.dir = p.t === 0 ? 0 : Math.PI; p.kickCD = 0; p.stun = 0; p.holdT = 0; p.forcePass = false; p.dive = 0; p.cele = false; }
  const fw = team[kt].filter(p => p.role !== 'GK' && !p.off), tk = fw[fw.length - 2] ?? fw[0], mate = fw[fw.length - 1] ?? fw[0];
  tk.x = wx(51.7, kt); tk.y = CY; mate.x = wx(50.5, kt); mate.y = CY + 6; tk.dir = kt === 0 ? 0 : Math.PI;
  placeBall(s, CX, CY); ball.owner = tk; ball.lastTouch = kt;
  if (!HU[kt]) { tk.forcePass = true; tk.decT = 0.25; }
  M.phase = 'kickoff'; M.phaseT = 1.3; M.protect = 0; M.adv = null;
  for (const h of HU) { if (!h) continue; h.charging = false; h.charge = 0; h.lock = 0; setCtrl(h, h.t === kt ? tk : nearestOutfield(s, h.t, ball)); }
  banner(s, 'KICK OFF', '', 1100); sfx(s, 'whistle');
}
export function setPiece(s: Sim, type: SetPieceType, t: number, x: number, y: number) {
  const { M, players, team, ball, HU } = s;
  placeBall(s, x, y); ball.owner = null;
  const tk = type === 'goalkick' ? team[t][0] : nearestOutfield(s, t, { x, y });
  let ang: number;
  if (type === 'corner') { const px = x < CX ? 11 : W - 11; ang = Math.atan2(CY - y, px - x); }
  else if (type === 'throw') ang = Math.atan2(y < CY ? 1 : -1, t === 0 ? 0.7 : -0.7);
  else if (type === 'penalty' || type === 'freekick') { const gx = wx(W, t); ang = Math.atan2(CY - y, gx - x); }
  else ang = t === 0 ? 0 : Math.PI;
  tk.dir = ang; tk.x = x - Math.cos(ang) * 0.75; tk.y = y - Math.sin(ang) * 0.75; tk.vx = tk.vy = 0; tk.holdT = 0; tk.decT = 0.35; tk.forcePass = !HU[t] && (type === 'throw' || type === 'corner');
  if (type === 'penalty' || type === 'freekick') tk.forceShot = !HU[t] && (type === 'penalty' || wx(x, t) > 72);
  ball.owner = tk; ball.lastTouch = t;
  const R = type === 'penalty' ? 9.15 : type === 'freekick' ? 9.15 : 7;
  for (const o of team[1 - t]) { if (o.role === 'GK' || o.off) continue; const q = d(o, ball); if (q < R) { const ux = (o.x - ball.x) / (q || 1), uy = (o.y - ball.y) / (q || 1); o.x = clamp(ball.x + ux * R, -1, W + 1); o.y = clamp(ball.y + uy * R, -1, H + 1); } }
  if (type === 'penalty') { const k = team[1 - t][0]; k.x = wx(0.8, 1 - t); k.y = CY; k.vx = k.vy = 0; for (const o of players) if (o !== tk && o !== k && wx(o.x, t) > W - 16.5 && Math.abs(o.y - CY) < 20.16) { o.x = wx(W - 18, t); } }
  if (type === 'freekick') buildWall(s, t, x, y);
  if (type === 'penalty' || type === 'corner') M.stops++;
  M.phase = 'setpiece'; M.spType = type; M.phaseT = type === 'penalty' ? 1.4 : 0.8; M.protect = 1.6; M.adv = null;
  for (const h of HU) { if (!h) continue; h.charging = false; h.lock = 0; if (h.t === t) { if (tk.role !== 'GK') setCtrl(h, tk); } else setCtrl(h, nearestOutfield(s, h.t, ball)); }
  banner(s, type === 'penalty' ? 'PENALTY' : '', { corner: '코너킥', throw: '스로인', goalkick: '골킥', freekick: '파울 · 프리킥', penalty: '페널티킥' }[type], type === 'penalty' ? 1400 : 900);
  if (type === 'freekick' || type === 'penalty') sfx(s, 'whistle');
}
export function checkOut(s: Sim) {
  const { ball } = s;
  const x = ball.x, y = ball.y;
  if (x < 0 || x > W) {
    const left = x < 0;
    if (Math.abs(y - CY) < GH && ball.z < GZ) { goal(s, left ? 1 : 0); return; }
    const def = left ? 0 : 1;
    if (s.M.so) { soRecord(s, false); return; }
    if (ball.lastTouch === def) setPiece(s, 'corner', 1 - def, left ? 0.5 : W - 0.5, y < CY ? 0.5 : H - 0.5); else setPiece(s, 'goalkick', def, wx(5.5, def), CY);
  } else if (y < 0 || y > H) { if (s.M.so) { soRecord(s, false); return; } setPiece(s, 'throw', 1 - ball.lastTouch, clamp(x, 1, W - 1), y < 0 ? 0.3 : H - 0.3); }
}
export function goal(s: Sim, t: number) {
  const { M, ball } = s;
  for (const q of s.players) { q.pending = null; q.kickWind = 0; }
  M.stops++; M.adv = null;
  if (ball.kicker && ball.kicker.t === t) M.stats.onT[t]++;
  if (M.so) { M.phase = 'goal'; M.phaseT = 2.0; M.nextKick = 1 - t; M.scorer = ball.kicker; banner(s, 'GOAL!', '', 1500, true); sfx(s, 'goal'); crowdSwell(s, 0.18, 1.5); return; }
  M.score[t]++; M.phase = 'goal'; M.phaseT = 7.4; // 세리머니 1.3초 + 리플레이 ~5.6초 M.nextKick = 1 - t; ball.owner = null; shake(s, 0.6); M.slow = 1.1;
  const k = ball.kicker, own = !(k && k.t === t), who = !own && k ? `${M.teams[t].name} ${k.num}번` : `${M.teams[1 - t].name} 자책골`;
  M.scorer = own ? null : k;
  banner(s, 'GOAL!', who, 3200, true); sfx(s, 'goal'); sfx(s, 'whistle'); crowdSwell(s, 0.2, 2.8); s.ev.push({ k: 'hud' });
}
/** 득점자는 코너로 달려가고 가까운 동료가 따라붙는다 */
function celebrate(s: Sim, dt: number) {
  const { M, players } = s;
  const sc = M.scorer;
  for (const p of players) {
    if (p === sc) { p.cele = true; moveTo(p, wx(W - 4, p.t), p.y < CY ? 3 : H - 3, 1.05, dt); }
    else if (sc && p.t === sc.t && p.role !== 'GK' && d(p, sc) < 28) { p.cele = true; if (d(p, sc) > 1.7) moveTo(p, sc.x, sc.y, 1, dt); else steer(p, 0, 0, dt); }
    else steer(p, 0, 0, dt);
  }
}
/** 한 틱. dt는 시뮬 시간(초). 경기 시계는 dt/tempo로 실제 시간을 따른다 */
export function step(s: Sim, dt: number) {
  const { M, players, ball, HU, INP } = s;
  M.tick++;
  for (const I of INP) readInput(I, dt);
  const ph = M.phase;
  if (ph === 'live') {
    if (M.so) { soUpdate(s, dt); }
    else {
    M.time += dt / M.tempo; const minute = M.time / M.len * 90, hi = M.half - 1, end = M.half === 1 ? 45 : M.half === 2 ? 90 : M.half === 3 ? 105 : 120;
    if (minute >= end && M.added[hi] === 0) { M.added[hi] = addedMinutes(s); banner(s, '', `추가시간 +${M.added[hi]}분`, 1400); s.ev.push({ k: 'hud' }); }
    if (M.half === 1 && minute >= 45 + M.added[0]) { M.time = M.len / 2; M.phase = 'halftime'; M.phaseT = 2.8; banner(s, 'HALF TIME', `${M.teams[0].code} ${M.score[0]} - ${M.score[1]} ${M.teams[1].code}`, 2600); sfx(s, 'long'); }
    else if (M.half === 2 && minute >= 90 + M.added[1]) { M.time = M.len; if (M.knockout && M.score[0] === M.score[1]) { M.half = 3; M.phase = 'halftime'; M.phaseT = 2.8; banner(s, 'EXTRA TIME', '연장전 · 전반', 2400); sfx(s, 'long'); } else { M.phase = 'full'; s.ev.push({ k: 'full' }); return; } }
    else if (M.half === 3 && minute >= 105 + M.added[2]) { M.time = M.len * 105 / 90; M.half = 4; M.phase = 'halftime'; M.phaseT = 2.0; banner(s, '', '연장전 · 후반', 1800); }
    else if (M.half === 4 && minute >= 120 + M.added[3]) { M.time = M.len * 120 / 90; if (M.score[0] === M.score[1]) { startShootout(s); } else { M.phase = 'full'; s.ev.push({ k: 'full' }); return; } }
    }
  }
  else if (ph === 'kickoff' || ph === 'setpiece') { M.phaseT -= dt; if (M.phaseT <= 0) { M.phase = 'live'; M.protect = Math.max(M.protect, 1.2); } }
  else if (ph === 'goal') { M.phaseT -= dt; if (M.phaseT <= 0) { if (M.so) soRecord(s, true); else kickoff(s, M.nextKick); } }
  else if (ph === 'halftime') { M.phaseT -= dt; if (M.phaseT <= 0) { if (M.half === 1) { M.half = 2; M.time = M.len / 2; } kickoff(s, (M.half === 2 || M.half === 4) ? 1 - M.firstKick : M.firstKick); } }
  else if (ph === 'full') return;
  M.protect = Math.max(0, M.protect - dt); M.react[0] = Math.max(0, M.react[0] - dt); M.react[1] = Math.max(0, M.react[1] - dt);
  for (const p of players) {
    p.kickCD = Math.max(0, p.kickCD - dt); p.stun = Math.max(0, p.stun - dt); p.tackleCD = Math.max(0, p.tackleCD - dt); p.bodyCD = Math.max(0, p.bodyCD - dt); p.reactT = Math.max(0, p.reactT - dt); p.dive = Math.max(0, p.dive - dt);
    p.feint = Math.max(0, p.feint - dt); p.burst = Math.max(0, p.burst - dt); if (p.spin > 0) { p.spin -= dt; p.dir += p.spinDir * Math.PI * 2 / 0.5 * dt; if (p.spin <= 0) p.spin = 0; }
    if (p.slide > 0) { p.slide -= dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; if (p.slide <= 0) { p.slide = 0; p.stun = Math.max(p.stun, 0.45); } }
    // 체력: 질주하면 빠르게, 달리면 천천히 닳고 걸으면 회복. 한 경기 내내 질주하면 다 닳는 정도 (스태미나 능력치로 보정)
    if (M.phase === 'live' && alive(p)) { const sp = Math.hypot(p.vx, p.vy), k = (1.35 - p.attrs.sta / 100 * 0.7) / Math.max(120, M.len) * M.tempo; if (sp > p.speed0 * 0.95) p.sta -= 1.7 * k * dt; else if (sp > 4) p.sta -= 0.5 * k * dt; else p.sta += 0.7 * k * dt; p.sta = clamp(p.sta, 0, 1); }
    p.speed = p.speed0 * (0.86 + 0.14 * p.sta);
    runPending(s, p, dt);
  }
  if (!ball.owner) computePred(s);
  if (M.phase === 'live') { for (const h of HU) { if (h) { autoCursor(s, h, dt); humanUpdate(s, h, dt); } } teamAI(s, 0, dt); teamAI(s, 1, dt); }
  else if (M.phase === 'goal') celebrate(s, dt);
  else for (const p of players) steer(p, 0, 0, dt);
  integrate(s, dt); updateBall(s, dt);
  if (M.phase === 'live') { ballControl(s); checkOut(s); updateAdvantage(s, dt); }
  if (M.phase === 'live') M.stats.poss[ball.owner ? ball.owner.t : ball.lastTouch] += dt;
  for (const I of INP) clearPresses(I);
}
