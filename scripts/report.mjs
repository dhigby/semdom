/**
 * The human-readable PR report. Reviewers of a standard need to see what CHANGED
 * semantically — which domains, which questions, which codes — not a diff of a
 * 2.8 MB generated XML file. Written to $GITHUB_STEP_SUMMARY by the CI workflow.
 *
 *   node scripts/report.mjs [baseRef]
 *
 * With a base ref (default origin/main) it diffs the working tree against that ref.
 * Without git history it degrades to a plain summary of current state.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadVersion, parentOf } from './lib/domains.mjs';

const BASE = process.argv[2] ?? 'origin/main';
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Rationales for added v5 domains, so a reviewer sees why a permanent number exists. */
function loadRationales() {
  const byCode = new Map();
  const ingest = (rel) => {
    try {
      // FAILSAFE_SCHEMA: an unquoted `code: 4.10` would otherwise be the number 4.1.
      const entries =
        yaml.load(readFileSync(ROOT + rel, 'utf-8'), { schema: yaml.FAILSAFE_SCHEMA }) ?? [];
      for (const e of entries) if (e?.op === 'add' && e.code) byCode.set(String(e.code), e);
    } catch {
      /* a missing ledger is the validator's problem, not the report's */
    }
  };
  ingest('data/v5/changes.yaml');
  try {
    for (const f of readdirSync(`${ROOT}data/v5/history`).sort())
      if (f.endsWith('.yaml')) ingest(`data/v5/history/${f}`);
  } catch {
    /* no history directory */
  }
  return byCode;
}
const RATIONALES = loadRationales();

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf-8',
      maxBuffer: 1 << 28,
    });
  } catch {
    return null;
  }
}

function changedFiles(base) {
  try {
    return execFileSync('git', ['diff', '--name-status', `${base}...HEAD`], {
      encoding: 'utf-8',
      maxBuffer: 1 << 28,
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [status, ...rest] = l.split('\t');
        return { status, path: rest[rest.length - 1] };
      });
  } catch {
    return null;
  }
}

const out = [];
const p = (s = '') => out.push(s);

p('## Semantic Domains — data report');
p();

const versions = ['v4', 'v5'].map((v) => ({ v, ...loadVersion(v) }));
p('| | domains | questions | example words | related links |');
p('|---|--:|--:|--:|--:|');
for (const { v, ordered } of versions) {
  const q = ordered.reduce((n, d) => n + d.questions.length, 0);
  const w = ordered.reduce(
    (n, d) => n + d.questions.filter((x) => x.exampleWords).length,
    0
  );
  const r = ordered.reduce((n, d) => n + d.related.length, 0);
  p(`| **${v}** | ${ordered.length} | ${q} | ${w} | ${r} |`);
}
p();

const files = changedFiles(BASE);
if (!files) {
  p(`_No git history for \`${BASE}\`; showing current state only._`);
} else {
  const domainFiles = files.filter((f) => /^data\/v\d+\/domains\/.*\.yaml$/.test(f.path));

  if (!domainFiles.length) {
    p('_No semantic-domain data changed in this pull request._');
  } else {
    p(`### ${domainFiles.length} domain file(s) changed`);
    p();

    for (const f of domainFiles.slice(0, 60)) {
      const m = f.path.match(/^data\/(v\d+)\/domains\/[^/]+\/(.+)\.yaml$/);
      if (!m) continue;
      const [, version, code] = m;

      // An added domain is the one change that can never be undone, so it gets the
      // fullest rendering in this report rather than the shortest.
      if (f.status === 'A') {
        const d = versions.find((x) => x.v === version)?.byCode.get(code);
        if (!d) {
          p(`- **ADDED** \`${version}\` **${code}**`);
          continue;
        }
        const parent = parentOf(code);
        const parentName = parent
          ? versions.find((x) => x.v === version)?.byCode.get(parent)?.name ?? ''
          : '';
        p(`- **ADDED** \`${version}\` **${code}** — ${d.name}`);
        p(`  - parent: \`${parent ?? 'none (top level)'}\` ${parentName}`);
        p(`  - GUID: \`${d.guid}\``);
        p(`  - description: “${d.description}”`);
        // The rationale ledger covers v5 only; adding to v4 is a hard validation error
        // and never reaches a reviewer, so do not report a v4 file as missing one.
        if (version === 'v5') {
          const r = RATIONALES.get(code);
          p(
            r?.rationale
              ? `  - **rationale:** “${String(r.rationale).trim()}”` +
                  (r.proposedBy ? ` — proposed by ${r.proposedBy}` : '') +
                  (r.issue ? ` (#${r.issue})` : '')
              : '  - **rationale: missing** — validation should have rejected this'
          );
        }
        if (d.related.length) p(`  - related: ${d.related.map((c) => `\`${c}\``).join(', ')}`);
        p(`  - ${d.questions.length} question(s):`);
        for (const [i, q] of d.questions.entries()) {
          p(`    ${i + 1}. “${q.question}”`);
          if (q.exampleWords) p(`       — ${q.exampleWords}`);
        }
        continue;
      }
      if (f.status === 'D') {
        p(`- **REMOVED** \`${version}\` **${code}** — this is forbidden and should have failed validation`);
        continue;
      }

      const before = gitShow(BASE, f.path);
      const after = versions.find((x) => x.v === version)?.byCode.get(code);
      if (!before || !after) {
        p(`- **CHANGED** \`${version}\` **${code}**`);
        continue;
      }

      // Compare the parsed record, so formatting-only churn is not reported as change.
      const b = yaml.load(before, { schema: yaml.FAILSAFE_SCHEMA });
      const lines = [];
      for (const [label, was, now] of [
        ['name', b.name, after.name],
        ['description', b.description, after.description],
        ['ocmCodes', b.ocmCodes, after.ocmCodes],
        ['louwNidaCodes', b.louwNidaCodes, after.louwNidaCodes],
      ]) {
        if ((was ?? '') !== (now ?? '')) lines.push(`  - \`${label}\`: “${was ?? ''}” → “${now ?? ''}”`);
      }

      // Question text, example words and example sentences all have to be diffed: a PR
      // that only rewords example words is a real semantic change, and reporting the
      // domain as "changed" with nothing beneath it tells a reviewer nothing.
      const bq = b.questions ?? [];
      const aq = after.questions;
      if (bq.length !== aq.length) lines.push(`  - questions: ${bq.length} → ${aq.length}`);
      for (let i = 0; i < Math.min(bq.length, aq.length); i++) {
        for (const [label, was, now] of [
          ['', bq[i].q, aq[i].question],
          [' example words', bq[i].words, aq[i].exampleWords],
          [' example sentence', bq[i].sentence, aq[i].exampleSentences],
        ]) {
          if ((was ?? '') === (now ?? '')) continue;
          lines.push(`  - question ${i + 1}${label}: “${was ?? ''}” → “${now ?? ''}”`);
        }
      }

      const br = (b.related ?? []).join(', ');
      const ar = after.related.join(', ');
      if (br !== ar) lines.push(`  - \`related\`: [${br}] → [${ar}]`);

      p(`- **CHANGED** \`${version}\` **${code}** — ${after.name}`);
      out.push(...lines);
    }
    if (domainFiles.length > 60) p(`\n_… and ${domainFiles.length - 60} more files._`);
  }

  const added = domainFiles.filter((f) => f.status === 'A' && f.path.startsWith('data/v5/'));
  if (added.length) {
    p();
    p(`> **This pull request adds ${added.length === 1 ? 'a domain' : `${added.length} domains`} to v5.**`);
    p('> A domain number is permanent from the moment it merges — it can never be');
    p('> reused, renumbered, re-parented or deleted, and it is published as soon as it');
    p('> lands. Confirm: no existing v4 or v5 domain already covers this vocabulary; the');
    p('> number is the next free child of its parent and fills no gap; the description');
    p('> says what does *not* belong here; and the questions are unnumbered and translate');
    p('> out of English. See `data/v5/POLICY.md` and `docs/STYLE-GUIDE.md`.');
  }

  const v4Changed = domainFiles.filter((f) => f.path.startsWith('data/v4/'));
  if (v4Changed.length) {
    p();
    p('> **This pull request edits v4, a released version.** Only typo and');
    p('> offensive-language fixes are permitted, and structure is locked. Confirm the');
    p('> change is mirrored into v5 where v5 had not already diverged, and that');
    p('> `data/v4/CHANGELOG.md` records it. Translation impact: v4 English edits');
    p('> invalidate the Crowdin strings keyed to them.');
  }
}

console.log(out.join('\n'));
