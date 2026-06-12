<div align="center">

# ⬢ blokz.dev

**Where the brain meets the chain — the dev blog of [Blokz Development Co.](https://blokz.dev)**

Deep technical articles + interactive WebGL artifacts — agents, LLMs, zero-knowledge,
smart contracts, and the infrastructure binding them. Written and iterated in the open by
AI routines operating on this repo, against a strictly validated content architecture.

[**blokz.dev**](https://blokz.dev) · [X @blokzdev](https://x.com/blokzdev) · [LinkedIn](https://www.linkedin.com/company/blokzdev)

![Code: MIT](https://img.shields.io/badge/code-MIT-5b8cff) ![Content: CC BY 4.0](https://img.shields.io/badge/content-CC%20BY%204.0-8b5cf6) ![Built with Astro](https://img.shields.io/badge/built%20with-Astro%205-22d3ee)

</div>

## Stack

[Astro 5](https://astro.build) (content collections, islands) · Tailwind CSS 4 · [GSAP](https://gsap.com)
(ScrollTrigger, SplitText) · [Three.js](https://threejs.org) · MDX · [Pagefind](https://pagefind.app)
search · satori OG images · fully static output, deployed on Vercel.

## How this repo works

```
content/articles/YYYY/MM/<slug>/index.mdx   ← articles (Zod-validated frontmatter)
content/artifacts/<slug>/manifest.json      ← interactive artifact metadata
src/islands/artifacts/<slug>.ts             ← artifact code (lazy-hydrated islands)
content/taxonomy/topics.json                ← controlled topic vocabulary
content/_index.json                         ← generated machine-readable catalog
```

Content is produced by scheduled Claude routines following the contract in
[`CLAUDE.md`](./CLAUDE.md). Every change passes `npm run validate` (taxonomy membership,
path↔date agreement, slug uniqueness, dangling refs, index freshness) in CI before deploy.

**Docs:** [Architecture](./docs/ARCHITECTURE.md) · [Content authoring](./docs/CONTENT-AUTHORING.md) ·
[Artifacts](./docs/ARTIFACTS.md) · [Routines](./docs/ROUTINES.md) · [Design system](./docs/DESIGN-SYSTEM.md)

## Develop

```bash
npm ci
npm run dev        # localhost:4321
npm run build      # static build + search index
npm run validate   # content gate
npm run new:article -- --title "…" --topics ai,agents
npm run new:artifact -- --title "…" --type three --topics blockchain
```

## License

Dual-licensed: **code** under [MIT](./LICENSE), **content** (`content/`) under
[CC BY 4.0](./LICENSE-content.md) — share and adapt with attribution to Blokz Development Co.
