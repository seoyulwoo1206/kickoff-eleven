/* xT 집계: 시뮬이 내보낸 'xt' 사건(받음·참·슛·아웃·골)으로 drive를 만들고, 패스·드리블마다 "행동 전후 위치"를 기록한다.
   값(ΔxT)은 기록할 때 계산하지 않고 summarize()가 분할·모델·T를 받아 그때 계산한다 — 같은 경기를 분할만 바꿔 다시 볼 수 있다.
   DOM 의존 없음 */
import { xtAt, partsWith, type XtTables, type Part, type Model, type TKey } from './table';
import type { XtKind } from '../sim/types';

export interface XtEv { e: XtKind; t: number; num: number; x: number; y: number; tick: number; }
/** 한 번의 행동: 패스(찬 곳 → 동료가 받은 곳)·드리블(받은 곳 → 찬 곳) */
export interface Action { kind: 'pass' | 'carry'; t: number; num: number; x0: number; y0: number; x1: number; y1: number; tick: number; }
/** 공을 받은 순간 (연구의 '이벤트'). goalTick: 같은 drive에서 골이 난 틱(없으면 -1) → (goalTick − tick)/60 ≤ T 면 라벨 1 */
export interface GainRec { t: number; num: number; x: number; y: number; tick: number; drive: number; goalTick: number; }
export interface XtStat { pass: number; carry: number; total: number; touches: number; }
interface Spot { t: number; num: number; x: number; y: number; tick: number; restart: boolean; }

export const pkey = (t: number, num: number) => t + ':' + num;

export class XtTracker {
  actions: Action[] = []; gains: GainRec[] = []; touches = new Map<string, number>();
  /** 방금 기록된 행동 (화면에 ΔxT를 띄우는 용도). 읽은 쪽이 비운다 */
  fresh: Action[] = [];
  private hold: Spot | null = null;  // 공을 받아 갖고 있는 선수와 받은 자리 (드리블 시작점)
  private kick: Spot | null = null;  // 찬 뒤 아직 아무도 안 받은 공
  private restart = true;            // 다음 킥은 세트피스·킥오프 재개 킥 (연구는 오픈플레이만 — 재개 킥 자체는 기여에서 뺀다)
  private drive = 0; private driveTeam = -1;

  private act(kind: 'pass' | 'carry', a: Spot, e: XtEv) {
    if (Math.hypot(e.x - a.x, e.y - a.y) < 0.4) return; // 제자리
    const r: Action = { kind, t: a.t, num: a.num, x0: a.x, y0: a.y, x1: e.x, y1: e.y, tick: e.tick }; this.actions.push(r); this.fresh.push(r);
  }
  private touch(e: XtEv) {
    const k = pkey(e.t, e.num); this.touches.set(k, (this.touches.get(k) ?? 0) + 1);
    if (this.driveTeam !== e.t) { this.drive++; this.driveTeam = e.t; }
    this.gains.push({ t: e.t, num: e.num, x: e.x, y: e.y, tick: e.tick, drive: this.drive, goalTick: -1 });
  }
  push(e: XtEv) {
    const k = this.kick, h = this.hold;
    switch (e.e) {
      case 'out': this.hold = this.kick = null; this.restart = true; this.driveTeam = -1; break;
      case 'gain':
        if (k) {
          if (k.t !== e.t) { this.driveTeam = -1; this.touch(e); }                    // 패스가 끊김: 기여 0, 상대의 새 drive
          else if (k.num === e.num) { if (!k.restart) this.act('carry', k, e); }      // 자기가 찬 공을 다시 잡음: 이어지는 드리블
          else { if (!k.restart) this.act('pass', k, e); this.touch(e); }             // 패스 성공 → 패스한 선수
        } else if (h && h.t === e.t && h.num === e.num) { this.kick = null; return; } // 차 놓고(노크온) 다시 잡음: 드리블 계속, 시작점 유지
        else { if (!h || h.t !== e.t) this.driveTeam = -1; this.touch(e); }           // 뺏음(새 drive) / 흘린 공을 동료가 주움(기여 없음)
        this.kick = null; this.hold = { t: e.t, num: e.num, x: e.x, y: e.y, tick: e.tick, restart: false };
        break;
      case 'kick':
        if (this.restart) { this.restart = false; this.hold = null; this.kick = { t: e.t, num: e.num, x: e.x, y: e.y, tick: e.tick, restart: true }; break; }
        if (h && h.t === e.t && h.num === e.num) this.act('carry', h, e);            // 받은 자리 → 찬 자리
        this.hold = null; this.kick = { t: e.t, num: e.num, x: e.x, y: e.y, tick: e.tick, restart: false };
        break;
      case 'shot': // 슛은 drive의 끝. 드리블은 kick 사건에서 이미 셌고, 슛 자체의 가치는 xG의 몫이라 세지 않는다
        if (k && k.t === e.t && k.num !== e.num) { if (!k.restart) this.act('pass', k, e); this.touch(e); } // 크로스를 바로 머리로: 올린 선수의 패스
        this.hold = this.kick = null; this.restart = false; this.driveTeam = -1;
        break;
      case 'goal': // 같은 drive에서 공을 받은 순간들에 골 시각을 적는다 (연구의 'T초 안 같은 drive 득점' 라벨)
        for (let i = this.gains.length - 1; i >= 0; i--) { const g = this.gains[i]; if (g.drive !== this.drive) break; if (g.t === e.t) g.goalTick = e.tick; }
        this.hold = this.kick = null; this.restart = true; this.driveTeam = -1;
        break;
    }
  }
}

/** 분할 하나에 대해 선수별 스탯 (키 = pkey(팀, 등번호)) */
export function summarize(tb: XtTables, tr: XtTracker, part: Part, m: Model, T: TKey) {
  const out = new Map<string, XtStat>();
  const get = (k: string) => { let s = out.get(k); if (!s) { s = { pass: 0, carry: 0, total: 0, touches: 0 }; out.set(k, s); } return s; };
  for (const [k, n] of tr.touches) get(k).touches = n;
  for (const a of tr.actions) { const s = get(pkey(a.t, a.num)), v = actionValue(tb, a, part, m, T); s[a.kind] += v; s.total += v; }
  return out;
}
export const actionValue = (tb: XtTables, a: Action, part: Part, m: Model, T: TKey) => xtAt(tb, part, m, T, a.x1, a.y1, a.t) - xtAt(tb, part, m, T, a.x0, a.y0, a.t);

export interface RankRow { key: string; t: number; num: number; touches: number; val: Partial<Record<Part, number>>; rank: Partial<Record<Part, number>>; }
/** 분할 4종을 나란히: 선수별 total과 분할 안에서의 순위(1이 최고), 분할 쌍의 스피어만 순위상관 */
export function compare(tb: XtTables, tr: XtTracker, m: Model, T: TKey, minTouches = 1) {
  const parts = partsWith(tb, m, T), sums = parts.map(p => summarize(tb, tr, p, m, T));
  const keys = [...(sums[0]?.keys() ?? [])].filter(k => (sums[0].get(k)!.touches) >= minTouches);
  const rows: RankRow[] = keys.map(k => { const [t, num] = k.split(':').map(Number); return { key: k, t, num, touches: sums[0].get(k)!.touches, val: {}, rank: {} }; });
  parts.forEach((p, i) => {
    for (const r of rows) r.val[p] = sums[i].get(r.key)!.total;
    [...rows].sort((a, b) => b.val[p]! - a.val[p]!).forEach((r, j) => { r.rank[p] = j + 1; });
  });
  const rho: { a: Part; b: Part; r: number }[] = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) rho.push({ a: parts[i], b: parts[j], r: spearman(rows.map(r => r.val[parts[i]]!), rows.map(r => r.val[parts[j]]!)) });
  const team = parts.map(p => [0, 1].map(t => rows.filter(r => r.t === t).reduce((s, r) => s + r.val[p]!, 0)) as [number, number]);
  return { parts, rows, rho, team };
}
/** 스피어만 순위상관 (동점은 평균 순위). 표본이 3 미만이거나 한쪽이 전부 같으면 NaN */
export function spearman(a: number[], b: number[]) {
  const n = a.length; if (n < 3) return NaN;
  const rk = (v: number[]) => { const idx = v.map((x, i) => [x, i] as [number, number]).sort((p, q) => p[0] - q[0]), r = new Array<number>(n); for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const ra = rk(a), rb = rk(b), ma = (n + 1) / 2; let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = ra[i] - ma, db = rb[i] - ma; sab += da * db; saa += da * da; sbb += db * db; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
