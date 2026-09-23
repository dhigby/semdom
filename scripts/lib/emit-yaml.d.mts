/** Types for the shared emitter, so the Astro site keeps full type-checking. */

import type { RawQuestion } from './domains.d.mts';

export interface EmittableDomain {
  code: string;
  guid: string;
  name: string;
  description: string;
  ocmCodes?: string;
  louwNidaCodes?: string;
  /** Related domains as human-readable codes, not GUIDs. */
  related?: string[];
  questions?: RawQuestion[];
}

export const FIELD_ORDER: readonly string[];
export const QUESTION_FIELDS: readonly string[];
export function domainToYaml(d: EmittableDomain): string;
