/**
 * Artifact: the-clmm-strangle — The CLMM Strangle
 * Manifest: content/artifacts/the-clmm-strangle/manifest.json
 *
 * Interactive calculator showing a Uniswap v3 LP position as a short strangle.
 * Stage: SVG payoff diagram (IL curve, fee income band, net P&L). Panel: Greeks
 * + Black-Scholes fair premium vs. fee income. Controls: range bounds, IV, fee
 * APY, hold days. All math is self-contained; no runtime network calls.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/the-clmm-strangle/data.json';

const NS = 'http://www.w3.org/2000/svg';
const VW = 840, VH = 440;
const X0 = 60, X1 = 800, Y0 = 22, Y1 = 390;

// Realized vol from the 50-hour hourly close window
function computeRealizedVol(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i]! / closes[i - 1]!));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 8760); // annualize hourly
}

const SPOT = data.spot;
const REALIZED_VOL = Math.round(computeRealizedVol(data.closes) * 1000) / 1000;

// LP value normalized so V(S0) = 1
function lpVal(s: number, pa: number, pb: number, s0: number): number {
  const spa = Math.sqrt(pa), spb = Math.sqrt(pb), ss0 = Math.sqrt(s0);
  const L = 1 / (2 * ss0 - spa - s0 / spb);
  if (s <= pa) return L * (1 / spa - 1 / spb) * s;
  if (s >= pb) return L * (spb - spa);
  return L * (2 * Math.sqrt(s) - spa - s / spb);
}

function hodlVal(s: number, pa: number, pb: number, s0: number): number {
  const spa = Math.sqrt(pa), spb = Math.sqrt(pb), ss0 = Math.sqrt(s0);
  const L = 1 / (2 * ss0 - spa - s0 / spb);
  const x0 = L * (1 / ss0 - 1 / spb);
  const y0 = L * (ss0 - spa);
  return x0 * s + y0;
}

function il(s: number, pa: number, pb: number, s0: number): number {
  return lpVal(s, pa, pb, s0) / hodlVal(s, pa, pb, s0) - 1;
}

// Abramowitz & Stegun rational approximation for Φ(x)
function normCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x / 2)));
}

function bsCall(s: number, k: number, T: number, sigma: number): number {
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(s / k) + (0.04 + sigma * sigma / 2) * T) / (sigma * sqT);
  return s * normCDF(d1) - k * Math.exp(-0.04 * T) * normCDF(d1 - sigma * sqT);
}

function bsPut(s: number, k: number, T: number, sigma: number): number {
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(s / k) + (0.04 + sigma * sigma / 2) * T) / (sigma * sqT);
  return k * Math.exp(-0.04 * T) * normCDF(sigma * sqT - d1) - s * normCDF(-d1);
}

function stranglePct(s0: number, pa: number, pb: number, sigma: number, days: number): number {
  const T = days / 365;
  return (bsPut(s0, pa, T, sigma) + bsCall(s0, pb, T, sigma)) / s0;
}

// Delta: ETH fraction of LP portfolio at price s
function lpDelta(s: number, pa: number, pb: number, s0: number): number {
  const spa = Math.sqrt(pa), spb = Math.sqrt(pb), ss0 = Math.sqrt(s0);
  const L = 1 / (2 * ss0 - spa - s0 / spb);
  const sc = Math.max(pa, Math.min(s, pb));
  const ethAmt = L * (1 / Math.sqrt(sc) - 1 / spb);
  const ethVal = ethAmt * s;
  const pos = lpVal(s, pa, pb, s0);
  return pos > 0 ? Math.max(0, Math.min(1, ethVal / pos)) : 0;
}

// Gamma: d²V/dS² = -L / (2 * S^1.5), expressed as delta change per 1% price move
function lpGamma(s: number, pa: number, pb: number, s0: number): number {
  if (s <= pa || s >= pb) return 0;
  const spa = Math.sqrt(pa), spb = Math.sqrt(pb), ss0 = Math.sqrt(s0);
  const L = 1 / (2 * ss0 - spa - s0 / spb);
  return -L / (2 * Math.pow(s, 1.5)) * (s * 0.01); // Δ-delta per 1% move
}

const pct = (v: number, d = 1) => (v * 100).toFixed(d) + '%';
const dp = (n: number, d = 2) => n.toFixed(d);

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/440',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cls-wrap { position:absolute; inset:0; background:#0d1322;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; overflow:hidden; }
    .cls-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .cls-grid { stroke:rgba(124,140,255,.08); }
    .cls-axis { fill:#5b6378; font:500 10.5px 'JetBrains Mono',monospace; }
    .cls-zero { stroke:rgba(231,234,243,.12); }
    .cls-range { fill:rgba(124,140,255,.07); }
    .cls-il { fill:none; stroke:#f0883e; stroke-width:2; stroke-linecap:round; }
    .cls-fee { fill:rgba(95,211,155,.12); }
    .cls-net { fill:none; stroke:#22d3ee; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .cls-pa  { stroke:rgba(240,136,62,.5); stroke-dasharray:4 4; stroke-width:1.5; }
    .cls-pb  { stroke:rgba(124,140,255,.5); stroke-dasharray:4 4; stroke-width:1.5; }
    .cls-s0  { stroke:rgba(231,234,243,.3); stroke-dasharray:2 4; stroke-width:1; }
    .cls-legend { font:600 9.5px 'JetBrains Mono',monospace; }

    .cls-controls { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr);
      gap:8px 18px; align-items:end; }
    .cls-field { display:flex; flex-direction:column; gap:4px; }
    .cls-field label { display:flex; justify-content:space-between;
      font:500 9.5px/1.3 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#5b6378; }
    .cls-field output { color:#e7eaf3; }
    .cls-field input[type=range] { width:100%; cursor:pointer;
      accent-color:#7c8cff; margin-top:2px; }

    .cls-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11.5px/1.5 'JetBrains Mono',monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .cls-sec { display:flex; flex-direction:column; gap:4px; }
    .cls-head { font-size:9px; letter-spacing:.1em; text-transform:uppercase;
      color:#5b6378; padding-bottom:3px; border-bottom:1px solid rgba(124,140,255,.1); }
    .cls-row { display:flex; align-items:baseline; justify-content:space-between;
      gap:4px 8px; min-width:0; }
    .cls-row span { font-size:10.5px; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .cls-row b { font-weight:700; color:#e7eaf3; white-space:nowrap; }
    .cls-amber { color:#f0883e !important; }
    .cls-teal  { color:#22d3ee !important; }
    .cls-green { color:#5fd39b !important; }
    .cls-blue  { color:#7c8cff !important; }
    .cls-verdict { padding:8px 10px; border-radius:8px; font-size:10.5px; line-height:1.5;
      min-width:0; overflow-wrap:anywhere; }
    .cls-positive { border:1px solid rgba(95,211,155,.3); background:rgba(95,211,155,.08); color:#9eedc8; }
    .cls-negative { border:1px solid rgba(240,136,62,.3); background:rgba(240,136,62,.08); color:#ffcba4; }

    .cls-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .cls-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  // ── SVG stage ───────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'cls-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'CLMM strangle payoff: IL curve, fee income band, and net P&L vs ETH price');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  const gBg     = document.createElementNS(NS, 'g'); svg.appendChild(gBg);
  const gFee    = document.createElementNS(NS, 'g'); svg.appendChild(gFee);
  const gCurves = document.createElementNS(NS, 'g'); svg.appendChild(gCurves);
  const gMark   = document.createElementNS(NS, 'g'); svg.appendChild(gMark);
  const gLabels = document.createElementNS(NS, 'g'); svg.appendChild(gLabels);

  // ── Panel ───────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'cls-panel';
  panel.appendChild(panelEl);

  // ── Controls ────────────────────────────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'cls-controls';
  ctrlSlot.appendChild(ctrlWrap);

  const mkSlider = (id: string, label: string, min: number, max: number, step: number, value: number) => {
    const field = document.createElement('div');
    field.className = 'cls-field';
    const lbl = document.createElement('label');
    lbl.htmlFor = `cls-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lbl.append(name, out);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = `cls-${id}`;
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(value);
    inp.setAttribute('aria-label', label);
    field.append(lbl, inp);
    ctrlWrap.appendChild(field);
    return { inp, out };
  };

  const sPa  = mkSlider('pa',    'lower bound (Pa) % of spot', 60, 99, 1, 85);
  const sPb  = mkSlider('pb',    'upper bound (Pb) % of spot', 101, 160, 1, 115);
  const sIV  = mkSlider('iv',    'implied vol (IV) %', 20, 120, 1, Math.round(REALIZED_VOL * 100));
  const sFee = mkSlider('fee',   'fee APY %', 0, 200, 1, 37);
  const sDays = mkSlider('days', 'hold days', 7, 90, 1, 30);

  // ── Caption ─────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'cls-cap';
  cap.innerHTML =
    `<b>ETH/USDT spot $${SPOT.toFixed(2)}</b> · ` +
    `50-hour realized vol <b>${pct(REALIZED_VOL)}</b> (annualized) · ` +
    `Black-Scholes: risk-free rate 4%, log-normal · ` +
    `<b>Crypto.com Exchange · ${data.dataAsOf}</b> · ` +
    `Fee APY reference: 0.05% ETH/USDC pool, ±15% range`;
  caption.appendChild(cap);

  // ── Render ──────────────────────────────────────────────────────────────────
  function render(): void {
    [gBg, gFee, gCurves, gMark, gLabels].forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); });

    const paFrac  = Number(sPa.inp.value)  / 100;
    const pbFrac  = Number(sPb.inp.value)  / 100;
    const iv      = Number(sIV.inp.value)  / 100;
    const feeApy  = Number(sFee.inp.value) / 100;
    const days    = Number(sDays.inp.value);

    const pa = SPOT * paFrac;
    const pb = SPOT * pbFrac;

    sPa.out.textContent  = `${sPa.inp.value}% = $${pa.toFixed(0)}`;
    sPb.out.textContent  = `${sPb.inp.value}% = $${pb.toFixed(0)}`;
    sIV.out.textContent  = `${sIV.inp.value}%`;
    sFee.out.textContent = `${sFee.inp.value}%`;
    sDays.out.textContent = `${days}d`;

    const feePeriod = feeApy * days / 365; // fraction earned over hold period

    // Price range for x-axis: 60%–155% of SPOT
    const priceMin = SPOT * 0.60, priceMax = SPOT * 1.55;

    // Y-axis: -45% to +20%
    const Y_MIN = -0.45, Y_MAX = 0.20;

    const xOf = (p: number) => X0 + (p - priceMin) / (priceMax - priceMin) * (X1 - X0);
    const yOf = (v: number) => Y1 - (v - Y_MIN) / (Y_MAX - Y_MIN) * (Y1 - Y0);

    const mk = (tag: string, attrs: Record<string, string | number>, parent: SVGElement = gBg as SVGElement): SVGElement => {
      const el = document.createElementNS(NS, tag) as SVGElement;
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      parent.appendChild(el);
      return el;
    };
    const txt = (x: number, y: number, cls: string, text: string, anchor = 'middle', parent: SVGElement = gLabels as SVGElement): SVGElement => {
      const t = document.createElementNS(NS, 'text') as SVGElement;
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
      t.textContent = text; parent.appendChild(t); return t;
    };

    // Background + grid
    mk('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, fill: 'transparent' });

    const yTicks = [-0.40, -0.30, -0.20, -0.10, 0, 0.10, 0.20];
    for (const v of yTicks) {
      if (v < Y_MIN || v > Y_MAX) continue;
      const y = yOf(v);
      mk('line', { x1: X0, y1: y, x2: X1, y2: y, class: v === 0 ? 'cls-zero' : 'cls-grid', 'stroke-width': v === 0 ? 1 : 1 });
      txt(X0 - 5, y + 3.5, 'cls-axis', v === 0 ? '0' : pct(v, 0), 'end');
    }

    const xPrices = [0.65, 0.75, 0.85, 1.0, 1.15, 1.30, 1.45].map(f => SPOT * f);
    for (const p of xPrices) {
      if (p < priceMin || p > priceMax) continue;
      const x = xOf(p);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'cls-grid' });
      txt(x, Y1 + 13, 'cls-axis', `$${(p / 1000).toFixed(1)}k`);
    }
    txt((X0 + X1) / 2, VH - 4, 'cls-axis', 'ETH Price');

    // In-range shaded region
    const paxc = Math.max(priceMin, pa), pbxc = Math.min(priceMax, pb);
    mk('rect', {
      x: xOf(paxc), y: Y0,
      width: xOf(pbxc) - xOf(paxc), height: Y1 - Y0,
      class: 'cls-range'
    }, gBg as SVGElement);

    // Fee income band (within range, flat at feePeriod)
    if (feePeriod > 0 && paxc < pbxc) {
      const feeY = yOf(Math.min(feePeriod, Y_MAX));
      const zeroY = yOf(0);
      mk('rect', {
        x: xOf(paxc), y: Math.min(feeY, zeroY),
        width: xOf(pbxc) - xOf(paxc),
        height: Math.abs(feeY - zeroY),
        class: 'cls-fee',
      }, gFee as SVGElement);
    }

    // Build curve points over 200 samples
    const N = 200;
    const ilPts: string[] = [], netPts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const s = priceMin + (priceMax - priceMin) * (i / N);
      const ilVal = il(s, pa, pb, SPOT);
      const inRange = s >= pa && s <= pb;
      const netVal = ilVal + (inRange ? feePeriod : 0);

      const ilClipped = Math.max(Y_MIN, Math.min(Y_MAX, ilVal));
      const netClipped = Math.max(Y_MIN, Math.min(Y_MAX, netVal));

      ilPts.push(`${xOf(s).toFixed(1)},${yOf(ilClipped).toFixed(1)}`);
      netPts.push(`${xOf(s).toFixed(1)},${yOf(netClipped).toFixed(1)}`);
    }
    mk('polyline', { points: ilPts.join(' '), class: 'cls-il' }, gCurves as SVGElement);
    mk('polyline', { points: netPts.join(' '), class: 'cls-net' }, gCurves as SVGElement);

    // Vertical markers
    if (pa >= priceMin && pa <= priceMax) {
      const x = xOf(pa);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'cls-pa' }, gMark as SVGElement);
      const t = txt(x, Y0 + 11, 'cls-legend', 'Pa', 'middle', gLabels as SVGElement);
      t.setAttribute('fill', '#f0883e');
    }
    if (pb >= priceMin && pb <= priceMax) {
      const x = xOf(pb);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'cls-pb' }, gMark as SVGElement);
      const t = txt(x, Y0 + 11, 'cls-legend', 'Pb', 'middle', gLabels as SVGElement);
      t.setAttribute('fill', '#7c8cff');
    }
    if (SPOT >= priceMin && SPOT <= priceMax) {
      const x = xOf(SPOT);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'cls-s0' }, gMark as SVGElement);
      txt(x, Y0 + 11, 'cls-axis', 'S₀', 'middle', gLabels as SVGElement);
    }

    // Legend
    const lx = X1 - 8;
    const lil = txt(lx, Y1 - 38, 'cls-legend', 'IL only', 'end', gLabels as SVGElement);
    lil.setAttribute('fill', '#f0883e');
    const lnet = txt(lx, Y1 - 22, 'cls-legend', 'Net P&L', 'end', gLabels as SVGElement);
    lnet.setAttribute('fill', '#22d3ee');

    // ── Panel ──────────────────────────────────────────────────────────────────
    const delta = lpDelta(SPOT, pa, pb, SPOT);
    const gamma = lpGamma(SPOT, pa, pb, SPOT);

    const bsPremPct = stranglePct(SPOT, pa, pb, iv, days);
    const bsPremApy = bsPremPct * 365 / days;
    const feeApy30  = feePeriod * 365 / days;
    const gap       = feeApy30 - bsPremApy; // >0 LP is paid above fair

    panelEl.innerHTML = `
      <div class="cls-sec">
        <div class="cls-head">Position at S₀ = $${SPOT.toFixed(0)}</div>
        <div class="cls-row"><span>ETH delta (∆)</span><b class="cls-blue">${pct(delta, 1)}</b></div>
        <div class="cls-row"><span>USDC delta</span><b>${pct(1 - delta, 1)}</b></div>
        <div class="cls-row"><span>Gamma (∆Δ / 1% move)</span><b class="${gamma < 0 ? 'cls-amber' : ''}">${(gamma * 100).toFixed(4)}%</b></div>
      </div>
      <div class="cls-sec">
        <div class="cls-head">Strangle pricing · ${days}d horizon</div>
        <div class="cls-row"><span>BS fair premium</span><b class="cls-amber">${pct(bsPremPct, 2)}</b></div>
        <div class="cls-row"><span>BS fair APY</span><b class="cls-amber">${pct(bsPremApy, 1)}</b></div>
        <div class="cls-row"><span>Fee income (${days}d)</span><b class="cls-green">${pct(feePeriod, 2)}</b></div>
        <div class="cls-row"><span>Fee APY</span><b class="cls-green">${pct(feeApy30, 1)}</b></div>
      </div>
      <div class="cls-verdict ${gap >= 0 ? 'cls-positive' : 'cls-negative'}">
        ${gap >= 0
          ? `✓ Fee income exceeds BS fair premium by <b>${pct(Math.abs(gap), 1)} APY</b>. LP is compensated for volatility exposure.`
          : `⚠ Fee income is <b>${pct(Math.abs(gap), 1)} APY below</b> the BS fair strangle premium. LP is structurally underpaid at this vol.`}
      </div>
    `;
  }

  render();

  const onInput = () => render();
  [sPa.inp, sPb.inp, sIV.inp, sFee.inp, sDays.inp].forEach(el => el.addEventListener('input', onInput));

  return () => {
    [sPa.inp, sPb.inp, sIV.inp, sFee.inp, sDays.inp].forEach(el => el.removeEventListener('input', onInput));
    layout.dispose();
    style.remove();
  };
}
