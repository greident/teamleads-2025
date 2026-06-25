# Тимлид-симулятор — как добавлять сценарии

The `sim` command in shell mode plays branching decision cases from `data/scenarios.yaml`.
Scenarios are grown as a **byproduct** of `/process-meetup` and `/extract-insights`: every
meetup and weekly digest is mined for the dilemmas it surfaced. This doc is the single
source of truth for both skills (and humans).

## The quality gate — when a scenario is worth adding

A simulator scenario is a **decision under tension that a team lead actually faces**, with a
defensible best answer. Add one only when all of these hold:

1. **It's a choice, not a fact or a pure preference.** If every option is equally valid, it
   belongs in the meetup's `opinions` table, not the sim. The sim needs a *better* answer.
2. **The wrong options are tempting,** not strawmen — they're what a reasonable but less
   experienced lead would actually pick.
3. **It's not already in the deck.** Read the existing `scenarios.yaml` first; skip themes
   already covered (bus-factor, навязанные решения, метрики, «наслабо», ответственность
   джуна, …) unless the new angle is genuinely distinct.

Caps per run: **`/process-meetup` → 1–3**, **`/extract-insights` → 0–2**. Quality over
quantity. A meeting or week with no real dilemma adds **nothing** — that's a valid outcome,
say so in the summary.

## Where to mine

- **`/process-meetup`:** the richest seams are the `opinions` rows (explicit disagreement —
  each pole becomes an option) and `takeaways` (a lesson → reverse-engineer the dilemma it
  resolves). `nextQuestions` are usually too open-ended.
- **`/extract-insights`:** each topic's closing rhetorical question is a dilemma seed, and the
  two `quotes` often capture the opposing poles.

## Schema (one list item under `scenarios:`)

```yaml
  - id: meetup-2026-06-24-when-to-hire   # globally unique: <page-slug>-<short-theme>
    prompt: |-
      Two short lines. A concrete situation in second person («вы»).
      Anonymize — no real names.
    options:                              # 3 (occasionally 4); exactly ONE good: true
      - label: "The action a lead might take"
        good: true                        # the defensible best answer
        votes: 55                         # integers; the three sum to ~100…
        outcome: "The consequence — constructive even when wrong."
      - label: "Tempting but worse"
        good: false
        votes: 30                         # …and the good one is NOT always the highest
        outcome: "Why it backfires."
      - label: "Third path"
        good: false
        votes: 15
        outcome: "..."
    lesson: "One line — the principle behind the best answer."
    link: "events/meetup-2026-06-24"      # the page THIS run just created
```

### Field rules
- **`id`** — unique across the whole file. Convention: the content slug + a short theme.
- **`prompt`** — 2 lines, concrete, second person, anonymized. Block scalar `|-`.
- **`options`** — 3 (max 4). Exactly one `good: true`. `votes` are integers summing to
  90–110; deliberately make the good answer *not* always the most-voted (realism).
- **`outcome`** — the result of that choice; keep wrong answers instructive, not punishing.
- **`lesson`** — the takeaway in one sentence.
- **`link`** — `events/<slug>` or `insights/<slug>` for the page produced this run, so the
  game drives readers back into the fresh material. Must resolve to a real page.
- **Formatting** — en-dashes (–) never em-dashes (—); guillemets « » for quotes. Same as all
  other content.

## After appending

Append new items to the **end** of `scenarios:` (don't reorder existing). Then, from
`landing-main/`:

```bash
hugo --quiet && node scripts/validate-scenarios.mjs
```

The validator checks unique ids, one good option each, votes ~100%, en-dashes, and that every
`link` resolves to a real page. Fix anything it flags before finishing, and list the added
scenarios (or "none — no genuine dilemma this run") in the run summary.
