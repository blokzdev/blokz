/**
 * Artifact: the-proof-batch — The Proof Batch
 * Manifest: content/artifacts/the-proof-batch/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-proof-batch/data.json';

type Strategy = (typeof rawData.strategies)[number];

const NS = 'http://www.w3.org/2000/svg';

// X axis: N proofs, log scale 1–1000
// Y axis: on-chain gas, log scale 100k–500M
const X_LO = 1, X_HI = 1000;
const Y_LO = 100_000, Y_HI = 500_000_000;

function computeGas(s: Strategy, n: number): number {
  if (s.constantGas) return s.constantGas;
  if (s.perProofGas) return s.perProofGas * n;
  // SnarkPack: baseGas + logLevels × ⌈log₂ N⌉
  return s.baseGas + s.logLevels * Math.ceil(Math.log2(Math.max(2, n)));
}

function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

function fmtGas(g: number): string {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(g >= 100_000_000 ? 0 : 1)}M`;
  if (g >= 1_000) return `${Math.round(g / 1_000)}k`;
  return String(g);
}

function gasToUsd(gas: number): string {
  const eth = (gas * rawData.meta.gasPriceGwei) / 1e9;
  const usd = eth * rawData.meta.ethUsd;
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .pb-svg { width: 100%; height: 100%; display: block; }
    .pb-panel {
      display: flex; flex-direction: column; gap: 6px;
      font-size: 12px; color: #c9d1d9;
    }
    .pb-panel-title {
      font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
      color: #6e7681;
    }
    .pb-row {
      display: grid; grid-template-columns: 1fr auto auto;
      align-items: center; gap: 4px 8px;
      padding: 5px 6px; border-radius: 5px; cursor: pointer;
      border: 1px solid transparent;
    }
    .pb-row:hover { background: #21262d; }
    .pb-row.active { background: #161b22; border-color: #30363d; }
    .pb-row-name { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 5px; }
    .pb-row-gas  { font-size: 11px; font-variant-numeric: tabular-nums; color: #e6edf3; font-family: monospace; }
    .pb-row-usd  { font-size: 10px; color: #8b949e; font-family: monospace; white-space: nowrap; }
    .pb-row-note { grid-column: 1 / -1; font-size: 10px; color: #8b949e; line-height: 1.5; display: none; padding-top: 2px; }
    .pb-row.active .pb-row-note { display: block; }
    .pb-n-label { font-size: 10px; color: #6e7681; margin-top: auto; padding-top: 6px; border-top: 1px solid #21262d; }
    .pb-controls-wrap { display: flex; align-items: center; gap: 10px; width: 100%; }
    .pb-slider-label { font-size: 11px; color: #8b949e; white-space: nowrap; min-width: 128px; }
    .pb-slider { flex: 1; accent-color: #5b8cff; cursor: pointer; }
    .pb-caption { font-size: 10px; color: #6e7681; }
    .pb-caption a { color: #58a6ff; text-decoration: none; }
    .pb-caption a:hover { text-decoration: underline; }
    .pb-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  `;
  stage.appendChild(style);

  // SVG canvas
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pb-svg');
  svg.setAttribute('aria-label', 'Gas cost vs number of AI inference proofs under three aggregation strategies');
  stage.appendChild(svg);

  // State
  let currentN = 100;
  let activeId: string | null = null;

  // Controls
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'pb-controls-wrap';

  const sliderId = 'pb-n-slider-' + Math.random().toString(36).slice(2);
  const sliderLabel = document.createElement('label');
  sliderLabel.className = 'pb-slider-label';
  sliderLabel.htmlFor = sliderId;
  sliderLabel.textContent = 'N = 100 proofs per batch';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = sliderId;
  slider.min = '1';
  slider.max = '1000';
  slider.value = '100';
  slider.className = 'pb-slider';

  slider.addEventListener('input', () => {
    currentN = parseInt(slider.value, 10);
    sliderLabel.textContent = `N = ${currentN.toLocaleString()} proof${currentN === 1 ? '' : 's'} per batch`;
    draw();
    updatePanel();
  });

  ctrlWrap.appendChild(sliderLabel);
  ctrlWrap.appendChild(slider);
  controls.appendChild(ctrlWrap);

  // Panel
  const panelDiv = document.createElement('div');
  panelDiv.className = 'pb-panel';

  const panelTitle = document.createElement('div');
  panelTitle.className = 'pb-panel-title';
  panelTitle.textContent = 'Gas at selected N';
  panelDiv.appendChild(panelTitle);

  const rowEls = new Map<string, HTMLElement>();

  for (const s of rawData.strategies) {
    const row = document.createElement('div');
    row.className = 'pb-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Highlight ${s.label} curve`);

    const dot = document.createElement('span');
    dot.className = 'pb-dot';
    dot.style.background = s.color;

    const nameEl = document.createElement('div');
    nameEl.className = 'pb-row-name';
    nameEl.appendChild(dot);
    nameEl.appendChild(document.createTextNode(s.label));

    const gasEl = document.createElement('div');
    gasEl.className = 'pb-row-gas';
    gasEl.dataset['gas'] = '';

    const usdEl = document.createElement('div');
    usdEl.className = 'pb-row-usd';
    usdEl.dataset['usd'] = '';

    const noteEl = document.createElement('div');
    noteEl.className = 'pb-row-note';
    noteEl.textContent = s.note;

    row.appendChild(nameEl);
    row.appendChild(gasEl);
    row.appendChild(usdEl);
    row.appendChild(noteEl);

    const sid = s.id;
    row.addEventListener('click', () => {
      activeId = activeId === sid ? null : sid;
      updatePanel();
      draw();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activeId = activeId === sid ? null : sid;
        updatePanel();
        draw();
      }
    });

    panelDiv.appendChild(row);
    rowEls.set(s.id, row);
  }

  const nLabel = document.createElement('div');
  nLabel.className = 'pb-n-label';
  nLabel.textContent = 'at N = 100 proofs';
  panelDiv.appendChild(nLabel);

  panel.appendChild(panelDiv);

  // Caption
  const capDiv = document.createElement('div');
  capDiv.className = 'pb-caption';
  capDiv.innerHTML =
    `Source: <a href="https://eth.blockscout.com/address/0x397A5f7f3dBd538f23DE225B51f532c34448dA9B" ` +
    `target="_blank" rel="noopener">SP1VerifierGateway mainnet</a>` +
    ` · SnarkPack ePrint 2021/1165 · EIP-197 BN254 · ${rawData.meta.blockTimestamp}`;
  caption.appendChild(capDiv);

  function updatePanel(): void {
    for (const s of rawData.strategies) {
      const row = rowEls.get(s.id);
      if (!row) continue;
      const gas = computeGas(s, Math.max(1, currentN));
      const gasEl = row.querySelector('[data-gas]') as HTMLElement | null;
      const usdEl = row.querySelector('[data-usd]') as HTMLElement | null;
      if (gasEl) gasEl.textContent = fmtGas(gas);
      if (usdEl) usdEl.textContent = gasToUsd(gas);
      row.classList.toggle('active', s.id === activeId);
    }
    nLabel.textContent = `at N = ${currentN.toLocaleString()} proof${currentN === 1 ? '' : 's'}`;
  }

  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = svg.clientWidth || 600;
    const H = svg.clientHeight || 338;
    const ml = 54, mr = 52, mt = 18, mb = 44;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    function mkEl(tag: string, attrs: Record<string, string | number>): SVGElement {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    }

    const px = (n: number): number => ml + logMap(Math.max(X_LO, n), X_LO, X_HI, 0, cw);
    const py = (g: number): number => mt + ch - logMap(Math.max(Y_LO, Math.min(Y_HI, g)), Y_LO, Y_HI, 0, ch);

    // Y grid + ticks
    const yTicks = [100_000, 300_000, 1_000_000, 3_000_000, 10_000_000, 30_000_000, 100_000_000, 300_000_000];
    for (const g of yTicks) {
      const y = py(g);
      svg.appendChild(mkEl('line', { x1: ml, y1: y, x2: ml + cw, y2: y, stroke: '#21262d', 'stroke-width': '1' }));
      const tl = mkEl('text', {
        x: ml - 5, y: y + 3.5,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace', 'text-anchor': 'end',
      });
      tl.textContent = fmtGas(g);
      svg.appendChild(tl);
    }

    // X grid + ticks
    const xTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    for (const n of xTicks) {
      const x = px(n);
      svg.appendChild(mkEl('line', { x1: x, y1: mt, x2: x, y2: mt + ch, stroke: '#21262d', 'stroke-width': '1' }));
      if (W > 340 || [1, 10, 100, 1000].includes(n)) {
        const tl = mkEl('text', {
          x: x, y: mt + ch + 13,
          fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace', 'text-anchor': 'middle',
        });
        tl.textContent = String(n);
        svg.appendChild(tl);
      }
    }

    // Axes
    svg.appendChild(mkEl('line', { x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));
    svg.appendChild(mkEl('line', { x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));

    // Axis labels
    const xLabelEl = mkEl('text', {
      x: ml + cw / 2, y: H - 4,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
    });
    xLabelEl.textContent = 'N — number of AI inference proofs per batch →';
    svg.appendChild(xLabelEl);

    const yLabelG = document.createElementNS(NS, 'g');
    yLabelG.setAttribute('transform', `rotate(-90,${ml - 44},${mt + ch / 2})`);
    const yLabelEl = mkEl('text', {
      x: ml - 44, y: mt + ch / 2,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
    });
    yLabelEl.textContent = '← On-chain gas (log scale)';
    yLabelG.appendChild(yLabelEl);
    svg.appendChild(yLabelG);

    // Block gas reference lines
    const blockTargetY = py(rawData.meta.blockGasTarget);
    const blockLimitY = py(rawData.meta.blockGasLimit);

    svg.appendChild(mkEl('line', {
      x1: ml, y1: blockLimitY, x2: ml + cw, y2: blockLimitY,
      stroke: '#f85149', 'stroke-width': '1', 'stroke-dasharray': '5 3', opacity: '0.45',
    }));
    const limLabel = mkEl('text', {
      x: ml + cw + 4, y: blockLimitY + 3.5,
      fill: '#f85149', 'font-size': '8', 'font-family': 'monospace', opacity: '0.65',
    });
    limLabel.textContent = '60M limit';
    svg.appendChild(limLabel);

    svg.appendChild(mkEl('line', {
      x1: ml, y1: blockTargetY, x2: ml + cw, y2: blockTargetY,
      stroke: '#d29922', 'stroke-width': '1', 'stroke-dasharray': '5 3', opacity: '0.55',
    }));
    const tgtLabel = mkEl('text', {
      x: ml + cw + 4, y: blockTargetY + 3.5,
      fill: '#d29922', 'font-size': '8', 'font-family': 'monospace', opacity: '0.75',
    });
    tgtLabel.textContent = '30M target';
    svg.appendChild(tgtLabel);

    // Strategy curves (integer N 1–1000)
    for (const s of rawData.strategies) {
      const isActive = activeId === null || s.id === activeId;
      const opacity = isActive ? '1' : '0.15';
      const strokeW = s.id === activeId ? '2.5' : '1.8';

      const pts: string[] = [];
      for (let n = 1; n <= 1000; n++) {
        pts.push(`${px(n).toFixed(1)},${py(computeGas(s, n)).toFixed(1)}`);
      }

      const polyline = document.createElementNS(NS, 'polyline');
      polyline.setAttribute('points', pts.join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', s.color);
      polyline.setAttribute('stroke-width', strokeW);
      polyline.setAttribute('stroke-linejoin', 'round');
      polyline.setAttribute('opacity', opacity);
      svg.appendChild(polyline);

      // End label at right edge
      const endGas = computeGas(s, 1000);
      const endY = py(endGas);
      const endLabel = mkEl('text', {
        x: ml + cw + 4, y: endY + 3.5,
        fill: s.color, 'font-size': '8', 'font-family': 'monospace',
        opacity: isActive ? '1' : '0.15',
      });
      endLabel.textContent = s.label;
      svg.appendChild(endLabel);
    }

    // Vertical crosshair at currentN
    const crossX = px(Math.max(1, currentN));
    svg.appendChild(mkEl('line', {
      x1: crossX, y1: mt, x2: crossX, y2: mt + ch,
      stroke: '#ffffff', 'stroke-width': '1', 'stroke-dasharray': '3 3', opacity: '0.25',
    }));

    // Crosshair dots + value callouts
    const seenY: number[] = [];
    for (const s of rawData.strategies) {
      const isActive = activeId === null || s.id === activeId;
      const gas = computeGas(s, Math.max(1, currentN));
      let dotY = py(gas);

      // Nudge overlapping dots
      const tooClose = seenY.some((y) => Math.abs(y - dotY) < 6);
      if (tooClose) dotY -= 7;
      seenY.push(dotY);

      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', String(crossX));
      circle.setAttribute('cy', String(dotY));
      circle.setAttribute('r', '3.5');
      circle.setAttribute('fill', s.color);
      circle.setAttribute('opacity', isActive ? '1' : '0.15');
      svg.appendChild(circle);
    }
  }

  updatePanel();

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
