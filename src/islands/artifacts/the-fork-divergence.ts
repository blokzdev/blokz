/**
 * Artifact: the-fork-divergence — The Fork Divergence
 * Manifest: content/artifacts/the-fork-divergence/manifest.json
 *
 * Horizontal bar chart: five Foundry fork divergences ordered by blocks until
 * first silent failure (log scale). Click a bar to inspect fork behavior vs.
 * mainnet reality in the detail panel.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-fork-divergence/data.json';

type Divergence = (typeof rawData.divergences)[number];

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#f85149',
  high:     '#f0883e',
  medium:   '#d29922',
};

const SEVERITY_BG: Record<string, string> = {
  critical: '#3d1515',
  high:     '#3b2412',
  medium:   '#2a1e14',
};

function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  const clamped = Math.max(lo, Math.min(hi, val));
  return outLo + ((Math.log(clamped) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '3/2',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .fd-svg { width: 100%; height: 100%; display: block; }
    .fd-panel {
      font-size: 12px; color: #c9d1d9;
      display: flex; flex-direction: column; gap: 8px;
      padding: 4px 0; min-width: 0;
    }
    .fd-empty { color: #8b949e; font-size: 11px; line-height: 1.6; padding: 4px 0; }
    .fd-name  { font-size: 13px; font-weight: 600; color: #f0f6fc; overflow-wrap: anywhere; }
    .fd-badge {
      font-size: 10px; font-weight: 600; letter-spacing: .05em;
      text-transform: uppercase; border-radius: 4px;
      padding: 2px 7px; white-space: nowrap; display: inline-block;
    }
    .fd-section { display: flex; flex-direction: column; gap: 3px; }
    .fd-section-label {
      font-size: 10px; color: #8b949e;
      text-transform: uppercase; letter-spacing: .04em;
    }
    .fd-section-val {
      font-size: 11px; color: #e6edf3; line-height: 1.55;
      overflow-wrap: anywhere;
    }
    .fd-divider { border: none; border-top: 1px solid #21262d; margin: 2px 0; }
    .fd-legend {
      display: flex; flex-direction: column; gap: 5px;
      margin-top: auto; padding-top: 8px; border-top: 1px solid #21262d;
    }
    .fd-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .fd-legend-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
    .fd-caption {
      font-size: 10px; color: #6e7681;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .fd-caption a { color: #58a6ff; text-decoration: none; }
    .fd-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // ── SVG canvas ────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fd-svg');
  svg.setAttribute('aria-label', 'Horizontal bar chart: Foundry fork divergences by blocks until silent failure');
  stage.appendChild(svg);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'fd-panel';
  panel.appendChild(panelDiv);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'fd-empty';
  emptyMsg.textContent = 'Click a bar to see what the fork shows vs. what mainnet does.';
  panelDiv.appendChild(emptyMsg);

  const legendDiv = document.createElement('div');
  legendDiv.className = 'fd-legend';
  legendDiv.innerHTML = `
    <div class="fd-legend-row">
      <div class="fd-legend-dot" style="background:#f85149"></div>
      <span>Critical — fails at block 1</span>
    </div>
    <div class="fd-legend-row">
      <div class="fd-legend-dot" style="background:#f0883e"></div>
      <span>High — fails within minutes</span>
    </div>
    <div class="fd-legend-row">
      <div class="fd-legend-dot" style="background:#d29922"></div>
      <span>Medium — fails within hours</span>
    </div>
  `;
  panelDiv.appendChild(legendDiv);

  // ── Caption ───────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'fd-caption';
  capDiv.innerHTML = `
    Sources:
    <a href="https://eth.blockscout.com" target="_blank" rel="noopener">Blockscout</a> ·
    <a href="https://data.chain.link/feeds/ethereum/mainnet/eth-usd" target="_blank" rel="noopener">Chainlink ETH/USD</a> ·
    <a href="https://arxiv.org/pdf/2405.17944" target="_blank" rel="noopener">EigenPhi 2025</a>
  `;
  caption.appendChild(capDiv);

  // ── Chart state ───────────────────────────────────────────────────────────
  let selectedId: string | null = null;
  const barEls: Map<string, SVGRectElement> = new Map();

  function clearSVG(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    barEls.clear();
  }

  function draw(): void {
    clearSVG();
    const W = svg.clientWidth  || 400;
    const H = svg.clientHeight || 300;

    const ml = 82, mr = 52, mt = 18, mb = 38;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    const mkEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    const X_LO = 1, X_HI = 1000;
    const bx = (blocks: number): number => logMap(blocks, X_LO, X_HI, 0, cw);

    const n = rawData.divergences.length;
    const rowH = ch / n;
    const barThick = Math.min(rowH * 0.52, 26);

    // ── Grid lines ────────────────────────────────────────────────────────
    const xTicks: [number, string][] = [[1, '1'], [10, '10'], [100, '100'], [1000, '1k']];
    for (const [val, label] of xTicks) {
      const x = ml + bx(val);
      svg.appendChild(mkEl('line', {
        x1: x, y1: mt, x2: x, y2: mt + ch,
        stroke: '#21262d', 'stroke-width': '1',
      }));
      if (W > 260) {
        const tl = mkEl('text', {
          x, y: mt + ch + 13,
          fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace',
          'text-anchor': 'middle',
        });
        tl.textContent = label;
        svg.appendChild(tl);
      }
    }

    // ── Axes ──────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));

    const xLabel = mkEl('text', {
      x: ml + cw / 2, y: H - 4,
      fill: '#8b949e', 'font-size': '9', 'font-family': 'system-ui, sans-serif',
      'text-anchor': 'middle',
    });
    xLabel.textContent = 'blocks until first silent failure →';
    svg.appendChild(xLabel);

    // ── Bars ──────────────────────────────────────────────────────────────
    rawData.divergences.forEach((d: Divergence, i: number) => {
      const cy = mt + i * rowH + rowH / 2;
      const barY = cy - barThick / 2;
      const rawBarW = bx(d.blocksToFirstError);
      const barW = Math.max(rawBarW, 8);
      const isSelected = d.id === selectedId;
      const color = SEVERITY_COLOR[d.severity] ?? '#8b949e';

      // Track
      svg.appendChild(mkEl('rect', {
        x: ml, y: barY, width: cw, height: barThick,
        fill: '#161b22', rx: '3',
      }));

      // Bar
      const rect = document.createElementNS(NS, 'rect') as SVGRectElement;
      rect.setAttribute('x', String(ml));
      rect.setAttribute('y', String(barY));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('height', String(barThick));
      rect.setAttribute('fill', color);
      rect.setAttribute('rx', '3');
      rect.setAttribute('opacity', isSelected ? '1' : '0.72');
      rect.setAttribute('cursor', 'pointer');
      rect.setAttribute('tabindex', '0');
      rect.setAttribute('role', 'button');
      rect.setAttribute('aria-label',
        `${d.label}: ${d.blocksToFirstError === 1 ? 'fails immediately' : `${d.blocksToFirstError} blocks to failure`}`);
      if (isSelected) {
        rect.setAttribute('stroke', '#ffffff');
        rect.setAttribute('stroke-width', '1.5');
      }
      rect.addEventListener('click', () => selectBar(d.id));
      rect.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBar(d.id); }
      });
      svg.appendChild(rect);
      barEls.set(d.id, rect);

      // Y label (left of axis)
      const lbl = mkEl('text', {
        x: ml - 5, y: cy + 3.5,
        fill: isSelected ? '#f0f6fc' : '#8b949e',
        'font-size': W > 320 ? '10' : '8', 'font-family': 'monospace',
        'text-anchor': 'end', 'pointer-events': 'none',
      });
      lbl.textContent = d.shortLabel;
      svg.appendChild(lbl);

      // Value label (right of bar)
      const valX = ml + barW + 5;
      if (valX + 24 < ml + cw + mr) {
        const valLbl = mkEl('text', {
          x: valX, y: cy + 3.5,
          fill: color, 'font-size': '9', 'font-family': 'monospace',
          'pointer-events': 'none',
        });
        valLbl.textContent = d.blocksToFirstError === 1 ? 'now' : String(d.blocksToFirstError);
        svg.appendChild(valLbl);
      }
    });
  }

  function selectBar(id: string): void {
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
    const d = rawData.divergences.find((x: Divergence) => x.id === selectedId);
    if (!d) { panelDiv.insertBefore(emptyMsg, legendDiv); return; }

    const color = SEVERITY_COLOR[d.severity] ?? '#8b949e';
    const bg    = SEVERITY_BG[d.severity]    ?? '#21262d';

    const nameEl = document.createElement('div');
    nameEl.className = 'fd-name';
    nameEl.textContent = d.label;
    panelDiv.insertBefore(nameEl, legendDiv);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'fd-badge';
    badgeEl.style.background = bg;
    badgeEl.style.color = color;
    badgeEl.textContent = d.severity.toUpperCase();
    panelDiv.insertBefore(badgeEl, legendDiv);

    const sections: [string, string][] = [
      ['Fork shows',      d.forkBehavior],
      ['Mainnet reality', d.mainnetReality],
      ['Failure mode',    d.failureMode],
      ['Fix',             d.fix],
    ];
    for (const [label, val] of sections) {
      const sec = document.createElement('div');
      sec.className = 'fd-section';
      const lbl = document.createElement('div');
      lbl.className = 'fd-section-label';
      lbl.textContent = label;
      const valEl = document.createElement('div');
      valEl.className = 'fd-section-val';
      valEl.textContent = val;
      sec.appendChild(lbl);
      sec.appendChild(valEl);
      panelDiv.insertBefore(sec, legendDiv);
    }

    const hr = document.createElement('hr');
    hr.className = 'fd-divider';
    panelDiv.insertBefore(hr, legendDiv);
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
