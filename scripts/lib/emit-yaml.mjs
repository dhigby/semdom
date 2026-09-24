/**
 * The canonical domain-file writer. Moved here, not rewritten, from
 * scripts/materialize.mjs — its output is the byte-exact shape of all 3,594 files
 * on disk, so scripts/check-emit.mjs can assert that round-tripping any domain
 * reproduces its file exactly. That property is what lets an editing form emit a
 * whole file and still produce a diff containing only what the user changed.
 *
 * Plain ESM, not TypeScript, for the same reason as lib/domains.mjs: CI imports it
 * with no build step, and so does the Astro site.
 *
 * Takes a loader-shaped record — `related` as human-readable codes, questions as
 * { question, exampleWords, exampleSentences }. materialize.mjs resolves its GUIDs
 * to codes before calling.
 */
import yaml from 'js-yaml';

/** Top-level keys, in emission order. check-emit.mjs asserts nothing else exists. */
export const FIELD_ORDER = [
  'code',
  'guid',
  'name',
  'description',
  'ocmCodes',
  'louwNidaCodes',
  'related',
  'questions',
];

/** Keys of a single question, in emission order. */
export const QUESTION_FIELDS = ['q', 'words', 'sentence'];

/**
 * Serialize one domain to its canonical YAML file contents.
 *
 * Three details are load-bearing and must not be tidied:
 *   - `code` is JSON-quoted by hand, because an unquoted 4.10 is the number 4.1.
 *   - `lineWidth: 92` is what folds long descriptions into `>-` blocks the way the
 *     committed files are folded.
 *   - `related` is a hand-built flow sequence; js-yaml would emit it as a block list.
 */
export function domainToYaml(d) {
  const q = (s) => JSON.stringify(String(s));
  const lines = [`code: ${q(d.code)}`, `guid: ${d.guid}`];

  const doc = { name: d.name, description: d.description };
  if (d.ocmCodes !== undefined) doc.ocmCodes = d.ocmCodes;
  if (d.louwNidaCodes !== undefined) doc.louwNidaCodes = d.louwNidaCodes;
  lines.push(yaml.dump(doc, { lineWidth: 92, noRefs: true }).trimEnd());

  if (d.related?.length) lines.push('related: [' + d.related.map(q).join(', ') + ']');

  if (d.questions?.length) {
    const qs = d.questions.map((x) => {
      // The generator owns question numbering. Stripping here keeps materialize.mjs
      // (whose XML records carry the prefix) working unchanged; validate.mjs rejects
      // a stored prefix outright, so this can never alter an existing file.
      const o = { q: x.question.replace(/^\(\d+\) /, '') };
      // '' and undefined are different: '' means "element present but empty", which
      // six v4 questions rely on for byte fidelity with the historic export.
      if (x.exampleWords !== undefined) o.words = x.exampleWords;
      if (x.exampleSentences !== undefined) o.sentence = x.exampleSentences;
      return o;
    });
    lines.push(yaml.dump({ questions: qs }, { lineWidth: 92, noRefs: true }).trimEnd());
  }

  return lines.join('\n') + '\n';
}
