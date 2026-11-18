/* 경기장: 잔디(디테일 노이즈), 라인(지오메트리), 관중석(계단 + InstancedMesh 관중), 골대·그물, 광고판, 조명탑, 하늘 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W, H, CX, CY, GH, GZ } from '../../sim/consts';
import { grassTexture, grassDetail, netTexture, adTexture, ADS, skyTexture, seatTexture } from './textures';
import type { Quality } from '../types';

export interface Net { mesh: THREE.Mesh; base: Float32Array; side: number; shake: number; }
export interface Stadium { group: THREE.Group; nets: Net[]; crowd: THREE.InstancedMesh[]; crowdBase: Float32Array[]; near: THREE.Object3D[]; bodies: { inst: THREE.InstancedMesh; kind: Uint8Array }[]; /** 잔디 바람 시간(초) — scene이 매 프레임 넣는다 */ wind: { value: number }; } // near: 카메라 쪽(큰 y) 관중석 — 중계 카메라에선 숨긴다

const rnd = Math.random;
const LINE = 0.12;
function lineMat() { const m = new THREE.MeshBasicMaterial({ color: 0xf2f5ee, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); return m; }
/** 경기장 라인을 얇은 지오메트리로 (텍스처보다 어느 거리에서나 선명) */
function buildLines() {
  const mat = lineMat(), geos: THREE.BufferGeometry[] = [];
  const rect = (x0: number, z0: number, x1: number, z1: number) => { // 테두리 사각형 (4 변)
    seg(x0, z0, x1, z0); seg(x0, z1, x1, z1); seg(x0, z0, x0, z1); seg(x1, z0, x1, z1);
  };
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) + LINE, g = new THREE.PlaneGeometry(L, LINE);
    g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(dz, dx)); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); geos.push(g);
  };
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n: number) => { for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; seg(cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r); } };
  const dot = (x: number, z: number, r: number) => { const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI / 2); g.translate(x, 0, z); geos.push(g); };
  rect(0, 0, W, H); seg(CX, 0, CX, H); arc(CX, CY, 9.15, 0, Math.PI * 2, 48); dot(CX, CY, 0.25);
  const a = Math.acos(5.5 / 9.15);
  for (const s of [0, 1]) {
    const x0 = s ? W : 0, sg = s ? -1 : 1;
    seg(x0, CY - 20.16, x0 + sg * 16.5, CY - 20.16); seg(x0 + sg * 16.5, CY - 20.16, x0 + sg * 16.5, CY + 20.16); seg(x0, CY + 20.16, x0 + sg * 16.5, CY + 20.16);
    seg(x0, CY - 9.16, x0 + sg * 5.5, CY - 9.16); seg(x0 + sg * 5.5, CY - 9.16, x0 + sg * 5.5, CY + 9.16); seg(x0, CY + 9.16, x0 + sg * 5.5, CY + 9.16);
    dot(x0 + sg * 11, CY, 0.22);
    if (s) arc(W - 11, CY, 9.15, Math.PI - a, Math.PI + a, 16); else arc(11, CY, 9.15, -a, a, 16);
  }
  for (const c of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) arc(c[0], c[1], 1, c[2], c[2] + Math.PI / 2, 6);
  const m = new THREE.Mesh(mergeGeometries(geos), mat); m.position.y = 0.012; m.receiveShadow = true; return m;
}
/** 잔디 바닥. 깎은 띠는 셰이더에서 그린다 — 잎이 누운 방향에 따라 보는 쪽에서 밝기가 달라지므로(중계 카메라에선 세로 띠가 또렷, 골 뒤에선 가로 띠가, 반대편에선 밝기가 뒤집힌다) 텍스처에 구워 두면 가짜처럼 보인다.
    바람: 큰 얼룩이 천천히 흘러가며 밝기가 ±3% 바뀌고 잎 결이 2~3cm 눕는다 (uTime). 비스듬히 볼수록 조금 밝고 누렇다(잎 옆면이 빛을 받는다) */
function buildPitch(wind: { value: number }) {
  const gt = grassTexture(), det = grassDetail();
  const geo = new THREE.PlaneGeometry(gt.TW, gt.TH); geo.rotateX(-Math.PI / 2); geo.translate(CX, 0, CY);
  const mat = new THREE.MeshStandardMaterial({ map: gt.tex, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: det }; sh.uniforms.detailRep = { value: new THREE.Vector2(gt.TW / 0.9, gt.TH / 0.9) }; sh.uniforms.uTime = wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n varying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 diffuse;', 'uniform vec3 diffuse; uniform sampler2D detailMap; uniform vec2 detailRep; uniform float uTime; varying vec3 vWPos;').replace('#include <map_fragment>', `#include <map_fragment>
      vec2 gp = vWPos.xz; vec3 gV = normalize(cameraPosition - vWPos);
      float w1 = sin(gp.x * 0.21 + gp.y * 0.13 + uTime * 0.9), w2 = sin(gp.x * 0.07 - gp.y * 0.17 - uTime * 0.55 + 1.7);
      float gust = texture2D(detailMap, gp * 0.011 + vec2(uTime * 0.011, uTime * 0.006)).g - 0.5;
      float wnd = w1 * w2 * 0.8 + gust * 2.2;
      vec2 duv = vMapUv * detailRep + vec2(wnd * 0.022, w1 * 0.012);
      vec3 dA = texture2D(detailMap, duv).rgb, dB = texture2D(detailMap, vMapUv * detailRep * 0.113 + 0.37).rgb;
      float inX = step(0.0, gp.x) * step(gp.x, ${W.toFixed(1)}), inY = step(0.0, gp.y) * step(gp.y, ${H.toFixed(1)});
      float mX = (smoothstep(-0.1, 0.1, sin(gp.x * ${(Math.PI / (W / 18)).toFixed(5)})) - 0.5) * 2.0, mY = (smoothstep(-0.1, 0.1, sin(gp.y * ${(Math.PI / (H / 12)).toFixed(5)})) - 0.5) * 2.0;
      float band = mX * (0.3 + 0.7 * clamp(gV.z * 1.7, -1.0, 1.0)) * 0.105 * inY + mY * (0.25 + 0.6 * clamp(gV.x * 1.7, -1.0, 1.0)) * 0.05 * inX;
      diffuseColor.rgb *= dA * 2.0 * (0.88 + dB.g * 0.24) * (1.0 + band) * (1.0 + wnd * 0.045);
      float graze = pow(1.0 - clamp(gV.y, 0.0, 1.0), 3.0); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.1 + vec3(0.022, 0.03, 0.0), graze * 0.55);`);
  };
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
}
function buildGround() { // 잔디 바깥 바닥 (트랙·콘크리트)
  const geo = new THREE.PlaneGeometry(W + 110, H + 110); geo.rotateX(-Math.PI / 2); geo.translate(CX, -0.02, CY);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 1 }));
}
function buildTrack() {
  const geo = new THREE.PlaneGeometry(W + GAP * 2, H + GAP * 2); geo.rotateX(-Math.PI / 2); geo.translate(CX, -0.01, CY);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c4f2d, roughness: 1 }));
}
function buildBoards() {
  const g = new THREE.Group(), hgt = 1.0;
  const mats = ADS.map(ad => new THREE.MeshBasicMaterial({ map: adTexture(ad) }));
  const strip = (x0: number, z0: number, x1: number, z1: number, i0: number) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.ceil(L / 10);
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = Math.min(1, (i + 1) / n), len = L * (f1 - f0), geo = new THREE.PlaneGeometry(len, hgt);
      const mat = mats[(i + i0) % mats.length].clone(); mat.map = mat.map!.clone(); mat.map.repeat.set(len / 10, 1); mat.map.needsUpdate = true;
      const m = new THREE.Mesh(geo, mat); m.position.set(x0 + dx * (f0 + f1) / 2, hgt / 2 + 0.02, z0 + dz * (f0 + f1) / 2);
      m.lookAt(CX, m.position.y, CY); m.rotateX(0.15); // 경기장 쪽을 보게, 위를 살짝 뒤로
      m.castShadow = true; g.add(m);
      const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 1 })); back.position.copy(m.position); back.quaternion.copy(m.quaternion); back.rotateY(Math.PI); back.translateZ(0.02); g.add(back);
    }
  };
  strip(-8, -3.5, W + 8, -3.5, 0); // 먼 쪽 (x 증가 방향, 정면이 -z 반대... rotation으로 경기장 쪽을 보게)
  strip(W + 8, H + 3.5, -8, H + 3.5, 2); // 가까운 쪽
  strip(-4, H + 1, -4, -1, 1); strip(W + 4, -1, W + 4, H + 1, 3); // 골 뒤
  return g;
}
function buildGoals(): { group: THREE.Group; nets: Net[] } {
  const g = new THREE.Group(), nets: Net[] = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.4, metalness: 0.1 });
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 });
  const R = 0.06, DEPTH = 2.0, TOPBACK = 0.9;
  const bar = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = R) => {
    const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), geo = new THREE.CylinderGeometry(r, r, L, 10);
    const m = new THREE.Mesh(geo, postMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()); m.castShadow = true; g.add(m);
  };
  const netQuad = (pts: [number, number, number][], repU: number, repV: number) => { // 4점 (시계방향), 세그먼트 있는 평면
    const geo = new THREE.PlaneGeometry(1, 1, 10, 8), pos = geo.attributes.position as THREE.BufferAttribute;
    const [a, b, c, d] = pts.map(p => new THREE.Vector3(...p));
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5; const top = a.clone().lerp(b, u), bot = d.clone().lerp(c, u), p = bot.lerp(top, v); pos.setXYZ(i, p.x, p.y, p.z); }
    geo.computeVertexNormals();
    const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * repV);
    const m = new THREE.Mesh(geo, netMat); g.add(m); return m;
  };
  for (const s of [0, 1]) {
    const x0 = s ? W : 0, sg = s ? 1 : -1, xb = x0 + sg * DEPTH, xt = x0 + sg * TOPBACK;
    bar(x0, 0, CY - GH, x0, GZ, CY - GH); bar(x0, 0, CY + GH, x0, GZ, CY + GH); bar(x0, GZ, CY - GH - R, x0, GZ, CY + GH + R);
    bar(xt, GZ, CY - GH, xt, GZ, CY + GH, 0.03); bar(x0, GZ, CY - GH, xt, GZ, CY - GH, 0.03); bar(x0, GZ, CY + GH, xt, GZ, CY + GH, 0.03);
    bar(xt, GZ, CY - GH, xb, 0, CY - GH, 0.03); bar(xt, GZ, CY + GH, xb, 0, CY + GH, 0.03); bar(xb, 0.02, CY - GH, xb, 0.02, CY + GH, 0.03);
    // 그물: 뒤(세로), 위(크로스바→뒤 윗봉), 옆 2개
    const back = netQuad([[xt, GZ, CY - GH], [xt, GZ, CY + GH], [xb, 0, CY + GH], [xb, 0, CY - GH]], GH * 2 / 0.12, 3 / 0.12);
    const base = Float32Array.from((back.geometry.attributes.position as THREE.BufferAttribute).array);
    nets.push({ mesh: back, base, side: s, shake: 0 });
    netQuad([[x0, GZ, CY - GH], [x0, GZ, CY + GH], [xt, GZ, CY + GH], [xt, GZ, CY - GH]], GH * 2 / 0.12, TOPBACK / 0.12);
    netQuad([[x0, GZ, CY - GH], [xt, GZ, CY - GH], [xb, 0, CY - GH], [x0, 0, CY - GH]], DEPTH / 0.12, GZ / 0.12);
    netQuad([[x0, GZ, CY + GH], [xt, GZ, CY + GH], [xb, 0, CY + GH], [x0, 0, CY + GH]], DEPTH / 0.12, GZ / 0.12);
  }
  return { group: g, nets };
}
/* ---------- 관중석 ----------
   네 면이 모서리에서 45°로 맞물리는 그릇 모양(2층 + 지붕). 각 면은 자기 좌표(가로 x, 뒤쪽 -z, 앞 가장자리가 터치라인에서 GAP)에서 만들고 돌려 놓는다.
   깊이 d의 가로 반폭은 L/2 + d (모서리가 대각선으로 잘려 옆 면과 만난다). 관중은 몸통·머리 두 InstancedMesh (몸통은 옷 색, 머리는 피부색 + 정수리 머리카락) */
const GAP = 13, SEAT = 0.56;
class Quads { // 네모들을 모아 한 지오메트리로 (면마다 정점을 따로 둬 각진 면)
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], u0 = 0, u1 = 1, v0 = 0, v1 = 1) { const n = this.pos.length / 3; this.pos.push(...a, ...b, ...c, ...d); this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1); this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); }
  /** 앞 가장자리(깊이 dA, 높이 yA)에서 뒤 가장자리(dB, yB)까지 가로로 긴 띠. 양 끝은 45°. uPer = u 1칸의 길이(m) */
  strip(L: number, dA: number, yA: number, dB: number, yB: number, uPer = 1, inset = 0) { const a = L / 2 + dA - inset, b = L / 2 + dB - inset; this.quad([-a, yA, -dA], [a, yA, -dA], [b, yB, -dB], [-b, yB, -dB], -a / uPer, a / uPer); }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.idx); g.computeVertexNormals(); return g; }
}
interface Tier { d0: number; y0: number; rows: number; sd: number; sh: number; dens: number; }
const TIERS: Tier[] = [{ d0: 0, y0: 1.3, rows: 20, sd: 0.9, sh: 0.48, dens: 0.9 }, { d0: 19.4, y0: 13.4, rows: 14, sd: 0.86, sh: 0.62, dens: 0.72 }];
const D_BACK = 32.5, Y_ROOF_BACK = 27, D_ROOF_FRONT = 5, Y_ROOF_FRONT = 24.6;
export const CROWD_NEUTRAL = [0xe9e9e6, 0xc9ccd2, 0x8d939c, 0x2a2e36, 0x1f3a66, 0x5a6b7d, 0xb8a58a, 0x3f4a3d, 0x6d2f2f, 0xd9d2c2];
const SKINS = [0xf1cfae, 0xe2b48e, 0xc9966b, 0xa87850, 0x7a5236, 0x54382a], LIT = 1.55; // LIT: 관중은 조명탑 불빛을 받은 것처럼 밝게 (인스턴스 색은 선형 값이라 1을 넘어도 된다)
function buildStands(q: Quality) {
  const g = new THREE.Group(), crowd: THREE.InstancedMesh[] = [], crowdBase: Float32Array[] = [], near: THREE.Object3D[] = [], bodies: { inst: THREE.InstancedMesh; kind: Uint8Array }[] = [];
  const concrete = new THREE.MeshLambertMaterial({ color: 0x666c76 }), dark = new THREE.MeshLambertMaterial({ color: 0x2c313a, side: THREE.DoubleSide });
  const seatTex = seatTexture(), seatMat = new THREE.MeshLambertMaterial({ map: seatTex, color: 0x29456f }), seatMat2 = new THREE.MeshLambertMaterial({ map: seatTex, color: 0x223a5e });
  const aisleMat = new THREE.MeshLambertMaterial({ color: 0x8b9099 }), railMat = new THREE.MeshLambertMaterial({ color: 0xd9dde3 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xaab2bf, emissive: 0x1c2128, side: THREE.DoubleSide }), edgeMat = new THREE.MeshLambertMaterial({ color: 0xeef1f5, emissive: 0x30343a, side: THREE.DoubleSide });
  const ribbonMats = ADS.map(ad => { const t = adTexture(ad); return new THREE.MeshBasicMaterial({ map: t }); });
  // 관중 한 명: 앉은 상체(어깨가 넓은 여섯 각 기둥) + 머리(정수리는 어둡게 = 머리카락)
  const body = new THREE.CylinderGeometry(0.21, 0.16, 0.5, 5, 1, false); body.scale(1, 1, 0.64); body.translate(0, 0.27, 0);
  const head = new THREE.SphereGeometry(0.12, 5, 3); head.translate(0, 0.67, 0);
  { const p = head.attributes.position, c = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const v = p.getY(k) > 0.71 || (p.getY(k) > 0.66 && p.getZ(k) < -0.02) ? 0.2 : 1; c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = v; } head.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff }), headMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const density = q === 'high' ? 1 : q === 'mid' ? 0.55 : 0.26;
  const sides: { L: number; cx: number; cz: number; rot: number }[] = [
    { L: W + GAP * 2, cx: CX, cz: -GAP, rot: 0 }, // 먼 쪽 (카메라 반대편)
    { L: W + GAP * 2, cx: CX, cz: H + GAP, rot: Math.PI },
    { L: H + GAP * 2, cx: -GAP, cz: CY, rot: Math.PI / 2 },
    { L: H + GAP * 2, cx: W + GAP, cz: CY, rot: -Math.PI / 2 },
  ];
  sides.forEach((sd, si) => {
    const L = sd.L, holder = new THREE.Group(); holder.position.set(sd.cx, 0, sd.cz); holder.rotation.y = sd.rot;
    const steps = new Quads(), seats = new Quads(), seats2 = new Quads(), aisles = new Quads(), caps = new Quads(), roof = new Quads(), edge = new Quads(), rail = new Quads(), ribbon = new Quads();
    const isAisle = (x: number) => Math.abs(((x + 600) % 15) - 7.5) > 6.85; // 15m마다 폭 1.3m 통로
    // 앞 벽
    steps.strip(L, 0, 0, 0, TIERS[0].y0); rail.strip(L, 0.05, TIERS[0].y0, 0.05, TIERS[0].y0 + 0.5);
    const people: number[] = [];
    TIERS.forEach((T, ti) => {
      for (let r = 0; r < T.rows; r++) {
        const d = T.d0 + r * T.sd, y = T.y0 + r * T.sh;
        steps.strip(L, d, y, d + T.sd, y); steps.strip(L, d + T.sd, y, d + T.sd, y + T.sh); // 디딤판·챌판
        (r % 2 ^ ti ? seats : seats2).strip(L, d + T.sd * 0.93, y + 0.04, d + T.sd * 0.93, y + 0.44, SEAT, 0.5); // 좌석 등받이 줄 (줄마다 두 색이 번갈아)
        for (const sg of [-1, 1]) { const x0 = sg * (L / 2 + d), x1 = sg * (L / 2 + d + T.sd); caps.quad([x0, 0, -d], [x1, 0, -d - T.sd], [x1, y, -d - T.sd], [x0, y, -d]); } // 모서리 단면 (옆 면이 가려질 때 속이 비어 보이지 않게)
        const half = L / 2 + d - 0.9, n = Math.floor(half * 2 / SEAT);
        for (let c = 0; c < n; c++) { const x = -half + (c + 0.5) * SEAT; if (isAisle(x) || rnd() > density * T.dens) continue; people.push(x + (rnd() - 0.5) * 0.12, y + 0.02, -(d + T.sd * 0.5), 0.9 + rnd() * 0.28); }
      }
      const dE = T.d0 + T.rows * T.sd, yE = T.y0 + T.rows * T.sh;
      for (let x = -Math.floor(L / 2 / 15) * 15 - 7.5; x < L / 2 + T.d0; x += 15) { if (Math.abs(x) > L / 2 + T.d0 - 2) continue; aisles.quad([x - 0.6, T.y0 + 0.3, -T.d0], [x + 0.6, T.y0 + 0.3, -T.d0], [x + 0.6, yE + 0.3, -dE], [x - 0.6, yE + 0.3, -dE]); } // 통로 (계단 위에 얹은 경사 띠)
      if (ti === 0) { // 1층 뒤 통로와 2층 앞 벽(위쪽은 광고 띠)
        const U = TIERS[1]; steps.strip(L, dE, yE, U.d0, yE); steps.strip(L, U.d0, yE, U.d0, U.y0 - 1.25); ribbon.strip(L, U.d0 - 0.02, U.y0 - 1.25, U.d0 - 0.02, U.y0, 22); rail.strip(L, U.d0 + 0.05, U.y0, U.d0 + 0.05, U.y0 + 0.45);
      } else { steps.strip(L, dE, yE, D_BACK, yE); }
    });
    // 뒷벽·지붕(앞으로 길게 나온 캔틸레버)·지붕 앞 테두리
    caps.strip(L, D_BACK, 0, D_BACK, Y_ROOF_BACK); roof.strip(L, D_ROOF_FRONT, Y_ROOF_FRONT, D_BACK, Y_ROOF_BACK);
    edge.strip(L, D_ROOF_FRONT, Y_ROOF_FRONT - 0.9, D_ROOF_FRONT, Y_ROOF_FRONT + 0.25);
    for (let x = -Math.floor(L / 2 / 15) * 15; x <= L / 2; x += 15) edge.quad([x - 0.25, Y_ROOF_FRONT - 0.5, -D_ROOF_FRONT], [x + 0.25, Y_ROOF_FRONT - 0.5, -D_ROOF_FRONT], [x + 0.25, Y_ROOF_BACK - 0.6, -D_BACK], [x - 0.25, Y_ROOF_BACK - 0.6, -D_BACK]); // 지붕 들보
    const add = (qd: Quads, m: THREE.Material) => { if (qd.idx.length) holder.add(new THREE.Mesh(qd.build(), m)); };
    add(steps, concrete); add(seats, seatMat); add(seats2, seatMat2); add(aisles, aisleMat); add(caps, dark); add(roof, roofMat); add(edge, edgeMat); add(rail, railMat); add(ribbon, ribbonMats[si % ribbonMats.length]);
    // 관중
    const n = people.length / 4, bi = new THREE.InstancedMesh(body, bodyMat, Math.max(1, n)), hi = new THREE.InstancedMesh(head, headMat, Math.max(1, n));
    const mtx = new THREE.Matrix4(), col = new THREE.Color(), base = new Float32Array(n * 3), kind = new Uint8Array(n), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const x = people[k * 4], y = people[k * 4 + 1], z = people[k * 4 + 2], hgt = people[k * 4 + 3]; base[k * 3] = x; base[k * 3 + 1] = y; base[k * 3 + 2] = z;
      qt.setFromAxisAngle(up, (rnd() - 0.5) * 0.5); sc.set(1, hgt, 1); ps.set(x, y, z); mtx.compose(ps, qt, sc); bi.setMatrixAt(k, mtx); hi.setMatrixAt(k, mtx);
      const r = rnd(); kind[k] = r < 0.3 ? 0 : r < 0.52 ? 1 : 2 + Math.floor(rnd() * CROWD_NEUTRAL.length); // 0·1 = 두 팀 색(경기마다 다시 칠한다), 그 밖은 평상복
      col.setHex(CROWD_NEUTRAL[(kind[k] + k) % CROWD_NEUTRAL.length]).offsetHSL(0, 0, (rnd() - 0.5) * 0.12).multiplyScalar(LIT); bi.setColorAt(k, col);
      col.setHex(SKINS[Math.floor(rnd() * SKINS.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.06).multiplyScalar(LIT); hi.setColorAt(k, col);
    }
    bi.count = hi.count = n; bi.instanceMatrix.needsUpdate = hi.instanceMatrix.needsUpdate = true; if (bi.instanceColor) bi.instanceColor.needsUpdate = true; if (hi.instanceColor) hi.instanceColor.needsUpdate = true;
    bi.computeBoundingSphere(); hi.computeBoundingSphere(); // 화면 밖 면의 관중은 그리지 않는다
    holder.add(bi, hi); crowd.push(bi, hi); crowdBase.push(base, base); bodies.push({ inst: bi, kind });
    if (sd.cz > H) near.push(holder); // 카메라 쪽 관중석
    g.add(holder);
  });
  return { group: g, crowd, crowdBase, near, bodies };
}
/** 관중 옷 색: 두 팀 유니폼 색을 섞어 다시 칠한다 (경기 시작 때) */
export function tintCrowd(st: Stadium, c0: string, c1: string) {
  const col = new THREE.Color(), a = new THREE.Color(c0), b = new THREE.Color(c1);
  for (const { inst, kind } of st.bodies) {
    for (let k = 0; k < kind.length; k++) { if (kind[k] > 1) continue; col.copy(kind[k] === 0 ? a : b).offsetHSL(0, -0.08, ((k * 37) % 11 - 5) * 0.012).multiplyScalar(LIT); inst.setColorAt(k, col); }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }
}
function buildFloodlights() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7, metalness: 0.4 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6d5 });
  const R = GAP + D_BACK + 6;
  for (const [x, z] of [[-R, -R], [W + R, -R], [-R, H + R], [W + R, H + R]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 52, 8), mat); pole.position.set(x, 26, z); g.add(pole);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 1.2), head); hd.position.set(x, 53, z); hd.lookAt(CX, 0, CY); g.add(hd);
    const back = new THREE.Mesh(new THREE.BoxGeometry(11.6, 6.6, 0.6), mat); back.position.copy(hd.position); back.quaternion.copy(hd.quaternion); back.translateZ(-0.9); g.add(back);
  }
  return g;
}
function buildSky() {
  const geo = new THREE.SphereGeometry(700, 24, 12);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  m.position.set(CX, -60, CY); return m;
}
export function buildStadium(q: Quality): Stadium {
  const group = new THREE.Group(), wind = { value: 0 };
  group.add(buildGround(), buildTrack(), buildPitch(wind), buildLines(), buildBoards(), buildFloodlights(), buildSky());
  const goals = buildGoals(); group.add(goals.group);
  const stands = buildStands(q); group.add(stands.group);
  return { group, nets: goals.nets, crowd: stands.crowd, crowdBase: stands.crowdBase, near: stands.near, bodies: stands.bodies, wind };
}
/** 그물 흔들림: 골 직후 뒤 그물이 출렁인다 */
export function updateNets(nets: Net[], dt: number) {
  for (const n of nets) {
    if (n.shake <= 0) continue; n.shake = Math.max(0, n.shake - dt);
    const pos = n.mesh.geometry.attributes.position as THREE.BufferAttribute, b = n.base, k = n.shake / 1.4, dir = n.side ? 1 : -1;
    for (let i = 0; i < pos.count; i++) { const y = b[i * 3 + 1], w = Math.sin((1.4 - n.shake) * 14 + y * 2) * 0.35 * k * (1 - y / GZ * 0.7); pos.setXYZ(i, b[i * 3] + dir * Math.max(0, w), y, b[i * 3 + 2]); }
    pos.needsUpdate = true;
  }
}
