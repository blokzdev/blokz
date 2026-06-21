/**
 * Artifact: the-softmax-constraint-map — The Softmax Constraint Map
 * Manifest: content/artifacts/the-softmax-constraint-map/manifest.json
 *
 * Two horizontal bars per Transformer operation (orange = no lookups,
 * cyan = with lookups) on a log₁₀ x-axis. Clicking a row surfaces the
 * exact counts and reduction ratio in the panel. Uses createArtifactLayout
 * with 'rail' template so the panel sits beside the stage in landscape.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

// ---------------------------------------------------------------------------
// Data (mirrors content/artifacts/the-softmax-constraint-map/data.json)
// ---------------------------------------------------------------------------

interface Operation {
  id: string;
  label: string;
  sublabel: string;
  noLookup: number;
  withLookup: number;
  kind: 'linear' | 'nonlinear';
  note: string;
}

const OPERATIONS: Operation[] = [
  {
    id: 'matmul',
    label: 'MatMul',
    sublabel: 'Linear projection',
    noLookup: 4,
    withLookup: 4,
    kind: 'linear',
    note: 'Native field arithmetic: multiply-accumulate maps directly to constraints (~2 multiplications + additions per output element). This is what ZK circuits do cheaply — no transcendental functions, no lookup benefit.',
  },
  {
    id: 'softmax',
    label: 'Softmax',
    sublabel: 'Attention weights',
    noLookup: 275,
    withLookup: 30,
    kind: 'nonlinear',
    note: 'exp(x)/Σexp has no polynomial form over finite fields. Piecewise polynomial approximation requires 200–350 constraints/element. With LogUp/Lasso, a pre-committed exp() table reduces this to ~20–40 constraints — a 7–14× saving per element.',
  },
  {
    id: 'layernorm',
    label: 'LayerNorm',
    sublabel: 'Layer normalization',
    noLookup: 150,
    withLookup: 20,
    kind: 'nonlinear',
    note: 'Requires 1/√σ (inverse square root) — non-native in finite fields. Newton–Raphson polynomial approximation costs 100–200 constraints/element. Lookup-based range checks bring this to ~15–25 constraints, a ~7× reduction.',
  },
  {
    id: 'gelu',
    label: 'GELU / SiLU',
    sublabel: 'Activation function',
    noLookup: 400,
    withLookup: 40,
    kind: 'nonlinear',
    note: 'GELU uses erf(); SiLU uses sigmoid() — both transcendental. In-circuit polynomial approximation costs 300–500 constraints/element. Lasso sublinear lookups reduce this to 30–50 constraints, a ~10× saving.',
  },
  {
    id: 'other',
    label: 'Other',
    sublabel: 'Bias, residual, add',
    noLookup: 8,
    withLookup: 6,
    kind: 'linear',
    note: 'Residual connections, bias additions, and element-wise adds are native field additions — one gate each. Lookup arguments provide only marginal savings from amortised range checks.',
  },
];

// ---------------------------------------------------------------------------
// Chart geometry
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 800;
const VB_H = 430;

const LOG_MIN = 0; // log10(1)
const LOG_MAX = 3; // log10(1000)
const TICKS = [1, 4, 10, 30, 100, 300, 1000];

const MARGIN_LEFT = 118;
const MARGIN_RIGHT = 28;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 26;
const CHART_W = VB_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VB_H - MARGIN_TOP - MARGIN_BOTTOM;

const GROUP_GAP = 18;
const BAR_GAP = 4;
const N_ROWS = OPERATIONS.length;
const GROUP_H = (CHART_H - GROUP_GAP * (N_ROWS - 1)) / N_ROWS;
const BAR_H = (GROUP_H - BAR_GAP) / 2;

const COL_NO_LOOKUP = '#f97316';
const COL_LOOKUP = '#22d3ee';
const COL_GRID = '#334155';
const COL_TICK = '#64748b';
const COL_BG = '#0f172a';
const COL_SELECT = '#1e2d45';
const COL_RATIO = '#a78bfa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logX(v: number): number {
  return MARGIN_LEFT + ((Math.log10(Math.max(v, 1)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * CHART_W;
}

function rowY(i: number): number {
  return MARGIN_TOP + i * (GROUP_H + GROUP_GAP);
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VB_W}/${VB_H}`,
    stageFr: '1.7fr',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .scm-svg { width: 100%; height: 100%; display: block; }
    .scm-row { cursor: pointer; }
    .scm-row:focus-visible { outline: 2px solid ${COL_LOOKUP}; outline-offset: 2px; }
    .scm-panel {
      font-size: 12px; color: #94a3b8;
      display: flex; flex-direction: column; gap: 10px;
      padding: 4px 0; min-width: 0;
    }
    .scm-op-name { font-size: 14px; font-weight: 700; color: #e2e8f0; }
    .scm-op-sub  { font-size: 11px; color: #64748b; margin-top: 2px; }
    .scm-stat-row {
      display: grid; grid-template-columns: auto 1fr;
      gap: 3px 10px; align-items: baseline;
    }
    .scm-stat-key { color: #64748b; white-space: nowrap; }
    .scm-stat-val {
      font-variant-numeric: tabular-nums; font-weight: 600;
      color: #e2e8f0; text-align: right;
    }
    .scm-stat-val.scm-before { color: ${COL_NO_LOOKUP}; }
    .scm-stat-val.scm-after  { color: ${COL_LOOKUP}; }
    .scm-stat-val.scm-ratio  { color: ${COL_RATIO}; }
    .scm-note   { font-size: 11px; color: #64748b; line-height: 1.6; }
    .scm-prompt { font-size: 11px; color: #475569; font-style: italic; }
    .scm-legend { display: flex; gap: 14px; flex-wrap: wrap; padding: 2px 0; }
    .scm-leg    { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #64748b; }
    .scm-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  `;
  document.head.appendChild(style);

  // ---- SVG ----
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('scm-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Constraint cost per Transformer operation — without and with lookup arguments');
  stage.appendChild(svg);

  // ---- State ----
  let selectedId = OPERATIONS[1].id; // default: Softmax

  // ---- Controls ----
  controls.innerHTML = `<div style="font-size:11px;color:#475569;padding:2px 0;">
    Tap any row to inspect · constraints per output element (log₁₀ scale)
  </div>`;

  // ---- Panel ----
  const panelDiv = document.createElement('div');
  panelDiv.className = 'scm-panel';
  panel.appendChild(panelDiv);

  // ---- Caption ----
  caption.innerHTML = `
    <div class="scm-legend">
      <span class="scm-leg">
        <span class="scm-swatch" style="background:${COL_NO_LOOKUP}"></span>
        Without lookup arguments
      </span>
      <span class="scm-leg">
        <span class="scm-swatch" style="background:${COL_LOOKUP}"></span>
        With lookup arguments (LogUp / Lasso)
      </span>
    </div>
    <div style="font-size:11px;color:#475569;margin-top:4px;">
      Sources: ZK-DeepSeek arXiv:2511.19902 · ezkl · Haböck 2022/1530 · Setty &amp; Lee 2023/1216 · 2026-06-21
    </div>
  `;

  // ---- Build chart (once) ----
  const rowBgRects: SVGRectElement[] = [];

  function buildChart(): void {
    // Background
    const bg = svgEl('rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(VB_W)); bg.setAttribute('height', String(VB_H));
    bg.setAttribute('fill', COL_BG);
    svg.appendChild(bg);

    // Grid lines and tick labels
    const gridG = svgEl('g');
    TICKS.forEach((t) => {
      const x = logX(t);

      const line = svgEl('line');
      line.setAttribute('x1', String(x)); line.setAttribute('y1', String(MARGIN_TOP - 8));
      line.setAttribute('x2', String(x)); line.setAttribute('y2', String(MARGIN_TOP + CHART_H));
      line.setAttribute('stroke', COL_GRID);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '3 4');
      gridG.appendChild(line);

      const lbl = svgEl('text');
      lbl.setAttribute('x', String(x));
      lbl.setAttribute('y', String(MARGIN_TOP - 12));
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', COL_TICK);
      lbl.setAttribute('font-family', 'ui-monospace,monospace');
      lbl.textContent = t >= 1000 ? '1k' : String(t);
      gridG.appendChild(lbl);
    });
    svg.appendChild(gridG);

    // X-axis label
    const axLbl = svgEl('text');
    axLbl.setAttribute('x', String(MARGIN_LEFT + CHART_W / 2));
    axLbl.setAttribute('y', String(VB_H - 6));
    axLbl.setAttribute('text-anchor', 'middle');
    axLbl.setAttribute('font-size', '10');
    axLbl.setAttribute('fill', COL_TICK);
    axLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    axLbl.textContent = 'Constraints per output element (log₁₀ scale)';
    svg.appendChild(axLbl);

    // Operation rows
    OPERATIONS.forEach((op, i) => {
      const gy = rowY(i);
      const g = svgEl('g');
      g.classList.add('scm-row');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Inspect ${op.label}: ${op.noLookup} vs ${op.withLookup} constraints`);
      g.addEventListener('click', () => { selectedId = op.id; render(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { selectedId = op.id; render(); e.preventDefault(); }
      });

      // Selection background
      const bgR = svgEl('rect');
      bgR.setAttribute('x', '0');   bgR.setAttribute('y', String(gy - 6));
      bgR.setAttribute('width', String(VB_W)); bgR.setAttribute('height', String(GROUP_H + 12));
      bgR.setAttribute('fill', 'transparent'); bgR.setAttribute('rx', '4');
      g.appendChild(bgR);
      rowBgRects.push(bgR);

      // Operation name label
      const nameLbl = svgEl('text');
      nameLbl.setAttribute('x', String(MARGIN_LEFT - 8));
      nameLbl.setAttribute('y', String(gy + GROUP_H / 2 - 5));
      nameLbl.setAttribute('text-anchor', 'end');
      nameLbl.setAttribute('dominant-baseline', 'middle');
      nameLbl.setAttribute('font-size', '12');
      nameLbl.setAttribute('font-weight', '600');
      nameLbl.setAttribute('fill', op.kind === 'nonlinear' ? '#fca5a5' : '#94a3b8');
      nameLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      nameLbl.textContent = op.label;
      g.appendChild(nameLbl);

      const subLbl = svgEl('text');
      subLbl.setAttribute('x', String(MARGIN_LEFT - 8));
      subLbl.setAttribute('y', String(gy + GROUP_H / 2 + 9));
      subLbl.setAttribute('text-anchor', 'end');
      subLbl.setAttribute('dominant-baseline', 'middle');
      subLbl.setAttribute('font-size', '9');
      subLbl.setAttribute('fill', '#475569');
      subLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      subLbl.textContent = op.sublabel;
      g.appendChild(subLbl);

      const x1 = logX(1);

      // Orange bar: without lookup
      const noX2 = logX(op.noLookup);
      const barNo = svgEl('rect');
      barNo.setAttribute('x', String(x1));
      barNo.setAttribute('y', String(gy));
      barNo.setAttribute('width', String(Math.max(3, noX2 - x1)));
      barNo.setAttribute('height', String(BAR_H));
      barNo.setAttribute('fill', COL_NO_LOOKUP);
      barNo.setAttribute('rx', '2');
      g.appendChild(barNo);

      const noValLbl = svgEl('text');
      noValLbl.setAttribute('y', String(gy + BAR_H / 2));
      noValLbl.setAttribute('dominant-baseline', 'middle');
      noValLbl.setAttribute('font-size', '10');
      noValLbl.setAttribute('font-weight', '600');
      noValLbl.setAttribute('font-family', 'ui-monospace,monospace');
      if (noX2 - x1 > 32) {
        noValLbl.setAttribute('x', String(noX2 - 4));
        noValLbl.setAttribute('text-anchor', 'end');
        noValLbl.setAttribute('fill', '#0f172a');
      } else {
        noValLbl.setAttribute('x', String(noX2 + 4));
        noValLbl.setAttribute('text-anchor', 'start');
        noValLbl.setAttribute('fill', COL_NO_LOOKUP);
      }
      noValLbl.textContent = String(op.noLookup);
      g.appendChild(noValLbl);

      // Cyan bar: with lookup
      const luX2 = logX(op.withLookup);
      const barLu = svgEl('rect');
      barLu.setAttribute('x', String(x1));
      barLu.setAttribute('y', String(gy + BAR_H + BAR_GAP));
      barLu.setAttribute('width', String(Math.max(3, luX2 - x1)));
      barLu.setAttribute('height', String(BAR_H));
      barLu.setAttribute('fill', COL_LOOKUP);
      barLu.setAttribute('rx', '2');
      g.appendChild(barLu);

      const luValLbl = svgEl('text');
      luValLbl.setAttribute('y', String(gy + BAR_H + BAR_GAP + BAR_H / 2));
      luValLbl.setAttribute('dominant-baseline', 'middle');
      luValLbl.setAttribute('font-size', '10');
      luValLbl.setAttribute('font-weight', '600');
      luValLbl.setAttribute('font-family', 'ui-monospace,monospace');
      if (luX2 - x1 > 32) {
        luValLbl.setAttribute('x', String(luX2 - 4));
        luValLbl.setAttribute('text-anchor', 'end');
        luValLbl.setAttribute('fill', '#0f172a');
      } else {
        luValLbl.setAttribute('x', String(luX2 + 4));
        luValLbl.setAttribute('text-anchor', 'start');
        luValLbl.setAttribute('fill', COL_LOOKUP);
      }
      luValLbl.textContent = String(op.withLookup);
      g.appendChild(luValLbl);

      svg.appendChild(g);
    });
  }

  function render(): void {
    OPERATIONS.forEach((op, i) => {
      rowBgRects[i].setAttribute('fill', op.id === selectedId ? COL_SELECT : 'transparent');
    });

    const op = OPERATIONS.find((o) => o.id === selectedId) ?? OPERATIONS[1];
    const ratio = op.noLookup / op.withLookup;
    const ratioStr = ratio >= 10 ? `${ratio.toFixed(0)}×` : `${ratio.toFixed(1)}×`;
    const reductionStr = op.kind === 'linear'
      ? 'none—native arithmetic'
      : `${ratioStr} fewer constraints`;

    panelDiv.innerHTML = `
      <div>
        <div class="scm-op-name">${op.label}</div>
        <div class="scm-op-sub">${op.sublabel}</div>
      </div>
      <div class="scm-stat-row">
        <span class="scm-stat-key">Without lookups</span>
        <span class="scm-stat-val scm-before">${op.noLookup}&thinsp;constraints/elem</span>
        <span class="scm-stat-key">With lookups</span>
        <span class="scm-stat-val scm-after">${op.withLookup}&thinsp;constraints/elem</span>
        <span class="scm-stat-key">Reduction</span>
        <span class="scm-stat-val scm-ratio">${reductionStr}</span>
      </div>
      <div class="scm-note">${op.note}</div>
      <div class="scm-prompt">Tap another row to compare</div>
    `;
  }

  buildChart();
  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
