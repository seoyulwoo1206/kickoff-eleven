import { W, CY } from '../consts';
import { clamp, d, wx } from '../util';
import { DIFF } from '../../data/teams';
import type { Sim, Player } from '../types';
import { sfx, xtEv } from '../events';
import { gain, kick, passTo, n } from '../ball';
import { steer, moveTo } from '../move';
import { bestAIPass } from './carrier';

const RB = 2.05, RT = 0.9, SL = 0.65, TB = 0.45, BD = 0.95; // 선방: 기본 다이빙 한계(m), 시간 여유로 늘어나는 한계, 한계까지의 확률 하락폭, 볼 시간 가산, 몸 정면 확률
export function gkAI(s: Sim, k: Player, dt: number) {
  const { ball, M, team, HU } = s;
  const t = k.t, gx = t === 0 ? 0 : W, sg = t === 0 ? 1 : -1, own = ball.owner;
  const G = k.def?.gk ?? { div: k.attrs.jmp, han: k.attrs.rea, kic: k.attrs.lp, ref: k.attrs.rea, pos: k.attrs.mrk };
  const skill = (0.5 + n(G.ref) * 0.3 + n(G.div) * 0.1) * (!HU[t] ? DIFF[M.diff].gk : 1);
  if (own === k) {
    k.holdT += dt; steer(k, 0, 0, dt); k.dir = t === 0 ? 0 : Math.PI;
    let hold = 1.0; if (k.atFeet) { let od = 99; for (const o of team[1 - t]) if (!o.off) od = Math.min(od, d(o, k)); hold = od < 9 ? 0.12 : 0.5; } // 발밑의 공(백패스)은 뺏길 수 있으니 오래 끌지 않는다
    if (k.holdT > hold && M.phase === 'live') { const m = bestAIPass(s, k); if (m) passTo(s, k, m.p, m.loft); else kick(s, k, sg * (20 + n(G.kic) * 6), (s.rnd() - 0.5) * 8, 7); }
    return;
  }
  const lb = wx(ball.x, t), lk = wx(k.x, t), dG = Math.hypot(ball.x - gx, ball.y - CY);
  let tx = 1.3 + Math.max(0, (32 - dG) / 32) * (3.0 + n(G.pos) * 1.2), ty = clamp(CY + (ball.y - CY) * (0.3 + n(G.pos) * 0.08), CY - 3.3, CY + 3.3), f = 0.8 + n(G.pos) * 0.15;
  const h = HU[t];
  if (h && h.gkRush && lb < 30) { // 골키퍼 돌진
    moveTo(k, ball.x, ball.y, 1.3, dt);
    if (own && own.t !== t && d(k, own) < 1.2 && k.tackleCD <= 0 && M.protect <= 0) { k.tackleCD = 0.4; if (s.rnd() < 0.55) { gain(s, k); own.kickCD = 0.5; } }
    return;
  }
  if (!own) {
    const vlx = ball.vx * sg;
    if (vlx < -5 && k.reactT <= 0) { const th = (lb - lk) / (-vlx); if (th > 0 && th < 2) { ty = clamp(ball.y + ball.vy * th, CY - 4.6, CY + 4.6); tx = lk; f = 1.2; } }
    if (lb < 17 && Math.abs(ball.y - CY) < 21 && Math.hypot(ball.vx, ball.vy) < 14 && ball.z < 2) { // 흐르는 공 줍기
      const dk = d(k, ball); let dop = 1e9; for (const o of team[1 - t]) if (!o.off) dop = Math.min(dop, d(o, ball));
      if (dk < dop - 1) { tx = lb; ty = ball.y; f = 1.3; }
    }
    if (!ball.isShot && (ball.z > 1.6 || ball.vz > 3) && lb < 45) { // 공중볼 (전엔 선에 서서 구경했다): ① 손 닿는 높이(2.7m)로 내려오는 자리에 공보다 먼저 가 있을 수 있으면 나가서 잡는다 — 골라인 5.5m 안은 늘, 11m 안은 그 자리 2.2m 안으로 올 상대가 없을 때만. ② 박스 안에 떨어질 공은 상대보다 먼저 닿으면 주우러 나간다
      const oppT = (x: number, y: number, r: number) => { let b = 1e9; for (const o of team[1 - t]) if (!o.off) b = Math.min(b, Math.max(0, Math.hypot(o.x - x, o.y - y) - r) / (o.speed * 1.15)); return b; };
      let up = ball.z > 2.7, first = true, went = false, land: { x: number; y: number } | null = null;
      for (const q of s.pred) { if (q.z > 2.7) { up = true; continue; } if (!up) continue;
        const lq = wx(q.x, t), cy = Math.abs(q.y - CY), kt = Math.max(0, Math.hypot(q.x - k.x, q.y - k.y) - 1.0) / (k.speed * 1.05) + 0.12;
        if (first) { first = false; land = q; if (q.z > 0.7 && lq > -0.3 && cy < 9 && kt < q.t && (lq < 5.5 || (lq < 11 && oppT(q.x, q.y, 2.2) > q.t))) { tx = lq; ty = q.y; f = 1.35; went = true; break; } }
        if (q.z < 0.4) { if (lq > 0.5 && lq < 15.5 && cy < 18 && kt < oppT(q.x, q.y, 1) - 0.25) { tx = lq; ty = q.y; f = 1.3; went = true; } break; }
      }
      // 49차: 못 나가는 크로스는 떨어질 자리 쪽으로 골라인 가까이에서 자리를 옮긴다 — 전엔 날아오는 공(코너 깃발 쪽)을 따라 니어 포스트 쪽 3.5m 앞에 서 있어, 파 포스트로 넘어간 공의 헤딩은 빈 골문이었다
      if (!went && land && wx(land.x, t) < 16.5 && Math.abs(land.y - CY) < 16) { tx = Math.min(tx, 1.6); ty = clamp(CY + (land.y - CY) * 0.5, CY - 3.3, CY + 3.3); f = Math.max(f, 1.15); }
    }
    if (ball.kicker && ball.kicker.t !== t && ball.shot !== k.lastSave && vlx < -4 && lb <= lk + 0.5 && lb > lk - 1.8 && Math.abs(ball.y - k.y) < 2.9 && ball.z < 2.7) { // 선방 판정
      k.lastSave = ball.shot; const dy0 = Math.abs(ball.y - k.y), sp = Math.hypot(ball.vx, ball.vy), hi = ball.z > 1.6;
      const dy = Math.hypot(dy0, Math.max(0, ball.z - 1.5)); // 손이 닿아야 하는 거리: 가슴(1.5m) 위로 뜬 만큼도 거리다 (구석 위는 어렵고, 정면 높은 공은 쉽다)
      if (ball.isShot && ball.kicker) M.stats.onT[ball.kicker.t]++; // 골문 안으로 온 슛 = 유효 슈팅
      // 선방 확률: 몸 정면(0.6m 안)은 거의 다 막고, 몸을 던져 닿는 한계 R까지 매끈하게 떨어지며, 그 밖은 못 막는다.
      // 예전 식은 0.5m에서 .88 → .68로 뚝 떨어져 몸 옆 1m 공이 셋에 하나 들어가고, 먼 슛 보정 때문에 닿지 않는 구석 공을 막기도 해 들쭉날쭉했다
      const tB = ball.isShot ? clamp((ball.shotT - 0.35) / 0.5, 0, 1) : 0.3; // 날아오는 시간이 길수록 자리를 잡고 더 멀리 몸을 던진다
      const R = RB + n(G.div) * 0.5 + tB * RT, spF = Math.max(0.75, 1 - Math.max(0, sp - 22) / 40);
      let pr = dy <= 0.6 ? BD : dy >= R ? 0.04 : (BD - 0.06 - (dy - 0.6) / (R - 0.6) * SL) * Math.min(1.12, skill / 0.7) * spF;
      if (dy < R) pr += (0.93 - pr) * tB * TB; // 닿는 범위 안이면, 볼 시간이 길수록 확실히 막는다 (닿지 않는 구석은 시간이 있어도 못 막는다)
      if (ball.isShot && ball.shotT < 0.3 && dy > 0.6) pr *= 0.6 + ball.shotT / 0.3 * 0.4; // 코앞에서 찬 공은 반응할 틈이 없다
      k.dive = 0.5; k.diveDir = Math.sign(ball.y - k.y) || 1;
      if (M.spType === 'penalty' && M.protect > 0) { // 페널티: 한쪽을 찍고 몸을 던진다 (사람 팀 키퍼는 스틱 방향)
        const I = h ? s.INP[t] : null; const guess = I && Math.abs(I.my) > 0.3 ? Math.sign(I.my) : I ? 0 : (s.rnd() < 0.5 ? 1 : -1);
        const side = Math.abs(ball.y - CY) < 1 ? 0 : Math.sign(ball.y - CY);
        k.diveDir = guess || (Math.sign(ball.y - k.y) || 1); pr = guess === side ? 0.55 + n(G.div) * 0.3 : guess === 0 ? 0.15 : 0.06; }
      if (s.rnd() < pr) {
        if (ball.isShot) xtEv(s, 'save', t, k.num, k.x, k.y);
        { const mv = clamp(ball.y - k.y, -1.8, 1.8) * 0.8; k.y += mv; k.vy = Math.sign(mv) * Math.min(8, Math.abs(mv) / 0.12); } // 막았으면 몸이 공에 가 있다 (닿지 않았는데 공이 튕기지 않게)
        if (sp < 11 + n(G.han) * 9 && ball.z < 1.8) gain(s, k); // 핸들링 좋으면 잡고, 아니면 쳐낸다
        else if (s.rnd() < 0.45 && !M.so) { const sd = ball.y > CY ? 1 : -1; ball.vx = Math.sign(ball.vx) * (7 + s.rnd() * 4); ball.vy = sd * (9 + s.rnd() * 5); ball.vz = 4 + s.rnd() * 4; ball.isShot = false; ball.lastTouch = t; ball.kicker = k; ball.shot++; k.lastSave = ball.shot; k.kickCD = 0.3; sfx(s, 'tackle'); } // 골라인 밖으로 쳐낸다 → 코너킥 (전엔 전부 경기장 안으로 쳐내 16경기에 코너킥이 0번이었다)
        else { ball.vx = -ball.vx * 0.3; ball.vy = (ball.y > k.y ? 1 : -1) * (6 + s.rnd() * 6); ball.vz = 3 + s.rnd() * 3; ball.lastTouch = t; ball.kicker = k; ball.shot++; k.lastSave = ball.shot; k.kickCD = 0.3; sfx(s, 'tackle'); }
      }
    }
  } else if (own.t !== t) {
    if (lb < 16 && Math.abs(ball.y - CY) < 12 && d(k, own) < 9) { tx = Math.min(lb - 1.2, 7); ty = ball.y; f = 1.1; if (d(k, own) < 3.2) { tx = lb; f = 1.3; } } // 1대1: 각도 좁히기, 코앞이면 공으로 몸을 던진다 // 1대1: 각도 좁히기
    if (d(k, ball) < 1.75 && lb < 17 && k.tackleCD <= 0 && M.protect <= 0 && own.shield <= 0 && own.spin <= 0) { // 발밑 공 덮치기: 공이 발에서 떨어졌을 때(터치 직후·달릴 때) 더 잘 잡는다
      k.tackleCD = 0.45; const loose = own.kickCD > 0 || Math.hypot(own.vx, own.vy) > 6; k.dive = 0.5; k.diveDir = Math.sign(ball.y - k.y) || 1;
      if (s.rnd() < (loose ? 0.5 : 0.34) + skill * 0.45 - (own.feint > 0 ? 0.25 : 0)) { gain(s, k); own.kickCD = 0.5; own.stun = Math.max(own.stun, 0.3); sfx(s, 'tackle'); }
    }
  }
  moveTo(k, wx(tx, t), ty, f, dt);
}
