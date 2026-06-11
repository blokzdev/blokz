# Design System

Dark-futuristic, glassmorphic, motion-rich — but disciplined. Tokens live in
`src/styles/global.css` (`@theme`); never hardcode colors or fonts elsewhere.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-void` | `#05070d` | Page background |
| `--color-ink` | `#0a0e1a` | Raised surfaces (dialogs) |
| `--color-panel` | `#0d1322` | Card fills (behind glass blur) |
| `--color-line` | `rgba(124,140,255,.14)` | Hairline borders |
| `--color-text` / `muted` / `faint` | `#e7eaf3` / `#8d95ad` / `#5b6378` | Type hierarchy |
| `--color-accent` | `#5b8cff` | Electric blue — links, primary actions |
| `--color-violet` | `#8b5cf6` | Gradient partner, series accents |
| `--color-cyan` | `#22d3ee` | Highlights, "interactive" markers |

Brand gradient: `accent → violet → cyan` (utility: `text-gradient`). Topic theming uses
per-topic `hue` from the taxonomy via `--chip-hue` + HSL (see `TopicChip.astro`).

## Typography

- **Display** — Space Grotesk (400/500/700): headings, wordmark, section labels.
- **Body** — Inter Variable: prose and UI.
- **Mono** — JetBrains Mono: code, eyebrows (`font-mono text-xs tracking-[0.2em] uppercase`),
  metadata.
- Fluid hero type via `clamp()`; body prose is 1.0625rem/1.78.

## Surfaces

- `glass` utility = blurred panel fill + hairline border. Cards add `card-hover`
  (lift + glow on hover) and `rounded-2xl`.
- `grid-veil` = faint blueprint grid, masked radially — hero/CTA backdrops only.
- `ring-glow` = accent halo for featured stages (artifact mounts).

## Motion grammar (GSAP)

Declarative via data attributes, implemented in `src/lib/motion.ts`:

- `data-split` — h1-level headlines; masked line-rise (SplitText). One per page.
- `data-reveal` / `data-reveal="0.3"` — fade-rise on scroll-enter, optional delay.
- `data-reveal-group` — stagger direct children (or `[data-reveal-item]`s).

Rules: ease `expo.out`/`power3.out`, durations ≤1.1s, animations fire `once` (no scroll-
scrubbed re-triggering), and **everything is skipped under `prefers-reduced-motion`** —
content must be fully legible with zero JS/motion.

## 3D / WebGL aesthetic

- Palette only from tokens; additive blending, `depthWrite: false`, fog to `--color-void`.
- Slow ambient motion (rotation ≈0.04 rad/s) + pointer parallax; nothing jolts.
- DPR capped at 2, render loops pause off-screen (enforced by `createScene()`).
- Mobile: reduce counts ~50% via `isSmallScreen()`.

## Layout

- Content column `max-w-6xl` (cards) / `max-w-3xl` (prose); gutters `px-5 sm:px-6`.
- Fixed glass header (h-20 spacer); footer carries brand links — GitHub, X, LinkedIn — from
  `src/lib/site.ts`.
- Breakpoints: cards 1-col → `sm:` 2 → `lg:` 3. TOC appears `xl:` on article pages.
- Touch targets ≥40px; `viewport-fit=cover` with safe-area awareness for notched devices.

## Voice of the UI

Microcopy leans technical-playful ("Block not found", "⬢ interactive", "back to genesis").
Keep it subtle — one wink per screen, never in article prose itself.
