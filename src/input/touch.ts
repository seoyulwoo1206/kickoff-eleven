import { keyDown, keyUp, keyCancel, keyHold, type Inp, type Act } from './actions';

/* 왼쪽 55% 화면 어디든 누르면 그 자리에 아날로그 조이스틱이 뜬다. 오른쪽은 질주·패스·스루·슛 버튼 (누른 채 밀면 다른 동작) */
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const STICK_R = 58;
export interface TouchOpts { stickSprint: boolean; /** 버튼이 공격용인가 (우리 공 — `hud.ts`의 버튼 글자와 같은 기준) */ attack: boolean; /** 밀어서 바꾼 버튼 글자를 되돌린다 */ relabel: () => void; }
let stickSprintOn = false;
export function installTouch(I: Inp, onTouch: () => void, getOpts: () => TouchOpts) {
  const stickArea = $('stickArea'), stickEl = $('stick'), knob = stickEl.querySelector('.knob') as HTMLElement;
  let stickId: number | null = null, ox = 0, oy = 0;
  const stickSet = (x: number, y: number) => {
    let dx = x - ox, dy = y - oy; const m = Math.hypot(dx, dy);
    if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const mag = Math.min(1, m / STICK_R);
    if (mag < 0.18) { I.tx = 0; I.ty = 0; } else { const a = Math.atan2(dy, dx); I.tx = Math.cos(a) * mag; I.ty = Math.sin(a) * mag; }
    // 스틱을 끝까지(원 밖으로) 밀면 질주 (옵션)
    const want = getOpts().stickSprint && m > STICK_R * 1.15;
    if (want && !stickSprintOn) { stickSprintOn = true; keyDown(I, 'sprint'); } else if (!want && stickSprintOn && m < STICK_R * 1.0) { stickSprintOn = false; keyUp(I, 'sprint'); }
    stickEl.classList.toggle('sprint', stickSprintOn);
  };
  stickArea.addEventListener('pointerdown', e => {
    if (stickId !== null) return; e.preventDefault(); try { stickArea.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 */ }
    stickId = e.pointerId; ox = e.clientX; oy = e.clientY; stickEl.style.left = ox + 'px'; stickEl.style.top = oy + 'px'; stickEl.style.bottom = 'auto'; stickEl.classList.remove('rest'); I.touch = true; onTouch(); stickSet(e.clientX, e.clientY);
  });
  stickArea.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickSet(e.clientX, e.clientY); });
  const stickEnd = (e: PointerEvent) => { if (e.pointerId !== stickId) return; stickId = null; stickEl.style.left = stickEl.style.top = stickEl.style.bottom = ''; stickEl.classList.add('rest'); /* 쉬는 자리(CSS)로 */ knob.style.transform = ''; I.tx = 0; I.ty = 0; if (stickSprintOn) { stickSprintOn = false; keyUp(I, 'sprint'); } };
  stickArea.addEventListener('pointerup', stickEnd); stickArea.addEventListener('pointercancel', stickEnd); stickArea.addEventListener('lostpointercapture', stickEnd);
  /* 버튼 4개(41차, FC 모바일 식): 패스·스루·슛이 질주 버튼을 둘러싼다. 버튼을 누른 채 SW px 넘게 밀면 그 방향의 다른 동작 —
     패스 ↑ 로빙(롱패스·크로스)·↓ 주고 뛰기(50차, Q를 누른 채 패스)·옆으로 동료 호출(49차), 스루 ↑ 침투 요청(50차), 슛 ↑ 칩슛·↓ 감아차기(50차에 뒤집음 — FC 모바일 조작표), 질주 = 밀면 개인기(수비 땐 ↑ 키퍼 나오기·그 밖 동료 압박). 수비 땐 패스 = 전환, 스루 = 슬라이딩, 슛 = 태클.
     밀기는 기존 액션 키를 대신 눌러 주는 것이라 시뮬·온라인 입력은 그대로다 */
  const SW = 24;
  type Dir4 = 'u' | 'd' | 'l' | 'r';
  const bindBtn = (el: HTMLElement, down: () => void, up: () => void, swipe?: (dir: Dir4, dx: number, dy: number) => string | void) => {
    let id: number | null = null, sx = 0, sy = 0, swiped = false;
    el.addEventListener('pointerdown', e => { e.preventDefault(); if (id !== null) return; try { el.setPointerCapture(e.pointerId); } catch { /* */ } id = e.pointerId; sx = e.clientX; sy = e.clientY; swiped = false; el.classList.add('down'); I.touch = true; onTouch(); down(); });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id || swiped || !swipe) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.hypot(dx, dy) < SW) return;
      swiped = true; const alt = swipe(Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'u' : 'd') : (dx < 0 ? 'l' : 'r'), dx, dy); if (alt) { el.textContent = alt; el.classList.add('alt'); }
    });
    const end = (e: PointerEvent) => { if (id === null || (e.type !== 'lostpointercapture' && e.pointerId !== id)) return; id = null; el.classList.remove('down'); const was = el.classList.contains('alt'); el.classList.remove('alt'); up(); if (was) getOpts().relabel(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  const tap = (k: Act, ms = 50) => { keyDown(I, k); window.setTimeout(() => keyUp(I, k), ms); };
  // 패스 / 전환
  { let alt: Act | 'go' | null = null;
    bindBtn($('bA'), () => { alt = null; keyDown(I, 'pass'); }, () => {
      if (alt === 'go') { keyUp(I, 'pass'); window.setTimeout(() => keyUp(I, 'run'), 90); } // 패스가 나간 뒤에 Q를 뗀다
      else if (alt) { if (alt === 'lob') keyUp(I, 'lob'); } else keyUp(I, 'pass'); alt = null;
    }, dir => {
      if (!getOpts().attack) return;
      if (dir === 'd') { alt = 'go'; keyHold(I, 'run'); return '주고뛰기'; } // 아래로: 주고 뛰기 — 패스는 떼는 순간 그대로 나가고 준 선수가 뛰어 들어간다
      const held = I.holdT.pass; keyCancel(I, 'pass');
      if (dir === 'l' || dir === 'r') { alt = 'jockey'; tap('jockey'); return '호출'; } // 옆으로: 동료 호출 (C 탭)
      alt = 'lob'; keyDown(I, 'lob'); I.holdT.lob = held; return '로빙'; // 위로: 누른 시간은 이어받는다 (길게 = 멀리)
    }); }
  // 슛 / 태클: 공격 때 누른 채 ↑ 칩슛(Q를 누른 채 슛)·↓ 감아차기(Z를 누른 채 슛)
  { let mod: Act | null = null;
    bindBtn($('bB'), () => { mod = null; keyDown(I, 'shoot'); }, () => { keyUp(I, 'shoot'); if (mod) { const m = mod; window.setTimeout(() => keyUp(I, m), 90); } mod = null; }, dir => {
      if (!getOpts().attack) return;
      if (dir === 'l' || dir === 'r') { keyDown(I, 'pass'); window.setTimeout(() => keyCancel(I, 'pass'), 60); return '페이크'; } // 옆으로: 페이크 슛(52차) — 슛을 모으는 중 패스 키. 뗀 것으로 치지 않게 거둔다(패스가 나가지 않게)
      mod = dir === 'u' ? 'run' : 'chip'; keyDown(I, mod); return dir === 'u' ? '칩슛' : '감아차기';
    }); }
  // 스루 / 슬라이딩 (수비 땐 롱패스 키 = 슬라이딩). 공격 땐 떼는 순간 스루패스 — 누른 채 위로 밀면 스루 대신 침투 요청(Q 탭)이라 누르는 순간엔 못 찬다
  { let k: Act | null = null, run = false, low = false;
    bindBtn($('bD'), () => { run = false; low = false; k = getOpts().attack ? 'through' : 'lob'; keyDown(I, k); }, () => { if (run) keyUp(I, 'run'); /* 53차: 침투 요청은 버튼을 뗄 때까지 Q를 누른 것 — 0.25초 넘게 누르다 떼면 그때 조이스틱 쪽으로 뛴다 */ if (k) keyUp(I, k); k = null; if (low) { low = false; window.setTimeout(() => keyCancel(I, 'chip'), 90); } }, dir => {
      if (k === 'through' && !run && dir === 'd') { const held = I.holdT.through; keyCancel(I, 'through'); keyHold(I, 'chip'); keyDown(I, 'lob'); I.holdT.lob = held; k = 'lob'; low = true; return '낮게'; } // 아래로(52차): 땅볼 크로스·낮은 롱패스 (감아차기 키를 누른 채 롱패스) — 떼는 순간 나간다
      if (k !== 'through' || run || dir !== 'u') return; run = true; keyCancel(I, 'through'); k = null; keyDown(I, 'run'); return '침투'; // 51차: 스루패스는 누른 시간이 세기(떼는 순간 나간다) — 위로 밀면 스루를 거두고 침투 요청
    }); }
  // 질주: 누른 채 밀면 — 공격: 개인기(달리는 쪽이면 치달), 수비: ↑ 키퍼 나오기(누르는 동안)·그 밖 동료 압박
  { let gk = false;
    bindBtn($('bC'), () => { gk = false; keyDown(I, 'sprint'); }, () => { keyUp(I, 'sprint'); if (gk) { gk = false; keyUp(I, 'gkRush'); } }, (dir, dx, dy) => {
      if (getOpts().attack) { I.skill = { x: dx, y: dy }; tap('gkRush', 40); return '개인기'; }
      if (dir === 'u') { gk = true; keyDown(I, 'gkRush'); return '키퍼'; }
      tap('run'); return '압박';
    }); }
  // 오른쪽 빈 공간 스와이프 = 개인기 (방향은 화면 기준 → 경기장 기준으로 그대로 씀)
  const skillArea = $('skillArea'); let skId: number | null = null, skx = 0, sky = 0;
  skillArea.addEventListener('pointerdown', e => { if (skId !== null) return; skId = e.pointerId; skx = e.clientX; sky = e.clientY; try { skillArea.setPointerCapture(e.pointerId); } catch { /* */ } });
  const skEnd = (e: PointerEvent) => { if (e.pointerId !== skId) return; skId = null; const dx = e.clientX - skx, dy = e.clientY - sky; if (Math.hypot(dx, dy) >= 36) { I.touch = true; I.skill = { x: dx, y: dy }; keyDown(I, 'gkRush'); window.setTimeout(() => keyUp(I, 'gkRush'), 40); } };
  skillArea.addEventListener('pointerup', skEnd); skillArea.addEventListener('pointercancel', skEnd);
  window.addEventListener('touchstart', onTouch, { passive: true });
}

/** 버튼 게이지(누른 시간·슛 파워)를 원형으로 표시. frac 0~1, 0이면 지움 */
export function touchGauge(id: string, frac: number, hot = false) {
  const el = document.getElementById(id); if (!el) return;
  if (frac <= 0) { el.style.background = ''; return; }
  const col = hot ? '#ff5a4e' : '#ffb627';
  el.style.background = `conic-gradient(${col} ${Math.round(frac * 360)}deg, rgba(9,17,27,.5) 0)`;
}
/** 버튼 크기·투명도 (CSS 변수) */
export function applyTouchStyle(size: 'small' | 'normal' | 'large', alpha: 'light' | 'normal' | 'solid') {
  const r = document.documentElement.style;
  r.setProperty('--btn-scale', size === 'small' ? '0.82' : size === 'large' ? '1.2' : '1');
  r.setProperty('--btn-alpha', alpha === 'light' ? '0.45' : alpha === 'solid' ? '1' : '0.75');
}
