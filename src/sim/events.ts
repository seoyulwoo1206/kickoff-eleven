import type { Sim, SfxType } from './types';

// 시뮬은 DOM·오디오를 모르므로 연출은 이벤트로만 내보낸다. 앱이 틱마다 꺼내 처리하고 호스트는 게스트에게 중계한다.
export const banner = (s: Sim, big: string, small: string, ms: number, goal = false) => { s.ev.push({ k: 'banner', big, small, ms, goal }); };
export const sfx = (s: Sim, type: SfxType) => { s.ev.push({ k: 'sfx', type }); };
export const crowdSwell = (s: Sim, amt: number, dur: number) => { s.ev.push({ k: 'crowd', amt, dur }); };
export const puff = (s: Sim, x: number, y: number, n: number, sp: number) => { s.ev.push({ k: 'puff', x, y, n, sp }); };
export const shake = (s: Sim, v: number) => { s.ev.push({ k: 'shake', v }); };
