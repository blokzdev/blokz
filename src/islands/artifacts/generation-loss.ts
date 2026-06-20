/**
 * Artifact: generation-loss — Generation Loss
 * Manifest: content/artifacts/generation-loss/manifest.json
 *
 * Model collapse, one generation at a time. A distribution over a 1-D variable
 * is the "model". Each generation it produces a finite sample of M draws and
 * the next model is *refit from that sample* — a copy of a copy of a copy.
 *
 *   replace   : model_{n+1} = fit( M samples drawn from model_n )
 *   accumulate: model_{n+1} = fit( the original real sample  +  every
 *               synthetic sample drawn so far )
 *
 * This is the recursive-resampling mechanism behind Shumailov et al. (Nature
 * 2024). With a finite M the tail bins keep drawing zero samples and die, so
 * the support shrinks from the edges inward (early collapse = tails first) and
 * the curve concentrates toward a spike (late collapse). Under *replace* the
 * fitted standard deviation σ̂ is driven toward zero; under *accumulate* the
 * original sample stays in the pool forever and σ̂ stays bounded — the finite
 * upper bound of Gerstgrasser et al. (2024).
 *
 * The simulation invents no empirical numbers: it re-runs a documented model
 * with a seeded RNG (reset reproduces the run). data.json carries the model
 * parameters, the M presets, and the documented anchor figures.
 *
 * Layout: shared responsive primitive (stage SVG density + tails · panel σ̂
 * cards + trajectory sparkline · footer regime/M/run controls · caption).
 */
import data from '../../../content/artifacts/generation-loss/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG = 'http://www.w3.org/2000/svg';
const VB_W = 400,
  VB_H = 225;
const PAD_L = 12,
  PAD_R = 12,
  AX_Y = VB_H - 26, // baseline for the density / x-axis
  TOP = 24;

const C = {
  live: '#22d3ee', // current generation
  ref: '#5b8cff', // original (gen 0) reference
  warn: '#f0883e', // collapse / tails
  ok: '#34d399', // accumulate / bounded
  text: '#e7eaf3',
  muted: '#8d95ad',
  faint: '#5b6378',
};

const M = data.model;
const B = M.binCount;
const BW = (M.xMax - M.xMin) / B; // bin width in x-units
const binCenter = (i: number) => M.xMin + (i + 0.5) * BW;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* deterministic RNG so reset reproduces a run (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* normal(0,1) discretised over the bins, normalised to sum 1 */
function gaussianBins(sigma = 1): Float64Array {
  const p = new Float64Array(B);
  let s = 0;
  for (let i = 0; i < B; i++) {
    const x = binCenter(i);
    p[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    s += p[i];
  }
  for (let i = 0; i < B; i++) p[i] /= s;
  return p;
}

/* DISPLAY-ONLY 3-tap smoothing. The model itself is refit by *pure* resampling
 * — no smoothing is fed back, because adding variance each generation would
 * fight the very collapse we're showing. This only cleans the drawn curve so a
 * sparse histogram reads as a shape rather than a comb of spikes. */
function displaySmooth(p: Float64Array, passes: number): Float64Array {
  let cur = p;
  for (let s = 0; s < passes; s++) {
    const out = new Float64Array(B);
    for (let i = 0; i < B; i++) {
      out[i] = (2 * cur[i] + (cur[i - 1] ?? 0) + (cur[i + 1] ?? 0)) / 4;
    }
    cur = out;
  }
  return cur;
}

function normalise(p: Float64Array): Float64Array {
  let s = 0;
  for (let i = 0; i < B; i++) s += p[i];
  if (s <= 0) return p;
  const out = new Float64Array(B);
  for (let i = 0; i < B; i++) out[i] = p[i] / s;
  return out;
}

/* draw M samples (bin indices) from distribution p via its CDF */
function sample(p: Float64Array, n: number, rand: () => number): Float64Array {
  const cdf = new Float64Array(B);
  let c = 0;
  for (let i = 0; i < B; i++) {
    c += p[i];
    cdf[i] = c;
  }
  const counts = new Float64Array(B);
  for (let s = 0; s < n; s++) {
    const u = rand() * c;
    // binary search
    let lo = 0,
      hi = B - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    counts[lo] += 1;
  }
  return counts;
}

/* Effective number of distinct outcomes the model can still produce:
 * exp(entropy). This is the textbook diversity measure and the thing model
 * collapse destroys — rare events drop out, so exp(H) falls. Unlike the fitted
 * variance (which just drifts on this timescale), it collapses monotonically,
 * faster for smaller M, and parks at a bounded floor under accumulate. */
function effOutcomes(p: Float64Array): number {
  let h = 0;
  for (let i = 0; i < B; i++) {
    if (p[i] > 0) h -= p[i] * Math.log(p[i]);
  }
  return Math.exp(h);
}

/* count of outcomes (nonzero bins) still alive — the visible support */
function support(p: Float64Array): number {
  let n = 0;
  for (let i = 0; i < B; i++) if (p[i] > 0) n++;
  return n;
}

interface State {
  mode: 'replace' | 'accumulate';
  budget: number; // M samples per generation
  presetId: string | null;
  running: boolean;
  gen: number;
  p: Float64Array; // current model
  pool: Float64Array; // accumulated counts (accumulate mode)
  lastSample: Float64Array; // this generation's M samples (bin counts)
  divHist: number[]; // effective-outcomes trajectory
  rand: () => number;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    stageFr: '1.55fr',
  });
  const { stage, panel, controls: ctrl, caption } = layout;
  stage.classList.add('gl-stage');
  panel.classList.add('gl-panel');
  ctrl.classList.add('gl-inputs');

  const ref = gaussianBins(M.sigma0);
  const D0 = effOutcomes(ref); // ≈ 47 effective outcomes for the original

  const style = document.createElement('style');
  style.textContent = `
    .gl-stage { min-width:0; position:relative; }
    .gl-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono', monospace; }
    .gl-svg text { fill:${C.muted}; }
    .gl-panel { display:flex; flex-direction:column; gap:11px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:${C.muted}; }
    .gl-cards { --afl-card:104px; }
    .gl-card { border:1px solid rgba(124,140,255,.14); border-radius:11px; background:#0d1322;
      padding:9px 11px; display:flex; flex-direction:column; gap:3px; min-width:0; }
    .gl-card .gl-k { font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:${C.faint}; }
    .gl-card .gl-v { font-size:17px; color:${C.text}; font-variant-numeric:tabular-nums; line-height:1.1; }
    .gl-card .gl-v small { font-size:10px; color:${C.muted}; }
    .gl-card.gl-hi { border-color:rgba(34,211,238,.45); box-shadow:0 0 14px rgba(34,211,238,.12); }
    .gl-card.gl-hi .gl-v { color:${C.live}; }
    .gl-spark { width:100%; height:auto; display:block; }
    .gl-spark text { fill:${C.faint}; }
    .gl-verdict { font-size:11px; line-height:1.5; color:#9aa2b8; border-top:1px solid rgba(124,140,255,.12);
      padding-top:9px; min-width:0; }
    .gl-verdict b { color:${C.text}; font-variant-numeric:tabular-nums; }
    .gl-verdict.gl-bad b { color:${C.warn}; }
    .gl-verdict.gl-good b { color:${C.ok}; }
    .gl-inputs { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .gl-modes { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
    .gl-mode { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer; background:#0d1322;
      color:${C.muted}; font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.03em; padding:7px 11px;
      white-space:nowrap; }
    .gl-mode:hover, .gl-mode:focus-visible { border-color:${C.ref}; outline:none; }
    .gl-mode.gl-on-replace { background:rgba(240,136,62,.14); border-color:${C.warn}; color:${C.warn}; box-shadow:0 0 12px rgba(240,136,62,.2); }
    .gl-mode.gl-on-acc { background:rgba(52,211,153,.13); border-color:${C.ok}; color:${C.ok}; box-shadow:0 0 12px rgba(52,211,153,.18); }
    .gl-row { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:end; min-width:0; }
    .gl-presets { display:flex; flex-wrap:wrap; gap:7px; min-width:0; }
    .gl-preset { border:1px solid rgba(124,140,255,.24); border-radius:7px; cursor:pointer; background:#0d1322;
      color:${C.ref}; font:600 9.5px 'JetBrains Mono', monospace; letter-spacing:.03em; padding:6px 9px; white-space:nowrap; }
    .gl-preset:hover, .gl-preset:focus-visible { border-color:${C.ref}; outline:none; }
    .gl-preset.gl-on { background:rgba(91,140,255,.14); border-color:${C.ref}; box-shadow:0 0 10px rgba(91,140,255,.22); }
    .gl-field { min-width:0; max-width:100%; flex:1 1 200px; }
    .gl-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:${C.faint}; }
    .gl-field output { color:${C.text}; font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .gl-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0; accent-color:${C.ref}; }
    .gl-btns { display:flex; gap:8px; flex-wrap:wrap; min-width:0; }
    .gl-btn { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer; background:#0d1322;
      color:${C.text}; font:600 11px 'JetBrains Mono', monospace; letter-spacing:.04em; padding:8px 13px;
      white-space:nowrap; min-height:36px; }
    .gl-btn:hover, .gl-btn:focus-visible { border-color:${C.ref}; outline:none; }
    .gl-btn.gl-primary { color:${C.live}; border-color:rgba(34,211,238,.4); }
    .gl-cap { font-size:9.5px; color:${C.faint}; letter-spacing:.02em; line-height:1.55; }
    .gl-cap b { color:${C.muted}; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---------- state ---------- */
  const SEED = 0x9e3779b9;
  const state: State = {
    mode: 'replace',
    budget: 60,
    presetId: 'small',
    running: true,
    gen: 0,
    p: ref.slice(),
    pool: new Float64Array(B),
    lastSample: new Float64Array(B),
    divHist: [D0],
    rand: rng(SEED),
  };

  /* ---------- stage SVG ---------- */
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'gl-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'A probability distribution refit from its own finite sample each generation; under replace it loses its tails and collapses toward a spike.',
  );
  const mk = (tag: string, attrs: Record<string, string | number> = {}, parent: Element = svg) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    parent.appendChild(el);
    return el;
  };

  const PX = (x: number) => PAD_L + ((x - M.xMin) / (M.xMax - M.xMin)) * (VB_W - PAD_L - PAD_R);
  const tailL = PX(-M.tailEdge),
    tailR = PX(M.tailEdge);

  // tail shading (the original distribution's tails — the first thing to die)
  mk('rect', { x: PAD_L, y: TOP, width: tailL - PAD_L, height: AX_Y - TOP, fill: 'rgba(240,136,62,.05)' });
  mk('rect', { x: tailR, y: TOP, width: VB_W - PAD_R - tailR, height: AX_Y - TOP, fill: 'rgba(240,136,62,.05)' });
  mk('line', { x1: tailL, y1: TOP, x2: tailL, y2: AX_Y, stroke: 'rgba(240,136,62,.22)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
  mk('line', { x1: tailR, y1: TOP, x2: tailR, y2: AX_Y, stroke: 'rgba(240,136,62,.22)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
  mk('text', { x: PAD_L + 3, y: TOP + 11, 'font-size': 8, fill: 'rgba(240,136,62,.7)' }).textContent = 'tail';
  mk('text', { x: VB_W - PAD_R - 3, y: TOP + 11, 'font-size': 8, 'text-anchor': 'end', fill: 'rgba(240,136,62,.7)' }).textContent = 'tail';

  // baseline / axis
  mk('line', { x1: PAD_L, y1: AX_Y, x2: VB_W - PAD_R, y2: AX_Y, stroke: 'rgba(124,140,255,.25)', 'stroke-width': 1 });

  // reference outline (original gen-0 distribution)
  const refPath = mk('path', { fill: 'none', stroke: C.ref, 'stroke-width': 1.1, 'stroke-dasharray': '3 2.5', opacity: 0.55 });
  // live distribution (filled area + crisp top)
  const liveFill = mk('path', { fill: 'rgba(34,211,238,.16)', stroke: 'none' });
  const livePath = mk('path', { fill: 'none', stroke: C.live, 'stroke-width': 1.8, 'stroke-linejoin': 'round' });
  // sample ticks layer
  const ticks = mk('g');

  // headers
  mk('text', { x: PAD_L, y: 15, 'font-size': 9, 'font-weight': 700, fill: C.muted }).textContent = 'MODEL DISTRIBUTION';
  const genLbl = mk('text', { x: VB_W - PAD_R, y: 15, 'font-size': 9, 'text-anchor': 'end', fill: C.faint });
  // small caption inside stage
  const sampLbl = mk('text', { x: PAD_L, y: AX_Y + 18, 'font-size': 8, fill: C.faint });

  stage.appendChild(svg);

  /* ---------- panel ---------- */
  const cards = document.createElement('div');
  cards.className = 'afl-cards gl-cards';
  const mkCard = (hi = false) => {
    const c = document.createElement('div');
    c.className = `gl-card${hi ? ' gl-hi' : ''}`;
    c.innerHTML = `<span class="gl-k"></span><span class="gl-v"></span>`;
    return c;
  };
  const cGen = mkCard();
  const cDiv = mkCard(true);
  const cRet = mkCard();
  cards.append(cGen, cDiv, cRet);
  panel.appendChild(cards);

  // σ̂ trajectory sparkline
  const SP_W = 240,
    SP_H = 74;
  const spark = document.createElementNS(SVG, 'svg');
  spark.setAttribute('viewBox', `0 0 ${SP_W} ${SP_H}`);
  spark.setAttribute('class', 'gl-spark');
  spark.setAttribute('role', 'img');
  spark.setAttribute('aria-label', 'Effective number of distinct outcomes across generations.');
  const sMk = (tag: string, attrs: Record<string, string | number> = {}) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    spark.appendChild(el);
    return el;
  };
  sMk('text', { x: 0, y: 9, 'font-size': 8.5 }).textContent = 'diversity  (effective outcomes)';
  // D0 reference line (the original distribution's diversity)
  const sparkRef = sMk('line', { stroke: 'rgba(91,140,255,.5)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
  sMk('text', { x: SP_W, y: 9, 'font-size': 8, 'text-anchor': 'end', fill: 'rgba(91,140,255,.8)' }).textContent = `D₀=${Math.round(D0)}`;
  const sparkPath = sMk('polyline', { fill: 'none', stroke: C.warn, 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
  const sparkCur = sMk('circle', { r: 3, fill: C.live, stroke: '#0a0f1b', 'stroke-width': 1 });
  panel.appendChild(spark);

  const verdict = document.createElement('div');
  verdict.className = 'gl-verdict';
  panel.appendChild(verdict);

  /* ---------- controls ---------- */
  const modes = document.createElement('div');
  modes.className = 'gl-modes';
  const replaceBtn = document.createElement('button');
  replaceBtn.type = 'button';
  replaceBtn.className = 'gl-mode';
  replaceBtn.textContent = '↻ replace';
  replaceBtn.title = 'Each generation is fit ONLY on the previous generation’s output.';
  const accBtn = document.createElement('button');
  accBtn.type = 'button';
  accBtn.className = 'gl-mode';
  accBtn.textContent = '⊕ accumulate';
  accBtn.title = 'Keep the original real data plus every synthetic generation in the pool.';
  modes.append(replaceBtn, accBtn);
  ctrl.appendChild(modes);

  const presetWrap = document.createElement('div');
  presetWrap.className = 'gl-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const p of data.presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gl-preset';
    b.textContent = `⬢ ${p.label}`;
    b.title = p.note;
    presetWrap.appendChild(b);
    presetBtns.set(p.id, b);
  }
  ctrl.appendChild(presetWrap);

  const row = document.createElement('div');
  row.className = 'gl-row';
  const field = document.createElement('div');
  field.className = 'gl-field';
  const label = document.createElement('label');
  label.htmlFor = 'gl-budget';
  const lname = document.createElement('span');
  lname.textContent = 'sample / generation  M';
  const lout = document.createElement('output');
  label.append(lname, lout);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'gl-budget';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.setAttribute('aria-label', 'samples drawn per generation');
  field.append(label, slider);

  const btns = document.createElement('div');
  btns.className = 'gl-btns';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'gl-btn gl-primary';
  const stepBtn = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.className = 'gl-btn';
  stepBtn.textContent = 'step';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'gl-btn';
  resetBtn.textContent = 'reset';
  btns.append(runBtn, stepBtn, resetBtn);
  row.append(field, btns);
  ctrl.appendChild(row);

  /* ---------- caption ---------- */
  const cap = document.createElement('div');
  cap.className = 'gl-cap';
  cap.innerHTML =
    `Each generation draws <b>M</b> samples from the current model and refits the next from them — the recursive-resampling model of Shumailov et al. ` +
    `<b>Replace</b> fits on the last generation only; <b>accumulate</b> keeps the original real data plus every synthetic generation (Gerstgrasser et al.’s bounded regime). ` +
    `Seeded run — reset reproduces it. Tap a regime or preset, drag M, and use ← →.`;
  caption.appendChild(cap);

  /* ---------- M slider mapping (log scale 20..5000) ---------- */
  const M_MIN = 20,
    M_MAX = 5000;
  const sliderToM = (v: number) =>
    Math.round(M_MIN * Math.pow(M_MAX / M_MIN, v / 100) / 10) * 10;
  const mToSlider = (m: number) =>
    clamp(Math.round((Math.log(m / M_MIN) / Math.log(M_MAX / M_MIN)) * 100), 0, 100);

  /* ---------- one generation ---------- */
  function stepGen() {
    const counts = sample(state.p, state.budget, state.rand);
    state.lastSample = counts;
    let next: Float64Array;
    if (state.mode === 'accumulate') {
      for (let i = 0; i < B; i++) state.pool[i] += counts[i];
      next = normalise(state.pool);
    } else {
      next = normalise(counts);
    }
    state.p = next;
    state.gen += 1;
    state.divHist.push(effOutcomes(next));
    if (state.divHist.length > 220) state.divHist.shift();
  }

  function resetRun() {
    state.gen = 0;
    state.p = ref.slice();
    state.pool = new Float64Array(B);
    // accumulate is anchored by the original real sample of size M
    if (state.mode === 'accumulate') {
      state.rand = rng(SEED);
      const seed0 = sample(ref, state.budget, state.rand);
      for (let i = 0; i < B; i++) state.pool[i] = seed0[i];
    } else {
      state.rand = rng(SEED);
    }
    state.lastSample = new Float64Array(B);
    state.divHist = [D0];
  }

  /* ---------- render ---------- */
  const fmt = (v: number, d = 2) => v.toFixed(d);

  // build an area/line path for a distribution, scaled so the ORIGINAL peak
  // sits at a fixed height (so collapse reads as a tall narrow spike).
  const PEAK_Y = TOP + 6;
  const refPeak = Math.max(...ref);
  const yOf = (prob: number) => AX_Y - (prob / refPeak) * (AX_Y - PEAK_Y);

  function pathFor(p: Float64Array, close: boolean, smoothPasses = 0): string {
    const q = smoothPasses > 0 ? displaySmooth(p, smoothPasses) : p;
    let d = '';
    for (let i = 0; i < B; i++) {
      const x = PX(binCenter(i));
      const y = yOf(Math.min(q[i], refPeak * 1.6));
      d += (i === 0 ? 'M' : 'L') + fmt(x, 1) + ' ' + fmt(y, 1) + ' ';
    }
    if (close) {
      d += `L${fmt(PX(binCenter(B - 1)), 1)} ${AX_Y} L${fmt(PX(binCenter(0)), 1)} ${AX_Y} Z`;
    }
    return d;
  }

  function render() {
    const collapsing = state.mode === 'replace';

    // display-only smoothing on the live curve so a sparse sample reads as a
    // shape; the model's own numbers (σ̂, tail mass) use the true distribution.
    const passes = 2;
    refPath.setAttribute('d', pathFor(ref, false));
    liveFill.setAttribute('d', pathFor(state.p, true, passes));
    livePath.setAttribute('d', pathFor(state.p, false, passes));
    const liveCol = collapsing ? C.live : C.ok;
    livePath.setAttribute('stroke', liveCol);
    liveFill.setAttribute('fill', collapsing ? 'rgba(34,211,238,.15)' : 'rgba(52,211,153,.13)');

    // sample ticks (subsample for perf / legibility)
    while (ticks.firstChild) ticks.removeChild(ticks.firstChild);
    let drawn = 0;
    const maxTicks = 140;
    let total = 0;
    for (let i = 0; i < B; i++) total += state.lastSample[i];
    const keep = total > maxTicks ? maxTicks / total : 1;
    for (let i = 0; i < B && drawn < maxTicks; i++) {
      const n = state.lastSample[i];
      if (n <= 0) continue;
      const show = Math.max(1, Math.round(n * keep));
      const x = PX(binCenter(i));
      for (let k = 0; k < show && drawn < maxTicks; k++) {
        const jitter = (k - (show - 1) / 2) * 0.7;
        mk('line', {
          x1: x + jitter, y1: AX_Y + 2, x2: x + jitter, y2: AX_Y + 5,
          stroke: liveCol, 'stroke-width': 0.6, opacity: 0.5,
        }, ticks);
        drawn += 1;
      }
    }

    genLbl.textContent = `generation ${state.gen}`;
    sampLbl.textContent = `${state.budget.toLocaleString()} samples drawn this generation`;

    const div = state.divHist[state.divHist.length - 1];
    const retained = div / D0;
    const supp = support(state.p);

    (cGen.querySelector('.gl-k') as HTMLElement).textContent = 'generation';
    (cGen.querySelector('.gl-v') as HTMLElement).textContent = String(state.gen);
    (cDiv.querySelector('.gl-k') as HTMLElement).textContent = 'diversity';
    (cDiv.querySelector('.gl-v') as HTMLElement).innerHTML = `${fmt(div, 1)}<small> outcomes / ${Math.round(D0)}</small>`;
    (cRet.querySelector('.gl-k') as HTMLElement).textContent = 'support';
    (cRet.querySelector('.gl-v') as HTMLElement).innerHTML = `${supp}<small> of ${B} bins alive</small>`;
    cDiv.className = `gl-card gl-hi`;
    (cDiv.querySelector('.gl-v') as HTMLElement).style.color = collapsing ? C.live : C.ok;

    // sparkline
    const h = state.divHist;
    const n = h.length;
    const sMax = D0 * 1.05;
    const px = (i: number) => 4 + (n <= 1 ? 0 : (i / (n - 1)) * (SP_W - 8));
    const py = (s: number) => clamp(SP_H - 5 - (s / sMax) * (SP_H - 18), 13, SP_H - 3);
    sparkRef.setAttribute('x1', '4');
    sparkRef.setAttribute('x2', String(SP_W - 4));
    sparkRef.setAttribute('y1', String(py(D0)));
    sparkRef.setAttribute('y2', String(py(D0)));
    sparkPath.setAttribute('stroke', liveCol);
    sparkPath.setAttribute('points', h.map((s, i) => `${fmt(px(i), 1)},${fmt(py(s), 1)}`).join(' '));
    sparkCur.setAttribute('cx', String(px(n - 1)));
    sparkCur.setAttribute('cy', String(py(div)));
    sparkCur.setAttribute('fill', liveCol);

    // verdict
    let cls = 'gl-verdict',
      msg = '';
    if (state.mode === 'accumulate') {
      cls += ' gl-good';
      msg =
        `Accumulate: the original real sample never leaves the pool, so diversity dips once then <b>holds</b> near ` +
        `<b>${fmt(div, 1)}</b> outcomes (${(retained * 100).toFixed(0)}%). That floor is Gerstgrasser’s <b>finite</b> upper bound — run it forever, it won’t collapse.`;
    } else if (state.gen === 0) {
      msg = `Generation 0 is the real distribution: <b>${fmt(div, 1)}</b> effective outcomes. Press run — each generation refits on the last one’s ${state.budget.toLocaleString()} samples.`;
    } else if (div < 4) {
      cls += ' gl-bad';
      msg =
        `Late collapse: diversity is down to <b>${fmt(div, 1)}</b> outcomes (${(retained * 100).toFixed(0)}% of the original), ` +
        `support just <b>${supp}</b> of ${B} bins. The model has converged toward a point — and no amount of training on <em>this</em> output brings the variety back.`;
    } else {
      cls += ' gl-bad';
      msg =
        `Replace: with ${state.budget.toLocaleString()} samples a rare-event bin keeps drawing zero and dies for good — the tails go first. ` +
        `Diversity has fallen to <b>${fmt(div, 1)}</b> (${(retained * 100).toFixed(0)}%). Bigger M slows the slide; only accumulate stops it.`;
    }
    verdict.className = cls;
    verdict.innerHTML = msg;

    lout.textContent = state.budget.toLocaleString();
    replaceBtn.classList.toggle('gl-on-replace', state.mode === 'replace');
    accBtn.classList.toggle('gl-on-acc', state.mode === 'accumulate');
    runBtn.textContent = state.running ? '⏸ pause' : '▶ run';
    runBtn.setAttribute('aria-pressed', String(state.running));
  }

  /* ---------- loop ---------- */
  let timer: ReturnType<typeof setInterval> | null = null;
  function startLoop() {
    if (timer) return;
    timer = setInterval(() => {
      // gently stop driving once fully collapsed (or after a long bounded run)
      const lastDiv = state.divHist[state.divHist.length - 1];
      if (state.mode === 'replace' && state.gen > 4 && lastDiv < 2.5) {
        setRunning(false);
        return;
      }
      if (state.gen > 160) {
        setRunning(false);
        return;
      }
      stepGen();
      render();
    }, 850);
  }
  function stopLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function setRunning(r: boolean) {
    state.running = r;
    if (r) startLoop();
    else stopLoop();
    render();
  }

  /* ---------- interaction ---------- */
  function clearPreset() {
    state.presetId = null;
    for (const b of presetBtns.values()) b.classList.remove('gl-on');
  }
  function setMode(mode: 'replace' | 'accumulate') {
    if (state.mode === mode) return;
    state.mode = mode;
    resetRun();
    setRunning(true);
  }
  function applyPreset(id: string) {
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    state.budget = p.M;
    state.presetId = id;
    slider.value = String(mToSlider(p.M));
    for (const [pid, b] of presetBtns) b.classList.toggle('gl-on', pid === id);
    resetRun();
    setRunning(true);
  }

  const onReplace = () => setMode('replace');
  const onAcc = () => setMode('accumulate');
  replaceBtn.addEventListener('click', onReplace);
  accBtn.addEventListener('click', onAcc);

  const presetHandlers = new Map<string, () => void>();
  for (const [id, b] of presetBtns) {
    const hh = () => applyPreset(id);
    presetHandlers.set(id, hh);
    b.addEventListener('click', hh);
  }

  const onSlider = () => {
    state.budget = sliderToM(Number(slider.value));
    clearPreset();
    resetRun();
    render();
  };
  slider.addEventListener('input', onSlider);

  const onRun = () => setRunning(!state.running);
  const onStep = () => {
    setRunning(false);
    if (state.gen <= 200) {
      stepGen();
      render();
    }
  };
  const onReset = () => {
    resetRun();
    render();
  };
  runBtn.addEventListener('click', onRun);
  stepBtn.addEventListener('click', onStep);
  resetBtn.addEventListener('click', onReset);

  // seed initial UI
  slider.value = String(mToSlider(state.budget));
  presetBtns.get('small')?.classList.add('gl-on');
  resetRun();
  render();
  setRunning(true);

  return () => {
    stopLoop();
    layout.dispose();
    replaceBtn.removeEventListener('click', onReplace);
    accBtn.removeEventListener('click', onAcc);
    for (const [id, b] of presetBtns) {
      const hh = presetHandlers.get(id);
      if (hh) b.removeEventListener('click', hh);
    }
    slider.removeEventListener('input', onSlider);
    runBtn.removeEventListener('click', onRun);
    stepBtn.removeEventListener('click', onStep);
    resetBtn.removeEventListener('click', onReset);
    style.remove();
  };
}
