import { keyDown, keyUp, type Inp } from './actions';

/* 왼쪽 55% 화면 어디든 누르면 그 자리에 아날로그 조이스틱이 뜬다. 오른쪽은 패스·슛·질주·스루 버튼 */
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const STICK_R = 58;
export interface TouchOpts { stickSprint: boolean; }
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
    stickId = e.pointerId; ox = e.clientX; oy = e.clientY; stickEl.style.left = ox + 'px'; stickEl.style.top = oy + 'px'; stickEl.hidden = false; I.touch = true; onTouch(); stickSet(e.clientX, e.clientY);
  });
  stickArea.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickSet(e.clientX, e.clientY); });
  const stickEnd = (e: PointerEvent) => { if (e.pointerId !== stickId) return; stickId = null; stickEl.hidden = true; knob.style.transform = ''; I.tx = 0; I.ty = 0; if (stickSprintOn) { stickSprintOn = false; keyUp(I, 'sprint'); } };
  stickArea.addEventListener('pointerup', stickEnd); stickArea.addEventListener('pointercancel', stickEnd); stickArea.addEventListener('lostpointercapture', stickEnd);
  const bindBtn = (el: HTMLElement, down: () => void, up: () => void) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* */ } el.classList.add('down'); down(); });
    const end = () => { if (!el.classList.contains('down')) return; el.classList.remove('down'); up(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  bindBtn($('bA'), () => { I.touch = true; onTouch(); keyDown(I, 'pass'); }, () => keyUp(I, 'pass'));
  bindBtn($('bB'), () => { I.touch = true; onTouch(); keyDown(I, 'shoot'); }, () => keyUp(I, 'shoot'));
  bindBtn($('bC'), () => { I.touch = true; onTouch(); keyDown(I, 'sprint'); }, () => keyUp(I, 'sprint'));
  bindBtn($('bD'), () => { I.touch = true; onTouch(); keyDown(I, 'through'); }, () => keyUp(I, 'through'));
  bindBtn($('bL'), () => { I.touch = true; onTouch(); keyDown(I, 'lob'); }, () => keyUp(I, 'lob'));
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
  el.style.background = `conic-gradient(${col} ${Math.round(frac * 360)}deg, rgba(9,17,27,.55) 0)`;
}
/** 버튼 크기·투명도 (CSS 변수) */
export function applyTouchStyle(size: 'small' | 'normal' | 'large', alpha: 'light' | 'normal' | 'solid') {
  const r = document.documentElement.style;
  r.setProperty('--btn-scale', size === 'small' ? '0.82' : size === 'large' ? '1.2' : '1');
  r.setProperty('--btn-alpha', alpha === 'light' ? '0.45' : alpha === 'solid' ? '1' : '0.75');
}
