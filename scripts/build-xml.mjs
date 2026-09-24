/**
 * Generate the FieldWorks SemDom XML from the repo's YAML source of truth.
 *
 *   node scripts/build-xml.mjs [--out <dir>] [--verify]
 *
 * --out     where to write (default: public/)
 * --verify  additionally assert the generated v4 XML is byte-identical to the historic
 *           export in tests/fixtures/. This is the central fidelity proof of the whole
 *           source-of-truth migration; CI runs it on every PR.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadVersion } from './lib/domains.mjs';
import { serialize } from './lib/serialize-xml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = (outIdx !== -1 ? argv[outIdx + 1] : `${ROOT}public`).replace(/\/$/, '');
const VERIFY = argv.includes('--verify');

const TARGETS = [
  { version: 'v4', file: 'SemDom.xml', fixture: 'tests/fixtures/SemDom-v4-original.xml' },
  { version: 'v5', file: 'SemDom5-draft.xml', fixture: null },
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

mkdirSync(OUT, { recursive: true });
let failed = false;

for (const { version, file, fixture } of TARGETS) {
  const { meta, roots, ordered } = loadVersion(version);
  const xml = serialize(meta, roots);
  const buf = Buffer.from(xml, 'utf-8');

  writeFileSync(`${OUT}/${file}`, buf);
  console.log(
    `${version}: ${ordered.length} domains -> ${file}  ` +
      `(${buf.length.toLocaleString()} bytes, sha256 ${sha(buf).slice(0, 12)}…)`
  );

  if (VERIFY && fixture) {
    // Compare raw bytes. The fixture is marked `-text` in .gitattributes so git never
    // rewrites its line endings; without that this check would pass on ubuntu and fail
    // on a Windows checkout, which is exactly the trap this migration had to avoid.
    const expected = readFileSync(ROOT + fixture);
    if (buf.equals(expected)) {
      console.log(`  VERIFIED: byte-identical to ${fixture} (zero exceptions)`);
    } else {
      failed = true;
      console.error(`  MISMATCH against ${fixture}`);
      console.error(`    generated ${buf.length} bytes / sha256 ${sha(buf)}`);
      console.error(`    expected  ${expected.length} bytes / sha256 ${sha(expected)}`);
      const a = expected.toString('utf-8').split('\n');
      const b = xml.split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 10; i++) {
        if (a[i] !== b[i]) {
          console.error(`    line ${i + 1}:`);
          console.error(`      expected : ${JSON.stringify(a[i])}`);
          console.error(`      generated: ${JSON.stringify(b[i])}`);
          shown++;
        }
      }
    }
  }
}

if (failed) process.exit(1);
