/** 미니맵 자리(왼쪽 위 모서리, CSS px). PC·세로 폰은 오른쪽 위(버튼 줄 아래), 가로 폰(터치)은 화면 아래 가운데 —
    좁은 가로 화면에선 오른쪽 위에 두면 경기장을 넓게 가린다(41차). 오른쪽 아래 버튼 묶음과 겹치면 왼쪽으로 민다 */
export function miniPos(cw: number, ch: number, mw: number, mh: number, ins: { t: number; r: number; b: number; l: number }) {
  if (cw > ch && document.body.classList.contains('touch')) {
    const sc = parseFloat(document.documentElement.style.getPropertyValue('--btn-scale')) || 1;
    const right = cw - Math.max(16, ins.r + 10) - 168 * sc - 12; // 버튼 묶음의 왼쪽 끝 (패스 버튼이 묶음 오른쪽 끝에서 98 + 70px)
    return { x: Math.max(ins.l + 8, Math.min((cw - mw) / 2, right - mw)), y: ch - mh - Math.max(8, ins.b) - 4 };
  }
  return { x: cw - mw - Math.max(12, ins.r), y: ins.t + 56 };
}
