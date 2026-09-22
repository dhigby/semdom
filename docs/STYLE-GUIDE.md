# Semantic Domains v5 — Elicitation Question Style Guide

Elicitation questions do two jobs at once: they must **prompt a native speaker
to recall as many words as possible** in a concept area, and they must
**translate cleanly into dozens of languages** by field workers who are not
professional lexicographers. Those two goals set every rule below.

## Question templates

Prefer a small set of predictable frames. One semantic target per question.

- `What words refer to X?` — for entities/things.
- `What words describe X?` — for qualities/states.
- `What words refer to a person who X?` — for agent nouns.
- `What words are used when someone Xs?` — for actions/events.
- `What words tell how / when / where X happens?` — for manner/time/place.

Order questions within a domain **general → specific**: the broad "what words
refer to X?" first, then finer distinctions.

## Translatability rules (hard constraints)

1. **Short.** Aim ≤ 20 words; hard cap ~25. Long questions fragment in
   translation.
2. **No idioms or figurative language.** "beat around the bush," "under the
   weather," "kick the bucket" do not survive translation.
3. **No English-only polysemy.** Don't build a question on the fact that one
   English word has two senses; other languages split them.
4. **No rhetorical or yes/no questions.** Every question must ask *for words*,
   not for a judgment or a fact. Bad: "Is the sky blue?" Good: "What words
   describe the color of the sky?"
5. **No culture-bound references** as the framing. Seasons, foods, institutions,
   holidays, and scripture differ across the world; don't assume them in the
   question itself (they can appear as *optional* examples).
6. **Plain, high-frequency English.** Avoid technical/Latinate vocabulary in the
   question text ("celestial," "lacustrine") — save those for example words.
7. **Concrete over abstract framing.** "What words refer to rain?" beats "What
   lexemes encode precipitation events?"

## Example words

- **3+ where possible**; high-frequency, everyday words first, rare/technical
  last.
- Represent the concept **neutrally**: no slurs, ethnic/gender pejoratives, or
  archaic terms as the lead exemplar. Document a slur only where the concept is
  *about* derogation, and label it.
- Keep them as words/short phrases, comma-separated, matching v4 formatting.

## Example sentences

- Optional. Use only when a sentence genuinely clarifies usage.
- **Culturally neutral** — everyday, secular scenes. No scripture as the default
  illustration. (Angle brackets `< >` around the target word/phrase, matching
  v4 convention, are preserved.)

## Numbering

Questions are numbered `(1)`, `(2)`, … within a domain. Numbers are **not
referential** (words are tagged to the domain code, not the question number), so
`apply-changes.mjs` renumbers a domain's questions sequentially whenever that
domain is edited. Untouched domains keep their original numbering verbatim.

## Worked before/after

- **Before (2.6.2.3 Q1):** "What general words refer to sexual immorality?"
  **After:** "What words does this community use for sexual behavior it
  considers wrong?" — relocates the value judgment to the *community*, not the
  list.
- **Before (idiom):** "What words refer to someone who has kicked the bucket?"
  **After:** "What words refer to a person who has died?"
- **Before (culture-bound example sentence):** "In the beginning God created
  &lt;the heavens and the earth&gt;."
  **After:** "From the hilltop you could see &lt;the whole world&gt; spread out
  below."
