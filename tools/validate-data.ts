/* 선수단 JSON 검증. 사용: npx tsx tools/validate-data.ts [CODE ...]  (코드 없으면 전부)
   검사: 인원 23~26, 등번호 중복/범위(1~26), 포지션 값, GK 3명 이상, 능력치 1~99, 주발·약발·개인기 범위, 키 범위,
   포메이션 존재, 라인업 11명·등번호 존재·중복 없음·슬롯0 GK·GK 1명, asOf·sources */
import fs from 'node:fs';
import path from 'node:path';
import { POSES, overall, type SquadDef, type PlayerDef } from '../src/data/squad';
import { FORMATIONS } from '../src/data/formations';

const dir = path.join(process.cwd(), 'src', 'data', 'teams');
const want = process.argv.slice(2).map(s => s.toUpperCase());
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).filter(f => !want.length || want.includes(f.replace('.json', '').toUpperCase()));
let bad = 0;
const inRange = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
for (const f of files) {
  const errs: string[] = [];
  let sq: SquadDef;
  try { sq = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch (e) { console.log(`${f}: JSON 파싱 실패 ${(e as Error).message}`); bad++; continue; }
  const code = f.replace('.json', '');
  if (sq.code !== code) errs.push(`code '${sq.code}' ≠ 파일명 ${code}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sq.asOf || '')) errs.push('asOf 없음/형식(YYYY-MM-DD)');
  if (!Array.isArray(sq.sources) || !sq.sources.length) errs.push('sources 없음');
  const ps: PlayerDef[] = Array.isArray(sq.players) ? sq.players : [];
  if (ps.length < 23 || ps.length > 26) errs.push(`인원 ${ps.length} (23~26)`);
  const nums = new Set<number>(), names = new Set<string>();
  let gks = 0;
  for (const p of ps) {
    const tag = `${p.num ?? '?'} ${p.name ?? p.nameEn ?? '?'}`;
    if (!p.name || !p.nameEn) errs.push(`${tag}: 이름 없음`);
    if (!inRange(p.num, 1, 26)) errs.push(`${tag}: 등번호 범위`); else if (nums.has(p.num)) errs.push(`${tag}: 등번호 중복`); nums.add(p.num);
    if (names.has(p.nameEn)) errs.push(`${tag}: 이름 중복`); names.add(p.nameEn);
    if (!POSES.includes(p.pos)) errs.push(`${tag}: 포지션 '${p.pos}'`);
    for (const a of p.alt ?? []) if (!POSES.includes(a)) errs.push(`${tag}: 가능 포지션 '${a}'`);
    if (p.pos === 'GK') { gks++; if (!p.gk) errs.push(`${tag}: GK 전용 능력치(gk) 없음`); else for (const k of ['div', 'han', 'kic', 'ref', 'pos'] as const) if (!inRange(p.gk[k], 1, 99)) errs.push(`${tag}: gk.${k}`); }
    if (p.foot !== 'L' && p.foot !== 'R') errs.push(`${tag}: 주발`);
    if (!inRange(p.weak, 1, 5)) errs.push(`${tag}: 약발 1~5`); if (!inRange(p.skill, 1, 5)) errs.push(`${tag}: 개인기 1~5`);
    if (!inRange(p.height, 155, 210)) errs.push(`${tag}: 키 ${p.height}`);
    if (p.age !== undefined && !inRange(p.age, 15, 45)) errs.push(`${tag}: 나이`);
    if (!p.r) errs.push(`${tag}: r 없음`); else for (const k of ['pac', 'sho', 'pas', 'dri', 'def', 'phy'] as const) if (!inRange(p.r[k], 1, 99)) errs.push(`${tag}: r.${k}`);
  }
  if (gks < 3) errs.push(`GK ${gks}명 (3명 이상)`);
  const form = FORMATIONS[sq.formation];
  if (!form) errs.push(`포메이션 '${sq.formation}' 없음 (${Object.keys(FORMATIONS).join(', ')})`);
  const lu = Array.isArray(sq.lineup) ? sq.lineup : [];
  if (lu.length !== 11) errs.push(`라인업 ${lu.length}명`);
  if (new Set(lu).size !== lu.length) errs.push('라인업 등번호 중복');
  const byNum = new Map(ps.map(p => [p.num, p]));
  lu.forEach((n, i) => { const p = byNum.get(n); if (!p) errs.push(`라인업 ${n}번 없음`); else if (form && i === 0 && p.pos !== 'GK') errs.push(`라인업 슬롯0(GK)에 ${p.name}(${p.pos})`); else if (form && i > 0 && p.pos === 'GK') errs.push(`라인업 슬롯${i}에 GK ${p.name}`); });
  if (errs.length) { bad++; console.log(`✗ ${code}: ${errs.length}개 문제`); for (const e of errs) console.log('   - ' + e); }
  else {
    const xi = lu.map(n => byNum.get(n)!), avg = xi.reduce((a, p) => a + overall(p), 0) / 11, best = [...ps].sort((a, b) => overall(b) - overall(a))[0];
    const unc = ps.filter(p => p.uncertain).length;
    console.log(`✓ ${code}: ${ps.length}명, ${sq.formation}, 선발 평균 ${avg.toFixed(1)}, 최고 ${best.name} ${overall(best)}${unc ? `, 불확실 ${unc}` : ''} (asOf ${sq.asOf})`);
  }
}
if (!files.length) console.log('팀 파일 없음: ' + dir);
process.exit(bad ? 1 : 0);
