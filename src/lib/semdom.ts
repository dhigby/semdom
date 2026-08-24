import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Question {
  question: string;
  exampleWords?: string;
  exampleSentences?: string;
}

export interface Domain {
  guid: string;
  code: string; // e.g. "4.1.1.1"
  name: string;
  description: string;
  ocmCodes?: string;
  louwNidaCodes?: string;
  relatedGuids: string[];
  questions: Question[];
  parentCode: string | null;
  childCodes: string[];
}

/** fast-xml-parser returns a plain string only when the element has no attributes;
 * any element with an attribute (e.g. ws="en") is nested as { '#text': ..., ws: ... },
 * and numeric-looking text is additionally coerced to a JS number. */
type TextNode = string | number | { '#text': string | number };

interface RawDomain {
  guid: string;
  Abbreviation: { AUni: TextNode };
  Name: { AUni: TextNode };
  Description?: { AStr: { Run: TextNode } };
  OcmCodes?: { Uni: TextNode };
  LouwNidaCodes?: { Uni: TextNode };
  RelatedDomains?: { Link: LinkEl | LinkEl[] };
  Questions?: { CmDomainQ: RawQuestion | RawQuestion[] };
  SubPossibilities?: { CmSemanticDomain: RawDomain | RawDomain[] };
}

interface LinkEl {
  guid: string;
}

interface RawQuestion {
  Question: { AUni: TextNode };
  ExampleWords?: { AUni: TextNode };
  ExampleSentences?: { AStr: { Run: TextNode } };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(node: TextNode | undefined): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node['#text'] !== undefined ? String(node['#text']) : '';
}

export type Version = 'v4' | 'v5';

const SOURCES: Record<Version, string> = {
  v4: '../../public/SemDom.xml',
  v5: '../../public/SemDom5-draft.xml',
};

export type CodeSystem = 'louwNida' | 'ocm';

/** A single Louw-Nida or OCM code cited by a semantic domain. */
export interface CodeRef {
  code: string; // "33A'" | "136a" | "1210"
  label: string; // "Advise"
  aliases: string[]; // other names the same code goes by, e.g. ["Handicapped"]
  group: string; // "33" (Louw-Nida domain) | "170" (OCM major category)
}

/** A code plus every semantic domain that cites it - the reverse index. */
export interface CodeEntry extends CodeRef {
  domainCodes: string[];
}

export interface CodeGroup {
  group: string;
  name: string; // '' when our data never spells the group out (only OCM 110)
  codes: CodeEntry[];
  domainCodes: string[]; // union across the group, document order
}

export interface CodeIndex {
  byCode: Map<string, CodeEntry>;
  groups: CodeGroup[];
}

/** Louw-Nida codes are digits plus an optional letter, and the letter may carry a prime:
 * the lettering runs A-Z, then A'-Z', then A"-Z", so 33A, 33A' and 33A" are three
 * different subdomains. The prime only counts when it is glued to the letter, because
 * labels themselves contain apostrophes ("4D Reptiles and Other 'Creeping Things'").
 * OCM codes are digits plus an optional lowercase letter; those lowercase subdivisions
 * are an SIL extension and occur only under 136 Fauna and 137 Flora. */
const CODE_RE: Record<CodeSystem, RegExp> = {
  louwNida: /^(\d+(?:[A-Z]['"]?)?)\s+(.+)$/,
  ocm: /^(\d+[a-z]?)\s+(.+)$/,
};

/** A few codes are cited with more than one label and frequency does not settle it, so the
 * canonical name is pinned here. Anything not listed falls back to first-seen, and a
 * conflict outside this map is warned about at build time so a refreshed XML cannot drift
 * silently. */
const CANONICAL_LABEL: Record<CodeSystem, Record<string, string>> = {
  // The Louw-Nida name for domain 67 itself; the variants are its subdomains' names.
  louwNida: { '67': 'Time' },
  // Current HRAF names; the variants are the names older editions used.
  ocm: {
    '782': 'Prayers and Sacrifices',
    '783': 'Purification and Atonement',
    '786': 'Ecstatic Religious Practices',
  },
};

function rawCodes(domain: Domain, system: CodeSystem): string | undefined {
  return system === 'louwNida' ? domain.louwNidaCodes : domain.ocmCodes;
}

/** Louw-Nida groups by its domain number (33F -> 33). OCM rolls up to the major category,
 * always the first two digits followed by a zero (136 -> 130, 1210 -> 120, 911 -> 910). */
function codeGroup(system: CodeSystem, code: string): string {
  const digits = /^\d+/.exec(code)![0];
  return system === 'louwNida' ? digits : digits.slice(0, 2) + '0';
}

/** True when a code names its whole group rather than a subdivision of it. These are the
 * occurrences that let us recover each group's official name from our own data. */
function isGroupCode(system: CodeSystem, code: string): boolean {
  return system === 'louwNida' ? /^\d+$/.test(code) : /^\d\d0$/.test(code);
}

/** Sort key parts: number, prime rank, letter. The source order cannot be used - the XML
 * is string-sorted, so 1210 precedes 129 and a stray 144 sits between 590 and 591 - and
 * the digits have to compare numerically, or a flat list would put 14 before 2. Prime
 * outranks letter because Louw-Nida runs A-Z before A'-Z' before A"-Z". */
function codeParts(code: string): [number, number, string] {
  const m = /^(\d+)([A-Za-z]?)(['"]?)$/.exec(code);
  if (!m) return [Number(/^\d+/.exec(code)?.[0] ?? 0), 0, ''];
  return [Number(m[1]), m[3] === "'" ? 1 : m[3] === '"' ? 2 : 0, m[2]];
}

function compareCodes(a: CodeEntry, b: CodeEntry): number {
  const [an, ap, al] = codeParts(a.code);
  const [bn, bp, bl] = codeParts(b.code);
  return an - bn || ap - bp || al.localeCompare(bl);
}

/** Parses one raw `<LouwNidaCodes>` / `<OcmCodes>` string.
 *
 * Entries are separated by "; " - never by commas, which appear inside labels
 * ("1A Universe, Creation", "83E At, Beside, Near, Far"). A segment with no leading code
 * is a second, legacy name for the code before it: "732 Disabilities; Handicapped;
 * 734 Invalidism" is code 732 "Disabilities" (also known as "Handicapped") plus code 734
 * "Invalidism". */
export function parseCodes(raw: string | undefined, system: CodeSystem): CodeRef[] {
  if (!raw) return [];
  const refs: CodeRef[] = [];
  for (const segment of raw.split(';')) {
    const entry = segment.trim();
    if (!entry) continue;
    const match = CODE_RE[system].exec(entry);
    if (!match) {
      // An alias for the preceding code. With nothing preceding it there is nothing to
      // attach it to, so drop it rather than invent a code.
      refs[refs.length - 1]?.aliases.push(entry);
      continue;
    }
    const code = match[1];
    // A number of Louw-Nida labels carry a stray trailing " x" ("17A Stand x"). No real
    // label ends in a bare "x", so stripping it is safe and keeps one code from appearing
    // twice under two spellings.
    refs.push({
      code,
      label: match[2].trim().replace(/\s+x$/, ''),
      aliases: [],
      group: codeGroup(system, code),
    });
  }
  return refs;
}

/** Builds the code -> domains reverse index for one system. Domains accumulate in document
 * order. The canonical label is the pinned one if there is one, otherwise first-seen;
 * every other spelling becomes an alias. */
function buildCodeIndex(domains: Domain[], system: CodeSystem): CodeIndex {
  const byCode = new Map<string, CodeEntry>();
  const groupNames = new Map<string, string>();
  const byGroup = new Map<string, CodeEntry[]>();
  const conflicts = new Set<string>();

  for (const domain of domains) {
    for (const ref of parseCodes(rawCodes(domain, system), system)) {
      let entry = byCode.get(ref.code);
      if (!entry) {
        entry = {
          ...ref,
          label: CANONICAL_LABEL[system][ref.code] ?? ref.label,
          aliases: [...ref.aliases],
          domainCodes: [],
        };
        byCode.set(ref.code, entry);
        if (!byGroup.has(ref.group)) byGroup.set(ref.group, []);
        byGroup.get(ref.group)!.push(entry);
      }
      for (const alias of [ref.label, ...ref.aliases]) {
        if (alias !== entry.label && !entry.aliases.includes(alias)) {
          entry.aliases.push(alias);
          if (!CANONICAL_LABEL[system][ref.code]) conflicts.add(ref.code);
        }
      }
      // A handful of domains cite the same code twice within one field.
      if (!entry.domainCodes.includes(domain.code)) entry.domainCodes.push(domain.code);
      if (isGroupCode(system, ref.code)) groupNames.set(ref.group, entry.label);
    }
  }

  if (conflicts.size > 0) {
    console.warn(
      `[semdom] ${system}: ${conflicts.size} code(s) cited with more than one label and not ` +
        `pinned in CANONICAL_LABEL: ${[...conflicts].join(', ')}`
    );
  }

  const groups: CodeGroup[] = [...byGroup.entries()]
    .map(([group, codes]) => {
      codes.sort(compareCodes);
      const domainCodes: string[] = [];
      for (const entry of codes) {
        for (const code of entry.domainCodes) {
          if (!domainCodes.includes(code)) domainCodes.push(code);
        }
      }
      return { group, name: groupNames.get(group) ?? '', codes, domainCodes };
    })
    .sort((a, b) => Number(a.group) - Number(b.group));

  return { byCode, groups };
}

type Cache = {
  domains: Domain[];
  byCode: Map<string, Domain>;
  byGuid: Map<string, Domain>;
  codeIndex: Record<CodeSystem, CodeIndex>;
};
const caches = new Map<Version, Cache>();

export function loadSemDom(version: Version = 'v4'): Cache {
  const cached = caches.get(version);
  if (cached) return cached;

  const xmlPath = fileURLToPath(new URL(SOURCES[version], import.meta.url));
  const xml = readFileSync(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    isArray: (name) => name === 'CmSemanticDomain' || name === 'CmDomainQ' || name === 'Link',
    attributeValueProcessor: (name, value) => value,
    processEntities: { maxTotalExpansions: Infinity },
  });

  const doc = parser.parse(xml);
  const roots: RawDomain[] =
    doc.LangProject.SemanticDomainList.CmPossibilityList.Possibilities.CmSemanticDomain;

  const domains: Domain[] = [];
  const byCode = new Map<string, Domain>();
  const byGuid = new Map<string, Domain>();

  function walk(raw: RawDomain, parentCode: string | null) {
    const code = text(raw.Abbreviation.AUni);
    const questions: Question[] = asArray(raw.Questions?.CmDomainQ).map((q) => ({
      question: text(q.Question.AUni),
      exampleWords: text(q.ExampleWords?.AUni) || undefined,
      exampleSentences: text(q.ExampleSentences?.AStr?.Run) || undefined,
    }));

    const children = asArray(raw.SubPossibilities?.CmSemanticDomain);
    const childCodes = children.map((c) => text(c.Abbreviation.AUni));

    const domain: Domain = {
      guid: raw.guid,
      code,
      name: text(raw.Name.AUni),
      description: text(raw.Description?.AStr?.Run),
      ocmCodes: text(raw.OcmCodes?.Uni) || undefined,
      louwNidaCodes: text(raw.LouwNidaCodes?.Uni) || undefined,
      relatedGuids: asArray(raw.RelatedDomains?.Link).map((l) => l.guid),
      questions,
      parentCode,
      childCodes,
    };

    domains.push(domain);
    byCode.set(code, domain);
    byGuid.set(domain.guid, domain);

    for (const child of children) {
      walk(child, code);
    }
  }

  for (const root of roots) {
    walk(root, null);
  }

  // Built after the walk rather than inside it: a group's official name comes from a
  // bare-code occurrence that may live anywhere in the tree.
  const codeIndex: Record<CodeSystem, CodeIndex> = {
    louwNida: buildCodeIndex(domains, 'louwNida'),
    ocm: buildCodeIndex(domains, 'ocm'),
  };

  const result: Cache = { domains, byCode, byGuid, codeIndex };
  caches.set(version, result);
  return result;
}

export function getAllDomains(version: Version = 'v4'): Domain[] {
  return loadSemDom(version).domains;
}

export function getDomain(code: string, version: Version = 'v4'): Domain | undefined {
  return loadSemDom(version).byCode.get(code);
}

export function getRootDomains(version: Version = 'v4'): Domain[] {
  return loadSemDom(version).domains.filter((d) => d.parentCode === null);
}

/** Sibling domains (including self) in document order, sharing the same parent. */
export function getSiblings(domain: Domain, version: Version = 'v4'): Domain[] {
  const { byCode } = loadSemDom(version);
  const siblingCodes =
    domain.parentCode === null ? getRootDomains(version).map((d) => d.code) : byCode.get(domain.parentCode)!.childCodes;
  return siblingCodes.map((c) => byCode.get(c)!);
}

/** Previous domain in the flattened document-order traversal (for prev/next paging). */
export function getPrevNext(domain: Domain, version: Version = 'v4'): { prev: Domain | null; next: Domain | null } {
  const { domains } = loadSemDom(version);
  const idx = domains.findIndex((d) => d.code === domain.code);
  return {
    prev: idx > 0 ? domains[idx - 1] : null,
    next: idx < domains.length - 1 ? domains[idx + 1] : null,
  };
}

/** Ancestor chain from root to (excluding) this domain. */
export function getAncestors(domain: Domain, version: Version = 'v4'): Domain[] {
  const { byCode } = loadSemDom(version);
  const chain: Domain[] = [];
  let code = domain.parentCode;
  while (code) {
    const d = byCode.get(code)!;
    chain.unshift(d);
    code = d.parentCode;
  }
  return chain;
}

export function getChildren(domain: Domain, version: Version = 'v4'): Domain[] {
  const { byCode } = loadSemDom(version);
  return domain.childCodes.map((c) => byCode.get(c)!);
}

export function resolveRelated(domain: Domain, version: Version = 'v4'): Domain[] {
  const { byGuid } = loadSemDom(version);
  return domain.relatedGuids.map((g) => byGuid.get(g)).filter((d): d is Domain => !!d);
}

/** A code turned into something usable as an HTML id or URL fragment. The prime marks
 * must map to different characters: 33A, 33A' and 33A" are three different Louw-Nida
 * subdomains, and collapsing them all to "33A-" would collide. */
export function codeSlug(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, (c) => (c === "'" ? 'p' : c === '"' ? 'q' : '-'));
}

/** The codes one domain cites, in the order the source lists them, each carrying the full
 * set of domains that share it. */
export function getCodeRefs(domain: Domain, system: CodeSystem, version: Version = 'v4'): CodeEntry[] {
  const { byCode } = loadSemDom(version).codeIndex[system];
  return parseCodes(rawCodes(domain, system), system)
    .map((ref) => byCode.get(ref.code))
    .filter((e): e is CodeEntry => !!e)
    .sort(compareCodes);
}

/** Every semantic domain citing a given Louw-Nida or OCM code, in document order. */
export function getDomainsForCode(system: CodeSystem, code: string, version: Version = 'v4'): Domain[] {
  const cache = loadSemDom(version);
  const entry = cache.codeIndex[system].byCode.get(code);
  if (!entry) return [];
  return entry.domainCodes.map((c) => cache.byCode.get(c)).filter((d): d is Domain => !!d);
}

/** The whole code -> domains index for a system, for the cross-reference pages. */
export function getCodeIndex(system: CodeSystem, version: Version = 'v4'): CodeIndex {
  return loadSemDom(version).codeIndex[system];
}

/** Rolls one domain's codes up into their Louw-Nida domains / OCM major categories, so a
 * long list - one domain cites 23 OCM codes - reads as a few labelled groups. */
export function groupCodeRefs(entries: CodeEntry[], system: CodeSystem, version: Version = 'v4'): CodeGroup[] {
  const index = loadSemDom(version).codeIndex[system];
  const order: string[] = [];
  const grouped = new Map<string, CodeEntry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.group)) {
      grouped.set(entry.group, []);
      order.push(entry.group);
    }
    grouped.get(entry.group)!.push(entry);
  }
  return order.map((group) => ({
    group,
    name: index.groups.find((g) => g.group === group)?.name ?? '',
    codes: grouped.get(group)!.slice().sort(compareCodes),
    domainCodes: [],
  }));
}
