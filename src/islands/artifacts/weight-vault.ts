/**
 * Artifact: weight-vault — The Weight Vault
 * Manifest: content/artifacts/weight-vault/manifest.json
 *
 * The storage bill behind "on-chain AI". A blockchain commits to a model's
 * 32-byte hash for cents; keeping the gigabytes it points to RETRIEVABLE is a
 * separate, continuous bill. This calculator plots the cumulative cost of
 * keeping a model of size N retrievable over a T-year horizon across four
 * decentralized storage layers — three that charge rent (Filecoin, 0G, Walrus)
 * and one that charges once forever (Arweave) — so you can find the year where
 * pay-once permanence undercuts recurring rent. Alongside it: the bytes-vs-hash
 * gap (what it would cost to put the weights on the chain itself) and the
 * retrieval-throughput wall that makes "decentralized serving" start with a
 * cold download.
 *
 * All pricing is snapshotted in data.json from protocol docs/whitepapers
 * (see manifest dataSource/dataAsOf). Native-input sliders + preset buttons,
 * keyboard accessible; renders on input, no RAF loop.
 *
 * Layout: shared createArtifactLayout primitive. stage = cost-vs-horizon chart,
 * panel = per-layer cost cards + bytes/hash + retrieval readouts, controls =
 * model presets + size/horizon sliders, caption = provenance. wideTemplate
 * 'footer' — controls span full width under [stage | panel].
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/weight-vault/data.json';

type Layer = {
  id: string;
  name: string;
  mode: 'rent' | 'permanent';
  usdPerGbMonth?: number;
  usdPerGb?: number;
  proof: string;
  redundancy: string;
  flag?: string;
  throughputMbps?: number;
};

const LAYERS = data.layers as Layer[];
const COLOR: Record<string, string> = {
  filecoin: '#34d399',
  '0g': '#22d3ee',
  walrus: '#5b8cff',
  arweave: '#f5a524',
};
const OC = data.onchain;

// Cumulative USD to keep `gb` logical gigabytes alive for `years`.
function costAt(layer: Layer, gb: number, years: number): number {
  if (layer.mode === 'permanent') return (layer.usdPerGb ?? 0) * gb;
  return (layer.usdPerGbMonth ?? 0) * 12 * years * gb;
}

const fmtUsd = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (a >= 1) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
};
const fmtGb = (gb: number): string => (gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${Math.round(gb)} GB`);
const fmtTime = (sec: number): string => {
  if (sec < 90) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`;
  if (sec < 5400) return `${(sec / 60).toFixed(0)} min`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} d`;
};

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    // Match the chart's own 640×300 viewBox so the stage hugs it with no dead gap.
    stageAspect: '64/30',
  });

  const style = document.createElement('style');
  style.textContent = `
    .wv-stage { display:flex; flex-direction:column; gap:8px;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .wv-stagewrap { position:relative; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0b1020; padding:10px 12px 8px; min-width:0; max-width:100%; }
    .wv-svgbox { position:relative; min-width:0; max-width:100%; }
    .wv-svgbox svg { width:100%; height:auto; display:block; aspect-ratio:640/300; }
    .wv-axis { position:absolute; font:600 8.5px/1 'JetBrains Mono', monospace; color:#5b6378;
      letter-spacing:.05em; pointer-events:none; white-space:nowrap; text-transform:uppercase; }
    .wv-xlabel { position:absolute; font:600 8.5px/1 'JetBrains Mono', monospace; color:#5b6378;
      transform:translateX(-50%); pointer-events:none; white-space:nowrap; }
    .wv-cross { position:absolute; transform:translate(-50%,-100%); font:700 9px/1.3 'JetBrains Mono', monospace;
      color:#f5a524; text-align:center; pointer-events:none; white-space:nowrap; }
    .wv-controls { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .wv-presets { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
    .wv-preset { flex:0 0 auto; cursor:pointer; border:1px solid rgba(124,140,255,.22);
      background:#10162a; color:#a8b0c6; border-radius:6px; padding:4px 9px;
      font:600 10.5px/1.2 'JetBrains Mono', monospace; letter-spacing:.02em; }
    .wv-preset[aria-pressed=true] { border-color:#5b8cff; background:rgba(91,140,255,.16); color:#dbe2f5; }
    .wv-sliders { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(190px,100%),1fr));
      gap:8px 16px; min-width:0; }
    .wv-field { min-width:0; max-width:100%; }
    .wv-field label { display:flex; justify-content:space-between; gap:8px; min-width:0;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .wv-field label span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .wv-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; flex:0 0 auto; }
    .wv-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:4px 0 0; }
    .wv-panel { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; }
    .wv-card { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:9px 11px; min-width:0; max-width:100%; }
    .wv-card h3 { margin:0 0 7px; font:700 10px 'JetBrains Mono', monospace; letter-spacing:.12em;
      text-transform:uppercase; color:#5b8cff; }
    .wv-card h3 b { color:#e7eaf3; }
    .wv-rows { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .wv-row { display:grid; grid-template-columns:10px minmax(0,1fr) auto; align-items:baseline;
      gap:8px; min-width:0; }
    .wv-chip { width:8px; height:8px; border-radius:2px; align-self:center; }
    .wv-name { min-width:0; }
    .wv-name b { color:#dbe2f5; font-weight:600; }
    .wv-sub { display:block; color:#5b6378; font-size:9px; letter-spacing:.02em;
      overflow-wrap:anywhere; }
    .wv-cost { text-align:right; color:#e7eaf3; font-variant-numeric:tabular-nums; font-size:12px;
      flex:0 0 auto; }
    .wv-row.is-min .wv-cost { color:#34d399; }
    .wv-gap { border:1px solid rgba(245,165,36,.28); border-radius:12px; background:rgba(245,165,36,.06);
      padding:9px 11px; min-width:0; }
    .wv-gap h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace; letter-spacing:.12em;
      text-transform:uppercase; color:#f5a524; }
    .wv-gap dl { margin:0; display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr);
      gap:4px 10px; min-width:0; }
    .wv-gap dt { color:#7e869c; font-size:10px; min-width:0; }
    .wv-gap dd { margin:0; text-align:right; color:#e7eaf3; font-variant-numeric:tabular-nums;
      overflow-wrap:anywhere; }
    .wv-gap dd b { color:#f5a524; }
    .wv-note { font:500 9px/1.5 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.02em;
      text-align:center; }
  `;
  container.appendChild(style);

  /* ---------- Stage: cost-vs-horizon chart ---------- */
  const stageRoot = layout.stage;
  stageRoot.className += ' wv-stage';
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'wv-stagewrap';
  const box = document.createElement('div');
  box.className = 'wv-svgbox';
  const svg = document.createElementNS(NS, 'svg');
  const W = 640;
  const H = 300;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('aria-hidden', 'true');
  box.appendChild(svg);
  wrap.appendChild(box);
  stageRoot.appendChild(wrap);

  const PX = { l: 12, r: 14, t: 14, b: 22 };
  const xOf = (yr: number, horizon: number): number =>
    PX.l + (yr / horizon) * (W - PX.l - PX.r);
  const yOf = (c: number, yMax: number): number =>
    H - PX.b - (Math.min(c, yMax) / yMax) * (H - PX.t - PX.b);

  // Gridlines (4 horizontal), redrawn cheaply each render via a group.
  const gridG = document.createElementNS(NS, 'g');
  svg.appendChild(gridG);
  const horizonLine = document.createElementNS(NS, 'line');
  horizonLine.setAttribute('stroke', 'rgba(124,140,255,.30)');
  horizonLine.setAttribute('stroke-width', '1');
  horizonLine.setAttribute('stroke-dasharray', '4 4');
  svg.appendChild(horizonLine);

  const paths: Record<string, SVGPathElement> = {};
  const dots: Record<string, SVGCircleElement> = {};
  for (const L of LAYERS) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', COLOR[L.id] ?? '#8d95ad');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (L.mode === 'permanent') p.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(p);
    paths[L.id] = p;
  }
  const crossDot = document.createElementNS(NS, 'circle');
  crossDot.setAttribute('r', '4');
  crossDot.setAttribute('fill', '#f5a524');
  crossDot.setAttribute('stroke', '#0b1020');
  crossDot.setAttribute('stroke-width', '1.5');
  svg.appendChild(crossDot);
  for (const L of LAYERS) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '3.4');
    c.setAttribute('fill', COLOR[L.id] ?? '#8d95ad');
    svg.appendChild(c);
    dots[L.id] = c;
  }

  // DOM overlay labels (SVG is stretched; keep text crisp).
  const axCost = document.createElement('div');
  axCost.className = 'wv-axis';
  axCost.style.left = '14px';
  axCost.style.top = '6px';
  axCost.textContent = '↑ cumulative $';
  box.appendChild(axCost);
  const axYr = document.createElement('div');
  axYr.className = 'wv-axis';
  axYr.style.right = '14px';
  axYr.style.bottom = '4px';
  axYr.textContent = 'years →';
  box.appendChild(axYr);
  const x0 = document.createElement('div');
  x0.className = 'wv-xlabel';
  x0.style.left = `${(PX.l / W) * 100}%`;
  x0.style.bottom = '4px';
  x0.textContent = '0';
  box.appendChild(x0);
  const xEnd = document.createElement('div');
  xEnd.className = 'wv-xlabel';
  xEnd.style.bottom = '4px';
  box.appendChild(xEnd);
  const crossLab = document.createElement('div');
  crossLab.className = 'wv-cross';
  box.appendChild(crossLab);

  /* ---------- Panel ---------- */
  const panelRoot = layout.panel;
  panelRoot.className += ' wv-panel';
  const costCard = document.createElement('div');
  costCard.className = 'wv-card';
  const costH = document.createElement('h3');
  costCard.appendChild(costH);
  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'wv-rows';
  costCard.appendChild(rowsWrap);
  const rowEls: Record<string, { row: HTMLElement; cost: HTMLElement }> = {};
  for (const L of LAYERS) {
    const row = document.createElement('div');
    row.className = 'wv-row';
    const chip = document.createElement('span');
    chip.className = 'wv-chip';
    chip.style.background = COLOR[L.id] ?? '#8d95ad';
    const name = document.createElement('div');
    name.className = 'wv-name';
    const sub = L.flag ?? (L.mode === 'permanent' ? 'pay-once · permanent' : `rent · ${L.proof}`);
    const nb = document.createElement('b');
    nb.textContent = L.name;
    const ns = document.createElement('span');
    ns.className = 'wv-sub';
    ns.textContent = sub;
    name.append(nb, ns);
    const cost = document.createElement('div');
    cost.className = 'wv-cost';
    row.append(chip, name, cost);
    rowsWrap.appendChild(row);
    rowEls[L.id] = { row, cost };
  }
  panelRoot.appendChild(costCard);

  const gap = document.createElement('div');
  gap.className = 'wv-gap';
  const gapH = document.createElement('h3');
  gapH.textContent = 'the bytes vs the hash';
  const gapDl = document.createElement('dl');
  const mkGapRow = (label: string): HTMLElement => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    gapDl.append(dt, dd);
    return dd;
  };
  const ddHash = mkGapRow('hash on Ethereum');
  const ddBytes = mkGapRow('weights as calldata');
  const ddCold = mkGapRow('cold load @30MB/s');
  const ddWarm = mkGapRow('… @1GB/s datacenter');
  gap.append(gapH, gapDl);
  panelRoot.appendChild(gap);

  /* ---------- Controls ---------- */
  const ctlRoot = layout.controls;
  ctlRoot.className += ' wv-controls';
  const presets = document.createElement('div');
  presets.className = 'wv-presets';
  ctlRoot.appendChild(presets);
  const presetBtns: { btn: HTMLButtonElement; gb: number }[] = [];
  for (const m of data.models) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wv-preset';
    btn.textContent = `${m.label} · ${fmtGb(m.gb)}`;
    btn.setAttribute('aria-pressed', 'false');
    presets.appendChild(btn);
    presetBtns.push({ btn, gb: m.gb });
  }

  const sliders = document.createElement('div');
  sliders.className = 'wv-sliders';
  ctlRoot.appendChild(sliders);
  const mkSlider = (id: string, label: string, min: number, max: number, step: number, value: number) => {
    const field = document.createElement('div');
    field.className = 'wv-field';
    const lab = document.createElement('label');
    lab.htmlFor = `wv-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `wv-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    sliders.appendChild(field);
    return { input, out };
  };
  const sizeS = mkSlider('size', 'model footprint', 2, 1024, 1, 140);
  const horizonS = mkSlider('horizon', 'time horizon', 1, 50, 1, 30);

  /* ---------- Caption ---------- */
  const cap = layout.caption;
  cap.className += ' wv-note';
  cap.textContent =
    `storage $/GB from protocol docs (Walrus $0.023/GB·mo, 0G $11/TB·mo, Filecoin ~$0.19/TB·mo, Arweave ~$6/GB once), as of ${data.asOf}. ` +
    `on-chain anchor priced at ETH $${OC.ethUsd}, ${OC.gasGwei} gwei, ${(OC.calldataGasPerByte)} gas/byte, ${(OC.blockGasLimit / 1e6)}M block-gas limit.`;

  /* ---------- Render ---------- */
  function render(): void {
    const gb = Number(sizeS.input.value);
    const horizon = Number(horizonS.input.value);
    sizeS.out.textContent = fmtGb(gb);
    horizonS.out.textContent = `${horizon} yr`;

    // Sync preset pressed-state.
    for (const { btn, gb: pg } of presetBtns) btn.setAttribute('aria-pressed', String(pg === gb));

    // Auto-scale y to the largest curve value reached within the horizon.
    let yMax = 1;
    for (const L of LAYERS) yMax = Math.max(yMax, costAt(L, gb, horizon));
    yMax *= 1.08;

    // Gridlines + y tick labels.
    gridG.replaceChildren();
    for (let i = 1; i <= 4; i++) {
      const c = (yMax / 4) * i;
      const y = yOf(c, yMax);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', String(PX.l));
      ln.setAttribute('x2', String(W - PX.r));
      ln.setAttribute('y1', String(y));
      ln.setAttribute('y2', String(y));
      ln.setAttribute('stroke', 'rgba(124,140,255,.08)');
      ln.setAttribute('stroke-width', '1');
      gridG.appendChild(ln);
    }

    horizonLine.setAttribute('x1', String(W - PX.r));
    horizonLine.setAttribute('x2', String(W - PX.r));
    horizonLine.setAttribute('y1', String(PX.t));
    horizonLine.setAttribute('y2', String(H - PX.b));

    // Curves + endpoint dots. Permanent = flat; rent = linear from origin.
    let minId = LAYERS[0]!.id;
    let minCost = Infinity;
    for (const L of LAYERS) {
      const cH = costAt(L, gb, horizon);
      if (cH < minCost) { minCost = cH; minId = L.id; }
      let d: string;
      if (L.mode === 'permanent') {
        const y = yOf(cH, yMax);
        d = `M${xOf(0, horizon)} ${y} L${xOf(horizon, horizon)} ${y}`;
      } else {
        d = `M${xOf(0, horizon)} ${yOf(0, yMax)} L${xOf(horizon, horizon)} ${yOf(cH, yMax)}`;
      }
      paths[L.id]!.setAttribute('d', d);
      dots[L.id]!.setAttribute('cx', String(xOf(horizon, horizon)));
      dots[L.id]!.setAttribute('cy', String(yOf(cH, yMax)));
      const { row, cost } = rowEls[L.id]!;
      cost.textContent = fmtUsd(cH);
      row.classList.toggle('is-min', false);
    }
    rowEls[minId]!.row.classList.add('is-min');

    // Crossover of Arweave (permanent) and Walrus (priciest rent): t* years.
    const arweave = LAYERS.find((l) => l.id === 'arweave');
    const walrus = LAYERS.find((l) => l.id === 'walrus');
    if (arweave && walrus && walrus.usdPerGbMonth) {
      const tStar = (arweave.usdPerGb ?? 0) / (walrus.usdPerGbMonth * 12);
      if (tStar > 0.3 && tStar <= horizon) {
        const cStar = costAt(walrus, gb, tStar);
        crossDot.style.display = '';
        crossDot.setAttribute('cx', String(xOf(tStar, horizon)));
        crossDot.setAttribute('cy', String(yOf(cStar, yMax)));
        crossLab.style.display = '';
        crossLab.style.left = `${(xOf(tStar, horizon) / W) * 100}%`;
        crossLab.style.top = `${(yOf(cStar, yMax) / H) * 100}%`;
        crossLab.textContent = `permanent wins ~${tStar.toFixed(0)} yr`;
      } else {
        crossDot.style.display = 'none';
        crossLab.style.display = 'none';
      }
    }

    // Header + x-axis end label.
    costH.innerHTML = `keep <b>${fmtGb(gb)}</b> alive · ${horizon} yr`;
    xEnd.textContent = `${horizon} yr`;
    xEnd.style.left = `${((W - PX.r) / W) * 100}%`;
    xEnd.style.transform = 'translateX(-100%)';

    // Bytes-vs-hash: anchor 32-byte hash vs the full weights as calldata.
    const bytes = gb * 1e9;
    const hashGas = OC.baseTxGas + OC.hashBytes * OC.calldataGasPerByte;
    const hashUsd = hashGas * OC.gasGwei * 1e-9 * OC.ethUsd;
    const bytesGas = bytes * OC.calldataGasPerByte;
    const bytesUsd = bytesGas * OC.gasGwei * 1e-9 * OC.ethUsd;
    const blocks = bytesGas / OC.blockGasLimit;
    const blockDays = (blocks * OC.blockTimeSec) / 86400;
    ddHash.innerHTML = `<b>${fmtUsd(hashUsd)}</b>`;
    ddBytes.innerHTML = `<b>${fmtUsd(bytesUsd)}</b> · ${blocks >= 1000 ? `${(blocks / 1000).toFixed(0)}k` : blocks.toFixed(0)} blocks (${blockDays.toFixed(1)} d)`;

    // Retrieval wall: cold-load time at decentralized vs datacenter bandwidth.
    const mb = gb * 1024;
    ddCold.textContent = fmtTime(mb / data.retrieval.decentralizedMbps);
    ddWarm.textContent = fmtTime(mb / data.retrieval.centralizedMbps);
  }

  const onSize = () => render();
  sizeS.input.addEventListener('input', onSize);
  horizonS.input.addEventListener('input', onSize);
  const onPreset = (gb: number) => {
    sizeS.input.value = String(gb);
    render();
  };
  const presetHandlers = presetBtns.map(({ btn, gb }) => {
    const h = () => onPreset(gb);
    btn.addEventListener('click', h);
    return { btn, h };
  });
  render();

  return () => {
    sizeS.input.removeEventListener('input', onSize);
    horizonS.input.removeEventListener('input', onSize);
    for (const { btn, h } of presetHandlers) btn.removeEventListener('click', h);
    style.remove();
    layout.dispose();
  };
}
