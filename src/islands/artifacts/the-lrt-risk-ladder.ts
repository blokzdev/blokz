/**
 * Artifact: the-lrt-risk-ladder — The LRT Risk Ladder
 * Manifest: content/artifacts/the-lrt-risk-ladder/manifest.json
 *
 * Scatter chart: five liquid restaking tokens positioned by restaking yield
 * (X axis, 0–3.5 %) vs. worst historical depeg (Y axis, 0–25 %). Bubble area
 * encodes TVL. Click a bubble to inspect the protocol's depeg event and live
 * health-factor math. Drag the LTV slider to slide the liquidation-threshold
 * contour across the field — bubbles above the line would have been liquidated
 * at that LTV. Distinguishes liquidity-only depegs (DeFi oracle held peg) from
 * backing-loss depegs (real ETH drained, oracle update lag).
 *
 * Layout: rail (panel + controls in right column beside stage).
 */
import data from '../../../content/artifacts/the-lrt-risk-ladder/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 400, VB_H = 250;
// Chart frame
const X0 = 52, X1 = 390, Y0 = 18, Y1 = 215;
// Axis ranges
const MAX_YIELD_BPS = 360;  // X axis: 0..3.6% restaking yield
const MAX_DEPEG_PCT = 25;   // Y axis: 0..25%
// Standard liquidation threshold used by major lending markets for wstETH collateral
const LT_PCT = 75;

type Protocol = (typeof data.protocols)[0];

interface State {
  selectedId: string | null;
  ltv: number; // 40..74 (%)
}

function xPx(bps: number): number {
  return X0 + (bps / MAX_YIELD_BPS) * (X1 - X0);
}
function yPx(depeg: number): number {
  return Y1 - (depeg / MAX_DEPEG_PCT) * (Y1 - Y0);
}
function bubbleR(tvlB: number): number {
  return Math.max(4, Math.sqrt(tvlB) * 9);
}
function hf(ltv: number, depeg: number): number {
  return (LT_PCT / ltv) * (1 - depeg / 100);
}
function breakevenLtv(depeg: number): number {
  return LT_PCT * (1 - depeg / 100);
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rl-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono',monospace; overflow:visible; }
    .rl-svg text { fill:#8d95ad; }
    .rl-bubble { cursor:pointer; }
    .rl-bubble:focus-visible circle { outline:2px solid #fff; }
    .rl-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11px/1.5 'JetBrains Mono',monospace; color:#8d95ad; }
    .rl-card { border:1px solid rgba(124,140,255,.14); border-radius:10px;
      background:#0d1322; padding:10px 12px; display:flex; flex-direction:column;
      gap:6px; min-width:0; }
    .rl-proto-name { font:700 12px 'JetBrains Mono',monospace; }
    .rl-badge { align-self:flex-start; font:700 9.5px 'JetBrains Mono',monospace;
      letter-spacing:.08em; text-transform:uppercase; padding:3px 7px;
      border-radius:5px; white-space:nowrap; }
    .rl-badge-liq  { color:#fb923c; background:rgba(251,146,60,.12);
      box-shadow:inset 0 0 0 1px rgba(251,146,60,.4); }
    .rl-badge-back { color:#ef4444; background:rgba(239,68,68,.12);
      box-shadow:inset 0 0 0 1px rgba(239,68,68,.45); }
    .rl-badge-none { color:#22d3ee; background:rgba(34,211,238,.1);
      box-shadow:inset 0 0 0 1px rgba(34,211,238,.35); }
    .rl-row { display:flex; justify-content:space-between; gap:8px;
      font-size:10.5px; min-width:0; flex-wrap:wrap; }
    .rl-row span { color:#5b6378; }
    .rl-row b { color:#e7eaf3; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .rl-divider { border:none; border-top:1px solid rgba(124,140,255,.1); margin:2px 0; }
    .rl-hf-grid { display:grid; grid-template-columns:auto 1fr; gap:3px 10px;
      font-size:10px; align-items:center; min-width:0; }
    .rl-hf-lbl { color:#5b6378; white-space:nowrap; }
    .rl-hf-val { color:#e7eaf3; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .rl-hf-val.rl-safe { color:#4ade80; }
    .rl-hf-val.rl-warn { color:#f5b54a; }
    .rl-hf-val.rl-liq  { color:#ef4444; }
    .rl-event { font-size:9.5px; color:#5b6378; line-height:1.55;
      border-top:1px solid rgba(124,140,255,.1); padding-top:6px; }
    .rl-event b { color:#9aa2b8; font-weight:500; }
    .rl-hint { font-size:10px; color:#5b6378; line-height:1.5; text-align:center;
      padding:10px 8px; }
    .rl-controls { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .rl-field { min-width:0; }
    .rl-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font:500 9.5px/1 'JetBrains Mono',monospace; letter-spacing:.06em;
      text-transform:uppercase; color:#5b6378; margin-bottom:5px; }
    .rl-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; }
    .rl-field input[type=range] { width:100%; cursor:pointer; background:transparent;
      margin:0; accent-color:#f0883e; }
    .rl-legend { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .rl-legend-row { display:flex; align-items:center; gap:7px; font-size:9.5px;
      color:#5b6378; min-width:0; }
    .rl-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .rl-cap { font-size:9px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .rl-cap b { color:#8d95ad; font-weight:600; }
    .rl-cap a { color:#7c8cff; text-decoration:none; }
    .rl-cap a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);

  const state: State = { selectedId: null, ltv: 65 };

  /* ── SVG scaffold ─────────────────────────────────────────── */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'rl-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'LRT Risk Ladder: restaking yield vs worst historical depeg');

  function mk(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
    const el = document.createElementNS(SVG_NS, tag) as SVGElement;
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
    return el;
  }

  // Zone backgrounds
  // Low-risk zone: depeg 0–5 %
  mk('rect', {
    x: X0, y: yPx(5),
    width: X1 - X0, height: yPx(0) - yPx(5),
    fill: 'rgba(34,211,238,.05)',
  });
  // High-tail-risk zone: depeg 12–25 %
  mk('rect', {
    x: X0, y: yPx(25),
    width: X1 - X0, height: yPx(12) - yPx(25),
    fill: 'rgba(239,68,68,.06)',
  });

  // Grid lines & Y tick labels
  for (const y of [5, 10, 15, 20, 25]) {
    mk('line', {
      x1: X0, y1: yPx(y), x2: X1, y2: yPx(y),
      stroke: 'rgba(124,140,255,.13)', 'stroke-width': 1,
    });
    const lbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    lbl.setAttribute('x', String(X0 - 4));
    lbl.setAttribute('y', String(yPx(y) + 3));
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('font-size', '8');
    lbl.textContent = `${y}%`;
    svg.appendChild(lbl);
  }
  // Grid lines & X tick labels
  for (const bps of [0, 100, 200, 300]) {
    const x = xPx(bps);
    mk('line', {
      x1: x, y1: Y0, x2: x, y2: Y1,
      stroke: 'rgba(124,140,255,.13)', 'stroke-width': 1,
    });
    const lbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    lbl.setAttribute('x', String(x));
    lbl.setAttribute('y', String(Y1 + 11));
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '8');
    lbl.textContent = `${(bps / 100).toFixed(0)}%`;
    svg.appendChild(lbl);
  }

  // Axes
  mk('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, stroke: 'rgba(124,140,255,.3)', 'stroke-width': 1 });
  mk('line', { x1: X0, y1: Y0, x2: X0, y2: Y1, stroke: 'rgba(124,140,255,.3)', 'stroke-width': 1 });

  // Axis labels
  const xAxisLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  xAxisLbl.setAttribute('x', String((X0 + X1) / 2));
  xAxisLbl.setAttribute('y', String(VB_H - 2));
  xAxisLbl.setAttribute('text-anchor', 'middle');
  xAxisLbl.setAttribute('font-size', '8.5');
  xAxisLbl.textContent = 'restaking yield →';
  svg.appendChild(xAxisLbl);

  const yAxisLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  yAxisLbl.setAttribute('x', String(10));
  yAxisLbl.setAttribute('y', String((Y0 + Y1) / 2));
  yAxisLbl.setAttribute('text-anchor', 'middle');
  yAxisLbl.setAttribute('font-size', '8.5');
  yAxisLbl.setAttribute('transform', `rotate(-90,10,${(Y0 + Y1) / 2})`);
  yAxisLbl.textContent = '← worst depeg';
  svg.appendChild(yAxisLbl);

  // Zone annotations
  const zoneLowLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  zoneLowLbl.setAttribute('x', String(X1 - 3));
  zoneLowLbl.setAttribute('y', String(yPx(0) - 3));
  zoneLowLbl.setAttribute('text-anchor', 'end');
  zoneLowLbl.setAttribute('font-size', '7.5');
  zoneLowLbl.setAttribute('fill', 'rgba(34,211,238,.55)');
  zoneLowLbl.textContent = 'LOW RISK';
  svg.appendChild(zoneLowLbl);

  const zoneHighLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  zoneHighLbl.setAttribute('x', String(X1 - 3));
  zoneHighLbl.setAttribute('y', String(yPx(25) + 9));
  zoneHighLbl.setAttribute('text-anchor', 'end');
  zoneHighLbl.setAttribute('font-size', '7.5');
  zoneHighLbl.setAttribute('fill', 'rgba(239,68,68,.65)');
  zoneHighLbl.textContent = 'HIGH TAIL RISK';
  svg.appendChild(zoneHighLbl);

  // Liquidation contour line (dynamic)
  const contourLine = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
  contourLine.setAttribute('x1', String(X0));
  contourLine.setAttribute('x2', String(X1));
  contourLine.setAttribute('stroke', '#f0883e');
  contourLine.setAttribute('stroke-width', '1.5');
  contourLine.setAttribute('stroke-dasharray', '4 3');
  svg.appendChild(contourLine);

  const contourLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  contourLbl.setAttribute('font-size', '7.5');
  contourLbl.setAttribute('fill', '#f0883e');
  svg.appendChild(contourLbl);

  // Protocol bubbles — render after grid so they're on top
  type BubbleEl = { g: SVGGElement; circle: SVGCircleElement; nameLbl: SVGTextElement; yldLbl: SVGTextElement };
  const bubbles = new Map<string, BubbleEl>();

  for (const p of data.protocols) {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'rl-bubble');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${p.label}: ${(p.restakingYieldBps / 100).toFixed(1)}% restaking yield, ${p.worstDepegPct}% worst depeg`);

    const cx = xPx(p.restakingYieldBps);
    const cy = yPx(p.worstDepegPct);
    const r = bubbleR(p.tvlBillion);

    const circle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', p.color);
    circle.setAttribute('stroke', p.color);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('opacity', '0.82');

    const nameLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    nameLbl.setAttribute('x', String(cx));
    nameLbl.setAttribute('y', String(cy - r - 3));
    nameLbl.setAttribute('text-anchor', 'middle');
    nameLbl.setAttribute('font-size', '9');
    nameLbl.setAttribute('fill', '#e7eaf3');
    nameLbl.setAttribute('font-weight', '600');
    nameLbl.textContent = p.label;

    const yldLbl = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    yldLbl.setAttribute('x', String(cx));
    yldLbl.setAttribute('y', String(cy + r + 10));
    yldLbl.setAttribute('text-anchor', 'middle');
    yldLbl.setAttribute('font-size', '7.5');
    yldLbl.setAttribute('fill', p.color);
    yldLbl.textContent = `${(p.totalYieldBps / 100).toFixed(1)}% apy`;

    g.appendChild(circle);
    g.appendChild(nameLbl);
    g.appendChild(yldLbl);
    svg.appendChild(g);
    bubbles.set(p.id, { g, circle, nameLbl, yldLbl });
  }

  stage.appendChild(svg);

  /* ── Panel ────────────────────────────────────────────────── */
  panel.className = 'rl-panel';
  const panelCard = document.createElement('div');
  panelCard.className = 'rl-card';
  panel.appendChild(panelCard);

  /* ── Controls ─────────────────────────────────────────────── */
  controls.className = 'rl-controls';

  const ltvField = document.createElement('div');
  ltvField.className = 'rl-field';
  const ltvLabel = document.createElement('label');
  const ltvSpan = document.createElement('span');
  ltvSpan.textContent = 'LTV';
  const ltvOut = document.createElement('output');
  ltvLabel.appendChild(ltvSpan);
  ltvLabel.appendChild(ltvOut);
  const ltvInput = document.createElement('input');
  ltvInput.type = 'range';
  ltvInput.min = '40';
  ltvInput.max = '74';
  ltvInput.step = '1';
  ltvInput.value = String(state.ltv);
  ltvInput.setAttribute('aria-label', 'Loan-to-Value ratio');
  ltvField.appendChild(ltvLabel);
  ltvField.appendChild(ltvInput);
  controls.appendChild(ltvField);

  const legendDiv = document.createElement('div');
  legendDiv.className = 'rl-legend';
  const legendItems = [
    { label: 'Backing-loss depeg (real ETH drained)', color: '#ef4444' },
    { label: 'Liquidity-only depeg (oracle held)', color: '#fb923c' },
    { label: 'No significant depeg event', color: '#22d3ee' },
    { label: 'Bubble area ∝ TVL', color: '#5b6378' },
  ];
  for (const item of legendItems) {
    const row = document.createElement('div');
    row.className = 'rl-legend-row';
    const dot = document.createElement('div');
    dot.className = 'rl-legend-dot';
    dot.style.background = item.color;
    const lbl = document.createElement('span');
    lbl.textContent = item.label;
    row.appendChild(dot);
    row.appendChild(lbl);
    legendDiv.appendChild(row);
  }
  controls.appendChild(legendDiv);

  /* ── Caption ──────────────────────────────────────────────── */
  caption.className = 'rl-cap';
  caption.innerHTML =
    `<b>Data:</b> EigenLayer protocol statistics · ether.fi · Renzo · KelpDAO · ` +
    `Blockscout block 25,377,320 · as of <b>2026-06-23</b>. ` +
    `Depeg figures: historical worst observed; backing-loss events may trigger DeFi freeze ` +
    `before oracle reflects loss. LT = 75% (Aave/SparkLend standard for wstETH collateral). ` +
    `<b>Not investment advice.</b>`;

  /* ── Render ───────────────────────────────────────────────── */
  function updateContour(): void {
    const depegThreshold = (1 - state.ltv / LT_PCT) * 100;
    if (depegThreshold > 0 && depegThreshold <= MAX_DEPEG_PCT) {
      const y = yPx(depegThreshold);
      contourLine.setAttribute('y1', String(y));
      contourLine.setAttribute('y2', String(y));
      contourLine.setAttribute('opacity', '1');
      contourLbl.setAttribute('x', String(X0 + 4));
      contourLbl.setAttribute('y', String(y - 3));
      contourLbl.textContent = `liq. at ${depegThreshold.toFixed(1)}% depeg (LTV ${state.ltv}%)`;
      contourLbl.setAttribute('opacity', '1');
    } else {
      contourLine.setAttribute('opacity', '0');
      contourLbl.setAttribute('opacity', '0');
    }
  }

  function hfClass(h: number): string {
    if (h >= 1.3) return 'rl-safe';
    if (h >= 1.0) return 'rl-warn';
    return 'rl-liq';
  }

  function renderPanel(): void {
    panelCard.innerHTML = '';
    const sel = data.protocols.find(p => p.id === state.selectedId) ?? null;

    if (!sel) {
      const hint = document.createElement('div');
      hint.className = 'rl-hint';
      hint.textContent = 'Click a protocol bubble to inspect its depeg history and health-factor math at your LTV.';
      panelCard.appendChild(hint);
      return;
    }

    // Protocol name
    const name = document.createElement('div');
    name.className = 'rl-proto-name';
    name.style.color = sel.color;
    name.textContent = `${sel.label} — ${sel.protocol}`;
    panelCard.appendChild(name);

    // Depeg type badge
    const badge = document.createElement('div');
    badge.className = 'rl-badge';
    if (sel.depegType === 'backing-loss') {
      badge.classList.add('rl-badge-back');
      badge.textContent = 'BACKING LOSS';
    } else if (sel.depegType === 'liquidity') {
      badge.classList.add('rl-badge-liq');
      badge.textContent = 'LIQUIDITY DEPEG';
    } else {
      badge.classList.add('rl-badge-none');
      badge.textContent = 'NO DEPEG EVENT';
    }
    panelCard.appendChild(badge);

    // Stats
    function row(label: string, value: string): HTMLElement {
      const r = document.createElement('div');
      r.className = 'rl-row';
      const s = document.createElement('span');
      s.textContent = label;
      const b = document.createElement('b');
      b.textContent = value;
      r.appendChild(s);
      r.appendChild(b);
      return r;
    }
    panelCard.appendChild(row('Restaking yield', `${(sel.restakingYieldBps / 100).toFixed(1)}%`));
    panelCard.appendChild(row('Total APY', `${(sel.totalYieldBps / 100).toFixed(1)}%`));
    panelCard.appendChild(row('TVL', `$${sel.tvlBillion.toFixed(2)}B`));
    panelCard.appendChild(row('Worst depeg', `${sel.worstDepegPct}%`));

    const hr = document.createElement('hr');
    hr.className = 'rl-divider';
    panelCard.appendChild(hr);

    // HF math
    const hfNow = hf(state.ltv, sel.worstDepegPct);
    const hfPre = LT_PCT / state.ltv;
    const beLtv = breakevenLtv(sel.worstDepegPct);

    const grid = document.createElement('div');
    grid.className = 'rl-hf-grid';

    function hfRow(lbl: string, val: string, cls?: string): void {
      const l = document.createElement('div');
      l.className = 'rl-hf-lbl';
      l.textContent = lbl;
      const v = document.createElement('div');
      v.className = 'rl-hf-val' + (cls ? ` ${cls}` : '');
      v.textContent = val;
      grid.appendChild(l);
      grid.appendChild(v);
    }

    hfRow('HF before depeg', hfPre.toFixed(2), hfClass(hfPre));
    hfRow('HF after worst depeg', hfNow.toFixed(2), hfClass(hfNow));
    hfRow('Breakeven LTV', `${beLtv.toFixed(1)}%`);
    hfRow(
      'At your LTV',
      hfNow >= 1.0 ? 'SAFE' : 'LIQUIDATED',
      hfNow >= 1.0 ? 'rl-safe' : 'rl-liq',
    );

    panelCard.appendChild(grid);

    // Event note
    const ev = document.createElement('div');
    ev.className = 'rl-event';
    ev.innerHTML = `<b>Event:</b> ${sel.depegEvent}`;
    panelCard.appendChild(ev);
  }

  function renderBubbles(): void {
    for (const p of data.protocols) {
      const b = bubbles.get(p.id)!;
      const sel = state.selectedId === p.id;
      const dim = state.selectedId !== null && !sel;
      b.circle.setAttribute('opacity', dim ? '0.2' : sel ? '1' : '0.82');
      b.circle.setAttribute('stroke-width', sel ? '2.5' : '1.5');
      b.nameLbl.setAttribute('opacity', dim ? '0.25' : '1');
      b.yldLbl.setAttribute('opacity', dim ? '0.2' : '1');
    }
  }

  function render(): void {
    ltvOut.textContent = `${state.ltv}%`;
    updateContour();
    renderBubbles();
    renderPanel();
  }

  /* ── Event listeners ──────────────────────────────────────── */
  const clickHandlers: Array<[Element, EventListener]> = [];

  for (const p of data.protocols) {
    const b = bubbles.get(p.id)!;
    const handler: EventListener = () => {
      state.selectedId = state.selectedId === p.id ? null : p.id;
      render();
    };
    const keyHandler = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); handler(e); }
    };
    b.g.addEventListener('click', handler);
    b.g.addEventListener('keydown', keyHandler);
    clickHandlers.push([b.g, handler], [b.g, keyHandler]);
  }

  const ltvHandler: EventListener = () => {
    state.ltv = Number(ltvInput.value);
    render();
  };
  ltvInput.addEventListener('input', ltvHandler);

  render();

  return () => {
    for (const [el, fn] of clickHandlers) el.removeEventListener('click', fn);
    ltvInput.removeEventListener('input', ltvHandler);
    layout.dispose();
    style.remove();
  };
}
