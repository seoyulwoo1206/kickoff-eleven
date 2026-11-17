/* 캔버스로 그리는 텍스처들: 잔디, 유니폼(앞/뒤+등번호), 공, 그물, 광고판, 하늘, 먼지. 외부 이미지 파일 없음 */
import * as THREE from 'three';
import type { Kit } from '../../data/teams';
import { isLight } from '../../data/teams';
import { W, H } from '../../sim/consts';

const rnd = Math.random;
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

/** 잔디: 경기장(105×68) + 6m 여유. 깎은 방향에 따른 세로 띠(가장자리가 부드럽게) + 가로로 엇갈린 옅은 띠, 색 얼룩, 잎 결, 마모 자국. 1px ≈ 5cm */
export function grassTexture(px = 20) {
  const MX = 6, MZ = 6, TW = W + MX * 2, TH = H + MZ * 2;
  const [c, g] = canvas(Math.round(TW * px), Math.round(TH * px));
  g.scale(px, px); g.translate(MX, MZ);
  g.fillStyle = '#3a7232'; g.fillRect(-MX, -MZ, TW, TH);
  const n = 18, bw = W / n; // 세로 띠: 밝은 띠만 덧칠하되 양 가장자리를 0.5m에 걸쳐 흐리게
  for (let i = 0; i < n; i += 2) { const x = i * bw, gr = g.createLinearGradient(x - 0.25, 0, x + bw + 0.25, 0), e = 0.5 / (bw + 0.5); gr.addColorStop(0, 'rgba(120,176,84,0)'); gr.addColorStop(e, 'rgba(116,170,82,.27)'); gr.addColorStop(1 - e, 'rgba(116,170,82,.27)'); gr.addColorStop(1, 'rgba(120,176,84,0)'); g.fillStyle = gr; g.fillRect(x - 0.25, -MZ, bw + 0.5, TH); }
  for (let j = 0; j < 12; j += 2) { g.fillStyle = 'rgba(20,48,18,.09)'; g.fillRect(-MX, j * H / 12, TW, H / 12); } // 가로 띠 (깎는 기계가 엇갈려 지나간 자국)
  // 색 얼룩: 물·햇빛에 따라 조금씩 다른 초록
  for (let i = 0; i < 520; i++) { const x = -MX + rnd() * TW, y = -MZ + rnd() * TH, r = 1.5 + rnd() * 6, k = rnd(), col = k < 0.4 ? '18,44,16' : k < 0.8 ? '150,190,96' : '170,160,80', a = 0.04 + rnd() * 0.06; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // 결: 짧고 가는 획 (방향이 조금씩 다르다)
  for (let i = 0; i < 160000; i++) { const x = -MX + rnd() * TW, y = -MZ + rnd() * TH, k = rnd(); g.fillStyle = k < 0.45 ? 'rgba(8,30,8,.10)' : k < 0.9 ? 'rgba(190,225,130,.085)' : 'rgba(210,200,120,.07)'; g.fillRect(x, y, 0.05 + rnd() * 0.07, 0.12 + rnd() * 0.3); }
  const worn = (x: number, y: number, rx: number, ry: number, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, `rgba(128,112,62,${a})`); gr.addColorStop(0.6, `rgba(120,118,60,${a * 0.45})`); gr.addColorStop(1, 'rgba(120,118,60,0)'); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore(); };
  worn(W / 2, H / 2, 6, 4, 0.22); worn(5, H / 2, 7, 6, 0.34); worn(W - 5, H / 2, 7, 6, 0.34); worn(11, H / 2, 4, 3, 0.16); worn(W - 11, H / 2, 4, 3, 0.16);
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) worn(x, y, 2.5, 2.5, 0.2); // 코너
  { const gr = g.createLinearGradient(0, -MZ, 0, H + MZ); gr.addColorStop(0, 'rgba(0,0,0,.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,255,220,.05)'); g.fillStyle = gr; g.fillRect(-MX, -MZ, TW, TH); } // 조명이 고르지 않은 느낌
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 16;
  return { tex: t, MX, MZ, TW, TH };
}
/** 잔디 디테일 (가까이서 0.9m 타일, 같은 그림을 8m 크기로도 겹쳐 얼룩으로 쓴다): 중간 회색 바탕에 밝고 어두운 잎 획. 곱해서 쓰므로 평균 0.5 */
export function grassDetail() {
  const S = 512, [c, g] = canvas(S, S); const img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 118 + Math.floor(rnd() * 20); d[i] = v - 2; d[i + 1] = v + 2; d[i + 2] = v - 6; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) { const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 70, dk = rnd() < 0.5; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, dk ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.09)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } } // 이어 붙여도 티 안 나는 얼룩
  g.lineCap = 'round';
  for (let i = 0; i < 26000; i++) { const x = rnd() * S, y = rnd() * S, L = 3 + rnd() * 7, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, k = rnd(); g.strokeStyle = k < 0.5 ? 'rgba(0,0,0,.20)' : k < 0.92 ? 'rgba(255,255,255,.19)' : 'rgba(255,240,170,.2)'; g.lineWidth = 0.7 + rnd() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
/** 관중석 좌석 등받이 한 칸 (가로로 반복). 흰색으로 그려 재질 색을 곱한다 */
export function seatTexture() {
  const [c, g] = canvas(32, 32);
  g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(4, 30); g.lineTo(4, 8); g.quadraticCurveTo(4, 3, 9, 3); g.lineTo(23, 3); g.quadraticCurveTo(28, 3, 28, 8); g.lineTo(28, 30); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(4, 22, 24, 8);
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
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
  gf.fillStyle = 'rgba(0,0,0,.28)'; gf.fillRect(0, 0, w, 9); // 목선
  for (const q of [gf]) { const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.07)'); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.16)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); } // 가슴은 밝고 배는 조금 어둡게
  const [cb, gb] = canvas(w, h);
  if (gk) { gb.fillStyle = kit.gk; gb.fillRect(0, 0, w, h); } else drawPattern(gb, kit, w, h);
  const base = gk ? kit.gk : kit.c1, ink = isLight(base) ? '#111' : '#fff';
  gb.fillStyle = ink; gb.textAlign = 'center'; gb.textBaseline = 'middle';
  gb.save(); gb.translate(w / 2, 0); gb.scale(0.62, 1); // 몸통이 둥글어 가운데 60%만 정면으로 보인다
  if (name) { gb.font = '700 17px "IBM Plex Sans KR","Saira Condensed",sans-serif'; gb.fillText(name.toUpperCase(), 0, 30); }
  gb.font = '800 60px "Saira Condensed","Arial Narrow",sans-serif'; gb.fillText(String(num), 0, name ? 74 : 64); gb.restore();
  return { front: tex(cf), back: tex(cb) };
}
/** 머리(구)에 입힐 얼굴: 피부색 바탕에 눈·눈썹·코·입, 머리선(옆·뒤). 구의 u=0.5가 얼굴 정면, v는 위가 1 */
export function faceTexture(skin: string, hair: string, bald: boolean) {
  const w = 128, h = 64, [c, g] = canvas(w, h);
  g.fillStyle = skin; g.fillRect(0, 0, w, h);
  { const gr = g.createLinearGradient(0, 30, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = gr; g.fillRect(0, 30, w, h - 30); } // 턱 밑 그늘
  g.fillStyle = hair; g.globalAlpha = bald ? 0.35 : 1; // 머리선: 위 전체 + 옆·뒤는 귀 높이까지
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 40); g.lineTo(97, 38); g.lineTo(93, 24); g.lineTo(82, 15); g.lineTo(64, 12); g.lineTo(46, 15); g.lineTo(35, 24); g.lineTo(31, 38); g.lineTo(0, 40); g.closePath(); g.fill(); g.globalAlpha = 1;
  for (const sx of [-1, 1]) { const x = 64 + sx * 8.5;
    g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(x, 28.5, 5, 3.4, 0, 0, 7); g.fill(); // 눈두덩 그늘
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(x, 29, 3.3, 1.9, 0, 0, 7); g.fill();
    g.fillStyle = '#1c1410'; g.beginPath(); g.arc(x, 29, 1.6, 0, 7); g.fill();
    g.strokeStyle = hair; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 4.2, 24.6 + sx * 0.5); g.lineTo(x + 4.2, 24.6 - sx * 0.5); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(64, 30); g.lineTo(63.2, 37.5); g.lineTo(65.6, 38); g.stroke(); // 코
  g.strokeStyle = 'rgba(96,36,34,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(59.5, 43.6); g.quadraticCurveTo(64, 45, 68.5, 43.6); g.stroke(); // 입
  return tex(c);
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
