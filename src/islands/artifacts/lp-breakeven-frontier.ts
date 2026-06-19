/**
 * Artifact: lp-breakeven-frontier — The LP Break-Even Frontier
 * Manifest: content/artifacts/lp-breakeven-frontier/manifest.json
 *
 * The economic question every passive AMM liquidity provider faces: do my fees
 * out-earn what arbitrageurs pick off my stale quotes? For a constant-product
 * pool the adverse-selection cost — Loss-Versus-Rebalancing — has a closed form:
 * the instantaneous LVR, normalized by pool value, is exactly σ²/8 (Milionis,
 * Moallemi, Roughgarden & Zhang, arXiv:2208.06046). Annualized,
 *
 *     LVR_yr  =  σ_annual² / 8                         (rises with the SQUARE of vol)
 *     fees_yr =  fee_rate · daily_turnover · 365        (flat in vol)
 *
 * The chart plots both as a function of daily volatility. LVR is a rising
 * quadratic; fee income is a flat line set by the pool's fee tier and turnover.
 * Where they cross is the break-even volatility σ*: to its left the LP nets a
 * profit (green), to its right arbitrage bots take more than the pool earns
 * (red). Three real assets are marked at their 30-day realized vol — at low
 * turnover even BTC sits in the red.
 *
 * The "auction recapture" toggle models a MEV-capturing AMM (CoW-AMM-style):
 * solvers bid for the right to rebalance the pool and the surplus is returned
 * to LPs, so only a fraction (1−η) of LVR leaks out — the quadratic collapses
 * and the frontier slides right.
 *
 * SVG chart. Tap an asset marker (or ← →) to read its P&L; segmented fee tier,
 * a turnover slider, and the recapture toggle reshape the frontier live.
 * No RAF — renders on input. Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/lp-breakeven-frontier/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Asset { id: string; label: string; dailyVol: number; annualVol: number; lvrAnnual: number }
interface FeeTier { bps: number; label: string }

const ASSETS = data.assets as Asset[];
const TIERS = data.feeTiers as FeeTier[];
const ETA = data.defaults.recaptureEfficiency; // auction recapture efficiency

const NS = 'http://www.w3.org/2000/svg';
const DAYS = 365;

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 460;
const X0 = 66;
const X1 = 798;
const Y_TOP = 40;
const Y_BASE = 388;

/* x domain: daily volatility 0 → 6% */
const SD_MAX = 0.06;
const xOf = (sd: number) => X0 + (Math.min(sd, SD_MAX) / SD_MAX) * (X1 - X0);

/* --- model --- */
// annualized LVR fraction at a given daily vol, given recapture leak factor
const lvrAnnual = (sd: number, leak: number) => ((sd * sd * DAYS) / 8) * leak;
// annualized fee income fraction (flat in vol)
const feeAnnual = (feeRate: number, turnover: number) => feeRate * turnover * DAYS;

/* --- formatters --- */
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

export default function mount(container: HTMLElement): () => void {
  let feeIdx = TIERS.findIndex((t) => t.bps === data.defaults.feeBps);
  if (feeIdx < 0) feeIdx = 1;
  let turnover = data.defaults.turnoverDaily; // daily volume / TVL
  let recapture = false;
  let sel = Math.max(0, ASSETS.findIndex((a) => a.id === data.defaults.selectedAsset));

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .lbf-chartwrap { position:absolute; inset:0; min-height:170px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .lbf-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .lbf-grid { stroke:rgba(124,140,255,.1); }
    .lbf-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .lbf-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .lbf-win { fill:rgba(34,211,238,.06); }
    .lbf-lose { fill:rgba(249,115,98,.07); }
    .lbf-fee { fill:none; stroke:#22d3ee; stroke-width:2; stroke-dasharray:6 4; }
    .lbf-feelab { fill:#22d3ee; font:600 10px 'JetBrains Mono', monospace; }
    .lbf-lvr { fill:none; stroke:#f5a524; stroke-width:2.4; }
    .lbf-lvrlab { fill:#f5a524; font:600 10px 'JetBrains Mono', monospace; }
    .lbf-be { stroke:#e7eaf3; stroke-width:1.2; stroke-dasharray:3 3; }
    .lbf-belab { fill:#e7eaf3; font:600 10px 'JetBrains Mono', monospace; }
    .lbf-mk { stroke:rgba(141,149,173,.5); stroke-width:1; stroke-dasharray:2 3; }
    .lbf-mk-sel { stroke:rgba(231,234,243,.65); stroke-width:1.4; stroke-dasharray:none; }
    .lbf-node { outline:none; cursor:pointer; }
    .lbf-node:focus-visible .lbf-ring { opacity:1; }
    .lbf-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .lbf-dot { stroke:#05070d; stroke-width:1.4; }
    .lbf-dot-win { fill:#22d3ee; }
    .lbf-dot-lose { fill:#f97362; }
    .lbf-hit { fill:transparent; cursor:pointer; }
    .lbf-mklab { font:600 10.5px 'JetBrains Mono', monospace; pointer-events:none; }

    .lbf-controls { display:flex; align-items:flex-end; gap:12px 18px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .lbf-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .lbf-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .lbf-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .lbf-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 10px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .lbf-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .lbf-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .lbf-slider { display:flex; flex-direction:column; gap:4px; min-width:170px; flex:1 1 180px; }
    .lbf-slider .lbf-sval { color:#e7eaf3; font-weight:700; }
    .lbf-slider input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer; }
    .lbf-toggle { appearance:none; border:1px solid rgba(124,140,255,.2); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      padding:8px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;
      transition:color .2s, background .2s, border-color .2s; }
    .lbf-toggle[aria-pressed="true"] { background:rgba(34,211,238,.14); color:#bdf3fb; border-color:rgba(34,211,238,.4); }
    .lbf-toggle:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .lbf-toggle .lbf-knob { width:8px; height:8px; border-radius:50%; background:#5b6378; }
    .lbf-toggle[aria-pressed="true"] .lbf-knob { background:#22d3ee; }

    .lbf-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .lbf-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .lbf-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .lbf-src { color:#5b6378; font-size:10.5px; }
    .lbf-rows { display:flex; flex-direction:column; gap:5px; }
    .lbf-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .lbf-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .lbf-row b { font-size:13px; font-weight:700; }
    .lbf-row b.lbf-fee-c { color:#22d3ee; }
    .lbf-row b.lbf-lvr-c { color:#f5a524; }
    .lbf-row b.lbf-neutral { color:#e7eaf3; }
    .lbf-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0; overflow-wrap:anywhere; }
    .lbf-verdict.lbf-win { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .lbf-verdict.lbf-lose { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .lbf-verdict b { font-weight:700; }
    .lbf-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .lbf-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'lbf-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Liquidity-provider net return: fee income versus loss-versus-rebalancing across volatility');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    gPlot.appendChild(t);
    return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    gPlot.appendChild(l);
    return l;
  };
  const mkRect = (x: number, y: number, w: number, h: number, cls: string) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(Math.max(0, w)));
    r.setAttribute('height', String(Math.max(0, h)));
    r.setAttribute('class', cls);
    gPlot.appendChild(r);
    return r;
  };

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'lbf-controls';

  // asset segmented
  const aGroup = document.createElement('div');
  aGroup.className = 'lbf-cgroup';
  const aLab = document.createElement('span');
  aLab.textContent = 'asset · 30-day vol';
  const aSegs = document.createElement('div');
  aSegs.className = 'lbf-segs';
  aSegs.setAttribute('role', 'group');
  aSegs.setAttribute('aria-label', 'asset');
  const aBtns = ASSETS.map((a, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbf-seg';
    b.textContent = a.label;
    b.setAttribute('aria-label', `${a.label}, ${pct(a.annualVol, 0)} annualized volatility`);
    b.addEventListener('click', () => { sel = i; render(); });
    aSegs.appendChild(b);
    return b;
  });
  aGroup.append(aLab, aSegs);

  // fee segmented
  const fGroup = document.createElement('div');
  fGroup.className = 'lbf-cgroup';
  const fLab = document.createElement('span');
  fLab.textContent = 'fee tier';
  const fSegs = document.createElement('div');
  fSegs.className = 'lbf-segs';
  fSegs.setAttribute('role', 'group');
  fSegs.setAttribute('aria-label', 'fee tier');
  const fBtns = TIERS.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbf-seg';
    b.textContent = t.label;
    b.setAttribute('aria-label', `${t.label} fee tier`);
    b.addEventListener('click', () => { feeIdx = i; render(); });
    fSegs.appendChild(b);
    return b;
  });
  fGroup.append(fLab, fSegs);

  // turnover slider
  const tGroup = document.createElement('div');
  tGroup.className = 'lbf-slider';
  const tLab = document.createElement('span');
  tLab.style.cssText = 'font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#5b6378;';
  const tVal = document.createElement('span');
  tVal.className = 'lbf-sval';
  const tHead = document.createElement('div');
  tHead.className = 'afl-split';
  tHead.append(tLab, tVal);
  const tInput = document.createElement('input');
  tInput.type = 'range';
  tInput.min = '0.5';
  tInput.max = '12';
  tInput.step = '0.5';
  tInput.value = String(turnover * 100);
  tInput.setAttribute('aria-label', 'daily volume as a percent of pool TVL');
  tInput.addEventListener('input', () => { turnover = Number(tInput.value) / 100; render(); });
  tGroup.append(tHead, tInput);

  // recapture toggle
  const rGroup = document.createElement('div');
  rGroup.className = 'lbf-cgroup';
  const rLab = document.createElement('span');
  rLab.textContent = 'mechanism';
  const rBtn = document.createElement('button');
  rBtn.type = 'button';
  rBtn.className = 'lbf-toggle';
  rBtn.setAttribute('aria-pressed', 'false');
  const rKnob = document.createElement('span');
  rKnob.className = 'lbf-knob';
  const rTxt = document.createElement('span');
  rBtn.append(rKnob, rTxt);
  rBtn.addEventListener('click', () => { recapture = !recapture; render(); });
  rGroup.append(rLab, rBtn);

  controls.append(aGroup, fGroup, tGroup, rGroup);
  controlsSlot.appendChild(controls);

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'lbf-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'lbf-cap';
  cap.innerHTML =
    'Constant-product LVR rate is <b>σ²/8</b> of pool value per unit time; annualized cost = annual σ²/8 (rises with vol²), ' +
    'fee income = fee × daily turnover × 365 (flat). Their crossing is the break-even vol σ*. ' +
    'Volatilities are 30-day realized (BTC/ETH/DOGE, Crypto.com daily closes); the 0.05% tier is the live Uniswap v3 USDC/WETH pool fee on Ethereum. ' +
    'Tap an asset or use ← →; recapture models a solver-auction AMM returning ' + pct(ETA, 0) + ' of arbitrage surplus to LPs.';
  caption.appendChild(cap);

  /* ---- y-axis auto-scale helpers ---- */
  function niceMax(v: number): number {
    const target = Math.max(0.06, v * 1.15); // floor 6%, headroom
    const steps = [0.06, 0.08, 0.1, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
    for (const s of steps) if (target <= s) return s;
    return Math.ceil(target);
  }

  /* ---- Render ---- */
  let yMax = 0.12;
  const yOf = (v: number) => Y_BASE - (Math.min(v, yMax) / yMax) * (Y_BASE - Y_TOP);
  const nodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;

    const feeRate = TIERS[feeIdx].bps / 1e4;
    const leak = recapture ? 1 - ETA : 1;
    const fee = feeAnnual(feeRate, turnover);
    const lvrAtMax = lvrAnnual(SD_MAX, leak);
    yMax = niceMax(Math.max(fee, lvrAtMax));

    // break-even daily vol: σ*² · 365/8 · leak = fee  →  σ* = sqrt(fee·8/(365·leak))
    const sdStar = Math.sqrt((fee * 8) / (DAYS * leak));
    const starInRange = sdStar > 0 && sdStar < SD_MAX;
    const xStar = starInRange ? xOf(sdStar) : X1;

    // shaded win/lose regions (win = left of σ*, lose = right)
    mkRect(X0, Y_TOP, xStar - X0, Y_BASE - Y_TOP, 'lbf-win');
    if (starInRange) mkRect(xStar, Y_TOP, X1 - xStar, Y_BASE - Y_TOP, 'lbf-lose');

    // y gridlines + ticks (annual %)
    mkText(X0 - 6, 26, 'lbf-axis', 'annualized return / cost');
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const v = (yMax / yTicks) * i;
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'lbf-grid');
      const vp = v * 100;
      mkText(X0 - 8, y + 3.5, 'lbf-axislab', `${Number.isInteger(vp) ? vp.toFixed(0) : vp.toFixed(1)}%`, 'end');
    }

    // x baseline + ticks (daily vol %)
    mkLine(X0, Y_BASE, X1, Y_BASE, 'lbf-grid');
    for (let p = 0; p <= 6; p++) {
      const sd = p / 100;
      const x = xOf(sd);
      if (p > 0) mkLine(x, Y_TOP, x, Y_BASE, 'lbf-grid');
      mkText(x, Y_BASE + 17, 'lbf-axislab', `${p}%`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'lbf-axis', 'daily volatility of the pool pair', 'middle');

    // LVR quadratic curve
    const pts: string[] = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const sd = (i / steps) * SD_MAX;
      pts.push(`${i ? 'L' : 'M'}${xOf(sd).toFixed(1)},${yOf(lvrAnnual(sd, leak)).toFixed(1)}`);
    }
    const curve = document.createElementNS(NS, 'path');
    curve.setAttribute('d', pts.join(''));
    curve.setAttribute('class', 'lbf-lvr');
    gPlot.appendChild(curve);
    const lvrLabY = yOf(lvrAnnual(SD_MAX, leak));
    mkText(X1 - 4, Math.max(Y_TOP + 12, lvrLabY - 6), 'lbf-lvrlab',
      recapture ? 'LVR after recapture' : 'LVR = σ²/8', 'end');

    // fee income flat line
    const yFee = yOf(fee);
    mkLine(X0, yFee, X1, yFee, 'lbf-fee');
    mkText(X0 + 6, yFee - 6, 'lbf-feelab', `fee income ${pct(fee)}/yr`, 'start');

    // break-even marker
    if (starInRange) {
      mkLine(xStar, Y_TOP, xStar, Y_BASE, 'lbf-be');
      const anchor = xStar > X1 - 150 ? 'end' : 'start';
      mkText(xStar + (anchor === 'end' ? -6 : 6), Y_TOP + 14, 'lbf-belab',
        `break-even σ ${(sdStar * 100).toFixed(2)}%/day`, anchor);
    }

    // asset markers
    ASSETS.forEach((a, i) => {
      const x = xOf(a.dailyVol);
      const lvr = lvrAnnual(a.dailyVol, leak);
      const y = yOf(lvr);
      const win = fee >= lvr;
      const isSel = i === sel;

      mkLine(x, y, x, Y_BASE, isSel ? 'lbf-mk-sel' : 'lbf-mk');

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'lbf-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label',
        `${a.label}: ${pct(a.dailyVol, 2)} daily vol, LVR ${pct(lvr)} per year, ${win ? 'covered by' : 'above'} ${pct(fee)} fee income`);

      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'lbf-ring');
      ring.setAttribute('cx', String(x));
      ring.setAttribute('cy', String(y));
      ring.setAttribute('r', '11');
      g.appendChild(ring);

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', `lbf-dot ${win ? 'lbf-dot-win' : 'lbf-dot-lose'}`);
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', isSel ? '6' : '4.5');
      g.appendChild(dot);

      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('class', 'lbf-hit');
      hit.setAttribute('cx', String(x));
      hit.setAttribute('cy', String(y));
      hit.setAttribute('r', '16');
      g.appendChild(hit);

      const anchor = x > X1 - 90 ? 'end' : x < X0 + 60 ? 'start' : 'middle';
      const lx = anchor === 'end' ? x + 9 : anchor === 'start' ? x - 9 : x;
      const lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', String(lx));
      lab.setAttribute('y', String(y - 12));
      lab.setAttribute('text-anchor', anchor);
      lab.setAttribute('class', 'lbf-mklab');
      lab.setAttribute('fill', win ? '#22d3ee' : '#f97362');
      lab.textContent = a.label;
      g.appendChild(lab);

      const select = () => { sel = i; render(); };
      g.addEventListener('click', select);
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      nodes[i] = g;
    });

    // sync control states
    aBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel)));
    fBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === feeIdx)));
    tLab.textContent = 'daily turnover (volume ÷ TVL)';
    tVal.textContent = `${(turnover * 100).toFixed(1)}%/day`;
    rBtn.setAttribute('aria-pressed', String(recapture));
    rTxt.textContent = recapture ? 'auction recapture: ON' : 'plain AMM';

    renderPanel(feeRate, fee, leak);
  }

  function renderPanel(feeRate: number, fee: number, leak: number) {
    const a = ASSETS[sel];
    const lvr = lvrAnnual(a.dailyVol, leak);
    const net = fee - lvr;
    const win = net >= 0;
    // turnover this asset needs to break even at the current tier/mechanism
    const beTurn = (a.dailyVol * a.dailyVol * leak) / (8 * feeRate);

    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'lbf-hd';
    const name = document.createElement('span');
    name.className = 'lbf-name';
    name.textContent = `${a.label} liquidity`;
    const src = document.createElement('span');
    src.className = 'lbf-src';
    src.textContent = `${pct(a.annualVol, 0)} vol · ${TIERS[feeIdx].label} pool`;
    hd.append(name, src);

    const rows = document.createElement('div');
    rows.className = 'lbf-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div');
      r.className = 'lbf-row';
      const s = document.createElement('span');
      s.textContent = label;
      const b = document.createElement('b');
      if (cls) b.className = cls;
      b.textContent = val;
      r.append(s, b);
      return r;
    };
    rows.append(
      row('fee income', `${pct(fee)}/yr`, 'lbf-fee-c'),
      row(recapture ? 'LVR after recapture' : 'LVR (arbitrage rent)', `−${pct(lvr)}/yr`, 'lbf-lvr-c'),
      row('net to LP', `${signed(net)}/yr`, 'lbf-neutral'),
    );

    const verdict = document.createElement('div');
    verdict.className = `lbf-verdict ${win ? 'lbf-win' : 'lbf-lose'}`;
    if (win) {
      verdict.innerHTML = beTurn <= turnover
        ? `Fees clear the rent: this pool breaks even at <b>${pct(beTurn)}/day</b> turnover and you set ${pct(turnover)}. The LP keeps <b>${signed(net)}</b> a year.`
        : `Just above water at this turnover. Net <b>${signed(net)}</b>/yr — thin enough that one quiet week tips it red.`;
    } else {
      verdict.innerHTML = `Arbitrage bots win: LVR outruns fees by <b>${pct(-net)}</b>/yr. This pool needs <b>${pct(beTurn)}/day</b> turnover to break even — ${(beTurn / turnover).toFixed(1)}× what you set.`;
    }

    readout.append(hd, rows, verdict);
  }

  // arrow-key cycling across assets
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      sel = (sel + 1) % ASSETS.length; render(); nodes[sel]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      sel = (sel - 1 + ASSETS.length) % ASSETS.length; render(); nodes[sel]?.focus(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
