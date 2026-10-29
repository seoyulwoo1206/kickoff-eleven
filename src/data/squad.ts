/* 선수단 데이터 스키마. 팀 JSON은 src/data/teams/<CODE>.json, 검증은 tools/validate-data.ts
   6대 지표(r)만 사람이 적고, 세부 능력치는 expand()가 포지션에 맞춰 전개한다 (필요하면 ov로 일부 덮어쓰기) */
export type Pos = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST' | 'CF';
export const POSES: Pos[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
export interface Main { pac: number; sho: number; pas: number; dri: number; def: number; phy: number; }
export interface GkMain { div: number; han: number; kic: number; ref: number; pos: number; }
export interface Detail {
  acc: number; spd: number; fin: number; pow: number; lon: number; sp: number; lp: number; vis: number; cro: number; ctl: number;
  agi: number; bal: number; str: number; sta: number; jmp: number; hea: number; mrk: number; stk: number; slt: number; int: number; rea: number;
}
export interface PlayerDef {
  name: string;        // 한글 이름 (국내 언론 표기)
  nameEn: string;      // 영문 이름 (통용 표기, 성 또는 통칭)
  num: number;         // 등번호
  pos: Pos;            // 주 포지션
  alt?: Pos[];         // 가능 포지션
  foot: 'L' | 'R';     // 주발
  weak: 1 | 2 | 3 | 4 | 5;  // 약발
  skill: 1 | 2 | 3 | 4 | 5; // 개인기
  height: number;      // cm
  age?: number;
  club?: string;
  uncertain?: boolean; // 소집 여부가 확실치 않음
  r: Main;             // 6대 지표 0~99 (GK도 적음: pac 민첩/달리기, sho 킥, pas 패스, dri 볼컨트롤, def 위치선정, phy 피지컬)
  gk?: GkMain;         // GK 전용
  ov?: Partial<Detail>; // 세부 능력치 덮어쓰기
}
export interface SquadDef {
  code: string; asOf: string; sources: string[];
  formation: string;   // formations.ts 키
  lineup: number[];    // 포메이션 슬롯 순서대로 등번호 11개 (GK 먼저)
  players: PlayerDef[];
}
const c = (v: number) => Math.max(1, Math.min(99, Math.round(v)));
/** 6대 지표 + 포지션 → 세부 능력치 */
export function expand(p: PlayerDef): Detail {
  const { pac, sho, pas, dri, def, phy } = p.r, pos = p.pos;
  const att = pos === 'ST' || pos === 'CF' || pos === 'LW' || pos === 'RW', mid = pos === 'CM' || pos === 'CAM' || pos === 'CDM' || pos === 'LM' || pos === 'RM', back = pos === 'CB' || pos === 'LB' || pos === 'RB';
  const wide = pos === 'LB' || pos === 'RB' || pos === 'LM' || pos === 'RM' || pos === 'LW' || pos === 'RW';
  const d: Detail = {
    acc: c(pac + (p.height > 188 ? -3 : p.height < 175 ? 2 : 0)), spd: c(pac + (p.height > 188 ? 1 : 0)),
    fin: c(sho + (att ? 3 : back ? -6 : 0)), pow: c(sho * 0.6 + phy * 0.4 + 2), lon: c(sho * 0.7 + pas * 0.3 - (back ? 4 : 0)),
    sp: c(pas + (mid ? 3 : 0)), lp: c(pas - (att ? 5 : 0) + (pos === 'CDM' || back ? 2 : 0)), vis: c(pas + (pos === 'CAM' || pos === 'CM' ? 3 : back ? -4 : 0)),
    cro: c(pas * 0.6 + dri * 0.2 + (wide ? 12 : -4)), ctl: c(dri + (pos === 'CB' ? -3 : 0)),
    agi: c(dri * 0.6 + pac * 0.4 - (p.height > 188 ? 5 : 0)), bal: c(dri * 0.5 + phy * 0.3 + 12 - (p.height > 188 ? 6 : 0)),
    str: c(phy + (p.height > 186 ? 3 : p.height < 174 ? -4 : 0)), sta: c(phy * 0.5 + pac * 0.2 + 25 + (mid || wide ? 4 : 0)),
    jmp: c(phy * 0.6 + (p.height - 180) * 0.8 + 28), hea: c(phy * 0.4 + (p.height - 180) * 1.2 + (pos === 'CB' || pos === 'ST' ? 38 : 26)),
    mrk: c(def + (back ? 3 : att ? -8 : 0)), stk: c(def + (back || pos === 'CDM' ? 3 : att ? -6 : 0)), slt: c(def - 2 + (pos === 'CB' ? 3 : att ? -8 : 0)),
    int: c(def + (pos === 'CDM' ? 4 : att ? -5 : 0)), rea: c((pac + sho + pas + dri + def + phy) / 6 + 6),
  };
  if (pos === 'GK') { const g = p.gk ?? { div: def, han: def, kic: sho, ref: def, pos: def }; d.rea = c(g.ref); d.jmp = c(g.div * 0.7 + 25); d.lp = c(g.kic); d.sp = c(g.kic - 5); d.fin = c(20); d.mrk = c(30); d.stk = c(25); d.slt = c(20); }
  return Object.assign(d, p.ov);
}
/** 포지션별 종합 (6대 지표 가중 평균) */
export function overall(p: PlayerDef): number {
  const { pac, sho, pas, dri, def, phy } = p.r;
  if (p.pos === 'GK') { const g = p.gk; return c(g ? (g.div * 0.21 + g.han * 0.21 + g.kic * 0.05 + g.ref * 0.21 + g.pos * 0.21 + pac * 0.11) : def); }
  const W: Record<Pos, number[]> = {
    GK: [0, 0, 0, 0, 1, 0],
    CB: [0.08, 0.02, 0.1, 0.08, 0.5, 0.22], LB: [0.2, 0.05, 0.18, 0.17, 0.3, 0.1], RB: [0.2, 0.05, 0.18, 0.17, 0.3, 0.1],
    CDM: [0.08, 0.05, 0.25, 0.14, 0.33, 0.15], CM: [0.1, 0.12, 0.3, 0.22, 0.14, 0.12], CAM: [0.12, 0.2, 0.3, 0.28, 0.03, 0.07],
    LM: [0.2, 0.15, 0.25, 0.27, 0.06, 0.07], RM: [0.2, 0.15, 0.25, 0.27, 0.06, 0.07], LW: [0.22, 0.22, 0.18, 0.3, 0.02, 0.06], RW: [0.22, 0.22, 0.18, 0.3, 0.02, 0.06],
    ST: [0.18, 0.4, 0.1, 0.2, 0.01, 0.11], CF: [0.16, 0.33, 0.18, 0.26, 0.01, 0.06],
  };
  const w = W[p.pos]; return c(pac * w[0] + sho * w[1] + pas * w[2] + dri * w[3] + def * w[4] + phy * w[5]);
}
