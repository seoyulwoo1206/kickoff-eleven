/* src/data/teams/index.ts 생성: 폴더의 모든 팀 JSON을 정적 import로 묶는다 (Vite·tsx 둘 다에서 동작) */
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'src', 'data', 'teams');
const codes = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
const out = [`/* 자동 생성: npx tsx tools/gen-squad-index.ts — 손으로 고치지 말 것 */`, `import type { SquadDef } from '../squad';`,
  ...codes.map(c => `import ${c} from './${c}.json';`),
  `export const SQUADS: Record<string, SquadDef> = { ${codes.map(c => `${c}: ${c} as SquadDef`).join(', ')} };`, ''];
fs.writeFileSync(path.join(dir, 'index.ts'), out.join('\n'));
console.log(`index.ts: ${codes.length}팀 (${codes.join(', ')})`);
