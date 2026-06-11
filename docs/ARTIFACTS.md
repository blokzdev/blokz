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

`npm run new:artifact -- --title "…" --type three --topics blockchain` scaffolds both.
The validator enforces the 1:1 pairing.

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
  "type": "three",            // three | canvas | svg | dom
  "topics": ["blockchain"],   // taxonomy ids
  "aspect": "16/9",           // stage aspect ratio
  "featured": true,           // homepage eligibility
  "controls": ["drag to orbit"]
}
```

Link articles to artifacts via the article's `artifacts:` frontmatter — the artifact page
automatically shows an "Appears in" section with every linking article.
