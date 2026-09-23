# Semantic Domains

This repository is the **source of truth for the SIL Semantic Domains standard** — the
~1,800-domain hierarchy used for word collection in dictionary projects worldwide
(Rapid Word Collection, FieldWorks/FLEx). It also builds the website at
[semdom.org](https://semdom.org).

The domain list used to live in a FieldWorks XML export, which was copied here and
rendered. That direction is now reversed: **the data in `data/` is canonical, and the
XML is generated from it.** Changes to the standard are made by editing this
repository; the XML that FieldWorks consumes is a published output.

## Where things are

| Path | What it is |
|---|---|
| `data/v4/domains/` | The released v4 standard — one YAML file per domain |
| `data/v5/domains/` | The v5 draft, under review |
| `data/<v>/list.yaml` | List-level metadata that becomes the XML header |
| `data/<v>/structure.lock` | Generated identity/shape ledger; guards numbers and GUIDs |
| `data/v5/migrations.yaml` | Advisory v4 → v5 re-tagging guide |
| `docs/PRINCIPLES.md` | The compatibility charter — read this before proposing a change |
| `docs/STYLE-GUIDE.md` | How elicitation questions are written |
| `scripts/` | Generator, validator, and the one-off XML conversion |
| `src/` | The Astro website |

A domain file looks like this:

```yaml
code: "1.1.1"
guid: DC1A2C6F-1B32-4631-8823-36DACC8CB7BB
name: Sun
description: >-
  Use this domain for words related to the sun. …
louwNidaCodes: 1D Heavenly Bodies
related: ["8.3.3", "8.3.3.2.1"]
questions:
  - q: What words refer to the sun?
    words: sun, solar, sol, daystar
```

Question numbering, parent domains, sibling order and GUID cross-references are all
**derived**, never stored — so inserting a question does not rewrite the ones after it,
and a renumbering cannot happen by accident.

## The one rule that matters

> **A domain number's meaning can never change, and a number, once used, is never
> reused or deleted. GUIDs are likewise permanent.**

Every dictionary built on this standard references domain numbers in data nobody here
controls and cannot migrate. `docs/PRINCIPLES.md` explains the consequences; CI
enforces them.

## Commands

```bash
npm install
npm run build        # generate the XML, build the site, index it for search
npm run dev          # site only, no search index
npm run build:xml    # regenerate SemDom.xml / SemDom5-draft.xml into public/
npm run verify       # generate and prove byte-fidelity against the historic v4 export
node scripts/validate.mjs   # the CI gate: every invariant
```

Node 24 (matches CI). `dist/`, `public/SemDom*.xml` and `reports/` are generated and
gitignored.

## Provenance

`tests/fixtures/SemDom-v4-original.xml` is the historic FieldWorks v4 export, committed
once and never edited. `npm run verify` regenerates v4 from `data/` and asserts the
result is **byte-identical** to it. That check is what makes the conversion auditable:
anyone can confirm that moving to this repository changed nothing about the standard.

`scripts/materialize.mjs` is the one-off conversion that produced `data/` from that
file. It is kept so the derivation can be re-run and inspected.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: edit a domain's YAML file, open a
pull request, and CI will validate the compatibility invariants and show a reviewer
exactly what changed. Every domain page on semdom.org has a "Suggest an edit" link that
opens the right file.

[docs/EDITING.md](docs/EDITING.md) walks through the same route click by click, in a
browser, for contributors who do not use Git — and covers editing the site's text pages
as well as the domains.
