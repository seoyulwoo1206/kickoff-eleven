import type { Inp } from '../input/actions';
import type { TeamDef, Kit, Role, DiffKey } from '../data/teams';

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
}
export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  owner: Player | null; lastTouch: number; passTarget: Player | null; kicker: Player | null;
  shot: number; isShot: boolean; spin: number; knock: Player | null;
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
  /** 게스트: 시뮬을 돌리지 않고 스냅샷만 받는다 (선수 배치만 하고 킥오프 안 함) */
  guest?: boolean;
}
export interface Sim {
  M: MatchInfo; ball: Ball; players: Player[]; team: [Player[], Player[]];
  HU: [Human | null, Human | null]; INP: [Inp, Inp]; pred: Pred[];
  rnd: () => number; ev: SimEvent[];
}
