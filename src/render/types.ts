import type { Sim } from '../sim/types';

export type Quality = 'low' | 'mid' | 'high';
export type CamMode = 'tv' | 'pro' | 'top' | 'intro';
/** 렌더러 공통 인터페이스. main.ts는 이것만 안다 */
export interface IRenderer {
  cam: { x: number; y: number; shake: number; z: number };
  cw: number; ch: number;
  resize(): void;
  puff(x: number, y: number, n: number, sp: number): void;
  /** 한 프레임. sim이 없으면 메뉴 배경 */
  render(sim: Sim | null, dtR: number, perf: number, paused: boolean): void;
  /** 경기 시작 시 상태 초기화 (파티클·리플레이 버퍼 등) */
  reset(): void;
  setQuality?(q: Quality): void;
  setCamMode?(m: CamMode): void;
  /** 시야 배율: 1 가깝게(가로 38m) ~ 2.4 전체(91m) */
  setView?(v: number): void;
  /** 최근 프레임 평균 fps (자동 품질 조절용) */
  fps?: number;
}
