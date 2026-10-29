/* 토너먼트 화면: 조별 순위표 · 토너먼트 대진 · 다음 경기 */
import { TEAMS } from '../data/teams';
import { type Cup, type Fixture, STAGE_NAMES, GROUP_NAMES, table, userFixture } from '../cup';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const code = (i: number) => TEAMS[i].code, name = (i: number) => TEAMS[i].name;
const fx = (f: Fixture, user: number) => { const cls = f.a === user || f.b === user ? ' me' : ''; const sc = f.score ? `${f.score[0]} : ${f.score[1]}${f.so ? ` <small>(${f.so[0]}-${f.so[1]} PK)</small>` : ''}` : 'vs'; return `<div class="fx${cls}"><span>${code(f.a)}</span><b>${sc}</b><span>${code(f.b)}</span></div>`; };
export function renderCup(c: Cup) {
  $('cupTitle').textContent = `${name(c.user)} · ${STAGE_NAMES[c.stage]}${c.stage === 'group' ? ` ${c.round}차전` : ''}`;
  const uf = userFixture(c);
  let lede: string;
  if (c.stage === 'done') lede = c.champion === c.user ? '🏆 우승! 월드컵을 들어 올렸습니다.' : `${name(c.champion)} 우승. 다음 대회를 시작하세요.`;
  else if (c.eliminated) lede = '탈락했습니다. 남은 대회는 자동으로 진행됩니다.';
  else if (uf) { const opp = uf.a === c.user ? uf.b : uf.a; lede = `다음 경기: ${name(c.user)} vs ${name(opp)} (${STAGE_NAMES[uf.stage]}${uf.stage === 'group' ? ' ' + uf.round + '차전' : ''})`; }
  else lede = '';
  $('cupLede').textContent = lede;
  $('cupGroups').innerHTML = c.groups.map((g, gi) => `<div class="grp"><div class="label">${GROUP_NAMES[gi]}조</div><table>${table(c, gi).map((r, i) => `<tr class="${r.team === c.user ? 'me' : ''}${i < 2 ? ' q' : ''}"><td>${code(r.team)}</td><td>${r.p}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table>${c.fixtures.filter(f => f.stage === 'group' && c.groups[gi].includes(f.a) && f.round === c.round).map(f => fx(f, c.user)).join('')}</div>`).join('');
  const stages: Fixture['stage'][] = ['r16', 'qf', 'sf', 'f'];
  $('cupKo').innerHTML = stages.filter(st => c.fixtures.some(f => f.stage === st)).map(st => `<div class="grp"><div class="label">${STAGE_NAMES[st]}</div>${c.fixtures.filter(f => f.stage === st).map(f => fx(f, c.user)).join('')}</div>`).join('');
  const btn = $('cupPlay') as HTMLButtonElement;
  btn.textContent = c.stage === 'done' ? '새 대회' : c.eliminated || !uf ? '다음 라운드 진행' : '킥오프';
}
