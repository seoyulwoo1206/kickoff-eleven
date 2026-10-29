/* 전술: 포메이션·수비 라인 높이·공격 성향·압박 강도. AI(사람 팀의 동료 포함)가 targetFor/bestAIPass/teamAI에서 읽는다 */
import { FORMATIONS, type Slot } from '../data/formations';
import type { Pos } from '../data/squad';
import type { Player, Sim } from './types';

export type Style = 'balanced' | 'possession' | 'counter' | 'wide';
export interface Tactics { form: string; line: -1 | 0 | 1; style: Style; press: 0 | 1 | 2; }
export const defaultTactics = (form = '4-4-2'): Tactics => ({ form: FORMATIONS[form] ? form : '4-4-2', line: 0, style: 'balanced', press: 1 });
export const LINE_NAMES = { '-1': '낮게', '0': '보통', '1': '높게' } as const;
export const STYLE_NAMES: Record<Style, string> = { balanced: '균형', possession: '점유', counter: '역습', wide: '측면' };
export const PRESS_NAMES = { '0': '약하게', '1': '보통', '2': '강하게' } as const;

const SAME: Record<Pos, Pos[]> = {
  GK: ['GK'], CB: ['CB', 'CDM', 'LB', 'RB'], LB: ['LB', 'LM', 'CB', 'LW'], RB: ['RB', 'RM', 'CB', 'RW'],
  CDM: ['CDM', 'CM', 'CB'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'CF', 'LW', 'RW'],
  LM: ['LM', 'LW', 'LB', 'CM'], RM: ['RM', 'RW', 'RB', 'CM'], LW: ['LW', 'LM', 'ST', 'CF'], RW: ['RW', 'RM', 'ST', 'CF'],
  ST: ['ST', 'CF', 'LW', 'RW'], CF: ['CF', 'ST', 'CAM'],
};
/** 포메이션을 바꾸면 현재 11명을 새 슬롯에 재배치 (자연 포지션이 맞는 선수부터). bx/by/role만 바뀐다 */
export function applyFormation(s: Sim, t: number, form: string) {
  const slots: Slot[] = FORMATIONS[form]; if (!slots) return;
  const list = s.team[t].filter(p => !p.off), used = new Set<Player>();
  const pick = (slot: Slot): Player | undefined => {
    if (slot.pos === 'GK') return list.find(p => p.role === 'GK' && !used.has(p));
    for (const want of SAME[slot.pos]) { const p = list.find(q => !used.has(q) && q.role !== 'GK' && q.pos === want); if (p) return p; }
    return list.find(q => !used.has(q) && q.role !== 'GK');
  };
  slots.forEach(slot => { const p = pick(slot); if (!p) return; used.add(p); p.bx = slot.x; p.by = slot.y; p.role = slot.role; });
  s.M.tac[t].form = form;
}
