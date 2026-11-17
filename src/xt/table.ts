/* xT 표 조회. 연구(R&E)에서 뽑은 xt_tables.json — 분할 4종의 구역 지도(1야드 칸 120×80)와 구역별 xT 값 — 을 찾아 쓰기만 한다.
   DOM 의존 없음(헤드리스 도구도 같이 쓴다). 표 형식은 PROGRESS '23차'와 tools/xt-placeholder.ts 참고 */
import { W, H } from '../sim/consts';

export type Part = 'uniform' | 'quadtree' | 'tree' | 'threat';
export type Model = 'dtmc' | 'smp' | 'tf';
export type TKey = '5' | '10' | '15' | 'inf';
export const PARTS: Part[] = ['uniform', 'quadtree', 'tree', 'threat'];
export const MODELS: Model[] = ['dtmc', 'smp', 'tf'];
export const TKEYS: TKey[] = ['5', '10', '15', 'inf'];
export const PART_NAME: Record<Part, string> = { uniform: 'Uniform', quadtree: 'Quadtree', tree: 'Decision Tree', threat: 'Threat Grid' };
export const PART_SHORT: Record<Part, string> = { uniform: 'Uni', quadtree: 'Quad', tree: 'Tree', threat: 'Threat' };
export const MODEL_NAME: Record<Model, string> = { dtmc: 'DTMC', smp: 'SMP', tf: 'Transformer' };
export const T_NAME: Record<TKey, string> = { '5': '5초', '10': '10초', '15': '15초', inf: '∞' };
export const NX = 120, NY = 80;

export interface PartTable { M: number; nstar?: Record<string, number>; zone: number[]; xt: Partial<Record<Model, Partial<Record<TKey, number[]>>>>; }
export interface XtTables { version: number; source?: string; placeholder?: boolean; partitions: Partial<Record<Part, PartTable>>; }

/** 형식 검사: 구역 지도가 9,600칸이고 번호가 0..M-1인 분할만, 그 안에서 길이가 M인 값 표(모델·T)만 남긴다. 쓸 수 있는 게 없으면 null.
    트랜스포머 표는 선택이고 JSON 키는 "transformer" 또는 "tf" (drive 시작점의 구역별 예측 — 연구 계획 3-4) */
export function validate(o: unknown): XtTables | null {
  const src = o as XtTables; if (!src || typeof src !== 'object' || !src.partitions) return null;
  const out: XtTables = { version: src.version | 0, source: src.source, placeholder: !!src.placeholder, partitions: {} };
  for (const k of PARTS) {
    const p = src.partitions[k]; if (!p || !Array.isArray(p.zone) || p.zone.length !== NX * NY || !p.xt) continue;
    let mx = -1, ok = true; for (const z of p.zone) { if (!Number.isInteger(z) || z < 0) { ok = false; break; } if (z > mx) mx = z; }
    if (!ok || mx + 1 !== p.M) continue;
    const raw = p.xt as Record<string, Partial<Record<TKey, number[]>> | undefined>, xt: PartTable['xt'] = {}; let any = false;
    for (const m of MODELS) for (const T of TKEYS) { const a = (raw[m] ?? (m === 'tf' ? raw.transformer : undefined))?.[T]; if (Array.isArray(a) && a.length === p.M && a.every(v => typeof v === 'number' && isFinite(v))) { (xt[m] ??= {})[T] = a; any = true; } }
    if (any) out.partitions[k] = { M: p.M, nstar: p.nstar, zone: p.zone, xt };
  }
  return partsOf(out).length ? out : null;
}
export const partsOf = (tb: XtTables) => PARTS.filter(k => !!tb.partitions[k]);
/** 이 (분할, 모델, T) 조합의 값 표가 있나 */
export const has = (tb: XtTables, part: Part, m: Model, T: TKey) => !!tb.partitions[part]?.xt[m]?.[T];
export const partsWith = (tb: XtTables, m: Model, T: TKey) => PARTS.filter(k => has(tb, k, m, T));
export const modelsOf = (tb: XtTables) => MODELS.filter(m => PARTS.some(k => TKEYS.some(T => has(tb, k, m, T))));

/** 게임 좌표(105×68m) → 연구 칸 번호. 팀 기준으로 180° 돌려 '오른쪽 공격'으로 맞춘다 (y도 뒤집어야 공격수의 왼쪽·오른쪽이 유지된다 — wx()는 x만 뒤집는다).
    StatsBomb은 오른쪽으로 공격할 때 y=0이 공격수 왼쪽 터치라인이고, 게임 팀 0(+x 공격)도 y=0이 왼쪽(화면 위)이라 그대로 맞는다 */
export function cellOf(x: number, y: number, t: number) {
  const X = t === 0 ? x : W - x, Y = t === 0 ? y : H - y;
  const xs = Math.max(0, Math.min(NX - 1, Math.floor(X / W * NX))), ys = Math.max(0, Math.min(NY - 1, Math.floor(Y / H * NY)));
  return ys * NX + xs;
}
export const zoneOf = (tb: XtTables, part: Part, x: number, y: number, t: number) => tb.partitions[part]!.zone[cellOf(x, y, t)];
/** 팀 t가 (x, y)에서 공을 가졌을 때의 xT. 그 조합의 표가 없으면 NaN */
export const xtAt = (tb: XtTables, part: Part, m: Model, T: TKey, x: number, y: number, t: number) => { const p = tb.partitions[part], v = p?.xt[m]?.[T]; return v ? v[p!.zone[cellOf(x, y, t)]] : NaN; };
