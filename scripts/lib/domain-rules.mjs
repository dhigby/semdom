/**
 * The rules a domain record must satisfy, in one place.
 *
 * These were lifted out of scripts/validate.mjs so the browser form on /propose/ and
 * the CI gate enforce the same thing by running the same function rather than by
 * agreeing to stay in step. If a rule is tightened here, the form tightens with it on
 * the next deploy.
 *
 * Isomorphic plain ESM: no node: imports, and `crypto` is a global in Node 19+ and in
 * every browser, so this module loads unchanged in both.
 */

export const GUID_RE =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
export const CODE_RE = /^\d+(\.\d+)*$/;

/** Characters validate.mjs rejects outright in any stored text field. */
const CONTROL_RE = /[\t\x00-\x08\x0b\x0c\x0e-\x1f]/;
const LINE_BREAK_RE = /[\r\n]/;
const NUMBERED_RE = /^\(\d+\)/;

/**
 * Collapse anything a coordinator might paste into a single stored line.
 *
 * Word supplies \r\n, non-breaking spaces and the occasional vertical tab; every one
 * of those is a hard CI error the author cannot see. Normalizing NBSP matters as much
 * as the line breaks — it survives .trim() and reads as an ordinary space.
 */
export function sanitizeText(s) {
  return String(s)
    .replace(/ /g, ' ')
    .replace(/[\r\n\t\x00-\x1f]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Check one stored text field. Returns CI's own message strings, so an author reads
 * the same wording on semdom.org that a reviewer would read on a failed check.
 *
 * `allowTrailingSpace` exists for the seven grandfathered v4 question texts.
 */
export function checkText(label, value, { allowTrailingSpace = false } = {}) {
  const out = [];
  if (typeof value !== 'string') {
    out.push(`${label} must be a string, got ${typeof value}`);
    return out;
  }
  if (LINE_BREAK_RE.test(value)) out.push(`${label} contains a line break`);
  if (CONTROL_RE.test(value)) out.push(`${label} contains a control character`);
  if (value !== value.trim() && !allowTrailingSpace)
    out.push(`${label} has leading or trailing whitespace`);
  return out;
}

/** The generator adds "(1) " at XML build time; storing it would renumber on every insert. */
export function checkQuestion(text, label = 'question') {
  const out = [];
  if (typeof text !== 'string' || !text.trim()) {
    out.push(`${label} has no text`);
    return out;
  }
  if (NUMBERED_RE.test(text))
    out.push(`${label} starts with an "(n)" prefix — the generator adds it`);
  return out;
}

/** True when `text` carries the forbidden prefix, so a form can offer to strip it. */
export function hasNumberPrefix(text) {
  return NUMBERED_RE.test(String(text));
}

/** Remove a leading "(n) " prefix — the one-click fix for text copied off the site. */
export function stripNumberPrefix(text) {
  return String(text).replace(/^\(\d+\)\s*/, '');
}

export function checkCode(code) {
  const out = [];
  if (!CODE_RE.test(code)) out.push(`code "${code}" is not a dotted numeric code`);
  if (/(^|\.)0\d/.test(code)) out.push(`code "${code}" has a leading-zero segment`);
  return out;
}

export function checkGuid(guid) {
  return GUID_RE.test(guid) ? [] : [`guid "${guid}" is not a valid GUID`];
}

/** Where a domain's file must live. validate.mjs errors if the path differs. */
export function domainPath(version, code) {
  return `data/${version}/domains/${code.split('.')[0]}/${code}.yaml`;
}

/**
 * The next free child number under `parentCode`.
 *
 * Gaps are never filled: a missing number may be missing because it was considered and
 * discarded, and nothing here can know that. So this takes the highest existing sibling
 * segment and adds one, across every code it is given — callers pass the union of v4 and
 * v5 so a number retired in v4 is never handed out in v5.
 */
export function nextChildCode(parentCode, codes) {
  const prefix = parentCode === null ? '' : `${parentCode}.`;
  const depth = parentCode === null ? 1 : parentCode.split('.').length + 1;
  let max = 0;
  for (const c of codes) {
    if (!c.startsWith(prefix)) continue;
    const segs = c.split('.');
    if (segs.length !== depth) continue;
    const n = Number(segs[depth - 1]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/**
 * A GUID in the corpus's own style: uppercase 8-4-4-4-12 with arbitrary version and
 * variant nibbles, like the 3,594 already committed. crypto.randomUUID() would pass
 * validation but emits lowercase and pins version 4, so new domains would look visibly
 * unlike every other one. Same entropy either way.
 */
export function newGuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
