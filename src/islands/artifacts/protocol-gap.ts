/**
 * Artifact: protocol-gap — The Protocol Gap
 * Manifest: content/artifacts/protocol-gap/manifest.json
 *
 * Four switchable bar charts over the Elliptic Bitcoin AML benchmark:
 * the 2019 original results, the 2026 strict-inductive re-evaluation,
 * one GraphSAGE trained on four different graphs, and the per-step F1
 * cliff at time step 43. Numbers are a static snapshot of Weber et al.
 * (arXiv:1908.02591) and Maganti (arXiv:2604.19514) in ./data.json —
 * no runtime fetches.
 *
 * Geometry is SVG stretched with preserveAspectRatio="none" (rectangles
 * survive non-uniform scaling; strokes use non-scaling-stroke); ALL text
 * is positioned DOM in fixed px so it stays legible on phones.
 *
 * Layout: shared responsive primitive (stage chart · panel legend+readout ·
 * footer tabs · caption note). The four chart-switch tabs read as a
 * full-width row under [stage | panel] in wide mode.
 */
import data from '../../../content/artifacts/protocol-gap/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Bar {
  label: string;
  sub?: string;
  f1: number;
  std?: number;
  kind: string;
  illicitPct?: number;
  detail: string;
}
interface Mode {
  id: string;
  label: string;
  title: string;
  insight: string;
  shutdownAfterIndex?: number;
  bars: Bar[];
}
const MODES = data.modes as Mode[];

const NS = 'http://www.w3.org/2000/svg';

/* Plot area in viewBox percent (viewBox is 0 0 100 100, stretched to fill) */
const X0 = 8;
const X1 = 98.5;
const Y_TOP = 6;
const Y_BASE = 76;
const F1_MAX = 0.9;

const yOf = (f1: number) => Y_BASE - (f1 / F1_MAX) * (Y_BASE - Y_TOP);

const COLORS: Record<string, { fill: string; stroke: string }> = {
  tree: { fill: 'rgba(91,140,255,.32)', stroke: '#5b8cff' },
  gnn: { fill: 'rgba(34,211,238,.22)', stroke: '#22d3ee' },
  linear: { fill: 'rgba(141,149,173,.18)', stroke: '#8d95ad' },
  violet: { fill: 'rgba(139,92,246,.24)', stroke: '#8b5cf6' },
  cliff: { fill: 'rgba(139,92,246,.24)', stroke: '#8b5cf6' },
};

const LEGENDS: Record<string, { kind: string; label: string }[]> = {
  weber2019: [
    { kind: 'tree', label: 'trees' },
    { kind: 'gnn', label: 'GNNs' },
    { kind: 'linear', label: 'linear / MLP' },
  ],
  inductive2026: [
    { kind: 'tree', label: 'trees' },
    { kind: 'gnn', label: 'GNNs' },
    { kind: 'linear', label: 'linear / MLP' },
  ],
  graphs: [
    { kind: 'tree', label: 'train-period graph' },
    { kind: 'gnn', label: 'full graph (leaky)' },
    { kind: 'violet', label: 'degraded graph' },
  ],
  cliff: [
    { kind: 'gnn', label: 'pre-shutdown' },
    { kind: 'cliff', label: 'post-shutdown' },
  ],
};

const fmtF1 = (v: number) => v.toFixed(3);

export default function mount(container: HTMLElement): () => void {
  let modeIdx = 0;
  let pinned = -1;
  let raf = 0;

  const mode = () => MODES[modeIdx]!;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(200px, 52vw, 340px)',
  });
  const { stage, panel, controls: controlsSlot, caption: captionSlot } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .pg-tabs { display:inline-flex; flex-wrap:wrap; border:1px solid rgba(124,140,255,.14);
      border-radius:8px; overflow:hidden; }
    .pg-tabs button { appearance:none; border:0; background:transparent; color:#5b6378;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.05em; padding:7px 10px;
      cursor:pointer; transition:color .2s, background .2s; white-space:nowrap; }
    .pg-tabs button[aria-pressed="true"] { background:rgba(91,140,255,.13); color:#e7eaf3; }
    .pg-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .pg-legend { display:flex; gap:12px; flex-wrap:wrap;
      font:500 10px/1.45 'JetBrains Mono', monospace; color:#5b6378; }
    .pg-legend i { display:inline-block; width:9px; height:9px; border-radius:2px;
      margin-right:5px; vertical-align:-1px; }
    .pg-caption { font:500 10px/1.45 'JetBrains Mono', monospace;
      color:#5b6378; letter-spacing:.03em; min-height:14px; }
    .pg-chartwrap { position:absolute; inset:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      overflow:hidden; }
    .pg-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .pg-overlay { position:absolute; inset:0; pointer-events:none; }
    .pg-fade { transition:opacity .25s ease; }
    .pg-gridlabel { position:absolute; transform:translate(0,-50%); font-size:10px;
      color:#5b6378; }
    .pg-axistitle { position:absolute; left:10px; top:4px; font-size:10px; color:#5b6378;
      letter-spacing:.06em; text-transform:uppercase; }
    .pg-val { position:absolute; transform:translate(-50%,-100%); font-size:11.5px;
      font-weight:600; color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .pg-cat { position:absolute; transform:translate(-50%,0); font-size:10.5px;
      color:#8d95ad; text-align:center; line-height:1.3; }
    .pg-cat small { display:block; font-size:9px; color:#5b6378; }
    .pg-shutlabel { position:absolute; transform:translate(-50%,0); font-size:9.5px;
      color:#8b5cf6; letter-spacing:.04em; white-space:nowrap; }
    .pg-hits { position:absolute; inset:0; }
    .pg-hit { position:absolute; appearance:none; background:transparent; border:0;
      cursor:pointer; border-radius:6px; padding:0; }
    .pg-hit:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .pg-readout { min-height:30px; font:500 11px/1.45 'JetBrains Mono', monospace;
      color:#8d95ad; font-variant-numeric:tabular-nums; }
    .pg-readout b { color:#e7eaf3; font-weight:600; }
    .pg-readout i { color:#22d3ee; font-style:normal; }
  `;
  stage.appendChild(style);

  /* ---- Tabs (controls) ---- */
  const tabs = document.createElement('div');
  tabs.className = 'pg-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Result set');
  const tabButtons = MODES.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.setAttribute('aria-pressed', String(i === modeIdx));
    b.addEventListener('click', () => setMode(i));
    tabs.appendChild(b);
    return b;
  });
  controlsSlot.appendChild(tabs);

  const captionEl = document.createElement('div');
  captionEl.className = 'pg-caption';
  captionSlot.appendChild(captionEl);

  /* ---- Stage: SVG geometry + DOM text overlay + hit layer ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'pg-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const overlay = document.createElement('div');
  overlay.className = 'pg-overlay';
  const hits = document.createElement('div');
  hits.className = 'pg-hits';
  chartWrap.append(svg, overlay, hits);
  stage.appendChild(chartWrap);

  /* ---- Panel: legend + readout ---- */
  const legend = document.createElement('div');
  legend.className = 'pg-legend';
  panel.appendChild(legend);

  /* Static grid */
  for (const v of [0, 0.2, 0.4, 0.6, 0.8]) {
    const y = yOf(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', v === 0 ? 'rgba(124,140,255,.28)' : 'rgba(124,140,255,.1)');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
    const lab = document.createElement('span');
    lab.className = 'pg-gridlabel';
    lab.style.left = '10px';
    lab.style.top = `${y}%`;
    lab.textContent = v.toFixed(1);
    overlay.appendChild(lab);
  }
  const axisTitle = document.createElement('span');
  axisTitle.className = 'pg-axistitle';
  axisTitle.textContent = 'illicit-class F1';
  overlay.appendChild(axisTitle);

  /* Dynamic groups, rebuilt per mode */
  const barsGroup = document.createElementNS(NS, 'g');
  svg.appendChild(barsGroup);
  const dynLabels = document.createElement('div');
  dynLabels.className = 'pg-fade';
  overlay.appendChild(dynLabels);

  const readout = document.createElement('div');
  readout.className = 'pg-readout';
  panel.appendChild(readout);

  /* ---- Readout ---- */
  function setReadout(i: number) {
    readout.innerHTML = '';
    if (i < 0) {
      readout.textContent = mode().insight;
      return;
    }
    const bar = mode().bars[i]!;
    const b = document.createElement('b');
    b.textContent = bar.sub ? `${bar.label} (${bar.sub})` : bar.label;
    const f1 = document.createElement('i');
    f1.textContent = ` F1 ${fmtF1(bar.f1)}${bar.std ? ` ±${bar.std}` : ''}`;
    readout.append(b, ' —', f1, ` · ${bar.detail}`);
    if (bar.illicitPct !== undefined) readout.append(` · ${bar.illicitPct}% of labels illicit`);
  }

  function ariaFor(bar: Bar): string {
    return (
      `${bar.label}${bar.sub ? `, ${bar.sub}` : ''}: illicit-class F1 ${fmtF1(bar.f1)}` +
      (bar.std ? ` plus or minus ${bar.std}` : '') +
      `, ${bar.detail}` +
      (bar.illicitPct !== undefined ? `, ${bar.illicitPct} percent of labels illicit` : '')
    );
  }

  /* ---- Build a mode ---- */
  function build() {
    const m = mode();
    barsGroup.replaceChildren();
    dynLabels.replaceChildren();
    hits.replaceChildren();
    captionEl.textContent = m.title;
    legend.replaceChildren(
      ...(LEGENDS[m.id] ?? []).map((e) => {
        const s = document.createElement('span');
        const sw = document.createElement('i');
        sw.style.background = COLORS[e.kind]!.stroke;
        s.append(sw, e.label);
        return s;
      }),
    );

    const n = m.bars.length;
    const slot = (X1 - X0) / n;
    const barW = Math.min(slot * 0.58, 9);
    const rects: { rect: SVGRectElement; target: number }[] = [];

    m.bars.forEach((bar, i) => {
      const cx = X0 + slot * (i + 0.5);
      const yTarget = yOf(bar.f1);
      const c = COLORS[bar.kind] ?? COLORS.gnn!;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(cx - barW / 2));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('y', String(Y_BASE));
      rect.setAttribute('height', '0');
      rect.setAttribute('fill', c.fill);
      rect.setAttribute('stroke', c.stroke);
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      barsGroup.appendChild(rect);
      rects.push({ rect, target: yTarget });

      if (bar.std) {
        const whisker = document.createElementNS(NS, 'line');
        whisker.setAttribute('x1', String(cx));
        whisker.setAttribute('x2', String(cx));
        whisker.setAttribute('y1', String(yOf(bar.f1 + bar.std)));
        whisker.setAttribute('y2', String(yOf(bar.f1 - bar.std)));
        whisker.setAttribute('stroke', '#e7eaf3');
        whisker.setAttribute('opacity', '0.55');
        whisker.setAttribute('vector-effect', 'non-scaling-stroke');
        barsGroup.appendChild(whisker);
      }

      const val = document.createElement('span');
      val.className = 'pg-val';
      val.style.left = `${cx}%`;
      val.style.top = `${yTarget - 2.5}%`;
      val.textContent = fmtF1(bar.f1);
      dynLabels.appendChild(val);

      const cat = document.createElement('span');
      cat.className = 'pg-cat';
      cat.style.left = `${cx}%`;
      cat.style.top = `${Y_BASE + 3}%`;
      cat.style.maxWidth = `${slot * 0.96}%`;
      cat.textContent = bar.label;
      const subText = bar.sub ?? (bar.illicitPct !== undefined ? `${bar.illicitPct}% illicit` : '');
      if (subText) {
        const small = document.createElement('small');
        small.textContent = subText;
        cat.appendChild(small);
      }
      dynLabels.appendChild(cat);

      const hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'pg-hit';
      hit.dataset.bar = String(i);
      hit.style.left = `${cx - slot * 0.44}%`;
      hit.style.width = `${slot * 0.88}%`;
      hit.style.top = `${Y_TOP}%`;
      hit.style.height = `${Y_BASE - Y_TOP + 20}%`;
      hit.setAttribute('aria-label', ariaFor(bar));
      hits.appendChild(hit);
    });

    /* Shutdown divider (cliff mode) */
    if (m.shutdownAfterIndex !== undefined) {
      const x = X0 + slot * (m.shutdownAfterIndex + 1);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      line.setAttribute('y1', String(Y_TOP));
      line.setAttribute('y2', String(Y_BASE));
      line.setAttribute('stroke', '#8b5cf6');
      line.setAttribute('stroke-dasharray', '5 4');
      line.setAttribute('opacity', '0.7');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      barsGroup.appendChild(line);
      const lab = document.createElement('span');
      lab.className = 'pg-shutlabel';
      lab.style.left = `${x}%`;
      lab.style.top = `${Y_TOP - 0.5}%`;
      lab.textContent = 'shutdowns hit';
      dynLabels.appendChild(lab);
    }

    /* Grow bars over 320ms (time-based ease), fade labels in alongside */
    dynLabels.style.opacity = '0';
    requestAnimationFrame(() => {
      dynLabels.style.opacity = '1';
    });
    const DURATION = 320;
    let start = -1;
    cancelAnimationFrame(raf);
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = Math.min((now - start) / DURATION, 1);
      const e = 1 - Math.pow(1 - t, 3);
      for (const { rect, target } of rects) {
        const y = Y_BASE - (Y_BASE - target) * e;
        rect.setAttribute('y', String(y));
        rect.setAttribute('height', String(Y_BASE - y));
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    setReadout(pinned);
  }

  function setMode(i: number) {
    if (i === modeIdx) return;
    modeIdx = i;
    pinned = -1;
    tabButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    build();
  }

  /* ---- Bar interaction (delegated on the hit layer) ---- */
  const barIdx = (e: Event) => {
    const el = (e.target as Element).closest<HTMLButtonElement>('[data-bar]');
    return el ? Number(el.dataset.bar) : -1;
  };
  const onOver = (e: Event) => {
    const i = barIdx(e);
    if (i >= 0) setReadout(i);
  };
  const onOut = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    if (barIdx(e) >= 0) setReadout(pinned);
  };
  const onDown = (e: Event) => {
    pinned = barIdx(e);
    setReadout(pinned);
  };
  hits.addEventListener('pointerover', onOver);
  hits.addEventListener('pointerout', onOut);
  hits.addEventListener('pointerdown', onDown);
  hits.addEventListener('focusin', onOver);
  hits.addEventListener('focusout', onOut);

  build();

  return () => {
    cancelAnimationFrame(raf);
    layout.dispose();
    hits.removeEventListener('pointerover', onOver);
    hits.removeEventListener('pointerout', onOut);
    hits.removeEventListener('pointerdown', onDown);
    hits.removeEventListener('focusin', onOver);
    hits.removeEventListener('focusout', onOut);
    style.remove();
  };
}
