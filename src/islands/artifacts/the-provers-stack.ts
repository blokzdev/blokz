/**
 * Artifact: the-provers-stack — The Prover's Stack
 * Manifest: content/artifacts/the-provers-stack/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

// ---------------------------------------------------------------------------
// Data (mirrors content/artifacts/the-provers-stack/data.json)
// ---------------------------------------------------------------------------

interface Hardware {
  id: string;
  label: string;
  sublabel: string;
  msmSpeedup: number;
  nttSpeedup: number;
  note: string;
}

interface ProofSystem {
  id: string;
  label: string;
  description: string;
  msmShare: number;
  nttShare: number;
  otherShare: number;
  refCircuitLabel: string;
  refCpuMinutes: number;
}

const HARDWARE: Hardware[] = [
  {
    id: 'cpu',
    label: 'CPU',
    sublabel: 'x86 multicore (baseline)',
    msmSpeedup: 1,
    nttSpeedup: 1,
    note: 'The floor. Modern multi-core CPUs run MSM via the Pippenger algorithm on BN254, fast enough for development. Production provers abandoned pure CPU years ago.',
  },
  {
    id: 'gpu',
    label: 'GPU / H100',
    sublabel: 'Icicle v2 (Ingonyama)',
    msmSpeedup: 9,
    nttSpeedup: 4,
    note: 'CUDA kernels parallelize the Pippenger bucket accumulation for 8–10× MSM speedup. NTT gains are smaller (3–5×) because the butterfly network\'s memory-access pattern doesn\'t map cleanly onto GPU cache lines. ICICLE-Snark is the fastest public Groth16 prover.',
  },
  {
    id: 'tpu',
    label: 'TPU v6e8',
    sublabel: 'MORPH (arXiv:2604.17808)',
    msmSpeedup: 9,
    nttSpeedup: 40,
    note: 'MORPH\'s extended-RNS lazy reduction converts 254-bit modular arithmetic to dense low-precision GEMMs. NTT throughput is 10× higher than GPU because the butterfly network maps onto TPU tiling; MSM is comparable to GPU. The same pod that runs inference can now prove it.',
  },
  {
    id: 'asic',
    label: 'ZK ASIC',
    sublabel: 'Cysic SolarMSM Gen1',
    msmSpeedup: 80,
    nttSpeedup: 60,
    note: 'SolarMSM completes a 2³⁰-scale BN254 MSM in 195 ms — roughly 80× faster than GPU. Purpose-built silicon eliminates all general-purpose overhead. NTT speedup is an engineering estimate; Cysic\'s C1 chip targets both operations. Even at 80× MSM + 60× NTT, the 10% of \'other\' work caps end-to-end speedup near 9× — Amdahl\'s law, on silicon.',
  },
];

const PROOF_SYSTEMS: ProofSystem[] = [
  {
    id: 'snark',
    label: 'SNARK / PLONK',
    description: 'MSM-heavy: elliptic-curve polynomial commitments dominate proving time',
    msmShare: 0.70,
    nttShare: 0.20,
    otherShare: 0.10,
    refCircuitLabel: '2²⁰-constraint circuit',
    refCpuMinutes: 8,
  },
  {
    id: 'stark',
    label: 'STARK / FRI',
    description: 'NTT-heavy: low-degree extension of the execution trace dominates',
    msmShare: 0.05,
    nttShare: 0.85,
    otherShare: 0.10,
    refCircuitLabel: '2²⁰-row STARK trace',
    refCpuMinutes: 5,
  },
];

// ---------------------------------------------------------------------------
// Chart constants
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 800;
const VB_H = 370;

// Log scale: 0.75× to 110× (extra room so 80× ASIC bars fit with a label)
const LOG_MIN = Math.log10(0.75);
const LOG_MAX = Math.log10(110);

// Grid line values (powers of 2 / round numbers on a log scale)
const TICKS = [1, 2, 5, 10, 20, 50, 100];

// Layout inside the SVG viewBox
const MARGIN_LEFT = 112;  // room for row labels
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 40;    // room for axis tick labels
const MARGIN_BOTTOM = 28;
const CHART_W = VB_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VB_H - MARGIN_TOP - MARGIN_BOTTOM;

// Bar geometry
const GROUP_GAP = 20;       // px between hardware groups
const BAR_GAP = 4;          // px between MSM and NTT bars within a group
const N_ROWS = HARDWARE.length;
const GROUP_H = (CHART_H - GROUP_GAP * (N_ROWS - 1)) / N_ROWS;
const BAR_H = (GROUP_H - BAR_GAP) / 2;

// Colours
const COL_MSM = '#4d6bd6';      // indigo
const COL_NTT = '#22d3ee';      // cyan
const COL_EFF = '#a78bfa';      // violet — effective speedup marker
const COL_GRID = '#334155';     // slate-700 grid lines
const COL_LABEL = '#94a3b8';    // slate-400 row labels
const COL_TICK = '#64748b';     // slate-500 axis ticks
const COL_SELECT = '#f1f5f9';   // near-white row highlight
const COL_SELECT_DIM = '#1e293b'; // dark row bg when another selected

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function logX(v: number): number {
  return MARGIN_LEFT + ((Math.log10(Math.max(v, 0.1)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * CHART_W;
}

function rowY(i: number): number {
  return MARGIN_TOP + i * (GROUP_H + GROUP_GAP);
}

function effectiveSpeedup(hw: Hardware, ps: ProofSystem): number {
  return 1 / (ps.msmShare / hw.msmSpeedup + ps.nttShare / hw.nttSpeedup + ps.otherShare);
}

function fmt1(n: number): string {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
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

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .ps-svg { width:100%; height:100%; display:block; }
    .ps-row-hit { cursor:pointer; }
    .ps-row-hit:focus-visible { outline:2px solid ${COL_EFF}; outline-offset:2px; }

    /* Controls */
    .ps-controls { display:flex; gap:8px; flex-wrap:wrap; padding:4px 0; }
    .ps-btn {
      font-size:11px; font-weight:600; letter-spacing:.03em;
      border:1.5px solid #334155; border-radius:5px;
      padding:5px 14px; cursor:pointer; background:transparent;
      color:#94a3b8; transition:color .15s, background .15s, border-color .15s;
      white-space:nowrap;
    }
    .ps-btn[aria-pressed="true"] {
      background:#1e293b; border-color:${COL_EFF}; color:${COL_EFF};
    }
    .ps-btn:hover { border-color:#94a3b8; color:#e2e8f0; }

    /* Panel */
    .ps-panel {
      font-size:12px; color:#94a3b8; display:flex; flex-direction:column;
      gap:12px; padding:4px 0; min-width:0;
    }
    .ps-hw-name { font-size:14px; font-weight:700; color:#e2e8f0; }
    .ps-hw-sub  { font-size:11px; color:#64748b; margin-top:2px; }
    .ps-stat-row { display:grid; grid-template-columns:auto 1fr; gap:4px 10px; align-items:baseline; }
    .ps-stat-key { color:#64748b; white-space:nowrap; }
    .ps-stat-val { font-variant-numeric:tabular-nums; font-weight:600; color:#e2e8f0; text-align:right; }
    .ps-stat-val.ps-msm { color:${COL_MSM}; }
    .ps-stat-val.ps-ntt { color:${COL_NTT}; }
    .ps-stat-val.ps-eff { color:${COL_EFF}; }
    .ps-note { font-size:11px; color:#64748b; line-height:1.6; }
    .ps-prompt { font-size:11px; color:#475569; font-style:italic; }

    /* Legend row */
    .ps-legend { display:flex; gap:12px; flex-wrap:wrap; padding:2px 0; }
    .ps-leg-item { display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b; }
    .ps-leg-swatch { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
  `;
  document.head.appendChild(style);

  // ---- SVG stage ----
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('ps-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', "The Prover's Stack: MSM and NTT speedup chart");
  stage.appendChild(svg);

  // ---- State ----
  let selectedId: string = HARDWARE[1].id; // default: GPU
  let psId: string = PROOF_SYSTEMS[0].id;  // default: SNARK

  // ---- Controls ----
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'ps-controls';

  const psButtons: HTMLButtonElement[] = PROOF_SYSTEMS.map((ps) => {
    const btn = document.createElement('button');
    btn.className = 'ps-btn';
    btn.textContent = ps.label;
    btn.setAttribute('aria-pressed', ps.id === psId ? 'true' : 'false');
    btn.addEventListener('click', () => {
      psId = ps.id;
      psButtons.forEach((b, i) => b.setAttribute('aria-pressed', PROOF_SYSTEMS[i].id === psId ? 'true' : 'false'));
      render();
    });
    ctrlDiv.appendChild(btn);
    return btn;
  });
  controls.appendChild(ctrlDiv);

  // ---- Panel ----
  const panelDiv = document.createElement('div');
  panelDiv.className = 'ps-panel';
  panel.appendChild(panelDiv);

  // ---- Caption ----
  caption.innerHTML = `
    <div class="ps-legend">
      <span class="ps-leg-item"><span class="ps-leg-swatch" style="background:${COL_MSM}"></span>MSM speedup vs CPU</span>
      <span class="ps-leg-item"><span class="ps-leg-swatch" style="background:${COL_NTT}"></span>NTT speedup vs CPU</span>
      <span class="ps-leg-item"><span class="ps-leg-swatch" style="background:${COL_EFF}; border-radius:0; width:14px; height:2px; border-top:2px dashed ${COL_EFF};"></span>Effective end-to-end speedup (Amdahl)</span>
    </div>
    <div style="font-size:11px;color:#475569;margin-top:4px;">Source: MORPH arXiv:2604.17808; Ingonyama ICICLE-Snark; Cysic SolarMSM · 2026-06-21</div>
  `;

  // ---- Render ----

  // Static elements rendered once
  let staticDone = false;
  const rowGroups: SVGGElement[] = [];
  const rowBgRects: SVGRectElement[] = [];
  const msmBars: SVGRectElement[] = [];
  const nttBars: SVGRectElement[] = [];
  const effLines: SVGLineElement[] = [];
  const msmLabels: SVGTextElement[] = [];
  const nttLabels: SVGTextElement[] = [];
  const effLabels: SVGTextElement[] = [];

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
      line.setAttribute('stroke', t === 1 ? '#e2e8f0' : COL_GRID);
      line.setAttribute('stroke-width', t === 1 ? '1.5' : '1');
      line.setAttribute('stroke-dasharray', t === 1 ? '' : '3 4');
      gridG.appendChild(line);

      const lbl = svgEl('text');
      lbl.setAttribute('x', String(x));
      lbl.setAttribute('y', String(MARGIN_TOP - 10));
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-size', '11');
      lbl.setAttribute('fill', t === 1 ? '#e2e8f0' : COL_TICK);
      lbl.setAttribute('font-family', 'ui-monospace,monospace');
      lbl.textContent = `${t}×`;
      gridG.appendChild(lbl);
    });
    svg.appendChild(gridG);

    // Axis label
    const axLbl = svgEl('text');
    axLbl.setAttribute('x', String(MARGIN_LEFT + CHART_W / 2));
    axLbl.setAttribute('y', String(VB_H - 6));
    axLbl.setAttribute('text-anchor', 'middle');
    axLbl.setAttribute('font-size', '10');
    axLbl.setAttribute('fill', COL_TICK);
    axLbl.setAttribute('font-family', 'ui-sans-serif,sans-serif');
    axLbl.textContent = 'Speedup vs CPU (log scale)';
    svg.appendChild(axLbl);

    // Per-row elements
    HARDWARE.forEach((hw, i) => {
      const gy = rowY(i);
      const g = svgEl('g');
      g.classList.add('ps-row-hit');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Inspect ${hw.label}`);
      g.addEventListener('click', () => { selectedId = hw.id; render(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { selectedId = hw.id; render(); e.preventDefault(); }
      });

      // bg rect (for hover / selection highlight)
      const bgR = svgEl('rect');
      bgR.setAttribute('x', '0'); bgR.setAttribute('y', String(gy - 6));
      bgR.setAttribute('width', String(VB_W)); bgR.setAttribute('height', String(GROUP_H + 12));
      bgR.setAttribute('fill', 'transparent');
      bgR.setAttribute('rx', '4');
      g.appendChild(bgR);
      rowBgRects.push(bgR);

      // Row label (hardware name)
      const hwLabel = svgEl('text');
      hwLabel.setAttribute('x', String(MARGIN_LEFT - 8));
      hwLabel.setAttribute('y', String(gy + GROUP_H / 2 - 6));
      hwLabel.setAttribute('text-anchor', 'end');
      hwLabel.setAttribute('dominant-baseline', 'middle');
      hwLabel.setAttribute('font-size', '12');
      hwLabel.setAttribute('font-weight', '600');
      hwLabel.setAttribute('fill', COL_SELECT);
      hwLabel.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      hwLabel.textContent = hw.label;
      g.appendChild(hwLabel);

      const subLabel = svgEl('text');
      subLabel.setAttribute('x', String(MARGIN_LEFT - 8));
      subLabel.setAttribute('y', String(gy + GROUP_H / 2 + 8));
      subLabel.setAttribute('text-anchor', 'end');
      subLabel.setAttribute('dominant-baseline', 'middle');
      subLabel.setAttribute('font-size', '9');
      subLabel.setAttribute('fill', COL_TICK);
      subLabel.setAttribute('font-family', 'ui-sans-serif,sans-serif');
      subLabel.textContent = hw.sublabel;
      g.appendChild(subLabel);

      // MSM bar
      const msmBar = svgEl('rect');
      msmBar.setAttribute('y', String(gy));
      msmBar.setAttribute('height', String(BAR_H));
      msmBar.setAttribute('fill', COL_MSM);
      msmBar.setAttribute('rx', '2');
      g.appendChild(msmBar);
      msmBars.push(msmBar);

      // MSM value label
      const msmLbl = svgEl('text');
      msmLbl.setAttribute('y', String(gy + BAR_H / 2));
      msmLbl.setAttribute('dominant-baseline', 'middle');
      msmLbl.setAttribute('font-size', '10');
      msmLbl.setAttribute('font-weight', '600');
      msmLbl.setAttribute('fill', '#e2e8f0');
      msmLbl.setAttribute('font-family', 'ui-monospace,monospace');
      g.appendChild(msmLbl);
      msmLabels.push(msmLbl);

      // NTT bar
      const nttBar = svgEl('rect');
      nttBar.setAttribute('y', String(gy + BAR_H + BAR_GAP));
      nttBar.setAttribute('height', String(BAR_H));
      nttBar.setAttribute('fill', COL_NTT);
      nttBar.setAttribute('rx', '2');
      g.appendChild(nttBar);
      nttBars.push(nttBar);

      // NTT value label
      const nttLbl = svgEl('text');
      nttLbl.setAttribute('y', String(gy + BAR_H + BAR_GAP + BAR_H / 2));
      nttLbl.setAttribute('dominant-baseline', 'middle');
      nttLbl.setAttribute('font-size', '10');
      nttLbl.setAttribute('font-weight', '600');
      nttLbl.setAttribute('fill', '#0f172a');
      nttLbl.setAttribute('font-family', 'ui-monospace,monospace');
      g.appendChild(nttLbl);
      nttLabels.push(nttLbl);

      // Effective speedup dashed line
      const effLine = svgEl('line');
      effLine.setAttribute('y1', String(gy - 4));
      effLine.setAttribute('y2', String(gy + GROUP_H + 4));
      effLine.setAttribute('stroke', COL_EFF);
      effLine.setAttribute('stroke-width', '2');
      effLine.setAttribute('stroke-dasharray', '4 3');
      g.appendChild(effLine);
      effLines.push(effLine);

      // Effective speedup label
      const effLbl = svgEl('text');
      effLbl.setAttribute('y', String(gy - 7));
      effLbl.setAttribute('text-anchor', 'middle');
      effLbl.setAttribute('font-size', '10');
      effLbl.setAttribute('font-weight', '700');
      effLbl.setAttribute('fill', COL_EFF);
      effLbl.setAttribute('font-family', 'ui-monospace,monospace');
      g.appendChild(effLbl);
      effLabels.push(effLbl);

      svg.appendChild(g);
      rowGroups.push(g);
    });

    staticDone = true;
  }

  function render(): void {
    if (!staticDone) buildStatic();

    const ps = PROOF_SYSTEMS.find((p) => p.id === psId)!;

    HARDWARE.forEach((hw, i) => {
      const isSelected = hw.id === selectedId;

      // Row highlight
      rowBgRects[i].setAttribute('fill', isSelected ? '#1e2d45' : 'transparent');

      // MSM bar
      const msmX1 = logX(1);
      const msmX2 = logX(hw.msmSpeedup);
      msmBars[i].setAttribute('x', String(msmX1));
      msmBars[i].setAttribute('width', String(Math.max(0, msmX2 - msmX1)));

      // MSM label — place outside bar if bar is too narrow
      const msmBarW = msmX2 - msmX1;
      if (msmBarW > 28) {
        msmLabels[i].setAttribute('x', String(msmX2 - 4));
        msmLabels[i].setAttribute('text-anchor', 'end');
        msmLabels[i].setAttribute('fill', '#e2e8f0');
      } else {
        msmLabels[i].setAttribute('x', String(msmX2 + 4));
        msmLabels[i].setAttribute('text-anchor', 'start');
        msmLabels[i].setAttribute('fill', COL_MSM);
      }
      msmLabels[i].textContent = `${fmt1(hw.msmSpeedup)}×`;

      // NTT bar
      const nttX1 = logX(1);
      const nttX2 = logX(hw.nttSpeedup);
      nttBars[i].setAttribute('x', String(nttX1));
      nttBars[i].setAttribute('width', String(Math.max(0, nttX2 - nttX1)));

      const nttBarW = nttX2 - nttX1;
      if (nttBarW > 28) {
        nttLabels[i].setAttribute('x', String(nttX2 - 4));
        nttLabels[i].setAttribute('text-anchor', 'end');
        nttLabels[i].setAttribute('fill', '#0f172a');
      } else {
        nttLabels[i].setAttribute('x', String(nttX2 + 4));
        nttLabels[i].setAttribute('text-anchor', 'start');
        nttLabels[i].setAttribute('fill', COL_NTT);
      }
      nttLabels[i].textContent = `${fmt1(hw.nttSpeedup)}×`;

      // Effective speedup line
      const eff = effectiveSpeedup(hw, ps);
      const effX = logX(eff);
      effLines[i].setAttribute('x1', String(effX));
      effLines[i].setAttribute('x2', String(effX));
      effLabels[i].setAttribute('x', String(effX));
      effLabels[i].textContent = `${fmt1(eff)}×`;
    });

    // ---- Panel ----
    const hw = HARDWARE.find((h) => h.id === selectedId) ?? HARDWARE[1];
    const eff = effectiveSpeedup(hw, ps);
    const cpuMins = ps.refCpuMinutes;
    const hwMins = cpuMins / eff;

    panelDiv.innerHTML = `
      <div>
        <div class="ps-hw-name">${hw.label}</div>
        <div class="ps-hw-sub">${hw.sublabel}</div>
      </div>
      <div class="ps-stat-row">
        <span class="ps-stat-key">MSM speedup</span>
        <span class="ps-stat-val ps-msm">${fmt1(hw.msmSpeedup)}×</span>
        <span class="ps-stat-key">NTT speedup</span>
        <span class="ps-stat-val ps-ntt">${fmt1(hw.nttSpeedup)}×</span>
        <span class="ps-stat-key">Effective (${ps.label})</span>
        <span class="ps-stat-val ps-eff">${fmt1(eff)}×</span>
        <span class="ps-stat-key">Ref CPU time</span>
        <span class="ps-stat-val">${cpuMins} min</span>
        <span class="ps-stat-key">This hardware</span>
        <span class="ps-stat-val">${hwMins < 1 ? `${(hwMins * 60).toFixed(0)} s` : `${hwMins.toFixed(1)} min`}</span>
      </div>
      <div class="ps-note">${hw.note}</div>
      <div class="ps-prompt">Tap another row to compare</div>
    `;
  }

  buildStatic();
  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
