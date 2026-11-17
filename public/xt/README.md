# xt_tables.json

킥오프 일레븐용 xT 표. `re_xt/scripts/export_game_tables.py`로 만들었다 (2026-11-17).
게임에서는 `public/xt/xt_tables.json`에 두고 `fetch('./xt/xt_tables.json')`으로 읽으면 된다 (경로는 상대 경로, 약 158KB).

## 구조

```
version   1
source    "2026 기초 R&E xT · StatsBomb Open Data 2015/16 · 학습 971경기 · df60d3a7"
grid      { nx: 120, ny: 80, unit: "yard", order: "row=y, col=x" }
T         ["5", "10", "15", "inf"]
partitions
  uniform | quadtree | tree | threat
    M        구역 수 (96, 94, 96, 96)
    nstar    DTMC 단계 예산 n* (T별, 검증 경기로 고른 값)
    zone     길이 9600 정수 배열. zone[iy*120 + ix] = 구역 번호 (0 ~ M−1)
             ix = floor(x야드), iy = floor(y야드), 공격 방향은 +x(오른쪽)
    xt
      dtmc   { "5": [M개], "10": [...], "15": [...], "inf": [...] }
      smp    { 같은 모양 }   SMP의 inf는 φ(60초)
      tf     { 같은 모양 }   트랜스포머의 drive 시작점 예측 (구역마다 값 하나)
    tf_note  { zones_filled_with_dtmc: [], max_rel_sd_within_zone }
```

## 게임 좌표에서 찾기

```ts
// 게임: 105×68m, 팀 0은 +x 공격, 팀 1은 −x 공격
const X = t === 0 ? x : 105 - x, Y = t === 0 ? y : 68 - y;   // 팀 기준으로 180° 회전
const ix = Math.min(119, Math.max(0, Math.floor(X / 105 * 120)));
const iy = Math.min(79, Math.max(0, Math.floor(Y / 68 * 80)));
const z = tb.partitions[part].zone[iy * 120 + ix];
const xt = tb.partitions[part].xt[model][T][z];               // T초 안 득점 확률 (실제 축구 기준)
```

y = 0이 화면 위쪽 터치라인인지 한 번 확인할 것. Threat Grid를 그렸을 때 보고서 그림 1과 위아래가 반대면 `Y = 68 − Y`.

## n* (DTMC 단계 예산)

| 분할 | T = 5 | 10 | 15 |
|---|---|---|---|
| Uniform | 3 | 7 | 11 |
| Quadtree | 3 | 6 | 8 |
| Decision Tree | 4 | 8 | 12 |
| Threat Grid | 3 | 6 | 9 |

## 검산 (만들 때 자동으로 확인함)

- 이 표로 평가 303경기 drive 시작점을 다시 채점했다. DTMC·SMP × 분할 4종 × T 4종 = 32칸이 `xt_grid_scores.csv`(보고서 표 4 등)와 소수 둘째 자리까지 같다(최대 차이 0.0000%p). 예: Decision Tree DTMC T=10 → 24.69%.
- SMP(60초) − DTMC(∞) 최대 차이는 3.0×10⁻⁴ ~ 8.1×10⁻⁴이다(보고서 1.2.2절).
- 트랜스포머의 drive 시작점 예측은 같은 구역 안에서 사실상 같다(상대 표준편차 최대 0.008). 시작점이 없는 구역은 없다.
- 구역 지도 모양이 보고서 그림 1과 같다(골문 앞이 Decision Tree는 잘게, Quadtree는 크게).

## 주의

- 값은 **실제 축구(2015/16) 기준** T초 안 득점 확률이라, 게임 속 실제 득점 확률과는 다르다. 화면에는 "실제 축구 기준 위협도"로 표시한다.
- 오픈플레이 기준이다. 세트피스를 찬 순간은 기여 계산에서 뺀다.
- 화면 어딘가에 "Data: StatsBomb Open Data"를 적는다.
