// 월드 단위는 미터. x 0→105, y 0→68, z 위. 팀 0은 +x 방향으로 공격.
export const W = 105, H = 68, CX = W / 2, CY = H / 2;
export const GH = 3.66, GZ = 2.44; // 골문 반폭, 크로스바 높이
export const STEP = 1 / 60; // 고정 시뮬 타임스텝
export const G = 22; // 중력 (게임용으로 조금 강함)
export const FA = 3.8, FB = 0.13; // 지면 마찰 dv/dt = -(FA + FB·v)
export const TEMPO = { slow: 0.76, normal: 0.88, fast: 1 } as const;
export type TempoKey = keyof typeof TEMPO;
