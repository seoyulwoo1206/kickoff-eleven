/* 입력 액션. 키보드·게임패드·터치가 모두 같은 액션을 낸다.
   FC 온라인 배치 (공격/수비): pass(S) 짧은패스/커서 전환 · lob(A) 롱패스·크로스/슬라이딩 · through(W) 스루/골키퍼 나오기 · shoot(D) 슛/태클·압박(누른 채) · chip(Z) 누른 채 슛 = 감아차기(탭 = 칩슛) · run(Q) 침투 요청, 누른 채 슛 = 칩슛·누른 채 패스 = 주고 뛰기/동료 압박 · gkRush(X) 개인기/골키퍼 나오기 · sprint(E) 질주 · switch(Shift) 치달/뒤쪽 수비수 · jockey(C) -/자세 낮춰 따라붙기
   ACTS의 순서는 온라인 입력 비트마스크의 비트 순서이기도 하다 */
export const ACTS = ['pass', 'lob', 'through', 'shoot', 'chip', 'gkRush', 'sprint', 'run', 'switch', 'jockey', 'tackle'] as const; // switch(Shift): 수비 때 뒤쪽 수비수로 커서 전환. // run(Q): 공격 침투 지시 / 수비 압박 지원
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
  aimA: number; aimT: number;      // 마지막 스틱 방향과 남은 기억 시간(51차): 스틱을 뗀 직후 0.25초 안에 누른 패스는 그 방향으로
  cmd: number;                     // 숫자 키 1~4 (53차: 코너킥 작전·퀵 전술). 시뮬이 한 번 읽고 0으로
  hintP: number; hintK: number; hintT: number; // 온라인 게스트가 자기 화면에서 고른 받을 선수(선수 번호·1 패스/2 스루·남은 시간). 없으면 -1
}
const rec = <T,>(v: T) => Object.fromEntries(ACTS.map(a => [a, v])) as Record<Act, T>;
export function newInp(): Inp {
  return { mx: 0, my: 0, keys: new Set(), tx: 0, ty: 0, press: rec(false), down: rec(false), rel: rec(false), holdT: rec(0), touch: false, skill: null, aimA: 0, aimT: 0, cmd: 0, hintP: -1, hintK: 0, hintT: 0 };
}
export function isAct(k: string): k is Act { return (ACTS as readonly string[]).includes(k); }
export function keyDown(I: Inp, k: Act | Dir, repeat?: boolean) {
  if (isAct(k)) { if (!repeat && !I.down[k]) { I.press[k] = true; I.holdT[k] = 0; } I.down[k] = true; }
  else I.keys.add(k);
}
/** 누르고 있던 액션을 거둔다 — 뗀 것(rel)으로 치지 않으므로 떼는 순간 나가는 패스·슛이 안 나간다 (폰: 버튼을 밀어 다른 동작으로 바꿀 때) */
export function keyCancel(I: Inp, k: Act) { I.down[k] = false; }
/** '누르고 있음'만 켠다(눌린 것 press로는 안 친다) — 폰: 패스 버튼을 아래로 밀면 Q를 누른 채 패스(주고 뛰기)가 되되, Q 탭의 침투 요청은 안 나가게 */
export function keyHold(I: Inp, k: Act) { I.down[k] = true; }
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
  if (Math.hypot(x, y) > 0.15) { I.aimA = Math.atan2(y, x); I.aimT = 0.25; } else I.aimT = Math.max(0, I.aimT - dt);
  if (I.hintT > 0) { I.hintT -= dt; if (I.hintT <= 0) I.hintP = -1; }
  for (const a of ACTS) if (I.down[a]) I.holdT[a] += dt;
}
export function clearPresses(I: Inp) { for (const a of ACTS) { I.press[a] = false; I.rel[a] = false; } }
/** 포커스를 잃었을 때: 누르고 있던 키를 모두 뗀 것으로 */
export function dropKeys(I: Inp) { I.keys.clear(); for (const a of ACTS) { if (I.down[a]) I.rel[a] = true; I.down[a] = false; } }
