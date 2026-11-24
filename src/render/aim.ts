import type { Inp } from '../input/actions';
/** 화면 표시(받을 선수·스루패스 도착 지점)에 쓰는 로컬 입력: 팀 번호 → 그 팀을 이 기기에서 조작하는 입력, 없으면 null (온라인 상대·AI). `main.ts`가 넣는다 */
export const AIM: { of: (t: number) => Inp | null } = { of: () => null };
