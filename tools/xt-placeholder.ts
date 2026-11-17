/* 개발용 임시 xT 표 생성기. 연구(R&E)의 xt_tables.json이 오기 전에 게임 쪽 코드를 돌려 보려고 만든, 형식만 같은 가짜 표다.
   값은 "골문까지 거리"로 만든 지어낸 함수이고 연구 결과가 아니다 ("placeholder": true → 화면에 임시 표라고 표시).
   배포본에는 들어가지 않는다 (public/ 밖의 dev/에 쓴다, .gitignore). 사용: npx tsx tools/xt-placeholder.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
const NX = 120, NY = 80, N = NX * NY;
const cx = (i: number) => (i % NX) + 0.5, cy = (i: number) => Math.floor(i / NX) + 0.5;
const dist = (i: number) => Math.hypot(120 - cx(i), 40 - cy(i));
/** 지어낸 위협도 (오른쪽 공격) */
const f = (i: number, T: string) => {
  const q = dist(i), u = cx(i) / 120, k = T === '5' ? [0.42, 7, 0.004, 0.0004] : T === '10' ? [0.5, 9, 0.011, 0.0015] : T === '15' ? [0.54, 10.5, 0.017, 0.003] : [0.58, 12, 0.024, 0.006];
  return k[0] * Math.exp(-q / k[1]) * (0.55 + 0.45 * (120 - cx(i)) / (q || 1)) + k[2] * u * u + k[3];
};
const base = Array.from({ length: N }, (_, i) => f(i, '10'));

// Uniform 12×8
const uniform = Array.from({ length: N }, (_, i) => Math.floor(cy(i) / 10) * 12 + Math.floor(cx(i) / 10));
// Quadtree: 이벤트가 많은 곳(중원)부터 쪼갠다 → 골문 앞은 큰 칸으로 남는다. 한 번 쪼갤 때 +3이라 94 = 1 + 3×31
function quadtree() {
  type R = { x0: number; y0: number; x1: number; y1: number; w: number };
  const dens = (x: number, y: number) => Math.exp(-(((x - 60) / 34) ** 2)) * (0.55 + 0.45 * Math.exp(-(((y - 40) / 28) ** 2)));
  const mk = (x0: number, y0: number, x1: number, y1: number): R => { let w = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w += dens(x + 0.5, y + 0.5); return { x0, y0, x1, y1, w }; };
  let leaves = [mk(0, 0, NX, NY)];
  while (leaves.length < 94) {
    const r = leaves.filter(l => l.x1 - l.x0 >= 4 && l.y1 - l.y0 >= 4).reduce((a, b) => (b.w > a.w ? b : a)), mx = (r.x0 + r.x1) >> 1, my = (r.y0 + r.y1) >> 1;
    leaves = leaves.filter(l => l !== r).concat([mk(r.x0, r.y0, mx, my), mk(mx, r.y0, r.x1, my), mk(r.x0, my, mx, r.y1), mk(mx, my, r.x1, r.y1)]);
  }
  const z = new Array<number>(N); leaves.forEach((l, k) => { for (let y = l.y0; y < l.y1; y++) for (let x = l.x0; x < l.x1; x++) z[y * NX + x] = k; }); return z;
}
// Decision Tree: 값의 분산이 큰 칸을 축에 나란한 선으로 계속 둘로 나눈다 → 골문 앞이 잘게 나뉜다
function tree() {
  type R = { x0: number; y0: number; x1: number; y1: number; gain: number; ax: 0 | 1; at: number };
  const best = (x0: number, y0: number, x1: number, y1: number): R => {
    let bg = 0, ax: 0 | 1 = 0, at = -1;
    for (const a of [0, 1] as const) {
      const n = a ? y1 - y0 : x1 - x0, s = new Array<number>(n).fill(0), c = (a ? x1 - x0 : y1 - y0);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s[a ? y - y0 : x - x0] += base[y * NX + x];
      const tot = s.reduce((p, q) => p + q, 0); let acc = 0;
      for (let k = 1; k < n; k++) { acc += s[k - 1]; const nl = k * c, nr = (n - k) * c, g = acc * acc / nl + (tot - acc) ** 2 / nr - tot * tot / (n * c); if (g > bg) { bg = g; ax = a; at = k; } }
    }
    return { x0, y0, x1, y1, gain: bg, ax, at };
  };
  let leaves = [best(0, 0, NX, NY)];
  while (leaves.length < 96) {
    const r = leaves.reduce((a, b) => (b.gain > a.gain ? b : a));
    const two = r.ax === 0 ? [best(r.x0, r.y0, r.x0 + r.at, r.y1), best(r.x0 + r.at, r.y0, r.x1, r.y1)] : [best(r.x0, r.y0, r.x1, r.y0 + r.at), best(r.x0, r.y0 + r.at, r.x1, r.y1)];
    leaves = leaves.filter(l => l !== r).concat(two);
  }
  const z = new Array<number>(N); leaves.forEach((l, k) => { for (let y = l.y0; y < l.y1; y++) for (let x = l.x0; x < l.x1; x++) z[y * NX + x] = k; }); return z;
}
// Threat Grid: 값의 등고선 12띠 × 골문을 중심으로 한 방향 8갈래
function threat() {
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => base[a] - base[b]), band = new Array<number>(N);
  order.forEach((i, r) => { band[i] = Math.min(11, Math.floor(r / N * 12)); });
  const raw = Array.from({ length: N }, (_, i) => { const a = Math.atan2(cy(i) - 40, 120 - cx(i)); return band[i] * 8 + Math.min(7, Math.floor((a + Math.PI / 2) / Math.PI * 8)); });
  const ids = [...new Set(raw)].sort((a, b) => a - b), map = new Map(ids.map((v, k) => [v, k])); return raw.map(v => map.get(v)!);
}
const zones = { uniform, quadtree: quadtree(), tree: tree(), threat: threat() };
const out: Record<string, unknown> = { version: 1, placeholder: true, source: 'PLACEHOLDER — 개발용 임시 표 (연구 값 아님). tools/xt-placeholder.ts', grid: { nx: NX, ny: NY, unit: 'yard', order: 'row = y, col = x' }, T: ['5', '10', '15', 'inf'], partitions: {} };
for (const [name, zone] of Object.entries(zones)) {
  const M = Math.max(...zone) + 1, cnt = new Array<number>(M).fill(0); for (const z of zone) cnt[z]++;
  const mean = (T: string, k: number) => { const s = new Array<number>(M).fill(0); zone.forEach((z, i) => { s[z] += f(i, T); }); return s.map((v, z) => +(v / cnt[z] * (1 + k * Math.sin(z * 1.7))).toFixed(6)); };
  const tab = (k: number) => Object.fromEntries(['5', '10', '15', 'inf'].map(T => [T, mean(T, k)]));
  (out.partitions as Record<string, unknown>)[name] = { M, nstar: { '5': 0, '10': 0, '15': 0 }, zone, xt: { dtmc: tab(0), smp: tab(0.04), transformer: tab(0.12) } };
  console.log(`${name}: ${M}구역 (가장 작은 구역 ${Math.min(...cnt)}칸, 가장 큰 구역 ${Math.max(...cnt)}칸)`);
}
mkdirSync('dev', { recursive: true }); writeFileSync('dev/xt_tables.placeholder.json', JSON.stringify(out));
console.log('dev/xt_tables.placeholder.json 저장 (' + Math.round(JSON.stringify(out).length / 1024) + 'KB)');
