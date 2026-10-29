import type { Sim } from '../sim/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let hudCache = '', labelCache = '';
export function resetHud() { hudCache = ''; labelCache = ''; }
export function updateHud(s: Sim, local: number) {
  const { M, HU, ball } = s;
  const raw = Math.floor(M.time / M.len * 90), end = M.half === 1 ? 45 : M.half === 2 ? 90 : M.half === 3 ? 105 : 120, minute = Math.min(end, raw), extra = raw > end && M.added[M.half - 1] ? `+${Math.min(M.added[M.half - 1], raw - end)}` : '';
  const so = M.so ? ` (${M.so.kicks[0].filter(v => v).length}-${M.so.kicks[1].filter(v => v).length})` : '', key = M.score.join() + minute + extra + M.half + so;
  if (key !== hudCache) {
    hudCache = key; $('hN0').textContent = M.teams[0].code; $('hN1').textContent = M.teams[1].code; $('hC0').style.background = M.kit[0].c1; $('hC1').style.background = M.kit[1].c1;
    $('hS0').textContent = String(M.score[0]); $('hS1').textContent = String(M.score[1]); $('hClk').textContent = M.so ? '승부차기' + so : (M.half === 1 ? '전반 ' : M.half === 2 ? '후반 ' : M.half === 3 ? '연장 전반 ' : '연장 후반 ') + minute + extra + "'";
  }
  const h = HU[local], own = !!(h && h.ctrl && ball.owner === h.ctrl), lk = own ? 'a' : 'd';
  if (lk !== labelCache) { labelCache = lk; $('bA').textContent = own ? '패스' : '압박'; $('bB').textContent = own ? '슛' : '슬라이딩'; $('bD').textContent = own ? '스루' : '세컨드'; $('bL').textContent = own ? '롱패스' : '전환'; }
}
let bannerTimer = 0;
export function showBanner(big: string, small: string, ms: number, isGoal: boolean) {
  const b = $('banner'); $('bnBig').textContent = big; $('bnSmall').textContent = small; b.classList.toggle('goal', !!isGoal);
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }
