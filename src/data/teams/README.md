# 선수단 데이터 작성 규칙

파일: `<CODE>.json` (예: `KOR.json`). 스키마는 `src/data/squad.ts`의 `SquadDef`/`PlayerDef`. 검증: `npx tsx tools/validate-data.ts KOR`.

```json
{
  "code": "KOR",
  "asOf": "2026-10-14",
  "sources": ["https://...", "https://..."],
  "formation": "4-2-3-1",
  "lineup": [1, 3, 4, 20, 2, 6, 8, 7, 10, 11, 9],
  "players": [
    { "name": "손흥민", "nameEn": "Son Heung-min", "num": 7, "pos": "LW", "alt": ["ST", "RW"], "foot": "R", "weak": 5, "skill": 4,
      "height": 183, "age": 34, "club": "LAFC", "r": { "pac": 84, "sho": 87, "pas": 80, "dri": 84, "def": 40, "phy": 72 } },
    { "name": "조현우", "nameEn": "Jo Hyeon-woo", "num": 21, "pos": "GK", "foot": "R", "weak": 3, "skill": 1, "height": 189, "age": 35, "club": "Ulsan HD",
      "r": { "pac": 60, "sho": 62, "pas": 60, "dri": 55, "def": 80, "phy": 76 }, "gk": { "div": 82, "han": 78, "kic": 66, "ref": 86, "pos": 79 } }
  ]
}
```

- **asOf**: 참고한 가장 최근 소집(경기) 날짜. **sources**: 실제로 읽은 URL 2개 이상(협회·FIFA·주요 언론·Transfermarkt·Wikipedia 등).
- **인원** 23~26명. GK 3명 이상. 등번호는 실제 국가대표 등번호(최근 소집 기준), 모르면 합리적으로 배정하고 `"uncertain": true`.
- 최근 소집에 없지만 핵심 선수(부상 등)는 넣어도 되지만 `"uncertain": true`.
- **lineup**: `formation`의 슬롯 순서대로 등번호 11개. 슬롯 순서는 `src/data/formations.ts` 참고 (0=GK, 그다음 수비 왼쪽→오른쪽, 미드필더, 공격). 실제 최근 경기 선발 기준.
- **포지션** 값: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST, CF.
- **이름**: `name`은 한국 언론 표기(예: 음바페, 벨링엄, 비니시우스), `nameEn`은 통용 표기(성 위주, 브라질 선수는 통칭).
- **6대 지표 r** (0~99, 직접 추정. EA/넥슨 수치 베끼지 말 것): pac 속력, sho 슈팅, pas 패스, dri 드리블, def 수비, phy 피지컬. GK는 r에도 값을 적고(pac 민첩, sho 킥, pas 패스, dri 볼컨트롤, def 위치선정, phy 피지컬) `gk`에 div 다이빙·han 핸들링·kic 킥·ref 반응·pos 위치선정.
- **기준선** (전 팀 공통으로 맞춰야 상대 전력이 맞음):
  - 90+: 세계 최정상 5~8명만 (해당 지표가 세계 최고 수준일 때만. 예: 음바페 pac 95+)
  - 85~89: 빅클럽 핵심 주전
  - 80~84: 강팀 국가대표 주전
  - 74~79: 중위권 국가대표 주전 / 강팀 후보
  - 65~73: 약팀 후보·백업
  - 포지션과 무관한 지표는 낮게: 공격수 def 25~45, 센터백 sho 35~55, GK pac 50~65
  - 팀 선발 11명 종합 평균 목표: BRA/ARG/FRA/ENG/ESP 84~86 · GER/POR/NED/ITA 82~84 · BEL/CRO/URU/COL/MAR/DEN/SUI/SEN 78~81 · KOR/JPN/USA/MEX/NGA 76~79 · AUS/GHA 72~75 (검증기가 평균을 출력하니 맞춰 조정)
- **weak** 약발 1~5(양발 5), **skill** 개인기 1~5, **height** cm, **age** 2026-10 기준 만 나이.
