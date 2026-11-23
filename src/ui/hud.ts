import type { Sim } from '../sim/types';
import { wx } from '../sim/util';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let hudCache = '', labelCache = '', oursAt = -1e9, scoreSeen = false; // oursAt: 마지막으로 우리 공이었던 때(ms)
export function resetHud() { hudCache = ''; labelCache = ''; oursAt = -1e9; }
/** 점수판 테마와 대회 이름 (경기 시작 때). kind: league 친선 · cup 토너먼트 · net 온라인 · 2p 2인 · pk 승부차기 */
export function setHudTheme(kind: 'league' | 'cup' | 'net' | '2p' | 'pk', label: string) { const h = $('hud'); h.className = 'hud-' + kind; $('hComp').textContent = label; scoreSeen = false; $('hS0').textContent = ''; $('hS1').textContent = ''; }
/** 터치 버튼이 지금 공격용인가 (글자와 같은 기준 — `touch.ts`가 밀기·스루/슬라이딩 버튼에 쓴다) */
export const touchAttack = () => labelCache !== 'd';
/** 버튼 글자를 다음 프레임에 다시 쓴다 (밀어서 바꾼 글자 되돌리기) */
export function relabelTouch() { labelCache = ''; }
export function updateHud(s: Sim, local: number) {
  const { M, HU, ball } = s;
  // 시계는 경기 시간 mm:ss (전·후반 끝을 넘기면 45:00·90:00에 멈추고 추가시간 배지 +N)
  const tm = M.time / M.len * 90, raw = Math.floor(tm), end = M.half === 1 ? 45 : M.half === 2 ? 90 : M.half === 3 ? 105 : 120, over = raw >= end;
  const sec = over ? end * 60 : Math.floor(tm * 60), extra = raw > end && M.added[M.half - 1] ? `+${Math.min(M.added[M.half - 1], raw - end)}` : '';
  const so = M.so ? M.so.kicks[0].join('') + '|' + M.so.kicks[1].join('') : '', key = M.score.join() + sec + extra + M.half + so;
  if (key !== hudCache) {
    hudCache = key; $('hN0').textContent = M.teams[0].code; $('hN1').textContent = M.teams[1].code;
    for (const t of [0, 1]) { const c = $('hC' + t); c.style.background = M.kit[t].c1; c.style.color = M.kit[t].c1; const e = $('hS' + t), v = String(M.score[t]); if (e.textContent !== v) { if (e.textContent !== '' && scoreSeen) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } e.textContent = v; } }
    scoreSeen = true;
    $('hHalf').textContent = M.so ? '승부차기' : M.half === 1 ? '전반' : M.half === 2 ? '후반' : M.half === 3 ? '연장 전반' : '연장 후반';
    $('hClk').textContent = M.so ? 'PK' : String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    const ad = $('hAdd'); ad.hidden = !extra; ad.textContent = extra;
    const pk = $('hPk'); pk.hidden = !M.so;
    if (M.so) pk.innerHTML = [0, 1].map(t => { const k = M.so!.kicks[t], n = Math.max(5, k.length); let d = ''; for (let i = 0; i < n; i++) d += `<i class="${i < k.length ? (k[i] ? 'g' : 'x') : ''}"></i>`; return `<div><b>${M.teams[t].code}</b>${d}</div>`; }).join('');
  }
  // 터치 버튼 글자(공격/수비): 우리 팀 공이면 공격 — 차 놓고 쫓는 공(질주 드리블)·우리 편에게 가는 패스·우리가 마지막으로 찬 공도 우리 공으로 본다.
  // 수비 글자로는 우리 공이 아닌 채 0.45초(상대가 잡았으면 0.15초)가 지나야 바꾼다. 전엔 '커서 선수가 지금 공을 갖고 있나'만 봐서 질주 드리블 중 1분에 160번 바뀌었다(껌뻑임)
  const h = HU[local], o = ball.owner, now = performance.now();
  const ours = !!h && (o ? o.t === local : ball.knock ? ball.knock.t === local : ball.passTarget ? ball.passTarget.t === local : ball.lastTouch === local && !(ball.kicker && ball.kicker.t !== local));
  if (ours) oursAt = now;
  const own = ours || (labelCache !== 'd' && labelCache !== '' && now - oursAt < (o ? 150 : 450));
  const clr = own && wx(ball.x, local) < 60, lk = own ? (clr ? 'c' : 'a') : 'd'; // 골에서 45m 넘게 먼 자기 진영: 슛 키는 걷어내기(`shoot`) → 글자도 '클리어'
  if (lk !== labelCache) { labelCache = lk; // 글자와 밀기 안내(data-up/dn: 버튼 위·아래 작은 글자)
    const set = (id: string, text: string, up = '', dn = '') => { const el = $(id); el.textContent = text; el.dataset.up = up; el.dataset.dn = dn; };
    $('bAside').textContent = own ? '◀ 호출' : ''; // 패스 버튼을 옆으로 밀기 = 동료 호출 (버튼 안에 넣으면 글자가 겹쳐 왼쪽 바깥에)
    if (own) { set('bA', '패스', '▲ 로빙', '▼ 주고뛰기'); if (clr) set('bB', '클리어'); else set('bB', '슛', '▲ 칩', '▼ 감아'); set('bD', '스루', '▲ 침투'); set('bC', '질주', '밀기 = 개인기'); }
    else { set('bA', '전환'); set('bB', '태클'); set('bD', '슬라이딩'); set('bC', '질주', '▲ 키퍼', '◀▶ 압박'); }
  }
}
let bannerTimer = 0;
export function showBanner(big: string, small: string, ms: number, isGoal: boolean) {
  const b = $('banner'); $('bnBig').textContent = big; $('bnSmall').textContent = small; b.classList.toggle('goal', !!isGoal);
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }
