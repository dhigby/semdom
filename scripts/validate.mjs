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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadVersion, parentOf, compareCodes } from './lib/domains.mjs';
import { checkText, checkQuestion, checkCode, checkGuid, domainPath } from './lib/domain-rules.mjs';

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
    for (const m of checkCode(d.code)) err(where, m);
    const expectedPath = domainPath(version, d.code);
    if (files.get(d.code) !== expectedPath)
      err(where, `file should be at ${expectedPath}`);

    // GUIDs are a permanent API and are mixed-case in the source data (70 of them),
    // so match case-insensitively and never rewrite.
    for (const m of checkGuid(d.guid)) err(where, m);
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
      const m = label.match(/^questions\[(\d+)\]\.q$/);
      const key = m ? `${version}:${d.code}:${Number(m[1]) + 1}` : null;
      const allowTrailingSpace = Boolean(key && GRANDFATHERED.trailingSpaceQuestions.has(key));
      for (const msg of checkText(label, value, { allowTrailingSpace })) err(where, msg);
    }

    // --- questions ------------------------------------------------------
    // The generator owns the numbering; storing it would make every insertion
    // rewrite the whole list.
    d.questions.forEach((q, i) => {
      for (const msg of checkQuestion(q.question, `questions[${i}]`)) err(where, msg);
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
        // An error, not a warning: a stale lock means the append-only ledger silently
        // stopped recording additions. Nobody hits this by accident any more — new
        // domains are applied by scripts/apply-proposal.mjs, which regenerates it.
        if (added.length)
          err(where, `${added.length} domain(s) added but not recorded: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ' …' : ''} — regenerate with --write-lock (see data/v5/POLICY.md)`);
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

// --- every added domain must say why it exists ----------------------------
/**
 * A domain number is permanent, so the reason it was created has to live in the
 * repository rather than in a mutable GitHub issue. Reads both the frozen migration
 * change-sets and the forward-going ledger; all 10 current v5-only domains satisfy
 * this, so it holds at zero exceptions.
 */
function validateRationales(v4, v5) {
  const where = 'data/v5/changes.yaml';
  const documented = new Map();

  const ingest = (rel) => {
    // FAILSAFE_SCHEMA for the same reason the domain loader uses it: an unquoted
    // `code: 4.10` in a hand-written ledger entry is otherwise the number 4.1, and the
    // rationale would silently attach to the wrong domain.
    const entries =
      yaml.load(readFileSync(ROOT + rel, 'utf-8'), { schema: yaml.FAILSAFE_SCHEMA }) ?? [];
    if (!Array.isArray(entries)) {
      err(rel, 'should be a list of change entries');
      return;
    }
    for (const e of entries)
      if (e?.op === 'add' && e.code) documented.set(String(e.code), { rel, entry: e });
  };

  ingest('data/v5/changes.yaml');
  for (const f of readdirSync(`${ROOT}data/v5/history`).sort())
    if (f.endsWith('.yaml')) ingest(`data/v5/history/${f}`);

  for (const d of v5.ordered) {
    if (v4.byCode.has(d.code)) continue;
    const rec = documented.get(d.code);
    if (!rec)
      err(where, `${d.code} was added to v5 with no "op: add" entry — every new domain must record why it exists`);
    else if (!String(rec.entry.rationale ?? '').trim())
      err(rec.rel, `${d.code} has an add entry with no rationale`);
  }
}

// --- run ------------------------------------------------------------------
const v4 = validateVersion('v4');
const v5 = validateVersion('v5');
validateCompatibility(v4, v5);
validateRationales(v4, v5);

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
