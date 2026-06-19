/**
 * Artifact: gas-wall — The Gas Wall
 * Manifest: content/artifacts/gas-wall/manifest.json
 *
 * Log-scale SVG bar chart of the gas cost of running a neural network's
 * forward pass *inside* the EVM, for five architectures, against the live
 * Ethereum (60M) and Base (400M) block-gas ceilings. The per-component gas
 * model comes from ML2SC's measured transpiler output (arXiv:2404.16967,
 * Table IV); an "optimized floor" regime swaps in a hand-derived lower
 * bound. Block limits + ETH price are a static snapshot in ./data.json —
 * no runtime fetches. A gas-price slider reprices each bar in USD; hovering,
 * tapping, or focusing a bar reads out exact gas, the ×block multiple, and
 * the dollar cost.
 *
 * Layout: shared responsive primitive (stage chart · panel readout · rail
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/gas-wall/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Regime {
  label: string;
  overhead: number;
  perEdge: number;
  perReLU: number;
  perSigmoid: number;
  note: string;
}
interface Model {
  id: string;
  label: string;
  arch: string;
  layers: number[];
}
interface BlockLimit {
  chain: string;
  gas: number;
  baseFeeGwei: number;
}

const REGIMES = data.regimes as Record<'measured' | 'optimized', Regime>;
const MODELS = data.models as Model[];
const LIMITS = data.blockLimits as BlockLimit[];
const ETH_USD = data.ethPriceUsd as number;

const NS = 'http://www.w3.org/2000/svg';

/* --- Per-model structural counts (computed once from layer dims) --- */
function counts(layers: number[]) {
  let edges = 0;
  for (let i = 0; i < layers.length - 1; i++) edges += layers[i]! * layers[i + 1]!;
  let relu = 0;
  for (let i = 1; i < layers.length - 1; i++) relu += layers[i]!;
  const sigmoid = layers[layers.length - 1]!;
  return { edges, relu, sigmoid };
}
const STRUCT = MODELS.map((m) => counts(m.layers));

const gasFor = (i: number, r: Regime) =>
  r.overhead +
  STRUCT[i]!.edges * r.perEdge +
  STRUCT[i]!.relu * r.perReLU +
  STRUCT[i]!.sigmoid * r.perSigmoid;

/* --- Chart geometry (viewBox units) --- */
const VB_W = 800;
const VB_H = 410;
const X0 = 70;
const X1 = 784;
const Y_TOP = 64;
const Y_BASE = 356;
const BAR_W = 70;

/* Log-y domain fixed across regimes so the toggle reads as motion */
const LOG_LO = Math.log10(1e5);
const LOG_HI = Math.log10(2e10);
const yOf = (g: number) =>
  Y_BASE - ((Math.log10(g) - LOG_LO) / (LOG_HI - LOG_LO)) * (Y_BASE - Y_TOP);

/* Gas-price slider: log scale, 0.05 → 50 gwei; default lands on Ethereum's snapshot fee */
const GWEI_MIN = 0.05;
const GWEI_MAX = 50;
const gweiOf = (t: number) => GWEI_MIN * Math.pow(GWEI_MAX / GWEI_MIN, t / 100);
const tOfGwei = (g: number) =>
  (100 * Math.log(g / GWEI_MIN)) / Math.log(GWEI_MAX / GWEI_MIN);

const ETH = LIMITS.find((l) => l.chain === 'Ethereum')!;
const BASE = LIMITS.find((l) => l.chain === 'Base')!;

/* --- Formatters --- */
function fmtGas(g: number): string {
  if (g >= 1e9) return `${(g / 1e9).toFixed(g >= 1e10 ? 1 : 2)}B`;
  if (g >= 1e6) return `${(g / 1e6).toFixed(g >= 1e8 ? 0 : 1)}M`;
  if (g >= 1e3) return `${(g / 1e3).toFixed(0)}k`;
  return String(Math.round(g));
}
function fmtUsd(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toExponential(1)}`;
}
const fmtMult = (m: number) =>
  m >= 10 ? `${Math.round(m).toLocaleString('en-US')}×` : m >= 1 ? `${m.toFixed(1)}×` : `${m.toFixed(2)}×`;
const fmtGwei = (g: number) => (g >= 1 ? `${g.toFixed(g >= 10 ? 0 : 1)} gwei` : `${g.toFixed(3)} gwei`);
const usdFor = (gas: number, gwei: number) => (gas * gwei * 1e-9) * ETH_USD;

/* Bar colour tier by which block it fits in (brand palette only) */
function tier(gas: number) {
  if (gas <= ETH.gas) return { fill: 'rgba(34,211,238,.24)', stroke: '#22d3ee' }; // fits Ethereum
  if (gas <= BASE.gas) return { fill: 'rgba(91,140,255,.24)', stroke: '#5b8cff' }; // fits Base only
  return { fill: 'rgba(139,92,246,.24)', stroke: '#8b5cf6' }; // exceeds both
}
const tierWord = (gas: number) =>
  gas <= ETH.gas ? 'fits an Ethereum block' : gas <= BASE.gas ? 'fits a Base block only' : 'exceeds both blocks';

export default function mount(container: HTMLElement): () => void {
  /* ---- State ---- */
  let regimeKey: 'measured' | 'optimized' = 'measured';
  let gwei = ETH.baseFeeGwei;
  let pinned = -1;
  let raf = 0;

  const regime = () => REGIMES[regimeKey];

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    // SVG fills the stage and scales via preserveAspectRatio (viewBox 800×410).
    // Derive the stage height from its width so it sits at the chart's natural
    // shape with no tall dead gap above the panel.
    stageAspect: '800/410',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .gw-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      max-width:100%; }
    .gw-toggle { display:inline-flex; max-width:100%; border:1px solid rgba(124,140,255,.14);
      border-radius:8px; overflow:hidden; }
    .gw-toggle button { appearance:none; border:0; background:transparent; color:#5b6378;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.06em; padding:7px 12px;
      cursor:pointer; transition:color .2s, background .2s; }
    .gw-toggle button[aria-pressed="true"] { background:rgba(91,140,255,.13); color:#e7eaf3; }
    .gw-toggle button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .gw-price { flex:1 1 200px; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .gw-price label { display:flex; justify-content:space-between; gap:8px;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .gw-price output { color:#e7eaf3; font-size:11px; text-transform:none; }
    .gw-price output i { color:#22d3ee; font-style:normal; }
    .gw-price input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:2px 0 0; }
    .gw-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .gw-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .gw-grid { stroke:rgba(124,140,255,.1); }
    .gw-gridlabel { fill:#5b6378; font:500 12px 'JetBrains Mono', monospace; }
    .gw-axis { fill:#5b6378; font:500 12.5px 'JetBrains Mono', monospace; }
    .gw-limit { stroke-dasharray:5 4; stroke-width:1.4; }
    .gw-limit-eth { stroke:#22d3ee; }
    .gw-limit-base { stroke:#5b8cff; }
    .gw-limitlabel { font:600 12px 'JetBrains Mono', monospace; }
    .gw-cat { fill:#8d95ad; font:500 13px 'JetBrains Mono', monospace; }
    .gw-arch { fill:#5b6378; font:500 11px 'JetBrains Mono', monospace; }
    .gw-val { fill:#e7eaf3; font:600 15px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .gw-mult { fill:#8d95ad; font:500 11px 'JetBrains Mono', monospace; }
    .gw-bar { cursor:pointer; }
    .gw-bar rect { transition:filter .2s; }
    .gw-bar:hover rect, .gw-bar:focus-visible rect { filter:brightness(1.4); }
    .gw-bar:focus-visible { outline:none; }
    .gw-bar:focus-visible rect { stroke-width:2; }
    .gw-readout { min-height:18px; font-size:11px; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .gw-readout b { color:#e7eaf3; font-weight:600; }
    .gw-readout i { color:#22d3ee; font-style:normal; }
    .gw-note { font-size:9.5px; color:#5b6378; letter-spacing:.02em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'gw-controls';

  const toggle = document.createElement('div');
  toggle.className = 'gw-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Gas-per-edge regime');
  const regimeOrder: Array<'measured' | 'optimized'> = ['measured', 'optimized'];
  const regimeButtons = regimeOrder.map((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = REGIMES[key].label;
    b.setAttribute('aria-pressed', String(key === regimeKey));
    b.addEventListener('click', () => setRegime(key));
    toggle.appendChild(b);
    return b;
  });

  const priceField = document.createElement('div');
  priceField.className = 'gw-price';
  const priceLabel = document.createElement('label');
  priceLabel.htmlFor = 'gw-price';
  const priceName = document.createElement('span');
  priceName.textContent = 'gas price';
  const priceOut = document.createElement('output');
  priceLabel.append(priceName, priceOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'gw-price';
  slider.min = '0';
  slider.max = '100';
  slider.step = '0.5';
  slider.value = String(tOfGwei(gwei));
  slider.setAttribute('aria-label', 'Gas price, 0.05 to 50 gwei');
  priceField.append(priceLabel, slider);

  controls.append(toggle, priceField);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'gw-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  /* gridlines: powers of ten */
  for (const v of [1e6, 1e7, 1e8, 1e9, 1e10]) {
    const y = yOf(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'gw-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(X0 - 8));
    t.setAttribute('y', String(y + 3));
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('class', 'gw-gridlabel');
    t.textContent = fmtGas(v);
    svg.appendChild(t);
  }
  const base = document.createElementNS(NS, 'line');
  base.setAttribute('x1', String(X0));
  base.setAttribute('x2', String(X1));
  base.setAttribute('y1', String(Y_BASE));
  base.setAttribute('y2', String(Y_BASE));
  base.setAttribute('stroke', 'rgba(124,140,255,.28)');
  svg.appendChild(base);

  const axisTitle = document.createElementNS(NS, 'text');
  axisTitle.setAttribute('x', String(X0 - 8));
  axisTitle.setAttribute('y', '30');
  axisTitle.setAttribute('class', 'gw-axis');
  axisTitle.textContent = 'gas for one forward pass · log scale';
  svg.appendChild(axisTitle);

  /* block-limit ceiling lines */
  function limitLine(limit: BlockLimit, cls: string, anchorRight: boolean) {
    const y = yOf(limit.gas);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', `gw-limit ${cls}`);
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(anchorRight ? X1 : X0 + 4));
    t.setAttribute('y', String(y - 5));
    t.setAttribute('text-anchor', anchorRight ? 'end' : 'start');
    t.setAttribute('class', `gw-limitlabel`);
    t.setAttribute('fill', cls.includes('eth') ? '#22d3ee' : '#5b8cff');
    t.textContent = `${limit.chain} block · ${fmtGas(limit.gas)} gas`;
    svg.appendChild(t);
  }
  limitLine(BASE, 'gw-limit-base', false);
  limitLine(ETH, 'gw-limit-eth', true);

  /* bars */
  const slot = (X1 - X0) / MODELS.length;
  interface Bar {
    g: SVGGElement;
    rect: SVGRectElement;
    val: SVGTextElement;
    mult: SVGTextElement;
    value: number; // currently displayed gas (animates on regime toggle)
  }
  const bars: Bar[] = MODELS.map((m, i) => {
    const cx = X0 + slot * (i + 0.5);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'gw-bar');
    g.setAttribute('tabindex', '0');
    g.dataset.bar = String(i);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx - BAR_W / 2));
    rect.setAttribute('width', String(BAR_W));
    rect.setAttribute('rx', '4');
    rect.setAttribute('stroke-width', '1.2');

    const val = document.createElementNS(NS, 'text');
    val.setAttribute('x', String(cx));
    val.setAttribute('text-anchor', 'middle');
    val.setAttribute('class', 'gw-val');

    const mult = document.createElementNS(NS, 'text');
    mult.setAttribute('x', String(cx));
    mult.setAttribute('text-anchor', 'middle');
    mult.setAttribute('class', 'gw-mult');

    const cat = document.createElementNS(NS, 'text');
    cat.setAttribute('x', String(cx));
    cat.setAttribute('y', String(Y_BASE + 22));
    cat.setAttribute('text-anchor', 'middle');
    cat.setAttribute('class', 'gw-cat');
    cat.textContent = m.label;

    const arch = document.createElementNS(NS, 'text');
    arch.setAttribute('x', String(cx));
    arch.setAttribute('y', String(Y_BASE + 38));
    arch.setAttribute('text-anchor', 'middle');
    arch.setAttribute('class', 'gw-arch');
    arch.textContent = m.arch;

    g.append(rect, val, mult, cat, arch);
    svg.appendChild(g);
    return { g, rect, val, mult, value: gasFor(i, regime()) };
  });

  /* ---- Readout + footnote ---- */
  const readout = document.createElement('div');
  readout.className = 'gw-readout';
  panel.appendChild(readout);

  const note = document.createElement('div');
  note.className = 'gw-note';
  caption.appendChild(note);

  /* ---- Rendering ---- */
  function paintBar(b: Bar) {
    const gas = b.value;
    const yTop = Math.max(Y_TOP, yOf(gas));
    const t = tier(gas);
    b.rect.setAttribute('y', String(yTop));
    b.rect.setAttribute('height', String(Math.max(0, Y_BASE - yTop)));
    b.rect.setAttribute('fill', t.fill);
    b.rect.setAttribute('stroke', t.stroke);
    b.val.setAttribute('y', String(yTop - 22));
    b.mult.setAttribute('y', String(yTop - 7));
    b.val.textContent = `${fmtGas(gas)}`;
    const m = gas / ETH.gas;
    b.mult.textContent = m >= 1 ? `${fmtMult(m)} block` : `${Math.round(m * 100)}% block`;
  }

  function refreshAria() {
    bars.forEach((b, i) => {
      const gas = gasFor(i, regime());
      b.g.setAttribute(
        'aria-label',
        `${MODELS[i]!.label} (${MODELS[i]!.arch}): ${Math.round(gas).toLocaleString('en-US')} gas, ` +
          `${fmtMult(gas / ETH.gas)} an Ethereum block, ${tierWord(gas)}, ` +
          `${fmtUsd(usdFor(gas, gwei))} at ${fmtGwei(gwei)}`,
      );
    });
  }

  function setReadout(i: number) {
    readout.innerHTML = '';
    if (i < 0) {
      readout.textContent =
        'hover or tap a bar · gas = overhead + edges×perEdge + ReLU + sigmoid · USD = gas × price × ETH';
      return;
    }
    const gas = gasFor(i, regime());
    const b = document.createElement('b');
    b.textContent = `${MODELS[i]!.label} ${MODELS[i]!.arch}`;
    readout.append(
      b,
      ` — ${Math.round(gas).toLocaleString('en-US')} gas · ${STRUCT[i]!.edges.toLocaleString('en-US')} edges · `,
    );
    readout.append(`${fmtMult(gas / ETH.gas)} Eth / ${fmtMult(gas / BASE.gas)} Base · `);
    const cost = document.createElement('i');
    cost.textContent = `${fmtUsd(usdFor(gas, gwei))} @ ${fmtGwei(gwei)}`;
    readout.append(cost);
  }

  function render() {
    priceOut.innerHTML = '';
    const v = document.createElement('i');
    v.textContent = fmtGwei(gwei);
    priceOut.append(v, ` · ETH $${ETH_USD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    bars.forEach(paintBar);
    refreshAria();
    note.textContent = regime().note;
    setReadout(pinned);
  }

  /* Regime toggle tweens bars between datasets in log space (time-based) */
  function setRegime(key: 'measured' | 'optimized') {
    if (key === regimeKey) return;
    regimeKey = key;
    regimeButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(regimeOrder[j] === key)));
    const from = bars.map((b) => Math.log10(b.value));
    const to = MODELS.map((_, i) => Math.log10(gasFor(i, regime())));
    const DURATION = 360;
    let start = -1;
    cancelAnimationFrame(raf);
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = Math.min((now - start) / DURATION, 1);
      const e = 1 - Math.pow(1 - t, 3);
      bars.forEach((b, j) => {
        b.value = Math.pow(10, from[j]! + (to[j]! - from[j]!) * e);
        paintBar(b);
      });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    note.textContent = regime().note;
    refreshAria();
    setReadout(pinned);
  }

  /* ---- Interaction (delegated; pointer + keyboard) ---- */
  const barIdx = (e: Event) => {
    const el = (e.target as Element).closest<SVGGElement>('[data-bar]');
    return el ? Number(el.dataset.bar) : -1;
  };
  const onOver = (e: Event) => {
    const i = barIdx(e);
    if (i >= 0) {
      pinned = i;
      setReadout(i);
    }
  };
  const onOut = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    if (barIdx(e) === pinned) {
      pinned = -1;
      setReadout(-1);
    }
  };
  const onDown = (e: Event) => {
    pinned = barIdx(e);
    setReadout(pinned);
  };
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('pointerout', onOut);
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('focusin', onOver);
  svg.addEventListener('focusout', onOut);

  const onSlide = () => {
    gwei = gweiOf(Number(slider.value));
    render();
  };
  slider.addEventListener('input', onSlide);

  render();

  return () => {
    cancelAnimationFrame(raf);
    layout.dispose();
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('pointerout', onOut);
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('focusin', onOver);
    svg.removeEventListener('focusout', onOut);
    style.remove();
  };
}
