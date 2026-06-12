# Design System

Dark-futuristic, glassmorphic, motion-rich — but disciplined. Tokens live in
`src/styles/global.css` (`@theme`); never hardcode colors or fonts elsewhere.

## Brand

Canonical tagline: **`SITE.tagline`** in `src/lib/site.ts` ("Where the brain meets the
chain"). It is the single source — lowercase brand moments (footer) use the CSS
`lowercase` class, never a second string. In the hero H1, "brain" wears
`text-gradient-brain` (accent→violet) and "chain" wears `text-gradient-chain`
(violet→cyan): the headline encodes the left-to-right bridge that the hero scene
(`src/islands/hero-scene.ts`) renders behind it. The hero and the `synapse-chain`
artifact share geometry via `src/lib/synapse-geometry.ts` — change the brand visual there.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-void` | `#05070d` | Page background |
| `--color-ink` | `#0a0e1a` | Raised surfaces (dialogs) |
| `--color-panel` | `#0d1322` | Card fills (behind glass blur) |
| `--color-line` | `rgba(124,140,255,.14)` | Hairline borders |
| `--color-line-bright` | `rgba(124,140,255,.28)` | Hover/scrolled hairlines |
| `--color-glow` | `rgba(91,140,255,.35)` | Text/box glow color |
| `--color-text` / `muted` / `faint` | `#e7eaf3` / `#8d95ad` / `#5b6378` | Type hierarchy |
| `--color-accent` | `#5b8cff` | Electric blue — links, primary actions |
| `--color-violet` | `#8b5cf6` | Gradient partner, series accents |
| `--color-cyan` | `#22d3ee` | Highlights, "interactive" markers |
| `--text-hero` / `--text-page-title` | fluid clamps | Hero/page-title sizes (`text-hero` etc.) |
| `--shadow-glow-sm` / `--shadow-glow-md` | brand glows | `shadow-glow-sm`/`-md` utilities |

Brand gradient: `accent → violet → cyan` (utility: `text-gradient`; halves:
`text-gradient-brain`, `text-gradient-chain`). Topic theming uses per-topic `hue` from the
taxonomy via `--chip-hue` + HSL (see `TopicChip.astro`); cards opt into hue-tinted hover via
`--card-hue`.

## Typography

- **Display** — Space Grotesk (400/500/700): headings, wordmark, section labels.
- **Body** — Inter Variable: prose and UI.
- **Mono** — JetBrains Mono: code, eyebrows (`font-mono text-xs tracking-[0.2em] uppercase`),
  metadata.
- Fluid hero type via the `--text-hero`/`--text-page-title` tokens; body prose is
  1.0625rem/1.78.

## Surfaces

- `glass` utility = blurred panel fill + hairline border. Cards add `card-hover`
  (lift + hue-aware glow + shine sweep on hover; set `--card-hue` to tint) and `rounded-2xl`.
- `gradient-border` = brand-gradient hairline border (featured surfaces: CTA card, series
  asides). Solid panel fill — don't stack on `glass`.
- `grid-veil` = faint blueprint grid, masked radially — hero/CTA/article-header backdrops only.
- `ring-glow` = accent halo for featured stages (artifact mounts).
- `noise` = fixed film-grain overlay (~2% opacity); applied once, on `<body>`.
- `link-underline` = gradient underline that grows from the left on hover/focus (footer
  lists, view-all links).
- Artifact identity is a deterministic constellation seeded by the slug
  (`src/lib/constellation.ts`): gallery cards and stage placeholders render it as inline
  SVG, and `/og/artifacts/<slug>.png` carries it into share cards (`src/lib/og-card.ts`).
  Never live renderers in listings.
- Article niceties injected client-side: `.code-copy` buttons on code blocks (inside a
  `.code-frame` wrapper so they don't scroll with the code) and `.heading-anchor` hover
  links on prose h2/h3.

## Motion grammar (GSAP)

Declarative via data attributes, implemented in `src/lib/motion.ts`:

- `data-split` — h1-level headlines; masked line-rise (SplitText). One per page. Splits run
  after `document.fonts.ready` (300ms race) so line breaks are final.
- `data-reveal` / `data-reveal="0.3"` — fade-rise on scroll-enter, optional delay.
- `data-reveal-group` — stagger direct children (or `[data-reveal-item]`s).
- `data-scroll-progress` — scaleX scrubbed against document scroll (article reading bar,
  pairs with `.progress-bar`).
- `data-magnetic` — element leans ±6px toward the pointer; hover-capable devices only.
- `data-counter="N"` — count-up on scroll-enter. The final value **must** be
  server-rendered so no-JS/reduced-motion shows the truth.
- `data-parallax-glow` — decorative `aria-hidden` backdrops drift vertically, `scrub: 1`.
- `data-scroll-fade` — fades/drifts up as it scrolls out (scrubbed; hero content).
- `data-toc-spy` — TOC container; the link for the heading in view gets `.is-active`.
  State, not motion: runs under reduced motion, CSS owns the transition.

Rules: ease `expo.out`/`power3.out`, durations ≤1.1s, animations fire `once` (no scroll-
scrubbed re-triggering except the two scrubbed decoratives above), and **everything except
toc-spy is skipped under `prefers-reduced-motion`** — content must be fully legible with
zero JS/motion. Infinite CSS animations (`.marquee`, the 404 glitch) need their own explicit
reduced-motion pause — the global 0.01ms override would strobe them.

## 3D / WebGL aesthetic

- Palette only from tokens; additive blending, `depthWrite: false`, fog to `--color-void`.
- Slow ambient motion (rotation ≈0.03–0.04 rad/s) + pointer parallax; nothing jolts.
- DPR capped at 2, render loops pause off-screen (enforced by `createScene()`).
- Mobile: reduce counts ~50% via `isSmallScreen()`.
- Prefer shader-side animation (per-vertex jitter via `uTime`) and precomputed static link
  topology over per-frame CPU buffer rebuilds — see `src/lib/synapse-geometry.ts`.
- Orbitable canvases set `touch-action: pan-y` so they never trap mobile scroll.

## Layout

- Content column `max-w-6xl` (cards) / `max-w-3xl` (prose); gutters `px-5 sm:px-6`.
- Fixed glass header dock (h-20 spacer): condenses + glows after 24px of scroll, ducks away
  on scroll-down and resurfaces on scroll-up / at top / on focus / with the menu open.
  Desktop nav hover uses the magic-ink pill (JS-measured, glides between links); the current
  page keeps a pinned gradient underline. Mobile menu is a full-screen blurred sheet with
  cascading display-type links, scroll-locked, Escape/backdrop to close.
- **Z-index scale** (never improvise): `40` mobile sheet · `50` header dock · `60` progress
  bar · `70` grain overlay · `100` skip link · native top layer: search dialog.
- Footer carries the lowercase tagline brand moment and brand links — GitHub, X, LinkedIn —
  from `src/lib/site.ts`.
- Breakpoints: cards 1-col → `sm:` 2 → `lg:` 3. TOC appears `xl:` on article pages.
- Touch targets ≥40px; `viewport-fit=cover` with safe-area awareness for notched devices.

## Recorded decisions

- No Astro view transitions / client router: full-page navigation keeps GSAP/Three island
  lifecycle trivially correct.
- No live WebGL previews in the artifact gallery (would pull the three chunk into the
  listing and run N renderers); seeded constellation SVGs instead.

## Voice of the UI

Microcopy leans technical-playful ("Block not found", "⬢ interactive", "back to genesis").
Keep it subtle — one wink per screen, never in article prose itself.
