# 킥오프 일레븐 (축구 게임)

11대11 축구 게임. Vite + TypeScript. `npm run dev`(5173), `npm run build` → `dist/`, `npm run typecheck`, `npm run sim`(헤드리스 AI vs AI). 로컬 확인은 `.claude/launch.json`의 `kickoff`. 외부 의존성은 Google Fonts와 온라인 대전 때만 동적 import되는 `peerjs`. 이전 단일 파일 버전은 `legacy/index.html`, 그 전 백업은 `_backup/`. 단계별 계획은 `PLAN.md`, 단계별 기록은 `PROGRESS.md`.

## 파일 구조
- `src/main.ts` 앱 진입점: 상태 머신(menu/play/paused/over), `startMatch`, 프레임 루프(`runSteps`), 온라인 호스트 60Hz `setInterval` 시뮬, 시뮬 이벤트(`s.ev`) → 배너·효과음·관중·먼지·흔들림·경기 종료(`drain`/`applyLocalEv`), 호스트는 같은 이벤트를 게스트에 중계
- `src/sim/` 시뮬레이션. DOM·오디오·렌더 의존 금지. 모든 함수는 `Sim` 객체 `s`를 첫 인자로 받음. 난수는 `s.rnd()`(시드, `rng.ts`)만 — `Math.random` 금지(결정론). 연출은 `events.ts`의 `banner/sfx/crowdSwell/puff/shake`로 `s.ev`에 push
  - `types.ts`(Player/Ball/Human/MatchInfo/Sim/SimEvent/MatchCfg) · `consts.ts`(W,H,G,FA,FB,STEP,TEMPO) · `util.ts`(clamp,d,wx,angApproach,angDiff,lerp)
  - `match.ts` `createMatch(cfg, inp?)`·`kickoff`·`setPiece`·`checkOut`·`goal`·`step`(한 틱; 풀타임이면 phase 'full' + `{k:'full'}` 이벤트)
  - `ball.ts` 킥·드리블(`knockOn`)·오프사이드·`gain`·패스 모델(`groundSpeed/groundLead`)·`shortPass/longPass/throughPass/chipShot/shoot`·태클·파울·`updateBall`·`ballControl`·`computePred/intercept`
  - `move.ts` `steer/chase/moveTo/targetFor/integrate` · `human.ts` `autoCursor/assistDir/humanUpdate/switchPlayer` · `ai/team.ts` `teamAI` · `ai/carrier.ts` `tryTackle/bestAIPass/aiCarrier` · `ai/gk.ts` `gkAI`
- `src/input/actions.ts` 액션 추상화: `ACTS=['pass','lob','through','shoot','chip','gkRush','sprint','run']`(순서가 온라인 비트마스크 순서), `Inp`(mx,my,keys,tx,ty,press/down/rel/holdT,touch), `keyDown/keyUp/readInput/clearPresses/dropKeys`. `keyboard.ts`(K1 방향키+S/A/W/D/Z/Q/X/E, K2 IJKL+B/V/N/M/./U/,/Space; `setK1`은 저장된 설정에 없는 새 액션에 기본 키를 붙임), `gamepad.ts`(표준 매핑 poll: A pass, B shoot, X through, Y lob, LB chip, LT run, L3 gkRush, RB/RT sprint, Start 일시정지), `touch.ts`(플로팅 조이스틱 `stickArea`, 반지름 58px, 세기 .18 미만 무시, 원 밖 1.15배까지 밀면 질주(옵션) + 5버튼 bA 패스/압박·bB 슛/슬라이딩·bC 질주·bD 스루/세컨드·bL 롱패스/전환·bR 침투/압박 지원, `skillArea` 스와이프 개인기, `touchGauge` 원형 게이지, `applyTouchStyle` 크기·투명도 CSS 변수)
- `src/render/types.ts` `IRenderer`(cam, resize, puff, render, reset, setQuality, setCamMode, fps). `main.ts`는 WebGL 되면 `three/scene.ts`의 `ThreeRenderer`, 아니면 `canvas2d.ts`의 2D `Renderer`
- `src/render/three/` 좌표: 시뮬 (x, y, z높이) → 월드 (x, Y=z높이, Z=y). `scene.ts`(카메라 tv/pro/top·햇빛 그림자 범위 추적·공·커서 링·먼지 스프라이트·골 리플레이 링버퍼(`pushFrame/loadFrame`, 골 1.3초 뒤 0.55배속)·2D 오버레이 캔버스 `#ov`(커서 라벨·이름표·침투/압박 화살표·파워바·미니맵·레터박스). 중계 카메라 조준점 y는 `near`(비스듬한 시선으로 화면 아래가 닿는 거리)만큼만 가까운 터치라인에서 떨어진다), `stadium.ts`(잔디 `onBeforeCompile` 디테일, 라인 지오메트리, 골대·그물 `Net`(흔들림 `updateNets`), 관중석 `ExtrudeGeometry` 계단 + `InstancedMesh` 관중(품질별 밀도), 광고판, 조명탑, 하늘돔. `Stadium.near`=카메라 쪽(큰 y) 관중석 — 중계 카메라가 그 자리(z 94~100)까지 내려가므로 `scene.ts`가 tv·top 모드에서 숨긴다(안 숨기면 화면 아래 절반이 가려짐)), `player.ts`(`PlayerModel`: 로컬 +X가 정면, 그룹 Y회전 = -dir, 팔다리 스윙은 Z축(+앞), 옆은 X축. `update(PoseState, ball, t)`로 포즈 계산 — 걷기/달리기/킥(kickCD 0.3→0)/슬라이딩/다이브/세리머니/스턴), `textures.ts`(잔디·유니폼 앞뒤+등번호·공·그물·광고·하늘·먼지·링 캔버스 텍스처)
- `src/render/canvas2d.ts` 2D 폴백 `Renderer`(원근 투영 `proj`, 관절형 벡터 선수, 미니맵)
- `src/net/peer.ts` PeerJS 연결(`NET`, `netHost/netJoin/netSend/netClose`, `LOCAL()`), `protocol.ts` 스냅샷(`makeSnap/applySnap/netInterp`)·입력(`encodeInput/applyNetInput`)
- `src/ui/` `menu.ts`(팀 그리드·세그·네트 상태), `hud.ts`(스코어보드·배너·추가시간), `result.ts`, `lineup.ts`(라인업 편집 오버레이 + 선수 카드 6각형, `openLineup` → 바뀐 등번호 배열을 `MatchCfg.lineups`로). 전술·교체·하프타임 패널·터치 게이지는 `main.ts`(`renderMenuTactics/renderPauseTactics/halftimePanel/gauges`). `ui/intro.ts`(입장 라인업 소개 `showIntro/hideIntro`, `#intro`). `src/options.ts`(localStorage `ko11v2`), `src/audio.ts`(Web Audio 합성: 효과음·관중·야유·입장 음악 `anthem/anthemStop` 9초 팡파르)
- `src/data/teams.ts` TEAMS(24팀, 유니폼 패턴 solid/stripes/hoops/half/sash/chevron/check), DIFF, FORM(4-4-2 폴백), 킷 유틸. `applySquadStrength()`가 앱 시작 시 atk/def/spd를 선수단 기준으로 덮어씀
- `src/data/squad.ts` 선수단 스키마(`PlayerDef` 6대 지표 r + GK `gk`, `expand()`가 세부 능력치 `Detail` 전개, `overall()` 포지션별 가중). `formations.ts` 7개 포메이션 슬롯(위치·역할·포지션). `squads.ts` 조회(`squadOf/lineupOf/slotsOf/strengthOf/topPlayers/aliasOf/displayName/shirtName`). `teams/<CODE>.json`이 데이터(작성 규칙은 `teams/README.md`), `teams/index.ts`는 `npx tsx tools/gen-squad-index.ts`로 생성. 검증 `npx tsx tools/validate-data.ts [CODE]`
- `src/sim/rules.ts` 파울 처리 `foulCommitted`(카드 판정·어드밴티지 `M.adv`), `updateAdvantage`, `card/sendOff`(`p.off`: 모든 선수 루프는 `off`를 건너뛴다 — team 필터·offsideLine·ballControl·nearestOutfield·AI), `addedMinutes`, `buildWall`, `substitute`(선수 객체 덮어쓰기, `M.bench/subs`). `src/sim/tactics.ts` `Tactics{form,line,style,press}`·`applyFormation`(포지션 유사도로 재배치). `M.tac[t]`를 `targetFor`(라인·풀백 오버래핑·윙어 침투·성향), `teamAI`(압박 속도·마크 거리·트리거), `bestAIPass`(성향·시야)가 읽음
- `src/sim/shootout.ts` 승부차기(`startShootout/soNext/soRecord/soUpdate`, `M.so`). 연장은 `step`에서 half 3·4(105'/120'), `M.knockout`일 때만. `MatchCfg.shootoutOnly`면 바로 승부차기. 사람 팀 키퍼의 다이브 방향은 `gkAI`가 스틱(my)에서 읽음
- `src/cup.ts` 토너먼트 상태(`Cup`: groups·fixtures·stage·ko)와 진행(`newCup/advance/userFixture/table/recordResult`, 다른 경기는 헤드리스 90초), 저장 `ko11cup`. 화면은 `ui/cup.ts`. `main.ts`의 `cupMatch`가 켜지면 결과 카드에 "토너먼트로"가 뜨고 `advance`가 호출됨
- `src/ui/keys.ts` 키 설정(P1 `K1`을 `setK1`로 교체, `ko11keys`). 입장 연출은 `main.ts` `introT`(`INTRO_LEN` 9.2초, 시뮬 정지, 아무 키·클릭으로 `skipIntro`) + 렌더 `CamMode 'intro'` + 라인업 화면 + `anthem()`. 온라인·승부차기 모드는 없음
- `tools/league.ts` 무작위 짝 N경기 통계(골·슈팅·유효·패스·파울·오프사이드·카드·루즈볼·전력차별 승률). AI 숫자를 바꾸면 `league 60 300`으로 재고 PROGRESS에 기록
- `tools/bench.ts` 상황 벤치(패스 수신률·슛 성공률·수비 회수율, `--seeds 4 --n 80`으로 여러 시드 평균). 조작·물리 숫자를 바꾸면 전후로 돌려 비교할 것
- `tools/flow.ts` 체감 벤치: 사람처럼 조작하는 스크립트 컨트롤러(열린 동료를 조준해 숏/스루, 압박 땐 패스, 질주, 골 앞 슛, 수비는 압박 홀드)가 AI와 경기. 조준한 동료에게 패스가 갔는지·수신·가로채기·누르고 차기까지 지연·받는 순간 상대 거리·소유 x 분포. `--dbg`는 조준 불일치 점수 내역, `--nodef`는 수비 안 함. 수비·드리블·패스 선택을 바꾸면 돌릴 것. (컨트롤러 수비가 약해 실점은 참고만)
- `tools/hold.ts` 드리블 유지 시험(수비 한 명이 앞에 붙은 채 정지·등지고 걷기·옆으로·직진, 손실까지 시간). `tools/dribble.ts [seed] [--sprint]` 스틱만 앞으로 2분(골·골 앞 소유·노크온 손실). 태클·몸싸움 숫자를 바꾸면 둘 다 돌릴 것
- `tools/line.ts` 수비 라인 깊이(공 위치별 포백 평균·최후방 위치, 사람 vs AI와 AI vs AI). 대형 식·`defLine`을 바꾸면 돌릴 것
- `tools/shape.ts` 대형 확인(사람이 한 자리에서 공을 8초 지킬 때 동료 위치를 2초 간격으로 출력: 중원 가운데·측면·상대 진영 깊숙이). 대형을 바꾸면 눈으로 볼 것
- `tools/support.ts [--n 90] [--jog]` 지원 움직임 시험(실제 흐름에서 우리 선수가 공을 잡은 뒤 0~3초: 앞쪽 동료·받을 수 있는 동료·줄 곳 없음 비율·침투·라인 간격). 동료 대형·침투를 바꾸면 돌릴 것. `flow --support`는 경기 중 표본
- `tools/keys.ts` 입력 시험(달리기·질주 중 임의 시점에 pass/through/shoot/lob/chip → 0.8초 안에 킥이 나간 비율, 전부 60/60이어야 함). `flow --thru`는 스루패스 상세(공 속도·끊긴 지점·끊은 선수·거리별 성공)
- `tools/intercept.ts [--n 40]` 가로채기 시험(선로 옆 0.5~3.5m, 공 14/20/26m/s, AI와 사람 런지). 트래핑·가로채기 숫자를 바꾸면 돌릴 것
- `tools/simulate.ts` 헤드리스: `npx tsx tools/simulate.ts 40 300 KOR BRA --seed 1` → 골·슛·점유·파울·오프사이드·루즈볼 + 결정론 검사. 숫자 튜닝은 반드시 이걸로 재고 바꿀 것
- `public/` PWA: `manifest.webmanifest`·`icon.svg`·`sw.js`(캐시 이름 `ko11-v…`는 배포 워크플로가 커밋 해시로 바꾼다). `main.ts`가 PROD에서만 등록
- 배포: `.github/workflows/deploy.yml` — `main`에 push하면 `npm ci` → `npm run build` → GitHub Pages(`dist`). 저장소 Settings → Pages → Source 가 GitHub Actions여야 한다. 경로는 전부 상대(`base: './'`)라 하위 경로에서도 동작. 절차는 README '배포'
- `index.html`은 마크업만(`#build`가 빌드 표시, 폰에서 옛 파일인지 확인용). CSS는 `src/style.css`

## 게임 규칙·모델 (함수 이름은 위 파일에 있음)
- 선수 능력치(Phase 4): `Player.attrs`(Detail)가 항상 있음(선수단 없으면 팀 능력치로 가짜 전개). `n(v)=(v-50)/50`. `steer` 가속 7.3+n(acc)×2.4, 감속 10+n(bal)×2(질주 중 멈추면 8로 미끄러짐), 회전 (14+n(agi)×4)-sp×(1.25-n(agi)×.3). 속력 `speed0`=6.0+(spd-60)/40×1.7(질주 사람 1.24·AI 1.2), `speed`=speed0×(.86+.14×sta). 체력 `sta` 0~1: 질주 1.7/len·달리기 .5/len 소모, 걸으면 .7/len 회복(스태미나 능력치로 보정). 패스 오차 `passErr` .01+(1-sp/100)×.09 rad ×(1+압박×.6+피로). 슛 오차 (1.22-fin/100)×(1+압박×.4)×약발 페널티, 속도 (16+17p)×(.92+n(pow)×.1). 트래핑 깨끗한 한계 (toMe 17 : 11)+ctl×.15, 넘으면 `bad`만큼 튀는 퍼스트 터치. 스탠딩 태클 (앞 .6/.42)+n(stk)×.25-n(상대 bal)×.12+(공이 발에서 떨어짐 .18)-(헛다리 .4)-(룰렛 .5). 슬라이딩 .55+n(slt)×.3, 사람/옆으로 향하면 파울. 몸싸움 str·bal 대결. 포크 .55+n(int)×.25. AI 태클률 ×(.85+n(stk)×.4), 거리 1.45m(밀어내기가 1.1m를 유지하므로 1.25면 안 닿음), 앞에서 ×1.3, ×공 노출 `expo`=clamp((1.7-수비·공 거리)/0.7, .12, 1)×(1-n(ctl)×.3) (등지고 간수하면 거의 못 뺏음), 공이 발에서 떨어졌을 때(kickCD>0·6m/s 초과) ×1.4 아니면 ×.7. AI 몸싸움은 수비가 앞에 있을 때만 1.35m 안 `bodyCD` .55마다 (.3+str·bal 차)×min(1, rate/.36)×expo. 유지 시간은 `tools/hold.ts`로 잰다(등지고 걷기 8초 유지 27/40, 마주 보고 정지 1.4초). 공 가진 선수는 앞을 막은 상대와 1.4m 안이면 `integrate`에서 속도 ×(1-.12×(1.4-q)/1.4)/틱 (수비를 뚫고 걸어갈 수 없음). 사람이 패스·슛·칩 키를 누른 뒤 `shield` .16초는 어떤 태클·몸싸움도 실패. GK: 선방 .5+n(ref)×.3+n(div)×.1 (×다이브 거리 (1-(dy-.5)/3.2) ×속도 max(.8, 1-(sp-20)/30), 0.5m 안 낮은 공 .88), 잡기 sp<14+n(han)×10, 위치선정 pos, 킥 kic, 반응 지연 .3-n(rea)×.08
- 킥 와인드업 `queueKick(s,p,fn,wind)`: 공 가진 채 `p.kickWind`가 0이 될 때 실행(`runPending`), 그 사이 공을 잃으면 취소. 패스 .04초·슛 .1초(AI도 같음). 렌더는 kickWind>0이면 백스윙
- 공 물리: 공중 `airStep` 공기저항 (.05+.0038×속도)/s + 마그누스 `ball.curl`(진행 방향 수직 가속, 땅에선 반, 1.5/s 감쇠). 감아차기(`shoot(...,finesse)`, Q 누른 채 슛)는 조준 바깥 .14rad에서 안으로 휨, 속도 .85배, 오차 .7배. 공중볼 슛은 발리(속도 1.08, 오차 1.6)
- 개인기(`skillMove`, Q 탭 / 폰 오른쪽 스와이프 `I.skill`): skill≥2 헛다리(`feint` .35초 동안 태클 성공 -40%, `burst` 가속), ≥3 스틱 뒤+Q 드래그백(돌아서기), ≥4 질주 중 옆+Q 마르세유 턴(`spin` .5초 한 바퀴, 공은 몸 옆, 태클 거의 불가). AI도 압박받으면 skill×3% 확률로 헛다리
- 입력 주의: pass/lob/shoot은 떼는 틱에 실행되므로 `humanUpdate`의 노크온 판정(`anyPress`)에 `I.rel.*`가 반드시 들어 있어야 한다 — 빠지면 질주 중 패스가 안 나간다(`tools/keys.ts`로 확인). 나한테 오는 패스(`ball.passTarget === p`)는 질주 키 없이도 1.24배로 받으러 간다
- 패스 세기: 키보드 pass/lob은 떼는 순간(`I.rel`) 누른 시간이 power(숏 도착 11→16m/s·거리 가산, 롱 35→65m). through는 press, sprint 누른 채면 빠른 공
- 수비 컨테인: pass 홀드 중 상대 2.6m 안이면 공-골 선상 1.5m를 유지하며 따라붙고, 공이 발에서 떨어졌을 때(kickCD>0 또는 6m/s 넘게 달릴 때)만 자동 태클
- 입력 액션: `pass`(S) 짧은패스/압박·태클, `lob`(A) 롱패스/선수 전환, `through`(W) 스루/세컨드 디펜더, `shoot`(D) 슛(길게 파워)/슬라이딩, `chip`(Z) 칩슛, `run`(Q) 우리 공이면 침투 지시(스틱·없으면 얼굴 방향 동료, `triggerRun`: `runT` 3초 골 쪽 대각선 `runDir`, teamAI가 오프사이드 라인 0.4m 안에서 멈춤, 숏 +.8·스루 +1.5 우대, 노란 화살표) / 상대 공이면 압박 지원(`h.pressT` 2.5초: 추격 ×1.15·태클 ×1.3·커버도 맞붙음, 빨간 점선 화살표), `gkRush`(X) 공격 땐 개인기·누른 채 슛은 감아차기 / 수비 땐 키퍼 돌진, `sprint`(E) 질주. 터치는 pass 짧게=숏/길게=롱, through 버튼이 수비 땐 전환. `INP[0]`은 로컬 P1(키보드/터치/패드), `INP[1]`은 로컬 P2 또는 온라인 게스트 입력
- 커서는 공을 잡은 우리 선수에게 무조건(`gain`·`autoCursor`, 키퍼 포함). 키퍼를 조작 중에 공을 잃으면 가장 가까운 필드 선수로. 동료가 터치해 흘린 공(`ball.knock`)도 그 선수로. 킥오프 두 선수는 자기 진영을 본다. 오버레이 `toScreen(x, y, 높이)` 순서 주의
- 패스 중 커서(FIFA식): 차는 순간 받는 선수로 커서가 넘어가고(`passTo`/`throughPass`에서 h.ctrl=m), 공이 2.5m 밖에 있는 동안은 `assistDir`가 97% 자동으로 공을 향해 뛰게 하며 그 안부터 스틱이 섞인다. 패서는 동료에게 가는 공을 건드리지 않음(`ballControl`)
- 이동 어시스트: `assistDir`가 조작 방향에 공 쪽 방향을 섞음 (나한테 오는 패스 55~95%, 흐르는 공은 거리·방향에 따라 0~80%, 상대 볼 소유 땐 0~55%). 공 반대쪽 의도는 존중. 손 놓으면 10m 안 루즈볼은 자동 추적, 4.5m 안 상대는 천천히 따라붙음
- 움직임 모델(`steer`): 정지에서 8.5m/s² 가속(빠를수록 둔화), 감속 11m/s², 회전 속도는 빠를수록 느려 질주 중엔 크게 돈다. 방향이 크게 다르면 속도를 줄여 돈다. 키퍼는 1.7배 민첩. 움직이는 공은 `chase`(전속), 정지 목표는 `moveTo`(가까워지면 감속)
- 질주 드리블(`knockOn`): 질주(sprint)+이동 중 공을 2~3m 앞에 차 놓고 쫓는다(`ball.knock`). 그동안 상대가 끊을 수 있고, 가까이 오면 바로 패스·슛 가능. AI도 앞에 7m 공간이 있으면 노크온. 터치 세기 sp+1.6-n(ctl)×.8(상대 3.5m 안이면 +0.8·kickCD .12, 아니면 .18; 길면 상대 추격자가 먼저 닿는다), 자기가 차 놓은 공은 `ballControl` 1.4m(원래 .95)에서 다시 잡음, 방금 뺏긴 공(`h.lostT` .6초·3.5m 안)은 스틱이 앞을 향해도 85% 돌아봄, 자기가 차 놓은 공을 쫓을 땐 '공 앞 감속 .75' 규칙 제외(이게 있으면 못 따라잡아 87% 뺏겼음), 스틱이 달리는 방향과 .4rad 넘게 다르면(돌 때) 차 놓지 않고 발에 붙여 돌며, 내가 차 놓은 공이 6m 안이면 `assistDir`가 스틱과 상관없이 먼저 줍는다(w .95). 상대 AI는 터치에 react×.3 지연. 노크온 선수는 `teamAI`·`integrate`에서 공 가진 선수처럼 취급(`carrier = owner ?? knocker`): 수비 대형이 유지되고, 가장 먼저 닿는 상대가 쫓아 `tryTackle`로 끊고, 앞을 막은 몸에 걸린다 — 이게 없으면 직진 질주가 2분에 3골
- 오프사이드: `kick()`에서 찬 순간 동료의 `offs` 기록(`offsideLine(t)`=뒤에서 두 번째 상대·공·하프라인 중 최댓값), `gain()`에서 같은 팀 킥 뒤 offs 선수가 잡으면 `offside()`→상대 프리킥. 스로인 제외. AI는 `bestAIPass`에서 오프사이드 동료 제외, `targetFor`에서 공격 시 라인 뒤에 선다
- 사람 팀 동료의 공격 움직임(AI 팀엔 적용 안 함 — 적용하면 리그 패스 성공률이 73→58%로 떨어짐): `targetFor`에서 공격수는 4.5초마다(`M.tick/270`) 역할 교대 — 한 명은 내려와 받고(공 앞 7~9m·옆 5m) 나머지는 최종 라인에서 `gapY`(수비 사이 가장 넓은 틈)로; 공격형·측면 MF는 공 앞 5m, 수비형 MF 공 뒤 6m; 공 쪽 풀백은 오버래핑(공 45~86m일 때 공 앞 7m·터치라인 3.5m 안, DF 한계 68→94), 반대쪽 풀백 공 뒤 19m·센터백 23m; 박스 플레이(공 76m 넘고 중앙 9m 밖)면 공격수 니어/파 포스트(98,±3.2 / 97,∓4.2)·반대쪽 윙어 (95,∓8)·컷백 (92~93)·세컨드 볼 (84); 공이 라인을 넘으면 옆에서 같이 뜀. 지원(supports)은 가운데 MF 둘이 안쪽 앞 6m·뒤 7m. `teamAI`에서 목표가 5m 넘게 앞이면 질주(1.2/수비 1.1), 자동 침투 `M.autoRun`(상대 진영 1.5~3.1초·그 밖 2.2~3.8초마다 가장 넓은 틈 앞 선수가 그 틈으로 `runT` 2.5초, 공 쪽 풀백도 터치라인 따라, 박스 플레이 중엔 없음, 공을 막 뺏으면 .35초 안에 — `M.lastAtt`), `openLane`(선로에 상대가 1.6m 안이면 3.5m 비켜 섬), 수비 때 가장 앞선 공격수는 역습 출구로 남음. `tools/support.ts`로 잰다(3초 뒤 줄 곳 없음 72→28%)
- 수비 라인(`defLine(lb)=clamp(lb×.62−3, 6, 46)`, lb=공이 자기 골에서 떨어진 거리): 공격 중이 아닐 때 수비수는 이보다 처지지 않고 공보다는 항상 3m 골 쪽. 마크 중인 수비수도 공이 상대 발에 있으면 라인−1.5m 밑으로 안 내려감(패스가 뜨면 풀림). 이 규칙이 없으면 공이 중원인데 포백이 자기 골 16m, 25~45m면 8m(골키퍼 옆)에 선다. `tools/line.ts`로 잰다. 모든 선수의 대형 위치엔 걷는 속도의 흔들림(±1.3·±0.9 / ±1.5·±1.0m)이 겹쳐 제자리에 서 있지 않는다
- AI 대형(`targetFor`): 공격 땐 FW는 공보다 9m 앞, MF는 공 근처까지 전진. `aiCarrier`는 압박(2m) 땐 괜찮은 패스, 아니면 좋은 전진 패스만, 2.4초 넘게 끌면 아무 패스. 공간 있으면 1.28배 질주. `bestAIPass` 점수는 전진/10이 중심, 6m 넘는 후진 감점, 70m 넘는 깊은 패스 가산
- 사람 조작: `humanUpdate` (공격: shortPass/longPass/throughPass/shoot/chipShot, 수비: standTackle/slideTackle/switchPlayer/압박/세컨드 디펜더/GK 돌진), `autoCursor`(공 근처 선수로 자동 전환)
- AI: `teamAI` — 공 없을 땐 interceptT 최소 선수가 추격(사람이 .35초 이상 빠를 때만 양보). 수비 땐 사람과 별개로 가장 가까운 AI가 항상 압박(chaser, `chase` 전속), 둘째는 골 쪽 6m 커버(드리블러가 3.6m 안이거나 수비 지역(자기 골 40m) 9m 안이면 물러서지 않고 맞붙음; 자기 골 38m 안에선 14m 안 가장 가까운 DF가 마크를 버리고 커버; 사람 커서 선수가 3m 안에 붙어 있으면 둘 다 안 함), 나머지 DF/MF는 공 없는 상대를 위협 순으로 골 쪽 2.2m에서 마크(marks, 대형 목표와 75:25 혼합). 세컨드 디펜더(through 길게)면 셋째가 커버. 공격 땐 공 가진 선수에서 가까운 비수비수 둘이 앞 9m·좌우 9m 지원 위치(supports, 오프사이드 라인 안). `aiCarrier`(드리블·패스·슛 결정), `gkAI`(위치·선방·다이브), `bestAIPass`
- 슛(`shoot`): 조준 없으면 키퍼 반대쪽 포스트 안쪽(±2.4m) 자동 조준, 오차 (.35+거리×.05)×(1+파워×.5), 파워 .9 넘으면(사람 풀파워) ×(1+(p-.9)×6). 높이 vz=1+파워×4×(.3~.9), .85 넘으면 ×1.25. 키퍼는 `reactT`(0.2~0.26초) 동안 슛 궤적을 못 읽음. 측정값(2026-11-02 bench): 10m 파워 .7 → 51%, 18m 풀파워 → 50%, 25m → 10%. 키퍼 저장 판정 시점 공 속도는 평균 24m/s(공기저항)라 속도 감점은 거의 안 걸린다
- 디버그: 경기 단위 통계는 `tools/simulate.ts`. 패스·슛 성공률 같은 상황 시험은 `createMatch`로 시뮬을 만들어 `step` 루프를 돌리는 tsx 스크립트를 scratchpad에 쓰면 됨(브라우저 불필요)
- 트래핑(`ballControl`): 동료에게 가는 패스는 받는 선수 외의 우리 편(패서 포함)은 건드리지 않음(5m/s 이상). 받는 선수(`ball.passTarget`)는 1.5m·가슴 높이(z 2.2)·30m/s까지 발에 붙고, 그 외는 .95m·z 1.7·21m/s. 가로채기(나한테 오는 공이 아닌 8m/s 넘는 공): 발 뻗는 범위 1.15+n(int)×.15m, 성공률 clamp(1.35−속도/30, .3, 1)×(.9+n(int)×.2), 헛디디면 kickCD .25 (`tools/intercept.ts`로 잰다: 14m/s 100%, 20m/s 75~93%, 26m/s 50~63%, 2.5m 밖 빠른 공은 0). 사람은 주인 없는 공이 1.7m 안을 지날 때 pass 탭 = 가로채기 런지. AI 마커는 마크 상대에게 오는 패스를 받기 전에 닿으면 선로로 나가 끊음. 헤딩은 골문 22m 안에서만
- 물리: `updateBall`(z축 포함, 중력 G, 골포스트/크로스바, 지면 마찰 dv/dt=-(FA+FB·v)), `ballControl`(트래핑·헤딩), `checkOut`(골/코너/골킥/스로인), `foul`→프리킥/페널티
- 패스: `groundSpeed(s,v1)`가 마찰 모델의 닫힌 식으로 "거리 s를 굴러가 v1로 도착하는 초기 속도"를 역산하고, `groundLead`가 그 이동 시간만큼 받는 선수를 리드. 숏패스는 받는 자리에 11m/s 도착(최소 14m/s로 참). 받는 동료 선택: 조준 방향 ±23° 안은 동점(min(c,.92)/.92×4), 그다음 9m+power×20m 넘는 거리 감점 /16(탭은 가까운 동료, 길게 누르면 먼 동료), 선로 위험 ×1.2(참고만 — 빗나간 패스가 오히려 수신률이 낮았음), 코앞 차단 `nearBlock`(선로 첫 3.2m 안 1.1m에 상대 발) −3. 스루는 조준 방향 cos×2.5 가산, nearBlock −3. 조준 방향(±63°→±84°)에 동료가 없으면 어느 방향이든 가장 가까운 동료에게 준다(45m 안) — 빈 공간으로 차 버리는 일이 없음. 스루패스에 뛰어들 동료가 없으면 숏패스로 대체. 스루패스(`throughPass`)는 조준 방향(±12° 보정 포함) 선로를 0.1초 간격으로 따라가며 동료가 먼저 닿는 지점(반응 .15초 뒤 1.15배 전속·발 .9m, 0.3초까진 관성)을 찾고, 모든 속도(26/22/18/15/12, 질주 누르면 30~15)를 채점해 고름: min(전진,22)/6 + 받는 선수 앞 리드 clamp(−3,8)/4 + 빈 공간/3 − 도착 시간×.4 − 상대가 먼저 닿는 선로 `cut`(반응 .35초·1.0배·1.0m) 3 − 받을 때 22m/s 초과분/4 + 조준 방향 min(c,.96)/.96×7. 가장 빠른 공부터 첫 번째만 쓰면 받는 선수를 지나친다(실패의 71%였음). 선로 방향으로 뛰는 동료 우대. 마찰 상수를 바꾸면 FA/FB도 같이 바꿀 것
- 연출: `goal`→phase 'goal' 7.4초(세리머니 + 3D 리플레이 시간)·`M.slow`(슬로우모션)·`M.scorer`→`celebrate`(득점자 코너로, 동료 따라붙음), `cam.z`(골·슛 줌), `crowdStart/crowdSwell`(관중 소음 베드, 골·슛에 환호), `parts/puff`(슬라이딩·강슛 먼지), 빠른 공 궤적(`drawBall`)
- 옵션: `optTempo`(TEMPO 배율, `runSteps`에서 시뮬 dt에 곱하고 `step`의 경기 시계는 `dt/M.tempo`로 실제 시간 유지), `optCursor`(기본 manual: 패스 받을 때·공 뺏긴 직후 한 번·lob 키(`switchPlayer`→`nearestToBall`)만 전환. auto는 `autoCursor`에서 조작 중이면 전환 여유 .6초). 저장값은 v2 플래그가 있을 때만 auto 유지. 온라인은 호스트 템포를 cfg로 전달
- 수비: 공 가진 상대와 1.05m 안에서 부딪히면 `humanUpdate`에서 자동 몸싸움, `standTackle` 2.4m 런지, `slideCheck` 1.8m. 압박(pass 길게 .25초+) 중 1.8m 안이면 자동 태클. 사람 팀 AI 태클률 .45, 압박 속도 1.18
- 렌더(2D 폴백 기준, 3D는 파일 구조 참고): 진짜 원근 투영(TV 중계 카메라). `CAM={D,Hc}`(조준점 뒤 110m, 높이 72m), `proj(x,y,z)`→{x,y,s(px/m),d}. `VW`가 조준점에서 보이는 가로 폭(36m, 폰 30m, `cam.z` 줌). 바닥은 `buildPitch` 오프스크린 텍스처를 `drawPitch`가 가로 띠 120개로 잘라 각 깊이 크기로 깔고(`setTransform`), 라인은 `polyW/arcW`로 점마다 투영, 먼 쪽 관중석은 `crowdTex` 세운 벽 + 하늘 그라데이션. `drawBoards`는 투영된 사각형. 선수는 `drawPlayer`가 자기 깊이의 `pr.s`를 S/ZS로 써서 그림(멀면 작게). 그림자·커서 링·먼지는 `groundEllipse`. `drawPlayer`가 관절형 스프라이트(`limb`로 허벅지·정강이·팔, 달리기 스윙·킥(`kickCD`)·슬라이딩·다이브·세리머니(`cele`) 포즈, 위를 보면 등번호), `drawGoal`이 3D 골대+그물

## 온라인 대전 (NET)
- PeerJS 방 코드 방식. 호스트 peer id는 `ko11-<4글자>`. `netHost`/`netJoin`/`setupConn`/`onNetData`.
- 호스트 권한: 호스트만 `step`을 돌리고(`simTick` 60Hz 타이머, 렌더와 분리) 2틱마다 `makeSnap` 스냅샷(`t:'s'`)을 보냄. 게스트는 `INP[0]`을 60Hz 타이머로 `t:'i'`(이동 벡터 + down/press/rel 비트)로 보내고, 받은 스냅샷을 `netInterp`가 호스트 시계 기준 80ms 전으로 보간(`applySnap`)해서 그림.
- 배너·효과음·관중 환호·경기 종료는 호스트가 `t:'ev'`로 보냄 (`banner`/`sfx`/`crowdSwell` 안의 `netEv`). 일시정지·재개·나가기는 양쪽 다 보낼 수 있음.
- 호스트 = 팀 0(왼쪽), 게스트 = 팀 1. `LOCAL()`이 로컬 사람의 팀 인덱스. 로비에서 팀 선택은 `t:'lobby'`로 동기화, 경기 시간은 호스트가 정함.
- 온라인 중엔 창 포커스를 잃어도 일시정지하지 않음(탭이 숨겨질 때만).

## 좌표계
월드 105×68 m, x 0→105, y 0→68, z 위. 팀 0은 오른쪽(+x) 공격, 팀 1은 왼쪽. `wx(x,t)`가 팀 기준 좌표 뒤집기.

## 측정값
- 피드백 12차 (2026-11-10): `line` 포백 위치 공 25~45m→21m·45~65m→31m·65m 밖→42~46m(전 8·16·33). `league 60 300` 골 0.87, 슈팅 10.2, 패스 74%. `bench --seeds 4 --n 80` 숏 81%·스루 72%, 슛 52/47/9, 수비 회수 79%. `flow --n 4` 숏 69%·스루 72%
- 피드백 11차 (2026-11-10): `flow --n 4` 스크립트 조작 4경기 3:0·슈팅 8 vs 6, 숏 67%·스루 76%(전진 8.7m). `bench --seeds 4 --n 80` 숏 74%·스루 73%. `league` 골 1.02·패스 75%. `support` 3초 뒤 줄 곳 없음 37%
- 피드백 10차 (2026-11-10): `support --n 90` 3초 뒤 앞쪽 동료 2.8명·받을 수 있는 1.2명·줄 곳 없음 28%(전 1.8·0.3·72%). `league` 8차와 같음. `bench --seeds 4 --n 80` 숏 81%·스루 74%. `flow --n 4` 숏 69%·스루 73%
- 피드백 8차 (2026-11-10): `keys` 전부 60/60. `flow --n 4 --thru` 스루 수신 77%·전진 14.2m·28m+ 35/43. `bench` 숏 82%·스루 81%. `league 40 300` 골 1.07, 패스 73%, 슈팅 10.8
- 피드백 7차 (2026-11-04): `intercept` AI 14m/s 100%, 20m/s 73~93%, 26m/s 50~63%(2.5m 밖 0). `league 40 300` 골 1.00, 패스 72%, 슈팅 10.7. `bench` 숏 80%·스루 69%, 수비 회수 81%. `flow --n 4` 숏 70%/54%, 스루 71%/59%
- 피드백 5차 (2026-11-03): `dribble --sprint` 6시드 골 1(전 9), 노크온 손실 25%. `bench --seeds 3 --n 60` 숏 82%·스루 70%. `flow --n 4` 숏 65%/58%, 스루 68%/66%. `league 40 300` 골 1.10, 슈팅 13.2(유효 4.7)
- 피드백 3차 (2026-11-03): `hold` 등지고 걷기 중앙값 8초(27/40 유지)·옆 2.8초·직진 1.0초·정지 1.4초. `dribble` 3시드 골 0/0/1, 질주 노크온 손실 25%. `flow --n 4` 숏 72%/조준 67%, 스루 72%/63%. `league 40 300` 골 1.43, 슈팅 13.5(유효 5.4), 무승부 33%
- 피드백 2차 (2026-11-02, `flow --n 4` KOR vs BRA): 숏 조준 일치 70%·수신 74%, 스루 65%·69%, 받는 순간 상대 2m 안 30%. 드리블만 2분 3시드 골 0 (전엔 1~3). `league 40 300`: 골 1.40, 슈팅 11.3(유효 4.4), 패스 64%, 무승부 40%. `bench --seeds 3 --n 60`: 숏 72%·스루 80%, 슛 10m 51 / 18m 50 / 25m 10 / 14m 30, 수비 회수 87%
- 피드백 후속 (2026-11-02, `league 40 300`): 골 1.13/경기, 슈팅 11.1(유효 3.8), 패스 65%, 파울 .75, 무승부 43%. `bench --seeds 3 --n 60`: 숏 78%·스루 79%, 슛 10m 51% / 18m 50% / 25m 10% / 14m 30%, 수비 회수 92%
- Phase 5 (2026-10-29, `league 60 300`): 골 1.38/경기, 슈팅 13.1(유효 5.0), 패스 성공 63%, 파울 2.1, 무승부 40%, 전력차 6+ 강팀 승률 50~100%
- Phase 4 (2026-10-29, `tools/bench.ts --seeds 3 --n 60`, KOR vs BRA 실명 선수단): 잡자마자 전방 패스 숏 76%·스루 78%, 슛 10m .7 → 55% / 18m 풀 39% / 25m 6% / 14m .6 32%, 수비 회수 84%. AI 반응 지연 없이는 63%/53%
- 헤드리스(2026-10-29, Phase 1 이식 직후, KOR vs BRA 40경기 264초): 슛 4.9/경기, 골 0.8, 파울 6.7, 루즈볼 46%. 레거시 브라우저 8경기: 슛 6.1, 골 1.4, 파울 6.6, 루즈볼 47%

### 이전 측정 (브라우저 자동 시험, 2026-10-28)
- AI vs AI 5분: 슛 6개/경기, 골 1.5개/경기, 공이 주인 없는 시간 48%
- 사람 패스(실제 경기 상황, 터치 흐름: 스틱 전방+패스 탭): 숏 91%, 스루 85% 수신. 수정 전엔 앞에 동료가 없으면 빈 공간으로 차서 11%였음
- 수비(상대 볼 소유 시 가장 가까운 선수로 압박 버튼만 누름): 4초 안 회수 90%, 평균 0.66초
- 슛: 10m 파워 .7 → 53%, 18m 풀파워 → 49%, 25m 풀파워 → 7%
- 이전 버전 백업: `_backup/`

## 알려진 개선 과제
- 게스트 입력 지연 = 왕복 핑. 클라이언트 예측은 없음.
- AI 오프사이드 0건. 온라인은 전술·교체·토너먼트 없음(UI 숨김). 토너먼트 다른 경기 시뮬은 라운드당 1~2초 동기 실행(멈춤).
- 스냅샷은 선수당 19값(sta·kickWind·spin·feint·off·runT·runDir 포함), 리플레이 프레임은 15값. 필드를 늘리면 `protocol.ts` k=i*19와 `scene.ts` PF를 같이 바꿀 것
