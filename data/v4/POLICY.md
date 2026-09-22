# v4 change policy

Version 4 is a **released standard**. Thousands of dictionaries reference its domain
numbers in data this project does not control and cannot migrate. It is therefore
treated as frozen in structure and near-frozen in text.

## Locked — CI rejects these

- adding or removing a domain
- changing a domain's code, or reusing a code
- changing a domain's GUID
- re-parenting a domain, or changing sibling order

These are enforced by `data/v4/structure.lock`, a generated ledger of code, GUID,
parent and child-count for every domain. It contains **no text**, so an approved
wording fix never touches it, while any structural change mismatches it immediately.

## Permitted, with review

- fixing a typo or grammatical error
- removing or reframing offensive language
- correcting a Louw-Nida or OCM code that is factually wrong

Conditions, all of them:

1. **Signal it to the maintainers first.** v4 text is not edited casually.
2. **Record it in `data/v4/CHANGELOG.md`**, with the reason.
3. **Mirror the fix into v5**, unless v5 has already deliberately reworded that passage.
   CI checks this — otherwise a correction silently fails to reach the version that
   supersedes v4.
4. **Expect it to ship in a release, not immediately.** The stable download URL points
   at the latest release, not at `main`, so v4 text changes are batched. This is
   deliberate: editing English invalidates the Crowdin translation strings keyed to it,
   and downstream users hold localized copies.

## Provenance

`tests/fixtures/SemDom-v4-original.xml` is the historic FieldWorks export, committed
once and never edited. `npm run verify` regenerates v4 from `data/v4/` and asserts the
result is byte-identical to it.

Two deviations in that original file are currently **preserved on purpose**, so that
fidelity check passes with zero exceptions:

- six questions carry an empty `<ExampleWords></ExampleWords>` element
- seven question texts end in a stray space

Removing the seven trailing spaces is intended as a separate, reviewed change under
this policy — the first real exercise of it — rather than as a silent side effect of
the migration that created this repository.
