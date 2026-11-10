export type Pat = 'solid' | 'stripes' | 'hoops' | 'half' | 'sash' | 'chevron' | 'check';
export interface TeamDef { code: string; name: string; pat: Pat; c1: string; c2: string; sh: string; gk: string; atk: number; def: number; spd: number; }
export interface Kit { pat: Pat; c1: string; c2: string; sh: string; gk: string; }
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export type DiffKey = 'easy' | 'normal' | 'hard';
export interface DiffDef { spd: number; react: number; tackle: number; err: number; gk: number; press: number; }

export const TEAMS: TeamDef[] = [
  { code: 'KOR', name: '대한민국', pat: 'solid', c1: '#d6243a', c2: '#1a1a2e', sh: '#f4f4f4', gk: '#19a974', atk: 83, def: 80, spd: 86 },
  { code: 'JPN', name: '일본', pat: 'solid', c1: '#1a3a8f', c2: '#f4f4f4', sh: '#1a3a8f', gk: '#ff9800', atk: 81, def: 79, spd: 88 },
  { code: 'BRA', name: '브라질', pat: 'solid', c1: '#ffd500', c2: '#0a7d3b', sh: '#1f4fd6', gk: '#2b2b2b', atk: 90, def: 81, spd: 87 },
  { code: 'ARG', name: '아르헨티나', pat: 'stripes', c1: '#8ccbf0', c2: '#ffffff', sh: '#111111', gk: '#f2a900', atk: 90, def: 83, spd: 83 },
  { code: 'FRA', name: '프랑스', pat: 'solid', c1: '#1b2d6e', c2: '#e63946', sh: '#f4f4f4', gk: '#8bc34a', atk: 89, def: 85, spd: 88 },
  { code: 'ENG', name: '잉글랜드', pat: 'solid', c1: '#f4f4f4', c2: '#14215c', sh: '#14215c', gk: '#ffd23f', atk: 87, def: 85, spd: 83 },
  { code: 'ESP', name: '스페인', pat: 'solid', c1: '#c60b1e', c2: '#ffc400', sh: '#1a2a5e', gk: '#2196f3', atk: 88, def: 84, spd: 82 },
  { code: 'GER', name: '독일', pat: 'chevron', c1: '#f2f2f2', c2: '#121212', sh: '#121212', gk: '#4caf50', atk: 86, def: 85, spd: 81 },
  { code: 'ITA', name: '이탈리아', pat: 'solid', c1: '#1f5fbf', c2: '#f4f4f4', sh: '#f4f4f4', gk: '#9ccc65', atk: 85, def: 88, spd: 80 },
  { code: 'NED', name: '네덜란드', pat: 'solid', c1: '#ff7900', c2: '#111111', sh: '#111111', gk: '#9c27b0', atk: 85, def: 83, spd: 84 },
  { code: 'POR', name: '포르투갈', pat: 'solid', c1: '#8a0f24', c2: '#2f8f3f', sh: '#2f8f3f', gk: '#00bcd4', atk: 88, def: 81, spd: 85 },
  { code: 'BEL', name: '벨기에', pat: 'solid', c1: '#d7262b', c2: '#111111', sh: '#111111', gk: '#f5d142', atk: 86, def: 82, spd: 82 },
  { code: 'CRO', name: '크로아티아', pat: 'check', c1: '#ffffff', c2: '#e02a2a', sh: '#f4f4f4', gk: '#1f2a44', atk: 84, def: 82, spd: 80 },
  { code: 'URU', name: '우루과이', pat: 'solid', c1: '#5cb3e4', c2: '#111111', sh: '#111111', gk: '#ff5722', atk: 84, def: 84, spd: 81 },
  { code: 'MEX', name: '멕시코', pat: 'solid', c1: '#1c6b3a', c2: '#f4f4f4', sh: '#f4f4f4', gk: '#ffc107', atk: 82, def: 80, spd: 84 },
  { code: 'USA', name: '미국', pat: 'sash', c1: '#f4f4f4', c2: '#1c3f94', sh: '#1c3f94', gk: '#ff6f00', atk: 82, def: 81, spd: 85 },
  { code: 'SEN', name: '세네갈', pat: 'solid', c1: '#f4f4f4', c2: '#1a8a3c', sh: '#1a8a3c', gk: '#ffd600', atk: 84, def: 82, spd: 88 },
  { code: 'MAR', name: '모로코', pat: 'solid', c1: '#c8102e', c2: '#1a8a3c', sh: '#1a8a3c', gk: '#ffffff', atk: 82, def: 86, spd: 84 },
  { code: 'AUS', name: '호주', pat: 'solid', c1: '#f6c21a', c2: '#1a5c35', sh: '#1a5c35', gk: '#111111', atk: 78, def: 79, spd: 82 },
  { code: 'COL', name: '콜롬비아', pat: 'hoops', c1: '#ffd400', c2: '#1c3f94', sh: '#1c3f94', gk: '#d32f2f', atk: 84, def: 80, spd: 85 },
  { code: 'DEN', name: '덴마크', pat: 'solid', c1: '#c8102e', c2: '#f4f4f4', sh: '#f4f4f4', gk: '#1f1f1f', atk: 82, def: 83, spd: 81 },
  { code: 'SUI', name: '스위스', pat: 'solid', c1: '#d52b1e', c2: '#f4f4f4', sh: '#f4f4f4', gk: '#1a237e', atk: 80, def: 84, spd: 80 },
  { code: 'GHA', name: '가나', pat: 'half', c1: '#f4f4f4', c2: '#c8102e', sh: '#111111', gk: '#2e7d32', atk: 80, def: 78, spd: 86 },
  { code: 'NGA', name: '나이지리아', pat: 'stripes', c1: '#1b9b4b', c2: '#f4f4f4', sh: '#1b9b4b', gk: '#111111', atk: 83, def: 79, spd: 87 },
];
export const DIFF: Record<DiffKey, DiffDef> = {
  // 난이도는 속도 치트 없이 반응 시간·판단 실수·압박·태클·키퍼로만 (spd는 1로 고정)
  easy: { spd: 1, react: 0.5, tackle: 0.1, err: 1.3, gk: 0.85, press: 0.9 },
  normal: { spd: 1, react: 0.28, tackle: 0.18, err: 0.8, gk: 1, press: 1.05 },
  hard: { spd: 1, react: 0.14, tackle: 0.28, err: 0.55, gk: 1.12, press: 1.2 },
};
/** 4-4-2 기본 위치 (팀 0 기준, 팀 1은 wx로 뒤집음) */
export const FORM: [Role, number, number][] = [['GK', 4, 34], ['DF', 17, 10], ['DF', 15, 26], ['DF', 15, 42], ['DF', 17, 58], ['MF', 33, 12], ['MF', 30, 28], ['MF', 30, 40], ['MF', 33, 56], ['FW', 46, 28], ['FW', 46, 40]];
export const NUMS = [1, 2, 4, 5, 3, 7, 8, 6, 11, 9, 10];
export const HAIR = ['#1b120c', '#3a2416', '#0e0e0e', '#5a3a1e', '#b88a4f', '#2a2018', '#6b4a2a'];
export const SKIN = ['#f1c7a3', '#d9a173', '#b57a4e', '#8b5a35', '#f3d4b8', '#6c4327'];

export function hexRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function colDist(a: string, b: string) { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
export function isLight(h: string) { const c = hexRgb(h); return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 > 150; }
export function kitFor(T: TeamDef, alt: boolean): Kit {
  if (!alt) return { pat: T.pat, c1: T.c1, c2: T.c2, sh: T.sh, gk: T.gk };
  const light = isLight(T.c1);
  return { pat: 'solid', c1: light ? T.c2 : '#f4f4f4', c2: light ? '#f4f4f4' : T.c1, sh: light ? '#f4f4f4' : T.c1, gk: T.gk };
}
/** 두 팀 홈 유니폼 색이 겹치면 두 번째 팀은 원정 유니폼 */
export function kitsClash(a: TeamDef, b: TeamDef) {
  return colDist(a.c1, b.c1) < 120 || (a.pat !== 'solid' && b.pat !== 'solid' && colDist(a.c2, b.c2) < 120);
}
export function kitCss(k: { pat: Pat; c1: string; c2: string }) {
  const a = k.c1, b = k.c2;
  switch (k.pat) {
    case 'stripes': return `repeating-linear-gradient(90deg,${a} 0 6px,${b} 6px 12px)`;
    case 'hoops': return `repeating-linear-gradient(180deg,${a} 0 6px,${b} 6px 12px)`;
    case 'half': return `linear-gradient(90deg,${a} 0 50%,${b} 50%)`;
    case 'sash': return `linear-gradient(135deg,${a} 0 40%,${b} 40% 58%,${a} 58%)`;
    case 'chevron': return `linear-gradient(180deg,${a} 0 55%,${b} 55% 70%,${a} 70%)`;
    case 'check': return `conic-gradient(${a} 25%,${b} 0 50%,${a} 0 75%,${b} 0) 0 0/12px 12px`;
    default: return `linear-gradient(180deg,${a} 0 100%)`;
  }
}
