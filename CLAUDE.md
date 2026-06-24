# CLAUDE.md — Operating Manual

blokz.dev is the public dev blog of **Blokz Development Co.** (AI × Blockchain), built with
Astro 5 + Tailwind 4 + GSAP + Three.js, deployed on Vercel from this repo. Content is created
and iterated by **scheduled Claude routines** operating directly on this repository — this file
is the contract those sessions must follow.

## Commands

```bash
npm run dev            # dev server at localhost:4321
npm run build          # static build to dist/ + pagefind search index
npm run new:article -- --title "…" --topics ai,agents   # scaffold an article (REQUIRED path)
npm run new:artifact -- --title "…" --type three --topics blockchain
npm run validate       # content gate — MUST pass before every commit
npm run index          # regenerate content/_index.json (the machine-readable catalog)
npm run check          # validate + astro check (types)
```

## Repo map

| Path | What it is |
| --- | --- |
| `content/articles/YYYY/MM/<slug>/index.mdx` | Articles (assets colocated in `./assets/`) |
| `content/artifacts/<slug>/manifest.json` | Artifact metadata |
| `src/islands/artifacts/<slug>.ts` | Artifact code (1:1 with manifests) |
| `content/taxonomy/topics.json` | Controlled topic vocabulary |
| `content/series/`, `content/authors/` | Series + author registries |
| `content/_index.json` | **Generated** catalog of all content — read this, don't glob |
| `src/content.config.ts` | Zod schemas (single source of truth for frontmatter) |
| `src/pages/`, `src/components/`, `src/layouts/` | Site UI |
| `src/lib/` | site constants, motion, three-utils, content helpers |
| `scripts/` | Automation CLIs used above |
| `docs/` | ARCHITECTURE, CONTENT-AUTHORING, ARTIFACTS, ROUTINES, DESIGN-SYSTEM |

## Content routine workflow (the happy path)

1. **Survey** — read `content/_index.json` for the full catalog (slugs, topics, dates, series).
   Never glob `content/` to discover content; the index is one read and always current.
2. **Scaffold** — `npm run new:article -- --title "…" --topics <from-taxonomy>`. Never
   hand-create article directories; the script owns path/frontmatter correctness and
   refreshes the index.
3. **Write** — fill in the MDX body. House style and frontmatter reference:
   `docs/CONTENT-AUTHORING.md`. Embed interactivity with `<Artifact slug="…" />` (no import
   needed) and list every embedded slug in the `artifacts:` frontmatter array.
4. **Gate** — `npm run check && npm run build` must pass (this is the exact CI job:
   `validate` + `astro check` types + `build`). `validate` enforces taxonomy membership,
   path↔date agreement, slug uniqueness, dangling references, and index freshness. Run the
   full gate, not just `validate` — a type error passes `validate` but fails CI.
5. **Commit & push** — commit the article *and* the regenerated `content/_index.json`
   together. Flip the PR ready and enable squash auto-merge; a green local gate means CI passes
   and the PR merges itself (production auto-deploys on merge). Conventions below.

To **update** an existing article: edit in place, set `updatedDate`, run `npm run index`,
validate, commit. Never change a published article's `slug` (it's the URL).

## Hard rules

- **Topics are a closed vocabulary.** Only ids from `content/taxonomy/topics.json`. To add a
  topic, add it there deliberately (id, label, description, hue) in its own commit — don't
  free-type new topics in frontmatter. Prefer reusing existing topics; the taxonomy should
  grow by ones, not tens.
- **The CI gate is `npm run check && npm run build`.** No PR ships red. CI runs this exact job
  on every push (`validate` + `astro check` + `build`); run it locally so a green PR merges
  unattended.
- **Content runs touch content.** During article/artifact routines, do not modify
  `src/layouts/`, `src/styles/`, `src/lib/`, or page templates. Design/feature work happens in
  dedicated sessions, not content runs.
- **Artifacts are code + manifest, always both.** Manifest in `content/artifacts/<slug>/`,
  module in `src/islands/artifacts/<slug>.ts`, contract in `docs/ARTIFACTS.md` (default-export
  `mount(el) => cleanup`, dispose everything you create).
- **Don't edit generated files by hand**: `content/_index.json` comes from `npm run index`.
- Licensing split: code is MIT, `content/` is CC BY 4.0. Don't paste in third-party text or
  images that can't live under those terms.

## Writing quality bar

- Substantive technical depth — the reader is a working engineer. Code, numbers, tradeoffs.
- 800–2000 words typically; under 150 words fails review as a stub.
- Descriptions are 40–300 chars and must earn the click (they're also the meta description).
- Cite primary sources in `sources:` frontmatter. Be honest about limitations and hype.
- Interlink: reference related/earlier articles by URL (`/articles/<slug>`); use series for
  multi-part arcs (register in `content/series/` first).

## Commit conventions

- `content: add article <slug>` / `content: update <slug> (<why>)`
- `artifact: add <slug>` / `artifact: fix <slug> (<why>)`
- `taxonomy: add topic <id>`
- `site: <change>` / `docs: <change>` / `ci: <change>`
- Work on the designated session branch; push with `git push -u origin <branch>`.

## Brand constants

All brand links live in `src/lib/site.ts` (homepage https://blokz.dev, repo
github.com/blokzdev/blokz, X @blokzdev, LinkedIn linkedin.com/company/blokzdev). Never
hardcode them elsewhere.
