/**
 * Artifact: the-thinking-ledger — The Thinking Ledger
 * Manifest: content/artifacts/the-thinking-ledger/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

// ---------------------------------------------------------------------------
// Data — mirrors content/artifacts/the-thinking-ledger/data.json
// ---------------------------------------------------------------------------

interface ModelTier {
  id: string;
  label: string;
  sublabel: string;
  kvPerTokenKB: number;
  tasks: Record<string, { thinking: number; output: number }>;
}

interface Difficulty {
  id: string;
  label: string;
  desc: string;
}

interface Scheme {
  id: string;
  label: string;
  thinking: boolean;
  scratchpad: boolean;
  cost: string;
  note: string;
}

const MODELS: ModelTier[] = [
  {
    id: '8b', label: '8B class', sublabel: 'R1-7B / Llama-3-8B', kvPerTokenKB: 128,
    tasks: {
      easy:   { thinking: 1840,  output: 280 },
      medium: { thinking: 8400,  output: 341 },
      hard:   { thinking: 28500, output: 412 },
    },
  },
  {
    id: '32b', label: '32B class', sublabel: 'R1-32B / Qwen-32B', kvPerTokenKB: 256,
    tasks: {
      easy:   { thinking: 3200,  output: 320 },
      medium: { thinking: 15200, output: 445 },
      hard:   { thinking: 42000, output: 530 },
    },
  },
  {
    id: '70b', label: '70B class', sublabel: 'R1-70B / Llama-3-70B', kvPerTokenKB: 320,
    tasks: {
      easy:   { thinking: 4800,  output: 356 },
      medium: { thinking: 21000, output: 521 },
      hard:   { thinking: 58000, output: 680 },
    },
  },
];

const DIFFICULTIES: Difficulty[] = [
  { id: 'easy',   label: 'Easy',          desc: 'Simple Q&A, general knowledge' },
  { id: 'medium', label: 'Medium (AIME)', desc: 'Avg from R1 paper, AIME 2024 benchmark' },
  { id: 'hard',   label: 'Hard',          desc: 'Competition / multi-step reasoning' },
];

const SCHEMES: Scheme[] = [
  {
    id: 'tee-full', label: 'TEE full trace',
    thinking: true,  scratchpad: true,  cost: 'high',
    note: 'Merkle commitment over all thinking tokens; storage scales with trace length',
  },
  {
    id: 'tee-out', label: 'TEE output only',
    thinking: false, scratchpad: false, cost: 'low',
    note: 'Standard deployment — attests answer tokens, reasoning is trusted not proven',
  },
  {
    id: 'optimistic', label: 'Optimistic replay',
    thinking: false, scratchpad: false, cost: 'broken',
    note: 'Stochastic reasoning can\'t be replayed deterministically — dispute game neutralized',
  },
  {
    id: 'zkml', label: 'ZK proof',
    thinking: true,  scratchpad: true,  cost: 'extreme',
    note: 'Proof cost scales linearly with thinking tokens; ~1 000× overhead per 1k tokens',
  },
  {
    id: 'sampling', label: 'Proof-of-sampling',
    thinking: false, scratchpad: false, cost: 'low',
    note: 'Probes output quality only; blind to scratchpad inflation and dark token billing',
  },
];

// ---------------------------------------------------------------------------
// SVG chart constants
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 720;
const VB_H = 300;

// Log scale: min 100 tokens → max 100k tokens
const LOG_MIN = Math.log10(100);
const LOG_MAX = Math.log10(100_000);

const MARGIN_LEFT  = 82;
const MARGIN_RIGHT = 16;
const MARGIN_TOP   = 32;
const MARGIN_BOT   = 28;
const CHART_W = VB_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VB_H - MARGIN_TOP - MARGIN_BOT;

// Per-model group geometry
const N_MODELS    = MODELS.length;
const GROUP_PAD   = 18;
const GROUP_W     = (CHART_W - GROUP_PAD * (N_MODELS - 1)) / N_MODELS;
const BAR_GAP     = 4;
const BAR_W       = (GROUP_W - BAR_GAP) / 2;  // thinking | output side by side

// Design tokens
const C_VOID      = '#05070d';
const C_PANEL_BG  = '#0d1322';
const C_GRID      = 'rgba(124,140,255,.12)';
const C_TICK      = '#64748b';
const C_TEXT      = '#e7eaf3';
const C_MUTED     = '#8d95ad';
const C_THINKING  = '#7c3aed'; // violet — the dark/hidden computation
const C_OUTPUT    = '#22d3ee'; // cyan   — the visible result
const C_ACCENT    = '#5b8cff';
const C_SELECTED  = '#1e2d45';

const TICKS_LOG = [100, 300, 1_000, 3_000, 10_000, 30_000, 100_000];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

function logY(v: number): number {
  const clamped = Math.max(v, 1);
  const t = (Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  // SVG y increases downward; higher token counts → smaller y (top)
  return MARGIN_TOP + CHART_H * (1 - Math.min(Math.max(t, 0), 1));
}

function modelGroupX(i: number): number {
  return MARGIN_LEFT + i * (GROUP_W + GROUP_PAD);
}

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function gbStr(tokens: number, kvKB: number): string {
  const gb = (tokens * kvKB) / (1024 * 1024);
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VB_W}/${VB_H}`,
    stageFr: '1.6fr',
  });
  const { stage, panel, controls, caption } = layout;

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .tl-svg { width:100%; height:100%; display:block; overflow:visible; }

    .tl-controls { display:flex; gap:6px; flex-wrap:wrap; padding:4px 0; }
    .tl-btn {
      font-size:11px; font-weight:600; letter-spacing:.04em;
      border:1.5px solid rgba(124,140,255,.2); border-radius:5px;
      padding:5px 12px; cursor:pointer; background:transparent;
      color:${C_MUTED}; transition:color .15s, background .15s, border-color .15s;
      white-space:nowrap; font-family:ui-sans-serif,sans-serif;
    }
    .tl-btn[aria-pressed="true"] {
      background:#1a2340; border-color:${C_ACCENT}; color:${C_ACCENT};
    }
    .tl-btn:hover { border-color:${C_MUTED}; color:${C_TEXT}; }

    .tl-panel {
      font-size:12px; color:${C_MUTED}; display:flex; flex-direction:column;
      gap:6px; padding:4px 0; min-width:0;
    }
    .tl-panel-title { font-size:11px; font-weight:700; letter-spacing:.08em;
      text-transform:uppercase; color:${C_TICK}; margin-bottom:2px; }
    .tl-scheme-row {
      display:grid; grid-template-columns:auto 1fr; gap:4px 8px;
      align-items:center; padding:5px 6px; border-radius:5px;
      cursor:pointer; transition:background .12s;
    }
    .tl-scheme-row:hover, .tl-scheme-row.tl-sel { background:${C_SELECTED}; }
    .tl-scheme-name { font-size:11px; font-weight:600; color:${C_TEXT}; white-space:nowrap; min-width:0; }
    .tl-scheme-chips { display:flex; gap:4px; flex-wrap:wrap; }
    .tl-chip {
      font-size:9px; font-weight:700; letter-spacing:.06em;
      padding:2px 6px; border-radius:3px; text-transform:uppercase;
      white-space:nowrap; font-family:ui-monospace,monospace;
    }
    .tl-chip-ok   { background:rgba(34,211,238,.15); color:${C_OUTPUT}; }
    .tl-chip-no   { background:rgba(255,80,80,.12);  color:#f87171; }
    .tl-chip-high { background:rgba(124,140,255,.15); color:${C_ACCENT}; }
    .tl-chip-low  { background:rgba(34,255,100,.1); color:#4ade80; }
    .tl-chip-brk  { background:rgba(255,140,0,.12); color:#fb923c; }
    .tl-chip-ext  { background:rgba(139,92,246,.2);  color:#a78bfa; }
    .tl-scheme-note { font-size:10px; color:#475569; line-height:1.5;
      grid-column:1/-1; padding-top:2px; display:none; }
    .tl-scheme-row.tl-sel .tl-scheme-note { display:block; }

    .tl-kv-detail {
      font-size:10px; color:${C_TICK}; margin-top:4px; padding-top:4px;
      border-top:1px solid rgba(124,140,255,.1);
    }
    .tl-kv-row { display:grid; grid-template-columns:1fr auto; gap:2px 8px; }
    .tl-kv-val { font-variant-numeric:tabular-nums; color:${C_TEXT}; text-align:right; font-family:ui-monospace,monospace; }
  `;
  document.head.appendChild(style);

  // ---- State ----
  let activeDiff = 'medium';
  let selectedScheme = 'tee-out';

  // ---- SVG stage ----
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('tl-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The Thinking Ledger: reasoning vs output token breakdown');
  stage.appendChild(svg);

  // ---- Panel ----
  const panelDiv = document.createElement('div');
  panelDiv.className = 'tl-panel';
  panel.appendChild(panelDiv);

  // ---- Controls ----
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'tl-controls';
  const diffBtns: HTMLButtonElement[] = DIFFICULTIES.map((d) => {
    const btn = document.createElement('button');
    btn.className = 'tl-btn';
    btn.textContent = d.label;
    btn.setAttribute('aria-pressed', d.id === activeDiff ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeDiff = d.id;
      diffBtns.forEach((b, i) => b.setAttribute('aria-pressed', DIFFICULTIES[i].id === activeDiff ? 'true' : 'false'));
      render();
    });
    ctrlDiv.appendChild(btn);
    return btn;
  });
  controls.appendChild(ctrlDiv);

  // ---- Caption ----
  caption.innerHTML = `<span style="font-size:10px;color:${C_TICK};">
    Source: DeepSeek-R1 (arXiv:2501.12948) · CoIn (arXiv:2505.13778) · KV cache: Llama-3.1 arch specs
    &nbsp;·&nbsp; Data as of 2026-06-21
  </span>`;

  // ---- SVG static elements ----
  // Background
  const bg = svgEl('rect');
  bg.setAttribute('x','0'); bg.setAttribute('y','0');
  bg.setAttribute('width', String(VB_W)); bg.setAttribute('height', String(VB_H));
  bg.setAttribute('fill', C_VOID);
  svg.appendChild(bg);

  // Axis grid lines + Y tick labels
  const gridG = svgEl('g');
  TICKS_LOG.forEach((v) => {
    const y = logY(v);
    const line = svgEl('line');
    line.setAttribute('x1', String(MARGIN_LEFT)); line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(MARGIN_LEFT + CHART_W)); line.setAttribute('y2', String(y));
    line.setAttribute('stroke', C_GRID);
    line.setAttribute('stroke-width', '1');
    gridG.appendChild(line);

    const lbl = svgEl('text');
    lbl.setAttribute('x', String(MARGIN_LEFT - 6));
    lbl.setAttribute('y', String(y));
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('dominant-baseline', 'middle');
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('fill', C_TICK);
    lbl.setAttribute('font-family', 'ui-monospace,monospace');
    lbl.textContent = fmtK(v);
    gridG.appendChild(lbl);
  });
  svg.appendChild(gridG);

  // Y axis label
  const yLabel = svgEl('text');
  yLabel.setAttribute('x', '12');
  yLabel.setAttribute('y', String(MARGIN_TOP + CHART_H / 2));
  yLabel.setAttribute('text-anchor', 'middle');
  yLabel.setAttribute('dominant-baseline', 'middle');
  yLabel.setAttribute('font-size', '9');
  yLabel.setAttribute('fill', C_TICK);
  yLabel.setAttribute('font-family', 'ui-sans-serif,sans-serif');
  yLabel.setAttribute('transform', `rotate(-90, 12, ${MARGIN_TOP + CHART_H / 2})`);
  yLabel.textContent = 'tokens (log scale)';
  svg.appendChild(yLabel);

  // X axis baseline
  const xBase = svgEl('line');
  xBase.setAttribute('x1', String(MARGIN_LEFT)); xBase.setAttribute('y1', String(MARGIN_TOP + CHART_H));
  xBase.setAttribute('x2', String(MARGIN_LEFT + CHART_W)); xBase.setAttribute('y2', String(MARGIN_TOP + CHART_H));
  xBase.setAttribute('stroke', 'rgba(124,140,255,.2)'); xBase.setAttribute('stroke-width', '1');
  svg.appendChild(xBase);

  // Legend
  const legendG = svgEl('g');
  const legItems = [
    { color: C_THINKING, label: 'Thinking tokens' },
    { color: C_OUTPUT,   label: 'Output tokens' },
  ];
  let legX = MARGIN_LEFT;
  legItems.forEach(({ color, label }) => {
    const swatch = svgEl('rect');
    swatch.setAttribute('x', String(legX)); swatch.setAttribute('y', '6');
    swatch.setAttribute('width', '10'); swatch.setAttribute('height', '10');
    swatch.setAttribute('rx', '2'); swatch.setAttribute('fill', color);
    legendG.appendChild(swatch);
    const lbl = svgEl('text');
    lbl.setAttribute('x', String(legX + 14)); lbl.setAttribute('y', '11');
    lbl.setAttribute('dominant-baseline', 'middle');
    lbl.setAttribute('font-size', '10'); lbl.setAttribute('fill', C_MUTED);
    lbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    lbl.textContent = label;
    legendG.appendChild(lbl);
    legX += label.length * 5.6 + 28;
  });
  svg.appendChild(legendG);

  // Per-model bar groups (dynamic; kept as refs)
  interface BarGroup {
    thinkBar: SVGRectElement;
    outputBar: SVGRectElement;
    thinkLbl: SVGTextElement;
    outputLbl: SVGTextElement;
    ratioLbl: SVGTextElement;
    modelLbl: SVGTextElement;
    subLbl: SVGTextElement;
  }
  const barGroups: BarGroup[] = MODELS.map((m, i) => {
    const gx = modelGroupX(i);
    const g = svgEl('g');

    const thinkBar = svgEl('rect');
    thinkBar.setAttribute('width', String(BAR_W));
    thinkBar.setAttribute('fill', C_THINKING);
    thinkBar.setAttribute('rx', '3');
    thinkBar.setAttribute('opacity', '0.85');
    g.appendChild(thinkBar);

    const outputBar = svgEl('rect');
    outputBar.setAttribute('width', String(BAR_W));
    outputBar.setAttribute('fill', C_OUTPUT);
    outputBar.setAttribute('rx', '3');
    g.appendChild(outputBar);

    const thinkLbl = svgEl('text');
    thinkLbl.setAttribute('font-size', '9');
    thinkLbl.setAttribute('text-anchor', 'middle');
    thinkLbl.setAttribute('fill', '#a78bfa');
    thinkLbl.setAttribute('font-family', 'ui-monospace,monospace');
    g.appendChild(thinkLbl);

    const outputLbl = svgEl('text');
    outputLbl.setAttribute('font-size', '9');
    outputLbl.setAttribute('text-anchor', 'middle');
    outputLbl.setAttribute('fill', C_OUTPUT);
    outputLbl.setAttribute('font-family', 'ui-monospace,monospace');
    g.appendChild(outputLbl);

    const ratioLbl = svgEl('text');
    ratioLbl.setAttribute('font-size', '9.5');
    ratioLbl.setAttribute('text-anchor', 'middle');
    ratioLbl.setAttribute('font-weight', '700');
    ratioLbl.setAttribute('fill', C_THINKING);
    ratioLbl.setAttribute('font-family', 'ui-monospace,monospace');
    g.appendChild(ratioLbl);

    // Model name below axis
    const modelLbl = svgEl('text');
    modelLbl.setAttribute('x', String(gx + GROUP_W / 2));
    modelLbl.setAttribute('y', String(MARGIN_TOP + CHART_H + 12));
    modelLbl.setAttribute('text-anchor', 'middle');
    modelLbl.setAttribute('font-size', '11');
    modelLbl.setAttribute('font-weight', '600');
    modelLbl.setAttribute('fill', C_TEXT);
    modelLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    modelLbl.textContent = m.label;
    g.appendChild(modelLbl);

    const subLbl = svgEl('text');
    subLbl.setAttribute('x', String(gx + GROUP_W / 2));
    subLbl.setAttribute('y', String(MARGIN_TOP + CHART_H + 22));
    subLbl.setAttribute('text-anchor', 'middle');
    subLbl.setAttribute('font-size', '8.5');
    subLbl.setAttribute('fill', C_TICK);
    subLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    subLbl.textContent = m.sublabel;
    g.appendChild(subLbl);

    svg.appendChild(g);
    return { thinkBar, outputBar, thinkLbl, outputLbl, ratioLbl, modelLbl, subLbl };
  });

  // ---- Render ----
  function render(): void {
    MODELS.forEach((m, i) => {
      const gx = modelGroupX(i);
      const { thinking, output } = m.tasks[activeDiff];
      const bg = barGroups[i];

      // Thinking bar (left of the pair)
      const thinkY1 = logY(thinking);
      const thinkY2 = logY(100); // bottom of chart (100 tokens minimum shown)
      const thinkH  = Math.max(2, thinkY2 - thinkY1);
      bg.thinkBar.setAttribute('x', String(gx));
      bg.thinkBar.setAttribute('y', String(thinkY1));
      bg.thinkBar.setAttribute('height', String(thinkH));

      // Output bar (right of the pair)
      const outY1 = logY(output);
      const outY2 = logY(100);
      const outH  = Math.max(2, outY2 - outY1);
      bg.outputBar.setAttribute('x', String(gx + BAR_W + BAR_GAP));
      bg.outputBar.setAttribute('y', String(outY1));
      bg.outputBar.setAttribute('height', String(outH));

      // Token count labels above bars
      const thinkMidX = gx + BAR_W / 2;
      bg.thinkLbl.setAttribute('x', String(thinkMidX));
      bg.thinkLbl.setAttribute('y', String(thinkY1 - 4));
      bg.thinkLbl.textContent = fmtK(thinking);

      const outMidX = gx + BAR_W + BAR_GAP + BAR_W / 2;
      bg.outputLbl.setAttribute('x', String(outMidX));
      bg.outputLbl.setAttribute('y', String(outY1 - 4));
      bg.outputLbl.textContent = fmtK(output);

      // Ratio label between bars, above thinking bar
      const ratio = Math.round(thinking / output);
      bg.ratioLbl.setAttribute('x', String(gx + GROUP_W / 2));
      // Place it slightly above the thinking bar top
      bg.ratioLbl.setAttribute('y', String(Math.max(MARGIN_TOP + 10, thinkY1 + thinkH / 2 + 4)));
      bg.ratioLbl.textContent = `${ratio}:1`;
    });

    // Panel: scheme table
    const diff = DIFFICULTIES.find((d) => d.id === activeDiff)!;

    // Compute KV cache for selected scheme as context
    const schemeHtml = SCHEMES.map((s) => {
      const isSelected = s.id === selectedScheme;
      const thinkChip = s.thinking
        ? `<span class="tl-chip tl-chip-ok">✓ thinking</span>`
        : `<span class="tl-chip tl-chip-no">✗ thinking</span>`;
      const scratchChip = s.scratchpad
        ? `<span class="tl-chip tl-chip-ok">✓ scratchpad</span>`
        : `<span class="tl-chip tl-chip-no">✗ scratchpad</span>`;
      const costClass =
        s.cost === 'low'     ? 'tl-chip-low' :
        s.cost === 'high'    ? 'tl-chip-high' :
        s.cost === 'broken'  ? 'tl-chip-brk' :
        'tl-chip-ext';
      const costChip = `<span class="tl-chip ${costClass}">${s.cost}</span>`;

      return `
        <div class="tl-scheme-row${isSelected ? ' tl-sel' : ''}" data-scheme="${s.id}">
          <span class="tl-scheme-name">${s.label}</span>
          <div class="tl-scheme-chips">${thinkChip}${scratchChip}${costChip}</div>
          <div class="tl-scheme-note">${s.note}</div>
        </div>`;
    }).join('');

    // KV cache details for current difficulty across models
    const kvRows = MODELS.map((m) => {
      const { thinking } = m.tasks[activeDiff];
      const kb = m.kvPerTokenKB;
      return `<div class="tl-kv-row">
        <span>${m.label}</span>
        <span class="tl-kv-val">${gbStr(thinking, kb)} KV</span>
      </div>`;
    }).join('');

    panelDiv.innerHTML = `
      <div class="tl-panel-title">Verification coverage</div>
      ${schemeHtml}
      <div class="tl-kv-detail">
        <div style="color:${C_TICK};font-size:10px;margin-bottom:3px;">Thinking trace KV cache (${diff.label})</div>
        <div class="tl-kv-row" style="font-size:10px;color:${C_TICK};margin-bottom:2px;">
          <span>Model</span><span style="text-align:right">Ephemeral state</span>
        </div>
        ${kvRows}
        <div style="font-size:9px;color:#374151;margin-top:3px;">KV = 2 × heads × dim × layers × BF16</div>
      </div>
    `;

    // Bind click handlers for scheme rows
    panelDiv.querySelectorAll<HTMLElement>('.tl-scheme-row').forEach((row) => {
      row.addEventListener('click', () => {
        selectedScheme = row.dataset.scheme ?? selectedScheme;
        render();
      });
    });
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
