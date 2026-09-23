# Editing semdom.org

Everything on semdom.org — the ~1,800 semantic domains and the explanatory pages around
them — lives in this repository as text files. Changing the site means changing those
files, and every change is reviewed before it is published.

There are two audiences for this document. **Domain coordinators and other contributors**
need only the first section: a form on the website, no account anywhere. **Maintainers**
need the rest.

---

## 1. Proposing a change to a domain

Go to **[semdom.org/propose/](https://semdom.org/propose/)**, or use the **Suggest a
change** link at the bottom of any domain page.

You do not need a GitHub account, you do not need to install anything, and you never see
YAML. The form shows the domain as ordinary labelled fields — name, description, the
elicitation questions, example words — and you edit them directly. Choose "propose a new
domain" instead and it asks what the domain is for, which existing domain it belongs
under, and why the standard needs it.

The form does several things quietly on your behalf, all of which are otherwise easy ways
to have a change rejected:

- It **strips question numbering**. Never type `(1)` in front of a question. The numbers
  are added when the data is published, so inserting a question renumbers the rest for
  free. If you paste a question copied off the website, the form offers to remove the
  number for you.
- It **cleans pasted text**. Pasting from Word brings invisible line breaks and
  non-breaking spaces that the data format forbids; the form removes them as you paste.
- It **shows the provisional number** for a new domain — but does not assign it. The real
  number is assigned when a maintainer applies the proposal, from the parent that review
  actually settled on, so a proposal that gets re-parented along the way does not use up a
  permanent number.
- It **checks the same rules the automated gate checks**, and tells you in plain words
  what needs fixing before the form will send.

When you submit, the proposal is emailed to the maintainers. **Nothing is published at
that point.** A maintainer reviews it, applies it, and opens a pull request where the
automated checks run. You can download a copy of your proposal from the form if you want
one for your own records.

### What you may and may not change

| | Allowed |
|---|---|
| **Add** a new domain at an unused number | Yes, in v5 |
| **Revise** a name, description, question, or example words | Yes |
| **Broaden** a domain's scope | Yes |
| **Narrow** a domain so already-tagged words become mis-tagged | No |
| **Delete** a domain | Never |
| **Reuse or renumber** a domain code | Never |
| **Change** a GUID | Never |

Those last three are permanent because every dictionary built on this standard references
domain numbers in data this project does not control and cannot migrate. The full rules
are in [`data/v5/POLICY.md`](../data/v5/POLICY.md) and
[`docs/PRINCIPLES.md`](PRINCIPLES.md).

**Suggestions are made against v5**, the draft under review. Version 4 is released: its
structure is locked and its wording is only corrected under the stricter conditions in
[`data/v4/POLICY.md`](../data/v4/POLICY.md).

### Writing good elicitation questions

[`docs/STYLE-GUIDE.md`](STYLE-GUIDE.md) is worth reading before you write one. A question
has to prompt a native speaker *and* survive translation into dozens of languages, which
rules out idioms, English-only wordplay and yes/no framings.

### Reporting a problem without proposing a fix

Use the [contact form](https://semdom.org/contact/). A domain that is missing, mis-scoped,
or worded in a way that does not translate is exactly the kind of report this project
needs, and you are not expected to write the fix yourself.

---

## 2. If you do have a GitHub account

Every domain page also carries an **Edit the file on GitHub** link, which opens that
domain's YAML file in GitHub's editor. This is faster if you are comfortable editing a
line of text in a data file, and it produces a pull request directly.

A domain lives in exactly one file, named after its code:

```
data/v5/domains/1/1.1.1.yaml     ->  domain 1.1.1
data/v4/domains/4/4.9.9.yaml     ->  domain 4.9.9
```

```yaml
code: "1.1.1"                                  # never change
guid: DC1A2C6F-1B32-4631-8823-36DACC8CB7BB     # never change
name: Sun
description: >-
  Use this domain for words related to the sun. …
ocmCodes: 821 Weather                          # optional
louwNidaCodes: 1D Heavenly Bodies              # optional
related: ["8.3.3", "8.3.3.2.1"]                # other domains, by code
questions:
  - q: What words refer to the sun?
    words: sun, solar, sol, daystar
    sentence: The <sun> rose over the hill.    # optional
```

Four things that trip people up:

- **Do not number the questions.** Write `q: What words refer to the sun?`, not
  `(1) What words…`.
- **Keep `code` in quotes.** `code: 4.10` unquoted is read as the number 4.1 and collides
  with the real domain 4.1.
- **`related` uses domain codes, not GUIDs.**
- **`words` is one comma-separated string**, not a list.

If you are not a maintainer, GitHub offers to fork the repository when you save. Accept;
a fork is your own copy, and nothing affects the live site until your change is merged.

**A new domain cannot be created this way**, because three of the things it needs cannot
be done in a web editor: a number checked free across both versions, a collision-checked
GUID, and a regenerated `data/v5/structure.lock`. Use the form.

---

## 3. Changing a page of the website

The text pages — Home, About, Description, Development, Usage, Bibliography, Contact — are
Markdown files in `src/content/pages/`. Open one on GitHub and click the pencil icon, or
use [Pages CMS](https://pagescms.org), which gives the same files a friendly editing
interface and reads its configuration from `.pages.yml`.

Each page begins with a block between `---` lines that controls where the page appears,
not what it says:

```yaml
---
title: What is a semantic domain?      # the heading and the browser title
menuTitle: Description                 # the short label in the navigation
menuOrder: 1                           # position in the menu, or within the section
showInMenu: false                      # true = in the main navigation bar
section: about                         # groups the page under the /about/ hub
summary: "An area of meaning, and…"    # the card subtitle and the search-engine description
---
```

Pages CMS saves to whichever branch is selected in its interface. **Select a branch other
than `main` before editing**, then open a pull request; editing with `main` selected puts
the change on the live site with no review.

---

## 4. What happens to a change

Whatever route it came in by, a change reaches `main` as a pull request, and the
**Validate** check runs automatically. It:

- validates the data — schema, the domain tree, related links, the structure locks, the
  cross-version compatibility rules, and that every added domain records why it exists;
- asserts every domain file round-trips byte-for-byte through the shared serializer, so a
  one-word edit produces a one-line diff;
- regenerates the XML and proves the v4 output is byte-identical to the historic
  FieldWorks export in `tests/fixtures/`;
- builds the site;
- writes a plain-language summary of every domain that changed, field by field, with
  added domains rendered in full;
- attaches the generated XML, for a reviewer who wants to load it into FieldWorks.

To read the summary, click **Details** next to the Validate check and open the run's
summary page. (It lives there rather than in a pull-request comment because a pull request
from a fork gets a read-only token and cannot comment.)

Merging into `main` republishes the site within a few minutes. There is no preview
deployment for a pull request.

`SemDom.xml` and `SemDom5-draft.xml` are **generated** on every build and are not stored
in the repository. Never edit them, and never send an edited XML file as a proposal — it
cannot be merged.

---

## 5. For maintainers

### Applying a proposal

A proposal arrives by email as a YAML document. Save it and run:

```bash
node scripts/apply-proposal.mjs --file proposal.yaml --dry-run   # inspect first
node scripts/apply-proposal.mjs --file proposal.yaml
```

For a new domain this assigns the next free number across both versions, mints a
collision-checked GUID, writes the file, appends the rationale to `data/v5/changes.yaml`,
regenerates the structure locks, re-runs validation, and prints a pull-request body.
`--code` overrides the number if review moved the domain to a different parent.

Open a pull request with the result. Do not push it straight to `main`: adding a domain is
a structural change.

### The local checks

```bash
node scripts/validate.mjs     # the CI gate
node scripts/check-emit.mjs   # every file round-trips through the emitter
npm run verify                # regenerate the XML and prove v4 fidelity
node scripts/report.mjs       # the change summary CI posts
```

### Who may push what

Text fixes — names, descriptions, questions, example words — may be committed straight to
`main` by a maintainer; that is what the GitHub edit link is for, and validation still runs
on the result.

Structural changes go through a pull request: adding or removing a domain, changing a
`code:` or `guid:` line, regenerating a structure lock, or editing anything under
`data/v4/`. `.github/workflows/guard.yml` fails a direct push that does any of those, and
`.github/CODEOWNERS` routes the review.

### Still to do

- **`main` is not branch-protected**, so the guard reports a violation after the fact
  rather than preventing it. Add a ruleset on `main` requiring a pull request, a passing
  **Validate** check and code-owner review, with an admin bypass entry — without the
  bypass, `dhigby` cannot merge his own pull requests, since CODEOWNERS names him.
- **The repository is owned by a personal account.** The source of truth for an
  international standard should live in an SIL organisation. Moving it means updating
  `REPO_URL` in `src/lib/semdom.ts` and re-verifying the Pages custom domain at the new
  owner.
