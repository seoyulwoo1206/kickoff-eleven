/* 선수 평점. 시뮬의 'xt' 사건(받음·참·슛·아웃·골·선방·걷어냄)만으로 계산한다 — DOM·시뮬 의존 없음(헤드리스 도구도 같이 쓴다).
   xT만 보면 공격 쪽 선수만 높게 나오므로 세 갈래로 나눠 센다:
   ① 공격: 패스·드리블의 ΔxT(자기 팀 기준 위협이 얼마나 늘었나), 골·도움·슈팅
   ② 수비: 공을 따낸 자리에서 "상대가 갖고 있던 위협"(상대 기준 xT) — 박스 앞에서 끊을수록 크다. 걷어내기·슛 블록·공중볼도 같은 값
   ③ 잃은 공: 뺏긴 자리의 우리 위협(날린 기회) + 상대가 얻은 위협
   ④ 수비수의 자기 구역: 수비수는 공을 직접 따내는 일이 적어(경기당 1~2번) ②만으론 늘 바닥이다. 그래서 상대가 우리 진영에서 올린 위협(패스·드리블의 ΔxT)과 슈팅을
      "그 자리에 가장 가까운 줄의 수비수" 몫으로 적어 두고(allow), 적게 내줄수록 점수를 준다. 수비진 전체에는 상대 슈팅 수·실점을 반영한다.
   키퍼는 선방(슛 자리의 위협만큼)과 실점. 여기에 팀 결과(승패·무실점)를 조금 더한다.
   값 함수 V(x, y, 팀)는 밖에서 준다: 연구 xT 표가 있으면 그것, 없으면 fallbackXt(골까지 거리로 만든 어림값) */
import { W, H } from './sim/consts';
import type { XtKind } from './sim/types';

export type ValueFn = (x: number, y: number, t: number) => number;
export interface RatEv { e: XtKind; t: number; num: number; x: number; y: number; tick: number; }
export interface PStat {
  t: number; num: number; name: string; role: string;
  att: number; def: number; loss: number; /* 위 ①②③의 합 (xT 단위) */
  goals: number; assists: number; shots: number; passes: number; recov: number; clears: number; lost: number; saves: number; conceded: number; touches: number;
  /** 자기 구역에서 내준 위협(xT 단위)과 슈팅 — 수비수만 */ allow: number; shotsAllowed: number;
}
/** 표가 없을 때 쓰는 위협 어림값: 골에 가까울수록·가운데일수록 크다 (0.004 ~ 0.3) */
export const fallbackXt: ValueFn = (x, y, t) => { const gx = t === 0 ? W : 0, d = Math.hypot(gx - x, (H / 2 - y) * 1.15); return 0.004 + 0.3 * Math.exp(-d / 17); };
const key = (t: number, num: number) => t + ':' + num;

export class RatingTracker {
  stats = new Map<string, PStat>(); score = [0, 0];
  private hold: { t: number; num: number; x: number; y: number } | null = null;   // 공을 갖고 있는 선수와 받은 자리
  private kick: { t: number; num: number; x: number; y: number; restart: boolean } | null = null; // 찬 뒤 아직 아무도 안 받은 공
  private shot: { t: number; num: number; x: number; y: number } | null = null;   // 날아가는 슛
  private lastPass: { t: number; from: number; to: number; tick: number } | null = null; // 마지막으로 이어진 패스 (도움)
  private restart = true;
  private V: ValueFn = fallbackXt;
  constructor(V: ValueFn = fallbackXt) { this.setValue(V); }
  /** 값 함수를 바꾼다. 표마다 값의 크기가 다르므로(연구 표는 어림값의 1/3쯤) 경기장 평균이 0.03이 되게 맞춰 쓴다 — 배율(KA·KD·KL)을 표마다 따로 두지 않으려고 */
  setValue(V: ValueFn) { let sum = 0, n = 0; for (let x = 2.5; x < W; x += 5) for (let y = 2; y < H; y += 4) { const v = V(x, y, 0); if (isFinite(v)) { sum += v; n++; } } const k = n && sum > 0 ? 0.03 / (sum / n) : 1; this.V = (x, y, t) => { const v = V(x, y, t); return isFinite(v) ? v * k : 0; }; }
  /** 팀별 슈팅 수 (수비진 평점에 쓴다) */
  shotsBy = [0, 0];
  private backs: { num: number; lane: number }[][] = [[], []]; // 지금 뛰는 수비수와 맡은 줄(기본 위치의 y)
  /** 지금 뛰는 선수 명단을 알려 둔다 (경기 시작·교체·퇴장 때). lane = 기본 위치의 y */
  roster(t: number, list: { num: number; name: string; role: string; lane: number }[]) {
    this.backs[t] = []; for (const p of list) { const s = this.get(t, p.num); s.name = p.name; s.role = p.role; if (p.role === 'DF') this.backs[t].push({ num: p.num, lane: p.lane }); }
  }
  /** 팀 att가 (x, y)에서 위협 dv를 올렸다(또는 슛을 했다) → 수비 팀에서 그 줄에 가장 가까운 수비수 몫 */
  private allowTo(att: number, x: number, y: number, dv: number, shot: boolean) {
    const dt = 1 - att; if ((dt === 0 ? x : W - x) > 48) return; // 수비 팀 진영에서만
    let best: { num: number; lane: number } | null = null; for (const b of this.backs[dt]) if (!best || Math.abs(b.lane - y) < Math.abs(best.lane - y)) best = b;
    if (!best) return; const s = this.get(dt, best.num); if (shot) s.shotsAllowed++; else s.allow += dv;
  }
  private get(t: number, num: number) {
    const k = key(t, num); let s = this.stats.get(k);
    if (!s) { s = { t, num, name: '', role: '', att: 0, def: 0, loss: 0, goals: 0, assists: 0, shots: 0, passes: 0, recov: 0, clears: 0, lost: 0, saves: 0, conceded: 0, touches: 0, allow: 0, shotsAllowed: 0 }; this.stats.set(k, s); }
    return s;
  }
  private lose(t: number, num: number, x: number, y: number, gx: number, gy: number) { // (x, y)에서 갖고 있던 공이 (gx, gy)에서 상대에게 넘어갔다
    const s = this.get(t, num); s.lost++; s.loss += 0.5 * this.V(x, y, t) + 0.5 * this.V(gx, gy, 1 - t) + 0.003;
  }
  push(e: RatEv) {
    const V = this.V, k = this.kick, h = this.hold;
    switch (e.e) {
      case 'out': if (k && !k.restart && !this.shot) this.get(k.t, k.num).loss += 0.004; this.hold = this.kick = this.shot = null; this.restart = true; break;
      case 'gain': {
        const s = this.get(e.t, e.num); s.touches++;
        if (this.shot && this.shot.t !== e.t) { /* 슛을 잡았다: 선방은 'save' 사건에서 센다 */ }
        else if (k && k.t !== e.t) { if (!k.restart) this.lose(k.t, k.num, k.x, k.y, e.x, e.y); s.recov++; s.def += V(e.x, e.y, 1 - e.t) + 0.012; } // 패스를 끊었다
        else if (k && k.num !== e.num) { if (!k.restart) { const p = this.get(k.t, k.num), dv = V(e.x, e.y, e.t) - V(k.x, k.y, k.t); p.att += dv > 0 ? dv : dv * 0.5; p.passes++; if (dv > 0) this.allowTo(e.t, e.x, e.y, dv, false); } this.lastPass = { t: e.t, from: k.num, to: e.num, tick: e.tick }; } // 패스 성공 → 패스한 선수
        else if (!k && h && h.t !== e.t) { this.lose(h.t, h.num, h.x, h.y, e.x, e.y); s.recov++; s.def += V(e.x, e.y, 1 - e.t) + 0.012; } // 발밑에서 뺏었다
        this.kick = null; this.shot = null; if (!(h && h.t === e.t && h.num === e.num)) this.hold = { t: e.t, num: e.num, x: e.x, y: e.y };
        break; }
      case 'kick':
        if (this.restart) { this.restart = false; this.hold = null; this.kick = { t: e.t, num: e.num, x: e.x, y: e.y, restart: true }; break; }
        if (h && h.t === e.t && h.num === e.num) { const dv = V(e.x, e.y, e.t) - V(h.x, h.y, h.t); this.get(e.t, e.num).att += dv > 0 ? dv : dv * 0.5; if (dv > 0) this.allowTo(e.t, e.x, e.y, dv, false); } // 드리블: 받은 자리 → 찬 자리
        this.hold = null; this.kick = { t: e.t, num: e.num, x: e.x, y: e.y, restart: false };
        break;
      case 'shot': { const s = this.get(e.t, e.num); s.shots++; s.att += 0.02; this.shotsBy[e.t]++; this.allowTo(e.t, e.x, e.y, 0, true);
        if (k && k.t === e.t && k.num !== e.num && !k.restart) { const p = this.get(k.t, k.num), dv = V(e.x, e.y, e.t) - V(k.x, k.y, k.t); p.att += dv > 0 ? dv : dv * 0.5; p.passes++; this.lastPass = { t: e.t, from: k.num, to: e.num, tick: e.tick }; } // 크로스를 바로 슛으로
        this.shot = { t: e.t, num: e.num, x: e.x, y: e.y }; this.hold = this.kick = null; this.restart = false; break; }
      case 'save': { const s = this.get(e.t, e.num); s.saves++; s.def += 0.05 + 0.6 * (this.shot ? V(this.shot.x, this.shot.y, this.shot.t) : 0.08); this.shot = null; this.kick = null; break; } // 키퍼가 슛을 막았다 (슛 자리의 위협만큼)
      case 'clear': { const s = this.get(e.t, e.num); s.clears++; s.def += 0.7 * V(e.x, e.y, 1 - e.t) + 0.008; // 머리·몸으로 걷어 냈다 (공은 아직 주인 없음)
        if (k && k.t !== e.t && !k.restart && !this.shot) this.get(k.t, k.num).loss += 0.5 * V(k.x, k.y, k.t) * 0.5 + 0.002;
        this.kick = { t: e.t, num: e.num, x: e.x, y: e.y, restart: true }; this.hold = null; this.shot = null; break; }
      case 'goal': {
        this.score[e.t]++;
        const sc = this.stats.get(key(e.t, e.num)); // 자책골이면 그 번호의 선수가 득점 팀에 없을 수 있다
        if (sc) { sc.goals++; const lp = this.lastPass; if (lp && lp.t === e.t && lp.to === e.num && lp.from !== e.num && e.tick - lp.tick < 60 * 12) this.get(e.t, lp.from).assists++; }
        for (const s of this.stats.values()) if (s.t !== e.t) s.conceded++;
        this.hold = this.kick = this.shot = null; this.lastPass = null; this.restart = true; break; }
    }
  }
}
export interface Rated extends PStat { rating: number; }
// 배율: 헤드리스 경기(tools/rating.ts 30경기)에서 역할별 평균이 6.5~6.8, 표준편차 0.5~0.9로 모이게 맞춘 값
const BASE: Record<string, number> = { GK: 6.3, DF: 6.15, MF: 6.0, FW: 5.75 };
const KA: Record<string, number> = { GK: 2.0, DF: 4.5, MF: 3.2, FW: 2.6 }, KD: Record<string, number> = { GK: 1.5, DF: 3.0, MF: 2.6, FW: 3.6 }, KL: Record<string, number> = { GK: 2.5, DF: 3.2, MF: 2.8, FW: 2.6 };
const PAR_ALLOW = 0.2, PAR_SHOTS = 5.5; // 수비수 한 명이 자기 줄에서 내주는 위협·한 팀이 내주는 슈팅의 평균 (같은 30경기)
/** 선수별 평점(3.0~10.0, 높은 순)과 최우수 선수 */
export function rate(tr: RatingTracker): { list: Rated[]; mvp: Rated | null } {
  const list: Rated[] = [];
  for (const s of tr.stats.values()) {
    if (!s.role) continue; const r = s.role, res = tr.score[s.t] - tr.score[1 - s.t], conc = tr.score[1 - s.t], oppShots = tr.shotsBy[1 - s.t];
    let v = (BASE[r] ?? 6) + (KA[r] ?? 3) * s.att + (KD[r] ?? 3) * s.def - (KL[r] ?? 2.5) * s.loss
      + s.goals * (r === 'FW' ? 0.9 : 1.1) + s.assists * 0.6 + Math.min(s.shots, 5) * 0.05 + (res > 0 ? 0.2 : res < 0 ? -0.2 : 0);
    if (r === 'GK') v += (conc === 0 ? 0.5 : -0.3 * Math.min(conc, 4));
    else if (r === 'DF') v += Math.max(-1.4, Math.min(0.75, // 가만히 있어도 받는 점수는 +0.75까지 (무실점 팀 수비수 넷이 아무것도 안 하고 7.6~8.2를 받았다)
        Math.max(-0.8, Math.min(0.5, (PAR_ALLOW - s.allow) * 1.7)) - Math.min(s.shotsAllowed, 5) * 0.1 + 0.3 // 자기 줄에서 내준 위협·슈팅
        + Math.max(-0.5, Math.min(0.5, (PAR_SHOTS - oppShots) * 0.07)) + (conc === 0 ? 0.3 : -0.15 * Math.min(conc, 4)))) // 수비진 전체: 상대 슈팅·실점
      + s.recov * 0.16 + s.clears * 0.22 + Math.min(s.passes, 12) * 0.035;
    else if (r === 'MF') v += Math.max(-0.2, Math.min(0.2, (PAR_SHOTS - oppShots) * 0.03));
    if (r !== 'DF' && s.touches + s.clears + s.saves < 3) v = 6 + (v - 6) * 0.4; // 거의 안 뛴 선수(늦은 교체)는 6점 근처
    list.push({ ...s, rating: Math.round(Math.max(3, Math.min(10, v)) * 10) / 10 });
  }
  list.sort((x, y) => y.rating - x.rating || y.goals - x.goals || y.assists - x.assists);
  return { list, mvp: list[0] ?? null };
}
