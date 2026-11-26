/* 클럽팀 데이터 검증: npx tsx tools/validate-clubs.ts [EPL1 EPL2 …]  (인자가 없으면 clubs.ts가 읽는 전부)
   검사: 줄 형식·꼬리표(parseClubs), 팀 코드 중복(국가대표 포함), 인원 23~26, GK 2명 이상, 등번호 중복, 포메이션·선발 11명(슬롯의 GK 자리에 GK),
   색 형식, 출처·asOf, 나이·키 범위. 팀마다 선발 평균·최고 선수·불확실 수를 출력한다 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseClubs, CLUB_TEAMS, CLUB_SQUADS, CLUB_ERRS } from '../src/data/clubs';
import { TEAMS, NATIONS, type TeamDef } from '../src/data/teams';
import { FORMATIONS } from '../src/data/formations';
import { overall, type SquadDef } from '../src/data/squad';

const want = process.argv.slice(2);
(async () => {
  let teams: TeamDef[] = [], squads: Record<string, SquadDef> = {}, errs: string[] = [];
  if (want.length) for (const w of want) { const f = path.join(process.cwd(), 'src', 'data', 'clubs', w.replace(/\.ts$/, '') + '.ts'); if (!fs.existsSync(f)) { errs.push(`파일 없음: ${f}`); continue; } const r = parseClubs(w.replace(/\d+$/, ''), (await import(pathToFileURL(f).href)).default as string); teams.push(...r.teams); Object.assign(squads, r.squads); errs.push(...r.errs); }
  else { teams = CLUB_TEAMS; squads = CLUB_SQUADS; errs = [...CLUB_ERRS]; }
  const nat = new Set(TEAMS.slice(0, NATIONS).map(t => t.code)), seen = new Set<string>(); let bad = errs.length;
  for (const e of errs) console.log('✗ ' + e);
  for (const T of teams) {
    const sq = squads[T.code], E: string[] = [], ps = sq.players;
    if (!/^[A-Z]{3}$/.test(T.code)) E.push('코드는 대문자 3글자'); if (nat.has(T.code) || seen.has(T.code)) E.push('코드 중복'); seen.add(T.code);
    for (const c of [T.c1, T.c2, T.sh, T.gk]) if (!/^#[0-9a-fA-F]{6}$/.test(c)) E.push(`색 형식 ${c}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sq.asOf)) E.push(`asOf ${sq.asOf}`); if (!sq.sources.length || !sq.sources.every(u => /^https?:\/\//.test(u))) E.push('출처 주소 없음');
    if (ps.length < 23 || ps.length > 26) E.push(`인원 ${ps.length} (23~26)`); if (ps.filter(p => p.pos === 'GK').length < 2) E.push('GK 2명 미만');
    const nums = new Set<number>(); for (const p of ps) { if (nums.has(p.num)) E.push(`등번호 중복 ${p.num}`); nums.add(p.num); if (p.height < 160 || p.height > 205) E.push(`키 ${p.name} ${p.height}`); if (p.age != null && (p.age < 15 || p.age > 43)) E.push(`나이 ${p.name} ${p.age}`); if (!/^[A-Z]{3}$/.test(p.nat ?? '')) E.push(`국적 ${p.name} ${p.nat}`); }
    const slots = FORMATIONS[sq.formation]; if (!slots) E.push(`포메이션 ${sq.formation}`);
    if (sq.lineup.length !== 11 || new Set(sq.lineup).size !== 11) E.push(`선발 ${sq.lineup.length}명(중복 포함)`);
    const xi = sq.lineup.map(n => ps.find(p => p.num === n)); xi.forEach((p, i) => { if (!p) E.push(`선발의 등번호 ${sq.lineup[i]}가 명단에 없음`); else if (slots && (slots[i].pos === 'GK') !== (p.pos === 'GK')) E.push(`선발 ${i}번 자리(${slots[i].pos})에 ${p.name}(${p.pos})`); });
    if (E.length) { bad += E.length; console.log(`✗ ${T.code} ${T.name}: ${E.length}개 문제`); for (const e of E) console.log('   - ' + e); }
    else { const ok = xi.filter(Boolean) as typeof ps, avg = ok.reduce((s, p) => s + overall(p), 0) / ok.length, best = [...ps].sort((a, b) => overall(b) - overall(a))[0], unc = ps.filter(p => p.uncertain).length; console.log(`✓ ${T.code} ${T.name}: ${ps.length}명, ${sq.formation}, 선발 평균 ${avg.toFixed(1)}, 최고 ${best.name} ${overall(best)}${unc ? `, 불확실 ${unc}` : ''} (asOf ${sq.asOf})`); }
  }
  console.log(bad ? `문제 ${bad}개` : `클럽 ${teams.length}팀 통과`); process.exit(bad ? 1 : 0);
})();
