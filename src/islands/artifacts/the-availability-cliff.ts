/**
 * Artifact: the-availability-cliff — The Availability Cliff
 * Manifest: content/artifacts/the-availability-cliff/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-availability-cliff/data.json';

type Layer = (typeof rawData.layers)[number];

const NS = 'http://www.w3.org/2000/svg';

// Palette
const C = {
  bg: '#0d1322',
  text: '#e7eaf3',
  dim: '#8d95ad',
  muted: '#5b6378',
  blob: '#f97362',
  eigenDA: '#f7c877',
  celestia: '#5b8cff',
  filecoin: '#22d3ee',
  arweave: '#5fd39b',
  cursor: '#ffffff',
  cursorLine: 'rgba(255,255,255,0.55)',
  gridLine: 'rgba(255,255,255,0.07)',
} as const;

const LAYER_COLOR: Record<string, string> = {
  blob: C.blob,
  eigenDA: C.eigenDA,
  celestia: C.celestia,
  filecoin: C.filecoin,
  arweave: C.arweave,
};

const PRESETS = [
  { label: '7 d', days: 7 },
  { label: '30 d', days: 30 },
  { label: '45 d', days: 45 },
  { label: '90 d', days: 90 },
  { label: '1 yr', days: 365 },
];

// Chart geometry constants (SVG user space)
const VW = 860;
const VH = 380;
const PAD_LEFT = 68;
const PAD_RIGHT = 24;
const PAD_TOP = 28;
const PAD_BOT = 44;
const PLOT_W = VW - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VH - PAD_TOP - PAD_BOT;
const BAR_H = 26;
const BAR_GAP = 14;
const TOTAL_LAYER_H = BAR_H + BAR_GAP;

// Log-scale x axis
const { dayMin, dayMax } = rawData.config;
const LOG_MIN = Math.log10(dayMin);
const LOG_MAX = Math.log10(dayMax);

function xOfDay(d: number): number {
  return PAD_LEFT + ((Math.log10(d) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_W;
}

function dayOfX(x: number): number {
  const t = (x - PAD_LEFT) / PLOT_W;
  return Math.pow(10, LOG_MIN + t * (LOG_MAX - LOG_MIN));
}

const X_TICKS = [1, 7, 14, 18.2, 30, 90, 180, 365, 730];

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

function attr(node: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

function layerY(i: number): number {
  return PAD_TOP + i * TOTAL_LAYER_H + (PLOT_H - rawData.layers.length * TOTAL_LAYER_H) / 2;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cliff-svg { display:block; width:100%; height:100%; }
    .cliff-bar-avail { opacity:1; }
    .cliff-bar-pruned { opacity:0.18; }
    .cliff-cursor { cursor:ew-resize; touch-action:none; }
    .cliff-cursor-line { pointer-events:none; }
    .cliff-handle { cursor:ew-resize; touch-action:none; }
    .cliff-panel { font-family:inherit; color:${C.text}; font-size:13px; line-height:1.5;
      display:flex; flex-direction:column; gap:10px; }
    .cliff-panel-title { font-size:11px; font-weight:600; letter-spacing:.06em;
      text-transform:uppercase; color:${C.dim}; margin-bottom:2px; }
    .cliff-panel-dur { font-size:22px; font-weight:700; color:${C.text}; }
    .cliff-panel-sub { font-size:11px; color:${C.dim}; margin-top:-4px; }
    .cliff-row { display:flex; align-items:baseline; gap:6px; min-width:0; }
    .cliff-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; margin-top:1px; }
    .cliff-status { font-size:11px; font-weight:700; }
    .cliff-ok { color:${C.arweave}; }
    .cliff-fail { color:${C.blob}; }
    .cliff-name { font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cliff-note { font-size:10px; color:${C.dim}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cliff-controls { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .cliff-btn { cursor:pointer; border:1px solid ${C.muted}; border-radius:5px;
      background:transparent; color:${C.dim}; font-size:12px; padding:4px 10px;
      font-family:inherit; transition:border-color .15s,color .15s; }
    .cliff-btn:hover, .cliff-btn.active { border-color:${C.cursor}; color:${C.text}; }
    .cliff-caption { font-size:11px; color:${C.dim}; }
    .cliff-caption a { color:${C.celestia}; text-decoration:none; }
    .cliff-caption a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);

  // ── SVG ─────────────────────────────────────────────────────────────────
  const svg = el('svg');
  attr(svg, { viewBox: `0 0 ${VW} ${VH}`, class: 'cliff-svg', 'aria-label': 'The Availability Cliff' });

  // Background
  const bg = el('rect');
  attr(bg, { x: 0, y: 0, width: VW, height: VH, fill: C.bg, rx: 8 });
  svg.appendChild(bg);

  // Plot clip
  const defs = el('defs');
  const clip = el('clipPath');
  clip.setAttribute('id', 'cliff-plot-clip');
  const clipRect = el('rect');
  attr(clipRect, { x: PAD_LEFT, y: PAD_TOP, width: PLOT_W, height: PLOT_H });
  clip.appendChild(clipRect);
  defs.appendChild(clip);

  // Arweave gradient
  const grad = el('linearGradient');
  attr(grad, { id: 'arweave-grad', x1: '0', x2: '1', y1: '0', y2: '0' });
  const s1 = el('stop');
  attr(s1, { offset: '0%', 'stop-color': C.arweave, 'stop-opacity': '0.9' });
  const s2 = el('stop');
  attr(s2, { offset: '100%', 'stop-color': C.arweave, 'stop-opacity': '0.25' });
  grad.appendChild(s1);
  grad.appendChild(s2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Grid lines + X-axis ticks
  const gGrid = el('g');
  const gTickLabels = el('g');
  for (const d of X_TICKS) {
    const x = xOfDay(d);
    const line = el('line');
    attr(line, { x1: x, y1: PAD_TOP, x2: x, y2: PAD_TOP + PLOT_H, stroke: C.gridLine, 'stroke-width': 1 });
    gGrid.appendChild(line);

    const lbl = el('text');
    const dayLabel = d === 18.2 ? '18.2' : d >= 365 ? `${d / 365}y` : `${d}d`;
    attr(lbl, {
      x,
      y: PAD_TOP + PLOT_H + 18,
      'text-anchor': 'middle',
      fill: C.dim,
      'font-size': 10,
      'font-family': 'inherit',
    });
    lbl.textContent = dayLabel;
    gTickLabels.appendChild(lbl);
  }
  svg.appendChild(gGrid);

  // Bars group (clipped)
  const gBars = el('g');
  gBars.setAttribute('clip-path', 'url(#cliff-plot-clip)');
  svg.appendChild(gBars);

  // Layer label column
  const gLabels = el('g');
  svg.appendChild(gLabels);
  svg.appendChild(gTickLabels);

  // Build static bar geometry
  rawData.layers.forEach((layer, i) => {
    const y = layerY(i);
    const color = LAYER_COLOR[layer.id] ?? C.text;
    const xStart = xOfDay(dayMin);

    // Layer label (left of plot)
    const lbl = el('text');
    attr(lbl, {
      x: PAD_LEFT - 8,
      y: y + BAR_H / 2 + 4,
      'text-anchor': 'end',
      fill: C.dim,
      'font-size': 11,
      'font-family': 'inherit',
    });
    lbl.textContent = layer.label;
    gLabels.appendChild(lbl);

    if (layer.permanent) {
      // Arweave: gradient bar spanning full plot width
      const barFull = el('rect');
      attr(barFull, { x: xStart, y, width: PLOT_W - (xStart - PAD_LEFT), height: BAR_H, fill: 'url(#arweave-grad)', rx: 3 });
      gBars.appendChild(barFull);

      const inf = el('text');
      attr(inf, {
        x: PAD_LEFT + PLOT_W - 10,
        y: y + BAR_H / 2 + 5,
        'text-anchor': 'end',
        fill: C.arweave,
        'font-size': 14,
        'font-family': 'inherit',
        'font-weight': '700',
      });
      inf.textContent = '∞';
      gBars.appendChild(inf);
    } else {
      const cliffX = xOfDay(layer.availDays!);
      const endX = xOfDay(dayMax);

      // Available segment
      const barAvail = el('rect');
      attr(barAvail, {
        class: 'cliff-bar-avail',
        x: xStart,
        y,
        width: cliffX - xStart,
        height: BAR_H,
        fill: color,
        rx: 3,
      });
      gBars.appendChild(barAvail);

      // Pruned segment (faded)
      const barPruned = el('rect');
      attr(barPruned, {
        class: 'cliff-bar-pruned',
        x: cliffX,
        y,
        width: endX - cliffX,
        height: BAR_H,
        fill: color,
        rx: 3,
      });
      gBars.appendChild(barPruned);

      // Cliff marker line
      const cliffLine = el('line');
      attr(cliffLine, {
        x1: cliffX,
        y1: y - 2,
        x2: cliffX,
        y2: y + BAR_H + 2,
        stroke: color,
        'stroke-width': 2,
        'stroke-dasharray': '3 2',
      });
      gBars.appendChild(cliffLine);

      // Cliff day label above bar
      const cliffLbl = el('text');
      attr(cliffLbl, {
        x: cliffX,
        y: y - 5,
        'text-anchor': 'middle',
        fill: color,
        'font-size': 9,
        'font-family': 'inherit',
      });
      cliffLbl.textContent = `${layer.availDays}d`;
      gBars.appendChild(cliffLbl);
    }
  });

  // Draggable cursor group
  const gCursor = el('g');
  gCursor.setAttribute('class', 'cliff-cursor');
  svg.appendChild(gCursor);

  // Cursor vertical line
  const cursorLine = el('line');
  attr(cursorLine, {
    class: 'cliff-cursor-line',
    y1: PAD_TOP - 8,
    y2: PAD_TOP + PLOT_H + 4,
    stroke: C.cursorLine,
    'stroke-width': 1.5,
    'stroke-dasharray': '4 3',
  });
  gCursor.appendChild(cursorLine);

  // Triangle handle
  const handle = el('polygon');
  attr(handle, {
    class: 'cliff-handle',
    points: '0,-8 7,4 -7,4',
    fill: C.cursor,
    stroke: C.bg,
    'stroke-width': 1.5,
  });
  gCursor.appendChild(handle);

  // Cursor day label
  const cursorLabel = el('text');
  attr(cursorLabel, {
    'text-anchor': 'middle',
    fill: C.text,
    'font-size': 11,
    'font-weight': '700',
    'font-family': 'inherit',
    y: PAD_TOP + PLOT_H + 36,
  });
  gCursor.appendChild(cursorLabel);

  stage.appendChild(svg);

  // ── Panel ───────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'cliff-panel';

  const durTitle = document.createElement('div');
  durTitle.className = 'cliff-panel-title';
  durTitle.textContent = 'Training Duration';
  panelDiv.appendChild(durTitle);

  const durVal = document.createElement('div');
  durVal.className = 'cliff-panel-dur';
  panelDiv.appendChild(durVal);

  const durSub = document.createElement('div');
  durSub.className = 'cliff-panel-sub';
  durSub.textContent = 'drag the cursor';
  panelDiv.appendChild(durSub);

  const rowsTitle = document.createElement('div');
  rowsTitle.className = 'cliff-panel-title';
  rowsTitle.style.marginTop = '4px';
  rowsTitle.textContent = 'Layer Status';
  panelDiv.appendChild(rowsTitle);

  const rowEls: { ok: HTMLElement; name: HTMLElement; note: HTMLElement }[] = [];
  for (const layer of rawData.layers) {
    const row = document.createElement('div');
    row.className = 'cliff-row';

    const dot = document.createElement('div');
    dot.className = 'cliff-dot';
    dot.style.background = LAYER_COLOR[layer.id] ?? C.text;

    const ok = document.createElement('span');
    ok.className = 'cliff-status';

    const nameWrap = document.createElement('div');
    nameWrap.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'cliff-name';
    name.textContent = layer.label;
    const note = document.createElement('div');
    note.className = 'cliff-note';

    nameWrap.appendChild(name);
    nameWrap.appendChild(note);
    row.appendChild(dot);
    row.appendChild(ok);
    row.appendChild(nameWrap);
    panelDiv.appendChild(row);
    rowEls.push({ ok, name, note });
  }

  panel.appendChild(panelDiv);

  // ── Controls ─────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'cliff-controls';

  const presetLabel = document.createElement('span');
  presetLabel.style.cssText = `font-size:11px;color:${C.dim};`;
  presetLabel.textContent = 'Presets:';
  ctrlDiv.appendChild(presetLabel);

  const btnEls: HTMLButtonElement[] = [];
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'cliff-btn';
    btn.textContent = p.label;
    btn.addEventListener('click', () => setCursorDays(p.days));
    ctrlDiv.appendChild(btn);
    btnEls.push(btn);
  }
  controls.appendChild(ctrlDiv);

  // ── Caption ──────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'cliff-caption';
  cap.innerHTML =
    'Sources: <a href="https://eips.ethereum.org/EIPS/eip-4844" target="_blank" rel="noopener">EIP-4844</a>, ' +
    '<a href="https://docs.eigenlayer.xyz/eigenda/overview" target="_blank" rel="noopener">EigenDA docs</a>, ' +
    '<a href="https://docs.filecoin.io/basics/how-storage-works/storage-deals" target="_blank" rel="noopener">Filecoin docs</a>, ' +
    '<a href="https://www.arweave.org/files/arweave-lightpaper.pdf" target="_blank" rel="noopener">Arweave lightpaper</a> · as of 2026-06-21';
  caption.appendChild(cap);

  // ── State + update ───────────────────────────────────────────────────────
  let cursorDays = rawData.config.defaultCursorDays;

  function formatDays(d: number): string {
    if (d >= 365) return `${(d / 365).toFixed(1)} yr`;
    if (d >= 1) return `${Math.round(d)} d`;
    return `< 1 d`;
  }

  function isAvailable(layer: Layer, days: number): boolean {
    if (layer.permanent) return true;
    return days <= layer.availDays!;
  }

  function updateCursor(days: number): void {
    const clampedDays = Math.max(dayMin, Math.min(dayMax, days));
    cursorDays = clampedDays;
    const x = xOfDay(clampedDays);

    attr(cursorLine, { x1: x, x2: x });
    handle.setAttribute('transform', `translate(${x}, ${PAD_TOP - 8})`);
    attr(cursorLabel, { x });
    cursorLabel.textContent = formatDays(clampedDays);

    // Panel
    durVal.textContent = formatDays(clampedDays);

    rawData.layers.forEach((layer, i) => {
      const avail = isAvailable(layer, clampedDays);
      const { ok, note } = rowEls[i];
      ok.className = `cliff-status ${avail ? 'cliff-ok' : 'cliff-fail'}`;
      ok.textContent = avail ? '✓' : '✗';
      if (layer.permanent) {
        note.textContent = 'permanent';
      } else {
        note.textContent = avail
          ? `available (${layer.availDays}d window)`
          : `pruned after ${layer.availDays}d`;
      }
    });

    // Preset buttons
    btnEls.forEach((btn, i) => {
      btn.classList.toggle('active', PRESETS[i].days === Math.round(clampedDays));
    });
  }

  function setCursorDays(days: number): void {
    updateCursor(days);
  }

  // ── Drag interaction ─────────────────────────────────────────────────────
  // Convert SVG client coords to day value
  function clientXtoDay(clientX: number): number {
    const svgRect = svg.getBoundingClientRect();
    const svgW = svgRect.width;
    const scale = svgW / VW;
    const localX = (clientX - svgRect.left) / scale;
    return dayOfX(localX);
  }

  let dragging = false;

  function onDown(e: PointerEvent): void {
    dragging = true;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    updateCursor(clientXtoDay(e.clientX));
    e.preventDefault();
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    updateCursor(clientXtoDay(e.clientX));
    e.preventDefault();
  }

  function onUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
  }

  // Hit region covering full plot width for easier grab
  const hitRect = el('rect');
  attr(hitRect, {
    x: PAD_LEFT,
    y: PAD_TOP - 12,
    width: PLOT_W,
    height: PLOT_H + 24,
    fill: 'transparent',
    style: 'cursor:ew-resize;touch-action:none;',
  });
  hitRect.addEventListener('pointerdown', onDown);
  hitRect.addEventListener('pointermove', onMove);
  hitRect.addEventListener('pointerup', onUp);
  hitRect.addEventListener('pointercancel', onUp);
  svg.appendChild(hitRect);

  // Initial render
  updateCursor(cursorDays);

  return () => {
    hitRect.removeEventListener('pointerdown', onDown);
    hitRect.removeEventListener('pointermove', onMove);
    hitRect.removeEventListener('pointerup', onUp);
    hitRect.removeEventListener('pointercancel', onUp);
    layout.dispose();
    style.remove();
  };
}
