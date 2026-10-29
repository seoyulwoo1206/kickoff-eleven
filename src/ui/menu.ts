import { TEAMS, kitCss } from '../data/teams';
import { opts } from '../options';
import { NET, LOCAL } from '../net/peer';
import { squadOf, strengthOf, topPlayers, overall, aliasOf } from '../data/squads';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface MenuHooks { onSelChange(): void; }
let hooks: MenuHooks;
export function initMenu(h: MenuHooks) { hooks = h; }
export function renderMenu() {
  const net = opts.mode === 'net', mySide = LOCAL(), locked = net && NET.ready;
  for (const s of [0, 1] as const) {
    const g = $('grid' + s);
    g.innerHTML = TEAMS.map((T, i) => `<button class="chip" data-i="${i}" aria-pressed="${opts.sel[s] === i}" ${opts.sel[1 - s] === i ? 'disabled' : ''} aria-label="${T.name}"><div class="shirt" style="background:${kitCss(T)}"></div><span>${T.code}</span></button>`).join('');
    g.querySelectorAll<HTMLButtonElement>('.chip').forEach(b => b.addEventListener('click', () => { if (locked && s !== mySide) return; opts.sel[s] = +b.dataset.i!; renderMenu(); hooks.onSelChange(); }));
    const T = TEAMS[opts.sel[s]]; $('ch' + s).innerHTML = `${T.name}<small>${T.code}</small>`;
    const sq = squadOf(T);
    $('st' + s).innerHTML = (sq ? `<span>종합<b>${strengthOf(sq).ovr}</b></span>` : '') + `<span>공격<b>${T.atk}</b></span><span>수비<b>${T.def}</b></span><span>속도<b>${T.spd}</b></span>`;
    $('sq' + s).innerHTML = sq ? `<span class="form">${sq.formation}</span>` + topPlayers(sq, 3).map(p => `<span>${opts.names === 'real' ? p.name : aliasOf(p)}<b>${overall(p)}</b></span>`).join('') + `<span class="asof">${sq.asOf} 기준</span>` : '<span class="asof">선수단 데이터 없음</span>';
    g.parentElement!.classList.toggle('locked', locked && s !== mySide);
  }
  const two = opts.mode === '2p';
  const labs = net ? (NET.role === 'guest' ? ['상대 팀 (호스트)', '내 팀 (게스트)'] : ['내 팀 (호스트)', '상대 팀 (게스트)']) : two ? ['P1 팀', 'P2 팀'] : ['내 팀', '상대 팀 (AI)'];
  $('lab0').textContent = labs[0]; $('lab1').textContent = labs[1];
  $('help2').hidden = !two; $('helpNet').hidden = !net; $('optDiff').hidden = opts.mode !== 'ai'; $('netPanel').hidden = !net;
  $('optLen').classList.toggle('locked', net && NET.role === 'guest'); $('optTempo').classList.toggle('locked', net && NET.role === 'guest');
  $('codeBox').hidden = !(net && NET.role === 'host' && NET.code); if (NET.code) $('codeTxt').textContent = NET.code;
  const sb = $('startBtn') as HTMLButtonElement, note = $('startNote');
  if (net && NET.role === 'guest') { sb.disabled = true; sb.textContent = '호스트 대기 중'; note.textContent = NET.ready ? '호스트가 킥오프하면 시작돼요.' : ''; }
  else if (net && !NET.ready) { sb.disabled = true; sb.textContent = '킥오프'; note.textContent = '상대가 들어오면 킥오프할 수 있어요.'; }
  else { sb.disabled = false; sb.textContent = '킥오프'; note.textContent = ''; }
}
export function setSeg(id: string, cur: string | number) { $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(cur)))); }
export function bindSeg(id: string, cur: string | number, fn: (v: string) => void) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.v === String(cur))); b.addEventListener('click', () => { el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); fn(b.dataset.v!); }); });
}
export function netStatus(msg: string, ok?: boolean) { const el = $('netStat'); el.textContent = msg; el.classList.toggle('ok', !!ok); }
export const NET_IDLE_MSG = '인터넷만 되면 어디서든 연결됩니다. 방을 만들면 코드가 나오고, 친구가 그 코드를 넣고 참가하면 바로 로비가 열립니다. 호스트가 왼쪽 팀, 게스트가 오른쪽 팀입니다.';
