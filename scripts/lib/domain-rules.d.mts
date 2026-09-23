/** Types for the shared rule module, so the Astro site keeps full type-checking. */

export const GUID_RE: RegExp;
export const CODE_RE: RegExp;

export function sanitizeText(s: unknown): string;
export function checkText(
  label: string,
  value: unknown,
  opts?: { allowTrailingSpace?: boolean }
): string[];
export function checkQuestion(text: unknown, label?: string): string[];
export function hasNumberPrefix(text: unknown): boolean;
export function stripNumberPrefix(text: unknown): string;
export function checkCode(code: string): string[];
export function checkGuid(guid: string): string[];
export function domainPath(version: string, code: string): string;
export function nextChildCode(parentCode: string | null, codes: Iterable<string>): string;
export function newGuid(): string;
