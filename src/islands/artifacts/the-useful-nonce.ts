/**
 * Artifact: the-useful-nonce — The Useful Nonce
 *
 * Interactive calculator for Proof-of-Useful-Work (PoUW) overhead.
 * The Freivalds randomised matrix multiplication check adds exactly
 * 3/(2N) overhead on top of an N×N×N matmul, approaching zero as N grows.
 * Drag the operating point to explore overhead % vs. matrix size and to see
 * how much of Bitcoin's ~150 TWh/year would become real AI compute under PoUW.
 *
 * Layout: rail template — SVG curve in stage, metrics in panel, N slider in controls.
 */

import data from '../../../content/artifacts/the-useful-nonce/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const S = 'http://www.w3.org/2000/svg';

// ViewBox dimensions
const VW = 400, VH = 220;
// Chart margins
const X0 = 52, X1 = 390, Y0 = 18, Y1 = 178;

// Freivalds overhead as a percent of the matmul cost
// Flops: matmul = 2N³, check = 3N² → overhead = 3/(2N) × 100
const overheadPct = (n: number) => (3 / (2 * n)) * 100;

const N_STEPS = data.n_steps;
const N_MIN = N_STEPS[0];
const N_MAX = N_STEPS[N_STEPS.length - 1];

// Log₂-spaced x axis
const chartX = (n: number) =>
  X0 + ((Math.log2(n) - Math.log2(N_MIN)) / (Math.log2(N_MAX) - Math.log2(N_MIN))) * (X1 - X0);

// Y axis: 0.005 % to 5 % on log scale
const Y_HI = Math.log10(5);
const Y_LO = Math.log10(0.005);
const chartY = (pct: number) => Y0 + ((Y_HI - Math.log10(pct)) / (Y_HI - Y_LO)) * (Y1 - Y0);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt4 = (v: number) => v < 0.01 ? v.toFixed(4) : v < 0.1 ? v.toFixed(3) : v.toFixed(2);
const fmtN = (n: number) => n >= 1024 ? `${n / 1024}K` : String(n);

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .un-svg { width:100%; height:100%; display:block; overflow:visible;
      font-family:'JetBrains Mono',monospace; cursor:ew-resize; }
    .un-svg text { fill:#8d95ad; }
    .un-dot { cursor:ew-resize; }
    .un-dot:focus-visible { outline:2px solid #f5b54a; outline-offset:2px; border-radius:50%; }

    .un-panel { display:flex; flex-direction:column; gap:9px; min-width:0;
      font:500 11.5px/1.4 'JetBrains Mono',monospace; color:#8d95ad; }
    .un-card { background:#0d1322; border:1px solid rgba(124,140,255,.14); border-radius:10px;
      padding:10px 12px; display:flex; flex-direction:column; gap:6px; min-width:0; }
    .un-heading { font-size:9px; letter-spacing:.08em; text-transform:uppercase;
      color:#5b6378; margin-bottom:2px; }
    .un-row { display:flex; justify-content:space-between; gap:8px; min-width:0; flex-wrap:nowrap; }
    .un-row span { font-size:10.5px; color:#8d95ad; white-space:nowrap; }
    .un-row b { font-size:10.5px; color:#e7eaf3; font-variant-numeric:tabular-nums;
      white-space:nowrap; }
    .un-row b.hi { color:#22d3ee; }
    .un-row b.warn { color:#f0883e; }

    .un-bars { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .un-blabel { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:9.5px; color:#8d95ad; }
    .un-blabel b { font-variant-numeric:tabular-nums; }
    .un-btrack { height:7px; border-radius:4px; background:rgba(124,140,255,.12);
      overflow:hidden; min-width:0; }
    .un-bfill { height:100%; border-radius:4px; transition:width .25s ease; }
    .un-bfill.btc { background:#f0883e; }
    .un-bfill.pouw { background:linear-gradient(90deg,#22d3ee,#7c8cff); }

    .un-controls { min-width:0; }
    .un-field { min-width:0; }
    .un-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378;
      margin-bottom:5px; }
    .un-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; }
    .un-field input[type=range] { width:100%; cursor:pointer; accent-color:#f5b54a;
      display:block; margin-top:2px; }

    .un-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.6; min-width:0; }
    .un-cap b { color:#8d95ad; }
  `;
  stage.appendChild(style);
  panel.classList.add('un-panel');
  controls.classList.add('un-controls');

  // ── SVG stage ───────────────────────────────────────────────────────────────
  const svg = document.createElementNS(S, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'un-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Freivalds PoUW overhead vs. matrix size N');

  const mk = (tag: string, attrs: Record<string, string | number> = {}, parent: Element = svg) => {
    const el = document.createElementNS(S, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    parent.appendChild(el);
    return el;
  };

  // Y grid lines at 5%, 1%, 0.1%, 0.01%, 0.005%
  for (const pct of [5, 1, 0.1, 0.01, 0.005]) {
    const y = chartY(pct);
    mk('line', { x1: X0, y1: y, x2: X1, y2: y,
      stroke: 'rgba(124,140,255,.10)', 'stroke-width': .5 });
    const lbl = mk('text', { x: X0 - 4, y: y + 3.5,
      'text-anchor': 'end', 'font-size': 7.5 });
    lbl.textContent = pct < 1 ? `${pct}%` : `${pct}%`;
  }

  // X grid lines at each N step
  for (const n of N_STEPS) {
    mk('line', { x1: chartX(n), y1: Y0, x2: chartX(n), y2: Y1,
      stroke: 'rgba(124,140,255,.10)', 'stroke-width': .5 });
  }

  // Axes
  mk('line', { x1: X0, y1: Y1, x2: X1, y2: Y1,
    stroke: 'rgba(124,140,255,.30)', 'stroke-width': 1 });
  mk('line', { x1: X0, y1: Y0, x2: X0, y2: Y1,
    stroke: 'rgba(124,140,255,.30)', 'stroke-width': 1 });

  // X tick labels
  for (const n of N_STEPS) {
    const x = chartX(n);
    mk('line', { x1: x, y1: Y1, x2: x, y2: Y1 + 3,
      stroke: 'rgba(124,140,255,.3)', 'stroke-width': 1 });
    const lbl = mk('text', { x, y: Y1 + 11.5,
      'text-anchor': 'middle', 'font-size': 7.5 });
    lbl.textContent = fmtN(n);
  }

  // Axis labels
  const xLbl = mk('text', { x: (X0 + X1) / 2, y: VH - 3,
    'text-anchor': 'middle', 'font-size': 9, fill: '#8d95ad' });
  xLbl.textContent = 'matrix dimension N  (N×N matmul)  →';
  const yLbl = mk('text', { x: 9, y: (Y0 + Y1) / 2,
    'text-anchor': 'middle', 'font-size': 8, fill: '#8d95ad',
    transform: `rotate(-90,9,${(Y0 + Y1) / 2})` });
  yLbl.textContent = 'overhead %';

  // Bitcoin PoW reference bar (100 % — annotated above chart)
  const btcBarY = Y0 - 7;
  mk('line', { x1: X0, y1: btcBarY, x2: X1, y2: btcBarY,
    stroke: '#f0883e', 'stroke-width': 1.5, 'stroke-dasharray': '5 3' });
  const btcLbl = mk('text', { x: X1 - 2, y: btcBarY - 3,
    'text-anchor': 'end', 'font-size': 7.5, fill: '#f0883e' });
  btcLbl.textContent = 'Bitcoin PoW — 100% overhead (0% useful)';

  // Shaded area under the Freivalds curve
  const areaPts: string[] = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const n = Math.pow(N_MAX / N_MIN, t) * N_MIN;
    const pct = overheadPct(n);
    if (pct >= 0.004 && pct <= 6) {
      areaPts.push(`${chartX(n).toFixed(1)},${chartY(pct).toFixed(1)}`);
    }
  }
  mk('polygon', {
    points: [...areaPts, `${X1},${Y1}`, `${X0},${Y1}`].join(' '),
    fill: 'rgba(124,140,255,.07)',
  });

  // Freivalds overhead curve
  mk('polyline', {
    points: areaPts.join(' '),
    fill: 'none',
    stroke: '#7c8cff',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  // Curve label
  const curveLbl = mk('text', { x: X0 + 8, y: chartY(overheadPct(200)) - 5,
    'font-size': 8, fill: '#7c8cff' });
  curveLbl.textContent = '3 / (2N)';

  // Operating point elements (rendered on top)
  const opVLine = mk('line', { stroke: 'rgba(245,181,74,.45)', 'stroke-width': 1,
    'stroke-dasharray': '4 2' });
  const opDot = document.createElementNS(S, 'circle');
  opDot.setAttribute('r', '5.5');
  opDot.setAttribute('fill', '#f5b54a');
  opDot.setAttribute('stroke', '#0a0f1b');
  opDot.setAttribute('stroke-width', '1.5');
  opDot.setAttribute('class', 'un-dot');
  opDot.setAttribute('tabindex', '0');
  opDot.setAttribute('role', 'slider');
  opDot.setAttribute('aria-label', 'matrix dimension N');
  opDot.setAttribute('aria-valuemin', String(N_MIN));
  opDot.setAttribute('aria-valuemax', String(N_MAX));
  svg.appendChild(opDot);

  const opNLbl = mk('text', { 'text-anchor': 'middle', 'font-size': 8.5,
    fill: '#f5b54a', 'font-weight': '700' });
  const opPctLbl = mk('text', { 'text-anchor': 'end', 'font-size': 8,
    fill: '#f5b54a' });

  // Transparent drag surface over the whole chart
  const dragSurf = mk('rect', {
    x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, fill: 'transparent',
  });

  stage.appendChild(svg);

  // ── Panel ────────────────────────────────────────────────────────────────────
  const card1 = document.createElement('div');
  card1.className = 'un-card';
  card1.innerHTML = '<div class="un-heading">Freivalds Check — Operating Point</div>';

  const metricEls: Record<string, HTMLElement> = {};
  for (const [key, label] of [
    ['n',       'Matrix size N'],
    ['ov',      'Overhead'],
    ['useful',  'Useful FLOPs'],
    ['detect',  'Fraud detection'],
  ]) {
    const row = document.createElement('div');
    row.className = 'un-row';
    const sp = document.createElement('span');
    sp.textContent = label;
    const b = document.createElement('b');
    metricEls[key] = b;
    row.append(sp, b);
    card1.appendChild(row);
  }
  panel.appendChild(card1);

  // Comparison bars
  const card2 = document.createElement('div');
  card2.className = 'un-card';
  card2.innerHTML = '<div class="un-heading">Useful Compute Fraction</div>';
  const bars = document.createElement('div');
  bars.className = 'un-bars';

  const btcBarRow = document.createElement('div');
  btcBarRow.innerHTML = `
    <div class="un-blabel"><span>Bitcoin PoW (SHA-256)</span><b class="warn">0%</b></div>
    <div class="un-btrack"><div class="un-bfill btc" style="width:0%"></div></div>`;
  bars.appendChild(btcBarRow);

  const pouwBarRow = document.createElement('div');
  const pouwLabel = document.createElement('div');
  pouwLabel.className = 'un-blabel';
  const pouwPctEl = document.createElement('b');
  pouwPctEl.className = 'hi';
  pouwLabel.innerHTML = '<span>PoUW (Freivalds check)</span>';
  pouwLabel.appendChild(pouwPctEl);
  const pouwTrack = document.createElement('div');
  pouwTrack.className = 'un-btrack';
  const pouwFill = document.createElement('div');
  pouwFill.className = 'un-bfill pouw';
  pouwTrack.appendChild(pouwFill);
  pouwBarRow.append(pouwLabel, pouwTrack);
  bars.appendChild(pouwBarRow);
  card2.appendChild(bars);
  panel.appendChild(card2);

  // Energy card
  const card3 = document.createElement('div');
  card3.className = 'un-card';
  card3.innerHTML = `<div class="un-heading">Bitcoin Energy Recaptured</div>`;
  const energyRow = document.createElement('div');
  energyRow.className = 'un-row';
  const energySp = document.createElement('span');
  energySp.textContent = `${data.bitcoin_energy_twh_2024} TWh/yr →`;
  const energyB = document.createElement('b');
  energyB.className = 'hi';
  metricEls['energy'] = energyB;
  energyRow.append(energySp, energyB);
  card3.appendChild(energyRow);
  panel.appendChild(card3);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const field = document.createElement('div');
  field.className = 'un-field';
  const fieldLabel = document.createElement('label');
  fieldLabel.htmlFor = 'un-n-slider';
  const fieldName = document.createElement('span');
  fieldName.textContent = 'Matrix dimension N';
  const fieldOut = document.createElement('output');
  fieldOut.id = 'un-n-out';
  fieldLabel.append(fieldName, fieldOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'un-n-slider';
  slider.min = '0';
  slider.max = String(N_STEPS.length - 1);
  slider.step = '1';
  slider.setAttribute('aria-label', 'matrix dimension N');
  field.append(fieldLabel, slider);
  controls.appendChild(field);

  // ── Caption ──────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'un-cap';
  cap.innerHTML =
    `Freivalds check: <b>overhead = 3/(2N)</b>. At N=4096 that's 0.037% — ` +
    `99.963% of every H100 GPU-second mines a block AND trains a model. ` +
    `Energy baseline: CBECI ${data.bitcoin_energy_twh_2024} TWh/yr (2024). ` +
    `Drag the amber dot or press ← → when focused.`;
  caption.appendChild(cap);

  // ── State ────────────────────────────────────────────────────────────────────
  let nIdx = 5; // start at N=4096

  function render() {
    const N = N_STEPS[nIdx];
    const ov = overheadPct(N);
    const useful = 100 - ov;
    const px = chartX(N);
    const py = chartY(ov);

    // SVG operating point
    opVLine.setAttribute('x1', String(px));
    opVLine.setAttribute('x2', String(px));
    opVLine.setAttribute('y1', String(Y0));
    opVLine.setAttribute('y2', String(Y1));
    opDot.setAttribute('cx', String(px));
    opDot.setAttribute('cy', String(py));
    opDot.setAttribute('aria-valuenow', String(N));
    opDot.setAttribute('aria-valuetext', `N = ${fmtN(N)}, overhead ${fmt4(ov)}%`);

    // label below the dot (avoid chart top/bottom clipping)
    opNLbl.setAttribute('x', String(clamp(px, X0 + 20, X1 - 20)));
    opNLbl.setAttribute('y', String(clamp(py + 16, Y0 + 12, Y1 - 4)));
    opNLbl.textContent = `N=${fmtN(N)}`;

    opPctLbl.setAttribute('x', String(X0 - 4));
    opPctLbl.setAttribute('y', String(clamp(py + 3.5, Y0 + 8, Y1 - 4)));
    opPctLbl.textContent = `${fmt4(ov)}%`;

    // panel metrics
    metricEls.n.textContent      = `${N.toLocaleString()}`;
    metricEls.ov.textContent     = `${fmt4(ov)}%`;
    metricEls.useful.textContent = `${(100 - ov).toFixed(4)}%`;
    metricEls.detect.textContent = `~100% (random field)`;

    metricEls.useful.className = 'hi';
    metricEls.ov.className     = '';

    // bars
    pouwPctEl.textContent  = `${useful.toFixed(2)}%`;
    pouwFill.style.width   = `${useful}%`;

    // energy card
    const reclaimed = (useful / 100) * data.bitcoin_energy_twh_2024;
    metricEls.energy.textContent = `${reclaimed.toFixed(1)} TWh AI compute`;

    // slider + output sync
    slider.value     = String(nIdx);
    fieldOut.textContent = fmtN(N);
  }

  // ── Interaction ──────────────────────────────────────────────────────────────
  function xToNIdx(clientX: number): number {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VW;
    const t = (svgX - X0) / (X1 - X0);
    const logN = t * (Math.log2(N_MAX) - Math.log2(N_MIN)) + Math.log2(N_MIN);
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < N_STEPS.length; i++) {
      const d = Math.abs(Math.log2(N_STEPS[i]) - logN);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  let dragging = false;

  function onDown(e: PointerEvent) {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    nIdx = xToNIdx(e.clientX);
    render();
    e.preventDefault();
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    nIdx = xToNIdx(e.clientX);
    render();
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      nIdx = Math.max(0, nIdx - 1);
      render();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      nIdx = Math.min(N_STEPS.length - 1, nIdx + 1);
      render();
      e.preventDefault();
    }
  }

  function onSlider() {
    nIdx = Number(slider.value);
    render();
  }

  dragSurf.addEventListener('pointerdown', onDown);
  opDot.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  opDot.addEventListener('keydown', onKey);
  slider.addEventListener('input', onSlider);

  render();

  return () => {
    layout.dispose();
    style.remove();
    dragSurf.removeEventListener('pointerdown', onDown);
    opDot.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    opDot.removeEventListener('keydown', onKey);
    slider.removeEventListener('input', onSlider);
  };
}
