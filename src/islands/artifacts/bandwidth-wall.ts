/**
 * Artifact: bandwidth-wall — The Bandwidth Wall
 * Manifest: content/artifacts/bandwidth-wall/manifest.json
 *
 * Log-scale SVG bar chart of per-step gradient traffic per GPU: AdamW-DDP
 * versus DeMo's DCT + top-k compression (k = 32 … 1), for OLMo-300M and
 * OLMo-1B. Numbers are a static snapshot of Table 1 of the DeMo paper
 * (arXiv:2411.19870) in ./data.json — no runtime fetches. A link-speed
 * slider converts MB/step into seconds of pure communication per step;
 * hovering, tapping, or focusing a bar reads out the exact value and the
 * reduction factor versus the AdamW-DDP baseline.
 *
 * Layout: shared responsive primitive (stage chart · panel readout · footer
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/bandwidth-wall/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Row {
  method: string;
  k: number | null;
  mbPerStep: number;
}
const MODELS = data.models as { id: string; label: string; rows: Row[] }[];

const NS = 'http://www.w3.org/2000/svg';

/* Chart geometry (viewBox units) */
const VB_W = 800;
const VB_H = 410;
const X0 = 64;
const X1 = 784;
const Y_TOP = 70;
const Y_BASE = 356;
const BAR_W = 58;

/* Log-y domain fixed across both models so the toggle reads as motion */
const LOG_LO = Math.log10(0.4);
const LOG_HI = Math.log10(4000);
const yOf = (mb: number) =>
  Y_BASE - ((Math.log10(mb) - LOG_LO) / (LOG_HI - LOG_LO)) * (Y_BASE - Y_TOP);

/* Link-speed slider: log scale, 50 Mb/s → 400 Gb/s; t = 100/3 lands on 1 Gb/s */
const SPEED_MIN = 50;
const SPEED_MAX = 400_000;
const speedOf = (t: number) =>
  sigFigs(SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, t / 100), 2);

function sigFigs(n: number, digits: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - digits + 1);
  return Math.round(n / mag) * mag;
}

const fmtSpeed = (mbps: number) =>
  mbps >= 1000
    ? `${(mbps / 1000).toLocaleString('en-US', {
        minimumFractionDigits: mbps >= 10_000 ? 0 : 1,
        maximumFractionDigits: mbps >= 10_000 ? 0 : 1,
      })} Gb/s`
    : `${mbps.toLocaleString('en-US')} Mb/s`;

const speedTier = (mbps: number) =>
  mbps < 300
    ? 'home broadband'
    : mbps < 2500
      ? 'home fiber'
      : mbps < 25_000
        ? 'datacenter ethernet'
        : 'InfiniBand class';

function fmtSeconds(s: number): string {
  if (s >= 90) return `${(s / 60).toFixed(1)} min`;
  if (s >= 10) return `${s.toFixed(1)} s`;
  if (s >= 1) return `${s.toFixed(2)} s`;
  if (s >= 0.001) return `${(s * 1000).toFixed(s >= 0.01 ? 0 : 1)} ms`;
  return `${(s * 1e6).toFixed(0)} µs`;
}

const fmtMb = (mb: number) =>
  mb.toLocaleString('en-US', {
    minimumFractionDigits: mb < 100 ? 2 : 1,
    maximumFractionDigits: mb < 100 ? 2 : 1,
  });

const fmtFactor = (f: number) =>
  f >= 10 ? `${Math.round(f).toLocaleString('en-US')}×` : `${f.toFixed(1)}×`;

const barName = (r: Row) => (r.k === null ? r.method : `${r.method} k=${r.k}`);

export default function mount(container: HTMLElement): () => void {
  /* ---- State ---- */
  let activeIdx = Math.max(
    MODELS.findIndex((m) => m.id === 'olmo-1b'),
    0,
  );
  let mbps = 1000;
  let raf = 0;
  let pinned = -1; // bar index held in the readout (hover/focus/tap)

  const model = () => MODELS[activeIdx]!;
  const baselineMb = () => model().rows[0]!.mbPerStep;
  const secsFor = (mb: number) => (mb * 8) / mbps;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    // Chart fills the stage (inset:0) with an 800×410 viewBox (~2:1), so derive
    // stage height from width instead of a tall pixel floor — no dead gap.
    stageAspect: '2/1',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .bw-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      max-width:100%; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .bw-toggle { display:inline-flex; max-width:100%; border:1px solid rgba(124,140,255,.14);
      border-radius:8px; overflow:hidden; }
    .bw-toggle button { appearance:none; border:0; background:transparent; color:#5b6378;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.08em; padding:7px 12px;
      cursor:pointer; transition:color .2s, background .2s; }
    .bw-toggle button[aria-pressed="true"] { background:rgba(91,140,255,.13); color:#e7eaf3; }
    .bw-toggle button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    /* flex-basis:200px lets the slider wrap to its own full-width row when the
       controls strip is narrow; min-width:0 lets it shrink instead of clipping. */
    .bw-speed { flex:1 1 200px; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .bw-speed label { display:flex; justify-content:space-between; gap:8px;
      font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .bw-speed output { color:#e7eaf3; font-size:11px; text-transform:none; }
    .bw-speed output i { color:#22d3ee; font-style:normal; }
    .bw-speed input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:2px 0 0; }
    .bw-chartwrap { position:absolute; inset:0; min-height:160px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .bw-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .bw-grid { stroke:rgba(124,140,255,.1); }
    /* Sizes are viewBox units — the chart renders at ~0.45× on phones, so
       type is set ~25% larger than it reads at desktop scale. */
    .bw-gridlabel, .bw-axis { fill:#5b6378; font:500 12.5px 'JetBrains Mono', monospace; }
    .bw-cat { fill:#8d95ad; font:500 13px 'JetBrains Mono', monospace; }
    .bw-sec { fill:#e7eaf3; font:600 15px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .bw-mb { fill:#5b6378; font:500 11.5px 'JetBrains Mono', monospace; }
    .bw-bar { cursor:pointer; }
    .bw-bar rect { transition:filter .2s; }
    .bw-bar:hover rect, .bw-bar:focus-visible rect { filter:brightness(1.45); }
    .bw-bar:focus-visible { outline:none; }
    .bw-bar:focus-visible rect { stroke:#e7eaf3; stroke-width:1.5; }
    .bw-legend { fill:#5b6378; font:500 12px 'JetBrains Mono', monospace; }
    .bw-readout { min-height:18px; font:500 11px/1.45 'JetBrains Mono', monospace;
      color:#8d95ad; font-variant-numeric:tabular-nums; }
    .bw-readout b { color:#e7eaf3; font-weight:600; }
    .bw-readout i { color:#22d3ee; font-style:normal; }
    .bw-note { font:500 9.5px/1.45 'JetBrains Mono', monospace; color:#5b6378;
      letter-spacing:.03em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'bw-controls';

  const toggle = document.createElement('div');
  toggle.className = 'bw-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Model size');
  const modelButtons = MODELS.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.setAttribute('aria-pressed', String(i === activeIdx));
    b.addEventListener('click', () => setModel(i));
    toggle.appendChild(b);
    return b;
  });

  const speedField = document.createElement('div');
  speedField.className = 'bw-speed';
  const speedLabel = document.createElement('label');
  speedLabel.htmlFor = 'bw-speed';
  const speedName = document.createElement('span');
  speedName.textContent = 'link speed';
  const speedOut = document.createElement('output');
  speedLabel.append(speedName, speedOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'bw-speed';
  slider.min = '0';
  slider.max = '100';
  slider.step = '0.5';
  slider.value = String(100 / 3); // 1 Gb/s
  slider.setAttribute(
    'aria-label',
    'Link speed, 50 megabits per second to 400 gigabits per second',
  );
  speedField.append(speedLabel, slider);

  controls.append(toggle, speedField);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'bw-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  for (const v of [1, 10, 100, 1000]) {
    const y = yOf(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'bw-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(X0 - 8));
    t.setAttribute('y', String(y + 3));
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('class', 'bw-gridlabel');
    t.textContent = v >= 1000 ? '1,000 MB' : `${v} MB`;
    svg.appendChild(t);
  }
  const base = document.createElementNS(NS, 'line');
  base.setAttribute('x1', String(X0));
  base.setAttribute('x2', String(X1));
  base.setAttribute('y1', String(Y_BASE));
  base.setAttribute('y2', String(Y_BASE));
  base.setAttribute('stroke', 'rgba(124,140,255,.28)');
  svg.appendChild(base);

  const axisTitle = document.createElementNS(NS, 'text');
  axisTitle.setAttribute('x', String(X0));
  axisTitle.setAttribute('y', '32');
  axisTitle.setAttribute('class', 'bw-axis');
  axisTitle.textContent = 'MB shipped per optimizer step per GPU · log scale';
  svg.appendChild(axisTitle);

  const legend = document.createElementNS(NS, 'text');
  legend.setAttribute('x', String(X1));
  legend.setAttribute('y', '32');
  legend.setAttribute('text-anchor', 'end');
  legend.setAttribute('class', 'bw-legend');
  legend.textContent = 'seconds above bars = comms time at the chosen link speed';
  svg.appendChild(legend);

  /* Bars: positions are fixed (both models share the same 7 methods) */
  const slot = (X1 - X0) / MODELS[0]!.rows.length;
  interface Bar {
    g: SVGGElement;
    rect: SVGRectElement;
    sec: SVGTextElement;
    mb: SVGTextElement;
    value: number; // currently displayed MB (animates on model toggle)
  }
  const bars: Bar[] = model().rows.map((row, i) => {
    const cx = X0 + slot * (i + 0.5);
    const isBaseline = row.k === null;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'bw-bar');
    g.setAttribute('tabindex', '0');
    g.dataset.bar = String(i);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx - BAR_W / 2));
    rect.setAttribute('width', String(BAR_W));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', isBaseline ? 'rgba(91,140,255,.32)' : 'rgba(34,211,238,.22)');
    rect.setAttribute('stroke', isBaseline ? '#5b8cff' : '#22d3ee');
    rect.setAttribute('stroke-width', '1');

    const sec = document.createElementNS(NS, 'text');
    sec.setAttribute('x', String(cx));
    sec.setAttribute('text-anchor', 'middle');
    sec.setAttribute('class', 'bw-sec');

    const mb = document.createElementNS(NS, 'text');
    mb.setAttribute('x', String(cx));
    mb.setAttribute('text-anchor', 'middle');
    mb.setAttribute('class', 'bw-mb');

    const cat = document.createElementNS(NS, 'text');
    cat.setAttribute('x', String(cx));
    cat.setAttribute('y', String(Y_BASE + 25));
    cat.setAttribute('text-anchor', 'middle');
    cat.setAttribute('class', 'bw-cat');
    if (isBaseline) cat.setAttribute('fill', '#5b8cff');
    cat.textContent = isBaseline ? row.method : `k=${row.k}`;

    g.append(rect, sec, mb, cat);
    svg.appendChild(g);
    return { g, rect, sec, mb, value: row.mbPerStep };
  });

  /* ---- Readout + footnote ---- */
  const readout = document.createElement('div');
  readout.className = 'bw-readout';
  panel.appendChild(readout);

  const note = document.createElement('div');
  note.className = 'bw-note';
  note.textContent = `k = DCT top-k components kept per momentum chunk. ${data.note}`;
  caption.appendChild(note);

  /* ---- Rendering ---- */
  function paintBar(b: Bar, i: number) {
    const y = yOf(b.value);
    b.rect.setAttribute('y', String(y));
    b.rect.setAttribute('height', String(Y_BASE - y));
    b.sec.setAttribute('y', String(y - 24));
    b.mb.setAttribute('y', String(y - 8));
    b.sec.textContent = fmtSeconds(secsFor(model().rows[i]!.mbPerStep));
    b.mb.textContent = `${fmtMb(model().rows[i]!.mbPerStep)} MB`;
  }

  function refreshAria() {
    bars.forEach((b, i) => {
      const row = model().rows[i]!;
      b.g.setAttribute(
        'aria-label',
        `${model().label}, ${barName(row)}: ${fmtMb(row.mbPerStep)} MB per step per GPU` +
          (row.k === null
            ? ''
            : `, ${fmtFactor(baselineMb() / row.mbPerStep)} less data than AdamW-DDP`) +
          `, ${fmtSeconds(secsFor(row.mbPerStep))} of communication per step at ${fmtSpeed(mbps)}`,
      );
    });
  }

  function setReadout(i: number) {
    readout.innerHTML = '';
    if (i < 0) {
      readout.textContent =
        'hover or tap a bar · seconds = MB/step × 8 ÷ link speed (communication only, before any compute)';
      return;
    }
    const row = model().rows[i]!;
    const b = document.createElement('b');
    b.textContent = `${model().label} · ${barName(row)}`;
    readout.append(b, ` — ${fmtMb(row.mbPerStep)} MB/step · `);
    readout.append(
      row.k === null
        ? 'baseline (1×) · '
        : `${fmtFactor(baselineMb() / row.mbPerStep)} less than AdamW-DDP · `,
    );
    const wire = document.createElement('i');
    wire.textContent = `${fmtSeconds(secsFor(row.mbPerStep))} on the wire @ ${fmtSpeed(mbps)}`;
    readout.append(wire);
  }

  function render() {
    speedOut.innerHTML = '';
    const v = document.createElement('i');
    v.textContent = fmtSpeed(mbps);
    speedOut.append(v, ` · ${speedTier(mbps)}`);
    bars.forEach(paintBar);
    refreshAria();
    setReadout(pinned);
  }

  /* Model toggle tweens bars between datasets in log space (time-based) */
  function setModel(i: number) {
    if (i === activeIdx) return;
    activeIdx = i;
    modelButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    const from = bars.map((b) => Math.log10(b.value));
    const to = model().rows.map((r) => Math.log10(r.mbPerStep));
    const DURATION = 350;
    let start = -1;
    cancelAnimationFrame(raf);
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = Math.min((now - start) / DURATION, 1);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic over elapsed time
      bars.forEach((b, j) => {
        b.value = Math.pow(10, from[j]! + (to[j]! - from[j]!) * e);
        paintBar(b, j);
      });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    refreshAria();
    setReadout(pinned);
  }

  /* ---- Interaction (delegated; pointer + keyboard) ---- */
  const barIdx = (e: Event) => {
    const el = (e.target as Element).closest<SVGGElement>('[data-bar]');
    return el ? Number(el.dataset.bar) : -1;
  };
  const onOver = (e: Event) => {
    const i = barIdx(e);
    if (i >= 0) {
      pinned = i;
      setReadout(i);
    }
  };
  const onOut = (e: Event) => {
    // Touch fires pointerout right after the tap — keep the readout pinned.
    if ((e as PointerEvent).pointerType === 'touch') return;
    if (barIdx(e) === pinned) {
      pinned = -1;
      setReadout(-1);
    }
  };
  // Tap a bar to pin it; tap the background to clear.
  const onDown = (e: Event) => {
    pinned = barIdx(e);
    setReadout(pinned);
  };
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('pointerout', onOut);
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('focusin', onOver);
  svg.addEventListener('focusout', onOut);

  const onSlide = () => {
    mbps = speedOf(Number(slider.value));
    render();
  };
  slider.addEventListener('input', onSlide);

  render();

  return () => {
    cancelAnimationFrame(raf);
    layout.dispose();
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('pointerout', onOut);
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('focusin', onOver);
    svg.removeEventListener('focusout', onOut);
    style.remove();
  };
}
