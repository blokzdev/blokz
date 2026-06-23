/**
 * Artifact: the-inversion-window — The Inversion Window
 * Manifest: content/artifacts/the-inversion-window/manifest.json
 *
 * Shows gradient reconstruction quality (PSNR, dB) vs FL batch size,
 * with an optional differential privacy noise overlay. Illustrates
 * why on-chain federated learning cannot be both private and useful.
 *
 * Data: Geiping et al. 2020 optimization-based inversion curve fit;
 * DP utility from Abadi et al. 2016 DP-SGD benchmarks.
 */
import data from '../../../content/artifacts/the-inversion-window/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 840, VB_H = 400;
const X0 = 66, X1 = 808, Y0 = 22, Y1 = 342;

const { intercept, slope, floor: psnrFloor } = data.psnrModel;
const { photographic, recognizable, degraded } = data.thresholds;

function basePsnr(batch: number): number {
  return Math.max(psnrFloor, intercept - slope * Math.log2(Math.max(batch, 1)));
}

function dpPsnr(batch: number, level: typeof data.dpLevels[number]): number {
  return Math.max(0, basePsnr(batch) - level.psnrReduction);
}

const PSNR_MAX = 35;
const xOf = (b: number) => X0 + (Math.log2(Math.max(b, 1)) / 8) * (X1 - X0);
const yOf = (p: number) => Y1 - (Math.max(0, Math.min(PSNR_MAX, p)) / PSNR_MAX) * (Y1 - Y0);
const bOfFracX = (fx: number) => Math.round(2 ** (Math.max(0, Math.min(1, fx)) * 8));

function qualityLabel(psnr: number): { label: string; color: string } {
  if (psnr >= photographic) return { label: 'Photographic', color: '#f87171' };
  if (psnr >= recognizable) return { label: 'Recognizable', color: '#fbbf24' };
  if (psnr >= degraded)     return { label: 'Degraded',     color: '#a3a3a3' };
  return { label: 'Private', color: '#5fd39b' };
}

export default function mount(container: HTMLElement): () => void {
  let batchSize = 8;
  let activeEps: number | null = null; // null = no DP

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '840/400',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // ─── styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .iw-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; cursor:crosshair; }
    .iw-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .iw-axis { fill:#8d95ad; font:500 11px 'JetBrains Mono',monospace; }
    .iw-grid { stroke:rgba(124,140,255,.08); stroke-width:1; }
    .iw-threshold { stroke-width:1; stroke-dasharray:3 5; }
    .iw-curve { fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .iw-cursor { stroke:rgba(200,210,255,.45); stroke-width:1.5; stroke-dasharray:5 3; pointer-events:none; }
    .iw-dot { stroke:#0d1322; stroke-width:2; }
    .iw-zone-label { font:600 9px 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; pointer-events:none; }

    .iw-controls { display:flex; flex-direction:column; gap:12px; min-width:0; }
    .iw-eps-section { display:flex; flex-direction:column; gap:6px; }
    .iw-ctrl-lbl { font:600 9.5px 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.07em; text-transform:uppercase; }
    .iw-eps-row { display:flex; gap:5px; flex-wrap:wrap; }
    .iw-eps-btn { padding:5px 9px; border-radius:7px;
      border:1px solid rgba(124,140,255,.2); background:rgba(124,140,255,.05);
      color:#8d95ad; font:600 10px 'JetBrains Mono',monospace; cursor:pointer;
      letter-spacing:.04em; transition:all .15s ease; white-space:nowrap; }
    .iw-eps-btn:hover { border-color:rgba(124,140,255,.4); color:#e7eaf3; }
    .iw-eps-btn.iw-active { border-color:rgba(34,211,238,.55); background:rgba(34,211,238,.1); color:#67e8f9; }
    .iw-batch-section { display:flex; flex-direction:column; gap:6px; }
    .iw-batch-meta { display:flex; justify-content:space-between; align-items:baseline; min-width:0; }
    .iw-batch-val { font:700 13px 'JetBrains Mono',monospace; color:#e7eaf3;
      font-variant-numeric:tabular-nums; }
    .iw-batch-inp { width:100%; cursor:pointer; accent-color:#7c8cff; }

    .iw-panel { display:flex; flex-direction:column; gap:8px; min-width:0;
      font:500 11.5px/1.55 'JetBrains Mono',monospace; }
    .iw-prow { display:flex; justify-content:space-between; align-items:baseline;
      gap:6px; min-width:0; }
    .iw-prow span { font-size:10.5px; color:#8d95ad; }
    .iw-prow b { font-weight:700; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .iw-divider { border:none; border-top:1px solid rgba(124,140,255,.12); margin:2px 0; }
    .iw-verdict { padding:9px 11px; border-radius:9px; font-size:10.5px; line-height:1.55;
      min-width:0; overflow-wrap:anywhere; margin-top:4px; }
    .iw-verdict b { font-weight:700; }

    .iw-legend { display:flex; flex-direction:column; gap:4px; }
    .iw-legend-row { display:flex; align-items:center; gap:6px; font:500 10px 'JetBrains Mono',monospace; }
    .iw-legend-line { width:22px; height:2px; border-radius:1px; flex:none; }
    .iw-legend-line.dp { background:repeating-linear-gradient(90deg,#22d3ee 0 6px,transparent 6px 10px); }

    .iw-cap { font:500 9px/1.6 'JetBrains Mono',monospace; color:#5b6378;
      min-width:0; overflow-wrap:anywhere; }
    .iw-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  // ─── SVG stage ────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'iw-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Gradient reconstruction quality vs batch size');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  const gBg = document.createElementNS(NS, 'g'); svg.appendChild(gBg);
  const gCurves = document.createElementNS(NS, 'g'); svg.appendChild(gCurves);
  const gCursor = document.createElementNS(NS, 'g'); svg.appendChild(gCursor);
  const gOverlay = document.createElementNS(NS, 'g'); svg.appendChild(gOverlay);

  function mk(tag: string, attrs: Record<string, string | number>, parent: Element = gBg): SVGElement {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    parent.appendChild(el);
    return el as SVGElement;
  }
  function mkText(x: number, y: number, cls: string, text: string, anchor = 'middle', parent: Element = gBg): SVGTextElement {
    const t = document.createElementNS(NS, 'text') as SVGTextElement;
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = text; parent.appendChild(t); return t;
  }

  // ─── Panel ────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'iw-panel';
  panel.appendChild(panelEl);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'iw-controls';

  // Legend
  const legend = document.createElement('div');
  legend.className = 'iw-legend';
  const mkLegRow = (color: string, dp: boolean, label: string) => {
    const row = document.createElement('div'); row.className = 'iw-legend-row';
    const line = document.createElement('div');
    line.className = 'iw-legend-line' + (dp ? ' dp' : '');
    if (!dp) line.style.background = color;
    const lbl = document.createElement('span'); lbl.style.color = '#8d95ad'; lbl.textContent = label;
    row.append(line, lbl); return row;
  };
  legend.append(
    mkLegRow('#7c8cff', false, 'No DP — gradients as published'),
    mkLegRow('#22d3ee', true,  'With DP — after noise injection'),
  );
  ctrlWrap.appendChild(legend);

  // ε buttons
  const epsSection = document.createElement('div');
  epsSection.className = 'iw-eps-section';
  const epsLbl = document.createElement('div');
  epsLbl.className = 'iw-ctrl-lbl'; epsLbl.textContent = 'DP budget ε';
  epsSection.appendChild(epsLbl);
  const epsRow = document.createElement('div');
  epsRow.className = 'iw-eps-row';
  const epsBtns: HTMLButtonElement[] = [];
  const EPS_OPTS = [null, ...data.dpLevels] as (typeof data.dpLevels[number] | null)[];
  for (const opt of EPS_OPTS) {
    const btn = document.createElement('button');
    btn.className = 'iw-eps-btn' + (opt === null ? ' iw-active' : '');
    btn.textContent = opt === null ? 'None' : opt.label;
    btn.setAttribute('aria-pressed', String(opt === null));
    btn.addEventListener('click', () => {
      activeEps = opt?.eps ?? null;
      epsBtns.forEach((b, i) => {
        const active = EPS_OPTS[i]?.eps === activeEps && !(EPS_OPTS[i] === null && activeEps !== null) || (EPS_OPTS[i] === null && activeEps === null);
        b.classList.toggle('iw-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      render();
    });
    epsRow.appendChild(btn);
    epsBtns.push(btn);
  }
  epsSection.appendChild(epsRow);
  ctrlWrap.appendChild(epsSection);

  // Batch slider
  const batchSection = document.createElement('div');
  batchSection.className = 'iw-batch-section';
  const batchLblRow = document.createElement('div');
  batchLblRow.className = 'iw-ctrl-lbl iw-batch-meta';
  const batchLblTxt = document.createElement('span');
  batchLblTxt.textContent = 'Batch size';
  const batchValEl = document.createElement('span');
  batchValEl.className = 'iw-batch-val'; batchValEl.textContent = String(batchSize);
  batchLblRow.append(batchLblTxt, batchValEl);
  const batchInp = document.createElement('input');
  batchInp.type = 'range'; batchInp.className = 'iw-batch-inp';
  batchInp.min = '0'; batchInp.max = '8'; batchInp.step = '1';
  batchInp.value = '3'; // log2(8) = 3
  batchInp.setAttribute('aria-label', 'Batch size (powers of 2 from 1 to 256)');
  batchInp.addEventListener('input', () => {
    batchSize = 2 ** Number(batchInp.value);
    batchValEl.textContent = String(batchSize);
    render();
  });
  batchSection.append(batchLblRow, batchInp);
  ctrlWrap.appendChild(batchSection);
  controlsSlot.appendChild(ctrlWrap);

  // Tap chart to set batch
  wrap.addEventListener('pointerdown', (e: PointerEvent) => {
    const rect = wrap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const svgX = fx * VB_W;
    if (svgX < X0 - 8 || svgX > X1 + 8) return;
    const newB = bOfFracX((svgX - X0) / (X1 - X0));
    batchSize = Math.max(1, Math.min(256, newB));
    const log2B = Math.round(Math.log2(batchSize));
    batchInp.value = String(Math.max(0, Math.min(8, log2B)));
    batchValEl.textContent = String(batchSize);
    render();
  });

  // ─── Caption ──────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'iw-cap';
  cap.innerHTML =
    `<b>Source:</b> Geiping et al. 2020 (arXiv:2003.14053) optimization-based inversion, ResNet-18/ImageNet. ` +
    `DP utility: Abadi et al. 2016 DP-SGD CIFAR-10 benchmarks. Curve is a model fit — actual values vary by architecture and dataset. ` +
    `On a public blockchain, every historical gradient stays permanently readable: a future inversion breakthrough retroactively breaks every past training round.`;
  caption.appendChild(cap);

  // ─── Render ───────────────────────────────────────────────────────────────
  const ZONE_COLORS = [
    { pMin: photographic, pMax: PSNR_MAX, fill: 'rgba(248,113,113,.07)',  label: 'PHOTOGRAPHIC', labelColor: 'rgba(248,113,113,.55)' },
    { pMin: recognizable, pMax: photographic, fill: 'rgba(251,191,36,.05)', label: 'RECOGNIZABLE',  labelColor: 'rgba(251,191,36,.5)' },
    { pMin: degraded,     pMax: recognizable, fill: 'rgba(163,163,163,.04)', label: 'DEGRADED',   labelColor: 'rgba(163,163,163,.45)' },
    { pMin: 0,            pMax: degraded,     fill: 'rgba(95,211,155,.07)', label: 'PRIVATE',     labelColor: 'rgba(95,211,155,.6)' },
  ];

  function render() {
    while (gBg.firstChild) gBg.removeChild(gBg.firstChild);
    while (gCurves.firstChild) gCurves.removeChild(gCurves.firstChild);
    while (gCursor.firstChild) gCursor.removeChild(gCursor.firstChild);
    while (gOverlay.firstChild) gOverlay.removeChild(gOverlay.firstChild);

    // Zones
    for (const z of ZONE_COLORS) {
      mk('rect', { x: X0, y: yOf(z.pMax), width: X1 - X0, height: yOf(z.pMin) - yOf(z.pMax), fill: z.fill });
      const t = mkText(X1 - 5, yOf((z.pMin + z.pMax) / 2) + 3.5, 'iw-zone-label', z.label, 'end');
      t.setAttribute('fill', z.labelColor);
    }

    // Threshold lines
    for (const { p, color } of [
      { p: photographic, color: 'rgba(248,113,113,.25)' },
      { p: recognizable, color: 'rgba(251,191,36,.25)' },
      { p: degraded,     color: 'rgba(95,211,155,.25)' },
    ]) {
      mk('line', { x1: X0, y1: yOf(p), x2: X1, y2: yOf(p), stroke: color, class: 'iw-threshold' });
    }

    // Y axis grid + labels
    for (const p of [0, 5, 10, 15, 20, 25, 30, 35]) {
      const y = yOf(p);
      mk('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'iw-grid' });
      mkText(X0 - 6, y + 4, 'iw-axis', String(p), 'end');
    }
    // Y axis title (rotated)
    const yTitle = mkText(14, (Y0 + Y1) / 2, 'iw-axis', 'PSNR (dB)', 'middle');
    yTitle.setAttribute('transform', `rotate(-90,14,${(Y0 + Y1) / 2})`);

    // X axis grid + labels
    for (let b2 = 0; b2 <= 8; b2++) {
      const b = 2 ** b2;
      const x = xOf(b);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'iw-grid' });
      mkText(x, Y1 + 16, 'iw-axis', b.toString(), 'middle');
    }
    mkText((X0 + X1) / 2, Y1 + 32, 'iw-axis', 'batch size (images per gradient step)', 'middle');

    // Axes borders
    mk('line', { x1: X0, y1: Y0, x2: X0, y2: Y1, stroke: 'rgba(124,140,255,.2)', 'stroke-width': 1 });
    mk('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, stroke: 'rgba(124,140,255,.2)', 'stroke-width': 1 });

    // No-DP curve
    {
      const STEPS = 300;
      let d = '';
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const b = Math.exp(t * Math.log(256));
        const x = xOf(b), y = yOf(basePsnr(b));
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      mk('path', { d, class: 'iw-curve', stroke: '#7c8cff', opacity: activeEps !== null ? '0.32' : '1' }, gCurves);
    }

    // DP curve (if active)
    const activeDpLevel = activeEps !== null ? (data.dpLevels.find(l => l.eps === activeEps) ?? null) : null;
    if (activeDpLevel) {
      const STEPS = 300;
      let d = '';
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const b = Math.exp(t * Math.log(256));
        const x = xOf(b), y = yOf(dpPsnr(b, activeDpLevel));
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      mk('path', { d, class: 'iw-curve', stroke: '#22d3ee', 'stroke-dasharray': '10 5' }, gCurves);
    }

    // Cursor
    const cx = xOf(batchSize);
    mk('line', { x1: cx, y1: Y0, x2: cx, y2: Y1, class: 'iw-cursor' }, gCursor);

    // Dots
    const noDP_p = basePsnr(batchSize);
    mk('circle', { cx, cy: yOf(noDP_p), r: 6, fill: '#7c8cff', class: 'iw-dot' }, gCursor);
    if (activeDpLevel) {
      const dp_p = dpPsnr(batchSize, activeDpLevel);
      mk('circle', { cx, cy: yOf(dp_p), r: 6, fill: '#22d3ee', class: 'iw-dot' }, gCursor);
    }

    renderPanel(noDP_p, activeDpLevel);
  }

  function renderPanel(noDP_p: number, dpLevel: typeof data.dpLevels[number] | null) {
    panelEl.innerHTML = '';

    const noDP_q = qualityLabel(noDP_p);
    const row = (label: string, val: string, color = '#e7eaf3') => {
      const r = document.createElement('div'); r.className = 'iw-prow';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); b.style.color = color; b.textContent = val;
      r.append(s, b); return r;
    };
    const hr = () => { const d = document.createElement('hr'); d.className = 'iw-divider'; return d; };

    panelEl.append(
      row('batch size', String(batchSize)),
      row('no DP  PSNR', `${noDP_p.toFixed(1)} dB`, noDP_q.color),
      row('no DP  quality', noDP_q.label, noDP_q.color),
    );

    if (dpLevel) {
      const dp_p = dpPsnr(batchSize, dpLevel);
      const dp_q = qualityLabel(dp_p);
      panelEl.appendChild(hr());
      panelEl.append(
        row(`ε=${dpLevel.eps}  PSNR`, `${dp_p.toFixed(1)} dB`, dp_q.color),
        row(`ε=${dpLevel.eps}  quality`, dp_q.label, dp_q.color),
        row('model utility', `${dpLevel.utilityPct}%`,
          dpLevel.utilityPct >= 70 ? '#5fd39b' : dpLevel.utilityPct >= 40 ? '#fbbf24' : '#f87171'),
      );
    }

    panelEl.appendChild(hr());

    const verdict = document.createElement('div');
    verdict.className = 'iw-verdict';

    if (!dpLevel) {
      if (noDP_p >= photographic) {
        verdict.style.cssText = 'border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.08);color:#fca5a5;';
        verdict.innerHTML = `<b>Data leaks.</b> At batch&nbsp;${batchSize} with no DP, gradient inversion reconstructs training images at photographic quality. These gradients are permanently stored on-chain.`;
      } else if (noDP_p >= recognizable) {
        verdict.style.cssText = 'border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.06);color:#fde68a;';
        verdict.innerHTML = `<b>Recognizable.</b> Faces and objects remain identifiable. GAN-prior attacks (GIFD, arXiv:2308.04699) can push quality further at this batch size.`;
      } else {
        verdict.style.cssText = 'border:1px solid rgba(163,163,163,.2);background:rgba(163,163,163,.04);color:#d4d4d4;';
        verdict.innerHTML = `<b>Degraded — not private.</b> Optimization-based inversion struggles, but analytics attacks still recover training labels. On-chain permanence means future advances will eventually work here too.`;
      }
    } else {
      const dp_p = dpPsnr(batchSize, dpLevel);
      const dp_q = qualityLabel(dp_p);
      if (dp_q.label === 'Private') {
        if (dpLevel.utilityPct < 30) {
          verdict.style.cssText = 'border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.06);color:#fde68a;';
          verdict.innerHTML = `<b>Private but unusable.</b> ε=${dpLevel.eps} closes the inversion window to ${dp_p.toFixed(0)}&nbsp;dB, but only ${dpLevel.utilityPct}% model utility survives the noise. The privacy-utility tradeoff is broken at this ε.`;
        } else {
          verdict.style.cssText = 'border:1px solid rgba(95,211,155,.3);background:rgba(95,211,155,.07);color:#6ee7b7;';
          verdict.innerHTML = `<b>Private.</b> ε=${dpLevel.eps} noise keeps reconstruction below the recognizable threshold (${dp_p.toFixed(0)}&nbsp;dB) while retaining ${dpLevel.utilityPct}% utility. This is the narrow viable zone — if it exists for your task.`;
        }
      } else {
        verdict.style.cssText = 'border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.08);color:#fca5a5;';
        verdict.innerHTML = `<b>Still "${dp_q.label.toLowerCase()}".</b> ε=${dpLevel.eps} reduces PSNR from ${noDP_p.toFixed(0)} to ${dp_p.toFixed(0)}&nbsp;dB but doesn't reach the private zone. ${dpLevel.utilityPct}% utility survives — but privacy doesn't. Try a smaller ε or larger batch.`;
      }
    }
    panelEl.appendChild(verdict);
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
