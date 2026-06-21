/**
 * Artifact: the-noise-floor — The Noise Floor
 * Manifest: content/artifacts/the-noise-floor/manifest.json
 *
 * X axis: log10(episodes), range 1–100 000.
 * Y axis: confidence that a real edge exists, 0–100 %.
 * Formula: conf(n,α,σ) = Φ(α·√n / σ)  — one-sided normal test.
 * Required episodes to 95 %: n = ⌈(1.96·σ/α)²⌉.
 *
 * Four domain curves (fixed params, labeled):
 *   Math RL  (DeepSeek-R1): α=40 %, σ=2 %   → n≈1
 *   Code RL  (SWE-bench):   α=25 %, σ=8 %   → n≈4
 *   DeFi on-chain:          α=0.1 %, σ=3.46 % → n≈4 598
 *   DeFi + process rewards: α=0.1 %, σ=3.46 %, 10× signal → n≈460
 *
 * The DeFi curves respond to three sliders (σ, α, trades/day).
 * Panel shows required N, calendar days, improvement multiplier.
 */
import data from '../../../content/artifacts/the-noise-floor/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 840, VB_H = 440;
const X0 = 62, X1 = 810, Y0 = 28, Y1 = 380;

// log10 episode axis: 10^0 to 10^5
const N_MIN = 1, N_MAX = 100_000;
const LN0 = 0, LN1 = 5;
const xOf = (n: number) => X0 + ((Math.log10(Math.max(n, 1)) - LN0) / (LN1 - LN0)) * (X1 - X0);
const yOf = (pct: number) => Y1 - (Math.max(0, Math.min(100, pct)) / 100) * (Y1 - Y0);
const nOfX = (x: number) => 10 ** (LN0 + Math.max(0, Math.min(1, (x - X0) / (X1 - X0))) * (LN1 - LN0));

// Abramowitz & Stegun 25.7.26, accurate to 7.5e-8
function normcdf(z: number): number {
  if (z < 0) return 1 - normcdf(-z);
  const t = 1 / (1 + 0.2316419 * z);
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp((-z * z) / 2) * p;
}

function conf(n: number, alphaPct: number, sigmaPct: number): number {
  if (sigmaPct <= 0) return 1;
  return normcdf((alphaPct * Math.sqrt(n)) / sigmaPct) * 100;
}

function nFor95(alphaPct: number, sigmaPct: number): number {
  if (alphaPct <= 0) return Infinity;
  return Math.ceil(((1.96 * sigmaPct) / alphaPct) ** 2);
}

const DOMAINS = data.domains;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/440',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // mutable DeFi slider state
  let sigmaPct = data.defaults.sigmaPct;
  let alphaPct = data.defaults.alphaPct;
  let tradesPerDay = data.defaults.tradesPerDay;

  const style = document.createElement('style');
  style.textContent = `
    .nf-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .nf-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .nf-grid { stroke:rgba(124,140,255,.09); }
    .nf-axis { fill:#8d95ad; font:500 11px 'JetBrains Mono', monospace; }
    .nf-refline { stroke:rgba(124,140,255,.22); stroke-width:1; stroke-dasharray:3 4; }
    .nf-95line { stroke:rgba(231,234,243,.18); stroke-width:1; stroke-dasharray:2 4; }
    .nf-curve { fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .nf-curve-defi { stroke-width:2; stroke-dasharray:none; }
    .nf-curve-defi-proc { stroke-width:2; }
    .nf-domlabel { font:600 9.5px 'JetBrains Mono', monospace; pointer-events:none; }
    .nf-n95dot { stroke:#0d1322; stroke-width:1.5; }
    .nf-timemark { font:500 9px 'JetBrains Mono', monospace; fill:#5b6378; }
    .nf-timeband { fill:rgba(240,136,62,.07); }

    .nf-controls { display:flex; align-items:flex-end; gap:10px 24px; flex-wrap:wrap;
      min-width:0; font:500 11.5px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .nf-field { display:flex; flex-direction:column; gap:5px; min-width:120px; max-width:220px; }
    .nf-field label { display:flex; justify-content:space-between;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .nf-field output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .nf-field input[type=range] { width:100%; cursor:pointer; accent-color:#f0883e; margin-top:3px; }

    .nf-panel { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .nf-rows { display:flex; flex-direction:column; gap:5px; }
    .nf-row { display:flex; align-items:baseline; justify-content:space-between; gap:6px 10px; min-width:0; }
    .nf-row span { font-size:11px; color:#8d95ad; }
    .nf-row b { font-weight:700; color:#e7eaf3; white-space:nowrap; }
    .nf-row b.nf-orange { color:#f0883e; }
    .nf-row b.nf-cyan   { color:#22d3ee; }
    .nf-row b.nf-green  { color:#5fd39b; }
    .nf-verdict { padding:9px 12px; border-radius:9px; font-size:11px; line-height:1.5;
      min-width:0; overflow-wrap:anywhere; border:1px solid rgba(240,136,62,.28);
      background:rgba(240,136,62,.09); color:#ffcba4; }
    .nf-verdict.nf-ok { border-color:rgba(34,211,238,.28); background:rgba(34,211,238,.09); color:#a5f3ff; }
    .nf-verdict b { font-weight:700; }

    .nf-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .nf-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'nf-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Confidence vs episodes to detect trading edge, four domains');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // layer groups for ordered rendering
  const gBg = document.createElementNS(NS, 'g'); svg.appendChild(gBg);
  const gCurves = document.createElementNS(NS, 'g'); svg.appendChild(gCurves);
  const gMarkers = document.createElementNS(NS, 'g'); svg.appendChild(gMarkers);
  const gLabels = document.createElementNS(NS, 'g'); svg.appendChild(gLabels);

  // Panel
  const panelEl = document.createElement('div');
  panelEl.className = 'nf-panel';
  panel.appendChild(panelEl);

  // Controls
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'nf-controls';
  controlsSlot.appendChild(ctrlWrap);

  const mkSlider = (id: string, labelText: string, min: number, max: number, step: number, init: number, fmt: (v: number) => string) => {
    const field = document.createElement('div');
    field.className = 'nf-field';
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    const name = document.createElement('span'); name.textContent = labelText;
    const out = document.createElement('output'); out.textContent = fmt(init);
    lbl.append(name, out);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = id;
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(init);
    inp.setAttribute('aria-label', labelText);
    field.append(lbl, inp);
    ctrlWrap.appendChild(field);
    return { inp, out };
  };

  const sigmaCtrl = mkSlider('nf-sigma', 'σ daily vol', 0.5, 10, 0.1, sigmaPct, v => `${v.toFixed(1)}%`);
  const alphaCtrl = mkSlider('nf-alpha', 'α edge / trade', 0.01, 2, 0.01, alphaPct, v => `${v.toFixed(2)}%`);
  const tradesCtrl = mkSlider('nf-trades', 'trades / day', 5, 200, 5, tradesPerDay, v => `${v}`);

  // Caption
  const cap = document.createElement('div');
  cap.className = 'nf-cap';
  cap.innerHTML =
    `<b>Formula:</b> conf(n,α,σ) = Φ(α·√n/σ); n<sub>95%</sub> = ⌈(1.96·σ/α)²⌉. ` +
    `ETH σ = ${data.ethVol.dailyPct}% daily (${data.ethVol.annualizedPct}% annualized, ${data.ethVol.periodDays}-day realized, ` +
    `${data.meta.volSource}). ` +
    `Process rewards (Trade-R1, arXiv:2601.03948) run 10× more episodes in simulation before one on-chain trade. ` +
    `Drag σ, α, or trades/day sliders to explore.`;
  caption.appendChild(cap);

  function render() {
    // clear dynamic layers
    while (gBg.firstChild) gBg.removeChild(gBg.firstChild);
    while (gCurves.firstChild) gCurves.removeChild(gCurves.firstChild);
    while (gMarkers.firstChild) gMarkers.removeChild(gMarkers.firstChild);
    while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);

    const mk = (tag: string, attrs: Record<string, string | number> = {}, parent = gBg) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      parent.appendChild(el);
      return el;
    };
    const mkTxt = (x: number, y: number, cls: string, text: string, anchor = 'middle', parent = gBg) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
      t.textContent = text; parent.appendChild(t); return t;
    };

    // 95% reference line
    mk('line', { x1: X0, y1: yOf(95), x2: X1, y2: yOf(95), class: 'nf-95line' });
    mkTxt(X0 - 6, yOf(95) + 3.5, 'nf-axis', '95%', 'end');

    // grid: x (log episodes), y (confidence 0–100)
    for (const logN of [0, 1, 2, 3, 4, 5]) {
      const x = xOf(10 ** logN);
      mk('line', { x1: x, y1: Y0, x2: x, y2: Y1, class: 'nf-grid' });
      const labels: Record<number, string> = { 0: '1', 1: '10', 2: '100', 3: '1k', 4: '10k', 5: '100k' };
      mkTxt(x, Y1 + 16, 'nf-axis', labels[logN] ?? '', 'middle');
    }
    mkTxt((X0 + X1) / 2, Y1 + 32, 'nf-axis', 'episodes (log scale)', 'middle');
    for (const pct of [0, 25, 50, 75, 100]) {
      const y = yOf(pct);
      mk('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'nf-grid' });
      if (pct !== 95) mkTxt(X0 - 6, y + 3.5, 'nf-axis', `${pct}%`, 'end');
    }
    mkTxt(X0 - 44, (Y0 + Y1) / 2, 'nf-axis', 'confidence', 'middle');

    // DeFi time band (region between ~230d naive and ~23d process)
    const n95naive = nFor95(alphaPct, sigmaPct);
    const n95proc = Math.ceil(n95naive / 10);
    if (isFinite(n95naive) && n95naive <= N_MAX * 2) {
      const xN = Math.min(xOf(n95naive), X1);
      const xP = Math.min(xOf(n95proc), X1);
      if (xP < xN) {
        mk('rect', { x: xP, y: Y0, width: xN - xP, height: Y1 - Y0, class: 'nf-timeband' }, gBg);
      }
    }

    // DeFi timeline ticks: 1d, 7d, 30d, 1y (based on tradesPerDay)
    const timeTicks: { days: number; label: string }[] = [
      { days: 1, label: '1d' },
      { days: 7, label: '7d' },
      { days: 30, label: '30d' },
      { days: 365, label: '1yr' },
    ];
    for (const { days, label } of timeTicks) {
      const n = days * tradesPerDay;
      if (n < N_MIN || n > N_MAX) continue;
      const x = xOf(n);
      mk('line', { x1: x, y1: Y1, x2: x, y2: Y1 + 8, class: 'nf-refline' }, gBg);
      mkTxt(x, Y1 + 26, 'nf-timemark', label, 'middle', gBg);
    }

    // ---- curves ----
    const STEPS = 300;
    const domainCurves: { id: string; color: string; aPct: number; sPct: number; label: string; example: string; labelN?: number }[] = [
      { id: 'math', color: '#5fd39b', aPct: DOMAINS[0].alphaPct, sPct: DOMAINS[0].sigmaPct, label: 'Math RL', example: DOMAINS[0].example },
      { id: 'code', color: '#7c8cff', aPct: DOMAINS[1].alphaPct, sPct: DOMAINS[1].sigmaPct, label: 'Code RL', example: DOMAINS[1].example },
      { id: 'defi', color: '#f0883e', aPct: alphaPct, sPct: sigmaPct, label: 'DeFi on-chain', example: 'perps' },
      { id: 'defi_proc', color: '#22d3ee', aPct: alphaPct, sPct: sigmaPct / Math.sqrt(10), label: 'DeFi + process', example: 'Trade-R1' },
    ];

    for (const dc of domainCurves) {
      let d = '';
      let labelX = -1, labelY = -1, labelN = 0;
      for (let i = 0; i <= STEPS; i++) {
        const n = 10 ** (LN0 + (i / STEPS) * (LN1 - LN0));
        const c = conf(n, dc.aPct, dc.sPct);
        const x = xOf(n), y = yOf(c);
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        // label placement: first crossing of 70% confidence
        if (c >= 70 && labelX < 0) { labelX = x; labelY = y; labelN = n; }
      }
      if (labelX < 0) { labelX = X1 - 10; labelY = yOf(conf(N_MAX, dc.aPct, dc.sPct)); }

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'nf-curve');
      path.setAttribute('stroke', dc.color);
      gCurves.appendChild(path);

      // label
      const ly = Math.max(Y0 + 12, Math.min(Y1 - 6, labelY - 10));
      const lx = Math.min(labelX + 6, X1 - 60);
      const t = mkTxt(lx, ly, 'nf-domlabel', dc.label, 'start', gLabels);
      t.setAttribute('fill', dc.color);
      const t2 = mkTxt(lx, ly + 11, 'nf-domlabel', dc.example, 'start', gLabels);
      t2.setAttribute('fill', dc.color); t2.setAttribute('opacity', '0.6');

      // n95 dot marker
      const n95 = nFor95(dc.aPct, dc.sPct);
      if (isFinite(n95) && n95 >= N_MIN && n95 <= N_MAX * 10) {
        const dx = Math.min(xOf(n95), X1);
        const dy = yOf(95);
        const dot = mk('circle', { cx: dx, cy: dy, r: 5, fill: dc.color, class: 'nf-n95dot' }, gMarkers);
        void dot;
      }
    }

    renderPanel();
  }

  function renderPanel() {
    panelEl.innerHTML = '';

    const n95 = nFor95(alphaPct, sigmaPct);
    const n95proc = Math.ceil(n95 / 10);
    const days95 = isFinite(n95) ? Math.ceil(n95 / tradesPerDay) : Infinity;
    const days95proc = Math.ceil(n95proc / (tradesPerDay * 10));
    const mathN = nFor95(DOMAINS[0].alphaPct, DOMAINS[0].sigmaPct);
    const codeN = nFor95(DOMAINS[1].alphaPct, DOMAINS[1].sigmaPct);

    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div'); r.className = 'nf-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      r.append(s, b);
      return r;
    };

    const rows = document.createElement('div');
    rows.className = 'nf-rows';
    rows.append(
      row('DeFi n₉₅ (raw)', isFinite(n95) ? n95.toLocaleString() : '∞', 'nf-orange'),
      row('DeFi days to 95%', isFinite(days95) ? `${days95.toLocaleString()} d` : '∞', 'nf-orange'),
      row('+ process rewards n₉₅', n95proc.toLocaleString(), 'nf-cyan'),
      row('+ process rewards days', `${days95proc} d`, 'nf-cyan'),
      row('Math RL n₉₅', mathN.toLocaleString(), 'nf-green'),
      row('Code RL n₉₅', codeN.toLocaleString(), ''),
    );
    panelEl.appendChild(rows);

    const verdict = document.createElement('div');
    const improvement = Math.round(n95 / n95proc);
    if (days95 > 100) {
      verdict.className = 'nf-verdict';
      verdict.innerHTML =
        `<b>Signal buried.</b> At σ=${sigmaPct.toFixed(1)}% and α=${alphaPct.toFixed(2)}%, ` +
        `on-chain P&L needs <b>${n95.toLocaleString()} trades</b> (~${days95} days) to reach 95% confidence. ` +
        `Process rewards densify to <b>${days95proc} days</b> (${improvement}× faster).`;
    } else {
      verdict.className = 'nf-verdict nf-ok';
      verdict.innerHTML =
        `<b>Edge detectable.</b> At this α/σ ratio, <b>${n95.toLocaleString()} trades</b> (~${days95} days) suffice. ` +
        `Process rewards still help: <b>${days95proc} days</b> vs ${days95} days.`;
    }
    panelEl.appendChild(verdict);

    // update slider outputs
    sigmaCtrl.out.textContent = `${sigmaPct.toFixed(1)}%`;
    alphaCtrl.out.textContent = `${alphaPct.toFixed(2)}%`;
    tradesCtrl.out.textContent = String(tradesPerDay);
  }

  sigmaCtrl.inp.addEventListener('input', () => { sigmaPct = Number(sigmaCtrl.inp.value); render(); });
  alphaCtrl.inp.addEventListener('input', () => { alphaPct = Number(alphaCtrl.inp.value); render(); });
  tradesCtrl.inp.addEventListener('input', () => { tradesPerDay = Number(tradesCtrl.inp.value); render(); });

  render();

  return () => {
    layout.dispose();
    sigmaCtrl.inp.removeEventListener('input', () => {});
    alphaCtrl.inp.removeEventListener('input', () => {});
    tradesCtrl.inp.removeEventListener('input', () => {});
    style.remove();
  };
}
