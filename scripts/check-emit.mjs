/**
 * Assert that every domain file on disk is exactly what lib/emit-yaml.mjs would write
 * for it.
 *
 *   node scripts/check-emit.mjs
 *
 * This is what makes the proposal form on /propose/ safe. The form loads a domain,
 * renders it as fields, and emits a whole file; if the emitter reproduced files only
 * approximately, every edit would rewrite unrelated lines and a reviewer could not see
 * what actually changed. Holding this at zero exceptions across all 3,594 files means an
 * edit's diff contains only the edit.
 *
 * It is also the drift alarm: change the field order, the 92-column fold, or the
 * hand-built flow sequence for `related`, and 3,594 assertions fail on the same commit.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadVersion } from './lib/domains.mjs';
import { domainToYaml, FIELD_ORDER, QUESTION_FIELDS } from './lib/emit-yaml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERSIONS = ['v4', 'v5'];

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 20) console.error('  ' + msg);
};

for (const version of VERSIONS) {
  const { ordered, files } = loadVersion(version);
  let checked = 0;

  for (const d of ordered) {
    const rel = files.get(d.code);
    const onDisk = readFileSync(ROOT + rel, 'utf-8');
    if (domainToYaml(d) !== onDisk) fail(`${rel} is not what the emitter would write`);
    checked++;
  }

  console.log(`${version}: ${checked} files checked`);
}

// A field added to the schema but not to FIELD_ORDER would be silently dropped by every
// round-trip through the form — a data-loss bug with green CI and a plausible diff. The
// loader is the schema of record, so compare against what it actually produces.
const KNOWN = new Set([...FIELD_ORDER, 'relatedGuids', 'parentCode', 'childCodes', 'children']);
const sample = loadVersion('v5').ordered[0];
for (const key of Object.keys(sample))
  if (!KNOWN.has(key)) fail(`loader produces "${key}", which lib/emit-yaml.mjs would drop`);
for (const key of Object.keys(sample.questions[0] ?? {})) {
  const mapped = { question: 'q', exampleWords: 'words', exampleSentences: 'sentence' }[key];
  if (!mapped || !QUESTION_FIELDS.includes(mapped))
    fail(`question field "${key}" is not in QUESTION_FIELDS`);
}

if (failures) {
  console.error(`\nFAILED: ${failures} file(s) do not round-trip.`);
  process.exit(1);
}
console.log('\nOK — every domain file is byte-identical to what the emitter writes.');
