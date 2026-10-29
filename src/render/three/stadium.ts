/* 경기장: 잔디(디테일 노이즈), 라인(지오메트리), 관중석(계단 + InstancedMesh 관중), 골대·그물, 광고판, 조명탑, 하늘 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W, H, CX, CY, GH, GZ } from '../../sim/consts';
import { grassTexture, grassDetail, netTexture, adTexture, ADS, skyTexture } from './textures';
import type { Quality } from '../types';

export interface Net { mesh: THREE.Mesh; base: Float32Array; side: number; shake: number; }
export interface Stadium { group: THREE.Group; nets: Net[]; crowd: THREE.InstancedMesh[]; crowdBase: Float32Array[]; }

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
function buildPitch() {
  const gt = grassTexture(), det = grassDetail();
  const geo = new THREE.PlaneGeometry(gt.TW, gt.TH); geo.rotateX(-Math.PI / 2); geo.translate(CX, 0, CY);
  const mat = new THREE.MeshStandardMaterial({ map: gt.tex, roughness: 0.95, metalness: 0 });
  // 가까이서 보일 결: 디테일 노이즈를 곱한다
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: det }; sh.uniforms.detailRep = { value: new THREE.Vector2(gt.TW / 0.9, gt.TH / 0.9) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= texture2D(detailMap, vMapUv * detailRep).rgb * 2.0;`).replace('uniform vec3 diffuse;', 'uniform vec3 diffuse; uniform sampler2D detailMap; uniform vec2 detailRep;');
  };
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
}
function buildGround() { // 잔디 바깥 바닥 (트랙·콘크리트)
  const geo = new THREE.PlaneGeometry(W + 110, H + 110); geo.rotateX(-Math.PI / 2); geo.translate(CX, -0.02, CY);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 1 }));
}
function buildTrack() {
  const geo = new THREE.PlaneGeometry(W + 20, H + 20); geo.rotateX(-Math.PI / 2); geo.translate(CX, -0.01, CY);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a4a3c, roughness: 1 }));
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
/** 관중석: 계단 프로필을 길이 방향으로 돌출. 한 면씩 네 방향 */
function buildStands(q: Quality) {
  const g = new THREE.Group(), crowd: THREE.InstancedMesh[] = [], crowdBase: Float32Array[] = [];
  const ROWS = 14, STEP_D = 1.5, STEP_H = 0.85, GAP = 13; // 터치라인에서 관중석까지
  const standMat = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.9 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.9 });
  const prof = new THREE.Shape(); prof.moveTo(0, 0); prof.lineTo(0, 1.2);
  for (let i = 0; i < ROWS; i++) { prof.lineTo(i * STEP_D, 1.2 + i * STEP_H); prof.lineTo((i + 1) * STEP_D, 1.2 + i * STEP_H); }
  prof.lineTo(ROWS * STEP_D, 1.2 + ROWS * STEP_H); prof.lineTo(ROWS * STEP_D + 2, 1.2 + ROWS * STEP_H); prof.lineTo(ROWS * STEP_D + 2, 0); prof.closePath();
  // 관중 한 명: 몸통 상자 + 머리 구
  const body = new THREE.BoxGeometry(0.42, 0.55, 0.32); body.translate(0, 0.28, 0);
  const head = new THREE.SphereGeometry(0.14, 6, 5); head.translate(0, 0.68, 0);
  const person = mergeGeometries([body, head]);
  const personMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const density = q === 'high' ? 1 : q === 'mid' ? 0.5 : 0.22;
  const sides: { len: number; cx: number; cz: number; rot: number }[] = [
    { len: W + 30, cx: CX, cz: -GAP, rot: 0 }, // 먼 쪽 (카메라 반대편)
    { len: W + 30, cx: CX, cz: H + GAP, rot: Math.PI },
    { len: H + 10, cx: -GAP, cz: CY, rot: Math.PI / 2 },
    { len: H + 10, cx: W + GAP, cz: CY, rot: -Math.PI / 2 },
  ];
  for (const sd of sides) {
    const geo = new THREE.ExtrudeGeometry(prof, { depth: sd.len, bevelEnabled: false }); geo.translate(0, 0, -sd.len / 2);
    // 프로필의 x축(깊이)이 경기장에서 멀어지는 방향(-z 로컬)이 되게 회전
    const stand = new THREE.Mesh(geo, standMat); stand.rotation.y = Math.PI / 2; const holder = new THREE.Group(); holder.add(stand);
    holder.position.set(sd.cx, 0, sd.cz); holder.rotation.y = sd.rot; holder.rotateY(0);
    // 좌석 띠 (어두운 줄)
    for (let i = 0; i < ROWS; i++) { const sm = new THREE.Mesh(new THREE.BoxGeometry(sd.len, 0.08, STEP_D * 0.5), seatMat); sm.position.set(0, 1.2 + i * STEP_H + 0.04, -(i * STEP_D + STEP_D * 0.55)); holder.add(sm); }
    // 지붕
    const roof = new THREE.Mesh(new THREE.BoxGeometry(sd.len + 2, 0.5, ROWS * STEP_D * 0.75), new THREE.MeshStandardMaterial({ color: 0x3d4452, roughness: 0.8 }));
    roof.position.set(0, 1.2 + ROWS * STEP_H + 7, -(ROWS * STEP_D * 0.62)); roof.rotation.x = 0.12; holder.add(roof);
    for (let i = -1; i <= 1; i++) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.2 + ROWS * STEP_H + 7, 8), standMat); col.position.set(i * sd.len * 0.45, (1.2 + ROWS * STEP_H + 7) / 2, -(ROWS * STEP_D + 1.5)); holder.add(col); }
    // 관중
    const perRow = Math.floor(sd.len / 0.6), total = perRow * ROWS, n = Math.floor(total * density * 0.9);
    const inst = new THREE.InstancedMesh(person, personMat, Math.max(1, n)); const mtx = new THREE.Matrix4(), col = new THREE.Color();
    const base = new Float32Array(n * 3); let k = 0;
    const pal = [0xe8e8e8, 0x1b3f8f, 0xd7262b, 0x111111, 0xffb627, 0x19a974, 0x8a8f99, 0x5c3a2e, 0xf2c14e, 0x2e6fd1];
    for (let r = 0; r < ROWS && k < n; r++) for (let c = 0; c < perRow && k < n; c++) {
      if (rnd() > density * 0.9) continue;
      const x = -sd.len / 2 + 0.3 + c * 0.6 + (rnd() - 0.5) * 0.2, y = 1.2 + r * STEP_H, z = -(r * STEP_D + STEP_D * 0.3);
      base[k * 3] = x; base[k * 3 + 1] = y; base[k * 3 + 2] = z;
      mtx.makeRotationY((rnd() - 0.5) * 0.4); mtx.setPosition(x, y, z); inst.setMatrixAt(k, mtx);
      col.setHex(pal[Math.floor(rnd() * pal.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.2); inst.setColorAt(k, col); k++;
    }
    inst.count = k; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    holder.add(inst); crowd.push(inst); crowdBase.push(base);
    g.add(holder);
  }
  return { group: g, crowd, crowdBase };
}
function buildFloodlights() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7, metalness: 0.4 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6d5 });
  for (const [x, z] of [[-26, -24], [W + 26, -24], [-26, H + 24], [W + 26, H + 24]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 40, 8), mat); pole.position.set(x, 20, z); g.add(pole);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 1.2), head); hd.position.set(x, 40, z); hd.lookAt(CX, 0, CY); hd.rotateX(0); g.add(hd);
    const back = new THREE.Mesh(new THREE.BoxGeometry(7.4, 4.4, 0.6), mat); back.position.copy(hd.position); back.quaternion.copy(hd.quaternion); back.translateZ(-0.9); g.add(back);
  }
  return g;
}
function buildSky() {
  const geo = new THREE.SphereGeometry(700, 24, 12);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  m.position.set(CX, -60, CY); return m;
}
export function buildStadium(q: Quality): Stadium {
  const group = new THREE.Group();
  group.add(buildGround(), buildTrack(), buildPitch(), buildLines(), buildBoards(), buildFloodlights(), buildSky());
  const goals = buildGoals(); group.add(goals.group);
  const stands = buildStands(q); group.add(stands.group);
  return { group, nets: goals.nets, crowd: stands.crowd, crowdBase: stands.crowdBase };
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
