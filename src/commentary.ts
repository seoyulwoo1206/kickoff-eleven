/* 해설 (32차에 다시 씀): 캐스터(중계)와 해설위원 두 사람이 말한다. 화면 위 자막(#cmt) + 브라우저 음성 합성(한국어 목소리가 있을 때만).
   시뮬과 무관(사건을 듣기만 한다). 자막을 그대로 읽지 않는다 — 말(say)은 따로 쓰고, 장면의 흥분도 ex(0 차분 ~ 1 절정)로 빠르기·높이를 바꾼다.
   경기 상황(점수·시간·슈팅·점유율·선방 수·코너킥 수·누가 몇 골)을 기억해 같은 사건도 다르게 말한다: 선제골/동점골/역전골/쐐기골/추격골·극장골·멀티골·해트트릭,
   슛 → 선방/골대/빗나감, 역습, 볼 돌리기, 조용한 시간의 한마디(기록 소개), 카드·교체·추가시간.
   중요도 pri: 1 흐름 · 2 장면 · 3 골·휘슬 — 덜 중요한 말은 앞말이 끝날 때까지 참는다. 해설위원의 뒷말은 `later`에 넣어 1.8~3초 뒤에 */
export type CmtMode = 'voice' | 'text' | 'off';
export const CMT = { mode: 'voice' as CmtMode, sound: true, /** 화면을 나가 있다 (말하지 않는다) */ away: false };
export const CMT_NAME: Record<CmtMode, string> = { voice: '음성', text: '자막', off: '끄기' };
export interface CmtCtx { teams: [string, string]; score: [number, number]; /** 경기 시계(분) */ min: number; half: number; shots: [number, number]; /** 팀 0 점유율 % */ poss: number; /** 팀별 간판 선수 */ stars: [string, string]; }

const now = () => performance.now(), clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 받침에 따라 조사를 고른다 (한글로 끝나지 않으면 받침 없는 쪽) */
const jong = (w: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const ig = (w: string) => w + (jong(w) ? '이' : '가'), en = (w: string) => w + (jong(w) ? '은' : '는'), gwa = (w: string) => w + (jong(w) ? '과' : '와');
const lastPick = new Map<string, number>();
/** 문구 고르기: 같은 묶음에서 바로 앞에 쓴 것은 피한다 */
function pick(key: string, a: string[]) { let i = Math.floor(Math.random() * a.length); if (a.length > 1 && i === lastPick.get(key)) i = (i + 1 + Math.floor(Math.random() * (a.length - 1))) % a.length; lastPick.set(key, i); return a[i]; }
const chance = (p: number) => Math.random() < p;

let ctx: CmtCtx = { teams: ['', ''], score: [0, 0], min: 0, half: 1, shots: [0, 0], poss: 50, stars: ['', ''] };
interface Booth { goals: Map<string, number>; saves: [number, number]; corners: [number, number]; trailed: [boolean, boolean]; shot: { at: number; t: number; n: string } | null; lineAt: number; idleAt: number; lateSaid: boolean; spellAt: number; lastScorer: string; ep: number; }
const fresh = (): Booth => ({ goals: new Map(), saves: [0, 0], corners: [0, 0], trailed: [false, false], shot: null, lineAt: -1e9, idleAt: now(), lateSaid: false, spellAt: -1e9, lastScorer: '', ep: 0 });
let B = fresh();
const later: { at: number; ep: number; fn: () => void }[] = [];
/** 해설위원의 뒷말: ms 뒤에, 그사이 큰 장면(골·휘슬)이 없었으면 */
const after = (ms: number, fn: () => void) => { later.push({ at: now() + ms, ep: B.ep, fn }); };
export function cmtCtx(c: CmtCtx) { ctx = c; for (const t of [0, 1]) if (c.score[t] < c.score[1 - t]) B.trailed[t] = true; }
export function cmtReset() { B = fresh(); later.length = 0; lastPri = 0; lastAt = -1e9; }

/* ── 목소리 ── */
let hideAt = 0, lastAt = -1e9, lastPri = 0, tried = 0, voices: [SpeechSynthesisVoice | null, SpeechSynthesisVoice | null] = [null, null], spTok = 0;
const box = () => document.getElementById('cmt');
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
/** 캐스터·해설위원 목소리 고르기: 자연스러운(온라인·Natural) 목소리와 남성 목소리를 먼저. 목소리가 하나뿐이면 해설위원은 같은 목소리를 낮게 */
function pickVoices() {
  if (voices[0] || tried > 60 || !canSpeak()) return voices; tried++;
  const sc = (v: SpeechSynthesisVoice) => (/Natural|Online|Neural/i.test(v.name) ? 4 : 0) + (/InJoon|Hyunsu|BongJin|GookMin|Male|남성/i.test(v.name) ? 3 : 0) + (/Google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  const ko = window.speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)).sort((a, b) => sc(b) - sc(a));
  if (ko.length) voices = [ko[0], ko[1] ?? null];
  return voices;
}
type Part = [string, number]; // [말, 흥분도 0~1]
function speak(parts: Part[], who: 0 | 1, pri: number) {
  if (CMT.mode !== 'voice' || !CMT.sound || CMT.away || !canSpeak()) return;
  const [va, vb] = pickVoices(), v = who === 1 && vb ? vb : va; if (!v) return; const syn = window.speechSynthesis;
  let cut = false; if (pri >= 2) { if (syn.speaking || syn.pending) { syn.cancel(); cut = true; } } else if (syn.speaking || syn.pending) return;
  const go = () => {
    for (const [t, ex] of parts) {
      const u = new SpeechSynthesisUtterance(t); u.voice = v; u.lang = v.lang; u.volume = 1;
      if (who === 0) { u.rate = clamp(1.12 + ex * 0.4, 0.8, 1.7); u.pitch = clamp(1.0 + ex * 0.5, 0.5, 1.7); } // 캐스터: 흥분할수록 빠르고 높게
      else { u.rate = 1.02 + ex * 0.12; u.pitch = vb ? 0.95 : 0.7; } // 해설위원: 차분하고 낮게
      try { syn.speak(u); } catch { /* 일부 브라우저는 사용자 입력 전엔 막는다 */ }
    }
  };
  if (cut) { const tk = ++spTok; window.setTimeout(() => { if (tk === spTok && !CMT.away) go(); }, 70); } else go(); // cancel 직후 바로 speak하면 삼켜지는 브라우저가 있다
}
interface Line { text: string; say?: string | Part[]; pri?: number; ex?: number; who?: 0 | 1; }
/** 한마디: 자막을 띄우고 읽는다. 앞말보다 덜 중요하면 참는다(false) */
function line(l: Line): boolean {
  const pri = l.pri ?? 1, ex = l.ex ?? 0.3, who = l.who ?? 0;
  if (CMT.mode === 'off' || !l.text) return false; const t = now(), el = box(); if (!el) return false;
  if (pri <= lastPri && t - lastAt < (pri >= 3 ? 300 : pri === 2 ? 1300 : 2800)) return false;
  if (pri < lastPri && t < hideAt) return false;
  lastAt = t; lastPri = pri; B.lineAt = t; B.idleAt = t; if (pri >= 3) B.ep++;
  el.textContent = l.text; el.hidden = false; el.classList.toggle('hot', pri >= 3); el.classList.toggle('pundit', who === 1); hideAt = t + 1900 + l.text.length * 62;
  speak(typeof l.say === 'object' ? l.say : [[l.say ?? l.text, ex]], who, pri);
  return true;
}
/** 조용한 시간의 한마디: 14초 넘게 말이 없으면 흐름·기록을 짚는다 */
function idle() {
  const [a, b] = ctx.teams, [s0, s1] = ctx.score, lead: number = s0 === s1 ? -1 : s0 > s1 ? 0 : 1, diff = Math.abs(s0 - s1), opts: (() => Line)[] = [];
  opts.push(() => ({ text: pick('id0', ['팽팽한 흐름이 이어집니다', '양 팀, 중원에서 치열하게 부딪히고 있습니다', '서로 틈을 주지 않고 있습니다', '숨 고르기에 들어간 양 팀입니다']), ex: 0.15 }));
  opts.push(() => ({ text: `${ctx.min}분이 지나고 있습니다. ${a} ${s0}, ${b} ${s1}`, ex: 0.2 }));
  if (Math.abs(ctx.poss - 50) >= 7) { const t = ctx.poss > 50 ? 0 : 1, p = Math.round(t === 0 ? ctx.poss : 100 - ctx.poss); opts.push(() => ({ who: 1, text: pick('id1', [`점유율은 ${ctx.teams[t]} 쪽이 ${p}퍼센트로 앞서고 있어요`, `공은 ${ig(ctx.teams[t])} 더 오래 갖고 있습니다. ${p}퍼센트예요`]) })); }
  if (ctx.shots[0] + ctx.shots[1] >= 3 && ctx.shots[0] !== ctx.shots[1]) { const t = ctx.shots[0] > ctx.shots[1] ? 0 : 1; opts.push(() => ({ who: 1, text: pick('id2', [`슈팅은 ${ctx.shots[0]} 대 ${ctx.shots[1]}. ${ig(ctx.teams[t])} 더 적극적으로 두드리고 있습니다`, `${ctx.teams[t]}, 슈팅 수에서 앞서고 있어요. 골만 터지면 되는데요`]) })); }
  if (ctx.min >= 55 && s0 + s1 === 0) opts.push(() => ({ who: 1, text: pick('id3', ['아직 0의 균형이 깨지지 않고 있습니다. 한 골 싸움이에요', '이런 경기는 한 방으로 갈립니다. 집중력이 중요하죠']) }));
  if (lead >= 0 && diff === 1 && ctx.min >= 60) opts.push(() => ({ who: 1, text: pick('id4', [`${ctx.teams[1 - lead]}, 한 골이면 됩니다. 아직 시간은 있어요`, `${en(ctx.teams[lead])} 이 한 골을 지켜야 하고, ${en(ctx.teams[1 - lead])} 따라붙어야 합니다`]) }));
  if (ctx.stars[0] && chance(0.5)) { const t = chance(0.5) ? 0 : 1, n = ctx.stars[t]; if (n) opts.push(() => ({ who: 1, text: pick('id5', [`${n}에게 공이 가면 뭔가 일어날 것 같은 분위기죠`, `${ctx.teams[t]}의 공격은 결국 ${n}의 발끝에서 시작됩니다`]) })); }
  line({ pri: 1, ex: 0.15, ...opts[Math.floor(Math.random() * opts.length)]() });
}
/** 매 프레임: 자막 지우기, 미뤄 둔 뒷말, 조용할 때 한마디. playing = 경기가 흐르는 중 */
export function cmtTick(playing = false) {
  const t = now(), el = box(); if (el && !el.hidden && t > hideAt) { el.hidden = true; lastPri = 0; }
  for (let i = later.length - 1; i >= 0; i--) if (t >= later[i].at) { const q = later.splice(i, 1)[0]; if (q.ep === B.ep && playing) q.fn(); }
  if (B.shot && t - B.shot.at > 4000) B.shot = null;
  if (!playing || CMT.mode === 'off') { B.idleAt = t; return; }
  if (!B.lateSaid && ctx.half === 2 && ctx.min >= 85 && Math.abs(ctx.score[0] - ctx.score[1]) <= 1 && t - B.lineAt > 2500) { // 막판 한 골 차·동점: 한 번만
    B.lateSaid = true; const d = ctx.score[0] - ctx.score[1];
    line({ pri: 2, ex: 0.6, text: d === 0 ? '이제 5분 남짓! 한 골이면 승부가 갈립니다!' : `남은 시간이 얼마 없습니다! ${ctx.teams[d > 0 ? 1 : 0]}, 총공세에 나서야 합니다!` });
  } else if (t - B.idleAt > 14000 && chance(0.02)) idle();
}
export function cmtStop() { const el = box(); if (el) el.hidden = true; lastPri = 0; lastAt = -1e9; later.length = 0; spTok++; if (canSpeak()) window.speechSynthesis.cancel(); }

export const cmt = {
  start() {
    const [a, b] = ctx.teams;
    line({ pri: 3, ex: 0.75, text: pick('st', [`${a} 대 ${b}! 주심의 휘슬과 함께 경기가 시작됩니다!`, `자, 드디어 시작입니다! ${gwa(a)} ${b}의 맞대결!`, `킥오프! ${a} 대 ${b}, 90분의 승부가 지금 막을 올립니다!`]) });
    after(3200, () => line({ who: 1, pri: 1, text: ctx.stars[0] && chance(0.6) ? pick('st2', [`오늘 ${ig(ctx.stars[0])} 얼마나 해 주느냐, 이게 관전 포인트죠`, `${ctx.stars[1] || ctx.stars[0]}의 발끝을 주목해 보시죠`]) : pick('st3', ['초반 주도권 싸움이 중요합니다. 누가 먼저 흐름을 잡느냐예요', '초반 10분, 여기서 분위기가 정해집니다']) }));
  },
  second() {
    const d = ctx.score[0] - ctx.score[1];
    line({ pri: 3, ex: 0.6, text: '후반전이 시작됩니다! ' + (d === 0 ? pick('se0', ['승부는 아직 원점입니다!', '남은 45분에 모든 게 걸려 있습니다!']) : `${ig(ctx.teams[d > 0 ? 0 : 1])} ${Math.abs(d)}골 앞선 채로 출발합니다!`) });
  },
  half() {
    const [a, b] = ctx.teams, [s0, s1] = ctx.score, [h0, h1] = ctx.shots;
    line({ pri: 3, ex: 0.4, text: `전반전 종료! ${a} ${s0}, ${b} ${s1}` });
    after(2800, () => line({ who: 1, pri: 2, text: s0 + s1 === 0 ? pick('hf0', ['골은 없었지만 내용은 팽팽했어요. 후반에 승부가 갈리겠습니다', '서로 조심스러웠던 전반입니다. 후반엔 누군가 승부수를 던져야죠']) : h0 !== h1 ? `슈팅 수 ${h0} 대 ${h1}. ${[a, b][h0 > h1 ? 0 : 1]} 쪽이 더 몰아붙인 전반이었습니다` : '아주 팽팽한 전반전이었습니다. 후반이 더 기대되네요' }));
  },
  full() {
    const [a, b] = ctx.teams, [s0, s1] = ctx.score, w: number = s0 === s1 ? -1 : s0 > s1 ? 0 : 1, hi = Math.max(s0, s1), lo = Math.min(s0, s1), wn = w < 0 ? '' : [a, b][w];
    const text = w < 0 ? pick('ft0', [`경기 종료! ${s0} 대 ${s1}, 승부를 가리지 못했습니다`, `휘슬이 울립니다! ${s0} 대 ${s1} 무승부!`])
      : B.trailed[w] ? `경기 종료! 역전승입니다! ${ig(wn)} 경기를 뒤집었습니다! ${hi} 대 ${lo}!`
      : hi - lo >= 3 ? `경기 종료! ${wn}의 완승입니다! ${hi} 대 ${lo}!` : pick('ft1', [`경기 종료! ${ig(wn)} ${hi} 대 ${lo}로 승리를 가져갑니다!`, `휘슬! ${wn}의 승리입니다! ${hi} 대 ${lo}!`]);
    line({ pri: 3, ex: w < 0 ? 0.5 : 0.85, text });
    after(3000, () => line({ who: 1, pri: 2, text: w >= 0 && B.lastScorer ? pick('ft2', [`오늘의 승부처는 역시 ${B.lastScorer}의 그 한 방이었죠`, `${wn}, 결정력에서 차이를 만들었습니다`]) : '양 팀 모두 박수받을 만한 경기였습니다' }));
  },
  extra() { line({ pri: 3, ex: 0.7, text: '90분으로는 부족했습니다! 연장전에 돌입합니다!' }); },
  shootout() { line({ pri: 3, ex: 0.8, text: '결국 승부차기입니다! 이제 한 발 한 발이 승부를 가릅니다!' }); },
  /** dist: 골까지 거리(m) */
  shot(n: string, t: number, dist: number) {
    B.shot = { at: now(), t, n };
    const text = dist > 24 ? pick('sh0', [`${n}, 멀리서 때립니다!`, `${n}! 과감한 중거리 슛!`, `${n}, 벼락같은 중거리포!`, `${n}, 그대로 때려 봅니다!`])
      : dist < 11 ? pick('sh1', [`${n}, 결정적인 찬스! 슛!`, `${n}! 문전에서 슛!`, `골문 앞 ${n}! 때립니다!`, `${n}, 완벽한 기회! 슛!`])
      : pick('sh2', [`${n}, 슛!`, `${n} 때립니다!`, `${n}의 슈팅!`, `${n}! 노려봅니다!`]);
    line({ pri: 2, ex: dist < 11 ? 0.9 : 0.75, text });
  },
  save(gk: string, t: number) {
    B.shot = null; const k = ++B.saves[t];
    line({ pri: 2, ex: 0.8, text: pick('sv', [`막았습니다! ${gk}의 선방!`, `${gk}! 슈퍼 세이브!`, `아, ${ig(gk)} 막아냅니다!`, `${gk}, 몸을 날려 걷어냅니다!`, `걸렸습니다! ${gk}!`]) });
    if (k >= 3 || chance(0.4)) after(2000, () => line({ who: 1, pri: 1, text: k >= 3 ? `${gk}, 오늘 벌써 ${k}번째 선방입니다. 골문이 든든해요` : pick('sv2', ['반응 속도가 정말 좋았어요', '이건 골키퍼가 한 골 막은 겁니다', '슛 코스는 좋았는데 키퍼가 더 잘했네요', '키퍼가 끝까지 공을 보고 있었어요']) }));
  },
  /** 골대를 맞았다 (슛 직후에만) */
  post() {
    if (!B.shot || now() - B.shot.at > 3000) return; B.shot = null;
    line({ pri: 2, ex: 1, text: pick('po', ['골대! 골대를 맞고 나옵니다!', '아아, 골대! 한 뼘이 모자랐습니다!', '골포스트! 들어가는 줄 알았는데요!']) });
    after(2000, () => line({ who: 1, pri: 1, text: pick('po2', ['골대가 살렸네요. 들어갔으면 막을 수 없는 공이었어요', '키퍼도 손을 못 썼어요. 정말 아쉬운 장면입니다']) }));
  },
  /** 공이 나갔다: 방금 슛이 막히지도 들어가지도 않았으면 빗나간 것 */
  out() {
    if (!B.shot || now() - B.shot.at > 3200) return; const n = B.shot.n; B.shot = null;
    line({ pri: 2, ex: 0.5, text: pick('ms', ['아, 빗나갑니다!', '살짝 벗어납니다! 아쉬워요!', '골문을 외면합니다!', '힘이 너무 들어갔네요, 넘어갑니다!', `${n}, 머리를 감싸 쥡니다. 빗나갔어요!`]) });
  },
  /** n: 득점자(자책골이면 null), t: 득점한 팀. ctx.score는 이미 올라간 점수 */
  goal(n: string | null, t: number) {
    B.shot = null; const [a, b] = ctx.teams, s = ctx.score, me = s[t], op = s[1 - t], prevMe = me - 1, tn = ctx.teams[t], on = ctx.teams[1 - t], sc = `${a} ${s[0]}, ${b} ${s[1]}`;
    if (!n) { line({ pri: 3, ex: 0.7, text: `아, 자책골입니다! ${on}로서는 뼈아픈 실점이에요. ${sc}` }); return; }
    const k = (B.goals.get(n) ?? 0) + 1; B.goals.set(n, k); B.lastScorer = n;
    const late = ctx.min >= 85 && me - op <= 1 && me >= op;
    const kind = me + op === 1 ? '선제골' : me === op ? '동점골' : prevMe === op ? (B.trailed[t] ? '역전골' : '다시 앞서가는 골') : me - op === 2 ? '추가골' : me - op >= 3 ? '쐐기골' : '추격골';
    const tag = k >= 3 ? '해트트릭' : k === 2 ? '멀티골' : late ? '극장골' : kind;
    const shout = pick('gl', ['골! 골! 골입니다!', '고오오올!', '들어갔습니다! 골!', '골망을 흔듭니다! 골!', '터졌습니다! 골!']);
    const call = k >= 3 ? `${n}! 해트트릭입니다! 오늘 세 골째!` : k === 2 ? `${n}! 오늘 두 번째 골! 멀티골입니다!` : late ? `${n}! 이 시간에 터진 ${kind}! 극장골입니다!` : pick('gl2', [`${n}! ${n}의 ${kind}입니다!`, `${ig(n)} 해냅니다! ${tn}의 ${kind}!`, `${n}의 ${kind}! 완벽한 마무리!`]);
    line({ pri: 3, ex: 1, text: `골! ${n}의 ${tag}! ${a} ${s[0]} : ${s[1]} ${b}`, say: [[shout, 1], [call, 0.9], [sc + '!', 0.55]] });
    after(4200, () => line({ who: 1, pri: 2, text:
      k >= 3 ? `${n}, 오늘은 정말 막을 수가 없네요. 완벽한 하루입니다`
      : late ? '이 시간대에 이런 골이 나옵니다! 축구는 끝날 때까지 모르는 거예요'
      : kind === '선제골' ? pick('ga0', [`선제골의 의미가 큽니다. 이제 ${ig(on)} 올라올 수밖에 없어요`, '먼저 넣는 팀이 경기를 편하게 가져가죠. 아주 중요한 골입니다'])
      : kind === '동점골' ? pick('ga1', ['경기가 원점으로 돌아갔습니다. 이제부터가 진짜 승부죠', `${tn}, 포기하지 않았습니다. 분위기가 살아났어요`])
      : kind === '역전골' ? pick('ga2', ['분위기가 완전히 넘어갔습니다! 경기가 뒤집혔어요', `${on}, 충격이 클 겁니다. 순식간에 뒤집혔어요`])
      : kind === '추격골' ? pick('ga3', ['아직 끝나지 않았습니다. 한 골이면 따라붙어요', `${tn}, 불씨를 살렸습니다`])
      : pick('ga4', ['이 골로 승부의 추가 많이 기울었습니다', `${on} 수비, 완전히 무너졌어요`, '마무리가 정말 침착했습니다']) }));
  },
  win(n: string) { line({ ex: 0.35, text: pick('wn', [`${n}, 깔끔하게 끊어냅니다`, `${n}의 태클! 공을 따냅니다`, `${n}, 읽고 있었어요`, `${ig(n)} 가로챕니다`, `${n}의 좋은 수비!`]) }); },
  clear(n: string) { line({ ex: 0.3, text: pick('cl', [`${n} 걷어냅니다`, `${n}, 일단 멀리 처리합니다`, `${n}${jong(n) ? '이' : ''} 머리로 위기를 넘깁니다`, `${n}, 급한 불을 끕니다`]) }); },
  chance(team: string) { line({ ex: 0.6, text: pick('ch', [`${team}, 문전까지 들어왔습니다!`, '위험한 장면입니다!', `${team}의 공격, 박스 안입니다!`, `${team}, 좋은 기회를 잡았습니다!`]) }); },
  counter(team: string) { line({ pri: 2, ex: 0.75, text: pick('ct', [`역습입니다! ${team}, 빠르게 올라갑니다!`, `${team}의 카운터! 수비가 돌아오지 못했어요!`, `뺏자마자 달립니다! ${team}의 역습!`]) }); },
  /** 한 팀이 오래 공을 돌린다 (30초에 한 번까지) */
  spell(team: string) { if (now() - B.spellAt < 30000) return; if (line({ ex: 0.15, text: pick('sp', [`${team}, 차분하게 공을 돌립니다`, `${ig(team)} 점유율을 가져가며 틈을 찾고 있습니다`, `패스, 또 패스. ${team}의 빌드업입니다`, `${team}, 서두르지 않습니다`]) })) B.spellAt = now(); },
  /** near: 골문 가까운 프리킥 */
  set(type: string, team: string, t: number, near = false) {
    if (type === 'corner') { const k = ++B.corners[t]; line({ pri: 2, ex: 0.5, text: pick('co', [`${team}의 코너킥!`, `코너킥입니다. ${team}, 세트피스 기회!`, `${team}, 코너킥을 얻어냅니다`]) }); if (k >= 3 && chance(0.5)) after(1900, () => line({ who: 1, text: `${team}, 벌써 ${k}번째 코너킥이에요. 계속 두드리고 있습니다` })); }
    else if (type === 'freekick') { if (near) line({ pri: 2, ex: 0.6, text: pick('fk', [`위험한 위치에서 프리킥입니다! ${team}`, `직접 노려볼 만한 거리예요. ${team}의 프리킥!`]) }); else if (chance(0.5)) line({ ex: 0.25, text: `${team}의 프리킥입니다` }); }
    else if (type === 'penalty') line({ pri: 3, ex: 1, text: pick('pk', ['페널티킥! 주심이 페널티 스폿을 가리킵니다!', `페널티킥이 선언됩니다! ${team}에게 절호의 기회!`]) });
    else if (type === 'goalkick' && chance(0.15)) line({ ex: 0.15, text: '골킥으로 다시 시작합니다' });
    else if (type === 'throw' && chance(0.1)) line({ ex: 0.15, text: `${team}의 스로인` });
  },
  offside() { line({ pri: 2, ex: 0.45, text: pick('of', ['깃발이 올라갑니다, 오프사이드!', '오프사이드! 한 발 빨랐습니다', '부심의 깃발, 오프사이드입니다']) }); },
  card(n: string, team: string, red: boolean) {
    if (red) { line({ pri: 3, ex: 0.95, text: pick('rd', [`레드카드! ${n}, 퇴장입니다!`, `퇴장! ${ig(team)} 한 명을 잃습니다!`]) }); after(3000, () => line({ who: 1, pri: 2, text: `${team}, 남은 시간 수적 열세를 버텨야 합니다. 큰 변수예요` })); }
    else { line({ pri: 2, ex: 0.55, text: pick('yl', [`옐로카드! ${n}, 경고를 받습니다`, `주심이 카드를 꺼냅니다. ${n}에게 경고!`, `거칠었어요. ${n}, 옐로카드입니다`]) }); if (chance(0.45)) after(2200, () => line({ who: 1, text: pick('yl2', ['조금 늦게 들어갔어요. 카드가 나올 만했습니다', `이제 ${n}, 조심해야 합니다. 한 장 더 받으면 퇴장이에요`]) })); }
  },
  sub(n: string) { line({ pri: 2, ex: 0.3, text: pick('sb', [`선수 교체입니다. ${n} 투입`, `${ig(n)} 그라운드를 밟습니다`]) }); if (chance(0.35)) after(2200, () => line({ who: 1, text: '분위기를 바꿔 보겠다는 벤치의 선택이죠' })); },
  added(min: number) { line({ pri: 2, ex: 0.35, text: pick('ad', [`추가시간은 ${min}분입니다`, `추가시간 ${min}분이 주어집니다`]) }); },
};
