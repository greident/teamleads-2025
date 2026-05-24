Create an SEO-optimized evergreen article from a community meetup transcript. The article repackages discussion insights into a search-friendly format targeting long-tail queries.

## Input

The user provides:
- Path to transcript file (e.g. `~/repos/sandbox/transcript_20260515_120026_c5c0379e.txt`)
- Optionally: a specific topic from the transcript to focus on

If not provided, ask for the transcript path.

## Step 1: Read reference materials

Read in parallel:
1. The transcript file
2. The style guide at `2025/landing/blog_style_writing.md`
3. The most recent article from `landing-main/content/articles/` (for format reference)
4. The article layout at `landing-main/layouts/articles/single.html`
5. All event files in `landing-main/content/events/meetup-*.md` (frontmatter only – to find the matching event)
6. All insight files in `landing-main/content/insights/*.md` (frontmatter + topics titles – to find related insights)

## Step 2: Match the transcript to an existing event

The transcript is a raw speech-to-text dump. It may not have a clear date – use context clues (topics discussed, participant names) to match it to an existing event report in `landing-main/content/events/`.

Compare:
- Topics and subtopics mentioned in the transcript vs event frontmatter (`mainTopic`, `tags`, `cardTitle`)
- Participant names mentioned in the transcript vs event `participants` list

Present the match to the user for confirmation. If no match is found, ask the user which event this transcript belongs to.

## Step 3: Identify the best article topic

Read the full transcript. A good article topic:
- **Has high search intent** – someone would Google this problem
- **Is universal** – applies beyond Kazakhstan/this community
- **Has rich detail** – the transcript covers it deeply with examples, counterarguments, and practical advice
- **Is actionable** – the reader can apply what they learn

From the transcript, propose 2–3 candidate topics with:
- Suggested title (search-optimized, in Russian)
- Target search queries it would rank for
- Why this topic has enough material for an article

Let the user pick, or proceed with the strongest candidate if the user said to pick one.

## Step 4: Find related insights

Scan all insight files (`landing-main/content/insights/*.md`) for topics that overlap with the chosen article theme. Check:
- `tags` in frontmatter
- `topics[].title` for keyword matches
- The insight's `period` to confirm it covers the same timeframe as the event

Collect slugs of related insights for the `relatedInsights` frontmatter field.

## Step 5: Write the article

### Writing style

Follow `2025/landing/blog_style_writing.md` strictly. Key principles:

**Structure: Concrete → Abstract**
- Open with a specific story, example, or situation from the transcript
- Then generalize into principles
- Close with practical recommendations

**Tone:**
- Intellectual humility – present observations, not absolute truths
- Slightly sarcastic but not cynical
- Authoritative but not preachy
- Balance criticism and recognition

**Rhetorical techniques:**
- Reference research/experiments when available (name the researcher and key finding)
- Use vivid but not forced metaphors
- Include specific numbers for persuasion
- End sections with rhetorical questions or calls to reflection
- Use "Не X, а Y" for emphasis through contrast

**Sentence rhythm:**
- Alternate short declarations → long explanations → short conclusions
- "Парадокс. [long analytical sentence]. Вот такая ирония."

**What to avoid:**
- No aggressive criticism without constructive alternative
- No absolute statements ("всегда X приводит к Y")
- No unexplained jargon
- No banalities ("коммуникация важна")
- No preachy tone ("вы должны")
- No oversimplification

### Formatting rules

- En-dashes (–) not em-dashes (—) everywhere
- Russian number formatting: space for thousands (75 000), comma for decimals (7,2)
- Percentages without space before % sign
- Ranges with en-dash without spaces (5–10)

### Article structure

A typical article has:
1. **Hook** (2–3 paragraphs) – open with a concrete situation from the transcript, then pose the question
2. **Core sections** (3–6 sections with `##` headers) – each section covers one aspect of the topic
3. **Differing viewpoints** – show where participants disagreed, present both sides
4. **Practical section** – checklist, recommendations, or framework the reader can use
5. **Why this matters** – connect to broader impact (hiring, budget, career, etc.)
6. **Closing** – rhetorical question + link to Telegram + attribution line

### Frontmatter

```yaml
---
title: "SEO-optimized title in Russian – what the reader gets"
description: "Under 160 chars – key topics and value proposition for search"
date: YYYY-MM-DD  # 1-2 days after the event date
tags: ["tag1", "tag2", "tag3", "Казахстан"]
author: "Сообщество «Тимлид не кодит»"
readingTime: NN  # estimated minutes
sourceEvent: "meetup-YYYY-MM-DD"  # slug of the source event (without path)
relatedInsights: ["week-YYYY-MM-DD"]  # slugs of related insight pages
cardTitle: "Short title for cards (under 50 chars)"
cardDesc: "Card description for listings (under 120 chars)"
---
```

### Content body (Markdown)

Write in Markdown (not HTML). The layout renders it with proper typography.

- Use `##` for main sections, `###` for subsections
- Use `**bold**` for key terms on first mention
- Use `>` blockquotes sparingly – for direct quotes from transcript
- Use tables (`| col | col |`) for comparison views
- Use `- [ ]` checkbox lists for checklists
- Include inline links to the source event and related insights where natural

### Footer attribution

Always end with:
```
---

*Эта статья основана на [встрече сообщества «Тимлид не кодит» DD месяц YYYY года](/events/meetup-YYYY-MM-DD/). Контекст – из [инсайтов за DD–DD месяц](/insights/week-YYYY-MM-DD/). Присоединяйтесь к обсуждению в [Telegram](https://t.me/teamleads_kz).*
```

Omit the insight reference if no related insight exists.

### File naming

`landing-main/content/articles/{seo-slug-in-transliterated-russian}.md`

Use transliterated Russian for the slug (e.g. `r-and-d-v-it-chto-schitat-issledovaniem`, `kak-borotsya-s-navyazannymi-resheniyami`). Keep it under 60 characters. The slug should contain the primary search keyword.

## Step 6: Quality check

Before saving, verify:
- [ ] Title targets a real search query (would someone Google this?)
- [ ] Opening hook is a concrete situation, not an abstract statement
- [ ] At least one section shows differing opinions from the discussion
- [ ] Checklist or practical framework is included
- [ ] No em-dashes (—) – only en-dashes (–)
- [ ] Numbers follow Russian formatting rules
- [ ] `sourceEvent` matches an existing event slug
- [ ] `relatedInsights` slugs match existing insight files
- [ ] Cross-links in the article body work (event link, insight link, Telegram link)
- [ ] Article length is 1 500–3 000 words (enough for SEO, not bloated)
- [ ] Writing follows the style guide: concrete-first, balanced, not preachy

## Step 7: Build and verify

Run `hugo --quiet` from `landing-main/` to verify the build succeeds.

Check that:
- The article page renders at `/articles/{slug}/`
- The source event page now shows the article in "Статьи по теме"
- Related insight pages show the article (if `relatedInsights` is set)
- The articles list page at `/articles/` includes the new article

## Step 8: Summary

Present to the user:
- Article title and URL path
- Source event linked
- Related insights linked
- Target search queries
- Word count and reading time
- Cross-links created (which pages now link to each other)
- Ask the user to review before committing
