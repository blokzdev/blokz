# Architecture

## Overview

blokz.dev is a fully static Astro 5 site. Every page is prerendered at build time to `dist/`;
there is no server runtime. Vercel deploys the repo with its Astro framework preset
(`npm run build` → `dist/`), so the architecture is host-agnostic.

```
content/  ──┐                        ┌──▶ HTML pages (zero JS by default)
            ├──▶  astro build  ──────┼──▶ islands (GSAP/Three.js, lazy-hydrated)
src/      ──┘     (Zod-validated)    ├──▶ /og/*.png (satori), rss.xml, sitemap
                                     └──▶ pagefind index (post-build CLI)
scripts/  ──▶  validate / index / scaffold   (used by routines + CI, no Astro dependency)
```

## Why these choices

- **Astro content collections** give type-safe, Zod-validated frontmatter and scale to
  thousands of MDX entries with incremental content-layer caching. Schemas live in
  `src/content.config.ts`.
- **Islands over SPA**: content pages ship near-zero JS. Interactivity (hero scene, artifacts,
  search) is mounted from small vanilla-TS modules behind `IntersectionObserver` /
  `requestIdleCallback`. There is no client router — every navigation is a plain page load,
  which keeps GSAP/Three lifecycle trivial (no stale-listener cleanup between routes).
- **Pagefind** builds a chunked static search index at build time; the browser fetches only
  the index fragments a query needs. This stays fast at thousands of articles with zero
  runtime infrastructure. Only elements marked `data-pagefind-body` (article + artifact
  bodies) are indexed.
- **Deterministic content index** (`content/_index.json`): routines and external tooling get
  the entire catalog in one read. It is generated (`npm run index`), diff-stable (no
  timestamps, stable sort), and CI fails if it drifts from the content tree.

## Content data flow

1. Files under `content/` are loaded by the glob/file loaders in `src/content.config.ts`.
2. Pages query through `src/lib/content-helpers.ts` (`getArticles` hides drafts in prod,
   sorts by date; `relatedArticles` ranks by topic overlap).
3. Routes:
   - `/articles/[slug]` — slug comes from frontmatter, *not* the file path, so the
     `YYYY/MM` directory layout never leaks into URLs.
   - `/articles/[...page]`, `/topics/[topic]/[...page]` — paginated (12/page) so index pages
     stay O(1) regardless of archive size.
   - `/artifacts/[slug]` — mounts the artifact module via `ArtifactMount`.
   - `/og/[slug].png` — satori renders an OG card per article at build time.

## Scale posture (1000s of articles)

- Build output is pure static files; CDN-cacheable, O(pages) build with content-layer caching.
- Listing pages are paginated; nothing renders the whole archive on one page.
- Search is Pagefind (sharded index, lazy-fetched).
- The `YYYY/MM` directory sharding keeps any single directory small for tooling and git.
- `content/_index.json` is the single aggregation point; if it ever grows unwieldy
  (≫ a few MB), shard it by year — consumers read counts first.

## CI

`.github/workflows/ci.yml` runs `npm run validate`, `astro check`, and a full build (including
Pagefind) on every push/PR. Vercel performs the production deploy on the default branch.
