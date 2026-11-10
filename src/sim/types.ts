import type { Inp } from '../input/actions';
import type { TeamDef, Kit, Role, DiffKey } from '../data/teams';
import type { SquadDef, PlayerDef, Detail, Pos } from '../data/squad';
import type { Tactics } from './tactics';
import type { Shootout } from './shootout';

export type Phase = 'kickoff' | 'live' | 'setpiece' | 'goal' | 'halftime' | 'full';
export type SetPieceType = 'corner' | 'throw' | 'goalkick' | 'freekick' | 'penalty';
export type SfxType = 'kick' | 'tackle' | 'post' | 'whistle' | 'long' | 'goal';

export interface Player {
  t: number; i: number; role: Role; bx: number; by: number; num: number;
  x: number; y: number; vx: number; vy: number; dir: number; speed: number;
  kickCD: number; stun: number; tackleCD: number; bodyCD: number; reactT: number; shield: number; runT: number; runDir: number; // runT: 침투 지시 남은 시간, runDir 방향 // shield: 사람이 패스·슛 키를 누른 직후 .16초는 뺏기지 않는다 (탭이 떼는 순간 실행되므로)
  offs: boolean; slide: number; decT: number; holdT: number; lastSave: number;
  dive: number; diveDir: number; run: number; forcePass: boolean; forceShot: boolean; cele: boolean;
  hair: string; skin: string;
  /** 선수단 데이터 (없으면 팀 능력치만으로 만든 익명 선수) */
  name: string; nameEn: string; pos: Pos; ovr: number; foot: 'L' | 'R'; skill: number; attrs: Detail; def: PlayerDef | null;
  /** Phase 4: 기본 속력(speed는 체력 반영 후), 체력 0~1, 킥 와인드업 남은 시간과 예약된 킥, 개인기 상태 */
  speed0: number; sta: number; kickWind: number; pending: (() => void) | null; feint: number; burst: number; spin: number; spinDir: number;
  /** Phase 5: 퇴장(경기장 밖), 경고 수 */
  off: boolean; yellow: number;
}
export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  owner: Player | null; lastTouch: number; passTarget: Player | null; kicker: Player | null;
  shot: number; isShot: boolean; spin: number; knock: Player | null;
  /** 마그누스 휨 (진행 방향에 수직인 가속, 부호 = 방향) */
  curl: number;
}
export interface Human {
  t: number; ctrl: Player | null; lock: number; charge: number; charging: boolean;
  second: boolean; gkRush: boolean; pressT: number; lostT: number; /* lostT: 방금 공을 뺏긴 뒤 남은 시간 (그동안은 공을 돌아본다) */ col: string; tag: string; cursor: 'manual' | 'auto'; had: boolean; // pressT: 압박 지원(Q) 남은 시간
}
export interface Stats { shots: number[]; onT: number[]; poss: number[]; fouls: number[]; offs: number[]; yel: number[]; red: number[]; passA: number[]; passC: number[]; }
export interface MatchInfo {
  teams: [TeamDef, TeamDef]; kit: [Kit, Kit]; score: number[]; time: number; len: number; diff: DiffKey;
  half: number; phase: Phase; phaseT: number; protect: number; stats: Stats;
  firstKick: number; nextKick: number; twoP: boolean; net: boolean; tick: number; slow: number;
  scorer: Player | null; tempo: number; spType: SetPieceType | null;
  /** AI 반응 지연: 상대가 공을 찬 뒤 이 시간 동안은 루즈볼을 쫓지 않는다 (난이도별) */
  react: [number, number];
  /** Phase 5: 전술, 벤치·교체 수, 중단 횟수(추가시간 계산), 추가시간(분, 전/후반), 어드밴티지 */
  lastAtt: number; autoRun: [number, number]; // 다음 자동 침투까지 남은 시간 (팀별)
  tac: [Tactics, Tactics]; bench: [PlayerDef[], PlayerDef[]]; subs: [number, number]; stops: number; added: number[];
  /** 토너먼트: 비기면 연장(전·후반 3·4) → 승부차기. so는 승부차기 상태 */
  knockout: boolean; so: Shootout | null;
  adv: { t: number; x: number; y: number; timer: number; on: Player } | null;
}
export interface Pred { x: number; y: number; z: number; t: number; }
export type SimEvent =
  | { k: 'banner'; big: string; small: string; ms: number; goal: boolean }
  | { k: 'sfx'; type: SfxType }
  | { k: 'crowd'; amt: number; dur: number }
  | { k: 'puff'; x: number; y: number; n: number; sp: number }
  | { k: 'shake'; v: number }
  | { k: 'hud' }
  | { k: 'card'; t: number; num: number; kind: 'Y' | 'R' }
  | { k: 'sub'; t: number; num: number }
  | { k: 'full' };
export interface HumanCfg { tag: string; col: string; cursor: 'manual' | 'auto'; }
export interface MatchCfg {
  teams: [TeamDef, TeamDef]; len: number; diff: DiffKey; tempo: number; firstKick: number;
  humans: [HumanCfg | null, HumanCfg | null]; net: boolean; seed: number;
  /** 선수단 (포메이션·선발·개인 능력치). null이면 TEAMS 팀 능력치 + 4-4-2 익명 선수 */
  squads?: [SquadDef | null, SquadDef | null];
  /** 전술 (없으면 선수단 포메이션 + 기본값) */
  tactics?: [Tactics | null, Tactics | null];
  /** 메뉴에서 고친 선발(등번호 11개). 없으면 선수단 기본 선발 */
  lineups?: [number[] | null, number[] | null];
  /** 비기면 연장·승부차기 (토너먼트) */
  knockout?: boolean;
  /** 승부차기만 */
  shootoutOnly?: boolean;
  /** 게스트: 시뮬을 돌리지 않고 스냅샷만 받는다 (선수 배치만 하고 킥오프 안 함) */
  guest?: boolean;
}
export interface Sim {
  M: MatchInfo; ball: Ball; players: Player[]; team: [Player[], Player[]];
  HU: [Human | null, Human | null]; INP: [Inp, Inp]; pred: Pred[];
  rnd: () => number; ev: SimEvent[];
}
