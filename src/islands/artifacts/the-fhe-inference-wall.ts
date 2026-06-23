/**
 * Artifact: the-fhe-inference-wall — The FHE Inference Wall
 * Manifest: content/artifacts/the-fhe-inference-wall/manifest.json
 *
 * Grouped bar chart (log-scale latency) comparing FHE vs best-case MPC
 * for four neural network models ordered by parameter count.
 * Click a model group to populate the detail panel.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-fhe-inference-wall/data.json';

const NS = 'http://www.w3.org/2000/svg';

// Design tokens — FHE = orange (expensive), MPC = cyan (faster)
const CLR_FHE   = '#f0883e';
const CLR_MPC   = '#22d3ee';
const CLR_GRID  = '#21262d';
const CLR_AXIS  = '#30363d';
const CLR_DIM   = '#6e7681';
const CLR_LABEL = '#8b949e';
const CLR_HI    = '#e6edf3';

// Log-scale axis bounds (seconds)
const Y_LO = 0.0007;
const Y_HI = 400;

type Model = (typeof rawData.models)[0];

function logY(v: number, ch: number, mt: number): number {
  return mt + ch * (1 - Math.log(v / Y_LO) / Math.log(Y_HI / Y_LO));
}

function fmtSec(s: number): string {
  if (s >= 120)  return `${(s / 60).toFixed(0)} min`;
  if (s >= 10)   return `${s.toFixed(0)} s`;
  if (s >= 1)    return `${s.toFixed(1)} s`;
  if (s >= 0.01) return `${(s * 1000).toFixed(0)} ms`;
  return `${(s * 1000).toFixed(1)} ms`;
}

function mkEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function mkText(text: string, attrs: Record<string, string | number>): SVGTextElement {
  const el = mkEl('text', attrs) as SVGTextElement;
  el.textContent = text;
  return el;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
    stageFr: '1.6fr',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .fw-svg { width:100%; height:100%; display:block; }
    .fw-panel {
      display:flex; flex-direction:column; gap:8px;
      padding:4px 0; font-size:12px; color:#c9d1d9;
    }
    .fw-heading { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#6e7681; }
    .fw-model   { font-size:14px; font-weight:600; color:#e6edf3; }
    .fw-sub     { font-size:10px; color:#8b949e; }
    .fw-metric  { display:flex; flex-direction:column; gap:1px; }
    .fw-lbl     { font-size:10px; color:#8b949e; }
    .fw-val     { font-size:14px; font-weight:600; }
    .fw-fhe     { color:#f0883e; }
    .fw-mpc     { color:#22d3ee; }
    .fw-ratio   { font-size:11px; color:#c9d1d9; margin-top:2px; }
    .fw-ratio strong { color:#f0883e; }
    .fw-divider { border:none; border-top:1px solid #21262d; margin:4px 0; }
    .fw-mem     { font-size:10px; color:#8b949e; line-height:1.5; }
    .fw-mem strong { color:#c9d1d9; }
    .fw-legend  { display:flex; flex-direction:column; gap:4px; }
    .fw-leg-row { display:flex; align-items:center; gap:6px; font-size:10px; color:#8b949e; }
    .fw-swatch  { width:12px; height:10px; border-radius:2px; flex-shrink:0; }
    .fw-note    {
      font-size:10px; color:#6e7681; line-height:1.4;
      margin-top:auto; padding-top:8px; border-top:1px solid #21262d;
    }
    .fw-caption { font-size:10px; color:#6e7681; }
    .fw-caption a { color:#58a6ff; text-decoration:none; }
    .fw-caption a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);

  // ── SVG ─────────────────────────────────────────────────────────────────────
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'fw-svg');
  svg.setAttribute('aria-label', 'FHE vs MPC inference latency by model size (log scale)');
  stage.appendChild(svg);

  // ── Panel ────────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'fw-panel';
  panel.appendChild(panelDiv);

  panelDiv.innerHTML = `
    <div class="fw-heading">Click a model</div>
    <div class="fw-model" id="fw-name">—</div>
    <div class="fw-sub"   id="fw-sub">Select a model group to inspect it</div>
    <hr class="fw-divider">
    <div class="fw-metric">
      <div class="fw-lbl">FHE latency</div>
      <div class="fw-val fw-fhe" id="fw-fhe">—</div>
    </div>
    <div class="fw-metric">
      <div class="fw-lbl">MPC best (LAN-F)</div>
      <div class="fw-val fw-mpc" id="fw-mpc">—</div>
    </div>
    <div class="fw-ratio" id="fw-ratio">—</div>
    <hr class="fw-divider">
    <div class="fw-mem" id="fw-mem">—</div>
    <hr class="fw-divider">
    <div class="fw-legend">
      <div class="fw-leg-row">
        <div class="fw-swatch" style="background:#f0883e"></div>FHE (fully encrypted)
      </div>
      <div class="fw-leg-row">
        <div class="fw-swatch" style="background:#22d3ee"></div>MPC best (LAN-F, 50 Gbps)
      </div>
    </div>
    <div class="fw-note" id="fw-note">Models sorted left to right by parameter count. Both FHE and MPC keep your data secret from the compute provider; the difference is cost.</div>
  `;

  const nameEl  = panelDiv.querySelector('#fw-name')  as HTMLElement;
  const subEl   = panelDiv.querySelector('#fw-sub')   as HTMLElement;
  const fheEl   = panelDiv.querySelector('#fw-fhe')   as HTMLElement;
  const mpcEl   = panelDiv.querySelector('#fw-mpc')   as HTMLElement;
  const ratioEl = panelDiv.querySelector('#fw-ratio') as HTMLElement;
  const memEl   = panelDiv.querySelector('#fw-mem')   as HTMLElement;
  const noteEl  = panelDiv.querySelector('#fw-note')  as HTMLElement;

  function updatePanel(m: Model | null): void {
    if (!m) {
      nameEl.textContent  = '—';
      subEl.textContent   = 'Select a model group to inspect it';
      fheEl.textContent   = '—';
      mpcEl.textContent   = '—';
      ratioEl.textContent = '—';
      memEl.textContent   = '—';
      noteEl.textContent  = 'Models sorted by parameter count. Both FHE and MPC keep data secret; the difference is cost.';
      return;
    }
    const bestMpc = Math.min(m.mpc_a2b_latency_s, m.mpc_fss_latency_s);
    const ratio   = m.fhe_latency_s / bestMpc;
    nameEl.textContent = m.name;
    subEl.textContent  = `${m.params} params · ${m.type} · ${m.layers} layers`;
    fheEl.textContent  = fmtSec(m.fhe_latency_s);
    mpcEl.textContent  = fmtSec(bestMpc);
    if (ratio >= 1.5) {
      ratioEl.innerHTML = `FHE is <strong>${ratio.toFixed(1)}×</strong> slower than best MPC`;
    } else if (ratio < 0.9) {
      ratioEl.innerHTML = `FHE is <strong>${(1 / ratio).toFixed(1)}×</strong> faster than best MPC`;
    } else {
      ratioEl.innerHTML = `FHE and MPC are roughly <strong>equal</strong> here`;
    }
    if (m.fhe_memory_gb !== null) {
      memEl.innerHTML = `Memory: <strong>${m.fhe_memory_gb} GB</strong> (FHE) vs <strong>${m.mpc_memory_gb} GB</strong> (MPC)`;
      if (m.fhe_throughput_sps !== null && m.mpc_throughput_sps !== null) {
        const thrRatio = m.mpc_throughput_sps / m.fhe_throughput_sps;
        memEl.innerHTML += `<br>Throughput @batch 128: FHE ${m.fhe_throughput_sps} vs MPC ${m.mpc_throughput_sps} sps (${thrRatio.toFixed(0)}×)`;
      }
    } else {
      memEl.innerHTML = `Memory: MPC ~<strong>${m.mpc_memory_gb} GB</strong> · FHE not measured at this scale`;
    }
    noteEl.textContent = m.note;
  }

  // ── Caption ──────────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'fw-caption';
  capDiv.innerHTML = `Source: <a href="${rawData.dataSource.url}" target="_blank" rel="noopener">${rawData.dataSource.label}</a> · MPC at LAN-F best case · click a bar group to explore`;
  caption.appendChild(capDiv);

  // ── State ────────────────────────────────────────────────────────────────────
  let selectedId: string | null = null;
  const models = rawData.models as Model[];

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = svg.clientWidth  || 400;
    const H = svg.clientHeight || 300;
    const compact = W < 320;

    const ml = compact ? 38 : 46;
    const mr = 10;
    const mt = 16;
    const mb = compact ? 38 : 48;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    const n        = models.length;
    const groupW   = cw / n;
    const barW     = Math.min(Math.floor(groupW * 0.27), 22);
    const barGap   = Math.max(3, Math.floor(groupW * 0.05));
    const pairW    = barW * 2 + barGap;
    const padX     = (groupW - pairW) / 2;

    // ── Y grid & ticks ─────────────────────────────────────────────────────────
    const yTicks: [number, string][] = [
      [0.001, '1 ms'], [0.01, '10 ms'], [0.1, '100 ms'],
      [1, '1 s'], [10, '10 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'],
    ];
    for (const [t, lbl] of yTicks) {
      const y = logY(t, ch, mt);
      if (y < mt - 2 || y > mt + ch + 2) continue;
      svg.appendChild(mkEl('line', {
        x1: ml, y1: y, x2: ml + cw, y2: y,
        stroke: CLR_GRID, 'stroke-width': '1',
      }));
      const shortLbl = compact ? lbl.replace(' ms', 'ms').replace(' min', 'min').replace(' s', 's') : lbl;
      svg.appendChild(mkText(shortLbl, {
        x: ml - 4, y: y + 3.5,
        fill: CLR_DIM, 'font-size': compact ? '8' : '9',
        'font-family': 'monospace', 'text-anchor': 'end',
      }));
    }

    // ── Axes ────────────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('line', { x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: CLR_AXIS, 'stroke-width': '1' }));
    svg.appendChild(mkEl('line', { x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: CLR_AXIS, 'stroke-width': '1' }));

    // Y-axis label (rotated)
    if (!compact) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `rotate(-90,${ml - 38},${mt + ch / 2})`);
      g.appendChild(mkText('← Inference latency', {
        x: ml - 38, y: mt + ch / 2,
        fill: CLR_LABEL, 'font-size': '9',
        'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
      }));
      svg.appendChild(g);
    }

    // ── Model groups ─────────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const m        = models[i];
      const groupX   = ml + i * groupW;
      const fheBarX  = groupX + padX;
      const mpcBarX  = fheBarX + barW + barGap;
      const baseY    = mt + ch;
      const isSelected = selectedId === m.id;
      const dimmed   = selectedId !== null && !isSelected;

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.style.cursor = 'pointer';
      svg.appendChild(g);

      // Hit zone
      g.appendChild(mkEl('rect', {
        x: groupX + 1, y: mt, width: groupW - 2, height: ch,
        fill: isSelected ? '#161b22' : 'transparent',
        rx: '2',
      }));

      // FHE bar
      const fheY = logY(m.fhe_latency_s, ch, mt);
      const fheH = Math.max(2, baseY - fheY);
      g.appendChild(mkEl('rect', {
        x: fheBarX, y: fheY, width: barW, height: fheH,
        fill: CLR_FHE, rx: '2',
        opacity: dimmed ? '0.3' : '1',
      }));

      // MPC bar (best of A2B and FSS)
      const bestMpc = Math.min(m.mpc_a2b_latency_s, m.mpc_fss_latency_s);
      const mpcY    = logY(bestMpc, ch, mt);
      const mpcH    = Math.max(2, baseY - mpcY);
      g.appendChild(mkEl('rect', {
        x: mpcBarX, y: mpcY, width: barW, height: mpcH,
        fill: CLR_MPC, rx: '2',
        opacity: dimmed ? '0.3' : '1',
      }));

      // Value labels above bars (skip if too small)
      if (!compact && !dimmed) {
        if (fheH > 16) {
          g.appendChild(mkText(fmtSec(m.fhe_latency_s), {
            x: fheBarX + barW / 2, y: Math.max(mt + 9, fheY - 3),
            fill: CLR_FHE, 'font-size': '8.5', 'font-family': 'monospace',
            'text-anchor': 'middle',
          }));
        }
        if (mpcH > 16) {
          g.appendChild(mkText(fmtSec(bestMpc), {
            x: mpcBarX + barW / 2, y: Math.max(mt + 9, mpcY - 3),
            fill: CLR_MPC, 'font-size': '8.5', 'font-family': 'monospace',
            'text-anchor': 'middle',
          }));
        }
      }

      // Ratio brace for models where gap > 30×
      const ratio = m.fhe_latency_s / bestMpc;
      if (!compact && ratio > 20 && fheH > 50 && !dimmed) {
        const midY   = (fheY + mpcY) / 2;
        const braceX = fheBarX - 8;
        svg.appendChild(mkEl('line', {
          x1: braceX, y1: fheY + 4, x2: braceX, y2: mpcY - 4,
          stroke: '#444c56', 'stroke-width': '1',
        }));
        svg.appendChild(mkText(`${ratio.toFixed(0)}×`, {
          x: braceX - 3, y: midY + 3.5,
          fill: '#6e7681', 'font-size': '8.5', 'font-family': 'monospace',
          'text-anchor': 'end', 'font-weight': '600',
        }));
      }

      // Model name label
      const labelY = baseY + (compact ? 13 : 15);
      const nameStr = compact
        ? m.name.replace('ResNet-', 'RN').replace('BERT-', 'B')
        : m.name;
      g.appendChild(mkText(nameStr, {
        x: groupX + groupW / 2, y: labelY,
        fill: isSelected ? CLR_HI : CLR_LABEL,
        'font-size': compact ? '9' : '10.5',
        'font-family': 'system-ui,sans-serif',
        'text-anchor': 'middle',
        'font-weight': isSelected ? '600' : '400',
      }));

      // Params label (not compact)
      if (!compact) {
        g.appendChild(mkText(m.params, {
          x: groupX + groupW / 2, y: labelY + 13,
          fill: CLR_DIM, 'font-size': '8.5',
          'font-family': 'monospace', 'text-anchor': 'middle',
        }));
      }

      // Click handler
      const modelId = m.id;
      g.addEventListener('click', () => {
        selectedId = selectedId === modelId ? null : modelId;
        updatePanel(selectedId ? models.find(x => x.id === selectedId) ?? null : null);
        draw();
      });
    }

    // ── Inline legend (top-right corner of chart) ────────────────────────────
    if (W > 260) {
      const legX = ml + cw - (compact ? 66 : 86);
      const legY = mt + 6;
      const legW = compact ? 66 : 84;
      svg.appendChild(mkEl('rect', {
        x: legX - 4, y: legY - 6, width: legW, height: 30,
        fill: '#0d1117', rx: '3', opacity: '0.85',
      }));
      const fs = compact ? '8' : '9';
      svg.appendChild(mkEl('rect', { x: legX, y: legY, width: 9, height: 8, fill: CLR_FHE, rx: '1.5' }));
      svg.appendChild(mkText('FHE', { x: legX + 13, y: legY + 7.5, fill: CLR_FHE, 'font-size': fs, 'font-family': 'system-ui' }));
      svg.appendChild(mkEl('rect', { x: legX, y: legY + 13, width: 9, height: 8, fill: CLR_MPC, rx: '1.5' }));
      svg.appendChild(mkText('MPC best', { x: legX + 13, y: legY + 20.5, fill: CLR_MPC, 'font-size': fs, 'font-family': 'system-ui' }));
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────────
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
  ro.observe(stage);
  draw();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    layout.dispose();
    style.remove();
  };
}
