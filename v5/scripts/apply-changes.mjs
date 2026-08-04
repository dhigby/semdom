// Apply the v5 change-sets (v5/changes/*.yaml) to the v4 tree and emit:
//   public/SemDom5-draft.xml     — the draft, faithful to the v4 format
//   v5/derived/migration-map.csv — advisory v4->v5 re-tagging guide
//   v5/CHANGELOG.md              — human-readable list of every change
//
// It also enforces the compatibility invariants from PRINCIPLES.md and fails
// loudly if any are violated. With no change-set files present it is a pure
// round-trip (used by the verification step).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadDomTree, serialize, flatten, buildMaps, makeGuid, parentCode, DRAFT_PATH } from './lib.mjs';

const CHANGES_DIR = fileURLToPath(new URL('../changes/', import.meta.url));
const CHANGELOG = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
const DERIVED = fileURLToPath(new URL('../derived/', import.meta.url));

const fail = (msg) => {
  console.error('ERROR: ' + msg);
  process.exit(1);
};

// --- load base tree + change-sets ---------------------------------------
const { prefix, roots } = loadDomTree();
const v4Codes = new Set(flatten(roots).map((d) => d.code));
const v4Guids = new Set(flatten(roots).map((d) => d.guid));
let { byCode } = buildMaps(roots);

const changeFiles = existsSync(CHANGES_DIR)
  ? readdirSync(CHANGES_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort()
  : [];
const ops = [];
for (const f of changeFiles) {
  const doc = yaml.load(readFileSync(CHANGES_DIR + f, 'utf-8')) || [];
  for (const op of doc) ops.push({ ...op, _file: f });
}

const migrations = []; // { from, to, condition }
const changelog = [];  // strings grouped by file
const touched = new Set(); // codes whose questions must be renumbered

function stripNum(q) {
  return q.replace(/^\(\d+\)\s*/, '').trim();
}
function mkQuestion(q) {
  return {
    question: stripNum(q.q ?? q.question ?? ''),
    exampleWords: (q.words ?? q.exampleWords) ? [].concat(q.words ?? q.exampleWords).join(', ') : undefined,
    exampleSentences: q.sentence ?? q.exampleSentences ?? undefined,
  };
}
function relatedGuidsFromCodes(codes) {
  return [].concat(codes || []).map((c) => {
    const d = byCode.get(c);
    if (!d) fail(`related code ${c} not found`);
    return d.guid;
  });
}

// --- apply ops -----------------------------------------------------------
for (const op of ops) {
  const log = (s) => changelog.push({ file: op._file, code: op.code, line: s });

  if (op.op === 'add') {
    if (v4Codes.has(op.code)) fail(`add: ${op.code} already exists in v4 (would redefine a number)`);
    if (byCode.has(op.code)) fail(`add: ${op.code} added twice`);
    const parent = op.parent ?? parentCode(op.code);
    const parentDomain = parent === null ? null : byCode.get(parent);
    if (parent !== null && !parentDomain) fail(`add: parent ${parent} of ${op.code} not found`);

    const d = {
      guid: makeGuid(op.code),
      code: op.code,
      name: op.name,
      description: op.description || '',
      ocmCodes: op.ocmCodes || undefined,
      louwNidaCodes: op.louwNidaCodes || undefined,
      relatedGuids: relatedGuidsFromCodes(op.related),
      questions: (op.questions || []).map(mkQuestion),
      children: [],
    };
    if (parentDomain) {
      parentDomain.children.push(d);
      sortChildren(parentDomain);
    } else {
      roots.push(d);
    }
    byCode.set(d.code, d);
    touched.add(d.code);
    log(`ADD ${op.code} "${op.name}"${op.rationale ? ' — ' + op.rationale : ''}`);
    for (const m of op.migrate || []) {
      migrations.push({ from: m.from, to: op.code, condition: m.note || '' });
      log(`  ↳ migrate: ${m.from} → ${op.code} (${m.note || ''})`);
    }
  } else if (op.op === 'revise') {
    const d = byCode.get(op.code);
    if (!d) fail(`revise: ${op.code} not found`);
    touched.add(op.code);
    if (op.name && op.name !== d.name) {
      log(`RENAME ${op.code} "${d.name}" → "${op.name}"`);
      d.name = op.name;
    }
    if (op.description) {
      d.description = op.description;
      log(`REDESCRIBE ${op.code}${op.rationale ? ' — ' + op.rationale : ''}`);
    }
    if (op.ocmCodes !== undefined) d.ocmCodes = op.ocmCodes || undefined;
    if (op.louwNidaCodes !== undefined) d.louwNidaCodes = op.louwNidaCodes || undefined;
    if (op['related-add']) {
      const add = relatedGuidsFromCodes(op['related-add']);
      d.relatedGuids = [...new Set([...d.relatedGuids, ...add])];
      log(`RELATE ${op.code} + [${[].concat(op['related-add']).join(', ')}]`);
    }
    // Edit specific existing questions (1-based indices into the CURRENT list).
    for (const edit of op['set-question'] || []) {
      const q = d.questions[edit.index - 1];
      if (!q) fail(`revise ${op.code}: set-question index ${edit.index} out of range`);
      if (edit.q !== undefined) q.question = stripNum(edit.q);
      if (edit.words !== undefined) q.exampleWords = [].concat(edit.words).join(', ') || undefined;
      if (edit.sentence !== undefined) q.exampleSentences = edit.sentence || undefined;
      log(`EDIT-Q ${op.code} #${edit.index}${edit.why ? ' — ' + edit.why : ''}`);
    }
    // Remove questions (1-based v4 indices) — process high→low so indices stay valid.
    const removeIdx = [...(op['remove-questions'] || [])].sort((a, b) => b - a);
    for (const idx of removeIdx) {
      if (!d.questions[idx - 1]) fail(`revise ${op.code}: remove-questions index ${idx} out of range`);
      const [removed] = d.questions.splice(idx - 1, 1);
      log(`REMOVE-Q ${op.code} #${idx} "${stripNum(removed.question)}"`);
    }
    // Append new questions.
    for (const q of op['add-questions'] || []) {
      d.questions.push(mkQuestion(q));
      log(`ADD-Q ${op.code} "${stripNum(q.q ?? q.question)}"`);
    }
    for (const m of op.migrate || []) {
      migrations.push({ from: op.code, to: m.to, condition: m.note || '' });
      log(`  ↳ migrate: ${op.code} → ${m.to} (${m.note || ''})`);
    }
    if (op.rationale && !op.description) log(`  (${op.rationale})`);
  } else {
    fail(`unknown op "${op.op}" in ${op._file}`);
  }
}

function cmpCode(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  }
  return 0;
}
function sortChildren(parent) {
  parent.children.sort((x, y) => cmpCode(x.code, y.code));
}

// --- renumber questions in every touched domain -------------------------
for (const code of touched) {
  const d = byCode.get(code);
  d.questions.forEach((q, i) => {
    q.question = `(${i + 1}) ${stripNum(q.question)}`;
  });
}

// --- invariant checks ----------------------------------------------------
({ byCode } = buildMaps(roots));
const all = flatten(roots);
const seenCode = new Set();
const seenGuid = new Set();
for (const d of all) {
  if (seenCode.has(d.code)) fail(`duplicate code after apply: ${d.code}`);
  seenCode.add(d.code);
  if (seenGuid.has(d.guid)) fail(`duplicate guid after apply: ${d.guid}`);
  seenGuid.add(d.guid);
}
for (const c of v4Codes) if (!seenCode.has(c)) fail(`v4 code ${c} disappeared — deletion is forbidden`);
for (const g of v4Guids) if (!seenGuid.has(g)) fail(`v4 guid ${g} disappeared — guid change is forbidden`);
for (const d of all) for (const g of d.relatedGuids) if (!seenGuid.has(g)) fail(`${d.code} RelatedDomains points at missing guid ${g}`);

// --- write outputs -------------------------------------------------------
writeFileSync(DRAFT_PATH, serialize(prefix, roots));

const csvEsc = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const mig = [['from_code', 'to_code', 'condition'], ...migrations.map((m) => [m.from, m.to, m.condition])]
  .map((r) => r.map(csvEsc).join(','))
  .join('\n') + '\n';
writeFileSync(DERIVED + 'migration-map.csv', mig);

const byFile = {};
for (const c of changelog) (byFile[c.file] ||= []).push(c.line);
const clog = ['# Semantic Domains v5 — Draft Changelog', '',
  `Generated from \`v5/changes/*.yaml\`. ${all.length} domains total ` +
  `(${all.length - v4Codes.size} added). ${migrations.length} migration hints.`, ''];
for (const f of Object.keys(byFile).sort()) {
  clog.push(`## ${f}`, '');
  for (const l of byFile[f]) clog.push(l.startsWith('  ') ? l : '- ' + l);
  clog.push('');
}
writeFileSync(CHANGELOG, clog.join('\n'));

console.log(`Applied ${ops.length} ops from ${changeFiles.length} file(s).`);
console.log(`  domains: ${v4Codes.size} (v4) → ${all.length} (v5 draft), +${all.length - v4Codes.size}`);
console.log(`  wrote public/SemDom5-draft.xml, v5/CHANGELOG.md, derived/migration-map.csv`);
