/**
 * ONE-OFF: convert the historic FieldWorks XML into the repo's per-domain YAML,
 * which becomes the source of truth. Kept in-repo afterwards as documentation of
 * provenance — it is how anyone can re-derive `data/` from the original export.
 *
 *   node scripts/materialize.mjs [--check]
 *
 * --check parses and asserts without writing anything.
 *
 * Two parser options here are load-bearing and must not be removed:
 *   parseTagValue: false  — otherwise a code like "4.10" is read as the NUMBER 4.1 and
 *                           silently collides with the real domain 4.1.
 *   trimValues:    false  — otherwise the 7 question texts that end in a space are
 *                           silently trimmed, making a data decision by accident.
 */
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { compareCodes } from './lib/serialize-xml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK_ONLY = process.argv.includes('--check');

const SOURCES = [
  { version: 'v4', xml: 'tests/fixtures/SemDom-v4-original.xml' },
  { version: 'v5', xml: 'public/SemDom5-draft.xml' },
];

let failures = 0;
const fail = (msg) => {
  console.error('  FAIL: ' + msg);
  failures++;
};

// --- read -----------------------------------------------------------------
const text = (node) => {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  return node['#text'] !== undefined ? String(node['#text']) : '';
};
const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function parseXml(absPath) {
  const raw = readFileSync(absPath, 'utf-8').replace(/\r\n/g, '\n');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    isArray: (n) => n === 'CmSemanticDomain' || n === 'CmDomainQ' || n === 'Link',
    attributeValueProcessor: (_n, v) => v,
    parseTagValue: false,
    trimValues: false,
    processEntities: { maxTotalExpansions: Infinity },
  });
  const doc = parser.parse(raw);
  const list = doc.LangProject.SemanticDomainList.CmPossibilityList;

  const meta = {
    name: text(list.Name.AUni).trim(),
    abbreviation: text(list.Abbreviation.AUni).trim(),
    isSorted: list.IsSorted.Boolean.val,
    itemClsid: list.ItemClsid.Integer.val,
    depth: list.Depth.Integer.val,
    wsSelector: list.WsSelector.Integer.val,
    writingSystem: list.Name.AUni.ws ?? 'en',
    encoding: 'UTF-8',
    lineEnding: 'lf',
  };

  const walk = (r) => ({
    guid: r.guid,
    code: text(r.Abbreviation.AUni),
    name: text(r.Name.AUni),
    description: text(r.Description?.AStr?.Run),
    ocmCodes: r.OcmCodes !== undefined ? text(r.OcmCodes?.Uni) : undefined,
    louwNidaCodes: r.LouwNidaCodes !== undefined ? text(r.LouwNidaCodes?.Uni) : undefined,
    relatedGuids: asArray(r.RelatedDomains?.Link).map((l) => l.guid),
    questions: asArray(r.Questions?.CmDomainQ).map((q) => ({
      question: text(q.Question.AUni),
      // `in`, not truthiness: preserves the 6 genuinely-empty <ExampleWords/> pairs.
      exampleWords: 'ExampleWords' in q ? text(q.ExampleWords?.AUni) : undefined,
      exampleSentences:
        'ExampleSentences' in q ? text(q.ExampleSentences?.AStr?.Run) : undefined,
    })),
    children: asArray(r.SubPossibilities?.CmSemanticDomain).map(walk),
  });

  return { meta, roots: asArray(list.Possibilities.CmSemanticDomain).map(walk) };
}

const flatten = (roots) => {
  const out = [];
  (function rec(list) {
    for (const d of list) {
      out.push(d);
      rec(d.children ?? []);
    }
  })(roots);
  return out;
};

// --- assert the properties the storage format relies on -------------------
function assertConvertible(version, roots) {
  const all = flatten(roots);
  const byCode = new Map(all.map((d) => [d.code, d]));
  const byGuid = new Map(all.map((d) => [d.guid.toUpperCase(), d]));

  if (byCode.size !== all.length) fail(`${version}: duplicate domain code`);
  if (byGuid.size !== all.length) fail(`${version}: duplicate GUID (case-insensitive)`);

  // 1. Question numbering is positional, so it need not be stored.
  for (const d of all)
    d.questions.forEach((q, i) => {
      const m = q.question.match(/^\((\d+)\) /);
      if (!m) fail(`${version} ${d.code} q${i + 1}: no "(n) " prefix`);
      else if (Number(m[1]) !== i + 1)
        fail(`${version} ${d.code}: q labelled (${m[1]}) at position ${i + 1}`);
    });

  // 2. Tree parentage equals the code prefix, so parent need not be stored.
  // 3. Siblings are already in numeric order, so order need not be stored.
  (function rec(list, parent) {
    const codes = list.map((d) => d.code);
    const sorted = [...codes].sort(compareCodes);
    if (codes.join('|') !== sorted.join('|'))
      fail(`${version}: siblings of ${parent ?? 'ROOT'} are not in numeric order`);
    for (const d of list) {
      const i = d.code.lastIndexOf('.');
      const expect = i === -1 ? null : d.code.slice(0, i);
      if ((parent ?? null) !== expect)
        fail(`${version} ${d.code}: tree parent ${parent ?? 'ROOT'} != code prefix ${expect}`);
      rec(d.children, d.code);
    }
  })(roots, null);

  // 4. Related links all resolve, so they can be stored as human-readable codes.
  for (const d of all)
    for (const g of d.relatedGuids)
      if (!byGuid.has(g.toUpperCase()))
        fail(`${version} ${d.code}: related GUID ${g} does not resolve`);

  return { all, byGuid };
}

// --- emit -----------------------------------------------------------------
function domainToYaml(d, byGuid) {
  const q = (s) => JSON.stringify(String(s));
  const lines = [`code: ${q(d.code)}`, `guid: ${d.guid}`];

  const doc = { name: d.name, description: d.description };
  if (d.ocmCodes !== undefined) doc.ocmCodes = d.ocmCodes;
  if (d.louwNidaCodes !== undefined) doc.louwNidaCodes = d.louwNidaCodes;
  lines.push(yaml.dump(doc, { lineWidth: 92, noRefs: true }).trimEnd());

  if (d.relatedGuids.length)
    lines.push(
      'related: [' + d.relatedGuids.map((g) => q(byGuid.get(g.toUpperCase()).code)).join(', ') + ']'
    );

  if (d.questions.length) {
    const qs = d.questions.map((x) => {
      const o = { q: x.question.replace(/^\(\d+\) /, '') };
      if (x.exampleWords !== undefined) o.words = x.exampleWords;
      if (x.exampleSentences !== undefined) o.sentence = x.exampleSentences;
      return o;
    });
    lines.push(yaml.dump({ questions: qs }, { lineWidth: 92, noRefs: true }).trimEnd());
  }
  return lines.join('\n') + '\n';
}

console.log(CHECK_ONLY ? 'Checking (no files written)...\n' : 'Materializing data/ from XML...\n');

for (const { version, xml } of SOURCES) {
  const { meta, roots } = parseXml(ROOT + xml);
  const { all, byGuid } = assertConvertible(version, roots);

  const emptyWords = all.flatMap((d) => d.questions.filter((q) => q.exampleWords === '')).length;
  const trailing = all.flatMap((d) =>
    d.questions.filter((q) => q.question !== q.question.trimEnd())
  ).length;
  console.log(
    `${version}: ${all.length} domains, ` +
      `${all.reduce((n, d) => n + d.questions.length, 0)} questions  ` +
      `[preserved: ${emptyWords} empty exampleWords, ${trailing} trailing-space questions]`
  );

  if (CHECK_ONLY) continue;

  const base = `${ROOT}data/${version}`;
  if (existsSync(`${base}/domains`)) rmSync(`${base}/domains`, { recursive: true });
  mkdirSync(`${base}/domains`, { recursive: true });

  writeFileSync(`${base}/list.yaml`, yaml.dump(meta, { lineWidth: 92 }), 'utf-8');

  for (const d of all) {
    const root = d.code.split('.')[0];
    mkdirSync(`${base}/domains/${root}`, { recursive: true });
    writeFileSync(`${base}/domains/${root}/${d.code}.yaml`, domainToYaml(d, byGuid), 'utf-8');
  }

  // Structure lock: identity and shape only, never text — so an approved typo fix
  // never touches it, but any add/remove/renumber/re-parent/re-GUID does.
  const lock = all
    .map((d) => {
      const i = d.code.lastIndexOf('.');
      return `${d.code}\t${d.guid}\t${i === -1 ? '-' : d.code.slice(0, i)}\t${d.children.length}`;
    })
    .join('\n');
  writeFileSync(`${base}/structure.lock`, lock + '\n', 'utf-8');

  console.log(`  -> data/${version}/ (${all.length} domain files, list.yaml, structure.lock)`);
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed — conversion aborted.`);
  process.exit(1);
}
console.log('\nAll conversion assertions passed.');
