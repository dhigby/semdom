/**
 * The proposal form on /propose/.
 *
 * Domain coordinators are linguists who are not assumed to have a GitHub account, so
 * this is the route by which a change to the standard is actually proposed. The form
 * renders a domain as labelled fields, and emits a complete, valid domain file plus a
 * proposal document that `scripts/apply-proposal.mjs` turns into a commit.
 *
 * Two things make that safe, and both are enforced elsewhere rather than here:
 *   - the emitter is byte-exact (scripts/check-emit.mjs holds it at 3,594/3,594), so a
 *     one-word edit produces a one-line diff rather than a whole-file rewrite;
 *   - the rules come from scripts/lib/domain-rules.mjs, the same module the CI gate
 *     imports, so this form and CI cannot disagree about what is valid.
 */
import yaml from 'js-yaml';
import { domainToYaml } from '../../scripts/lib/emit-yaml.mjs';
import {
  sanitizeText,
  checkText,
  hasNumberPrefix,
  stripNumberPrefix,
  nextChildCode,
} from '../../scripts/lib/domain-rules.mjs';

interface QuestionModel {
  q: string;
  words: string;
  sentence: string;
  /** The source file had `words:` present but empty — six v4 questions rely on it. */
  hadEmptyWords: boolean;
  keepEmptyWords: boolean;
}

interface Model {
  name: string;
  description: string;
  ocmCodes: string;
  louwNidaCodes: string;
  related: string[];
  questions: QuestionModel[];
}

// The bootstrap lives at the FOOT of this file, not here. `init()` is hoisted, but the
// helpers it calls must already be initialized when it runs, and a `const` declared
// further down is still in its temporal dead zone at module-evaluation time — which
// threw a ReferenceError before the form could render anything at all.

function init(el: HTMLElement) {
  const rawBase = el.dataset.rawBase!;
  const indexUrl = el.dataset.indexUrl!;
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');

  const panes = {
    choose: q('#propose-choose'),
    form: q('#propose-form-pane'),
    loading: q('#propose-loading'),
  };

  if (mode !== 'edit' && mode !== 'new') {
    show(panes.choose);
    void wireChooser(indexUrl);
    return;
  }

  // Every pane starts hidden, so whichever one this mode wants has to be shown AND the
  // others left alone. Forgetting to hide the chooser made the form look like a no-op:
  // the page reloaded, the chooser was still there, and the form rendered below the fold.
  hide(panes.choose);
  show(panes.loading);
  void start(mode, params, rawBase, indexUrl, panes);
}

/** Shared by the chooser and both modes, so the index is fetched the same way. */
async function loadIndex(indexUrl: string): Promise<Map<string, string>> {
  const res = await fetch(indexUrl);
  const data = (await res.json()) as { domains: [string, string][] };
  if (!Array.isArray(data?.domains)) throw new Error('unexpected index shape');
  return new Map(data.domains);
}

/**
 * The "change an existing domain" card. It used to be a link to /v5/, which left the
 * visitor to find the domain themselves and come back — a dead end dressed as a button.
 */
async function wireChooser(indexUrl: string) {
  const input = document.getElementById('propose-pick') as HTMLInputElement | null;
  const list = document.getElementById('propose-pick-list');
  const go = document.getElementById('propose-pick-go');
  const error = document.getElementById('propose-pick-error');
  if (!input || !list || !go || !error) return;

  let index: Map<string, string>;
  try {
    index = await loadIndex(indexUrl);
  } catch {
    error.hidden = false;
    error.textContent = 'The domain list could not be loaded. Please reload the page.';
    return;
  }

  // The option value carries both, so a browser's substring matching finds a domain by
  // number or by name; the code is the first token.
  list.innerHTML = [...index]
    .map(([c, n]) => `<option value="${esc(c)} ${esc(n)}"></option>`)
    .join('');

  const open = () => {
    const raw = sanitizeText(input.value);
    const code = raw.split(' ')[0];
    if (!index.has(code)) {
      error.hidden = false;
      error.textContent = raw
        ? `No domain matches “${raw}”. Try a number like 1.1.3, or pick one from the list.`
        : 'Type a domain number or name first.';
      return;
    }
    error.hidden = true;
    const base = location.pathname;
    location.href = `${base}?mode=edit&v=v5&code=${encodeURIComponent(code)}`;
  };

  go.addEventListener('click', open);
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      open();
    }
  });
  input.addEventListener('input', () => (error.hidden = true));
}

async function start(
  mode: 'edit' | 'new',
  params: URLSearchParams,
  rawBase: string,
  indexUrl: string,
  panes: Record<string, HTMLElement>
) {
  let index: Map<string, string>;
  try {
    index = await loadIndex(indexUrl);
  } catch {
    panes.loading.textContent =
      'Sorry — the domain list could not be loaded, so this form cannot run. Please reload the page.';
    return;
  }

  const model: Model = {
    name: '',
    description: '',
    ocmCodes: '',
    louwNidaCodes: '',
    related: [],
    questions: [],
  };

  let code = '';
  let guid = '';
  let parent = '';
  let originalYaml = '';

  if (mode === 'edit') {
    code = params.get('code') ?? '';
    if (!index.has(code)) {
      panes.loading.textContent = `There is no v5 domain ${code}.`;
      return;
    }
    // v5 only, and not merely as policy. sanitizeText() trims, and seven v4 question
    // texts end in a space that is preserved on purpose so the generated v4 XML stays
    // byte-identical to the historic FieldWorks export. Round-tripping those through
    // this form would silently "fix" them and break the fidelity proof. v5 has zero
    // such questions, so every v5 domain round-trips unchanged; v4 does not.
    // Fetch the live file rather than a build-time copy, so a coordinator never edits a
    // stale version, and so the `words: '' vs absent` distinction survives intact.
    try {
      const url = `${rawBase}/data/v5/domains/${code.split('.')[0]}/${code}.yaml`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      originalYaml = await res.text();
    } catch {
      panes.loading.textContent =
        'Sorry — this domain’s file could not be loaded from GitHub. Please try again in a moment.';
      return;
    }
    const src = yaml.load(originalYaml, { schema: yaml.FAILSAFE_SCHEMA }) as Record<string, any>;
    code = src.code;
    guid = src.guid;
    model.name = src.name ?? '';
    model.description = src.description ?? '';
    model.ocmCodes = src.ocmCodes ?? '';
    model.louwNidaCodes = src.louwNidaCodes ?? '';
    model.related = Array.isArray(src.related) ? [...src.related] : [];
    model.questions = (src.questions ?? []).map((x: any) => ({
      q: x.q ?? '',
      words: x.words ?? '',
      sentence: x.sentence ?? '',
      hadEmptyWords: 'words' in x && x.words === '',
      keepEmptyWords: 'words' in x && x.words === '',
    }));
  } else {
    parent = params.get('parent') ?? '';
    if (parent && !index.has(parent)) parent = '';
    model.questions = [blankQuestion()];
  }

  render({ mode, model, index, code, guid, parent, originalYaml, panes });
}

function blankQuestion(): QuestionModel {
  return { q: '', words: '', sentence: '', hadEmptyWords: false, keepEmptyWords: false };
}

interface Ctx {
  mode: 'edit' | 'new';
  model: Model;
  index: Map<string, string>;
  code: string;
  guid: string;
  parent: string;
  originalYaml: string;
  panes: Record<string, HTMLElement>;
}

function render(ctx: Ctx) {
  const { mode, model, index, panes } = ctx;
  hide(panes.loading);
  show(panes.form);

  q('#propose-mode-title').textContent =
    mode === 'edit' ? `Suggest a change to ${ctx.code}` : 'Propose a new domain';

  const identity = q('#propose-identity');
  const parentSelect = q('#pf-parent') as HTMLSelectElement;
  const questionList = q('#pf-questions');
  const relatedList = q('#pf-related');
  const preview = q('#propose-preview') as HTMLElement;
  const errorBox = q('#propose-errors') as HTMLElement;
  const submitBtn = q('#propose-submit') as HTMLButtonElement;

  // --- identity -----------------------------------------------------------
  if (mode === 'edit') {
    identity.innerHTML =
      `<p class="propose-locked"><strong>Domain ${esc(ctx.code)}</strong> · GUID <code>${esc(ctx.guid)}</code><br />` +
      `<span>Both are permanent. Every dictionary that uses this number depends on it, so neither can be changed.</span></p>`;
    parentSelect.closest('.contact-field')?.setAttribute('hidden', '');
  } else {
    const options = ['<option value="">— choose a parent —</option>'];
    for (const [c, n] of index) options.push(`<option value="${esc(c)}">${esc(c)} ${esc(n)}</option>`);
    parentSelect.innerHTML = options.join('');
    parentSelect.value = ctx.parent;
    parentSelect.addEventListener('change', () => {
      ctx.parent = parentSelect.value;
      update();
    });
  }

  // --- simple text fields -------------------------------------------------
  bindText('#pf-name', () => model.name, (v) => (model.name = v));
  bindText('#pf-description', () => model.description, (v) => (model.description = v));
  bindText('#pf-ocm', () => model.ocmCodes, (v) => (model.ocmCodes = v));
  bindText('#pf-louwnida', () => model.louwNidaCodes, (v) => (model.louwNidaCodes = v));

  // --- related ------------------------------------------------------------
  const relatedInput = q('#pf-related-input') as HTMLInputElement;
  q('#pf-related-add').addEventListener('click', () => {
    const v = sanitizeText(relatedInput.value);
    if (!v) return;
    if (!index.has(v)) {
      relatedInput.setCustomValidity(`There is no domain ${v}.`);
      relatedInput.reportValidity();
      return;
    }
    if (!model.related.includes(v)) model.related.push(v);
    relatedInput.value = '';
    relatedInput.setCustomValidity('');
    drawRelated();
    update();
  });
  relatedInput.addEventListener('input', () => relatedInput.setCustomValidity(''));

  function drawRelated() {
    relatedList.innerHTML = model.related.length
      ? model.related
          .map(
            (c, i) =>
              `<li><code>${esc(c)}</code> ${esc(index.get(c) ?? '')} ` +
              `<button type="button" class="propose-chip-remove" data-i="${i}" aria-label="Remove ${esc(c)}">remove</button></li>`
          )
          .join('')
      : '<li class="propose-empty">None.</li>';
    relatedList.querySelectorAll('.propose-chip-remove').forEach((b) =>
      b.addEventListener('click', () => {
        model.related.splice(Number((b as HTMLElement).dataset.i), 1);
        drawRelated();
        update();
      })
    );
  }

  // --- questions ----------------------------------------------------------
  function drawQuestions() {
    questionList.innerHTML = '';
    model.questions.forEach((qm, i) => {
      const li = document.createElement('li');
      li.className = 'propose-question';
      li.innerHTML = `
        <div class="propose-question-head">
          <span class="propose-qnum">(${i + 1})</span>
          <div class="propose-question-controls">
            <button type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move question ${i + 1} up">↑</button>
            <button type="button" data-act="down" ${i === model.questions.length - 1 ? 'disabled' : ''} aria-label="Move question ${i + 1} down">↓</button>
            <button type="button" data-act="remove" aria-label="Remove question ${i + 1}">Remove</button>
          </div>
        </div>
        <label>Question<input type="text" data-f="q" value="${esc(qm.q)}" /></label>
        <p class="propose-qhint" data-hint hidden></p>
        <label>Example words <span>comma-separated, optional</span><input type="text" data-f="words" value="${esc(qm.words)}" /></label>
        ${
          qm.hadEmptyWords
            ? `<label class="propose-keep-empty"><input type="checkbox" data-f="keepEmptyWords" ${qm.keepEmptyWords ? 'checked' : ''} /> Keep the empty example-words field (needed for byte-fidelity with the historic export)</label>`
            : ''
        }
        <label>Example sentence <span>optional; mark the word with &lt;angle brackets&gt;</span><input type="text" data-f="sentence" value="${esc(qm.sentence)}" /></label>
      `;

      li.querySelectorAll<HTMLInputElement>('input[data-f]').forEach((input) => {
        const field = input.dataset.f as keyof QuestionModel;
        if (input.type === 'checkbox') {
          input.addEventListener('change', () => {
            qm.keepEmptyWords = input.checked;
            update();
          });
          return;
        }
        guardSingleLine(input);
        input.addEventListener('input', () => {
          (qm as any)[field] = input.value;
          if (field === 'q') hintNumbering(li, qm, input);
          update();
        });
      });

      li.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'remove') model.questions.splice(i, 1);
          if (act === 'up') model.questions.splice(i - 1, 0, model.questions.splice(i, 1)[0]);
          if (act === 'down') model.questions.splice(i + 1, 0, model.questions.splice(i, 1)[0]);
          if (!model.questions.length) model.questions.push(blankQuestion());
          drawQuestions();
          update();
        })
      );

      questionList.appendChild(li);
      hintNumbering(li, qm, li.querySelector('input[data-f="q"]')!);
    });
  }

  q('#pf-question-add').addEventListener('click', () => {
    model.questions.push(blankQuestion());
    drawQuestions();
    update();
  });

  // --- rationale ----------------------------------------------------------
  const rationale = q('#pf-rationale') as HTMLTextAreaElement;
  const evidence = q('#pf-evidence') as HTMLInputElement;
  const proposer = q('#pf-proposer') as HTMLInputElement;
  const email = q('#pf-email') as HTMLInputElement;
  guardSingleLine(evidence);
  rationale.addEventListener('input', update);

  // --- assemble -----------------------------------------------------------
  function currentCode(): string {
    if (mode === 'edit') return ctx.code;
    if (!ctx.parent) return '';
    return nextChildCode(ctx.parent, [...index.keys()]);
  }

  function toRecord() {
    const rec: Record<string, unknown> = {
      code: currentCode() || '0',
      guid: ctx.guid || 'PROVISIONAL-0000-0000-0000-000000000000',
      name: sanitizeText(model.name),
      description: sanitizeText(model.description),
    };
    if (sanitizeText(model.ocmCodes)) rec.ocmCodes = sanitizeText(model.ocmCodes);
    if (sanitizeText(model.louwNidaCodes)) rec.louwNidaCodes = sanitizeText(model.louwNidaCodes);
    if (model.related.length) rec.related = model.related;
    rec.questions = model.questions
      .filter((x) => sanitizeText(x.q))
      .map((x) => {
        const out: Record<string, string> = { question: sanitizeText(stripNumberPrefix(x.q)) };
        const words = sanitizeText(x.words);
        // '' and absent are different things in this data. The only way to emit '' is to
        // have loaded a file that already had it and to have left the box ticked.
        if (words) out.exampleWords = words;
        else if (x.hadEmptyWords && x.keepEmptyWords) out.exampleWords = '';
        const sentence = sanitizeText(x.sentence);
        if (sentence) out.exampleSentences = sentence;
        return out;
      });
    return rec;
  }

  function problems(): string[] {
    const out: string[] = [];
    if (mode === 'new' && !ctx.parent) out.push('Choose the parent domain this belongs under.');
    if (!sanitizeText(model.name)) out.push('The domain needs a name.');
    if (!sanitizeText(model.description)) out.push('The domain needs a description.');
    out.push(...checkText('name', sanitizeText(model.name)));
    out.push(...checkText('description', sanitizeText(model.description)));

    const asked = model.questions.filter((x) => sanitizeText(x.q));
    if (mode === 'new' && !asked.length) out.push('Add at least one elicitation question.');
    model.questions.forEach((x, i) => {
      if (!sanitizeText(x.q) && (sanitizeText(x.words) || sanitizeText(x.sentence)))
        out.push(`Question ${i + 1} has words or a sentence but no question.`);
      if (hasNumberPrefix(x.q))
        out.push(`Question ${i + 1} starts with a number — the numbering is added automatically.`);
    });

    if (!sanitizeText(rationale.value))
      out.push('Say why this change is needed — a proposal without a reason cannot be reviewed.');
    return out;
  }

  function update() {
    const rec = toRecord();
    const errs = problems();
    errorBox.hidden = !errs.length;
    errorBox.innerHTML = errs.length
      ? '<strong>Before this can be sent:</strong><ul>' +
        errs.map((e) => `<li>${esc(e)}</li>`).join('') +
        '</ul>'
      : '';
    submitBtn.disabled = errs.length > 0;

    const codeNow = currentCode();
    const provisional = q('#propose-provisional');
    if (mode === 'new') {
      if (!ctx.parent) {
        provisional.innerHTML = '<em>Choose a parent to see where this domain would sit.</em>';
      } else {
        const siblings = [...index.keys()].filter(
          (c) => c.startsWith(ctx.parent + '.') && c.split('.').length === ctx.parent.split('.').length + 1
        );
        const last = Number(codeNow.split('.').pop());
        provisional.innerHTML =
          `Siblings: ${siblings.map((c) => `<code>${esc(c)}</code>`).join(', ') || '<em>none yet</em>'}.<br />` +
          `Yours would be <strong><code>${esc(codeNow)}</code></strong> — assigned when a maintainer applies it, ` +
          `not chosen here, so a proposal that gets re-parented during review does not use up a number.` +
          (last >= 10
            ? `<br /><span class="propose-warn">${esc(codeNow)} would be the first two-digit segment in the standard. ` +
              `That is legal, but some tools have historically misread it as ${esc(ctx.parent + '.' + String(last)[0])}. Worth a deliberate decision.</span>`
            : '');
      }
    }

    try {
      preview.textContent = domainToYaml(rec as any);
    } catch {
      preview.textContent = '(cannot render yet)';
    }
  }

  function proposalDoc() {
    const rec = toRecord() as any;
    const doc: Record<string, unknown> = {
      kind: mode === 'edit' ? 'edit' : 'new-domain',
      version: 'v5',
      ...(mode === 'edit' ? { code: ctx.code } : { parent: ctx.parent }),
      rationale: sanitizeText(rationale.value),
      ...(sanitizeText(evidence.value) ? { evidence: sanitizeText(evidence.value) } : {}),
      ...(sanitizeText(proposer.value) ? { proposedBy: sanitizeText(proposer.value) } : {}),
      domain: {
        name: rec.name,
        description: rec.description,
        ...(rec.ocmCodes !== undefined ? { ocmCodes: rec.ocmCodes } : {}),
        ...(rec.louwNidaCodes !== undefined ? { louwNidaCodes: rec.louwNidaCodes } : {}),
        related: rec.related ?? [],
        questions: rec.questions.map((x: any) => ({
          q: x.question,
          ...(x.exampleWords !== undefined ? { words: x.exampleWords } : {}),
          ...(x.exampleSentences !== undefined ? { sentence: x.exampleSentences } : {}),
        })),
      },
    };
    return yaml.dump(doc, { lineWidth: 92, noRefs: true });
  }

  // --- submit, copy, download --------------------------------------------
  const status = q('#propose-status');
  const setStatus = (kind: string, html: string) => {
    status.className = 'contact-status contact-status--' + kind;
    status.innerHTML = html;
    status.hidden = false;
  };

  q('#propose-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(proposalDoc());
    setStatus('success', 'Copied. You can paste this into an email to the maintainers.');
  });

  q('#propose-download').addEventListener('click', () => {
    const blob = new Blob([proposalDoc()], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `proposal-${currentCode() || 'new'}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const form = q('#propose-form') as HTMLFormElement;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (problems().length) return;
    submitBtn.disabled = true;
    setStatus('pending', 'Sending…');

    const payload = {
      access_key: (q('#pf-access-key') as HTMLInputElement).value,
      subject:
        mode === 'edit'
          ? `semdom.org: suggested change to ${ctx.code}`
          : `semdom.org: proposed new domain under ${ctx.parent}`,
      from_name: 'Semantic Domains website',
      name: sanitizeText(proposer.value) || 'Anonymous',
      email: email.value,
      botcheck: (q('#pf-botcheck') as HTMLInputElement).checked ? 'true' : '',
      message: summaryFor(mode, ctx, model),
      proposal: proposalDoc(),
      domain_file: preview.textContent,
      original_file: ctx.originalYaml,
    };

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Submission failed');
      setStatus(
        'success',
        'Thank you — your proposal has been sent for review. It is <strong>not</strong> ' +
          'published yet: a maintainer checks every change to the standard before it appears ' +
          'on the site. Keep a copy if you would like one — the “Download” button above still works.'
      );
    } catch {
      setStatus(
        'error',
        'Sorry, something went wrong sending this. Please use “Download the proposal” above and ' +
          'email it to <a href="mailto:doug_higby@sil.org">doug_higby@sil.org</a> instead — nothing is lost.'
      );
      submitBtn.disabled = false;
    }
  });

  drawRelated();
  drawQuestions();
  update();
}

function summaryFor(mode: string, ctx: Ctx, model: Model): string {
  if (mode === 'new')
    return `Proposed new domain under ${ctx.parent}: "${sanitizeText(model.name)}", with ${model.questions.filter((x) => x.q.trim()).length} question(s).`;
  return `Suggested change to ${ctx.code} "${sanitizeText(model.name)}".`;
}

// --- helpers --------------------------------------------------------------

function q(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el as HTMLElement;
}
// Function declarations, not `const` arrows: these are called from init(), and a const
// is not initialized until its line is reached.
function show(el: HTMLElement) {
  el.hidden = false;
}
function hide(el: HTMLElement) {
  el.hidden = true;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function bindText(sel: string, get: () => string, set: (v: string) => void) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
  if (!el) return;
  el.value = get();
  guardSingleLine(el);
  el.addEventListener('input', () => set(el.value));
}

/**
 * validate.mjs rejects a line break or control character in any stored text field, and a
 * coordinator cannot see why. So make one unrepresentable rather than policing it: Enter
 * does nothing, and a paste from Word is cleaned on the way in.
 */
function guardSingleLine(el: HTMLInputElement | HTMLTextAreaElement) {
  el.addEventListener('beforeinput', (e) => {
    const t = (e as InputEvent).inputType;
    if (t === 'insertLineBreak' || t === 'insertParagraph') e.preventDefault();
  });
  el.addEventListener('paste', (e) => {
    const text = (e as ClipboardEvent).clipboardData?.getData('text');
    if (text == null) return;
    e.preventDefault();
    const clean = sanitizeText(text);
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + clean + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + clean.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The likeliest source of a "(1) " prefix is copying a question off this very site. */
function hintNumbering(li: HTMLElement, qm: QuestionModel, input: HTMLInputElement) {
  const hint = li.querySelector<HTMLElement>('[data-hint]');
  if (!hint) return;
  if (!hasNumberPrefix(qm.q)) {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  hint.innerHTML =
    'Questions are not numbered here — the numbering is added when the file is generated, ' +
    'so inserting a question renumbers the rest for you. ' +
    '<button type="button" class="propose-fix">Remove the number</button>';
  hint.querySelector('.propose-fix')!.addEventListener('click', () => {
    qm.q = stripNumberPrefix(qm.q);
    input.value = qm.q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// --- bootstrap ------------------------------------------------------------
// Last, so every helper above is initialized before init() runs.
const root = document.getElementById('propose') as HTMLElement | null;
if (root) init(root);
