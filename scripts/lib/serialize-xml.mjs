/**
 * Serialize a semantic-domain tree back to the FieldWorks SemDom XML format.
 *
 * This is MOVED, not rewritten, from `v5/scripts/lib.mjs`. Its byte-exact fidelity
 * against the historic v4 export is the entire empirical basis of the source-of-truth
 * migration, so it is kept deliberately dumb and line-oriented. Do not "tidy" it.
 *
 * Format rules, all measured against public/SemDom.xml:
 *   - one tag per line, zero indentation
 *   - fixed child order: Abbreviation, Name, Description, OcmCodes?, LouwNidaCodes?,
 *     RelatedDomains?, Questions?, SubPossibilities?
 *   - `<Uni>` carries no ws attribute; `<AUni>`/`<AStr>`/`<Run>` all carry ws
 *   - only &, < and > are escaped (the source uses no other entities)
 *   - `<Link guid="…"/>` is the only self-closing element in the body
 */

/** Escape the only three characters the source format escapes. */
function enc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Numeric, segment-wise code comparison: '4.10' sorts after '4.9', not before. */
export function compareCodes(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  }
  return 0;
}

/**
 * Build the CmPossibilityList preamble from structured metadata.
 *
 * Previously this was an opaque string sliced off the front of the input file. Once the
 * XML stops being an input there is nothing to slice, so the header becomes repo data
 * (`data/<version>/list.yaml`) and is emitted from these fields.
 */
export function serializePreamble(meta) {
  return [
    `<?xml version="1.0" encoding="${meta.encoding ?? 'UTF-8'}"?>`,
    '<LangProject>',
    '<SemanticDomainList>',
    '<CmPossibilityList>',
    `<IsSorted><Boolean val="${meta.isSorted}"/></IsSorted>`,
    `<ItemClsid><Integer val="${meta.itemClsid}"/></ItemClsid>`,
    `<Depth><Integer val="${meta.depth}"/></Depth>`,
    `<WsSelector><Integer val="${meta.wsSelector}"/></WsSelector>`,
    '<Name>',
    `<AUni ws="${meta.writingSystem}">${enc(meta.name)}</AUni>`,
    '</Name>',
    '<Abbreviation>',
    `<AUni ws="${meta.writingSystem}">${enc(meta.abbreviation)}</AUni>`,
    '</Abbreviation>',
    '<Possibilities>',
  ];
}

function serializeDomain(d, ws, out) {
  out.push(`<CmSemanticDomain guid="${d.guid}">`);
  out.push('<Abbreviation>', `<AUni ws="${ws}">${enc(d.code)}</AUni>`, '</Abbreviation>');
  out.push('<Name>', `<AUni ws="${ws}">${enc(d.name)}</AUni>`, '</Name>');
  out.push(
    '<Description>',
    `<AStr ws="${ws}">`,
    `<Run ws="${ws}">${enc(d.description)}</Run>`,
    '</AStr>',
    '</Description>'
  );
  if (d.ocmCodes) out.push('<OcmCodes>', `<Uni>${enc(d.ocmCodes)}</Uni>`, '</OcmCodes>');
  if (d.louwNidaCodes)
    out.push('<LouwNidaCodes>', `<Uni>${enc(d.louwNidaCodes)}</Uni>`, '</LouwNidaCodes>');

  if (d.relatedGuids?.length) {
    out.push('<RelatedDomains>');
    for (const g of d.relatedGuids) out.push(`<Link guid="${g}"/>`);
    out.push('</RelatedDomains>');
  }

  if (d.questions?.length) {
    out.push('<Questions>');
    d.questions.forEach((q, i) => {
      // The "(n) " prefix is presentation, owned by the generator, never stored.
      // Separator is exactly one space — 0 exceptions across both source files.
      const text = `(${i + 1}) ${q.question}`;
      out.push('<CmDomainQ>', '<Question>', `<AUni ws="${ws}">${enc(text)}</AUni>`, '</Question>');
      // Three distinct states, and the difference is visible in the output bytes:
      //   undefined -> no <ExampleWords> element at all
      //   ''        -> the element with NO <AUni> child (six v4 questions are like this)
      //   text      -> the element wrapping an <AUni>
      // Collapsing '' into either neighbour breaks byte fidelity against the historic export.
      if (q.exampleWords === '') {
        out.push('<ExampleWords>', '</ExampleWords>');
      } else if (q.exampleWords !== undefined) {
        out.push('<ExampleWords>', `<AUni ws="${ws}">${enc(q.exampleWords)}</AUni>`, '</ExampleWords>');
      }

      if (q.exampleSentences === '') {
        out.push('<ExampleSentences>', '</ExampleSentences>');
      } else if (q.exampleSentences !== undefined) {
        out.push(
          '<ExampleSentences>',
          `<AStr ws="${ws}">`,
          `<Run ws="${ws}">${enc(q.exampleSentences)}</Run>`,
          '</AStr>',
          '</ExampleSentences>'
        );
      }
      out.push('</CmDomainQ>');
    });
    out.push('</Questions>');
  }

  if (d.children?.length) {
    out.push('<SubPossibilities>');
    for (const c of d.children) serializeDomain(c, ws, out);
    out.push('</SubPossibilities>');
  }
  out.push('</CmSemanticDomain>');
}

/**
 * @param {object} meta  list.yaml contents (name, abbreviation, isSorted, itemClsid,
 *                       depth, wsSelector, writingSystem, lineEnding, encoding)
 * @param {Array}  roots nested domain tree, children already in document order
 * @returns {string} the complete XML document
 */
export function serialize(meta, roots) {
  const ws = meta.writingSystem ?? 'en';
  const out = serializePreamble(meta);
  for (const d of roots) serializeDomain(d, ws, out);
  out.push('</Possibilities>', '</CmPossibilityList>', '</SemanticDomainList>', '</LangProject>');

  // Trailing newline, then the configured line ending. LF is what git stores, what
  // semdom.org serves, and what FieldWorks 9 itself ships (Templates/SemDom.xml has
  // zero CR bytes) - so `lf` is canonical, not a guess. `lineEnding` stays data in
  // case a future consumer needs CRLF.
  const eol = meta.lineEnding === 'crlf' ? '\r\n' : '\n';
  return out.join(eol) + eol;
}
