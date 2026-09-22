# v4 changelog

Every approved change to the released v4 standard, newest first. See `POLICY.md` for
what may be changed and under what conditions.

Structural change is not possible here: codes, GUIDs and parentage are locked by
`structure.lock`. This file therefore records text corrections only.

## Unreleased

- **Corrected terminal punctuation and stray whitespace in 15 domains.** Mechanical
  punctuation repairs only; no wording, sense or scope was altered, and no domain,
  code, GUID or parentage was touched. All 15 are mirrored in `data/v5/`
  (POLICY condition 3). Commit `1126ddc`.

  | Domain | Field | Correction |
  |---|---|---|
  | 1.6.2 | exampleWords | `fang , tusk` → `fang, tusk` (space before comma) |
  | 2.5.6.1 | description | added missing final period |
  | 2.6.4.5 | description | `older persons?` → `older persons.` (statement, not a question) |
  | 3.5.2.4 | description | added missing final period |
  | 4.4 | description | added missing final period |
  | 4.6.7.3 | description | added missing final period |
  | 4.9.3.1 | description | `religions .` → `religions.` (space before period) |
  | 6.8.9.5 | question (2) | terminal `.` → `?` |
  | 7.3.1.2 | description | added missing final period |
  | 7.3.6.2 | description | added missing final period |
  | 8.1.5.4 | question (3) | terminal `.` → `?` |
  | 8.3.1.8.1 | description | added missing final period |
  | 9.4.3.2 | question (1) | terminal `.` → `?` |
  | 9.7.1.6 | description | added missing final period |
  | 9.7.1.6 | question (2) | terminal `.` → `?` |

- **Fixed a grammatical error in one elicitation question.** Domain 3.2.5.2,
  question (3): *"something or someone that is hard to believed?"* →
  *"...hard to believe?"*. Mirrored in `data/v5/` (POLICY condition 3).
  Commit `afcba41`.

- Converted v4 from the FieldWorks XML export into per-domain YAML under
  `data/v4/domains/`. **No content changed.** The generated XML is byte-identical to
  `tests/fixtures/SemDom-v4-original.xml`, which is asserted on every pull request by
  `npm run verify`.

  The two corrections above were made to the XML *before* this conversion, so they are
  carried in both the YAML and the fixture. Against `SemDom.xml` as shipped in
  FieldWorks 9 (`Templates/SemDom.xml`, sha256 `a57a47ca…`), those 16 lines are the
  **only** differences in the whole file — confirmed by direct byte comparison.
