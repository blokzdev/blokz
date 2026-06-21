/**
 * Artifact: the-qubit-gap — The Qubit Gap
 * Manifest: content/artifacts/the-qubit-gap/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

// ---------------------------------------------------------------------------
// Data (mirrors content/artifacts/the-qubit-gap/data.json)
// ---------------------------------------------------------------------------

interface HardwareItem {
  id: string;
  vendor: string;
  name: string;
  year: number;
  physicalQubits: number;
  note: string;
}

const HARDWARE: HardwareItem[] = [
  { id: 'sycamore', vendor: 'Google', name: 'Sycamore', year: 2019, physicalQubits: 53,
    note: "Google's 2019 supremacy demonstration: 53 superconducting transmon qubits across a 6×9 grid. Dominant media milestone but not a step toward fault-tolerant computation at cryptographic scale." },
  { id: 'willow', vendor: 'Google', name: 'Willow', year: 2024, physicalQubits: 105,
    note: "Google's December 2024 chip. 105 qubits — but what matters is that it demonstrated below-threshold error correction: as the array scales, logical error rate now decreases rather than accumulates. A critical architectural milestone, not a qubit-count milestone." },
  { id: 'eagle', vendor: 'IBM', name: 'Eagle', year: 2021, physicalQubits: 127,
    note: "IBM's first 100+ qubit chip. Introduced the heavy-hex lattice topology to reduce two-qubit error from cross-coupling. Still far from fault tolerance — every physical qubit carries its own error and they don't cancel." },
  { id: 'heron', vendor: 'IBM', name: 'Heron R2', year: 2024, physicalQubits: 156,
    note: "IBM's current performance flagship. Smaller raw count than Condor but substantially better error rates. IBM has pivoted: the path to useful logical qubits requires fewer, higher-fidelity qubits — not more noisy ones." },
  { id: 'osprey', vendor: 'IBM', name: 'Osprey', year: 2022, physicalQubits: 433,
    note: "IBM's 2022 scale milestone: 433 qubits on a 19×23 heavy-hex grid. Improved cryo-control electronics let IBM scale without proportionally accumulating error. Still nowhere near the 500k threshold." },
  { id: 'condor', vendor: 'IBM', name: 'Condor', year: 2023, physicalQubits: 1121,
    note: "IBM's largest chip by raw qubit count: 1,121 physical qubits. It is also the closest any publicly disclosed quantum system has come to the secp256k1 break threshold — and it is still 446× short. IBM has since pivoted to smaller, higher-fidelity designs." },
];

const BREAK_THRESHOLD = 500_000;

// ---------------------------------------------------------------------------
// Chart constants
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 800;
const VB_H = 340;

// Log scale: 40 to 2M (gives room to show Sycamore's 53 and headroom past threshold)
const LOG_MIN = Math.log10(40);
const LOG_MAX = Math.log10(2_000_000);

// Grid ticks (threshold handled separately as amber dashed line)
const TICKS = [100, 1_000, 10_000, 100_000, 1_000_000];

const MARGIN_LEFT = 120;
const MARGIN_RIGHT = 36;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 30;
const CHART_W = VB_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VB_H - MARGIN_TOP - MARGIN_BOTTOM;

const ROW_GAP = 10;
const N_ROWS = HARDWARE.length;
const BAR_H = (CHART_H - ROW_GAP * (N_ROWS - 1)) / N_ROWS;

// Colours
const COL_GOOGLE    = '#22d3ee';  // cyan
const COL_IBM       = '#4d6bd6';  // indigo
const COL_THRESHOLD = '#f59e0b';  // amber
const COL_GRID      = '#334155';  // slate-700
const COL_TICK      = '#64748b';  // slate-500
const COL_SELECT    = '#f1f5f9';  // near-white

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function logX(v: number): number {
  return MARGIN_LEFT + ((Math.log10(Math.max(v, 40)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * CHART_W;
}

function rowY(i: number): number {
  return MARGIN_TOP + i * (BAR_H + ROW_GAP);
}

function vendorColor(vendor: string): string {
  return vendor === 'Google' ? COL_GOOGLE : COL_IBM;
}

function fmtQubits(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function fmtGap(qubits: number): string {
  const ratio = BREAK_THRESHOLD / qubits;
  return ratio >= 1000
    ? `${Math.round(ratio).toLocaleString()}×`
    : `${ratio.toFixed(0)}×`;
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
  const { stage, panel, caption } = layout;

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .qg-svg { width:100%; height:100%; display:block; }
    .qg-row-hit { cursor:pointer; }
    .qg-row-hit:focus-visible { outline:2px solid ${COL_THRESHOLD}; outline-offset:2px; }

    .qg-panel {
      font-size:12px; color:#94a3b8; display:flex; flex-direction:column;
      gap:12px; padding:4px 0; min-width:0;
    }
    .qg-hw-name { font-size:14px; font-weight:700; color:#e2e8f0; }
    .qg-hw-sub  { font-size:11px; color:#64748b; margin-top:2px; }
    .qg-stat-row {
      display:grid; grid-template-columns:auto 1fr; gap:4px 10px; align-items:baseline;
    }
    .qg-stat-key { color:#64748b; white-space:nowrap; }
    .qg-stat-val {
      font-variant-numeric:tabular-nums; font-weight:600; color:#e2e8f0; text-align:right;
    }
    .qg-stat-val.qg-gap  { color:${COL_THRESHOLD}; }
    .qg-note   { font-size:11px; color:#64748b; line-height:1.6; }
    .qg-prompt { font-size:11px; color:#475569; font-style:italic; }

    .qg-legend { display:flex; gap:12px; flex-wrap:wrap; padding:2px 0; }
    .qg-leg-item {
      display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b;
    }
    .qg-leg-swatch { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
  `;
  document.head.appendChild(style);

  // ---- SVG stage ----
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('qg-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The Qubit Gap: physical qubit counts vs 500k break threshold');
  stage.appendChild(svg);

  // ---- State ----
  let selectedId: string = HARDWARE[HARDWARE.length - 1].id; // default: Condor

  // ---- Panel ----
  const panelDiv = document.createElement('div');
  panelDiv.className = 'qg-panel';
  panel.appendChild(panelDiv);

  // ---- Caption ----
  caption.innerHTML = `
    <div class="qg-legend">
      <span class="qg-leg-item">
        <span class="qg-leg-swatch" style="background:${COL_GOOGLE}"></span>Google
      </span>
      <span class="qg-leg-item">
        <span class="qg-leg-swatch" style="background:${COL_IBM}"></span>IBM
      </span>
      <span class="qg-leg-item">
        <span class="qg-leg-swatch" style="background:transparent; border-top:2px dashed ${COL_THRESHOLD}; width:14px; height:0; border-radius:0;"></span>
        Break threshold (~500k physical qubits)
      </span>
    </div>
    <div style="font-size:11px;color:#475569;margin-top:4px;">
      Source: Babbush et al., arXiv:2603.28846; IBM Quantum; Google Quantum AI (Nature 2024) · 2026-06-21
    </div>
  `;

  // ---- Static SVG elements ----
  const rowBgRects: SVGRectElement[]  = [];
  const bars: SVGRectElement[]        = [];
  const barLabels: SVGTextElement[]   = [];

  function buildStatic(): void {
    svg.innerHTML = '';

    // Background
    const bg = svgEl('rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(VB_W)); bg.setAttribute('height', String(VB_H));
    bg.setAttribute('fill', '#0f172a');
    svg.appendChild(bg);

    // Grid lines + tick labels
    const gridG = svgEl('g');
    TICKS.forEach((t) => {
      const x = logX(t);
      const line = svgEl('line');
      line.setAttribute('x1', String(x)); line.setAttribute('y1', String(MARGIN_TOP - 6));
      line.setAttribute('x2', String(x)); line.setAttribute('y2', String(MARGIN_TOP + CHART_H));
      line.setAttribute('stroke', COL_GRID);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '3 4');
      gridG.appendChild(line);

      const lbl = svgEl('text');
      lbl.setAttribute('x', String(x));
      lbl.setAttribute('y', String(MARGIN_TOP - 10));
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', COL_TICK);
      lbl.setAttribute('font-family', 'ui-monospace,monospace');
      lbl.textContent = t >= 1_000_000 ? '1M' : t >= 1_000 ? `${t / 1_000}k` : String(t);
      gridG.appendChild(lbl);
    });
    svg.appendChild(gridG);

    // Break threshold line (prominent amber dashed)
    const threshX = logX(BREAK_THRESHOLD);
    const threshLine = svgEl('line');
    threshLine.setAttribute('x1', String(threshX)); threshLine.setAttribute('y1', String(MARGIN_TOP - 6));
    threshLine.setAttribute('x2', String(threshX)); threshLine.setAttribute('y2', String(MARGIN_TOP + CHART_H));
    threshLine.setAttribute('stroke', COL_THRESHOLD);
    threshLine.setAttribute('stroke-width', '1.5');
    threshLine.setAttribute('stroke-dasharray', '5 3');
    svg.appendChild(threshLine);

    // Threshold label at top
    const threshLbl = svgEl('text');
    threshLbl.setAttribute('x', String(threshX));
    threshLbl.setAttribute('y', String(MARGIN_TOP - 10));
    threshLbl.setAttribute('text-anchor', 'middle');
    threshLbl.setAttribute('font-size', '10');
    threshLbl.setAttribute('fill', COL_THRESHOLD);
    threshLbl.setAttribute('font-family', 'ui-monospace,monospace');
    threshLbl.textContent = '~500k';
    svg.appendChild(threshLbl);

    // Axis label
    const axLbl = svgEl('text');
    axLbl.setAttribute('x', String(MARGIN_LEFT + CHART_W / 2));
    axLbl.setAttribute('y', String(VB_H - 6));
    axLbl.setAttribute('text-anchor', 'middle');
    axLbl.setAttribute('font-size', '10');
    axLbl.setAttribute('fill', COL_TICK);
    axLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    axLbl.textContent = 'Physical qubits (log scale)';
    svg.appendChild(axLbl);

    // Per-row elements
    HARDWARE.forEach((hw, i) => {
      const gy = rowY(i);
      const g = svgEl('g');
      g.classList.add('qg-row-hit');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Inspect ${hw.vendor} ${hw.name}`);
      g.addEventListener('click', () => { selectedId = hw.id; render(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { selectedId = hw.id; render(); e.preventDefault(); }
      });

      // bg rect (hover / selection highlight)
      const bgR = svgEl('rect');
      bgR.setAttribute('x', '0'); bgR.setAttribute('y', String(gy - 4));
      bgR.setAttribute('width', String(VB_W)); bgR.setAttribute('height', String(BAR_H + 8));
      bgR.setAttribute('fill', 'transparent');
      bgR.setAttribute('rx', '4');
      g.appendChild(bgR);
      rowBgRects.push(bgR);

      // Row label (chip name)
      const label = svgEl('text');
      label.setAttribute('x', String(MARGIN_LEFT - 8));
      label.setAttribute('y', String(gy + BAR_H / 2 - 5));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', '600');
      label.setAttribute('fill', COL_SELECT);
      label.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      label.textContent = hw.name;
      g.appendChild(label);

      // Sub-label (vendor · year)
      const subLabel = svgEl('text');
      subLabel.setAttribute('x', String(MARGIN_LEFT - 8));
      subLabel.setAttribute('y', String(gy + BAR_H / 2 + 8));
      subLabel.setAttribute('text-anchor', 'end');
      subLabel.setAttribute('dominant-baseline', 'middle');
      subLabel.setAttribute('font-size', '9');
      subLabel.setAttribute('fill', COL_TICK);
      subLabel.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      subLabel.textContent = `${hw.vendor} · ${hw.year}`;
      g.appendChild(subLabel);

      // Bar
      const bar = svgEl('rect');
      bar.setAttribute('y', String(gy));
      bar.setAttribute('height', String(BAR_H));
      bar.setAttribute('fill', vendorColor(hw.vendor));
      bar.setAttribute('rx', '2');
      g.appendChild(bar);
      bars.push(bar);

      // Bar value label
      const barLbl = svgEl('text');
      barLbl.setAttribute('y', String(gy + BAR_H / 2));
      barLbl.setAttribute('dominant-baseline', 'middle');
      barLbl.setAttribute('font-size', '10');
      barLbl.setAttribute('font-weight', '600');
      barLbl.setAttribute('font-family', 'ui-monospace,monospace');
      g.appendChild(barLbl);
      barLabels.push(barLbl);

      svg.appendChild(g);
    });
  }

  function render(): void {
    HARDWARE.forEach((hw, i) => {
      const isSelected = hw.id === selectedId;
      rowBgRects[i].setAttribute('fill', isSelected ? '#1e2d45' : 'transparent');

      const x1 = MARGIN_LEFT;
      const x2 = logX(hw.physicalQubits);
      bars[i].setAttribute('x', String(x1));
      bars[i].setAttribute('width', String(Math.max(2, x2 - x1)));

      const barW = x2 - x1;
      const lblText = fmtQubits(hw.physicalQubits);
      if (barW > 36) {
        barLabels[i].setAttribute('x', String(x2 - 4));
        barLabels[i].setAttribute('text-anchor', 'end');
        barLabels[i].setAttribute('fill', '#0f172a');
      } else {
        barLabels[i].setAttribute('x', String(x2 + 5));
        barLabels[i].setAttribute('text-anchor', 'start');
        barLabels[i].setAttribute('fill', vendorColor(hw.vendor));
      }
      barLabels[i].textContent = lblText;
    });

    // ---- Panel ----
    const hw = HARDWARE.find((h) => h.id === selectedId) ?? HARDWARE[HARDWARE.length - 1];
    const gap = fmtGap(hw.physicalQubits);

    panelDiv.innerHTML = `
      <div>
        <div class="qg-hw-name">${hw.vendor} ${hw.name}</div>
        <div class="qg-hw-sub">${hw.year}</div>
      </div>
      <div class="qg-stat-row">
        <span class="qg-stat-key">Physical qubits</span>
        <span class="qg-stat-val">${hw.physicalQubits.toLocaleString()}</span>
        <span class="qg-stat-key">Break threshold</span>
        <span class="qg-stat-val">~500,000</span>
        <span class="qg-stat-key">Gap to threshold</span>
        <span class="qg-stat-val qg-gap">${gap} short</span>
      </div>
      <div class="qg-note">${hw.note}</div>
      <div class="qg-prompt">Tap another row to compare</div>
    `;
  }

  buildStatic();
  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
