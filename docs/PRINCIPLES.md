# Semantic Domains v5 — Principles & Compatibility Charter

## Why v5

The Semantic Domains list drives word collection for dictionaries in
underserved languages (Rapid Word Collection, FLEx). Version 4 is ~30 years old
and has four problems v5 addresses:

1. **Embedded moral/religious judgment.** Some domains classify meaning *and*
   pass a verdict on it — e.g. homosexuality filed under a domain literally
   named "Sexual immorality," beside incest, rape, and child abuse, glossed with
   the slurs "pervert/perverted." A semantic-domain list is a lexicographic
   tool, not a statement of ethics; classification should describe how a
   language partitions meaning, not rank behaviors.
2. **Technology frozen ~1999.** Telephone/radio/TV/newspaper exist; the
   internet, mobile phones, software, email, social media, and mobile money do
   not. Communities we serve are overwhelmingly mobile-first — this is a real
   coverage hole, not a luxury.
3. **Coverage gaps.** Ranges of vocabulary with no home domain.
4. **Question quality.** Elicitation questions must both prompt good words *and*
   translate cleanly into many languages. Many are wordy, idiomatic,
   culture-bound, or carry English-only assumptions. (See `STYLE-GUIDE.md`.)

## The core constraint: numbers are a permanent API

Every tagged sense in every dictionary built on v4 references a **domain
number** (e.g. `2.6.2.3`). Those references live in data we do not control and
cannot migrate. Therefore:

> **A domain number's meaning can never change, and a number, once used, is
> never reused or deleted.** GUIDs are likewise permanent.

## Allowed operations

| Op | Meaning | Constraint |
|----|---------|-----------|
| **add** | Create a new domain at a free number | New GUID; parent must exist; number must be unused in v4 and not collide with another add |
| **revise** | Change a domain's name, description, questions, example words/sentences | The domain must still **cover** everything previously tagged to it (scope may broaden or hold, never narrow so as to orphan tagged words) |
| **move-question** | Relocate a question (and its words) to a new/other domain | The origin domain remains a valid, more-general tag; the migration map records the suggested re-tag |
| **deprecate-soft** | Mark a domain "prefer subdomains" in its description | Domain stays; never removed |

**Forbidden:** deleting a domain, reusing a number, changing a GUID, or
narrowing a domain so that already-tagged words become mis-tagged.

Every change carries a `rationale` and feeds the published **v4→v5 migration
map** (`derived/migration-map.csv`): old code → new code, with the condition
under which a sense should be re-tagged (e.g. "senses about same-sex relations
tagged `2.6.2.3` → `2.6.2.4`"). Re-tagging is always *advisory*; the old tag
never becomes invalid.

## Neutrality policy (descriptive reframe)

- **Domains classify meaning, not moral status.** Where a language genuinely has
  evaluative vocabulary (words *for* approval/disapproval), the domain is kept
  but framed as *"words a community uses to express approval/disapproval of X,"*
  not as the project asserting X is good or bad.
- **Orientation and identity are not moral categories.** Sexual orientation,
  and comparable identity vocabulary, get neutral descriptive domains of their
  own, separate from any "proscribed behavior" domain.
- **Violence is violence, not immorality.** Non-consensual acts (rape, assault,
  child sexual abuse) belong with harm/crime vocabulary, cross-linked, not
  bundled under a morality label.
- **Religious vocabulary is kept, framed anthropologically.** Domains for
  sorcery, spirits, taboo, ritual, and named religions stay — languages have
  rich vocabulary here. Descriptions describe usage ("words a community uses
  for…") rather than endorsing or othering a belief system. Terms like
  "ungodly/godless" are labeled as *religious speakers' evaluative terms for
  others*, not neutral descriptors.
- **No slurs as headword example words.** Slurs are documented where a language
  has them, but not presented as the neutral exemplar of a concept.
- **Example sentences are culturally neutral** — no scripture quotations as the
  default illustration.

## GUID policy

New domains receive a fresh uppercase-hex GUID in v4 style
(`XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`). GUIDs are generated deterministically
by `apply-changes.mjs` from the domain code so that re-running the pipeline
yields stable GUIDs (no random churn in the draft). Existing GUIDs are never
altered.

## Scope of this pass

This repository produces: the principles/style docs, audit tooling, the draft
change-sets, a generated `public/SemDom5-draft.xml`, a migration map, a
changelog, and a `/v5/` preview on the website. It is a **proposal for review**,
not a released standard. The full rewrite of all ~7,900 questions is explicitly
iterative follow-on work; this pass ships exemplar rewrites plus mechanical
lint fixes.
