/**
 * Artifact: the-attestation-ladder — The Attestation Ladder
 * Manifest: content/artifacts/the-attestation-ladder/manifest.json
 *
 * Horizontal stacked-bar chart of the on-chain gas cost of verifying a TEE
 * (Intel SGX/TDX) DCAP attestation quote, across three paths:
 *   • Naive Solidity — the full quote parse + PCK X.509 cert-chain walk +
 *     collateral/TCB checks + three ECDSA verifies, ~4.5M gas;
 *   • EIP-7951 precompile — Fusaka's P256VERIFY drops each ECDSA verify from
 *     ~330k to 6k, shaving ~1M; the parsing/collateral bulk is untouched;
 *   • zkVM-compressed — verify off-chain in a zkVM, post one Groth16 proof
 *     that the contract checks for a flat ~290k whatever the quote size.
 * Each on-chain bar is split into its ECDSA-verify portion (sourced) and the
 * X.509-parse + collateral remainder (a model anchored on the sourced totals).
 * A slider scales to attestations-per-day; the panel shows gas/day, how many
 * 60M-gas Ethereum blocks that is, and the cost in USD — the flat proof is the
 * only path that survives continuous agent attestation. Numbers are a static
 * snapshot in ./data.json — no runtime fetches.
 *
 * Layout: shared responsive primitive (stage chart · panel readout · footer
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/the-attestation-ladder/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* --- Cost model (gas) --- */
const ECDSA_N = data.ecdsaVerifies;
const ECDSA_SOL = data.ecdsaSolidityGas; // 330k Solidity
const ECDSA_PRE = data.ecdsaPrecompileGas; // 6k via EIP-7951
const NAIVE_TOTAL = data.naiveTotalGas; // ~4.5M
const REST = NAIVE_TOTAL - ECDSA_N * ECDSA_SOL; // X.509 parse + collateral remainder
const ZKVM = data.zkvmAvgGas; // ~290k flat
const BLOCK = data.blockGasLimit; // 60M

interface Path {
  id: string;
  label: string;
  sub: string;
  ecdsa: 'solidity' | 'precompile' | 'none';
  note: string;
}
const PATHS = data.paths as Path[];

const ecdsaGas = (p: Path) =>
  p.ecdsa === 'solidity' ? ECDSA_N * ECDSA_SOL : p.ecdsa === 'precompile' ? ECDSA_N * ECDSA_PRE : 0;
const restGas = (p: Path) => (p.ecdsa === 'none' ? ZKVM : REST);
const totalGas = (p: Path) => restGas(p) + ecdsaGas(p);
const ZKVM_TOTAL = totalGas(PATHS.find((p) => p.id === 'zkvm')!);

/* --- Chart geometry (viewBox units) --- */
const VB_W = 800;
const VB_H = 340;
const PLOT_X0 = 22;
const PLOT_X1 = 612;
const TOTALS_X = 792;
const AXIS_MAX = 4_800_000;
const GRID_TOP = 44;
const GRID_BOT = 284;
const BAR_H = 40;
const ROW_LABEL = [58, 146, 234];
const ROW_BAR = [66, 154, 242];

const xOf = (g: number) => PLOT_X0 + (Math.min(g, AXIS_MAX) / AXIS_MAX) * (PLOT_X1 - PLOT_X0);

/* --- Formatters --- */
function fmtGas(g: number): string {
  if (g >= 1e9) return `${(g / 1e9).toFixed(g >= 1e10 ? 1 : 2)}B`;
  if (g >= 1e6) return `${(g / 1e6).toFixed(2)}M`;
  if (g >= 1e3) return `${Math.round(g / 1e3)}k`;
  return String(Math.round(g));
}
const fmtMult = (m: number) => (m >= 100 ? `${Math.round(m)}×` : `${m.toFixed(1)}×`);
function fmtUsd(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}
function fmtCadence(perDay: number): string {
  if (perDay >= 86400) return 'once/sec';
  if (perDay >= 1440) return `≈ once/${Math.round(86400 / perDay)}s`;
  if (perDay >= 24) return `≈ ${Math.round(perDay / 24)}/hr`;
  return `${Math.round(perDay)}/day`;
}

/* slider in log space, 1/day → 86400/day (once a second) */
const PD_MIN = 1;
const PD_MAX = 86400;
const tOfPd = (pd: number) => (100 * Math.log10(pd / PD_MIN)) / Math.log10(PD_MAX / PD_MIN);
const pdOfT = (t: number) => PD_MIN * Math.pow(PD_MAX / PD_MIN, t / 100);

export default function mount(container: HTMLElement): () => void {
  let selectedId = 'solidity';
  let perDay = 1440; // once a minute — "continuous agent integrity"

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '800/340',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .al-chartwrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .al-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:pan-y; }
    .al-grid { stroke:rgba(124,140,255,.1); }
    .al-gridlabel { fill:#5b6378; font:500 10.5px 'JetBrains Mono', monospace; }
    .al-axissub { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .al-plabel { fill:#cdd3e3; font:600 12.5px 'JetBrains Mono', monospace; }
    .al-psub { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .al-total { fill:#e7eaf3; font:700 13px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .al-totalsub { fill:#5b6378; font:600 9px 'JetBrains Mono', monospace; }
    .al-seg { cursor:pointer; transition:opacity .18s; }
    .al-seg-rest { fill:#4d6bd6; }
    .al-seg-ecdsa { fill:#f0a23b; }
    .al-seg-zkvm { fill:#22d3ee; }
    .al-row-dim { opacity:.4; }
    .al-rowsel { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:.55; }

    .al-controls { display:flex; flex-direction:column; gap:11px; max-width:100%; }
    .al-tabs { display:flex; gap:7px; flex-wrap:wrap; }
    .al-tabs button { appearance:none; border:1px solid rgba(124,140,255,.16);
      background:transparent; color:#8d95ad; font:600 10.5px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:6px 9px; border-radius:7px; cursor:pointer;
      display:flex; align-items:center; gap:6px;
      transition:color .2s, background .2s, border-color .2s; }
    .al-tabs button[aria-pressed="true"] { background:rgba(124,140,255,.12);
      color:#e7eaf3; border-color:rgba(124,140,255,.4); }
    .al-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:1px; }
    .al-swatch { width:9px; height:9px; border-radius:2px; flex:none; }
    .al-slider { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .al-slider label { display:flex; justify-content:space-between; gap:8px; font-size:10px;
      letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .al-slider output { color:#e7eaf3; font-size:11px; text-transform:none;
      font-variant-numeric:tabular-nums; }
    .al-slider output i { color:#7c8cff; font-style:normal; }
    .al-slider input { width:100%; accent-color:#7c8cff; cursor:pointer; background:transparent; }

    .al-panel { display:flex; flex-direction:column; gap:9px; min-width:0; }
    .al-card { border:1px solid rgba(124,140,255,.14); border-radius:9px; padding:9px 11px;
      background:#0d1322; display:flex; flex-direction:column; gap:6px; min-width:0; }
    .al-chead { display:flex; align-items:baseline; gap:7px; flex-wrap:wrap;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.02em; color:#e7eaf3; }
    .al-chead .al-csub { font-size:9px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .al-cnum { color:#e7eaf3; font:700 17px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .al-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 12px; }
    .al-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .al-stat span { font-size:9px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .al-stat b { color:#e7eaf3; font:600 12.5px 'JetBrains Mono', monospace;
      font-variant-numeric:tabular-nums; }
    .al-stat b.al-good { color:#22d3ee; }
    .al-note { font-size:10.5px; color:#8d95ad; line-height:1.5; overflow-wrap:anywhere; }
    .al-note b { color:#cdd3e3; font-weight:600; }
    .al-cap { font-size:9.5px; color:#5b6378; line-height:1.5; overflow-wrap:anywhere; }
    .al-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'al-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  /* vertical gas gridlines + bottom labels */
  for (let g = 0; g <= AXIS_MAX; g += 1_000_000) {
    const x = xOf(g);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(GRID_TOP));
    line.setAttribute('y2', String(GRID_BOT));
    line.setAttribute('class', 'al-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(GRID_BOT + 16));
    t.setAttribute('text-anchor', g === 0 ? 'start' : 'middle');
    t.setAttribute('class', 'al-gridlabel');
    t.textContent = g === 0 ? '0' : `${g / 1e6}M`;
    svg.appendChild(t);
  }
  const xTitle = document.createElementNS(NS, 'text');
  xTitle.setAttribute('x', String(PLOT_X1));
  xTitle.setAttribute('y', String(GRID_BOT + 32));
  xTitle.setAttribute('text-anchor', 'end');
  xTitle.setAttribute('class', 'al-axissub');
  xTitle.textContent = 'gas to verify one attestation quote on-chain →';
  svg.appendChild(xTitle);

  /* per-path rows */
  const rowGroups: Array<{ sel: SVGRectElement; segs: SVGRectElement[]; total: SVGTextElement }> = [];

  PATHS.forEach((p, i) => {
    const yLabel = ROW_LABEL[i]!;
    const yBar = ROW_BAR[i]!;

    const lab = document.createElementNS(NS, 'text');
    lab.setAttribute('x', String(PLOT_X0));
    lab.setAttribute('y', String(yLabel));
    lab.setAttribute('class', 'al-plabel');
    lab.textContent = p.label;
    svg.appendChild(lab);
    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', String(PLOT_X0 + p.label.length * 7.6 + 12));
    sub.setAttribute('y', String(yLabel));
    sub.setAttribute('class', 'al-psub');
    sub.textContent = p.sub;
    svg.appendChild(sub);

    const sel = document.createElementNS(NS, 'rect');
    sel.setAttribute('x', String(PLOT_X0 - 4));
    sel.setAttribute('y', String(yBar - 4));
    sel.setAttribute('height', String(BAR_H + 8));
    sel.setAttribute('rx', '6');
    sel.setAttribute('class', 'al-rowsel');
    sel.style.display = 'none';
    svg.appendChild(sel);

    const segs: SVGRectElement[] = [];
    const mk = (cls: string) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('y', String(yBar));
      r.setAttribute('height', String(BAR_H));
      r.setAttribute('class', `al-seg ${cls}`);
      r.addEventListener('click', () => select(p.id));
      svg.appendChild(r);
      segs.push(r);
      return r;
    };
    if (p.ecdsa === 'none') {
      mk('al-seg-zkvm');
    } else {
      mk('al-seg-rest');
      mk('al-seg-ecdsa');
    }

    const total = document.createElementNS(NS, 'text');
    total.setAttribute('x', String(TOTALS_X));
    total.setAttribute('y', String(yBar + BAR_H / 2 - 1));
    total.setAttribute('text-anchor', 'end');
    total.setAttribute('class', 'al-total');
    svg.appendChild(total);
    const totalSub = document.createElementNS(NS, 'text');
    totalSub.setAttribute('x', String(TOTALS_X));
    totalSub.setAttribute('y', String(yBar + BAR_H / 2 + 11));
    totalSub.setAttribute('text-anchor', 'end');
    totalSub.setAttribute('class', 'al-totalsub');
    totalSub.textContent = 'gas';
    svg.appendChild(totalSub);

    rowGroups.push({ sel, segs, total });
  });

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'al-controls';

  const tabs = document.createElement('div');
  tabs.className = 'al-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Select a verification path');
  const swatchFor = (p: Path) => (p.ecdsa === 'none' ? '#22d3ee' : '#4d6bd6');
  const tabButtons = PATHS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    const sw = document.createElement('span');
    sw.className = 'al-swatch';
    sw.style.background = swatchFor(p);
    const txt = document.createElement('span');
    txt.textContent = p.label;
    b.append(sw, txt);
    b.setAttribute('aria-pressed', String(p.id === selectedId));
    b.addEventListener('click', () => select(p.id));
    tabs.appendChild(b);
    return b;
  });

  const sliderField = document.createElement('div');
  sliderField.className = 'al-slider';
  const sliderLabel = document.createElement('label');
  sliderLabel.htmlFor = 'al-pd';
  const sliderName = document.createElement('span');
  sliderName.textContent = 'attestations / day';
  const sliderOut = document.createElement('output');
  sliderLabel.append(sliderName, sliderOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'al-pd';
  slider.min = '0';
  slider.max = '100';
  slider.step = '0.5';
  slider.value = String(tOfPd(perDay));
  slider.setAttribute('aria-label', 'Attestations per day, 1 to 86400');
  sliderField.append(sliderLabel, slider);

  controls.append(tabs, sliderField);
  controlsSlot.appendChild(controls);

  /* ---- Panel ---- */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'al-panel';

  const card = document.createElement('div');
  card.className = 'al-card';
  const chead = document.createElement('div');
  chead.className = 'al-chead';
  const cnum = document.createElement('div');
  cnum.className = 'al-cnum';
  const stats = document.createElement('div');
  stats.className = 'al-stats';
  card.append(chead, cnum, stats);

  const note = document.createElement('div');
  note.className = 'al-note';

  panelWrap.append(card, note);
  panel.appendChild(panelWrap);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'al-cap';
  cap.innerHTML =
    `Bars: per-quote on-chain gas for DCAP attestation. ECDSA verifies sourced at ` +
    `<b>${(ECDSA_SOL / 1e3).toFixed(0)}k</b> (Solidity) → <b>${(ECDSA_PRE / 1e3).toFixed(0)}k</b> (EIP-7951); ` +
    `naive total <b>~${fmtGas(NAIVE_TOTAL)}</b>, zkVM-compressed <b>~${fmtGas(ZKVM)}</b> ` +
    `(RiscZero Groth16 ~${fmtGas(data.zkvmGroth16Gas)}). Each on-chain bar's split is a model on those totals. ` +
    `USD at <b>${data.gasPriceGwei} gwei</b>, ETH <b>$${data.ethPriceUsd.toLocaleString('en-US')}</b>. ` +
    `Every gas unit buys a chip vendor's signature — <b>WireTap forged one for ~$1,000</b> in 2025.`;
  caption.appendChild(cap);

  /* ---- Render ---- */
  function render() {
    sliderOut.innerHTML = '';
    const si = document.createElement('i');
    si.textContent =
      perDay >= 1000 ? `${(perDay / 1000).toFixed(perDay >= 10000 ? 0 : 1)}k` : String(Math.round(perDay));
    sliderOut.append(si, `/day · ${fmtCadence(perDay)}`);

    PATHS.forEach((p, i) => {
      const grp = rowGroups[i]!;
      const isSel = p.id === selectedId;
      grp.sel.style.display = isSel ? '' : 'none';
      const rest = restGas(p);
      const ec = ecdsaGas(p);
      const xRestEnd = xOf(rest);
      if (p.ecdsa === 'none') {
        const r = grp.segs[0]!;
        r.setAttribute('x', String(PLOT_X0));
        r.setAttribute('width', String(Math.max(2, xRestEnd - PLOT_X0)));
      } else {
        const r0 = grp.segs[0]!;
        r0.setAttribute('x', String(PLOT_X0));
        r0.setAttribute('width', String(Math.max(2, xRestEnd - PLOT_X0)));
        const r1 = grp.segs[1]!;
        const xEcEnd = xOf(rest + ec);
        r1.setAttribute('x', String(xRestEnd));
        r1.setAttribute('width', String(Math.max(0.5, xEcEnd - xRestEnd)));
      }
      grp.segs.forEach((s) => s.classList.toggle('al-row-dim', !isSel));
      grp.total.textContent = fmtGas(totalGas(p));
      grp.sel.setAttribute('width', String(xOf(totalGas(p)) - (PLOT_X0 - 4) + 4));
    });
    tabButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(PATHS[j]!.id === selectedId)));

    const p = PATHS.find((x) => x.id === selectedId)!;
    const total = totalGas(p);
    const perDayGas = total * perDay;
    const blocksDay = perDayGas / BLOCK;
    const usdDay = perDayGas * data.gasPriceGwei * 1e-9 * data.ethPriceUsd;
    const mult = total / ZKVM_TOTAL;

    chead.innerHTML = '';
    const ht = document.createElement('span');
    ht.textContent = p.label;
    const hs = document.createElement('span');
    hs.className = 'al-csub';
    hs.textContent = p.sub;
    chead.append(ht, hs);
    cnum.textContent = `${fmtGas(total)} gas / quote`;

    const statDefs: Array<[string, string, boolean]> = [
      ['per day', `${fmtGas(perDayGas)} gas`, false],
      ['= blocks / day', blocksDay >= 1 ? `${blocksDay.toFixed(blocksDay >= 10 ? 0 : 1)}` : blocksDay.toFixed(2), false],
      ['cost / day', fmtUsd(usdDay), false],
      ['vs zkVM', p.id === 'zkvm' ? 'baseline' : fmtMult(mult), p.id === 'zkvm'],
    ];
    stats.innerHTML = '';
    for (const [label, val, good] of statDefs) {
      const s = document.createElement('div');
      s.className = 'al-stat';
      const sl = document.createElement('span');
      sl.textContent = label;
      const sb = document.createElement('b');
      sb.textContent = val;
      if (good) sb.classList.add('al-good');
      s.append(sl, sb);
      stats.appendChild(s);
    }

    note.innerHTML = `<b>${p.label}.</b> ${p.note}`;
  }

  function select(id: string) {
    selectedId = id;
    render();
  }

  const onSlide = () => {
    perDay = pdOfT(Number(slider.value));
    render();
  };
  slider.addEventListener('input', onSlide);

  render();

  return () => {
    slider.removeEventListener('input', onSlide);
    layout.dispose();
    style.remove();
  };
}
