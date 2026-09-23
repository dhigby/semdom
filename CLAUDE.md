# semdom.org

**Source of truth for the SIL Semantic Domains standard** (~1,800 domains), plus the
site that publishes it. The FieldWorks XML is generated from this repository, not
consumed by it.
Built with **Astro 5** (static output), searched with **Pagefind**, deployed to
**GitHub Pages** via GitHub Actions.

## Commands

```bash
npm run dev        # Astro dev server - NO search index
npm run build      # build:xml + astro build + pagefind index (writes to dist/)
npm run build:xml  # regenerate the XML from data/ into public/
npm run verify     # generate + assert byte-fidelity against the historic v4 export
npm run preview    # serves dist/ at the root

node scripts/validate.mjs   # the CI gate: every invariant
node scripts/report.mjs     # the plain-language change summary CI posts on a PR
```

Editing a domain means editing `data/<version>/domains/<root>/<code>.yaml` and opening a
pull request - never editing XML.

Node 24 (matches CI). `dist/`, `node_modules/`, `.astro/`, `reports/` and the
generated `public/SemDom*.xml` are gitignored.

## Architecture

**The repository is the source of truth for the standard.** The XML is a generated
output, not an input. This was inverted deliberately; see `README.md` and
`docs/PRINCIPLES.md`.

- **Domain data** lives in `data/v4/domains/<root>/<code>.yaml` and
  `data/v5/domains/<root>/<code>.yaml` - one file per domain, ~1,800 each. List-level
  metadata (the XML header) is `data/<v>/list.yaml`.
  - **`scripts/lib/domains.mjs` is the single loader**, shared by the site
    (`src/lib/semdom.ts`), the XML generator and the CI validator, so they cannot drift.
    It is plain ESM, not TS, so CI can import it directly with no build step.
  - It loads YAML with **`yaml.FAILSAFE_SCHEMA`**. This is load-bearing: under the
    default schema `code: 4.10` parses as the number `4.1` and silently collides with
    the real domain 4.1. 102 codes per version sit in that danger zone.
  - Question `(n)` prefixes, parent codes, sibling order, document order and
    `relatedGuids` are all **derived, never stored** - each was verified to hold with
    zero exceptions, so storing them would only create a second place to be wrong.
    `related` is stored as human-readable codes.
- **Generating the XML**: `scripts/build-xml.mjs` (`npm run build:xml`, wired into
  `build`) writes `public/SemDom.xml` and `public/SemDom5-draft.xml`, which are
  **gitignored generated artifacts**. `scripts/lib/serialize-xml.mjs` was moved, not
  rewritten, from the old v5 tooling - its byte-exact fidelity is the empirical basis of
  the whole migration, so do not tidy it.
- **The fidelity proof**: `npm run verify` regenerates v4 and asserts it is
  **byte-identical** to `tests/fixtures/SemDom-v4-original.xml`, the historic export,
  committed once and never edited. Two quirks are preserved on purpose to keep that at
  zero exceptions: 6 empty `<ExampleWords></ExampleWords>` elements (so `exampleWords`
  distinguishes `undefined` / `''` / text) and 7 question texts ending in a space.
  Removing the 7 is intended as a separate reviewed PR under `data/v4/POLICY.md`.
- **Line endings**: git stores both XML files as **LF** and CI publishes LF, even though
  `core.autocrlf=true` makes `SemDom.xml` look like CRLF in a Windows checkout.
  `.gitattributes` pins `*.xml` to LF and marks the fixture `-text`; without it the
  fidelity test passes in CI and fails on Windows. **LF is confirmed canonical**:
  `SemDom.xml` as shipped in FieldWorks 9 (`Templates/SemDom.xml`) contains zero CR
  bytes and ends in a single LF. `lineEnding` stays a field in `list.yaml`, but there
  is no open question for SIL — the CRLF you see locally is only `autocrlf`.
- **Validation**: `node scripts/validate.mjs` is the CI gate - schema, identity, tree,
  related links, the `structure.lock` comparison, and the cross-version compatibility
  charter (no v4 code or GUID may disappear, change, or be renumbered in v5).
  `--write-lock` regenerates the locks; that is a deliberate, reviewable act.
  - Severities were set against the real data. Three things that look like obvious hard
    failures are **not**, because they are true of the shipped v4 corpus: `8.4.7`
    lists itself as related; 207 of 420 related links are one-way; and 70 GUIDs are
    mixed-case (so GUIDs are matched case-insensitively and never rewritten).
  - `data/v4/structure.lock` holds code/GUID/parent/child-count and **no text**, so an
    approved typo fix never touches it. `data/v5/structure.lock` is an append-only
    ledger: removal or mutation fails, and an unrecorded addition now **fails** too
    (it used to warn) - new domains arrive via `apply-proposal.mjs`, which regenerates it.
  - Every v5 domain absent from v4 must have an `op: add` entry carrying a non-empty
    `rationale`, in `data/v5/changes.yaml` (forward-going, append-only) or the frozen
    `data/v5/history/*.yaml`. Holds at zero exceptions: all 10 current adds satisfy it.
    Both ledgers are read with `FAILSAFE_SCHEMA` - an unquoted `code: 4.10` in a
    hand-written entry would otherwise be the number 4.1.
- **v4 vs v5 policy**: v4 is structurally locked, text-editable under
  `data/v4/POLICY.md` with a changelog entry. v5 is the live draft, governed by
  `data/v5/POLICY.md`. A v4 text fix must be mirrored into v5 unless v5 already
  deliberately diverged there.
- **Proposing changes**: domain coordinators are not assumed to have GitHub accounts, so
  `/propose/` is the primary route - a client-side form that renders a domain as fields
  and emails a complete proposal document, which `scripts/apply-proposal.mjs` turns into
  a commit (assigning the code and GUID, appending the rationale, regenerating the lock).
  - **`scripts/lib/emit-yaml.mjs`** is the canonical writer, moved out of
    `materialize.mjs`. `scripts/check-emit.mjs` (in CI) asserts all 3,594 files are
    byte-identical to what it writes. That is what makes the form safe: a one-word edit
    yields a one-line diff, not a whole-file rewrite.
  - **`scripts/lib/domain-rules.mjs`** holds the regexes, text hygiene, `(n)`-prefix rule,
    `sanitizeText`, `nextChildCode` and `newGuid`, imported by *both* `validate.mjs` and
    the browser form, so they cannot disagree about what is valid.
  - **The form is v5-only, and that is load-bearing.** `sanitizeText` trims; seven v4
    question texts end in a deliberate space that keeps the v4 XML byte-identical to the
    historic export. All 1,802 v5 domains round-trip through the form's model unchanged;
    7 v4 domains would not.
  - GUIDs are **not** derivable from the code (tested: md5/sha1/sha256 with several salts
    match none of the 10 v5-only domains). `newGuid()` is random, uppercase 8-4-4-4-12 to
    match the corpus rather than `randomUUID()`'s lowercase v4.
- **Domain pages** are generated by `src/pages/v4/[code].astro` and
  `src/pages/v5/[code].astro`; each carries a "Suggest an edit" link built by
  `getEditUrl()` that opens the domain's YAML file in GitHub's editor.
  `src/pages/v4/index.astro` is the interactive "Browse Domains" tree.
- **Content pages** (Home, About, Bibliography, Contact, ...) are Markdown in
  `src/content/pages/`, defined by `src/content.config.ts` and editable via the
  Pages CMS config in `.pages.yml`. Frontmatter fields: `title`, `menuTitle`,
  `menuOrder`, `showInMenu`, `section`, `summary`. The main nav in
  `Layout.astro` is built from pages with `showInMenu`, sorted by `menuOrder`,
  plus the "Browse Domains" route.
- **The About section**: the nav is a flat single-level list with no dropdown or
  hamburger, so explanatory pages live under an `/about/` hub instead of in the
  nav. A page joins it by setting `section: about` and `showInMenu: false`; its
  `menuOrder` then orders it *within* the section, and its `summary` becomes both
  the hub card subtitle and the page's meta description. Section pages keep
  root-level URLs (`/description/`, `/ocm/`), so they carry a `SectionLink.astro`
  back-link above the `h1` in place of a breadcrumb. Adding a section page is a pure
  content change; nothing is hardcoded.
- **Components**: `Layout.astro` (shell, header/nav, footer, Pagefind search
  init), `SidebarTree.astro` + `TreeNode.astro` (the domain-page sidebar tree,
  auto-expanded to the current domain), `BrowseTreeNode.astro` (the recursive
  collapsible tree on the Browse page), `Breadcrumbs.astro`,
  `PageSequenceNav.astro`, `ContactForm.astro`, `ProposeForm.astro` (markup only;
  the logic is `src/scripts/propose.ts`, the site's only client-side JS),
  `DomainCodes.astro` and
  `CodeReference.astro` (see **Louw-Nida / OCM codes**), `SectionLink.astro`.
- **Contact form**: `ContactForm.astro` posts to
  [Web3Forms](https://web3forms.com) (a hosted form backend - there is no
  server), which forwards submissions to an SIL email tied to its access key.
  It submits via client-side `fetch` (inline success/error, no redirect, so no
  base-path handling needed). Rendered by `src/pages/contact/index.astro`, a
  dedicated route that mirrors the bibliography route: it renders the
  CMS-editable `contact.md` intro text and then appends the form. Because of
  this, `'contact'` is excluded from the generic `src/pages/[slug]` route. The
  Web3Forms access key is public by design - safe to commit.
- **Dedicated routes must be excluded from `[slug]`.** Any page with its own
  route under `src/pages/` has to be added to the `excluded` set in
  `src/pages/[slug]/index.astro` or the build fails on a duplicate route.
  Currently: `home`, `bibliography`, `contact`, `propose`, `about`, `louw-nida`, `ocm`.
- **Louw-Nida / OCM codes**: each domain records its equivalent codes in two older
  classification systems as one semicolon-joined string per field (`ocmCodes`,
  `louwNidaCodes`). `src/lib/semdom.ts` parses them and builds a reverse index
  (code -> domains) onto the per-version cache; use `getCodeRefs`, `getDomainsForCode`,
  `getCodeIndex`, `groupCodeRefs` and `codeSlug` rather than re-parsing.
  `DomainCodes.astro` renders the block on domain pages (v4 and v5, in lockstep);
  `CodeReference.astro` renders the full cross-reference on `/louw-nida/` and `/ocm/`,
  from **v4 only** - those pages are indexed and must not publish v5 draft names.

  Five things the parser has to get right, all verified against the data:
  1. Entries split on `"; "`, **never on commas** - labels contain them
     (`1A Universe, Creation`).
  2. Louw-Nida letters run A-Z, then A'-Z' (prime), then A"-Z" (double prime). **The
     prime marks are significant**: `33A` *Language*, `33A'` *Advise* and `33A"`
     *Prophesy* are three different subdomains. Match a prime only when it is glued to
     the letter, because labels contain apostrophes too
     (`4D Reptiles and Other 'Creeping Things'`). Dropping primes collapses 738
     real codes to 684.
  3. An OCM segment with no leading digits is a second, legacy name for the
     preceding code: `732 Disabilities; Handicapped; 734 Invalidism` is two
     codes, not three.
  4. Some Louw-Nida labels carry a stray trailing `" x"`, which is stripped.
  5. OCM lowercase suffixes (`136a`-`136k`, `137a`-`137h`) are an **SIL
     extension** under Fauna and Flora, not HRAF codes.

  Invariants, confirmed exact for **both** v4 and v5: 738 Louw-Nida codes in 93 groups,
  750 OCM codes in 82 groups. A code cited with two different labels and not pinned in
  `CANONICAL_LABEL` logs a build warning - that is how drift announces itself, so do not
  silence it. (It is currently silent for both versions.)

  Neither system's *descriptions* may be republished: HRAF's Outline is
  all-rights-reserved and Louw & Nida's lexicon is (c) United Bible Societies. Both
  explainer pages are built from SIL's own data alone. The OCM codes are the 5th edition
  as revised c. 2000, so a few names are behind current HRAF usage; `ocm.md` says so.
- **Styles**: a single global stylesheet, `src/styles/global.css` (SIL brand
  palette in `:root`). No CSS framework.
- **Search**: Pagefind indexes `dist/` after the Astro build (see the `build`
  script). `Layout.astro` dynamically imports `pagefind-ui.js` and mounts it
  into `#search`. In `npm run dev` there is no index, so search silently no-ops.
  Two deliberate exclusions carry `data-pagefind-ignore`: the "also used by"
  panels on domain pages and the generated cross-reference tables on
  `/louw-nida/` and `/ocm/`. Both consist of *other* pages' titles, so indexing
  them would make every page match its neighbours' names. Note that `hidden`
  content is still indexed — the attribute, not the visibility, is what excludes
  it. Run `npm run build` (not `astro build`) before checking search: a bare
  `astro build` wipes `dist/` and leaves no Pagefind index behind.

## Verifying visual/UI changes

UI changes should be verified in a real browser (the Kapture MCP browser tools
work well here): build, run `npm run preview`, navigate, interact (expand tree
nodes, run a search), and screenshot. For layout/indent questions, measure
real element bounds (`elements` tool) rather than eyeballing a scaled
screenshot — CSS specificity bugs (e.g. a `.browse-tree ul` reset out-specifying
`.browse-group`) look like value bugs but aren't.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build`
and publishes `dist/` to GitHub Pages. Only commit/push when the user asks.
