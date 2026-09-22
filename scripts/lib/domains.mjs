/**
 * The single loader for semantic-domain data, shared by three consumers:
 *   - `src/lib/semdom.ts`   (the Astro site)
 *   - `scripts/build-xml.mjs` (the XML generator)
 *   - `scripts/validate.mjs`  (the CI gate)
 *
 * It is plain ESM, not TypeScript, precisely so the node scripts can import it without
 * a build step or type-stripping, on any Node. One loader means the validator and
 * the site cannot drift — which matters, because the validator's job is to assert they
 * agree.
 *
 * Reading is synchronous by design: `getChildren()` and friends are called inside
 * recursive .astro components, and making the load async would push `await` through
 * every one of them for no benefit.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const DATA_ROOT = fileURLToPath(new URL('../../data/', import.meta.url));

/** Numeric, segment-wise: '4.10' sorts after '4.9', not before it. */
export function compareCodes(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  }
  return 0;
}

/** Parent code of a dotted code, or null for a root. Never stored — always derived. */
export function parentOf(code) {
  const i = code.lastIndexOf('.');
  return i === -1 ? null : code.slice(0, i);
}

/**
 * Load one YAML document.
 *
 * FAILSAFE_SCHEMA is load-bearing, not a stylistic choice: under the default schema
 * `code: 4.10` parses as the NUMBER 4.1 and silently collides with the real domain 4.1,
 * and `words: no` would become boolean false. FAILSAFE resolves every scalar as a
 * string, which is exactly right here because every field is a string or list of
 * strings. It makes that whole bug class unrepresentable rather than relying on 3,600
 * hand-edited files keeping their quotes.
 */
function loadYaml(file) {
  return yaml.load(readFileSync(file, 'utf-8'), {
    schema: yaml.FAILSAFE_SCHEMA,
    filename: file,
  });
}

export function loadListMeta(version) {
  return loadYaml(`${DATA_ROOT}${version}/list.yaml`);
}

/**
 * Read every domain file for a version.
 * @returns {{meta: object, records: Array, files: Map<string,string>}}
 *   `records` are raw file contents (flat, unordered); `files` maps code -> relative path
 *   so the validator can report a real location and the site can build an "edit" link.
 */
export function loadDomainFiles(version) {
  const dir = `${DATA_ROOT}${version}/domains`;
  const records = [];
  const files = new Map();

  for (const rel of readdirSync(dir, { recursive: true })) {
    const relPath = String(rel).replace(/\\/g, '/');
    if (!relPath.endsWith('.yaml')) continue;
    const rec = loadYaml(`${dir}/${relPath}`);
    records.push(rec);
    files.set(rec.code, `data/${version}/domains/${relPath}`);
  }

  return { meta: loadListMeta(version), records, files };
}

/**
 * Build the nested tree plus lookup maps from flat records.
 *
 * Parentage, sibling order and document order are all DERIVED, never stored — each was
 * verified to hold with zero exceptions across both versions, so storing them would only
 * create a second place to be wrong.
 */
export function buildTree(records) {
  const byCode = new Map();
  const byGuid = new Map();

  for (const r of records) {
    const d = {
      guid: r.guid,
      code: r.code,
      name: r.name,
      description: r.description,
      ocmCodes: r.ocmCodes,
      louwNidaCodes: r.louwNidaCodes,
      related: r.related ?? [],
      questions: (r.questions ?? []).map((q) => ({
        question: q.q,
        exampleWords: q.words,
        exampleSentences: q.sentence,
      })),
      parentCode: parentOf(r.code),
      children: [],
    };
    byCode.set(d.code, d);
    // GUIDs are mixed-case in the source data (70 of them) and are a permanent API, so
    // they are stored verbatim and only INDEXED case-insensitively.
    byGuid.set(d.guid.toUpperCase(), d);
  }

  const roots = [];
  for (const d of byCode.values()) {
    const parent = d.parentCode === null ? null : byCode.get(d.parentCode);
    if (parent) parent.children.push(d);
    else roots.push(d);
  }

  const bySiblingOrder = (a, b) => compareCodes(a.code, b.code);
  roots.sort(bySiblingOrder);
  for (const d of byCode.values()) d.children.sort(bySiblingOrder);

  // Document order = pre-order DFS, which is what the XML uses and what getPrevNext needs.
  const ordered = [];
  (function rec(list) {
    for (const d of list) {
      ordered.push(d);
      rec(d.children);
    }
  })(roots);

  for (const d of ordered) {
    d.childCodes = d.children.map((c) => c.code);
    d.relatedGuids = d.related.map((c) => byCode.get(c)?.guid).filter(Boolean);
  }

  return { roots, ordered, byCode, byGuid };
}

/** Convenience: load + build in one call. */
export function loadVersion(version) {
  const { meta, records, files } = loadDomainFiles(version);
  return { meta, files, ...buildTree(records) };
}
