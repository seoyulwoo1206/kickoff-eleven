/* 앱 진입점: 상태 머신(menu/play/paused/over), 경기 시작, 프레임 루프, 시뮬 이벤트 → 연출, 온라인 연결 */
import './style.css';
import { TEAMS } from './data/teams';
import { STEP, TEMPO } from './sim/consts';
import { createMatch, step } from './sim/match';
import type { Sim, SimEvent } from './sim/types';
import { newInp, readInput, clearPresses, dropKeys, type Inp } from './input/actions';
import { installKeyboard } from './input/keyboard';
import { pollGamepads } from './input/gamepad';
import { installTouch, touchGauge, applyTouchStyle } from './input/touch';
import { openLineup, closeLineup } from './ui/lineup';
import { newCup, loadCup, saveCup, userFixture, advance, type Cup } from './cup';
import { renderCup } from './ui/cup';
import { loadKeys, renderKeys, installKeyCapture, keyOf } from './ui/keys';
import { boo } from './audio';
import { Renderer } from './render/canvas2d';
import { ThreeRenderer } from './render/three/scene';
import { CELE, CELE_NAMES } from './render/three/player';
import type { IRenderer, CamMode } from './render/types';
import { opts, loadOpts, saveOpts } from './options';
import { audio, ensureAudio, crowdStart, crowdStop, crowdSwell, sfx, anthem, anthemStop, audioAway } from './audio';
import { showIntro, hideIntro } from './ui/intro';
import { NET, LOCAL, initPeer, netSend, netClose, netHost, netJoin, netPing } from './net/peer';
import { makeSnap, netInterp, applyNetInput, encodeInput, type NetMsg, type StartCfg, type Snap, type SnapBuf } from './net/protocol';
import { updateHud, resetHud, showBanner, hideBanner, touchAttack, relabelTouch, setHudTheme } from './ui/hud';
import { initMenu, renderMenu, setSeg, bindSeg, netStatus, NET_IDLE_MSG } from './ui/menu';
import { fillResult } from './ui/result';
import { randomSeed } from './sim/rng';
import { applySquadStrength, squadOf, displayName, aliasOf } from './data/squads';
import { RatingTracker, rate, fallbackXt } from './rating';
import { pitchHtml, tokHtml, halfPos, fullPos, type Tok } from './ui/pitch';
import { lookOf } from './data/looks';
import { CMT, CMT_NAME, cmt, cmtTick, cmtStop, cmtCtx, cmtReset, cmtVoiceInfo, cmtVoiceSet, cmtSample } from './commentary';
import { xtAt, has as xtHas } from './xt/table';
import { defaultTactics, applyFormation, LINE_NAMES, STYLE_NAMES, PRESS_NAMES, type Tactics, type Style } from './sim/tactics';
import { substitute } from './sim/rules';
import { FORMATION_KEYS } from './data/formations';
import { overall } from './data/squad';
import { XT, loadXt, resetXt, xtEvent, xtSample, refreshMap, fixSelection, renderPanel, panelNote, resultHtml, SAMPLE_EVERY } from './xt/view';
import { has, modelsOf, PARTS, MODELS, TKEYS, type Part, type Model, type TKey } from './xt/table';
import { switchPlayer } from './sim/human';
import type { Human } from './sim/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
type State = 'menu' | 'play' | 'paused' | 'over';
let state: State = 'menu';
let sim: Sim | null = null;
let rat: RatingTracker | null = null; // 선수 평점 집계 (게스트는 사건을 받지 않아 없음)
const INP: [Inp, Inp] = [newInp(), newInp()];
let isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
loadOpts();
function makeRenderer(): IRenderer {
  try { const c = document.createElement('canvas'); if (!c.getContext('webgl2') && !c.getContext('webgl')) throw new Error('no webgl'); return new ThreeRenderer($('cv') as HTMLCanvasElement, $('insets'), $('ov') as HTMLCanvasElement, opts.gfx); }
  catch (e) { console.warn('WebGL 사용 불가, 2D 렌더러로', e); $('ov').hidden = true; return new Renderer($('cv') as HTMLCanvasElement, $('insets')); }
}
const R: IRenderer = makeRenderer();
const CAMS: CamMode[] = ['tv', 'pro', 'top'], CAM_NAME: Record<CamMode, string> = { tv: '중계', pro: '선수 뒤', top: '탑뷰', intro: '입장' };
let camMode: CamMode = 'tv';
const VIEWS: [number, string][] = [[1, '가깝게'], [1.35, '보통'], [1.75, '넓게'], [2.4, '전체']];
/** 시야 배율 적용 (R 키·일시정지 메뉴 버튼은 단계 순환, 마우스 휠은 조금씩) */
function setView(v: number, save = true) {
  opts.view = Math.round(Math.max(1, Math.min(2.4, v)) * 100) / 100; R.setView?.(opts.view); if (save) saveOpts();
  const near = VIEWS.reduce((a, b) => Math.abs(b[0] - opts.view) < Math.abs(a[0] - opts.view) ? b : a);
  $('viewBtn').textContent = '시야: ' + (Math.abs(near[0] - opts.view) < 0.03 ? near[1] : '×' + opts.view.toFixed(2));
}
function cycleView() { const i = VIEWS.findIndex(v => v[0] > opts.view + 0.03); setView(VIEWS[i < 0 ? 0 : i][0]); }
const CAMH: [number, string][] = [[0.36, '낮게'], [0.5, '보통'], [0.68, '높게'], [0.92, '아주 높게']]; // 중계 카메라가 내려다보는 각(rad)
function setCamH(v: number, save = true) { opts.camH = v; R.setElev?.(v); if (save) saveOpts(); const n = CAMH.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a); $('camHBtn').textContent = '카메라 높이: ' + n[1]; }
function cycleCamH() { const i = CAMH.findIndex(c => c[0] > opts.camH + 0.01); setCamH(CAMH[i < 0 ? 0 : i][0]); }
function cycleCamera() { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; R.setCamMode?.(camMode); $('camBtn').textContent = '카메라: ' + CAM_NAME[camMode]; }
let perf = 0, lastTs = 0, acc = 0, simLast = 0;
const snapBuf: SnapBuf = { buf: [], off: null };
const inSt = { lastIn: '', hb: 0 };

audio.on = opts.sound; applySquadStrength();

/* ---------- 경기 시작/종료 ---------- */
let cup: Cup | null = loadCup();
let cupMatch = false; // 지금 경기가 토너먼트 경기인가
let introT = 0;
const INTRO_LEN = 9.2; // 입장 연출(라인업 소개 + 음악) 길이. 아무 키·클릭으로 건너뛴다
function endIntro() { introT = 0; hideIntro(); anthemStop(); R.setCamMode?.(camMode); }
function skipIntro() { if (introT > 0 && introT < INTRO_LEN - 0.5) { endIntro(); lastTs = 0; } }
window.addEventListener('keydown', e => { if (introT > 0 && introT < INTRO_LEN - 0.5 && state === 'play') { skipIntro(); if (e.code !== 'Escape' && e.code !== 'KeyP') { e.stopImmediatePropagation(); e.preventDefault(); } } }, true);
document.getElementById('intro')!.addEventListener('pointerdown', () => skipIntro());
function startMatch(cfg?: StartCfg) {
  // 온라인: 호스트가 설정(cfg)을 만들어 게스트에게 보내고, 양쪽이 같은 cfg로 경기를 구성한다
  if (opts.mode === 'net') {
    if (!NET.ready) { netStatus('상대가 들어온 뒤에 킥오프할 수 있어요.'); return; }
    if (NET.role === 'guest' && !cfg) return;
    if (NET.role === 'host' && !cfg) { cfg = { sel: [opts.sel[0], opts.sel[1]], len: opts.len, fk: Math.random() < 0.5 ? 0 : 1, tempo: opts.tempo, seed: randomSeed() }; netSend({ t: 'start', c: cfg }); }
  }
  if (cfg) { opts.sel[0] = cfg.sel[0]; opts.sel[1] = cfg.sel[1]; opts.len = cfg.len; if ((cfg.tempo as string) in TEMPO) opts.tempo = cfg.tempo as keyof typeof TEMPO; }
  const net = opts.mode === 'net' && NET.ready, a = TEAMS[opts.sel[0]], b = TEAMS[opts.sel[1]];
  const tag = (t: number) => net ? (t === LOCAL() ? 'YOU' : (t === 0 ? a : b).code) : 'P' + (t + 1);
  const cur = (t: number) => (net && t !== LOCAL()) ? 'auto' as const : opts.cursor; // 커서 전환 방식은 각자 로컬 설정
  const twoP = opts.mode === '2p' || net;
  if (opts.mode === 'cup' && cup) { const uf = userFixture(cup); if (uf) { opts.sel[0] = uf.a; opts.sel[1] = uf.b; cupMatch = true; } else cupMatch = false; } else cupMatch = false;
  for (const I of INP) { dropKeys(I); clearPresses(I); I.tx = I.ty = 0; }
  sim = createMatch({
    teams: [a, b], len: opts.len, diff: opts.diff, tempo: TEMPO[opts.tempo], firstKick: cfg ? cfg.fk : (Math.random() < 0.5 ? 0 : 1),
    humans: [{ tag: tag(0), col: '#ffb627', cursor: cur(0) }, twoP ? { tag: tag(1), col: '#4fd3ff', cursor: cur(1) } : null],
    net, seed: cfg ? cfg.seed : randomSeed(), guest: NET.role === 'guest', squads: [squadOf(a), squadOf(b)],
    tactics: net ? [null, null] : [menuTac[0], menuTac[1]], lineups: net ? [null, null] : [menuLineup[0], menuLineup[1]],
    knockout: cupMatch && !!cup && cup.stage !== 'group', shootoutOnly: opts.mode === 'pk',
  }, INP);
  resetXt(); autoHU = null;
  { const tb = XT.tb, pt = XT.part, md = XT.model, T = XT.T; // 평점: 연구 xT 표가 있으면 그 값으로, 없으면 거리 기반 어림값
    rat = NET.role === 'guest' ? null : new RatingTracker(tb && xtHas(tb, pt, md, T) ? (x, y, t) => xtAt(tb, pt, md, T, x, y, t) : fallbackXt); ratRoster(); subPick = null; subMsg = ''; }
  cmtReset(); cmtChain.t = -1; cmtTeam = -1; cmtStars = sim ? [0, 1].map(t => { const ps = sim!.team[t].filter(q => q.role !== 'GK' && !q.off); return ps.length ? displayName(ps.reduce((x, y) => (y.ovr > x.ovr ? y : x)), opts.names) : ''; }) as [string, string] : ['', ''];
  introT = (net || opts.mode === 'pk') ? 0 : INTRO_LEN; if (introT > 0) R.setCamMode?.('intro');
  renderPauseTactics();
  if (NET.role === 'guest') { snapBuf.buf = []; snapBuf.off = null; }
  R.reset(); acc = 0; simLast = 0; state = 'play';
  $('menu').hidden = true; $('result').hidden = true; $('pause').hidden = true; $('hud').hidden = false; $('pauseBtn').hidden = false; $('touch').hidden = !isTouch;
  $('hPing').hidden = !net; showPing(); xtSync();
  setHudTheme(opts.mode === 'pk' ? 'pk' : net ? 'net' : cupMatch ? 'cup' : opts.mode === '2p' ? '2p' : 'league', opts.mode === 'pk' ? '승부차기' : net ? '온라인 대전' : cupMatch && cup ? '월드컵 · ' + ({ group: '조별리그', r16: '16강', qf: '8강', sf: '준결승', f: '결승' } as Record<string, string>)[cup.stage] : opts.mode === '2p' ? '2인 대전' : '친선 경기');
  resetHud(); drain(sim); updateHud(sim, LOCAL()); crowdStart();
  if (introT > 0) { showIntro(sim, opts.names, cupMatch && cup ? '월드컵' : '친선 경기'); anthem(); } else { hideIntro(); anthemStop(0.1); } // 입장: 선발 라인업 + 음악
  saveOpts();
}
/** 시뮬이 내보낸 연출 이벤트를 처리하고, 호스트면 게스트에게도 보낸다 */
function drain(s: Sim) {
  for (const e of s.ev) applyLocalEv(e, true);
  s.ev.length = 0;
}
function applyLocalEv(e: SimEvent, relay: boolean) {
  const ev = (k: string, a?: unknown) => { if (relay && NET.role === 'host' && NET.ready) netSend({ t: 'ev', k, a }); };
  switch (e.k) {
    case 'banner': showBanner(e.big, e.small, e.ms, e.goal); ev('b', [e.big, e.small, e.ms, e.goal]); cmtBanner(e.big, e.small); if (e.big === 'OFFSIDE') R.refEvent?.('offside'); break;
    case 'sfx': sfx(e.type); ev('x', e.type); buzz(e.type); if (e.type === 'post') cmt.post(); break;
    case 'crowd': crowdSwell(e.amt, e.dur); ev('c', [e.amt, e.dur]); break;
    case 'puff': R.puff(e.x, e.y, e.n, e.sp); break;
    case 'shake': R.cam.shake = Math.max(R.cam.shake, e.v); break;
    case 'hud': resetHud(); break;
    case 'card': renderPauseTactics(); ratRoster(); if (e.kind === 'Y' || e.kind === 'R') boo(); R.refEvent?.('card', e.t, e.num, e.kind); if (sim) { const q = sim.team[e.t].find(x => x.num === e.num); cmtSync(); if (q) cmt.card(displayName(q, opts.names), sim.M.teams[e.t].name, e.kind === 'R'); } break;
    case 'sub': renderPauseTactics(); ratRoster(); if (sim) { const q = sim.team[e.t].find(x => x.num === e.num); if (q) cmt.sub(displayName(q, opts.names)); } break;
    case 'full': fullTime(); break;
    case 'xt': if (rat && sim && !sim.M.so) rat.push(e); cmtXt(e);
      if (XT.tb) { const p = e.e === 'out' || e.e === 'goal' || !sim ? null : sim.team[e.t].find(q => q.num === e.num); xtEvent(e, p ? displayName(p, opts.names) : null, performance.now() / 1000); } break; // 게스트에겐 중계하지 않는다
  }
}
/* 해설: 사건 → 한마디 (commentary.ts가 자막·음성으로 낸다). 여기선 경기 상황(점수·시간·슈팅·점유율·간판 선수)을 넘기고, 공의 흐름에서 역습·볼 돌리기를 가려낸다 */
let cmtTeam = -1, cmtShotAt = -1e9; // 마지막으로 공을 만진 팀 (끊어냄 판정), 마지막 슛 시각
const cmtChain = { t: -1, n: 0, x0: 0, at: 0, said: false }; // 한 팀이 끊기지 않고 이어 간 터치: 팀·횟수·시작 위치(자기 골에서 m)·시작 시각·역습을 이미 말했나
let cmtStars: [string, string] = ['', ''];
function cmtSync() {
  if (!sim) return; const M = sim.M, ps = M.stats.poss;
  cmtCtx({ teams: [M.teams[0].name, M.teams[1].name], score: [M.score[0], M.score[1]], min: Math.floor(M.time / M.len * 90), half: M.half, shots: [M.stats.shots[0], M.stats.shots[1]], poss: ps[0] / Math.max(0.01, ps[0] + ps[1]) * 100, stars: cmtStars });
}
function cmtBanner(big: string, small: string) {
  if (!sim) return; const M = sim.M; cmtSync();
  if (big === 'KICK OFF') { if (M.half === 1 && M.time < 2 && M.score[0] + M.score[1] === 0) cmt.start(); else if (M.half === 2 && M.time < M.len / 2 + 2) cmt.second(); }
  else if (big === 'HALF TIME') cmt.half();
  else if (big === 'FULL TIME') cmt.full();
  else if (big === 'EXTRA TIME') cmt.extra();
  else if (big === 'PENALTY SHOOTOUT') cmt.shootout();
  else if (big === 'OFFSIDE') cmt.offside();
  else { const m = /추가시간 \+(\d+)분/.exec(small); if (m) cmt.added(+m[1]); }
}
function cmtXt(e: Extract<SimEvent, { k: 'xt' }>) {
  if (!sim || sim.M.so) return; const M = sim.M, p = e.num ? sim.team[e.t].find(q => q.num === e.num) : null, nm = p ? displayName(p, opts.names) : M.teams[e.t].name, lx = e.t === 0 ? e.x : 105 - e.x;
  cmtSync();
  if (e.e === 'gain' || e.e === 'kick') { // 터치가 이어지는 동안: 자기 진영에서 시작해 6초 안에 상대 진영 깊숙이 가면 역습, 9번 넘게 이어지면 볼 돌리기
    const now = performance.now();
    if (cmtChain.t !== e.t) { cmtChain.t = e.t; cmtChain.n = 0; cmtChain.x0 = lx; cmtChain.at = now; cmtChain.said = false; }
    else if (e.e === 'gain') cmtChain.n++;
    if (!cmtChain.said && cmtChain.x0 < 42 && lx > 70 && now - cmtChain.at < 6500) { cmtChain.said = true; cmt.counter(M.teams[e.t].name); }
    else if (cmtChain.n >= 9 && lx < 75) { cmtChain.n = 0; cmt.spell(M.teams[e.t].name); }
  }
  switch (e.e) {
    case 'shot': cmtShotAt = performance.now(); cmt.shot(nm, e.t, Math.hypot(105 - lx, e.y - 34)); cmtTeam = e.t; break;
    case 'save': cmt.save(nm, e.t); cmtTeam = e.t; break;
    case 'goal': cmt.goal(p ? nm : null, e.t); cmtTeam = -1; cmtChain.t = -1; break;
    case 'clear': if (Math.random() < 0.6) cmt.clear(nm); cmtTeam = e.t; break;
    case 'gain':
      if (cmtTeam >= 0 && cmtTeam !== e.t && p && p.role !== 'GK' && performance.now() - cmtShotAt > 1500) { if (Math.random() < 0.3) cmt.win(nm); }
      else if (cmtTeam === e.t && lx > 84 && Math.abs(e.y - 34) < 16 && Math.random() < 0.3) cmt.chance(M.teams[e.t].name); // 박스 안으로 공이 들어갔다
      cmtTeam = e.t; break;
    case 'kick': cmtTeam = e.t; break;
    case 'out': cmtTeam = -1; cmtChain.t = -1; cmt.out(); if (M.spType && M.phase === 'setpiece') cmt.set(M.spType, M.teams[e.t].name, e.t, M.spType === 'freekick' && Math.hypot(105 - lx, e.y - 34) < 32); break;
  }
}
function buzz(type: string) { if (!opts.vibrate || !isTouch || !navigator.vibrate) return; try { if (type === 'goal') navigator.vibrate([80, 40, 120]); else if (type === 'tackle') navigator.vibrate(25); else if (type === 'post') navigator.vibrate(45); } catch { /* */ } }
function fullTime() {
  if (!sim) return; sim.M.phase = 'full'; state = 'over'; $('touch').hidden = true;
  if (NET.role === 'host') { netSend(makeSnap(sim, perf, R.cam.shake)); netSend({ t: 'ev', k: 'full' }); }
  if (NET.role !== 'guest') sfx('long');
  fillResult(sim, LOCAL(), NET.role === 'guest'); fillRatings(); fillXtResult();
  $('cupNextBtn').hidden = !cupMatch; $('againBtn').hidden = cupMatch || NET.role === 'guest';
  if (cupMatch && cup) { const so = sim.M.so ? [sim.M.so.kicks[0].filter(v => v).length, sim.M.so.kicks[1].filter(v => v).length] as [number, number] : undefined; advance(cup, [sim.M.score[0], sim.M.score[1]], so, sim.M.so?.winner); saveCup(cup); }
  window.setTimeout(() => { if (state === 'over') { $('result').hidden = false; ($('againBtn') as HTMLButtonElement).focus(); } }, 900);
  if (NET.role !== 'guest') { const M = sim.M; showBanner('FULL TIME', `${M.teams[0].code} ${M.score[0]} - ${M.score[1]} ${M.teams[1].code}`, 1400, false); }
}
function pauseGame(remote?: boolean) {
  if (state !== 'play') return; state = 'paused'; $('pause').hidden = false; renderPauseTactics(); cmtLabel(); $('soundBtn').textContent = audio.on ? '소리 끄기' : '소리 켜기'; $('restartBtn').hidden = NET.role === 'guest';
  for (const I of INP) dropKeys(I); ($('resumeBtn') as HTMLButtonElement).focus(); if (remote !== true && NET.ready) netSend({ t: 'pause' });
}
function resumeGame(remote?: boolean) { if (state !== 'paused') return; state = 'play'; $('pause').hidden = true; lastTs = 0; simLast = 0; if (remote !== true && NET.ready) netSend({ t: 'resume' }); }
function toMenu(remote?: boolean) {
  cmtStop();
  if (remote !== true && NET.ready && state !== 'menu') netSend({ t: 'quit' });
  state = 'menu'; sim = null; $('skipHint').hidden = true; crowdStop(); XT.all = false; xtSync();
  $('pause').hidden = true; $('result').hidden = true; $('hud').hidden = true; $('pauseBtn').hidden = true; $('touch').hidden = true; $('menu').hidden = false; hideBanner(); renderMenu();
}
function showPing() { const el = $('hPing'); if (NET.rtt >= 0) el.textContent = '핑 ' + NET.rtt + 'ms'; if (state === 'menu' && NET.ready) netStatus('연결됨' + (NET.rtt >= 0 ? ' · 핑 ' + NET.rtt + 'ms' : '') + (NET.role === 'host' ? ' · 팀을 고르고 킥오프를 누르세요.' : ' · 호스트가 킥오프하면 시작돼요.'), true); }
function netSendLobby() { if (!NET.ready) return; const me = LOCAL(); netSend({ t: 'lobby', sel: opts.sel[me], len: NET.role === 'host' ? opts.len : undefined }); }

/* ---------- 온라인 메시지 ---------- */
initPeer({
  status: netStatus,
  onOpen() { if (NET.ready && NET.role === 'guest' && opts.sel[1] === opts.sel[0]) opts.sel[1] = (opts.sel[0] + 1) % TEAMS.length; netSendLobby(); showPing(); renderMenu(); },
  onData: onNetData,
  onClose() {
    $('hPing').hidden = true;
    const wasHost = NET.role === 'host';
    if (state !== 'menu') toMenu(true);
    if (wasHost) netStatus('상대와 연결이 끊겼어요. 같은 코드 ' + NET.code + '로 다시 들어올 수 있어요.');
    else { netClose(); netStatus('호스트와 연결이 끊겼어요. 코드로 다시 참가해 보세요.'); }
    renderMenu();
  },
});
function onNetData(m: NetMsg) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'lobby': {
      const rs = NET.role === 'host' ? 1 : 0;
      if (Number.isInteger(m.sel) && m.sel >= 0 && m.sel < TEAMS.length) {
        if (m.sel === opts.sel[1 - rs]) { if (NET.role === 'host') netSendLobby(); else { opts.sel[rs] = m.sel; opts.sel[1 - rs] = (m.sel + 1) % TEAMS.length; netSendLobby(); } }
        else opts.sel[rs] = m.sel;
      }
      if (NET.role === 'guest' && m.len) { opts.len = m.len; setSeg('segLen', opts.len); }
      renderMenu(); break;
    }
    case 'start': if (NET.role === 'guest' && m.c && Array.isArray(m.c.sel)) { ensureAudio(); startMatch(m.c); } break;
    case 'i': if (NET.role === 'host' && sim) applyNetInput(INP[1], m); break;
    case 's': if (NET.role === 'guest' && sim) { snapBuf.buf.push({ at: perf, s: m as Snap }); if (snapBuf.buf.length > 10) snapBuf.buf.shift(); if (m.sh > R.cam.shake) R.cam.shake = m.sh; } break;
    case 'ev': if (NET.role === 'guest' && sim) applyRemoteEv(m.k, m.a); break;
    case 'pause': if (state === 'play') pauseGame(true); break;
    case 'resume': if (state === 'paused') resumeGame(true); break;
    case 'quit': if (state !== 'menu') { toMenu(true); netStatus('상대가 메뉴로 나갔어요. 팀을 고르고 다시 킥오프하세요.', true); } break;
    case 'pg': netSend({ t: 'po', ts: m.ts }); break;
    case 'po': NET.rtt = Math.max(0, Math.round((perf - m.ts) * 1000)); showPing(); break;
  }
}
function applyRemoteEv(k: string, a: unknown) {
  const arr = a as unknown[];
  switch (k) {
    case 'b': showBanner(String(arr[0]), String(arr[1]), Number(arr[2]), !!arr[3]); break;
    case 'x': sfx(a as SimEvent extends { type: infer T } ? T : never); break;
    case 'c': crowdSwell(Number(arr[0]), Number(arr[1])); break;
    case 'full': { const l = snapBuf.buf[snapBuf.buf.length - 1]; if (l && sim) netInterpNow(); fullTime(); break; }
  }
}
function netInterpNow() { if (sim) netInterp(sim, snapBuf, perf, (x, y) => R.puff(x, y, 8, 3)); }
// 게스트 입력은 프레임과 상관없이 60Hz 타이머로 보낸다 (프레임이 떨어져도 입력은 끊기지 않게)
window.setInterval(() => { if (NET.role === 'guest' && state === 'play' && sim) { readInput(INP[0], STEP); const m = encodeInput(INP[0], inSt); if (m) netSend(m); clearPresses(INP[0]); } }, 1000 / 60);

/* ---------- 입력 ---------- */
installKeyboard({ inp: INP, isPlaying: () => state === 'play', hasLocalP2: () => !!(sim && sim.M.twoP && !NET.role), togglePause: () => { if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame(); }, cycleCamera, cycleView, cycleCamH, toggleXt: () => toggleXt() });
installTouch(INP[0], () => { if (!isTouch) { isTouch = true; document.body.classList.add('touch'); if (state === 'play' || state === 'paused') $('touch').hidden = false; } }, () => ({ stickSprint: opts.stickSprint, attack: touchAttack(), relabel: relabelTouch }));
if (isTouch) document.body.classList.add('touch');
applyTouchStyle(opts.btnSize, opts.btnAlpha);
window.addEventListener('blur', () => { for (const I of INP) dropKeys(I); if (state === 'play' && !NET.ready) pauseGame(); }); // 온라인에선 창 포커스만 잃어도 상대를 기다리게 하지 않는다
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pauseGame(); setAway(); });
// 화면을 나가면(다른 탭·다른 앱·창 포커스 잃음) 효과음·관중·해설을 멈추고, 돌아오면 잇는다
function setAway() { const away = document.hidden || !document.hasFocus(); audioAway(away); CMT.away = away; if (away) cmtStop(); }
window.addEventListener('blur', setAway); window.addEventListener('focus', setAway); window.addEventListener('pagehide', () => { audioAway(true); CMT.away = true; cmtStop(); });

/* ---------- 전술·교체 UI ---------- */
// 메뉴의 전술 선택 (팀별). 팀을 바꾸면 그 팀 선수단의 포메이션으로 초기화
const menuTac: [Tactics, Tactics] = [defaultTactics(), defaultTactics()];
const menuTacTeam = [-1, -1];
function tacSelect(id: string, opts: [string, string][], cur: string, onChange: (v: string) => void) {
  const el = $(id) as HTMLSelectElement; el.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join(''); el.onchange = () => onChange(el.value);
}
function tacRows(prefix: string, tac: Tactics, onChange: () => void) {
  tacSelect(prefix + 'Form', FORMATION_KEYS.map(k => [k, k]), tac.form, v => { tac.form = v; onChange(); });
  tacSelect(prefix + 'Line', (['-1', '0', '1'] as const).map(k => [k, LINE_NAMES[k]]), String(tac.line), v => { tac.line = +v as Tactics['line']; onChange(); });
  tacSelect(prefix + 'Style', (Object.keys(STYLE_NAMES) as Style[]).map(k => [k, STYLE_NAMES[k]]), tac.style, v => { tac.style = v as Style; onChange(); });
  tacSelect(prefix + 'Press', (['0', '1', '2'] as const).map(k => [k, PRESS_NAMES[k]]), String(tac.press), v => { tac.press = +v as Tactics['press']; onChange(); });
}
function renderMenuTactics() {
  for (const t of [0, 1] as const) {
    const T = TEAMS[opts.sel[t]];
    if (menuTacTeam[t] !== opts.sel[t]) { menuTacTeam[t] = opts.sel[t]; const sq = squadOf(T); Object.assign(menuTac[t], defaultTactics(sq?.formation)); menuLineup[t] = null; }
    tacRows('tac' + t, menuTac[t], () => { /* 값은 menuTac에 바로 저장됨 */ });
  }
  $('tacBox').classList.toggle('locked', opts.mode === 'net');
}
// 일시정지 메뉴: 로컬 팀 전술 + 교체 (온라인에선 숨김). 교체는 경기장 그림에서 나갈 선수와 벤치의 들어올 선수를 차례로 누른다
let subPick: string | null = null, subMsg = ''; // 고른 말: 'f' + 선수 인덱스(경기장) 또는 'b' + 벤치 순서
function renderPauseTactics() {
  const box = $('pauseTac'); if (!sim || sim.M.net) { box.hidden = true; return; } box.hidden = false;
  const t = LOCAL(), s = sim, tac = s.M.tac[t], kit = s.M.kit[t], code = s.M.teams[t].code;
  tacRows('ptac', tac, () => { if (sim) { applyFormation(sim, t, tac.form); renderPauseTactics(); } });
  const field = s.team[t].filter(p => !p.off), bench = s.M.bench[t], left = 5 - s.M.subs[t];
  const toks: Tok[] = field.map(p => { const q = halfPos(p.bx, p.by, t === 1); return { id: 'f' + p.i, num: p.num, name: displayName(p, opts.names), kit: p.role === 'GK' ? kit.gk : kit.c1, skin: p.skin, hair: p.hair, x: q.x, y: q.y, sub: `${p.pos} ${p.ovr}`, bar: p.sta, cls: (subPick === 'f' + p.i ? 'on ' : '') + (p.yellow ? 'yel' : '') }; });
  $('subPitch').innerHTML = pitchHtml(toks, 'half');
  $('subBench').innerHTML = bench.length ? bench.map((d, i) => { const lk = lookOf(code, d.nameEn, d.num); return tokHtml({ id: 'b' + i, num: d.num, name: opts.names === 'real' ? d.name : aliasOf(d), kit: d.pos === 'GK' ? kit.gk : kit.c1, skin: lk.skin, hair: lk.hair, sub: `${d.pos} ${overall(d)}`, cls: subPick === 'b' + i ? 'on' : '' }); }).join('') : '<span class="ratenote">벤치에 선수가 없어요</span>';
  $('subNote').textContent = `교체 ${s.M.subs[t]}/5 · ` + (subMsg || (left <= 0 ? '교체를 모두 썼어요' : !bench.length ? '벤치 없음' : subPick ? (subPick[0] === 'f' ? '들어올 벤치 선수를 누르세요' : '나갈 선수를 누르세요') : '나갈 선수와 들어올 선수를 차례로 누르세요'));
}
function subClick(id: string) {
  if (!sim) return; const t = LOCAL(), s = sim; subMsg = '';
  if (s.M.subs[t] >= 5) { subPick = null; renderPauseTactics(); return; }
  if (!subPick || subPick[0] === id[0]) { subPick = subPick === id ? null : id; renderPauseTactics(); return; }
  const fid = id[0] === 'f' ? id : subPick, bid = id[0] === 'b' ? id : subPick; subPick = null;
  const out = s.team[t].find(p => p.i === +fid.slice(1)), inDef = s.M.bench[t][+bid.slice(1)];
  if (out && inDef) { if ((out.role === 'GK') !== (inDef.pos === 'GK')) subMsg = '골키퍼는 골키퍼끼리만 바꿀 수 있어요'; else if (substitute(s, t, out, inDef)) drain(s); }
  renderPauseTactics();
}
for (const id of ['subPitch', 'subBench']) $(id).addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.tok'); if (b?.dataset.id) subClick(b.dataset.id); });
/** 평점 집계기에 지금 뛰는 선수 명단을 알린다 (시작·교체·퇴장) */
function ratRoster() { if (!rat || !sim) return; for (const t of [0, 1]) rat.roster(t, sim.team[t].filter(p => !p.off).map(p => ({ num: p.num, name: displayName(p, opts.names), role: p.role, lane: p.by }))); }
/** 경기 뒤: 최우수 선수와 선수별 평점을 경기장 라인업 그림으로 */
function fillRatings() {
  const el = $('rRate'); if (!sim || !rat || opts.mode === 'pk') { el.hidden = true; return; }
  const r = rate(rat), M = sim.M; if (r.list.length < 12 || !r.mvp) { el.hidden = true; return; }
  const by = new Map(r.list.map(p => [p.t + ':' + p.num, p])), bc = (v: number) => v >= 8 ? 'r9' : v >= 7 ? 'r7' : v >= 6 ? 'r6' : 'r5';
  const toks: Tok[] = sim.players.map(p => { const q = fullPos(p.bx, p.by, p.t), v = by.get(p.t + ':' + p.num); return { id: 'r' + p.t + p.i, num: p.num, name: displayName(p, opts.names), kit: p.role === 'GK' ? M.kit[p.t].gk : M.kit[p.t].c1, skin: p.skin, hair: p.hair, x: q.x, y: q.y, badge: v ? v.rating.toFixed(1) : '-', badgeCls: v ? bc(v.rating) : '', cls: 'stat ' + (v === r.mvp ? 'mvp ' : '') + (p.off ? 'dim' : '') }; });
  const gone = r.list.filter(p => !sim!.players.some(q => q.t === p.t && q.num === p.num)).sort((a, b) => a.t - b.t), m = r.mvp;
  const outTok = (p: typeof m) => { const T = M.teams[p.t], d = squadOf(T)?.players.find(q => q.num === p.num), lk = d ? lookOf(T.code, d.nameEn, d.num) : null; // 나간 선수의 Player 객체는 들어온 선수로 덮였으므로 선수단 자료에서 겉모습을 찾는다
    return tokHtml({ id: 'o' + p.t + p.num, num: p.num, name: p.name, kit: p.role === 'GK' ? M.kit[p.t].gk : M.kit[p.t].c1, skin: lk?.skin ?? '#d2a27c', hair: lk?.hair ?? '#2a2018', sub: '▼ ' + T.code, badge: p.rating.toFixed(1), badgeCls: bc(p.rating), cls: 'stat ' + (p === m ? 'mvp' : '') }); };
  el.innerHTML = `<div class="mvpline"><em>★ 최우수 선수</em><b>${m.name}</b><span>${M.teams[m.t].code} · 평점 ${m.rating.toFixed(1)}${m.goals ? ` · ${m.goals}골` : ''}${m.assists ? ` · ${m.assists}도움` : ''}${m.saves ? ` · 선방 ${m.saves}` : ''}${m.recov + m.clears ? ` · 공 따냄 ${m.recov + m.clears}` : ''}</span></div>`
    + pitchHtml(toks, 'full')
    + (gone.length ? `<div class="outrow"><span class="label">교체로 나간 선수</span><div class="benchrow">${gone.map(outTok).join('')}</div></div>` : '') // 경기장 그림과 같은 말로 (전엔 작은 글자 한 줄이라 안 보였다)
    + `<p class="ratenote">평점 = 공격(패스·드리블로 올린 xT, 골·도움) + 수비(공을 따낸 자리에서 상대가 갖고 있던 xT, 걷어내기·선방) − 잃은 공. 수비수는 자기 구역에서 내준 위협과 슈팅이 적을수록 높습니다.${XT.tb ? '' : ' (xT 표가 없어 골까지 거리로 어림한 값을 씁니다.)'}</p>`;
  el.hidden = false;
}

/* ---------- 메뉴 ---------- */
initMenu({ onSelChange: () => { netSendLobby(); renderMenuTactics(); } });
bindSeg('segMode', opts.mode, v => { if (opts.mode === 'net' && v !== 'net') { netClose(); netStatus(NET_IDLE_MSG); } opts.mode = v as typeof opts.mode; renderMenu(); renderMenuTactics(); if (v === 'cup') openCup(); });
bindSeg('segLen', opts.len, v => { opts.len = +v; netSendLobby(); });
bindSeg('segDiff', opts.diff, v => { opts.diff = v as typeof opts.diff; });
bindSeg('segTempo', opts.tempo, v => { opts.tempo = v as typeof opts.tempo; saveOpts(); });
bindSeg('segCursor', opts.cursor, v => { opts.cursor = v as typeof opts.cursor; saveOpts(); });
bindSeg('segNames', opts.names, v => { opts.names = v as typeof opts.names; saveOpts(); });
bindSeg('segStickSprint', opts.stickSprint ? 'on' : 'off', v => { opts.stickSprint = v === 'on'; saveOpts(); });
bindSeg('segVib', opts.vibrate ? 'on' : 'off', v => { opts.vibrate = v === 'on'; saveOpts(); });
bindSeg('segBtnSize', opts.btnSize, v => { opts.btnSize = v as typeof opts.btnSize; applyTouchStyle(opts.btnSize, opts.btnAlpha); saveOpts(); });
bindSeg('segBtnAlpha', opts.btnAlpha, v => { opts.btnAlpha = v as typeof opts.btnAlpha; applyTouchStyle(opts.btnSize, opts.btnAlpha); saveOpts(); });
$('fsBtn').addEventListener('click', async () => { try { await document.documentElement.requestFullscreen(); const o = screen.orientation as ScreenOrientation & { lock?: (m: string) => Promise<void> }; if (o.lock) await o.lock('landscape'); } catch { /* 지원 안 함 */ } });
// 라인업 편집: 팀별 선발(등번호) 저장, 팀을 바꾸면 초기화
const menuLineup: [number[] | null, number[] | null] = [null, null];
for (const t of [0, 1] as const) $('lu' + t).addEventListener('click', () => { const T = TEAMS[opts.sel[t]], sq = squadOf(T); if (!sq) return; openLineup(sq, menuTac[t].form, menuLineup[t] ?? sq.lineup, opts.names, lu => { menuLineup[t] = lu.slice(); }); });
$('luClose').addEventListener('click', closeLineup);
// 월드컵
function openCup() { if (!cup) cup = newCup(opts.sel[0]); saveCup(cup); renderCup(cup); $('cup').hidden = false; }
$('cupClose').addEventListener('click', () => { $('cup').hidden = true; });
$('cupQuit').addEventListener('click', () => { cup = null; saveCup(null); $('cup').hidden = true; });
$('cupPlay').addEventListener('click', () => {
  if (!cup) return;
  if (cup.stage === 'done') { cup = newCup(opts.sel[0]); saveCup(cup); renderCup(cup); return; }
  const uf = userFixture(cup);
  if (cup.eliminated || !uf) { advance(cup); saveCup(cup); renderCup(cup); return; }
  $('cup').hidden = true; ensureAudio(); startMatch();
});
$('cupNextBtn').addEventListener('click', () => { toMenu(); if (cup) { renderCup(cup); $('cup').hidden = false; } });
// 키 설정
loadKeys(); installKeyCapture();
$('keysBtn').addEventListener('click', () => { renderKeys(); $('keys').hidden = false; });
$('keysClose').addEventListener('click', () => { $('keys').hidden = true; });
bindSeg('segGfx', opts.gfx, v => { opts.gfx = v as typeof opts.gfx; R.setQuality?.(opts.gfx); saveOpts(); });
$('camBtn').addEventListener('click', cycleCamera); $('viewBtn').addEventListener('click', cycleView); setView(opts.view, false); $('camHBtn').addEventListener('click', cycleCamH); setCamH(opts.camH, false);
window.addEventListener('wheel', e => { if (state === 'play' && !e.ctrlKey && !(e.target as HTMLElement | null)?.closest?.('#xtPanel')) setView(opts.view + Math.sign(e.deltaY) * 0.1); }, { passive: true });
bindSeg('segSnd', audio.on ? 'on' : 'off', v => { audio.on = v === 'on'; opts.sound = audio.on; });
$('startBtn').addEventListener('click', () => { ensureAudio(); if (opts.mode === 'cup') { openCup(); return; } startMatch(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', () => resumeGame());
$('restartBtn').addEventListener('click', () => startMatch());
$('soundBtn').addEventListener('click', () => { audio.on = !audio.on; opts.sound = audio.on; CMT.sound = audio.on; if (!audio.on) cmtStop(); $('soundBtn').textContent = audio.on ? '소리 끄기' : '소리 켜기'; ensureAudio(); if (audio.on) crowdStart(); else crowdStop(); });
$('quitBtn').addEventListener('click', () => toMenu());
// 해설: 음성(자막 포함) → 자막만 → 끄기
// 세리머니 고르기: 일시정지 버튼으로 기본값(자동 → 두 팔 번쩍 → 비행기 → 주먹), 골을 넣은 뒤엔 방향키 ↑ ← → 로 그 자리에서 바꾼다
const celeLabel = () => { $('celeBtn').textContent = '세리머니: ' + (opts.cele < 0 ? '자동' : CELE_NAMES[opts.cele]); };
CELE.pick = opts.cele; celeLabel();
$('celeBtn').addEventListener('click', () => { opts.cele = opts.cele >= 2 ? -1 : opts.cele + 1; CELE.pick = opts.cele; celeLabel(); saveOpts(); });
CMT.mode = opts.cmt; CMT.sound = opts.sound; CMT.voice = opts.voice;
/** 해설 버튼 글자: 한국어 목소리가 둘 이상이면 몇 번째 목소리인지도 (목소리 목록은 늦게 오므로 일시정지를 열 때 다시 쓴다) */
function cmtLabel() { const v = cmtVoiceInfo(); $('cmtBtn').textContent = '해설: ' + CMT_NAME[CMT.mode] + (CMT.mode === 'voice' && v.n > 1 ? ` ${v.i + 1}/${v.n}` : ''); }
cmtLabel();
// 누를 때마다: 음성 1 → 음성 2 → … → 자막 → 끄기. 목소리를 바꾸면 그 목소리로 한마디 들려준다
$('cmtBtn').addEventListener('click', () => {
  const v = cmtVoiceInfo();
  if (CMT.mode === 'voice' && v.i < v.n - 1) { opts.voice = cmtVoiceSet(v.i + 1); cmtSample(); }
  else if (CMT.mode === 'voice') { CMT.mode = opts.cmt = 'text'; cmtStop(); }
  else if (CMT.mode === 'text') { CMT.mode = opts.cmt = 'off'; cmtStop(); }
  else { CMT.mode = opts.cmt = 'voice'; opts.voice = cmtVoiceSet(0); if (v.n > 1) cmtSample(); }
  cmtLabel(); saveOpts();
});
$('againBtn').addEventListener('click', () => { ensureAudio(); startMatch(); });
$('menuBtn2').addEventListener('click', () => toMenu());
$('hostBtn').addEventListener('click', () => { ensureAudio(); netHost(); });
$('joinBtn').addEventListener('click', () => { ensureAudio(); netJoin(($('codeIn') as HTMLInputElement).value); });
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') { ensureAudio(); netJoin(($('codeIn') as HTMLInputElement).value); } });
$('codeIn').addEventListener('input', e => { const t = e.target as HTMLInputElement; t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(NET.code); $('copyBtn').textContent = '복사됨'; window.setTimeout(() => { $('copyBtn').textContent = '복사'; }, 1500); } catch { /* */ } });
window.addEventListener('beforeunload', () => { if (NET.ready) netSend({ t: 'quit' }); });
renderMenu(); renderMenuTactics();

/* ---------- xT 패널 ---------- */
// 연구(R&E)의 분할×xT 표를 경기에 붙인 것 (src/xt/). 표(public/xt/xt_tables.json)가 없으면 버튼 자체가 안 보인다.
// 'xT' 버튼·G 키로 옆 패널(공 위치 xT의 실시간 그래프 + 구역 지도)을 열고 격자·모델·T를 고른다.
// 패널이 열린 동안은 양 팀을 AI가 몬다(조작 'AI가 대신' — 사람 조작을 빼 두었다가 닫거나 '직접'으로 바꾸면 되돌린다), 속도 1/2/4배.
// 경기 화면은 패널 오른쪽에 16:9 영상처럼 놓인다(`layoutStage`). '전체'는 격자 4 × 모델 3 그래프를 한꺼번에
let autoHU: [Human | null, Human | null] | null = null;
let xtFrame = 0;
const xtUsable = () => !!XT.tb && !!sim && NET.role !== 'guest' && state !== 'menu';
function xtSync() {
  const ok = xtUsable(), tb = XT.tb; if (!ok) { XT.on = false; XT.all = false; }
  $('xtBtn').hidden = !ok; $('xtBtn').setAttribute('aria-pressed', String(XT.on)); $('xtPanel').hidden = !XT.on; document.body.classList.toggle('xto', XT.on); /* 패널이 열려 있으면 일시정지·결과 카드를 오른쪽으로 민다 */
  $('xtPanel').classList.toggle('all', XT.all); $('xtRowPart').hidden = XT.all; $('xtRowModel').hidden = XT.all; { const net = !!sim && sim.M.net; $('xtRowCtl').hidden = net; $('xtRowSpeed').hidden = net || !XT.auto; }
  setSeg('segXtView', XT.all ? 'all' : 'one'); setSeg('segXtPart', XT.part); setSeg('segXtModel', XT.model); setSeg('segXtT', XT.T); setSeg('segXtWin', XT.win); setSeg('segXtSpeed', XT.speed); setSeg('segXtCtl', XT.auto ? 'ai' : 'me');
  if (tb) {
    $('xtAllBtn').textContent = `전체 ${PARTS.length * modelsOf(tb).length}개`;
    $('segXtPart').querySelectorAll('button').forEach(b => { b.disabled = !has(tb, b.dataset.v as Part, XT.model, XT.T); });
    $('segXtModel').querySelectorAll('button').forEach(b => { b.disabled = !PARTS.some(p => has(tb, p, b.dataset.v as Model, XT.T)); });
    $('segXtT').querySelectorAll('button').forEach(b => { b.disabled = !PARTS.some(p => MODELS.some(m => has(tb, p, m, b.dataset.v as TKey))); });
  }
  $('xtNote').textContent = panelNote(); xtFrame = 0; applyAuto(); layoutStage();
}
function xtChanged() { fixSelection(); opts.xt = { part: XT.part, model: XT.model, T: XT.T }; saveOpts(); refreshMap(); xtSync(); if (state === 'over') fillXtResult(); }
function toggleXt(on = !XT.on) { if (!xtUsable()) return; XT.on = on; if (!on) XT.all = false; xtSync(); }
function setXtAll(all: boolean) { XT.all = all; XT.win = XT.all ? 'match' : 'recent'; xtSync(); }
/** 패널이 열려 있고 조작이 'AI가 대신'이면 사람 조작(HU)을 빼 두고, 닫거나 '직접'이면 되돌려 공에 가까운 선수로 커서를 잡는다 */
function applyAuto() {
  if (!sim) { autoHU = null; return; }
  const want = XT.on && XT.auto && !sim.M.net;
  if (want && !autoHU) { autoHU = [sim.HU[0], sim.HU[1]]; sim.HU[0] = sim.HU[1] = null; for (const I of INP) { dropKeys(I); clearPresses(I); I.tx = I.ty = 0; } }
  else if (!want && autoHU) { sim.HU[0] = autoHU[0]; sim.HU[1] = autoHU[1]; autoHU = null; for (const h of sim.HU) if (h) { h.charging = false; h.charge = 0; if (!sim.M.so) switchPlayer(sim, h); } }
  $('touch').hidden = !isTouch || !!autoHU || state === 'menu' || state === 'over';
}
/** 패널이 열려 있으면 경기 화면(#cv·#ov)을 패널 오른쪽에 16:9 영상처럼 놓는다. 닫으면 전체 화면. 자리가 너무 좁으면(폰 세로 등) 그대로 둔다 */
function layoutStage() {
  const cv = $('cv'), ov = $('ov'); let css = '';
  if (XT.on && !$('xtPanel').hidden) {
    const p = $('xtPanel').getBoundingClientRect(), m = 12, x0 = p.right + m, y0 = p.top, aw = window.innerWidth - m - x0, ah = window.innerHeight - m - y0;
    if (aw >= 260 && ah >= 150) { let w = aw, h = w * 9 / 16; if (h > ah) { h = ah; w = h * 16 / 9; } css = `left:${Math.round(x0 + (aw - w) / 2)}px;top:${Math.round(y0)}px;width:${Math.round(w)}px;height:${Math.round(h)}px;right:auto;bottom:auto;border-radius:10px;`; }
  }
  if (cv.style.cssText !== css || ov.style.cssText !== css) { cv.style.cssText = css; ov.style.cssText = css; R.resize(); }
}
function fillXtResult() {
  const el = $('rXt'); if (!sim || !XT.tb || NET.role === 'guest') { el.hidden = true; return; }
  const M = sim.M; el.innerHTML = resultHtml([M.teams[0].code, M.teams[1].code], [M.kit[0].c1, M.kit[1].c1]); el.hidden = false;
}
{ const o = opts.xt; if ((PARTS as string[]).includes(o.part)) XT.part = o.part as Part; if ((MODELS as string[]).includes(o.model)) XT.model = o.model as Model; if ((TKEYS as string[]).includes(o.T)) XT.T = o.T as TKey; }
$('xtBtn').addEventListener('click', () => toggleXt()); $('xtClose').addEventListener('click', () => toggleXt(false));
for (const [id, key] of [['xtGraph', 'hover'], ['xtMap', 'hoverMap']] as const) { // 그래프·지도에 커서(폰은 손가락)를 올리면 그 지점의 값
  const el = $(id), mv = (e: PointerEvent) => { const r = el.getBoundingClientRect(); XT[key] = { x: e.clientX - r.left, y: e.clientY - r.top }; xtFrame = 0; };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerdown', mv); el.addEventListener('pointerleave', () => { XT[key] = null; xtFrame = 0; }); el.addEventListener('pointercancel', () => { XT[key] = null; });
}
bindSeg('segXtView', 'one', v => setXtAll(v === 'all'));
bindSeg('segXtPart', XT.part, v => { XT.part = v as Part; xtChanged(); });
bindSeg('segXtModel', XT.model, v => { XT.model = v as Model; xtChanged(); });
bindSeg('segXtT', XT.T, v => { XT.T = v as TKey; xtChanged(); });
bindSeg('segXtWin', XT.win, v => { XT.win = v as typeof XT.win; xtFrame = 0; });
bindSeg('segXtSpeed', 1, v => { XT.speed = +v; });
bindSeg('segXtCtl', 'ai', v => { XT.auto = v === 'ai'; xtSync(); });
for (const id of ['xtBtn', 'xtPanel']) $(id).addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur()); // 버튼에 포커스가 남으면 Space(P2 키) 등이 버튼을 다시 누른다
void loadXt().then(() => xtSync());

/* ---------- 루프 ---------- */
function runSteps(dt: number) {
  if (!sim) return;
  acc += dt * (sim.M.slow > 0 ? 0.35 : 1) * sim.M.tempo * (autoHU ? XT.speed : 1); // 골 직후 슬로우모션 · 경기 템포 · xT 전체 보기(AI 자동)의 속도 배율
  let n = 0;
  while (acc >= STEP && n < 6) {
    step(sim, STEP); acc -= STEP; n++; drain(sim);
    if (XT.tb && sim.M.tick % SAMPLE_EVERY === 0) { const b = sim.ball; xtSample(sim.M.tick, b.x, b.y, b.owner ? b.owner.t : (b.lastTouch === 1 ? 1 : 0), sim.M.phase === 'live'); }
    if (NET.role === 'host' && NET.ready && sim.M.tick % 2 === 0 && state === 'play') netSend(makeSnap(sim, perf, R.cam.shake));
    if (state !== 'play') break;
  }
  if (n === 6) acc = 0;
}
// 온라인 호스트: 시뮬레이션을 렌더 프레임과 분리해 60Hz 타이머로 돌린다 (프레임이 끊겨도 상대 화면은 계속 간다)
window.setInterval(() => {
  if (NET.role !== 'host' || state !== 'play' || !sim) return;
  const now = performance.now() / 1000, dt = simLast ? Math.min(0.1, now - simLast) : STEP; simLast = now; perf = now;
  if (sim.M.slow > 0) sim.M.slow = Math.max(0, sim.M.slow - dt);
  runSteps(dt);
}, 1000 / 60);
function frame(ts: number) {
  requestAnimationFrame(frame); const now = ts / 1000; const rawDt = lastTs ? now - lastTs : STEP, dt = Math.min(0.1, rawDt); lastTs = now; perf = now;
  pollGamepads({ inp: INP[0], isPlaying: () => state === 'play', togglePause: () => { if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame(); } });
  if (sim && sim.M.slow > 0 && !NET.role) sim.M.slow = Math.max(0, sim.M.slow - dt);
  if (introT > 0) { if (state === 'play') introT -= dt; if (introT <= 0) { endIntro(); lastTs = now; } }
  if (state === 'play' && sim) {
    if (NET.role === 'guest') netInterpNow();
    else if (NET.role !== 'host' && introT <= 0) runSteps(dt);
    if (sim) { const sc = sim.M.scorer; CELE.team = sim.HU[LOCAL()] ? LOCAL() : -1; if (sim.M.phase !== 'goal') CELE.live = -1; else if (sc && sc.t === CELE.team) { const I = INP[0]; if (I.my < -0.5) CELE.live = 0; else if (I.mx < -0.5) CELE.live = 1; else if (I.mx > 0.5) CELE.live = 2; }
      updateHud(sim, LOCAL()); halftimePanel(sim); gauges(sim); skipHint(sim); cmtTick(state === 'play' && introT <= 0 && sim.M.phase !== 'full'); }
  } else if (state === 'paused' && NET.role === 'guest' && sim) netInterpNow();
  netPing(perf);
  R.render(sim, dt, perf, state === 'paused');
  if (XT.on && sim && state !== 'menu' && xtFrame++ % 4 === 0) $('xtNow').textContent = renderPanel($('xtGraph') as HTMLCanvasElement, $('xtMap') as HTMLCanvasElement, sim.M.tick, [sim.M.teams[0].code, sim.M.teams[1].code], sim.ball);
  if (rawDt < 0.2 && document.visibilityState === 'visible') autoQuality(dt);
}
// 프레임이 3초 넘게 28fps 아래면 품질을 한 단계 내린다 (자동, 올리지는 않음)
let lowT = 0;
function autoQuality(dt: number) {
  if (state !== 'play' || R.fps == null) return;
  if (R.fps < 28) { lowT += dt; if (lowT > 3 && opts.gfx !== 'low') { opts.gfx = opts.gfx === 'high' ? 'mid' : 'low'; R.setQuality?.(opts.gfx); setSeg('segGfx', opts.gfx); saveOpts(); lowT = 0; } } else lowT = Math.max(0, lowT - dt);
}
let htShown = false;
function halftimePanel(s: Sim) {
  const on = s.M.phase === 'halftime';
  if (on && !htShown) { htShown = true; const M = s.M, tp = M.stats.poss[0] + M.stats.poss[1], p0 = Math.round(M.stats.poss[0] / tp * 100);
    $('hN0b').textContent = M.teams[0].code; $('hN1b').textContent = M.teams[1].code; $('hC0b').style.background = M.kit[0].c1; $('hC1b').style.background = M.kit[1].c1; $('hScore').textContent = `${M.score[0]} : ${M.score[1]}`;
    const rows: [string, string | number, string | number][] = [['슈팅', M.stats.shots[0], M.stats.shots[1]], ['유효 슈팅', M.stats.onT[0], M.stats.onT[1]], ['점유율', p0 + '%', (100 - p0) + '%'], ['패스 성공', `${M.stats.passC[0]}/${M.stats.passA[0]}`, `${M.stats.passC[1]}/${M.stats.passA[1]}`], ['파울', M.stats.fouls[0], M.stats.fouls[1]]];
    $('hRows').innerHTML = rows.map(r => `<div class="rs"><span>${r[1]}</span><em>${r[0]}</em><span>${r[2]}</span></div>`).join(''); $('htStats').hidden = false; }
  else if (!on && htShown) { htShown = false; $('htStats').hidden = true; }
}
// 터치 버튼 게이지: 슛 파워, 패스·롱패스 누른 시간
/** 골 세리머니·리플레이 중: '패스 키 길게 = 건너뛰기' 안내 (실제 건너뛰기는 시뮬 `step`의 goal 분기) */
function skipHint(s: Sim) {
  const el = $('skipHint'), M = s.M, on = state === 'play' && M.phase === 'goal' && !M.so && !!s.HU[LOCAL()];
  const myGoal = on && !!M.scorer && M.scorer.t === LOCAL();
  if (el.hidden === on) { el.hidden = !on; if (on) el.textContent = (myGoal ? (isTouch ? '스틱 ↑ ← → 세리머니 · ' : '방향키 ↑ ← → 세리머니 · ') : '') + (isTouch ? `${$('bA').textContent || '패스'} 버튼 길게 · 건너뛰기` /* 버튼 글자는 상황(공격 패스·수비 전환)에 따라 바뀐다 */ : `${keyOf('pass') || '패스 키'} 길게 · 건너뛰기`); }
  if (on) el.classList.toggle('on', INP[0].down.pass);
}
function gauges(s: Sim) {
  if (!isTouch) return; const h = s.HU[LOCAL()], I = INP[0]; if (!h) return;
  touchGauge('bB', h.charging ? h.charge : 0, h.charge > 0.8);
  touchGauge('bA', I.down.pass ? Math.min(1, Math.max(0, (I.holdT.pass - 0.12) / 0.45)) : I.down.lob ? Math.min(1, Math.max(0, (I.holdT.lob - 0.1) / 0.5)) : 0); // 패스 버튼을 위로 밀면 로빙 게이지
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* http 등에선 불가 */ }); });
function resize() { layoutStage(); R.resize(); $('rotateTip').hidden = !(isTouch && R.ch > R.cw); }
window.addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
if (import.meta.env.DEV) (window as unknown as { __KO11: unknown }).__KO11 = { R, getSim: () => sim, INP, startMatch, perfNow: () => perf, XT, frame, dbg: () => ({ state, introT, acc, lastTs, role: NET.role, auto: !!autoHU }) };
