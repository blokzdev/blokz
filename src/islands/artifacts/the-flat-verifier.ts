/**
 * Artifact: the-flat-verifier — The Flat Verifier
 * Manifest: content/artifacts/the-flat-verifier/manifest.json
 *
 * Log–log SVG chart of the on-chain cost of answering a query as a function of
 * how much chain history it touches. Two cost curves:
 *   • re-execute on-chain — linear in the values read (cold SLOAD per value,
 *     EIP-2929), which slams into the 60M Ethereum block-gas ceiling and, past
 *     the 8191-block window (EIP-2935), can't reach the data at all;
 *   • ZK coprocessor verify — a flat ~300k-gas SNARK check (Groth16 on BN254)
 *     that doesn't move no matter how big the query gets. That flatness is the
 *     whole point of a coprocessor: succinct verification.
 * A slider drags a cursor across query size; preset buttons snap it to real
 * query shapes (TWAP, holding proofs, cross-chain, a year of transfers) whose
 * historical/foreign data the EVM can't re-execute regardless of gas. Numbers
 * are a static snapshot in ./data.json — no runtime fetches.
 *
 * Layout: shared responsive primitive (stage chart · panel readout · footer
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/the-flat-verifier/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const O = data.onchain;
const C = data.coprocessor;
const P = data.proving;
interface Preset {
  id: string;
  label: string;
  values: number;
  reachable: boolean;
  note: string;
}
const PRESETS = data.presets as Preset[];

const NS = 'http://www.w3.org/2000/svg';

/* --- Cost models (gas) --- */
const PER_VALUE = O.coldSloadGas + O.perValueComputeGas; // 2300 gas/value read
const reExecGas = (n: number) => O.txBaseGas + n * PER_VALUE;
const VERIFY_GAS = C.groth16BaseGas + C.resultPublicInputs * C.perPublicInputGas; // ~298k, flat
const WALL = O.ethBlockGasLimit;
/* crossover n where re-execution overtakes the flat verifier */
const CROSS_N = (VERIFY_GAS - O.txBaseGas) / PER_VALUE; // ≈ 120
/* n where re-execution can no longer fit one block */
const WALL_N = (WALL - O.txBaseGas) / PER_VALUE; // ≈ 26k

/* --- Chart geometry (viewBox units), log–log --- */
const VB_W = 800;
const VB_H = 440;
const X0 = 66;
const X1 = 786;
const Y_TOP = 40;
const Y_BASE = 384;

const NX_LO = 0; // log10(1)
const NX_HI = 7; // log10(1e7)
const xOf = (n: number) =>
  X0 + ((Math.log10(Math.max(1, n)) - NX_LO) / (NX_HI - NX_LO)) * (X1 - X0);
const nOf = (x: number) => Math.pow(10, NX_LO + ((x - X0) / (X1 - X0)) * (NX_HI - NX_LO));

const GY_LO = 4; // 1e4 gas
const GY_HI = 10.7; // ~5e10 gas
const yOf = (g: number) =>
  Y_BASE - ((Math.log10(g) - GY_LO) / (GY_HI - GY_LO)) * (Y_BASE - Y_TOP);

/* slider works in log-n space, 1 → 1e7 */
const tOfN = (n: number) => (100 * (Math.log10(Math.max(1, n)) - NX_LO)) / (NX_HI - NX_LO);
const nOfT = (t: number) => Math.pow(10, NX_LO + (t / 100) * (NX_HI - NX_LO));

/* --- Formatters --- */
function fmtGas(g: number): string {
  if (g >= 1e9) return `${(g / 1e9).toFixed(g >= 1e10 ? 1 : 2)}B`;
  if (g >= 1e6) return `${(g / 1e6).toFixed(g >= 1e8 ? 0 : 1)}M`;
  if (g >= 1e3) return `${(g / 1e3).toFixed(0)}k`;
  return String(Math.round(g));
}
function fmtN(n: number): string {
  n = Math.round(n);
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return n.toLocaleString('en-US');
}
const fmtMult = (m: number) =>
  m >= 1000 ? `${Math.round(m).toLocaleString('en-US')}×` : m >= 10 ? `${Math.round(m)}×` : `${m.toFixed(1)}×`;

export default function mount(container: HTMLElement): () => void {
  /* ---- State ---- */
  let n = PRESETS.find((p) => p.id === 'holding')?.values ?? 90;
  let presetId: string | null = 'holding';
  let raf = 0;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '800/440',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .fv-chartwrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .fv-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:pan-y; }
    .fv-grid { stroke:rgba(124,140,255,.1); }
    .fv-gridlabel { fill:#5b6378; font:500 11px 'JetBrains Mono', monospace; }
    .fv-axis { fill:#8d95ad; font:600 11.5px 'JetBrains Mono', monospace; }
    .fv-axissub { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .fv-wall { stroke:#8b5cf6; stroke-dasharray:5 4; stroke-width:1.4; }
    .fv-walllabel { fill:#8b5cf6; font:600 11px 'JetBrains Mono', monospace; }
    .fv-reexec { stroke:#f0a23b; stroke-width:2.4; fill:none; }
    .fv-reexec-faint { stroke:#f0a23b; stroke-width:2.4; fill:none; stroke-dasharray:3 5; opacity:.5; }
    .fv-reexeclabel { fill:#f0a23b; font:600 11.5px 'JetBrains Mono', monospace; }
    .fv-verify { stroke:#22d3ee; stroke-width:2.6; fill:none; }
    .fv-verifylabel { fill:#22d3ee; font:600 11.5px 'JetBrains Mono', monospace; }
    .fv-cross { fill:#5b6378; }
    .fv-crosslabel { fill:#8d95ad; font:500 10px 'JetBrains Mono', monospace; }
    .fv-cursor { stroke:#e7eaf3; stroke-width:1; stroke-dasharray:3 3; opacity:.5; }
    .fv-dot-r { fill:#f0a23b; stroke:#0d1322; stroke-width:1.5; }
    .fv-dot-v { fill:#22d3ee; stroke:#0d1322; stroke-width:1.5; }
    .fv-dot-x { fill:none; stroke:#f0a23b; stroke-width:1.6; }

    .fv-controls { display:flex; flex-direction:column; gap:11px; max-width:100%; }
    .fv-presets { display:flex; gap:7px; flex-wrap:wrap; }
    .fv-presets button { appearance:none; border:1px solid rgba(124,140,255,.16);
      background:transparent; color:#8d95ad; font:600 10.5px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:6px 9px; border-radius:7px; cursor:pointer;
      transition:color .2s, background .2s, border-color .2s; }
    .fv-presets button[aria-pressed="true"] { background:rgba(34,211,238,.12);
      color:#e7eaf3; border-color:rgba(34,211,238,.4); }
    .fv-presets button:focus-visible { outline:2px solid #5b8cff; outline-offset:1px; }
    .fv-slider { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .fv-slider label { display:flex; justify-content:space-between; gap:8px; font-size:10px;
      letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .fv-slider output { color:#e7eaf3; font-size:11px; text-transform:none;
      font-variant-numeric:tabular-nums; }
    .fv-slider output i { color:#22d3ee; font-style:normal; }
    .fv-slider input { width:100%; accent-color:#22d3ee; cursor:pointer; background:transparent; }

    .fv-panel { display:flex; flex-direction:column; gap:9px; min-width:0; }
    .fv-verdict { border:1px solid rgba(124,140,255,.14); border-radius:9px; padding:9px 11px;
      background:#0d1322; display:flex; flex-direction:column; gap:3px; min-width:0; }
    .fv-vhead { display:flex; align-items:baseline; gap:7px; flex-wrap:wrap;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.02em; }
    .fv-vhead .fv-tag { font-size:9px; letter-spacing:.05em; text-transform:uppercase; }
    .fv-tag-r { color:#f0a23b; }
    .fv-tag-v { color:#22d3ee; }
    .fv-vnum { color:#e7eaf3; font:700 16px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .fv-vsub { font-size:10.5px; color:#8d95ad; overflow-wrap:anywhere; }
    .fv-vsub b { color:#e7eaf3; font-weight:600; }
    .fv-bad { color:#f0a23b; }
    .fv-good { color:#22d3ee; }
    .fv-note { font-size:10.5px; color:#8d95ad; line-height:1.5; overflow-wrap:anywhere; }
    .fv-note b { color:#cdd3e3; font-weight:600; }
    .fv-cap { font-size:9.5px; color:#5b6378; line-height:1.5; overflow-wrap:anywhere; }
    .fv-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'fv-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  /* horizontal gas gridlines */
  for (const g of [1e5, 1e6, 1e7, 1e8, 1e9, 1e10]) {
    const y = yOf(g);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'fv-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(X0 - 7));
    t.setAttribute('y', String(y + 3));
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('class', 'fv-gridlabel');
    t.textContent = `${fmtGas(g)}`;
    svg.appendChild(t);
  }
  /* x ticks (powers of ten) */
  for (let p = 0; p <= NX_HI; p++) {
    const x = xOf(Math.pow(10, p));
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(Y_BASE + 16));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'fv-gridlabel');
    t.textContent = fmtN(Math.pow(10, p));
    svg.appendChild(t);
  }

  /* axis titles */
  const yTitle = document.createElementNS(NS, 'text');
  yTitle.setAttribute('x', String(X0 - 7));
  yTitle.setAttribute('y', '24');
  yTitle.setAttribute('class', 'fv-axis');
  yTitle.textContent = 'on-chain gas · log';
  svg.appendChild(yTitle);

  const xTitle = document.createElementNS(NS, 'text');
  xTitle.setAttribute('x', String(X1));
  xTitle.setAttribute('y', String(Y_BASE + 32));
  xTitle.setAttribute('text-anchor', 'end');
  xTitle.setAttribute('class', 'fv-axissub');
  xTitle.textContent = 'historical values the query binds · log';
  svg.appendChild(xTitle);

  /* base axis */
  const baseLine = document.createElementNS(NS, 'line');
  baseLine.setAttribute('x1', String(X0));
  baseLine.setAttribute('x2', String(X1));
  baseLine.setAttribute('y1', String(Y_BASE));
  baseLine.setAttribute('y2', String(Y_BASE));
  baseLine.setAttribute('stroke', 'rgba(124,140,255,.28)');
  svg.appendChild(baseLine);

  /* block-gas wall */
  const wallY = yOf(WALL);
  const wall = document.createElementNS(NS, 'line');
  wall.setAttribute('x1', String(X0));
  wall.setAttribute('x2', String(X1));
  wall.setAttribute('y1', String(wallY));
  wall.setAttribute('y2', String(wallY));
  wall.setAttribute('class', 'fv-wall');
  svg.appendChild(wall);
  const wallLabel = document.createElementNS(NS, 'text');
  wallLabel.setAttribute('x', String(X1 - 3));
  wallLabel.setAttribute('y', String(wallY - 5));
  wallLabel.setAttribute('text-anchor', 'end');
  wallLabel.setAttribute('class', 'fv-walllabel');
  wallLabel.textContent = `Ethereum block · ${fmtGas(WALL)} gas`;
  svg.appendChild(wallLabel);

  /* re-execution curve: solid up to the wall, faint dashed beyond it */
  const reSolid = document.createElementNS(NS, 'path');
  reSolid.setAttribute('class', 'fv-reexec');
  const reFaint = document.createElementNS(NS, 'path');
  reFaint.setAttribute('class', 'fv-reexec-faint');
  {
    const STEPS = 200;
    const pts: Array<{ x: number; y: number; over: boolean }> = [];
    for (let i = 0; i <= STEPS; i++) {
      const nn = Math.pow(10, NX_LO + (i / STEPS) * (NX_HI - NX_LO));
      const g = reExecGas(nn);
      pts.push({ x: xOf(nn), y: yOf(g), over: g > WALL });
    }
    const toPath = (seg: Array<{ x: number; y: number }>) =>
      seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
    const splitAt = pts.findIndex((p) => p.over);
    if (splitAt < 0) {
      reSolid.setAttribute('d', toPath(pts));
      reFaint.setAttribute('d', '');
    } else {
      // overlap one point at the wall crossing so the two segments meet
      reSolid.setAttribute('d', toPath(pts.slice(0, splitAt + 1)));
      reFaint.setAttribute('d', toPath(pts.slice(Math.max(0, splitAt - 1))));
    }
  }
  svg.appendChild(reFaint);
  svg.appendChild(reSolid);

  const reLabel = document.createElementNS(NS, 'text');
  reLabel.setAttribute('class', 'fv-reexeclabel');
  reLabel.setAttribute('x', String(xOf(3.2e6)));
  reLabel.setAttribute('y', String(yOf(reExecGas(3.2e6)) - 8));
  reLabel.setAttribute('text-anchor', 'end');
  reLabel.textContent = 're-execute on-chain';
  svg.appendChild(reLabel);

  /* flat verifier line */
  const vY = yOf(VERIFY_GAS);
  const verify = document.createElementNS(NS, 'line');
  verify.setAttribute('class', 'fv-verify');
  verify.setAttribute('x1', String(X0));
  verify.setAttribute('x2', String(X1));
  verify.setAttribute('y1', String(vY));
  verify.setAttribute('y2', String(vY));
  svg.appendChild(verify);
  const vLabel = document.createElementNS(NS, 'text');
  vLabel.setAttribute('class', 'fv-verifylabel');
  vLabel.setAttribute('x', String(X0 + 6));
  vLabel.setAttribute('y', String(vY - 7));
  vLabel.textContent = `ZK coprocessor verify · ~${fmtGas(VERIFY_GAS)} gas, flat`;
  svg.appendChild(vLabel);

  /* crossover marker */
  const crossX = xOf(CROSS_N);
  const crossDot = document.createElementNS(NS, 'circle');
  crossDot.setAttribute('class', 'fv-cross');
  crossDot.setAttribute('cx', String(crossX));
  crossDot.setAttribute('cy', String(vY));
  crossDot.setAttribute('r', '3');
  svg.appendChild(crossDot);
  const crossLabel = document.createElementNS(NS, 'text');
  crossLabel.setAttribute('class', 'fv-crosslabel');
  crossLabel.setAttribute('x', String(crossX));
  crossLabel.setAttribute('y', String(vY + 16));
  crossLabel.setAttribute('text-anchor', 'middle');
  crossLabel.textContent = `break-even ≈ ${Math.round(CROSS_N)}`;
  svg.appendChild(crossLabel);

  /* interactive cursor + dots */
  const cursor = document.createElementNS(NS, 'line');
  cursor.setAttribute('class', 'fv-cursor');
  cursor.setAttribute('y1', String(Y_TOP));
  cursor.setAttribute('y2', String(Y_BASE));
  svg.appendChild(cursor);

  const dotV = document.createElementNS(NS, 'circle');
  dotV.setAttribute('class', 'fv-dot-v');
  dotV.setAttribute('r', '5');
  dotV.setAttribute('cy', String(vY));
  svg.appendChild(dotV);

  const dotR = document.createElementNS(NS, 'circle');
  dotR.setAttribute('r', '5');
  svg.appendChild(dotR);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'fv-controls';

  const presetRow = document.createElement('div');
  presetRow.className = 'fv-presets';
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'Query shape presets');
  const presetButtons = PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.label;
    b.setAttribute('aria-pressed', String(p.id === presetId));
    b.addEventListener('click', () => setPreset(p.id));
    presetRow.appendChild(b);
    return b;
  });

  const sliderField = document.createElement('div');
  sliderField.className = 'fv-slider';
  const sliderLabel = document.createElement('label');
  sliderLabel.htmlFor = 'fv-n';
  const sliderName = document.createElement('span');
  sliderName.textContent = 'query size';
  const sliderOut = document.createElement('output');
  sliderLabel.append(sliderName, sliderOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'fv-n';
  slider.min = '0';
  slider.max = '100';
  slider.step = '0.5';
  slider.value = String(tOfN(n));
  slider.setAttribute('aria-label', 'Query size, 1 to 10 million historical values');
  sliderField.append(sliderLabel, slider);

  controls.append(presetRow, sliderField);
  controlsSlot.appendChild(controls);

  /* ---- Panel ---- */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'fv-panel';

  const reCard = document.createElement('div');
  reCard.className = 'fv-verdict';
  const reHead = document.createElement('div');
  reHead.className = 'fv-vhead';
  reHead.innerHTML = `<span class="fv-tag fv-tag-r">re-execute on-chain</span>`;
  const reNum = document.createElement('div');
  reNum.className = 'fv-vnum';
  const reSub = document.createElement('div');
  reSub.className = 'fv-vsub';
  reCard.append(reHead, reNum, reSub);

  const vCard = document.createElement('div');
  vCard.className = 'fv-verdict';
  const vHead = document.createElement('div');
  vHead.className = 'fv-vhead';
  vHead.innerHTML = `<span class="fv-tag fv-tag-v">ZK coprocessor</span>`;
  const vNum = document.createElement('div');
  vNum.className = 'fv-vnum';
  const vSub = document.createElement('div');
  vSub.className = 'fv-vsub';
  vCard.append(vHead, vNum, vSub);

  const note = document.createElement('div');
  note.className = 'fv-note';

  panelWrap.append(reCard, vCard, note);
  panel.appendChild(panelWrap);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'fv-cap';
  cap.innerHTML =
    `Re-execution = 21k base + ${PER_VALUE.toLocaleString('en-US')} gas/value (cold SLOAD, EIP-2929). ` +
    `Verify = Groth16 on BN254 (~${fmtGas(VERIFY_GAS)}, ${C.resultPublicInputs} public inputs); ` +
    `Axiom V2 reports a fixed <b>${fmtGas(C.axiomFixedLowGas)}–${fmtGas(C.axiomFixedHighGas)}</b> on-chain. ` +
    `The work moves off-chain: <b>${P.system}</b> proves a full ${fmtGas(P.blockGasLimit)}-gas block in ` +
    `<b>${P.secPerBlock}s</b> on a ${P.gpus} rig (~$${(P.rigCostUsd / 1000).toFixed(0)}k).`;
  caption.appendChild(cap);

  /* ---- Render ---- */
  function activePreset(): Preset | null {
    return presetId ? PRESETS.find((p) => p.id === presetId) ?? null : null;
  }

  function render() {
    const reGas = reExecGas(n);
    const x = xOf(n);
    const preset = activePreset();
    const impossible = preset ? !preset.reachable : false;
    const overWall = reGas > WALL;

    /* cursor + dots */
    cursor.setAttribute('x1', String(x));
    cursor.setAttribute('x2', String(x));
    dotV.setAttribute('cx', String(x));
    const reY = yOf(reGas);
    dotR.setAttribute('cx', String(x));
    dotR.setAttribute('cy', String(reY));
    dotR.setAttribute('class', overWall || impossible ? 'fv-dot-x' : 'fv-dot-r');

    /* slider output */
    sliderOut.innerHTML = '';
    const si = document.createElement('i');
    si.textContent = fmtN(n);
    sliderOut.append(si, ' values');

    /* re-exec card */
    reNum.textContent = `${fmtGas(reGas)} gas`;
    reSub.innerHTML = '';
    if (impossible) {
      reNum.classList.add('fv-bad');
      reSub.innerHTML = `<b class="fv-bad">impossible</b> — the state isn't reachable on-chain (historical past the ${O.historyWindowBlocks.toLocaleString('en-US')}-block window, or another chain).`;
    } else if (overWall) {
      reNum.classList.add('fv-bad');
      reSub.innerHTML = `<b class="fv-bad">won't fit</b> — past the ${fmtGas(WALL)} block gas limit at ~${fmtN(WALL_N)} values. You'd need ${fmtMult(reGas / WALL)} a full block.`;
    } else {
      reNum.classList.remove('fv-bad');
      reSub.innerHTML = `fits one block — ${fmtN(n)} cold reads, if every value is in <b>current</b> state.`;
    }

    /* verify card */
    vNum.textContent = `${fmtGas(VERIFY_GAS)} gas`;
    vNum.classList.add('fv-good');
    if (impossible || overWall) {
      vSub.innerHTML = `<b class="fv-good">the only path</b> — one succinct proof, verified flat regardless of query size.`;
    } else {
      const mult = reGas / VERIFY_GAS;
      vSub.innerHTML =
        mult >= 1
          ? `<b>${fmtMult(mult)}</b> cheaper than re-executing, and flat as the query grows.`
          : `<b>${fmtMult(VERIFY_GAS / reGas)}</b> dearer here — below the ~${Math.round(CROSS_N)}-value break-even, just read on-chain.`;
    }

    /* contextual note */
    if (preset) {
      note.innerHTML = `<b>${preset.label}.</b> ${preset.note}`;
    } else {
      note.innerHTML = `Drag to resize the query, or pick a shape. The cyan line never moves: <b>verification cost is independent of how much history the proof binds.</b>`;
    }
  }

  function setPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    presetId = id;
    n = p.values;
    slider.value = String(tOfN(n));
    presetButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(PRESETS[j]!.id === id)));
    render();
  }

  function clearPreset() {
    if (presetId === null) return;
    presetId = null;
    presetButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }

  /* ---- Interaction ---- */
  const onSlide = () => {
    clearPreset();
    n = nOfT(Number(slider.value));
    render();
  };
  slider.addEventListener('input', onSlide);

  /* drag directly on the chart */
  let dragging = false;
  const pointToN = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * VB_W;
    const clamped = Math.max(X0, Math.min(X1, vx));
    return Math.max(1, Math.min(1e7, nOf(clamped)));
  };
  const onDown = (e: PointerEvent) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    clearPreset();
    n = pointToN(e);
    slider.value = String(tOfN(n));
    render();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    n = pointToN(e);
    slider.value = String(tOfN(n));
    render();
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  render();

  return () => {
    cancelAnimationFrame(raf);
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    layout.dispose();
    style.remove();
  };
}
