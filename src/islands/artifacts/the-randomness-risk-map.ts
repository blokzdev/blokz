/**
 * Artifact: the-randomness-risk-map — The Randomness Risk Map
 * Manifest: content/artifacts/the-randomness-risk-map/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-randomness-risk-map/data.json';

// Log-scale helper
function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

function fmtEth(v: number): string {
  if (v >= 10000) return `≥ ${(v / 1000).toFixed(0)}k ETH`;
  if (v >= 1) return `${v.toFixed(2)} ETH`;
  if (v >= 0.001) return `${v.toFixed(4)} ETH`;
  return `${v.toExponential(1)} ETH`;
}

function fmtLatency(s: number): string {
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s >= 60) return `${(s / 60).toFixed(0)}m`;
  return `${s}s`;
}

function fmtYTick(v: number): string {
  if (v >= 1000) return `${v / 1000}k`;
  if (v >= 1) return `${v}`;
  if (v >= 0.001) return v.toPrecision(1);
  return v.toExponential(0);
}

// X axis: latency in seconds (log)
const X_LO = 0.04, X_HI = 80;
// Y axis: manipulation cost in ETH (log)
const Y_LO = 0.000005, Y_HI = 50000;

const TIER_LABEL: Record<string, string> = {
  adversarial: 'ADVERSARIAL',
  weak: 'WEAK',
  constrained: 'CONSTRAINED',
  cryptographic: 'CRYPTOGRAPHIC',
};

const TIER_BG: Record<string, string> = {
  adversarial: '#3d1214',
  weak: '#3d2414',
  constrained: '#3d3214',
  cryptographic: '#0d2618',
};

// Per-source label offsets: [dx, dy, textAnchor] relative to dot center
// Prevents label collisions between nearby dots (Drand & VRF are close on X)
const LABEL_POS: Record<string, [number, number, string]> = {
  drand: [0, -1, 'middle'],  // label sits above dot
};

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
  });
  const { stage, panel, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rrm-svg { width: 100%; height: 100%; display: block; }
    .rrm-panel {
      font-size: 12px; color: #c9d1d9;
      display: flex; flex-direction: column; gap: 10px; padding: 4px 0;
    }
    .rrm-empty { color: #8b949e; font-size: 11px; line-height: 1.5; padding: 6px 0; }
    .rrm-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
    .rrm-tier-badge {
      display: inline-block; font-size: 10px; font-weight: 600;
      letter-spacing: .05em; text-transform: uppercase;
      border-radius: 4px; padding: 2px 7px;
    }
    .rrm-stats {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px;
    }
    .rrm-stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: .04em; }
    .rrm-stat-val { font-size: 13px; color: #e6edf3; font-weight: 500; }
    .rrm-mech { font-size: 11px; color: #8b949e; line-height: 1.55; }
    .rrm-note { font-size: 11px; color: #8b949e; line-height: 1.55; border-top: 1px solid #21262d; padding-top: 8px; }
    .rrm-use { font-size: 11px; color: #79c0ff; line-height: 1.5; }
    .rrm-legend {
      display: flex; flex-direction: column; gap: 5px;
      margin-top: auto; padding-top: 10px; border-top: 1px solid #21262d;
    }
    .rrm-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .rrm-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .rrm-caption {
      font-size: 10px; color: #6e7681; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .rrm-caption a { color: #58a6ff; text-decoration: none; }
    .rrm-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rrm-svg');
  svg.setAttribute('aria-label', 'Randomness source security vs latency scatter chart');
  stage.appendChild(svg);

  // ── Panel ──────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'rrm-panel';
  panel.appendChild(panelDiv);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'rrm-empty';
  emptyMsg.textContent = 'Click a dot to inspect a randomness source.';
  panelDiv.appendChild(emptyMsg);

  const legendDiv = document.createElement('div');
  legendDiv.className = 'rrm-legend';
  legendDiv.innerHTML = `
    <div class="rrm-legend-row"><div class="rrm-legend-dot" style="background:#f85149"></div><span>Adversarial (proposer-controlled)</span></div>
    <div class="rrm-legend-row"><div class="rrm-legend-dot" style="background:#f0883e"></div><span>Weak (biasable at low cost)</span></div>
    <div class="rrm-legend-row"><div class="rrm-legend-dot" style="background:#d29922"></div><span>Constrained (last-revealer trap)</span></div>
    <div class="rrm-legend-row"><div class="rrm-legend-dot" style="background:#3fb950"></div><span>Cryptographic VRF (Chainlink)</span></div>
    <div class="rrm-legend-row"><div class="rrm-legend-dot" style="background:#22d3ee"></div><span>Cryptographic beacon (Drand)</span></div>
  `;
  panelDiv.appendChild(legendDiv);

  // ── Caption ────────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'rrm-caption';
  const snap = rawData.snapshot;
  capDiv.innerHTML = `
    Source: <a href="https://eth.blockscout.com/address/${snap.vrfCoordinator}" target="_blank" rel="noopener">VRF Coordinator V2</a>
    · block ${snap.blockNumber.toLocaleString()} · ETH $${snap.ethUsd.toLocaleString()} · ${snap.blockTimestamp.slice(0, 10)}
  `;
  caption.appendChild(capDiv);

  // ── Draw ───────────────────────────────────────────────────────────────────
  let selectedId: string | null = null;
  const dotEls: Map<string, SVGCircleElement> = new Map();

  function clearSVG(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    dotEls.clear();
  }

  function draw(): void {
    clearSVG();
    const W = svg.clientWidth || 400;
    const H = svg.clientHeight || 225;

    const ml = 52, mr = 16, mt = 22, mb = 42;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    const mkEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    const px = (t: number): number => ml + logMap(Math.max(t, X_LO), X_LO, X_HI, 0, cw);
    const py = (c: number): number => mt + ch - logMap(Math.max(c, Y_LO), Y_LO, Y_HI, 0, ch);

    // ── Cryptographic zone band (top region) ────────────────────────────────
    const zoneY = py(1000);
    svg.appendChild(mkEl('rect', {
      x: ml, y: mt, width: cw, height: Math.max(0, zoneY - mt),
      fill: '#0d2618', opacity: '0.4',
    }));
    if (W > 320) {
      const zl = mkEl('text', {
        x: ml + 6, y: mt + 13,
        fill: '#3fb950', 'font-size': '9', 'font-family': 'monospace', opacity: '0.7',
      });
      zl.textContent = 'cryptographic zone (> 1k ETH to bias)';
      svg.appendChild(zl);
    }

    // ── Grid lines ─────────────────────────────────────────────────────────
    const yTicks = [0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000];
    for (const c of yTicks) {
      const y = py(c);
      if (y < mt - 2 || y > mt + ch + 2) continue;
      svg.appendChild(mkEl('line', {
        x1: ml, y1: y, x2: ml + cw, y2: y,
        stroke: '#21262d', 'stroke-width': '1',
      }));
      const tl = mkEl('text', {
        x: ml - 4, y: y + 3.5,
        fill: '#6e7681', 'font-size': '8.5', 'font-family': 'monospace', 'text-anchor': 'end',
      });
      tl.textContent = fmtYTick(c);
      svg.appendChild(tl);
    }

    const xTicks = [0.1, 1, 5, 12, 24, 48];
    for (const t of xTicks) {
      const x = px(t);
      if (x < ml - 2 || x > ml + cw + 2) continue;
      svg.appendChild(mkEl('line', {
        x1: x, y1: mt, x2: x, y2: mt + ch,
        stroke: '#21262d', 'stroke-width': '1',
      }));
      const tl = mkEl('text', {
        x: x, y: mt + ch + 13,
        fill: '#6e7681', 'font-size': '8.5', 'font-family': 'monospace', 'text-anchor': 'middle',
      });
      tl.textContent = t < 1 ? `${(t * 1000).toFixed(0)}ms` : t >= 60 ? `${t / 60}m` : `${t}s`;
      svg.appendChild(tl);
    }

    // ── Axes ────────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));

    const xLabel = mkEl('text', {
      x: ml + cw / 2, y: H - 4,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle',
    });
    xLabel.textContent = 'Latency →';
    svg.appendChild(xLabel);

    const yLabelG = document.createElementNS(NS, 'g');
    yLabelG.setAttribute('transform', `rotate(-90,${ml - 40},${mt + ch / 2})`);
    const yLabel = mkEl('text', {
      x: ml - 40, y: mt + ch / 2,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle',
    });
    yLabel.textContent = '↑ Attack cost (ETH)';
    yLabelG.appendChild(yLabel);
    svg.appendChild(yLabelG);

    // ── Data points ─────────────────────────────────────────────────────────
    for (const src of rawData.sources) {
      const cx = px(src.latencyS);
      const cy = py(src.manipCostEth);
      const r = 7;
      const isSelected = src.id === selectedId;

      const circle = document.createElementNS(NS, 'circle') as SVGCircleElement;
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(isSelected ? r + 3 : r));
      circle.setAttribute('fill', src.color);
      circle.setAttribute('stroke', isSelected ? '#fff' : 'transparent');
      circle.setAttribute('stroke-width', isSelected ? '2.5' : '0');
      circle.setAttribute('opacity', isSelected ? '1' : '0.85');
      circle.setAttribute('cursor', 'pointer');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `${src.label}: ${fmtLatency(src.latencyS)} latency, ${fmtEth(src.manipCostEth)} attack cost`);

      circle.addEventListener('click', () => selectSource(src.id));
      circle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSource(src.id); }
      });

      svg.appendChild(circle);
      dotEls.set(src.id, circle);

      if (W > 280) {
        const [dx, dy, anchor] = LABEL_POS[src.id] ?? [r + 5, 4, 'start'];
        const effectiveDy = src.id === 'drand' ? -(r + 8) : dy;
        const lbl = mkEl('text', {
          x: cx + dx,
          y: cy + effectiveDy,
          fill: src.color,
          'font-size': '9',
          'font-family': 'monospace',
          'text-anchor': anchor,
          'pointer-events': 'none',
        });
        lbl.textContent = src.shortLabel;
        svg.appendChild(lbl);
      }
    }
  }

  function selectSource(id: string): void {
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

    const src = rawData.sources.find((s) => s.id === selectedId);
    if (!src) { panelDiv.insertBefore(emptyMsg, legendDiv); return; }

    const nameEl = document.createElement('div');
    nameEl.className = 'rrm-name';
    nameEl.textContent = src.label;
    panelDiv.insertBefore(nameEl, legendDiv);

    const tierEl = document.createElement('span');
    tierEl.className = 'rrm-tier-badge';
    tierEl.style.background = TIER_BG[src.tier] ?? '#1a1a1a';
    tierEl.style.color = src.color;
    tierEl.textContent = TIER_LABEL[src.tier] ?? src.tier.toUpperCase();
    panelDiv.insertBefore(tierEl, legendDiv);

    const statsEl = document.createElement('div');
    statsEl.className = 'rrm-stats';
    const gasUsdStr = src.gasUsd > 0 ? `$${src.gasUsd.toFixed(2)}` : 'none';
    const stats: [string, string][] = [
      ['Latency', fmtLatency(src.latencyS)],
      ['Attack cost', fmtEth(src.manipCostEth)],
      ['Gas cost', gasUsdStr],
    ];
    for (const [label, val] of stats) {
      const lDiv = document.createElement('div');
      lDiv.innerHTML = `<div class="rrm-stat-label">${label}</div><div class="rrm-stat-val">${val}</div>`;
      statsEl.appendChild(lDiv);
    }
    panelDiv.insertBefore(statsEl, legendDiv);

    const mechEl = document.createElement('div');
    mechEl.className = 'rrm-mech';
    mechEl.textContent = src.mechanism;
    panelDiv.insertBefore(mechEl, legendDiv);

    const noteEl = document.createElement('div');
    noteEl.className = 'rrm-note';
    noteEl.textContent = src.note;
    panelDiv.insertBefore(noteEl, legendDiv);

    const useEl = document.createElement('div');
    useEl.className = 'rrm-use';
    useEl.textContent = `✓ ${src.useCase}`;
    panelDiv.insertBefore(useEl, legendDiv);
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
