import type { Inp } from '../input/actions';
import type { TeamDef, Kit, Role, DiffKey } from '../data/teams';
import type { SquadDef, PlayerDef, Detail, Pos } from '../data/squad';

export type Phase = 'kickoff' | 'live' | 'setpiece' | 'goal' | 'halftime' | 'full';
export type SetPieceType = 'corner' | 'throw' | 'goalkick' | 'freekick' | 'penalty';
export type SfxType = 'kick' | 'tackle' | 'post' | 'whistle' | 'long' | 'goal';

export interface Player {
  t: number; i: number; role: Role; bx: number; by: number; num: number;
  x: number; y: number; vx: number; vy: number; dir: number; speed: number;
  kickCD: number; stun: number; tackleCD: number; bodyCD: number; reactT: number;
  offs: boolean; slide: number; decT: number; holdT: number; lastSave: number;
  dive: number; diveDir: number; run: number; forcePass: boolean; forceShot: boolean; cele: boolean;
  hair: string; skin: string;
  /** 선수단 데이터 (없으면 팀 능력치만으로 만든 익명 선수) */
  name: string; nameEn: string; pos: Pos; ovr: number; foot: 'L' | 'R'; skill: number; attrs: Detail; def: PlayerDef | null;
  /** Phase 4: 기본 속력(speed는 체력 반영 후), 체력 0~1, 킥 와인드업 남은 시간과 예약된 킥, 개인기 상태 */
  speed0: number; sta: number; kickWind: number; pending: (() => void) | null; feint: number; burst: number; spin: number; spinDir: number;
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
  second: boolean; gkRush: boolean; col: string; tag: string; cursor: 'manual' | 'auto'; had: boolean;
}
export interface Stats { shots: number[]; onT: number[]; poss: number[]; fouls: number[]; offs: number[]; }
export interface MatchInfo {
  teams: [TeamDef, TeamDef]; kit: [Kit, Kit]; score: number[]; time: number; len: number; diff: DiffKey;
  half: number; phase: Phase; phaseT: number; protect: number; stats: Stats;
  firstKick: number; nextKick: number; twoP: boolean; net: boolean; tick: number; slow: number;
  scorer: Player | null; tempo: number; spType: SetPieceType | null;
  /** AI 반응 지연: 상대가 공을 찬 뒤 이 시간 동안은 루즈볼을 쫓지 않는다 (난이도별) */
  react: [number, number];
}
export interface Pred { x: number; y: number; z: number; t: number; }
export type SimEvent =
  | { k: 'banner'; big: string; small: string; ms: number; goal: boolean }
  | { k: 'sfx'; type: SfxType }
  | { k: 'crowd'; amt: number; dur: number }
  | { k: 'puff'; x: number; y: number; n: number; sp: number }
  | { k: 'shake'; v: number }
  | { k: 'hud' }
  | { k: 'full' };
export interface HumanCfg { tag: string; col: string; cursor: 'manual' | 'auto'; }
export interface MatchCfg {
  teams: [TeamDef, TeamDef]; len: number; diff: DiffKey; tempo: number; firstKick: number;
  humans: [HumanCfg | null, HumanCfg | null]; net: boolean; seed: number;
  /** 선수단 (포메이션·선발·개인 능력치). null이면 TEAMS 팀 능력치 + 4-4-2 익명 선수 */
  squads?: [SquadDef | null, SquadDef | null];
  /** 게스트: 시뮬을 돌리지 않고 스냅샷만 받는다 (선수 배치만 하고 킥오프 안 함) */
  guest?: boolean;
}
export interface Sim {
  M: MatchInfo; ball: Ball; players: Player[]; team: [Player[], Player[]];
  HU: [Human | null, Human | null]; INP: [Inp, Inp]; pred: Pred[];
  rnd: () => number; ev: SimEvent[];
}
