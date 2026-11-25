/* 53차 — 경기 중 숫자 키 1~4 (폰은 작전 버튼 줄): 내 코너킥을 차기 전엔 코너킥 작전, 그 밖엔 퀵 전술. 사람 팀만 쓴다 (AI 팀은 코너킥 작전·짧은 코너킥만 `aiCornerPlan`).
   입력은 `Inp.cmd`(한 번 쓰고 지움)로 들어와 `step`이 `command`를 부른다 — 온라인 게스트도 같은 길 */
import { W, H, CY } from './consts';
import { wx } from './util';
import type { Sim, Human, Player } from './types';
import { banner } from './events';

/** 퀵 전술 상태 (팀별, 남은 시간·초). press 팀 압박 · trap 오프사이드 트랩(trapCD 다시 쓸 수 있을 때까지) · fwd 공격수 추가(fwdP = 올라간 센터백) · box 박스로 */
export interface Quick { press: number; trap: number; trapCD: number; fwd: number; box: number; fwdP: Player | null; }
export const newQuick = (): Quick => ({ press: 0, trap: 0, trapCD: 0, fwd: 0, box: 0, fwdP: null });
export const QT_NAMES = ['팀 압박', '오프사이드 트랩', '공격수 추가', '박스로'] as const;
export const CNR_NAMES = ['니어 포스트', '파 포스트', '박스 끝', '키퍼 앞'] as const;
export const QT_PRESS = 20, QT_TRAP = 3, QT_TRAP_CD = 10, QT_FWD = 45, QT_BOX = 30;
/** 트랩 중 수비 라인을 끌어올리는 거리(m) */
export const TRAP_UP = 9;

/* 코너킥 작전: 공격 다섯(cornerSetup의 앞 다섯 자리)이 페널티 스폿 둘레에 모여 섰다가 차는 순간 약속된 자리로 뛴다.
   자리는 [골라인에서 거리(m), 가운데에서 공 쪽(니어, +)으로 거리(m)] — from 시작 자리·to 뛸 자리·aim 조준점. main = 조준점으로 들어가 받는 선수(다섯 중 몇째).
   자리는 키퍼가 늘 나와 잡는 범위(골라인 5.5m 안) 밖으로 잡았다 — 처음엔 니어 5m·키퍼 앞 4m라 59~75%를 키퍼가 잡았다 */
export const C_PLAN: { from: [number, number][]; to: [number, number][]; aim: [number, number]; main: number }[] = [
  // 1 니어 포스트: 첫째가 니어 포스트 앞 7m로 잘라 들어가 머리에 맞힌다, 나머지는 파 포스트·스폿으로 흩어져 수비를 끈다
  { from: [[11, 1.2], [11.5, -1.5], [10.5, -4.5], [14, 4], [14.5, -3]], to: [[7.2, 4.6], [7, -4.4], [9.5, -8], [10.5, 0], [12.5, -3]], aim: [7.2, 4.4], main: 0 },
  // 2 파 포스트: 첫째는 니어로 수비를 끌고 둘째가 파 포스트 뒤쪽 8.5m로 돌아 들어간다
  { from: [[11, 1.2], [11.5, -1.5], [10.5, -4.5], [14, 4], [14.5, -3]], to: [[5, 3.4], [8.5, -4.7], [6.5, 0.4], [10.5, 0.5], [11, -8]], aim: [8.5, -4.5], main: 1 },
  // 3 박스 끝: 셋이 골문으로 몰려가 수비를 끌고, 넷째가 박스 끝에 남아 받는다 (받아서 슛·발리)
  { from: [[11, 1.2], [11.5, -1.5], [10.5, -4.5], [14, 4], [14.5, -3]], to: [[4.8, 3], [5.5, -3.5], [6.5, -0.4], [15.5, 2], [13, -6]], aim: [15, 1.6], main: 3 },
  // 4 키퍼 앞: 둘이 처음부터 키퍼 곁에 붙어 서서 못 나오게 막고(`gkAI`), 첫째가 골문 5m 앞으로 뛰어든다
  { from: [[10, 1.5], [2.2, -0.6], [2.3, 1.9], [11, -3], [14.5, 3]], to: [[4.6, 0.6], [1.9, -0.3], [2, 1.7], [7.5, -4], [10.5, 1]], aim: [4.6, 0.5], main: 0 },
];
/** 코너킥 작전을 건다 (차기 전): 다섯이 시작 자리로 가서 기다리고(`spT` −1), 조준점은 작전 자리로. place = 바로 그 자리에 세운다(AI — 배치와 같이) */
export function cornerPlan(s: Sim, t: number, n: number, place = false) {
  const { M } = s, pl = C_PLAN[n - 1], men = M.cnrMen[t]; if (!pl || !M.dead || M.dead.t !== t || M.spType !== 'corner' || !M.spots || !men.length) return false;
  const sd = M.setY < CY ? -1 : 1; M.cnr[t] = n;
  { let bi = -1, bs = -1e9; for (let i = 0; i < Math.min(men.length, pl.from.length); i++) { const p = men[i]; if (p.off) continue; const sc = p.attrs.hea + p.attrs.jmp * 0.5; if (sc > bs) { bs = sc; bi = i; } } // 받는 자리(main)는 다섯 중 헤딩이 가장 좋은 선수가 맡는다 (자리 순서대로 두면 작전에 따라 헤딩 55짜리가 받아 파 포스트 작전은 300번에 1골이었다)
    if (bi >= 0 && bi !== pl.main && men[pl.main]) { const tmp = men[bi]; men[bi] = men[pl.main]; men[pl.main] = tmp; } }
  men.forEach((p, i) => { if (i >= pl.from.length || p.off) return; const st = pl.from[i], to = pl.to[i], x = wx(W - st[0], t), y = CY + sd * st[1];
    M.spots!.set(p, { x, y }); if (place) { p.x = x; p.y = y; p.vx = p.vy = 0; } p.spX = wx(W - to[0], t); p.spY = CY + sd * to[1]; p.spT = -1; });
  M.cnrMain[t] = men[pl.main] ?? null; M.gkBlock = n === 4 && s.rnd() < 0.5;
  if (M.setAim && M.setTaker === M.dead) { M.aimX = wx(W - pl.aim[0], t); M.aimY = CY + sd * pl.aim[1]; }
  return true;
}
/** 작전의 조준 자리 (AI 키커가 쓴다) */
export function cornerAim(s: Sim, t: number): { x: number; y: number } | null { const { M } = s, pl = C_PLAN[M.cnr[t] - 1]; if (!pl) return null; const sd = M.setY < CY ? -1 : 1; return { x: wx(W - pl.aim[0], t), y: CY + sd * pl.aim[1] }; }
/** 약속된 뛰기 시작 (차는 순간 — `setKick`). 공격 쪽은 세워 둔 자리(`M.spots`)에서 풀린다 */
export function startCornerRuns(s: Sim, t: number) {
  const { M } = s; if (M.cnr[t] < 1 || M.cnr[t] > 4) return; let any = false;
  for (const p of M.cnrMen[t]) if (p.spT < 0 && !p.off) { p.spT = 2.2; any = true; }
  if (any && M.spots) for (const p of s.team[t]) M.spots.delete(p); // 공격 쪽만 풀린다 — 수비는 평소처럼 차는 순간까지 자리를 지킨다 (같이 풀면 지역을 맡은 수비가 자리를 떠나 니어 포스트 작전이 20%나 들어갔다)
}
/** 짧은 코너킥: 짧게 받을 선수(배치의 일곱째 자리)가 깃발에서 8.5m 자리로 나오고, 수비 하나가 그 골 쪽 2.6m(공에서 9.15m 밖)로 따라 나온다. 사람 팀은 조준점도 그 선수에게 */
export function shortCorner(s: Sim, t: number, place = false): Player | null {
  const { M } = s, men = M.cnrMen[t]; if (!M.dead || M.dead.t !== t || M.spType !== 'corner' || !M.spots) return null;
  const sd = M.setY < CY ? -1 : 1, sx = wx(W - 7, t), sy = CY + sd * (H / 2 - 6);
  let man = M.shortMan && !M.shortMan.off && M.shortMan.t === t ? M.shortMan : null; const fresh = !man;
  if (!man) man = men.find((p, i) => i >= 5 && !p.off) ?? null; if (!man) return null;
  M.shortMan = man; man.spT = 0; M.spots.set(man, { x: sx, y: sy }); if (place) { man.x = sx; man.y = sy; man.vx = man.vy = 0; }
  if (fresh) { // 수비 하나: 골문 앞 자리(골라인 8m 안)를 지키는 선수 말고, 따라 나올 자리에 가장 가까운 선수
    const gx = wx(W, t), ux = gx - sx, uy = CY - sy, L = Math.hypot(ux, uy) || 1; let cx = sx + ux / L * 2.6, cy = sy + uy / L * 2.6;
    { const dx = cx - M.setX, dy = cy - M.setY, q = Math.hypot(dx, dy) || 1; if (q < 9.7) { cx = M.setX + dx / q * 9.7; cy = M.setY + dy / q * 9.7; } }
    let df: Player | null = null, bd = 1e9; for (const o of s.team[1 - t]) { if (o.off || o.role === 'GK') continue; const sp = M.spots.get(o); if (!sp || Math.abs(sp.x - gx) < 8 || Math.abs(sp.x - gx) > 30) continue; const q = Math.hypot(o.x - cx, o.y - cy); if (q < bd) { bd = q; df = o; } }
    if (df) { M.spots.set(df, { x: cx, y: cy }); if (place) { df.x = cx; df.y = cy; df.vx = df.vy = 0; } }
  }
  if (M.setAim && M.setTaker === M.dead) { M.aimX = sx; M.aimY = sy; }
  return man;
}
/** AI 팀의 코너킥: 12%는 짧게(`M.cnr` 5), 68%는 작전(니어 45·파 35·키퍼 앞 20), 나머지는 예전처럼 세워 둔 자리 그대로 (짧게 20%·작전 45%면 사람 팀 상대 코너킥 골이 4.4 → 1.7%로 줄었다) */
export function aiCornerPlan(s: Sim, t: number) {
  const { M } = s, r = s.rnd();
  if (r < 0.12) { if (shortCorner(s, t, true)) M.cnr[t] = 5; }
  else if (r < 0.8) { const k = s.rnd(); cornerPlan(s, t, k < 0.45 ? 1 : k < 0.8 ? 2 : 4, true); }
}
const endFwd = (q: Quick) => { if (q.fwdP && q.fwdP.role === 'FW') q.fwdP.role = 'DF'; q.fwdP = null; q.fwd = 0; };
/** 포메이션을 바꾸기 전에 부른다: 올라간 센터백을 수비수로 되돌린다 */
export function quickReset(s: Sim, t: number) { endFwd(s.M.qt[t]); }
/** 숫자 키 1~4 */
export function command(s: Sim, h: Human, n: number) {
  const { M } = s, t = h.t; if (n < 1 || n > 4 || M.so) return;
  if (M.dead && M.dead.t === t && M.spType === 'corner') { if (cornerPlan(s, t, n)) banner(s, '', `코너킥 작전 ${n} · ${CNR_NAMES[n - 1]}`, 1100); return; }
  const q = M.qt[t];
  if (n === 1) { q.press = q.press > 0 ? 0 : QT_PRESS; banner(s, '', q.press > 0 ? `팀 압박 ${QT_PRESS}초 · 체력이 더 닳습니다` : '팀 압박 해제', 1000); }
  else if (n === 2) { if (q.trapCD > 0) return; q.trap = QT_TRAP; q.trapCD = QT_TRAP_CD; banner(s, '', '오프사이드 트랩 · 수비 라인을 끌어올립니다', 1000); }
  else if (n === 3) {
    if (q.fwd > 0) { endFwd(q); banner(s, '', '공격수 추가 해제', 1000); return; }
    let cb: Player | null = null, bs = -1e9; // 헤딩·점프가 좋은 센터백 (없으면 아무 수비수)
    for (const p of s.team[t]) { if (p.role !== 'DF' || p.off) continue; const sc = p.attrs.hea + p.attrs.jmp + (Math.abs(p.by - CY) <= 14 ? 100 : 0); if (sc > bs) { bs = sc; cb = p; } }
    if (!cb) return; cb.role = 'FW'; q.fwdP = cb; q.fwd = QT_FWD; banner(s, '', `공격수 추가 · ${cb.name} 전방으로 (${QT_FWD}초)`, 1100);
  }
  else { q.box = q.box > 0 ? 0 : QT_BOX; banner(s, '', q.box > 0 ? `박스로 ${QT_BOX}초 · 미드필더도 박스 안으로` : '박스로 해제', 1000); }
}
/** 매 틱: 퀵 전술의 남은 시간 (경기가 흐르는 동안만) */
export function quickTick(s: Sim, dt: number) {
  if (s.M.phase !== 'live') return;
  for (const q of s.M.qt) {
    q.press = Math.max(0, q.press - dt); q.trap = Math.max(0, q.trap - dt); q.trapCD = Math.max(0, q.trapCD - dt); q.box = Math.max(0, q.box - dt);
    if (q.fwd > 0) { q.fwd -= dt; if (q.fwd <= 0 || !q.fwdP || q.fwdP.off) endFwd(q); }
  }
}
