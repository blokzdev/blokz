/**
 * Artifact: memory-injection-gap — The Memory-Injection Gap
 * Manifest: content/artifacts/memory-injection-gap/manifest.json
 *
 * Three switchable bar charts over CrAIBench, the Web3 context-manipulation
 * benchmark (Patlan et al., arXiv:2503.16248v3):
 *   1. ATTACK SURFACE  — the 685 injected attack cases by task domain (counts)
 *   2. PROMPT vs MEMORY — prompt- vs memory-injection ASR on Claude Sonnet 3.7 (%)
 *   3. WHAT DEFENDS     — undefended vs fine-tuned Qwen-2.5-14B, grouped (%)
 * Numbers are a static snapshot in ./data.json — no runtime fetches.
 *
 * Geometry is SVG stretched with preserveAspectRatio="none" (rectangles
 * survive non-uniform scaling; strokes use non-scaling-stroke); ALL text
 * is positioned DOM in fixed px so it stays legible on phones.
 *
 * Layout: shared responsive primitive (stage chart · controls tabs+legend ·
 * panel readout · caption source). 'footer' wide template — the tab row spans
 * full width below [stage | panel]. Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/memory-injection-gap/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Bar {
  label: string;
  sub?: string;
  value: number;
  displayValue?: string;
  kind: string;
  group?: number;
  detail: string;
}
interface LegendEntry {
  kind: string;
  label: string;
}
interface Mode {
  id: string;
  label: string;
  title: string;
  axis: string;
  unit: string;
  yMax: number;
  grouped?: boolean;
  insight: string;
  legend: LegendEntry[];
  bars: Bar[];
}
const MODES = data.modes as Mode[];

const NS = 'http://www.w3.org/2000/svg';

/* Plot area in viewBox percent (viewBox is 0 0 100 100, stretched to fill) */
const X0 = 9;
const X1 = 98;
const Y_TOP = 8;
const Y_BASE = 76;

const COLORS: Record<string, { fill: string; stroke: string }> = {
  attack: { fill: 'rgba(255,107,110,.28)', stroke: '#ff6b6e' },
  prompt: { fill: 'rgba(91,140,255,.26)', stroke: '#5b8cff' },
  memory: { fill: 'rgba(255,107,110,.30)', stroke: '#ff6b6e' },
  before: { fill: 'rgba(141,149,173,.20)', stroke: '#8d95ad' },
  after: { fill: 'rgba(34,211,238,.26)', stroke: '#22d3ee' },
};

export default function mount(container: HTMLElement): () => void {
  let modeIdx = 0;
  let pinned = -1;
  let raf = 0;

  const mode = () => MODES[modeIdx]!;
  const yOf = (v: number) => Y_BASE - (v / mode().yMax) * (Y_BASE - Y_TOP);
  const fmt = (b: Bar) => {
    if (b.displayValue) return b.displayValue;
    return mode().unit === '%' ? `${b.value}%` : String(b.value);
  };

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption: captionSlot } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .mig-top { display:flex; align-items:center; justify-content:space-between;
      gap:10px; flex-wrap:wrap; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .mig-tabs { display:flex; flex-wrap:wrap; min-width:0; max-width:100%;
      border:1px solid rgba(124,140,255,.14);
      border-radius:8px; overflow:hidden; }
    .mig-tabs button { appearance:none; border:0; background:transparent; color:#5b6378;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.05em; padding:7px 10px;
      cursor:pointer; transition:color .2s, background .2s; white-space:nowrap; }
    .mig-tabs button[aria-pressed="true"] { background:rgba(255,107,110,.14); color:#e7eaf3; }
    .mig-tabs button:focus-visible { outline:2px solid #ff6b6e; outline-offset:-2px; }
    .mig-legend { display:flex; gap:12px; flex-wrap:wrap; min-width:0; max-width:100%;
      font-size:10px; color:#5b6378; }
    .mig-legend i { display:inline-block; width:9px; height:9px; border-radius:2px;
      margin-right:5px; vertical-align:-1px; }
    .mig-caption { font-size:10px; color:#5b6378; letter-spacing:.03em; min-height:14px;
      font-family:'JetBrains Mono', monospace; }
    .mig-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      overflow:hidden;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .mig-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .mig-overlay { position:absolute; inset:0; pointer-events:none; }
    .mig-fade { transition:opacity .25s ease; }
    .mig-gridlabel { position:absolute; transform:translate(0,-50%); font-size:10px;
      color:#5b6378; font-variant-numeric:tabular-nums; }
    .mig-axistitle { position:absolute; left:10px; top:5px; font-size:10px; color:#5b6378;
      letter-spacing:.06em; text-transform:uppercase; }
    .mig-val { position:absolute; transform:translate(-50%,-100%); font-size:11.5px;
      font-weight:600; color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .mig-cat { position:absolute; transform:translate(-50%,0); font-size:10.5px;
      color:#8d95ad; text-align:center; line-height:1.3; }
    .mig-cat small { display:block; font-size:9px; color:#5b6378; }
    .mig-hits { position:absolute; inset:0; }
    .mig-hit { position:absolute; appearance:none; background:transparent; border:0;
      cursor:pointer; border-radius:6px; padding:0; }
    .mig-hit:focus-visible { outline:2px solid #ff6b6e; outline-offset:-2px; }
    .mig-readout { min-height:30px; max-width:100%; font-size:11px; color:#8d95ad;
      overflow-wrap:anywhere;
      font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .mig-readout b { color:#e7eaf3; font-weight:600; }
    .mig-readout i { color:#ff8d8f; font-style:normal; }
  `;
  stage.appendChild(style);

  /* ---- Tabs + legend ---- */
  const top = document.createElement('div');
  top.className = 'mig-top';
  const tabs = document.createElement('div');
  tabs.className = 'mig-tabs';
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
  const legend = document.createElement('div');
  legend.className = 'mig-legend';
  top.append(tabs, legend);
  controlsSlot.appendChild(top);

  const caption = document.createElement('div');
  caption.className = 'mig-caption';
  captionSlot.appendChild(caption);

  /* ---- Stage: SVG geometry + DOM text overlay + hit layer ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'mig-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const overlay = document.createElement('div');
  overlay.className = 'mig-overlay';
  const hits = document.createElement('div');
  hits.className = 'mig-hits';
  chartWrap.append(svg, overlay, hits);
  stage.appendChild(chartWrap);

  /* Gridlines + axis labels — rebuilt per mode (scale changes) */
  const gridGroup = document.createElementNS(NS, 'g');
  svg.appendChild(gridGroup);
  const gridLabels = document.createElement('div');
  overlay.appendChild(gridLabels);
  const axisTitle = document.createElement('span');
  axisTitle.className = 'mig-axistitle';
  overlay.appendChild(axisTitle);

  /* Dynamic groups, rebuilt per mode */
  const barsGroup = document.createElementNS(NS, 'g');
  svg.appendChild(barsGroup);
  const dynLabels = document.createElement('div');
  dynLabels.className = 'mig-fade';
  overlay.appendChild(dynLabels);

  const readout = document.createElement('div');
  readout.className = 'mig-readout';
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
    const v = document.createElement('i');
    v.textContent = ` ${fmt(bar)}`;
    readout.append(b, ' — ', v, ` · ${bar.detail}`);
  }

  function ariaFor(bar: Bar): string {
    return (
      `${bar.label}${bar.sub ? `, ${bar.sub}` : ''}: ` +
      `${bar.displayValue ?? fmt(bar)}${mode().unit === '%' ? '' : ` ${mode().axis}`}, ${bar.detail}`
    );
  }

  /* ---- Grid for the active scale ---- */
  function buildGrid() {
    const m = mode();
    gridGroup.replaceChildren();
    gridLabels.replaceChildren();
    axisTitle.textContent = m.axis;
    for (let f = 0; f <= 1.0001; f += 0.2) {
      const v = f * m.yMax;
      const y = yOf(v);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(X0));
      line.setAttribute('x2', String(X1));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', f === 0 ? 'rgba(124,140,255,.28)' : 'rgba(124,140,255,.1)');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      gridGroup.appendChild(line);
      const lab = document.createElement('span');
      lab.className = 'mig-gridlabel';
      lab.style.left = '10px';
      lab.style.top = `${y}%`;
      lab.textContent = m.unit === '%' ? `${Math.round(v)}%` : String(Math.round(v));
      gridLabels.appendChild(lab);
    }
  }

  /* ---- Column geometry: one column per bar, or per group when grouped ---- */
  function columnsOf(m: Mode): { center: number; bars: { bar: Bar; idx: number }[] }[] {
    if (!m.grouped) {
      return m.bars.map((bar, idx) => ({ center: 0, bars: [{ bar, idx }] }));
    }
    const byGroup = new Map<number, { bar: Bar; idx: number }[]>();
    m.bars.forEach((bar, idx) => {
      const g = bar.group ?? idx;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push({ bar, idx });
    });
    return [...byGroup.values()].map((bars) => ({ center: 0, bars }));
  }

  /* ---- Build a mode ---- */
  function build() {
    const m = mode();
    buildGrid();
    barsGroup.replaceChildren();
    dynLabels.replaceChildren();
    hits.replaceChildren();
    caption.textContent = m.title;
    legend.replaceChildren(
      ...m.legend.map((e) => {
        const s = document.createElement('span');
        const sw = document.createElement('i');
        sw.style.background = COLORS[e.kind]!.stroke;
        s.append(sw, e.label);
        return s;
      }),
    );

    const cols = columnsOf(m);
    const slot = (X1 - X0) / cols.length;
    const grouped = !!m.grouped;
    // Bar width: narrower when two bars share a column.
    const barW = grouped ? Math.min(slot * 0.3, 11) : Math.min(slot * 0.46, 14);
    const pairGap = barW * 1.08; // centre-to-centre offset within a grouped column
    const rects: { rect: SVGRectElement; target: number }[] = [];

    cols.forEach((col, ci) => {
      const cx = X0 + slot * (ci + 0.5);
      col.center = cx;
      col.bars.forEach((entry, k) => {
        const { bar, idx } = entry;
        const n = col.bars.length;
        const bx = grouped && n > 1 ? cx + (k - (n - 1) / 2) * pairGap : cx;
        const yTarget = yOf(bar.value);
        const c = COLORS[bar.kind] ?? COLORS.attack!;

        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(bx - barW / 2));
        rect.setAttribute('width', String(barW));
        rect.setAttribute('y', String(Y_BASE));
        rect.setAttribute('height', '0');
        rect.setAttribute('fill', c.fill);
        rect.setAttribute('stroke', c.stroke);
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        barsGroup.appendChild(rect);
        rects.push({ rect, target: yTarget });

        const val = document.createElement('span');
        val.className = 'mig-val';
        val.style.left = `${bx}%`;
        val.style.top = `${yTarget - 2.5}%`;
        val.textContent = fmt(bar);
        dynLabels.appendChild(val);

        const hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'mig-hit';
        hit.dataset.bar = String(idx);
        hit.style.left = `${bx - barW * 0.75}%`;
        hit.style.width = `${barW * 1.5}%`;
        hit.style.top = `${Y_TOP}%`;
        hit.style.height = `${Y_BASE - Y_TOP + 20}%`;
        hit.setAttribute('aria-label', ariaFor(bar));
        hits.appendChild(hit);
      });

      // One category label per column.
      const labelBar = col.bars[0]!.bar;
      const cat = document.createElement('span');
      cat.className = 'mig-cat';
      cat.style.left = `${cx}%`;
      cat.style.top = `${Y_BASE + 3}%`;
      cat.style.maxWidth = `${slot * 0.98}%`;
      cat.textContent = labelBar.label;
      if (labelBar.sub) {
        const small = document.createElement('small');
        small.textContent = labelBar.sub;
        cat.appendChild(small);
      }
      dynLabels.appendChild(cat);
    });

    /* Grow bars over 340ms (time-based ease), fade labels in alongside */
    dynLabels.style.opacity = '0';
    requestAnimationFrame(() => {
      dynLabels.style.opacity = '1';
    });
    const DURATION = 340;
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
