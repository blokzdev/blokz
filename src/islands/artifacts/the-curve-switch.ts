/**
 * Artifact: the-curve-switch — The Curve Switch
 * Manifest: content/artifacts/the-curve-switch/manifest.json
 *
 * Grouped bar chart comparing BN254 vs BLS12-381 gas costs on a log scale.
 * Click any bar to see the breakdown and USD estimate in the side panel.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-curve-switch/data.json';

type Op = (typeof rawData.operations)[number];

const NS = 'http://www.w3.org/2000/svg';

const COLOR_BN254 = '#f0883e';
const COLOR_BLS = '#58a6ff';
const COLOR_BN254_EVM = '#e05c00'; // darker orange for "EVM bytecode estimate"

function fmtGas(g: number): string {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M`;
  if (g >= 1_000) return `${(g / 1_000).toFixed(g >= 100_000 ? 0 : 1)}k`;
  return `${g}`;
}

function gasToUsd(gas: number): string {
  const eth = (gas * rawData.gasPriceGwei) / 1e9;
  return `$${(eth * rawData.ethUsd).toFixed(3)}`;
}

function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cs-svg { width: 100%; height: 100%; display: block; }
    .cs-panel {
      font-size: 12px; color: #c9d1d9;
      display: flex; flex-direction: column; gap: 10px;
      padding: 4px 0;
    }
    .cs-empty { color: #8b949e; font-size: 11px; line-height: 1.5; }
    .cs-op-label { font-size: 13px; font-weight: 600; color: #f0f6fc; }
    .cs-stats {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
    }
    .cs-stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: .04em; }
    .cs-stat-val { font-size: 13px; color: #e6edf3; font-weight: 500; }
    .cs-stat-val.better { color: #3fb950; }
    .cs-stat-val.evm-est { color: #d29922; font-size: 11px; }
    .cs-note { font-size: 11px; color: #8b949e; line-height: 1.55; border-top: 1px solid #21262d; padding-top: 8px; }
    .cs-legend { display: flex; flex-direction: column; gap: 5px; margin-top: auto; padding-top: 10px; border-top: 1px solid #21262d; }
    .cs-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .cs-legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
    .cs-caption { font-size: 10px; color: #6e7681; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .cs-caption a { color: #58a6ff; text-decoration: none; }
    .cs-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // ── SVG ───────────────────────────────────────────────────────────────────
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'cs-svg');
  svg.setAttribute('aria-label', 'BN254 vs BLS12-381 gas cost comparison chart');
  stage.appendChild(svg);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'cs-panel';
  panel.appendChild(panelDiv);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'cs-empty';
  emptyMsg.textContent = 'Click a bar to inspect the operation.';
  panelDiv.appendChild(emptyMsg);

  const legendDiv = document.createElement('div');
  legendDiv.className = 'cs-legend';
  legendDiv.innerHTML = `
    <div class="cs-legend-row">
      <div class="cs-legend-swatch" style="background:${COLOR_BN254}"></div>
      <span>BN254 (EIP-197 + EIP-1108)</span>
    </div>
    <div class="cs-legend-row">
      <div class="cs-legend-swatch" style="background:${COLOR_BN254_EVM};opacity:0.7;border:1px dashed ${COLOR_BN254}"></div>
      <span>BN254 – EVM bytecode estimate</span>
    </div>
    <div class="cs-legend-row">
      <div class="cs-legend-swatch" style="background:${COLOR_BLS}"></div>
      <span>BLS12-381 (EIP-2537)</span>
    </div>
  `;
  panelDiv.appendChild(legendDiv);

  // ── Caption ───────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'cs-caption';
  capDiv.innerHTML = `
    Source: <a href="${rawData.source.url}" target="_blank" rel="noopener">${rawData.source.label}</a>
    · data as of ${rawData.asOf} · ETH/USD ${rawData.ethUsd.toLocaleString()} · gas price ${rawData.gasPriceGwei} Gwei
  `;
  caption.appendChild(capDiv);

  // ── Draw ──────────────────────────────────────────────────────────────────
  let selectedId: string | null = null;

  function mkEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = svg.clientWidth || 560;
    const H = svg.clientHeight || 315;

    const ml = 46, mr = 12, mt = 16, mb = 48;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 60 || ch < 60) return;

    const ops = rawData.operations;
    const N = ops.length;

    // Log-scale Y: range 100 → 2M
    const Y_LO = 100, Y_HI = 2_200_000;
    const py = (g: number): number => mt + ch - logMap(Math.min(g, Y_HI), Y_LO, Y_HI, 0, ch);

    // Bar layout: grouped pairs with gap
    const groupW = cw / N;
    const barPad = groupW * 0.12;
    const barW = (groupW - barPad * 2) / 2 - 2;

    const gx = (i: number): number => ml + i * groupW + barPad;

    // ── Y grid ────────────────────────────────────────────────────────────
    const yTicks = [200, 1_000, 10_000, 100_000, 1_000_000];
    for (const g of yTicks) {
      const y = py(g);
      if (y < mt || y > mt + ch) continue;
      svg.appendChild(mkEl('line', {
        x1: ml, y1: y, x2: ml + cw, y2: y,
        stroke: '#21262d', 'stroke-width': '1',
      }));
      const tl = mkEl('text', {
        x: ml - 4, y: y + 3.5,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace',
        'text-anchor': 'end',
      });
      tl.textContent = fmtGas(g);
      svg.appendChild(tl);
    }

    // Y axis label
    const yLabelG = document.createElementNS(NS, 'g');
    yLabelG.setAttribute('transform', `rotate(-90,${ml - 36},${mt + ch / 2})`);
    const yLabel = mkEl('text', {
      x: ml - 36, y: mt + ch / 2,
      fill: '#8b949e', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
      'text-anchor': 'middle',
    });
    yLabel.textContent = 'Gas cost (log scale)';
    yLabelG.appendChild(yLabel);
    svg.appendChild(yLabelG);

    // Axes
    svg.appendChild(mkEl('line', { x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));
    svg.appendChild(mkEl('line', { x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));

    // ── Bars ──────────────────────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      const op = ops[i];
      const x0 = gx(i);
      const isSelected = op.id === selectedId;

      // BN254 bar
      const bn254Color = op.bn254IsEvm ? COLOR_BN254_EVM : COLOR_BN254;
      const bn254Top = py(op.bn254);
      const bn254H = mt + ch - bn254Top;
      const bar1 = mkEl('rect', {
        x: x0,
        y: bn254Top,
        width: barW,
        height: Math.max(bn254H, 2),
        fill: bn254Color,
        opacity: isSelected ? '1' : '0.8',
        rx: '2',
        cursor: 'pointer',
        role: 'button',
        'aria-label': `${op.label} BN254: ${fmtGas(op.bn254)} gas`,
        tabindex: '0',
      });
      if (op.bn254IsEvm) {
        bar1.setAttribute('stroke', COLOR_BN254);
        bar1.setAttribute('stroke-width', '1');
        bar1.setAttribute('stroke-dasharray', '3 2');
      }
      if (isSelected) {
        bar1.setAttribute('stroke', '#fff');
        bar1.setAttribute('stroke-width', '1.5');
        bar1.setAttribute('stroke-dasharray', 'none');
      }
      bar1.addEventListener('click', () => select(op.id));
      bar1.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(op.id); }
      });
      svg.appendChild(bar1);

      // BLS12-381 bar
      const blsTop = py(op.bls12381);
      const blsH = mt + ch - blsTop;
      const bar2 = mkEl('rect', {
        x: x0 + barW + 2,
        y: blsTop,
        width: barW,
        height: Math.max(blsH, 2),
        fill: COLOR_BLS,
        opacity: isSelected ? '1' : '0.8',
        rx: '2',
        cursor: 'pointer',
        role: 'button',
        'aria-label': `${op.label} BLS12-381: ${fmtGas(op.bls12381)} gas`,
        tabindex: '0',
      });
      if (isSelected) {
        bar2.setAttribute('stroke', '#fff');
        bar2.setAttribute('stroke-width', '1.5');
      }
      bar2.addEventListener('click', () => select(op.id));
      bar2.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(op.id); }
      });
      svg.appendChild(bar2);

      // Value labels above bars (only if tall enough)
      if (bn254H > 18 && W > 380) {
        const vl = mkEl('text', {
          x: x0 + barW / 2, y: bn254Top - 3,
          fill: bn254Color, 'font-size': '8', 'font-family': 'monospace',
          'text-anchor': 'middle', 'pointer-events': 'none',
        });
        vl.textContent = fmtGas(op.bn254);
        svg.appendChild(vl);
      }
      if (blsH > 18 && W > 380) {
        const vl = mkEl('text', {
          x: x0 + barW + 2 + barW / 2, y: blsTop - 3,
          fill: COLOR_BLS, 'font-size': '8', 'font-family': 'monospace',
          'text-anchor': 'middle', 'pointer-events': 'none',
        });
        vl.textContent = fmtGas(op.bls12381);
        svg.appendChild(vl);
      }

      // Group label below axis
      const labelX = x0 + barW + 1;
      const linesRaw = op.label.split(' ');
      // Wrap "PAIRING k=1" → two lines if narrow
      const lines = groupW < 80 && linesRaw.length >= 2
        ? [linesRaw[0], linesRaw.slice(1).join(' ')]
        : [op.label];
      for (let li = 0; li < lines.length; li++) {
        const tl = mkEl('text', {
          x: labelX, y: mt + ch + 14 + li * 10,
          fill: isSelected ? '#e6edf3' : '#8b949e',
          'font-size': '9', 'font-family': 'system-ui,sans-serif',
          'text-anchor': 'middle', 'pointer-events': 'none',
        });
        tl.textContent = lines[li];
        svg.appendChild(tl);
      }
    }
  }

  function select(id: string): void {
    selectedId = selectedId === id ? null : id;
    draw();
    updatePanel();
  }

  function updatePanel(): void {
    while (panelDiv.firstChild && panelDiv.firstChild !== legendDiv) {
      panelDiv.removeChild(panelDiv.firstChild);
    }

    if (!selectedId) {
      panelDiv.insertBefore(emptyMsg, legendDiv);
      return;
    }

    const op = rawData.operations.find((o) => o.id === selectedId);
    if (!op) { panelDiv.insertBefore(emptyMsg, legendDiv); return; }

    const nameEl = document.createElement('div');
    nameEl.className = 'cs-op-label';
    nameEl.textContent = op.label;
    panelDiv.insertBefore(nameEl, legendDiv);

    const statsEl = document.createElement('div');
    statsEl.className = 'cs-stats';

    const blsCheaper = op.bls12381 < op.bn254;
    const ratio = op.bn254 / op.bls12381;
    const ratioStr = ratio >= 10
      ? `${Math.round(ratio)}×`
      : ratio >= 2
        ? `${ratio.toFixed(1)}×`
        : `${Math.round((1 - op.bls12381 / op.bn254) * 100)}% cheaper`;

    const stats: [string, string, boolean, boolean][] = [
      ['BN254 gas', op.bn254IsEvm ? `~${fmtGas(op.bn254)}` : fmtGas(op.bn254), false, false],
      ['BLS12-381 gas', fmtGas(op.bls12381), blsCheaper, false],
      ['BN254 USD', op.bn254IsEvm ? `~${gasToUsd(op.bn254)}` : gasToUsd(op.bn254), false, op.bn254IsEvm],
      ['BLS12-381 USD', gasToUsd(op.bls12381), blsCheaper, false],
      ['Ratio', ratioStr, blsCheaper, false],
      [op.bn254IsEvm ? 'BN254 source' : 'Precompile', op.bn254IsEvm ? 'EVM bytecode' : 'native', false, op.bn254IsEvm],
    ];

    for (const [label, val, better, evmEst] of stats) {
      const lDiv = document.createElement('div');
      const cls = better ? 'cs-stat-val better' : evmEst ? 'cs-stat-val evm-est' : 'cs-stat-val';
      lDiv.innerHTML = `<div class="cs-stat-label">${label}</div><div class="${cls}">${val}</div>`;
      statsEl.appendChild(lDiv);
    }
    panelDiv.insertBefore(statsEl, legendDiv);

    const noteEl = document.createElement('div');
    noteEl.className = 'cs-note';
    noteEl.textContent = op.note;
    panelDiv.insertBefore(noteEl, legendDiv);
  }

  updatePanel();

  // ── Resize ────────────────────────────────────────────────────────────────
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
  ro.observe(stage);
  draw();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    layout.dispose();
    style.remove();
  };
}
