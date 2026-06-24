/**
 * Artifact: ai-agent-gas-cost-regimes — AI Agent Gas Cost Regimes
 * Manifest: content/artifacts/ai-agent-gas-cost-regimes/manifest.json
 *
 * Calculator: drag the gas-price slider and watch per-operation USD costs
 * update on a log-scale bar chart. Right rail shows the active design regime
 * and viable strategies at that price level.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/ai-agent-gas-cost-regimes/data.json';

const NS = 'http://www.w3.org/2000/svg';
const VW = 780, VH = 360;
const ML = 176, MR = 20, MT = 22, MB = 44;
const PLOT_W = VW - ML - MR;
const PLOT_H = VH - MT - MB;

interface Op { id: string; label: string; gas: number }
interface Regime { label: string; maxGwei: number; color: string; strategies: string[] }

const OPS   = rawData.operations as Op[];
const SNAP  = rawData.snapshot;
const REGIMES = rawData.regimes as Regime[];

const ETH = SNAP.eth_price_usd;
const N   = OPS.length;
const BAR_H   = Math.floor((PLOT_H / N) * 0.62);
const BAR_GAP = (PLOT_H / N) - BAR_H;

// Log x-axis: $0.001 → $10 000
const X_LOG_MIN = Math.log10(0.001);
const X_LOG_MAX = Math.log10(10000);
function xScale(usd: number): number {
  const clamped = Math.max(0.0001, usd);
  return PLOT_W * (Math.log10(clamped) - X_LOG_MIN) / (X_LOG_MAX - X_LOG_MIN);
}

// Log slider: position 0–100 ↔ 0.1–500 Gwei
const G_LOG_MIN = Math.log10(0.1);
const G_LOG_MAX = Math.log10(500);
function sliderToGwei(v: number): number {
  return Math.pow(10, G_LOG_MIN + (v / 100) * (G_LOG_MAX - G_LOG_MIN));
}
function gweiToSlider(g: number): number {
  return ((Math.log10(g) - G_LOG_MIN) / (G_LOG_MAX - G_LOG_MIN)) * 100;
}

function gasCostUSD(gasUnits: number, gwei: number): number {
  return gasUnits * gwei * 1e-9 * ETH;
}

function fmtUSD(v: number): string {
  if (v < 0.001) return '<$0.001';
  if (v < 0.01)  return `$${v.toFixed(4)}`;
  if (v < 0.1)   return `$${v.toFixed(3)}`;
  if (v < 1)     return `$${v.toFixed(3)}`;
  if (v < 100)   return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtGwei(g: number): string {
  return g < 1 ? `${g.toFixed(3)} Gwei` : `${g.toFixed(g < 10 ? 2 : 1)} Gwei`;
}

function getRegime(g: number): Regime {
  return REGIMES.find(r => g <= r.maxGwei) ?? REGIMES[REGIMES.length - 1];
}

const GRID_VALS = [0.01, 0.1, 1, 10, 100, 1000];

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '780/360',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .gcr-wrap { position:absolute; inset:0; background:#0d1322;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; overflow:hidden; }
    .gcr-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .gcr-grid  { stroke:rgba(124,140,255,.07); stroke-width:1; }
    .gcr-axis  { fill:#4a5168; font:500 9.5px 'JetBrains Mono',monospace; }
    .gcr-oplbl { fill:#7a8298; font:500 10px 'JetBrains Mono',monospace;
                 text-anchor:end; dominant-baseline:middle; }
    .gcr-bar   { rx:3; transition:width .18s ease, fill .18s ease; }
    .gcr-val   { fill:#c8cfe0; font:600 9.5px 'JetBrains Mono',monospace;
                 dominant-baseline:middle; }
    .gcr-axlbl { fill:#4a5168; font:600 8.5px 'JetBrains Mono',monospace;
                 letter-spacing:.08em; text-transform:uppercase; text-anchor:middle; }
    .gcr-snap  { stroke:rgba(255,255,255,.18); stroke-width:1.5; stroke-dasharray:4 4; }
    .gcr-snlbl { fill:rgba(255,255,255,.35); font:500 8.5px 'JetBrains Mono',monospace;
                 text-anchor:middle; }

    .gcr-ctrl { display:flex; flex-direction:column; gap:6px; }
    .gcr-field { display:flex; flex-direction:column; gap:3px; }
    .gcr-field label { display:flex; justify-content:space-between; align-items:baseline;
      font:500 9px/1.3 'JetBrains Mono',monospace; letter-spacing:.08em;
      text-transform:uppercase; color:#4a5168; }
    .gcr-field output { font-variant-numeric:tabular-nums; color:#e0e4f0; }
    .gcr-field input[type=range] { width:100%; cursor:pointer; accent-color:#22d3ee; }
    .gcr-ethline { font:500 9px/1.4 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#4a5168; margin-top:4px; }
    .gcr-ethline span { color:#7a8298; text-transform:none; letter-spacing:0; }

    .gcr-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11px/1.6 'JetBrains Mono',monospace; color:#7a8298; }
    .gcr-regime { font:700 14px/1.2 'JetBrains Mono',monospace; margin-top:2px; }
    .gcr-ph { font-size:8.5px; letter-spacing:.1em; text-transform:uppercase;
      color:#4a5168; padding-bottom:3px;
      border-bottom:1px solid rgba(124,140,255,.1); margin-bottom:4px; }
    .gcr-row { display:flex; align-items:baseline; justify-content:space-between;
      gap:4px 6px; min-width:0; }
    .gcr-row span { font-size:10px; color:#7a8298; min-width:0; overflow-wrap:anywhere; }
    .gcr-row b { font-weight:700; color:#e0e4f0; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .gcr-strats { display:flex; flex-direction:column; gap:5px; }
    .gcr-strat { font-size:10px; line-height:1.4; color:#7a8298;
      padding-left:1.3em; text-indent:-1.3em; }
    .gcr-strat::before { content:'✓ '; }
  `;
  stage.appendChild(style);

  // ── SVG ─────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'gcr-wrap';
  stage.appendChild(wrap);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);

  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${ML},${MT})`);
  svg.appendChild(g);

  // Grid + x-axis ticks
  for (const v of GRID_VALS) {
    const x = xScale(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('class', 'gcr-grid');
    line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
    line.setAttribute('y1', '0');       line.setAttribute('y2', String(PLOT_H));
    g.appendChild(line);

    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('class', 'gcr-axis');
    lbl.setAttribute('x', String(x));
    lbl.setAttribute('y', String(PLOT_H + 13));
    lbl.setAttribute('text-anchor', 'middle');
    lbl.textContent = v < 1 ? `$${v}` : v < 1000 ? `$${v}` : `$${v / 1000}k`;
    g.appendChild(lbl);
  }

  // X-axis label
  const axLbl = document.createElementNS(NS, 'text');
  axLbl.setAttribute('class', 'gcr-axlbl');
  axLbl.setAttribute('x', String(PLOT_W / 2));
  axLbl.setAttribute('y', String(PLOT_H + 32));
  axLbl.textContent = 'cost per transaction (USD)';
  g.appendChild(axLbl);

  // Snapshot marker line at avg gas cost of Uniswap swap
  const snapLine = document.createElementNS(NS, 'line');
  snapLine.setAttribute('class', 'gcr-snap');
  snapLine.setAttribute('y1', '0'); snapLine.setAttribute('y2', String(PLOT_H));
  g.appendChild(snapLine);
  const snapLbl = document.createElementNS(NS, 'text');
  snapLbl.setAttribute('class', 'gcr-snlbl');
  snapLbl.setAttribute('y', '-6');
  snapLbl.textContent = 'today';
  g.appendChild(snapLbl);

  // Bars + labels + value text
  const barEls: SVGRectElement[]  = [];
  const valEls: SVGTextElement[]  = [];

  OPS.forEach((op, i) => {
    const cy = i * (PLOT_H / N) + BAR_GAP / 2;

    const opLbl = document.createElementNS(NS, 'text');
    opLbl.setAttribute('class', 'gcr-oplbl');
    opLbl.setAttribute('x', '-10');
    opLbl.setAttribute('y', String(cy + BAR_H / 2));
    opLbl.textContent = op.label;
    g.appendChild(opLbl);

    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('class', 'gcr-bar');
    bar.setAttribute('x', '0'); bar.setAttribute('y', String(cy));
    bar.setAttribute('height', String(BAR_H)); bar.setAttribute('width', '0');
    g.appendChild(bar);
    barEls.push(bar);

    const val = document.createElementNS(NS, 'text');
    val.setAttribute('class', 'gcr-val');
    val.setAttribute('y', String(cy + BAR_H / 2));
    g.appendChild(val);
    valEls.push(val);
  });

  // ── Panel ───────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'gcr-panel';
  panelEl.innerHTML = `
    <div>
      <div class="gcr-ph">Current Regime</div>
      <div class="gcr-regime" id="gcr-rl">—</div>
    </div>
    <div>
      <div class="gcr-ph">Key operation costs</div>
      <div id="gcr-rows"></div>
    </div>
    <div>
      <div class="gcr-ph">Viable strategies</div>
      <div class="gcr-strats" id="gcr-strats"></div>
    </div>
  `;
  panel.appendChild(panelEl);

  const regimeLbl = panelEl.querySelector('#gcr-rl')    as HTMLElement;
  const rowsEl    = panelEl.querySelector('#gcr-rows')  as HTMLElement;
  const stratsEl  = panelEl.querySelector('#gcr-strats') as HTMLElement;

  // ── Controls ─────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'gcr-ctrl';
  const initSlider = gweiToSlider(SNAP.avg_gwei).toFixed(1);
  ctrlDiv.innerHTML = `
    <div class="gcr-field">
      <label>Gas price <output id="gcr-gout">${fmtGwei(SNAP.avg_gwei)}</output></label>
      <input type="range" id="gcr-sl" min="0" max="100" step="0.1" value="${initSlider}">
    </div>
    <div class="gcr-ethline">ETH price · <span>$${ETH.toLocaleString()} (Jun 2026 snapshot)</span></div>
  `;
  ctrlSlot.appendChild(ctrlDiv);

  // ── Caption ──────────────────────────────────────────────────────────────
  caption.textContent =
    `Gas units: Ethereum Yellow Paper, Uniswap V3 & Aave V3 specs · ${SNAP.source} · ${SNAP.as_of}`;

  // ── Render ────────────────────────────────────────────────────────────────
  const KEY_IDS = ['erc20_transfer', 'uniswap_v3_swap', 'erc4337_userop', 'aave_liquidation'];

  function update(gwei: number) {
    const regime = getRegime(gwei);

    OPS.forEach((op, i) => {
      const cost = gasCostUSD(op.gas, gwei);
      const w = Math.max(2, Math.min(PLOT_W, xScale(cost)));
      const fill =
        cost < 0.10 ? '#22d3ee' :
        cost < 1    ? '#84cc16' :
        cost < 20   ? '#f59e0b' :
                      '#ef4444';
      barEls[i].setAttribute('width', String(w));
      barEls[i].setAttribute('fill', fill);

      const valX = Math.min(w + 5, PLOT_W - 48);
      valEls[i].setAttribute('x', String(valX));
      valEls[i].textContent = fmtUSD(cost);
    });

    // Snapshot marker — today's avg cost on Uniswap swap
    const todayX = xScale(gasCostUSD(130000, SNAP.avg_gwei));
    snapLine.setAttribute('x1', String(todayX)); snapLine.setAttribute('x2', String(todayX));
    snapLbl.setAttribute('x', String(todayX));

    // Panel
    regimeLbl.textContent = regime.label;
    regimeLbl.style.color = regime.color;

    rowsEl.innerHTML = KEY_IDS.map(id => {
      const op = OPS.find(o => o.id === id)!;
      const cost = gasCostUSD(op.gas, gwei);
      return `<div class="gcr-row"><span>${op.label}</span><b>${fmtUSD(cost)}</b></div>`;
    }).join('');

    stratsEl.innerHTML = regime.strategies
      .map(s => `<div class="gcr-strat">${s}</div>`)
      .join('');
  }

  const slider = ctrlDiv.querySelector('#gcr-sl')   as HTMLInputElement;
  const gweiOut = ctrlDiv.querySelector('#gcr-gout') as HTMLOutputElement;

  function onSlider() {
    const g = sliderToGwei(parseFloat(slider.value));
    gweiOut.textContent = fmtGwei(g);
    update(g);
  }

  slider.addEventListener('input', onSlider);
  update(SNAP.avg_gwei);

  return () => {
    layout.dispose();
    style.remove();
    slider.removeEventListener('input', onSlider);
  };
}
