import { W, H, CX, CY, GH, GZ } from './consts';
import { clamp, d, wx } from './util';
import { mulberry32 } from './rng';
import { DIFF, FORM, NUMS, kitFor, kitsClash } from '../data/teams';
import { lookOf } from '../data/looks';
import { lineupOf, slotsOf, overall, detailOf } from '../data/squads';
import { defaultTactics } from './tactics';
import { newQuick, command, quickTick, aiCornerPlan } from './quick';
import { updateAdvantage, addedMinutes, buildWall, cornerSetup, goalKickSetup, alive } from './rules';
import { startShootout, soRecord, soUpdate } from './shootout';
import type { PlayerDef } from '../data/squad';
import { FORMATIONS, type Slot } from '../data/formations';
import { newInp, readInput, clearPresses, type Inp } from '../input/actions';
import type { Sim, MatchCfg, Player, Human, HumanCfg, SetPieceType } from './types';
import { banner, sfx, crowdSwell, shake, xtEv } from './events';
import { computePred, updateBall, ballControl, runPending, dribbleCut, retarget } from './ball';
import { steer, moveTo, integrate } from './move';
import { autoCursor, humanUpdate, oursBall } from './human';
import { teamAI } from './ai/team';

function makeHuman(t: number, c: HumanCfg | null): Human | null {
  return c ? { t, ctrl: null, chiT: 0, chiA: NaN, lock: 0, charge: 0, charging: false, second: false, gkRush: false, pressT: 0, lostT: 0, swSeen: [], swT: 0, swHold: false, armP: false, armL: false, armT: false, bufK: 0, bufT: 0, bufPw: 0, bufOpt: 0, bufM: null, preShot: false, fakeT: 0, callAt: 0, runP: null, goP: null, goT: 0, goA: 0, mod: 0, zUsed: false, gkTips: 0, lockA: 0, lockT: 0, col: c.col, tag: c.tag, cursor: c.cursor, had: false } : null;
}
/** 경기 생성. inp를 주면 그 입력 객체를 그대로 읽는다 (앱의 키보드/터치/네트워크 입력). */
export function createMatch(cfg: MatchCfg, inp?: [Inp, Inp]): Sim {
  const [a, b] = cfg.teams;
  const s: Sim = {
    M: {
      teams: [a, b], kit: [kitFor(a, false), kitFor(b, kitsClash(a, b))], score: [0, 0], time: 0, len: cfg.len, diff: cfg.diff, half: 1,
      phase: 'kickoff', phaseT: 0, protect: 0, stats: { shots: [0, 0], onT: [0, 0], poss: [0.001, 0.001], fouls: [0, 0], offs: [0, 0], yel: [0, 0], red: [0, 0], passA: [0, 0], passC: [0, 0] },
      firstKick: cfg.firstKick, nextKick: 0, twoP: !!cfg.humans[1], net: cfg.net, tick: 0, slow: 0, scorer: null, tempo: cfg.tempo, spType: null, react: [0, 0],
      overT: 0, dead: null, deadT: 0, deadR: 9.15, wall: [], spots: null, setAim: false, aimX: 0, aimY: 0, aimMan: null, setTaker: null, setT: 0, setX: 0, setY: 0, throwIn: null, throwT: 0, lastAtt: -1, cnr: [0, 0], cnrMain: [null, null], cnrMen: [[], []], shortMan: null, gkBlock: false, qt: [newQuick(), newQuick()], ctr: [0, 0], autoRun: [1.5, 1.5], tac: [cfg.tactics?.[0] ?? defaultTactics(cfg.squads?.[0]?.formation), cfg.tactics?.[1] ?? defaultTactics(cfg.squads?.[1]?.formation)],
      bench: [[], []], subs: [0, 0], stops: 0, added: [0, 0, 0, 0], adv: null, knockout: !!cfg.knockout, so: null,
    },
    ball: { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: 0, passTarget: null, kicker: null, thru: false, shotT: 0, shot: 0, isShot: false, spin: 0, knock: null, curl: 0, setp: false, wt: 1, sx: 0, sy: 0, svx: 0, svy: 0, sin: 0, sph: 2, sOwn: null, pa: -1 },
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
      const lk = lookOf(T.code, d ? d.nameEn : 'p' + i, d ? d.num : NUMS[i]);
      const p: Player = {
        t, i, role: f.role, bx: f.x, by: f.y, num: d ? d.num : NUMS[i], x: 0, y: 0, vx: 0, vy: 0, dir: t === 0 ? 0 : Math.PI, speed: 0,
        kickCD: 0, stun: 0, tackleCD: 0, bodyCD: 0, reactT: 0, shield: 0, lagVx: 0, lagVy: 0, cutCD: 0, beatT: 0, runT: 0, runDir: 0, callT: 0, spX: 0, spY: 0, spT: 0, dumT: 0, offs: false, slide: 0, decT: 0, holdT: 0, lastSave: -1, dive: 0, diveDir: 0, lunge: 0, head: 0, atFeet: false, run: s.rnd() * 10,
        forcePass: false, forceShot: false, cele: false, hair: lk.hair, skin: lk.skin, look: lk.seed, tone: lk.tone,
        name: d ? d.name : `${T.code} ${NUMS[i]}`, nameEn: d ? d.nameEn : `${T.code} ${NUMS[i]}`, pos: d ? d.pos : f.pos, ovr: d ? overall(d) : Math.round((T.atk + T.def + T.spd) / 3),
        foot: d ? d.foot : 'R', skill: d ? d.skill : 2, attrs: det, def: d,
        speed0: 0, sta: 1, kickWind: 0, pending: null, feint: 0, burst: 0, spin: 0, spinDir: 1, off: false, yellow: 0,
      };
      // 속력: 개인 능력치(spd 60→6.2m/s, 80→7.0, 99→7.8)가 있으면 그걸로, 없으면 팀 속도
      p.speed0 = p.speed = (6.0 + (det.spd - 60) / 40 * 1.7) * mult * (f.role === 'GK' ? 0.92 : 1);
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
  // 배치: 기본 대형(수비 15~17·미드필더 30~33·공격 46m)을 하프라인 쪽으로 당긴다 — 차는 팀 공격수 51.3m·미드필더 41m·수비 30m, 받는 팀은 1m 뒤. 키커 말고는 두 팀 모두 센터서클(9.15m) 밖
  for (const p of players) { if (p.off) continue; let x = p.bx, y = p.by;
    if (p.role !== 'GK') { const fr = p.t === kt ? 51.3 : 50.3; x = Math.min(fr, fr - (46 - x) * (p.t === kt ? 0.68 : 0.72)); const dx = x - CX, dy = y - CY, q = Math.hypot(dx, dy); if (q < 10) { if (q < 0.5) { x = CX - 10; y = CY; } else { x = CX + dx / q * 10; y = CY + dy / q * 10; } } }
    p.x = wx(x, p.t); p.y = y; p.vx = p.vy = 0; p.dir = p.t === 0 ? 0 : Math.PI; p.kickCD = 0; p.stun = 0; p.holdT = 0; p.forcePass = false; p.dive = 0; p.lunge = 0; p.head = 0; p.atFeet = false; p.cele = false; p.spT = 0; p.dumT = 0; }
  const fw = team[kt].filter(p => p.role !== 'GK' && !p.off), tk = fw[fw.length - 2] ?? fw[0], mate = fw[fw.length - 1] ?? fw[0];
  tk.x = wx(51.7, kt); tk.y = CY; if (mate !== tk) { mate.x = wx(51.3, kt); mate.y = CY + (mate.by < CY - 0.5 ? -10.3 : 10.3); } // 짝은 하프라인 위 서클 바로 밖 (옆으로 주는 패스를 받는 자리) tk.dir = kt === 0 ? Math.PI : 0; mate.dir = tk.dir; // 킥오프 두 선수는 자기 진영을 본다
  placeBall(s, CX, CY); ball.owner = tk; ball.lastTouch = kt; M.setTaker = null; M.wall = []; M.spots = null; M.overT = 0;
  // 킥오프는 패스로 시작한다: 키커는 찰 때까지 제자리(몰고 나갈 수 없다 — 사람은 방향만 돌리고 패스·롱패스·스루, 8초 넘기면 가까운 동료에게), 상대는 찰 때까지 센터서클 밖
  M.dead = tk; M.deadT = 0; M.deadR = 9.15; M.setX = CX; M.setY = CY; M.spType = null; M.setAim = false; M.aimMan = null;
  if (HU[kt]) { M.setTaker = tk; M.setT = 0; }
  M.spots = new Map(players.filter(p => !p.off && p !== tk && p.role !== 'GK').map(p => [p, { x: p.x, y: p.y }])); // 찰 때까지 모두 자기 진영 제자리 (없으면 수비 팀 공격수가 '역습 출구' 자리를 찾아 센터서클을 가로질러 상대 진영으로 넘어갔다)
  xtEv(s, 'out', kt, 0, CX, CY);
  if (!HU[kt]) { tk.forcePass = true; tk.decT = 0.25; }
  M.phase = 'kickoff'; M.phaseT = 1.3; M.protect = 0; M.adv = null;
  for (const h of HU) { if (!h) continue; h.charging = false; h.charge = 0; h.lock = 0; setCtrl(h, h.t === kt ? tk : nearestOutfield(s, h.t, ball)); }
  banner(s, 'KICK OFF', HU[kt] ? '패스로 시작합니다' : '', 1100); sfx(s, 'whistle');
}
export function setPiece(s: Sim, type: SetPieceType, t: number, x: number, y: number) {
  const { M, players, team, ball, HU } = s;
  xtEv(s, 'out', t, 0, x, y);
  placeBall(s, x, y); ball.owner = null; M.throwIn = null; M.setTaker = null; M.wall = []; M.spots = null; M.cnr = [0, 0]; M.cnrMain = [null, null]; M.cnrMen = [[], []]; M.shortMan = null; M.gkBlock = false; for (const p of players) p.spT = 0; team[0][0].atFeet = team[1][0].atFeet = false;
  const tk = type === 'goalkick' ? team[t][0] : nearestOutfield(s, t, { x, y });
  let ang: number;
  if (type === 'corner') { const px = x < CX ? 11 : W - 11; ang = Math.atan2(CY - y, px - x); }
  else if (type === 'throw') ang = Math.atan2(y < CY ? 1 : -1, t === 0 ? 0.7 : -0.7);
  else if (type === 'penalty' || type === 'freekick') { const gx = wx(W, t); ang = Math.atan2(CY - y, gx - x); }
  else ang = t === 0 ? 0 : Math.PI;
  tk.dir = ang; tk.x = x - Math.cos(ang) * 0.75; tk.y = y - Math.sin(ang) * 0.75; tk.vx = tk.vy = 0; tk.holdT = 0; tk.decT = 0.35; tk.forcePass = !HU[t] && (type === 'throw' || type === 'corner');
  if (type === 'penalty' || type === 'freekick') tk.forceShot = !HU[t] && (type === 'penalty' || wx(x, t) > 72);
  if (type === 'throw') { tk.x = x; tk.y = y < CY ? -0.55 : H + 0.55; tk.dir = Math.atan2(y < CY ? 1 : -1, t === 0 ? 0.5 : -0.5); tk.forcePass = false; M.throwIn = tk; M.throwT = 0; } // 터치라인 밖에 서서 머리 위로 든다
  ball.owner = tk; ball.lastTouch = t;
  if (type === 'corner' && !M.so) cornerSetup(s, t, y, tk);
  if (type === 'goalkick' && !M.so) goalKickSetup(s, t);
  M.dead = tk; M.deadT = 0; M.deadR = type === 'throw' ? 2.5 : 9.15; M.setX = x; M.setY = y; M.aimMan = null; M.setAim = false; // 찰 때까지 상대는 이 거리 밖에 (teamAI)
  const gxA = wx(W, t), dG = Math.hypot(gxA - x, CY - y) || 1; let near = false;
  if (type !== 'throw' && HU[t]) { // 사람 팀 키커는 찰 때까지 제자리 (전엔 방향키만 눌러도 공을 몰고 나가 0.9초 만에 상대 골킥·스로인이 됐다). 방향키는 조준점을 옮긴다 (페널티는 예전처럼 위아래)
    M.setTaker = tk; M.setT = 0; M.setAim = type !== 'penalty'; near = type === 'freekick' && dG < 34;
    if (type === 'corner') { M.aimX = wx(W - 8.5, t); M.aimY = CY + (y < CY ? -1.5 : 1.5); }
    else if (near) { M.aimX = wx(W - 0.5, t); M.aimY = CY + (y < CY - 2 ? -2.9 : 2.9); } // 골문 가까운 프리킥: 가까운 쪽 포스트 안쪽
    else { const q = type === 'goalkick' ? 42 : 28; M.aimX = clamp(x + (gxA - x) / dG * q, 2, W - 2); M.aimY = clamp(y + (CY - y) / dG * q * 0.5, 3, H - 3); }
  }
  const R = type === 'throw' ? 2.5 : 9.15;
  for (const o of team[1 - t]) { if (o.role === 'GK' || o.off) continue; const q = d(o, ball); if (q < R) { const ux = (o.x - ball.x) / (q || 1), uy = (o.y - ball.y) / (q || 1); o.x = clamp(ball.x + ux * R, -1, W + 1); o.y = clamp(ball.y + uy * R, -1, H + 1); } }
  if (type === 'penalty') { const k = team[1 - t][0]; k.x = wx(0.8, 1 - t); k.y = CY; k.vx = k.vy = 0; for (const o of players) if (o !== tk && o !== k && wx(o.x, t) > W - 16.5 && Math.abs(o.y - CY) < 20.16) { o.x = wx(W - 18, t); } }
  if (type === 'freekick') M.wall = buildWall(s, t, x, y);
  // 49차: 코너킥 자리(cornerSetup)를 찰 때까지 지킨다 — 전엔 세워 놓기만 해서 차기 전 몇 초 동안 공(코너 깃발) 쪽 대형 자리로 걸어 나와 박스가 비었다 (조준점으로 들어가는 `aimMan`만 움직인다 — teamAI)
  if (type === 'corner' && !M.so) M.spots = new Map(players.filter(p => !p.off && p !== tk && p.role !== 'GK').map(p => [p, { x: p.x, y: p.y }]));
  if (type === 'penalty' || type === 'corner') M.stops++;
  M.phase = 'setpiece'; M.spType = type; M.phaseT = type === 'penalty' ? 1.4 : 0.8; M.protect = 1.6; M.adv = null;
  if (type === 'corner' && !M.so && !HU[t]) aiCornerPlan(s, t); // 53차: AI 팀은 짧은 코너킥 12%·작전(니어·파·키퍼 앞) 68%
  for (const h of HU) { if (!h) continue; h.charging = false; h.lock = 0; h.armP = h.armL = h.armT = false; h.bufK = 0; h.bufT = 0; h.preShot = false; if (h.t === t) setCtrl(h, tk); else setCtrl(h, nearestOutfield(s, h.t, ball)); }
  const hint = HU[t] ? ({ corner: ' · 방향키로 조준 · 롱패스 = 크로스 · 1~4 = 작전 · 호출 = 짧게', throw: ' · 패스 = 가까이 · 롱패스 = 멀리', goalkick: ' · 방향키로 조준 · 롱패스 = 길게 · 패스 = 가까운 동료에게 짧게', freekick: near ? ' · 방향키로 조준 · 슛 = 직접 슛(길게 = 높게) · 롱패스 = 띄우기' : ' · 방향키로 조준 · 롱패스 = 띄우기 · 패스 = 짧게', penalty: '' } as Record<string, string>)[type] : '';
  banner(s, type === 'penalty' ? 'PENALTY' : '', { corner: '코너킥', throw: '스로인', goalkick: '골킥', freekick: '파울 · 프리킥', penalty: '페널티킥' }[type] + hint, type === 'penalty' ? 1400 : hint ? 2400 : 900);
  if (type === 'freekick' || type === 'penalty') sfx(s, 'whistle');
}
export function checkOut(s: Sim) {
  const { ball } = s; if (s.M.throwIn) return; // 스로인을 들고 있는 동안은 공이 선 밖에 있다
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
  if (ball.kicker && ball.kicker.t === t) { // 골 = 유효 슈팅(54차): 키퍼가 손을 뻗어 본 슛은 gkAI가 이미 셌다 — 전엔 여기서 한 번 더 세어 유효 슈팅이 슈팅보다 많았다. 슛이 아닌 공(크로스·굴절)이 들어가면 슈팅으로도 센다
    const gk = s.team[1 - t].find(q => q.role === 'GK');
    if (!ball.isShot) { M.stats.shots[t]++; M.stats.onT[t]++; } else if (!gk || gk.lastSave !== ball.shot) M.stats.onT[t]++;
  }
  xtEv(s, 'goal', t, ball.kicker && ball.kicker.t === t ? ball.kicker.num : 0, ball.x, ball.y); // 자책골은 번호 0 (두 팀에 같은 등번호가 있어 상대 선수의 골로 적혔다)
  if (M.so) { M.phase = 'goal'; M.phaseT = 2.0; M.nextKick = 1 - t; M.scorer = ball.kicker; banner(s, 'GOAL!', '', 1500, true); sfx(s, 'goal'); crowdSwell(s, 0.18, 1.5); return; }
  M.score[t]++; M.phase = 'goal'; M.phaseT = 9.0; /* 세리머니 클로즈업 2.7초 + 리플레이 ~5.5초 (scene.ts CELE_T와 맞출 것) */
  M.nextKick = 1 - t; ball.owner = null; shake(s, 0.6); M.slow = 1.1; // 골을 먹은 팀이 킥오프 (이 줄이 위 주석에 먹혀 늘 팀 0이 킥오프하던 적이 있다)
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
/** 마지막 공격이 진행 중인가 (FC 온라인처럼 종료 시각이 지나도 이 동안은 휘슬을 불지 않는다): 공을 가진(마지막으로 찬) 팀이 상대 골에서 45m 안에 있거나,
    그쪽 코너킥·프리킥·스로인을 아직 안 찼거나, 슛이 날아가는 중. 수비가 공을 잡거나 걷어 내면·공이 뒤로 빠지면·키퍼가 잡으면 끝 */
function attackOn(s: Sim) {
  const { ball, M } = s, o = ball.owner, t = o ? o.t : ball.kicker ? ball.kicker.t : -1; if (t < 0 || M.so) return false;
  if (!o && ball.lastTouch !== t) return false; // 수비 발에 맞고 나온 공
  if (o && o.role === 'GK') return false;
  if (!o && ball.isShot) return true;
  return wx(ball.x, t) > 60 && !(M.dead && M.spType === 'goalkick');
}
/** 골 뒤 세리머니·리플레이를 건너뛰려고 패스 키를 누르고 있어야 하는 시간(초) */
export const SKIP_HOLD = 0.45;
const OVER_MAX = 10; // 마지막 공격을 지켜보는 최대 시간 (실제 초)
/** 한 틱. dt는 시뮬 시간(초). 경기 시계는 dt/tempo로 실제 시간을 따른다 */
export function step(s: Sim, dt: number) {
  const { M, players, ball, HU, INP } = s;
  M.tick++;
  for (const I of INP) readInput(I, dt);
  for (let t = 0; t < 2; t++) { const I = INP[t], h = HU[t]; if (I.cmd) { if (h && (M.phase === 'live' || M.phase === 'setpiece' || M.phase === 'kickoff')) command(s, h, I.cmd); I.cmd = 0; } } // 숫자 키 1~4 (53차): 코너킥 작전·퀵 전술
  quickTick(s, dt);
  const ph = M.phase;
  if (ph === 'live') {
    if (M.so) { soUpdate(s, dt); }
    else {
    M.time += dt / M.tempo; const minute = M.time / M.len * 90, hi = M.half - 1, end = M.half === 1 ? 45 : M.half === 2 ? 90 : M.half === 3 ? 105 : 120;
    if (minute >= end && M.added[hi] === 0) { M.added[hi] = addedMinutes(s); banner(s, '', `추가시간 +${M.added[hi]}분`, 1400); s.ev.push({ k: 'hud' }); }
    const up = (lim: number) => { if (minute < lim) return false; if (M.overT < OVER_MAX && attackOn(s)) { M.overT += dt / M.tempo; return false; } return true; }; // 시간이 다 됐어도 마지막 공격은 끝까지 본다
    if (M.half === 1 && up(45 + M.added[0])) { M.time = M.len / 2; M.phase = 'halftime'; M.phaseT = 2.8; banner(s, 'HALF TIME', `${M.teams[0].code} ${M.score[0]} - ${M.score[1]} ${M.teams[1].code}`, 2600); sfx(s, 'long'); }
    else if (M.half === 2 && up(90 + M.added[1])) { M.time = M.len; if (M.knockout && M.score[0] === M.score[1]) { M.half = 3; M.phase = 'halftime'; M.phaseT = 2.8; banner(s, 'EXTRA TIME', '연장전 · 전반', 2400); sfx(s, 'long'); } else { M.phase = 'full'; s.ev.push({ k: 'full' }); return; } }
    else if (M.half === 3 && up(105 + M.added[2])) { M.time = M.len * 105 / 90; M.half = 4; M.phase = 'halftime'; M.phaseT = 2.0; banner(s, '', '연장전 · 후반', 1800); }
    else if (M.half === 4 && up(120 + M.added[3])) { M.time = M.len * 120 / 90; if (M.score[0] === M.score[1]) { startShootout(s); } else { M.phase = 'full'; s.ev.push({ k: 'full' }); return; } }
    }
  }
  else if (ph === 'kickoff' || ph === 'setpiece') { M.phaseT -= dt; if (M.phaseT <= 0) { M.phase = 'live'; M.protect = Math.max(M.protect, 1.2); } }
  else if (ph === 'goal') { M.phaseT -= dt;
    // 세리머니·리플레이 건너뛰기: 사람이 패스 키를 SKIP_HOLD초 넘게 누르고 있으면 바로 킥오프 (골이 들어가는 순간은 보이게 0.5초 뒤부터, 승부차기는 제외)
    if (!M.so && M.phaseT > 0 && M.phaseT < 8.5) for (const h of HU) if (h && INP[h.t].down.pass && INP[h.t].holdT.pass > SKIP_HOLD) { M.phaseT = 0; M.slow = 0; banner(s, '', '', 50); break; }
    if (M.phaseT <= 0) { if (M.so) soRecord(s, true); else kickoff(s, M.nextKick); } }
  else if (ph === 'halftime') { M.phaseT -= dt; if (M.phaseT <= 0) { if (M.half === 1) { M.half = 2; M.time = M.len / 2; } kickoff(s, (M.half === 2 || M.half === 4) ? 1 - M.firstKick : M.firstKick); } }
  else if (ph === 'full') return;
  for (const h of HU) { if (!h) continue; const I = INP[h.t], ours = oursBall(s, h.t); if (I.press.pass) h.armP = ours; if (I.press.lob) h.armL = ours; if (I.press.through) h.armT = ours; } // 패스·롱패스는 우리 공일 때 누른 것만 (떼는 순간 나가므로)
  if (M.dead) { const k = M.dead; if (ball.owner !== k || k.off || Math.hypot(ball.x - M.setX, ball.y - M.setY) > 2.5 || M.deadT > 14) { M.dead = null; M.wall = []; M.spots = null; } else if (M.phase === 'live') M.deadT += dt; } // 차거나 몰고 나가면 풀린다
  if (M.setTaker) { const k = M.setTaker, hk = HU[k.t]; if (ball.owner !== k || k.off || !hk || hk.ctrl !== k || M.setT > 12) M.setTaker = null; else { M.protect = Math.max(M.protect, 0.5); if (M.phase === 'live') M.setT += dt; } } // 차기 전엔 뺏을 수 없다
  if (M.throwIn) { if (ball.owner !== M.throwIn || M.throwIn.off) M.throwIn = null; else { M.protect = Math.max(M.protect, 0.5); if (M.phase === 'live') M.throwT += dt; } } // 던지기 전엔 뺏을 수 없다
  M.protect = Math.max(0, M.protect - dt); M.react[0] = Math.max(0, M.react[0] - dt); M.react[1] = Math.max(0, M.react[1] - dt);
  for (const p of players) {
    p.kickCD = Math.max(0, p.kickCD - dt); p.stun = Math.max(0, p.stun - dt); p.tackleCD = Math.max(0, p.tackleCD - dt); p.bodyCD = Math.max(0, p.bodyCD - dt); p.shield = Math.max(0, p.shield - dt); p.callT = Math.max(0, p.callT - dt); p.dumT = Math.max(0, p.dumT - dt); if (p.spT > 0) p.spT = Math.max(0, p.spT - dt); p.runT = Math.max(0, p.runT - dt); p.cutCD = Math.max(0, p.cutCD - dt); p.beatT = Math.max(0, p.beatT - dt); p.reactT = Math.max(0, p.reactT - dt); p.dive = Math.max(0, p.dive - dt); p.lunge = Math.max(0, p.lunge - dt); p.head = Math.max(0, p.head - dt);
    p.feint = Math.max(0, p.feint - dt); p.burst = Math.max(0, p.burst - dt); if (p.spin > 0) { p.spin -= dt; p.dir += p.spinDir * Math.PI * 2 / 0.5 * dt; if (p.spin <= 0) p.spin = 0; }
    if (p.slide > 0) { p.slide -= dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; if (p.slide <= 0) { p.slide = 0; p.stun = Math.max(p.stun, 0.45); } }
    // 체력: 질주하면 빠르게, 달리면 천천히 닳고 걸으면 회복. 한 경기 내내 질주하면 다 닳는 정도 (스태미나 능력치로 보정)
    if (M.phase === 'live' && alive(p)) { const sp = Math.hypot(p.vx, p.vy), k = (1.35 - p.attrs.sta / 100 * 0.7) / Math.max(120, M.len) * M.tempo; const hard = M.qt[p.t].press > 0 && p.role !== 'GK' ? 1.6 : 1; /* 팀 압박(53차) 중엔 1.6배로 닳는다 */ if (sp > p.speed0 * 0.95) p.sta -= 1.7 * k * dt * hard; else if (sp > 4) p.sta -= 0.5 * k * dt * hard; else p.sta += 0.7 * k * dt; p.sta = clamp(p.sta, 0, 1); }
    p.speed = p.speed0 * (0.86 + 0.14 * p.sta);
    runPending(s, p, dt);
  }
  if (!ball.owner) computePred(s);
  if (M.phase === 'live') { for (const h of HU) { if (h) { autoCursor(s, h, dt); humanUpdate(s, h, dt); } } teamAI(s, 0, dt); teamAI(s, 1, dt); dribbleCut(s); }
  else if (M.phase === 'goal') celebrate(s, dt);
  else for (const p of players) steer(p, 0, 0, dt);
  { const k = Math.min(1, dt / 0.28); for (const p of players) { p.lagVx += (p.vx - p.lagVx) * k; p.lagVy += (p.vy - p.lagVy) * k; } } // 상대 눈에 비치는 속도: 0.28초 늦게 따라온다
  integrate(s, dt); updateBall(s, dt);
  if (M.phase === 'live') { retarget(s); ballControl(s); checkOut(s); updateAdvantage(s, dt); }
  if (M.phase === 'live') M.stats.poss[ball.owner ? ball.owner.t : ball.lastTouch] += dt;
  for (const I of INP) clearPresses(I);
}
