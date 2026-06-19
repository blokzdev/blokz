/**
 * Artifact: emission-engine — Emission Engine
 * Manifest: content/artifacts/emission-engine/manifest.json
 *
 * A calculator that runs the same emission-capture attack against both of
 * Bittensor's allocation regimes. Price regime (dTAO, pre-Nov 2025): a
 * constant-product buy multiplies the alpha price by (1 + X/τ)² and shifts
 * emission share instantly — and the swap is refundable. Flow regime
 * (TaoFlow): a one-shot stake enters a per-block EMA scaled by a ≈ 3.2e-6
 * and decays with a 30-day half-life, while exit records an equal outflow.
 * Real protocol constants; sliders are native inputs (keyboard accessible).
 *
 * Layout: shared responsive primitive (stage chart · panel price/flow readouts
 * + verdict · footer controls sliders · caption provenance note).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const BLOCKS_PER_DAY = 7200; // 12s blocks
const EMA_A = 0.000003209; // per-block smoothing factor (30-day half-life)
const DAILY_TAO = 3600; // post-halving issuance (Dec 14, 2025)
const LAMBDA = EMA_A * BLOCKS_PER_DAY; // per-day decay rate ≈ 0.0231
const HORIZON = 90; // days charted

interface Inputs {
  attack: number; // attacker budget X (TAO)
  pool: number; // target pool TAO reserve τ
  share0: number; // baseline emission share (fraction)
  netFlow: number; // network honest net inflow (TAO/day)
}

interface Results {
  priceMult: number;
  priceShare: number; // share while pump is held
  pricePerDay: number; // extra TAO/day to the subnet
  priceTotal: number; // extra TAO over the horizon
  flowShare: (tDays: number) => number;
  flowPeak: number;
  flowPeakPerDay: number;
  flowTotal: number;
}

function compute(inp: Inputs): Results {
  const { attack, pool, share0, netFlow } = inp;

  // Price regime: constant-product pump, share = p_i / Σp.
  const priceMult = (1 + attack / pool) ** 2;
  const priceShare = (share0 * priceMult) / (1 - share0 + share0 * priceMult);
  const pricePerDay = (priceShare - share0) * DAILY_TAO;

  // Flow regime: total EMA score T at steady state equals mean per-block flow.
  const T = netFlow / BLOCKS_PER_DAY;
  const S0 = share0 * T;
  const bump = (t: number) => EMA_A * attack * Math.exp(-LAMBDA * t);
  const flowShare = (t: number) => (S0 + bump(t)) / (T + bump(t));

  let flowTotal = 0;
  const dt = 0.25;
  for (let t = 0; t < HORIZON; t += dt) flowTotal += (flowShare(t) - share0) * DAILY_TAO * dt;

  return {
    priceMult,
    priceShare,
    pricePerDay,
    priceTotal: pricePerDay * HORIZON,
    flowShare,
    flowPeak: flowShare(0),
    flowPeakPerDay: (flowShare(0) - share0) * DAILY_TAO,
    flowTotal,
  };
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(210px, 56vw, 350px)',
  });
  const { stage, panel: panelSlot, controls: controlsSlot, caption } = layout;
  stage.classList.add('ee-stage');
  panelSlot.classList.add('ee-panels');
  controlsSlot.classList.add('ee-controls');

  const style = document.createElement('style');
  style.textContent = `
    .ee-stage, .ee-panels, .ee-controls, .ee-caption {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .ee-controls { display:grid; grid-template-columns:repeat(4,1fr); gap:8px 14px; }
    .ee-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .ee-field output { color:#e7eaf3; font-size:11px; }
    .ee-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:4px 0 0; }
    .ee-chartwrap { position:absolute; inset:0; min-height:120px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .ee-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .ee-legend { position:absolute; top:8px; right:10px; display:flex; gap:12px;
      font-size:10px; letter-spacing:.06em; }
    .ee-legend span { display:inline-flex; align-items:center; gap:5px; }
    .ee-legend i { width:14px; height:2px; border-radius:1px; display:inline-block; }
    /* Axis labels live in DOM, not the stretched SVG (preserveAspectRatio:none
       distorts glyphs). */
    .ee-axislabel { position:absolute; font-size:10px; color:#5b6378; pointer-events:none; }
    .ee-panels { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-content:start; }
    .ee-panel { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:10px 12px; background:#0d1322; }
    .ee-panel h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.14em; text-transform:uppercase; }
    .ee-panel.ee-price h3 { color:#5b8cff; }
    .ee-panel.ee-flow h3 { color:#22d3ee; }
    .ee-panel dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:2px 10px; }
    .ee-panel dt { color:#5b6378; font-size:10px; }
    .ee-panel dd { margin:0; color:#e7eaf3; text-align:right; font-variant-numeric:tabular-nums; }
    .ee-panel p { margin:7px 0 0; font-size:10px; color:#5b6378; }
    .ee-verdict { grid-column:1 / -1; text-align:center; font-size:11px; color:#8d95ad; }
    .ee-verdict b { color:#e7eaf3; }
    .ee-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.04em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const defs = [
    { id: 'attack', label: 'attack budget', min: 500, max: 50000, step: 500, value: 5000, unit: 'TAO' },
    { id: 'pool', label: 'pool TAO reserve', min: 2000, max: 100000, step: 1000, value: 10000, unit: 'TAO' },
    { id: 'share0', label: 'baseline share', min: 0.5, max: 10, step: 0.1, value: 2, unit: '%' },
    { id: 'netFlow', label: 'network inflow', min: 2000, max: 100000, step: 1000, value: 20000, unit: 'TAO/d' },
  ] as const;

  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = 'ee-field';
    const label = document.createElement('label');
    label.htmlFor = `ee-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `ee-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.value);
    input.setAttribute('aria-label', `${d.label} (${d.unit})`);
    field.append(label, input);
    controlsSlot.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }

  /* ---- Chart ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const chartWrap = document.createElement('div');
  chartWrap.className = 'ee-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 200');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  chartWrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'ee-legend';
  for (const [color, text] of [
    ['#5b8cff', 'price pump'],
    ['#22d3ee', 'taoflow stake'],
    ['#5b6378', 'baseline'],
  ] as const) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = color;
    item.append(swatch, document.createTextNode(text));
    legend.appendChild(item);
  }
  chartWrap.appendChild(legend);
  stage.appendChild(chartWrap);

  const mkPath = (stroke: string, dash = '') => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', '2');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (dash) p.setAttribute('stroke-dasharray', dash);
    svg.appendChild(p);
    return p;
  };
  const basePath = mkPath('rgba(91,99,120,.8)', '4 4');
  const flowPath = mkPath('#22d3ee');
  const pricePath = mkPath('#5b8cff');
  const mkAxisLabel = (css: string, text = '') => {
    const div = document.createElement('div');
    div.className = 'ee-axislabel';
    div.style.cssText = css;
    div.textContent = text;
    chartWrap.appendChild(div);
    return div;
  };
  const yMaxLabel = mkAxisLabel('top:6px;left:8px;');
  const yMinLabel = mkAxisLabel('bottom:4px;left:8px;');
  mkAxisLabel('bottom:4px;right:10px;', 'days 0 → 90');

  /* ---- Result panels ---- */
  const mkPanel = (cls: string, title: string, rows: string[], note: string) => {
    const panel = document.createElement('div');
    panel.className = `ee-panel ${cls}`;
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
    const p = document.createElement('p');
    p.textContent = note;
    panel.append(h, dl, p);
    panelSlot.appendChild(panel);
    return dds;
  };
  const priceDds = mkPanel(
    'ee-price',
    'price regime · dtao (pre-nov 2025)',
    ['alpha price', 'emission share', 'extra to subnet', 'over 90 days'],
    'the swap is refundable — exit returns principal minus slippage and fees.',
  );
  const flowDds = mkPanel(
    'ee-flow',
    'flow regime · taoflow (live)',
    ['ema bump', 'peak share', 'extra at peak', 'over 90 days'],
    'principal locked while it counts; unstaking records an equal outflow and erases the score.',
  );
  const verdict = document.createElement('div');
  verdict.className = 'ee-verdict';
  panelSlot.appendChild(verdict);

  const note = document.createElement('div');
  note.className = 'ee-note';
  note.textContent =
    'subnet-level capture before the 18/41/41 split — not attacker take-home. constants: 3,600 TAO/day, a ≈ 3.209e-6/block (t½ = 30d).';
  caption.appendChild(note);

  /* ---- Recompute + render ---- */
  function render() {
    const inp: Inputs = {
      attack: Number(sliders.get('attack')!.value),
      pool: Number(sliders.get('pool')!.value),
      share0: Number(sliders.get('share0')!.value) / 100,
      netFlow: Number(sliders.get('netFlow')!.value),
    };
    for (const d of defs) {
      const v = Number(sliders.get(d.id)!.value);
      outputs.get(d.id)!.textContent = `${fmt(v, d.id === 'share0' ? 1 : 0)} ${d.unit}`;
    }

    const r = compute(inp);

    // Chart scale: pad above the max curve, floor a bit under baseline.
    const yMax = Math.max(r.priceShare, r.flowPeak) * 1.15;
    const yMin = inp.share0 * 0.75;
    const X = (t: number) => (t / HORIZON) * 600;
    const Y = (s: number) => 200 - ((s - yMin) / (yMax - yMin)) * 176 - 12;

    basePath.setAttribute('d', `M0 ${Y(inp.share0)} L600 ${Y(inp.share0)}`);
    pricePath.setAttribute('d', `M0 ${Y(r.priceShare)} L600 ${Y(r.priceShare)}`);
    let d = `M0 ${Y(r.flowShare(0))}`;
    for (let t = 1; t <= HORIZON; t++) d += ` L${X(t).toFixed(1)} ${Y(r.flowShare(t)).toFixed(2)}`;
    flowPath.setAttribute('d', d);
    yMaxLabel.textContent = pct(yMax);
    yMinLabel.textContent = pct(yMin);

    priceDds[0]!.textContent = `× ${r.priceMult.toFixed(2)}`;
    priceDds[1]!.textContent = `${pct(inp.share0)} → ${pct(r.priceShare)}`;
    priceDds[2]!.textContent = `+${fmt(r.pricePerDay)} TAO/day`;
    priceDds[3]!.textContent = `+${fmt(r.priceTotal)} TAO`;

    flowDds[0]!.textContent = `+${(EMA_A * inp.attack).toFixed(4)} /block`;
    flowDds[1]!.textContent = `${pct(inp.share0)} → ${pct(r.flowPeak)}`;
    flowDds[2]!.textContent = `+${fmt(r.flowPeakPerDay, 1)} TAO/day`;
    flowDds[3]!.textContent = `+${fmt(r.flowTotal)} TAO`;

    const ratio = r.flowTotal > 0 ? r.priceTotal / r.flowTotal : Infinity;
    verdict.innerHTML = '';
    verdict.append('same ', Object.assign(document.createElement('b'), { textContent: `${fmt(inp.attack)} TAO` }));
    verdict.append(' captures ');
    verdict.append(Object.assign(document.createElement('b'), {
      textContent: Number.isFinite(ratio) ? `${ratio.toFixed(1)}× less` : '∞× less',
    }));
    verdict.append(' under TaoFlow — and the principal is locked, not borrowed.');
  }

  const onInput = () => render();
  for (const s of sliders.values()) s.addEventListener('input', onInput);
  render();

  return () => {
    layout.dispose();
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    style.remove();
  };
}
