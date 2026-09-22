/**
 * The CI gate. This is what makes the repository trustworthy as the source of truth
 * for a standard other people's dictionaries depend on.
 *
 *   node scripts/validate.mjs [--write-lock] [--json]
 *
 * --write-lock  regenerate data/<v>/structure.lock (a deliberate, reviewable act;
 *               the lock files are owned by CODEOWNERS)
 *
 * Severity discipline matters here. Every rule below was checked against the real data
 * before being given a severity: three things that look like obvious hard failures are
 * warnings, because they are true of the shipped v4 corpus and always have been.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadVersion, parentOf, compareCodes } from './lib/domains.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WRITE_LOCK = process.argv.includes('--write-lock');

const errors = [];
const warnings = [];
const infos = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const info = (where, msg) => infos.push(`${where}: ${msg}`);

// Grandfathered facts of the v4 corpus. Each is real, verified, and must not fail CI;
// each is listed explicitly so it stays visible rather than being silently tolerated.
const GRANDFATHERED = {
  /** 8.4.7 lists itself as a related domain. */
  selfRelated: new Set(['8.4.7']),
  /** Seven v4 question texts end in a space. Preserved for byte fidelity with the
   *  historic export; slated for removal in a separate, reviewed PR. */
  trailingSpaceQuestions: new Set([
    'v4:3.2.1.4:3', 'v4:7.1.9:1', 'v4:9.1.3.2:2', 'v4:9.4.1.1:17',
    'v4:9.4.3.1:10', 'v4:9.4.6.1:3', 'v4:9.4.7:12',
  ]),
};

const GUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const CODE_RE = /^\d+(\.\d+)*$/;

function validateVersion(version) {
  const { ordered, byCode, files } = loadVersion(version);
  const seenGuid = new Map();

  for (const d of ordered) {
    const where = files.get(d.code) ?? `${version}:${d.code}`;

    // --- identity -------------------------------------------------------
    // Every scalar must be a string. FAILSAFE_SCHEMA guarantees this on load, so a
    // failure here means the loader was bypassed — worth catching loudly.
    for (const f of ['code', 'guid', 'name', 'description']) {
      if (typeof d[f] !== 'string') err(where, `${f} must be a string, got ${typeof d[f]}`);
    }
    if (!CODE_RE.test(d.code)) err(where, `code "${d.code}" is not a dotted numeric code`);
    if (/(^|\.)0\d/.test(d.code)) err(where, `code "${d.code}" has a leading-zero segment`);
    const expectedPath = `data/${version}/domains/${d.code.split('.')[0]}/${d.code}.yaml`;
    if (files.get(d.code) !== expectedPath)
      err(where, `file should be at ${expectedPath}`);

    // GUIDs are a permanent API and are mixed-case in the source data (70 of them),
    // so match case-insensitively and never rewrite.
    if (!GUID_RE.test(d.guid)) err(where, `guid "${d.guid}" is not a valid GUID`);
    const gk = d.guid.toUpperCase();
    if (seenGuid.has(gk)) err(where, `guid duplicates ${seenGuid.get(gk)}`);
    else seenGuid.set(gk, d.code);

    if (!d.name.trim()) err(where, 'name is empty');
    if (!d.description.trim()) err(where, 'description is empty');

    // --- text hygiene ---------------------------------------------------
    const fields = [['name', d.name], ['description', d.description]];
    d.questions.forEach((q, i) => {
      fields.push([`questions[${i}].q`, q.question]);
      if (q.exampleWords !== undefined) fields.push([`questions[${i}].words`, q.exampleWords]);
      if (q.exampleSentences !== undefined)
        fields.push([`questions[${i}].sentence`, q.exampleSentences]);
    });
    for (const [label, value] of fields) {
      if (/[\r\n]/.test(value)) err(where, `${label} contains a line break`);
      if (/[\t\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) err(where, `${label} contains a control character`);
      const m = label.match(/^questions\[(\d+)\]\.q$/);
      const key = m ? `${version}:${d.code}:${Number(m[1]) + 1}` : null;
      if (value !== value.trim() && !(key && GRANDFATHERED.trailingSpaceQuestions.has(key)))
        err(where, `${label} has leading or trailing whitespace`);
    }

    // --- questions ------------------------------------------------------
    d.questions.forEach((q, i) => {
      if (typeof q.question !== 'string' || !q.question.trim())
        err(where, `questions[${i}] has no text`);
      // The generator owns the numbering; storing it would make every insertion
      // rewrite the whole list.
      if (/^\(\d+\)/.test(q.question ?? ''))
        err(where, `questions[${i}] starts with an "(n)" prefix — the generator adds it`);
    });

    // --- tree -----------------------------------------------------------
    if (d.parentCode !== null && !byCode.has(d.parentCode))
      err(where, `parent ${d.parentCode} does not exist`);

    // --- related --------------------------------------------------------
    const seenRel = new Set();
    for (const c of d.related) {
      if (!byCode.has(c)) err(where, `related "${c}" does not resolve in ${version}`);
      if (seenRel.has(c)) err(where, `related "${c}" listed twice`);
      seenRel.add(c);
      // Warnings, not errors: 8.4.7 genuinely self-references, and 207 of v4's 420
      // links are one-way. Both are properties of the shipped standard.
      if (c === d.code && !GRANDFATHERED.selfRelated.has(d.code))
        warn(where, `related lists itself`);
      const target = byCode.get(c);
      if (target && c !== d.code && !target.related.includes(d.code))
        info(where, `related "${c}" is not reciprocated`);
    }

    // A 10+ segment is legal and will happen; it just must be a conscious act, because
    // it is the case both the XML and YAML parsers historically coerced to a collision.
    if (d.code.split('.').some((seg) => seg.length > 1))
      warn(where, `code has a multi-digit segment — confirm downstream tools handle it`);
  }

  // --- structure lock ---------------------------------------------------
  const lockPath = `${ROOT}data/${version}/structure.lock`;
  const actual =
    ordered
      .map((d) => `${d.code}\t${d.guid}\t${parentOf(d.code) ?? '-'}\t${d.childCodes.length}`)
      .join('\n') + '\n';

  if (WRITE_LOCK) {
    writeFileSync(lockPath, actual, 'utf-8');
    console.log(`wrote data/${version}/structure.lock (${ordered.length} lines)`);
  } else if (!existsSync(lockPath)) {
    err(`data/${version}/structure.lock`, 'missing — run with --write-lock');
  } else {
    const expected = readFileSync(lockPath, 'utf-8');
    if (expected !== actual) {
      const a = expected.trim().split('\n');
      const b = actual.trim().split('\n');
      const setA = new Map(a.map((l) => [l.split('\t')[0], l]));
      const setB = new Map(b.map((l) => [l.split('\t')[0], l]));
      const removed = [...setA.keys()].filter((c) => !setB.has(c));
      const added = [...setB.keys()].filter((c) => !setA.has(c));
      const changed = [...setA.keys()].filter((c) => setB.has(c) && setA.get(c) !== setB.get(c));

      const where = `data/${version}/structure.lock`;
      // v4 is locked outright. v5 is an append-only ledger: additions are expected and
      // merely warn, but removing or mutating an existing line is the forbidden act —
      // "a number, once used, is never reused or deleted".
      if (version === 'v4') {
        if (removed.length) err(where, `domains removed: ${removed.join(', ')}`);
        if (added.length) err(where, `domains added: ${added.join(', ')}`);
        if (changed.length) err(where, `structure changed for: ${changed.join(', ')}`);
      } else {
        if (removed.length) err(where, `domains removed (forbidden): ${removed.join(', ')}`);
        if (changed.length) err(where, `identity/parentage changed (forbidden): ${changed.join(', ')}`);
        if (added.length)
          warn(where, `${added.length} domain(s) added: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ' …' : ''} — regenerate with --write-lock`);
      }
    }
  }

  return { ordered, byCode };
}

// --- cross-version: the PRINCIPLES.md compatibility charter ---------------
function validateCompatibility(v4, v5) {
  const where = 'compatibility (v4 -> v5)';

  for (const d of v4.ordered) {
    const t = v5.byCode.get(d.code);
    if (!t) {
      err(where, `v4 domain ${d.code} is missing from v5 — deletion is forbidden`);
      continue;
    }
    if (t.guid.toUpperCase() !== d.guid.toUpperCase())
      err(where, `${d.code}: GUID changed between v4 and v5 (${d.guid} -> ${t.guid})`);
    if (t.parentCode !== d.parentCode)
      err(where, `${d.code}: re-homed in v5 (${d.parentCode} -> ${t.parentCode})`);
  }

  // The check people forget: a stable GUID that moved to a different number is a
  // renumbering, and it passes a code-keyed check while breaking every tagged sense.
  const v4ByGuid = new Map(v4.ordered.map((d) => [d.guid.toUpperCase(), d]));
  const v5ByGuid = new Map(v5.ordered.map((d) => [d.guid.toUpperCase(), d]));
  for (const [g, d] of v4ByGuid) {
    const t = v5ByGuid.get(g);
    if (!t) err(where, `v4 GUID ${g} (${d.code}) absent from v5`);
    else if (t.code !== d.code) err(where, `GUID ${g} renumbered ${d.code} -> ${t.code}`);
  }

  // New v5 domains must not recycle a retired GUID.
  for (const d of v5.ordered)
    if (!v4.byCode.has(d.code) && v4ByGuid.has(d.guid.toUpperCase()))
      err(where, `new v5 domain ${d.code} reuses a v4 GUID`);
}

// --- run ------------------------------------------------------------------
const v4 = validateVersion('v4');
const v5 = validateVersion('v5');
validateCompatibility(v4, v5);

const show = (label, list, cap = 25) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length}):`);
  for (const l of list.slice(0, cap)) console.log('  ' + l);
  if (list.length > cap) console.log(`  … and ${list.length - cap} more`);
};

console.log(`v4: ${v4.ordered.length} domains    v5: ${v5.ordered.length} domains`);
show('INFO', infos, 5);
show('WARNINGS', warnings);
show('ERRORS', errors);

if (errors.length) {
  console.error(`\nFAILED: ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`\nOK — ${warnings.length} warning(s), ${infos.length} info.`);
