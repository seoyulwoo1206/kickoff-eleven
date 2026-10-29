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
