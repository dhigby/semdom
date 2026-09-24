# Proposing a change to the Semantic Domains

Thank you for helping improve the standard. This document is for anyone proposing a
change to the domain list — you do not need to be a programmer, and you do not need to
install anything.

## The quickest route

Use the form at **[semdom.org/propose/](https://semdom.org/propose/)**, or the
**"Suggest a change"** link at the bottom of any domain page. It shows the domain as
ordinary labelled fields, checks everything this document describes as you type, and
emails a complete proposal to the maintainers. No account, no YAML, no Git.

If you would rather edit the file yourself, every domain page also has an **"Edit the
file on GitHub"** link, which opens its YAML in GitHub's editor and walks you through
opening a pull request. That route cannot create a *new* domain — see below.

[docs/EDITING.md](docs/EDITING.md) covers both routes click by click, and the site's text
pages too.

A domain lives in exactly one file, named after its code:

```
data/v5/domains/1/1.1.1.yaml     ->  domain 1.1.1
data/v4/domains/4/4.9.9.yaml     ->  domain 4.9.9
```

## What a domain file contains

```yaml
code: "1.1.1"                     # never change this
guid: DC1A2C6F-1B32-4631-8823-36DACC8CB7BB   # never change this
name: Sun
description: >-
  Use this domain for words related to the sun. …
ocmCodes: 821 Weather             # optional
louwNidaCodes: 1D Heavenly Bodies # optional
related: ["8.3.3", "8.3.3.2.1"]   # other domains, by code
questions:
  - q: What words refer to the sun?
    words: sun, solar, sol, daystar
    sentence: The <sun> rose over the hill.   # optional
```

Notes that save time:

- **Do not number the questions.** Write `q: What words refer to the sun?`, not
  `(1) What words…`. The numbering is added when the XML is generated, so inserting a
  question renumbers the rest automatically.
- **Keep `code` in quotes.** `code: 4.10` without quotes is read as the number 4.1 and
  would collide with a real domain. The loader defends against this, but quoted is
  correct.
- `related` uses domain **codes**, not GUIDs. The generator resolves them.
- `words` is a single comma-separated string, matching how the data has always been
  stored.

See `docs/STYLE-GUIDE.md` for how elicitation questions should be written — they have to
prompt a native speaker *and* translate cleanly into dozens of languages.

## What you may and may not change

The full charter is `docs/PRINCIPLES.md`. The short version:

| | Allowed |
|---|---|
| **Add** a new domain at an unused number | Yes, in v5 — via the form only |
| **Revise** a name, description, question, or example words | Yes |
| **Broaden** a domain's scope | Yes |
| **Narrow** a domain so already-tagged words become mis-tagged | No |
| **Delete** a domain | Never |
| **Reuse or renumber** a domain code | Never |
| **Change** a GUID | Never |

Those last three are permanent because every dictionary built on this standard
references domain numbers in data we do not control and cannot migrate.

### v4 and v5 are different

- **`data/v5/`** is the draft under active development. This is where most changes go.
- **`data/v4/`** is a released version. Its **structure is locked** — no additions,
  removals, renumbering, re-parenting or GUID changes, and CI will reject them. Text
  fixes (typos, and removing offensive language) *are* accepted when they have been
  signalled to the maintainers first, and must be recorded in `data/v4/CHANGELOG.md`.

  If you fix v4 text, **apply the same fix to v5** unless v5 has already deliberately
  reworded that passage. CI checks this, because otherwise a correction silently fails
  to reach the version that supersedes it.

  Editing v4 English also invalidates the Crowdin translation strings keyed to it, so
  v4 text changes are batched into releases rather than published one at a time.

## What happens to your pull request

CI runs automatically. Click **Details** next to the "Validate" check and open the run's
summary page, which shows:

- every domain that changed, field by field, in plain language
- the compatibility invariants (nothing deleted, renumbered, or re-GUIDed)
- confirmation that the generated v4 XML still matches the historic export
- the generated XML files, downloadable, if you want to load them into FieldWorks

(The summary lives on the run rather than in a PR comment, because a pull request from a
fork gets a read-only token and cannot comment.)

A maintainer then reviews and merges. Merging regenerates the XML and republishes the
site.

## If you would rather work locally

```bash
npm install
node scripts/validate.mjs     # the same checks CI runs
npm run verify                # generate the XML and prove v4 fidelity
npm run build && npm run preview
```

`node scripts/report.mjs` prints the same change summary CI posts.

## Reporting a problem without editing

Open an issue. A domain that is missing, mis-scoped, or worded in a way that does not
translate is exactly the kind of report this project needs, and you do not have to
propose the fix yourself.
