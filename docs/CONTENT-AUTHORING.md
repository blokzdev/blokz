# Content Authoring

The complete reference for writing articles. The frontmatter schema's source of truth is
`src/content.config.ts`; this doc explains intent and conventions.

## Location contract

```
content/articles/YYYY/MM/<slug>/index.mdx
content/articles/YYYY/MM/<slug>/assets/…      # images used by this article only
```

`YYYY/MM` must match `pubDate` (UTC), and `<slug>` must equal the frontmatter `slug`.
`npm run new:article` guarantees all of this — always scaffold with it.

## Frontmatter reference

```yaml
---
slug: optimistic-ml-oracles            # kebab-case, unique, IS the URL — never change after publish
title: "Optimistic ML Oracles: …"      # 8–120 chars, sentence-meaningful
description: "Zero-knowledge proofs…"  # 40–300 chars; the meta description AND card teaser
pubDate: 2026-06-11                    # YYYY-MM-DD; must agree with directory
updatedDate: 2026-06-20                # set when meaningfully revising published work
draft: false                           # true → visible in dev, excluded from prod build
author: blokz                          # id in content/authors/
topics: [blockchain, machine-learning] # 1–5 ids from content/taxonomy/topics.json (closed vocab)
tags: [oracles, dispute-games]         # free-form lowercase, finer-grained than topics
series: proof-of-intelligence          # optional; id in content/series/ (register first)
seriesOrder: 2                         # required when series is set
hero: ./assets/hero.png                # optional; relative to the article dir
heroAlt: "…"                           # required if hero is set
artifacts: [block-mesh]                # every artifact embedded or centrally discussed
difficulty: intermediate               # intro | intermediate | advanced
featured: false                        # surfaces on the homepage hero rotation
sources:                               # primary sources; rendered as "further reading"
  - label: "Arbitrum fraud proofs"
    url: "https://docs.arbitrum.io/…"
---
```

## Body conventions

- **MDX.** Standard GitHub-flavored Markdown plus the `<Artifact slug="…" />` component
  (available without import). Headings start at `##` — the page renders the title as `h1`.
- `##` headings feed the table of contents; keep them short and scannable.
- Code blocks get Shiki highlighting (`tokyo-night`); always tag the language.
- Internal links are root-relative: `/articles/<slug>`, `/topics/<id>`.
- Images: put files in `./assets/` and reference relatively; Astro optimizes them. Always
  include alt text.
- Length: 800–2000 words is the sweet spot. The validator warns under 150 words.

## House style

- Write for working engineers: concrete mechanisms, numbers, code, tradeoff tables.
- Lead with why it matters; don't bury the thesis under background.
- Be precise about trust models and limitations — this blog's credibility is its product.
  Calling out hype (including AI/crypto hype) is on-brand.
- Bold sparingly for load-bearing claims. Avoid filler ("in today's fast-paced world…").
- Series are for genuine multi-part arcs with a narrative thread, not loose groupings —
  that's what topics are for.

## Updating published work

Edit in place, set `updatedDate`, regenerate the index, validate, commit with
`content: update <slug> (<reason>)`. For corrections of substance, note the change in the
body (e.g. a short *"Updated 2026-06-20: …"* italic line) so readers aren't gaslit.
