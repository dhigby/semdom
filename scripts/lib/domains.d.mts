/** Types for the shared JS loader, so the Astro site keeps full type-checking. */

export interface RawQuestion {
  question: string;
  /** '' means "element present but empty" — six v4 questions are like this. */
  exampleWords?: string;
  exampleSentences?: string;
}

export interface LoadedDomain {
  guid: string;
  code: string;
  name: string;
  description: string;
  ocmCodes?: string;
  louwNidaCodes?: string;
  /** Related domains as human-readable codes; GUIDs are resolved on write. */
  related: string[];
  relatedGuids: string[];
  questions: RawQuestion[];
  parentCode: string | null;
  childCodes: string[];
  children: LoadedDomain[];
}

export interface ListMeta {
  name: string;
  abbreviation: string;
  isSorted: string;
  itemClsid: string;
  depth: string;
  wsSelector: string;
  writingSystem: string;
  encoding: string;
  lineEnding: 'lf' | 'crlf';
}

export function compareCodes(a: string, b: string): number;
export function parentOf(code: string): string | null;
export function loadListMeta(version: string): ListMeta;
export function loadDomainFiles(version: string): {
  meta: ListMeta;
  records: unknown[];
  files: Map<string, string>;
};
export function buildTree(records: unknown[]): {
  roots: LoadedDomain[];
  ordered: LoadedDomain[];
  byCode: Map<string, LoadedDomain>;
  byGuid: Map<string, LoadedDomain>;
};
export function loadVersion(version: string): {
  meta: ListMeta;
  files: Map<string, string>;
  roots: LoadedDomain[];
  ordered: LoadedDomain[];
  byCode: Map<string, LoadedDomain>;
  byGuid: Map<string, LoadedDomain>;
};
