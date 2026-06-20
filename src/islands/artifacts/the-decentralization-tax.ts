/**
 * Artifact: the-decentralization-tax — The Decentralization Tax
 * Manifest: content/artifacts/the-decentralization-tax/manifest.json
 *
 * The single most expensive thing about decentralized LLM inference is not the
 * crypto verification overhead — it is the batch a single-tenant node cannot
 * fill. A GPU serving one request at a time runs far below its throughput
 * ceiling; a centralized provider packs hundreds of users onto the same card
 * and amortizes the cost. Cost per million tokens collapses as the batch fills.
 *
 * The chart plots two measured series for Llama 3.3 70B (FP16) on an 8x H100
 * node (Spheron 2026 benchmark) against batch size B = requests sharing the GPU:
 *
 *   • cost per million tokens (warm, descending) — the price of a token
 *   • throughput in tokens/sec (cyan, ascending)  — how busy the GPU is
 *
 * Both axes are logarithmic because the span is enormous: B=1 is ~25 tok/s and
 * ~$258/M; B=256 is ~2,800 tok/s and ~$2.30/M. The shaded band between the
 * current operating point and the filled-GPU floor (B=256) IS the
 * decentralization tax — the multiple you overpay for not sharing the card.
 *
 * Pick an operating point (tap a batch chip, click the chart, or ← →); the
 * panel reads throughput, $/M, GPU-fill %, and the tax multiple vs a filled
 * batch. SVG, no RAF — renders on input. Layout via the shared primitive.
 */
import data from '../../../content/artifacts/the-decentralization-tax/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Pt { batch: number; tokps: number; cpm: number }

const CFG = data.config;
const CURVE = (data.curve as Pt[]).slice().sort((a, b) => a.batch - b.batch);
const FLOOR = CURVE[CURVE.length - 1]; // batch 256 operating point

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 840;
const VB_H = 472;
const X0 = 64;
const X1 = 784;
const Y_TOP = 38;
const Y_BASE = 398;

/* x domain: log10(batch), 1 .. 256 */
const BMIN = 1;
const BMAX = FLOOR.batch;
const lx0 = Math.log10(BMIN);
const lx1 = Math.log10(BMAX);
const xOf = (b: number) => X0 + ((Math.log10(b) - lx0) / (lx1 - lx0)) * (X1 - X0);
const bOfX = (x: number) => {
  const t = (x - X0) / (X1 - X0);
  return 10 ** (lx0 + Math.min(Math.max(t, 0), 1) * (lx1 - lx0));
};

/* dual log y-axes: cost ($/M) on the left, throughput (tok/s) on the right.
   Shared pixel band, independent decades. */
const COST_HI = 400, COST_LO = 1;       // $/M
const TPS_HI = 4000, TPS_LO = 10;        // tok/s
const yCost = (v: number) => {
  const t = (Math.log10(v) - Math.log10(COST_LO)) / (Math.log10(COST_HI) - Math.log10(COST_LO));
  return Y_BASE - t * (Y_BASE - Y_TOP);
};
const yTps = (v: number) => {
  const t = (Math.log10(v) - Math.log10(TPS_LO)) / (Math.log10(TPS_HI) - Math.log10(TPS_LO));
  return Y_BASE - t * (Y_BASE - Y_TOP);
};

/* nearest measured batch to a continuous value (snap on click) */
const snap = (b: number): Pt => {
  let best = CURVE[0], bd = Infinity;
  for (const p of CURVE) {
    const d = Math.abs(Math.log10(p.batch) - Math.log10(b));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
};

/* --- formatters --- */
const usd = (x: number) => x >= 100 ? `$${x.toFixed(0)}` : x >= 10 ? `$${x.toFixed(1)}` : `$${x.toFixed(2)}`;
const mult = (x: number) => x >= 100 ? `${x.toFixed(0)}x` : x >= 10 ? `${x.toFixed(1)}x` : `${x.toFixed(2)}x`;
const tpsFmt = (x: number) => x >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(x);

export default function mount(container: HTMLElement): () => void {
  let sel = CURVE.findIndex((p) => p.batch === (data.defaults?.batch ?? 1));
  if (sel < 0) sel = 0;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/472',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .dt-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .dt-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:manipulation; cursor:crosshair; }
    .dt-grid { stroke:rgba(124,140,255,.09); }
    .dt-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .dt-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .dt-axc { fill:#f5a524; font:600 10.5px 'JetBrains Mono', monospace; }
    .dt-axt { fill:#22d3ee; font:600 10.5px 'JetBrains Mono', monospace; }
    .dt-floor { stroke:rgba(34,211,238,.45); stroke-width:1.1; stroke-dasharray:4 4; }
    .dt-floorlab { fill:#6fd9e6; font:600 9.5px 'JetBrains Mono', monospace; }
    .dt-tax { fill:rgba(249,115,98,.10); }
    .dt-cost { fill:none; stroke:#f5a524; stroke-width:2.6; }
    .dt-tputline { fill:none; stroke:#22d3ee; stroke-width:2.6; }
    .dt-dot { stroke:#05070d; stroke-width:1.4; }
    .dt-dot-cost { fill:#f5a524; }
    .dt-dot-tps { fill:#22d3ee; }
    .dt-mk { stroke:rgba(231,234,243,.5); stroke-width:1.3; }
    .dt-node { outline:none; cursor:pointer; }
    .dt-node:focus-visible .dt-ring { opacity:1; }
    .dt-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .dt-hit { fill:transparent; cursor:pointer; }
    .dt-oplab { font:700 11px 'JetBrains Mono', monospace; fill:#e7eaf3; pointer-events:none; }
    .dt-tag { font:600 9.5px 'JetBrains Mono', monospace; fill:#8d95ad; pointer-events:none; }

    .dt-controls { display:flex; align-items:flex-end; gap:12px 18px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .dt-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .dt-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .dt-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .dt-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .dt-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .dt-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .dt-seg small { color:#5b6378; font-weight:500; margin-left:5px; }
    .dt-seg[aria-pressed="true"] small { color:#9aa3bd; }

    .dt-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .dt-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .dt-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .dt-sub { color:#5b6378; font-size:10.5px; }
    .dt-rows { display:flex; flex-direction:column; gap:5px; }
    .dt-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .dt-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .dt-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .dt-row b.dt-amber { color:#f5a524; }
    .dt-row b.dt-cyan { color:#22d3ee; }
    .dt-row b.dt-warn { color:#f97362; }
    .dt-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .dt-verdict.dt-ok { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .dt-verdict b { font-weight:700; }
    .dt-meter { height:7px; border-radius:4px; background:rgba(124,140,255,.12); overflow:hidden; }
    .dt-meter i { display:block; height:100%; background:linear-gradient(90deg,#22d3ee,#5b8cff); }

    .dt-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .dt-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'dt-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label',
    'Cost per million tokens and throughput for Llama 3.3 70B on an 8x H100 node, as a function of how many requests share the GPU at once');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    gPlot.appendChild(t);
    return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    gPlot.appendChild(l);
    return l;
  };

  /* ---- Controls: batch chips ---- */
  const controls = document.createElement('div');
  controls.className = 'dt-controls';
  const cgroup = document.createElement('div');
  cgroup.className = 'dt-cgroup';
  const clab = document.createElement('span');
  clab.textContent = 'requests sharing the GPU (batch size)';
  const segs = document.createElement('div');
  segs.className = 'dt-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'batch size');
  const tagFor = (b: number) => b === 1 ? 'one user' : b === BMAX ? 'filled' : '';
  const segBtns = CURVE.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dt-seg';
    const tag = tagFor(p.batch);
    b.innerHTML = `B=${p.batch}${tag ? ` <small>${tag}</small>` : ''}`;
    b.setAttribute('aria-label', `batch ${p.batch} requests: ${tpsFmt(p.tokps)} tokens per second, ${usd(p.cpm)} per million tokens`);
    b.addEventListener('click', () => { sel = i; render(); });
    segs.appendChild(b);
    return b;
  });
  cgroup.append(clab, segs);
  controls.append(cgroup);
  controlsSlot.appendChild(controls);

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'dt-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'dt-cap';
  cap.innerHTML =
    `<b>Llama 3.3 70B</b> (FP16) on an <b>8x H100</b> node renting at 8 x $2.90 = <b>$23.20/hr</b>. ` +
    `Cost per million tokens = cluster $/hr / (tokens-per-sec x 3600). A single-tenant node (B=1) ` +
    `runs ~25 tok/s for <b>$258/M</b>; a filled batch (B=256) runs ~2,800 tok/s for <b>$2.30/M</b> — ` +
    `same silicon, ~112x cheaper. The shaded band is the tax you pay for the batch you can't fill. ` +
    `Tap a batch chip, click the chart, or use the arrow keys.`;
  caption.appendChild(cap);

  const nodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;
    const op = CURVE[sel];

    /* tax band: from the operating point's cost down to the floor cost */
    const xop = xOf(op.batch);
    if (op.cpm > FLOOR.cpm) {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(X0));
      rect.setAttribute('y', String(yCost(op.cpm)));
      rect.setAttribute('width', String(X1 - X0));
      rect.setAttribute('height', String(yCost(FLOOR.cpm) - yCost(op.cpm)));
      rect.setAttribute('class', 'dt-tax');
      gPlot.appendChild(rect);
    }

    /* y gridlines on cost decades + ticks both axes */
    for (const v of [1, 10, 100, 400]) {
      if (v > COST_HI) continue;
      const y = yCost(v);
      mkLine(X0, y, X1, y, 'dt-grid');
      mkText(X0 - 8, y + 3.5, 'dt-axc', `$${v}`, 'end');
    }
    for (const v of [10, 100, 1000, 4000]) {
      if (v > TPS_HI) continue;
      mkText(X1 + 8, yTps(v) + 3.5, 'dt-axt', tpsFmt(v), 'start');
    }
    mkText(X0 - 8, Y_TOP - 16, 'dt-axc', 'cost  $/M tok', 'start');
    mkText(X1 + 8, Y_TOP - 16, 'dt-axt', 'tok/s', 'end');

    /* x ticks at measured batches */
    for (const p of CURVE) {
      const x = xOf(p.batch);
      mkLine(x, Y_TOP, x, Y_BASE, 'dt-grid');
      mkText(x, Y_BASE + 17, 'dt-axislab', String(p.batch), 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 34, 'dt-axis', 'batch size  =  concurrent requests per GPU  (log)', 'middle');

    /* filled-GPU floor line */
    mkLine(X0, yCost(FLOOR.cpm), X1, yCost(FLOOR.cpm), 'dt-floor');
    mkText(X1, yCost(FLOOR.cpm) - 6, 'dt-floorlab', `filled-GPU floor  ${usd(FLOOR.cpm)}/M`, 'end');

    /* cost curve (descending) */
    const costPath = CURVE.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.batch).toFixed(1)},${yCost(p.cpm).toFixed(1)}`).join(' ');
    const pc = document.createElementNS(NS, 'path');
    pc.setAttribute('d', costPath); pc.setAttribute('class', 'dt-cost');
    gPlot.appendChild(pc);
    /* throughput curve (ascending) */
    const tpsPath = CURVE.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.batch).toFixed(1)},${yTps(p.tokps).toFixed(1)}`).join(' ');
    const pt = document.createElementNS(NS, 'path');
    pt.setAttribute('d', tpsPath); pt.setAttribute('class', 'dt-tputline');
    gPlot.appendChild(pt);

    /* curve node markers (interactive) */
    CURVE.forEach((p, i) => {
      const x = xOf(p.batch);
      const ycv = yCost(p.cpm);
      const ytv = yTps(p.tokps);
      const isSel = i === sel;

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'dt-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label',
        `batch ${p.batch}: ${tpsFmt(p.tokps)} tokens per second, ${usd(p.cpm)} per million tokens, ${mult(p.cpm / FLOOR.cpm)} the filled-GPU cost`);

      ([[ycv, 'dt-dot-cost'], [ytv, 'dt-dot-tps']] as [number, string][]).forEach(([yy, dcls]) => {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(yy));
        dot.setAttribute('r', isSel ? '5.5' : '3.6');
        dot.setAttribute('class', `dt-dot ${dcls}`);
        g.appendChild(dot);
      });
      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('cx', String(x)); ring.setAttribute('cy', String(ycv));
      ring.setAttribute('r', '10'); ring.setAttribute('class', 'dt-ring');
      g.appendChild(ring);
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('x', String(x - 16)); hit.setAttribute('y', String(Y_TOP));
      hit.setAttribute('width', '32'); hit.setAttribute('height', String(Y_BASE - Y_TOP));
      hit.setAttribute('class', 'dt-hit');
      g.appendChild(hit);

      const select = () => { sel = i; render(); };
      g.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      nodes[i] = g;
    });

    /* operating-point marker line + labels */
    mkLine(xop, Y_TOP, xop, Y_BASE, 'dt-mk');
    const anchor = xop > X1 - 150 ? 'end' : 'start';
    const lx = xop + (anchor === 'end' ? -8 : 8);
    mkText(lx, yCost(op.cpm) - 12, 'dt-oplab', `${usd(op.cpm)}/M`, anchor);
    const taxN = op.cpm / FLOOR.cpm;
    if (taxN > 1.01) mkText(lx, yCost(op.cpm) + 16, 'dt-tag', `${mult(taxN)} the floor`, anchor);
    const tyLab = yTps(op.tokps);
    mkText(lx, tyLab < Y_TOP + 40 ? tyLab + 18 : tyLab - 10, 'dt-tag', `${tpsFmt(op.tokps)} tok/s`, anchor);

    /* sync chips */
    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel)));

    renderPanel(op);
  }

  function renderPanel(op: Pt) {
    const taxN = op.cpm / FLOOR.cpm;
    const fill = op.tokps / FLOOR.tokps; // GPU-fill proxy vs the saturated batch
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'dt-hd';
    const name = document.createElement('span');
    name.className = 'dt-name';
    name.textContent = op.batch === 1 ? 'B=1 · single tenant' : op.batch === BMAX ? `B=${op.batch} · filled GPU` : `B=${op.batch}`;
    const sub = document.createElement('span');
    sub.className = 'dt-sub';
    sub.textContent = `${CFG.model} · ${CFG.hardware}`;
    hd.append(name, sub);

    const rows = document.createElement('div');
    rows.className = 'dt-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div');
      r.className = 'dt-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      r.append(s, b);
      return r;
    };
    rows.append(
      row('throughput', `${op.tokps.toLocaleString()} tok/s`, 'dt-cyan'),
      row('cost / million tokens', usd(op.cpm), 'dt-amber'),
      row('decentralization tax', mult(taxN), taxN > 2 ? 'dt-warn' : ''),
      row('GPU fill vs B=256', `${(fill * 100).toFixed(fill < 0.1 ? 1 : 0)}%`, ''),
    );

    const meterWrap = document.createElement('div');
    meterWrap.className = 'dt-meter';
    const meterFill = document.createElement('i');
    meterFill.style.width = `${Math.max(1.5, fill * 100)}%`;
    meterWrap.appendChild(meterFill);

    const verdict = document.createElement('div');
    verdict.className = `dt-verdict ${taxN <= 1.05 ? 'dt-ok' : ''}`;
    if (taxN <= 1.05) {
      verdict.innerHTML =
        `A saturated batch runs the card at its ceiling: <b>${usd(op.cpm)}/M</b> tokens. This is the price a centralized provider quotes — and the bar a decentralized network has to clear while still routing many users to one node.`;
    } else {
      const saving = (op.cpm - FLOOR.cpm).toFixed(op.cpm > 50 ? 0 : 2);
      verdict.innerHTML =
        `Serving ${op.batch === 1 ? 'one request at a time' : `only ${op.batch} at a time`} wastes the GPU's parallelism: throughput sits at <b>${(fill * 100).toFixed(fill < 0.1 ? 1 : 0)}%</b> of a filled card, so every token costs <b>${mult(taxN)}</b> the floor — an extra <b>$${saving}/M</b>. That gap is the tax, before a single byte of proof or consensus.`;
    }

    readout.append(hd, rows, meterWrap, verdict);
  }

  /* ---- pointer: click the plot to set the operating point (snap to measured) ---- */
  const onPointer = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((e.clientX - rect.left) / rect.width) * VB_W;
    const target = snap(bOfX(vbx));
    sel = CURVE.findIndex((p) => p.batch === target.batch);
    render();
  };
  svg.addEventListener('pointerdown', onPointer);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      sel = Math.min(CURVE.length - 1, sel + 1); render(); nodes[sel]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      sel = Math.max(0, sel - 1); render(); nodes[sel]?.focus(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('pointerdown', onPointer);
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
