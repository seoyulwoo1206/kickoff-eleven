/* xT 화면 쪽 상태: 표 불러오기, 구역 지도 그림, 경기 중 집계기·시계열, 옆 패널 그래프(하나 / 격자×모델 전체), 결과 표 HTML.
   시뮬은 이 모듈을 모른다 (main.ts가 'xt' 사건과 공 위치 표본을 넘겨준다) */
import { validate, partsOf, partsWith, modelsOf, has, xtAt, NX, NY, PARTS, PART_NAME, PART_SHORT, MODEL_NAME, T_NAME, type XtTables, type Part, type Model, type TKey } from './table';
import { XtTracker, compare, actionValue, pkey, type XtEv } from './tracker';

export interface XtPop { x: number; y: number; v: number; at: number; }
/** 공 위치 표본 (0.1초마다). t = 공을 가진(마지막으로 건드린) 팀, live = 인플레이 */
interface Sample { tick: number; x: number; y: number; t: number; live: boolean; }
interface Mark { tick: number; t: number; kind: 'shot' | 'goal'; }
export const XT = {
  tb: null as XtTables | null,
  /** 패널 열림 / 전체 보기(격자×모델 그래프 전부) / 패널이 열린 동안 양 팀을 AI가 조작(끄면 직접 조작) */
  on: false, all: false, auto: true,
  part: 'tree' as Part, model: 'dtmc' as Model, T: '10' as TKey,
  /** 그래프 구간: 최근 45초 / 경기 전체. 전체 보기에서 AI 진행 속도 배율 */
  win: 'recent' as 'recent' | 'match', speed: 1,
  /** 지도를 어느 팀의 공격 방향으로 그릴지 = 지금 공을 가진 팀 */
  mapTeam: 0,
  map: null as HTMLCanvasElement | null,
  tr: new XtTracker(), names: new Map<string, string>(), pops: [] as XtPop[],
  hist: [] as Sample[], marks: [] as Mark[],
  /** 그래프·지도 위의 커서 위치 (캔버스 안 CSS px). 없으면 null */
  hover: null as { x: number; y: number } | null, hoverMap: null as { x: number; y: number } | null,
};
export const SAMPLE_EVERY = 6, RECENT_SEC = 45;
const C0 = '#ffb627', C1 = '#4fd3ff'; // 팀 0(위)·팀 1(아래) — 커서 색과 같다

/** 표를 불러온다. 배포본은 public/xt/xt_tables.json, 개발 서버에선 없으면 dev/의 임시 표(연구 값 아님)로 대신한다 */
export async function loadXt(): Promise<boolean> {
  const tryUrl = async (u: string) => { try { const r = await fetch(u); if (!r.ok) return null; return validate(await r.json()); } catch { return null; } };
  let tb = await tryUrl('./xt/xt_tables.json');
  if (!tb && import.meta.env.DEV) tb = await tryUrl('/dev/xt_tables.placeholder.json');
  XT.tb = tb; if (tb) fixSelection();
  refreshMap(); return !!tb;
}
/** 고른 (격자, 모델, T)의 표가 없으면 있는 조합으로 옮긴다 */
export function fixSelection() {
  const tb = XT.tb; if (!tb || has(tb, XT.part, XT.model, XT.T)) return;
  for (const m of [XT.model, ...modelsOf(tb)]) for (const p of [XT.part, ...partsOf(tb)]) if (has(tb, p, m, XT.T)) { XT.model = m; XT.part = p; return; }
  for (const m of modelsOf(tb)) for (const p of partsOf(tb)) for (const T of ['10', '5', '15', 'inf'] as TKey[]) if (has(tb, p, m, T)) { XT.model = m; XT.part = p; XT.T = T; return; }
}
export function resetXt() { XT.tr = new XtTracker(); XT.names.clear(); XT.pops.length = 0; XT.hist.length = 0; XT.marks.length = 0; XT.mapTeam = 0; }

/** 시뮬 사건 하나를 집계기에 넣는다. name은 그 순간의 선수 이름(교체로 나간 선수도 결과 표에 남게) */
export function xtEvent(e: XtEv, name: string | null, now: number) {
  const tr = XT.tr; tr.push(e); if (name) XT.names.set(pkey(e.t, e.num), name);
  if (e.e === 'shot' || e.e === 'goal') XT.marks.push({ tick: e.tick, t: e.t, kind: e.e });
  if (tr.fresh.length) {
    if (XT.on && !XT.all && XT.tb) for (const a of tr.fresh) { const v = actionValue(XT.tb, a, XT.part, XT.model, XT.T); if (Math.abs(v) >= 0.003) XT.pops.push({ x: a.x1, y: a.y1, v, at: now }); }
    tr.fresh.length = 0; if (XT.pops.length > 12) XT.pops.splice(0, XT.pops.length - 12);
  }
}
/** 공 위치 표본 하나 (SAMPLE_EVERY틱마다 부른다) */
export function xtSample(tick: number, x: number, y: number, t: number, live: boolean) {
  XT.hist.push({ tick, x, y, t, live });
  if (live && t !== XT.mapTeam) XT.mapTeam = t;
}

/* ---------- 구역 지도 ---------- */
const STOPS: [number, number, number][] = [[13, 22, 48], [35, 60, 122], [26, 138, 140], [98, 196, 110], [244, 214, 76], [240, 96, 54]];
function ramp(u: number): [number, number, number] {
  const k = Math.max(0, Math.min(0.9999, u)) * (STOPS.length - 1), i = Math.floor(k), f = k - i, a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
/** 색 눈금: 로그. 분할 4종이 같은 눈금을 쓰도록 (모델·T마다) 모든 분할의 칸 값에서 범위를 잡는다 — 선형이면 골문 앞 한두 구역만 밝고 나머지가 다 검다 */
function scaleOf(tb: XtTables, m: Model, T: TKey) {
  const all: number[] = []; for (const p of partsWith(tb, m, T)) { const pt = tb.partitions[p]!, v = pt.xt[m]![T]!; for (let i = 0; i < pt.zone.length; i += 7) all.push(v[pt.zone[i]]); }
  all.sort((a, b) => a - b); const lo = Math.max(1e-4, all[Math.floor(all.length * 0.03)]), hi = Math.max(lo * 2, all[all.length - 1]);
  return (v: number) => Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo);
}
const K = 3; // 지도 그림은 칸당 3픽셀 (구역 경계선을 가늘게 그리려고)
/** 구역 지도 한 장 (360×240, 오른쪽 공격 기준). 구역 경계는 어두운 선 */
export function buildMap(tb: XtTables, part: Part, m: Model, T: TKey): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = NX * K; cv.height = NY * K;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(cv.width, cv.height), d = img.data, pt = tb.partitions[part]!, sc = scaleOf(tb, m, T);
  const col = pt.xt[m]![T]!.map(v => ramp(sc(v)));
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const z = pt.zone[y * NX + x], c = col[z], eR = x + 1 < NX && pt.zone[y * NX + x + 1] !== z, eD = y + 1 < NY && pt.zone[(y + 1) * NX + x] !== z;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
      const o = ((y * K + j) * cv.width + x * K + i) * 4, k = (eR && i === K - 1) || (eD && j === K - 1) ? 0.45 : 1;
      d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); return cv;
}
export function refreshMap() { XT.map = XT.tb && has(XT.tb, XT.part, XT.model, XT.T) ? buildMap(XT.tb, XT.part, XT.model, XT.T) : null; }
/** 지도를 (x0, y0, w, h)에 그린다. team 1 기준이면 180° 돌린다 (게임 화면에서 팀 1은 왼쪽으로 공격) */
export function drawMap(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, team: number, alpha = 1) {
  if (!XT.map) return; ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
  if (team === 0) ctx.drawImage(XT.map, x0, y0, w, h); else { ctx.translate(x0 + w, y0 + h); ctx.rotate(Math.PI); ctx.drawImage(XT.map, 0, 0, w, h); }
  ctx.restore();
}

export const pct = (v: number) => (v * 100).toFixed(v < 0.000995 ? 2 : v < 0.0995 ? 1 : 0) + '%';
export const settingLabel = () => `${MODEL_NAME[XT.model]} · T ${T_NAME[XT.T]}`;

/* ---------- 패널 그래프 ---------- */
function fit(cv: HTMLCanvasElement) { // 캔버스 픽셀 크기를 표시 크기 × 화면 배율에 맞춘다
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w: cv.clientWidth, h: cv.clientHeight };
}
/** 구간 [t0, t1] 틱의 표본을 픽셀 열 n개로 모은다: 열마다 팀별 최댓값 */
function columns(tb: XtTables, part: Part, m: Model, T: TKey, t0: number, t1: number, n: number) {
  const up = new Float32Array(n), dn = new Float32Array(n), H = XT.hist; let mx = 0, i = H.length - 1;
  while (i > 0 && H[i - 1].tick >= t0) i--; // 구간 시작 (최근 구간은 뒤에서부터가 빠르다)
  for (; i < H.length; i++) {
    const s = H[i]; if (s.tick < t0 || s.tick > t1 || !s.live) continue;
    const c = Math.min(n - 1, Math.floor((s.tick - t0) / (t1 - t0 || 1) * n)), v = xtAt(tb, part, m, T, s.x, s.y, s.t), a = s.t === 0 ? up : dn;
    if (v > a[c]) a[c] = v; if (v > mx) mx = v;
  }
  return { up, dn, mx };
}
interface Cell { part: Part; model: Model; ok: boolean; up: Float32Array; dn: Float32Array; mx: number; }
function drawCell(ctx: CanvasRenderingContext2D, c: Cell, x0: number, y0: number, w: number, h: number, ymax: number, t0: number, t1: number, title: string, now: number, big: boolean, hf: number, codes: [string, string]) {
  ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fillRect(x0, y0, w, h);
  const mid = y0 + h / 2, amp = h / 2 - (big ? 16 : 12), n = c.up.length, cw = w / n;
  if (c.ok) { // 막대 높이는 제곱근 눈금: 값이 중원 0.3%대 ~ 골문 앞 수십 %로 퍼져 있어 선형이면 중원이 다 바닥에 붙는다
    ctx.fillStyle = C0; for (let i = 0; i < n; i++) if (c.up[i] > 0) { const a = Math.max(1, Math.sqrt(c.up[i] / ymax) * amp); ctx.fillRect(x0 + i * cw, mid - a, cw + 0.5, a); }
    ctx.fillStyle = C1; for (let i = 0; i < n; i++) if (c.dn[i] > 0) { const a = Math.max(1, Math.sqrt(c.dn[i] / ymax) * amp); ctx.fillRect(x0 + i * cw, mid, cw + 0.5, a); }
    for (const k of XT.marks) { // 슛(작은 세모)·골(세로선)
      if (k.tick < t0 || k.tick > t1) continue; const px = x0 + (k.tick - t0) / (t1 - t0 || 1) * w, top = k.t === 0;
      if (k.kind === 'goal') { ctx.fillStyle = '#fff'; ctx.fillRect(px - 0.75, top ? y0 + 2 : mid, 1.5, h / 2 - 2); ctx.beginPath(); ctx.arc(px, top ? y0 + 5 : y0 + h - 5, 3, 0, 7); ctx.fill(); }
      else { const ey = top ? y0 + 3 : y0 + h - 3, s = top ? 1 : -1; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(px - 3, ey); ctx.lineTo(px + 3, ey); ctx.lineTo(px, ey + 5 * s); ctx.fill(); }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x0, mid - 0.5, w, 1);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = `700 ${big ? 12 : 10.5}px "Barlow Condensed","Arial Narrow",sans-serif`; ctx.fillStyle = 'rgba(238,243,234,.92)'; ctx.fillText(title, x0 + 5, y0 + 3);
  if (!c.ok) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(238,243,234,.5)'; ctx.fillText('표에 없음', x0 + w / 2, mid); return; }
  if (hf >= 0) { // 커서가 가리키는 시각의 값: 세로선 + 그 열의 팀별 값 (위·아래)
    const i = Math.min(n - 1, Math.floor(hf * n)), px = x0 + (i + 0.5) * cw, u = c.up[i], dv = c.dn[i];
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(px - 0.5, y0, 1, h);
    ctx.textAlign = 'right'; const fs = big ? 12 : 10.5; ctx.font = `800 ${fs}px "Barlow Condensed","Arial Narrow",sans-serif`;
    const lab = (txt: string, col: string, yy: number) => { const tw = ctx.measureText(txt).width + 8; ctx.fillStyle = 'rgba(9,17,27,.9)'; ctx.fillRect(x0 + w - tw - 2, yy - 1, tw, fs + 4); ctx.fillStyle = col; ctx.fillText(txt, x0 + w - 6, yy + 1); };
    if (u > 0) lab(`${codes[0]} ${pct(u)}`, C0, y0 + 2); if (dv > 0) lab(`${codes[1]} ${pct(dv)}`, C1, y0 + h - fs - 5); if (!(u > 0) && !(dv > 0)) lab('–', 'rgba(238,243,234,.7)', y0 + 2);
    return;
  }
  ctx.textAlign = 'right'; ctx.fillStyle = isFinite(now) ? '#fff' : 'rgba(238,243,234,.5)'; ctx.fillText(isFinite(now) ? pct(now) : '–', x0 + w - 5, y0 + 3);
}
/** 패널을 그린다. graph: 그래프 캔버스, mapCv: 구역 지도 캔버스(하나 보기에서만), nowTick: 지금 시뮬 틱, codes: 팀 코드.
    돌려주는 값 = 머리글에 쓸 지금 xT 문구 */
export function renderPanel(graph: HTMLCanvasElement, mapCv: HTMLCanvasElement, nowTick: number, codes: [string, string], ball: { x: number; y: number }): string {
  const tb = XT.tb; if (!tb) return '';
  const { ctx, w, h } = fit(graph); ctx.clearRect(0, 0, w, h);
  const last = XT.hist[XT.hist.length - 1], t1 = Math.max(nowTick, 60), t0 = XT.win === 'recent' ? t1 - RECENT_SEC * 60 : 0;
  const cur = (p: Part, m: Model) => last && last.live ? xtAt(tb, p, m, XT.T, last.x, last.y, last.t) : NaN;
  const models = modelsOf(tb), combos: [Part, Model][] = XT.all ? PARTS.flatMap(p => models.map(m => [p, m] as [Part, Model])) : [[XT.part, XT.model]];
  const cols = XT.all ? models.length : 1, rows = XT.all ? PARTS.length : 1, gap = 4, cwid = (w - gap * (cols - 1)) / cols, chei = (h - 14 - gap * (rows - 1)) / rows, n = Math.max(20, Math.floor(cwid / 2));
  const cells: Cell[] = combos.map(([p, m]) => { const ok = has(tb, p, m, XT.T); return ok ? { part: p, model: m, ok, ...columns(tb, p, m, XT.T, t0, t1, n) } : { part: p, model: m, ok, up: new Float32Array(n), dn: new Float32Array(n), mx: 0 }; });
  const ymax = Math.max(0.02, ...cells.map(c => c.mx)) * 1.1; // 모든 그래프가 같은 세로 눈금
  // 커서: 어느 칸 위든 그 칸 안에서의 가로 비율(= 시각)을 모든 칸에 같이 표시한다
  let hf = -1; const hv = XT.hover; if (hv && hv.y < h - 14) { const cx = hv.x % (cwid + gap); if (cx <= cwid && hv.x >= 0 && hv.x <= w) hf = Math.min(0.9999, Math.max(0, cx / cwid)); }
  const hTick = hf >= 0 ? t0 + (Math.floor(hf * n) + 0.5) / n * (t1 - t0) : -1;
  cells.forEach((c, i) => drawCell(ctx, c, (i % cols) * (cwid + gap), Math.floor(i / cols) * (chei + gap), cwid, chei, ymax, t0, t1, XT.all ? `${PART_NAME[c.part]} · ${MODEL_NAME[c.model]}` : `${PART_NAME[c.part]} · ${MODEL_NAME[c.model]} · T ${T_NAME[XT.T]}`, cur(c.part, c.model), !XT.all, hf, codes));
  // 범례: 위 = 팀 0, 아래 = 팀 1, 세로 눈금, 구간
  ctx.font = '600 10.5px "Barlow Condensed","Arial Narrow",sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; const by = h - 1;
  ctx.fillStyle = C0; ctx.fillRect(0, by - 9, 8, 8); ctx.fillStyle = 'rgba(238,243,234,.8)'; ctx.fillText(`위 ${codes[0]}`, 11, by); const o = 16 + ctx.measureText(`위 ${codes[0]}`).width;
  ctx.fillStyle = C1; ctx.fillRect(o, by - 9, 8, 8); ctx.fillStyle = 'rgba(238,243,234,.8)'; ctx.fillText(`아래 ${codes[1]}`, o + 11, by);
  const mmss = (tk: number) => { const sec = Math.max(0, Math.floor(tk / 60)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  ctx.textAlign = 'right'; ctx.fillText(hf >= 0 ? `커서: ${((t1 - hTick) / 60).toFixed(1)}초 전 (경기 ${mmss(hTick)}) · 그 순간 공 위치의 xT` : `세로 √눈금, 끝 ${pct(ymax)} · ${XT.win === 'recent' ? `최근 ${RECENT_SEC}초` : '경기 전체'} · ▼슛 ●골`, w, by);
  // 구역 지도 + 공 (하나 보기)
  if (!XT.all && XT.map) {
    const M = fit(mapCv), c2 = M.ctx, mw = M.w, mh = M.h; c2.clearRect(0, 0, mw, mh); drawMap(c2, 0, 0, mw, mh, XT.mapTeam);
    c2.strokeStyle = 'rgba(255,255,255,.5)'; c2.lineWidth = 1; c2.strokeRect(0.5, 0.5, mw - 1, mh - 1); c2.beginPath(); c2.moveTo(mw / 2, 0); c2.lineTo(mw / 2, mh); c2.stroke();
    for (const s of [0, 1]) { const bw = mw * 16.5 / 105, bh = mh * 40.32 / 68; c2.strokeRect(s ? mw - bw : 0.5, (mh - bh) / 2, bw - 0.5, bh); }
    const H = XT.hist; c2.strokeStyle = 'rgba(255,255,255,.7)'; c2.lineWidth = 1.5; c2.beginPath(); let st = false; // 최근 4초 공 자취
    for (let i = Math.max(0, H.length - 40); i < H.length; i++) { const px = H[i].x / 105 * mw, py = H[i].y / 68 * mh; if (!st) { c2.moveTo(px, py); st = true; } else c2.lineTo(px, py); } c2.stroke();
    const bx = ball.x / 105 * mw, byy = ball.y / 68 * mh; c2.fillStyle = '#fff'; c2.strokeStyle = '#09121b'; c2.lineWidth = 1.5; c2.beginPath(); c2.arc(bx, byy, 4, 0, 7); c2.fill(); c2.stroke();
    if (hTick >= 0) { // 그래프의 커서 시각에 공이 있던 자리
      let best: Sample | null = null, bd = 1e9; for (let i = H.length - 1; i >= 0; i--) { const dd = Math.abs(H[i].tick - hTick); if (dd < bd) { bd = dd; best = H[i]; } else if (H[i].tick < hTick) break; }
      if (best && bd < 40) { const px = best.x / 105 * mw, py = best.y / 68 * mh; c2.strokeStyle = '#fff'; c2.lineWidth = 2; c2.beginPath(); c2.arc(px, py, 7, 0, 7); c2.stroke(); c2.strokeStyle = '#09121b'; c2.lineWidth = 1; c2.beginPath(); c2.arc(px, py, 8.5, 0, 7); c2.stroke(); }
    }
    const hm = XT.hoverMap; if (hm && hm.x >= 0 && hm.x <= mw && hm.y >= 0 && hm.y <= mh) { // 지도 위 커서: 그 자리(지금 지도 방향 = 공 가진 팀 기준)의 구역 값
      const gx = hm.x / mw * 105, gy = hm.y / mh * 68, v = xtAt(tb, XT.part, XT.model, XT.T, gx, gy, XT.mapTeam), txt = isFinite(v) ? pct(v) : '–';
      c2.strokeStyle = 'rgba(255,255,255,.9)'; c2.lineWidth = 1; c2.beginPath(); c2.moveTo(hm.x - 7, hm.y); c2.lineTo(hm.x + 7, hm.y); c2.moveTo(hm.x, hm.y - 7); c2.lineTo(hm.x, hm.y + 7); c2.stroke();
      c2.font = '800 12px "Barlow Condensed","Arial Narrow",sans-serif'; c2.textBaseline = 'middle'; const tw = c2.measureText(txt).width + 10, lx = hm.x + 12 + tw > mw ? hm.x - 12 - tw : hm.x + 12, ly = Math.min(mh - 10, Math.max(10, hm.y - 12));
      c2.fillStyle = 'rgba(9,17,27,.9)'; c2.fillRect(lx, ly - 9, tw, 18); c2.fillStyle = '#fff'; c2.textAlign = 'left'; c2.fillText(txt, lx + 5, ly + 1);
    }
    c2.font = '700 11px "Barlow Condensed","Arial Narrow",sans-serif'; c2.textBaseline = 'bottom'; c2.fillStyle = 'rgba(255,255,255,.95)'; c2.textAlign = XT.mapTeam === 0 ? 'right' : 'left';
    c2.fillText(XT.mapTeam === 0 ? `${codes[0]} 공격 →` : `← ${codes[1]} 공격`, XT.mapTeam === 0 ? mw - 5 : 5, mh - 3);
  }
  const v = cur(XT.part, XT.model);
  return XT.all ? (last && last.live ? `${codes[last.t]} 공` : '') : (isFinite(v) ? `${codes[last!.t]} ${pct(v)}` : '–');
}
/** 패널 아래 설명 한 줄 */
export function panelNote() {
  const tb = XT.tb; if (!tb) return ''; const ph = tb.placeholder ? ' ※ 개발용 임시 표 — 연구 값이 아닙니다.' : ' Data: StatsBomb Open Data';
  if (XT.all) return `공 위치의 xT(실제 축구 기준 위협도, T ${T_NAME[XT.T]})를 격자 ${PARTS.length}종 × 모델 ${modelsOf(tb).length}종으로 나란히.${XT.auto ? ' 양 팀 모두 AI가 조작합니다.' : ''}` + ph;
  const pt = tb.partitions[XT.part], v = pt?.xt[XT.model]?.[XT.T]; if (!pt || !v) return '이 조합의 표가 없습니다.' + ph;
  return `${PART_NAME[XT.part]} ${pt.M}구역 · 구역 값 ${pct(Math.min(...v))}~${pct(Math.max(...v))} (지도 색은 로그 눈금). 공을 가진 팀이 T ${T_NAME[XT.T]} 안에 득점할 확률(실제 축구 기준).${XT.auto ? ' 양 팀 모두 AI가 조작합니다.' : ''}` + ph;
}

/* ---------- 결과 화면 ---------- */
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sg = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3);
/** 선수별 xT 증가량을 분할 4종으로 나란히 + 분할끼리 순위상관. teams = 팀 코드, kit = 팀 색 */
export function resultHtml(teams: [string, string], kit: [string, string]): string {
  const tb = XT.tb; if (!tb) return '';
  const c = compare(tb, XT.tr, XT.model, XT.T); if (!c.parts.length || c.rows.length < 3) return '<p class="xtnote">xT 기록이 없습니다.</p>';
  const P = c.parts, main = P.includes(XT.part) ? XT.part : P[0];
  // 표에 올릴 선수: 어느 분할에서든 3위 안에 든 선수 + 기준 분할 상위, 최대 8명. 기준 분할 순위로 정렬
  const pick = new Set<string>(); for (const p of P) for (const r of c.rows) if (r.rank[p]! <= 3) pick.add(r.key);
  for (const r of [...c.rows].sort((a, b) => a.rank[main]! - b.rank[main]!)) { if (pick.size >= 8) break; pick.add(r.key); }
  const rows = c.rows.filter(r => pick.has(r.key)).sort((a, b) => a.rank[main]! - b.rank[main]!).slice(0, 8);
  const head = `<tr><th>선수</th>${P.map(p => `<th class="${p === main ? 'on' : ''}" title="${PART_NAME[p]} · ${tb.partitions[p]!.M}구역">${PART_SHORT[p]}<small>${tb.partitions[p]!.M}</small></th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr><td><i style="background:${kit[r.t]}"></i>${esc(XT.names.get(r.key) ?? '#' + r.num)}</td>${P.map(p => `<td class="${r.rank[p] === 1 ? 'top' : ''}">${sg(r.val[p]!)}<small>${r.rank[p]}위</small></td>`).join('')}</tr>`).join('');
  const tm = [0, 1].map(t => `<tr class="tm"><td><i style="background:${kit[t]}"></i>${esc(teams[t])} 합계</td>${P.map((_, i) => `<td>${sg(c.team[i][t])}</td>`).join('')}</tr>`).join('');
  const firsts = P.map(p => { const r = c.rows.find(x => x.rank[p] === 1)!; return XT.names.get(r.key) ?? '#' + r.num; });
  const same = firsts.every(n => n === firsts[0]), rho = c.rho.filter(r => isFinite(r.r));
  const note = (same ? `네 분할 모두 1위는 ${esc(firsts[0])}.` : `분할에 따라 1위가 바뀝니다: ${P.map((p, i) => `${PART_SHORT[p]} ${esc(firsts[i])}`).join(' · ')}.`)
    + (rho.length ? ` 분할 간 순위상관(스피어만, ${c.rows.length}명) ${rho.map(r => `${PART_SHORT[r.a]}–${PART_SHORT[r.b]} ${r.r.toFixed(2)}`).join(' · ')}.` : '');
  return `<div class="label">선수별 xT 증가량 · 분할 4종 비교</div><table class="xttab">${head}${body}${tm}</table><p class="xtnote">${note}</p>`
    + `<p class="xtnote">패스·드리블 전후 위치의 xT 차이를 그 선수에게 더한 값(${settingLabel()}, 실제 축구 기준 위협도). ${tb.placeholder ? '<b>지금은 개발용 임시 표 — 연구 값이 아닙니다.</b>' : 'Data: StatsBomb Open Data'}</p>`;
}
