/**
 * Apply a proposal from semdom.org's /propose/ form to the data.
 *
 *   node scripts/apply-proposal.mjs --file proposal.yaml [--code 4.6.9] [--dry-run]
 *
 * Domain coordinators are linguists, not Git users, and are not assumed to have GitHub
 * accounts. They fill in the form on the website; it emails a proposal document; this
 * turns that document into a correct commit. Three of the things a new domain needs
 * cannot be done in a browser at all — a number checked free across both versions, a
 * collision-checked GUID, and a regenerated structure lock — so they are done here.
 *
 * The number is assigned HERE, not in the form. A proposal that gets re-parented during
 * review must not have burned a number on the way through, so the form only ever shows a
 * provisional one. See data/v5/POLICY.md.
 *
 * The proposal document (see docs/EDITING.md for the full shape):
 *
 *   kind: new-domain | edit
 *   version: v5
 *   parent: "4.6"            # new-domain
 *   code: "2.6.2.3"          # edit
 *   rationale: "…"           # required for new-domain
 *   proposedBy: "Name, affiliation"
 *   domain: { name, description, ocmCodes?, louwNidaCodes?, related?, questions? }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadVersion } from './lib/domains.mjs';
import { domainToYaml } from './lib/emit-yaml.mjs';
import {
  sanitizeText,
  checkText,
  checkQuestion,
  checkCode,
  checkGuid,
  stripNumberPrefix,
  domainPath,
  nextChildCode,
  newGuid,
} from './lib/domain-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const DRY_RUN = argv.includes('--dry-run');
const FILE = arg('file');
const FORCE_CODE = arg('code');

if (!FILE) {
  console.error('usage: node scripts/apply-proposal.mjs --file proposal.yaml [--code 4.6.9] [--dry-run]');
  process.exit(2);
}

const die = (msg) => {
  console.error(`\nREJECTED: ${msg}`);
  process.exit(1);
};

const proposal = yaml.load(readFileSync(FILE, 'utf-8'));
if (!proposal || typeof proposal !== 'object') die(`${FILE} is not a proposal document`);

const version = proposal.version ?? 'v5';
// v5 only, and not merely because v4 has a stricter policy. sanitizeText() trims, and
// seven v4 question texts end in a space preserved on purpose so the generated v4 XML
// stays byte-identical to the historic export. Passing v4 through here would silently
// "fix" them and break `npm run verify`. v5 has zero such questions.
if (version !== 'v5')
  die(`proposals apply to v5 only; v4 changes follow data/v4/POLICY.md by hand`);

const v4 = loadVersion('v4');
const v5 = loadVersion('v5');
const src = proposal.domain ?? {};

// --- normalize, before anything is checked --------------------------------
// A coordinator pastes from Word. Word supplies \r\n, non-breaking spaces and smart
// quotes, every one of which is a hard CI error they cannot see and could not diagnose.
// Cleaning here rather than rejecting is the single highest-value thing this script does.
const record = {
  name: sanitizeText(src.name ?? ''),
  description: sanitizeText(src.description ?? ''),
  related: (src.related ?? []).map((c) => sanitizeText(c)),
  questions: (src.questions ?? [])
    .map((q) => {
      const out = { question: stripNumberPrefix(sanitizeText(q.q ?? q.question ?? '')) };
      // '' and absent are different, and only v4 has deliberate empties. A proposal that
      // leaves a field blank means "no value", so the key is omitted rather than emptied.
      const words = sanitizeText(q.words ?? q.exampleWords ?? '');
      const sentence = sanitizeText(q.sentence ?? q.exampleSentences ?? '');
      if (words) out.exampleWords = words;
      if (sentence) out.exampleSentences = sentence;
      return out;
    })
    .filter((q) => q.question),
};
for (const k of ['ocmCodes', 'louwNidaCodes']) {
  const v = sanitizeText(src[k] ?? '');
  if (v) record[k] = v;
}

// --- decide identity ------------------------------------------------------
let changesEntry = null;

if (proposal.kind === 'edit') {
  const code = String(proposal.code ?? src.code ?? '');
  const existing = v5.byCode.get(code);
  if (!existing) die(`${version} has no domain ${code}`);
  // Both are permanent. A proposal cannot change them even by accident.
  if (src.guid && src.guid.toUpperCase() !== existing.guid.toUpperCase())
    die(`proposal would change the GUID of ${code} — that is never permitted`);
  record.code = existing.code;
  record.guid = existing.guid;
  // A field the proposal does not mention keeps its current value; a field it mentions
  // wins, even when it is empty. Anything else means a proposal about one question can
  // silently erase the domain's OCM codes, which is data loss with a plausible diff and
  // green CI. Key presence is the signal, not emptiness — otherwise clearing a field
  // deliberately would be impossible.
  for (const k of ['ocmCodes', 'louwNidaCodes'])
    if (!(k in src) && existing[k] !== undefined) record[k] = existing[k];
  if (!('related' in src)) record.related = existing.related;
  if (!('questions' in src)) record.questions = existing.questions;
} else if (proposal.kind === 'new-domain') {
  const parent = String(proposal.parent ?? '');
  if (!v5.byCode.has(parent)) die(`parent ${parent || '(none given)'} does not exist in ${version}`);
  if (!String(proposal.rationale ?? '').trim())
    die('a new domain needs a rationale — validate.mjs rejects one without it');

  const allCodes = [...v4.byCode.keys(), ...v5.byCode.keys()];
  if (FORCE_CODE) {
    for (const m of checkCode(FORCE_CODE)) die(m);
    if (v4.byCode.has(FORCE_CODE) || v5.byCode.has(FORCE_CODE))
      die(`code ${FORCE_CODE} is already in use`);
    record.code = FORCE_CODE;
  } else {
    record.code = nextChildCode(parent, allCodes);
  }

  // Never hand out a GUID that either version has ever used.
  do {
    record.guid = newGuid();
  } while (v4.byGuid.has(record.guid) || v5.byGuid.has(record.guid));

  changesEntry = {
    op: 'add',
    code: record.code,
    parent,
    name: record.name,
    rationale: sanitizeText(proposal.rationale),
    ...(proposal.evidence ? { evidence: sanitizeText(proposal.evidence) } : {}),
    ...(proposal.proposedBy ? { proposedBy: sanitizeText(proposal.proposedBy) } : {}),
    ...(proposal.issue ? { issue: proposal.issue } : {}),
    date: new Date().toISOString().slice(0, 10),
  };
} else {
  die(`unknown kind "${proposal.kind}" — expected "edit" or "new-domain"`);
}

// --- re-assert every rule CI will apply -----------------------------------
const problems = [
  ...checkCode(record.code),
  ...checkGuid(record.guid),
  ...checkText('name', record.name),
  ...checkText('description', record.description),
];
if (!record.name) problems.push('name is empty');
if (!record.description) problems.push('description is empty');
record.questions.forEach((q, i) => {
  problems.push(...checkQuestion(q.question, `questions[${i}]`));
  problems.push(...checkText(`questions[${i}].q`, q.question));
  if (q.exampleWords !== undefined)
    problems.push(...checkText(`questions[${i}].words`, q.exampleWords));
  if (q.exampleSentences !== undefined)
    problems.push(...checkText(`questions[${i}].sentence`, q.exampleSentences));
});
for (const c of record.related)
  if (!v5.byCode.has(c) && c !== record.code)
    problems.push(`related "${c}" does not resolve in ${version}`);

if (problems.length) {
  console.error('\nThe proposal does not satisfy the rules CI enforces:');
  for (const m of problems) console.error('  - ' + m);
  process.exit(1);
}

// --- write ----------------------------------------------------------------
const rel = domainPath(version, record.code);
const contents = domainToYaml(record);

if (DRY_RUN) {
  console.log(`--- ${rel} ---\n`);
  console.log(contents);
  if (changesEntry) {
    console.log('--- appended to data/v5/changes.yaml ---\n');
    console.log(yaml.dump([changesEntry], { lineWidth: 92, noRefs: true }));
  }
  console.log('(dry run — nothing written)');
  process.exit(0);
}

mkdirSync(`${ROOT}${rel.slice(0, rel.lastIndexOf('/'))}`, { recursive: true });
const existedBefore = existsSync(ROOT + rel);
writeFileSync(ROOT + rel, contents, 'utf-8');
console.log(`${existedBefore ? 'updated' : 'wrote'} ${rel}`);

if (changesEntry) {
  const changesPath = `${ROOT}data/v5/changes.yaml`;
  const entryYaml = yaml.dump([changesEntry], { lineWidth: 92, noRefs: true }).trimEnd();
  let text = readFileSync(changesPath, 'utf-8');
  // The file ships as a commented header plus an empty list; the first real entry
  // replaces that `[]` rather than sitting beside it.
  text = /^\[\]$/m.test(text)
    ? text.replace(/^\[\]$/m, entryYaml)
    : `${text.trimEnd()}\n${entryYaml}`;
  writeFileSync(changesPath, text + '\n', 'utf-8');
  console.log('appended the rationale to data/v5/changes.yaml');

  // The append-only ledger. Forgetting this is now a CI error, so do it here.
  execFileSync('node', [`${ROOT}scripts/validate.mjs`, '--write-lock'], { stdio: 'inherit' });
  console.log('\nregenerated the structure locks — that diff is part of the review');
}

// --- prove it ------------------------------------------------------------
try {
  execFileSync('node', [`${ROOT}scripts/validate.mjs`], { stdio: 'inherit' });
  execFileSync('node', [`${ROOT}scripts/check-emit.mjs`], { stdio: 'inherit' });
} catch {
  console.error('\nValidation failed. The files are on disk so you can inspect them.');
  process.exit(1);
}

// --- hand the maintainer the pull request --------------------------------
const verb = changesEntry ? 'Add' : 'Revise';
console.log(`\n${'='.repeat(72)}\nPull request title:\n  ${verb} ${version} ${record.code} ${record.name}\n`);
console.log('Body:\n');
console.log(`${verb === 'Add' ? 'Adds' : 'Revises'} **${record.code} ${record.name}**.\n`);
if (changesEntry) console.log(`**Rationale:** ${changesEntry.rationale}\n`);
if (proposal.proposedBy) console.log(`Proposed by ${sanitizeText(proposal.proposedBy)}.\n`);
if (proposal.evidence) console.log(`**Where this came from:** ${sanitizeText(proposal.evidence)}\n`);
console.log('The plain-language report is on the "Validate" check → Details → summary.');
