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
  kickCD: number; stun: number; tackleCD: number; bodyCD: number; reactT: number; shield: number; lagVx: number; lagVy: number; cutCD: number; beatT: number; /* beatT: 드리블에 제쳐진 뒤 따라가기 급급한 시간 */ runT: number; runDir: number; // runT: 침투 지시 남은 시간, runDir 방향 // shield: 사람이 패스·슛 키를 누른 직후 .16초는 뺏기지 않는다 (탭이 떼는 순간 실행되므로)
  offs: boolean; slide: number; decT: number; holdT: number; lastSave: number;
  dive: number; diveDir: number; run: number; forcePass: boolean; forceShot: boolean; cele: boolean;
  /** 키퍼가 공을 발밑에 두고 있다 (동료의 백패스를 받았거나 손에서 내려놓음) — 다른 선수가 건드릴 때까지 손으로 못 잡는다 */ atFeet: boolean;
  /** 스탠딩 태클로 발을 뻗는 동작·다이빙 헤딩 동작의 남은 시간 (렌더·역동작 판정용) */ lunge: number; head: number;
  hair: string; skin: string; /** 얼굴·머리 모양 씨앗과 피부 단계(0 밝은 ~ 5 어두운) — data/looks.ts */ look: number; tone: number;
  /** 선수단 데이터 (없으면 팀 능력치만으로 만든 익명 선수) */
  name: string; nameEn: string; pos: Pos; ovr: number; foot: 'L' | 'R'; skill: number; attrs: Detail; def: PlayerDef | null;
  /** Phase 4: 기본 속력(speed는 체력 반영 후), 체력 0~1, 킥 와인드업 남은 시간과 예약된 킥, 개인기 상태 */
  speed0: number; sta: number; kickWind: number; pending: (() => void) | null; feint: number; burst: number; spin: number; spinDir: number;
  /** Phase 5: 퇴장(경기장 밖), 경고 수 */
  off: boolean; yellow: number;
}
export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  owner: Player | null; lastTouch: number; passTarget: Player | null; kicker: Player | null; thru: boolean; shotT: number; /* shotT: 슛이 골문까지 날아가는 시간 어림 (키퍼가 볼 시간) */ /* thru: 스루패스로 찬 공 (구르는 동안 더 먼저 닿는 동료가 있으면 받는 선수를 바꾼다) */
  shot: number; isShot: boolean; spin: number; knock: Player | null;
  /** 마그누스 휨 (진행 방향에 수직인 가속, 부호 = 방향) */
  curl: number;
  /** 세트피스(코너킥·프리킥·골킥)로 찬 공인가 — 공중볼 경합이 제대로 붙는다 */
  setp: boolean;
}
export interface Human {
  t: number; ctrl: Player | null; lock: number; charge: number; charging: boolean;
  second: boolean; gkRush: boolean; pressT: number; lostT: number; swSeen: Player[]; swT: number; swHold: boolean; armP: boolean; armL: boolean; mod: number; zUsed: boolean; /** 키퍼가 공을 잡았을 때 조작 안내를 보여 준 횟수 (경기당 두 번까지) */ gkTips: number; /* armP·armL: 패스·롱패스 키를 우리 공일 때 눌렀는가 (수비 때 누른 키를 공을 뺏은 뒤 떼도 패스가 나가지 않게). mod: 슛을 모으는 동안 누른 보조 키 (1 감아차기, 2 칩슛) */ lockA: number; lockT: number; /* lockA·lockT: 세트피스를 찰 때 누르고 있던 방향키는 받는 선수의 이동으로 치지 않는다 (떼거나 방향을 바꿀 때까지, 최대 lockT초) */ /* 커서 전환: 방금 거쳐 간 선수들(1.2초 안에 다시 누르면 그다음 선수) */ /* lostT: 방금 공을 뺏긴 뒤 남은 시간 (그동안은 공을 돌아본다) */ col: string; tag: string; cursor: 'manual' | 'auto'; had: boolean; // pressT: 압박 지원(Q) 남은 시간
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
  overT: number; /* 종료 시각을 넘겨 마지막 공격을 지켜본 시간(실제 초) */
  dead: Player | null; deadT: number; deadR: number; wall: Player[]; /* 아직 차지 않은 세트피스(어느 팀이든)의 키커·지난 시간·상대가 떨어져 있어야 하는 거리·벽 */
  /** 골킥 배치: 찰 때까지 선수별로 서 있을 자리 */ spots: Map<Player, { x: number; y: number }> | null;
  setAim: boolean; aimX: number; aimY: number; aimMan: Player | null; /* aimMan: 조준점으로 들어가 받을 동료 */ /* 사람 팀 코너킥·프리킥·골킥의 조준점 (방향키로 옮긴다) */
  setTaker: Player | null; setT: number; setX: number; setY: number; /* 사람 팀 코너킥·프리킥·골킥·페널티의 키커와 공을 놓고 선 시간: 찰 때까지 제자리 (몰고 나갈 수 없다) */
  throwIn: Player | null; throwT: number; /* 스로인을 던질 선수(공을 손에 들고 서 있다)와 든 시간 */
  lastAtt: number; autoRun: [number, number]; // 다음 자동 침투까지 남은 시간 (팀별)
  tac: [Tactics, Tactics]; bench: [PlayerDef[], PlayerDef[]]; subs: [number, number]; stops: number; added: number[];
  /** 토너먼트: 비기면 연장(전·후반 3·4) → 승부차기. so는 승부차기 상태 */
  knockout: boolean; so: Shootout | null;
  adv: { t: number; x: number; y: number; timer: number; on: Player } | null;
}
export interface Pred { x: number; y: number; z: number; t: number; }
/** xT 집계용 사건 (계산은 시뮬 밖 src/xt/에서): 공을 받음·참·슛·아웃(세트피스·킥오프)·골 */
export type XtKind = 'gain' | 'kick' | 'shot' | 'out' | 'goal' | 'save' | 'clear'; // save: 키퍼가 슛을 막음, clear: 머리·몸으로 걷어 냄(공을 갖진 않음) — 평점용(rating.ts), xT 집계는 무시한다
export type SimEvent =
  | { k: 'banner'; big: string; small: string; ms: number; goal: boolean }
  | { k: 'sfx'; type: SfxType }
  | { k: 'crowd'; amt: number; dur: number }
  | { k: 'puff'; x: number; y: number; n: number; sp: number }
  | { k: 'shake'; v: number }
  | { k: 'hud' }
  | { k: 'card'; t: number; num: number; kind: 'Y' | 'R' }
  | { k: 'sub'; t: number; num: number }
  | { k: 'xt'; e: XtKind; t: number; num: number; x: number; y: number; tick: number }
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
