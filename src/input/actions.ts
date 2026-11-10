/* 입력 액션. 키보드·게임패드·터치가 모두 같은 액션을 낸다.
   FC 온라인 배치: pass(S) 짧은패스/압박 · lob(A) 롱패스/전환 · through(W) 스루/세컨드 · shoot(D) 슛/슬라이딩 · chip(Z) 칩슛 · run(Q) 침투 지시/압박 지원 · gkRush(X) 개인기·감아차기/골키퍼 돌진 · sprint(E) 질주
   ACTS의 순서는 온라인 입력 비트마스크의 비트 순서이기도 하다 */
export const ACTS = ['pass', 'lob', 'through', 'shoot', 'chip', 'gkRush', 'sprint', 'run', 'switch'] as const; // switch(Shift): 수비 때 뒤쪽 수비수로 커서 전환. // run(Q): 공격 침투 지시 / 수비 압박 지원
export type Act = (typeof ACTS)[number];
export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Inp {
  mx: number; my: number;          // 이번 틱의 이동 벡터 (키 + 스틱 합성, 길이 ≤ 1)
  keys: Set<Dir>;                  // 디지털 방향 입력
  tx: number; ty: number;          // 아날로그 스틱
  press: Record<Act, boolean>;     // 이번 틱에 눌림
  down: Record<Act, boolean>;      // 누르고 있음
  rel: Record<Act, boolean>;       // 이번 틱에 뗌
  holdT: Record<Act, number>;      // 누른 시간
  touch: boolean;                  // 터치 조작 중 (패스 버튼 길게 = 롱패스 등)
  skill: { x: number; y: number } | null; // 폰 스와이프 개인기 방향 (gkRush press와 함께)
}
const rec = <T,>(v: T) => Object.fromEntries(ACTS.map(a => [a, v])) as Record<Act, T>;
export function newInp(): Inp {
  return { mx: 0, my: 0, keys: new Set(), tx: 0, ty: 0, press: rec(false), down: rec(false), rel: rec(false), holdT: rec(0), touch: false, skill: null };
}
export function isAct(k: string): k is Act { return (ACTS as readonly string[]).includes(k); }
export function keyDown(I: Inp, k: Act | Dir, repeat?: boolean) {
  if (isAct(k)) { if (!repeat && !I.down[k]) { I.press[k] = true; I.holdT[k] = 0; } I.down[k] = true; }
  else I.keys.add(k);
}
export function keyUp(I: Inp, k: Act | Dir) {
  if (isAct(k)) { if (I.down[k]) I.rel[k] = true; I.down[k] = false; }
  else I.keys.delete(k);
}
/** 키와 스틱을 합쳐 이동 벡터를 만들고 누른 시간을 쌓는다 (시뮬 틱마다) */
export function readInput(I: Inp, dt: number) {
  let x = I.tx, y = I.ty;
  if (I.keys.has('left')) x -= 1; if (I.keys.has('right')) x += 1; if (I.keys.has('up')) y -= 1; if (I.keys.has('down')) y += 1;
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  I.mx = x; I.my = y;
  for (const a of ACTS) if (I.down[a]) I.holdT[a] += dt;
}
export function clearPresses(I: Inp) { for (const a of ACTS) { I.press[a] = false; I.rel[a] = false; } }
/** 포커스를 잃었을 때: 누르고 있던 키를 모두 뗀 것으로 */
export function dropKeys(I: Inp) { I.keys.clear(); for (const a of ACTS) { if (I.down[a]) I.rel[a] = true; I.down[a] = false; } }
