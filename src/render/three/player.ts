/* 로우폴리 휴머노이드 선수 모델 + 코드로 만든 애니메이션(절차적 포즈).
   로컬 좌표: 선수는 +X를 바라본다(그룹을 -dir 만큼 Y축 회전). 팔다리 스윙은 Z축 회전(+ = 앞으로), 옆 동작은 X축 회전.
   본 구조: root → hips → (thighL/R → shinL/R → footL/R), torso → (head, armL/R → foreL/R → handL/R) */
import * as THREE from 'three';
import type { Player } from '../../sim/types';
/** 포즈에 필요한 상태. 경기 중엔 Player 그대로, 리플레이 땐 버퍼에서 채운 객체 */
export interface PoseState { x: number; y: number; dir: number; vx: number; vy: number; run: number; kickCD: number; slide: number; dive: number; diveDir: number; stun: number; cele: boolean; role: string; i: number; kickWind: number; spin: number; feint: number; }
import type { Kit } from '../../data/teams';
import { kitTextures } from './textures';
import { clamp } from '../../sim/util';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();
function geo(key: string, mk: () => THREE.BufferGeometry) { let g = geoCache.get(key); if (!g) { g = mk(); geoCache.set(key, g); } return g; }
function mat(key: string, mk: () => THREE.Material) { let m = matCache.get(key); if (!m) { m = mk(); matCache.set(key, m); } return m; }
const lam = (color: string) => mat('l' + color, () => new THREE.MeshLambertMaterial({ color }));
/** 위쪽이 관절(피벗)이 되도록 아래로 내린 원기둥 */
function limbGeo(key: string, r0: number, r1: number, len: number) { return geo(key, () => { const g = new THREE.CylinderGeometry(r1, r0, len, 8); g.translate(0, -len / 2, 0); return g; }); }
function boxGeo(key: string, w: number, h: number, d: number) { return geo(key, () => new THREE.BoxGeometry(w, h, d)); }

const kitTexCache = new Map<string, { front: THREE.Texture; back: THREE.Texture }>();
function kitTex(kit: Kit, gk: boolean, num: number, name?: string) {
  const key = JSON.stringify([kit, gk, num, name ?? '']); let t = kitTexCache.get(key); if (!t) { t = kitTextures(kit, gk, num, name); kitTexCache.set(key, t); } return t;
}
const THIGH = 0.44, SHIN = 0.42, UARM = 0.28, FARM = 0.26, HIP_Y = 0.9;

export class PlayerModel {
  root = new THREE.Group();
  private hips = new THREE.Group(); private torso = new THREE.Group(); private head = new THREE.Group();
  private thigh: THREE.Group[] = []; private shin: THREE.Group[] = []; private foot: THREE.Mesh[] = [];
  private arm: THREE.Group[] = []; private fore: THREE.Group[] = [];
  private body = new THREE.Group(); // hips+torso를 함께 기울이거나 눕힐 때
  private hScale: number;
  private blob: THREE.Mesh;
  constructor(public p: Player, kit: Kit, blobTex: THREE.Texture, backName?: string) {
    const gk = p.role === 'GK', skin = lam(p.skin), hair = lam(p.hair);
    const shirt = gk ? kit.gk : kit.c1, shorts = gk ? '#1b1b1b' : kit.sh, sock = gk ? '#1b1b1b' : '#f4f4f4';
    this.hScale = 0.95 + ((p.i * 7 + p.t * 3) % 5) * 0.03; // 선수마다 키 차이 (1.66~1.86m)
    this.root.scale.setScalar(this.hScale);
    this.root.add(this.body); this.body.add(this.hips); this.hips.position.y = HIP_Y;
    // 골반
    const pelvis = new THREE.Mesh(boxGeo('pelvis', 0.22, 0.2, 0.34), lam(shorts)); pelvis.position.y = 0.04; pelvis.castShadow = true; this.hips.add(pelvis);
    // 몸통 (앞/뒤 텍스처)
    const kt = kitTex(kit, gk, p.num, backName);
    const tgeo = boxGeo('torso', 0.26, 0.5, 0.4);
    const side = lam(shirt);
    const tmats = [mat('kf' + JSON.stringify([kit, gk, p.num]), () => new THREE.MeshLambertMaterial({ map: kt.front })), mat('kb' + JSON.stringify([kit, gk, p.num, backName ?? '']), () => new THREE.MeshLambertMaterial({ map: kt.back })), side, lam(shorts), side, side];
    const torsoM = new THREE.Mesh(tgeo, tmats); torsoM.position.y = 0.25; torsoM.castShadow = true;
    this.torso.position.y = 0.12; this.hips.add(this.torso); this.torso.add(torsoM);
    // 머리
    const headM = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.115, 10, 8)), skin); headM.castShadow = true;
    const hairM = new THREE.Mesh(geo('hair', () => { const g = new THREE.SphereGeometry(0.122, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); return g; }), hair); hairM.position.y = 0.01; hairM.rotation.z = -0.25;
    const neck = new THREE.Mesh(limbGeo('neck', 0.045, 0.045, 0.08), skin); neck.position.y = 0.1;
    this.head.position.y = 0.62; this.head.add(headM, hairM, neck); this.torso.add(this.head);
    // 팔
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(0, 0.47, s * 0.235);
      const ua = new THREE.Mesh(limbGeo('uarm', 0.055, 0.045, UARM), lam(shirt)); ua.castShadow = true; a.add(ua);
      const f = new THREE.Group(); f.position.y = -UARM;
      const fa = new THREE.Mesh(limbGeo('farm', 0.045, 0.035, FARM), skin); fa.castShadow = true; f.add(fa);
      const hand = new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(0.045, 6, 5)), gk ? lam('#e8e8e8') : skin); hand.position.y = -FARM; f.add(hand);
      a.add(f); this.torso.add(a); this.arm.push(a); this.fore.push(f);
    }
    // 다리
    for (const s of [-1, 1]) {
      const t = new THREE.Group(); t.position.set(0, 0, s * 0.1);
      const th = new THREE.Mesh(limbGeo('thigh', 0.08, 0.065, THIGH), lam(shorts)); th.castShadow = true; t.add(th);
      const shortsCover = new THREE.Mesh(limbGeo('thighS', 0.085, 0.08, 0.2), lam(shorts)); t.add(shortsCover);
      const skinPart = new THREE.Mesh(limbGeo('thighK', 0.066, 0.06, 0.14), skin); skinPart.position.y = -0.31; t.add(skinPart);
      const sh = new THREE.Group(); sh.position.y = -THIGH;
      const shM = new THREE.Mesh(limbGeo('shin', 0.06, 0.045, SHIN), lam(sock)); shM.castShadow = true; sh.add(shM);
      const ft = new THREE.Mesh(boxGeo('foot', 0.26, 0.08, 0.11), lam('#141414')); ft.position.set(0.07, -SHIN + 0.04, 0); ft.castShadow = true; sh.add(ft);
      t.add(sh); this.hips.add(t); this.thigh.push(t); this.shin.push(sh); this.foot.push(ft);
    }
    // 그림자 없는 품질용 둥근 그림자
    this.blob = new THREE.Mesh(geo('blob', () => { const g = new THREE.CircleGeometry(0.42, 12); g.rotateX(-Math.PI / 2); return g; }), mat('blob', () => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.35, depthWrite: false })));
    this.blob.position.y = 0.01; this.root.add(this.blob);
  }
  setBlob(on: boolean) { this.blob.visible = on; }
  /** 상태로 포즈를 만든다. tGlobal은 연출용 시간 */
  update(p: PoseState, ball: { x: number; y: number; owner?: Player | null }, tGlobal: number) {
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
      let th0 = Math.sin(ph) * A, th1 = Math.sin(ph + Math.PI) * A, kn0 = knee(ph), kn1 = knee(ph + Math.PI);
      if (wind > 0) { th1 = -0.9 * (1 - wind * 0.3); kn1 = 1.1; th0 = -0.2; kn0 = 0.3; body.rotation.z = -0.08; }
      else if (p.feint > 0 && kickA < 0) { const f = Math.sin(tGlobal * 26); th0 = f * 0.5; th1 = -f * 0.5; kn0 = 0.6 + Math.max(0, f) * 0.5; kn1 = 0.6 + Math.max(0, -f) * 0.5; } // 헛다리
      else if (kickA >= 0) { // 킥: 오른발(1)이 뒤에서 앞으로 휘두른다
        const k = kickA, swing = k < 0.1 ? -0.9 : k < 0.45 ? -0.9 + (k - 0.1) / 0.35 * 2.2 : 1.3 - (k - 0.45) / 0.55 * 1.3;
        th1 = swing; kn1 = k < 0.2 ? 1.2 : 0.3; th0 = -0.25; kn0 = 0.35; body.rotation.z = -0.1;
      }
      legPose(0, th0, kn0, 0.1); legPose(1, th1, kn1, 0.1);
      torso.rotation.z = -(lean + (own ? 0.12 : 0));
      armPose(0, -Math.sin(ph) * A * 0.9, 0.25 * sideOf(0), 1.0 + 0.3 * stride); armPose(1, Math.sin(ph) * A * 0.9, 0.25 * sideOf(1), 1.0 + 0.3 * stride);
      if (p.role === 'GK' && !moving && !own) { legPose(0, 0.25, 0.6); legPose(1, 0.25, 0.6); armPose(0, 0.8, 0.9 * sideOf(0), 1.4); armPose(1, 0.8, 0.9 * sideOf(1), 1.4); torso.rotation.z = -0.35; hips.position.y = HIP_Y - 0.12; }
      hips.position.y += moving ? Math.abs(Math.cos(ph)) * 0.045 * stride : Math.sin(tGlobal * 2 + p.i) * 0.006;
      if (p.stun > 0) body.rotation.x = Math.sin(p.stun * 22) * 0.12;
      // 머리: 공 쪽을 본다
      const dx = ball.x - p.x, dy = ball.y - p.y, ang = Math.atan2(dy, dx) - p.dir; // 로컬 기준 각
      let rel = ((ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI; rel = clamp(rel, -1.1, 1.1);
      this.head.rotation.y = -rel * 0.8;
    }
  }
}
