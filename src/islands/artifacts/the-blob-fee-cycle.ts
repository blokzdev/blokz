/**
 * Artifact: the-blob-fee-cycle — The Blob Fee Cycle
 * Manifest: content/artifacts/the-blob-fee-cycle/manifest.json
 *
 * SVG time-series chart of Ethereum blob base fees (EIP-4844) from launch
 * (Mar 2024) through Jun 2026, showing 20 months at the 1-wei floor followed
 * by the Dec 2025 surge. Click any data point to inspect the block details.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from 'content/artifacts/the-blob-fee-cycle/data.json';

// ── SVG helpers ──────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}
function attr(el: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
}

// ── Chart constants ──────────────────────────────────────────────────────────
const W = 600, H = 262;
const ML = 54, MR = 14, MT = 20, MB = 44;
const XL = ML, XR = W - MR, YT = MT, YB = H - MB;
const CW = XR - XL, CH = YB - YT;

// ── Data prep ────────────────────────────────────────────────────────────────
const points = data.points;
const upgrades = data.upgrades;
const ETH_USD = data.eth_price_usd;
const GAS_PER_BLOB = data.blob_gas_per_blob;

const dateMs = (s: string) => new Date(s).getTime();
const T_MIN = dateMs('2024-03-01');
const T_MAX = dateMs('2026-08-01');

// Y: linear gwei scale 0 → 7
const GWEI_MAX = 7;
const tx = (d: string) => XL + ((dateMs(d) - T_MIN) / (T_MAX - T_MIN)) * CW;
const ty = (gwei: number) => YB - (gwei / GWEI_MAX) * CH;

const weiToGwei = (wei: number) => wei / 1e9;
const gweiFmt = (g: number) =>
  g < 0.0001 ? '< 0.0001 gwei' : g < 1 ? g.toFixed(4) + ' gwei' : g.toFixed(3) + ' gwei';

const blobCostUsd = (gwei: number) =>
  ((gwei * 1e9 * GAS_PER_BLOB) / 1e18) * ETH_USD;

// ── Panel HTML ───────────────────────────────────────────────────────────────
function renderPanel(panel: HTMLElement, idx: number): void {
  const p = points[idx];
  const gwei = weiToGwei(p.blob_gas_price_wei);
  const costBlob = blobCostUsd(gwei);
  const costTx = costBlob / 1000; // per L2 tx (≈ 1 blob per 1000 txns heuristic)
  const isFloor = p.blob_gas_price_wei <= 1;

  panel.innerHTML = `
    <div style="font:600 11px/1 var(--font-mono,'ui-monospace',monospace);color:var(--color-muted,#94a3b8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${p.label} · block #${p.block.toLocaleString()}</div>
    <div style="font:700 22px/1 var(--font-sans,'ui-sans-serif',system-ui);color:${isFloor ? '#34d399' : '#fb923c'};margin-bottom:4px">${isFloor ? '1 wei (floor)' : gweiFmt(gwei)}</div>
    <div style="font:400 12px/1.5 var(--font-sans,'ui-sans-serif',system-ui);color:var(--color-muted,#94a3b8);margin-bottom:12px">blob base fee</div>
    <div class="afl-bullets" style="font-size:12px;line-height:1.5;color:var(--color-body,#cbd5e1)">
      <div class="afl-bullet">• excess blob gas: ${p.excess_blob_gas.toLocaleString()}</div>
      <div class="afl-bullet">• blobs/block sample: ${p.blob_count}</div>
      <div class="afl-bullet">• cost per blob: ${isFloor ? '< $0.0001' : '$' + costBlob.toFixed(4)}</div>
      <div class="afl-bullet">• est. per 1k L2 txns: ${isFloor ? '< $0.0001' : '$' + (costTx).toFixed(5)}</div>
    </div>
    <div style="margin-top:10px;font:400 11px/1.4 var(--font-sans,'ui-sans-serif',system-ui);color:var(--color-muted,#94a3b8)">${p.note}</div>
  `;
}

// ── X-axis ticks ─────────────────────────────────────────────────────────────
const X_TICKS: [string, string][] = [
  ['2024-03-13', 'Mar\'24'],
  ['2024-07-01', 'Jul\'24'],
  ['2024-12-01', 'Dec\'24'],
  ['2025-05-07', 'May\'25'],
  ['2025-09-01', 'Sep\'25'],
  ['2026-01-01', 'Jan\'26'],
  ['2026-06-01', 'Jun\'26'],
];

// ── Y-axis ticks ─────────────────────────────────────────────────────────────
const Y_TICKS = [0, 1, 2, 3, 4, 5, 6, 7];

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/7',
    stageFr: '2fr',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .bfc-svg { width:100%; height:100%; display:block; cursor:default; }
    .bfc-dot { cursor:pointer; transition:r .12s, opacity .12s; }
    .bfc-dot:hover { r:7; }
    .bfc-dot.selected { r:7; }
  `;
  stage.appendChild(style);

  // ── SVG ───────────────────────────────────────────────────────────────────
  const svg = svgEl('svg');
  attr(svg, { viewBox: `0 0 ${W} ${H}`, class: 'bfc-svg', 'aria-label': 'Blob fee chart' });
  stage.appendChild(svg);

  // Grid lines + Y axis labels
  for (const g of Y_TICKS) {
    const y = ty(g);
    const line = svgEl('line');
    attr(line, { x1: XL, y1: y, x2: XR, y2: y, stroke: '#334155', 'stroke-width': '1', 'stroke-dasharray': g === 0 ? 'none' : '3 4' });
    svg.appendChild(line);

    const lbl = svgEl('text');
    attr(lbl, { x: XL - 6, y: y + 4, 'text-anchor': 'end', fill: '#64748b', 'font-size': '9', 'font-family': 'ui-monospace,monospace' });
    lbl.textContent = g + 'g';
    svg.appendChild(lbl);
  }

  // X axis ticks + labels
  for (const [d, lbl] of X_TICKS) {
    const x = tx(d);
    const tick = svgEl('line');
    attr(tick, { x1: x, y1: YB, x2: x, y2: YB + 4, stroke: '#475569', 'stroke-width': '1' });
    svg.appendChild(tick);
    const t = svgEl('text');
    attr(t, { x, y: YB + 13, 'text-anchor': 'middle', fill: '#64748b', 'font-size': '9', 'font-family': 'ui-sans-serif,system-ui' });
    t.textContent = lbl;
    svg.appendChild(t);
  }

  // Upgrade vertical lines
  const UPGRADE_COLORS: Record<string, string> = {
    '2024-03-13': '#22d3ee',  // cyan — Dencun
    '2025-05-07': '#fb923c',  // orange — Pectra
  };
  for (const u of upgrades) {
    const x = tx(u.date);
    const color = UPGRADE_COLORS[u.date] ?? '#94a3b8';
    const vline = svgEl('line');
    attr(vline, { x1: x, y1: YT, x2: x, y2: YB, stroke: color, 'stroke-width': '1.2', 'stroke-dasharray': '5 4', opacity: '0.7' });
    svg.appendChild(vline);

    const g = svgEl('g');
    svg.appendChild(g);
    const bg = svgEl('rect');
    const labelText = u.label.replace(' (EIP-4844)', '').replace(' (EIP-7691)', '');
    // position label above the line; alternate sides to avoid overlap
    const isFirst = u.date === '2024-03-13';
    attr(bg, { x: x + (isFirst ? 3 : -62), y: YT + 2, width: '58', height: '13', rx: '2', fill: '#0f172a', opacity: '0.85' });
    g.appendChild(bg);
    const lt = svgEl('text');
    attr(lt, { x: x + (isFirst ? 32 : -33), y: YT + 12, 'text-anchor': 'middle', fill: color, 'font-size': '8.5', 'font-family': 'ui-sans-serif,system-ui', 'font-weight': '600' });
    lt.textContent = labelText;
    g.appendChild(lt);
  }

  // Y-axis label
  const yLabel = svgEl('text');
  attr(yLabel, {
    x: 8, y: (YT + YB) / 2, 'text-anchor': 'middle',
    fill: '#64748b', 'font-size': '9', 'font-family': 'ui-sans-serif,system-ui',
    transform: `rotate(-90, 8, ${(YT + YB) / 2})`,
  });
  yLabel.textContent = 'blob base fee (gwei)';
  svg.appendChild(yLabel);

  // Floor band annotation
  const floorBand = svgEl('rect');
  attr(floorBand, { x: XL, y: YB - 3, width: CW, height: 6, fill: '#34d399', opacity: '0.08' });
  svg.appendChild(floorBand);
  const floorLbl = svgEl('text');
  attr(floorLbl, { x: XL + 4, y: YB - 5, fill: '#34d39980', 'font-size': '8', 'font-family': 'ui-monospace,monospace' });
  floorLbl.textContent = '1 wei floor';
  svg.appendChild(floorLbl);

  // Line path through all points
  const pathD = points.map((p, i) => {
    const x = tx(p.date);
    const gwei = weiToGwei(p.blob_gas_price_wei);
    const y = p.blob_gas_price_wei <= 1 ? YB : ty(gwei);
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const path = svgEl('path');
  attr(path, { d: pathD, fill: 'none', stroke: '#818cf8', 'stroke-width': '1.5', 'stroke-linejoin': 'round', opacity: '0.7' });
  svg.appendChild(path);

  // Data point circles
  let selectedIdx = points.length - 1;
  const dots: SVGCircleElement[] = [];
  const handlers: Array<() => void> = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = tx(p.date);
    const gwei = weiToGwei(p.blob_gas_price_wei);
    const y = p.blob_gas_price_wei <= 1 ? YB : ty(gwei);
    const isFloor = p.blob_gas_price_wei <= 1;

    const circle = svgEl('circle');
    attr(circle, {
      cx: x, cy: y, r: i === selectedIdx ? 7 : 5,
      fill: isFloor ? '#34d399' : '#fb923c',
      stroke: '#0f172a', 'stroke-width': '1.5',
      class: `bfc-dot${i === selectedIdx ? ' selected' : ''}`,
      'aria-label': p.label,
      role: 'button',
      tabindex: '0',
    });
    svg.appendChild(circle);
    dots.push(circle);

    const onClick = () => {
      dots[selectedIdx].setAttribute('r', '5');
      dots[selectedIdx].classList.remove('selected');
      selectedIdx = i;
      circle.setAttribute('r', '7');
      circle.classList.add('selected');
      renderPanel(panel, i);
    };
    circle.addEventListener('click', onClick);
    circle.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onClick(); });
    handlers.push(() => {
      circle.removeEventListener('click', onClick);
    });
  }

  // Initial panel render
  renderPanel(panel, selectedIdx);

  // Caption
  caption.innerHTML = `<span style="font-size:11px;color:var(--color-muted,#64748b)">Sample blocks · <a href="https://eth.blockscout.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Blockscout</a> (eth.blockscout.com) · Ethereum mainnet · as of 2026-06-23 · ETH ≈ $${ETH_USD.toLocaleString()}</span>`;

  return () => {
    for (const h of handlers) h();
    layout.dispose();
    style.remove();
  };
}
