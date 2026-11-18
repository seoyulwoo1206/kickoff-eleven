/* Three.js 렌더러. 시뮬 좌표 (x, y, z높이) → 월드 (x, z높이→Y, y→Z).
   중계 카메라(tv)는 가까운 터치라인 쪽(+Z) 위에서 공을 따라간다. pro = 조작 선수 뒤, top = 위에서 */
import * as THREE from 'three';
import { W, H, CX, CY } from '../../sim/consts';
import { clamp } from '../../sim/util';
import type { Sim, Player } from '../../sim/types';
import type { IRenderer, Quality, CamMode } from '../types';
import { buildStadium, updateNets, tintCrowd, type Stadium } from './stadium';
import { PlayerModel, type PoseState } from './player';
import { ballTexture, puffTexture, ringTexture } from './textures';
import { opts } from '../../options';
import { displayName, shirtName } from '../../data/squads';
import { backTarget } from '../../sim/human';
import { setPreview } from '../../sim/ball';
import { XT, drawMap } from '../../xt/view';

interface Puff { sp: THREE.Sprite; vx: number; vz: number; life: number; t: number; }
const SUN_L = Math.hypot(30, 95, 45); // 해 방향 벡터 길이
const PF = 17, BF = 6; // 리플레이 프레임: 선수당 17값, 공 6값
const CELE_T = 2.7; // 골 뒤 세리머니 클로즈업 길이(초). 그 뒤 리플레이 — match.ts goal()의 phaseT와 맞출 것
interface Frame { t: number; P: Float32Array; B: Float32Array; }
const ELEV = 0.5; // 중계 카메라 올려다보는 각 (rad)
export class ThreeRenderer implements IRenderer {
  cam = { x: CX, y: CY, shake: 0, z: 1 };
  cw = 0; ch = 0; fps = 60;
  private dpr = 1; private ins = { t: 0, r: 0, b: 0, l: 0 };
  private gl: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight; private stadium!: Stadium; private quality: Quality = 'mid'; private mode: CamMode = 'tv';
  private models = new Map<Player, PlayerModel>(); private modelSim: Sim | null = null; private namesMode = opts.names;
  private ball: THREE.Mesh; private ballShadow: THREE.Mesh; private rings: THREE.Mesh[] = [];
  private puffs: Puff[] = []; private puffTex: THREE.Texture; private blobTex: THREE.Texture;
  private ov: CanvasRenderingContext2D; private view = 1.35; private lead = 0; private wide = 0; private spB = 0; private lastPhase = ''; private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(CX, 0, CY);
  private tmpV = new THREE.Vector3(); private shk = { x: 0, y: 0 }; private crowdT = 0;
  // 골 리플레이: 최근 4초를 링버퍼에 담아두고 골 1.3초 뒤부터 0.55배속으로 보여준다
  private celeCam = false; // 세리머니 클로즈업 중
  private frames: Frame[] = []; private goalAt = -1; private replay = false; private replayT = 0; private pose: PoseState[] = []; private rBall = { x: 0, y: 0, z: 0, vx: 0, vy: 0, owner: null as Player | null };
  constructor(public cv: HTMLCanvasElement, private insetEl: HTMLElement, private ovCv: HTMLCanvasElement, quality: Quality) {
    this.gl = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace; this.gl.toneMapping = THREE.ACESFilmicToneMapping; this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1500);
    this.scene.fog = new THREE.Fog(0x1b3352, 160, 520);
    const hemi = new THREE.HemisphereLight(0xb9cbe6, 0x25351f, 0.75); this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.9); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 30; sc.bottom = -30; sc.near = 20; sc.far = 220; this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.ov = ovCv.getContext('2d')!;
    this.puffTex = puffTexture(); this.blobTex = puffTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55 })); this.ball.castShadow = true; this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, opacity: 0.45, depthWrite: false })); this.scene.add(this.ballShadow);
    const ringTex = ringTexture();
    for (const col of ['#ffb627', '#4fd3ff']) { const r = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, color: col, transparent: true, depthWrite: false })); r.position.y = 0.02; r.visible = false; this.scene.add(r); this.rings.push(r); }
    for (let i = 0; i < 70; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false })); sp.visible = false; this.scene.add(sp); this.puffs.push({ sp, vx: 0, vz: 0, life: 1, t: 2 }); }
    this.setQuality(quality);
  }
  setQuality(q: Quality) {
    this.quality = q;
    this.dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.5 : 1); this.gl.setPixelRatio(this.dpr);
    const shadows = q !== 'low'; this.gl.shadowMap.enabled = shadows; this.sun.castShadow = shadows;
    const sz = q === 'high' ? 2048 : 1024; if (this.sun.shadow.mapSize.width !== sz) { this.sun.shadow.mapSize.set(sz, sz); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    if (this.stadium) { this.scene.remove(this.stadium.group); }
    this.stadium = buildStadium(q); this.scene.add(this.stadium.group); if (this.modelSim) tintCrowd(this.stadium, this.modelSim.M.kit[0].c1, this.modelSim.M.kit[1].c1);
    for (const m of this.models.values()) m.setBlob(!shadows);
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }
  setView(v: number) { this.view = clamp(v, 1, 2.4); }
  setCamMode(m: CamMode) { this.mode = m; if (m === 'intro') { this.camPos.set(CX + 40, 36, CY + 88); this.camLook.set(CX, 1, CY); } }
  resize() {
    const r = this.cv.getBoundingClientRect(); this.cw = r.width; this.ch = r.height;
    this.gl.setSize(this.cw, this.ch, false); this.camera.aspect = this.cw / this.ch; this.camera.updateProjectionMatrix();
    const od = Math.min(window.devicePixelRatio || 1, 2); this.ovCv.width = Math.round(this.cw * od); this.ovCv.height = Math.round(this.ch * od); this.ov.setTransform(od, 0, 0, od, 0, 0);
    const cs = getComputedStyle(this.insetEl);
    this.ins = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  reset() { for (const q of this.puffs) { q.sp.visible = false; q.t = 2; } this.cam.x = CX; this.cam.y = CY; this.cam.z = 1; this.lead = 0; this.spB = 0; this.lastPhase = ''; this.frames.length = 0; this.goalAt = -1; this.replay = false; }
  private pushFrame(sim: Sim, perf: number) {
    const n = sim.players.length; let f = this.frames.length > 260 ? this.frames.shift()! : { t: 0, P: new Float32Array(n * PF), B: new Float32Array(BF) };
    if (f.P.length !== n * PF) f = { t: 0, P: new Float32Array(n * PF), B: new Float32Array(BF) };
    f.t = perf; sim.players.forEach((p, i) => { const k = i * PF; f.P[k] = p.x; f.P[k + 1] = p.y; f.P[k + 2] = p.dir; f.P[k + 3] = p.vx; f.P[k + 4] = p.vy; f.P[k + 5] = p.run; f.P[k + 6] = p.kickCD; f.P[k + 7] = p.slide; f.P[k + 8] = p.dive; f.P[k + 9] = p.diveDir; f.P[k + 10] = p.stun; f.P[k + 11] = p.cele ? 1 : 0; f.P[k + 12] = p.kickWind; f.P[k + 13] = p.spin; f.P[k + 14] = p.feint; f.P[k + 15] = p.lunge; f.P[k + 16] = p.head; });
    const b = sim.ball; f.B[0] = b.x; f.B[1] = b.y; f.B[2] = b.z; f.B[3] = b.vx; f.B[4] = b.vy; f.B[5] = b.owner ? sim.players.indexOf(b.owner) : -1;
    this.frames.push(f);
  }
  /** 버퍼에서 시각 t의 상태를 pose/rBall에 채운다 (두 프레임 사이 보간) */
  private loadFrame(sim: Sim, t: number) {
    const fr = this.frames; if (!fr.length) return false;
    let j = fr.length - 1; while (j > 0 && fr[j - 1].t > t) j--; const b = fr[j], a = fr[Math.max(0, j - 1)];
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    if (this.pose.length !== sim.players.length) this.pose = sim.players.map(p => ({ x: 0, y: 0, dir: 0, vx: 0, vy: 0, run: 0, kickCD: 0, slide: 0, dive: 0, diveDir: 0, stun: 0, cele: false, role: p.role, i: p.i, kickWind: 0, spin: 0, feint: 0, lunge: 0, head: 0 }));
    const L = (i: number) => a.P[i] + (b.P[i] - a.P[i]) * f;
    this.pose.forEach((q, i) => { const k = i * PF; q.x = L(k); q.y = L(k + 1); let da = b.P[k + 2] - a.P[k + 2]; da = ((da % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; q.dir = a.P[k + 2] + da * f; q.vx = b.P[k + 3]; q.vy = b.P[k + 4]; q.run = L(k + 5); q.kickCD = b.P[k + 6]; q.slide = b.P[k + 7]; q.dive = b.P[k + 8]; q.diveDir = b.P[k + 9]; q.stun = b.P[k + 10]; q.cele = b.P[k + 11] > 0; q.kickWind = b.P[k + 12]; q.spin = b.P[k + 13]; q.feint = b.P[k + 14]; q.lunge = b.P[k + 15]; q.head = b.P[k + 16]; });
    const rb = this.rBall; rb.x = a.B[0] + (b.B[0] - a.B[0]) * f; rb.y = a.B[1] + (b.B[1] - a.B[1]) * f; rb.z = a.B[2] + (b.B[2] - a.B[2]) * f; rb.vx = b.B[3]; rb.vy = b.B[4]; rb.owner = b.B[5] >= 0 ? sim.players[b.B[5]] : null;
    return true;
  }
  puff(x: number, y: number, n: number, sp: number) {
    for (let i = 0; i < n; i++) {
      const q = this.puffs.find(q => !q.sp.visible); if (!q) return;
      const a = Math.random() * Math.PI * 2, v = Math.random() * sp;
      q.sp.position.set(x, 0.15, y); q.vx = Math.cos(a) * v; q.vz = Math.sin(a) * v; q.life = 0.45 + Math.random() * 0.4; q.t = 0; q.sp.visible = true;
    }
  }
  private syncModels(sim: Sim) {
    if (this.modelSim === sim && this.namesMode === opts.names) { // 교체로 선수가 바뀌었으면 그 모델만 다시 만든다 (전엔 나간 선수의 등번호·모습 그대로였다)
      for (const p of sim.players) { const m = this.models.get(p); if (m && m.key !== PlayerModel.keyOf(p)) { this.scene.remove(m.root); const n = new PlayerModel(p, sim.M.kit[p.t], this.blobTex, shirtName(p, opts.names)); n.setBlob(this.quality === 'low'); this.scene.add(n.root); this.models.set(p, n); } }
      return; }
    for (const m of this.models.values()) this.scene.remove(m.root); this.models.clear();
    for (const p of sim.players) { const m = new PlayerModel(p, sim.M.kit[p.t], this.blobTex, shirtName(p, opts.names)); m.setBlob(this.quality === 'low'); this.scene.add(m.root); this.models.set(p, m); }
    this.modelSim = sim; this.namesMode = opts.names; tintCrowd(this.stadium, sim.M.kit[0].c1, sim.M.kit[1].c1);
  }
  /** 월드 → 화면 좌표 (오버레이용) */
  private toScreen(x: number, y: number, z = 0) { // 시뮬 (x, y, 높이) → 화면. 월드는 (x, 높이, y)
    const v = this.tmpV.set(x, z, y).project(this.camera);
    return { x: (v.x + 1) / 2 * this.cw + this.shk.x, y: (1 - v.y) / 2 * this.ch + this.shk.y, on: v.z < 1 && v.z > -1 };
  }
  private updateCamera(sim: Sim | null, dtR: number, perf: number) {
    const cam = this.cam, ball = sim?.ball;
    const zt = sim && sim.M.phase === 'goal' ? 1.3 : sim && ball && ball.isShot && !ball.owner ? 1.08 : 1;
    cam.z += (zt - cam.z) * (1 - Math.pow(zt > cam.z ? 0.03 : 0.3, dtR));
    const aspect = this.cw / Math.max(1, this.ch);
    // 시야: 기본 폭 × 시야 배율(view). 공이 중원에 있을 땐 10% 더 넓게(전개를 본다), 골 앞에선 원래대로
    const midT = sim && ball && sim.M.phase !== 'goal' ? 1 - clamp((Math.abs(ball.x - CX) - 18) / 22, 0, 1) : 0; this.wide += (midT - this.wide) * (1 - Math.pow(0.35, dtR));
    // 코너킥: 차기 전엔 코너와 박스가 한 화면에 들어오게 넓히고 박스 쪽을 본다 (전엔 공만 비춰 박스 안 동료가 안 보였다). 차고 나면 1초쯤에 걸쳐 원래대로
    const corner = !!sim && !!ball && sim.M.spType === 'corner' && !!ball.owner && (sim.M.phase === 'setpiece' || sim.M.phase === 'live') && (ball.x < 3 || ball.x > W - 3) && (ball.y < 3 || ball.y > H - 3);
    this.spB += ((corner ? 1 : 0) - this.spB) * (1 - Math.pow(corner ? 0.01 : 0.25, dtR));
    const VW = (this.cw < 600 ? 30 : aspect > 1.9 ? 34 : 38) * Math.max(this.view, 1.35 * this.spB) * (1 + 0.1 * this.wide) * (1 + 0.2 * this.spB) / cam.z; // 화면에 보이는 가로 폭 (m)
    const L = VW / (2 * Math.tan(this.camera.fov * Math.PI / 360) * aspect); // 그 폭이 보이는 거리
    let tx: number, ty: number;
    if (!sim || !ball) { tx = CX + Math.sin(perf * 0.07) * 22; ty = CY + Math.cos(perf * 0.05) * 8; } else {
      // 공만 따라가지 않고 공을 가진 팀이 공격하는 쪽을 미리 보여 준다 (앞에 선 동료·수비 라인이 보이게)
      const pt = ball.owner ? ball.owner.t : ball.knock ? ball.knock.t : ball.lastTouch, tl = sim.M.phase === 'live' && (pt === 0 || pt === 1) ? (pt === 0 ? 1 : -1) * VW * 0.11 : 0;
      this.lead += (tl - this.lead) * (1 - Math.pow(0.3, dtR));
      tx = ball.x + ball.vx * 0.22 + this.lead; ty = ball.y + ball.vy * 0.18;
      if (this.spB > 0.01) { const bx = ball.x > CX || this.spB < 1 && cam.x > CX ? W - 14 : 14, by = CY + (ball.y - CY) * 0.4; tx += (bx - tx) * this.spB; ty += (by - ty) * this.spB; }
    }
    const vh = VW / aspect * 1.5;
    // 카메라는 비스듬히 내려다보므로 화면 아래쪽(가까운 터치라인)은 조준점에서 가까운 거리까지만 보인다 → 아래 여유를 따로 계산
    const hf = this.camera.fov * Math.PI / 360, hc = Math.sin(ELEV) * L + 2, dh = Math.cos(ELEV) * L, near = Math.max(4, dh - hc / Math.tan(ELEV + hf));
    if (sim && ball && sim.M.setTaker && sim.M.setAim && ball.owner === sim.M.setTaker) { // 세트피스 조준: 조준점이 화면 안에 들어오게 조준점 쪽으로 옮긴다 (공이 화면 밖으로 나가지는 않게)
      const ax = sim.M.aimX, ay = sim.M.aimY, hw = VW / 2 - 6, up = vh / 2 - 8, dn = near - 4;
      if (ay > ty + dn) ty = ay - dn; if (ay < ty - up) ty = ay + up; if (ball.y < ty - up) ty = ball.y + up; if (ball.y > ty + dn) ty = ball.y - dn;
      if (ax > tx + hw) tx = ax - hw; if (ax < tx - hw) tx = ax + hw; if (ball.x > tx + hw) tx = ball.x - hw; if (ball.x < tx - hw) tx = ball.x + hw;
    }
    tx = clamp(tx, VW / 2 - 9, W - VW / 2 + 9); ty = clamp(ty, vh / 2 - 12, H - near + 1.5);
    const k = 1 - Math.pow(0.004, dtR); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    let px: number, py: number, pz: number, lx = cam.x, ly = 0, lz = cam.y;
    const h = sim?.HU[0]?.ctrl ?? null;
    const sc = sim && !sim.M.so ? sim.M.scorer : null;
    this.celeCam = !!sim && !!sc && sim.M.phase === 'goal' && !this.replay && this.goalAt >= 0 && perf - this.goalAt > 0.45 && perf - this.goalAt < CELE_T;
    if (this.celeCam && sc) { // 세리머니 클로즈업: 득점자 앞 4.8m, 눈높이에서 천천히 돌며 따라간다
      const a = sc.dir + 0.5 + (perf - this.goalAt) * 0.22, lx2 = sc.x + sc.vx * 0.12, ly2 = sc.y + sc.vy * 0.12, pos = new THREE.Vector3(clamp(lx2 + Math.cos(a) * 4.8, -6, W + 6), 1.55, clamp(ly2 + Math.sin(a) * 4.8, -6, H + 6));
      this.camPos.lerp(pos, 1 - Math.pow(1e-4, dtR)); this.camLook.set(lx2, 1.15, ly2); // 조준점은 바로 따라간다 (늦게 따라가면 달리는 득점자가 화면 구석으로 밀린다)
    } else if (this.replay) { // 리플레이 카메라: 공 옆 낮은 곳에서
      const rb = this.rBall, gx = rb.x > CX ? W : 0, side = rb.y < CY ? -1 : 1;
      const tgt = new THREE.Vector3(rb.x, 0.9, rb.y), pos = new THREE.Vector3(rb.x + (gx > CX ? -12 : 12), 4.2, rb.y + side * 16);
      this.camPos.lerp(pos, 1 - Math.pow(0.05, dtR)); this.camLook.lerp(tgt, 1 - Math.pow(0.02, dtR));
    } else if (this.mode === 'pro' && sim && h) { // 조작 선수 뒤
      const dx = Math.cos(h.dir), dy = Math.sin(h.dir); px = h.x - dx * 9; py = 5.5; pz = h.y - dy * 9; lx = h.x + dx * 8; lz = h.y + dy * 8; ly = 1;
      this.camPos.lerp(new THREE.Vector3(px, py, pz), 1 - Math.pow(0.02, dtR)); this.camLook.lerp(new THREE.Vector3(lx, ly, lz), 1 - Math.pow(0.01, dtR));
    } else if (this.mode === 'intro') { // 입장: 관중석 높은 곳에서 천천히 내려온다
      const k = (Math.sin(perf * 0.5) + 1) / 2; px = CX + Math.cos(perf * 0.25) * 40; py = 28 + k * 10; pz = CY + 70 + Math.sin(perf * 0.25) * 20; this.camPos.lerp(new THREE.Vector3(px, py, pz), 1 - Math.pow(0.1, dtR)); this.camLook.set(CX, 1, CY);
    } else if (this.mode === 'top') {
      px = cam.x; py = L * 1.7; pz = cam.y + 10; this.camPos.set(px, py, pz); this.camLook.set(lx, 0, lz);
    } else {
      px = cam.x; py = Math.sin(ELEV) * L + 2; pz = cam.y + Math.cos(ELEV) * L; this.camPos.set(px, py, pz); this.camLook.set(lx, 0.6, lz);
    }
    cam.shake = Math.max(0, cam.shake - dtR); const sh = cam.shake;
    this.shk.x = sh > 0 ? (Math.random() - 0.5) * sh * 14 : 0; this.shk.y = sh > 0 ? (Math.random() - 0.5) * sh * 10 : 0;
    this.camera.position.copy(this.camPos); if (sh > 0) { this.camera.position.x += this.shk.x * 0.02; this.camera.position.y += this.shk.y * 0.02; }
    this.camera.lookAt(this.camLook);
    // 햇빛은 카메라 조준점을 따라가며 그림자 범위를 유지
    { const sc = this.sun.shadow.camera, sw = Math.max(42, VW * 0.8); if (Math.abs(sc.right - sw) > 1) { sc.left = -sw; sc.right = sw; sc.top = sw * 0.72; sc.bottom = -sw * 0.72; sc.updateProjectionMatrix(); } } // 넓은 시야에선 그림자 범위도 넓힌다
    { const sc = this.sun.shadow.camera, ms = this.sun.shadow.mapSize, tx = (sc.right - sc.left) / ms.x, ty = (sc.top - sc.bottom) / ms.y;
      const zx = -30 / SUN_L, zy = 95 / SUN_L, zz = 45 / SUN_L, rl = Math.hypot(zz, zx), rx = zz / rl, rz = -zx / rl, ux = zy * rz, uy = zz * rx - zx * rz, uz = -zy * rx; // 그림자 카메라의 오른쪽(r)·위(u) 축
      const u = cam.x * rx + cam.y * rz, v = cam.x * ux + cam.y * uz, du = Math.round(u / tx) * tx - u, dv = Math.round(v / ty) * ty - v, px = cam.x + rx * du + ux * dv, py = uy * dv, pz = cam.y + rz * du + uz * dv;
      this.sun.position.set(px - 30, py + 95, pz + 45); this.sun.target.position.set(px, py, pz); this.sun.target.updateMatrixWorld(); }
  }
  private updatePuffs(dt: number) {
    for (const q of this.puffs) { if (!q.sp.visible) continue; q.t += dt; if (q.t >= q.life) { q.sp.visible = false; continue; } const f = q.t / q.life; q.sp.position.x += q.vx * dt; q.sp.position.z += q.vz * dt; q.vx *= 1 - 4 * dt; q.vz *= 1 - 4 * dt; const s = 0.4 + f * 1.1; q.sp.scale.set(s, s * 0.7, 1); (q.sp.material as THREE.SpriteMaterial).opacity = (1 - f) * 0.6; }
  }
  private updateCrowd(sim: Sim | null, dt: number) {
    const goal = !!sim && sim.M.phase === 'goal';
    if (!goal && this.crowdT <= 0) return;
    this.crowdT = goal ? this.crowdT + dt : 0;
    const mtx = new THREE.Matrix4(), t = this.crowdT;
    this.stadium.crowd.forEach((inst, si) => {
      const base = this.stadium.crowdBase[si], n = inst.count, step = this.quality === 'high' ? 1 : 1;
      for (let i = 0; i < n; i += step) { const j = goal ? Math.max(0, Math.sin(t * 9 + i * 0.37)) * 0.35 : 0; mtx.makeTranslation(base[i * 3], base[i * 3 + 1] + j, base[i * 3 + 2]); inst.setMatrixAt(i, mtx); }
      inst.instanceMatrix.needsUpdate = true;
    });
  }
  render(sim: Sim | null, dtR: number, perf: number, paused: boolean) {
    this.fps += (1 / Math.max(1e-3, dtR) - this.fps) * 0.05;
    if (sim) this.syncModels(sim); else if (this.modelSim) { for (const m of this.models.values()) this.scene.remove(m.root); this.models.clear(); this.modelSim = null; }
    this.updateCamera(sim, dtR, perf);
    { const hide = !this.replay && !this.celeCam && (this.mode === 'tv' || this.mode === 'top' || this.mode === 'intro'); for (const o of this.stadium.near) o.visible = !hide; } // 입장 카메라도 가까운 쪽 관중석 자리(지붕 높이)에 있다 // 중계 카메라는 가까운 쪽 관중석 자리까지 내려가므로 그 관중석을 그리지 않는다
    { // 관중: 카메라에서 먼 면(60m 밖, 다시 가까워지는 건 50m)은 그림, 가까운 면은 메시 — 먼 메시 관중은 픽셀이 튄다
      const cp = this.camera.position;
      for (const sd of this.stadium.stands) { const dx = cp.x - sd.cx, dz = cp.z - sd.cz, c = Math.cos(sd.rot), s = Math.sin(sd.rot), xl = dx * c - dz * s, zl = dx * s + dz * c, dist = Math.hypot(Math.max(0, Math.abs(xl) - sd.L / 2), zl, Math.max(0, cp.y - 14)); sd.far = sd.far ? dist > 50 : dist > 60; for (const o of sd.inst) o.visible = !sd.far; for (const o of sd.imp) o.visible = sd.far; }
    }
    if (!paused) { this.updatePuffs(dtR); updateNets(this.stadium.nets, dtR); this.updateCrowd(sim, dtR); this.stadium.wind.value = perf % 3600; }
    if (sim) {
      const { HU, M } = sim;
      if (M.phase === 'goal' && this.lastPhase !== 'goal') { const n = this.stadium.nets[sim.ball.x > CX ? 1 : 0]; n.shake = 1.4; this.goalAt = perf; }
      this.lastPhase = M.phase;
      // 리플레이 진행: 세리머니 클로즈업(CELE_T초) 뒤 시작, 골 2.6초 전부터 0.4초 후까지를 0.55배속으로
      if (M.phase !== 'goal') { this.replay = false; this.goalAt = -1; }
      else if (this.goalAt >= 0 && perf - this.goalAt > CELE_T) { this.replayT = this.goalAt - 2.6 + (perf - this.goalAt - CELE_T) * 0.55; this.replay = this.replayT < this.goalAt + 0.4 && this.frames.length > 10; }
      if (!this.replay && !paused) this.pushFrame(sim, perf);
      let ball: { x: number; y: number; z: number; vx: number; vy: number; owner: Player | null };
      if (this.replay && this.loadFrame(sim, this.replayT)) { ball = this.rBall; sim.players.forEach((p, i) => this.models.get(p)!.update(this.pose[i], ball, perf)); }
      else { ball = sim.ball; for (const m of this.models.values()) { m.root.visible = !m.p.off; if (!m.p.off) m.update(m.p, ball, perf); } }
      this.ball.position.set(ball.x, 0.11 + ball.z, ball.y);
      if (!paused) { const sp = Math.hypot(ball.vx, ball.vy); if (sp > 0.05) { const axis = this.tmpV.set(-ball.vy, 0, ball.vx).normalize(); this.ball.rotateOnWorldAxis(axis, -sp * dtR * (this.replay ? 0.55 : 1) / 0.11); } }
      this.ballShadow.position.set(ball.x + ball.z * 0.12, 0.012, ball.y); const ss = 1 / (1 + ball.z * 0.35); this.ballShadow.scale.set(ss, ss, ss); this.ballShadow.visible = this.quality === 'low' || ball.z > 0.3;
      HU.forEach((h, i) => { const r = this.rings[i]; if (h && h.ctrl && !this.replay && !this.celeCam) { r.visible = true; r.position.x = h.ctrl.x; r.position.z = h.ctrl.y; } else r.visible = false; });
      this.ball.visible = true;
    } else { this.ball.visible = false; this.ballShadow.visible = false; for (const r of this.rings) r.visible = false; }
    this.gl.render(this.scene, this.camera);
    this.drawOverlay(sim);
  }
  private drawOverlay(sim: Sim | null) {
    const ctx = this.ov, { cw, ch, ins } = this; ctx.clearRect(0, 0, cw, ch);
    if (!sim) return;
    if (this.replay) { // 레터박스 + REPLAY
      const bh = Math.round(ch * 0.09); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, bh); ctx.fillRect(0, ch - bh, cw, bh);
      ctx.font = '800 16px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffb627'; ctx.fillText('● REPLAY', cw - Math.max(16, ins.r), ch - bh / 2);
      return;
    }
    const { players, HU, M, ball } = sim;
    for (const h of HU) { // 수비 중: Shift(뒤쪽 수비 전환)를 누르면 넘어갈 선수를 작은 빈 화살표로 미리 보여 준다
      if (!h || !h.ctrl || M.phase !== 'live' || M.so) continue; const bt = ball.owner ? ball.owner.t : ball.lastTouch; if (bt === h.t) continue;
      const g = backTarget(sim, h); if (!g) continue; const gp = this.toScreen(g.x, g.y, 2.05); if (!gp.on) continue;
      const gy = gp.y - 8; ctx.globalAlpha = 0.75; ctx.strokeStyle = h.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gp.x, gy + 7); ctx.lineTo(gp.x - 5, gy); ctx.lineTo(gp.x + 5, gy); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const h of HU) {
      if (!h || !h.ctrl) continue; const c = h.ctrl, pp = this.toScreen(c.x, c.y, 2.05), px = pp.x, py = pp.y, on = pp.on && px > 8 && px < cw - 8 && py > 8 && py < ch - 8;
      if (on) {
        const ty2 = py - 10; ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(px, ty2 + 9); ctx.lineTo(px - 6, ty2); ctx.lineTo(px + 6, ty2); ctx.fill();
        ctx.font = '800 13px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3; ctx.fillText((M.twoP ? h.tag + ' · ' : '') + displayName(c, opts.names), px, ty2 - 1); ctx.shadowBlur = 0;
        { const fp = this.toScreen(c.x, c.y, 0), bw = 30, bh = 3, bx = fp.x - bw / 2, by = fp.y + 4; ctx.fillStyle = 'rgba(9,17,27,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = c.sta > 0.4 ? '#8fe3a3' : '#ff8a5c'; ctx.fillRect(bx, by, bw * c.sta, bh); } // 체력
        if (h.charging) { const fp = this.toScreen(c.x, c.y, 0), bw = 44, bh = 6, bx = fp.x - bw / 2, by = fp.y + 10; ctx.fillStyle = 'rgba(9,17,27,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = h.charge > 0.8 ? '#ff5a4e' : h.col; ctx.fillRect(bx, by, bw * h.charge, bh); ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * 0.8, by - 2, 1.5, bh + 4); }
      } else { const cx2 = clamp(px, 24, cw - 24), cy2 = clamp(py, 24 + ins.t, ch - 24 - ins.b), a = Math.atan2(py - cy2, px - cx2); ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(a); ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.fill(); ctx.restore(); }
    }
    // 세트피스 조준: 지금 차면 날아갈 궤적(점)과 땅 그림자 선, 떨어질 자리(원)·골문을 지나는 자리(십자)
    { const pv = setPreview(sim), hh = pv && M.setTaker ? HU[M.setTaker.t] : null;
      if (pv && hh) {
        const n = pv.pts.length, e = pv.pts[n - 1]; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(9,17,27,.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); pv.pts.forEach((q, i) => { const a = this.toScreen(q.x, q.y, 0.02); if (i) ctx.lineTo(a.x, a.y); else ctx.moveTo(a.x, a.y); }); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 1; i < n; i++) { const q = pv.pts[i], a = this.toScreen(q.x, q.y, q.z); if (!a.on) continue; ctx.globalAlpha = 0.95 - 0.35 * i / n; ctx.fillStyle = i % 2 ? '#ffffff' : hh.col; ctx.beginPath(); ctx.arc(a.x, a.y, 2.8, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.strokeStyle = hh.col; ctx.lineWidth = 2.5; ctx.beginPath(); let lx = 0, ly = 0;
        if (pv.shot) { const a = this.toScreen(e.x, e.y, e.z); lx = a.x; ly = a.y - 14; ctx.arc(a.x, a.y, 8, 0, 7); ctx.moveTo(a.x - 13, a.y); ctx.lineTo(a.x + 13, a.y); ctx.moveTo(a.x, a.y - 13); ctx.lineTo(a.x, a.y + 13); }
        else { for (let k = 0; k <= 20; k++) { const an = k / 20 * Math.PI * 2, a = this.toScreen(M.aimX + Math.cos(an) * 1.5, M.aimY + Math.sin(an) * 1.5, 0.02); if (k) ctx.lineTo(a.x, a.y); else ctx.moveTo(a.x, a.y); } const c = this.toScreen(M.aimX, M.aimY, 0.02); lx = c.x; ly = c.y - 16; }
        ctx.stroke();
        ctx.font = '800 12px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9,17,27,.8)'; const tx = pv.kind === 'shot' ? '직접 슛' : pv.kind === 'drive' ? '낮고 빠르게' : '띄우기'; ctx.strokeText(tx, lx, ly); ctx.fillStyle = '#fff'; ctx.fillText(tx, lx, ly);
      }
    }
    // 침투 지시 화살표: 뛰는 동료 발 밑에서 지시 방향으로
    for (const p of players) {
      if (p.runT <= 0 || p.off) continue;
      const a = this.toScreen(p.x, p.y, 0.05), b = this.toScreen(p.x + Math.cos(p.runDir) * 4.5, p.y + Math.sin(p.runDir) * 4.5, 0.05); if (!a.on) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.save(); ctx.globalAlpha = clamp(p.runT / 0.4, 0, 1) * 0.95; ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(len - 8, 0); ctx.stroke();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(len + 2, 0); ctx.lineTo(len - 12, -7); ctx.lineTo(len - 12, 7); ctx.fill(); ctx.restore();
    }
    // 압박 지원 화살표: 가장 가까운 AI 동료 → 공 가진 상대
    for (const h of HU) {
      if (!h || h.pressT <= 0 || !ball.owner || ball.owner.t === h.t) continue; const o = ball.owner;
      let best: Player | null = null, bd = 1e9; for (const p of players) { if (p.t !== h.t || p === h.ctrl || p.role === 'GK' || p.off) continue; const q = Math.hypot(p.x - o.x, p.y - o.y); if (q < bd) { bd = q; best = p; } }
      if (!best) continue; const a = this.toScreen(best.x, best.y, 0.05), b = this.toScreen(o.x, o.y, 0.05); if (!a.on || !b.on) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.max(0, Math.hypot(b.x - a.x, b.y - a.y) - 14);
      ctx.save(); ctx.globalAlpha = clamp(h.pressT / 0.4, 0, 1) * 0.9; ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.strokeStyle = '#ff5a4e'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(len - 6, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff5a4e'; ctx.beginPath(); ctx.moveTo(len + 2, 0); ctx.lineTo(len - 10, -6); ctx.lineTo(len - 10, 6); ctx.fill(); ctx.restore();
    }
    // 선수 이름표: 등번호 + 이름 (가까울수록 선명, 멀면 숨김)
    ctx.font = '700 11px "IBM Plex Sans KR","Saira Condensed",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const p of players) {
      if (p.off || HU.some(h => h && h.ctrl === p)) continue;
      const hp = this.toScreen(p.x, p.y, 2.0), fp = this.toScreen(p.x, p.y, 0); if (!hp.on) continue;
      const hpx = fp.y - hp.y; if (hpx < 26 || hp.x < -20 || hp.x > cw + 20 || hp.y < 0 || hp.y > ch) continue;
      const a = clamp((hpx - 26) / 30, 0.35, 0.85), kit = M.kit[p.t];
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(9,17,27,.7)'; const txt = `${p.num} ${displayName(p, opts.names)}`, w = ctx.measureText(txt).width + 8;
      ctx.fillRect(hp.x - w / 2, hp.y - 15, w, 14); ctx.fillStyle = p.role === 'GK' ? kit.gk : kit.c1; ctx.fillRect(hp.x - w / 2, hp.y - 15, 3, 14);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, hp.x + 1, hp.y - 2); ctx.globalAlpha = 1;
    }
    // xT: 방금 한 패스·드리블이 만든 ΔxT(%p)를 그 자리 위에 잠깐 띄운다 (패널을 열고 '하나' 보기일 때)
    if (XT.on && XT.pops.length) {
      const now = performance.now() / 1000; ctx.font = '800 14px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const q of XT.pops) { const a = now - q.at; if (a < 0 || a > 1.4) continue; const sp = this.toScreen(q.x, q.y, 2.3 + a * 0.9); if (!sp.on) continue; ctx.globalAlpha = Math.min(1, (1.4 - a) / 0.4); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9,17,27,.85)'; const tx = (q.v >= 0 ? '+' : '−') + (Math.abs(q.v) * 100).toFixed(1); ctx.strokeText(tx, sp.x, sp.y); ctx.fillStyle = q.v >= 0 ? '#8fe3a3' : '#ff8a5c'; ctx.fillText(tx, sp.x, sp.y); }
      ctx.globalAlpha = 1;
    }
    // 미니맵 (코너킥 시점에선 박스가 다 보이므로 숨긴다 — 먼 쪽 코너의 키커를 가린다)
    if (this.spB > 0.5) return;
    const mk = clamp(cw * 0.22 / W, 0.8, 1.6), mw = W * mk, mh = H * mk, mx0 = cw - mw - Math.max(12, ins.r), my0 = ins.t + 56;
    ctx.fillStyle = 'rgba(9,17,27,.62)'; ctx.fillRect(mx0 - 3, my0 - 3, mw + 6, mh + 6); if (XT.on && !XT.all && XT.map) drawMap(ctx, mx0, my0, mw, mh, XT.mapTeam, 0.85); /* xT 구역 지도 (공 가진 팀의 공격 방향) */ ctx.strokeStyle = 'rgba(238,243,234,.35)'; ctx.lineWidth = 1; ctx.strokeRect(mx0, my0, mw, mh);
    ctx.beginPath(); ctx.moveTo(mx0 + mw / 2, my0); ctx.lineTo(mx0 + mw / 2, my0 + mh); ctx.stroke();
    for (const p of players) { const kit = M.kit[p.t]; ctx.fillStyle = p.role === 'GK' ? kit.gk : kit.c1; const hh = HU.find(h => h && h.ctrl === p); ctx.beginPath(); ctx.arc(mx0 + p.x * mk, my0 + p.y * mk, hh ? 3.2 : 2.3, 0, 7); ctx.fill(); if (hh) { ctx.strokeStyle = hh.col; ctx.lineWidth = 1.5; ctx.stroke(); } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx0 + ball.x * mk, my0 + ball.y * mk, 2, 0, 7); ctx.fill();
  }
}
