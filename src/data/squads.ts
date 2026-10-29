/* 선수단 조회·팀 전력 계산. 팀 JSON이 없는 팀은 TEAMS의 팀 능력치만으로 (옛 방식) 경기한다 */
import { SQUADS } from './teams/index';
import { TEAMS, type TeamDef } from './teams';
import { overall, expand, type SquadDef, type PlayerDef, type Detail } from './squad';
import { FORMATIONS } from './formations';

export function squadOf(T: TeamDef): SquadDef | null { return SQUADS[T.code] ?? null; }
export function lineupOf(sq: SquadDef): PlayerDef[] { const by = new Map(sq.players.map(p => [p.num, p])); return sq.lineup.map(n => by.get(n)!).filter(Boolean); }
export function slotsOf(sq: SquadDef) { return FORMATIONS[sq.formation] ?? FORMATIONS['4-4-2']; }
export interface TeamStrength { ovr: number; atk: number; def: number; spd: number; }
/** 선발 11명 기준 팀 전력. atk/def/spd는 기존 TEAMS 수치와 같은 척도(70~90)로 맞춘다 */
export function strengthOf(sq: SquadDef): TeamStrength {
  const xi = lineupOf(sq); if (xi.length < 11) return { ovr: 75, atk: 75, def: 75, spd: 75 };
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const ovr = avg(xi.map(overall));
  const out = xi.filter(p => p.pos !== 'GK');
  const attackers = [...out].sort((a, b) => (b.r.sho + b.r.dri + b.r.pas) - (a.r.sho + a.r.dri + a.r.pas)).slice(0, 6);
  const atk = avg(attackers.map(p => p.r.sho * 0.45 + p.r.dri * 0.3 + p.r.pas * 0.25));
  const gk = xi.find(p => p.pos === 'GK'), backs = [...out].sort((a, b) => b.r.def - a.r.def).slice(0, 5);
  const def = avg(backs.map(p => p.r.def * 0.75 + p.r.phy * 0.25)) * 0.8 + (gk ? overall(gk) : 75) * 0.2;
  const spd = avg(out.map(p => p.r.pac));
  return { ovr: Math.round(ovr), atk: Math.round(atk), def: Math.round(def), spd: Math.round(spd) };
}
/** 앱 시작 시 TEAMS의 atk/def/spd를 선수단 기준으로 덮어쓴다 (기존 AI·슛 공식이 그대로 쓰도록) */
export function applySquadStrength() {
  for (const T of TEAMS) { const sq = squadOf(T); if (!sq) continue; const s = strengthOf(sq); T.atk = s.atk; T.def = s.def; T.spd = s.spd; }
}
export function topPlayers(sq: SquadDef, n = 3) { return [...sq.players].sort((a, b) => overall(b) - overall(a)).slice(0, n); }
/** 가명: 영문 이름 이니셜 (예: Son Heung-min → S.H.M.) */
export function aliasOf(p: PlayerDef) { return p.nameEn.split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase()).join('.') + '.'; }
export function detailOf(p: PlayerDef): Detail { return expand(p); }
/** 화면 표시 이름: 실명 모드면 한글 이름, 가명 모드면 이니셜 */
export function displayName(p: { name: string; def: PlayerDef | null; num: number }, names: 'real' | 'alias') { if (!p.def) return String(p.num); return names === 'real' ? p.name : aliasOf(p.def); }
/** 유니폼 등 이름 (영문 성). 가명 모드면 없음 */
export function shirtName(p: { def: PlayerDef | null }, names: 'real' | 'alias') { if (!p.def || names === 'alias') return undefined; const w = p.def.nameEn.split(' '); return (w.length > 1 && w[0].length <= 3 && /^[A-Z]\.?$/.test(w[0]) ? w.slice(1).join(' ') : w[w.length - 1]).slice(0, 12); }
export { overall };
