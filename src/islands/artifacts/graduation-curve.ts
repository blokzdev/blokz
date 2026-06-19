/**
 * Artifact: graduation-curve — The Graduation Curve
 * Manifest: content/artifacts/graduation-curve/manifest.json
 *
 * An interactive SVG chart of the bonding curve an agent-token launchpad
 * (Virtuals on Base) uses to price a new AI-agent token. The curve is a
 * constant product x·y = k over *virtual* reserves: read off the live Bonding
 * contract, K = 3e12 and assetRate = 5000 give k = K·1e4/assetRate = 6e12,
 * seeded as 6,000 virtual VIRTUAL against the 1e9 token supply. Spot price is
 * P = Rv/Rt = k/Rt², so the area under P(tokens sold) equals the VIRTUAL
 * raised — graduation fires when the token reserve falls to 125,000,000,
 * i.e. exactly 42,000 VIRTUAL accumulated. Everything is derived live from the
 * on-chain primitives in ./data.json; no runtime fetches.
 *
 * Drag the slider (or tap/drag the chart) to spend VIRTUAL along the curve and
 * read out tokens sold, spot/average price, FDV and USD; toggle the
 * halfway-money split to see the first 21,000 VIRTUAL buy ~89% of curve supply.
 *
 * Layout: shared responsive primitive (stage chart · panel readout · footer
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/graduation-curve/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const K_CURVE = data.curveConstant; // 6e12, whole-unit constant product Rv·Rt
const RV0 = data.initialVirtualReserve; // 6,000 virtual VIRTUAL
const SUPPLY = data.totalSupply; // 1e9 agent tokens
const RT_GRAD = data.gradTokenReserve; // 125,000,000 tokens remaining at graduation
const RAISED_MAX = data.graduationRaised; // 42,000 VIRTUAL
const TOKENS_GRAD = data.tokensSoldAtGraduation; // 875,000,000 sold on the curve
const VPRICE = data.virtualPriceUsd; // VIRTUAL/USD snapshot

/* --- Curve math (all whole units; reserves Rv = VIRTUAL, Rt = agent tokens) --- */
const rvOf = (raised: number) => RV0 + raised; // VIRTUAL reserve after `raised` raised
const rtOf = (raised: number) => K_CURVE / rvOf(raised); // token reserve (constant product)
const tokensSold = (raised: number) => SUPPLY - rtOf(raised); // tokens off the curve
const spot = (raised: number) => rvOf(raised) / rtOf(raised); // marginal price VIRTUAL/token
const POOL_OPEN = RAISED_MAX / RT_GRAD; // Uniswap pool opening price: 42,000 / 125,000,000

const PGRAD = spot(RAISED_MAX); // 3.84e-4

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 800;
const VB_H = 430;
const X0 = 64;
const X1 = 770;
const Y_TOP = 54;
const Y_BASE = 360;
const Y_MAX = 4.1e-4; // a touch above PGRAD so the curve crown and pool tick both sit inside

const xOf = (tokens: number) => X0 + (tokens / SUPPLY) * (X1 - X0);
const yOf = (price: number) => Y_BASE - (price / Y_MAX) * (Y_BASE - Y_TOP);

/* --- Formatters --- */
function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}
function fmtVirtual(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toPrecision(2);
}
const fmtPrice = (p: number) => p.toExponential(2); // VIRTUAL/token
function fmtUsd(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.001) return `$${v.toFixed(4)}`;
  return `$${v.toExponential(1)}`;
}
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

export default function mount(container: HTMLElement): () => void {
  /* ---- State: position is parameterised by VIRTUAL raised (the money spent) ---- */
  let raised = RAISED_MAX * 0.62; // a telling default: mid-ramp, price already climbing
  let showSplit = false;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(200px, 52vw, 340px)',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .gc-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .gc-spend { flex:1; min-width:210px; display:flex; flex-direction:column; gap:2px; }
    .gc-spend label { display:flex; justify-content:space-between; gap:8px;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .gc-spend output { color:#e7eaf3; font-size:11px; text-transform:none; }
    .gc-spend output i { color:#22d3ee; font-style:normal; }
    .gc-spend input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:2px 0 0; }
    .gc-toggle { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 10.5px 'JetBrains Mono', monospace;
      letter-spacing:.05em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s; }
    .gc-toggle[aria-pressed="true"] { background:rgba(139,92,246,.15); color:#e7eaf3;
      border-color:rgba(139,92,246,.4); }
    .gc-toggle:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .gc-chartwrap { position:absolute; inset:0; min-height:170px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .gc-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:none; }
    .gc-grid { stroke:rgba(124,140,255,.1); }
    .gc-axis { fill:#5b6378; font:500 12px 'JetBrains Mono', monospace; }
    .gc-axislab { fill:#5b6378; font:500 11px 'JetBrains Mono', monospace; }
    .gc-curve { fill:none; stroke:#5b8cff; stroke-width:2.4; }
    .gc-area { fill:rgba(91,140,255,.16); stroke:none; }
    .gc-lp { fill:rgba(139,92,246,.07); }
    .gc-lplab { fill:#7c5fd0; font:600 10.5px 'JetBrains Mono', monospace; }
    .gc-grad { stroke:#22d3ee; stroke-width:1.4; stroke-dasharray:5 4; }
    .gc-gradlab { fill:#22d3ee; font:600 11.5px 'JetBrains Mono', monospace; }
    .gc-pool { stroke:#8b5cf6; stroke-width:1.4; stroke-dasharray:3 3; }
    .gc-poollab { fill:#a78bfa; font:600 10.5px 'JetBrains Mono', monospace; }
    .gc-split { stroke:#f5a524; stroke-width:1.3; stroke-dasharray:4 3; }
    .gc-splitlab { fill:#f5a524; font:600 10.5px 'JetBrains Mono', monospace; }
    .gc-marker { stroke:#e7eaf3; stroke-width:1.3; }
    .gc-dot { fill:#22d3ee; stroke:#05070d; stroke-width:1.5; }
    .gc-hit { fill:transparent; cursor:ew-resize; }
    .gc-readout { display:flex; flex-wrap:wrap; gap:4px 18px; min-height:34px;
      font:500 11.5px/1.45 'JetBrains Mono', monospace;
      color:#8d95ad; font-variant-numeric:tabular-nums; }
    .gc-readout div { white-space:nowrap; }
    .gc-readout b { color:#e7eaf3; font-weight:600; }
    .gc-readout i { color:#22d3ee; font-style:normal; }
    .gc-note { font:500 9.5px/1.45 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.02em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'gc-controls';

  const spend = document.createElement('div');
  spend.className = 'gc-spend';
  const spendLabel = document.createElement('label');
  spendLabel.htmlFor = 'gc-spend';
  const spendName = document.createElement('span');
  spendName.textContent = 'VIRTUAL spent into curve';
  const spendOut = document.createElement('output');
  spendLabel.append(spendName, spendOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'gc-spend';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = String((raised / RAISED_MAX) * 1000);
  slider.setAttribute('aria-label', 'VIRTUAL spent into the bonding curve, 0 to 42,000');
  spend.append(spendLabel, slider);

  const splitBtn = document.createElement('button');
  splitBtn.type = 'button';
  splitBtn.className = 'gc-toggle';
  splitBtn.textContent = 'mark the halfway money';
  splitBtn.setAttribute('aria-pressed', 'false');

  controls.append(spend, splitBtn);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'gc-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  /* axis title */
  const axisTitle = document.createElementNS(NS, 'text');
  axisTitle.setAttribute('x', String(X0 - 6));
  axisTitle.setAttribute('y', '28');
  axisTitle.setAttribute('class', 'gc-axis');
  axisTitle.textContent = 'spot price · VIRTUAL per token';
  svg.appendChild(axisTitle);

  /* y gridlines at a few price levels */
  for (const p of [1e-4, 2e-4, 3e-4, 4e-4]) {
    const y = yOf(p);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'gc-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(X0 - 8));
    t.setAttribute('y', String(y + 3));
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('class', 'gc-axislab');
    t.textContent = p.toExponential(0);
    svg.appendChild(t);
  }

  /* baseline + x labels (tokens sold) */
  const base = document.createElementNS(NS, 'line');
  base.setAttribute('x1', String(X0));
  base.setAttribute('x2', String(X1));
  base.setAttribute('y1', String(Y_BASE));
  base.setAttribute('y2', String(Y_BASE));
  base.setAttribute('stroke', 'rgba(124,140,255,.28)');
  svg.appendChild(base);
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const tokens = frac * SUPPLY;
    const x = xOf(tokens);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(Y_BASE + 18));
    t.setAttribute('text-anchor', frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle');
    t.setAttribute('class', 'gc-axislab');
    t.textContent = fmtTokens(tokens);
    svg.appendChild(t);
  }
  const xTitle = document.createElementNS(NS, 'text');
  xTitle.setAttribute('x', String((X0 + X1) / 2));
  xTitle.setAttribute('y', String(Y_BASE + 36));
  xTitle.setAttribute('text-anchor', 'middle');
  xTitle.setAttribute('class', 'gc-axis');
  xTitle.textContent = 'agent tokens sold from the curve (of 1B supply)';
  svg.appendChild(xTitle);

  /* LP reserve region (tokens never sold on the curve: 875M → 1B) */
  const lpRect = document.createElementNS(NS, 'rect');
  lpRect.setAttribute('x', String(xOf(TOKENS_GRAD)));
  lpRect.setAttribute('y', String(Y_TOP));
  lpRect.setAttribute('width', String(X1 - xOf(TOKENS_GRAD)));
  lpRect.setAttribute('height', String(Y_BASE - Y_TOP));
  lpRect.setAttribute('class', 'gc-lp');
  svg.appendChild(lpRect);
  const lpLab = document.createElementNS(NS, 'text');
  lpLab.setAttribute('x', String((xOf(TOKENS_GRAD) + X1) / 2));
  lpLab.setAttribute('y', String(Y_TOP + 14));
  lpLab.setAttribute('text-anchor', 'middle');
  lpLab.setAttribute('class', 'gc-lplab');
  lpLab.textContent = '125M → LP';
  svg.appendChild(lpLab);

  /* precompute curve sample points across the sold range */
  const SAMPLES = 160;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const r = (RAISED_MAX * i) / SAMPLES;
    pts.push([xOf(tokensSold(r)), yOf(spot(r))]);
  }
  const curvePath = 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');

  /* filled area under the curve up to the marker (VIRTUAL raised) */
  const area = document.createElementNS(NS, 'path');
  area.setAttribute('class', 'gc-area');
  svg.appendChild(area);

  /* the curve itself */
  const curve = document.createElementNS(NS, 'path');
  curve.setAttribute('class', 'gc-curve');
  curve.setAttribute('d', curvePath);
  svg.appendChild(curve);

  /* pool-open price tick across the LP region */
  const poolLine = document.createElementNS(NS, 'line');
  poolLine.setAttribute('x1', String(xOf(TOKENS_GRAD)));
  poolLine.setAttribute('x2', String(X1));
  poolLine.setAttribute('y1', String(yOf(POOL_OPEN)));
  poolLine.setAttribute('y2', String(yOf(POOL_OPEN)));
  poolLine.setAttribute('class', 'gc-pool');
  svg.appendChild(poolLine);
  const poolLab = document.createElementNS(NS, 'text');
  poolLab.setAttribute('x', String(X1));
  poolLab.setAttribute('y', String(yOf(POOL_OPEN) + 14));
  poolLab.setAttribute('text-anchor', 'end');
  poolLab.setAttribute('class', 'gc-poollab');
  poolLab.textContent = `pool opens ${POOL_OPEN.toExponential(2)} · −${pct(1 - POOL_OPEN / PGRAD)}`;
  svg.appendChild(poolLab);

  /* graduation line */
  const gradLine = document.createElementNS(NS, 'line');
  gradLine.setAttribute('x1', String(xOf(TOKENS_GRAD)));
  gradLine.setAttribute('x2', String(xOf(TOKENS_GRAD)));
  gradLine.setAttribute('y1', String(Y_TOP));
  gradLine.setAttribute('y2', String(Y_BASE));
  gradLine.setAttribute('class', 'gc-grad');
  svg.appendChild(gradLine);
  const gradLab = document.createElementNS(NS, 'text');
  gradLab.setAttribute('x', String(xOf(TOKENS_GRAD) - 6));
  gradLab.setAttribute('y', String(Y_TOP + 12));
  gradLab.setAttribute('text-anchor', 'end');
  gradLab.setAttribute('class', 'gc-gradlab');
  gradLab.textContent = 'graduate · 42k VIRTUAL';
  svg.appendChild(gradLab);

  /* halfway-money split overlay (raised = 21,000) — toggled */
  const HALF_RAISED = RAISED_MAX / 2;
  const splitG = document.createElementNS(NS, 'g');
  splitG.style.display = 'none';
  const splitLine = document.createElementNS(NS, 'line');
  splitLine.setAttribute('x1', String(xOf(tokensSold(HALF_RAISED))));
  splitLine.setAttribute('x2', String(xOf(tokensSold(HALF_RAISED))));
  splitLine.setAttribute('y1', String(Y_TOP));
  splitLine.setAttribute('y2', String(Y_BASE));
  splitLine.setAttribute('class', 'gc-split');
  splitG.appendChild(splitLine);
  const splitLab = document.createElementNS(NS, 'text');
  splitLab.setAttribute('x', String(xOf(tokensSold(HALF_RAISED)) - 6));
  splitLab.setAttribute('y', String(Y_BASE - 8));
  splitLab.setAttribute('text-anchor', 'end');
  splitLab.setAttribute('class', 'gc-splitlab');
  splitLab.textContent = `21k VIRTUAL → ${pct(tokensSold(HALF_RAISED) / TOKENS_GRAD)} of curve supply`;
  splitG.appendChild(splitLab);
  svg.appendChild(splitG);

  /* marker (vertical line + dot on the curve) */
  const marker = document.createElementNS(NS, 'line');
  marker.setAttribute('class', 'gc-marker');
  marker.setAttribute('y1', String(Y_TOP));
  marker.setAttribute('y2', String(Y_BASE));
  svg.appendChild(marker);
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('class', 'gc-dot');
  dot.setAttribute('r', '5');
  svg.appendChild(dot);

  /* transparent hit-area for tap/drag on the plot */
  const hit = document.createElementNS(NS, 'rect');
  hit.setAttribute('class', 'gc-hit');
  hit.setAttribute('x', String(X0));
  hit.setAttribute('y', String(Y_TOP));
  hit.setAttribute('width', String(X1 - X0));
  hit.setAttribute('height', String(Y_BASE - Y_TOP));
  svg.appendChild(hit);

  /* ---- Readout ---- */
  const readout = document.createElement('div');
  readout.className = 'gc-readout';
  panel.appendChild(readout);
  const note = document.createElement('div');
  note.className = 'gc-note';
  note.textContent =
    'constant product Rv·Rt = 6e12 over virtual reserves (6,000 VIRTUAL × 1B tokens) · area under the curve = VIRTUAL raised · constants read off Base';
  caption.appendChild(note);

  /* ---- Rendering ---- */
  function render() {
    const r = raised;
    const sold = tokensSold(r);
    const x = xOf(sold);
    const p = spot(r);
    const y = yOf(p);

    /* area under curve up to current tokens-sold, then back along baseline */
    let aPath = 'M' + X0 + ',' + Y_BASE;
    for (const [px, py] of pts) {
      if (px <= x) aPath += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    aPath += ` L${x.toFixed(1)},${y.toFixed(1)} L${x.toFixed(1)},${Y_BASE} Z`;
    area.setAttribute('d', aPath);

    marker.setAttribute('x1', String(x));
    marker.setAttribute('x2', String(x));
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));

    /* slider + label */
    const want = String(Math.round((r / RAISED_MAX) * 1000));
    if (slider.value !== want) slider.value = want;
    spendOut.innerHTML = '';
    const sv = document.createElement('i');
    sv.textContent = `${fmtVirtual(r)} / 42k VIRTUAL`;
    spendOut.append(sv, ` · ${fmtUsd(r * VPRICE)}`);

    /* readout grid */
    const avg = sold > 0 ? r / sold : 0;
    const fdv = p * SUPPLY;
    readout.innerHTML = '';
    const cell = (html: string) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      readout.appendChild(d);
    };
    cell(`raised <b>${fmtVirtual(r)}</b> VIRTUAL · <i>${pct(r / RAISED_MAX)}</i> to graduation`);
    cell(`tokens sold <b>${fmtTokens(sold)}</b> · ${pct(sold / SUPPLY)} of supply`);
    cell(`spot <b>${fmtPrice(p)}</b> · <i>${fmtUsd(p * VPRICE)}</i>`);
    cell(`avg paid <b>${fmtPrice(avg)}</b> · ${avg > 0 ? `${(p / avg).toFixed(2)}× over avg` : '—'}`);
    cell(`FDV <b>${fmtVirtual(fdv)}</b> VIRTUAL · <i>${fmtUsd(fdv * VPRICE)}</i>`);
  }

  /* ---- Interaction: slider, tap/drag on plot, toggle ---- */
  const onSlide = () => {
    raised = (Number(slider.value) / 1000) * RAISED_MAX;
    render();
  };
  slider.addEventListener('input', onSlide);

  let dragging = false;
  const raisedFromX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const tokens = Math.min(TOKENS_GRAD, Math.max(0, ((vx - X0) / (X1 - X0)) * SUPPLY));
    // invert tokensSold: Rt = SUPPLY - tokens, raised = K/Rt - RV0
    const rt = Math.max(RT_GRAD, SUPPLY - tokens);
    return Math.min(RAISED_MAX, Math.max(0, K_CURVE / rt - RV0));
  };
  const onDown = (e: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    raised = raisedFromX(e.clientX);
    render();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    raised = raisedFromX(e.clientX);
    render();
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  hit.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  const onToggle = () => {
    showSplit = !showSplit;
    splitBtn.setAttribute('aria-pressed', String(showSplit));
    splitG.style.display = showSplit ? '' : 'none';
  };
  splitBtn.addEventListener('click', onToggle);

  render();

  return () => {
    layout.dispose();
    slider.removeEventListener('input', onSlide);
    hit.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    splitBtn.removeEventListener('click', onToggle);
    style.remove();
  };
}
