/**
 * Artifact: the-x402-fee-floor — The x402 Fee Floor
 * Manifest: content/artifacts/the-x402-fee-floor/manifest.json
 *
 * A calculator for the economics of a single gasless x402 settlement
 * (EIP-3009 `transferWithAuthorization`), anchored on the real decoded Base
 * settlement the companion article dissected: 86,298 L2 gas + a tiny blob-priced
 * L1 data component, 0.01 gwei effective, moving $0.013104 for $0.00144 all-in —
 * an ~11% gas-to-value ratio.
 *
 * The reader pushes on payment size, effective gas price and ETH price (and a
 * facilitator-subsidy / card-rail toggle) and watches three things move:
 *   • the gas-to-value ratio and its viability band,
 *   • the "fee floor" — the payment size below which gas exceeds the payment
 *     itself (break-even) and the size below which the ratio tops 10%, and
 *   • how the all-in cost compares to the card-rail floor ($0.30 + 2.9%).
 * The value axis is a log scale you can tap/drag; defaults reproduce the real
 * on-chain settlement exactly. No RAF loop — renders only on input.
 *
 * Model (all constants sourced, see data.json):
 *   gasWei   = l2Gas · gwei · 1e9 + l1DataWei        (l1DataWei = blob snapshot)
 *   gasUsd   = gasWei · 1e-18 · ethUsd
 *   ratio    = gasUsd / value
 *   V_breakeven = gasUsd       (ratio = 100%)
 *   V_10        = gasUsd / 0.10 (ratio = 10%)
 *
 * Layout: shared responsive primitive — stage fee-floor axis · panel readout ·
 * footer controls · caption provenance.
 */
import data from '../../../content/artifacts/the-x402-fee-floor/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const S = data.settlement;
const CARD = data.cardRail;

/* Value-axis bounds (USD, log scale). */
const VMIN = 0.0001;
const VMAX = 100;
const LGMIN = Math.log10(VMIN);
const LGSPAN = Math.log10(VMAX) - LGMIN;

/* SVG plot geometry. */
const VW = 600;
const VH = 150;
const PX0 = 20;
const PX1 = 580;
const AXIS_Y = 96;

/* Band palette. */
const GREEN = '#4ade80'; // viable  (< 10%)
const AMBER = '#f0883e'; // heavy   (10–100%)
const RED = '#f87171'; //   underwater (> 100%)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const logPos = (v: number) => (Math.log10(clamp(v, VMIN, VMAX)) - LGMIN) / LGSPAN; // 0..1
const posToVal = (p: number) => Math.pow(10, LGMIN + clamp(p, 0, 1) * LGSPAN);
const xPx = (v: number) => PX0 + logPos(v) * (PX1 - PX0);

function usd(n: number): string {
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(5)}`;
  return `$${n.toExponential(2)}`;
}
function pct(n: number): string {
  if (n >= 1000) return `${Math.round(n).toLocaleString('en-US')}%`;
  if (n >= 100) return `${n.toFixed(0)}%`;
  if (n >= 10) return `${n.toFixed(1)}%`;
  return `${n.toFixed(2)}%`;
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(150px, 34vw, 190px)',
  });
  const { stage, panel, controls, caption } = layout;

  /* ── state ──────────────────────────────────────────────────────────────── */
  let value = S.valueUsd;
  let gwei = S.effectiveGweiL2;
  let ethUsd = S.impliedEthUsd;
  let subsidy = true; // relayer/facilitator eats the gas (the snapshot's case)
  let cdpFee = false; // + CDP facilitator fee $0.001/tx after the free tier

  /* ── styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .xff-stage, .xff-panel, .xff-ctls, .xff-cap {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; min-width:0; }
    .xff-stage { display:flex; flex-direction:column; justify-content:center; min-width:0; }
    .xff-axiscard { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 12px 6px; }
    .xff-axiscard svg { width:100%; height:auto; display:block; touch-action:pan-y; cursor:ew-resize; }
    .xff-ztick { font:600 7px 'JetBrains Mono',monospace; fill:#4a5268; text-anchor:middle; }
    .xff-zlbl  { font:700 8px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; text-anchor:middle; }
    .xff-mk    { font:600 7.5px 'JetBrains Mono',monospace; fill:#8d95ad; }
    .xff-handle-lbl { font:700 9px 'JetBrains Mono',monospace; text-anchor:middle; }
    .xff-handle-sub { font:600 7.5px 'JetBrains Mono',monospace; text-anchor:middle; }

    .xff-panel { display:flex; flex-direction:column; gap:8px; }
    .xff-ratio { border:1px solid rgba(124,140,255,.16); border-radius:10px;
      padding:9px 11px; background:#0d1322; display:flex; flex-direction:column; gap:3px;
      transition:border-color .2s, background .2s; }
    .xff-ratio-hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .xff-ratio-lbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .xff-ratio-val { font:700 20px 'JetBrains Mono',monospace; line-height:1; font-variant-numeric:tabular-nums; }
    .xff-ratio-band { font:700 8px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; padding:2px 7px; border-radius:5px; white-space:nowrap; }
    .xff-ratio-sub { font-size:9px; color:#5b6378; overflow-wrap:anywhere; }

    .xff-grid { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:3px 10px; }
    .xff-grid dt { color:#5b6378; font-size:10px; min-width:0; }
    .xff-grid dd { margin:0; color:#e7eaf3; text-align:right; font-variant-numeric:tabular-nums;
      min-width:0; overflow-wrap:anywhere; }
    .xff-grid dd b { color:#fff; font-weight:700; }
    .xff-grid dd.xff-good { color:#6ee7b7; }
    .xff-grid dd.xff-bad { color:#f87171; }

    .xff-verdict { font-size:10.5px; line-height:1.5; color:#8d95ad; border-top:1px solid rgba(124,140,255,.1);
      padding-top:7px; overflow-wrap:anywhere; }
    .xff-verdict b { color:#e7eaf3; font-weight:700; }
    .xff-real { display:inline-flex; align-items:center; gap:5px; align-self:flex-start;
      font:700 8px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase;
      color:#6ee7b7; background:rgba(74,222,128,.1); border:1px solid rgba(74,222,128,.32);
      border-radius:5px; padding:3px 7px; }

    .xff-ctls { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr);
      gap:9px 16px; align-items:end; }
    .xff-field { min-width:0; }
    .xff-field label { display:flex; justify-content:space-between; gap:6px; font-size:9.5px;
      letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .xff-field output { color:#e7eaf3; font-weight:700; }
    .xff-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:4px 0 0; }
    .xff-toggles { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .xff-toggle { display:inline-flex; align-items:center; gap:6px; padding:5px 9px;
      border:1px solid rgba(124,140,255,.2); border-radius:9px; cursor:pointer; color:#8d95ad;
      font:600 9px 'JetBrains Mono',monospace; letter-spacing:.04em; text-transform:uppercase;
      user-select:none; white-space:nowrap; }
    .xff-toggle:has(input:checked) { color:#e7eaf3; border-color:rgba(34,211,238,.5); background:rgba(34,211,238,.08); }
    .xff-toggle input { accent-color:#22d3ee; cursor:pointer; margin:0; }
    .xff-reset { margin-left:auto; border:1px solid rgba(124,140,255,.2); border-radius:9px;
      background:#0d1322; color:#8d95ad; cursor:pointer; padding:5px 10px;
      font:700 9px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase; white-space:nowrap; }
    .xff-reset:hover { color:#e7eaf3; border-color:rgba(124,140,255,.42); }

    .xff-cap { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; overflow-wrap:anywhere; }
    .xff-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);
  stage.classList.add('xff-stage');
  panel.classList.add('xff-panel');
  controls.classList.add('xff-ctls');
  caption.classList.add('xff-cap');

  /* ── stage: the fee-floor axis ──────────────────────────────────────────── */
  const axisCard = document.createElement('div');
  axisCard.className = 'xff-axiscard';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Logarithmic payment-value axis. Coloured bands mark where settlement gas is under 10% of the payment (viable), 10–100% (heavy), and over 100% (underwater). A handle marks the current payment.',
  });

  // zone rects (positions recomputed in render)
  const zUnder = svgEl('rect', { x: String(PX0), y: String(AXIS_Y - 9), height: '18', fill: 'rgba(248,113,113,.14)' });
  const zHeavy = svgEl('rect', { y: String(AXIS_Y - 9), height: '18', fill: 'rgba(240,136,62,.13)' });
  const zViable = svgEl('rect', { y: String(AXIS_Y - 9), height: '18', fill: 'rgba(74,222,128,.12)' });
  svg.append(zUnder, zHeavy, zViable);

  // axis baseline
  svg.appendChild(svgEl('line', { x1: String(PX0), y1: String(AXIS_Y + 9), x2: String(PX1), y2: String(AXIS_Y + 9), stroke: 'rgba(124,140,255,.22)', 'stroke-width': '1' }));

  // decade ticks
  for (let e = -4; e <= 2; e++) {
    const v = Math.pow(10, e);
    const x = xPx(v);
    svg.appendChild(svgEl('line', { x1: String(x), y1: String(AXIS_Y + 9), x2: String(x), y2: String(AXIS_Y + 13), stroke: 'rgba(124,140,255,.25)', 'stroke-width': '1' }));
    const t = svgEl('text', { x: String(x), y: String(AXIS_Y + 23), class: 'xff-ztick' });
    t.textContent = v >= 1 ? `$${v}` : `$${v.toString().replace(/^0/, '')}`;
    svg.appendChild(t);
  }

  // band labels (above zones)
  const lblUnder = svgEl('text', { y: String(AXIS_Y - 15), class: 'xff-zlbl', fill: RED });
  lblUnder.textContent = 'underwater';
  const lblHeavy = svgEl('text', { y: String(AXIS_Y - 15), class: 'xff-zlbl', fill: AMBER });
  lblHeavy.textContent = 'heavy';
  const lblViable = svgEl('text', { y: String(AXIS_Y - 15), class: 'xff-zlbl', fill: GREEN });
  lblViable.textContent = 'viable · <10%';
  svg.append(lblUnder, lblHeavy, lblViable);

  // floor markers (break-even + 10% line)
  const beLine = svgEl('line', { y1: String(AXIS_Y - 9), y2: String(AXIS_Y + 9), stroke: RED, 'stroke-width': '1.3', 'stroke-dasharray': '3 3' });
  const beTxt = svgEl('text', { y: String(AXIS_Y + 44), class: 'xff-mk', fill: RED, 'text-anchor': 'middle' });
  beTxt.textContent = 'break-even';
  const tenLine = svgEl('line', { y1: String(AXIS_Y - 9), y2: String(AXIS_Y + 9), stroke: AMBER, 'stroke-width': '1.3', 'stroke-dasharray': '3 3' });
  const tenTxt = svgEl('text', { y: String(AXIS_Y + 44), class: 'xff-mk', fill: AMBER, 'text-anchor': 'middle' });
  tenTxt.textContent = '10%';
  svg.append(beLine, beTxt, tenLine, tenTxt);

  // current-value handle
  const handleStem = svgEl('line', { y1: String(AXIS_Y - 11), y2: String(AXIS_Y + 11), stroke: '#e7eaf3', 'stroke-width': '1.4' });
  const handleDot = svgEl('circle', { cy: String(AXIS_Y), r: '6', stroke: '#05070d', 'stroke-width': '1.5' });
  const handleLbl = svgEl('text', { y: String(AXIS_Y - 30), class: 'xff-handle-lbl', fill: '#e7eaf3' });
  const handleSub = svgEl('text', { y: String(AXIS_Y - 19), class: 'xff-handle-sub' });
  svg.append(handleStem, handleDot, handleLbl, handleSub);

  axisCard.appendChild(svg);
  stage.appendChild(axisCard);

  /* ── panel ──────────────────────────────────────────────────────────────── */
  const ratioBox = document.createElement('div');
  ratioBox.className = 'xff-ratio';
  const ratioHd = document.createElement('div');
  ratioHd.className = 'xff-ratio-hd';
  const ratioLbl = document.createElement('span');
  ratioLbl.className = 'xff-ratio-lbl';
  ratioLbl.textContent = 'gas-to-value ratio';
  const ratioBand = document.createElement('span');
  ratioBand.className = 'xff-ratio-band';
  ratioHd.append(ratioLbl, ratioBand);
  const ratioVal = document.createElement('div');
  ratioVal.className = 'xff-ratio-val';
  const ratioSub = document.createElement('div');
  ratioSub.className = 'xff-ratio-sub';
  ratioBox.append(ratioHd, ratioVal, ratioSub);
  panel.appendChild(ratioBox);

  const dl = document.createElement('dl');
  dl.className = 'xff-grid';
  const mkRow = (label: string) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dl.append(dt, dd);
    return dd;
  };
  const ddValue = mkRow('payment moved');
  const ddGas = mkRow('settlement gas');
  const ddAllIn = mkRow('payer all-in');
  const ddNet = mkRow('server receives');
  const ddCard = mkRow('card rail would cost');
  panel.appendChild(dl);

  const verdict = document.createElement('div');
  verdict.className = 'xff-verdict';
  panel.appendChild(verdict);

  const realChip = document.createElement('span');
  realChip.className = 'xff-real';
  realChip.textContent = '↩ real 2026-06-12 Base settlement';
  panel.appendChild(realChip);

  /* ── controls ───────────────────────────────────────────────────────────── */
  const mkSlider = (
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    val: number,
  ) => {
    const field = document.createElement('div');
    field.className = 'xff-field';
    const lab = document.createElement('label');
    lab.htmlFor = `xff-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `xff-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(val);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };

  // payment value uses a 0..1000 log slider under the hood
  const valSlider = mkSlider('value', 'payment value', 0, 1000, 1, logPos(value) * 1000);
  const gweiSlider = mkSlider('gwei', 'effective gas price (gwei)', 0.001, 30, 0.001, gwei);
  const ethSlider = mkSlider('eth', 'eth price (usd)', 800, 5000, 1, ethUsd);

  const toggleRow = document.createElement('div');
  toggleRow.className = 'xff-toggles';

  const mkToggle = (labelText: string, checked: boolean) => {
    const wrap = document.createElement('label');
    wrap.className = 'xff-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', labelText);
    wrap.append(input, document.createTextNode(labelText));
    toggleRow.appendChild(wrap);
    return input;
  };
  const subsidyInput = mkToggle('facilitator subsidises gas', true);
  const cdpInput = mkToggle('+ cdp fee $0.001/tx', false);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'xff-reset';
  resetBtn.textContent = '↩ real settlement';
  toggleRow.appendChild(resetBtn);
  controls.appendChild(toggleRow);

  /* ── caption ────────────────────────────────────────────────────────────── */
  caption.innerHTML =
    `Drag the axis or the <b>payment value</b> slider; defaults reproduce settlement <b>${S.txShort}</b> ` +
    `(${S.l2GasUnits.toLocaleString('en-US')} L2 gas + blob data, ${S.effectiveGweiL2} gwei → <b>${usd(S.totalCostUsd)}</b> moving <b>${usd(S.valueUsd)}</b>). ` +
    `Card-rail floor $${CARD.fixedUsd.toFixed(2)} + ${(CARD.pctFee * 100).toFixed(1)}%.`;

  /* ── compute + render ───────────────────────────────────────────────────── */
  const EPS = 1e-9;
  function gasUsdFor(): number {
    const gasWei = S.l2GasUnits * gwei * 1e9 + S.l1DataWei;
    return gasWei * 1e-18 * ethUsd;
  }

  function isReal(): boolean {
    return (
      Math.abs(value - S.valueUsd) < 1e-6 &&
      Math.abs(gwei - S.effectiveGweiL2) < 1e-6 &&
      Math.abs(ethUsd - S.impliedEthUsd) < 0.5 &&
      subsidy &&
      !cdpFee
    );
  }

  function render(): void {
    const gasUsd = gasUsdFor();
    const l2Usd = S.l2GasUnits * gwei * 1e9 * 1e-18 * ethUsd;
    const l1Usd = S.l1DataWei * 1e-18 * ethUsd;
    const ratio = (gasUsd / value) * 100;
    const facFee = cdpFee ? data.facilitator.perTxUsdAfter : 0;
    const payerGas = subsidy ? 0 : gasUsd;
    const allIn = value + facFee + payerGas;
    const cardCost = CARD.fixedUsd + CARD.pctFee * value;

    // floor thresholds on the value axis
    const vBreakeven = gasUsd; // ratio = 100%
    const vTen = gasUsd / 0.1; // ratio = 10%

    // slider outputs
    valSlider.out.textContent = usd(value);
    gweiSlider.out.textContent = `${gwei < 0.1 ? gwei.toFixed(3) : gwei.toFixed(2)}`;
    ethSlider.out.textContent = `$${Math.round(ethUsd).toLocaleString('en-US')}`;

    // band classification
    let band: string, bandColor: string;
    if (ratio > 100) { band = 'underwater'; bandColor = RED; }
    else if (ratio >= 10) { band = 'heavy'; bandColor = AMBER; }
    else { band = 'viable'; bandColor = GREEN; }

    ratioVal.textContent = pct(ratio);
    ratioVal.style.color = bandColor;
    ratioBand.textContent = band;
    ratioBand.style.color = bandColor;
    ratioBand.style.background = `${bandColor}1c`;
    ratioBand.style.border = `1px solid ${bandColor}55`;
    ratioBox.style.borderColor = `${bandColor}40`;
    ratioSub.textContent = `${usd(gasUsd)} gas on ${usd(value)} moved`;

    ddValue.textContent = `${usd(value)} · ${Math.round(value / (S.valueUsd / S.valueBaseUnits)).toLocaleString('en-US')} units`;
    ddGas.innerHTML = `<b>${usd(gasUsd)}</b> · L2 ${usd(l2Usd)} + data ${usd(l1Usd)}`;
    ddGas.className = ratio > 100 ? 'xff-bad' : '';
    ddAllIn.textContent = subsidy && !cdpFee ? `${usd(value)} (gas subsidised)` : usd(allIn);
    ddNet.textContent = usd(value);
    const cheaper = cardCost / Math.max(allIn, EPS);
    ddCard.innerHTML = `${usd(cardCost)} · <b>${cheaper >= 1 ? `${cheaper >= 100 ? Math.round(cheaper) : cheaper.toFixed(1)}× more` : `${(1 / cheaper).toFixed(1)}× less`}</b>`;
    ddCard.className = cheaper >= 1 ? 'xff-good' : 'xff-bad';

    // verdict
    const vWord =
      ratio > 100
        ? `gas <b>exceeds the payment</b> — this settlement loses money.`
        : ratio >= 10
          ? `gas eats <b>${pct(ratio)}</b> of the payment — metered pricing is marginal here.`
          : `gas is <b>${pct(ratio)}</b> of the payment — sub-cent metering is economically real.`;
    verdict.innerHTML =
      `${vWord} Break-even (gas = payment) at <b>${usd(vBreakeven)}</b>; stays under 10% above <b>${usd(vTen)}</b>. ` +
      (subsidy
        ? `The payer sees <b>$0</b> gas — a facilitator subsidy, not a law of physics.`
        : `Unsubsidised, the payer bears the gas: <b>${usd(allIn)}</b> all-in.`);

    realChip.style.display = isReal() ? 'inline-flex' : 'none';

    // ── axis visuals ──
    const xBE = xPx(vBreakeven);
    const xTen = xPx(vTen);
    const xCur = xPx(value);

    zUnder.setAttribute('width', String(Math.max(0, Math.min(xBE, PX1) - PX0)));
    const heavyX0 = Math.min(Math.max(xBE, PX0), PX1);
    const heavyX1 = Math.min(Math.max(xTen, PX0), PX1);
    zHeavy.setAttribute('x', String(heavyX0));
    zHeavy.setAttribute('width', String(Math.max(0, heavyX1 - heavyX0)));
    const viX0 = Math.min(Math.max(xTen, PX0), PX1);
    zViable.setAttribute('x', String(viX0));
    zViable.setAttribute('width', String(Math.max(0, PX1 - viX0)));

    // band labels centered in their zones (hide if too narrow)
    const place = (el: SVGTextElement, x0: number, x1: number) => {
      const w = x1 - x0;
      if (w < 44) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.setAttribute('x', String((x0 + x1) / 2));
    };
    place(lblUnder, PX0, Math.min(xBE, PX1));
    place(lblHeavy, heavyX0, heavyX1);
    place(lblViable, viX0, PX1);

    const showMarker = (line: SVGLineElement, txt: SVGTextElement, x: number, within: boolean) => {
      const on = within && x > PX0 + 1 && x < PX1 - 1;
      line.style.display = on ? '' : 'none';
      txt.style.display = on ? '' : 'none';
      if (on) {
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));
        txt.setAttribute('x', String(clamp(x, PX0 + 14, PX1 - 14)));
      }
    };
    showMarker(beLine, beTxt, xBE, vBreakeven >= VMIN && vBreakeven <= VMAX);
    showMarker(tenLine, tenTxt, xTen, vTen >= VMIN && vTen <= VMAX);

    handleStem.setAttribute('x1', String(xCur));
    handleStem.setAttribute('x2', String(xCur));
    handleDot.setAttribute('cx', String(xCur));
    handleDot.setAttribute('fill', bandColor);
    handleLbl.setAttribute('x', String(clamp(xCur, PX0 + 24, PX1 - 24)));
    handleLbl.textContent = usd(value);
    handleSub.setAttribute('x', String(clamp(xCur, PX0 + 24, PX1 - 24)));
    handleSub.setAttribute('fill', bandColor);
    handleSub.textContent = pct(ratio);
  }

  /* ── input wiring ───────────────────────────────────────────────────────── */
  const onVal = () => { value = posToVal(Number(valSlider.input.value) / 1000); render(); };
  const onGwei = () => { gwei = Number(gweiSlider.input.value); render(); };
  const onEth = () => { ethUsd = Number(ethSlider.input.value); render(); };
  const onSubsidy = () => { subsidy = subsidyInput.checked; render(); };
  const onCdp = () => { cdpFee = cdpInput.checked; render(); };
  const onReset = () => {
    value = S.valueUsd; gwei = S.effectiveGweiL2; ethUsd = S.impliedEthUsd;
    subsidy = true; cdpFee = false;
    valSlider.input.value = String(logPos(value) * 1000);
    gweiSlider.input.value = String(gwei);
    ethSlider.input.value = String(ethUsd);
    subsidyInput.checked = true; cdpInput.checked = false;
    render();
  };
  valSlider.input.addEventListener('input', onVal);
  gweiSlider.input.addEventListener('input', onGwei);
  ethSlider.input.addEventListener('input', onEth);
  subsidyInput.addEventListener('change', onSubsidy);
  cdpInput.addEventListener('change', onCdp);
  resetBtn.addEventListener('click', onReset);

  // pointer on the axis → set payment value
  let dragging = false;
  const setFromPointer = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * VW;
    const p = (svgX - PX0) / (PX1 - PX0);
    value = posToVal(p);
    valSlider.input.value = String(logPos(value) * 1000);
    render();
  };
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture?.(e.pointerId);
    setFromPointer(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => { if (dragging) setFromPointer(e.clientX); };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    svg.releasePointerCapture?.(e.pointerId);
  };
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);

  render();

  return () => {
    layout.dispose();
    valSlider.input.removeEventListener('input', onVal);
    gweiSlider.input.removeEventListener('input', onGwei);
    ethSlider.input.removeEventListener('input', onEth);
    subsidyInput.removeEventListener('change', onSubsidy);
    cdpInput.removeEventListener('change', onCdp);
    resetBtn.removeEventListener('click', onReset);
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('pointercancel', onPointerUp);
    style.remove();
  };
}
