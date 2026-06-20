/**
 * Artifact: the-funding-skew — The Funding Skew
 * Manifest: content/artifacts/the-funding-skew/manifest.json
 *
 * A perpetual market maker's quote ladder, drawn as the Avellaneda-Stoikov
 * reservation price plus a funding term. Everything is in price units around
 * the mid S.
 *
 *   reservation r = S − γσ²(T−t)·q  −  f·(T−t)
 *                       └ inventory skew ┘   └ funding skew ┘
 *
 * with f = S·F the cash-scaled funding (quote currency per contract per hour),
 * σ the hourly volatility (real, measured from Crypto.com candles), γ the risk
 * aversion, and (T−t) the horizon in hours. The optimal half-spread is the AS
 * width δ = γσ²(T−t) + (2/γ)·ln(1+γ/k); bid/ask land at r ± δ/2.
 *
 * The teaching point: classic AS (the faint indigo line) centers on mid and
 * skews only with inventory. The funding skew f·(T−t) does NOT vanish at q=0 —
 * a flat maker under positive funding still leans short. When inventory and
 * funding share a sign the two skews stack; when they oppose they cancel.
 *
 * Drag the reservation line (cyan) to set inventory by inversion, push the
 * funding / risk / horizon sliders, or load a real ETH/BTC/SOL snapshot.
 *
 * Layout: shared responsive primitive (stage SVG ladder · panel decomposition +
 * verdict · footer presets+sliders · caption provenance). No RAF — renders on
 * input only.
 */
import data from '../../../content/artifacts/the-funding-skew/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG = 'http://www.w3.org/2000/svg';
const VB_W = 400,
  VB_H = 300;
const X0 = 70, // left edge of plot (bps axis to its left)
  X1 = 322, // right edge of plot (line labels to its right)
  Y0 = 24,
  Y1 = 268;
const Y_MID = (Y0 + Y1) / 2;
const HALF_H = (Y1 - Y0) / 2;
// Fill-decay constant in price-relative form. Risk aversion is taken per unit
// notional (γ_eff = γ̃/S) and k = k̃/S, so every skew and the spread come out in
// price-relative (bps) terms that are consistent across assets of any price —
// only the (real) volatility differs between ETH/BTC/SOL. γ̃/k̃ is the
// dimensionless ratio that sets the base liquidity spread.
const K_TILDE = 2500;

type Asset = (typeof data.assets)[number];

interface State {
  assetId: string;
  q: number; // inventory, contracts (signed)
  fundingPct: number; // F, % per hour (signed)
  gamma: number; // risk aversion, 1/$
  tauH: number; // horizon, hours
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const asset = (id: string): Asset => data.assets.find((a) => a.id === id) ?? data.assets[0];

interface Derived {
  S: number;
  sigAbs2: number; // σ² in $²/hr
  f: number; // cash funding per contract per hour ($)
  invSkew: number; // $ (mid − r_AS), >0 when long
  fundSkew: number; // $ (r_AS − r), >0 when F>0
  rAS: number; // funding-blind reservation price
  r: number; // funding-aware reservation price
  half: number; // δ/2, $
  ask: number;
  bid: number;
  carry: number; // funding P&L per hour on current inventory ($), <0 = paying
  H: number; // y half-range in $
}

function derive(s: State): Derived {
  const a = asset(s.assetId);
  const S = a.mid;
  const sig2 = a.sigmaHourly * a.sigmaHourly; // fractional hourly variance
  const sigAbs2 = sig2 * S * S; // absolute $²/hr (reported in the panel)
  const f = S * (s.fundingPct / 100);
  // γ_eff = γ̃/S, so γ_eff·σ_abs² = γ̃·σ²·S (price-relative skew).
  const invSkew = s.q * s.gamma * sig2 * S * s.tauH;
  const fundSkew = f * s.tauH;
  const rAS = S - invSkew;
  const r = rAS - fundSkew;
  const half = 0.5 * (s.gamma * sig2 * S * s.tauH + (2 * S) / s.gamma * Math.log(1 + s.gamma / K_TILDE));
  const ask = r + half;
  const bid = r - half;
  const carry = -s.q * f;
  const offs = [Math.abs(ask - S), Math.abs(bid - S), Math.abs(rAS - S), Math.abs(r - S)];
  const H = Math.max(Math.max(...offs) * 1.18, half * 1.3, S * 1e-4);
  return { S, sigAbs2, f, invSkew, fundSkew, rAS, r, half, ask, bid, carry, H };
}

const bps = (dollars: number, S: number) => (dollars / S) * 1e4;
const fmtBps = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)} bps`;
const fmtPx = (v: number) =>
  v >= 1000 ? v.toFixed(1) : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(4);
const fmtUsd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 100 ? a.toFixed(0) : a >= 1 ? a.toFixed(2) : a.toFixed(3);
  return `${v < 0 ? '−' : ''}$${s}`;
};

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '4/3',
    stageFr: '1.45fr',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;
  stage.classList.add('fs-stage');
  panel.classList.add('fs-panel');
  controlsSlot.classList.add('fs-inputs');

  const style = document.createElement('style');
  style.textContent = `
    .fs-stage { min-width:0; position:relative; }
    .fs-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono', monospace; }
    .fs-svg text { fill:#8d95ad; }
    .fs-grab { cursor:ns-resize; }
    .fs-svg .fs-handle:focus-visible { outline:2px solid #22d3ee; outline-offset:2px; border-radius:50%; }
    .fs-panel { display:flex; flex-direction:column; gap:11px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .fs-verdict { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:11px 13px; display:flex; flex-direction:column; gap:7px; min-width:0; }
    .fs-badge { align-self:flex-start; font:700 11px 'JetBrains Mono', monospace; letter-spacing:.08em;
      text-transform:uppercase; padding:4px 9px; border-radius:6px; }
    .fs-stack { color:#f0883e; background:rgba(240,136,62,.12); box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }
    .fs-cancel { color:#34d399; background:rgba(52,211,153,.12); box-shadow:inset 0 0 0 1px rgba(52,211,153,.42); }
    .fs-flat { color:#22d3ee; background:rgba(34,211,238,.12); box-shadow:inset 0 0 0 1px rgba(34,211,238,.42); }
    .fs-none { color:#8d95ad; background:rgba(141,149,173,.12); box-shadow:inset 0 0 0 1px rgba(141,149,173,.4); }
    .fs-vmsg { font-size:11px; color:#9aa2b8; min-width:0; }
    .fs-vmsg b { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .fs-rows { display:flex; flex-direction:column; gap:1px; min-width:0;
      border:1px solid rgba(124,140,255,.12); border-radius:10px; overflow:hidden; }
    .fs-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px;
      padding:6px 10px; background:#0a0f1b; min-width:0; flex-wrap:wrap; }
    .fs-row .fs-k { font-size:10px; letter-spacing:.03em; text-transform:uppercase; color:#5b6378;
      display:flex; align-items:center; gap:6px; min-width:0; }
    .fs-row .fs-v { font-size:11.5px; color:#e7eaf3; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .fs-row.fs-tot { background:#0d1322; }
    .fs-row.fs-tot .fs-v { color:#22d3ee; }
    .fs-sw { width:10px; height:3px; border-radius:2px; flex:none; }
    .fs-carry { font-size:10.5px; color:#8d95ad; line-height:1.5; border-top:1px solid rgba(124,140,255,.12);
      padding-top:8px; }
    .fs-carry b { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .fs-pay { color:#f0883e; } .fs-earn { color:#34d399; }
    .fs-inputs { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .fs-presets { display:flex; flex-wrap:wrap; gap:8px; min-width:0; max-width:100%; }
    .fs-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:#22d3ee; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.05em; text-transform:uppercase; padding:7px 11px; white-space:nowrap; }
    .fs-preset:hover, .fs-preset:focus-visible { border-color:#22d3ee; outline:none; }
    .fs-preset.fs-on { background:rgba(34,211,238,.12); box-shadow:0 0 12px rgba(34,211,238,.22); }
    .fs-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));
      gap:9px 16px; align-items:end; min-width:0; max-width:100%; }
    .fs-field { min-width:0; max-width:100%; }
    .fs-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .fs-field output { color:#e7eaf3; font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .fs-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0;
      accent-color:#7c8cff; }
    .fs-field.fs-fund input { accent-color:#22d3ee; }
    .fs-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .fs-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  const a0 = asset('ETH');
  const state: State = {
    assetId: 'ETH',
    q: 0,
    fundingPct: a0.fundingHourlyPct,
    gamma: 1.0,
    tauH: 4,
  };

  /* ---------- SVG scaffold ---------- */
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'fs-svg');
  svg.setAttribute('role', 'img');
  const mk = (tag: string, attrs: Record<string, string | number> = {}) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
    return el;
  };

  // spread band
  const band = mk('rect', { x: X0, fill: 'rgba(124,140,255,.07)', stroke: 'rgba(124,140,255,.16)',
    'stroke-width': 1, rx: 2, width: X1 - X0 });
  // axis frame
  mk('line', { x1: X0, y1: Y0, x2: X0, y2: Y1, stroke: 'rgba(124,140,255,.22)', 'stroke-width': 1 });
  // y ticks (bps): pool of 5
  const yticks = [0, 1, 2, 3, 4].map(() => {
    const t = document.createElementNS(SVG, 'line');
    t.setAttribute('stroke', 'rgba(124,140,255,.1)');
    t.setAttribute('stroke-width', '1');
    svg.appendChild(t);
    const lbl = document.createElementNS(SVG, 'text');
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('font-size', '8');
    svg.appendChild(lbl);
    return { t, lbl };
  });
  mk('text', { x: X0 - 6, y: Y0 - 10, 'text-anchor': 'end', 'font-size': 8, fill: '#5b6378' }).textContent =
    'bps vs mid';

  // skew brackets (drawn near left interior): inventory (indigo), funding (cyan)
  const invBar = mk('line', { stroke: '#7c8cff', 'stroke-width': 3, 'stroke-linecap': 'round' });
  const fundBar = mk('line', { stroke: '#22d3ee', 'stroke-width': 3, 'stroke-linecap': 'round' });

  // mid line
  const midLine = mk('line', { x1: X0, x2: X1, stroke: '#5b6378', 'stroke-width': 1,
    'stroke-dasharray': '4 4' });
  const midLbl = mk('text', { 'font-size': 8.5, fill: '#8d95ad', 'text-anchor': 'start' });
  midLbl.textContent = 'mid S';

  // classic AS reservation (funding-blind)
  const asLine = mk('line', { x1: X0, x2: X1, stroke: '#7c8cff', 'stroke-width': 1.25,
    'stroke-dasharray': '2 3', opacity: 0.85 });
  const asLbl = mk('text', { 'font-size': 8, fill: '#7c8cff', 'text-anchor': 'start' });
  asLbl.textContent = 'AS r';

  // ask / bid
  const askLine = mk('line', { x1: X0, x2: X1, stroke: '#f0883e', 'stroke-width': 1.5 });
  const askLbl = mk('text', { 'font-size': 8.5, fill: '#f0883e', 'text-anchor': 'start' });
  const bidLine = mk('line', { x1: X0, x2: X1, stroke: '#34d399', 'stroke-width': 1.5 });
  const bidLbl = mk('text', { 'font-size': 8.5, fill: '#34d399', 'text-anchor': 'start' });

  // funding-aware reservation (the hero) + draggable handle
  const rGlow = mk('line', { x1: X0, x2: X1, stroke: 'rgba(34,211,238,.25)', 'stroke-width': 5,
    'stroke-linecap': 'round' });
  const rLine = mk('line', { x1: X0, x2: X1, stroke: '#22d3ee', 'stroke-width': 2 });
  const rLbl = mk('text', { 'font-size': 8.5, fill: '#22d3ee', 'text-anchor': 'start', 'font-weight': 700 });
  rLbl.textContent = 'r';
  // transparent drag surface (above lines, below handle) for grabbing anywhere
  const dragSurface = mk('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0,
    fill: 'transparent', class: 'fs-grab' });
  const handle = document.createElementNS(SVG, 'circle');
  handle.setAttribute('r', '6');
  handle.setAttribute('fill', '#22d3ee');
  handle.setAttribute('stroke', '#0a0f1b');
  handle.setAttribute('stroke-width', '1.5');
  handle.setAttribute('cx', String((X0 + X1) / 2));
  handle.setAttribute('class', 'fs-handle fs-grab');
  handle.setAttribute('tabindex', '0');
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'inventory (drag vertically)');
  svg.appendChild(handle);

  stage.appendChild(svg);

  /* ---------- Panel ---------- */
  const verdict = document.createElement('div');
  verdict.className = 'fs-verdict';
  const badge = document.createElement('span');
  badge.className = 'fs-badge';
  const vmsg = document.createElement('div');
  vmsg.className = 'fs-vmsg';
  verdict.append(badge, vmsg);
  panel.appendChild(verdict);

  const rows = document.createElement('div');
  rows.className = 'fs-rows';
  const mkRow = (key: string, label: string, sw?: string) => {
    const row = document.createElement('div');
    row.className = `fs-row${key === 'total' ? ' fs-tot' : ''}`;
    const k = document.createElement('span');
    k.className = 'fs-k';
    if (sw) {
      const s = document.createElement('span');
      s.className = 'fs-sw';
      s.style.background = sw;
      k.appendChild(s);
    }
    k.appendChild(document.createTextNode(label));
    const v = document.createElement('span');
    v.className = 'fs-v';
    row.append(k, v);
    rows.appendChild(row);
    return v;
  };
  const vInv = mkRow('inv', 'inventory skew', '#7c8cff');
  const vFund = mkRow('fund', 'funding skew', '#22d3ee');
  const vTot = mkRow('total', 'reservation shift');
  const vSpread = mkRow('spread', 'half-spread δ/2');
  const vQuote = mkRow('quote', 'bid · ask');
  panel.appendChild(rows);

  const carry = document.createElement('div');
  carry.className = 'fs-carry';
  panel.appendChild(carry);

  /* ---------- Controls ---------- */
  const presetWrap = document.createElement('div');
  presetWrap.className = 'fs-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const a of data.assets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fs-preset';
    btn.textContent = `◆ ${a.label}`;
    btn.title = `σ ${a.sigmaAnnualPct}%/yr · funding half-life ${a.halfLifeH}h`;
    presetWrap.appendChild(btn);
    presetBtns.set(a.id, btn);
  }
  controlsSlot.appendChild(presetWrap);

  const fields = document.createElement('div');
  fields.className = 'fs-fields';
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'q', label: 'inventory  q', cls: '', min: -a0.qMax, max: a0.qMax, step: a0.qStep, init: state.q },
    { id: 'fund', label: 'funding  F  (%/h)', cls: 'fs-fund', min: -0.02, max: 0.02, step: 0.0005, init: state.fundingPct },
    { id: 'gamma', label: 'risk aversion  γ', cls: '', min: 0.2, max: 3, step: 0.1, init: state.gamma },
    { id: 'tau', label: 'horizon  T−t  (h)', cls: '', min: 0.5, max: 12, step: 0.5, init: state.tauH },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = `fs-field ${d.cls}`.trim();
    const label = document.createElement('label');
    label.htmlFor = `fs-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `fs-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.init);
    input.setAttribute('aria-label', d.label);
    field.append(label, input);
    fields.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }
  controlsSlot.appendChild(fields);

  /* ---------- Caption ---------- */
  const cap = document.createElement('div');
  cap.className = 'fs-cap';
  cap.innerHTML =
    `<b>r = S − γσ²(T−t)·q − f·(T−t)</b>, f = S·F. The inventory skew (indigo) is classic ` +
    `Avellaneda-Stoikov; the funding skew (cyan) is the perp term — it survives at q = 0. ` +
    `σ is real (Crypto.com hourly candles, 2026-06-20): BTC ${asset('BTC').sigmaAnnualPct}%, ` +
    `ETH ${asset('ETH').sigmaAnnualPct}%, SOL ${asset('SOL').sigmaAnnualPct}%/yr. ` +
    `Drag the cyan line (or tab to it, ← →) to set inventory. Half-spread uses a fixed fill decay k; illustrative.`;
  caption.appendChild(cap);

  /* ---------- Geometry ---------- */
  let d: Derived = derive(state);
  const yOff = (off: number) => Y_MID - (off / d.H) * HALF_H; // off in $ from mid

  /* ---------- Render ---------- */
  function render() {
    d = derive(state);
    const S = d.S;

    // y ticks at offsets [-H,-H/2,0,H/2,H]
    [-d.H, -d.H / 2, 0, d.H / 2, d.H].forEach((off, i) => {
      const { t, lbl } = yticks[i];
      const y = yOff(off);
      t.setAttribute('x1', String(X0));
      t.setAttribute('x2', String(X1));
      t.setAttribute('y1', String(y));
      t.setAttribute('y2', String(y));
      t.style.display = i === 2 ? 'none' : '';
      lbl.setAttribute('x', String(X0 - 6));
      lbl.setAttribute('y', String(y + 3));
      lbl.textContent = (off >= 0 ? '+' : '−') + Math.abs(bps(off, S)).toFixed(0);
    });

    const yMidPx = yOff(0);
    const yAS = yOff(d.rAS - S);
    const yR = yOff(d.r - S);
    const yAsk = yOff(d.ask - S);
    const yBid = yOff(d.bid - S);

    band.setAttribute('y', String(Math.min(yAsk, yBid)));
    band.setAttribute('height', String(Math.abs(yBid - yAsk)));

    const setLine = (ln: Element, y: number) => {
      ln.setAttribute('y1', String(y));
      ln.setAttribute('y2', String(y));
    };
    setLine(midLine, yMidPx);
    midLbl.setAttribute('x', String(X1 + 6));
    midLbl.setAttribute('y', String(yMidPx + 3));

    // classic AS reservation differs from mid only via inventory; at q=0 it IS
    // the mid line, so hide it (and its label) to avoid doubling up.
    setLine(asLine, yAS);
    const showAS = Math.abs(d.invSkew) > 1e-9;
    const asApart = Math.abs(yAS - yR) > 8 && Math.abs(yAS - yMidPx) > 8;
    asLine.style.display = showAS ? '' : 'none';
    asLbl.style.display = showAS && asApart ? '' : 'none';
    asLbl.setAttribute('x', String(X1 + 6));
    asLbl.setAttribute('y', String(yAS + 3));

    setLine(askLine, yAsk);
    askLbl.setAttribute('x', String(X1 + 6));
    askLbl.setAttribute('y', String(yAsk + 3));
    setLine(bidLine, yBid);
    bidLbl.setAttribute('x', String(X1 + 6));
    bidLbl.setAttribute('y', String(yBid + 3));

    setLine(rGlow, yR);
    setLine(rLine, yR);
    rLbl.setAttribute('x', String(X1 + 6));
    rLbl.setAttribute('y', String(yR - 4));
    handle.setAttribute('cy', String(yR));
    handle.setAttribute('aria-valuemin', String(-asset(state.assetId).qMax));
    handle.setAttribute('aria-valuemax', String(asset(state.assetId).qMax));
    handle.setAttribute('aria-valuenow', String(state.q));
    handle.setAttribute('aria-valuetext', `inventory ${state.q.toFixed(2)} contracts`);

    // skew bars near left interior (x just inside the axis)
    const xb1 = X0 + 9, xb2 = X0 + 17;
    invBar.setAttribute('x1', String(xb1));
    invBar.setAttribute('x2', String(xb1));
    invBar.setAttribute('y1', String(yMidPx));
    invBar.setAttribute('y2', String(yAS));
    invBar.style.display = Math.abs(d.invSkew) > 1e-9 ? '' : 'none';
    fundBar.setAttribute('x1', String(xb2));
    fundBar.setAttribute('x2', String(xb2));
    fundBar.setAttribute('y1', String(yAS));
    fundBar.setAttribute('y2', String(yR));
    fundBar.style.display = Math.abs(d.fundSkew) > 1e-9 ? '' : 'none';

    // outputs
    const aSet = asset(state.assetId);
    outputs.get('q')!.textContent = `${state.q > 0 ? '+' : ''}${state.q.toFixed(aSet.qStep < 1 ? 2 : 0)}`;
    outputs.get('fund')!.textContent = `${state.fundingPct >= 0 ? '+' : '−'}${Math.abs(state.fundingPct).toFixed(4)}`;
    outputs.get('gamma')!.textContent = state.gamma.toFixed(1);
    outputs.get('tau')!.textContent = `${state.tauH}h`;

    renderPanel();
  }

  function renderPanel() {
    const S = d.S;
    const invB = bps(d.invSkew, S); // >0 long → reservation below mid
    const fundB = bps(d.fundSkew, S); // >0 funding positive → reservation below mid
    const totB = bps(d.S - d.r, S);
    vInv.textContent = `${fmtBps(-invB)} ${state.q === 0 ? '(flat)' : ''}`.trim();
    vFund.textContent = fmtBps(-fundB);
    vTot.textContent = fmtBps(-totB);
    vSpread.textContent = `±${bps(d.half, S).toFixed(2)} bps`;
    vQuote.textContent = `${fmtPx(d.bid)} · ${fmtPx(d.ask)}`;

    // carry
    const annual = state.fundingPct * 24 * 365;
    if (Math.abs(state.q) < 1e-9) {
      carry.innerHTML =
        `Flat book — no funding carry yet. Funding is <b>${state.fundingPct >= 0 ? '+' : '−'}${Math.abs(state.fundingPct).toFixed(4)}%/h</b> ` +
        `(${annual >= 0 ? '+' : '−'}${Math.abs(annual).toFixed(0)}%/yr), so the next contract you take on the long side pays it.`;
    } else {
      const paying = d.carry < 0;
      carry.innerHTML =
        `Carry on ${state.q > 0 ? 'long' : 'short'} ${Math.abs(state.q).toFixed(asset(state.assetId).qStep < 1 ? 2 : 0)}: ` +
        `<b class="${paying ? 'fs-pay' : 'fs-earn'}">${fmtUsd(d.carry)}/h</b> ` +
        `<span class="${paying ? 'fs-pay' : 'fs-earn'}">${paying ? '(you pay)' : '(you earn)'}</span> — ` +
        `${paying ? 'inventory and funding share a sign.' : 'funding pays you to hold this side.'}`;
    }

    // verdict
    const F = state.fundingPct;
    const qz = Math.abs(state.q) < 1e-9;
    const fz = Math.abs(F) < 1e-9;
    if (fz) {
      badge.className = 'fs-badge fs-none';
      badge.textContent = 'no funding · pure AS';
      vmsg.innerHTML =
        `Funding is zero, so the perp quotes like an equity: the cyan and indigo lines coincide and the skew is inventory only.`;
    } else if (qz) {
      const dir = F > 0 ? 'short' : 'long';
      badge.className = 'fs-badge fs-flat';
      badge.textContent = 'flat book · still skewed';
      vmsg.innerHTML =
        `At q = 0 the inventory skew is zero, yet the funding-aware quote sits <b>${fmtBps(-fundB)}</b> off mid — ` +
        `a flat maker leans <b>${dir}</b>. Funding-blind AS quotes symmetrically and gets adversely selected into the side funding charges for.`;
    } else if (Math.sign(state.q) === Math.sign(F)) {
      badge.className = 'fs-badge fs-stack';
      badge.textContent = 'aligned · skews stack';
      vmsg.innerHTML =
        `Inventory and funding share a sign — you're holding the side that <b>pays</b> funding. ` +
        `The two skews add to <b>${fmtBps(-totB)}</b>; the maker quotes hard to flatten before the next settlement.`;
    } else {
      badge.className = 'fs-badge fs-cancel';
      badge.textContent = 'opposed · skews cancel';
      vmsg.innerHTML =
        `Funding has gone your way — it <b>pays you</b> to hold this inventory. The funding skew offsets the inventory skew ` +
        `(net <b>${fmtBps(-totB)}</b>), so the maker holds the position longer instead of rushing to dump it.`;
    }
  }

  /* ---------- Interaction ---------- */
  // Drag the reservation line → infer inventory q by inversion of r(q).
  function clientYToQ(clientY: number): number {
    const rect = svg.getBoundingClientRect();
    const vy = ((clientY - rect.top) / rect.height) * VB_H;
    const off = ((Y_MID - vy) / HALF_H) * d.H; // $ above mid
    const rDesired = d.S + off;
    const aSet = asset(state.assetId);
    const denom = state.gamma * aSet.sigmaHourly * aSet.sigmaHourly * d.S * state.tauH;
    // r = S − denom·q − fundSkew  ⇒  q = (S − fundSkew − rDesired)/denom
    const q = denom > 1e-12 ? (d.S - d.fundSkew - rDesired) / denom : 0;
    return clamp(q, -aSet.qMax, aSet.qMax);
  }
  let dragging = false;
  function onDown(e: PointerEvent) {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    state.q = clientYToQ(e.clientY);
    sliders.get('q')!.value = String(state.q);
    render();
    e.preventDefault();
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    state.q = clientYToQ(e.clientY);
    sliders.get('q')!.value = String(state.q);
    render();
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  }
  dragSurface.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  function onKey(e: KeyboardEvent) {
    const aSet = asset(state.assetId);
    const step = aSet.qStep * (e.shiftKey ? 5 : 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      state.q = clamp(state.q + step, -aSet.qMax, aSet.qMax);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      state.q = clamp(state.q - step, -aSet.qMax, aSet.qMax);
    } else return;
    sliders.get('q')!.value = String(state.q);
    render();
    e.preventDefault();
  }
  handle.addEventListener('keydown', onKey);

  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    switch (this.id) {
      case 'fs-q':
        state.q = v;
        break;
      case 'fs-fund':
        state.fundingPct = v;
        break;
      case 'fs-gamma':
        state.gamma = v;
        break;
      case 'fs-tau':
        state.tauH = v;
        break;
    }
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  function applyPreset(id: string) {
    const a = asset(id);
    state.assetId = id;
    state.q = 0;
    state.fundingPct = a.fundingHourlyPct;
    const qS = sliders.get('q')!;
    qS.min = String(-a.qMax);
    qS.max = String(a.qMax);
    qS.step = String(a.qStep);
    qS.value = '0';
    sliders.get('fund')!.value = String(a.fundingHourlyPct);
    for (const [pid, btn] of presetBtns) btn.classList.toggle('fs-on', pid === id);
    render();
  }
  const presetHandlers = new Map<string, () => void>();
  for (const [id, btn] of presetBtns) {
    const h = () => applyPreset(id);
    presetHandlers.set(id, h);
    btn.addEventListener('click', h);
  }
  presetBtns.get('ETH')?.classList.add('fs-on');

  render();

  return () => {
    layout.dispose();
    dragSurface.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    handle.removeEventListener('keydown', onKey);
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    for (const [id, btn] of presetBtns) {
      const h = presetHandlers.get(id);
      if (h) btn.removeEventListener('click', h);
    }
    style.remove();
  };
}
