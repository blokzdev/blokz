/**
 * Artifact: the-range-optimizer — The Range Optimizer
 * Manifest: content/artifacts/the-range-optimizer/manifest.json
 *
 * Interactive chart of gross fee APY vs net APY (after gas) for a Uniswap v3
 * concentrated LP position across the full range of possible range widths.
 * Sliders control range half-width (±5–100%), annualized volatility, and
 * position size. Fee tier buttons switch between the three Uniswap fee tiers.
 *
 * Core math:
 *   capital efficiency multiplier  = 1 / (√(1+δ) − 1)
 *   gross fee APR (when in range)  = feeRate × vol/TVL × 365 × multiplier
 *   mean first-passage time (days) = (ln(1+δ))² / (annualVol/√252)²
 *   gas drag APY                   = (365/MFPT × gasUSD) / positionUSD
 *   net APY                        = gross − gas drag
 */
import { createArtifactLayout } from '../../lib/artifact-layout';
import data from '../../../content/artifacts/the-range-optimizer/data.json';

// Pool lookup: feeTierBps → vol/TVL ratio per day
const POOL_VTV = new Map<number, number>(
  (data.pools as { feeTierBps: number; volTVLRatioPerDay: number }[]).map(
    (p) => [p.feeTierBps, p.volTVLRatioPerDay],
  ),
);
const GAS_USD = data.gas.usdPerRebalance;

// ---------- math ----------

function capMult(delta: number): number {
  return 1 / (Math.sqrt(1 + delta) - 1);
}

function grossAPR(feeTierBps: number, delta: number): number {
  const vtv = POOL_VTV.get(feeTierBps) ?? 0.1;
  return (feeTierBps / 10000) * vtv * 365 * capMult(delta);
}

function mfptDays(delta: number, annualVol: number): number {
  const a = Math.log(1 + delta);
  const s = annualVol / Math.sqrt(252);
  return (a * a) / (s * s);
}

function gasDragAPY(delta: number, annualVol: number, positionUSD: number): number {
  return (365 / mfptDays(delta, annualVol)) * GAS_USD / positionUSD;
}

// ---------- formatters ----------

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtUsd = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtN = (n: number, d = 1) =>
  isFinite(n) ? (n < 10 ? n.toFixed(d) : Math.round(n).toLocaleString()) : '—';
const fmtDays = (d: number) => {
  if (!isFinite(d) || d > 500) return `${Math.round(d / 30)}mo`;
  if (d < 1) return `${(d * 24).toFixed(1)}h`;
  return `${d.toFixed(1)}d`;
};

// ---------- mount ----------

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    stageFr: '1.7fr',
  });

  const style = document.createElement('style');
  style.textContent = `
    .ro-stage { display:flex; flex-direction:column; gap:8px; }
    .ro-svgbox { flex:1 1 0; min-height:0; position:relative; }
    .ro-svgbox svg { width:100%; height:100%; display:block; }
    .ro-controls {
      display:grid; grid-template-columns:repeat(auto-fit,minmax(min(155px,100%),1fr));
      gap:6px 16px; font:500 12px/1.45 'JetBrains Mono',monospace; color:#8d95ad; }
    .ro-field { min-width:0; }
    .ro-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .ro-field output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .ro-field input[type=range] { width:100%; accent-color:#5b8cff;
      cursor:pointer; margin:3px 0 0; background:transparent; }
    .ro-tier-field { min-width:0; }
    .ro-tier-field > span { display:block; font-size:10px; letter-spacing:.07em;
      text-transform:uppercase; color:#5b6378; margin-bottom:5px; }
    .ro-tiers { display:flex; gap:5px; flex-wrap:wrap; }
    .ro-tier { padding:3px 9px; border-radius:6px;
      border:1px solid rgba(124,140,255,.25); background:transparent;
      color:#8d95ad; font:500 11px 'JetBrains Mono',monospace;
      cursor:pointer; letter-spacing:.06em; }
    .ro-tier.active { background:rgba(91,140,255,.18); border-color:rgba(91,140,255,.55); color:#e7eaf3; }
    .ro-panel { display:grid; grid-template-columns:minmax(0,1fr); gap:9px;
      font:500 12px/1.45 'JetBrains Mono',monospace; }
    .ro-card { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:9px 12px; background:#0d1322; min-width:0; }
    .ro-card h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono',monospace;
      letter-spacing:.13em; text-transform:uppercase; }
    .ro-card.ro-gross h3 { color:#5b8cff; }
    .ro-card.ro-net h3 { color:#22d3ee; }
    .ro-card dl { margin:0; display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr);
      gap:3px 10px; }
    .ro-card dt { color:#5b6378; font-size:10px; }
    .ro-card dd { margin:0; color:#e7eaf3; text-align:right; font-variant-numeric:tabular-nums; }
    .ro-card dd.pos { color:#22d3ee; }
    .ro-card dd.neg { color:#ff7a8a; }
    .ro-caption { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; letter-spacing:.03em; }
  `;
  container.appendChild(style);

  // ---- Controls ----
  const ctrl = layout.controls;
  ctrl.className += ' ro-controls';

  function mkSlider(
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
  ) {
    const field = document.createElement('div');
    field.className = 'ro-field';
    const lab = document.createElement('label');
    lab.htmlFor = `ro-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = `ro-${id}`;
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(value);
    inp.setAttribute('aria-label', label);
    field.append(lab, inp);
    ctrl.appendChild(field);
    return { input: inp, out };
  }

  const rangeW = mkSlider('range', 'range width (±%)', 5, 100, 1, 10);
  const volS = mkSlider('vol', 'annualized vol (%)', 10, 120, 1, 58);
  const sizeS = mkSlider('size', 'position size', 500, 100000, 500, 5000);

  // Fee tier buttons
  const tierField = document.createElement('div');
  tierField.className = 'ro-tier-field';
  const tierLabel = document.createElement('span');
  tierLabel.textContent = 'fee tier';
  const tierRow = document.createElement('div');
  tierRow.className = 'ro-tiers';

  const TIERS = [5, 30, 100];
  const TIER_LABELS: Record<number, string> = { 5: '0.05%', 30: '0.30%', 100: '1.00%' };
  let activeTier = 5;
  const tierBtns: HTMLButtonElement[] = [];

  for (const bps of TIERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ro-tier' + (bps === activeTier ? ' active' : '');
    btn.textContent = TIER_LABELS[bps]!;
    btn.dataset.bps = String(bps);
    btn.setAttribute('aria-pressed', String(bps === activeTier));
    btn.addEventListener('click', () => {
      activeTier = bps;
      for (const b of tierBtns) {
        const active = b.dataset.bps === String(bps);
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      }
      render();
    });
    tierBtns.push(btn);
    tierRow.appendChild(btn);
  }
  tierField.append(tierLabel, tierRow);
  ctrl.appendChild(tierField);

  // ---- Stage ----
  const stageRoot = layout.stage;
  stageRoot.className += ' ro-stage';
  const svgBox = document.createElement('div');
  svgBox.className = 'ro-svgbox';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 200');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svgBox.appendChild(svg);
  stageRoot.appendChild(svgBox);

  const D_LO = 0.05;
  const D_HI = 1.0;
  const N_PTS = 90;
  const PD = { l: 46, r: 12, t: 16, b: 26 }; // plot area padding

  const xOf = (d: number) =>
    PD.l + ((d - D_LO) / (D_HI - D_LO)) * (600 - PD.l - PD.r);
  const yOf = (v: number, yHi: number) => {
    const plotH = 200 - PD.t - PD.b;
    return Math.max(PD.t, Math.min(200 - PD.b, 200 - PD.b - (Math.max(0, v) / yHi) * plotH));
  };

  const mkSvg = <K extends keyof SVGElementTagNameMap>(tag: K) =>
    document.createElementNS(NS, tag) as SVGElementTagNameMap[K];

  // Static grid group (Y lines and labels, rebuilt on render)
  const gridG = mkSvg('g');
  svg.appendChild(gridG);

  // Gas drag shaded region between gross and net curves
  const dragArea = mkSvg('path');
  dragArea.setAttribute('fill', 'rgba(255,122,138,.06)');
  dragArea.setAttribute('stroke', 'none');
  svg.appendChild(dragArea);

  // Gross APY line
  const grossPath = mkSvg('path');
  grossPath.setAttribute('fill', 'none');
  grossPath.setAttribute('stroke', 'rgba(91,140,255,.6)');
  grossPath.setAttribute('stroke-width', '1.5');
  grossPath.setAttribute('stroke-dasharray', '5 3');
  grossPath.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(grossPath);

  // Net APY line
  const netPath = mkSvg('path');
  netPath.setAttribute('fill', 'none');
  netPath.setAttribute('stroke', '#22d3ee');
  netPath.setAttribute('stroke-width', '2');
  netPath.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(netPath);

  // Zero line
  const zeroLine = mkSvg('line');
  zeroLine.setAttribute('stroke', 'rgba(255,255,255,.2)');
  zeroLine.setAttribute('stroke-width', '1');
  zeroLine.setAttribute('x1', String(PD.l));
  zeroLine.setAttribute('x2', String(600 - PD.r));
  svg.appendChild(zeroLine);

  // Selection vertical
  const selLine = mkSvg('line');
  selLine.setAttribute('stroke', 'rgba(255,200,80,.5)');
  selLine.setAttribute('stroke-width', '1');
  selLine.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(selLine);

  // Dots on curves at selection
  const dotGross = mkSvg('circle');
  dotGross.setAttribute('r', '4');
  dotGross.setAttribute('fill', 'rgba(91,140,255,.9)');
  svg.appendChild(dotGross);

  const dotNet = mkSvg('circle');
  dotNet.setAttribute('r', '4');
  dotNet.setAttribute('fill', '#22d3ee');
  svg.appendChild(dotNet);

  // Static X axis ticks
  for (const d of [0.05, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    const t = mkSvg('text');
    t.setAttribute('x', String(xOf(d)));
    t.setAttribute('y', String(200 - 6));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#5b6378');
    t.setAttribute('font-size', '8.5');
    t.setAttribute('font-family', "'JetBrains Mono',monospace");
    t.textContent = `±${Math.round(d * 100)}%`;
    svg.appendChild(t);
  }
  // X axis label
  const xLab = mkSvg('text');
  xLab.setAttribute('x', String((PD.l + 600 - PD.r) / 2));
  xLab.setAttribute('y', String(200 - 14));
  xLab.setAttribute('text-anchor', 'middle');
  xLab.setAttribute('fill', '#3d4561');
  xLab.setAttribute('font-size', '8');
  xLab.setAttribute('font-family', "'JetBrains Mono',monospace");
  xLab.textContent = 'range half-width →';
  svg.appendChild(xLab);

  // Y axis label
  const yLab = mkSvg('text');
  yLab.setAttribute('x', '6');
  yLab.setAttribute('y', String(PD.t + 4));
  yLab.setAttribute('fill', '#3d4561');
  yLab.setAttribute('font-size', '8');
  yLab.setAttribute('font-family', "'JetBrains Mono',monospace");
  yLab.textContent = 'APY';
  svg.appendChild(yLab);

  // Legend
  function mkLegend(x: number, y: number, color: string, dash: boolean, label: string) {
    const line = mkSvg('line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x + 16));
    line.setAttribute('y1', String(y + 4));
    line.setAttribute('y2', String(y + 4));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '1.5');
    if (dash) line.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(line);
    const t = mkSvg('text');
    t.setAttribute('x', String(x + 20));
    t.setAttribute('y', String(y + 8));
    t.setAttribute('fill', color);
    t.setAttribute('font-size', '8.5');
    t.setAttribute('font-family', "'JetBrains Mono',monospace");
    t.textContent = label;
    svg.appendChild(t);
  }
  mkLegend(PD.l + 2, PD.t - 2, 'rgba(91,140,255,.8)', true, 'gross fee APY');
  mkLegend(PD.l + 118, PD.t - 2, '#22d3ee', false, 'net APY (after gas)');

  // Dynamic Y grid (4 reference lines, rebuilt on render)
  const gridLines: SVGLineElement[] = [];
  const gridLabels: SVGTextElement[] = [];
  for (let i = 0; i < 4; i++) {
    const l = mkSvg('line');
    l.setAttribute('stroke', 'rgba(124,140,255,.08)');
    l.setAttribute('stroke-width', '1');
    l.setAttribute('x1', String(PD.l));
    l.setAttribute('x2', String(600 - PD.r));
    gridG.appendChild(l);
    gridLines.push(l);
    const t = mkSvg('text');
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('fill', '#5b6378');
    t.setAttribute('font-size', '8.5');
    t.setAttribute('font-family', "'JetBrains Mono',monospace");
    t.setAttribute('x', String(PD.l - 4));
    gridG.appendChild(t);
    gridLabels.push(t);
  }

  // ---- Panel ----
  const panelRoot = layout.panel;
  panelRoot.className += ' ro-panel';

  function mkCard(cls: string, title: string, rows: string[]) {
    const card = document.createElement('div');
    card.className = `ro-card ${cls}`;
    const h = document.createElement('h3');
    h.textContent = title;
    const dl = document.createElement('dl');
    const dds: HTMLElement[] = [];
    for (const r of rows) {
      const dt = document.createElement('dt');
      dt.textContent = r;
      const dd = document.createElement('dd');
      dl.append(dt, dd);
      dds.push(dd);
    }
    card.append(h, dl);
    panelRoot.appendChild(card);
    return dds;
  }

  const grossDds = mkCard('ro-gross', 'fee income', [
    'cap. efficiency',
    'gross fee APY',
    'time in range',
  ]);
  const netDds = mkCard('ro-net', 'net economics', [
    'rebalances/yr',
    'gas cost/yr',
    'net APY',
  ]);

  // ---- Caption ----
  const cap = layout.caption;
  cap.className += ' ro-caption';
  cap.textContent = (data as { note: string }).note;

  // ---- Render ----
  function render() {
    const deltaPercent = Number(rangeW.input.value);
    const delta = deltaPercent / 100;
    const annualVol = Number(volS.input.value) / 100;
    const posUSD = Number(sizeS.input.value);
    const ftBps = activeTier;

    rangeW.out.textContent = `±${deltaPercent}%`;
    volS.out.textContent = `${Number(volS.input.value)}%`;
    sizeS.out.textContent = fmtUsd(posUSD);

    // Metrics at selected delta
    const eff = capMult(delta);
    const gross = grossAPR(ftBps, delta);
    const mfpt = mfptDays(delta, annualVol);
    const rpy = 365 / mfpt;
    const gasYr = rpy * GAS_USD;
    const drag = gasDragAPY(delta, annualVol, posUSD);
    const net = gross - drag;

    grossDds[0]!.textContent = `${eff.toFixed(1)}×`;
    grossDds[1]!.textContent = pct(gross, 1);
    grossDds[2]!.textContent = fmtDays(mfpt);
    netDds[0]!.textContent = fmtN(rpy);
    netDds[1]!.textContent = fmtUsd(gasYr);
    netDds[2]!.textContent = pct(net, 1);
    netDds[2]!.className = net > 0 ? 'pos' : 'neg';

    // Curve data
    const grossVals: number[] = [];
    const netVals: number[] = [];
    const deltas: number[] = [];
    for (let i = 0; i <= N_PTS; i++) {
      const d = D_LO + (i / N_PTS) * (D_HI - D_LO);
      deltas.push(d);
      grossVals.push(grossAPR(ftBps, d));
      netVals.push(grossAPR(ftBps, d) - gasDragAPY(d, annualVol, posUSD));
    }

    // Y axis scale: headroom above selected gross, capped at 150%
    const Y_HI = Math.min(1.5, Math.max(0.06, gross * 1.5));

    // Grid lines
    const ticks = [0.25, 0.5, 0.75, 1.0].map((f) => f * Y_HI);
    for (let i = 0; i < gridLines.length; i++) {
      const v = ticks[i]!;
      const y = yOf(v, Y_HI);
      gridLines[i]!.setAttribute('y1', String(y));
      gridLines[i]!.setAttribute('y2', String(y));
      gridLabels[i]!.setAttribute('y', String(y + 3));
      gridLabels[i]!.textContent = pct(v, 0);
    }

    // Zero line
    zeroLine.setAttribute('y1', String(yOf(0, Y_HI)));
    zeroLine.setAttribute('y2', String(yOf(0, Y_HI)));

    // Build SVG paths
    let gD = '', nD = '', areaD = '';
    const yBot = 200 - PD.b;

    for (let i = 0; i <= N_PTS; i++) {
      const x = xOf(deltas[i]!);
      const yg = yOf(grossVals[i]!, Y_HI);
      const yn = yOf(netVals[i]!, Y_HI);
      gD += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yg.toFixed(1)} `;
      nD += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yn.toFixed(1)} `;
      areaD += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yg.toFixed(1)} `;
    }
    // Close area: trace net curve backwards
    for (let i = N_PTS; i >= 0; i--) {
      const x = xOf(deltas[i]!);
      const yn = yOf(netVals[i]!, Y_HI);
      areaD += `L${x.toFixed(1)} ${Math.max(PD.t, Math.min(yBot, yn)).toFixed(1)} `;
    }
    areaD += 'Z';

    grossPath.setAttribute('d', gD.trim());
    netPath.setAttribute('d', nD.trim());
    dragArea.setAttribute('d', areaD.trim());

    // Selection marker
    const xSel = xOf(delta);
    selLine.setAttribute('x1', String(xSel));
    selLine.setAttribute('x2', String(xSel));
    selLine.setAttribute('y1', String(PD.t));
    selLine.setAttribute('y2', String(yBot));

    dotGross.setAttribute('cx', String(xSel));
    dotGross.setAttribute('cy', String(yOf(gross, Y_HI)));
    dotNet.setAttribute('cx', String(xSel));
    dotNet.setAttribute('cy', String(yOf(net, Y_HI)));
  }

  const inputs = [rangeW.input, volS.input, sizeS.input];
  const onInput = () => render();
  for (const inp of inputs) inp.addEventListener('input', onInput);
  render();

  return () => {
    for (const inp of inputs) inp.removeEventListener('input', onInput);
    style.remove();
    layout.dispose();
  };
}
