# Artifacts

Artifacts are the interactive half of the publication: self-contained WebGL/canvas/SVG/DOM
pieces that make a concept explorable. Each gets a standalone page (`/artifacts/<slug>`) and
can be embedded in any article with `<Artifact slug="…" />`.

## Anatomy

Every artifact is exactly two files:

```
content/artifacts/<slug>/manifest.json    # metadata (schema: src/content.config.ts)
src/islands/artifacts/<slug>.ts           # code (lazy-loaded entry module)
```

`npm run new:artifact -- --title "…" --type three --archetype scene --topics blockchain`
scaffolds both. The validator enforces the 1:1 pairing. Data-backed artifacts add an
optional third file, `content/artifacts/<slug>/data.json` (see below).

## Archetypes

`type` says how an artifact is *drawn*; `archetype` says what *kind of explorable* it is.
Choose deliberately — not every concept wants particles — and prefer an archetype
underrepresented in the recent catalog:

| Archetype | What it's for | Typical type | Reference |
| --- | --- | --- | --- |
| `chart` | Real researched numbers: time series, distributions, flows | svg/canvas | — |
| `map` | Geographic/topological distributions (self-drawn basemap, never external tiles) | svg | — |
| `diagram` | Protocol flows, state machines, data structures stepped through by interaction | svg/dom | `merkle-cascade`, `attention-lens` |
| `simulation` | Mechanisms unfolding over time | canvas/three | `neural-flow`, `gradient-descent` |
| `calculator` | Baked-in formulas the reader can push on | dom | — |
| `scene` | Spatial structure as the concept itself | three | `synapse-chain`, `block-mesh` |

## Data-backed artifacts

Charts and maps are only as good as their numbers. The rules:

- **Snapshot at authoring time** from primary sources (Blockscout, exchange data, papers)
  into `content/artifacts/<slug>/data.json`, statically imported by the module. Artifacts
  stay self-contained: **no runtime fetches, ever**.
- **Provenance is mandatory**: when `data.json` exists, the manifest must carry
  `dataSource: { label, url }` and `dataAsOf: YYYY-MM-DD` — the validator fails otherwise.
  `ArtifactMount` renders "data as of … · source ↗" under every embed automatically.
- **No fabricated numbers.** If the data can't be sourced, build a different artifact.
- Refreshing the snapshot later: update `data.json` + `dataAsOf`, set `updatedDate`,
  re-run `npm run index`.

## The module contract

```ts
export default function mount(container: HTMLElement): () => void {
  // 1. Create your canvas/DOM inside `container` (it has a fixed aspect-ratio box).
  // 2. Animate.
  // 3. Return a cleanup that releases EVERYTHING: RAF loops, listeners,
  //    observers, intervals, GPU geometries/materials, created elements.
}
```

- The module is dynamically imported only when the stage scrolls near the viewport
  (`src/components/ArtifactMount.astro` owns loading, placeholders, and reduced-motion).
- Heavy deps (`three`, `gsap`) are fine — they're code-split per artifact and shared via
  chunking when several artifacts use them.

## Performance rules

- **Three.js artifacts must use `createScene()` from `src/lib/three-utils.ts`.** It caps
  devicePixelRatio at 2, handles resize via `ResizeObserver`, and pauses rendering when the
  canvas is off-screen or the tab is hidden. Don't hand-roll render loops.
- Scale workload down on small screens (`isSmallScreen()` helper) — roughly halve particle
  counts on mobile.
- Prefer `AdditiveBlending` + `depthWrite: false` points/lines for the house glow aesthetic
  (see `block-mesh`), and the token palette from `docs/DESIGN-SYSTEM.md`.
- 2D canvas artifacts handle their own DPR and `document.hidden` checks (see `neural-flow`).
- **Draggable scenes must use `attachOrbit()` from `src/lib/orbit.ts`** — the shared
  flick/tap model (time-based momentum decay, tap detection, pointercancel handling,
  `touch-action: pan-y`). Never hand-roll per-frame `*= 0.94` decay; it's refresh-rate
  dependent.
- The brand visual (neural cluster ⇄ block lattice bridge) is shared between the homepage
  hero and `synapse-chain` via `src/lib/synapse-geometry.ts` — extend it there, not in copies.
- Budget: an artifact should stay comfortably under 60fps frame budget on a mid-range phone;
  if an algorithm is O(n²) per frame (e.g. proximity links), keep n small or grid-hash it.

## Interaction & accessibility

- Every interaction must have a pointer-only path (no hover-required, no keyboard-required).
- List interaction hints in the manifest's `controls` array — they render under the stage.
- Reduced motion: `ArtifactMount` automatically replaces autoplay with a "▶ run animation"
  opt-in button. Artifacts don't need to handle this themselves, but must not autoplay sound
  or aggressive flashing regardless.

## Manifest reference

```json
{
  "slug": "block-mesh",
  "title": "Block Mesh",
  "description": "What it shows and how to interact (20–300 chars).",
  "pubDate": "2026-06-11",
  "type": "three",            // rendering tech: three | canvas | svg | dom
  "archetype": "simulation",  // chart | map | diagram | simulation | calculator | scene
  "topics": ["blockchain"],   // taxonomy ids
  "aspect": "16/9",           // stage aspect ratio
  "featured": true,           // homepage eligibility
  "controls": ["drag to orbit"],
  // Only for data-backed artifacts (required when data.json exists):
  "dataSource": { "label": "Base via Blockscout", "url": "https://base.blockscout.com/…" },
  "dataAsOf": "2026-06-12"
}
```

Link articles to artifacts via the article's `artifacts:` frontmatter — the artifact page
automatically shows an "Appears in" section with every linking article.
