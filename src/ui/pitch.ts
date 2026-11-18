/* 경기장 라인업 그림: 잔디 위에 선수 말(머리 + 등번호 셔츠 + 이름 + 배지)을 포메이션 자리에 세운다.
   교체 화면(한 팀, 세로 — 키퍼가 아래)과 경기 뒤 평점(두 팀, 가로)에서 같이 쓴다 */
import { isLight } from '../data/teams';

export interface Tok {
  id: string; num: number; name: string; kit: string; skin: string; hair: string;
  /** 자리: 0~1 (가로, 세로). 벤치처럼 줄지어 놓을 땐 생략 */
  x?: number; y?: number;
  /** 이름 아래 작은 글자 (포지션·능력치) */ sub?: string;
  /** 배지 (평점 등)와 그 색 클래스 */ badge?: string; badgeCls?: string;
  /** 체력 0~1 (막대) */ bar?: number;
  /** 추가 클래스: on(고른 선수) · mvp · dim · yel(경고) */ cls?: string;
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export function tokHtml(t: Tok) {
  const pos = t.x != null && t.y != null ? ` style="left:${(t.x * 100).toFixed(1)}%;top:${(t.y * 100).toFixed(1)}%"` : '';
  return `<button type="button" class="tok ${t.x != null ? 'abs' : ''} ${t.cls ?? ''}" data-id="${esc(t.id)}"${pos}>`
    + `<span class="fig"><i class="hd" style="--sk:${t.skin};--hr:${t.hair}"></i><b class="sh" style="background:${t.kit};color:${isLight(t.kit) ? '#111' : '#fff'}">${t.num}</b>${t.badge ? `<em class="bd ${t.badgeCls ?? ''}">${esc(t.badge)}</em>` : ''}</span>`
    + `<span class="nm">${esc(t.name)}</span>${t.sub ? `<span class="sb">${esc(t.sub)}</span>` : ''}${t.bar != null ? `<i class="st ${t.bar < 0.4 ? 'low' : ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, t.bar)) * 100)}%"></i></i>` : ''}</button>`;
}
const LINES_HALF = `<svg viewBox="0 0 68 54" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".35"><rect x="1" y="1" width="66" height="52"/><path d="M1 1H67"/><path d="M24.8 1a9.15 9.15 0 0 0 18.4 0"/><rect x="13.84" y="36.5" width="40.32" height="16.5"/><rect x="24.84" y="47.5" width="18.32" height="5.5"/><path d="M26.7 36.5a9.15 9.15 0 0 1 14.6 0"/></g></svg>`;
const LINES_FULL = `<svg viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".4"><rect x="1" y="1" width="103" height="66"/><path d="M52.5 1V67"/><circle cx="52.5" cy="34" r="9.15"/><rect x="1" y="13.84" width="16.5" height="40.32"/><rect x="1" y="24.84" width="5.5" height="18.32"/><rect x="87.5" y="13.84" width="16.5" height="40.32"/><rect x="98.5" y="24.84" width="5.5" height="18.32"/></g></svg>`;
/** 한 팀: 세로 반쪽 경기장 (키퍼 아래, 공격수 위). 두 팀: 가로 전체 경기장 */
export function pitchHtml(toks: Tok[], kind: 'half' | 'full') {
  return `<div class="pitch ${kind}">${kind === 'half' ? LINES_HALF : LINES_FULL}${toks.map(tokHtml).join('')}</div>`;
}
/** 포메이션 기본 위치(bx 0~52 자기 골에서 앞으로, by 0~68) → 세로 반쪽 경기장 자리. mirror: 팀 1은 자기 왼쪽이 y 큰 쪽 */
export const halfPos = (bx: number, by: number, mirror: boolean) => ({ x: 0.06 + 0.88 * (mirror ? 1 - by / 68 : by / 68), y: 0.9 - 0.8 * Math.max(0, Math.min(1, (bx - 4) / 44)) });
/** 가로 전체 경기장: 팀 0은 왼쪽 절반, 팀 1은 오른쪽 절반 */
export const fullPos = (bx: number, by: number, t: number) => { const u = 0.045 + 0.4 * Math.max(0, Math.min(1, (bx - 4) / 44)); return { x: t === 0 ? u : 1 - u, y: 0.08 + 0.84 * by / 68 }; };
