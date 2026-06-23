/**
 * Artifact: regret-weight-lens — The Regret Lens
 * Manifest: content/artifacts/regret-weight-lens/manifest.json
 *
 * Allora's context-aware inference synthesis, made explorable. The network turns
 * many models' forecasts into one signal not by averaging or voting, but by
 * weighting each model by its *regret* — how much it beats the naive network
 * baseline — passed through a softplus-gradient potential function:
 *
 *   potential   phi_{p,c}(x)  = ln[1 + e^{p(x - c)}]              (Eq. 10)
 *   weight map  phi'_{p,c}(x) = p / (e^{-p(x - c)} + 1)           (Eq. 11)
 *
 * with fiducial p = 3 (regression) / 5 (classification) at c = 0.75
 * (Kruijssen et al., arXiv:2501.16519). Regrets are normalized by their
 * cross-worker standard deviation, so the weight is scale-free.
 *
 * The hero is that weight curve. Five illustrative models (an ETH-volatility
 * topic) ride it as dots: drag the regime slider from calm to a volatility spike
 * and the forecasters' loss estimates shift, so each model's normalized regret —
 * and therefore its weight — slides along the curve. The low-vol specialist's
 * weight collapses the instant the spike is forecast (before any realized loss),
 * while the vol-aware model climbs. The panel scores the synthesized network MAE
 * against equal-weight averaging and the best single model. Tap a model for its
 * L -> R -> R-hat -> w chain. All constants from ./data.json; no runtime fetches.
 */
import data from '../../../content/artifacts/regret-weight-lens/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const C = data.constants.c; // 0.75
const EPS = data.constants.epsilon;
const P_REG = data.constants.pRegression; // 3
const P_CLS = data.constants.pClassification; // 5
const WORKERS = data.scenario.workers as Array<{
  id: string; label: string; short: string; calm: number; spike: number; color: string;
}>;

const NS = 'http://www.w3.org/2000/svg';

/* --- weight map (Allora Eq. 11) --- */
const phiPrime = (x: number, p: number) => p / (Math.exp(-p * (x - C)) + 1);

interface Row { w: typeof WORKERS[number]; L: number; R: number; Rhat: number; weight: number; share: number; }
interface Synth { rows: Row[]; allora: number; equal: number; best: number; }

/* Synthesize the network from forecasted losses at regime t in [0,1].
 * baseline log-loss = mean of worker log-losses (stand-in for the naive network
 * inference); regret R_i = baseline - log L_i (a worker that beats the baseline
 * has positive regret); normalize by std; map to a weight; weighted-average. */
function synth(t: number, p: number): Synth {
  const Ls = WORKERS.map((w) => w.calm * (1 - t) + w.spike * t);
  const logs = Ls.map((l) => Math.log(l));
  const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
  const R = logs.map((lg) => meanLog - lg);
  const variance = R.reduce((a, r) => a + r * r, 0) / R.length;
  const sd = Math.sqrt(variance);
  const Rhat = R.map((r) => r / (sd + EPS));
  const weights = Rhat.map((x) => phiPrime(x, p));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const rows: Row[] = WORKERS.map((w, i) => ({
    w, L: Ls[i], R: R[i], Rhat: Rhat[i], weight: weights[i], share: weights[i] / wsum,
  }));
  const allora = rows.reduce((a, r) => a + r.weight * r.L, 0) / wsum;
  const equal = Ls.reduce((a, b) => a + b, 0) / Ls.length;
  const best = Math.min(...Ls);
  return { rows, allora, equal, best };
}

/* --- chart geometry (viewBox units) --- */
const VB_W = 760;
const VB_H = 470;
const X0 = 64;
const X1 = 732;
const Y_TOP = 42;
const Y_BASE = 392;
const X_MIN = -3;
const X_MAX = 3.2;
const xOf = (x: number) => X0 + ((x - X_MIN) / (X_MAX - X_MIN)) * (X1 - X0);

const fmt = (n: number, d = 2) => n.toFixed(d);

export default function mount(container: HTMLElement): () => void {
  let t = 0; // regime: 0 calm -> 1 spike
  let p = P_REG;
  let selected: string | null = null;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/10',
    stageFr: '1.7fr',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rwl-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .rwl-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
    .rwl-grid { stroke:rgba(124,140,255,.09); }
    .rwl-axis { fill:#8d95ad; font:500 12px 'JetBrains Mono', monospace; }
    .rwl-axislab { fill:#5b6378; font:500 10.5px 'JetBrains Mono', monospace; }
    .rwl-curve { fill:none; stroke:#7c5fd0; stroke-width:2.4; }
    .rwl-curvelab { fill:#a78bfa; font:600 11px 'JetBrains Mono', monospace; }
    .rwl-ref { stroke:#5b6378; stroke-width:1.2; stroke-dasharray:3 3; }
    .rwl-reflab { fill:#8d95ad; font:600 9.5px 'JetBrains Mono', monospace; }
    .rwl-guide { stroke:#e7eaf3; stroke-width:1; stroke-dasharray:2 3; opacity:.5; }
    .rwl-dot { stroke:#05070d; stroke-width:1.5; cursor:pointer; }
    .rwl-dotlab { font:600 10px 'JetBrains Mono', monospace; pointer-events:none; }
    .rwl-regime { font:600 11px 'JetBrains Mono', monospace; }
    .rwl-hint { fill:#5b6378; font:500 9.5px 'JetBrains Mono', monospace; }

    .rwl-panel { display:flex; flex-direction:column; gap:12px; min-width:0; }
    .rwl-score { display:flex; flex-direction:column; gap:7px; min-width:0; }
    .rwl-score h4, .rwl-models h4 { margin:0 0 1px; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .rwl-stat { display:grid; grid-template-columns: minmax(0,1fr) auto; align-items:center;
      gap:6px 10px; min-width:0; }
    .rwl-stat .lab { font:600 11px 'JetBrains Mono', monospace; color:#8d95ad; min-width:0;
      overflow-wrap:anywhere; }
    .rwl-stat .val { font:700 13px 'JetBrains Mono', monospace; color:#e7eaf3;
      font-variant-numeric:tabular-nums; }
    .rwl-stat.hi .lab { color:#c4b5fd; }
    .rwl-stat.hi .val { color:#a78bfa; }
    .rwl-bar { grid-column:1 / -1; height:5px; border-radius:3px; background:rgba(124,140,255,.1);
      overflow:hidden; }
    .rwl-bar > i { display:block; height:100%; border-radius:3px; }

    .rwl-models { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .rwl-model { display:grid; grid-template-columns:10px minmax(0,1fr) auto; align-items:center;
      gap:8px; width:100%; text-align:left; cursor:pointer; min-width:0;
      background:transparent; border:1px solid transparent; border-radius:7px; padding:5px 7px;
      transition:background .15s, border-color .15s; }
    .rwl-model:hover { background:rgba(124,140,255,.05); }
    .rwl-model[aria-pressed="true"] { background:rgba(124,140,255,.08);
      border-color:rgba(124,140,255,.28); }
    .rwl-model:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .rwl-sw { width:10px; height:10px; border-radius:50%; }
    .rwl-model .nm { font:600 11px 'JetBrains Mono', monospace; color:#cdd3e3; min-width:0;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rwl-model .sh { font:700 11px 'JetBrains Mono', monospace; color:#e7eaf3;
      font-variant-numeric:tabular-nums; }
    .rwl-math { font:500 10.5px/1.6 'JetBrains Mono', monospace; color:#8d95ad;
      border-left:2px solid rgba(124,140,255,.25); padding:2px 0 2px 9px; min-width:0;
      overflow-wrap:anywhere; }
    .rwl-math b { color:#e7eaf3; font-weight:700; }
    .rwl-math i { font-style:normal; }

    .rwl-controls { display:flex; flex-direction:column; gap:11px; min-width:0; }
    .rwl-slide { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .rwl-slide .top { display:flex; justify-content:space-between; gap:8px;
      font:600 9.5px 'JetBrains Mono', monospace; letter-spacing:.06em; text-transform:uppercase;
      color:#5b6378; }
    .rwl-slide input[type=range] { width:100%; accent-color:#7c5fd0; cursor:pointer; margin:0; }
    .rwl-pgroup { display:flex; gap:6px; flex-wrap:wrap; align-items:center; min-width:0; }
    .rwl-pgroup .cap { font:600 9.5px 'JetBrains Mono', monospace; letter-spacing:.06em;
      text-transform:uppercase; color:#5b6378; margin-right:2px; }
    .rwl-tog { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 10.5px 'JetBrains Mono', monospace;
      padding:6px 10px; cursor:pointer; transition:color .2s, background .2s; }
    .rwl-tog[aria-pressed="true"] { background:rgba(124,95,208,.18); color:#e7eaf3;
      border-color:rgba(124,95,208,.45); }
    .rwl-tog:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .rwl-cap { font:500 9.5px/1.55 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.02em; }
    .rwl-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- stage svg ---- */
  const wrap = document.createElement('div');
  wrap.className = 'rwl-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);
  stage.appendChild(wrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', String(x)); el.setAttribute('y', String(y));
    el.setAttribute('class', cls); el.setAttribute('text-anchor', anchor);
    el.textContent = text; gPlot.appendChild(el); return el;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', String(x1)); el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2)); el.setAttribute('y2', String(y2));
    el.setAttribute('class', cls); gPlot.appendChild(el); return el;
  };

  /* ---- panel ---- */
  const panelEl = document.createElement('div');
  panelEl.className = 'rwl-panel';
  const scoreEl = document.createElement('div');
  scoreEl.className = 'rwl-score';
  const modelsEl = document.createElement('div');
  modelsEl.className = 'rwl-models';
  panelEl.append(scoreEl, modelsEl);
  panel.appendChild(panelEl);

  /* ---- controls ---- */
  const ctl = document.createElement('div');
  ctl.className = 'rwl-controls';

  const slideBox = document.createElement('div');
  slideBox.className = 'rwl-slide';
  const slideTop = document.createElement('div');
  slideTop.className = 'top';
  const slL = document.createElement('span'); slL.textContent = 'calm';
  const slR = document.createElement('span'); slR.textContent = 'volatility spike';
  slideTop.append(slL, slR);
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.step = '1'; slider.value = '0';
  slider.setAttribute('aria-label', 'market regime, calm to volatility spike');
  slideBox.append(slideTop, slider);

  const pGroup = document.createElement('div');
  pGroup.className = 'rwl-pgroup';
  const pCap = document.createElement('span'); pCap.className = 'cap'; pCap.textContent = 'steepness p';
  const btnReg = document.createElement('button');
  btnReg.type = 'button'; btnReg.className = 'rwl-tog'; btnReg.textContent = 'regression · 3';
  const btnCls = document.createElement('button');
  btnCls.type = 'button'; btnCls.className = 'rwl-tog'; btnCls.textContent = 'classification · 5';
  pGroup.append(pCap, btnReg, btnCls);

  ctl.append(slideBox, pGroup);
  controls.appendChild(ctl);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'rwl-cap';
  cap.innerHTML =
    'Weight map <b>φ′<sub>p,c</sub>(x)=p/(e<sup>−p(x−c)</sup>+1)</b> and defaults (p=3 regression, c=0.75) from Allora’s online-learning paper (arXiv:2501.16519, Eq. 10–11). The 5-model ensemble is an illustrative ETH-volatility example — forecasters set each model’s loss per regime. Drag the regime slider; tap a model for its R→R̂→w chain.';
  caption.appendChild(cap);

  /* ---- render ---- */
  function yMax(): number { return p + 0.6; }
  const yOf = (w: number) => Y_BASE - (Math.max(0, Math.min(yMax(), w)) / yMax()) * (Y_BASE - Y_TOP);

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const s = synth(t, p);

    // axis titles
    mkText(X0 - 8, 26, 'rwl-axis', 'weight  w');
    mkText((X0 + X1) / 2, Y_BASE + 40, 'rwl-axis', 'normalized regret   R̂ = R ∕ σ', 'middle');

    // y grid + ticks (0 .. p)
    const yticks: number[] = [];
    for (let v = 0; v <= p + 1e-9; v += 1) yticks.push(v);
    for (const v of yticks) {
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'rwl-grid');
      mkText(X0 - 8, y + 3.5, 'rwl-axislab', String(v), 'end');
    }
    // x grid + ticks
    for (let v = -3; v <= 3; v += 1) {
      const x = xOf(v);
      mkLine(x, Y_TOP, x, Y_BASE, 'rwl-grid');
      mkText(x, Y_BASE + 17, 'rwl-axislab', v > 0 ? `+${v}` : String(v), 'middle');
    }

    // asymptote w -> p
    const yp = yOf(p);
    mkLine(X0, yp, X1, yp, 'rwl-ref');
    mkText(X1 - 4, yp + 13, 'rwl-reflab', `max weight → p = ${p}`, 'end');

    // inflection at x = c (half weight)
    const xc = xOf(C);
    mkLine(xc, Y_TOP, xc, Y_BASE, 'rwl-ref');
    mkText(xc + 5, Y_TOP + 12, 'rwl-reflab', 'c = 0.75 · ½-weight');

    // the weight curve
    let d = '';
    for (let i = 0; i <= 240; i++) {
      const x = X_MIN + (i / 240) * (X_MAX - X_MIN);
      d += `${i === 0 ? 'M' : 'L'}${xOf(x).toFixed(1)},${yOf(phiPrime(x, p)).toFixed(1)}`;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('class', 'rwl-curve');
    gPlot.appendChild(path);
    mkText(xOf(2.0), yOf(phiPrime(2.0, p)) - 10, 'rwl-curvelab', 'φ′(R̂)');

    // regime label (top-center, clear of the y-title and scrub hint)
    const regimeName = t < 0.15 ? 'calm market' : t > 0.85 ? 'volatility spike' : 'regime shift…';
    const rlab = mkText((X0 + X1) / 2, Y_TOP - 16, 'rwl-regime', `context: ${regimeName}`, 'middle');
    rlab.setAttribute('fill', t > 0.5 ? '#f5a524' : '#22d3ee');

    // selected worker's vertical guide
    if (selected) {
      const r = s.rows.find((row) => row.w.id === selected);
      if (r) {
        const x = xOf(Math.max(X_MIN, Math.min(X_MAX, r.Rhat)));
        mkLine(x, yOf(r.weight), x, Y_BASE, 'rwl-guide');
      }
    }

    // worker dots (draw smaller ones first; selected on top)
    const ordered = [...s.rows].sort((a, b) => (a.w.id === selected ? 1 : 0) - (b.w.id === selected ? 1 : 0));
    for (const r of ordered) {
      const x = xOf(Math.max(X_MIN, Math.min(X_MAX, r.Rhat)));
      const y = yOf(r.weight);
      const sel = r.w.id === selected;
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y));
      dot.setAttribute('r', sel ? '8.5' : '6');
      dot.setAttribute('fill', r.w.color);
      dot.setAttribute('class', 'rwl-dot');
      dot.setAttribute('opacity', sel || !selected ? '1' : '0.55');
      dot.setAttribute('role', 'button');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `${r.w.label}: weight ${fmt(r.weight)}, share ${Math.round(r.share * 100)} percent`);
      dot.addEventListener('pointerdown', (e) => { e.stopPropagation(); selectWorker(r.w.id); });
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWorker(r.w.id); }
      });
      gPlot.appendChild(dot);
      const lab = mkText(x, y - (sel ? 14 : 11), 'rwl-dotlab', r.w.short, 'middle');
      lab.setAttribute('fill', r.w.color);
      lab.setAttribute('opacity', sel || !selected ? '1' : '0.5');
    }

    // scrub hint
    mkText(X1, Y_TOP - 16, 'rwl-hint', 'drag anywhere to scrub the regime', 'end');

    // hit layer for scrubbing (below dots in z by re-appending dots? simplest: full-rect first)
    // We append it first conceptually but pointer order: add as a transparent rect at the back.
    const hit = document.createElementNS(NS, 'rect');
    hit.setAttribute('x', String(X0)); hit.setAttribute('y', String(Y_TOP));
    hit.setAttribute('width', String(X1 - X0)); hit.setAttribute('height', String(Y_BASE - Y_TOP));
    hit.setAttribute('fill', 'transparent');
    hit.style.cursor = 'ew-resize';
    gPlot.insertBefore(hit, gPlot.firstChild);
    hit.addEventListener('pointerdown', onScrubDown);

    renderPanel(s);
  }

  function bar(value: number, max: number, color: string): string {
    const pct = Math.max(2, Math.min(100, (value / max) * 100));
    return `<span class="rwl-bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></span>`;
  }

  function renderPanel(s: Synth) {
    const worst = Math.max(s.equal, s.allora, s.best) * 1.05;
    scoreEl.innerHTML = `<h4>network error · MAE (lower is better)</h4>`;
    const stat = (lab: string, val: number, color: string, hi = false) => {
      const d = document.createElement('div');
      d.className = 'rwl-stat' + (hi ? ' hi' : '');
      d.innerHTML = `<span class="lab">${lab}</span><span class="val">${fmt(val, 3)}</span>${bar(val, worst, color)}`;
      scoreEl.appendChild(d);
    };
    stat('Allora · regret-weighted', s.allora, '#a78bfa', true);
    stat('equal-weight average', s.equal, '#5b8cff');
    stat('best single model', s.best, '#22d3ee');

    modelsEl.innerHTML = `<h4>models · weight share</h4>`;
    const sel = s.rows.find((r) => r.w.id === selected);
    for (const r of s.rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rwl-model';
      btn.setAttribute('aria-pressed', String(r.w.id === selected));
      btn.innerHTML =
        `<span class="rwl-sw" style="background:${r.w.color}"></span>` +
        `<span class="nm">${r.w.label}</span>` +
        `<span class="sh">${Math.round(r.share * 100)}%</span>`;
      btn.addEventListener('click', () => selectWorker(r.w.id));
      modelsEl.appendChild(btn);
    }
    if (sel) {
      const m = document.createElement('div');
      m.className = 'rwl-math';
      m.innerHTML =
        `<i>${sel.w.label}</i> &nbsp; loss <b>L=${fmt(sel.L)}</b> → regret <b>R=${sel.R >= 0 ? '+' : ''}${fmt(sel.R)}</b> ` +
        `→ <b>R̂=${sel.Rhat >= 0 ? '+' : ''}${fmt(sel.Rhat)}</b> → weight <b>w=${fmt(sel.weight)}</b> ` +
        `(share <b>${Math.round(sel.share * 100)}%</b>)`;
      modelsEl.appendChild(m);
    }
  }

  function selectWorker(id: string) {
    selected = selected === id ? null : id;
    render();
  }

  /* ---- regime scrubbing on the stage ---- */
  let scrubbing = false;
  const tFromClientX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    return Math.max(0, Math.min(1, (vx - X0) / (X1 - X0)));
  };
  function onScrubDown(e: PointerEvent) {
    scrubbing = true;
    svg.setPointerCapture(e.pointerId);
    t = tFromClientX(e.clientX);
    syncSlider();
    render();
  }
  const onScrubMove = (e: PointerEvent) => {
    if (!scrubbing) return;
    t = tFromClientX(e.clientX);
    syncSlider();
    render();
  };
  const onScrubUp = (e: PointerEvent) => {
    scrubbing = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener('pointermove', onScrubMove);
  svg.addEventListener('pointerup', onScrubUp);
  svg.addEventListener('pointercancel', onScrubUp);

  function syncSlider() {
    const want = String(Math.round(t * 1000));
    if (slider.value !== want) slider.value = want;
  }
  const onSlide = () => { t = Number(slider.value) / 1000; render(); };
  slider.addEventListener('input', onSlide);

  function setP(np: number) {
    p = np;
    btnReg.setAttribute('aria-pressed', String(p === P_REG));
    btnCls.setAttribute('aria-pressed', String(p === P_CLS));
    render();
  }
  btnReg.addEventListener('click', () => setP(P_REG));
  btnCls.addEventListener('click', () => setP(P_CLS));

  setP(P_REG);

  return () => {
    layout.dispose();
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('pointermove', onScrubMove);
    svg.removeEventListener('pointerup', onScrubUp);
    svg.removeEventListener('pointercancel', onScrubUp);
    style.remove();
  };
}
