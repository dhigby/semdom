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

let cache: { domains: Domain[]; byCode: Map<string, Domain>; byGuid: Map<string, Domain> } | null = null;

export function loadSemDom() {
  if (cache) return cache;

  const xmlPath = fileURLToPath(new URL('../../public/SemDom.xml', import.meta.url));
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

  cache = { domains, byCode, byGuid };
  return cache;
}

export function getAllDomains(): Domain[] {
  return loadSemDom().domains;
}

export function getDomain(code: string): Domain | undefined {
  return loadSemDom().byCode.get(code);
}

export function getRootDomains(): Domain[] {
  return loadSemDom().domains.filter((d) => d.parentCode === null);
}

/** Sibling domains (including self) in document order, sharing the same parent. */
export function getSiblings(domain: Domain): Domain[] {
  const { byCode } = loadSemDom();
  const siblingCodes =
    domain.parentCode === null ? getRootDomains().map((d) => d.code) : byCode.get(domain.parentCode)!.childCodes;
  return siblingCodes.map((c) => byCode.get(c)!);
}

/** Previous domain in the flattened document-order traversal (for prev/next paging). */
export function getPrevNext(domain: Domain): { prev: Domain | null; next: Domain | null } {
  const { domains } = loadSemDom();
  const idx = domains.findIndex((d) => d.code === domain.code);
  return {
    prev: idx > 0 ? domains[idx - 1] : null,
    next: idx < domains.length - 1 ? domains[idx + 1] : null,
  };
}

/** Ancestor chain from root to (excluding) this domain. */
export function getAncestors(domain: Domain): Domain[] {
  const { byCode } = loadSemDom();
  const chain: Domain[] = [];
  let code = domain.parentCode;
  while (code) {
    const d = byCode.get(code)!;
    chain.unshift(d);
    code = d.parentCode;
  }
  return chain;
}

export function getChildren(domain: Domain): Domain[] {
  const { byCode } = loadSemDom();
  return domain.childCodes.map((c) => byCode.get(c)!);
}

export function resolveRelated(domain: Domain): Domain[] {
  const { byGuid } = loadSemDom();
  return domain.relatedGuids.map((g) => byGuid.get(g)).filter((d): d is Domain => !!d);
}
