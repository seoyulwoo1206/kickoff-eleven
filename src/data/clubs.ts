/* 클럽팀 (55차). 국가대표(teams/<CODE>.json, 선수마다 6대 지표를 손으로 적음)와 달리 수가 많아(4대 리그 + 챔피언스리그 팀)
   한 줄짜리 간단한 형식(clubs/<리그><번호>.ts)으로 적고, 여기서 포지션 틀 + 종합(ovr) + 꼬리표로 6대 지표를 전개한다. 형식은 clubs/README.md
   teams.ts가 CLUB_TEAMS를 TEAMS 뒤에 붙이고(국가대표 24팀의 순번은 그대로), squads.ts가 CLUB_SQUADS를 같이 찾는다 */
import type { TeamDef, Pat } from './teams';
import { overall, POSES, type Main, type PlayerDef, type Pos, type SquadDef } from './squad';
import EPL1 from './clubs/EPL1';
import EPL2 from './clubs/EPL2';
import LAL1 from './clubs/LAL1';
import LAL2 from './clubs/LAL2';
import BUN1 from './clubs/BUN1';
import BUN2 from './clubs/BUN2';
import SEA1 from './clubs/SEA1';
import SEA2 from './clubs/SEA2';
import ETC1 from './clubs/ETC1';
import ETC2 from './clubs/ETC2';

/** 리그 열쇠와 메뉴에 보이는 이름 (팀이 하나라도 있는 리그만 메뉴에 뜬다) */
export const LEAGUES: [string, string][] = [['EPL', '프리미어리그'], ['LAL', '라리가'], ['BUN', '분데스리가'], ['SEA', '세리에 A'], ['ETC', '그 밖 (챔스)']];
const SRC: [string, string][] = [['EPL', EPL1], ['EPL', EPL2], ['LAL', LAL1], ['LAL', LAL2], ['BUN', BUN1], ['BUN', BUN2], ['SEA', SEA1], ['SEA', SEA2], ['ETC', ETC1], ['ETC', ETC2]];
/** 2026/27 챔피언스리그 본선(리그 페이즈) 36팀 — 클럽 컵의 참가팀 (영문 위키백과 '2026–27 UEFA Champions League league phase', 2026-11-26 확인) */
export const UCL = 'PSG BAY RMA LIV INT MCI ARS BAR ATM BVB ROM SCP AVL FCP MUN BRU BET PSV FEY LIL BOD NAP RBL VIL FEN SHK GAL SLP SLB STU AEK LSK COM LEN VIK SAB'.split(' ');

/** 포지션 틀: 종합에서 벗어난 정도 [pac, sho, pas, dri, def, phy] — 전개한 뒤 `overall()`이 ovr이 되도록 여섯 값을 같이 민다 */
const TPL: Record<Pos, number[]> = {
  GK: [0, 0, 0, 0, 0, 0],
  CB: [-8, -35, -10, -12, 3, 3], LB: [4, -22, -3, -1, 1, -4], RB: [4, -22, -3, -1, 1, -4],
  CDM: [-6, -14, 1, -3, 3, 3], CM: [-5, -6, 3, 1, -8, -3], CAM: [-3, -2, 3, 3, -35, -12],
  LM: [3, -6, -1, 2, -22, -8], RM: [3, -6, -1, 2, -22, -8], LW: [4, -3, -4, 4, -45, -12], RW: [4, -3, -4, 4, -45, -12],
  ST: [0, 4, -10, -2, -45, 0], CF: [-1, 2, -2, 2, -45, -6],
};
const KEYS: (keyof Main)[] = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
const PATS = ['solid', 'stripes', 'hoops', 'half', 'sash', 'chevron', 'check'];
const cl = (v: number, lo = 20, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

/** 선수 한 줄 → PlayerDef. `num|이름|영문 이름|포지션|국적|나이|키|주발|종합|꼬리표` */
function player(line: string, errs: string[], where: string): PlayerDef | null {
  const f = line.split('|').map(x => x.trim()); if (f.length < 9) { errs.push(`${where}: 칸 수 ${f.length} — ${line}`); return null; }
  const [num, name, nameEn, pos, nat, age, height, foot, ovr] = f, tags = (f[9] ?? '').split(/\s+/).filter(Boolean);
  const P = pos as Pos, o = +ovr; if (!POSES.includes(P)) { errs.push(`${where}: 포지션 ${pos} — ${name}`); return null; }
  if (!(o >= 40 && o <= 99) || !(+num >= 1 && +num <= 99) || !name || !nameEn) { errs.push(`${where}: 값 — ${line}`); return null; }
  const p: PlayerDef = { name, nameEn, num: +num, pos: P, foot: foot === 'L' ? 'L' : 'R', weak: 3, skill: P === 'GK' ? 1 : P === 'CB' ? 2 : (P === 'ST' || P === 'CF' || P === 'LW' || P === 'RW' || P === 'CAM' || P === 'LM' || P === 'RM') && o >= 84 ? 4 : 3, height: +height || 180, age: +age || undefined, nat: nat || undefined, r: { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0 } };
  const adj = [0, 0, 0, 0, 0, 0];
  for (const t of tags) {
    const m = /^(pac|sho|pas|dri|def|phy)(\++|-+)$/.exec(t);
    if (m) adj[KEYS.indexOf(m[1] as keyof Main)] += (m[2][0] === '+' ? 4 : -4) * Math.min(3, m[2].length);
    else if (/^w[1-5]$/.test(t)) p.weak = +t[1] as PlayerDef['weak']; else if (/^s[1-5]$/.test(t)) p.skill = +t[1] as PlayerDef['skill'];
    else if (t.startsWith('alt:')) p.alt = t.slice(4).split(',').filter(x => POSES.includes(x as Pos)) as Pos[];
    else if (t === '?') p.uncertain = true; else errs.push(`${where}: 꼬리표 ${t} — ${name}`);
  }
  if (P === 'GK') { // 종합 = 0.84g + 0.05(g−12) + 0.11×58 → g
    const g = cl((o - 5.78) / 0.89, 40); p.gk = { div: cl(g + 1), han: cl(g - 1), kic: cl(g - 12 + adj[1]), ref: cl(g + 1), pos: cl(g - 1) }; p.r = { pac: 58, sho: p.gk.kic, pas: cl(g - 16 + adj[2]), dri: 55, def: g, phy: 76 };
    return p;
  }
  const v = TPL[P].map((d, i) => o + d + adj[i]);
  for (let it = 0; it < 6; it++) { KEYS.forEach((k, i) => { p.r[k] = cl(v[i]); }); const d = o - overall(p); if (!d) break; for (let i = 0; i < 6; i++) v[i] += d; }
  return p;
}
/** 묶음 글 → 팀·선수단. 팀 머리줄 `@CODE|이름|무늬|c1|c2|sh|gk|포메이션|선발 등번호 11개(쉼표)|asOf|출처(띄어쓰기로 여럿)` 뒤에 선수 줄들 */
export function parseClubs(lg: string, text: string) {
  const teams: TeamDef[] = [], squads: Record<string, SquadDef> = {}, errs: string[] = []; let cur: SquadDef | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    if (line[0] === '@') {
      const f = line.slice(1).split('|').map(x => x.trim()); if (f.length < 11) { errs.push(`${lg}: 팀 머리줄 칸 수 ${f.length} — ${line.slice(0, 40)}`); cur = null; continue; }
      const [code, name, pat, c1, c2, sh, gk, formation, lineup, asOf, src] = f; if (!PATS.includes(pat)) errs.push(`${code}: 무늬 ${pat}`);
      teams.push({ code, name, pat: (PATS.includes(pat) ? pat : 'solid') as Pat, c1, c2, sh, gk, atk: 80, def: 80, spd: 80, lg });
      cur = squads[code] = { code, asOf, sources: src.split(/\s+/).filter(Boolean), formation, lineup: lineup.split(',').map(x => +x.trim()), players: [] };
    } else if (cur) { const p = player(line, errs, cur.code); if (p) cur.players.push(p); } else errs.push(`${lg}: 팀 머리줄 앞의 선수 줄 — ${line.slice(0, 40)}`);
  }
  return { teams, squads, errs };
}
export const CLUB_TEAMS: TeamDef[] = [], CLUB_SQUADS: Record<string, SquadDef> = {}, CLUB_ERRS: string[] = [];
for (const [lg, text] of SRC) { const r = parseClubs(lg, text); for (const T of r.teams) { if (CLUB_SQUADS[T.code] && CLUB_TEAMS.some(x => x.code === T.code)) { CLUB_ERRS.push(`${T.code}: 팀 코드 중복`); continue; } CLUB_TEAMS.push(T); CLUB_SQUADS[T.code] = r.squads[T.code]; } CLUB_ERRS.push(...r.errs); }
