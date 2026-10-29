/* 앱 진입점: 상태 머신(menu/play/paused/over), 경기 시작, 프레임 루프, 시뮬 이벤트 → 연출, 온라인 연결 */
import './style.css';
import { TEAMS } from './data/teams';
import { STEP, TEMPO } from './sim/consts';
import { createMatch, step } from './sim/match';
import type { Sim, SimEvent } from './sim/types';
import { newInp, readInput, clearPresses, dropKeys, type Inp } from './input/actions';
import { installKeyboard } from './input/keyboard';
import { pollGamepads } from './input/gamepad';
import { installTouch } from './input/touch';
import { Renderer } from './render/canvas2d';
import { ThreeRenderer } from './render/three/scene';
import type { IRenderer, CamMode } from './render/types';
import { opts, loadOpts, saveOpts } from './options';
import { audio, ensureAudio, crowdStart, crowdStop, crowdSwell, sfx } from './audio';
import { NET, LOCAL, initPeer, netSend, netClose, netHost, netJoin, netPing } from './net/peer';
import { makeSnap, netInterp, applyNetInput, encodeInput, type NetMsg, type StartCfg, type Snap, type SnapBuf } from './net/protocol';
import { updateHud, resetHud, showBanner, hideBanner } from './ui/hud';
import { initMenu, renderMenu, setSeg, bindSeg, netStatus, NET_IDLE_MSG } from './ui/menu';
import { fillResult } from './ui/result';
import { randomSeed } from './sim/rng';
import { applySquadStrength, squadOf, displayName } from './data/squads';
import { defaultTactics, applyFormation, LINE_NAMES, STYLE_NAMES, PRESS_NAMES, type Tactics, type Style } from './sim/tactics';
import { substitute } from './sim/rules';
import { FORMATION_KEYS } from './data/formations';
import { overall } from './data/squad';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
type State = 'menu' | 'play' | 'paused' | 'over';
let state: State = 'menu';
let sim: Sim | null = null;
const INP: [Inp, Inp] = [newInp(), newInp()];
let isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
loadOpts();
function makeRenderer(): IRenderer {
  try { const c = document.createElement('canvas'); if (!c.getContext('webgl2') && !c.getContext('webgl')) throw new Error('no webgl'); return new ThreeRenderer($('cv') as HTMLCanvasElement, $('insets'), $('ov') as HTMLCanvasElement, opts.gfx); }
  catch (e) { console.warn('WebGL 사용 불가, 2D 렌더러로', e); $('ov').hidden = true; return new Renderer($('cv') as HTMLCanvasElement, $('insets')); }
}
const R: IRenderer = makeRenderer();
const CAMS: CamMode[] = ['tv', 'pro', 'top'], CAM_NAME = { tv: '중계', pro: '선수 뒤', top: '탑뷰' };
let camMode: CamMode = 'tv';
function cycleCamera() { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; R.setCamMode?.(camMode); $('camBtn').textContent = '카메라: ' + CAM_NAME[camMode]; }
let perf = 0, lastTs = 0, acc = 0, simLast = 0;
const snapBuf: SnapBuf = { buf: [], off: null };
const inSt = { lastIn: '', hb: 0 };

audio.on = opts.sound; applySquadStrength();

/* ---------- 경기 시작/종료 ---------- */
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
  for (const I of INP) { dropKeys(I); clearPresses(I); I.tx = I.ty = 0; }
  sim = createMatch({
    teams: [a, b], len: opts.len, diff: opts.diff, tempo: TEMPO[opts.tempo], firstKick: cfg ? cfg.fk : (Math.random() < 0.5 ? 0 : 1),
    humans: [{ tag: tag(0), col: '#ffb627', cursor: cur(0) }, twoP ? { tag: tag(1), col: '#4fd3ff', cursor: cur(1) } : null],
    net, seed: cfg ? cfg.seed : randomSeed(), guest: NET.role === 'guest', squads: [squadOf(a), squadOf(b)],
    tactics: net ? [null, null] : [menuTac[0], menuTac[1]],
  }, INP);
  renderPauseTactics();
  if (NET.role === 'guest') { snapBuf.buf = []; snapBuf.off = null; }
  R.reset(); acc = 0; simLast = 0; state = 'play';
  $('menu').hidden = true; $('result').hidden = true; $('pause').hidden = true; $('hud').hidden = false; $('pauseBtn').hidden = false; $('touch').hidden = !isTouch;
  $('hPing').hidden = !net; showPing();
  resetHud(); drain(sim); updateHud(sim, LOCAL()); crowdStart();
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
    case 'banner': showBanner(e.big, e.small, e.ms, e.goal); ev('b', [e.big, e.small, e.ms, e.goal]); break;
    case 'sfx': sfx(e.type); ev('x', e.type); break;
    case 'crowd': crowdSwell(e.amt, e.dur); ev('c', [e.amt, e.dur]); break;
    case 'puff': R.puff(e.x, e.y, e.n, e.sp); break;
    case 'shake': R.cam.shake = Math.max(R.cam.shake, e.v); break;
    case 'hud': resetHud(); break;
    case 'card': case 'sub': renderPauseTactics(); break;
    case 'full': fullTime(); break;
  }
}
function fullTime() {
  if (!sim) return; sim.M.phase = 'full'; state = 'over'; $('touch').hidden = true;
  if (NET.role === 'host') { netSend(makeSnap(sim, perf, R.cam.shake)); netSend({ t: 'ev', k: 'full' }); }
  if (NET.role !== 'guest') sfx('long');
  fillResult(sim, LOCAL(), NET.role === 'guest');
  window.setTimeout(() => { if (state === 'over') { $('result').hidden = false; ($('againBtn') as HTMLButtonElement).focus(); } }, 900);
  if (NET.role !== 'guest') { const M = sim.M; showBanner('FULL TIME', `${M.teams[0].code} ${M.score[0]} - ${M.score[1]} ${M.teams[1].code}`, 1400, false); }
}
function pauseGame(remote?: boolean) {
  if (state !== 'play') return; state = 'paused'; $('pause').hidden = false; renderPauseTactics(); $('soundBtn').textContent = audio.on ? '소리 끄기' : '소리 켜기'; $('restartBtn').hidden = NET.role === 'guest';
  for (const I of INP) dropKeys(I); ($('resumeBtn') as HTMLButtonElement).focus(); if (remote !== true && NET.ready) netSend({ t: 'pause' });
}
function resumeGame(remote?: boolean) { if (state !== 'paused') return; state = 'play'; $('pause').hidden = true; lastTs = 0; simLast = 0; if (remote !== true && NET.ready) netSend({ t: 'resume' }); }
function toMenu(remote?: boolean) {
  if (remote !== true && NET.ready && state !== 'menu') netSend({ t: 'quit' });
  state = 'menu'; sim = null; crowdStop();
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
installKeyboard({ inp: INP, isPlaying: () => state === 'play', hasLocalP2: () => !!(sim && sim.M.twoP && !NET.role), togglePause: () => { if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame(); }, cycleCamera });
installTouch(INP[0], () => { if (!isTouch) { isTouch = true; if (state === 'play' || state === 'paused') $('touch').hidden = false; } });
window.addEventListener('blur', () => { for (const I of INP) dropKeys(I); if (state === 'play' && !NET.ready) pauseGame(); }); // 온라인에선 창 포커스만 잃어도 상대를 기다리게 하지 않는다
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pauseGame(); });

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
    if (menuTacTeam[t] !== opts.sel[t]) { menuTacTeam[t] = opts.sel[t]; const sq = squadOf(T); Object.assign(menuTac[t], defaultTactics(sq?.formation)); }
    tacRows('tac' + t, menuTac[t], () => { /* 값은 menuTac에 바로 저장됨 */ });
  }
  $('tacBox').classList.toggle('locked', opts.mode === 'net');
}
// 일시정지 메뉴: 로컬 팀 전술 + 교체 (온라인에선 숨김)
function renderPauseTactics() {
  const box = $('pauseTac'); if (!sim || sim.M.net) { box.hidden = true; return; } box.hidden = false;
  const t = LOCAL(), s = sim, tac = s.M.tac[t];
  tacRows('ptac', tac, () => { if (sim) applyFormation(sim, t, tac.form); });
  const field = s.team[t].filter(p => !p.off), bench = s.M.bench[t];
  const outSel = $('subOut') as HTMLSelectElement, inSel = $('subIn') as HTMLSelectElement;
  outSel.innerHTML = field.map(p => `<option value="${p.i}">${p.pos} ${displayName(p, opts.names)} ${p.ovr}${p.sta < 0.5 ? ' (지침)' : ''}</option>`).join('');
  inSel.innerHTML = bench.map((d, i) => `<option value="${i}">${d.pos} ${opts.names === 'real' ? d.name : d.nameEn.split(' ').map(w => w[0]).join('.')} ${overall(d)}</option>`).join('');
  $('subNote').textContent = `교체 ${s.M.subs[t]}/5` + (bench.length ? '' : ' · 벤치 없음');
  ($('subBtn') as HTMLButtonElement).disabled = s.M.subs[t] >= 5 || !bench.length;
}
$('subBtn').addEventListener('click', () => {
  if (!sim) return; const t = LOCAL(), out = sim.team[t].find(p => p.i === +($('subOut') as HTMLSelectElement).value), inDef = sim.M.bench[t][+($('subIn') as HTMLSelectElement).value];
  if (out && inDef && substitute(sim, t, out, inDef)) { drain(sim); renderPauseTactics(); }
});

/* ---------- 메뉴 ---------- */
initMenu({ onSelChange: () => { netSendLobby(); renderMenuTactics(); } });
bindSeg('segMode', opts.mode, v => { if (opts.mode === 'net' && v !== 'net') { netClose(); netStatus(NET_IDLE_MSG); } opts.mode = v as typeof opts.mode; renderMenu(); renderMenuTactics(); });
bindSeg('segLen', opts.len, v => { opts.len = +v; netSendLobby(); });
bindSeg('segDiff', opts.diff, v => { opts.diff = v as typeof opts.diff; });
bindSeg('segTempo', opts.tempo, v => { opts.tempo = v as typeof opts.tempo; saveOpts(); });
bindSeg('segCursor', opts.cursor, v => { opts.cursor = v as typeof opts.cursor; saveOpts(); });
bindSeg('segNames', opts.names, v => { opts.names = v as typeof opts.names; saveOpts(); });
bindSeg('segGfx', opts.gfx, v => { opts.gfx = v as typeof opts.gfx; R.setQuality?.(opts.gfx); saveOpts(); });
$('camBtn').addEventListener('click', cycleCamera);
bindSeg('segSnd', audio.on ? 'on' : 'off', v => { audio.on = v === 'on'; opts.sound = audio.on; });
$('startBtn').addEventListener('click', () => { ensureAudio(); startMatch(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', () => resumeGame());
$('restartBtn').addEventListener('click', () => startMatch());
$('soundBtn').addEventListener('click', () => { audio.on = !audio.on; opts.sound = audio.on; $('soundBtn').textContent = audio.on ? '소리 끄기' : '소리 켜기'; ensureAudio(); if (audio.on) crowdStart(); else crowdStop(); });
$('quitBtn').addEventListener('click', () => toMenu());
$('againBtn').addEventListener('click', () => { ensureAudio(); startMatch(); });
$('menuBtn2').addEventListener('click', () => toMenu());
$('hostBtn').addEventListener('click', () => { ensureAudio(); netHost(); });
$('joinBtn').addEventListener('click', () => { ensureAudio(); netJoin(($('codeIn') as HTMLInputElement).value); });
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') { ensureAudio(); netJoin(($('codeIn') as HTMLInputElement).value); } });
$('codeIn').addEventListener('input', e => { const t = e.target as HTMLInputElement; t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(NET.code); $('copyBtn').textContent = '복사됨'; window.setTimeout(() => { $('copyBtn').textContent = '복사'; }, 1500); } catch { /* */ } });
window.addEventListener('beforeunload', () => { if (NET.ready) netSend({ t: 'quit' }); });
renderMenu(); renderMenuTactics();

/* ---------- 루프 ---------- */
function runSteps(dt: number) {
  if (!sim) return;
  acc += dt * (sim.M.slow > 0 ? 0.35 : 1) * sim.M.tempo; // 골 직후 슬로우모션 · 경기 템포
  let n = 0;
  while (acc >= STEP && n < 6) {
    step(sim, STEP); acc -= STEP; n++; drain(sim);
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
  if (state === 'play' && sim) {
    if (NET.role === 'guest') netInterpNow();
    else if (NET.role !== 'host') runSteps(dt);
    if (sim) updateHud(sim, LOCAL());
  } else if (state === 'paused' && NET.role === 'guest' && sim) netInterpNow();
  netPing(perf);
  R.render(sim, dt, perf, state === 'paused');
  if (rawDt < 0.2 && document.visibilityState === 'visible') autoQuality(dt);
}
// 프레임이 3초 넘게 28fps 아래면 품질을 한 단계 내린다 (자동, 올리지는 않음)
let lowT = 0;
function autoQuality(dt: number) {
  if (state !== 'play' || R.fps == null) return;
  if (R.fps < 28) { lowT += dt; if (lowT > 3 && opts.gfx !== 'low') { opts.gfx = opts.gfx === 'high' ? 'mid' : 'low'; R.setQuality?.(opts.gfx); setSeg('segGfx', opts.gfx); saveOpts(); lowT = 0; } } else lowT = Math.max(0, lowT - dt);
}
function resize() { R.resize(); $('rotateTip').hidden = !(isTouch && R.ch > R.cw); }
window.addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
if (import.meta.env.DEV) (window as unknown as { __KO11: unknown }).__KO11 = { R, getSim: () => sim, INP, startMatch, perfNow: () => perf };
