/**
 * Artifact: the-consensus-clip — The Consensus Clip
 * Manifest: content/artifacts/the-consensus-clip/manifest.json
 *
 * Bittensor's Yuma Consensus scores a miner not by the stake-weighted *mean* of
 * validator weights but by a stake-weighted *median*, then clips every weight
 * above it. For one target miner, validators are laid out as columns along a
 * cumulative-stake axis (0 → 100%), sorted by how generous their weight is, each
 * column's height = the weight it set. The consensus weight W̄ is read off at the
 * κ = 0.5 stake mark — the weight at which at least half the stake rates the
 * miner ≥ W̄. Everything taller than that line is clipped: it earns the miner no
 * extra rank and the over-generous validator no extra bond.
 *
 *   Prerank   P_j = Σ_i S_i · W_ij                          (naive stake-weighted mean)
 *   Consensus W̄_j = argmax_w ( Σ_i S_i·[W_ij ≥ w] ≥ κ )     (stake-weighted median)
 *   Rank      R_j = Σ_i S_i · min(W_ij, W̄_j)                (consensus-clipped score)
 *   Trust     T_j = R_j / P_j
 *
 * A colluding bloc tries to pump a low-quality miner to weight 1.0. While the
 * bloc holds < κ = 50% of stake its inflated weight is clipped back to the
 * honest median and the pump is absorbed; at ≥ 50% the consensus line snaps up
 * to the colluders, nothing is clipped, and the attack lands — the exact
 * security boundary Yuma buys you. Drag the bloc's stake share and the honest
 * assessment; tap a column (or ← →) to inspect a validator.
 *
 * SVG, no RAF — renders on input. Layout via the shared responsive primitive.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* --- Yuma constant (opentensor/subtensor docs/consensus.md) --- */
const KAPPA = 0.5; // consensus threshold: half the stake must agree

/* --- illustrative cast: 5 honest validators of equal stake + 1 colluding bloc --- */
const N_HONEST = 5;
// fixed offsets around the honest assessment so the median isn't the mean
const HONEST_OFFSETS = [0.05, 0.025, 0, -0.025, -0.05];
const ATTACK_WEIGHT = 1.0; // the bloc pumps the miner to the ceiling

/* --- chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 460;
const X0 = 70;
const X1 = 792;
const Y_TOP = 40; // weight = 1
const Y_BASE = 392; // weight = 0

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const xOf = (cum: number) => X0 + clamp01(cum) * (X1 - X0);
const yOf = (w: number) => Y_BASE - clamp01(w) * (Y_BASE - Y_TOP);

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const w2 = (x: number) => x.toFixed(2);

interface Val {
  id: string;
  label: string;
  weight: number;
  stake: number;
  colluder: boolean;
}

/** Build the validator set for the target miner at colluder share c, honest weight w_h. */
function buildValidators(c: number, wH: number): Val[] {
  const honestStake = (1 - c) / N_HONEST;
  const vals: Val[] = HONEST_OFFSETS.map((off, i) => ({
    id: `h${i}`,
    label: `Honest V${i + 1}`,
    weight: clamp01(wH + off),
    stake: honestStake,
    colluder: false,
  }));
  vals.push({ id: 'bloc', label: 'Colluding bloc', weight: ATTACK_WEIGHT, stake: c, colluder: true });
  return vals;
}

/** Stake-weighted median at κ: largest w such that ≥ κ stake set weight ≥ w. */
function consensusWeight(vals: Val[]): number {
  const sorted = [...vals].sort((a, b) => b.weight - a.weight);
  let cum = 0;
  for (const v of sorted) {
    cum += v.stake;
    if (cum >= KAPPA - 1e-9) return v.weight;
  }
  return sorted[sorted.length - 1].weight;
}

export default function mount(container: HTMLElement): () => void {
  let c = 0.32; // colluding stake share
  let wH = 0.2; // honest assessment of this (low-quality) miner
  let sel = -1; // selected validator index (in sorted order), -1 = none

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .cc-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .cc-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:manipulation; }
    .cc-grid { stroke:rgba(124,140,255,.1); }
    .cc-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .cc-axlab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .cc-col { cursor:pointer; outline:none; }
    .cc-counted-h { fill:rgba(91,140,255,.55); }
    .cc-counted-c { fill:rgba(249,115,98,.6); }
    .cc-col.cc-on .cc-counted-h { fill:rgba(91,140,255,.88); }
    .cc-col.cc-on .cc-counted-c { fill:rgba(249,115,98,.92); }
    .cc-clip { fill:rgba(249,115,98,.13); }
    .cc-clip-top { stroke:#f97362; stroke-width:1.4; stroke-dasharray:4 3; fill:none; }
    .cc-focus { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .cc-col:focus-visible .cc-focus { opacity:.9; }
    .cc-cons { stroke:#22d3ee; stroke-width:2; }
    .cc-conslab { fill:#7fe9f5; font:700 11px 'JetBrains Mono', monospace; }
    .cc-kappa { stroke:#f5a524; stroke-width:1.3; stroke-dasharray:5 4; }
    .cc-kappalab { fill:#f5a524; font:600 10.5px 'JetBrains Mono', monospace; }
    .cc-naive { stroke:rgba(231,234,243,.4); stroke-width:1.2; stroke-dasharray:2 3; }
    .cc-naivelab { fill:#8d95ad; font:600 10px 'JetBrains Mono', monospace; }
    .cc-collab { fill:#c9d2ee; font:600 10px 'JetBrains Mono', monospace; pointer-events:none; }
    .cc-collab-c { fill:#ffb3a8; }

    .cc-controls { display:flex; align-items:flex-end; gap:14px 20px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .cc-slider { display:flex; flex-direction:column; gap:5px; min-width:170px; flex:1 1 190px; }
    .cc-shead { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .cc-sval { color:#e7eaf3; font-weight:700; }
    .cc-slider input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer; }
    .cc-slider.cc-amber input[type=range] { accent-color:#f5a524; }

    .cc-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .cc-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .cc-name { color:#e7eaf3; font-weight:700; font-size:13.5px; }
    .cc-sub { color:#5b6378; font-size:10.5px; }
    .cc-rows { display:flex; flex-direction:column; gap:5px; }
    .cc-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .cc-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .cc-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .cc-row b.cc-cyan { color:#22d3ee; }
    .cc-row b.cc-red { color:#f97362; }
    .cc-row b.cc-amber { color:#f5a524; }
    .cc-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; }
    .cc-verdict.cc-hold { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .cc-verdict.cc-break { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .cc-verdict b { font-weight:700; }
    .cc-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .cc-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- chart scaffold ---- */
  const wrap = document.createElement('div');
  wrap.className = 'cc-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute(
    'aria-label',
    'Validators scoring one miner, laid out by cumulative stake and sorted by weight. The consensus weight is read at the 50 percent stake mark; weights above it are clipped.',
  );
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
  const mkRectIn = (parent: Element, x: number, y: number, w: number, h: number, cls: string) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(Math.max(0, w)));
    r.setAttribute('height', String(Math.max(0, h)));
    r.setAttribute('class', cls);
    parent.appendChild(r);
    return r;
  };
  const mkTextIn = (parent: Element, x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    parent.appendChild(t);
    return t;
  };

  /* ---- controls ---- */
  const controls = document.createElement('div');
  controls.className = 'cc-controls';

  const mkSlider = (
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    amber: boolean,
    aria: string,
    onInput: (v: number) => void,
  ) => {
    const g = document.createElement('div');
    g.className = `cc-slider${amber ? ' cc-amber' : ''}`;
    const head = document.createElement('div');
    head.className = 'afl-split';
    const lab = document.createElement('span');
    lab.className = 'cc-shead';
    lab.textContent = labelText;
    const val = document.createElement('span');
    val.className = 'cc-sval';
    head.append(lab, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', aria);
    input.addEventListener('input', () => onInput(Number(input.value)));
    g.append(head, input);
    controls.appendChild(g);
    return { val, input };
  };

  const cCtl = mkSlider('colluding bloc stake', 0, 70, 1, Math.round(c * 100), false,
    'colluding bloc stake share, percent of total validator stake',
    (v) => { c = v / 100; sel = -1; render(); });
  const wCtl = mkSlider('honest assessment', 5, 45, 1, Math.round(wH * 100), true,
    'honest validators assessment of the miner, as a weight from 0 to 1',
    (v) => { wH = v / 100; sel = -1; render(); });
  controlsSlot.appendChild(controls);

  /* ---- panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'cc-readout';
  panel.appendChild(readout);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'cc-cap';
  cap.innerHTML =
    'Yuma Consensus scores a miner by the <b>stake-weighted median</b>, not the mean: ' +
    'prerank <b>P = Σ Sᵢ·Wᵢⱼ</b>, consensus <b>W̄</b> = the weight at the <b>κ=0.5</b> stake mark, ' +
    'rank <b>R = Σ Sᵢ·min(Wᵢⱼ, W̄)</b>, trust <b>T = R/P</b>. Weights above W̄ are clipped — no miner rank, no validator bond. ' +
    'Cast is illustrative (5 equal-stake honest validators + 1 colluding bloc); κ per opentensor/subtensor. ' +
    'Drag the sliders; tap a column or use ← → to inspect a validator.';
  caption.appendChild(cap);

  const colNodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    colNodes.length = 0;

    const vals = buildValidators(c, wH);
    const sorted = [...vals].sort((a, b) => b.weight - a.weight);
    const wBar = consensusWeight(vals);
    const prerank = vals.reduce((s, v) => s + v.stake * v.weight, 0);
    const rank = vals.reduce((s, v) => s + v.stake * Math.min(v.weight, wBar), 0);
    const trust = prerank > 0 ? rank / prerank : 1;
    const blocClipped = ATTACK_WEIGHT > wBar + 1e-9;

    /* y gridlines + weight axis */
    mkText(X0, Y_TOP - 16, 'cc-axis', 'validator weight on the miner →');
    for (let k = 0; k <= 5; k++) {
      const w = k / 5;
      const y = yOf(w);
      mkLine(X0, y, X1, y, 'cc-grid');
      mkText(X0 - 8, y + 3.5, 'cc-axlab', w.toFixed(1), 'end');
    }

    /* columns: sorted by weight desc, width ∝ stake along cumulative-stake x */
    let cum = 0;
    sorted.forEach((v, i) => {
      const x = xOf(cum);
      const w = v.stake * (X1 - X0);
      cum += v.stake;
      const counted = Math.min(v.weight, wBar);
      const yCounted = yOf(counted);
      const isSel = i === sel;

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', `cc-col${isSel ? ' cc-on' : ''}`);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute(
        'aria-label',
        `${v.label}: weight ${w2(v.weight)}, stake ${pct(v.stake)}${
          v.weight > wBar + 1e-9 ? `, clipped to consensus ${w2(wBar)}` : ', counted in full'
        }`,
      );

      // counted portion (from consensus-clipped height down to baseline)
      mkRectIn(g, x + 0.5, yCounted, w - 1, Y_BASE - yCounted, v.colluder ? 'cc-counted-c' : 'cc-counted-h');
      // clipped cap (above consensus) — translucent, dashed top
      if (v.weight > wBar + 1e-9) {
        const yTop = yOf(v.weight);
        mkRectIn(g, x + 0.5, yTop, w - 1, yCounted - yTop, 'cc-clip');
        const top = document.createElementNS(NS, 'line');
        top.setAttribute('x1', String(x + 0.5));
        top.setAttribute('y1', String(yTop));
        top.setAttribute('x2', String(x + w - 0.5));
        top.setAttribute('y2', String(yTop));
        top.setAttribute('class', 'cc-clip-top');
        g.appendChild(top);
      }
      // focus ring around the full (unclipped) column
      const fr = document.createElementNS(NS, 'rect');
      fr.setAttribute('x', String(x + 0.5));
      fr.setAttribute('y', String(yOf(v.weight)));
      fr.setAttribute('width', String(Math.max(0, w - 1)));
      fr.setAttribute('height', String(Y_BASE - yOf(v.weight)));
      fr.setAttribute('rx', '2');
      fr.setAttribute('class', 'cc-focus');
      g.appendChild(fr);

      // label colluder column (honest columns cluster, labelled by a bracket below)
      if (v.colluder && w > 26) {
        mkTextIn(g, x + w / 2, Y_BASE + 16, 'cc-collab cc-collab-c', 'bloc', 'middle');
      }

      const select = () => { sel = i; render(); };
      g.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      colNodes[i] = g;
    });

    // "honest" group label under the honest span
    const honestSpan = 1 - c;
    if (honestSpan > 0.06) {
      mkText(xOf(c + honestSpan / 2), Y_BASE + 16, 'cc-collab', `${N_HONEST} honest validators`, 'middle');
    }

    /* baseline + x axis (cumulative stake) */
    mkLine(X0, Y_BASE, X1, Y_BASE, 'cc-grid').setAttribute('stroke', 'rgba(231,234,243,.3)');
    for (let k = 0; k <= 10; k++) {
      const x = xOf(k / 10);
      mkText(x, Y_BASE + 31, 'cc-axlab', `${k * 10}%`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 46, 'cc-axis', 'cumulative validator stake  (sorted most → least generous)  →', 'middle');

    /* κ line at 50% cumulative stake */
    const xK = xOf(KAPPA);
    mkLine(xK, Y_TOP - 6, xK, Y_BASE + 4, 'cc-kappa');
    mkText(xK + 5, Y_TOP + 6, 'cc-kappalab', 'κ = 50% stake', 'start');

    /* consensus line at W̄ */
    const yC = yOf(wBar);
    mkLine(X0, yC, X1, yC, 'cc-cons');
    mkText(X0 + 4, yC - 6, 'cc-conslab', `consensus W̄ = ${w2(wBar)}`, 'start');

    /* naive mean (prerank) reference line, when distinct from consensus */
    const yN = yOf(prerank);
    if (Math.abs(yN - yC) > 12) {
      mkLine(X0, yN, X1, yN, 'cc-naive');
      mkText(X1 - 4, yN - 5, 'cc-naivelab', `naive mean = ${w2(prerank)}`, 'end');
    }

    // sync slider readouts
    cCtl.val.textContent = pct(c);
    wCtl.val.textContent = w2(wH);

    renderPanel({ wBar, prerank, rank, trust, blocClipped, sorted });
  }

  function renderPanel(s: {
    wBar: number; prerank: number; rank: number; trust: number; blocClipped: boolean; sorted: Val[];
  }) {
    readout.innerHTML = '';
    const held = c < KAPPA;

    const hd = document.createElement('div');
    hd.className = 'cc-hd';
    const name = document.createElement('span');
    name.className = 'cc-name';
    const sub = document.createElement('span');
    sub.className = 'cc-sub';
    if (sel >= 0) {
      const v = s.sorted[sel];
      name.textContent = v.label;
      sub.textContent = v.colluder ? 'pumping to 1.00' : 'honest';
    } else {
      name.textContent = 'Target miner';
      sub.textContent = `low quality · honestly ≈ ${w2(wH)}`;
    }
    hd.append(name, sub);

    const rows = document.createElement('div');
    rows.className = 'cc-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div');
      r.className = 'cc-row';
      const sp = document.createElement('span');
      sp.textContent = label;
      const b = document.createElement('b');
      if (cls) b.className = cls;
      b.textContent = val;
      r.append(sp, b);
      rows.appendChild(r);
    };

    if (sel >= 0) {
      const v = s.sorted[sel];
      const clipped = v.weight > s.wBar + 1e-9;
      row('weight set', w2(v.weight), v.colluder ? 'cc-red' : '');
      row('stake share', pct(v.stake));
      row('counted = min(W, W̄)', w2(Math.min(v.weight, s.wBar)), clipped ? 'cc-red' : 'cc-cyan');
      row('clipped away', clipped ? `−${w2(v.weight - s.wBar)}` : '0.00', clipped ? 'cc-red' : '');
    } else {
      row('colluding stake', pct(c), c >= KAPPA ? 'cc-red' : 'cc-amber');
      row('consensus W̄', w2(s.wBar), 'cc-cyan');
      row('prerank P (naive mean)', w2(s.prerank));
      row('rank R (clipped)', w2(s.rank), 'cc-cyan');
      row('trust T = R / P', pct(s.trust, 0), s.trust > 0.985 ? 'cc-red' : '');
    }

    const verdict = document.createElement('div');
    verdict.className = `cc-verdict ${held ? 'cc-hold' : 'cc-break'}`;
    if (held) {
      verdict.innerHTML =
        `Bloc holds <b>${pct(c)} &lt; 50%</b>. Half the stake rates the miner at ≈${w2(s.wBar)}, so the bloc's <b>1.00</b> is ` +
        `clipped back to consensus — the pump is absorbed (trust <b>${pct(s.trust, 0)}</b>) and the colluders earn no bond on the clipped weight.`;
    } else {
      verdict.innerHTML =
        `Bloc holds <b>${pct(c)} ≥ 50%</b>. The consensus line snaps up to the colluders: <b>nothing is clipped</b> ` +
        `(trust <b>${pct(s.trust, 0)}</b>), the miner is pumped to <b>${w2(s.rank)}</b>. Yuma's guarantee is exactly a <b>&lt;50% honest-stake</b> assumption.`;
    }

    readout.append(hd, rows, verdict);
  }

  /* pointer: tap empty chart clears selection */
  const onBgPointer = (e: PointerEvent) => {
    const tgt = e.target as Node | null;
    if (tgt === svg || tgt?.parentNode === gPlot) {
      if (sel !== -1) { sel = -1; render(); }
    }
  };
  svg.addEventListener('pointerdown', onBgPointer);

  /* arrow keys cycle validators */
  const onKey = (e: KeyboardEvent) => {
    const n = N_HONEST + 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      sel = sel < 0 ? 0 : (sel + 1) % n; render(); colNodes[sel]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      sel = sel < 0 ? n - 1 : (sel - 1 + n) % n; render(); colNodes[sel]?.focus(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('pointerdown', onBgPointer);
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
