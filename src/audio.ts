import type { SfxType } from './sim/types';

/* Web Audio로 합성하는 효과음·관중 소음. 외부 파일 없음 */
let AC: AudioContext | null = null;
let crowd: { src: AudioBufferSourceNode; g: GainNode; lfo: OscillatorNode } | null = null;
export const audio = { on: true };
export function ensureAudio() {
  if (!AC) { try { AC = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* 오디오 없음 */ } }
  if (AC && AC.state === 'suspended') AC.resume();
}
export function crowdStart() {
  if (!audio.on || !AC || crowd) return;
  try {
    const len = 4, buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), c0 = buf.getChannelData(0);
    for (let i = 0; i < c0.length; i++) c0[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.4;
    const g = AC.createGain(); g.gain.value = 0.045;
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.016; lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(AC.destination); src.start(); lfo.start(); crowd = { src, g, lfo };
  } catch { /* */ }
}
export function crowdStop() { if (!crowd) return; try { crowd.src.stop(); crowd.lfo.stop(); } catch { /* */ } crowd = null; }
export function crowdSwell(amt: number, dur: number) {
  if (!crowd || !AC) return; const t = AC.currentTime, g = crowd.g.gain;
  try { g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.045), t); g.linearRampToValueAtTime(amt, t + 0.3); g.linearRampToValueAtTime(0.045, t + dur); } catch { /* */ }
}
/** 야유: 낮은 웅성거림 1.3초 (카드·거친 파울 뒤) */
export function boo() {
  if (!audio.on || !AC) return; const t = AC.currentTime;
  try {
    const len = 1.3, buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), c0 = buf.getChannelData(0);
    for (let i = 0; i < c0.length; i++) c0[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.15); g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(f).connect(g).connect(AC.destination); src.start(t);
  } catch { /* */ }
}
export function sfx(type: SfxType) {
  if (!audio.on || !AC) return; const t = AC.currentTime;
  try {
    if (type === 'kick' || type === 'tackle' || type === 'post') {
      const o = AC.createOscillator(), g = AC.createGain(); o.type = type === 'post' ? 'square' : 'triangle';
      o.frequency.setValueAtTime(type === 'kick' ? 190 : type === 'post' ? 900 : 120, t); o.frequency.exponentialRampToValueAtTime(type === 'post' ? 400 : 55, t + (type === 'post' ? 0.25 : 0.09));
      g.gain.setValueAtTime(type === 'post' ? 0.12 : 0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + (type === 'post' ? 0.3 : 0.11));
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.32);
    } else if (type === 'whistle' || type === 'long') {
      const dur = type === 'long' ? 1 : 0.35, o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = 2850; lfo.frequency.value = 30; lg.gain.value = 130; lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(AC.destination); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
    } else if (type === 'goal') {
      const len = 2.2, buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), c0 = buf.getChannelData(0);
      for (let i = 0; i < c0.length; i++) c0[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.25); g.gain.linearRampToValueAtTime(0, t + len);
      src.connect(f).connect(g).connect(AC.destination); src.start(t);
    }
  } catch { /* */ }
}

/* ---------- 입장 음악: 외부 파일 없이 합성한 짧은 팡파르 (약 9초) ---------- */
let anthemNodes: { master: GainNode } | null = null;
export function anthemStop(fade = 0.35) {
  if (!anthemNodes || !AC) return; const t = AC.currentTime, m = anthemNodes.master, g = m.gain; anthemNodes = null;
  try { g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(0.0001, t + fade); } catch { /* */ }
  window.setTimeout(() => { try { m.disconnect(); } catch { /* */ } }, (fade + 0.3) * 1000);
}
export function anthem() {
  if (!audio.on || !AC) return; anthemStop(0.05);
  try {
    const ac = AC, t0 = ac.currentTime + 0.08;
    const master = ac.createGain(); master.gain.setValueAtTime(0.0001, t0 - 0.05); master.gain.exponentialRampToValueAtTime(0.5, t0 + 0.2);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    const dly = ac.createDelay(0.5), fb = ac.createGain(), wet = ac.createGain(); dly.delayTime.value = 0.23; fb.gain.value = 0.28; wet.gain.value = 0.22; // 홀 울림
    master.connect(comp); comp.connect(ac.destination); master.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(comp);
    anthemNodes = { master };
    const N: Record<string, number> = { D2: 73.42, G2: 98, A2: 110, B2: 123.47, D3: 146.83, Fs3: 185, G3: 196, A3: 220, B3: 246.94, Cs4: 277.18, D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392, A4: 440, B4: 493.88, Cs5: 554.37, D5: 587.33, E5: 659.25, Fs5: 739.99, G5: 783.99, A5: 880 };
    const brass = (f: number, t: number, dur: number, vol: number) => { // 살짝 어긋난 톱니파 둘 + 열렸다 닫히는 로우패스
      const g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.09); lp.frequency.linearRampToValueAtTime(1300, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.06, dur - 0.18)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
      for (const det of [-7, 7]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.2); }
      lp.connect(g); g.connect(master);
    };
    const pad = (f: number, t: number, dur: number, vol: number) => { // 합창 느낌의 느린 패드
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.5); g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
      const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.006; vib.connect(vg); vib.start(t); vib.stop(t + dur + 0.4);
      const voices: [OscillatorType, number][] = [['triangle', 1], ['sine', 2]];
      for (const [type, mul] of voices) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f * mul; vg.connect(o.frequency); o.connect(g); o.start(t); o.stop(t + dur + 0.4); }
      g.connect(master);
    };
    const timp = (t: number, vol: number, f = 82) => { // 팀파니: 떨어지는 사인 + 짧은 잡음
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75);
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.08), ac.sampleRate), c = buf.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / c.length);
      const src = ac.createBufferSource(), f2 = ac.createBiquadFilter(), g2 = ac.createGain(); src.buffer = buf; f2.type = 'lowpass'; f2.frequency.value = 700; g2.gain.value = vol * 0.5; src.connect(f2); f2.connect(g2); g2.connect(master); src.start(t);
    };
    const cymbal = (t: number, rise: number, vol: number) => { // 심벌: 커졌다가 터지는 고역 잡음
      const len = rise + 2.2, buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), c = buf.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 5200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + rise); g.gain.setValueAtTime(vol, t + rise + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(hp); hp.connect(g); g.connect(master); src.start(t);
    };
    // 화음 진행: D – A – Bm – G – (D 마무리). 한 마디 1.6초
    const BAR = 1.6, chords: [string, string[]][] = [['D2', ['D3', 'Fs3', 'A3', 'D4']], ['A2', ['A3', 'Cs4', 'E4']], ['B2', ['B3', 'D4', 'Fs4']], ['G2', ['G3', 'B3', 'D4']]];
    chords.forEach(([bass, notes], i) => {
      const t = t0 + i * BAR; timp(t, 0.55, N[bass]); timp(t + BAR * 0.5, 0.3, N[bass]);
      brass(N[bass], t, BAR - 0.05, 0.16); for (const n of notes) { brass(N[n], t, BAR - 0.08, 0.085); pad(N[n] * 2, t, BAR, 0.035); }
    });
    // 주선율 (금관)
    const mel: [string, number, number][] = [['D4', 0, 0.5], ['Fs4', 0.5, 0.3], ['A4', 0.8, 0.75], ['A4', 1.6, 0.5], ['Cs5', 2.1, 0.3], ['E5', 2.4, 0.75], ['D5', 3.2, 0.5], ['B4', 3.7, 0.3], ['Fs5', 4.0, 0.75], ['G5', 4.8, 0.5], ['Fs5', 5.3, 0.3], ['E5', 5.6, 0.35], ['Cs5', 5.95, 0.4]];
    for (const [n, at, dur] of mel) brass(N[n], t0 + at, dur, 0.15);
    // 마무리: 팀파니 롤 → D 장화음 + 심벌
    const tf = t0 + 4 * BAR; for (let k = 0; k < 5; k++) timp(tf - 0.5 + k * 0.1, 0.22 + k * 0.06, 78);
    cymbal(tf - 0.8, 0.8, 0.2); timp(tf, 0.7, 73.42);
    brass(N.D2, tf, 2.6, 0.2); for (const n of ['D3', 'A3', 'D4', 'Fs4', 'A4']) { brass(N[n], tf, 2.6, 0.085); pad(N[n] * 2, tf, 2.8, 0.04); }
    brass(N.D5, tf, 0.45, 0.16); brass(N.Fs5, tf + 0.45, 0.45, 0.16); brass(N.A5, tf + 0.9, 1.8, 0.17);
    master.gain.setValueAtTime(0.5, tf + 2.2); master.gain.linearRampToValueAtTime(0.0001, tf + 3.1);
  } catch (e) { console.warn('anthem', e); }
}
