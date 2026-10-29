/* Canvas 2D 렌더러 (Phase 2에서 Three.js로 교체 예정). 진짜 원근 투영(TV 중계 카메라):
   카메라는 조준점(cam.x, cam.y) 뒤쪽 CAM.D m, 높이 CAM.Hc m에서 조준점을 내려다본다.
   proj(x,y,z) → 화면 좌표와 그 깊이에서의 px/m 배율(s). 멀면 작게, 가까우면 크게 */
import { W, H, CX, CY, GH, GZ } from '../sim/consts';
import { clamp } from '../sim/util';
import { hexRgb, isLight, type Kit } from '../data/teams';
import type { Sim, Player } from '../sim/types';

const CAM = { D: 110, Hc: 72 };
const TX0 = -24, TY0 = -18, TW = W + 48, TH = H + 36;
const ADS: [string, string, string][] = [['#1b3f8f', '#fff', 'KICKOFF 11'], ['#e8e8e8', '#111', 'PLAY'], ['#d7262b', '#fff', 'GOAL'], ['#111', '#ffb627', 'ELEVEN'], ['#19a974', '#fff', 'FOOTBALL']];
interface Part { x: number; y: number; vx: number; vy: number; life: number; t: number; r: number; }
interface P3 { x: number; y: number; s: number; d: number; }
const rnd = Math.random;
function shade(c: string, k: number) { const [r, g, b] = hexRgb(c); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = 1; cw = 0; ch = 0; ins = { t: 0, r: 0, b: 0, l: 0 };
  cam = { x: CX, y: CY, shake: 0, z: 1 };
  parts: Part[] = [];
  private focal = 1; private cth = 1; private sth = 0; private VW = 36; private depth0 = 1; private shk = { x: 0, y: 0 };
  private pitchTex: HTMLCanvasElement | null = null; private crowdTex: HTMLCanvasElement | null = null;
  constructor(public cv: HTMLCanvasElement, private insetEl: HTMLElement) { this.ctx = cv.getContext('2d')!; }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); const r = this.cv.getBoundingClientRect(); this.cw = r.width; this.ch = r.height;
    this.cv.width = Math.round(this.cw * this.dpr); this.cv.height = Math.round(this.ch * this.dpr);
    const cs = getComputedStyle(this.insetEl);
    this.ins = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  puff(x: number, y: number, n: number, sp: number) {
    const parts = this.parts; if (parts.length > 240) parts.splice(0, parts.length - 240);
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, v = rnd() * sp; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + rnd() * 0.4, t: 0, r: 0.2 + rnd() * 0.3 }); }
  }
  private updateParts(dt: number) { const parts = this.parts; for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - 4 * dt; q.vy *= 1 - 4 * dt; } }
  private setupCam() { const th = Math.atan2(CAM.Hc, CAM.D); this.cth = Math.cos(th); this.sth = Math.sin(th); this.depth0 = Math.hypot(CAM.D, CAM.Hc); this.focal = this.cw / this.VW * this.depth0; }
  proj(x: number, y: number, z = 0): P3 {
    const rx = x - this.cam.x, ry = this.cam.y + CAM.D - y, rz = z - CAM.Hc, d = ry * this.cth - rz * this.sth, k = this.focal / Math.max(d, 1);
    return { x: this.cw / 2 + rx * k, y: this.ch / 2 - (ry * this.sth + rz * this.cth) * k, s: k, d };
  }
  private dot(x: number, y: number, r: number) { const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  private polyW(pts: number[][], close?: boolean) { const c = this.ctx; c.beginPath(); for (let i = 0; i < pts.length; i++) { const q = pts[i], r = this.proj(q[0], q[1], q[2] || 0); if (i) c.lineTo(r.x, r.y); else c.moveTo(r.x, r.y); } if (close) c.closePath(); }
  private arcW(cx: number, cy: number, r: number, a0: number, a1: number, n: number) { const pts: number[][] = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]); } return pts; }
  private groundEllipse(x: number, y: number, rx: number, ry: number) { const c = this.ctx; c.beginPath(); for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, r = this.proj(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 0); if (i) c.lineTo(r.x, r.y); else c.moveTo(r.x, r.y); } c.closePath(); }
  private groundDot(x: number, y: number, r: number) { this.groundEllipse(x, y, r, r); this.ctx.fill(); }
  private buildCrowd() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d')!;
    g.fillStyle = '#1b2029'; g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 22000; i++) { g.fillStyle = `hsl(${rnd() * 360},${30 + rnd() * 45}%,${28 + rnd() * 38}%)`; g.fillRect(rnd() * 1024, rnd() * 256, 3, 4); }
    for (let y = 0; y < 256; y += 18) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, y, 1024, 2); }
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, 1024, 10);
    this.crowdTex = c;
  }
  /** 경기장 텍스처: 잔디 결·줄무늬·마모 자국·트랙·관중석을 오프스크린 캔버스에 한 번 그려두고 띠로 잘라 깐다 */
  private buildPitch() {
    const px = 20, c = document.createElement('canvas'); c.width = Math.round(TW * px); c.height = Math.round(TH * px); const g = c.getContext('2d')!;
    g.scale(px, px); g.translate(-TX0, -TY0);
    g.fillStyle = '#232a35'; g.fillRect(TX0, TY0, TW, TH);
    for (let i = 0; i < 14000; i++) { const x = TX0 + rnd() * TW, y = TY0 + rnd() * TH; if (x > -7.5 && x < W + 7.5 && y > -6.5 && y < H + 6.5) continue; g.fillStyle = `hsl(${rnd() * 360},${35 + rnd() * 45}%,${28 + rnd() * 40}%)`; g.fillRect(x, y, 0.45, 0.45); }
    const rows = [-8, -10.5, -13, -15.5, H + 8, H + 10.5, H + 13, H + 15.5]; g.fillStyle = 'rgba(0,0,0,.25)'; for (const y of rows) g.fillRect(TX0, y, TW, 0.25);
    for (const x of [-9, -12, -15, -18, -21, W + 9, W + 12, W + 15, W + 18, W + 21]) g.fillRect(x, TY0, 0.25, TH);
    g.fillStyle = '#8a4a3c'; g.fillRect(-7.5, -6.5, W + 15, H + 13); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-7.2, -6.2, W + 14.4, 0.12); g.fillRect(-7.2, H + 6.1, W + 14.4, 0.12);
    g.fillStyle = '#1f5a2c'; g.fillRect(-5.5, -4.5, W + 11, H + 9);
    const n = 18; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#2f7d3b' : '#2a7235'; g.fillRect(i * W / n, 0, W / n + 0.03, H); }
    for (let i = 0; i < 60000; i++) { const x = rnd() * W, y = rnd() * H; g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'; g.fillRect(x, y, 0.08 + rnd() * 0.12, 0.3 + rnd() * 0.4); }
    const worn = (x: number, y: number, rx: number, ry: number, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, `rgba(120,95,50,${a})`); gr.addColorStop(1, 'rgba(120,95,50,0)'); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore(); };
    worn(CX, CY, 6, 4, 0.35); worn(6, CY, 7, 5, 0.45); worn(W - 6, CY, 7, 5, 0.45); worn(11, CY, 4, 3, 0.25); worn(W - 11, CY, 4, 3, 0.25);
    this.pitchTex = c;
  }
  private drawPitch() {
    if (!this.pitchTex) this.buildPitch(); if (!this.crowdTex) this.buildCrowd();
    const ctx = this.ctx, { cw, ch, dpr, shk } = this, pitchTex = this.pitchTex!, crowdTex = this.crowdTex!;
    // 하늘 (먼 관중석 위)
    const far = this.proj(this.cam.x, TY0, 16).y;
    if (far > 0) { const g = ctx.createLinearGradient(0, 0, 0, far); g.addColorStop(0, '#08111f'); g.addColorStop(1, '#223652'); ctx.fillStyle = g; ctx.fillRect(-shk.x, -shk.y, cw, far + 2); }
    // 먼 쪽 관중석 벽
    { const a = this.proj(TX0, TY0, 0), b = this.proj(TX0 + TW, TY0, 0), c = this.proj(TX0 + TW, TY0, 16), d2 = this.proj(TX0, TY0, 16);
      const avgW = ((b.x - a.x) + (c.x - d2.x)) / 2, hgt = a.y - d2.y, cxm = (a.x + b.x + c.x + d2.x) / 4;
      if (hgt > 1 && a.d > 2) { ctx.setTransform(dpr * avgW / crowdTex.width, 0, 0, dpr * hgt / crowdTex.height, dpr * (cxm - avgW / 2 + shk.x), dpr * (d2.y + shk.y)); ctx.drawImage(crowdTex, 0, 0); } }
    // 바닥 텍스처: 가로 띠로 잘라 각 띠를 그 깊이의 크기로 깐다
    const N = 120, texH = pitchTex.height, texW = pitchTex.width;
    for (let i = 0; i < N; i++) {
      const ya = TY0 + TH * i / N, yb = TY0 + TH * (i + 1) / N;
      const tl = this.proj(TX0, ya, 0), tr = this.proj(TX0 + TW, ya, 0), bl = this.proj(TX0, yb, 0), br = this.proj(TX0 + TW, yb, 0);
      if (tl.d < 2 || bl.d < 2) continue;
      const top = tl.y, bot = bl.y; if (bot < -2 || top > ch + 2) continue;
      const avgW = ((tr.x - tl.x) + (br.x - bl.x)) / 2, cxm = (tl.x + tr.x + bl.x + br.x) / 4;
      const sy0 = Math.floor(texH * i / N), sh = Math.ceil(texH / N) + 1;
      ctx.setTransform(dpr * avgW / texW, 0, 0, dpr * (bot - top + 1.2) / sh, dpr * (cxm - avgW / 2 + shk.x), dpr * (top + shk.y));
      ctx.drawImage(pitchTex, 0, sy0, texW, sh, 0, 0, texW, sh);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(shk.x, shk.y);
    // 라인
    const s0 = this.proj(this.cam.x, this.cam.y, 0).s;
    ctx.strokeStyle = 'rgba(240,245,236,.9)'; ctx.fillStyle = 'rgba(240,245,236,.92)'; ctx.lineWidth = Math.max(1, 0.12 * s0); ctx.lineJoin = 'round';
    this.polyW([[0, 0], [W, 0], [W, H], [0, H]], true); ctx.stroke();
    this.polyW([[CX, 0], [CX, H]]); ctx.stroke();
    this.polyW(this.arcW(CX, CY, 9.15, 0, Math.PI * 2, 48), true); ctx.stroke(); this.groundDot(CX, CY, 0.25);
    const a = Math.acos(5.5 / 9.15);
    for (const s of [0, 1]) {
      const x0 = s ? W : 0, sg = s ? -1 : 1;
      this.polyW([[x0, CY - 20.16], [x0 + sg * 16.5, CY - 20.16], [x0 + sg * 16.5, CY + 20.16], [x0, CY + 20.16]]); ctx.stroke();
      this.polyW([[x0, CY - 9.16], [x0 + sg * 5.5, CY - 9.16], [x0 + sg * 5.5, CY + 9.16], [x0, CY + 9.16]]); ctx.stroke();
      this.groundDot(x0 + sg * 11, CY, 0.22);
      this.polyW(s ? this.arcW(W - 11, CY, 9.15, Math.PI - a, Math.PI + a, 16) : this.arcW(11, CY, 9.15, -a, a, 16)); ctx.stroke();
    }
    for (const c of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) { this.polyW(this.arcW(c[0], c[1], 1, c[2], c[2] + Math.PI / 2, 6)); ctx.stroke(); }
    for (const s of [0, 1]) { const x0 = s ? W : 0, sg = s ? 1 : -1; ctx.fillStyle = 'rgba(240,245,236,.08)'; this.polyW([[x0, CY - GH], [x0 + sg * 2.2, CY - GH], [x0 + sg * 2.2, CY + GH], [x0, CY + GH]], true); ctx.fill(); }
    // 먼지
    for (const q of this.parts) { const al = (1 - q.t / q.life) * 0.5, gr = 1 + q.t * 1.5; ctx.fillStyle = `rgba(215,200,160,${al})`; this.groundEllipse(q.x, q.y, q.r * gr, q.r * 0.6 * gr); ctx.fill(); }
  }
  /** 터치라인 바깥 광고판 (세워진 판, 1.1m 높이) */
  private drawBoards(bottom: boolean) {
    const ctx = this.ctx, y = bottom ? H + 3.2 : -3.2, x0 = -7, x1 = W + 7, len = 10;
    for (let x = x0, i = 0; x < x1; x += len, i++) {
      const xe = Math.min(x + len, x1), ad = ADS[(i + (bottom ? 2 : 0)) % ADS.length];
      const a = this.proj(x, y, 0), b = this.proj(xe, y, 0), c = this.proj(xe, y, 1.1), d2 = this.proj(x, y, 1.1);
      if (a.d < 2 || b.x < -10 || a.x > this.cw + 10) continue;
      ctx.fillStyle = ad[0]; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - (b.y - c.y) * 0.12); ctx.lineTo(a.x, a.y - (a.y - d2.y) * 0.12); ctx.closePath(); ctx.fill();
      const hpx = a.y - d2.y;
      if (hpx > 9) { ctx.fillStyle = ad[1]; ctx.font = `800 ${hpx * 0.55}px "Saira Condensed","Arial Narrow",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ad[2], (a.x + b.x) / 2, (a.y + d2.y) / 2 - hpx * 0.06); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }
  private drawGoal(s: number, front: boolean) {
    const ctx = this.ctx, x0 = s ? W : 0, sg = s ? 1 : -1, xb = x0 + sg * 2.2, P = (x: number, y: number, z: number) => this.proj(x, y, z), L = (a: P3, b: P3) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };
    const s0 = P(x0, CY, 0).s;
    if (!front) {
      ctx.strokeStyle = 'rgba(240,245,236,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const y = CY - GH + GH * 2 * i / 8; L(P(xb, y, 0), P(xb, y, GZ)); L(P(x0, y, GZ), P(xb, y, GZ)); }
      for (let i = 0; i <= 5; i++) { const z = GZ * i / 5; L(P(xb, CY - GH, z), P(xb, CY + GH, z)); L(P(x0, CY - GH, z), P(xb, CY - GH, z)); L(P(x0, CY + GH, z), P(xb, CY + GH, z)); }
      for (let i = 0; i <= 4; i++) { const x = x0 + (xb - x0) * i / 4; L(P(x, CY - GH, 0), P(x, CY + GH, 0)); }
      ctx.stroke();
      ctx.strokeStyle = '#d8dcd4'; ctx.lineWidth = Math.max(1.5, s0 * 0.09); ctx.beginPath();
      const b1 = P(xb, CY - GH, 0), b2 = P(xb, CY - GH, GZ), b3 = P(xb, CY + GH, GZ), b4 = P(xb, CY + GH, 0); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y); ctx.stroke();
    } else {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, s0 * 0.12); ctx.lineCap = 'round'; ctx.beginPath();
      const p1 = P(x0, CY - GH, 0), p2 = P(x0, CY - GH, GZ), p3 = P(x0, CY + GH, GZ), p4 = P(x0, CY + GH, 0); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke(); ctx.lineCap = 'butt';
    }
  }
  private kitFill(x: number, y: number, w: number, h: number, kit: Kit, gk: boolean) {
    const ctx = this.ctx;
    ctx.fillStyle = gk ? kit.gk : kit.c1; ctx.fillRect(x, y, w, h);
    if (gk) return; const b = kit.c2; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = b;
    switch (kit.pat) {
      case 'stripes': for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (i * 2 + 1) / 8, y, w / 8, h); break;
      case 'hoops': for (let i = 0; i < 3; i++) ctx.fillRect(x, y + h * (i * 2 + 1) / 6, w, h / 6); break;
      case 'half': ctx.fillRect(x + w / 2, y, w / 2, h); break;
      case 'sash': ctx.beginPath(); ctx.moveTo(x, y + h * 0.1); ctx.lineTo(x + w * 0.4, y); ctx.lineTo(x + w, y + h * 0.55); ctx.lineTo(x + w, y + h * 0.85); ctx.closePath(); ctx.fill(); break;
      case 'chevron': ctx.beginPath(); ctx.moveTo(x, y + h * 0.35); ctx.lineTo(x + w / 2, y + h * 0.6); ctx.lineTo(x + w, y + h * 0.35); ctx.lineTo(x + w, y + h * 0.55); ctx.lineTo(x + w / 2, y + h * 0.8); ctx.lineTo(x, y + h * 0.55); ctx.closePath(); ctx.fill(); break;
      case 'check': { const c = w / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < Math.ceil(h / c); j++) if ((i + j) % 2) ctx.fillRect(x + i * c, y + j * c, c, c); break; }
      default: ctx.fillRect(x, y + h * 0.05, w, h * 0.07);
    }
    ctx.restore();
  }
  private limb(x1: number, y1: number, x2: number, y2: number, w: number, c: string) { const ctx = this.ctx; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  private limbO(x1: number, y1: number, x2: number, y2: number, w: number, c: string) { this.limb(x1, y1, x2, y2, w + 2.2, 'rgba(0,0,0,.4)'); this.limb(x1, y1, x2, y2, w, c); }
  /** 선수 스프라이트: 관절(허벅지·정강이·팔)을 외곽선 있는 선으로 그려 달리기·킥·슬라이딩·다이브·세리머니 포즈를 만든다 */
  private drawPlayer(sim: Sim, p: Player) {
    const ctx = this.ctx, pr = this.proj(p.x, p.y, 0), px = pr.x, py = pr.y, S = pr.s, ZS = pr.s, kit = sim.M.kit[p.t], gk = p.role === 'GK';
    const hgt = 1.75 * ZS, w = 0.52 * S, sp = Math.hypot(p.vx, p.vy), moving = sp > 0.6;
    const stride = moving ? clamp(sp / 8, 0.45, 1.25) : 0, ph = moving ? Math.sin(p.run * 2.6) * stride : 0, bob = moving ? Math.abs(Math.cos(p.run * 2.6)) * hgt * 0.03 * stride : 0;
    const face = Math.cos(p.dir) >= 0 ? 1 : -1, back = Math.sin(p.dir) < -0.5, front = Math.sin(p.dir) > 0.5;
    const kickA = p.kickCD > 0.17 ? (p.kickCD - 0.17) / 0.13 : 0;
    const top = gk ? kit.gk : kit.c1, shorts = gk ? '#1b1b1b' : kit.sh, sockC = gk ? '#1b1b1b' : '#f4f4f4';
    ctx.save(); ctx.translate(px, py - bob); ctx.lineCap = 'round';
    if (p.dive > 0) ctx.rotate(p.diveDir * face * 0.9 * Math.min(1, p.dive / 0.3));
    else if (p.slide > 0) { ctx.rotate(face * 1.2); ctx.translate(0, hgt * 0.12); }
    else ctx.rotate(clamp(p.vx, -10, 10) * 0.014 * (p.stun > 0 ? 0 : 1) + (p.stun > 0 ? Math.sin(p.stun * 22) * 0.07 : 0));
    const legH = hgt * 0.46, lw = Math.max(1.6, w * 0.25), hipY = -legH;
    const leg = (side: number, sw: number, kk: number) => {
      const hx = side * w * 0.12, lift = Math.max(0, sw) * legH * 0.22 + kk * legH * 0.5;
      const fx = hx + (sw * w * 0.44 + kk * w * 0.78) * face, fy = hipY + legH - lift;
      const kx = hx + (sw * w * 0.2 + kk * w * 0.45 + Math.abs(sw) * 0.12 * w) * face, ky = hipY + legH * 0.5 - lift * 0.3;
      this.limbO(hx, hipY, kx, ky, lw * 1.2, shade(shorts, side < 0 ? 0.78 : 1));
      this.limbO(kx, ky, fx, fy, lw * 0.9, shade(p.skin, side < 0 ? 0.8 : 1));
      this.limb((kx + fx) / 2, (ky + fy) / 2, fx, fy, lw, shade(sockC, side < 0 ? 0.8 : 1));
      ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.ellipse(fx + face * lw * 0.3, fy, lw * 0.85, lw * 0.48, 0, 0, 7); ctx.fill();
    };
    if (p.slide > 0) { leg(-1, -0.6, 0); leg(1, 1, 0.9); } else { leg(-1, -ph, 0); leg(1, ph, kickA); }
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-w * 0.38 - 1, -hgt * 0.59 - 1, w * 0.76 + 2, hgt * 0.19 + 2);
    ctx.fillStyle = shorts; ctx.fillRect(-w * 0.38, -hgt * 0.59, w * 0.76, hgt * 0.19); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, -hgt * 0.59, w * 0.38, hgt * 0.19);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-w * 0.44 - 1, -hgt * 0.91 - 1, w * 0.88 + 2, hgt * 0.36 + 2);
    this.kitFill(-w * 0.44, -hgt * 0.91, w * 0.88, hgt * 0.36, kit, gk);
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(w * 0.1, -hgt * 0.91, w * 0.34, hgt * 0.36); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-w * 0.44, -hgt * 0.91, w * 0.2, hgt * 0.36);
    if (back && S > 11) { ctx.fillStyle = isLight(top) ? '#111' : '#fff'; ctx.font = `800 ${Math.max(7, hgt * 0.2)}px "Saira Condensed","Arial Narrow",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.num), 0, -hgt * 0.73); }
    const shY = -hgt * 0.85;
    const arm = (side: number, sw: number) => {
      const sx0 = side * w * 0.44; let hx: number, hy: number;
      if (p.cele) { hx = sx0 * 1.4; hy = shY - hgt * 0.3; }
      else if (p.dive > 0) { hx = sx0 * 0.7; hy = shY - hgt * 0.34; }
      else if (p.slide > 0) { hx = sx0 * 1.2 + face * w * 0.2; hy = shY - hgt * 0.1; }
      else { hx = sx0 + sw * w * 0.34 * face; hy = shY + hgt * 0.24 - Math.abs(sw) * hgt * 0.06; }
      const ex = (sx0 + hx) / 2 + (p.cele || p.dive > 0 ? 0 : side * w * 0.07), ey = (shY + hy) / 2 + (p.cele || p.dive > 0 ? 0 : hgt * 0.03);
      this.limbO(sx0, shY, ex, ey, lw * 0.95, shade(top, side < 0 ? 0.8 : 1)); this.limbO(ex, ey, hx, hy, lw * 0.8, shade(p.skin, side < 0 ? 0.8 : 1));
      if (gk) { ctx.fillStyle = '#e8e8e8'; this.dot(hx, hy, lw * 0.6); }
    };
    arm(-1, ph); arm(1, -ph);
    const hr = w * 0.31, hy0 = -hgt * 1.0, style = (p.i + p.t) % 3;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; this.dot(0, hy0, hr + 1.1);
    ctx.fillStyle = p.skin; this.dot(0, hy0, hr);
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.arc(0, hy0, hr, -0.3, 1.3); ctx.fill();
    ctx.fillStyle = p.hair; ctx.beginPath();
    if (back) ctx.arc(0, hy0, hr, 0, Math.PI * 2);
    else if (style === 1) { ctx.arc(0, hy0 - hr * 0.05, hr * 1.02, Math.PI * 0.95, Math.PI * 2.05); ctx.rect(-hr * 1.02, hy0 - hr * 0.1, hr * 0.3, hr * 0.9); ctx.rect(hr * 0.72, hy0 - hr * 0.1, hr * 0.3, hr * 0.9); }
    else if (style === 2) ctx.arc(0, hy0 - hr * 0.1, hr * 0.95, Math.PI * 1.05, Math.PI * 1.95);
    else ctx.arc(0, hy0 - hr * 0.06, hr, Math.PI, 0);
    ctx.fill();
    if (front && !back && S > 13) { ctx.fillStyle = '#1a1a1a'; this.dot(-hr * 0.33, hy0 + hr * 0.05, hr * 0.14); this.dot(hr * 0.33, hy0 + hr * 0.05, hr * 0.14); }
    ctx.restore();
  }
  /** 한 프레임. sim이 없으면 메뉴 배경(빈 경기장)을 천천히 훑는다 */
  render(sim: Sim | null, dtR: number, perf: number, paused: boolean) {
    const ctx = this.ctx, { cw, ch, dpr, cam, shk, ins } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#09121b'; ctx.fillRect(0, 0, cw, ch);
    const ball = sim?.ball;
    const zt = sim && sim.M.phase === 'goal' ? 1.32 : sim && ball && ball.isShot && !ball.owner ? 1.07 : 1; // 골·슛 때 카메라가 살짝 들어간다
    cam.z += (zt - cam.z) * (1 - Math.pow(zt > cam.z ? 0.03 : 0.3, dtR));
    this.VW = (cw < 600 ? 32 : cw <= 960 ? 40 : 36) / cam.z; this.setupCam(); // 폰 가로는 동료가 보이게 조금 더 넓게
    if (sim && !paused) this.updateParts(dtR);
    const vw = this.VW, vh = ch * this.VW / (cw * this.sth);
    let tx: number, ty: number;
    if (!sim || !ball) { tx = CX + Math.sin(perf * 0.07) * 24; ty = CY + Math.cos(perf * 0.05) * 9; } else { tx = ball.x + ball.vx * 0.25; ty = ball.y + ball.vy * 0.2; }
    tx = vw >= W + 14 ? CX : clamp(tx, vw / 2 - 7, W - vw / 2 + 7); ty = vh >= H + 14 ? CY : clamp(ty, vh / 2 - 7, H - vh / 2 + 7);
    const k = 1 - Math.pow(0.004, dtR); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.shake = Math.max(0, cam.shake - dtR); shk.x = cam.shake > 0 ? (rnd() - 0.5) * cam.shake * 14 : 0; shk.y = cam.shake > 0 ? (rnd() - 0.5) * cam.shake * 10 : 0;
    ctx.save(); ctx.translate(shk.x, shk.y);
    this.drawPitch();
    this.drawBoards(false); this.drawGoal(0, false); this.drawGoal(1, false);
    if (sim && ball) {
      const { players, HU } = sim;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      for (const p of players) { this.groundEllipse(p.x + 0.12, p.y + 0.04, 0.38, 0.26); ctx.fill(); }
      for (const h of HU) { if (!h || !h.ctrl) continue; const c = h.ctrl; ctx.strokeStyle = h.col; ctx.lineWidth = Math.max(1.5, this.proj(c.x, c.y, 0).s * 0.1); this.groundEllipse(c.x, c.y, 0.95, 0.95); ctx.stroke(); }
      const bz = ball.z, shr = 1 / (1 + bz * 0.5); ctx.fillStyle = 'rgba(0,0,0,.3)'; this.groundEllipse(ball.x + bz * 0.15, ball.y, 0.22 * shr, 0.22 * shr); ctx.fill();
      const sorted = players.slice().sort((a, b) => a.y - b.y); let ballDrawn = false;
      const drawBall = () => {
        const bp = this.proj(ball.x, ball.y, bz), bx = bp.x, by = bp.y, br = Math.max(2.5, bp.s * 0.22), bsp = Math.hypot(ball.vx, ball.vy);
        if (!ball.owner && bsp > 15) { for (let i = 3; i >= 1; i--) { const kk = i * 0.022, g = this.proj(ball.x - ball.vx * kk, ball.y - ball.vy * kk, Math.max(0, bz - ball.vz * kk)); ctx.fillStyle = `rgba(255,255,255,${0.28 - i * 0.07})`; this.dot(g.x, g.y, br * (1 - i * 0.12)); } }
        ctx.fillStyle = '#ffffff'; this.dot(bx, by, br); ctx.fillStyle = '#1a1a1a';
        for (let i = 0; i < 3; i++) { const a = ball.spin + i * 2.1; this.dot(bx + Math.cos(a) * br * 0.5, by + Math.sin(a) * br * 0.5, br * 0.22); }
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.stroke(); ballDrawn = true;
      };
      for (const p of sorted) { if (!ballDrawn && ball.y < p.y && ball.owner !== p) drawBall(); this.drawPlayer(sim, p); if (ball.owner === p && !ballDrawn) drawBall(); }
      if (!ballDrawn) drawBall();
    }
    this.drawGoal(0, true); this.drawGoal(1, true); this.drawBoards(true);
    ctx.restore();
    if (!sim || !ball) return;
    const { players, HU, M } = sim;
    for (const h of HU) {
      if (!h || !h.ctrl) continue; const c = h.ctrl, pp = this.proj(c.x, c.y, 0), px = pp.x, py = pp.y, on = px > 8 && px < cw - 8 && py > 8 && py < ch - 8;
      if (on) {
        const ty2 = py - 1.75 * pp.s - pp.s * 0.45 - 12; ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(px, ty2 + 9); ctx.lineTo(px - 6, ty2); ctx.lineTo(px + 6, ty2); ctx.fill();
        ctx.font = '800 13px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ffffff'; ctx.fillText((M.twoP ? h.tag + ' · ' : '') + c.num, px, ty2 - 1);
        if (h.charging) { const bw = 40, bh = 6, bx = px - bw / 2, by = py + 8; ctx.fillStyle = 'rgba(9,17,27,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = h.charge > 0.8 ? '#ff5a4e' : h.col; ctx.fillRect(bx, by, bw * h.charge, bh); ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * 0.8, by - 2, 1.5, bh + 4); }
      } else { const cx2 = clamp(px, 24, cw - 24), cy2 = clamp(py, 24 + ins.t, ch - 24 - ins.b), a = Math.atan2(py - cy2, px - cx2); ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(a); ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.fill(); ctx.restore(); }
    }
    // 미니맵
    const mk = clamp(cw * 0.24 / W, 0.8, 1.5), mw = W * mk, mh = H * mk, mx0 = cw - mw - Math.max(12, ins.r), my0 = ins.t + 56;
    ctx.fillStyle = 'rgba(9,17,27,.62)'; ctx.fillRect(mx0 - 3, my0 - 3, mw + 6, mh + 6); ctx.strokeStyle = 'rgba(238,243,234,.35)'; ctx.lineWidth = 1; ctx.strokeRect(mx0, my0, mw, mh);
    ctx.beginPath(); ctx.moveTo(mx0 + mw / 2, my0); ctx.lineTo(mx0 + mw / 2, my0 + mh); ctx.stroke();
    for (const p of players) { const kit = M.kit[p.t]; ctx.fillStyle = p.role === 'GK' ? kit.gk : kit.c1; const hh = HU.find(h => h && h.ctrl === p); ctx.beginPath(); ctx.arc(mx0 + p.x * mk, my0 + p.y * mk, hh ? 3.2 : 2.3, 0, 7); ctx.fill(); if (hh) { ctx.strokeStyle = hh.col; ctx.lineWidth = 1.5; ctx.stroke(); } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx0 + ball.x * mk, my0 + ball.y * mk, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,182,39,.6)'; ctx.lineWidth = 1;
    const vx0 = clamp(cam.x - vw / 2, 0, W), vx1 = clamp(cam.x + vw / 2, 0, W), vy0 = clamp(cam.y - vh / 2, 0, H), vy1 = clamp(cam.y + vh / 2, 0, H);
    ctx.strokeRect(mx0 + vx0 * mk, my0 + vy0 * mk, (vx1 - vx0) * mk, (vy1 - vy0) * mk);
  }
}
