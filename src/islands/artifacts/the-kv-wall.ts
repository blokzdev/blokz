/**
 * Artifact: the-kv-wall — The KV Wall
 * Manifest: content/artifacts/the-kv-wall/manifest.json
 *
 * KV cache size (GiB) vs context length for the Llama 3.1 8B / 70B / 405B
 * family, plotted on log-log axes against three GPU VRAM ceilings.
 *
 * The KV cache grows linearly with context: every token adds
 *   2 × L × H_kv × D_head × bytes_per_element
 * bytes to the in-flight state. For Llama 3.1 8B in BF16 that is 128 KiB/token;
 * at 128K tokens it equals the model's own weight (15 GiB). Toggle INT4 or
 * DeltaKV (3.4×) compression to see the curves drop — and the crossovers shift.
 *
 * Drag or click the chart to slide the context cursor; the panel shows exactly
 * how many GiB each model needs and whether it fits on the selected GPU.
 *
 * Data from content/artifacts/the-kv-wall/data.json (computed from model specs,
 * compression factors from DeltaKV arXiv:2602.08005 and ARKV arXiv:2603.08727).
 */
import data from '../../../content/artifacts/the-kv-wall/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

type Compression = { id: string; label: string; factor: number };

const GiB = 2 ** 30;
const GiB_PER_BYTE = 1 / GiB;

const MODELS = data.models;
const GPUS   = data.gpus;
const COMPS  = data.compressions as Compression[];

const CTX_BITS  = data.contextStepsBits;   // e.g. 12 … 20
const CTX_STEPS = CTX_BITS.map((b: number) => 2 ** b); // 4096 … 1 048 576

const kvGiB = (bytesPerTokenBF16: number, ctx: number, factor: number) =>
  bytesPerTokenBF16 * ctx * factor * GiB_PER_BYTE;

const NS = 'http://www.w3.org/2000/svg';

/* ---- chart geometry (viewBox units) ---- */
const VB_W = 840;
const VB_H = 460;
const X0 = 72;
const X1 = 800;
const Y_TOP = 36;
const Y_BASE = 400;

/* x domain: log2(4096) = 12 … log2(1048576) = 20 */
const B_MIN = 12, B_MAX = 20;
const xOf = (ctx: number) =>
  X0 + ((Math.log2(ctx) - B_MIN) / (B_MAX - B_MIN)) * (X1 - X0);

/* y domain: 0.03 GiB … 10 000 GiB  (log10) */
const Y_MIN_LOG = -1.5, Y_MAX_LOG = 4;        // log10(GiB)
const yOf = (gib: number) => {
  const t = (Math.log10(gib) - Y_MIN_LOG) / (Y_MAX_LOG - Y_MIN_LOG);
  return Y_BASE - Math.min(Math.max(t, 0), 1) * (Y_BASE - Y_TOP);
};

const fmtCtx = (n: number) => n >= 1_048_576 ? `${n / 1048576}M` : n >= 1024 ? `${n / 1024}K` : String(n);
const fmtGiB = (g: number) =>
  g >= 1000 ? `${g.toFixed(0)} GiB` :
  g >= 100  ? `${g.toFixed(0)} GiB` :
  g >= 10   ? `${g.toFixed(1)} GiB` :
  g >= 1    ? `${g.toFixed(2)} GiB` :
              `${(g * 1024).toFixed(0)} MiB`;

export default function mount(container: HTMLElement): () => void {
  let comprIdx = COMPS.findIndex((c) => c.id === data.defaultCompression) ?? 0;
  if (comprIdx < 0) comprIdx = 0;

  /* cursor is an index into CTX_STEPS */
  let cursorIdx = data.defaultCtxBits - CTX_BITS[0];

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VB_W}/${VB_H}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  /* ---- styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .kv-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.13); border-radius:12px; background:#0d1322; }
    .kv-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:manipulation; cursor:crosshair; }
    .kv-grid   { stroke:rgba(124,140,255,.08); }
    .kv-ax     { fill:#8d95ad; font:500 11px 'JetBrains Mono',monospace; }
    .kv-axlab  { fill:#5b6378; font:500 9.5px 'JetBrains Mono',monospace; }
    .kv-gpu    { stroke-dasharray:5 4; stroke-width:1.1; }
    .kv-wt     { stroke-dasharray:2 3; stroke-width:1; }
    .kv-wtlab  { font:500 9px 'JetBrains Mono',monospace; }
    .kv-curve  { fill:none; stroke-width:2.4; }
    .kv-mk     { stroke:rgba(231,234,243,.5); stroke-width:1.3; }
    .kv-cursor { stroke:#e7eaf3; stroke-width:1.2; stroke-dasharray:3 3; }
    .kv-dot    { stroke:#05070d; stroke-width:1.3; }

    .kv-controls { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono',monospace; color:#8d95ad; }
    .kv-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .kv-cgroup > span { font-size:9.5px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .kv-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .kv-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 10.5px 'JetBrains Mono',monospace;
      letter-spacing:.02em; padding:6px 10px; cursor:pointer;
      transition:color .15s,background .15s,border-color .15s; }
    .kv-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .kv-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }

    .kv-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 11.5px/1.5 'JetBrains Mono',monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .kv-rhead { color:#e7eaf3; font-weight:700; font-size:13px; }
    .kv-rsub  { font-size:10px; color:#5b6378; }
    .kv-rows  { display:flex; flex-direction:column; gap:5px; }
    .kv-row   { display:flex; justify-content:space-between; align-items:baseline;
      gap:6px 10px; min-width:0; flex-wrap:wrap; }
    .kv-row span { font-size:10.5px; color:#8d95ad; display:flex; align-items:center; gap:6px; }
    .kv-row b    { font-size:12.5px; font-weight:700; color:#e7eaf3; }
    .kv-swatch { width:8px; height:8px; border-radius:50%; flex-shrink:0; display:inline-block; }
    .kv-ok  { color:#4ade80; }
    .kv-warn{ color:#f59e0b; }
    .kv-bad { color:#f97362; }
    .kv-box { padding:8px 10px; border-radius:8px; font-size:11px; line-height:1.45;
      background:rgba(91,140,255,.08); border:1px solid rgba(91,140,255,.18); color:#a5b4fc; }
    .kv-box b { font-weight:700; color:#c7d2fe; }

    .kv-gpu-legend { display:flex; flex-direction:column; gap:4px; padding:7px 10px;
      border-radius:8px; background:rgba(255,255,255,.03); border:1px solid rgba(124,140,255,.1); }
    .kv-gpu-row { display:flex; align-items:center; gap:8px; font-size:10px; color:#8d95ad; flex-wrap:wrap; }
    .kv-gpu-dash { width:18px; border-top:2px dashed; flex-shrink:0; }

    .kv-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .kv-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- SVG scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'kv-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'KV cache size in GiB vs context length for Llama 3.1 8B, 70B, and 405B models');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  /* helpers */
  const svgEl = (tag: string) => document.createElementNS(NS, tag);
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = svgEl('line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls); gPlot.appendChild(l); return l;
  };
  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = svgEl('text') as SVGTextElement;
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = text; gPlot.appendChild(t); return t;
  };

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'kv-controls';

  const comprGroup = document.createElement('div');
  comprGroup.className = 'kv-cgroup';
  const comprLabel = document.createElement('span');
  comprLabel.textContent = 'KV precision / compression';
  const comprSegs = document.createElement('div');
  comprSegs.className = 'kv-segs';
  comprSegs.setAttribute('role', 'group');
  comprSegs.setAttribute('aria-label', 'KV cache compression');
  const comprBtns = COMPS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'kv-seg'; b.textContent = c.label;
    b.setAttribute('aria-label', c.label);
    b.addEventListener('click', () => { comprIdx = i; render(); });
    comprSegs.appendChild(b); return b;
  });
  comprGroup.append(comprLabel, comprSegs);
  controls.appendChild(comprGroup);

  /* GPU legend (static, no interaction) */
  const gpuLegend = document.createElement('div');
  gpuLegend.className = 'kv-gpu-legend';
  GPUS.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'kv-gpu-row';
    const dash = document.createElement('span');
    dash.className = 'kv-gpu-dash';
    dash.style.borderColor = 'rgba(148,163,184,.5)';
    const lab = document.createElement('span');
    lab.textContent = `${g.label}  ${g.vramGiB} GiB VRAM`;
    row.append(dash, lab);
    gpuLegend.appendChild(row);
  });
  controls.appendChild(gpuLegend);
  controlsSlot.appendChild(controls);

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'kv-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'kv-cap';
  cap.innerHTML =
    `KV cache bytes per token = <b>2 × layers × KV-heads × head-dim × bytes/element</b>. ` +
    `For Llama 3.1 8B (BF16): <b>2 × 32 × 8 × 128 × 2 = 128 KiB/token</b>. At 128K tokens that equals the model weights. ` +
    `<b>DeltaKV</b> (arXiv:2602.08005) reaches 3.4× compression near-losslessly; ` +
    `<b>ARKV</b> (arXiv:2603.08727) 4× at ~97% accuracy. Drag or click the chart to pick a context length.`;
  caption.appendChild(cap);

  /* ---- render ---- */
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);

    const comp = COMPS[comprIdx];

    /* y gridlines */
    const yTicks = [-1, 0, 1, 2, 3, 4]; // log10(GiB)
    for (const lt of yTicks) {
      const gib = 10 ** lt;
      if (gib < 10 ** Y_MIN_LOG || gib > 10 ** Y_MAX_LOG) continue;
      const y = yOf(gib);
      mkLine(X0, y, X1, y, 'kv-grid');
      const lab = lt < 0 ? `${(gib * 1024).toFixed(0)}M` : lt === 0 ? '1 GiB' : `${Math.round(gib)} GiB`;
      mkText(X0 - 6, y + 3.5, 'kv-ax', lab, 'end');
    }

    /* intermediate grid lines */
    for (const lt of [-1, 0, 1, 2, 3]) {
      for (const f of [2, 3, 5, 7]) {
        const gib = f * 10 ** lt;
        if (gib < 10 ** Y_MIN_LOG || gib > 10 ** Y_MAX_LOG) continue;
        const y = yOf(gib);
        const l = svgEl('line');
        l.setAttribute('x1', String(X0)); l.setAttribute('y1', String(y));
        l.setAttribute('x2', String(X1)); l.setAttribute('y2', String(y));
        l.setAttribute('stroke', 'rgba(124,140,255,.04)');
        gPlot.appendChild(l);
      }
    }

    /* x ticks */
    for (const bits of CTX_BITS) {
      const ctx = 2 ** bits;
      const x = xOf(ctx);
      const l = svgEl('line');
      l.setAttribute('x1', String(x)); l.setAttribute('y1', String(Y_TOP));
      l.setAttribute('x2', String(x)); l.setAttribute('y2', String(Y_BASE));
      l.setAttribute('stroke', 'rgba(124,140,255,.07)');
      gPlot.appendChild(l);
      mkText(x, Y_BASE + 16, 'kv-axlab', fmtCtx(ctx), 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 30, 'kv-ax', 'context length (log₂ scale)', 'middle');
    mkText(X0 - 48, (Y_TOP + Y_BASE) / 2, 'kv-ax', 'KV cache (GiB)', 'middle');

    /* y-axis label (rotated) */
    const yAxisLab = svgEl('text') as SVGTextElement;
    yAxisLab.setAttribute('transform', `rotate(-90,18,${(Y_TOP + Y_BASE) / 2})`);
    yAxisLab.setAttribute('x', '0'); yAxisLab.setAttribute('y', '0');
    yAxisLab.setAttribute('class', 'kv-ax');
    yAxisLab.setAttribute('text-anchor', 'middle');
    yAxisLab.setAttribute('dominant-baseline', 'middle');
    yAxisLab.textContent = 'KV cache  (GiB)';
    gPlot.appendChild(yAxisLab);

    /* GPU VRAM ceiling lines */
    const gpuColors = ['rgba(148,163,184,.4)', 'rgba(148,163,184,.55)', 'rgba(148,163,184,.7)'];
    GPUS.forEach((g, gi) => {
      if (g.vramGiB > 10 ** Y_MAX_LOG) return;
      const y = yOf(g.vramGiB);
      const ln = mkLine(X0, y, X1, y, 'kv-gpu');
      ln.setAttribute('stroke', gpuColors[gi] ?? gpuColors[2]);
      mkText(X1 + 3, y + 3.5, 'kv-axlab', g.label, 'start');
    });

    /* model weight lines */
    MODELS.forEach((m) => {
      const weightGiB = m.weightGiB;
      if (weightGiB > 10 ** Y_MAX_LOG) return;
      const y = yOf(weightGiB);
      const ln = mkLine(X0, y, X1, y, 'kv-wt');
      ln.setAttribute('stroke', m.color);
      ln.setAttribute('stroke-opacity', '0.4');
      // label at right edge
      const wt = svgEl('text') as SVGTextElement;
      wt.setAttribute('x', String(X1 - 2));
      wt.setAttribute('y', String(y - 4));
      wt.setAttribute('class', 'kv-wtlab');
      wt.setAttribute('text-anchor', 'end');
      wt.setAttribute('fill', m.color);
      wt.setAttribute('fill-opacity', '0.55');
      wt.textContent = `${m.labelShort} weights`;
      gPlot.appendChild(wt);
    });

    /* KV cache curves */
    MODELS.forEach((m) => {
      const pts = CTX_STEPS.map((ctx) => {
        const gib = kvGiB(m.bytesPerTokenBF16, ctx, comp.factor);
        return `${xOf(ctx).toFixed(1)},${yOf(gib).toFixed(1)}`;
      });
      const path = svgEl('path');
      path.setAttribute('d', `M${pts.join('L')}`);
      path.setAttribute('class', 'kv-curve');
      path.setAttribute('stroke', m.color);
      gPlot.appendChild(path);

      /* end-of-curve label */
      const lastCtx = CTX_STEPS[CTX_STEPS.length - 1];
      const lastGiB = kvGiB(m.bytesPerTokenBF16, lastCtx, comp.factor);
      const ly = yOf(lastGiB);
      if (ly >= Y_TOP - 4 && ly <= Y_BASE + 4) {
        const lab = svgEl('text') as SVGTextElement;
        lab.setAttribute('x', String(X1 + 3));
        lab.setAttribute('y', String(ly + 4));
        lab.setAttribute('class', 'kv-axlab');
        lab.setAttribute('text-anchor', 'start');
        lab.setAttribute('fill', m.color);
        lab.textContent = m.labelShort;
        gPlot.appendChild(lab);
      }
    });

    /* cursor line */
    const curCtx = CTX_STEPS[cursorIdx];
    const cx = xOf(curCtx);
    mkLine(cx, Y_TOP, cx, Y_BASE, 'kv-cursor');

    /* dots on each curve at cursor */
    MODELS.forEach((m) => {
      const gib = kvGiB(m.bytesPerTokenBF16, curCtx, comp.factor);
      const cy = yOf(gib);
      if (cy >= Y_TOP - 6 && cy <= Y_BASE + 6) {
        const dot = svgEl('circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(cy));
        dot.setAttribute('r', '4.5');
        dot.setAttribute('class', 'kv-dot');
        dot.setAttribute('fill', m.color);
        gPlot.appendChild(dot);
      }
    });

    /* sync buttons */
    comprBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === comprIdx)));

    renderPanel(curCtx, comp);
  }

  function renderPanel(ctx: number, comp: Compression) {
    readout.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'kv-rhead';
    head.textContent = fmtCtx(ctx) + ' tokens';
    const sub = document.createElement('div');
    sub.className = 'kv-rsub';
    sub.textContent = comp.label + ' compression';
    readout.append(head, sub);

    const rows = document.createElement('div');
    rows.className = 'kv-rows';

    MODELS.forEach((m) => {
      const gib = kvGiB(m.bytesPerTokenBF16, ctx, comp.factor);
      const row = document.createElement('div');
      row.className = 'kv-row';

      const nameSpan = document.createElement('span');
      const swatch = document.createElement('span');
      swatch.className = 'kv-swatch';
      swatch.style.background = m.color;
      nameSpan.append(swatch, document.createTextNode(m.labelShort));

      const valSpan = document.createElement('b');
      valSpan.textContent = fmtGiB(gib);

      /* color-code: fits on H100? */
      const biggestGpu = GPUS[GPUS.length - 1]; // H100 80G
      if (gib > biggestGpu.vramGiB) valSpan.classList.add('kv-bad');
      else if (gib > GPUS[0].vramGiB) valSpan.classList.add('kv-warn');
      else valSpan.classList.add('kv-ok');

      row.append(nameSpan, valSpan);
      rows.appendChild(row);
    });
    readout.appendChild(rows);

    /* which GPUs can hold the 8B KV cache? */
    const kv8b = kvGiB(MODELS[0].bytesPerTokenBF16, ctx, comp.factor);
    const fits = GPUS.filter((g) => g.vramGiB >= kv8b);
    const box = document.createElement('div');
    box.className = 'kv-box';
    if (fits.length === 0) {
      box.innerHTML = `<b>8B KV alone (${fmtGiB(kv8b)}) exceeds every listed GPU.</b> Even with INT4 weights loaded, serving requires multi-GPU NVLink.`;
    } else if (fits.length < GPUS.length) {
      const smallest = fits[0];
      box.innerHTML = `<b>8B KV fits on ${smallest.label}</b> (${smallest.vramGiB} GiB). Every request at this length needs a dedicated GPU slot — no batching with other users sharing that KV buffer.`;
    } else {
      box.innerHTML = `<b>8B KV fits all three GPUs</b> at ${fmtGiB(kv8b)}. Batching is possible here; the constraint shifts to model weights and aggregate capacity.`;
    }
    readout.appendChild(box);
  }

  /* ---- pointer interaction ---- */
  const snapCtxFrom = (svgXFraction: number) => {
    const bits = B_MIN + svgXFraction * (B_MAX - B_MIN);
    const nearest = CTX_BITS.reduce((best, b) => Math.abs(b - bits) < Math.abs(best - bits) ? b : best, CTX_BITS[0]);
    return CTX_BITS.indexOf(nearest);
  };

  const onPointer = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((e.clientX - rect.left) / rect.width) * VB_W;
    const frac = (vbx - X0) / (X1 - X0);
    const idx = snapCtxFrom(Math.min(Math.max(frac, 0), 1));
    if (idx !== cursorIdx) { cursorIdx = idx; render(); }
  };

  let dragging = false;
  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    onPointer(e);
  });
  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (dragging) onPointer(e);
  });
  const stopDrag = () => { dragging = false; };
  svg.addEventListener('pointerup', stopDrag);
  svg.addEventListener('pointercancel', stopDrag);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      cursorIdx = Math.min(CTX_BITS.length - 1, cursorIdx + 1); render(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      cursorIdx = Math.max(0, cursorIdx - 1); render(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('keydown', onKey);
    svg.removeEventListener('pointerup', stopDrag);
    svg.removeEventListener('pointercancel', stopDrag);
    style.remove();
  };
}
