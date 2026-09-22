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
import { loadVersion } from './lib/domains.mjs';

const BASE = process.argv[2] ?? 'origin/main';

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

      if (f.status === 'A') {
        p(`- **ADDED** \`${version}\` **${code}**`);
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
      const { default: yaml } = await import('js-yaml');
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

      const bq = (b.questions ?? []).map((x) => x.q);
      const aq = after.questions.map((x) => x.question);
      if (bq.length !== aq.length) lines.push(`  - questions: ${bq.length} → ${aq.length}`);
      for (let i = 0; i < Math.min(bq.length, aq.length); i++)
        if (bq[i] !== aq[i]) lines.push(`  - question ${i + 1}: “${bq[i]}” → “${aq[i]}”`);

      const br = (b.related ?? []).join(', ');
      const ar = after.related.join(', ');
      if (br !== ar) lines.push(`  - \`related\`: [${br}] → [${ar}]`);

      p(`- **CHANGED** \`${version}\` **${code}** — ${after.name}`);
      out.push(...lines);
    }
    if (domainFiles.length > 60) p(`\n_… and ${domainFiles.length - 60} more files._`);
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
