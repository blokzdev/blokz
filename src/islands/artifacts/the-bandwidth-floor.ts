/**
 * Artifact: the-bandwidth-floor — The Bandwidth Floor
 * Manifest: content/artifacts/the-bandwidth-floor/manifest.json
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import DATA from '../../../content/artifacts/the-bandwidth-floor/data.json';

const W = 800, H = 480;
const X0 = 74, X1 = 774, Y0 = 36, Y1 = 418;

const MB = DATA.curves.models_B;
const DDP = DATA.curves.ddp_mbps;
const DILOCO = DATA.curves.diloco_mbps;
const SL = DATA.curves.sparseloco_mbps;

const BMIN = 1, BMAX = 100;
const YMIN = 1, YMAX = 1_000_000;

function xOf(b: number): number {
  return X0 + (Math.log10(b) - Math.log10(BMIN)) / (Math.log10(BMAX) - Math.log10(BMIN)) * (X1 - X0);
}
function yOf(mbps: number): number {
  const clamped = Math.max(YMIN, Math.min(YMAX, mbps));
  return Y1 - (Math.log10(clamped) - Math.log10(YMIN)) / (Math.log10(YMAX) - Math.log10(YMIN)) * (Y1 - Y0);
}
function bFromX(vx: number): number {
  const t = Math.max(0, Math.min(1, (vx - X0) / (X1 - X0)));
  return Math.pow(10, Math.log10(BMIN) + t * (Math.log10(BMAX) - Math.log10(BMIN)));
}

function interpolate(models: number[], values: number[], b: number): number {
  if (b <= models[0]) return values[0];
  if (b >= models[models.length - 1]) return values[values.length - 1];
  for (let i = 1; i < models.length; i++) {
    if (b <= models[i]) {
      const t = (Math.log10(b) - Math.log10(models[i - 1])) / (Math.log10(models[i]) - Math.log10(models[i - 1]));
      return Math.pow(10, Math.log10(values[i - 1]) + t * (Math.log10(values[i]) - Math.log10(values[i - 1])));
    }
  }
  return values[values.length - 1];
}

function fmtMbps(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' Gbps';
  if (v >= 1) return v.toFixed(v >= 10 ? 0 : 1) + ' Mbps';
  return (v * 1000).toFixed(0) + ' Kbps';
}

function fmtB(b: number): string {
  return b < 10 ? b.toFixed(1) + 'B' : Math.round(b) + 'B';
}

function connectivityLabel(mbps: number): string {
  const c = DATA.connectivity;
  if (mbps > c.nvlink_mbps / 2) return 'NVLink';
  if (mbps > c.datacenterLink_mbps / 2) return 'data-center fiber';
  if (mbps > c.enterpriseFiber_mbps / 2) return 'enterprise fiber';
  if (mbps > c.homeFiber_mbps / 2) return 'home fiber';
  if (mbps > c.homeCable_mbps / 2) return 'home cable';
  return 'below cable';
}

function polyline(models: number[], values: number[]): string {
  return models.map((b, i) => `${xOf(b).toFixed(1)},${yOf(values[i]).toFixed(1)}`).join(' ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function el<T extends SVGElement>(tag: string, attrs: Record<string, string | number> = {}): T {
  const e = document.createElementNS(SVG_NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
    controls: false,
  });
  const { stage, panel, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .bfl-stage { width:100%; height:100%; display:block; }
    .bfl-panel { font-family: ui-monospace, monospace; font-size: 12px; color: #e2e8f0;
      display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
    .bfl-panel-title { font-size: 11px; color: #94a3b8; text-transform: uppercase;
      letter-spacing: .06em; margin-bottom: 2px; }
    .bfl-row { display: flex; align-items: baseline; justify-content: space-between;
      gap: 6px; min-width: 0; }
    .bfl-label { color: #94a3b8; white-space: nowrap; }
    .bfl-val { font-weight: 600; text-align: right; }
    .bfl-ddp { color: #ef4444; }
    .bfl-diloco { color: #f59e0b; }
    .bfl-sl { color: #3b82f6; }
    .bfl-ratio { color: #94a3b8; font-size: 11px; }
    .bfl-conn { color: #22d3ee; font-size: 11px; margin-top: 2px; }
    .bfl-hint { font-size: 11px; color: #64748b; }
    .bfl-caption { font-size: 11px; color: #64748b; line-height: 1.5; }
  `;
  stage.appendChild(style);

  // SVG
  const svg = el<SVGSVGElement>('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'bfl-stage',
    'aria-label': 'Log-log chart: uplink bandwidth vs model parameters for three sync strategies',
  });

  // Background
  const bg = el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0f172a' });
  svg.appendChild(bg);

  // Grid lines
  const grid = el('g', { stroke: '#1e293b', 'stroke-width': '1' });
  // Y grid — decade lines
  for (let exp = 0; exp <= 6; exp++) {
    const mbps = Math.pow(10, exp);
    const y = yOf(mbps);
    if (y < Y0 || y > Y1) continue;
    grid.appendChild(el('line', { x1: X0, y1: y, x2: X1, y2: y }));
  }
  // X grid — log ticks
  for (const b of [1, 3, 7, 13, 30, 70, 100]) {
    const x = xOf(b);
    grid.appendChild(el('line', { x1: x, y1: Y0, x2: x, y2: Y1 }));
  }
  svg.appendChild(grid);

  // Connectivity bands (horizontal reference lines)
  const bands = [
    { mbps: DATA.connectivity.homeCable_mbps,       label: 'Home cable 40 Mbps',  color: '#334155' },
    { mbps: DATA.connectivity.homeFiber_mbps,        label: 'Home fiber 500 Mbps', color: '#334155' },
    { mbps: DATA.connectivity.enterpriseFiber_mbps,  label: 'Enterprise 1 Gbps',  color: '#334155' },
    { mbps: DATA.connectivity.datacenterLink_mbps,   label: 'DC link 10 Gbps',    color: '#334155' },
  ];
  const bandG = el('g');
  for (const b of bands) {
    const y = yOf(b.mbps);
    const line = el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: b.color, 'stroke-width': '1', 'stroke-dasharray': '4 3' });
    bandG.appendChild(line);
    const txt = el<SVGTextElement>('text', { x: X1 + 4, y: y + 4, fill: '#475569', 'font-size': '9', 'font-family': 'monospace' });
    txt.textContent = b.label;
    bandG.appendChild(txt);
  }
  svg.appendChild(bandG);

  // Axis labels Y
  const yLabels = el('g', { fill: '#64748b', 'font-size': '10', 'font-family': 'monospace', 'text-anchor': 'end' });
  const yTicks = [1, 10, 100, 1000, 10000, 100000, 1000000];
  const yTickLabels = ['1M', '10M', '100M', '1G', '10G', '100G', '1T'].map((_, i) => {
    const v = yTicks[i];
    return v >= 1000 ? (v / 1000) + 'G' : v + 'M';
  });
  // Simplified labels
  const yLabelMap: Record<number, string> = {
    1: '1 Mbps', 10: '10M', 100: '100M', 1000: '1 Gbps', 10000: '10G', 100000: '100G', 1000000: '1T',
  };
  for (const mbps of yTicks) {
    const y = yOf(mbps);
    if (y < Y0 - 5 || y > Y1 + 5) continue;
    const t = el<SVGTextElement>('text', { x: X0 - 6, y: y + 3 });
    t.textContent = yLabelMap[mbps] || '';
    yLabels.appendChild(t);
  }
  svg.appendChild(yLabels);

  // Axis labels X
  const xLabels = el('g', { fill: '#64748b', 'font-size': '10', 'font-family': 'monospace', 'text-anchor': 'middle' });
  for (const b of [1, 3, 7, 13, 30, 70, 100]) {
    const t = el<SVGTextElement>('text', { x: xOf(b), y: Y1 + 14 });
    t.textContent = fmtB(b);
    xLabels.appendChild(t);
  }
  svg.appendChild(xLabels);

  // Axis title Y (rotated)
  const yTitle = el<SVGTextElement>('text', {
    x: 12, y: (Y0 + Y1) / 2,
    fill: '#64748b', 'font-size': '11', 'font-family': 'sans-serif',
    'text-anchor': 'middle',
    transform: `rotate(-90, 12, ${(Y0 + Y1) / 2})`,
  });
  yTitle.textContent = 'Uplink bandwidth';
  svg.appendChild(yTitle);

  // Axis title X
  const xTitle = el<SVGTextElement>('text', {
    x: (X0 + X1) / 2, y: H - 4,
    fill: '#64748b', 'font-size': '11', 'font-family': 'sans-serif',
    'text-anchor': 'middle',
  });
  xTitle.textContent = 'Model parameters';
  svg.appendChild(xTitle);

  // Series polylines
  const ddpLine = el('polyline', {
    points: polyline(MB, DDP),
    fill: 'none', stroke: '#ef4444', 'stroke-width': '2.5',
  });
  const dilocoLine = el('polyline', {
    points: polyline(MB, DILOCO),
    fill: 'none', stroke: '#f59e0b', 'stroke-width': '2', 'stroke-dasharray': '6 3',
  });
  const slLine = el('polyline', {
    points: polyline(MB, SL),
    fill: 'none', stroke: '#3b82f6', 'stroke-width': '2.5',
  });
  svg.appendChild(ddpLine);
  svg.appendChild(dilocoLine);
  svg.appendChild(slLine);

  // Covenant-72B anchor dot
  const anchor = DATA.covenantAnchor;
  const anchorX = xOf(anchor.params_B);
  const anchorY = yOf(anchor.uplink_mbps);
  const anchorDot = el('circle', {
    cx: anchorX, cy: anchorY, r: '5',
    fill: '#22d3ee', stroke: '#0f172a', 'stroke-width': '1.5',
  });
  const anchorLabel = el<SVGTextElement>('text', {
    x: anchorX + 8, y: anchorY - 6,
    fill: '#22d3ee', 'font-size': '10', 'font-family': 'monospace',
  });
  anchorLabel.textContent = `Covenant-72B\n${anchor.uplink_mbps} Mbps`;
  svg.appendChild(anchorDot);
  // Covenant label as two lines
  const al1 = el<SVGTextElement>('text', { x: anchorX + 8, y: anchorY - 8, fill: '#22d3ee', 'font-size': '10', 'font-family': 'monospace' });
  al1.textContent = 'Covenant-72B';
  const al2 = el<SVGTextElement>('text', { x: anchorX + 8, y: anchorY + 4, fill: '#22d3ee', 'font-size': '10', 'font-family': 'monospace' });
  al2.textContent = `${anchor.uplink_mbps} Mbps`;
  svg.appendChild(al1);
  svg.appendChild(al2);

  // Legend (top-left)
  const legendItems = [
    { label: 'Dense DDP (fp32, every step)', color: '#ef4444', dash: false },
    { label: 'DiLoCo (fp32, 20-min sync)', color: '#f59e0b', dash: true },
    { label: 'SparseLoCo (146× compressed)', color: '#3b82f6', dash: false },
  ];
  const legendG = el('g');
  legendItems.forEach((item, i) => {
    const lx = X0 + 8;
    const ly = Y0 + 10 + i * 18;
    const lineEl = el('line', {
      x1: lx, y1: ly, x2: lx + 22, y2: ly,
      stroke: item.color, 'stroke-width': item.dash ? '1.5' : '2',
      ...(item.dash ? { 'stroke-dasharray': '5 3' } : {}),
    });
    legendG.appendChild(lineEl);
    const txt = el<SVGTextElement>('text', { x: lx + 27, y: ly + 4, fill: '#cbd5e1', 'font-size': '10', 'font-family': 'sans-serif' });
    txt.textContent = item.label;
    legendG.appendChild(txt);
  });
  svg.appendChild(legendG);

  // Cursor group (initially hidden at midpoint)
  const cursorG = el('g', { opacity: '0' });
  const cursorLine = el('line', {
    x1: 0, y1: Y0, x2: 0, y2: Y1,
    stroke: '#475569', 'stroke-width': '1', 'stroke-dasharray': '3 3',
  });
  cursorG.appendChild(cursorLine);
  const cursorDotDDP = el('circle', { r: '4', fill: '#ef4444', stroke: '#0f172a', 'stroke-width': '1.5' });
  const cursorDotDiloco = el('circle', { r: '4', fill: '#f59e0b', stroke: '#0f172a', 'stroke-width': '1.5' });
  const cursorDotSL = el('circle', { r: '4', fill: '#3b82f6', stroke: '#0f172a', 'stroke-width': '1.5' });
  cursorG.appendChild(cursorDotDDP);
  cursorG.appendChild(cursorDotDiloco);
  cursorG.appendChild(cursorDotSL);
  const cursorBLabel = el<SVGTextElement>('text', {
    y: Y0 - 4, fill: '#e2e8f0', 'font-size': '11', 'font-family': 'monospace', 'text-anchor': 'middle',
  });
  cursorG.appendChild(cursorBLabel);
  svg.appendChild(cursorG);

  stage.appendChild(svg);

  // Panel
  panel.className = 'bfl-panel';
  panel.innerHTML = `
    <div class="bfl-panel-title">At cursor</div>
    <div id="bfl-b-row" class="bfl-row">
      <span class="bfl-label">Model size</span>
      <span class="bfl-val" id="bfl-b-val">—</span>
    </div>
    <div class="bfl-row">
      <span class="bfl-label bfl-ddp">● Dense DDP</span>
      <span class="bfl-val bfl-ddp" id="bfl-ddp-val">—</span>
    </div>
    <div class="bfl-row">
      <span class="bfl-label bfl-diloco">● DiLoCo</span>
      <span class="bfl-val bfl-diloco" id="bfl-diloco-val">—</span>
    </div>
    <div class="bfl-row">
      <span class="bfl-label bfl-sl">● SparseLoCo</span>
      <span class="bfl-val bfl-sl" id="bfl-sl-val">—</span>
    </div>
    <div id="bfl-ratio" class="bfl-ratio">—</div>
    <div id="bfl-conn" class="bfl-conn">—</div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #1e293b">
      <div class="bfl-panel-title">Compression</div>
      <div class="bfl-row"><span class="bfl-label">Ratio vs DDP</span><span class="bfl-val" style="color:#94a3b8">146.3×</span></div>
      <div class="bfl-row"><span class="bfl-label">Density</span><span class="bfl-val" style="color:#94a3b8">1.56%</span></div>
    </div>
  `;

  caption.innerHTML = `<span class="bfl-caption">Source: Covenant-72B (arXiv 2603.08163) · SparseLoCo (arXiv 2508.15706) · data as of 2026-03-09 · drag chart to read values</span>`;

  // Readout updater
  const bValEl = panel.querySelector('#bfl-b-val') as HTMLElement;
  const ddpValEl = panel.querySelector('#bfl-ddp-val') as HTMLElement;
  const dilocoValEl = panel.querySelector('#bfl-diloco-val') as HTMLElement;
  const slValEl = panel.querySelector('#bfl-sl-val') as HTMLElement;
  const ratioEl = panel.querySelector('#bfl-ratio') as HTMLElement;
  const connEl = panel.querySelector('#bfl-conn') as HTMLElement;

  let currentVX = (X0 + X1) / 2;
  let active = false;

  function updateCursor(vx: number): void {
    currentVX = Math.max(X0, Math.min(X1, vx));
    const b = bFromX(currentVX);
    const ddpV = interpolate(MB, DDP, b);
    const dilocoV = interpolate(MB, DILOCO, b);
    const slV = interpolate(MB, SL, b);

    cursorLine.setAttribute('x1', String(currentVX));
    cursorLine.setAttribute('x2', String(currentVX));
    cursorDotDDP.setAttribute('cx', String(currentVX));
    cursorDotDDP.setAttribute('cy', String(yOf(ddpV)));
    cursorDotDiloco.setAttribute('cx', String(currentVX));
    cursorDotDiloco.setAttribute('cy', String(yOf(dilocoV)));
    cursorDotSL.setAttribute('cx', String(currentVX));
    cursorDotSL.setAttribute('cy', String(yOf(slV)));
    cursorBLabel.setAttribute('x', String(currentVX));
    cursorBLabel.textContent = fmtB(b);
    cursorG.setAttribute('opacity', '1');

    bValEl.textContent = fmtB(b) + ' params';
    ddpValEl.textContent = fmtMbps(ddpV);
    dilocoValEl.textContent = fmtMbps(dilocoV);
    slValEl.textContent = fmtMbps(slV);
    ratioEl.textContent = `DDP÷SL: ${(ddpV / slV).toFixed(0)}×`;
    connEl.textContent = `SparseLoCo tier: ${connectivityLabel(slV)}`;
  }

  // Initialize cursor at midpoint
  updateCursor((X0 + X1) / 2);

  function svgVX(e: PointerEvent): number {
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const scaleX = W / rect.width;
    return clientX * scaleX;
  }

  function onPointerDown(e: PointerEvent): void {
    active = true;
    svg.setPointerCapture(e.pointerId);
    updateCursor(svgVX(e));
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent): void {
    if (!active) return;
    updateCursor(svgVX(e));
    e.preventDefault();
  }
  function onPointerUp(e: PointerEvent): void {
    active = false;
    svg.releasePointerCapture(e.pointerId);
  }

  svg.style.cursor = 'ew-resize';
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);

  return () => {
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('pointercancel', onPointerUp);
    style.remove();
    layout.dispose();
  };
}
