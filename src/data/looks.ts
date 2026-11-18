/* 선수 겉모습: 피부색·머리색·얼굴 생김새 씨앗. 선수 개인 자료가 아니라 팀 단위 분포에서 이름으로 고른다
   (같은 선수는 늘 같은 모습, 시뮬 난수는 쓰지 않는다 — 결과 불변). 실제 선수와 다를 수 있다 */
export const SKIN = ['#f6d8be', '#edc29d', '#dba77b', '#bb8153', '#8e5a37', '#5c3822']; // 밝은 → 어두운
export const HAIR = ['#0f0d0c', '#2a1c12', '#4a2f1a', '#7a5230', '#b89255', '#d8c17c', '#8a3b1c', '#9a9a98']; // 검정·흑갈·갈·밝은 갈·금·밝은 금·붉은·회색
// [피부 6단계 가중치, 머리색 8가지 가중치]
const DIST: Record<string, [number[], number[]]> = {
  KOR: [[2, 7, 2, 0, 0, 0], [8, 3, 1, 0, 0, 0, 0, 0]], JPN: [[2, 7, 2, 0, 0, 0], [8, 3, 1, 0, 0, 0, 0, 0]],
  BRA: [[1, 2, 3, 3, 2, 1], [6, 3, 1, 0, 0, 0, 0, 0]], ARG: [[3, 5, 3, 1, 0, 0], [3, 5, 3, 1, 0, 0, 0, 0]],
  FRA: [[2, 2, 1, 2, 3, 3], [6, 3, 1, 0, 0, 0, 0, 0]], ENG: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 2, 1, 0, 1, 0]],
  ESP: [[3, 5, 3, 1, 0, 0], [3, 5, 3, 1, 0, 0, 0, 0]], GER: [[5, 3, 1, 1, 1, 1], [2, 3, 3, 2, 2, 1, 0, 0]],
  ITA: [[3, 5, 3, 0, 0, 0], [4, 5, 2, 0, 0, 0, 0, 0]], NED: [[4, 2, 1, 1, 2, 2], [3, 2, 2, 2, 2, 1, 0, 0]],
  POR: [[2, 5, 3, 1, 1, 0], [5, 4, 2, 0, 0, 0, 0, 0]], BEL: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 1, 1, 0, 1, 0]],
  CRO: [[5, 4, 1, 0, 0, 0], [2, 4, 3, 2, 1, 0, 0, 0]], URU: [[3, 5, 3, 1, 0, 0], [4, 5, 2, 0, 0, 0, 0, 0]],
  MEX: [[1, 3, 5, 2, 0, 0], [7, 3, 0, 0, 0, 0, 0, 0]], USA: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 1, 1, 0, 0, 0]],
  SEN: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]], GHA: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]], NGA: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]],
  MAR: [[1, 3, 5, 3, 1, 0], [8, 3, 0, 0, 0, 0, 0, 0]], AUS: [[5, 3, 1, 1, 1, 0], [2, 3, 3, 2, 2, 1, 1, 0]],
  COL: [[1, 2, 3, 3, 2, 1], [7, 3, 0, 0, 0, 0, 0, 0]], DEN: [[6, 3, 0, 0, 1, 0], [1, 2, 3, 3, 3, 2, 1, 0]],
  SUI: [[4, 3, 1, 1, 1, 1], [3, 3, 3, 1, 1, 0, 0, 0]],
};
const DFLT: [number[], number[]] = [[2, 3, 2, 1, 1, 1], [5, 3, 2, 1, 1, 0, 0, 0]];
function hash(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(w: number[], r: number) { let sum = 0; for (const x of w) sum += x; let q = r * sum; for (let i = 0; i < w.length; i++) { q -= w[i]; if (q < 0) return i; } return w.length - 1; }
/** 씨앗에서 n번째 0~1 값 (얼굴 생김새의 각 항목에 하나씩) */
export function lookBit(seed: number, n: number) { let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
export interface Look { skin: string; hair: string; seed: number; tone: number; }
export function lookOf(code: string, name: string, num: number): Look {
  const seed = hash(code + '|' + name + '|' + num), [ws, wh] = DIST[code] ?? DFLT;
  const tone = pick(ws, lookBit(seed, 0)); let hi = pick(wh, lookBit(seed, 1)); if (tone >= 4 && hi > 1) hi = 0; // 어두운 피부엔 검은 머리
  return { skin: SKIN[tone], hair: HAIR[hi], seed, tone };
}
