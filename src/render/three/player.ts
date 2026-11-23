/* 선수 모델(회전체로 만든 둥근 몸: 가슴·허리 굴곡이 있는 몸통, 근육 굴곡이 있는 팔다리, 얼굴 텍스처, 축구화) + 코드로 만든 애니메이션(절차적 포즈).
   로컬 좌표: 선수는 +X를 바라본다(그룹을 -dir 만큼 Y축 회전). 팔다리 스윙은 Z축 회전(+ = 앞으로), 옆 동작은 X축 회전.
   본 구조: root → hips → (thighL/R → shinL/R → footL/R), torso → (head, armL/R → foreL/R)
   키는 선수 데이터의 height, 체격(몸통·팔다리 굵기)은 몸싸움 능력치(str)를 따른다. 본마다 메시 하나(색은 정점 색)라 선수당 메시 16개 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Player } from '../../sim/types';
/** 포즈에 필요한 상태. 경기 중엔 Player 그대로, 리플레이 땐 버퍼에서 채운 객체 */
export interface PoseState { x: number; y: number; dir: number; vx: number; vy: number; run: number; kickCD: number; slide: number; dive: number; diveDir: number; stun: number; cele: boolean; role: string; i: number; kickWind: number; spin: number; feint: number; lunge: number; head: number; /** 오른팔을 머리 위로 든 정도 0~1 (심판의 카드·부심의 깃발) */ raise?: number; }
import type { Kit } from '../../data/teams';
import { kitTextures, faceTexture } from './textures';
import { clamp } from '../../sim/util';
import { lookBit } from '../../data/looks';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();
function geo(key: string, mk: () => THREE.BufferGeometry) { let g = geoCache.get(key); if (!g) { g = mk(); geoCache.set(key, g); } return g; }
function mat(key: string, mk: () => THREE.Material) { let m = matCache.get(key); if (!m) { m = mk(); matCache.set(key, m); } return m; }
const lam = (color: string) => mat('l' + color, () => new THREE.MeshLambertMaterial({ color }));
const vcMat = () => mat('vc', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
/** 지오메트리 전체를 한 색으로 칠한다 (정점 색) — 여러 색 조각을 한 메시로 합치려고 */
function tint<T extends THREE.BufferGeometry>(g: T, color: string): T { const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
/** 회전체: [반지름, y] 점들(아래→위)을 Y축으로 돌린다. 끝은 뚫려 있으므로 관절 구로 막는다 */
function lathe(pts: [number, number][], seg = 10, phi0 = 0, phiLen = Math.PI * 2) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiLen); }
/** 타원체 */
function blobGeo(rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, ws = 8, hs = 6) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
function merged(key: string, mk: () => THREE.BufferGeometry[]) { return geo(key, () => mergeGeometries(mk())!); }

const kitTexCache = new Map<string, { front: THREE.Texture; back: THREE.Texture }>();
function kitTex(kit: Kit, gk: boolean, num: number, name?: string) {
  const key = JSON.stringify([kit, gk, num, name ?? '']); let t = kitTexCache.get(key); if (!t) { t = kitTextures(kit, gk, num, name); kitTexCache.set(key, t); } return t;
}
const THIGH = 0.44, SHIN = 0.42, UARM = 0.28, FARM = 0.26, HIP_Y = 0.9, HEAD_Y = 0.66, STAND = HIP_Y + 0.12 + HEAD_Y + 0.125; // STAND: 배율 1일 때 선 키(m)
const BOOTS = ['#16181c', '#f1f1f1', '#e2452f', '#2a6fd6', '#d6e23c', '#16181c', '#ff7a1a', '#16181c'];
// 몸통 옆모습: [반너비(z), 높이]. 엉덩이 → 허리(잘록) → 가슴 → 어깨 → 목. 앞뒤 두께는 0.6배
const TORSO: [number, number][] = [[0.15, -0.04], [0.149, 0.02], [0.143, 0.09], [0.139, 0.15], [0.146, 0.21], [0.163, 0.27], [0.179, 0.33], [0.19, 0.385], [0.192, 0.425], [0.176, 0.462], [0.138, 0.49], [0.096, 0.512], [0.058, 0.535]];
// 유니폼 텍스처의 세로 좌표(v)는 예전 옆모습(점 9개, 점 번호에 비례)에 맞춰 그려져 있다 — 점을 늘려도 무늬·등번호 자리가 그대로이게 높이 → v 표로 다시 매긴다
const TORSO_V: [number, number][] = [[-0.04, 0], [0.05, 0.125], [0.14, 0.25], [0.22, 0.375], [0.3, 0.5], [0.38, 0.625], [0.44, 0.75], [0.495, 0.875], [0.535, 1]];
const torsoV = (y: number) => { for (let i = 1; i < TORSO_V.length; i++) if (y <= TORSO_V[i][0]) { const [y0, v0] = TORSO_V[i - 1], [y1, v1] = TORSO_V[i]; return v0 + (v1 - v0) * clamp((y - y0) / (y1 - y0), 0, 1); } return 1; };

export class PlayerModel {
  root = new THREE.Group();
  private hips = new THREE.Group(); private torso = new THREE.Group(); private head = new THREE.Group();
  private thigh: THREE.Group[] = []; private shin: THREE.Group[] = []; private foot: THREE.Mesh[] = [];
  private arm: THREE.Group[] = []; private fore: THREE.Group[] = [];
  private body = new THREE.Group(); // hips+torso를 함께 기울이거나 눕힐 때
  private hScale: number;
  private blob: THREE.Mesh;
  /** 이 모델을 만든 선수(교체되면 달라진다 → scene이 다시 만든다) */
  key: string;
  // 움직임 상태: 가속·회전 속도(기울기), 서 있음↔달리기 섞기, 자세가 바뀔 때 0.1초쯤 섞어 넘기기
  private L = { t: -1, sp: 0, dir: 0, acc: 0, turn: 0, a: 0, cr: 0, look: 0, mode: -1, mix: 1, dur: 0.12, run: 0, ph: 0, kcd: 0, k0: 0, drb: 0, tl: 0 };
  /** 달리기 주기의 위상(rad) — 공을 발에 붙인 드리블의 터치 박자를 `scene.ts`가 여기에 맞춘다 */
  get stepPh() { return this.L.ph; }
  /** 차는 발: 0 왼발, 1 오른발(로컬 +Z쪽) */
  get kickFoot() { return this.p.foot === 'L' ? 0 : 1; }
  private bones: THREE.Object3D[] = []; private cur = new Float32Array(45); private snap = new Float32Array(45);
  constructor(public p: Player, kit: Kit, blobTex: THREE.Texture, backName?: string) {
    const gk = p.role === 'GK', skin = p.skin, vc = vcMat();
    const shirt = gk ? kit.gk : kit.c1, shorts = gk ? '#1b1b1b' : kit.sh, sock = gk ? '#1b1b1b' : '#f4f4f4', band = gk ? kit.gk : kit.c1, boot = BOOTS[(p.i * 3 + p.t * 5 + p.num) % BOOTS.length];
    const cm = clamp(p.def?.height ?? 176 + ((p.i * 7 + p.t * 3) % 5) * 4, 160, 204); // 키: 선수 데이터, 없으면 번호로 조금씩 다르게
    this.hScale = cm / 100 / STAND;
    const bulk = clamp(1 + ((p.attrs?.str ?? 62) - 62) * 0.0042 + (gk ? 0.02 : 0), 0.93, 1.12), bq = Math.round(bulk * 50) / 50, B = (m: THREE.Mesh, k = 1.14) => { m.scale.set(bq * k, 1, bq * k); m.castShadow = true; return m; }; // k: 부위별 굵기 보정 (팔다리 1.14, 몸통 1.06) // 체격: 몸싸움 50 → 0.95배, 90 → 1.12배 (2% 단위)
    this.root.scale.setScalar(this.hScale);
    this.root.add(this.body); this.body.add(this.hips); this.hips.position.y = HIP_Y;
    // 골반 (바지 윗부분)
    this.hips.add(B(new THREE.Mesh(geo('pelvis4', () => blobGeo(0.104, 0.135, 0.156, 0, 0.015, 0, 16, 10)), lam(shorts)), 1.08));
    // 몸통: 앞·뒤 반쪽 회전체에 유니폼 앞/뒤 텍스처 (등번호는 뒤)
    const kt = kitTex(kit, gk, p.num, backName);
    // 46차: 납작한 판 같던 몸통(앞뒤 0.6배 고정·반쪽 9각)을 16각으로 늘리고 높이마다 두께를 다르게 — 가슴·등 위쪽은 두껍게, 허리는 얇게, 어깨 끝은 둥글게 내려가게
    const half = (back: boolean) => geo(back ? 'torsoB4' : 'torsoF4', () => { const g = lathe(TORSO, 16, back ? Math.PI : 0, Math.PI), A = g.attributes.position, U = g.attributes.uv;
      for (let k = 0; k < A.count; k++) { const x = A.getX(k), y = A.getY(k), z = A.getZ(k), e = (c: number, w: number) => Math.exp(-((y - c) / w) * ((y - c) / w));
        const dep = 0.6 + 0.07 * e(0.33, 0.14) + (x > 0 ? 0.06 * e(0.35, 0.085) - 0.03 * e(0.12, 0.1) : 0.05 * e(0.4, 0.1) + 0.03 * e(0.02, 0.09)); // 앞: 가슴 볼록·배 납작 / 뒤: 견갑·엉덩이 위
        const sh = 1 - 0.1 * e(0.44, 0.05) * Math.pow(Math.abs(x) / 0.19, 2); // 어깨 위는 앞뒤로 덜 각지게
        A.setXYZ(k, x * dep, y, z * sh); U.setY(k, torsoV(y)); }
      g.computeVertexNormals(); return g; });
    const tf = B(new THREE.Mesh(half(false), mat('kf' + JSON.stringify([kit, gk, p.num]), () => new THREE.MeshLambertMaterial({ map: kt.front }))), 1.06);
    const tb = B(new THREE.Mesh(half(true), mat('kb' + JSON.stringify([kit, gk, p.num, backName ?? '']), () => new THREE.MeshLambertMaterial({ map: kt.back }))), 1.06);
    this.torso.position.y = 0.12; this.hips.add(this.torso); this.torso.add(tf, tb);
    // 머리: 턱이 좁아지는 머리통 + 얼굴 텍스처(선수마다 다른 생김새) + 코·귀·목 + 머리 모양 7가지
    // 머리 모양: 0 삭발 · 1 짧게 깎음 · 2 짧은 머리 · 3 앞을 세운 머리 · 4 긴 머리 · 5 곱슬(크게) · 6 묶은 머리
    const r3 = lookBit(p.look, 3), r2 = lookBit(p.look, 2);
    const style = r3 < 0.04 ? 0 : p.tone >= 3 && r2 < 0.34 ? 5 : p.tone >= 3 && r2 < 0.62 ? 1 : r3 < 0.16 ? 1 : r3 < 0.55 ? 2 : r3 < 0.8 ? 3 : r3 < 0.93 ? 4 : 6;
    const hairline = style === 0 ? 3 : style === 1 ? 2 : lookBit(p.look, 4) < 0.2 ? 1 : 0;
    const headG = geo('head3', () => { const g = new THREE.SphereGeometry(1, 20, 16), A = g.attributes.position;
      for (let k = 0; k < A.count; k++) { let x = A.getX(k); const y = A.getY(k); let z = A.getZ(k); const t = Math.pow(clamp((-y - 0.05) / 0.95, 0, 1), 1.4); z *= 1 - 0.3 * t; x = x * (1 - 0.16 * t) + 0.1 * t * (x > 0 ? 1 : 0.3); x *= x > 0 ? 0.97 : 1.06; A.setXYZ(k, x, y, z); }
      g.scale(0.1, 0.128, 0.092); g.computeVertexNormals(); return g; });
    const headM = new THREE.Mesh(headG, mat('face' + [skin, p.hair, p.look, hairline].join(), () => new THREE.MeshLambertMaterial({ map: faceTexture(skin, p.hair, p.look, p.tone, hairline) }))); headM.castShadow = true;
    const nw = 0.012 + lookBit(p.look, 23) * 0.005;
    const neck = new THREE.Mesh(merged('neck4' + skin + nw.toFixed(3), () => [tint(lathe([[0.062, -0.21], [0.053, -0.16], [0.048, -0.1], [0.049, -0.05]], 14), skin),
      tint(blobGeo(0.016, 0.028, 0.012, -0.004, -0.004, 0.09, 5, 4), skin), tint(blobGeo(0.016, 0.028, 0.012, -0.004, -0.004, -0.09, 5, 4), skin),
      tint(blobGeo(0.012, 0.017, nw * 0.85, 0.09, -0.022, 0, 6, 5), skin)]), vc);
    this.head.position.y = HEAD_Y; this.head.add(headM, neck); this.torso.add(this.head);
    if (style !== 0) {
      const cap = (rx: number, ry: number, rz: number, th: number, tilt = 0.52, dx = -0.006, dy = 0.004) => { const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * th); g.scale(rx, ry, rz); g.rotateZ(tilt); g.translate(dx, dy, 0); return g; };
      const hairM = new THREE.Mesh(merged('hair3' + style, () => style === 1 ? [cap(0.1045, 0.1315, 0.096, 0.425, 0.5, -0.004, 0.002)]
        : style === 2 ? [cap(0.108, 0.136, 0.0995, 0.43, 0.5)]
        : style === 3 ? [cap(0.108, 0.136, 0.0995, 0.43, 0.5), blobGeo(0.058, 0.032, 0.072, 0.042, 0.118, 0, 8, 5)]
        : style === 4 ? [cap(0.108, 0.137, 0.1, 0.45), blobGeo(0.05, 0.085, 0.086, -0.068, -0.06, 0, 8, 6)]
        : style === 5 ? [(() => { const g = cap(0.119, 0.147, 0.112, 0.44, 0.46, -0.008, 0.008), A = g.attributes.position; for (let k = 0; k < A.count; k++) { const x = A.getX(k), y = A.getY(k), z = A.getZ(k), w = 1 + 0.045 * Math.sin(x * 190 + y * 130) * Math.cos(z * 170 + y * 90); A.setXYZ(k, x * w, y * w, z * w); } g.computeVertexNormals(); return g; })()]
        : [cap(0.108, 0.136, 0.0995, 0.43, 0.5), blobGeo(0.036, 0.036, 0.036, -0.088, 0.088, 0, 7, 5)]), lam(p.hair));
      hairM.castShadow = true; this.head.add(hairM);
    }
    // 팔: 어깨(소매) → 위팔 → 팔꿈치 / 아래팔 → 손 (키퍼는 긴소매 + 장갑)
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(0, 0.452, s * 0.214 * bq);
      a.add(B(new THREE.Mesh(merged('uarm5' + shirt + skin + gk, () => [ // 위팔: 이두가 볼록하고 팔꿈치로 가늘어진다 · 소매는 끝이 살짝 벌어진다 · 어깨(삼각근)는 몸통 모서리를 덮는 둥근 덩어리
        tint(lathe([[0.036, -UARM], [0.039, -0.235], [0.046, -0.15], [0.048, -0.08], [0.046, -0.01]], 13), gk ? shirt : skin),
        tint(lathe([[0.057, -0.152], [0.054, -0.14], [0.054, -0.07], [0.057, -0.01]], 13), shirt), tint(blobGeo(0.056, 0.062, 0.058, 0, -0.012, 0, 13, 9), shirt), tint(blobGeo(0.037, 0.037, 0.037, 0, -UARM, 0, 10, 7), gk ? shirt : skin)]), vc)));
      const f = new THREE.Group(); f.position.y = -UARM;
      f.add(B(new THREE.Mesh(merged('farm4' + shirt + skin + gk, () => [ // 아래팔: 팔꿈치 아래가 가장 굵고 손목으로 가늘어진다 · 손은 납작하게 + 엄지
        tint(lathe([[0.026, -FARM], [0.03, -0.205], [0.039, -0.11], [0.041, -0.05], [0.037, 0]], 13), gk ? shirt : skin),
        ...(gk ? [tint(blobGeo(0.048, 0.066, 0.034, 0.01, -FARM - 0.05, 0, 10, 7), '#ececec')] : [tint(blobGeo(0.027, 0.047, 0.017, 0.005, -FARM - 0.042, 0, 10, 7), skin), tint(blobGeo(0.011, 0.022, 0.011, 0.024, -FARM - 0.03, 0, 6, 5), skin)])]), vc)));
      a.add(f); this.torso.add(a); this.arm.push(a); this.fore.push(f);
    }
    // 다리: 허벅지(바지 자락 + 맨살 + 무릎) / 종아리(스타킹, 위에 유니폼 색 띠) / 축구화
    for (const s of [-1, 1]) {
      const t = new THREE.Group(); t.position.set(0, 0, s * 0.098 * bq);
      t.add(B(new THREE.Mesh(merged('thigh4' + shorts + skin, () => [ // 허벅지: 위가 굵고 무릎으로 가늘어진다(앞쪽 근육이 조금 나온다) · 바지 자락은 끝이 살짝 벌어진다
        tint(lathe([[0.05, -THIGH], [0.054, -0.385], [0.066, -0.28], [0.081, -0.15], [0.087, -0.05], [0.083, 0]], 14).translate(0.004, 0, 0), skin), tint(blobGeo(0.051, 0.055, 0.051, 0.008, -THIGH, 0, 11, 8), skin),
        tint(lathe([[0.105, -0.245], [0.101, -0.232], [0.1, -0.13], [0.095, -0.02], [0.081, 0.04]], 14), shorts)]), vc)));
      const sh = new THREE.Group(); sh.position.y = -THIGH;
      sh.add(B(new THREE.Mesh(merged('shin4' + sock + band, () => { const c = lathe([[0.033, -SHIN], [0.036, -0.355], [0.046, -0.26], [0.058, -0.16], [0.057, -0.1], [0.049, -0.035]], 14); c.translate(-0.011, 0, 0); /* 종아리는 뒤로 볼록 */ return [tint(c, sock), tint(lathe([[0.057, -0.1], [0.056, -0.045]], 14).translate(-0.009, 0, 0), band)]; }), vc)));
      const ft = new THREE.Mesh(merged('boot4' + boot, () => [tint(blobGeo(0.128, 0.05, 0.05, 0.012, 0, 0, 14, 8), boot), tint(blobGeo(0.05, 0.062, 0.046, -0.072, 0.02, 0, 10, 7), boot), tint(new THREE.BoxGeometry(0.235, 0.018, 0.082).translate(0.008, -0.042, 0), '#0b0b0d')]), vc);
      ft.position.set(0.062, -SHIN + 0.048, 0); ft.castShadow = true; sh.add(ft);
      t.add(sh); this.hips.add(t); this.thigh.push(t); this.shin.push(sh); this.foot.push(ft);
    }
    // 그림자 없는 품질용 둥근 그림자
    this.blob = new THREE.Mesh(geo('blob', () => { const g = new THREE.CircleGeometry(0.42, 12); g.rotateX(-Math.PI / 2); return g; }), mat('blob', () => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.35, depthWrite: false })));
    this.blob.position.y = 0.01; this.root.add(this.blob);
    this.bones = [this.body, this.hips, this.torso, this.head, this.thigh[0], this.thigh[1], this.shin[0], this.shin[1], this.foot[0], this.foot[1], this.arm[0], this.arm[1], this.fore[0], this.fore[1]];
    this.key = PlayerModel.keyOf(p);
  }
  static keyOf(p: Player) { return p.num + '|' + p.nameEn; }
  setBlob(on: boolean) { this.blob.visible = on; }
  /** 손에 물건을 쥐여 준다 (i: 0 왼손, 1 오른손) — 아래팔 끝에 붙는다 */
  hold(obj: THREE.Object3D, i = 1) { obj.position.set(0.02, -FARM - 0.05, 0); this.fore[i].add(obj); }
  /** 상태로 포즈를 만든다. tGlobal은 연출용 시간(초).
      달리기: 허벅지 스윙 + 넘어오는 다리의 무릎 접기 + 디딤발 무릎 완충, 골반·어깨가 서로 반대로 돌고, 가속하면 앞으로·멈추면 뒤로·돌면 안쪽으로 기운다.
      골반 높이는 디딘 발이 땅에 닿게 다리 자세에서 역산한다(달릴 땐 뜨는 구간만큼 더). 자세가 바뀌는 순간(킥·점프·슬라이딩…)은 0.04~0.2초 섞어 넘긴다 */
  update(p: PoseState, ball: { x: number; y: number; z?: number; vx?: number; vy?: number; owner?: Player | null; passTarget?: unknown; kicker?: unknown; knock?: unknown }, tGlobal: number) {
    const r = this.root, L = this.L, TAU = Math.PI * 2;
    r.position.set(p.x, 0, p.y); r.rotation.set(0, -p.dir, 0);
    const sp = Math.hypot(p.vx, p.vy), aT = clamp((sp - 0.3) / 1.3, 0, 1);
    let dt = L.t < 0 ? 0 : tGlobal - L.t; const cut = L.t < 0 || dt < 0 || dt > 0.25; if (cut) dt = 0; L.t = tGlobal;
    if (cut) { L.acc = 0; L.turn = 0; L.a = aT; L.cr = 0; }
    else if (dt > 0) { const k = 1 - Math.exp(-dt * 7); L.acc += (clamp((sp - L.sp) / dt, -14, 14) - L.acc) * k; let dd = p.dir - L.dir; dd = ((dd % TAU) + TAU * 1.5) % TAU - Math.PI; L.turn += (clamp(dd / dt, -8, 8) - L.turn) * k; L.a += (aT - L.a) * (1 - Math.exp(-dt * 9)); }
    L.sp = sp; L.dir = p.dir;
    // 보폭: 한 주기(두 걸음)에 가는 거리는 빠를수록 길다 — 걷기 1.8m·조깅 2.7m·질주 4m (초당 2~4.3걸음). 전엔 늘 2.42m라 질주하면 초당 6.6걸음으로 종종걸음이었다
    const cyc = clamp(1.5 + 0.3 * sp, 1.8, 4.2); { let dr = p.run - L.run; L.run = p.run; if (cut || dr < 0 || dr > 2) dr = 0; L.ph = (L.ph + dr * TAU / cyc) % TAU; }
    const a = L.a, idle = 1 - a, u = clamp((sp - 3.6) / 3.8, 0, 1), stride = clamp(sp / 8, 0.22, 1.25) * a, ph = L.ph, amp = cyc / 5.2 * a; // a: 0 서 있음 → 1 움직임, u: 0 조깅 → 1 질주, amp: 허벅지 스윙(디딘 발이 땅을 미는 속도가 달리는 속도와 맞게)
    const own = !!ball.owner && (ball.owner as unknown as PoseState) === p;
    // 드리블 터치(질주 드리블로 공을 앞에 차 놓음 — kickCD 0.12~0.22)는 킥 자세로 바꾸지 않고 달리던 그대로 간다. 전엔 터치마다(초당 2.5번) 킥 자세가 달리기를 덮어 질주 드리블 시간의 34%가 킥 자세였다
    if (cut) L.k0 = p.kickCD > 0 ? 0.3 : 0; else if (p.kickCD > L.kcd + 0.02) { L.k0 = p.kickCD; L.tl = Math.cos(ph) > 0 ? 0 : 1; } else if (p.kickCD <= 0) L.k0 = 0; L.kcd = p.kickCD;
    const touch = L.k0 > 0 && L.k0 <= 0.23 && p.kickCD > 0;
    const drbT = own || (ball.knock === p && Math.hypot(ball.x - p.x, ball.y - p.y) < 3.5) ? 1 : 0; if (cut) L.drb = drbT; else L.drb += (drbT - L.drb) * (1 - Math.exp(-dt * 10)); const drb = L.drb; // 공을 몰고 있다 (차 놓고 쫓는 동안도) — 숙임·팔 벌림이 터치마다 깜빡이지 않게 부드럽게
    const kickA = p.kickCD > 0 && !touch ? (0.3 - p.kickCD) / 0.3 : -1; // 0→1 킥 진행
    const wind = p.kickWind > 0 ? Math.min(1, p.kickWind / 0.1) : 0; // 와인드업: 발을 뒤로
    const gk = p.role === 'GK', K = this.p.foot === 'L' ? 0 : 1, S = 1 - K, sg = K === 1 ? 1 : -1; // K: 차는 발(1 = 오른발, 로컬 +Z쪽), S: 디딤발
    const body = this.body, hips = this.hips, torso = this.torso, head = this.head, thigh = this.thigh, shin = this.shin;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0); hips.rotation.set(0, 0, 0); hips.position.y = HIP_Y; torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    const side = (i: number) => (i === 0 ? 1 : -1); // X축 회전 부호: 양수면 왼쪽(i=0)이 바깥으로
    const leg = (i: number, th: number, kn: number, fa = 0.08, ab = 0) => { thigh[i].rotation.set(ab * side(i), 0, th); shin[i].rotation.set(0, 0, -kn); this.foot[i].rotation.set(0, 0, fa); };
    const arm = (i: number, sw: number, out: number, el: number) => { this.arm[i].rotation.set(out * side(i), 0, sw); this.fore[i].rotation.set(0, 0, el); };
    const ds = p.diveDir * (Math.cos(p.dir) >= 0 ? 1 : -1); // 다이브 방향을 로컬 z 부호로
    const bz = ball.z ?? 0, outside = p.y < -0.2 || p.y > 68.2, bq = Math.hypot(ball.x - p.x, ball.y - p.y);
    let mode = 0, fade = 0.12, hipAdd = 0, floorY = 0, manual = false;
    if (p.slide > 0) { // 슬라이딩: 뒤로 누워 한 발 앞으로
      mode = 1; fade = 0.07; manual = true; body.rotation.z = 1.2; hips.position.y = 0.35; body.position.x = -0.2;
      leg(K, 1.5, 0.1, -0.3); leg(S, 0.9, 1.4); arm(S, 2.2, 0.6, 0.3); arm(K, -0.6, 0.6, 0.5); torso.rotation.z = 0.2; torso.rotation.y = -sg * 0.25;
    } else if (p.dive > 0) { // 키퍼 다이브: 옆으로 몸을 던지며 두 팔을 공 쪽으로 뻗는다
      mode = 2; fade = 0.06; manual = true; const k = Math.min(1, (0.5 - p.dive) / 0.18);
      body.rotation.x = ds * 1.35 * k; hips.position.y = HIP_Y - 0.45 * k; body.position.z = ds * 0.4 * k;
      const lo = ds > 0 ? 1 : 0, hi = 1 - lo; // lo: 땅 쪽 다리
      leg(lo, 0.15, 0.25, -0.3); leg(hi, -0.25, 0.75, -0.2, 0.25 * k); arm(0, 0.25, -ds * 2.15, 0.12); arm(1, 0.25, -ds * 2.15, 0.12); torso.rotation.x = ds * 0.15 * k;
    } else {
      // ── 걷기·달리기 ──
      for (const i of [0, 1]) { const f = ph + i * Math.PI, s = Math.sin(f), c = Math.cos(f);
        const th = amp * s + 0.1 * u * stride;
        const kn = 0.1 + (0.8 + 0.85 * u) * stride * Math.pow(Math.max(0, Math.cos(f + 0.3)), 1.25) + (0.18 + 0.2 * u) * stride * Math.max(0, -c) ** 2; // 넘어오는 다리는 뒤꿈치가 엉덩이 쪽으로, 디딘 다리는 살짝 굽혀 받는다
        leg(i, th, kn, 0.08 - 0.5 * stride * Math.max(0, -s) ** 2 + 0.2 * stride * Math.max(0, s) * Math.max(0, c), 0.035 * idle); }
      if (touch) { const e = Math.sin(Math.PI * clamp(1 - p.kickCD / L.k0, 0, 1)), i = L.tl; thigh[i].rotation.z += 0.2 * e; shin[i].rotation.z = Math.min(-0.05, shin[i].rotation.z + 0.35 * e); } // 드리블 터치: 앞으로 넘어오던 다리를 조금 더 뻗어 공을 민다
      const near = bq < 22 ? 1 : 0.35, tap = tGlobal * 5.4 + p.i * 1.3; // 서 있을 땐 무릎을 풀고 제자리에서 발을 구른다 (공이 가까우면 더)
      if (idle > 0.01) for (const i of [0, 1]) { const z = Math.max(0, Math.sin(tap + i * Math.PI)); thigh[i].rotation.z += idle * near * (0.07 + 0.05 * z); shin[i].rotation.z -= idle * near * (0.19 + 0.13 * z); }
      const s0 = Math.sin(ph), lean = (0.05 + 0.17 * clamp(sp / 8, 0, 1)) * a + 0.1 * drb + 0.03 * idle;
      body.rotation.z = -clamp(L.acc * 0.02, -0.13, 0.2) * a; body.rotation.x = clamp(L.turn * sp * 0.011, -0.26, 0.26); // 가속하면 앞으로·멈추면 뒤로, 돌면 안쪽으로 기운다
      hips.rotation.y = -0.13 * s0 * stride; hips.rotation.x = 0.045 * Math.cos(ph) * stride;
      torso.rotation.set(-hips.rotation.x * 0.8, 0.36 * s0 * stride * (0.6 + 0.4 * u), -lean + Math.sin(tGlobal * 1.7 + p.i) * 0.012 * idle); // 어깨는 골반과 반대로 돈다
      const el0 = 0.28 + 0.95 * clamp(sp / 4.2, 0, 1) + 0.25 * u, Aa = (0.3 + 0.6 * u) * stride + 0.12 * a;
      for (const i of [0, 1]) { const s = -Math.sin(ph + i * Math.PI); arm(i, s * Aa - 0.08 * a + 0.03, 0.2 - 0.06 * u + 0.2 * drb + 0.04 * idle, el0 + 0.3 * Math.max(0, s) * stride + 0.08 * idle * Math.sin(tGlobal * 1.3 + i * 2 + p.i)); }
      // 수비 자세: 공 가진 상대가 가까우면 무릎을 굽히고 팔을 벌려 낮춘다
      const o = ball.owner as Player | null | undefined, crT = !own && !gk && !!o && o.t !== this.p.t && bq < 5.5 && sp < 5.2 ? 1 : 0;
      L.cr += (crT - L.cr) * (1 - Math.exp(-dt * 8)); if (cut) L.cr = crT;
      if (L.cr > 0.01) { const c = L.cr; for (const i of [0, 1]) { thigh[i].rotation.z += 0.3 * c; shin[i].rotation.z -= 0.55 * c; thigh[i].rotation.x += 0.11 * c * side(i); this.arm[i].rotation.x += 0.42 * c * side(i); this.fore[i].rotation.z += (0.85 - this.fore[i].rotation.z) * c * 0.7; } torso.rotation.z -= 0.2 * c; }
      // ── 덮어쓰는 동작들 ──
      const header = kickA >= 0 && kickA < 0.85 && ball.kicker === p && bz > 1.1 && !outside; // 방금 머리로 받아 넘긴 공이 아직 떠 있다 → 헤딩 뒤 내려오는 중
      // 공중볼 맞이: 나한테 오는 뜬 공이 0.3초 안에 닿는다 → 미리 뛰어올라 닿는 순간이 꼭대기
      let pre = 0; if (ball.passTarget === p && !ball.owner && bz > 1.4 && bz < 3.6) { const tA = Math.max(0, bq - 0.7) / Math.max(6, Math.hypot(ball.vx ?? 0, ball.vy ?? 0)); if (tA < 0.3) pre = 1 - (tA / 0.3) ** 2; }
      const gkHold = gk && own && bz > 0.55 && !outside; // 키퍼가 손에 든 공
      const drop = own && !gk && !outside && bz > 0.2 ? Math.min(1, bz / 2.2) : 0; // 머리·가슴으로 떨군 공이 발밑으로 내려오는 동안
      const hold = own && bz > 1.6 && outside, thrown = !hold && kickA >= 0 && outside; // 스로인 (터치라인 밖에서만)
      if (p.cele) { // 세리머니: 달리는 동안엔 두 팔을 들거나·비행기·주먹, 멈추면 제자리 뛰기
        mode = 3; const v = this.p.i % 3;
        if (a > 0.5) { if (v === 1) { arm(0, 0, 1.45, 0.05); arm(1, 0, 1.45, 0.05); body.rotation.x += Math.sin(tGlobal * 2.4) * 0.2; } else if (v === 2) { arm(K, 2.6 + Math.sin(tGlobal * 11) * 0.25, 0.3, 0.9 + Math.sin(tGlobal * 11) * 0.4); } else { for (const i of [0, 1]) arm(i, 0.2, 2.7 + Math.sin(tGlobal * 9 + i) * 0.18, 0.3); } torso.rotation.z = -0.04; }
        else { const j = Math.abs(Math.sin(tGlobal * 7 + p.i)); hipAdd = j * 0.2; floorY = HIP_Y - 0.03; leg(0, 0.1, 0.3 + j * 0.35, -0.3 * j); leg(1, -0.05, 0.3 + j * 0.35, -0.3 * j); for (const i of [0, 1]) arm(i, 0.2, 2.9 - (v === 2 && i === S ? 2.4 : 0), 0.4); torso.rotation.z = 0.06; }
      } else if (wind > 0) { // 와인드업: 차는 발을 뒤로 젖히고 어깨를 튼다, 반대쪽 팔은 앞으로
        mode = 4; fade = 0.06;
        leg(K, -0.95 * (1 - wind * 0.25), 1.25, -0.3); leg(S, 0.12, 0.42);
        body.rotation.z = -0.07; hips.rotation.set(0, -sg * 0.18, 0); torso.rotation.set(0, -sg * 0.38, -0.14); arm(S, 0.75, 0.75, 0.55); arm(K, -0.85, 0.5, 0.5);
      } else if (p.feint > 0 && kickA < 0) { // 헛다리
        mode = 6; fade = 0.05; const f = Math.sin(tGlobal * 26);
        leg(0, f * 0.5, 0.6 + Math.max(0, f) * 0.5); leg(1, -f * 0.5, 0.6 + Math.max(0, -f) * 0.5); torso.rotation.y = f * 0.25; arm(0, -f * 0.4, 0.5, 0.9); arm(1, f * 0.4, 0.5, 0.9);
      } else if (kickA >= 0 && !header && !hold && !thrown) { // 킥: 공이 떠나는 순간(0) 발은 이미 공에 닿아 있고, 그 뒤로 휘둘러 올린다. 골반은 차는 쪽이 앞으로·어깨는 반대로, 반대쪽 팔이 앞으로 넘어온다
        mode = 5; fade = 0.035; const k = kickA, sw = k < 0.3 ? 0.2 + k / 0.3 * 1.15 : 1.35 - (k - 0.3) / 0.7 * 1.35, bell = Math.sin(Math.PI * clamp(k / 0.75, 0, 1));
        leg(K, sw, k < 0.1 ? 0.45 : 0.22, -0.4 * bell); leg(S, -0.28 - 0.12 * bell, 0.32 + 0.1 * bell);
        hips.rotation.set(0, sg * 0.32 * bell, 0); torso.rotation.set(0, -sg * 0.55 * bell, 0.14 * bell - 0.1 * (1 - bell)); body.rotation.z = -0.08 * (1 - bell);
        arm(S, 0.95 * bell - 0.15, 0.55, 0.75); arm(K, -0.75 * bell - 0.1, 0.25 + 0.85 * bell, 0.45); hipAdd = 0.04 * bell;
      }
      if ((header || pre > 0 || drop > 0) && !(p.head > 0)) { // 뛰어오른 자세: 오르는 동안 몸을 뒤로 젖혔다가, 머리로 넘긴 뒤엔 앞으로 숙이며 내려온다
        mode = 7; fade = 0.07; const j = header ? Math.cos(Math.min(1, kickA / 0.85) * Math.PI / 2) : Math.max(pre, drop), nod = header ? Math.min(1, kickA / 0.25) : 0;
        hipAdd = 0.42 * j; floorY = HIP_Y - 0.03; leg(0, -0.25 * j, 0.25 + 0.5 * j, -0.3); leg(1, 0.15 * j, 0.3 + 0.6 * j, -0.3);
        torso.rotation.set(0, 0, header ? 0.2 - 0.6 * nod : drop > 0 ? 0.22 * drop : 0.2 * pre); head.rotation.z = header ? 0.15 - 0.55 * nod : 0.12 * Math.max(pre, drop);
        arm(0, -0.5 * j, 0.3 + 0.5 * j, 0.9); arm(1, -0.5 * j, 0.3 + 0.5 * j, 0.9);
      }
      if (p.lunge > 0 && kickA < 0 && !p.cele) { // 스탠딩 태클: 차는 발을 낮게 쭉 뻗고 디딤발을 깊이 굽힌다. 헛디뎠으면(stun) 그대로 앞으로 쏠린다
        mode = 13; fade = 0.05; const k = 1 - Math.min(1, p.lunge / 0.34), e = Math.sin(Math.PI * Math.min(1, 0.25 + k * 0.85)), miss = p.stun > 0 ? 1 : 0;
        leg(K, 1.2 * e, 0.06, 0.4 * e); leg(S, -0.4 * e, 0.25 + 0.8 * e, -0.25 * e);
        body.rotation.z = -0.1 * e - 0.16 * miss * e; hips.rotation.set(0, sg * 0.3 * e, 0); torso.rotation.set(0, -sg * 0.25 * e, 0.12 * e - 0.3 * miss * e);
        arm(S, 0.7 * e, 0.75, 0.6); arm(K, -0.75 * e, 0.85, 0.4);
      }
      if (p.head > 0 && !p.cele) { // 다이빙 헤딩: 몸을 앞으로 던져 수평으로 날고(0~0.3초) 가슴으로 떨어진 뒤 일어난다
        mode = 14; fade = 0.06; manual = true; const k = 1 - Math.min(1, p.head / 0.7), sm = (x: number) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
        const fly = sm(k / 0.14), up = sm((k - 0.66) / 0.34), pitch = -1.3 * fly * (1 - up);
        hips.rotation.set(0, 0, pitch); hips.position.y = k < 0.66 ? 1.22 - 0.9 * Math.pow(k / 0.66, 1.7) : 0.32 + (HIP_Y - 0.32) * up; body.rotation.z = 0; body.position.x = 0.45 * Math.sin(Math.PI * Math.min(1, k / 0.9));
        torso.rotation.set(0, 0, 0.1 * fly * (1 - up)); head.rotation.z = 0.75 * fly * (1 - up);
        leg(0, -0.25 + 1.0 * up * (1 - up) * 4 * 0.3, 0.3 + 0.9 * up * (1 - up) * 4 * 0.5, -0.5); leg(1, 0.1 + 0.9 * up * (1 - up) * 4 * 0.3, 0.45 + 0.8 * up * (1 - up) * 4 * 0.5, -0.5);
        for (const i of [0, 1]) arm(i, 2.0 * fly * (1 - up) + 0.2, 0.55, 0.25 + 0.5 * up);
      }
      if (p.raise) { // 심판: 카드(깃발)를 든 오른팔을 곧게 올린다
        mode = 15; fade = 0.12; const e = p.raise; arm(1, 0.2 + 2.95 * e, 0.06, 0.12 * (1 - e)); arm(0, -0.05, 0.1, 0.2); torso.rotation.z += 0.06 * e;
      }
      if (hold || thrown) { // 스로인: 공을 머리 위로 든 자세, 던진 직후엔 두 팔을 앞으로 뿌린다
        mode = hold ? 8 : 9; fade = 0.06; const k = hold ? 0 : Math.min(1, kickA / 0.35), sw2 = 3.35 - k * 2.1 + (hold ? Math.sin(tGlobal * 3) * 0.04 : 0);
        arm(0, sw2, 0.14, 0.35 - k * 0.2); arm(1, sw2, 0.14, 0.35 - k * 0.2);
        torso.rotation.set(0, 0, 0.18 - k * 0.55); leg(0, 0.22 + k * 0.1, 0.25, 0.1); leg(1, -0.3 + k * 0.15, 0.35, 0.1); body.rotation.z = 0; hips.rotation.set(0, 0, 0); hipAdd = 0;
      }
      if (gk && !p.cele) {
        if (gkHold) { // 손에 든 공: 가슴 앞에 안는다 (높이 잡았으면 팔이 위에서 내려온다)
          mode = 11; fade = 0.08; const up = clamp((bz - 1.16) * 1.5, 0, 2.3), w = Math.min(1, up);
          for (const i of [0, 1]) arm(i, 0.3 + up * 1.15, -0.22 + 0.2 * w, 1.25 - 0.35 * w); torso.rotation.z = -0.06 + 0.12 * w; hipAdd = 0.3 * clamp((bz - 1.9) / 0.9, 0, 1); if (hipAdd > 0) floorY = HIP_Y - 0.03;
        } else if (!own && !ball.owner && bz > 1.5 && bq < 3.2 && mode === 0) { // 뜬 공 잡으러: 두 팔을 뻗고 뛰어오른다
          mode = 12; fade = 0.1; const rc = clamp(1 - (bq - 1.1) / 2.1, 0, 1), j = rc * clamp((bz - 1.8) / 0.8, 0, 1);
          for (const i of [0, 1]) arm(i, 0.9 + 2.1 * rc, 0.12, 0.55 - 0.4 * rc); torso.rotation.z = 0.1 * rc; head.rotation.z = 0.25 * rc; hipAdd = 0.4 * j; if (j > 0) { floorY = HIP_Y - 0.03; leg(0, -0.2 * j, 0.3 + 0.4 * j, -0.3); leg(1, 0.2 * j, 0.3 + 0.5 * j, -0.3); }
        } else if (a < 0.5 && !own && mode === 0) { // 준비 자세
          mode = 10; leg(0, 0.25, 0.6, 0.08, 0.16); leg(1, 0.25, 0.6, 0.08, 0.16); arm(0, 0.8, 0.9, 1.4); arm(1, 0.8, 0.9, 1.4); torso.rotation.set(0, 0, -0.35); const z = Math.sin(tGlobal * 6 + p.i); shin[0].rotation.z -= 0.08 * Math.max(0, z); shin[1].rotation.z -= 0.08 * Math.max(0, -z);
        }
      }
      if (p.stun > 0) { body.rotation.x += Math.sin(p.stun * 22) * 0.12; torso.rotation.z -= 0.22 * Math.min(1, p.stun / 0.25); }
      // 골반 높이: 더 펴진 다리의 발이 땅에 닿게. 달릴 땐 두 발이 다 뜨는 구간만큼 올라간다
      const dropOf = (i: number) => THIGH * Math.cos(thigh[i].rotation.z) * Math.cos(thigh[i].rotation.x) + SHIN * Math.cos(thigh[i].rotation.z + shin[i].rotation.z);
      const gnd = Math.max(dropOf(0), dropOf(1)) + 0.014, fly = HIP_Y - 0.05 + (0.05 + 0.035 * u) * stride * (0.5 - 0.5 * Math.cos(2 * ph - 0.6));
      if (!manual) hips.position.y = Math.max(gnd + Math.max(0, fly - gnd) * a, floorY) + hipAdd;
      // 머리: 공 쪽을 본다 (몸이 숙인 만큼 고개를 든다)
      const ang = Math.atan2(ball.y - p.y, ball.x - p.x) - p.dir; const rel = clamp(((ang + Math.PI * 3) % TAU) - Math.PI, -1.2, 1.2);
      if (cut) L.look = rel; else L.look += (rel - L.look) * (1 - Math.exp(-dt * 9));
      head.rotation.y = -L.look * 0.75 - torso.rotation.y - hips.rotation.y; if (mode !== 14) head.rotation.z += -torso.rotation.z * 0.55; torso.rotation.y += -L.look * 0.22 * idle;
    }
    // 자세가 바뀌는 순간은 앞 자세에서 섞어 넘긴다 (전엔 한 프레임에 뚝 바뀌었다)
    const B = this.bones, cur = this.cur, snap = this.snap, N = B.length;
    if (mode !== L.mode) { if (L.mode >= 0 && !cut) { snap.set(cur); L.mix = 0; L.dur = L.mode === 1 || L.mode === 2 ? 0.2 : fade; } L.mode = mode; }
    if (cut) L.mix = 1;
    let e = 1; if (L.mix < 1) { L.mix = Math.min(1, L.mix + dt / L.dur); e = L.mix * L.mix * (3 - 2 * L.mix); }
    for (let k = 0; k < N; k++) { const R = B[k].rotation, j = k * 3; let x = R.x, y = R.y, z = R.z; if (e < 1) { x = snap[j] + (x - snap[j]) * e; y = snap[j + 1] + (y - snap[j + 1]) * e; z = snap[j + 2] + (z - snap[j + 2]) * e; R.set(x, y, z); } cur[j] = x; cur[j + 1] = y; cur[j + 2] = z; }
    { let hy = hips.position.y, bx = body.position.x, bzz = body.position.z; if (e < 1) { hy = snap[42] + (hy - snap[42]) * e; bx = snap[43] + (bx - snap[43]) * e; bzz = snap[44] + (bzz - snap[44]) * e; hips.position.y = hy; body.position.x = bx; body.position.z = bzz; } cur[42] = hy; cur[43] = bx; cur[44] = bzz; }
  }
}
