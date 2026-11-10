/* 입장 화면: 양 팀 선발 라인업 소개 (입장 카메라 위에 겹쳐서, 줄이 차례로 나타난다) */
import type { Sim } from '../sim/types';
import { displayName } from '../data/squads';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function showIntro(s: Sim, names: 'real' | 'alias', sub: string) {
  const { M, team } = s;
  const side = (t: number) => {
    const kit = M.kit[t], T = M.teams[t], ps = team[t].filter(p => !p.off);
    const avg = Math.round(ps.reduce((a, p) => a + p.ovr, 0) / Math.max(1, ps.length));
    const rows = ps.map((p, i) => `<li style="animation-delay:${(0.9 + i * 0.16).toFixed(2)}s"><span class="n">${p.num}</span><span class="p">${esc(p.pos)}</span><span class="nm">${esc(displayName(p, names))}</span><span class="o">${p.ovr}</span></li>`).join('');
    return `<section class="it t${t}" style="--kc:${kit.c1}"><header><span class="chip3"></span><div><div class="code">${esc(T.code)}</div><div class="tn">${esc(T.name)}</div></div><div class="meta"><b>${esc(M.tac[t].form)}</b><span>평균 ${avg}</span></div></header><ol>${rows}</ol></section>`;
  };
  $('introBody').innerHTML = side(0) + `<div class="vs"><span>VS</span><small>${esc(sub)}</small></div>` + side(1);
  const el = $('intro'); el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('on');
}
export function hideIntro() {
  const el = $('intro'); if (el.hidden) return;
  el.classList.remove('on'); el.classList.add('out'); window.setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 450);
}
