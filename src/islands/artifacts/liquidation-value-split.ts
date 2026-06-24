/**
 * Artifact: liquidation-value-split — The Liquidation Value Split
 * Manifest: content/artifacts/liquidation-value-split/manifest.json
 *
 * Every DeFi liquidation mints a fixed prize: the liquidation bonus the protocol
 * grants on the seized collateral. For a debt repayment D at bonus b, the prize
 * up for grabs is ~D·b. The engineering question of 2025–26 is who captures it.
 *
 * Three regimes split the SAME prize completely differently:
 *
 *   1. Open gas war (public PGA)   keepers bid priority fees against each other;
 *      a fraction c (competition) of the prize is paid to the block builder /
 *      validator. keeper = (1−c)·prize, builder = c·prize, protocol = 0.
 *   2. Private orderflow           the keeper routes privately and skips the
 *      bidding war, keeping most of it; the builder takes a small backrun share
 *      β. keeper = (1−β)·prize, builder = β·prize, protocol = 0. (Privacy helps
 *      the searcher, not the protocol.)
 *   3. OEV recapture auction       the right to backrun the oracle update is
 *      auctioned and the proceeds returned. A recapture rate r of the prize goes
 *      back, split s / (1−s) between protocol and oracle network (Chainlink SVR:
 *      65/35); the winning searcher keeps its (1−r) margin; the builder ≈ 0.
 *
 * The three horizontal stacked bars share one length, so the eye sees the value
 * sweep from "leaked to the builder" (top) to "recaptured by the protocol"
 * (bottom). Sliders set liquidation size, bonus, and keeper competition; the
 * panel anchors the model to Chainlink SVR's real cumulative figures.
 *
 * SVG chart, no RAF (renders on input). Tap a bar (or ← →) for its detail.
 * Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/liquidation-value-split/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const D = data.defaults;
const R = data.recapture;
const SVR = data.svr;

const NS = 'http://www.w3.org/2000/svg';

/* --- palette (design tokens) --- */
const C_PROTOCOL = '#22d3ee'; // recaptured by protocol + LPs
const C_ORACLE = '#5b8cff'; // oracle network share
const C_KEEPER = '#f5a524'; // searcher / keeper profit
const C_BUILDER = '#f97362'; // leaked to builder / validator

type Part = 'protocol' | 'oracle' | 'keeper' | 'builder';
interface Seg { part: Part; label: string; color: string; value: number }
interface Regime { id: string; name: string; tagline: string }

const REGIMES: Regime[] = [
  { id: 'gaswar', name: 'Open gas war', tagline: 'public mempool · priority-fee auction' },
  { id: 'private', name: 'Private orderflow', tagline: 'sealed route · no recapture' },
  { id: 'oev', name: 'OEV recapture auction', tagline: 'Chainlink SVR · UMA Oval · API3' },
];

/* segment order, left→right: recaptured (cyan, blue) · keeper (amber) · leaked (red) */
function split(regimeId: string, prize: number, c: number): Seg[] {
  let protocol = 0, oracle = 0, keeper = 0, builder = 0;
  if (regimeId === 'gaswar') {
    builder = c * prize;
    keeper = (1 - c) * prize;
  } else if (regimeId === 'private') {
    builder = R.privateBuilderShare * prize;
    keeper = (1 - R.privateBuilderShare) * prize;
  } else {
    protocol = R.rate * R.protocolSplit * prize;
    oracle = R.rate * R.oracleSplit * prize;
    keeper = (1 - R.rate) * prize;
  }
  return [
    { part: 'protocol', label: 'Protocol + LPs', color: C_PROTOCOL, value: protocol },
    { part: 'oracle', label: 'Oracle network', color: C_ORACLE, value: oracle },
    { part: 'keeper', label: 'Searcher / keeper', color: C_KEEPER, value: keeper },
    { part: 'builder', label: 'Builder / validator', color: C_BUILDER, value: builder },
  ];
}

/* --- formatters --- */
const usd = (x: number): string => {
  const a = Math.abs(x);
  if (a >= 1e9) return `$${(x / 1e9).toFixed(a >= 1e10 ? 0 : 2)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(a >= 1e7 ? 0 : 2)}M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `$${x.toFixed(0)}`;
};
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/* --- chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 326;
const BX0 = 24;
const BX1 = 720; // bars end; right gutter holds the total
const ROW_H = 96;
const ROW_TOP = 16;
const BAR_H = 46;

export default function mount(container: HTMLElement): () => void {
  let size = D.sizeUSD;
  let bonus = D.bonusPct;
  let comp = D.competition;
  let sel = 2; // default: the OEV auction (the hero)

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '820/326',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .lvs-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .lvs-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .lvs-rowname { fill:#e7eaf3; font:700 13px 'JetBrains Mono', monospace; }
    .lvs-rowtag { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .lvs-total { fill:#8d95ad; font:600 11px 'JetBrains Mono', monospace; }
    .lvs-totalv { fill:#e7eaf3; font:800 13px 'JetBrains Mono', monospace; }
    .lvs-seglab { font:700 10.5px 'JetBrains Mono', monospace; pointer-events:none; }
    .lvs-track { fill:#070b15; stroke:rgba(124,140,255,.12); }
    .lvs-node { outline:none; cursor:pointer; }
    .lvs-seg { stroke:#0d1322; stroke-width:1; }
    .lvs-frame { fill:none; stroke:transparent; stroke-width:2; }
    .lvs-node[aria-pressed="true"] .lvs-frame { stroke:#e7eaf3; }
    .lvs-node:focus-visible .lvs-frame { stroke:#5b8cff; }
    .lvs-hint { fill:#5b6378; font:600 9.5px 'JetBrains Mono', monospace; }

    .lvs-controls { display:flex; align-items:flex-end; gap:12px 18px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .lvs-slider { display:flex; flex-direction:column; gap:4px; min-width:150px; flex:1 1 170px; }
    .lvs-slider .lvs-sval { color:#e7eaf3; font-weight:700; }
    .lvs-slider input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer; }
    .lvs-sub { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }

    .lvs-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .lvs-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .lvs-name { color:#e7eaf3; font-weight:700; font-size:14px; min-width:0; }
    .lvs-src { color:#5b6378; font-size:10.5px; }
    .lvs-rows { display:flex; flex-direction:column; gap:5px; }
    .lvs-row { display:flex; align-items:center; justify-content:space-between; gap:8px 12px; min-width:0; }
    .lvs-row .lvs-k { display:inline-flex; align-items:center; gap:7px; font-size:11px; color:#8d95ad; min-width:0; }
    .lvs-dot { width:9px; height:9px; border-radius:2px; flex:none; }
    .lvs-row b { font-size:12.5px; font-weight:700; color:#e7eaf3; }
    .lvs-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.5;
      min-width:0; overflow-wrap:anywhere; background:rgba(34,211,238,.1); color:#9fe9f5;
      border:1px solid rgba(34,211,238,.22); }
    .lvs-verdict.leak { background:rgba(249,115,98,.1); color:#ffb3a8; border-color:rgba(249,115,98,.24); }
    .lvs-verdict b { font-weight:700; }
    .lvs-anchor { font-size:10.5px; line-height:1.55; color:#7e879d; min-width:0; overflow-wrap:anywhere;
      border-top:1px solid rgba(124,140,255,.12); padding-top:8px; }
    .lvs-anchor b { color:#bdf3fb; font-weight:700; }

    .lvs-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .lvs-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- chart scaffold ---- */
  const wrap = document.createElement('div');
  wrap.className = 'lvs-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'How a liquidation bonus is split across the gas-war, private-orderflow and OEV-auction regimes');
  svg.setAttribute('tabindex', '0');
  wrap.appendChild(svg);
  stage.appendChild(wrap);
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

  /* ---- controls ---- */
  const controls = document.createElement('div');
  controls.className = 'lvs-controls';

  const mkSlider = (
    labelText: string, min: number, max: number, step: number, val: number,
    aria: string, onInput: (v: number) => void,
  ) => {
    const group = document.createElement('div');
    group.className = 'lvs-slider';
    const head = document.createElement('div');
    head.className = 'afl-split';
    const lab = document.createElement('span');
    lab.className = 'lvs-sub';
    lab.textContent = labelText;
    const valEl = document.createElement('span');
    valEl.className = 'lvs-sval';
    head.append(lab, valEl);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(val);
    input.setAttribute('aria-label', aria);
    input.addEventListener('input', () => { onInput(Number(input.value)); render(); });
    group.append(head, input);
    controls.appendChild(group);
    return valEl;
  };

  const sizeVal = mkSlider('liquidation size', 10, 1000, 5, size / 1000,
    'liquidation size repaid, in thousands of dollars', (v) => { size = v * 1000; });
  const bonusVal = mkSlider('liquidation bonus', 1, 15, 0.5, bonus * 100,
    'liquidation bonus, percent of seized collateral', (v) => { bonus = v / 100; });
  const compVal = mkSlider('keeper competition', 0, 100, 1, comp * 100,
    'keeper competition in the gas war, percent of prize bid to the builder', (v) => { comp = v / 100; });

  controlsSlot.appendChild(controls);

  /* ---- panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'lvs-readout';
  panel.appendChild(readout);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'lvs-cap';
  cap.innerHTML =
    'Prize = liquidation bonus on seized collateral ≈ <b>debt × bonus</b>. Gas war pays a fraction (competition) to the block builder; ' +
    'private orderflow keeps it with the searcher; the OEV auction returns <b>' + pct(R.rate) + '</b> of the prize to the protocol, ' +
    'split <b>' + pct(R.protocolSplit) + '/' + pct(R.oracleSplit) + '</b> protocol/oracle (Chainlink SVR). ' +
    'Anchor: Aave historical-liquidations report + Chainlink SVR, through early Feb 2026.';
  caption.appendChild(cap);

  /* ---- render ---- */
  const barNodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    barNodes.length = 0;
    const prize = size * bonus;
    const fullW = BX1 - BX0;

    REGIMES.forEach((rg, i) => {
      const top = ROW_TOP + i * ROW_H;
      const segs = split(rg.id, prize, comp);

      // row header
      mkText(BX0, top + 12, 'lvs-rowname', rg.name);
      mkText(BX0, top + 26, 'lvs-rowtag', rg.tagline);

      const barY = top + 34;

      // focusable group for the whole bar
      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'lvs-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', String(i === sel));
      const recapShare = (segs[0].value + segs[1].value) / (prize || 1);
      const leakShare = segs[3].value / (prize || 1);
      g.setAttribute('aria-label',
        `${rg.name}: protocol recaptures ${usd(segs[0].value + segs[1].value)} (${pct(recapShare)}), ` +
        `searcher keeps ${usd(segs[2].value)}, builder takes ${usd(segs[3].value)} (${pct(leakShare)} leaked).`);

      // track
      const track = document.createElementNS(NS, 'rect');
      track.setAttribute('x', String(BX0));
      track.setAttribute('y', String(barY));
      track.setAttribute('width', String(fullW));
      track.setAttribute('height', String(BAR_H));
      track.setAttribute('rx', '6');
      track.setAttribute('class', 'lvs-track');
      g.appendChild(track);

      // segments
      let cx = BX0;
      segs.forEach((s) => {
        if (s.value <= 0) return;
        const w = (s.value / (prize || 1)) * fullW;
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(cx));
        rect.setAttribute('y', String(barY));
        rect.setAttribute('width', String(Math.max(0, w)));
        rect.setAttribute('height', String(BAR_H));
        rect.setAttribute('class', 'lvs-seg');
        rect.setAttribute('fill', s.color);
        rect.setAttribute('rx', '2');
        g.appendChild(rect);
        // inline % label when the segment is wide enough
        if (w > 54) {
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', String(cx + w / 2));
          t.setAttribute('y', String(barY + BAR_H / 2 + 3.5));
          t.setAttribute('class', 'lvs-seglab');
          t.setAttribute('text-anchor', 'middle');
          t.setAttribute('fill', '#0a0e18');
          t.textContent = pct(s.value / (prize || 1));
          g.appendChild(t);
        }
        cx += w;
      });

      // selection / focus frame
      const frame = document.createElementNS(NS, 'rect');
      frame.setAttribute('x', String(BX0 - 3));
      frame.setAttribute('y', String(barY - 3));
      frame.setAttribute('width', String(fullW + 6));
      frame.setAttribute('height', String(BAR_H + 6));
      frame.setAttribute('rx', '8');
      frame.setAttribute('class', 'lvs-frame');
      g.appendChild(frame);

      // total at right gutter
      mkText(BX1 + 14, barY + 18, 'lvs-total', 'prize');
      mkText(BX1 + 14, barY + 35, 'lvs-totalv', usd(prize));

      const select = () => { sel = i; render(); };
      g.addEventListener('click', select);
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      barNodes[i] = g;
    });

    mkText(BX0, VB_H - 6, 'lvs-hint', 'tap a regime for its breakdown · ← → to cycle');

    // sync slider value labels
    sizeVal.textContent = usd(size);
    bonusVal.textContent = pct(bonus, 1);
    compVal.textContent = pct(comp);

    renderPanel(prize);
  }

  function renderPanel(prize: number) {
    const rg = REGIMES[sel];
    const segs = split(rg.id, prize, comp);
    const recaptured = segs[0].value + segs[1].value;
    const leaked = segs[3].value;
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'lvs-hd';
    const name = document.createElement('span');
    name.className = 'lvs-name';
    name.textContent = rg.name;
    const src = document.createElement('span');
    src.className = 'lvs-src';
    src.textContent = `prize ${usd(prize)} · ${pct(bonus, 1)} bonus`;
    hd.append(name, src);

    const rows = document.createElement('div');
    rows.className = 'lvs-rows';
    segs.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'lvs-row';
      const k = document.createElement('span');
      k.className = 'lvs-k';
      const dot = document.createElement('span');
      dot.className = 'lvs-dot';
      dot.style.background = s.color;
      const kt = document.createElement('span');
      kt.textContent = s.label;
      k.append(dot, kt);
      const b = document.createElement('b');
      b.textContent = `${usd(s.value)} · ${pct(s.value / (prize || 1))}`;
      row.append(k, b);
      rows.appendChild(row);
    });

    const verdict = document.createElement('div');
    if (rg.id === 'oev') {
      verdict.className = 'lvs-verdict';
      verdict.innerHTML =
        `The auction returns <b>${usd(recaptured)}</b> (${pct(recaptured / (prize || 1))}) to the protocol and oracle ` +
        `instead of the block builder. Nothing leaks to the gas war.`;
    } else {
      verdict.className = 'lvs-verdict leak';
      verdict.innerHTML =
        `<b>${usd(leaked)}</b> (${pct(leaked / (prize || 1))}) leaks to the builder/validator; the protocol recaptures <b>$0</b>. ` +
        (rg.id === 'private'
          ? `A private route just moves the prize from the gas war into the searcher's pocket.`
          : `Whoever bids the most priority fee wins; the surplus is burned on the auction.`);
    }

    const anchor = document.createElement('div');
    anchor.className = 'lvs-anchor';
    anchor.innerHTML =
      `Real anchor — Chainlink SVR routed <b>${usd(SVR.liquidationsUSD)}</b> of Aave liquidations across ` +
      `~${SVR.events.toLocaleString()} events and recaptured <b>${usd(SVR.recapturedUSD)}</b> ` +
      `(~${pct(SVR.avgRecaptureOfOev)} of the available OEV), split ${pct(SVR.protocolSharePct)} to Aave.`;

    readout.append(hd, rows, verdict, anchor);
  }

  // arrow-key cycling across regimes
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      sel = (sel + 1) % REGIMES.length; render(); barNodes[sel]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      sel = (sel - 1 + REGIMES.length) % REGIMES.length; render(); barNodes[sel]?.focus(); e.preventDefault();
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
