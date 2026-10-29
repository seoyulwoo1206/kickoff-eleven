/* 캔버스로 그리는 텍스처들: 잔디, 유니폼(앞/뒤+등번호), 공, 그물, 광고판, 하늘, 먼지. 외부 이미지 파일 없음 */
import * as THREE from 'three';
import type { Kit } from '../../data/teams';
import { isLight } from '../../data/teams';
import { W, H } from '../../sim/consts';

const rnd = Math.random;
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

/** 잔디: 경기장(105×68) + 6m 여유. 가로 띠 줄무늬 + 결 노이즈 + 마모 자국. 1px ≈ 6cm */
export function grassTexture(px = 20) {
  const MX = 6, MZ = 6, TW = W + MX * 2, TH = H + MZ * 2;
  const [c, g] = canvas(Math.round(TW * px), Math.round(TH * px));
  g.scale(px, px); g.translate(MX, MZ);
  g.fillStyle = '#2a7035'; g.fillRect(-MX, -MZ, TW, TH);
  const n = 18; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#35843f' : '#2c7336'; g.fillRect(i * W / n, -MZ, W / n + 0.03, TH); }
  // 결: 짧은 세로 선
  for (let i = 0; i < 90000; i++) { const x = -MX + rnd() * TW, y = -MZ + rnd() * TH; g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'; g.fillRect(x, y, 0.06 + rnd() * 0.1, 0.25 + rnd() * 0.4); }
  const worn = (x: number, y: number, rx: number, ry: number, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, `rgba(125,100,55,${a})`); gr.addColorStop(1, 'rgba(125,100,55,0)'); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore(); };
  worn(W / 2, H / 2, 6, 4, 0.3); worn(6, H / 2, 7, 5, 0.4); worn(W - 6, H / 2, 7, 5, 0.4); worn(11, H / 2, 4, 3, 0.2); worn(W - 11, H / 2, 4, 3, 0.2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex: t, MX, MZ, TW, TH };
}
/** 잔디 디테일 노이즈 (가까이서 타일링) */
export function grassDetail() {
  const S = 512, [c, g] = canvas(S, S); const img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 122 + Math.floor(rnd() * 12); d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  // 잔디 잎: 짧은 세로 획 (밝은/어두운)
  for (let i = 0; i < 14000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)'; g.fillRect(rnd() * S, rnd() * S, 1, 3 + rnd() * 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function drawPattern(g: CanvasRenderingContext2D, kit: Kit, w: number, h: number) {
  g.fillStyle = kit.c1; g.fillRect(0, 0, w, h); g.fillStyle = kit.c2;
  switch (kit.pat) {
    case 'stripes': for (let i = 0; i < 4; i++) g.fillRect(w * (i * 2 + 1) / 8, 0, w / 8, h); break;
    case 'hoops': for (let i = 0; i < 3; i++) g.fillRect(0, h * (i * 2 + 1) / 6, w, h / 6); break;
    case 'half': g.fillRect(w / 2, 0, w / 2, h); break;
    case 'sash': g.beginPath(); g.moveTo(0, h * 0.1); g.lineTo(w * 0.4, 0); g.lineTo(w, h * 0.55); g.lineTo(w, h * 0.85); g.closePath(); g.fill(); break;
    case 'chevron': g.beginPath(); g.moveTo(0, h * 0.35); g.lineTo(w / 2, h * 0.6); g.lineTo(w, h * 0.35); g.lineTo(w, h * 0.55); g.lineTo(w / 2, h * 0.8); g.lineTo(0, h * 0.55); g.closePath(); g.fill(); break;
    case 'check': { const c = w / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < Math.ceil(h / c); j++) if ((i + j) % 2) g.fillRect(i * c, j * c, c, c); break; }
    default: g.fillRect(0, h * 0.05, w, h * 0.07);
  }
}
/** 유니폼 상의: front/back 텍스처. 뒤에는 등번호(와 이름) */
export function kitTextures(kit: Kit, gk: boolean, num: number, name?: string) {
  const w = 128, h = 128;
  const [cf, gf] = canvas(w, h);
  if (gk) { gf.fillStyle = kit.gk; gf.fillRect(0, 0, w, h); gf.fillStyle = 'rgba(0,0,0,.18)'; gf.fillRect(0, h * 0.82, w, h * 0.18); } else drawPattern(gf, kit, w, h);
  gf.fillStyle = 'rgba(0,0,0,.25)'; gf.fillRect(0, 0, w, 6); // 목선
  const [cb, gb] = canvas(w, h);
  if (gk) { gb.fillStyle = kit.gk; gb.fillRect(0, 0, w, h); } else drawPattern(gb, kit, w, h);
  const base = gk ? kit.gk : kit.c1, ink = isLight(base) ? '#111' : '#fff';
  gb.fillStyle = ink; gb.textAlign = 'center'; gb.textBaseline = 'middle';
  if (name) { gb.font = '700 15px "IBM Plex Sans KR","Saira Condensed",sans-serif'; gb.fillText(name.toUpperCase(), w / 2, 16); }
  gb.font = '800 64px "Saira Condensed","Arial Narrow",sans-serif'; gb.fillText(String(num), w / 2, name ? 70 : 60);
  return { front: tex(cf), back: tex(cb) };
}
export function ballTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1a1a1a';
  const pts = [[32, 40], [96, 40], [160, 40], [224, 40], [64, 88], [128, 88], [192, 88], [0, 88], [256, 88]];
  for (const [x, y] of pts) { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); } g.closePath(); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 30, 0, 7); g.stroke(); }
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
export function netTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(245,245,245,.9)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.moveTo(0, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export const ADS: [string, string, string][] = [['#1b3f8f', '#ffffff', 'KICKOFF 11'], ['#e8e8e8', '#111111', 'PLAY ON'], ['#d7262b', '#ffffff', 'GOAL!'], ['#111111', '#ffb627', 'ELEVEN'], ['#19a974', '#ffffff', 'FOOTBALL']];
export function adTexture(ad: [string, string, string]) {
  const [c, g] = canvas(512, 56);
  g.fillStyle = ad[0]; g.fillRect(0, 0, 512, 56); g.fillStyle = ad[1]; g.font = '800 34px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 2; i++) g.fillText(ad[2], 128 + i * 256, 30);
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
export function skyTexture() {
  const [c, g] = canvas(4, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#0a1424'); gr.addColorStop(0.55, '#1b3352'); gr.addColorStop(0.8, '#3a5e86'); gr.addColorStop(1, '#6a86a6');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = tex(c); t.mapping = THREE.UVMapping; return t;
}
export function puffTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(225,210,170,.9)'); gr.addColorStop(1, 'rgba(225,210,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
export function ringTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  return tex(c);
}
