/* 선수 겉모습: 피부색·머리색·얼굴 생김새 씨앗. 선수 개인 자료가 아니라 팀 단위 분포에서 이름으로 고른다
   (같은 선수는 늘 같은 모습, 시뮬 난수는 쓰지 않는다 — 결과 불변). 실제 선수와 다를 수 있다 */
export const SKIN = ['#f6d8be', '#edc29d', '#dba77b', '#bb8153', '#8e5a37', '#5c3822']; // 밝은 → 어두운
export const HAIR = ['#0f0d0c', '#2a1c12', '#4a2f1a', '#7a5230', '#b89255', '#d8c17c', '#8a3b1c', '#9a9a98']; // 검정·흑갈·갈·밝은 갈·금·밝은 금·붉은·회색
// [피부 6단계 가중치, 머리색 8가지 가중치]
const DIST: Record<string, [number[], number[]]> = {
  KOR: [[2, 7, 2, 0, 0, 0], [8, 3, 1, 0, 0, 0, 0, 0]], JPN: [[2, 7, 2, 0, 0, 0], [8, 3, 1, 0, 0, 0, 0, 0]],
  BRA: [[1, 2, 3, 3, 2, 1], [6, 3, 1, 0, 0, 0, 0, 0]], ARG: [[3, 5, 3, 1, 0, 0], [3, 5, 3, 1, 0, 0, 0, 0]],
  FRA: [[2, 2, 1, 2, 3, 3], [6, 3, 1, 0, 0, 0, 0, 0]], ENG: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 2, 1, 0, 1, 0]],
  ESP: [[3, 5, 3, 1, 0, 0], [3, 5, 3, 1, 0, 0, 0, 0]], GER: [[5, 3, 1, 1, 1, 1], [2, 3, 3, 2, 2, 1, 0, 0]],
  ITA: [[3, 5, 3, 0, 0, 0], [4, 5, 2, 0, 0, 0, 0, 0]], NED: [[4, 2, 1, 1, 2, 2], [3, 2, 2, 2, 2, 1, 0, 0]],
  POR: [[2, 5, 3, 1, 1, 0], [5, 4, 2, 0, 0, 0, 0, 0]], BEL: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 1, 1, 0, 1, 0]],
  CRO: [[5, 4, 1, 0, 0, 0], [2, 4, 3, 2, 1, 0, 0, 0]], URU: [[3, 5, 3, 1, 0, 0], [4, 5, 2, 0, 0, 0, 0, 0]],
  MEX: [[1, 3, 5, 2, 0, 0], [7, 3, 0, 0, 0, 0, 0, 0]], USA: [[4, 3, 1, 1, 2, 2], [3, 3, 3, 1, 1, 0, 0, 0]],
  SEN: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]], GHA: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]], NGA: [[0, 0, 0, 1, 4, 6], [10, 1, 0, 0, 0, 0, 0, 0]],
  MAR: [[1, 3, 5, 3, 1, 0], [8, 3, 0, 0, 0, 0, 0, 0]], AUS: [[5, 3, 1, 1, 1, 0], [2, 3, 3, 2, 2, 1, 1, 0]],
  COL: [[1, 2, 3, 3, 2, 1], [7, 3, 0, 0, 0, 0, 0, 0]], DEN: [[6, 3, 0, 0, 1, 0], [1, 2, 3, 3, 3, 2, 1, 0]],
  SUI: [[4, 3, 1, 1, 1, 1], [3, 3, 3, 1, 1, 0, 0, 0]],
};
const DFLT: [number[], number[]] = [[2, 3, 2, 1, 1, 1], [5, 3, 2, 1, 1, 0, 0, 0]];
/** 분포 표에 없는 국적(클럽 선수, 55차)은 가까운 나라의 분포를 빌린다 — 없으면 DFLT */
const SAME: Record<string, string> = {};
for (const [k, list] of Object.entries({ DEN: 'NOR SWE FIN ISL', GER: 'AUT POL CZE SVK HUN UKR RUS', CRO: 'SRB BIH MNE SVN MKD ALB KOS BUL ROU', ITA: 'GRE TUR', ENG: 'SCO WAL NIR IRL', SEN: 'CIV CMR MLI GUI COD GAB BFA TOG GAM ZAM ZIM ANG MOZ BEN SLE GNB CGO EQG CPV JAM HAI TRI RSA UGA KEN', MAR: 'EGY ALG TUN LBY IRQ IRN KSA', COL: 'ECU VEN PER PAN DOM', URU: 'PAR CHI', MEX: 'BOL CRC HON', KOR: 'CHN PRK', USA: 'CAN', AUS: 'NZL' })) for (const c of list.split(' ')) SAME[c] = k;
function hash(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(w: number[], r: number) { let sum = 0; for (const x of w) sum += x; let q = r * sum; for (let i = 0; i < w.length; i++) { q -= w[i]; if (q < 0) return i; } return w.length - 1; }
/** 씨앗에서 n번째 0~1 값 (얼굴 생김새의 각 항목에 하나씩) */
export function lookBit(seed: number, n: number) { let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
export interface Look { skin: string; hair: string; seed: number; tone: number; }
/** 선수별 겉모습 지정(48차, '닮은 느낌'만): 널리 알려진 특징을 [피부 톤 0~5, 머리색 0~7(`HAIR`), 머리 모양 0~6, 수염 0~4]로 적은 것 — 사진을 옮긴 것이 아니고 기억 기준이라 틀릴 수 있다.
    머리 모양: 0 삭발 · 1 짧게 깎음 · 2 짧은 머리 · 3 앞을 세운 머리 · 4 긴 머리 · 5 곱슬(크게) · 6 묶은 머리 / 수염: 0 없음 · 1 까칠하게 · 2 턱수염 · 3 콧수염+턱 · 4 콧수염. 키 = 영문 이름(`nameEn`). 없는 선수는 팀 분포에서 고른다 */
const OV: Record<string, [number, number, number, number]> = {
  "Son Heung-min": [1, 0, 2, 0], "Kim Min-jae": [1, 0, 2, 0], "Lee Kang-in": [1, 0, 2, 0], "Hwang Hee-chan": [2, 0, 1, 0],
  "Hwang In-beom": [1, 0, 2, 0], "Lee Jae-sung": [1, 0, 2, 0], "Oh Hyeon-gyu": [1, 0, 2, 0], "Seol Young-woo": [1, 0, 2, 0],
  "Jo Hyeon-woo": [1, 0, 3, 0], "Kim Seung-gyu": [1, 0, 2, 0], "Messi": [1, 1, 2, 2], "J. Álvarez": [1, 1, 2, 0],
  "Lautaro Martínez": [2, 0, 2, 1], "De Paul": [2, 0, 3, 2], "Mac Allister": [0, 3, 2, 1], "Enzo Fernández": [1, 1, 2, 0],
  "Romero": [2, 0, 2, 1], "Tagliafico": [1, 1, 2, 1], "E. Martínez": [1, 1, 2, 2], "Otamendi": [2, 0, 2, 2],
  "Vinícius Júnior": [5, 0, 1, 0], "Raphinha": [3, 0, 2, 1], "Marquinhos": [3, 0, 1, 1], "Bruno Guimarães": [2, 1, 2, 1],
  "Endrick": [4, 0, 1, 0], "Danilo": [3, 0, 1, 1], "Gabriel Magalhães": [4, 0, 1, 1], "Estêvão": [3, 0, 5, 0],
  "Kane": [0, 3, 2, 1], "Bellingham": [3, 0, 1, 0], "Rice": [0, 1, 2, 1], "Saka": [4, 0, 1, 1],
  "Pickford": [0, 3, 2, 0], "Alexander-Arnold": [3, 0, 1, 1], "Palmer": [0, 2, 2, 0], "Mbappé": [4, 0, 1, 0],
  "Dembélé": [4, 0, 2, 1], "Tchouaméni": [5, 0, 1, 1], "Camavinga": [5, 0, 2, 0], "Koundé": [4, 0, 5, 1],
  "Maignan": [4, 0, 0, 2], "Rabiot": [0, 1, 4, 1], "Upamecano": [5, 0, 1, 2], "Saliba": [5, 0, 1, 0],
  "Koné": [5, 0, 1, 1], "Olise": [3, 0, 5, 0], "Rodri": [1, 1, 2, 1], "Pedri": [1, 0, 2, 0],
  "Lamine Yamal": [3, 0, 2, 0], "Nico Williams": [5, 0, 5, 0], "Cucurella": [1, 1, 5, 1], "Unai Simón": [1, 1, 2, 1],
  "Fabián Ruiz": [1, 1, 2, 1], "Merino": [1, 1, 2, 2], "Zubimendi": [1, 1, 2, 0], "Porro": [1, 1, 2, 1],
  "Raya": [1, 0, 2, 2], "Dani Olmo": [1, 1, 2, 1], "Musiala": [3, 0, 2, 0], "Wirtz": [0, 2, 2, 0],
  "Kimmich": [0, 3, 2, 1], "Raum": [0, 3, 2, 1], "Pavlović": [1, 1, 2, 0], "Tah": [5, 0, 1, 1],
  "Barella": [1, 1, 2, 1], "Donnarumma": [1, 0, 2, 2], "Tonali": [1, 1, 4, 1], "Bastoni": [1, 1, 2, 1],
  "Dimarco": [1, 1, 2, 1], "Calafiori": [1, 1, 4, 1], "Di Lorenzo": [1, 0, 2, 2], "Frattesi": [1, 1, 2, 1],
  "Van Dijk": [3, 0, 6, 2], "Gravenberch": [4, 0, 2, 0], "Dumfries": [4, 0, 1, 1], "Reijnders": [2, 1, 2, 1],
  "Frimpong": [5, 0, 2, 0], "J. Timber": [4, 0, 2, 0], "Van de Ven": [0, 3, 2, 0], "Koopmeiners": [0, 3, 2, 1],
  "Cristiano Ronaldo": [2, 0, 3, 0], "Bruno Fernandes": [1, 1, 2, 1], "Bernardo Silva": [1, 1, 2, 1], "Rúben Dias": [1, 0, 2, 1],
  "Rafael Leão": [4, 0, 5, 1], "Vitinha": [1, 1, 2, 0], "João Neves": [1, 2, 2, 0], "Nuno Mendes": [4, 0, 1, 0],
  "João Cancelo": [3, 0, 1, 2], "Diogo Dalot": [1, 0, 2, 1], "João Palhinha": [1, 0, 2, 2], "Rúben Neves": [1, 1, 2, 1],
  "Diogo Costa": [1, 0, 2, 1], "Kevin De Bruyne": [0, 6, 2, 1], "Romelu Lukaku": [5, 0, 1, 2], "Youri Tielemans": [1, 1, 2, 1],
  "Charles De Ketelaere": [0, 3, 2, 0], "Leandro Trossard": [0, 2, 2, 1], "Luka Modrić": [0, 3, 4, 0], "Joško Gvardiol": [0, 1, 2, 1],
  "Mateo Kovačić": [0, 1, 2, 1], "Ivan Perišić": [1, 1, 2, 1], "Andrej Kramarić": [0, 3, 2, 0], "Valverde": [0, 2, 2, 0],
  "D. Núñez": [2, 0, 6, 1], "R. Araújo": [4, 0, 1, 0], "Bentancur": [1, 0, 2, 1], "De Arrascaeta": [1, 0, 2, 1],
  "Torreira": [1, 0, 2, 1], "Hirving Lozano": [2, 0, 2, 0], "Santiago Giménez": [1, 1, 2, 1], "Christian Pulisic": [0, 2, 2, 1],
  "Weston McKennie": [3, 0, 5, 0], "Tyler Adams": [4, 0, 1, 0], "Sergiño Dest": [3, 0, 5, 0], "Antonee Robinson": [4, 0, 1, 0],
  "Yunus Musah": [5, 0, 1, 0], "Folarin Balogun": [4, 0, 1, 0], "Kalidou Koulibaly": [5, 0, 0, 1], "Nicolas Jackson": [5, 0, 2, 0],
  "Idrissa Gueye": [5, 0, 0, 1], "Kudus": [5, 0, 5, 0], "Partey": [5, 0, 1, 1], "Semenyo": [5, 0, 1, 0],
  "Victor Osimhen": [5, 4, 1, 0], "Ademola Lookman": [5, 0, 1, 1], "Alex Iwobi": [5, 0, 1, 1], "Wilfred Ndidi": [5, 0, 1, 0],
  "Hakimi": [3, 0, 2, 1], "Bounou": [2, 0, 2, 1], "Brahim Díaz": [2, 0, 2, 0], "Mazraoui": [2, 0, 2, 2],
  "Takefusa Kubo": [1, 0, 2, 0], "Kaoru Mitoma": [1, 0, 2, 0], "Ritsu Doan": [1, 0, 2, 0], "Daichi Kamada": [1, 0, 2, 0],
  "Takehiro Tomiyasu": [1, 0, 2, 0], "Zion Suzuki": [3, 0, 1, 0], "Harry Souttar": [1, 1, 2, 2], "Jackson Irvine": [0, 2, 4, 4],
  "L. Díaz": [3, 0, 2, 1], "D. Sánchez": [5, 0, 1, 0], "Pierre-Emile Højbjerg": [0, 3, 2, 1], "Rasmus Højlund": [0, 4, 2, 0],
  "Andreas Christensen": [0, 4, 2, 0], "Granit Xhaka": [0, 1, 1, 1], "Manuel Akanji": [4, 0, 1, 1], "Dan Ndoye": [4, 0, 2, 0],
};
/** 선수별 지정: 머리 모양·수염 (없으면 undefined — `player.ts`·`textures.ts`가 씨앗에서 고른다) */
export function lookOv(nameEn?: string): { style: number; beard: number } | undefined { const o = nameEn ? OV[nameEn] : undefined; return o ? { style: o[2], beard: o[3] } : undefined; }
export function lookOf(code: string, name: string, num: number): Look {
  const seed = hash(code + '|' + name + '|' + num), [ws, wh] = DIST[code] ?? DIST[SAME[code]] ?? DFLT;
  const ov = OV[name]; if (ov) return { skin: SKIN[ov[0]], hair: HAIR[ov[1]], seed, tone: ov[0] }; // 선수별 지정
  const tone = pick(ws, lookBit(seed, 0)); let hi = pick(wh, lookBit(seed, 1)); if (tone >= 4 && hi > 1) hi = 0; // 어두운 피부엔 검은 머리
  return { skin: SKIN[tone], hair: HAIR[hi], seed, tone };
}
