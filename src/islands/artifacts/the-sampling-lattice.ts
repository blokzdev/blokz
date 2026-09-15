/**
 * Artifact: the-sampling-lattice — The Sampling Lattice
 * Manifest: content/artifacts/the-sampling-lattice/manifest.json
 *
 * A coordinate MAP of Data Availability Sampling (DAS) as a modular chain runs
 * it. A block's data is arranged in a k×k square and erasure-coded with a 2D
 * Reed–Solomon code into a 2k×2k lattice — the extra cells are parity. The
 * self-drawn lattice is the basemap; two things live on it:
 *
 *   1. A withholding block an adversarial producer refuses to publish (move it
 *      by tapping the grid or the arrow keys; size it with the W/H sliders).
 *   2. Light-node samples — random cells each node requests before accepting
 *      the block (Run sampling).
 *
 * The reconstruction rule is exact: any row (or column) that still holds ≥ k of
 * its 2k cells rebuilds the whole line, and that cascades. So the only way to
 * make *any* cell unrecoverable is to withhold a block that is ≥ (k+1) wide AND
 * ≥ (k+1) tall — at k=8 that is 81 of 256 cells (31.6%; the ratio → 25% as k
 * grows). A thin strip, however wide, always reconstructs from the perpendicular
 * lines. And once ≥ ~1/4 of the grid is unavailable, a light node sampling a
 * dozen random cells rejects the block with overwhelming probability. There is
 * no withholding that both hides data and evades sampling — that is the whole
 * security argument, drawn.
 *
 * Pure coding-theory / probability construction (no measured data, so no
 * data.json): the cascade is the real 2D-RS recovery relation and the detection
 * odds are 1 − (1 − f)^s exactly. Sources cited in the caption.
 *
 * Layout: shared responsive primitive — stage lattice, panel verdict, footer
 * controls. No hand-rolled reflow.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ── Lattice + geometry ───────────────────────────────────────────────────── */
const K = 8; // original data side (k)
const EXT = 2 * K; // extended lattice side (2k = 16)
const TOTAL = EXT * EXT; // 256 cells
const CELL = 21;
const ML = 24;
const MT = 40;
const MR = 14;
const MB = 16;
const SIDE = EXT * CELL; // 336
const VW = ML + SIDE + MR; // 374
const VH = MT + SIDE + MB; // 392
const X0 = ML;
const Y0 = MT;

const cx = (c: number): number => X0 + c * CELL;
const cy = (r: number): number => Y0 + r * CELL;

/* ── Palette (design tokens) ──────────────────────────────────────────────── */
const GREEN = '#4ade80';
const RED = '#f87171';
const CYAN = '#22d3ee';
const VIOLET = '#8b5cf6';
const ACCENT = '#5b8cff';

interface Preset {
  label: string;
  w: number;
  h: number;
  centre: boolean;
}
const PRESETS: Preset[] = [
  { label: '1 cell', w: 1, h: 1, centre: true },
  { label: '3-col strip · 19%', w: 3, h: EXT, centre: false },
  { label: '8×8 · 25%', w: 8, h: 8, centre: true },
  { label: '9×9 · min hide', w: 9, h: 9, centre: true },
];

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls, caption } = layout;

  /* ── State ──────────────────────────────────────────────────────────────── */
  let bw = 9; // block width in cells
  let bh = 9; // block height in cells
  let bx = 4; // block top-left col
  let by = 4; // block top-left row
  let samples = 12; // samples per light node
  let nodes = 20; // light nodes

  const clampBlock = (): void => {
    bw = Math.max(1, Math.min(EXT, bw));
    bh = Math.max(1, Math.min(EXT, bh));
    bx = Math.max(0, Math.min(EXT - bw, bx));
    by = Math.max(0, Math.min(EXT - bh, by));
  };

  // Recovery relation: iterate the row/column ≥k rule to a fixpoint.
  const avail = new Uint8Array(TOTAL);
  let recoverable = true;
  let hiddenCount = 0;
  const rawRow = new Int16Array(EXT);
  const rawCol = new Int16Array(EXT);

  function recompute(): void {
    avail.fill(1);
    for (let r = by; r < by + bh; r++)
      for (let c = bx; c < bx + bw; c++) avail[r * EXT + c] = 0;

    // Raw (pre-cascade) served counts drive the edge health ticks.
    for (let r = 0; r < EXT; r++) {
      let n = 0;
      for (let c = 0; c < EXT; c++) n += avail[r * EXT + c];
      rawRow[r] = n;
    }
    for (let c = 0; c < EXT; c++) {
      let n = 0;
      for (let r = 0; r < EXT; r++) n += avail[r * EXT + c];
      rawCol[c] = n;
    }

    // Cascade: a line with ≥K available rebuilds fully; repeat to fixpoint.
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < EXT; r++) {
        let n = 0;
        for (let c = 0; c < EXT; c++) n += avail[r * EXT + c];
        if (n >= K && n < EXT) {
          for (let c = 0; c < EXT; c++)
            if (!avail[r * EXT + c]) {
              avail[r * EXT + c] = 1;
              changed = true;
            }
        }
      }
      for (let c = 0; c < EXT; c++) {
        let n = 0;
        for (let r = 0; r < EXT; r++) n += avail[r * EXT + c];
        if (n >= K && n < EXT) {
          for (let r = 0; r < EXT; r++)
            if (!avail[r * EXT + c]) {
              avail[r * EXT + c] = 1;
              changed = true;
            }
        }
      }
    }

    hiddenCount = 0;
    for (let i = 0; i < TOTAL; i++) if (!avail[i]) hiddenCount++;
    recoverable = hiddenCount === 0;
  }

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .sl-stage { display:flex; align-items:center; justify-content:center; }
    .sl-stage svg { width:100%; height:100%; display:block; touch-action:manipulation; outline:none; }
    .sl-stage svg:focus-visible .sl-frame { stroke:${ACCENT}; stroke-opacity:.7; }

    .sl-cell { transition:fill .18s ease, stroke .18s ease; }
    .sl-frame { fill:none; stroke:rgba(124,140,255,.28); stroke-width:1.4; }
    .sl-div { stroke:rgba(124,140,255,.42); stroke-width:1.3; stroke-dasharray:2 3; }
    .sl-block { fill:none; stroke-width:2; stroke-dasharray:5 4; transition:stroke .2s ease; pointer-events:none; }
    .sl-qlbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; }
    .sl-tick { transition:fill .18s ease; }
    .sl-dot { pointer-events:none; }

    .sl-panel { display:flex; flex-direction:column; gap:9px; font:500 11px/1.45 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; }
    .sl-verdict { border-radius:9px; padding:10px 11px; display:flex; flex-direction:column; gap:7px; border:1px solid; transition:border-color .25s, background .25s; }
    .sl-verdict.hidden { border-color:rgba(248,113,113,.34); background:rgba(248,113,113,.07); }
    .sl-verdict.safe { border-color:rgba(74,222,128,.32); background:rgba(74,222,128,.06); }
    .sl-vhd { display:flex; align-items:center; gap:7px; }
    .sl-vdot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
    .sl-vttl { font:700 12px 'JetBrains Mono',monospace; color:#e7eaf3; }
    .sl-vsub { font:500 9px/1.5 'JetBrains Mono',monospace; color:#8d95ad; overflow-wrap:anywhere; }

    .sl-metric { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
    .sl-mlbl { font-size:9.5px; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .sl-mval { font:700 12px 'JetBrains Mono',monospace; color:#e7eaf3; white-space:nowrap; }
    .sl-mval.good { color:#6ee7b7; }
    .sl-mval.bad { color:${RED}; }
    .sl-mval.cyan { color:${CYAN}; }
    .sl-rule { height:1px; background:rgba(124,140,255,.1); }
    .sl-run-out { font:500 9.5px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-height:1.5em; overflow-wrap:anywhere; }
    .sl-run-out b { color:#cdd3e3; font-weight:700; }

    .sl-ctls { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%; }
    .sl-sliders { display:grid; gap:9px 16px; grid-template-columns:repeat(auto-fit, minmax(min(180px,100%), 1fr)); min-width:0; }
    .sl-sl { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .sl-sl-hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .sl-sl-lbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .sl-sl-val { font:700 10px 'JetBrains Mono',monospace; color:#e7eaf3; white-space:nowrap; }
    .sl-range { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:3px; background:rgba(124,140,255,.18); outline:none; cursor:pointer; }
    .sl-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; border-radius:50%; background:${ACCENT}; border:2px solid #0d1322; box-shadow:0 0 5px rgba(91,140,255,.6); cursor:pointer; }
    .sl-range::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:${ACCENT}; border:2px solid #0d1322; box-shadow:0 0 5px rgba(91,140,255,.6); cursor:pointer; }
    .sl-range.samp::-webkit-slider-thumb { background:${CYAN}; box-shadow:0 0 5px rgba(34,211,238,.6); }
    .sl-range.samp::-moz-range-thumb { background:${CYAN}; box-shadow:0 0 5px rgba(34,211,238,.6); }

    .sl-btnrow { display:flex; flex-wrap:wrap; gap:6px; align-items:center; min-width:0; max-width:100%; }
    .sl-run { display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(34,211,238,.5); background:rgba(34,211,238,.1); color:#a5f0fb; border-radius:7px; cursor:pointer; font:700 9.5px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase; padding:6px 12px; white-space:nowrap; transition:.16s; flex:0 0 auto; }
    .sl-run:hover:not(:disabled) { background:rgba(34,211,238,.18); color:#c9f6ff; }
    .sl-run:disabled { opacity:.5; cursor:default; }
    .sl-chip { border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer; background:#0d1322; color:#8d95ad; font:600 9px 'JetBrains Mono',monospace; letter-spacing:.02em; padding:5px 9px; white-space:nowrap; transition:.16s; flex:0 0 auto; }
    .sl-chip:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .sl-chip.on { color:#e7eaf3; border-color:rgba(91,140,255,.55); background:rgba(91,140,255,.12); }
    .sl-chips-lbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; margin-right:2px; align-self:center; }

    .sl-legend { display:flex; flex-wrap:wrap; gap:4px 12px; min-width:0; }
    .sl-leg { display:flex; align-items:center; gap:5px; font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .sl-lsw { width:9px; height:9px; border-radius:2px; flex:0 0 auto; border:1px solid rgba(124,140,255,.2); }

    .sl-cap { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .sl-cap b { color:#8d95ad; font-weight:600; }
  `;
  container.appendChild(style);
  stage.classList.add('sl-stage');

  /* ── SVG lattice ────────────────────────────────────────────────────────── */
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    tabindex: '0',
    'aria-label':
      'A 16×16 erasure-coded lattice. Original data fills the top-left 8×8; the rest is 2D Reed–Solomon parity. A dashed block marks cells an adversary withholds. Tap the grid or use arrow keys to move it; adjust its width and height to see whether the data can still be reconstructed.',
  });

  // Frame
  svg.appendChild(
    svgEl('rect', {
      x: String(X0),
      y: String(Y0),
      width: String(SIDE),
      height: String(SIDE),
      class: 'sl-frame',
    }),
  );

  // Cells
  const cellEls: SVGRectElement[] = new Array(TOTAL);
  for (let r = 0; r < EXT; r++) {
    for (let c = 0; c < EXT; c++) {
      const rect = svgEl('rect', {
        x: String(cx(c) + 0.6),
        y: String(cy(r) + 0.6),
        width: String(CELL - 1.2),
        height: String(CELL - 1.2),
        rx: '1.5',
        class: 'sl-cell',
      });
      cellEls[r * EXT + c] = rect;
      svg.appendChild(rect);
    }
  }

  // k-boundary divider (between the original-data quadrant and parity)
  svg.appendChild(
    svgEl('line', {
      x1: String(cx(K)),
      y1: String(Y0),
      x2: String(cx(K)),
      y2: String(Y0 + SIDE),
      class: 'sl-div',
    }),
  );
  svg.appendChild(
    svgEl('line', {
      x1: String(X0),
      y1: String(cy(K)),
      x2: String(X0 + SIDE),
      y2: String(cy(K)),
      class: 'sl-div',
    }),
  );

  // Quadrant labels
  const dataLbl = svgEl('text', {
    x: String(X0),
    y: String(Y0 - 22),
    class: 'sl-qlbl',
  });
  dataLbl.setAttribute('fill', ACCENT);
  dataLbl.textContent = 'original data · k×k';
  svg.appendChild(dataLbl);

  const parityLbl = svgEl('text', {
    x: String(X0 + SIDE),
    y: String(Y0 - 22),
    class: 'sl-qlbl',
    'text-anchor': 'end',
  });
  parityLbl.setAttribute('fill', VIOLET);
  parityLbl.textContent = 'parity · 2D reed–solomon';
  svg.appendChild(parityLbl);

  const hint = svgEl('text', {
    x: String(X0),
    y: String(Y0 - 8),
    class: 'sl-qlbl',
  });
  hint.setAttribute('fill', '#5b6378');
  hint.setAttribute('font-weight', '500');
  hint.textContent = 'tap / arrow-keys to move · W·H to resize';
  svg.appendChild(hint);

  // Edge health ticks (raw ≥k per row/col)
  const rowTicks: SVGRectElement[] = new Array(EXT);
  const colTicks: SVGRectElement[] = new Array(EXT);
  for (let r = 0; r < EXT; r++) {
    const t = svgEl('rect', {
      x: String(X0 - 6),
      y: String(cy(r) + 3),
      width: '3',
      height: String(CELL - 6),
      rx: '1.5',
      class: 'sl-tick',
    });
    rowTicks[r] = t;
    svg.appendChild(t);
  }
  for (let c = 0; c < EXT; c++) {
    const t = svgEl('rect', {
      x: String(cx(c) + 3),
      y: String(Y0 - 6),
      width: String(CELL - 6),
      height: '3',
      rx: '1.5',
      class: 'sl-tick',
    });
    colTicks[c] = t;
    svg.appendChild(t);
  }

  // Sample-dot + block layers on top
  const dotLayer = svgEl('g', { class: 'sl-dotlayer' });
  svg.appendChild(dotLayer);
  const blockOutline = svgEl('rect', { class: 'sl-block', rx: '2' });
  svg.appendChild(blockOutline);

  stage.appendChild(svg);

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  panel.className = 'sl-panel';
  const verdict = document.createElement('div');
  verdict.className = 'sl-verdict';
  const vHd = document.createElement('div');
  vHd.className = 'sl-vhd';
  const vDot = document.createElement('span');
  vDot.className = 'sl-vdot';
  const vTtl = document.createElement('span');
  vTtl.className = 'sl-vttl';
  vHd.append(vDot, vTtl);
  const vSub = document.createElement('div');
  vSub.className = 'sl-vsub';
  verdict.append(vHd, vSub);
  panel.appendChild(verdict);

  const mkMetric = (): { row: HTMLElement; lbl: HTMLElement; val: HTMLElement } => {
    const row = document.createElement('div');
    row.className = 'sl-metric';
    const lbl = document.createElement('span');
    lbl.className = 'sl-mlbl';
    const val = document.createElement('span');
    val.className = 'sl-mval';
    row.append(lbl, val);
    return { row, lbl, val };
  };
  const mWith = mkMetric();
  const mReject = mkMetric();
  const mNet = mkMetric();
  panel.append(mWith.row, mReject.row, mNet.row);

  panel.appendChild(Object.assign(document.createElement('div'), { className: 'sl-rule' }));
  const runOut = document.createElement('div');
  runOut.className = 'sl-run-out';
  runOut.innerHTML = 'Press <b>Run sampling</b> to send each light node’s random cell requests.';
  panel.appendChild(runOut);

  /* ── Controls ───────────────────────────────────────────────────────────── */
  const ctls = document.createElement('div');
  ctls.className = 'sl-ctls';

  const sliders = document.createElement('div');
  sliders.className = 'sl-sliders';

  interface Slider {
    wrap: HTMLElement;
    input: HTMLInputElement;
    val: HTMLElement;
  }
  const mkSlider = (
    label: string,
    min: number,
    max: number,
    value: number,
    samp = false,
  ): Slider => {
    const wrap = document.createElement('div');
    wrap.className = 'sl-sl';
    const hd = document.createElement('div');
    hd.className = 'sl-sl-hd';
    const lbl = document.createElement('span');
    lbl.className = 'sl-sl-lbl';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'sl-sl-val';
    hd.append(lbl, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'sl-range' + (samp ? ' samp' : '');
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(value);
    wrap.append(hd, input);
    return { wrap, input, val };
  };

  const sW = mkSlider('withhold width', 1, EXT, bw);
  const sH = mkSlider('withhold height', 1, EXT, bh);
  const sS = mkSlider('samples / node', 1, 24, samples, true);
  const sN = mkSlider('light nodes', 1, 64, nodes, true);
  sliders.append(sW.wrap, sH.wrap, sS.wrap, sN.wrap);
  ctls.appendChild(sliders);

  const btnRow = document.createElement('div');
  btnRow.className = 'sl-btnrow';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'sl-run';
  runBtn.textContent = '▶ Run sampling';
  btnRow.appendChild(runBtn);

  const chipsLbl = document.createElement('span');
  chipsLbl.className = 'sl-chips-lbl';
  chipsLbl.textContent = 'presets';
  btnRow.appendChild(chipsLbl);

  const chipEls: HTMLButtonElement[] = [];
  PRESETS.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'sl-chip';
    chip.textContent = p.label;
    chip.dataset.i = String(i);
    btnRow.appendChild(chip);
    chipEls.push(chip);
  });
  ctls.appendChild(btnRow);

  const legend = document.createElement('div');
  legend.className = 'sl-legend';
  const legItems: Array<[string, string]> = [
    [ACCENT, 'data'],
    [VIOLET, 'parity'],
    [RED, 'withheld / hidden'],
    [GREEN, 'reconstructed'],
    [CYAN, 'sample served'],
  ];
  for (const [color, label] of legItems) {
    const it = document.createElement('span');
    it.className = 'sl-leg';
    const sw = document.createElement('span');
    sw.className = 'sl-lsw';
    sw.style.background = color;
    sw.style.borderColor = color;
    it.append(sw, document.createTextNode(label));
    legend.appendChild(it);
  }
  ctls.appendChild(legend);
  controls.appendChild(ctls);

  /* ── Caption ────────────────────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'sl-cap';
  cap.innerHTML =
    'A 2D Reed–Solomon lattice (k=8) — the DAS scheme behind <b>Celestia</b> light clients and Ethereum’s danksharding roadmap. Recovery + detection are computed exactly, not measured. Sources: <b>Celestia — Data Availability Sampling</b>, <b>EIP-4844</b>, and the article above.';
  caption.appendChild(cap);

  /* ── Rendering ──────────────────────────────────────────────────────────── */
  function fmtPct(p: number, d = 1): string {
    if (p > 0 && p < 0.1) return '<0.1%';
    if (p < 100 && p > 99.9) return '>99.9%';
    return `${p.toFixed(d)}%`;
  }

  function paintCells(): void {
    for (let r = 0; r < EXT; r++) {
      for (let c = 0; c < EXT; c++) {
        const i = r * EXT + c;
        const inBlock = r >= by && r < by + bh && c >= bx && c < bx + bw;
        const rect = cellEls[i];
        let fill: string;
        let stroke: string;
        if (inBlock && avail[i] === 0) {
          // withheld and permanently unrecoverable
          fill = 'rgba(248,113,113,.30)';
          stroke = 'rgba(248,113,113,.75)';
        } else if (inBlock) {
          // withheld but reconstructable from parity
          fill = 'rgba(74,222,128,.24)';
          stroke = 'rgba(74,222,128,.6)';
        } else if (r < K && c < K) {
          fill = 'rgba(91,140,255,.10)';
          stroke = 'rgba(124,140,255,.16)';
        } else {
          fill = 'rgba(139,92,246,.05)';
          stroke = 'rgba(124,140,255,.10)';
        }
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', stroke);
      }
    }
    for (let r = 0; r < EXT; r++)
      rowTicks[r].setAttribute('fill', rawRow[r] >= K ? 'rgba(74,222,128,.7)' : RED);
    for (let c = 0; c < EXT; c++)
      colTicks[c].setAttribute('fill', rawCol[c] >= K ? 'rgba(74,222,128,.7)' : RED);

    blockOutline.setAttribute('x', String(cx(bx) + 0.6));
    blockOutline.setAttribute('y', String(cy(by) + 0.6));
    blockOutline.setAttribute('width', String(bw * CELL - 1.2));
    blockOutline.setAttribute('height', String(bh * CELL - 1.2));
    blockOutline.setAttribute('stroke', recoverable ? GREEN : RED);
  }

  function renderPanel(): void {
    const f = hiddenCount / TOTAL;
    const withhold = bw * bh;
    const withPct = (withhold / TOTAL) * 100;

    verdict.classList.toggle('hidden', !recoverable);
    verdict.classList.toggle('safe', recoverable);
    vDot.style.background = recoverable ? GREEN : RED;
    vDot.style.boxShadow = `0 0 6px ${recoverable ? GREEN : RED}`;
    vTtl.style.color = recoverable ? '#6ee7b7' : RED;
    if (recoverable) {
      vTtl.textContent = 'Data recoverable';
      vSub.textContent =
        withhold > 1
          ? 'Every withheld cell sits in a row or column that still holds ≥ k cells — parity rebuilds it. The producer hid nothing.'
          : 'A single cell is trivially rebuilt from its row. The producer hid nothing.';
    } else {
      vTtl.textContent = 'Data unrecoverable';
      vSub.textContent = `${hiddenCount} cells lie in ${bw}×${bh} — every affected row and column is below k, so no line can rebuild them. The producer has hidden real data.`;
    }

    mWith.lbl.textContent = 'Withheld block';
    mWith.val.textContent = `${bw}×${bh} = ${withhold} · ${withPct.toFixed(1)}%`;
    mWith.val.className = 'sl-mval';

    const pReject = recoverable ? 0 : 1 - Math.pow(1 - f, samples);
    mReject.lbl.textContent = `P(one node rejects · ${samples} samples)`;
    mReject.val.textContent = recoverable ? '—' : fmtPct(pReject * 100);
    mReject.val.className = 'sl-mval' + (recoverable ? '' : ' cyan');

    const pNet = recoverable ? 0 : 1 - Math.pow(1 - f, samples * nodes);
    mNet.lbl.textContent = `P(≥1 of ${nodes} nodes catches it)`;
    mNet.val.textContent = recoverable ? '—' : fmtPct(pNet * 100, 2);
    mNet.val.className = 'sl-mval' + (recoverable ? '' : ' good');
  }

  function syncChips(): void {
    chipEls.forEach((chip, i) => {
      const p = PRESETS[i];
      chip.classList.toggle('on', p.w === bw && p.h === bh);
    });
  }

  function update(): void {
    clampBlock();
    recompute();
    paintCells();
    renderPanel();
    syncChips();
    sW.input.value = String(bw);
    sH.input.value = String(bh);
    sW.val.textContent = `${bw} cells`;
    sH.val.textContent = `${bh} cells`;
    sS.val.textContent = `${samples}`;
    sN.val.textContent = `${nodes}`;
  }

  /* ── Sampling animation (dt-based) ──────────────────────────────────────── */
  let raf = 0;
  let animStart = 0;
  let animDots: SVGCircleElement[] = [];
  let animMeta: Array<{ reject: boolean }> = [];
  const DURATION = 1250;

  const clearDots = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    for (const d of animDots) d.remove();
    animDots = [];
    animMeta = [];
  };

  function runSampling(): void {
    clearDots();
    // Build every node's random distinct samples; compute rejects.
    let rejectedNodes = 0;
    const dots: SVGCircleElement[] = [];
    const meta: Array<{ reject: boolean }> = [];
    for (let n = 0; n < nodes; n++) {
      const picked = new Set<number>();
      let nodeRejected = false;
      let guard = 0;
      while (picked.size < Math.min(samples, TOTAL) && guard < samples * 8) {
        guard++;
        const idx = (Math.random() * TOTAL) | 0;
        if (picked.has(idx)) continue;
        picked.add(idx);
        const reject = avail[idx] === 0;
        if (reject) nodeRejected = true;
        const r = (idx / EXT) | 0;
        const c = idx % EXT;
        const jx = cx(c) + CELL / 2 + (Math.random() - 0.5) * (CELL * 0.4);
        const jy = cy(r) + CELL / 2 + (Math.random() - 0.5) * (CELL * 0.4);
        const dot = svgEl('circle', {
          cx: String(jx),
          cy: String(jy),
          r: reject ? '3.4' : '2',
          class: 'sl-dot',
          fill: reject ? RED : CYAN,
          opacity: '0',
        });
        if (reject) dot.setAttribute('stroke', RED), dot.setAttribute('stroke-opacity', '0.4');
        dotLayer.appendChild(dot);
        dots.push(dot);
        meta.push({ reject });
      }
      if (nodeRejected) rejectedNodes++;
    }
    animDots = dots;
    animMeta = meta;

    const finalRejected = rejectedNodes;
    const total = dots.length;

    const frame = (t: number): void => {
      if (!animStart) animStart = t;
      const elapsed = t - animStart;
      const prog = Math.min(1, elapsed / DURATION);
      const shown = Math.floor(prog * total);
      for (let i = 0; i < total; i++) {
        animDots[i].setAttribute('opacity', i < shown ? (animMeta[i].reject ? '0.95' : '0.75') : '0');
      }
      if (prog < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        const accepted = nodes - finalRejected;
        if (recoverable) {
          runOut.innerHTML = `All <b>${nodes}</b> nodes were served every sample — block accepted. Available data always answers a sample.`;
        } else {
          runOut.innerHTML = `<b>${finalRejected}/${nodes}</b> nodes hit a withheld cell and rejected the block${
            accepted > 0 ? `; ${accepted} ${accepted === 1 ? 'was' : 'were'} fooled this round` : ''
          }. Re-run — the odds compound.`;
        }
      }
    };
    animStart = 0;
    runOut.innerHTML = 'Sampling…';
    raf = requestAnimationFrame(frame);
  }

  /* ── Interaction ────────────────────────────────────────────────────────── */
  const cellFromEvent = (e: PointerEvent): { r: number; c: number } | null => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const c = Math.floor((p.x - X0) / CELL);
    const r = Math.floor((p.y - Y0) / CELL);
    if (r < 0 || r >= EXT || c < 0 || c >= EXT) return null;
    return { r, c };
  };

  const onPointerDown = (e: PointerEvent): void => {
    const cell = cellFromEvent(e);
    if (!cell) return;
    clearDots();
    bx = cell.c - Math.floor(bw / 2);
    by = cell.r - Math.floor(bh / 2);
    runOut.innerHTML = 'Block moved — <b>Run sampling</b> to test it.';
    update();
    svg.focus();
  };
  svg.addEventListener('pointerdown', onPointerDown);

  const onKey = (e: KeyboardEvent): void => {
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        bx -= 1;
        break;
      case 'ArrowRight':
        bx += 1;
        break;
      case 'ArrowUp':
        by -= 1;
        break;
      case 'ArrowDown':
        by += 1;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      clearDots();
      update();
    }
  };
  svg.addEventListener('keydown', onKey);

  const onW = (): void => {
    bw = parseInt(sW.input.value, 10);
    clearDots();
    runOut.innerHTML = 'Re-run sampling to test the new block.';
    update();
  };
  const onH = (): void => {
    bh = parseInt(sH.input.value, 10);
    clearDots();
    runOut.innerHTML = 'Re-run sampling to test the new block.';
    update();
  };
  const onS = (): void => {
    samples = parseInt(sS.input.value, 10);
    clearDots();
    update();
  };
  const onN = (): void => {
    nodes = parseInt(sN.input.value, 10);
    clearDots();
    update();
  };
  sW.input.addEventListener('input', onW);
  sH.input.addEventListener('input', onH);
  sS.input.addEventListener('input', onS);
  sN.input.addEventListener('input', onN);

  const onRun = (): void => runSampling();
  runBtn.addEventListener('click', onRun);

  const chipHandlers: Array<[HTMLButtonElement, () => void]> = [];
  chipEls.forEach((chip, i) => {
    const h = (): void => {
      const p = PRESETS[i];
      bw = p.w;
      bh = p.h;
      if (p.centre) {
        bx = Math.round((EXT - bw) / 2);
        by = Math.round((EXT - bh) / 2);
      } else {
        by = 0;
        bx = Math.round((EXT - bw) / 2);
      }
      clearDots();
      runOut.innerHTML = 'Preset loaded — <b>Run sampling</b> to test it.';
      update();
    };
    chip.addEventListener('click', h);
    chipHandlers.push([chip, h]);
  });

  /* ── Init ───────────────────────────────────────────────────────────────── */
  update();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    layout.dispose();
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('keydown', onKey);
    sW.input.removeEventListener('input', onW);
    sH.input.removeEventListener('input', onH);
    sS.input.removeEventListener('input', onS);
    sN.input.removeEventListener('input', onN);
    runBtn.removeEventListener('click', onRun);
    for (const [chip, h] of chipHandlers) chip.removeEventListener('click', h);
    style.remove();
  };
}
