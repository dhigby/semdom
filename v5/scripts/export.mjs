// Dump the v4 tree to reviewable CSVs under v5/derived/.
//   domains.csv   — one row per domain
//   questions.csv — one row per question
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDomTree, flatten, parentCode } from './lib.mjs';

const DERIVED = fileURLToPath(new URL('../derived/', import.meta.url));
mkdirSync(DERIVED, { recursive: true });

function csv(rows) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

const { roots } = loadDomTree();
const all = flatten(roots);

const domainRows = [['code', 'name', 'parent', 'depth', 'numQuestions', 'numWords', 'hasOcm', 'hasLouwNida', 'description']];
const questionRows = [['code', 'name', 'qIndex', 'question', 'exampleWords', 'exampleSentences']];

for (const d of all) {
  const numWords = d.questions.reduce((n, q) => n + (q.exampleWords ? q.exampleWords.split(',').length : 0), 0);
  domainRows.push([
    d.code, d.name, parentCode(d.code) ?? '', d.code.split('.').length,
    d.questions.length, numWords, d.ocmCodes ? 'y' : '', d.louwNidaCodes ? 'y' : '', d.description,
  ]);
  d.questions.forEach((q, i) => {
    questionRows.push([d.code, d.name, i + 1, q.question, q.exampleWords ?? '', q.exampleSentences ?? '']);
  });
}

writeFileSync(DERIVED + 'domains.csv', csv(domainRows));
writeFileSync(DERIVED + 'questions.csv', csv(questionRows));
console.log(`Exported ${all.length} domains -> derived/domains.csv`);
console.log(`Exported ${questionRows.length - 1} questions -> derived/questions.csv`);
