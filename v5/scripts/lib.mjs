// Shared helpers for the v5 tooling: faithfully load the FieldWorks SemDom XML
// into a mutable nested tree, and serialize a tree back to the same line-oriented
// format the v4 export uses. The parser options mirror src/lib/semdom.ts so the
// generated draft parses identically on the website.
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const V4_PATH = fileURLToPath(new URL('../../public/SemDom.xml', import.meta.url));
export const DRAFT_PATH = fileURLToPath(new URL('../../public/SemDom5-draft.xml', import.meta.url));

// --- text coercion (same quirks as src/lib/semdom.ts) --------------------
function text(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node['#text'] !== undefined ? String(node['#text']) : '';
}
function asArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// --- load ----------------------------------------------------------------
// Returns { prefix, roots } where `prefix` is the literal header text up to and
// including `<Possibilities>` (preserved verbatim), and `roots` is the mutable
// nested domain tree.
export function loadDomTree(xmlPath = V4_PATH) {
  const raw = readFileSync(xmlPath, 'utf-8').replace(/\r\n/g, '\n');

  const marker = '<Possibilities>';
  const mi = raw.indexOf(marker);
  if (mi === -1) throw new Error('Could not find <Possibilities> in ' + xmlPath);
  const prefix = raw.slice(0, mi + marker.length) + '\n';

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    isArray: (name) => name === 'CmSemanticDomain' || name === 'CmDomainQ' || name === 'Link',
    attributeValueProcessor: (_name, value) => value,
    processEntities: { maxTotalExpansions: Infinity },
  });
  const doc = parser.parse(raw);
  const rawRoots = doc.LangProject.SemanticDomainList.CmPossibilityList.Possibilities.CmSemanticDomain;

  function walk(r) {
    return {
      guid: r.guid,
      code: text(r.Abbreviation.AUni),
      name: text(r.Name.AUni),
      description: text(r.Description?.AStr?.Run),
      ocmCodes: text(r.OcmCodes?.Uni) || undefined,
      louwNidaCodes: text(r.LouwNidaCodes?.Uni) || undefined,
      relatedGuids: asArray(r.RelatedDomains?.Link).map((l) => l.guid),
      questions: asArray(r.Questions?.CmDomainQ).map((q) => ({
        question: text(q.Question.AUni),
        exampleWords: text(q.ExampleWords?.AUni) || undefined,
        exampleSentences: text(q.ExampleSentences?.AStr?.Run) || undefined,
      })),
      children: asArray(r.SubPossibilities?.CmSemanticDomain).map(walk),
    };
  }
  return { prefix, roots: asArray(rawRoots).map(walk) };
}

// --- tree utilities ------------------------------------------------------
export function flatten(roots) {
  const out = [];
  (function rec(list) {
    for (const d of list) {
      out.push(d);
      if (d.children?.length) rec(d.children);
    }
  })(roots);
  return out;
}
export function buildMaps(roots) {
  const byCode = new Map();
  const byGuid = new Map();
  for (const d of flatten(roots)) {
    byCode.set(d.code, d);
    byGuid.set(d.guid, d);
  }
  return { byCode, byGuid };
}

// Deterministic v4-style GUID derived from the domain code, so re-running the
// pipeline never churns GUIDs. Not security-sensitive.
export function makeGuid(code) {
  const h = createHash('md5').update('semdom-v5:' + code).digest('hex').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// --- serialize -----------------------------------------------------------
function enc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeDomain(d, out) {
  out.push(`<CmSemanticDomain guid="${d.guid}">`);
  out.push('<Abbreviation>', `<AUni ws="en">${enc(d.code)}</AUni>`, '</Abbreviation>');
  out.push('<Name>', `<AUni ws="en">${enc(d.name)}</AUni>`, '</Name>');
  out.push('<Description>', '<AStr ws="en">', `<Run ws="en">${enc(d.description)}</Run>`, '</AStr>', '</Description>');
  if (d.ocmCodes) out.push('<OcmCodes>', `<Uni>${enc(d.ocmCodes)}</Uni>`, '</OcmCodes>');
  if (d.louwNidaCodes) out.push('<LouwNidaCodes>', `<Uni>${enc(d.louwNidaCodes)}</Uni>`, '</LouwNidaCodes>');
  if (d.relatedGuids?.length) {
    out.push('<RelatedDomains>');
    for (const g of d.relatedGuids) out.push(`<Link guid="${g}"/>`);
    out.push('</RelatedDomains>');
  }
  if (d.questions?.length) {
    out.push('<Questions>');
    for (const q of d.questions) {
      out.push('<CmDomainQ>', '<Question>', `<AUni ws="en">${enc(q.question)}</AUni>`, '</Question>');
      if (q.exampleWords) out.push('<ExampleWords>', `<AUni ws="en">${enc(q.exampleWords)}</AUni>`, '</ExampleWords>');
      if (q.exampleSentences)
        out.push('<ExampleSentences>', '<AStr ws="en">', `<Run ws="en">${enc(q.exampleSentences)}</Run>`, '</AStr>', '</ExampleSentences>');
      out.push('</CmDomainQ>');
    }
    out.push('</Questions>');
  }
  if (d.children?.length) {
    out.push('<SubPossibilities>');
    for (const c of d.children) serializeDomain(c, out);
    out.push('</SubPossibilities>');
  }
  out.push('</CmSemanticDomain>');
}

export function serialize(prefix, roots) {
  const out = [];
  for (const d of roots) serializeDomain(d, out);
  const body = out.join('\n');
  const suffix = '</Possibilities>\n</CmPossibilityList>\n</SemanticDomainList>\n</LangProject>\n';
  return prefix + body + '\n' + suffix;
}

// Parent code of a dotted domain code, or null for a top-level code.
export function parentCode(code) {
  const i = code.lastIndexOf('.');
  return i === -1 ? null : code.slice(0, i);
}
