/* 라인업 편집 + 선수 카드. 메뉴에서 팀별로 연다. 선발 11명(등번호 배열)을 바꿔 돌려준다 */
import type { SquadDef, PlayerDef } from '../data/squad';
import { overall, expand } from '../data/squad';
import { FORMATIONS } from '../data/formations';
import { aliasOf } from '../data/squads';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let cur: { sq: SquadDef; form: string; lineup: number[]; names: 'real' | 'alias'; onChange: (lu: number[]) => void } | null = null;
let picked: number | null = null; // 선택한 선발 슬롯 index
const nm = (p: PlayerDef, names: 'real' | 'alias') => names === 'real' ? p.name : aliasOf(p);

export function openLineup(sq: SquadDef, form: string, lineup: number[], names: 'real' | 'alias', onChange: (lu: number[]) => void) {
  cur = { sq, form, lineup: lineup.slice(), names, onChange }; picked = null; render(); $('lineup').hidden = false;
}
export function closeLineup() { $('lineup').hidden = true; cur = null; }
function render() {
  if (!cur) return;
  const { sq, form, lineup, names } = cur, by = new Map(sq.players.map(p => [p.num, p])), slots = FORMATIONS[form] ?? FORMATIONS['4-4-2'];
  $('luTitle').textContent = `${sq.code} 라인업 · ${form}`;
  $('luXI').innerHTML = slots.map((sl, i) => { const p = by.get(lineup[i]); return `<button class="lu ${picked === i ? 'on' : ''}" data-i="${i}"><span class="pos">${sl.pos}</span><span class="nm">${p ? nm(p, names) : '-'}</span><b>${p ? overall(p) : ''}</b>${p && p.pos !== sl.pos ? `<small>${p.pos}</small>` : ''}</button>`; }).join('');
  const bench = sq.players.filter(p => !lineup.includes(p.num)).sort((a, b) => overall(b) - overall(a));
  $('luBench').innerHTML = bench.map(p => `<button class="lu" data-n="${p.num}"><span class="pos">${p.pos}</span><span class="nm">${nm(p, names)}</span><b>${overall(p)}</b></button>`).join('');
  $('luXI').querySelectorAll<HTMLButtonElement>('.lu').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.i!; if (picked === null) picked = i; else if (picked === i) picked = null; else { const t = lineup[picked]; lineup[picked] = lineup[i]; lineup[i] = t; picked = null; cur!.onChange(lineup); } render(); showCard(by.get(lineup[i])); }));
  $('luBench').querySelectorAll<HTMLButtonElement>('.lu').forEach(b => b.addEventListener('click', () => { const n = +b.dataset.n!; const p = by.get(n)!; if (picked !== null) { const slotPos = slots[picked].pos; if ((slotPos === 'GK') !== (p.pos === 'GK')) { showCard(p); return; } lineup[picked] = n; picked = null; cur!.onChange(lineup); render(); } showCard(p); }));
  const avg = lineup.reduce((a, n) => a + (by.get(n) ? overall(by.get(n)!) : 0), 0) / 11;
  $('luAvg').textContent = `선발 평균 ${avg.toFixed(1)} · 선발을 누르고 다른 선발이나 벤치 선수를 누르면 바뀝니다`;
}
/** 선수 카드: 6각형 능력치 + 상세 */
function showCard(p?: PlayerDef) {
  if (!cur || !p) return;
  const d = expand(p), r = p.r, gk = p.pos === 'GK';
  $('cardName').textContent = `${nm(p, cur.names)} · ${p.num}번 · ${p.pos}${p.alt?.length ? ' (' + p.alt.join('/') + ')' : ''}`;
  $('cardMeta').textContent = `${p.height}cm${p.age ? ' · ' + p.age + '세' : ''}${p.club ? ' · ' + p.club : ''} · 주발 ${p.foot === 'L' ? '왼' : '오른'}발 · 약발 ${'★'.repeat(p.weak)} · 개인기 ${'★'.repeat(p.skill)}${p.uncertain ? ' · 소집 불확실' : ''}`;
  $('cardOvr').textContent = String(overall(p));
  const labels = gk && p.gk ? [['다이빙', p.gk.div], ['핸들링', p.gk.han], ['킥', p.gk.kic], ['반응', p.gk.ref], ['위치', p.gk.pos], ['속력', r.pac]] : [['속력', r.pac], ['슈팅', r.sho], ['패스', r.pas], ['드리블', r.dri], ['수비', r.def], ['피지컬', r.phy]];
  const cv = $('cardRadar') as HTMLCanvasElement, g = cv.getContext('2d')!, S = 180, c = S / 2, R = 66; cv.width = S; cv.height = S;
  g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(238,243,234,.2)'; g.lineWidth = 1;
  for (const k of [0.33, 0.66, 1]) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; g.lineTo(c + Math.cos(a) * R * k, c + Math.sin(a) * R * k); } g.closePath(); g.stroke(); }
  g.beginPath(); labels.forEach(([, v], i) => { const a = -Math.PI / 2 + i * Math.PI / 3, k = (v as number) / 99; g.lineTo(c + Math.cos(a) * R * k, c + Math.sin(a) * R * k); }); g.closePath();
  g.fillStyle = 'rgba(255,182,39,.35)'; g.fill(); g.strokeStyle = '#ffb627'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#eef3ea'; g.font = '700 11px "IBM Plex Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  labels.forEach(([l, v], i) => { const a = -Math.PI / 2 + i * Math.PI / 3; g.fillText(`${l} ${v}`, c + Math.cos(a) * (R + 18), c + Math.sin(a) * (R + 14)); });
  const det: [string, number][] = gk ? [['반응', d.rea], ['점프', d.jmp], ['롱킥', d.lp], ['체력', d.sta]] : [['가속', d.acc], ['골결정', d.fin], ['슛파워', d.pow], ['짧은패스', d.sp], ['시야', d.vis], ['볼컨트롤', d.ctl], ['민첩', d.agi], ['몸싸움', d.str], ['체력', d.sta], ['헤더', d.hea], ['대인수비', d.mrk], ['태클', d.stk]];
  $('cardDetail').innerHTML = det.map(([l, v]) => `<span>${l}<b>${v}</b></span>`).join('');
  $('card').hidden = false;
}
