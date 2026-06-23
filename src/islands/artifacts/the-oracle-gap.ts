/**
 * Artifact: the-oracle-gap — The Oracle Gap
 * Manifest: content/artifacts/the-oracle-gap/manifest.json
 *
 * SVG chart comparing Chainlink (push) and Pyth (pull) ETH/USD oracle prices
 * against a live spot price. An interactive slider lets readers simulate what
 * price movement is needed to trigger a Chainlink on-chain update.
 */
import data from '../../../content/artifacts/the-oracle-gap/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}
function attr(e: Element, a: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '5/3',
    stageFr: '1.6fr',
  });
  const { stage, panel, controls, caption } = layout;

  // ── Data constants ────────────────────────────────────────────────────────
  const CL        = data.chainlink.price;                    // 1725.81
  const PYTH      = data.pyth.price;                         // 1731.47
  const PYTH_LO   = data.pyth.bandLow;                       // 1730.57
  const PYTH_HI   = data.pyth.bandHigh;                      // 1732.37
  const DEV_PCT   = data.chainlink.deviationThresholdPct;    // 0.5
  const TRIG_HI   = data.chainlink.triggerUpperBound;        // 1734.44
  const TRIG_LO   = data.chainlink.triggerLowerBound;        // 1717.18
  const AGE_MIN   = Math.round(data.chainlink.ageSecs / 60); // 28
  const HB_MIN    = data.chainlink.heartbeatSecs / 60;       // 60
  const P_MIN     = data.priceRangeForChart.min;             // 1718
  const P_MAX     = data.priceRangeForChart.max;             // 1742

  let spotPrice = data.spot.price; // mutable — driven by slider

  // ── Chart geometry ────────────────────────────────────────────────────────
  // viewBox 500 × 300 matches stageAspect 5/3 exactly — no letterboxing.
  const X0 = 62, X1 = 492, Y0 = 24, Y1 = 252;

  function py(p: number): number {
    return Y0 + (P_MAX - p) / (P_MAX - P_MIN) * (Y1 - Y0);
  }

  // ── SVG root ──────────────────────────────────────────────────────────────
  const svg = svgEl('svg');
  attr(svg, { viewBox: '0 0 500 300', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  stage.appendChild(svg);

  // ── Shared styles (visual only — no reflow) ───────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .og-pulse { animation: og-pulse 1.2s ease-in-out infinite; }
    @keyframes og-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    .og-card { border-radius:8px; padding:10px 12px; border:1px solid rgba(255,255,255,.09);
      background:rgba(255,255,255,.04); }
    .og-lbl { font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
      opacity:.55; margin-bottom:3px; }
    .og-val { font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.2; }
    .og-sub { font-size:11px; opacity:.5; margin-top:2px; overflow-wrap:anywhere; }
    .og-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:4px;
      font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; margin-top:5px;
      white-space:nowrap; }
    .og-badge.fire { background:rgba(239,68,68,.18); color:#f87171; border:1px solid rgba(239,68,68,.4); }
    .og-badge.calm { background:rgba(74,222,128,.1); color:#4ade80; border:1px solid rgba(74,222,128,.3); }
    .og-slider-row { display:flex; flex-direction:column; gap:6px; }
    .og-slider { width:100%; accent-color:#4ade80; cursor:pointer; }
    .og-hint { font-size:11px; opacity:.45; overflow-wrap:anywhere; }
    .og-cap-txt { font-size:11px; opacity:.38; overflow-wrap:anywhere; }
  `;
  container.appendChild(style);

  // ── Static SVG: grid lines + axis labels ─────────────────────────────────
  for (const p of [1720, 1725, 1730, 1735, 1740]) {
    const y = py(p);
    const g = svgEl('line');
    attr(g, { x1: X0, y1: y, x2: X1, y2: y, stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 });
    svg.appendChild(g);
    const t = svgEl('text');
    attr(t, { x: X0 - 5, y: y + 3.5, 'text-anchor': 'end', 'font-size': 9.5,
      fill: 'rgba(255,255,255,.35)', 'font-family': 'monospace' });
    t.textContent = `$${p}`;
    svg.appendChild(t);
  }

  // ── Chainlink deviation zone (shaded band between trigger bounds) ─────────
  const devTop = clamp(py(TRIG_HI), Y0, Y1);
  const devBot = clamp(py(TRIG_LO), Y0, Y1);
  const devZone = svgEl('rect');
  attr(devZone, { x: X0, y: devTop, width: X1 - X0, height: devBot - devTop, fill: 'rgba(251,146,60,.1)' });
  svg.appendChild(devZone);

  // Trigger upper bound (dashed) — lower is off-chart so skip
  const trigLine = svgEl('line');
  attr(trigLine, { x1: X0, y1: devTop, x2: X1, y2: devTop,
    stroke: 'rgba(251,146,60,.4)', 'stroke-width': 1, 'stroke-dasharray': '5 3' });
  svg.appendChild(trigLine);

  const zoneLbl = svgEl('text');
  attr(zoneLbl, { x: X0 + 4, y: devTop + 11, 'font-size': 8.5,
    fill: 'rgba(251,146,60,.55)', 'font-family': 'sans-serif' });
  zoneLbl.textContent = `±${DEV_PCT}% deviation zone`;
  svg.appendChild(zoneLbl);

  // ── Pyth confidence band ─────────────────────────────────────────────────
  const pythBandEl = svgEl('rect');
  attr(pythBandEl, { x: X0, y: py(PYTH_HI), width: X1 - X0,
    height: py(PYTH_LO) - py(PYTH_HI), fill: 'rgba(34,211,238,.14)' });
  svg.appendChild(pythBandEl);

  // ── Price lines ──────────────────────────────────────────────────────────
  // Chainlink — solid orange
  const clLine = svgEl('line');
  attr(clLine, { x1: X0, y1: py(CL), x2: X1, y2: py(CL), stroke: '#f97316', 'stroke-width': 2 });
  svg.appendChild(clLine);

  // Pyth — solid cyan
  const pythLine = svgEl('line');
  attr(pythLine, { x1: X0, y1: py(PYTH), x2: X1, y2: py(PYTH), stroke: '#22d3ee', 'stroke-width': 2 });
  svg.appendChild(pythLine);

  // Spot — dashed green (dynamic)
  const spotLine = svgEl('line');
  attr(spotLine, { x1: X0, y1: py(spotPrice), x2: X1, y2: py(spotPrice),
    stroke: '#4ade80', 'stroke-width': 2, 'stroke-dasharray': '6 3' });
  svg.appendChild(spotLine);

  // ── Right-edge labels (static) ────────────────────────────────────────────
  function mkRLabel(txt: string, color: string, priceY: number): void {
    const t = svgEl('text');
    attr(t, { x: X1 - 4, y: priceY - 4, 'text-anchor': 'end', 'font-size': 9,
      fill: color, 'font-family': 'sans-serif', 'font-weight': '600' });
    t.textContent = txt;
    svg.appendChild(t);
  }
  mkRLabel(`CHAINLINK  $${CL.toFixed(2)}`, '#f97316', py(CL));
  mkRLabel(`PYTH  $${PYTH.toFixed(2)}`, '#22d3ee', py(PYTH));

  // Spot label — dynamic, repositioned in update()
  const spotLbl = svgEl('text');
  attr(spotLbl, { 'text-anchor': 'end', 'font-size': 9, fill: '#4ade80',
    'font-family': 'sans-serif', 'font-weight': '600' });
  svg.appendChild(spotLbl);

  // ── Oracle-fires badge (hidden by default) ────────────────────────────────
  const fireBadge = svgEl('g');
  fireBadge.style.display = 'none';
  fireBadge.classList.add('og-pulse');
  const fireBg = svgEl('rect');
  attr(fireBg, { rx: 4, fill: 'rgba(239,68,68,.25)', stroke: 'rgba(239,68,68,.6)', 'stroke-width': 1 });
  const fireTxt = svgEl('text');
  attr(fireTxt, { 'text-anchor': 'middle', 'font-size': 9.5, fill: '#fca5a5',
    'font-weight': '700', 'font-family': 'sans-serif' });
  fireBadge.appendChild(fireBg);
  fireBadge.appendChild(fireTxt);
  svg.appendChild(fireBadge);

  // ── Heartbeat staleness bar ───────────────────────────────────────────────
  const mY = Y1 + 16;
  const mLbl = svgEl('text');
  attr(mLbl, { x: X0, y: mY, 'font-size': 8.5, fill: 'rgba(255,255,255,.38)', 'font-family': 'sans-serif' });
  mLbl.textContent = `Heartbeat age: ${AGE_MIN} / ${HB_MIN} min`;
  svg.appendChild(mLbl);
  const mTrack = svgEl('rect');
  attr(mTrack, { x: X0, y: mY + 6, width: X1 - X0, height: 5, rx: 2.5, fill: 'rgba(255,255,255,.1)' });
  svg.appendChild(mTrack);
  const mFill = svgEl('rect');
  attr(mFill, { x: X0, y: mY + 6, width: Math.round((X1 - X0) * Math.min(AGE_MIN / HB_MIN, 1)),
    height: 5, rx: 2.5, fill: '#f59e0b' });
  svg.appendChild(mFill);

  // ── Panel HTML ────────────────────────────────────────────────────────────
  panel.innerHTML = `
    <div class="afl-cards" style="--afl-card:130px">
      <div class="og-card">
        <div class="og-lbl" style="color:#f97316">Chainlink</div>
        <div class="og-val" style="color:#f97316">$${CL.toFixed(2)}</div>
        <div class="og-sub">Updated ${AGE_MIN} min ago</div>
        <div class="og-sub">Trigger ±${DEV_PCT}% · HB 60 min</div>
      </div>
      <div class="og-card">
        <div class="og-lbl" style="color:#22d3ee">Pyth</div>
        <div class="og-val" style="color:#22d3ee">$${PYTH.toFixed(2)}</div>
        <div class="og-sub">Conf ±$${data.pyth.conf.toFixed(2)}</div>
        <div class="og-sub">EMA $${data.pyth.emaPriceUsd.toFixed(2)}</div>
      </div>
      <div class="og-card">
        <div class="og-lbl" style="color:#4ade80">Gap vs Chainlink</div>
        <div class="og-val og-dev-val" style="color:#4ade80">+0.000%</div>
        <div class="og-sub">simulated spot</div>
        <div class="og-badge calm og-status-badge">WITHIN THRESHOLD</div>
      </div>
    </div>
  `;

  // ── Controls HTML ─────────────────────────────────────────────────────────
  controls.innerHTML = `
    <div class="og-slider-row">
      <div class="afl-split">
        <span class="og-hint">Simulate spot price</span>
        <span class="og-val og-spot-val" style="font-size:14px;color:#4ade80">$${spotPrice.toFixed(2)}</span>
      </div>
      <input class="og-slider" type="range"
        min="${P_MIN}" max="${P_MAX}" step="0.01" value="${spotPrice}">
      <div class="og-hint">
        Drag past $${TRIG_HI.toFixed(2)} (or below $${TRIG_LO.toFixed(2)}) to trigger the oracle update
      </div>
    </div>
  `;

  // ── Caption ───────────────────────────────────────────────────────────────
  caption.innerHTML = `<span class="og-cap-txt">Snapshot 2026-06-22 04:31 UTC ·
    Chainlink ETH/USD proxy 0x5f4e…8419 (Ethereum mainnet) ·
    Pyth feed 0xff61…0ace · Crypto.com ETH_USD spot</span>`;

  // ── Update function (called on slider input + initial render) ─────────────
  function update(): void {
    const sy = py(spotPrice);

    // Move spot line
    spotLine.setAttribute('y1', String(sy));
    spotLine.setAttribute('y2', String(sy));

    // Move spot label — place above line, away from Chainlink label if close
    attr(spotLbl, { x: X1 - 4, y: String(sy - 4) });
    spotLbl.textContent = `SPOT  $${spotPrice.toFixed(2)}`;

    // Deviation from Chainlink anchor
    const dev = (spotPrice - CL) / CL * 100;
    const fires = Math.abs(dev) >= DEV_PCT;

    // Panel cards
    const devEl   = panel.querySelector('.og-dev-val') as HTMLElement | null;
    const badgeEl = panel.querySelector('.og-status-badge') as HTMLElement | null;
    const spotValEl = controls.querySelector('.og-spot-val') as HTMLElement | null;

    if (devEl) {
      devEl.textContent = `${dev >= 0 ? '+' : ''}${dev.toFixed(3)}%`;
      devEl.style.color = fires ? '#f87171' : '#4ade80';
    }
    if (badgeEl) {
      badgeEl.textContent = fires ? 'UPDATE TRIGGERED' : 'WITHIN THRESHOLD';
      badgeEl.className = `og-badge ${fires ? 'fire' : 'calm'}`;
    }
    if (spotValEl) spotValEl.textContent = `$${spotPrice.toFixed(2)}`;

    // SVG fire badge
    if (fires) {
      const dir = dev > 0 ? '↑' : '↓';
      const cx = (X0 + X1) / 2;
      const topY = Math.min(py(CL), sy) - 6;
      fireTxt.textContent = `ORACLE FIRES ${dir}  ${Math.abs(dev).toFixed(2)}%`;
      let bw = 124, bh = 16;
      try { const bb = (fireTxt as SVGTextElement).getBBox(); bw = bb.width + 16; bh = bb.height + 6; }
      catch { /* not yet laid out */ }
      attr(fireBg, { x: cx - bw / 2, y: topY - bh + 2, width: bw, height: bh });
      attr(fireTxt, { x: cx, y: topY - 2 });
      fireBadge.style.display = '';
    } else {
      fireBadge.style.display = 'none';
    }
  }

  const slider = controls.querySelector('.og-slider') as HTMLInputElement;
  const onInput = (): void => { spotPrice = parseFloat(slider.value); update(); };
  slider.addEventListener('input', onInput);

  update();

  return () => {
    slider.removeEventListener('input', onInput);
    style.remove();
    layout.dispose();
  };
}
