/**
 * Artifact: aave-rate-curve-explorer — Aave Rate Curve Explorer
 * Manifest: content/artifacts/aave-rate-curve-explorer/manifest.json
 *
 * Renders the Aave V3 USDC two-slope interest rate model on Base as an
 * interactive SVG chart. The slider simulates an agent shifting utilization
 * — illustrating how the kink at U_opt=90% penalises over-borrowing and why
 * an adversarial agent would hold utilisation just below that threshold.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/aave-rate-curve-explorer/data.json';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 840, VB_H = 440;
// Chart inner bounds
const X0 = 58, X1 = 800, Y0 = 26, Y1 = 390;

const { model, snapshot } = data;
const U_OPT  = model.optimalUsageRatioBps   / 10000; // 0.90
const SLOPE1 = model.variableRateSlope1Bps  / 10000; // 0.045
const SLOPE2 = model.variableRateSlope2Bps  / 10000; // 0.10
const RF     = model.reserveFactorBps       / 10000; // 0.10
const SNAP_U = snapshot.utilizationPct      / 100;   // 0.8278
const APY_MAX = 0.16; // 16% ceiling for y-axis

const xOf = (u:   number): number => X0 + u * (X1 - X0);
const yOf = (apy: number): number => Y1 - (Math.min(apy, APY_MAX) / APY_MAX) * (Y1 - Y0);

function borrowRate(u: number): number {
  if (u <= U_OPT) return (u / U_OPT) * SLOPE1;
  return SLOPE1 + ((u - U_OPT) / (1 - U_OPT)) * SLOPE2;
}

function supplyRate(u: number): number {
  return borrowRate(u) * u * (1 - RF);
}

function pct(v: number): string { return (v * 100).toFixed(2) + '%'; }
function bps(v: number): number { return Math.round(v * 10000); }

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/440',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .arc-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .arc-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .arc-grid  { stroke:rgba(124,140,255,.09); }
    .arc-axis  { fill:#8d95ad; font:500 11px 'JetBrains Mono',monospace; }
    .arc-kink  { stroke:rgba(255,210,70,.45); stroke-dasharray:4 4; }
    .arc-zone  { fill:rgba(240,136,62,.055); }
    .arc-curve { fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .arc-borrow { stroke:#f0883e; }
    .arc-supply { stroke:#5fd39b; }
    .arc-legend { font:600 9.5px 'JetBrains Mono',monospace; }
    .arc-snapline { stroke:rgba(231,234,243,.18); stroke-dasharray:2 3; }
    .arc-agentline { stroke:rgba(124,140,255,.28); stroke-dasharray:2 3; }

    .arc-controls { display:flex; align-items:flex-end; gap:10px 24px; flex-wrap:wrap;
      min-width:0; font:500 11.5px/1.45 'JetBrains Mono',monospace; color:#8d95ad; }
    .arc-field { display:flex; flex-direction:column; gap:5px;
      min-width:160px; max-width:340px; flex:1; }
    .arc-field label { display:flex; justify-content:space-between;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .arc-field output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .arc-field input[type=range] { width:100%; cursor:pointer;
      accent-color:#7c8cff; margin-top:3px; }

    .arc-panel { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono',monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .arc-sec { display:flex; flex-direction:column; gap:4px; }
    .arc-head { font-size:9.5px; letter-spacing:.08em; text-transform:uppercase;
      color:#5b6378; padding-bottom:3px; border-bottom:1px solid rgba(124,140,255,.12); }
    .arc-row { display:flex; align-items:baseline; justify-content:space-between;
      gap:6px 10px; min-width:0; }
    .arc-row span { font-size:11px; color:#8d95ad; }
    .arc-row b { font-weight:700; color:#e7eaf3; white-space:nowrap; }
    .arc-amber { color:#f0883e !important; }
    .arc-green { color:#5fd39b !important; }
    .arc-blue  { color:#7c8cff !important; }
    .arc-warn { padding:8px 10px; border-radius:8px; font-size:10.5px; line-height:1.5;
      min-width:0; overflow-wrap:anywhere;
      border:1px solid rgba(240,136,62,.3); background:rgba(240,136,62,.08); color:#ffcba4; }
    .arc-ok { padding:8px 10px; border-radius:8px; font-size:10.5px; line-height:1.5;
      min-width:0; border:1px solid rgba(95,211,155,.25);
      background:rgba(95,211,155,.07); color:#9eedc8; }

    .arc-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .arc-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  // ── SVG stage ─────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'arc-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Aave V3 USDC interest rate curves (borrow and supply APY) vs utilization');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  const gBg      = document.createElementNS(NS, 'g'); svg.appendChild(gBg);
  const gZone    = document.createElementNS(NS, 'g'); svg.appendChild(gZone);
  const gCurves  = document.createElementNS(NS, 'g'); svg.appendChild(gCurves);
  const gMarkers = document.createElementNS(NS, 'g'); svg.appendChild(gMarkers);
  const gLabels  = document.createElementNS(NS, 'g'); svg.appendChild(gLabels);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'arc-panel';
  panel.appendChild(panelEl);

  // ── Controls ──────────────────────────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'arc-controls';
  ctrlSlot.appendChild(ctrlWrap);

  const field = document.createElement('div');
  field.className = 'arc-field';
  const lbl = document.createElement('label');
  lbl.htmlFor = 'arc-util';
  const lspan = document.createElement('span');
  lspan.textContent = 'agent utilization';
  const out = document.createElement('output');
  lbl.append(lspan, out);
  const inp = document.createElement('input');
  inp.type = 'range'; inp.id = 'arc-util';
  inp.min = '0'; inp.max = '100'; inp.step = '1';
  inp.value = String(Math.round(SNAP_U * 100));
  inp.setAttribute('aria-label', 'Agent-controlled utilization percentage');
  field.append(lbl, inp);
  ctrlWrap.appendChild(field);

  // ── Caption ────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'arc-cap';
  cap.innerHTML =
    `<b>Model:</b> Aave V3 USDC on Base · ` +
    `U<sub>opt</sub>=90%, slope₁=4.5%, slope₂=10%, RF=10% · ` +
    `supply rate = borrow rate × U × (1−RF). ` +
    `<b>On-chain snapshot ${data.dataAsOf}</b> via Blockscout · ` +
    `pool <b>${data.pool.slice(0, 10)}…</b> · ` +
    `$${(snapshot.totalSupplyUSDC / 1e6).toFixed(0)}M supplied, $${(snapshot.totalDebtUSDC / 1e6).toFixed(0)}M borrowed.`;
  caption.appendChild(cap);

  // ── Render ────────────────────────────────────────────────────────────────
  let agentU = SNAP_U;

  function render(): void {
    [gBg, gZone, gCurves, gMarkers, gLabels].forEach(g => {
      while (g.firstChild) g.removeChild(g.firstChild);
    });

    const mk = (tag: string, attrs: Record<string, string | number>, parent: Element = gBg): SVGElement => {
      const el = document.createElementNS(NS, tag) as SVGElement;
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      parent.appendChild(el);
      return el;
    };
    const txt = (x: number, y: number, cls: string, text: string, anchor = 'middle', parent: Element = gBg): SVGElement => {
      const t = document.createElementNS(NS, 'text') as SVGElement;
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
      t.textContent = text; parent.appendChild(t); return t;
    };

    // Y-axis grid + tick labels (0%, 4%, 8%, 12%, 16%)
    for (const apy of [0, 0.04, 0.08, 0.12, 0.16]) {
      const y = yOf(apy);
      mk('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'arc-grid' });
      txt(X0 - 5, y + 3.5, 'arc-axis', (apy * 100).toFixed(0) + '%', 'end');
    }

    // X-axis grid + tick labels (0%, 25%, 50%, 75%, 90%, 100%)
    const xTicks: [number, string][] = [[0,'0'],[0.25,'25%'],[0.5,'50%'],[0.75,'75%'],[0.9,'90%'],[1,'100%']];
    for (const [u, label] of xTicks) {
      const x = xOf(u);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'arc-grid' });
      txt(x, Y1 + 15, 'arc-axis', label, 'middle');
    }
    txt((X0 + X1) / 2, VB_H - 4, 'arc-axis', 'Utilization', 'middle');

    // Above-kink shaded zone
    mk('rect', {
      x: xOf(U_OPT), y: Y0,
      width: X1 - xOf(U_OPT), height: Y1 - Y0,
      class: 'arc-zone'
    }, gZone);

    // Kink vertical dashed line
    const kx = xOf(U_OPT);
    mk('line', { x1: kx, y1: Y0, x2: kx, y2: Y1, class: 'arc-kink', 'stroke-width': 1.5 }, gZone);
    txt(kx + 4, Y0 + 12, 'arc-axis', 'kink (90%)', 'start', gLabels);

    // Borrow and supply rate curves (300 sample points each)
    const N = 300;
    const bPts: string[] = [], sPts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      bPts.push(`${xOf(u).toFixed(1)},${yOf(borrowRate(u)).toFixed(1)}`);
      sPts.push(`${xOf(u).toFixed(1)},${yOf(supplyRate(u)).toFixed(1)}`);
    }
    mk('polyline', { points: bPts.join(' '), class: 'arc-curve arc-borrow' }, gCurves);
    mk('polyline', { points: sPts.join(' '), class: 'arc-curve arc-supply' }, gCurves);

    // Curve labels near right edge (inside viewBox)
    const bLblY = yOf(borrowRate(0.98)) - 9;
    const sLblY = yOf(supplyRate(0.98)) - 9;
    const lx = X1 - 6;
    const bl = txt(lx, bLblY, 'arc-legend', 'Borrow', 'end', gLabels);
    bl.setAttribute('fill', '#f0883e');
    const sl = txt(lx, sLblY, 'arc-legend', 'Supply', 'end', gLabels);
    sl.setAttribute('fill', '#5fd39b');

    // Live snapshot dots (white) — borrow and supply positions
    const snapX  = xOf(SNAP_U);
    const snapBY = yOf(borrowRate(SNAP_U));
    const snapSY = yOf(supplyRate(SNAP_U));
    mk('line', { x1: snapX, y1: snapSY, x2: snapX, y2: snapBY, class: 'arc-snapline', 'stroke-width': 1 }, gMarkers);
    mk('circle', { cx: snapX, cy: snapBY, r: 5, fill: '#e7eaf3', stroke: '#0d1322', 'stroke-width': 2 }, gMarkers);
    mk('circle', { cx: snapX, cy: snapSY, r: 5, fill: '#e7eaf3', stroke: '#0d1322', 'stroke-width': 2 }, gMarkers);
    txt(snapX - 7, snapBY - 9, 'arc-axis', 'live', 'end', gLabels);

    // Agent dots (blue) — only when meaningfully different from snapshot
    if (Math.abs(agentU - SNAP_U) > 0.008) {
      const agX  = xOf(agentU);
      const agBY = yOf(borrowRate(agentU));
      const agSY = yOf(supplyRate(agentU));
      mk('line', { x1: agX, y1: agSY, x2: agX, y2: agBY, class: 'arc-agentline', 'stroke-width': 1 }, gMarkers);
      mk('circle', { cx: agX, cy: agBY, r: 6, fill: '#7c8cff', stroke: '#0d1322', 'stroke-width': 2 }, gMarkers);
      mk('circle', { cx: agX, cy: agSY, r: 6, fill: '#7c8cff', stroke: '#0d1322', 'stroke-width': 2 }, gMarkers);
    }

    // ── Panel update ──────────────────────────────────────────────────────
    const agB = borrowRate(agentU);
    const agS = supplyRate(agentU);
    const aboveKink = agentU > U_OPT;

    // Spread at agent position in bps
    const spreadBps = bps(agB - agS);
    const snapBorrowBps = bps(borrowRate(SNAP_U));
    const snapSupplyBps = bps(supplyRate(SNAP_U));

    panelEl.innerHTML = `
      <div class="arc-sec">
        <div class="arc-head">Live on-chain · U = ${(SNAP_U * 100).toFixed(1)}%</div>
        <div class="arc-row"><span>Borrow APY</span><b class="arc-amber">${pct(borrowRate(SNAP_U))}</b></div>
        <div class="arc-row"><span>Supply APY</span><b class="arc-green">${pct(supplyRate(SNAP_U))}</b></div>
        <div class="arc-row"><span>Spread</span><b>${snapBorrowBps - snapSupplyBps} bps</b></div>
        <div class="arc-row"><span>Pool USDC</span><b>$${(snapshot.totalSupplyUSDC / 1e6).toFixed(0)}M</b></div>
      </div>
      <div class="arc-sec">
        <div class="arc-head">Agent sim · U = ${(agentU * 100).toFixed(0)}%</div>
        <div class="arc-row"><span>Borrow APY</span><b class="arc-amber">${pct(agB)}</b></div>
        <div class="arc-row"><span>Supply APY</span><b class="arc-green">${pct(agS)}</b></div>
        <div class="arc-row"><span>Spread</span><b class="${aboveKink ? 'arc-amber' : ''}">${spreadBps} bps</b></div>
      </div>
      ${aboveKink
        ? `<div class="arc-warn">⚠ Above kink — slope jumps from ${SLOPE1*100}% to ${(SLOPE1+SLOPE2)*100}% max. Each additional 1% utilization adds ${(SLOPE2/(1-U_OPT)*100).toFixed(0)} bps. Rational borrowers exit, pulling U back down.</div>`
        : `<div class="arc-ok">✓ Below kink — linear zone. Each +1% utilization adds ${(SLOPE1/U_OPT*100).toFixed(1)} bps to borrow rate. Agent optimum: hold U at 89–90%.</div>`
      }
    `;

    out.textContent = (agentU * 100).toFixed(0) + '%';
  }

  render();

  inp.addEventListener('input', () => {
    agentU = Number(inp.value) / 100;
    render();
  });

  return () => {
    layout.dispose();
    style.remove();
  };
}
