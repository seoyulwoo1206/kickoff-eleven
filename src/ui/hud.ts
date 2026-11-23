import type { Sim } from '../sim/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let hudCache = '', labelCache = '', oursAt = -1e9; // oursAt: 마지막으로 우리 공이었던 때(ms)
export function resetHud() { hudCache = ''; labelCache = ''; oursAt = -1e9; }
export function updateHud(s: Sim, local: number) {
  const { M, HU, ball } = s;
  const raw = Math.floor(M.time / M.len * 90), end = M.half === 1 ? 45 : M.half === 2 ? 90 : M.half === 3 ? 105 : 120, minute = Math.min(end, raw), extra = raw > end && M.added[M.half - 1] ? `+${Math.min(M.added[M.half - 1], raw - end)}` : '';
  const so = M.so ? ` (${M.so.kicks[0].filter(v => v).length}-${M.so.kicks[1].filter(v => v).length})` : '', key = M.score.join() + minute + extra + M.half + so;
  if (key !== hudCache) {
    hudCache = key; $('hN0').textContent = M.teams[0].code; $('hN1').textContent = M.teams[1].code; $('hC0').style.background = M.kit[0].c1; $('hC1').style.background = M.kit[1].c1;
    $('hS0').textContent = String(M.score[0]); $('hS1').textContent = String(M.score[1]); $('hClk').textContent = M.so ? '승부차기' + so : (M.half === 1 ? '전반 ' : M.half === 2 ? '후반 ' : M.half === 3 ? '연장 전반 ' : '연장 후반 ') + minute + extra + "'";
  }
  // 터치 버튼 글자(공격/수비): 우리 팀 공이면 공격 — 차 놓고 쫓는 공(질주 드리블)·우리 편에게 가는 패스·우리가 마지막으로 찬 공도 우리 공으로 본다.
  // 수비 글자로는 우리 공이 아닌 채 0.45초(상대가 잡았으면 0.15초)가 지나야 바꾼다. 전엔 '커서 선수가 지금 공을 갖고 있나'만 봐서 질주 드리블 중 1분에 160번 바뀌었다(껌뻑임)
  const h = HU[local], o = ball.owner, now = performance.now();
  const ours = !!h && (o ? o.t === local : ball.knock ? ball.knock.t === local : ball.passTarget ? ball.passTarget.t === local : ball.lastTouch === local && !(ball.kicker && ball.kicker.t !== local));
  if (ours) oursAt = now;
  const own = ours || (labelCache === 'a' && now - oursAt < (o ? 150 : 450)), lk = own ? 'a' : 'd';
  if (lk !== labelCache) { labelCache = lk; $('bA').textContent = own ? '패스' : '전환'; $('bB').textContent = own ? '슛' : '태클'; $('bD').textContent = own ? '스루' : '키퍼'; $('bL').textContent = own ? '롱패스' : '슬라이딩'; $('bR').textContent = own ? '침투' : '동료 압박'; }
}
let bannerTimer = 0;
export function showBanner(big: string, small: string, ms: number, isGoal: boolean) {
  const b = $('banner'); $('bnBig').textContent = big; $('bnSmall').textContent = small; b.classList.toggle('goal', !!isGoal);
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }
