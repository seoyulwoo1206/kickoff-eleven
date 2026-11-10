/* 키 설정: P1 키를 바꾼다. localStorage 'ko11keys' */
import { K1, setK1, type Key } from '../input/keyboard';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const LABELS: [Key, string][] = [['up', '위'], ['down', '아래'], ['left', '왼쪽'], ['right', '오른쪽'], ['pass', '짧은 패스 / 압박'], ['lob', '롱패스 / 전환'], ['through', '스루패스 / 세컨드'], ['shoot', '슛 / 슬라이딩'], ['chip', '칩슛'], ['run', '침투 지시 / 압박 지원'], ['gkRush', '개인기 · 감아차기 / GK 돌진'], ['sprint', '질주'], ['switch', '뒤쪽 수비로 전환']];
let waiting: Key | null = null;
const pretty = (code: string) => code.replace(/^Key|^Arrow|^Digit/, '').replace('Space', '스페이스').replace('ShiftLeft', 'L-Shift').replace('Period', '.').replace('Comma', ',');
export function loadKeys() { try { const m = JSON.parse(localStorage.getItem('ko11keys') || 'null'); if (m && typeof m === 'object') setK1(m); } catch { /* */ } }
export function renderKeys() {
  const inv = new Map<Key, string[]>(); for (const [code, k] of Object.entries(K1)) { if (!inv.has(k)) inv.set(k, []); inv.get(k)!.push(code); }
  $('keyList').innerHTML = LABELS.map(([k, l]) => `<div class="keyrow"><span>${l}</span><button class="ghost small" data-k="${k}">${waiting === k ? '키를 누르세요…' : (inv.get(k) || []).map(pretty).join(' / ') || '-'}</button></div>`).join('');
  $('keyList').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => { waiting = b.dataset.k as Key; renderKeys(); }));
}
export function installKeyCapture() {
  window.addEventListener('keydown', e => {
    if (!waiting || $('keys').hidden) return; e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === 'Escape') { waiting = null; renderKeys(); return; }
    const m: Record<string, Key> = {}; for (const [code, k] of Object.entries(K1)) if (k !== waiting && code !== e.code) m[code] = k; // 그 액션의 기존 키 제거, 같은 키에 있던 액션도 제거
    m[e.code] = waiting; setK1(m); try { localStorage.setItem('ko11keys', JSON.stringify(m)); } catch { /* */ }
    waiting = null; renderKeys();
  }, true);
  $('keyReset').addEventListener('click', () => { try { localStorage.removeItem('ko11keys'); } catch { /* */ } setK1(null); renderKeys(); });
}
