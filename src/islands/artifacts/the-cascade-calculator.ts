/**
 * Artifact: the-cascade-calculator — The Cascade Calculator
 * Manifest: content/artifacts/the-cascade-calculator/manifest.json
 *
 * Interactive calculator visualizing LLM cascade routing profit margins.
 * Stage: SVG profit-vs-cheap-success-rate curve (cascade vs expensive-only).
 * Panel: Key metrics at current slider settings (margin, crossover, breakeven).
 * Controls: Sliders for cheap cost, expensive cost, expensive success rate, market price.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const VW = 840, VH = 420;
const X0 = 62, X1 = 800, Y0 = 24, Y1 = 368;

// --- Math ---------------------------------------------------------------

function cascadeCostPerResolved(p1: number, c1: number, c2: number, p2: number): number {
  const cost = c1 + (1 - p1) * c2;
  const successRate = p1 + (1 - p1) * p2;
  return successRate > 0 ? cost / successRate : Infinity;
}

function margin(costPerResolved: number, P: number): number {
  return (P - costPerResolved) / P;
}

// p1 where cascade equals expensive-only: p1* = p2 * c1/c2
function crossoverP1(c1: number, c2: number, p2: number): number {
  return c2 > 0 ? Math.min(0.99, Math.max(0, p2 * c1 / c2)) : 0;
}

const pct = (v: number, d = 1) => (v * 100).toFixed(d) + '%';
const dp2 = (n: number) => n.toFixed(2);

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/420',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  // ── Styles ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cc-wrap { position:absolute; inset:0; background:#0d1322;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; overflow:hidden; }
    .cc-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .cc-grid  { stroke:rgba(124,140,255,.08); stroke-width:1; }
    .cc-axis  { fill:#5b6378; font:500 10.5px 'JetBrains Mono',monospace; }
    .cc-zero  { stroke:rgba(231,234,243,.18); stroke-width:1; }
    .cc-neg   { fill:rgba(240,136,62,.07); }
    .cc-pos   { fill:rgba(95,211,155,.06); }
    .cc-curve { fill:none; stroke:#22d3ee; stroke-width:2.5;
                stroke-linecap:round; stroke-linejoin:round; }
    .cc-ref   { stroke:#7c8cff; stroke-width:1.5; stroke-dasharray:6 5; }
    .cc-cross { stroke:rgba(255,200,80,.6); stroke-width:1.5; stroke-dasharray:4 4; }
    .cc-bench { fill:#f0883e; }
    .cc-legend{ font:600 9.5px 'JetBrains Mono',monospace; }

    .cc-ctrls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px 18px; }
    .cc-field { display:flex; flex-direction:column; gap:4px; }
    .cc-field label { display:flex; justify-content:space-between;
      font:500 9.5px/1.3 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#5b6378; }
    .cc-field output { color:#e7eaf3; }
    .cc-field input[type=range] { width:100%; cursor:pointer; accent-color:#22d3ee; margin-top:2px; }

    .cc-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11.5px/1.6 'JetBrains Mono',monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .cc-sec  { display:flex; flex-direction:column; gap:4px; }
    .cc-head { font-size:9px; letter-spacing:.1em; text-transform:uppercase;
      color:#5b6378; padding-bottom:3px; border-bottom:1px solid rgba(124,140,255,.1); }
    .cc-row  { display:flex; align-items:baseline; justify-content:space-between;
      gap:4px 8px; min-width:0; }
    .cc-row span { font-size:10.5px; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .cc-row b    { font-weight:700; color:#e7eaf3; white-space:nowrap; }
    .cc-teal   { color:#22d3ee !important; }
    .cc-blue   { color:#7c8cff !important; }
    .cc-amber  { color:#f0883e !important; }
    .cc-yellow { color:#ffe080 !important; }
    .cc-green  { color:#5fd39b !important; }
    .cc-verdict { padding:7px 10px; border-radius:8px; font-size:10.5px; line-height:1.5;
      min-width:0; overflow-wrap:anywhere; }
    .cc-pos-v  { border:1px solid rgba(95,211,155,.3); background:rgba(95,211,155,.08); color:#9eedc8; }
    .cc-neg-v  { border:1px solid rgba(240,136,62,.3); background:rgba(240,136,62,.08); color:#ffcba4; }

    .cc-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378;
      min-width:0; overflow-wrap:anywhere; }
    .cc-cap b { color:#8d95ad; font-weight:600; }

    @media (max-width:520px) {
      .cc-ctrls { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `;
  stage.appendChild(style);

  // ── SVG stage ───────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'cc-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Cascade routing profit margin vs cheap model success rate');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  const gBg     = document.createElementNS(NS, 'g'); svg.appendChild(gBg);
  const gCurves = document.createElementNS(NS, 'g'); svg.appendChild(gCurves);
  const gMarks  = document.createElementNS(NS, 'g'); svg.appendChild(gMarks);
  const gLabels = document.createElementNS(NS, 'g'); svg.appendChild(gLabels);

  // ── Panel ───────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'cc-panel';
  panel.appendChild(panelEl);

  // ── Controls ────────────────────────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'cc-ctrls';
  ctrlSlot.appendChild(ctrlWrap);

  function mkSlider(id: string, label: string, min: number, max: number, step: number, def: number) {
    const field = document.createElement('div');
    field.className = 'cc-field';
    const lbl = document.createElement('label');
    lbl.htmlFor = `cc-${id}`;
    const nm = document.createElement('span');
    nm.textContent = label;
    const out = document.createElement('output');
    lbl.append(nm, out);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = `cc-${id}`;
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(def);
    inp.setAttribute('aria-label', label);
    field.append(lbl, inp);
    ctrlWrap.appendChild(field);
    return { inp, out };
  }

  const sC1 = mkSlider('c1', 'Cheap cost ($)', 0.10, 5.00, 0.10, 1.50);
  const sC2 = mkSlider('c2', 'Capable cost ($)', 0.50, 20.0, 0.50, 5.00);
  const sP2 = mkSlider('p2', 'Capable success', 0.50, 0.99, 0.01, 0.85);
  const sP  = mkSlider('mp', 'Market price ($)', 1.00, 30.0, 0.50, 6.50);

  // ── Caption ─────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'cc-cap';
  cap.innerHTML =
    'Model: cascade = cheap-first fallback to capable. ' +
    '<b>Schölkopf et al. 2026</b> (arXiv:2603.22404) — up to 40% net margin on SWE-bench ' +
    'with GPT-5 mini + DeepSeek v3.2. X-axis: cheap model success rate p₁.';
  caption.appendChild(cap);

  // ── Render ──────────────────────────────────────────────────────────────
  function render(): void {
    // Clear
    [gBg, gCurves, gMarks, gLabels].forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); });

    const c1 = Number(sC1.inp.value);
    const c2 = Number(sC2.inp.value);
    const p2 = Number(sP2.inp.value);
    const P  = Number(sP.inp.value);

    sC1.out.textContent = `$${dp2(c1)}`;
    sC2.out.textContent = `$${dp2(c2)}`;
    sP2.out.textContent = pct(p2, 0);
    sP.out.textContent  = `$${dp2(P)}`;

    // Y-axis range: -60% to +80%
    const Y_MIN = -0.60, Y_MAX = 0.80;
    const xOf = (p: number) => X0 + (p - 0) / 1 * (X1 - X0);
    const yOf = (m: number) => Y1 - (m - Y_MIN) / (Y_MAX - Y_MIN) * (Y1 - Y0);

    const mk = (tag: string, attrs: Record<string, string | number>, parent: SVGElement = gBg as SVGElement): SVGElement => {
      const el = document.createElementNS(NS, tag) as SVGElement;
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      parent.appendChild(el);
      return el;
    };
    const txt = (x: number, y: number, cls: string, text: string, anchor = 'middle', parent: SVGElement = gLabels as SVGElement): SVGElement => {
      const t = document.createElementNS(NS, 'text') as SVGElement;
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
      t.textContent = text; parent.appendChild(t); return t;
    };

    // Background regions
    const yZero = yOf(0);
    if (yZero > Y0 && yZero < Y1) {
      // Negative region
      mk('rect', { x: X0, y: yZero, width: X1 - X0, height: Y1 - yZero, class: 'cc-neg' });
      // Positive region
      mk('rect', { x: X0, y: Y0, width: X1 - X0, height: yZero - Y0, class: 'cc-pos' });
    } else if (yZero <= Y0) {
      mk('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, class: 'cc-pos' });
    } else {
      mk('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, class: 'cc-neg' });
    }

    // Gridlines + axes
    const yTicks = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8];
    for (const v of yTicks) {
      if (v < Y_MIN || v > Y_MAX) continue;
      const y = yOf(v);
      mk('line', { x1: X0, y1: y, x2: X1, y2: y, class: v === 0 ? 'cc-zero' : 'cc-grid' });
      txt(X0 - 5, y + 3.5, 'cc-axis', pct(v, 0), 'end');
    }

    const xTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const p of xTicks) {
      const x = xOf(p);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'cc-grid' });
      txt(x, Y1 + 14, 'cc-axis', (p * 100).toFixed(0) + '%');
    }

    txt(X0 + 2, Y0 - 8, 'cc-axis', 'Profit margin', 'start');
    txt((X0 + X1) / 2, VH - 4, 'cc-axis', 'Cheap model success rate (p₁)');

    // Expensive-only reference line
    const expMargin = P > 0 ? (P - c2 / p2) / P : -Infinity;
    const expClipped = Math.max(Y_MIN, Math.min(Y_MAX, expMargin));
    const yExpRef = yOf(expClipped);
    if (yExpRef >= Y0 && yExpRef <= Y1) {
      mk('line', { x1: X0, y1: yExpRef, x2: X1, y2: yExpRef, class: 'cc-ref' });
      const refLbl = txt(X1 - 4, yExpRef - 5, 'cc-legend', 'Expensive-only', 'end', gLabels as SVGElement);
      refLbl.setAttribute('fill', '#7c8cff');
    }

    // Crossover vertical line
    const p1Star = crossoverP1(c1, c2, p2);
    if (p1Star > 0.01 && p1Star < 0.99) {
      const xCross = xOf(p1Star);
      mk('line', { x1: xCross, y1: Y0, x2: xCross, y2: Y1, class: 'cc-cross' }, gMarks as SVGElement);
      const xLbl = txt(xCross + 3, Y0 + 12, 'cc-legend', `p₁*=${pct(p1Star, 0)}`, 'start', gLabels as SVGElement);
      xLbl.setAttribute('fill', '#ffe080');
    }

    // Cascade profit curve
    const N = 300;
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const p1 = 0.005 + (i / N) * 0.99;
      const cost = cascadeCostPerResolved(p1, c1, c2, p2);
      const m = margin(cost, P);
      const clipped = Math.max(Y_MIN, Math.min(Y_MAX, m));
      pts.push(`${xOf(p1).toFixed(1)},${yOf(clipped).toFixed(1)}`);
    }
    mk('polyline', { points: pts.join(' '), class: 'cc-curve' }, gCurves as SVGElement);

    // Benchmark dot at p₁ = 0.65 (paper's SWE-bench scenario)
    const BENCH_P1 = 0.65;
    const benchCost = cascadeCostPerResolved(BENCH_P1, c1, c2, p2);
    const benchM = margin(benchCost, P);
    const benchClipped = Math.max(Y_MIN, Math.min(Y_MAX, benchM));
    const bx = xOf(BENCH_P1);
    const by = yOf(benchClipped);
    if (by >= Y0 - 4 && by <= Y1 + 4) {
      mk('circle', { cx: bx, cy: by, r: 5, class: 'cc-bench' }, gMarks as SVGElement);
      const bl = txt(bx + 7, Math.max(Y0 + 9, by - 5), 'cc-legend', `p₁=65%: ${pct(benchM, 1)}`, 'start', gLabels as SVGElement);
      bl.setAttribute('fill', '#f0883e');
    }

    // Legend
    const lx = X1 - 8, ly = Y1 - 20;
    const lCurve = txt(lx, ly, 'cc-legend', 'Cascade margin', 'end', gLabels as SVGElement);
    lCurve.setAttribute('fill', '#22d3ee');

    // ── Panel ──────────────────────────────────────────────────────────────
    const benchAdvantage = benchM - expMargin;
    const maxMargin = (P - c1) / P;
    const breakEvenPrice = cascadeCostPerResolved(BENCH_P1, c1, c2, p2);

    panelEl.innerHTML = `
      <div class="cc-sec">
        <div class="cc-head">At benchmark (p₁ = 65%)</div>
        <div class="cc-row"><span>Cascade margin</span><b class="cc-teal">${pct(benchM, 1)}</b></div>
        <div class="cc-row"><span>Expensive-only margin</span><b class="${expMargin < 0 ? 'cc-amber' : 'cc-blue'}">${pct(expMargin, 1)}</b></div>
        <div class="cc-row"><span>Cascade advantage</span><b class="${benchAdvantage > 0 ? 'cc-green' : 'cc-amber'}">${benchAdvantage > 0 ? '+' : ''}${pct(benchAdvantage, 1)}</b></div>
      </div>
      <div class="cc-sec">
        <div class="cc-head">Market structure</div>
        <div class="cc-row"><span>Crossover p₁*</span><b class="cc-yellow">${pct(p1Star, 1)}</b></div>
        <div class="cc-row"><span>Breakeven price</span><b>$${dp2(breakEvenPrice)}</b></div>
        <div class="cc-row"><span>Max margin (p₁→1)</span><b class="cc-teal">${pct(maxMargin, 1)}</b></div>
      </div>
      <div class="cc-verdict ${benchM > 0 ? 'cc-pos-v' : 'cc-neg-v'}">
        ${benchM > 0
          ? `✓ Cascade earns <b>${pct(benchM, 1)}</b> margin vs ${expMargin < 0 ? 'a loss' : pct(expMargin, 1)} expensive-only. Breakeven price is <b>$${dp2(breakEvenPrice)}</b>/query.`
          : `⚠ Market price too low: cascade costs <b>$${dp2(breakEvenPrice)}</b>/resolved query but market pays <b>$${dp2(P)}</b>.`}
      </div>
    `;
  }

  render();

  const onInput = () => render();
  [sC1.inp, sC2.inp, sP2.inp, sP.inp].forEach(el => el.addEventListener('input', onInput));

  return () => {
    [sC1.inp, sC2.inp, sP2.inp, sP.inp].forEach(el => el.removeEventListener('input', onInput));
    layout.dispose();
    style.remove();
  };
}
