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

## Responsive layout (the four slots)

Multi-region artifacts (anything with a visualization **plus** controls/readouts — i.e. most
`dom` and `svg` types) must compose into the shared primitive `createArtifactLayout()` from
`src/lib/artifact-layout.ts` instead of hand-rolling a `position:absolute; inset:0` root with a
private resize breakpoint. The primitive owns the responsive arrangement so the same artifact
reads well inline (narrow phone), on its standalone page, and fullscreen.

```ts
import { createArtifactLayout } from '@/lib/artifact-layout';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',                 // or 'rail'
    stageMin: 'clamp(200px, 52vw, 340px)',
  });
  const { stage, panel, controls, caption } = layout;
  // build the visualization into `stage`, secondary readout into `panel`,
  // inputs into `controls`, the source/hint line into `caption`.
  return () => { layout.dispose(); /* + your listeners/timers/style */ };
}
```

Four named slots, arranged by the container's orientation (no work from you):

| Slot | Holds | Landscape | Portrait |
| --- | --- | --- | --- |
| `stage` | the primary visualization (SVG/canvas) | left, dominant | top |
| `panel` | secondary readout: legend, detail, tally, scoreboard | right of stage | below stage |
| `controls` | inputs: sliders, tabs, toggles, buttons | right rail (`'rail'`) or full-width footer (`'footer'`) | below panel |
| `caption` | source/provenance line + interaction hints | full-width bottom | bottom |

- Omit a slot you don't use (`{ panel: false }`); empty slots take no space.
- `'footer'` suits a wide row of sliders/buttons; `'rail'` suits a compact control set.
- **Size the stage to its content.** The primitive pads the whole frame and gives the stage a
  small default floor. For a fixed-shape chart/diagram pass `stageAspect` (e.g. `'16/6'` for a
  short bar chart, `'800/132'` for a wide chain, `'4/3'` for a curve) so the stage height derives
  from its width with no dead gap. Use `stageMin` only for variable-height DOM stages, and keep it
  modest — a tall `stageMin` reserves empty space above the panels.
- **Never let content clip.** The frame is padded and `overflow-hidden`, so anything wider than
  the container is cut off. In your `<style>` use shrinkable grid tracks (`minmax(0,1fr)`, not
  bare `1fr`/fixed px), `flex-wrap:wrap` on control/button rows, `min-width:0` on flex/grid
  children, and `overflow-wrap:anywhere` on long text (addresses, error strings) so it wraps.
- Put **visual** CSS in your own injected `<style>`; never add layout/reflow CSS, outer padding,
  or your own resize breakpoint — the primitive is the single source of responsive truth. (A
  small local `ResizeObserver` for an *internal* sub-layout is fine if you disconnect it in
  cleanup.)
- Full-bleed `three`/`canvas` artifacts don't need the primitive — they fill `container`
  directly. `ArtifactMount` gives them a portrait-friendly box; multi-region artifacts grow to
  fit their content so they never cram on a phone.

## Fullscreen

Every embed gets a "⛶ fullscreen" action (handled by `ArtifactMount` + `artifact-fullscreen.ts`)
that re-mounts the artifact filling the viewport, with device autorotation. You get this for
free — just keep `mount()` cheap to call twice and make `cleanup()` release everything (the
fullscreen instance is disposed on close). Don't lock `screen.orientation`. In fullscreen the
slots flow to their natural height and the overlay scrolls if needed, so a tall panel never
overlaps the controls — same containment as inline.

> Backlog (not built): an alternate inline mode that shows only the artifact's title/description
> + a "view fullscreen" CTA, deferring all interaction to fullscreen. Revisit if inline embeds of
> the heaviest artifacts ever need to get lighter on mobile.

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
