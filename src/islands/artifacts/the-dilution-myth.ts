/**
 * Artifact: the-dilution-myth — The Dilution Myth
 * Manifest: content/artifacts/the-dilution-myth/manifest.json
 *
 * The central result of "Poisoning Attacks on LLMs Require a Near-constant
 * Number of Poison Samples" (AISI + Anthropic + Alan Turing Institute,
 * arXiv:2510.07192), made explorable. A backdoor needs a *near-constant* 250
 * documents (~420k tokens) regardless of model size — it does NOT scale with the
 * training set. The chart shows that one fact under two framings across model
 * scale (log x, 600M → 1T params, clean tokens via Chinchilla ~20 tok/param):
 *
 *   • "documents needed"  — a flat line at 250 (with the four measured points),
 *     versus the *dilution myth*: a dashed line of what you'd need IF poison had
 *     to hold a fixed 0.01% share (Carlini's web-scale-poisoning figure). The
 *     gap between flat-250 and the rising myth line is the whole story.
 *   • "share of training set" — the same 250 docs as a fraction of tokens,
 *     collapsing from 0.0035% (600M) through the paper's 0.00016% (13B) toward
 *     ~2e-8 at frontier scale, sliding clean under the 0.01% reference band.
 *
 * Everything is derived live from ./data.json (no fabricated points, no runtime
 * fetches). Drag the chart or the slider to move the model-scale marker; toggle
 * the framing. Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/the-dilution-myth/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const DOCS = data.poisonDocs; // 250
const PTOK = data.poisonTokens; // 420,000
const TOK_PER_DOC = data.tokensPerDoc; // 1,680
const TOK_PER_PARAM = data.tokensPerParam; // 20 (Chinchilla)
const CARLINI = data.carliniFraction; // 1e-4 (0.01%)
const P_MIN = data.scaleMin; // 6e8
const P_MAX = data.scaleMax; // 1e12
const MODELS = data.models as Array<{ label: string; params: number }>;

/* --- Model derived from verifiable constants ---
 * clean tokens(p)   = TOK_PER_PARAM · p          (Chinchilla-optimal)
 * fraction(p)       = PTOK / cleanTokens(p) = 21000 / p   (reproduces 0.00016% at 13B)
 * dilution-myth docs(p) = CARLINI · cleanTokens(p) / TOK_PER_DOC  (the discredited "fixed %") */
const cleanTokens = (p: number) => TOK_PER_PARAM * p;
const fractionOf = (p: number) => PTOK / cleanTokens(p);
const mythDocs = (p: number) => (CARLINI * cleanTokens(p)) / TOK_PER_DOC;

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 470;
const X0 = 78;
const X1 = 792;
const Y_TOP = 50;
const Y_BASE = 388;

const LOG_PMIN = Math.log10(P_MIN);
const LOG_PMAX = Math.log10(P_MAX);
const xOf = (p: number) => X0 + ((Math.log10(p) - LOG_PMIN) / (LOG_PMAX - LOG_PMIN)) * (X1 - X0);
const pOfX = (x: number) => 10 ** (LOG_PMIN + ((x - X0) / (X1 - X0)) * (LOG_PMAX - LOG_PMIN));

/* y domains per framing */
const Y_FRAC = { min: 1e-8, max: 1e-3, ticks: [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8] };
const Y_COUNT = { min: 100, max: 2e6, ticks: [1e2, 1e3, 1e4, 1e5, 1e6] };
function yOf(v: number, dom: { min: number; max: number }) {
  const lv = Math.log10(Math.max(dom.min, Math.min(dom.max, v)));
  return Y_BASE - ((lv - Math.log10(dom.min)) / (Math.log10(dom.max) - Math.log10(dom.min))) * (Y_BASE - Y_TOP);
}

/* --- Formatters --- */
function fmtParams(p: number): string {
  if (p >= 1e12) return `${(p / 1e12).toFixed(p >= 1e13 ? 0 : 2).replace(/\.?0+$/, '')}T`;
  if (p >= 1e9) return `${(p / 1e9).toFixed(p >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  return `${Math.round(p / 1e6)}M`;
}
function fmtTokens(t: number): string {
  if (t >= 1e12) return `${(t / 1e12).toFixed(1).replace(/\.0$/, '')}T`;
  if (t >= 1e9) return `${(t / 1e9).toFixed(t >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (t >= 1e6) return `${(t / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(0)}k`;
  return String(Math.round(t));
}
function fmtCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  return Math.round(n).toLocaleString('en-US');
}
function fmtPct(v: number): string {
  const pct = v * 100;
  if (pct >= 0.001) return `${pct.toPrecision(2).replace(/\.?0+$/, '')}%`;
  // exponential, but spelled out: 1.6e-4% → 0.00016%
  const exp = Math.floor(Math.log10(pct));
  const dec = Math.min(12, -exp + 1);
  return `${pct.toFixed(dec).replace(/0+$/, '')}%`;
}
function fmtTickPct(v: number): string {
  const pct = v * 100;
  if (pct >= 0.001) return `${pct}%`;
  const exp = Math.round(Math.log10(pct));
  return `10${sup(exp)}%`;
}
function fmtTickCount(n: number): string {
  if (n >= 1e6) return `${n / 1e6}M`;
  if (n >= 1e3) return `${n / 1e3}k`;
  return String(n);
}
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

type Mode = 'count' | 'fraction';

export default function mount(container: HTMLElement): () => void {
  let mode: Mode = 'count';
  let params = 13e9; // anchor at the paper's largest measured model

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/10',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .dm-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      max-width:100%; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .dm-scale { flex:1 1 230px; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .dm-scale label { display:flex; justify-content:space-between; gap:8px;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .dm-scale output { color:#e7eaf3; font-size:11px; text-transform:none; }
    .dm-scale output i { color:#22d3ee; font-style:normal; }
    .dm-scale input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:2px 0 0; }
    .dm-modes { display:flex; gap:6px; flex-wrap:wrap; }
    .dm-toggle { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 10.5px 'JetBrains Mono', monospace;
      letter-spacing:.04em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s; }
    .dm-toggle[aria-pressed="true"] { background:rgba(139,92,246,.15); color:#e7eaf3;
      border-color:rgba(139,92,246,.4); }
    .dm-toggle:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .dm-chartwrap { position:absolute; inset:0; min-height:170px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .dm-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:none; }
    .dm-grid { stroke:rgba(124,140,255,.1); }
    .dm-axis { fill:#8d95ad; font:500 12px 'JetBrains Mono', monospace; }
    .dm-axislab { fill:#5b6378; font:500 10.5px 'JetBrains Mono', monospace; }
    .dm-myth { fill:none; stroke:#f5a524; stroke-width:2; stroke-dasharray:5 4; }
    .dm-mythlab { fill:#f5a524; font:600 10.5px 'JetBrains Mono', monospace; }
    .dm-const { fill:none; stroke:#22d3ee; stroke-width:2.6; }
    .dm-constlab { fill:#22d3ee; font:600 11px 'JetBrains Mono', monospace; }
    .dm-ref { stroke:#7c5fd0; stroke-width:1.3; stroke-dasharray:3 3; }
    .dm-reflab { fill:#a78bfa; font:600 10px 'JetBrains Mono', monospace; }
    .dm-pt { fill:#22d3ee; stroke:#05070d; stroke-width:1.4; }
    .dm-mythpt { fill:#f5a524; stroke:#05070d; stroke-width:1.4; }
    .dm-marker { stroke:#e7eaf3; stroke-width:1.2; stroke-dasharray:2 3; opacity:.8; }
    .dm-hit { fill:transparent; cursor:ew-resize; }
    .dm-readout { display:flex; flex-wrap:wrap; gap:4px 18px; min-height:34px;
      max-width:100%; min-width:0;
      font:500 11.5px/1.5 'JetBrains Mono', monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .dm-readout div { max-width:100%; min-width:0; overflow-wrap:anywhere; }
    .dm-readout b { color:#e7eaf3; font-weight:600; }
    .dm-readout i { color:#22d3ee; font-style:normal; }
    .dm-readout s { color:#f5a524; text-decoration:none; }
    .dm-note { font:500 9.5px/1.5 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.02em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'dm-controls';

  const scale = document.createElement('div');
  scale.className = 'dm-scale';
  const scaleLabel = document.createElement('label');
  scaleLabel.htmlFor = 'dm-scale';
  const scaleName = document.createElement('span');
  scaleName.textContent = 'model scale';
  const scaleOut = document.createElement('output');
  scaleLabel.append(scaleName, scaleOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'dm-scale';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.setAttribute('aria-label', 'model scale, 600M to 1T parameters');
  scale.append(scaleLabel, slider);

  const modes = document.createElement('div');
  modes.className = 'dm-modes';
  const btnCount = document.createElement('button');
  btnCount.type = 'button';
  btnCount.className = 'dm-toggle';
  btnCount.textContent = 'documents needed';
  const btnFrac = document.createElement('button');
  btnFrac.type = 'button';
  btnFrac.className = 'dm-toggle';
  btnFrac.textContent = 'share of training set';
  modes.append(btnCount, btnFrac);

  controls.append(scale, modes);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'dm-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  // static layer (axes) is cheap to rebuild; we rebuild everything in render()
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
  const mkPath = (d: string, cls: string) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    gPlot.appendChild(p);
    return p;
  };
  const mkDot = (cx: number, cy: number, cls: string, r = 4.5) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('class', cls);
    gPlot.appendChild(c);
    return c;
  };

  /* ---- Readout + caption ---- */
  const readout = document.createElement('div');
  readout.className = 'dm-readout';
  panel.appendChild(readout);
  const note = document.createElement('div');
  note.className = 'dm-note';
  note.textContent =
    'Constant attack: 250 documents ≈ 420k tokens. Clean-data volume is Chinchilla-optimal (≈20 tokens/parameter); fraction = 21,000 / params, reproducing the paper’s 0.00016% at 13B. Dashed line = the dilution myth (a fixed 0.01% share). Drag to pick a scale.';
  caption.appendChild(note);

  /* ---- Render ---- */
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const dom = mode === 'fraction' ? Y_FRAC : Y_COUNT;

    // y title
    mkText(X0 - 6, 30, 'dm-axis', mode === 'fraction' ? 'poison as share of training tokens' : 'poison documents an attacker must inject');

    // y gridlines + ticks
    for (const tick of dom.ticks) {
      const y = yOf(tick, dom);
      mkLine(X0, y, X1, y, 'dm-grid');
      mkText(X0 - 8, y + 3, 'dm-axislab', mode === 'fraction' ? fmtTickPct(tick) : fmtTickCount(tick), 'end');
    }

    // baseline + x ticks (log params)
    mkLine(X0, Y_BASE, X1, Y_BASE, 'dm-grid');
    for (const p of [1e9, 1e10, 1e11, 1e12]) {
      const x = xOf(p);
      mkLine(x, Y_TOP, x, Y_BASE, 'dm-grid');
      mkText(x, Y_BASE + 17, 'dm-axislab', fmtParams(p), 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 34, 'dm-axis', 'model scale · parameters (log)', 'middle');

    if (mode === 'fraction') {
      // Carlini 0.01% reference band
      const yc = yOf(CARLINI, dom);
      mkLine(X0, yc, X1, yc, 'dm-ref');
      mkText(X1 - 4, yc - 6, 'dm-reflab', '0.01% — buyable for ~$60 (Carlini)', 'end');

      // collapsing fraction curve: fraction = 21000/p (straight line in log-log)
      const d = `M${xOf(P_MIN).toFixed(1)},${yOf(fractionOf(P_MIN), dom).toFixed(1)} L${xOf(P_MAX).toFixed(1)},${yOf(fractionOf(P_MAX), dom).toFixed(1)}`;
      mkPath(d, 'dm-const');
      mkText(xOf(2.4e9), yOf(fractionOf(2.4e9), dom) - 9, 'dm-constlab', 'the same 250 docs, as a share ↓');

      // measured model points
      for (const m of MODELS) {
        mkDot(xOf(m.params), yOf(fractionOf(m.params), dom), 'dm-pt');
      }
    } else {
      // dilution-myth line (fixed 0.01% share → docs scale with data)
      const dm = `M${xOf(P_MIN).toFixed(1)},${yOf(mythDocs(P_MIN), dom).toFixed(1)} L${xOf(P_MAX).toFixed(1)},${yOf(mythDocs(P_MAX), dom).toFixed(1)}`;
      mkPath(dm, 'dm-myth');
      mkText(xOf(1.1e11), yOf(mythDocs(1.1e11), dom) - 8, 'dm-mythlab', 'dilution myth: poison ∝ data');

      // flat constant-count line at 250
      const yc = yOf(DOCS, dom);
      mkPath(`M${xOf(P_MIN).toFixed(1)},${yc.toFixed(1)} L${xOf(P_MAX).toFixed(1)},${yc.toFixed(1)}`, 'dm-const');
      mkText(xOf(8e10), yc - 8, 'dm-constlab', 'measured: ~250 docs, flat', 'middle');

      // measured model points (all at 250) + their myth counterparts
      for (const m of MODELS) {
        mkDot(xOf(m.params), yOf(mythDocs(m.params), dom), 'dm-mythpt', 3.4);
        mkDot(xOf(m.params), yc, 'dm-pt');
      }
    }

    // marker at current model scale
    const mx = xOf(params);
    mkLine(mx, Y_TOP, mx, Y_BASE, 'dm-marker');
    const activeY = mode === 'fraction' ? yOf(fractionOf(params), dom) : yOf(DOCS, dom);
    mkDot(mx, activeY, 'dm-pt', 5.5);

    // hit area (added last so it's on top for pointer)
    const hit = document.createElementNS(NS, 'rect');
    hit.setAttribute('class', 'dm-hit');
    hit.setAttribute('x', String(X0));
    hit.setAttribute('y', String(Y_TOP));
    hit.setAttribute('width', String(X1 - X0));
    hit.setAttribute('height', String(Y_BASE - Y_TOP));
    gPlot.appendChild(hit);
    hit.addEventListener('pointerdown', onDown);

    // ---- slider + readout ----
    const want = String(Math.round(((Math.log10(params) - LOG_PMIN) / (LOG_PMAX - LOG_PMIN)) * 1000));
    if (slider.value !== want) slider.value = want;
    scaleOut.innerHTML = '';
    const si = document.createElement('i');
    si.textContent = `${fmtParams(params)} params`;
    scaleOut.append(si, ` · ${fmtTokens(cleanTokens(params))} clean tokens`);

    const frac = fractionOf(params);
    const myth = mythDocs(params);
    const gap = myth / DOCS;
    readout.innerHTML = '';
    const cell = (html: string) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      readout.appendChild(d);
    };
    cell(`scale <b>${fmtParams(params)}</b> · <b>${fmtTokens(cleanTokens(params))}</b> training tokens`);
    cell(`attack <i>250 docs</i> · 420k tokens · <b>fixed</b>`);
    cell(`share of training set <i>${fmtPct(frac)}</i> (1 in ${fmtCount(1 / frac)})`);
    cell(`dilution myth would need <s>${fmtCount(myth)} docs</s> — <b>${fmtCount(gap)}×</b> more`);
  }

  /* ---- Interaction ---- */
  const onSlide = () => {
    params = 10 ** (LOG_PMIN + (Number(slider.value) / 1000) * (LOG_PMAX - LOG_PMIN));
    render();
  };
  slider.addEventListener('input', onSlide);

  let dragging = false;
  const paramsFromX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const cx = Math.max(X0, Math.min(X1, vx));
    return Math.max(P_MIN, Math.min(P_MAX, pOfX(cx)));
  };
  function onDown(e: PointerEvent) {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    params = paramsFromX(e.clientX);
    render();
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    params = paramsFromX(e.clientX);
    render();
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  const setMode = (m: Mode) => {
    mode = m;
    btnCount.setAttribute('aria-pressed', String(m === 'count'));
    btnFrac.setAttribute('aria-pressed', String(m === 'fraction'));
    render();
  };
  btnCount.addEventListener('click', () => setMode('count'));
  btnFrac.addEventListener('click', () => setMode('fraction'));

  setMode('count');

  return () => {
    layout.dispose();
    slider.removeEventListener('input', onSlide);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    style.remove();
  };
}
