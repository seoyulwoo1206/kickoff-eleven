/* Three.js 렌더러. 시뮬 좌표 (x, y, z높이) → 월드 (x, z높이→Y, y→Z).
   중계 카메라(tv)는 가까운 터치라인 쪽(+Z) 위에서 공을 따라간다. pro = 조작 선수 뒤, top = 위에서 */
import * as THREE from 'three';
import { W, H, CX, CY } from '../../sim/consts';
import { clamp } from '../../sim/util';
import type { Sim, Player } from '../../sim/types';
import type { IRenderer, Quality, CamMode } from '../types';
import { buildStadium, updateNets, type Stadium } from './stadium';
import { PlayerModel, type PoseState } from './player';
import { ballTexture, puffTexture, ringTexture } from './textures';
import { opts } from '../../options';
import { displayName, shirtName } from '../../data/squads';

interface Puff { sp: THREE.Sprite; vx: number; vz: number; life: number; t: number; }
const PF = 15, BF = 6; // 리플레이 프레임: 선수당 15값, 공 6값
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
  private ov: CanvasRenderingContext2D; private lastPhase = ''; private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(CX, 0, CY);
  private tmpV = new THREE.Vector3(); private shk = { x: 0, y: 0 }; private crowdT = 0;
  // 골 리플레이: 최근 4초를 링버퍼에 담아두고 골 1.3초 뒤부터 0.55배속으로 보여준다
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
    this.stadium = buildStadium(q); this.scene.add(this.stadium.group);
    for (const m of this.models.values()) m.setBlob(!shadows);
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }
  setCamMode(m: CamMode) { this.mode = m; }
  resize() {
    const r = this.cv.getBoundingClientRect(); this.cw = r.width; this.ch = r.height;
    this.gl.setSize(this.cw, this.ch, false); this.camera.aspect = this.cw / this.ch; this.camera.updateProjectionMatrix();
    const od = Math.min(window.devicePixelRatio || 1, 2); this.ovCv.width = Math.round(this.cw * od); this.ovCv.height = Math.round(this.ch * od); this.ov.setTransform(od, 0, 0, od, 0, 0);
    const cs = getComputedStyle(this.insetEl);
    this.ins = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  reset() { for (const q of this.puffs) { q.sp.visible = false; q.t = 2; } this.cam.x = CX; this.cam.y = CY; this.cam.z = 1; this.lastPhase = ''; this.frames.length = 0; this.goalAt = -1; this.replay = false; }
  private pushFrame(sim: Sim, perf: number) {
    const n = sim.players.length; let f = this.frames.length > 260 ? this.frames.shift()! : { t: 0, P: new Float32Array(n * PF), B: new Float32Array(BF) };
    if (f.P.length !== n * PF) f = { t: 0, P: new Float32Array(n * PF), B: new Float32Array(BF) };
    f.t = perf; sim.players.forEach((p, i) => { const k = i * PF; f.P[k] = p.x; f.P[k + 1] = p.y; f.P[k + 2] = p.dir; f.P[k + 3] = p.vx; f.P[k + 4] = p.vy; f.P[k + 5] = p.run; f.P[k + 6] = p.kickCD; f.P[k + 7] = p.slide; f.P[k + 8] = p.dive; f.P[k + 9] = p.diveDir; f.P[k + 10] = p.stun; f.P[k + 11] = p.cele ? 1 : 0; f.P[k + 12] = p.kickWind; f.P[k + 13] = p.spin; f.P[k + 14] = p.feint; });
    const b = sim.ball; f.B[0] = b.x; f.B[1] = b.y; f.B[2] = b.z; f.B[3] = b.vx; f.B[4] = b.vy; f.B[5] = b.owner ? sim.players.indexOf(b.owner) : -1;
    this.frames.push(f);
  }
  /** 버퍼에서 시각 t의 상태를 pose/rBall에 채운다 (두 프레임 사이 보간) */
  private loadFrame(sim: Sim, t: number) {
    const fr = this.frames; if (!fr.length) return false;
    let j = fr.length - 1; while (j > 0 && fr[j - 1].t > t) j--; const b = fr[j], a = fr[Math.max(0, j - 1)];
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    if (this.pose.length !== sim.players.length) this.pose = sim.players.map(p => ({ x: 0, y: 0, dir: 0, vx: 0, vy: 0, run: 0, kickCD: 0, slide: 0, dive: 0, diveDir: 0, stun: 0, cele: false, role: p.role, i: p.i, kickWind: 0, spin: 0, feint: 0 }));
    const L = (i: number) => a.P[i] + (b.P[i] - a.P[i]) * f;
    this.pose.forEach((q, i) => { const k = i * PF; q.x = L(k); q.y = L(k + 1); let da = b.P[k + 2] - a.P[k + 2]; da = ((da % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; q.dir = a.P[k + 2] + da * f; q.vx = b.P[k + 3]; q.vy = b.P[k + 4]; q.run = L(k + 5); q.kickCD = b.P[k + 6]; q.slide = b.P[k + 7]; q.dive = b.P[k + 8]; q.diveDir = b.P[k + 9]; q.stun = b.P[k + 10]; q.cele = b.P[k + 11] > 0; q.kickWind = b.P[k + 12]; q.spin = b.P[k + 13]; q.feint = b.P[k + 14]; });
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
    if (this.modelSim === sim && this.namesMode === opts.names) return;
    for (const m of this.models.values()) this.scene.remove(m.root); this.models.clear();
    for (const p of sim.players) { const m = new PlayerModel(p, sim.M.kit[p.t], this.blobTex, shirtName(p, opts.names)); m.setBlob(this.quality === 'low'); this.scene.add(m.root); this.models.set(p, m); }
    this.modelSim = sim; this.namesMode = opts.names;
  }
  /** 월드 → 화면 좌표 (오버레이용) */
  private toScreen(x: number, z: number, y: number) {
    const v = this.tmpV.set(x, z, y).project(this.camera);
    return { x: (v.x + 1) / 2 * this.cw + this.shk.x, y: (1 - v.y) / 2 * this.ch + this.shk.y, on: v.z < 1 && v.z > -1 };
  }
  private updateCamera(sim: Sim | null, dtR: number, perf: number) {
    const cam = this.cam, ball = sim?.ball;
    const zt = sim && sim.M.phase === 'goal' ? 1.3 : sim && ball && ball.isShot && !ball.owner ? 1.08 : 1;
    cam.z += (zt - cam.z) * (1 - Math.pow(zt > cam.z ? 0.03 : 0.3, dtR));
    const aspect = this.cw / Math.max(1, this.ch);
    const VW = (this.cw < 600 ? 30 : aspect > 1.9 ? 34 : 38) / cam.z; // 화면에 보이는 가로 폭 (m)
    const L = VW / (2 * Math.tan(this.camera.fov * Math.PI / 360) * aspect); // 그 폭이 보이는 거리
    let tx: number, ty: number;
    if (!sim || !ball) { tx = CX + Math.sin(perf * 0.07) * 22; ty = CY + Math.cos(perf * 0.05) * 8; } else { tx = ball.x + ball.vx * 0.22; ty = ball.y + ball.vy * 0.18; }
    const vh = VW / aspect * 1.5;
    tx = clamp(tx, VW / 2 - 9, W - VW / 2 + 9); ty = clamp(ty, vh / 2 - 12, H - vh / 2 + 12);
    const k = 1 - Math.pow(0.004, dtR); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    let px: number, py: number, pz: number, lx = cam.x, ly = 0, lz = cam.y;
    const h = sim?.HU[0]?.ctrl ?? null;
    if (this.replay) { // 리플레이 카메라: 공 옆 낮은 곳에서
      const rb = this.rBall, gx = rb.x > CX ? W : 0, side = rb.y < CY ? -1 : 1;
      const tgt = new THREE.Vector3(rb.x, 0.9, rb.y), pos = new THREE.Vector3(rb.x + (gx > CX ? -12 : 12), 4.2, rb.y + side * 16);
      this.camPos.lerp(pos, 1 - Math.pow(0.05, dtR)); this.camLook.lerp(tgt, 1 - Math.pow(0.02, dtR));
    } else if (this.mode === 'pro' && sim && h) { // 조작 선수 뒤
      const dx = Math.cos(h.dir), dy = Math.sin(h.dir); px = h.x - dx * 9; py = 5.5; pz = h.y - dy * 9; lx = h.x + dx * 8; lz = h.y + dy * 8; ly = 1;
      this.camPos.lerp(new THREE.Vector3(px, py, pz), 1 - Math.pow(0.02, dtR)); this.camLook.lerp(new THREE.Vector3(lx, ly, lz), 1 - Math.pow(0.01, dtR));
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
    this.sun.position.set(cam.x - 30, 95, cam.y + 45); this.sun.target.position.set(cam.x, 0, cam.y); this.sun.target.updateMatrixWorld();
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
    if (!paused) { this.updatePuffs(dtR); updateNets(this.stadium.nets, dtR); this.updateCrowd(sim, dtR); }
    if (sim) {
      const { HU, M } = sim;
      if (M.phase === 'goal' && this.lastPhase !== 'goal') { const n = this.stadium.nets[sim.ball.x > CX ? 1 : 0]; n.shake = 1.4; this.goalAt = perf; }
      this.lastPhase = M.phase;
      // 리플레이 진행: 골 1.3초 뒤 시작, 골 2.6초 전부터 0.4초 후까지를 0.55배속으로
      if (M.phase !== 'goal') { this.replay = false; this.goalAt = -1; }
      else if (this.goalAt >= 0 && perf - this.goalAt > 1.3) { this.replayT = this.goalAt - 2.6 + (perf - this.goalAt - 1.3) * 0.55; this.replay = this.replayT < this.goalAt + 0.4 && this.frames.length > 10; }
      if (!this.replay && !paused) this.pushFrame(sim, perf);
      let ball: { x: number; y: number; z: number; vx: number; vy: number; owner: Player | null };
      if (this.replay && this.loadFrame(sim, this.replayT)) { ball = this.rBall; sim.players.forEach((p, i) => this.models.get(p)!.update(this.pose[i], ball, perf)); }
      else { ball = sim.ball; for (const m of this.models.values()) { m.root.visible = !m.p.off; if (!m.p.off) m.update(m.p, ball, perf); } }
      this.ball.position.set(ball.x, 0.11 + ball.z, ball.y);
      if (!paused) { const sp = Math.hypot(ball.vx, ball.vy); if (sp > 0.05) { const axis = this.tmpV.set(-ball.vy, 0, ball.vx).normalize(); this.ball.rotateOnWorldAxis(axis, -sp * dtR * (this.replay ? 0.55 : 1) / 0.11); } }
      this.ballShadow.position.set(ball.x + ball.z * 0.12, 0.012, ball.y); const ss = 1 / (1 + ball.z * 0.35); this.ballShadow.scale.set(ss, ss, ss); this.ballShadow.visible = this.quality === 'low' || ball.z > 0.3;
      HU.forEach((h, i) => { const r = this.rings[i]; if (h && h.ctrl && !this.replay) { r.visible = true; r.position.x = h.ctrl.x; r.position.z = h.ctrl.y; } else r.visible = false; });
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
    for (const h of HU) {
      if (!h || !h.ctrl) continue; const c = h.ctrl, pp = this.toScreen(c.x, c.y, 2.05), px = pp.x, py = pp.y, on = pp.on && px > 8 && px < cw - 8 && py > 8 && py < ch - 8;
      if (on) {
        const ty2 = py - 10; ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(px, ty2 + 9); ctx.lineTo(px - 6, ty2); ctx.lineTo(px + 6, ty2); ctx.fill();
        ctx.font = '800 13px "Saira Condensed","Arial Narrow",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3; ctx.fillText((M.twoP ? h.tag + ' · ' : '') + displayName(c, opts.names), px, ty2 - 1); ctx.shadowBlur = 0;
        { const fp = this.toScreen(c.x, c.y, 0), bw = 30, bh = 3, bx = fp.x - bw / 2, by = fp.y + 4; ctx.fillStyle = 'rgba(9,17,27,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = c.sta > 0.4 ? '#8fe3a3' : '#ff8a5c'; ctx.fillRect(bx, by, bw * c.sta, bh); } // 체력
        if (h.charging) { const fp = this.toScreen(c.x, c.y, 0), bw = 44, bh = 6, bx = fp.x - bw / 2, by = fp.y + 10; ctx.fillStyle = 'rgba(9,17,27,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = h.charge > 0.8 ? '#ff5a4e' : h.col; ctx.fillRect(bx, by, bw * h.charge, bh); ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * 0.8, by - 2, 1.5, bh + 4); }
      } else { const cx2 = clamp(px, 24, cw - 24), cy2 = clamp(py, 24 + ins.t, ch - 24 - ins.b), a = Math.atan2(py - cy2, px - cx2); ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(a); ctx.fillStyle = h.col; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.fill(); ctx.restore(); }
    }
    // 미니맵
    const mk = clamp(cw * 0.22 / W, 0.8, 1.4), mw = W * mk, mh = H * mk, mx0 = cw - mw - Math.max(12, ins.r), my0 = ins.t + 56;
    ctx.fillStyle = 'rgba(9,17,27,.62)'; ctx.fillRect(mx0 - 3, my0 - 3, mw + 6, mh + 6); ctx.strokeStyle = 'rgba(238,243,234,.35)'; ctx.lineWidth = 1; ctx.strokeRect(mx0, my0, mw, mh);
    ctx.beginPath(); ctx.moveTo(mx0 + mw / 2, my0); ctx.lineTo(mx0 + mw / 2, my0 + mh); ctx.stroke();
    for (const p of players) { const kit = M.kit[p.t]; ctx.fillStyle = p.role === 'GK' ? kit.gk : kit.c1; const hh = HU.find(h => h && h.ctrl === p); ctx.beginPath(); ctx.arc(mx0 + p.x * mk, my0 + p.y * mk, hh ? 3.2 : 2.3, 0, 7); ctx.fill(); if (hh) { ctx.strokeStyle = hh.col; ctx.lineWidth = 1.5; ctx.stroke(); } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx0 + ball.x * mk, my0 + ball.y * mk, 2, 0, 7); ctx.fill();
  }
}
