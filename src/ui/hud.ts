import type { Sim } from '../sim/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let hudCache = '', labelCache = '';
export function resetHud() { hudCache = ''; labelCache = ''; }
export function updateHud(s: Sim, local: number) {
  const { M, HU, ball } = s;
  const minute = Math.min(90, Math.floor(M.time / M.len * 90)), key = M.score.join() + minute + M.half;
  if (key !== hudCache) {
    hudCache = key; $('hN0').textContent = M.teams[0].code; $('hN1').textContent = M.teams[1].code; $('hC0').style.background = M.kit[0].c1; $('hC1').style.background = M.kit[1].c1;
    $('hS0').textContent = String(M.score[0]); $('hS1').textContent = String(M.score[1]); $('hClk').textContent = (M.half === 1 ? '전반 ' : '후반 ') + minute + "'";
  }
  const h = HU[local], own = !!(h && h.ctrl && ball.owner === h.ctrl), lk = own ? 'a' : 'd';
  if (lk !== labelCache) { labelCache = lk; $('bA').textContent = own ? '패스' : '압박'; $('bB').textContent = own ? '슛' : '슬라이딩'; $('bD').textContent = own ? '스루' : '전환'; }
}
let bannerTimer = 0;
export function showBanner(big: string, small: string, ms: number, isGoal: boolean) {
  const b = $('banner'); $('bnBig').textContent = big; $('bnSmall').textContent = small; b.classList.toggle('goal', !!isGoal);
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }
