/* 해설: 경기 사건을 짧은 한마디로. 화면 아래 자막(#cmt) + 브라우저 음성 합성(한국어 목소리가 있을 때만).
   시뮬과 무관(사건을 듣기만 한다). 중요도 pri: 1 흐름(끊어냄·걷어냄) · 2 장면(슛·선방·세트피스·카드) · 3 골·휘슬 — 덜 중요한 말은 앞말이 끝날 때까지 참는다 */
export type CmtMode = 'voice' | 'text' | 'off';
export const CMT = { mode: 'voice' as CmtMode, sound: true };
export const CMT_NAME: Record<CmtMode, string> = { voice: '음성', text: '자막', off: '끄기' };
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** 받침에 따라 조사를 고른다 (한글로 끝나지 않으면 받침 없는 쪽) */
const josa = (w: string, a: string, b: string) => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b); };
let hideAt = 0, lastAt = -1e9, lastPri = 0, voice: SpeechSynthesisVoice | null = null, tried = 0;
const box = () => document.getElementById('cmt');
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
function koVoice() { // 목소리 목록은 늦게 채워지기도 한다 — 찾을 때까지 몇 번 다시 본다
  if (voice || tried > 40 || !canSpeak()) return voice; tried++;
  const vs = window.speechSynthesis.getVoices(); voice = vs.find(v => /^ko/i.test(v.lang) && v.localService) ?? vs.find(v => /^ko/i.test(v.lang)) ?? null; return voice;
}
export function say(text: string, pri = 1) {
  if (CMT.mode === 'off' || !text) return; const now = performance.now(), el = box(); if (!el) return;
  if (pri <= lastPri && now - lastAt < (pri >= 3 ? 400 : pri === 2 ? 1500 : 3200)) return;
  if (pri < lastPri && now < hideAt) return;
  lastAt = now; lastPri = pri; el.textContent = text; el.hidden = false; el.classList.toggle('hot', pri >= 3); hideAt = now + 1900 + text.length * 60;
  if (CMT.mode === 'voice' && CMT.sound && canSpeak()) {
    const v = koVoice(), syn = window.speechSynthesis; if (!v) return;
    if (pri >= 2) syn.cancel(); else if (syn.speaking || syn.pending) return;
    const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = pri >= 3 ? 1.22 : 1.14; u.pitch = pri >= 3 ? 1.15 : 1; u.volume = 0.9;
    try { syn.speak(u); } catch { /* 일부 브라우저는 사용자 입력 전엔 막는다 */ }
  }
}
export function cmtTick() { const el = box(); if (el && !el.hidden && performance.now() > hideAt) { el.hidden = true; lastPri = 0; } }
export function cmtStop() { const el = box(); if (el) el.hidden = true; lastPri = 0; lastAt = -1e9; if (canSpeak()) window.speechSynthesis.cancel(); }

export const cmt = {
  start: (a: string, b: string) => say(pick([`${a} 대 ${b}, 경기 시작합니다`, `${josa(a, '과', '와')} ${b}의 경기, 지금 시작됩니다`]), 3),
  half: (score: string) => say(`전반전이 끝났습니다. ${score}`, 3),
  second: () => say(pick(['후반전 시작합니다', '후반전, 다시 시작됩니다']), 3),
  full: (line: string) => say(`경기 종료! ${line}`, 3),
  shot: (n: string, far: boolean) => say(pick(far ? [`${n}, 중거리 슛!`, `${n} 멀리서 때립니다!`] : [`${n}, 슛!`, `${n} 때립니다!`, `${n}의 슈팅!`]), 2),
  save: (n: string) => say(pick([`${n} 선방!`, `골키퍼가 막아냅니다!`, `${n}, 잘 막았습니다`]), 2),
  goal: (n: string | null, score: string) => say(n ? pick([`골! ${n}의 득점입니다! ${score}`, `들어갔습니다! ${n}! ${score}`, `${n}, 골망을 흔듭니다! ${score}`]) : `자책골입니다! ${score}`, 3),
  win: (n: string) => say(pick([`${n} 끊어냅니다`, `${n}의 좋은 수비`, `${n} 가로챕니다`, `${n}, 공을 따냅니다`]), 1),
  clear: (n: string) => say(pick([`${n} 걷어냅니다`, `${n}, 머리로 걷어냅니다`]), 1),
  chance: (team: string) => say(pick([`${team}, 좋은 기회입니다`, `${team}의 공격이 이어집니다`, `${team}, 박스 근처까지 왔습니다`]), 1),
  set: (type: string, team: string) => {
    if (type === 'corner') say(pick([`${team}의 코너킥입니다`, `코너킥, ${team}`]), 2);
    else if (type === 'freekick') say(pick([`${team}의 프리킥입니다`, `프리킥 기회, ${team}`]), 2);
    else if (type === 'penalty') say(`페널티킥이 선언됩니다! ${team}`, 3);
    else if (type === 'goalkick' && Math.random() < 0.2) say('골킥으로 다시 시작합니다', 1);
    else if (type === 'throw' && Math.random() < 0.12) say(`${team}의 스로인`, 1);
  },
  offside: () => say(pick(['오프사이드입니다', '오프사이드 깃발이 올라갑니다']), 2),
  note: (t: string) => say(t, 2), // 경고·퇴장·교체·추가시간 (배너의 작은 글자 그대로)
};
