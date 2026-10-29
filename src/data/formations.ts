/* 포메이션: 11개 슬롯의 기본 위치(팀 0 기준, x 0→105 공격 방향, y 0→68)와 역할·포지션.
   lineup은 이 슬롯 순서대로 등번호를 적는다 (슬롯 0 = GK) */
import type { Pos } from './squad';
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export interface Slot { pos: Pos; role: Role; x: number; y: number; }
export const FORMATIONS: Record<string, Slot[]> = {
  '4-4-2': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'LB', role: 'DF', x: 17, y: 10 }, { pos: 'CB', role: 'DF', x: 15, y: 26 }, { pos: 'CB', role: 'DF', x: 15, y: 42 }, { pos: 'RB', role: 'DF', x: 17, y: 58 },
    { pos: 'LM', role: 'MF', x: 33, y: 12 }, { pos: 'CM', role: 'MF', x: 30, y: 28 }, { pos: 'CM', role: 'MF', x: 30, y: 40 }, { pos: 'RM', role: 'MF', x: 33, y: 56 },
    { pos: 'ST', role: 'FW', x: 46, y: 28 }, { pos: 'ST', role: 'FW', x: 46, y: 40 }],
  '4-3-3': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'LB', role: 'DF', x: 17, y: 10 }, { pos: 'CB', role: 'DF', x: 15, y: 26 }, { pos: 'CB', role: 'DF', x: 15, y: 42 }, { pos: 'RB', role: 'DF', x: 17, y: 58 },
    { pos: 'CDM', role: 'MF', x: 27, y: 34 }, { pos: 'CM', role: 'MF', x: 33, y: 22 }, { pos: 'CM', role: 'MF', x: 33, y: 46 },
    { pos: 'LW', role: 'FW', x: 45, y: 12 }, { pos: 'ST', role: 'FW', x: 48, y: 34 }, { pos: 'RW', role: 'FW', x: 45, y: 56 }],
  '4-2-3-1': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'LB', role: 'DF', x: 17, y: 10 }, { pos: 'CB', role: 'DF', x: 15, y: 26 }, { pos: 'CB', role: 'DF', x: 15, y: 42 }, { pos: 'RB', role: 'DF', x: 17, y: 58 },
    { pos: 'CDM', role: 'MF', x: 27, y: 27 }, { pos: 'CDM', role: 'MF', x: 27, y: 41 },
    { pos: 'LM', role: 'MF', x: 38, y: 12 }, { pos: 'CAM', role: 'MF', x: 38, y: 34 }, { pos: 'RM', role: 'MF', x: 38, y: 56 },
    { pos: 'ST', role: 'FW', x: 48, y: 34 }],
  '3-5-2': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'CB', role: 'DF', x: 15, y: 20 }, { pos: 'CB', role: 'DF', x: 14, y: 34 }, { pos: 'CB', role: 'DF', x: 15, y: 48 },
    { pos: 'LM', role: 'MF', x: 30, y: 8 }, { pos: 'CM', role: 'MF', x: 30, y: 25 }, { pos: 'CDM', role: 'MF', x: 26, y: 34 }, { pos: 'CM', role: 'MF', x: 30, y: 43 }, { pos: 'RM', role: 'MF', x: 30, y: 60 },
    { pos: 'ST', role: 'FW', x: 46, y: 27 }, { pos: 'ST', role: 'FW', x: 46, y: 41 }],
  '5-3-2': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'LB', role: 'DF', x: 19, y: 8 }, { pos: 'CB', role: 'DF', x: 15, y: 22 }, { pos: 'CB', role: 'DF', x: 14, y: 34 }, { pos: 'CB', role: 'DF', x: 15, y: 46 }, { pos: 'RB', role: 'DF', x: 19, y: 60 },
    { pos: 'CM', role: 'MF', x: 31, y: 22 }, { pos: 'CDM', role: 'MF', x: 28, y: 34 }, { pos: 'CM', role: 'MF', x: 31, y: 46 },
    { pos: 'ST', role: 'FW', x: 46, y: 27 }, { pos: 'ST', role: 'FW', x: 46, y: 41 }],
  '3-4-3': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'CB', role: 'DF', x: 15, y: 20 }, { pos: 'CB', role: 'DF', x: 14, y: 34 }, { pos: 'CB', role: 'DF', x: 15, y: 48 },
    { pos: 'LM', role: 'MF', x: 31, y: 9 }, { pos: 'CM', role: 'MF', x: 29, y: 27 }, { pos: 'CM', role: 'MF', x: 29, y: 41 }, { pos: 'RM', role: 'MF', x: 31, y: 59 },
    { pos: 'LW', role: 'FW', x: 45, y: 16 }, { pos: 'ST', role: 'FW', x: 48, y: 34 }, { pos: 'RW', role: 'FW', x: 45, y: 52 }],
  '4-1-4-1': [
    { pos: 'GK', role: 'GK', x: 4, y: 34 }, { pos: 'LB', role: 'DF', x: 17, y: 10 }, { pos: 'CB', role: 'DF', x: 15, y: 26 }, { pos: 'CB', role: 'DF', x: 15, y: 42 }, { pos: 'RB', role: 'DF', x: 17, y: 58 },
    { pos: 'CDM', role: 'MF', x: 26, y: 34 },
    { pos: 'LM', role: 'MF', x: 36, y: 11 }, { pos: 'CM', role: 'MF', x: 34, y: 26 }, { pos: 'CM', role: 'MF', x: 34, y: 42 }, { pos: 'RM', role: 'MF', x: 36, y: 57 },
    { pos: 'ST', role: 'FW', x: 48, y: 34 }],
};
export const FORMATION_KEYS = Object.keys(FORMATIONS);
