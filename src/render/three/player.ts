/* 선수 모델(회전체로 만든 둥근 몸: 가슴·허리 굴곡이 있는 몸통, 근육 굴곡이 있는 팔다리, 얼굴 텍스처, 축구화) + 코드로 만든 애니메이션(절차적 포즈).
   로컬 좌표: 선수는 +X를 바라본다(그룹을 -dir 만큼 Y축 회전). 팔다리 스윙은 Z축 회전(+ = 앞으로), 옆 동작은 X축 회전.
   본 구조: root → hips → (thighL/R → shinL/R → footL/R), torso → (head, armL/R → foreL/R)
   키는 선수 데이터의 height, 체격(몸통·팔다리 굵기)은 몸싸움 능력치(str)를 따른다. 본마다 메시 하나(색은 정점 색)라 선수당 메시 16개 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Player } from '../../sim/types';
/** 포즈에 필요한 상태. 경기 중엔 Player 그대로, 리플레이 땐 버퍼에서 채운 객체 */
export interface PoseState { x: number; y: number; dir: number; vx: number; vy: number; run: number; kickCD: number; slide: number; dive: number; diveDir: number; stun: number; cele: boolean; role: string; i: number; kickWind: number; spin: number; feint: number; }
import type { Kit } from '../../data/teams';
import { kitTextures, faceTexture } from './textures';
import { clamp } from '../../sim/util';

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
const TORSO: [number, number][] = [[0.156, -0.04], [0.152, 0.05], [0.146, 0.14], [0.156, 0.22], [0.174, 0.3], [0.186, 0.38], [0.184, 0.44], [0.135, 0.495], [0.058, 0.535]];

export class PlayerModel {
  root = new THREE.Group();
  private hips = new THREE.Group(); private torso = new THREE.Group(); private head = new THREE.Group();
  private thigh: THREE.Group[] = []; private shin: THREE.Group[] = []; private foot: THREE.Mesh[] = [];
  private arm: THREE.Group[] = []; private fore: THREE.Group[] = [];
  private body = new THREE.Group(); // hips+torso를 함께 기울이거나 눕힐 때
  private hScale: number;
  private blob: THREE.Mesh;
  constructor(public p: Player, kit: Kit, blobTex: THREE.Texture, backName?: string) {
    const gk = p.role === 'GK', skin = p.skin, vc = vcMat();
    const shirt = gk ? kit.gk : kit.c1, shorts = gk ? '#1b1b1b' : kit.sh, sock = gk ? '#1b1b1b' : '#f4f4f4', band = gk ? kit.gk : kit.c1, boot = BOOTS[(p.i * 3 + p.t * 5 + p.num) % BOOTS.length];
    const cm = clamp(p.def?.height ?? 176 + ((p.i * 7 + p.t * 3) % 5) * 4, 160, 204); // 키: 선수 데이터, 없으면 번호로 조금씩 다르게
    this.hScale = cm / 100 / STAND;
    const bulk = clamp(1 + ((p.attrs?.str ?? 62) - 62) * 0.0042 + (gk ? 0.02 : 0), 0.93, 1.12), bq = Math.round(bulk * 50) / 50, B = (m: THREE.Mesh, k = 1.14) => { m.scale.set(bq * k, 1, bq * k); m.castShadow = true; return m; }; // k: 부위별 굵기 보정 (팔다리 1.14, 몸통 1.06) // 체격: 몸싸움 50 → 0.95배, 90 → 1.12배 (2% 단위)
    this.root.scale.setScalar(this.hScale);
    this.root.add(this.body); this.body.add(this.hips); this.hips.position.y = HIP_Y;
    // 골반 (바지 윗부분)
    this.hips.add(B(new THREE.Mesh(geo('pelvis', () => blobGeo(0.1, 0.135, 0.158, 0, 0.015, 0, 10, 7)), lam(shorts)), 1.08));
    // 몸통: 앞·뒤 반쪽 회전체에 유니폼 앞/뒤 텍스처 (등번호는 뒤)
    const kt = kitTex(kit, gk, p.num, backName);
    const half = (back: boolean) => geo(back ? 'torsoB' : 'torsoF', () => { const g = lathe(TORSO, 9, back ? Math.PI : 0, Math.PI); g.scale(0.6, 1, 1); g.computeVertexNormals(); return g; });
    const tf = B(new THREE.Mesh(half(false), mat('kf' + JSON.stringify([kit, gk, p.num]), () => new THREE.MeshLambertMaterial({ map: kt.front }))), 1.06);
    const tb = B(new THREE.Mesh(half(true), mat('kb' + JSON.stringify([kit, gk, p.num, backName ?? '']), () => new THREE.MeshLambertMaterial({ map: kt.back }))), 1.06);
    this.torso.position.y = 0.12; this.hips.add(this.torso); this.torso.add(tf, tb);
    // 머리: 얼굴 텍스처(눈·눈썹·코·입·머리선) + 머리카락 + 목·귀
    const style = (p.i * 5 + p.t * 3 + p.num) % 7; // 0~3 짧은 머리, 4·5 조금 긴 머리, 6 삭발
    const headM = new THREE.Mesh(geo('head', () => blobGeo(0.1, 0.125, 0.094, 0, 0, 0, 16, 12)), mat('face' + skin + p.hair + (style === 6), () => new THREE.MeshLambertMaterial({ map: faceTexture(skin, p.hair, style === 6) }))); headM.castShadow = true;
    const neck = new THREE.Mesh(merged('neck' + skin, () => [tint(lathe([[0.05, -0.2], [0.046, -0.13], [0.047, -0.06]], 8), skin), tint(blobGeo(0.016, 0.028, 0.013, -0.004, -0.004, 0.093, 5, 4), skin), tint(blobGeo(0.016, 0.028, 0.013, -0.004, -0.004, -0.093, 5, 4), skin)]), vc);
    this.head.position.y = HEAD_Y; this.head.add(headM, neck); this.torso.add(this.head);
    if (style !== 6) { const long = style >= 4; const hairM = new THREE.Mesh(geo('hair' + long, () => { const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * (long ? 0.56 : 0.47)); g.scale(0.106, long ? 0.137 : 0.132, 0.1); g.rotateZ(0.42); g.translate(-0.006, 0.004, 0); return g; }), lam(p.hair)); this.head.add(hairM); }
    // 팔: 어깨(소매) → 위팔 → 팔꿈치 / 아래팔 → 손 (키퍼는 긴소매 + 장갑)
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(0, 0.452, s * 0.214 * bq);
      a.add(B(new THREE.Mesh(merged('uarm' + shirt + skin + gk, () => [
        tint(lathe([[0.038, -UARM], [0.043, -0.2], [0.049, -0.1], [0.05, -0.02]], 8), gk ? shirt : skin),
        tint(lathe([[0.05, -0.15], [0.052, -0.08], [0.052, -0.01]], 8), shirt), tint(blobGeo(0.052, 0.056, 0.052, 0, -0.012, 0, 8, 6), shirt), tint(blobGeo(0.039, 0.039, 0.039, 0, -UARM, 0, 7, 5), gk ? shirt : skin)]), vc)));
      const f = new THREE.Group(); f.position.y = -UARM;
      f.add(B(new THREE.Mesh(merged('farm' + shirt + skin + gk, () => [
        tint(lathe([[0.029, -FARM], [0.036, -0.17], [0.042, -0.07], [0.039, 0]], 8), gk ? shirt : skin),
        gk ? tint(blobGeo(0.05, 0.068, 0.036, 0.01, -FARM - 0.05, 0, 7, 5), '#ececec') : tint(blobGeo(0.033, 0.05, 0.022, 0.006, -FARM - 0.04, 0, 6, 5), skin)]), vc)));
      a.add(f); this.torso.add(a); this.arm.push(a); this.fore.push(f);
    }
    // 다리: 허벅지(바지 자락 + 맨살 + 무릎) / 종아리(스타킹, 위에 유니폼 색 띠) / 축구화
    for (const s of [-1, 1]) {
      const t = new THREE.Group(); t.position.set(0, 0, s * 0.098 * bq);
      t.add(B(new THREE.Mesh(merged('thigh' + shorts + skin, () => [
        tint(lathe([[0.05, -THIGH], [0.056, -0.36], [0.07, -0.22], [0.082, -0.08], [0.08, 0]], 9), skin), tint(blobGeo(0.054, 0.058, 0.054, 0.006, -THIGH, 0, 8, 6), skin),
        tint(lathe([[0.097, -0.25], [0.098, -0.14], [0.094, -0.02], [0.08, 0.04]], 9), shorts)]), vc)));
      const sh = new THREE.Group(); sh.position.y = -THIGH;
      sh.add(B(new THREE.Mesh(merged('shin' + sock + band, () => { const c = lathe([[0.034, -SHIN], [0.039, -0.33], [0.055, -0.19], [0.059, -0.12], [0.052, -0.045]], 9); c.translate(-0.008, 0, 0); return [tint(c, sock), tint(lathe([[0.054, -0.085], [0.055, -0.04]], 9).translate(-0.006, 0, 0), band)]; }), vc)));
      const ft = new THREE.Mesh(merged('boot' + boot, () => [tint(blobGeo(0.128, 0.05, 0.05, 0.012, 0, 0, 10, 6), boot), tint(blobGeo(0.05, 0.062, 0.046, -0.072, 0.02, 0, 7, 5), boot), tint(new THREE.BoxGeometry(0.235, 0.018, 0.082).translate(0.008, -0.042, 0), '#0b0b0d')]), vc);
      ft.position.set(0.062, -SHIN + 0.048, 0); ft.castShadow = true; sh.add(ft);
      t.add(sh); this.hips.add(t); this.thigh.push(t); this.shin.push(sh); this.foot.push(ft);
    }
    // 그림자 없는 품질용 둥근 그림자
    this.blob = new THREE.Mesh(geo('blob', () => { const g = new THREE.CircleGeometry(0.42, 12); g.rotateX(-Math.PI / 2); return g; }), mat('blob', () => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.35, depthWrite: false })));
    this.blob.position.y = 0.01; this.root.add(this.blob);
  }
  setBlob(on: boolean) { this.blob.visible = on; }
  /** 상태로 포즈를 만든다. tGlobal은 연출용 시간 */
  update(p: PoseState, ball: { x: number; y: number; z?: number; vx?: number; vy?: number; owner?: Player | null; passTarget?: unknown; kicker?: unknown }, tGlobal: number) {
    const r = this.root;
    r.position.set(p.x, 0, p.y); r.rotation.set(0, -p.dir, 0);
    const sp = Math.hypot(p.vx, p.vy), moving = sp > 0.6, stride = moving ? clamp(sp / 8, 0.45, 1.25) : 0;
    const ph = p.run * 2.6, sw = Math.sin(ph) * stride;
    const own = !!ball.owner && (ball.owner as PoseState) === p;
    const kickA = p.kickCD > 0 ? (0.3 - p.kickCD) / 0.3 : -1; // 0→1 킥 진행
    const wind = p.kickWind > 0 ? Math.min(1, p.kickWind / 0.1) : 0; // 와인드업: 발을 뒤로
    const body = this.body, hips = this.hips, torso = this.torso;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0); hips.position.y = HIP_Y; torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    const legPose = (i: number, thighA: number, kneeA: number, footA = 0) => { this.thigh[i].rotation.set(0, 0, thighA); this.shin[i].rotation.set(0, 0, -kneeA); this.foot[i].rotation.set(0, 0, footA); };
    const armPose = (i: number, swing: number, xrot: number, elbow: number) => { this.arm[i].rotation.set(xrot, 0, swing); this.fore[i].rotation.set(0, 0, elbow); };
    const sideOf = (i: number) => (i === 0 ? 1 : -1); // X축 회전 부호: 양수면 왼팔(i=0)이 바깥으로
    const ds = p.diveDir * (Math.cos(p.dir) >= 0 ? 1 : -1); // 다이브 방향을 로컬 z 부호로
    if (p.slide > 0) { // 슬라이딩: 뒤로 누워 한 발 앞으로
      body.rotation.z = 1.2; hips.position.y = 0.35; body.position.x = -0.2;
      legPose(0, 1.5, 0.1); legPose(1, 0.9, 1.4); armPose(0, 2.2, 0.6 * sideOf(0), 0.3); armPose(1, -0.6, 0.6 * sideOf(1), 0.5); torso.rotation.z = 0.2;
    } else if (p.dive > 0) { // 키퍼 다이브: 옆으로 몸을 던짐
      const k = Math.min(1, (0.5 - p.dive) / 0.18);
      body.rotation.x = ds * 1.35 * k; hips.position.y = HIP_Y - 0.45 * k; body.position.z = ds * 0.4 * k;
      legPose(0, 0.3, 0.3); legPose(1, -0.2, 0.6); armPose(0, 0.2, -ds * 2.0, 0.2); armPose(1, 0.2, -ds * 2.0, 0.2);
    } else if (p.cele) { // 세리머니: 두 팔 들고 깡충
      const j = Math.abs(Math.sin(tGlobal * 7)); hips.position.y = HIP_Y + j * 0.18;
      legPose(0, sw * 0.6, 0.3 + j * 0.3); legPose(1, -sw * 0.6, 0.3 + j * 0.3); armPose(0, 0.2, 2.9 * sideOf(0), 0.4); armPose(1, 0.2, 2.9 * sideOf(1), 0.4);
    } else {
      // 달리기/걷기 사이클
      const A = 0.75 * stride, lean = clamp(sp / 8, 0, 1) * 0.22;
      const knee = (phase: number) => 0.18 + 1.0 * Math.max(0, Math.cos(phase)) * stride + (stride ? 0.15 : 0);
      const bz = ball.z ?? 0, outside = p.y < -0.2 || p.y > 68.2;
      const header = kickA >= 0 && kickA < 0.85 && ball.kicker === p && bz > 1.1 && !outside; // 방금 머리로 받아 넘긴 공이 아직 떠 있다 → 헤딩 뒤 내려오는 중
      // 공중볼 맞이: 나한테 오는 뜬 공이 0.3초 안에 닿는다 → 미리 뛰어올라 닿는 순간이 꼭대기 (전엔 공이 떠난 뒤에야 뛰었다)
      let pre = 0; if (ball.passTarget === p && !ball.owner && bz > 1.4 && bz < 3.6) { const q = Math.hypot(ball.x - p.x, ball.y - p.y), tA = Math.max(0, q - 0.7) / Math.max(6, Math.hypot(ball.vx ?? 0, ball.vy ?? 0)); if (tA < 0.3) pre = 1 - (tA / 0.3) ** 2; }
      const drop = own && !outside && bz > 0.2 ? Math.min(1, bz / 2.2) : 0; // 머리·가슴으로 떨군 공이 발밑으로 내려오는 동안
      let th0 = Math.sin(ph) * A, th1 = Math.sin(ph + Math.PI) * A, kn0 = knee(ph), kn1 = knee(ph + Math.PI);
      if (wind > 0) { th1 = -0.9 * (1 - wind * 0.3); kn1 = 1.1; th0 = -0.2; kn0 = 0.3; body.rotation.z = -0.08; }
      else if (p.feint > 0 && kickA < 0) { const f = Math.sin(tGlobal * 26); th0 = f * 0.5; th1 = -f * 0.5; kn0 = 0.6 + Math.max(0, f) * 0.5; kn1 = 0.6 + Math.max(0, -f) * 0.5; } // 헛다리
      else if (kickA >= 0 && !header) { // 킥: 공이 떠나는 순간(kickA 0) 발은 이미 공에 닿아 있고, 그 뒤로 휘둘러 올린다. 뒤로 젖히는 건 와인드업(wind)에서 한다
        const k = kickA, swing = k < 0.3 ? 0.2 + k / 0.3 * 1.1 : 1.3 - (k - 0.3) / 0.7 * 1.3;
        th1 = swing; kn1 = k < 0.1 ? 0.45 : 0.25; th0 = -0.25; kn0 = 0.35; body.rotation.z = -0.1;
      }
      legPose(0, th0, kn0, 0.1); legPose(1, th1, kn1, 0.1);
      torso.rotation.z = -(lean + (own ? 0.12 : 0));
      armPose(0, -Math.sin(ph) * A * 0.9, 0.25 * sideOf(0), 1.0 + 0.3 * stride); armPose(1, Math.sin(ph) * A * 0.9, 0.25 * sideOf(1), 1.0 + 0.3 * stride);
      if (header || pre > 0 || drop > 0) { // 뛰어오른 자세: 오르는 동안 몸을 뒤로 젖혔다가, 머리로 넘긴 뒤엔 앞으로 숙이며 내려온다
        const j = header ? Math.cos(Math.min(1, kickA / 0.85) * Math.PI / 2) : Math.max(pre, drop), nod = header ? Math.min(1, kickA / 0.25) : 0;
        hips.position.y += 0.42 * j; legPose(0, -0.25 * j, 0.25 + 0.5 * j, 0.3); legPose(1, 0.15 * j, 0.3 + 0.6 * j, 0.3);
        torso.rotation.z = header ? 0.2 - 0.6 * nod : drop > 0 ? 0.22 * drop : 0.2 * pre; this.head.rotation.z = header ? 0.15 - 0.55 * nod : 0.12 * Math.max(pre, drop);
        armPose(0, -0.5 * j, (0.3 + 0.5 * j) * sideOf(0), 0.9); armPose(1, -0.5 * j, (0.3 + 0.5 * j) * sideOf(1), 0.9);
      }
      // 스로인: 공을 머리 위로 든 자세(공 주인인데 공이 1.6m 위), 던진 직후엔 두 팔을 앞으로 뿌린다(터치라인 밖에서 찬 직후)
      const hold = own && bz > 1.6 && outside, thrown = !hold && kickA >= 0 && outside; // 터치라인 밖에서만 (뜬 공을 떨궈 잡는 순간에도 공이 1.6m 위다)
      if (hold || thrown) {
        const k = hold ? 0 : Math.min(1, kickA / 0.35), sw2 = 3.35 - k * 2.1 + (hold ? Math.sin(tGlobal * 3) * 0.04 : 0);
        armPose(0, sw2, 0.14 * sideOf(0), 0.35 - k * 0.2); armPose(1, sw2, 0.14 * sideOf(1), 0.35 - k * 0.2);
        torso.rotation.z = 0.18 - k * 0.55; legPose(0, 0.22 + k * 0.1, 0.25, 0.1); legPose(1, -0.3 + k * 0.15, 0.35, 0.1); body.rotation.z = 0;
      }
      if (p.role === 'GK' && !moving && !own) { legPose(0, 0.25, 0.6); legPose(1, 0.25, 0.6); armPose(0, 0.8, 0.9 * sideOf(0), 1.4); armPose(1, 0.8, 0.9 * sideOf(1), 1.4); torso.rotation.z = -0.35; hips.position.y = HIP_Y - 0.12; }
      hips.position.y += moving ? Math.abs(Math.cos(ph)) * 0.045 * stride : Math.sin(tGlobal * 5.2 + p.i * 1.3) * 0.016; // 서 있을 때도 발을 구르듯 살짝 들썩인다
      if (p.stun > 0) body.rotation.x = Math.sin(p.stun * 22) * 0.12;
      // 머리: 공 쪽을 본다
      const dx = ball.x - p.x, dy = ball.y - p.y, ang = Math.atan2(dy, dx) - p.dir; // 로컬 기준 각
      let rel = ((ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI; rel = clamp(rel, -1.1, 1.1);
      this.head.rotation.y = -rel * 0.8;
    }
  }
}
