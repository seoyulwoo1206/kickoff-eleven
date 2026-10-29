import { W } from './consts';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** 팀 기준 좌표: 팀 1은 x를 뒤집어 "내 공격 방향이 +x"가 되게 한다 */
export const wx = (x: number, t: number) => (t === 0 ? x : W - x);
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
export function angDiff(a: number, b: number) {
  return ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}
export function angApproach(a: number, b: number, max: number) {
  const df = angDiff(a, b);
  if (Math.abs(df) <= max) return b;
  return a + Math.sign(df) * max;
}
export function lerpAng(a: number, b: number, f: number) {
  return a + angDiff(a, b) * f;
}
