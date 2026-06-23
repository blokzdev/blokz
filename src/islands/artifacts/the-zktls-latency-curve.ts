/**
 * Artifact: the-zktls-latency-curve — The zkTLS Latency Curve
 * Manifest: content/artifacts/the-zktls-latency-curve/manifest.json
 *
 * Shows MPC-TLS vs. Proxy-mode time-to-prove across upload bandwidth (log scale).
 * Data anchored to TLSNotary May 2026 benchmark blog post.
 * Interactive: drag/tap the chart to move the crosshair and read values.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-zktls-latency-curve/data.json';

// Axis ranges (log scale)
const BW_LO = 1, BW_HI = 1000;   // Mbps
const T_LO = 0.7, T_HI = 310;     // seconds

// Benchmark-anchored models
// MPC:   30 MB garbled circuits (240 Mb) + fixed 1.56 s floor
// Proxy: lighter pre-session traffic (~15 Mb) + fixed 1.0 s floor
function mpcTime(bw: number): number { return 240 / bw + 1.56; }
function proxyTime(bw: number): number { return 15 / bw + 1.0; }

function logMap(v: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

function fmtBw(mbps: number): string {
  if (mbps >= 950) return '1 Gbps';
  if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
  if (mbps >= 10) return `${Math.round(mbps)} Mbps`;
  return `${mbps.toFixed(0)} Mbps`;
}

function fmtTime(s: number): string {
  if (s >= 120) return `${(s / 60).toFixed(1)} min`;
  if (s >= 10) return `${Math.round(s)} s`;
  return `${s.toFixed(1)} s`;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
    stageFr: '1.5fr',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .zc-svg { width: 100%; height: 100%; display: block; cursor: ew-resize; }
    .zc-panel {
      display: flex; flex-direction: column; gap: 10px; padding: 4px 0;
      font-size: 12px; color: #c9d1d9;
    }
    .zc-section-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6e7681;
    }
    .zc-metric { display: flex; flex-direction: column; gap: 2px; }
    .zc-metric-lbl { font-size: 10px; color: #8b949e; }
    .zc-metric-val { font-size: 15px; font-weight: 600; }
    .zc-mpc   { color: #f0883e; }
    .zc-proxy { color: #22d3ee; }
    .zc-speedup { font-size: 12px; color: #e6edf3; margin-top: 2px; }
    .zc-speedup strong { color: #3fb950; }
    .zc-divider { border: none; border-top: 1px solid #21262d; margin: 2px 0; }
    .zc-legend { display: flex; flex-direction: column; gap: 5px; }
    .zc-leg-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .zc-leg-swatch { width: 16px; height: 2.5px; border-radius: 2px; flex-shrink: 0; }
    .zc-note { font-size: 10px; color: #6e7681; line-height: 1.5; margin-top: auto; padding-top: 8px; border-top: 1px solid #21262d; }
    .zc-caption { font-size: 10px; color: #6e7681; }
    .zc-caption a { color: #58a6ff; text-decoration: none; }
    .zc-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // ── SVG ───────────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'zc-svg');
  svg.setAttribute('aria-label', 'zkTLS latency comparison: MPC-TLS vs Proxy mode across upload bandwidth');
  svg.style.touchAction = 'pan-y';
  stage.appendChild(svg);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'zc-panel';
  panel.appendChild(panelDiv);

  panelDiv.innerHTML = `
    <div class="zc-section-label">At this bandwidth</div>
    <div class="zc-metric">
      <div class="zc-metric-lbl">Upload bandwidth</div>
      <div class="zc-metric-val" id="zc-bw-val">25 Mbps</div>
    </div>
    <div class="zc-metric">
      <div class="zc-metric-lbl">MPC-TLS time</div>
      <div class="zc-metric-val zc-mpc" id="zc-mpc-val">—</div>
    </div>
    <div class="zc-metric">
      <div class="zc-metric-lbl">Proxy mode time</div>
      <div class="zc-metric-val zc-proxy" id="zc-proxy-val">—</div>
    </div>
    <div class="zc-speedup" id="zc-speedup">Proxy is <strong>—×</strong> faster</div>
    <hr class="zc-divider">
    <div class="zc-legend">
      <div class="zc-leg-row">
        <div class="zc-leg-swatch" style="background:#f0883e"></div>MPC-TLS
      </div>
      <div class="zc-leg-row">
        <div class="zc-leg-swatch" style="background:#22d3ee"></div>Proxy mode (Apr 2026)
      </div>
    </div>
    <div class="zc-note">MPC-TLS requires uploading ~${rawData.mpcCircuitMB} MB of garbled-circuit material before the handshake. Proxy mode eliminates that upload by shifting trust to a network-proxy notary.</div>
  `;

  const bwEl = panelDiv.querySelector('#zc-bw-val') as HTMLElement;
  const mpcEl = panelDiv.querySelector('#zc-mpc-val') as HTMLElement;
  const proxyEl = panelDiv.querySelector('#zc-proxy-val') as HTMLElement;
  const speedupEl = panelDiv.querySelector('#zc-speedup') as HTMLElement;

  // ── Caption ───────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'zc-caption';
  capDiv.innerHTML = `Source: <a href="${rawData.dataSource.url}" target="_blank" rel="noopener">${rawData.dataSource.label}</a> · data as of ${rawData.dataAsOf}`;
  caption.appendChild(capDiv);

  // ── State ─────────────────────────────────────────────────────────────────
  let currentBw = 25;
  let bounds = { ml: 0, mt: 0, cw: 0, ch: 0 };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function bwToX(bw: number): number {
    return bounds.ml + logMap(bw, BW_LO, BW_HI, 0, bounds.cw);
  }
  function xToBw(x: number): number {
    const t = (x - bounds.ml) / bounds.cw;
    return Math.exp(Math.log(BW_LO) + t * (Math.log(BW_HI) - Math.log(BW_LO)));
  }
  function timeToY(sec: number): number {
    return bounds.mt + bounds.ch - logMap(sec, T_LO, T_HI, 0, bounds.ch);
  }

  function mkEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }
  function mkText(text: string, attrs: Record<string, string | number>): SVGTextElement {
    const el = mkEl('text', attrs) as SVGTextElement;
    el.textContent = text;
    return el;
  }

  function updatePanel(bw: number): void {
    const mpc = mpcTime(bw);
    const proxy = proxyTime(bw);
    const speedup = mpc / proxy;
    bwEl.textContent = fmtBw(bw);
    mpcEl.textContent = fmtTime(mpc);
    proxyEl.textContent = fmtTime(proxy);
    speedupEl.innerHTML = `Proxy is <strong>${speedup.toFixed(1)}×</strong> faster`;
  }

  // Moving elements (mutated on drag, not redrawn)
  let crosshairLine: SVGLineElement | null = null;
  let dotMpc: SVGCircleElement | null = null;
  let dotProxy: SVGCircleElement | null = null;
  let bwLabel: SVGTextElement | null = null;

  function moveCrosshair(bw: number): void {
    if (!crosshairLine || !dotMpc || !dotProxy || !bwLabel) return;
    const x = bwToX(bw);
    const yMpc = timeToY(mpcTime(bw));
    const yProxy = timeToY(proxyTime(bw));
    crosshairLine.setAttribute('x1', String(x));
    crosshairLine.setAttribute('x2', String(x));
    dotMpc.setAttribute('cx', String(x));
    dotMpc.setAttribute('cy', String(yMpc));
    dotProxy.setAttribute('cx', String(x));
    dotProxy.setAttribute('cy', String(yProxy));
    const labelX = Math.min(x + 5, bounds.ml + bounds.cw - 32);
    bwLabel.setAttribute('x', String(labelX));
    bwLabel.textContent = fmtBw(bw);
  }

  function buildCurvePath(fn: (bw: number) => number): string {
    let d = '';
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const bw = Math.exp(Math.log(BW_LO) + t * (Math.log(BW_HI) - Math.log(BW_LO)));
      const sec = Math.min(fn(bw), T_HI * 1.05);
      const x = bwToX(bw);
      const y = timeToY(sec);
      d += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
    }
    return d.trim();
  }

  // ── Draw (full redraw on resize) ──────────────────────────────────────────
  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    crosshairLine = null; dotMpc = null; dotProxy = null; bwLabel = null;

    const W = svg.clientWidth || 400;
    const H = svg.clientHeight || 300;
    const compact = W < 320;
    const ml = compact ? 36 : 48;
    const mr = 12;
    const mt = 16;
    const mb = compact ? 34 : 40;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;
    bounds = { ml, mt, cw, ch };

    // ── Y grid & ticks ────────────────────────────────────────────────────
    const yTicks = [1, 2, 5, 10, 30, 60, 120, 300];
    for (const t of yTicks) {
      const y = timeToY(t);
      svg.appendChild(mkEl('line', { x1: ml, y1: y, x2: ml + cw, y2: y, stroke: '#21262d', 'stroke-width': '1' }));
      svg.appendChild(mkText(fmtTime(t), {
        x: ml - 4, y: y + 3.5, fill: '#6e7681', 'font-size': compact ? '8' : '9',
        'font-family': 'monospace', 'text-anchor': 'end',
      }));
    }

    // ── X grid & ticks ────────────────────────────────────────────────────
    const xTicks = compact
      ? [1, 10, 100, 1000]
      : [1, 5, 25, 100, 500, 1000];
    for (const bw of xTicks) {
      const x = bwToX(bw);
      svg.appendChild(mkEl('line', { x1: x, y1: mt, x2: x, y2: mt + ch, stroke: '#21262d', 'stroke-width': '1' }));
      const bwStr = bw >= 1000 ? '1G' : bw >= 1 ? `${bw}M` : `${bw}`;
      svg.appendChild(mkText(bwStr, {
        x, y: mt + ch + (compact ? 11 : 13), fill: '#6e7681',
        'font-size': compact ? '8' : '9', 'font-family': 'monospace', 'text-anchor': 'middle',
      }));
    }

    // ── Axes ──────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('line', { x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));
    svg.appendChild(mkEl('line', { x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1' }));

    // ── Axis labels ───────────────────────────────────────────────────────
    svg.appendChild(mkText('Upload bandwidth (Mbps) →', {
      x: ml + cw / 2, y: H - (compact ? 2 : 4),
      fill: '#8b949e', 'font-size': compact ? '8' : '10',
      'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
    }));

    if (!compact) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `rotate(-90,${ml - 36},${mt + ch / 2})`);
      g.appendChild(mkText('← Time to prove', {
        x: ml - 36, y: mt + ch / 2,
        fill: '#8b949e', 'font-size': '10',
        'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
      }));
      svg.appendChild(g);
    }

    // ── 5 Mbps reference annotation ───────────────────────────────────────
    if (!compact) {
      const x5 = bwToX(5);
      const yM5 = timeToY(mpcTime(5));
      const yP5 = timeToY(proxyTime(5));

      // Vertical brace line
      svg.appendChild(mkEl('line', {
        x1: x5 - 10, y1: yM5, x2: x5 - 10, y2: yP5,
        stroke: '#4b5563', 'stroke-width': '1',
      }));
      // Tick marks
      svg.appendChild(mkEl('line', { x1: x5 - 13, y1: yM5, x2: x5 - 7, y2: yM5, stroke: '#4b5563', 'stroke-width': '1' }));
      svg.appendChild(mkEl('line', { x1: x5 - 13, y1: yP5, x2: x5 - 7, y2: yP5, stroke: '#4b5563', 'stroke-width': '1' }));

      svg.appendChild(mkText('12.5×', {
        x: x5 - 14, y: (yM5 + yP5) / 2 + 3.5,
        fill: '#4b5563', 'font-size': '9', 'font-family': 'monospace', 'text-anchor': 'end',
      }));
    }

    // ── Curves ────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('path', {
      d: buildCurvePath(mpcTime),
      fill: 'none', stroke: '#f0883e', 'stroke-width': '2.5',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    svg.appendChild(mkEl('path', {
      d: buildCurvePath(proxyTime),
      fill: 'none', stroke: '#22d3ee', 'stroke-width': '2.5',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));

    // ── Curve labels ──────────────────────────────────────────────────────
    if (W > 280) {
      const labelBw = 120;
      svg.appendChild(mkText('MPC-TLS', {
        x: bwToX(labelBw) + 4, y: timeToY(mpcTime(labelBw)) - 5,
        fill: '#f0883e', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
      }));
      svg.appendChild(mkText('Proxy mode', {
        x: bwToX(labelBw) + 4, y: timeToY(proxyTime(labelBw)) - 5,
        fill: '#22d3ee', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
      }));
    }

    // ── Crosshair (on top) ────────────────────────────────────────────────
    const cx = bwToX(currentBw);
    const cyM = timeToY(mpcTime(currentBw));
    const cyP = timeToY(proxyTime(currentBw));

    const cline = document.createElementNS(NS, 'line') as SVGLineElement;
    cline.setAttribute('x1', String(cx));
    cline.setAttribute('y1', String(mt));
    cline.setAttribute('x2', String(cx));
    cline.setAttribute('y2', String(mt + ch));
    cline.setAttribute('stroke', '#6e7681');
    cline.setAttribute('stroke-width', '1');
    cline.setAttribute('stroke-dasharray', '4 3');
    cline.setAttribute('pointer-events', 'none');
    svg.appendChild(cline);
    crosshairLine = cline;

    const dm = document.createElementNS(NS, 'circle') as SVGCircleElement;
    dm.setAttribute('cx', String(cx)); dm.setAttribute('cy', String(cyM));
    dm.setAttribute('r', '5'); dm.setAttribute('fill', '#f0883e');
    dm.setAttribute('stroke', '#0d1117'); dm.setAttribute('stroke-width', '1.5');
    dm.setAttribute('pointer-events', 'none');
    svg.appendChild(dm);
    dotMpc = dm;

    const dp = document.createElementNS(NS, 'circle') as SVGCircleElement;
    dp.setAttribute('cx', String(cx)); dp.setAttribute('cy', String(cyP));
    dp.setAttribute('r', '5'); dp.setAttribute('fill', '#22d3ee');
    dp.setAttribute('stroke', '#0d1117'); dp.setAttribute('stroke-width', '1.5');
    dp.setAttribute('pointer-events', 'none');
    svg.appendChild(dp);
    dotProxy = dp;

    const bl = document.createElementNS(NS, 'text') as SVGTextElement;
    bl.setAttribute('x', String(Math.min(cx + 5, ml + cw - 32)));
    bl.setAttribute('y', String(mt - 4));
    bl.setAttribute('fill', '#8b949e'); bl.setAttribute('font-size', '9');
    bl.setAttribute('font-family', 'monospace');
    bl.setAttribute('pointer-events', 'none');
    bl.textContent = fmtBw(currentBw);
    svg.appendChild(bl);
    bwLabel = bl;

    // ── Drag capture zone ─────────────────────────────────────────────────
    const zone = mkEl('rect', {
      x: ml, y: mt, width: cw, height: ch,
      fill: 'transparent',
    });
    svg.appendChild(zone);

    updatePanel(currentBw);
  }

  // ── Pointer interaction ───────────────────────────────────────────────────
  function clampBw(x: number): number {
    const clamped = Math.max(bounds.ml, Math.min(bounds.ml + bounds.cw, x));
    const bw = xToBw(clamped);
    return Math.max(BW_LO, Math.min(BW_HI, bw));
  }

  let dragging = false;

  function onPointerDown(e: PointerEvent): void {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    const rect = svg.getBoundingClientRect();
    currentBw = clampBw(e.clientX - rect.left);
    moveCrosshair(currentBw);
    updatePanel(currentBw);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    currentBw = clampBw(e.clientX - rect.left);
    moveCrosshair(currentBw);
    updatePanel(currentBw);
  }
  function onPointerUp(e: PointerEvent): void {
    dragging = false;
    svg.releasePointerCapture(e.pointerId);
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);

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
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('pointercancel', onPointerUp);
    layout.dispose();
    style.remove();
  };
}
