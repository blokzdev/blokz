/**
 * Shared responsive layout primitive for multi-region artifacts.
 *
 * Most dom/svg artifacts are a composition of the same few regions: a primary
 * visualization, a secondary readout, some controls, and a provenance line.
 * Historically each one hand-rolled its own grid plus a private `*-narrow`
 * ResizeObserver breakpoint — duplicated, inconsistent, and the reason inline
 * embeds collided on portrait phones.
 *
 * `createArtifactLayout()` owns that skeleton once. An artifact mounts its
 * pieces into four named slots and the primitive arranges them by orientation:
 *
 *   landscape (wide)            portrait (stacked)
 *   ┌────────┬────────┐         ┌────────────────┐
 *   │        │ panel  │         │     stage      │
 *   │ stage  ├────────┤         ├────────────────┤
 *   │        │controls│         │     panel      │
 *   ├────────┴────────┤         ├────────────────┤
 *   │     caption     │         │   controls     │
 *   └─────────────────┘         ├────────────────┤
 *                               │    caption     │
 *                               └────────────────┘
 *
 * Orientation is decided with a single ResizeObserver (not CSS container
 * queries: `container-type:size` collapses the content-driven height the
 * inline "grow to fit portrait" model depends on):
 *   • inline (flow) mode  → width only (≥ `wideAt` ⇒ wide); height is
 *     content-driven, so reading it would feed back into the layout.
 *   • fullscreen (fill) mode → aspect (width > height ⇒ wide); both
 *     dimensions are real, so rotating the device flips the layout.
 * Fill mode is detected via an ancestor `.artifact-fs` (the fullscreen host).
 *
 * The skeleton stylesheet is injected once and shared across every embed on
 * the page. Each artifact still ships its own <style> for its internal visuals
 * but no longer needs any reflow CSS.
 */

const STYLE_ID = 'artifact-layout-styles';

const SKELETON = `
.afl-root { position: relative; width: 100%; min-height: 100%; }
.artifact-fs .afl-root { position: absolute; inset: 0; }
.afl-grid {
  display: grid; gap: 12px; min-height: 0;
  padding: clamp(13px, 3.4vw, 18px); box-sizing: border-box;
  grid-template-columns: 1fr;
  grid-template-areas: "stage" "panel" "controls" "caption";
}
.afl-grid.is-wide {
  height: 100%;
  grid-template-columns: minmax(0, var(--afl-stage-fr, 1.6fr)) minmax(190px, 1fr);
  grid-template-rows: minmax(0, 1fr) auto auto;
  grid-template-areas:
    "stage panel"
    "stage controls"
    "caption caption";
}
/* footer variant: controls span full width under [stage | panel] (good when
   controls are a wide row of sliders/buttons rather than a light rail). */
.afl-grid.is-wide.afl-footer {
  grid-template-areas:
    "stage panel"
    "controls controls"
    "caption caption";
}
.afl-stage {
  grid-area: stage; position: relative; min-width: 0; max-width: 100%;
  min-height: var(--afl-stage-min, 140px);
}
/* When an artifact declares a stage aspect, derive the stage height from its
   width instead of a tall fixed floor — short charts get a short stage with no
   dead space. In wide mode align-self:stretch still fills the row beside the panel. */
.afl-grid.afl-aspect .afl-stage { aspect-ratio: var(--afl-stage-aspect); min-height: 0; }
.afl-grid.is-wide .afl-stage { align-self: stretch; }
.afl-panel { grid-area: panel; min-width: 0; max-width: 100%; min-height: 0; }
.afl-controls { grid-area: controls; min-width: 0; max-width: 100%; }
.afl-caption { grid-area: caption; min-width: 0; max-width: 100%; }
.afl-grid > :empty { display: none; }

/* Fullscreen (fill) mode: flow like inline instead of force-fitting the viewport
   height. Otherwise a tall panel/stage overflows its fixed 1fr row and overlaps
   the controls. Rows size to content; the overlay host scrolls if it exceeds the
   screen (see .artifact-fs-stage). The stage centres so it keeps its aspect/min
   height rather than stretching into a tall empty box. */
.afl-grid.afl-fill { height: auto; min-height: 100%; }
.afl-grid.afl-fill.is-wide { grid-template-rows: auto; }
.afl-grid.afl-fill.is-wide .afl-stage { align-self: center; }

/* Hanging-indent bullets, reusable across artifacts. Add 'afl-bullet' to a line
   whose text starts with a marker + space (✓/⚠/✗/•/–) so wrapped lines align
   under the text instead of running back under the marker; group several in
   'afl-bullets' for even spacing. Pairs with the artifact's own colour classes. */
.afl-bullets { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.afl-bullet { padding-left: 1.3em; text-indent: -1.3em; min-width: 0; }

/* Reusable micro-layout utilities (opt in from an artifact's markup):
   • afl-cards  — a card row that DROPS columns when narrow instead of cramming
     cards into a fixed N-up grid. Tune the card min via --afl-card.
   • afl-pill   — an inline badge/chip that never squishes or wraps its glyphs.
   • afl-split  — a header with a label on each side that wraps instead of
     clipping when narrow (children shrink, the right label drops below). */
.afl-cards { display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(min(var(--afl-card, 210px), 100%), 1fr)); }
.afl-pill { display: inline-flex; align-items: center; flex: 0 0 auto; white-space: nowrap;
  border-radius: 5px; padding: 2px 6px; line-height: 1.4; }
.afl-split { display: flex; align-items: baseline; justify-content: space-between;
  gap: 4px 12px; flex-wrap: wrap; min-width: 0; }
.afl-split > * { min-width: 0; }
`;

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SKELETON;
  document.head.appendChild(style);
}

export interface ArtifactLayout {
  /** The flow/fill root appended into the mount container. */
  root: HTMLElement;
  /** Primary visualization (SVG / canvas). Always present. */
  stage: HTMLElement;
  /** Secondary readout: tally, legend, detail panel, scoreboard. */
  panel: HTMLElement;
  /** Inputs: sliders, toggles, tabs, run/reset buttons. */
  controls: HTMLElement;
  /** Provenance / source line / interaction hints (full-width bottom). */
  caption: HTMLElement;
  /** Whether the layout is currently in its wide (landscape) arrangement. */
  isWide(): boolean;
  /** Disconnect the observer and remove the root. Shared stylesheet stays. */
  dispose(): void;
}

export interface LayoutOptions {
  /** Render the panel slot (default true). */
  panel?: boolean;
  /** Render the controls slot (default true). */
  controls?: boolean;
  /** Render the caption slot (default true). */
  caption?: boolean;
  /** Inline width (px) at/above which to switch to the wide layout. */
  wideAt?: number;
  /** CSS min-height for the stage in stacked mode, e.g. "clamp(180px,56vw,420px)". */
  stageMin?: string;
  /**
   * Stage aspect ratio, e.g. "16/6" for a short bar chart or "4/5" for a tall
   * diagram. When set, the stage's height is derived from its width (no tall
   * min-height floor), so the visualization sits snug with no dead space below
   * it. Prefer this over `stageMin` for fixed-shape charts/diagrams.
   */
  stageAspect?: string;
  /** Stage column fraction in wide mode (the `1.6fr` default reads well). */
  stageFr?: string;
  /**
   * Wide-mode arrangement of panel + controls:
   *   'rail'   — both stacked in a right rail beside the stage (default).
   *   'footer' — panel beside the stage; controls span full width below.
   *   'stack'  — never go two-column; slots stay full-width at every width.
   *              Use when the panel doesn't pair with the stage (it would
   *              otherwise leave a big empty column in landscape). Fullscreen
   *              still scrolls.
   * Portrait stacking is identical for 'rail'/'footer'.
   */
  wideTemplate?: 'rail' | 'footer' | 'stack';
  /** Called whenever the wide/narrow arrangement flips (after the class toggles). */
  onLayout?: (wide: boolean) => void;
}

/**
 * Build the responsive skeleton inside `container` and return its slots.
 * Append your visualization into `stage` and the rest into `panel`,
 * `controls`, and `caption`. Call `dispose()` from your cleanup function.
 */
export function createArtifactLayout(
  container: HTMLElement,
  opts: LayoutOptions = {},
): ArtifactLayout {
  ensureStyles();

  const {
    panel: withPanel = true,
    controls: withControls = true,
    caption: withCaption = true,
    wideAt = 620,
    stageMin,
    stageAspect,
    stageFr,
    wideTemplate = 'rail',
    onLayout,
  } = opts;

  const root = document.createElement('div');
  root.className = 'afl-root';
  const grid = document.createElement('div');
  grid.className = wideTemplate === 'footer' ? 'afl-grid afl-footer' : 'afl-grid';
  if (stageAspect) {
    grid.classList.add('afl-aspect');
    grid.style.setProperty('--afl-stage-aspect', stageAspect);
  }
  if (stageMin) grid.style.setProperty('--afl-stage-min', stageMin);
  if (stageFr) grid.style.setProperty('--afl-stage-fr', stageFr);
  root.appendChild(grid);

  const mk = (cls: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = cls;
    grid.appendChild(el);
    return el;
  };
  // Order matters for the stacked template-areas mapping.
  const stage = mk('afl-stage');
  const panel = withPanel ? mk('afl-panel') : document.createElement('div');
  const controls = withControls ? mk('afl-controls') : document.createElement('div');
  const caption = withCaption ? mk('afl-caption') : document.createElement('div');

  container.appendChild(root);

  // Fill mode (fullscreen) reads real height for an aspect decision; flow mode
  // (inline) uses width only to avoid a content-height feedback loop.
  const fill = Boolean(container.closest('.artifact-fs'));
  if (fill) grid.classList.add('afl-fill');
  let wide = false;

  const decide = (w: number, h: number): boolean =>
    wideTemplate === 'stack' ? false : fill ? w > h : w >= wideAt;

  const apply = (w: number, h: number): void => {
    const next = decide(w, h);
    if (next === wide) return;
    wide = next;
    grid.classList.toggle('is-wide', wide);
    onLayout?.(wide);
  };

  const ro = new ResizeObserver(([entry]) => {
    const r = entry?.contentRect;
    if (r) apply(r.width, r.height);
  });
  ro.observe(root);
  // Seed synchronously so the first paint isn't a flash of the wrong layout.
  apply(container.clientWidth || root.clientWidth, container.clientHeight || root.clientHeight);

  return {
    root,
    stage,
    panel,
    controls,
    caption,
    isWide: () => wide,
    dispose() {
      ro.disconnect();
      root.remove();
    },
  };
}
