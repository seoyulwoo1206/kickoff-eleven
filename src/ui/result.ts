import type { Sim } from '../sim/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
/** 경기 종료 카드 채우기. 표시(hidden 해제)는 호출 쪽에서 */
export function fillResult(s: Sim, local: number, isGuest: boolean) {
  const { M } = s, [a, b] = M.score;
  $('rN0').textContent = M.teams[0].name; $('rN1').textContent = M.teams[1].name; $('rC0').style.background = M.kit[0].c1; $('rC1').style.background = M.kit[1].c1; $('rScore').textContent = `${a} : ${b}`;
  let line: string;
  if (M.net) { const mine = M.score[local], theirs = M.score[1 - local]; line = mine > theirs ? '승리! 상대를 꺾었어요.' : mine < theirs ? '패배… 한 판 더 해요.' : '무승부!'; if (isGuest) line += ' 호스트가 다시 하기를 누르면 재경기가 시작돼요.'; }
  else line = M.twoP ? (a > b ? 'P1 승리!' : a < b ? 'P2 승리!' : '무승부!') : (a > b ? `${M.teams[0].name}의 승리입니다.` : a < b ? `${M.teams[1].name}에 졌어요. 한 판 더?` : '무승부로 끝났어요.');
  $('rLine').textContent = line; $('againBtn').hidden = isGuest;
  const tp = M.stats.poss[0] + M.stats.poss[1], p0 = Math.round(M.stats.poss[0] / tp * 100);
  const rows: [string, string | number, string | number][] = [['슈팅', M.stats.shots[0], M.stats.shots[1]], ['유효 슈팅', M.stats.onT[0], M.stats.onT[1]], ['점유율', p0 + '%', (100 - p0) + '%'], ['파울', M.stats.fouls[0], M.stats.fouls[1]], ['오프사이드', M.stats.offs[0], M.stats.offs[1]]];
  $('rStats').innerHTML = rows.map(r => `<div class="rs"><span>${r[1]}</span><em>${r[0]}</em><span>${r[2]}</span></div>`).join('');
}
