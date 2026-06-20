/**
 * Artifact: the-sampling-threshold — The Sampling Threshold
 * Manifest: content/artifacts/the-sampling-threshold/manifest.json
 *
 * An inspection game between a solver (asserter) and a verifier, drawn as the
 * Proof of Sampling deterrence condition. Everything is normalised to one unit
 * of honest compute/verification, C = 1; the reward R and slashable bond S are
 * multiples of C. Honesty is the solver's dominant strategy once the sampling
 * rate clears
 *
 *     p*  =  C / [ (1 - r)·S + (1 - 2r)·R ]            (Proposition 1)
 *
 * with r the colluding/Byzantine validator share. The chart plots the solver's
 * expected payoff for the two pure strategies — EV(honest) = R - C (flat) and
 * EV(cheat)(p) = R - p·D, D = (1-r)S + (1-2r)R — which cross exactly at p*.
 * Drag the operating-rate line: left of p* cheating pays (the mixed-strategy
 * collapse); right of it honesty dominates. The bounty slider is the crux —
 * if the catch payout β·S can't repay the verifier's cost C, a rational
 * verifier never looks (the verifier's dilemma) and sampling decays to zero no
 * matter how low p* sits. Presets load the paper's spML / opML parameters
 * (./data.json); the spML preset reproduces the stated ~0.736% overhead.
 *
 * Layout: shared responsive primitive (stage SVG chart · panel verdict + payoff
 * matrix · footer controls presets+sliders · caption provenance).
 */
import data from '../../../content/artifacts/the-sampling-threshold/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG = 'http://www.w3.org/2000/svg';
// Plot frame in viewBox units (400 × 225 ≙ 16/9, so no letterboxing).
const VB_W = 400,
  VB_H = 225;
const X0 = 40,
  X1 = 388,
  Y0 = 16,
  Y1 = 188;

interface State {
  reward: number; // R, in units of C
  slash: number; // S, in units of C
  byz: number; // r, 0..0.49
  bounty: number; // β, 0..1 (share of slash paid to the catcher)
  pOp: number; // operating sampling rate, 0..1
  presetId: string | null;
  pinnedOp: boolean; // has the reader dragged the operating line?
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 2 : f < 1 ? 1 : 0)}%`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 1 : 0));

interface Derived {
  D: number;
  pStar: number;
  xMax: number;
  evHonest: number;
  bountyOk: boolean;
  catchPay: number; // β·S
}
function derive(s: State): Derived {
  const D = (1 - s.byz) * s.slash + (1 - 2 * s.byz) * s.reward;
  const pStar = clamp(1 / D, 0, 1);
  const xMax = clamp(pStar * 4, 0.02, 1);
  return {
    D,
    pStar,
    xMax,
    evHonest: s.reward - 1,
    catchPay: s.bounty * s.slash,
    bountyOk: s.bounty * s.slash >= 1,
  };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    stageFr: '1.5fr',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;
  stage.classList.add('st-stage');
  panel.classList.add('st-panel');
  controlsSlot.classList.add('st-inputs');

  const style = document.createElement('style');
  style.textContent = `
    .st-stage { min-width:0; position:relative; }
    .st-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono', monospace; }
    .st-svg text { fill:#8d95ad; }
    .st-grab { cursor:ew-resize; }
    .st-svg .st-handle:focus-visible { outline:2px solid #22d3ee; outline-offset:2px; border-radius:50%; }
    .st-panel { display:flex; flex-direction:column; gap:11px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .st-verdict { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:11px 13px; display:flex; flex-direction:column; gap:7px; min-width:0; }
    .st-badge { align-self:flex-start; font:700 11px 'JetBrains Mono', monospace; letter-spacing:.1em;
      text-transform:uppercase; padding:4px 9px; border-radius:6px; }
    .st-honest { color:#22d3ee; background:rgba(34,211,238,.12); box-shadow:inset 0 0 0 1px rgba(34,211,238,.42); }
    .st-under { color:#f0883e; background:rgba(240,136,62,.12); box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }
    .st-dilemma { color:#f5b54a; background:rgba(245,181,74,.12); box-shadow:inset 0 0 0 1px rgba(245,181,74,.45); }
    .st-vmsg { font-size:11px; color:#9aa2b8; min-width:0; }
    .st-vmsg b { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .st-stat { display:flex; gap:8px 14px; flex-wrap:wrap; min-width:0; }
    .st-stat span { font-size:10.5px; color:#5b6378; }
    .st-stat b { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .st-matrix { display:grid; grid-template-columns:auto minmax(0,1fr) minmax(0,1fr); gap:3px;
      min-width:0; max-width:100%; }
    .st-mh { font-size:9px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378;
      padding:3px 5px; display:flex; align-items:flex-end; }
    .st-mr { font-size:9px; letter-spacing:.04em; text-transform:uppercase; color:#5b6378;
      padding:5px 6px; display:flex; align-items:center; }
    .st-cell { border:1px solid rgba(124,140,255,.12); border-radius:7px; background:#0a0f1b;
      padding:6px 7px; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .st-cell .st-cv { font-size:11px; color:#cdd3e3; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .st-cell .st-cl { font-size:8.5px; letter-spacing:.04em; text-transform:uppercase; color:#5b6378; }
    .st-cell.st-eq { border-color:rgba(34,211,238,.55); background:rgba(34,211,238,.07);
      box-shadow:0 0 12px rgba(34,211,238,.16); }
    .st-cell.st-eq .st-cl { color:#22d3ee; }
    .st-cell.st-threat { border-color:rgba(245,181,74,.5); background:rgba(245,181,74,.06); }
    .st-cell.st-threat .st-cl { color:#f5b54a; }
    .st-byz { font-size:10.5px; color:#8d95ad; line-height:1.5; border-top:1px solid rgba(124,140,255,.12);
      padding-top:8px; }
    .st-byz b { color:#f0883e; }
    .st-inputs { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .st-presets { display:flex; flex-wrap:wrap; gap:8px; min-width:0; max-width:100%; }
    .st-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:#22d3ee; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.06em; text-transform:uppercase; padding:7px 10px; white-space:nowrap; }
    .st-preset:hover, .st-preset:focus-visible { border-color:#22d3ee; outline:none; }
    .st-preset.st-on { background:rgba(34,211,238,.12); box-shadow:0 0 12px rgba(34,211,238,.25); }
    .st-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));
      gap:8px 16px; align-items:end; min-width:0; max-width:100%; }
    .st-field { min-width:0; max-width:100%; }
    .st-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .st-field output { color:#e7eaf3; font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .st-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0;
      accent-color:#7c8cff; }
    .st-field.st-bounty input { accent-color:#f5b54a; }
    .st-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .st-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  const state: State = {
    reward: 1.2,
    slash: 150,
    byz: 0.1,
    bounty: 1.0,
    pOp: 1 / ((1 - 0.1) * 150 + (1 - 0.2) * 1.2),
    presetId: 'spml',
    pinnedOp: false,
  };

  /* ---------- SVG scaffold ---------- */
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'st-svg');
  svg.setAttribute('role', 'img');
  const mk = (tag: string, attrs: Record<string, string | number> = {}) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
    return el;
  };

  const regUnder = mk('rect', { x: X0, y: Y0, height: Y1 - Y0, fill: 'rgba(240,136,62,.07)' });
  const regOk = mk('rect', { y: Y0, x: X0, height: Y1 - Y0, fill: 'rgba(34,211,238,.06)' });
  // axes
  mk('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, stroke: 'rgba(124,140,255,.28)', 'stroke-width': 1 });
  mk('line', { x1: X0, y1: Y0, x2: X0, y2: Y1, stroke: 'rgba(124,140,255,.28)', 'stroke-width': 1 });
  mk('text', { x: X0 - 4, y: Y0 + 4, 'text-anchor': 'end', 'font-size': 8.5 }).textContent = 'payoff';
  const xAxisLabel = mk('text', {
    x: (X0 + X1) / 2, y: VB_H - 4, 'text-anchor': 'middle', 'font-size': 9, fill: '#8d95ad',
  });
  xAxisLabel.textContent = 'sampling rate  p  →';

  // x ticks (pool of 3)
  const xticks = [0, 1, 2].map(() => {
    const t = document.createElementNS(SVG, 'line');
    t.setAttribute('stroke', 'rgba(124,140,255,.16)');
    t.setAttribute('stroke-width', '1');
    svg.appendChild(t);
    const lbl = document.createElementNS(SVG, 'text');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '8.5');
    svg.appendChild(lbl);
    return { t, lbl };
  });

  const cheatLine = mk('line', { stroke: '#f0883e', 'stroke-width': 2, 'stroke-linecap': 'round' });
  const honestLine = mk('line', { stroke: '#22d3ee', 'stroke-width': 2, 'stroke-linecap': 'round',
    'stroke-dasharray': '1 0' });
  const honestLbl = mk('text', { 'font-size': 8.5, fill: '#22d3ee', 'text-anchor': 'end' });
  honestLbl.textContent = 'honest R−C';
  const cheatLbl = mk('text', { 'font-size': 8.5, fill: '#f0883e', 'text-anchor': 'start' });
  cheatLbl.textContent = 'cheat R−pD';

  // p* marker
  const pStarLine = mk('line', { stroke: 'rgba(231,234,243,.5)', 'stroke-width': 1,
    'stroke-dasharray': '3 3' });
  const pStarDot = mk('circle', { r: 3, fill: '#e7eaf3' });
  const pStarLbl = mk('text', { 'font-size': 9, fill: '#e7eaf3', 'text-anchor': 'middle',
    'font-weight': 700 });

  // spML reference tick
  const spmlTick = mk('line', { stroke: 'rgba(124,140,255,.5)', 'stroke-width': 1,
    'stroke-dasharray': '2 2' });
  const spmlLbl = mk('text', { 'font-size': 7.5, fill: '#7c8cff', 'text-anchor': 'middle' });
  spmlLbl.textContent = 'spML .74%';

  // operating line + handle
  const opLine = mk('line', { stroke: '#f5b54a', 'stroke-width': 1.5 });
  const opGlow = mk('line', { stroke: 'rgba(245,181,74,.25)', 'stroke-width': 5,
    'stroke-linecap': 'round' });
  const opHandle = document.createElementNS(SVG, 'circle');
  opHandle.setAttribute('r', '5');
  opHandle.setAttribute('fill', '#f5b54a');
  opHandle.setAttribute('stroke', '#0a0f1b');
  opHandle.setAttribute('stroke-width', '1.5');
  opHandle.setAttribute('class', 'st-handle st-grab');
  opHandle.setAttribute('tabindex', '0');
  opHandle.setAttribute('role', 'slider');
  opHandle.setAttribute('aria-label', 'operating sampling rate');
  svg.appendChild(opHandle);
  const opLbl = mk('text', { 'font-size': 8.5, fill: '#f5b54a', 'text-anchor': 'middle',
    'font-weight': 700 });
  // transparent drag surface over the plot (added last so it's on top for clicks)
  const dragSurface = mk('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0,
    fill: 'transparent', class: 'st-grab' });

  stage.appendChild(svg);

  /* ---------- Panel ---------- */
  const verdict = document.createElement('div');
  verdict.className = 'st-verdict';
  const badge = document.createElement('span');
  badge.className = 'st-badge';
  const vmsg = document.createElement('div');
  vmsg.className = 'st-vmsg';
  const stat = document.createElement('div');
  stat.className = 'st-stat';
  verdict.append(badge, vmsg, stat);
  panel.appendChild(verdict);

  // payoff matrix
  const matrix = document.createElement('div');
  matrix.className = 'st-matrix';
  matrix.innerHTML = `<div class="st-mh"></div><div class="st-mh">verifier<br>samples</div><div class="st-mh">verifier<br>skips</div>`;
  const cells: Record<string, HTMLElement> = {};
  const mkCell = (key: string, cls = '') => {
    const c = document.createElement('div');
    c.className = `st-cell ${cls}`.trim();
    c.innerHTML = `<span class="st-cv"></span><span class="st-cl"></span>`;
    cells[key] = c;
    return c;
  };
  const rowH = document.createElement('div');
  rowH.className = 'st-mr';
  rowH.textContent = 'solver honest';
  const rowC = document.createElement('div');
  rowC.className = 'st-mr';
  rowC.textContent = 'solver cheats';
  matrix.append(rowH, mkCell('hs'), mkCell('hk'), rowC, mkCell('cs'), mkCell('ck'));
  panel.appendChild(matrix);

  const byz = document.createElement('div');
  byz.className = 'st-byz';
  panel.appendChild(byz);

  /* ---------- Controls ---------- */
  const presetWrap = document.createElement('div');
  presetWrap.className = 'st-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const p of data.presets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-preset';
    btn.textContent = `⬢ ${p.label}`;
    btn.title = p.note;
    presetWrap.appendChild(btn);
    presetBtns.set(p.id, btn);
  }
  controlsSlot.appendChild(presetWrap);

  const fields = document.createElement('div');
  fields.className = 'st-fields';
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'reward', label: 'reward  R  (×C)', cls: '', min: 100, max: 500, step: 5, init: state.reward * 100 },
    { id: 'slash', label: 'bond  S  (×C)', cls: '', min: 5, max: 300, step: 5, init: state.slash },
    { id: 'byz', label: 'byzantine  r', cls: '', min: 0, max: 49, step: 1, init: state.byz * 100 },
    { id: 'bounty', label: 'bounty  β  (of S)', cls: 'st-bounty', min: 0, max: 100, step: 1, init: state.bounty * 100 },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = `st-field ${d.cls}`.trim();
    const label = document.createElement('label');
    label.htmlFor = `st-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `st-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.init);
    input.setAttribute('aria-label', d.label);
    field.append(label, input);
    fields.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }
  controlsSlot.appendChild(fields);

  /* ---------- Caption ---------- */
  const cap = document.createElement('div');
  cap.className = 'st-cap';
  const b = data.benchmarks;
  cap.innerHTML =
    `Stylised inspection game, costs in units of one verification (C=1). ` +
    `<b>p* = C / [(1−r)S + (1−2r)R]</b>. spML's R=1.2C, S=150C, r=10% give p* ≈ ${pct(b.spml_overhead)} overhead; ` +
    `opML leaks ${pct(b.opml_undetected_fraud)} of fraud; a zkML proof of a ${b.zkml_nanogpt_params} net takes ${b.zkml_nanogpt_minutes} min. Drag the amber line or tab to it and use ← →.`;
  caption.appendChild(cap);

  /* ---------- Geometry helpers ---------- */
  let d: Derived = derive(state);
  const sx = (p: number) => X0 + (p / d.xMax) * (X1 - X0);
  let yLo = 0,
    yHi = 1;
  const sy = (v: number) => Y1 - ((v - yLo) / (yHi - yLo)) * (Y1 - Y0);

  /* ---------- Render ---------- */
  function render() {
    d = derive(state);
    if (!state.pinnedOp) state.pOp = d.pStar; // unpinned: sit on the threshold
    state.pOp = clamp(state.pOp, 0, d.xMax);

    // y-range from the two strategies across [0, xMax]
    const cheatAtMax = state.reward - d.xMax * d.D;
    yHi = state.reward + 0.15; // cheat at p=0 is R
    yLo = Math.min(d.evHonest, cheatAtMax) - 0.15;

    // regions split at p*
    const xs = sx(d.pStar);
    regUnder.setAttribute('width', String(Math.max(0, xs - X0)));
    regOk.setAttribute('x', String(xs));
    regOk.setAttribute('width', String(Math.max(0, X1 - xs)));

    // x ticks at 0, xMax/2, xMax
    [0, d.xMax / 2, d.xMax].forEach((p, i) => {
      const { t, lbl } = xticks[i];
      const x = sx(p);
      t.setAttribute('x1', String(x));
      t.setAttribute('x2', String(x));
      t.setAttribute('y1', String(Y1));
      t.setAttribute('y2', String(Y1 + 3));
      lbl.setAttribute('x', String(x));
      lbl.setAttribute('y', String(Y1 + 13));
      lbl.textContent = pct(p);
    });

    // strategy lines
    honestLine.setAttribute('x1', String(X0));
    honestLine.setAttribute('x2', String(X1));
    honestLine.setAttribute('y1', String(sy(d.evHonest)));
    honestLine.setAttribute('y2', String(sy(d.evHonest)));
    honestLbl.setAttribute('x', String(X1 - 2));
    honestLbl.setAttribute('y', String(sy(d.evHonest) - 4));

    cheatLine.setAttribute('x1', String(sx(0)));
    cheatLine.setAttribute('y1', String(sy(state.reward)));
    cheatLine.setAttribute('x2', String(sx(d.xMax)));
    cheatLine.setAttribute('y2', String(sy(cheatAtMax)));
    cheatLbl.setAttribute('x', String(sx(d.xMax * 0.04)));
    cheatLbl.setAttribute('y', String(sy(state.reward) - 4));

    // p* marker
    pStarLine.setAttribute('x1', String(xs));
    pStarLine.setAttribute('x2', String(xs));
    pStarLine.setAttribute('y1', String(Y0));
    pStarLine.setAttribute('y2', String(Y1));
    pStarDot.setAttribute('cx', String(xs));
    pStarDot.setAttribute('cy', String(sy(d.evHonest)));
    pStarLbl.setAttribute('x', String(clamp(xs, X0 + 16, X1 - 16)));
    pStarLbl.setAttribute('y', String(Y0 + 9));
    pStarLbl.textContent = `p* ${pct(d.pStar)}`;

    // spML reference (only meaningful when distinct from p* and in range)
    const spmlP = data.benchmarks.spml_overhead;
    const showSpml = spmlP <= d.xMax && Math.abs(spmlP - d.pStar) > d.xMax * 0.08;
    const sX = sx(spmlP);
    spmlTick.setAttribute('x1', String(sX));
    spmlTick.setAttribute('x2', String(sX));
    spmlTick.setAttribute('y1', String(Y1 - 26));
    spmlTick.setAttribute('y2', String(Y1));
    spmlLbl.setAttribute('x', String(clamp(sX, X0 + 18, X1 - 18)));
    spmlLbl.setAttribute('y', String(Y1 - 30));
    spmlTick.style.display = showSpml ? '' : 'none';
    spmlLbl.style.display = showSpml ? '' : 'none';

    // operating line
    const ox = sx(state.pOp);
    const oy = sy(state.reward - state.pOp * d.D); // sit the handle on the cheat curve
    for (const ln of [opLine, opGlow]) {
      ln.setAttribute('x1', String(ox));
      ln.setAttribute('x2', String(ox));
      ln.setAttribute('y1', String(Y0));
      ln.setAttribute('y2', String(Y1));
    }
    opHandle.setAttribute('cx', String(ox));
    opHandle.setAttribute('cy', String(oy));
    opHandle.setAttribute('aria-valuemin', '0');
    opHandle.setAttribute('aria-valuemax', (d.xMax * 100).toFixed(2));
    opHandle.setAttribute('aria-valuenow', (state.pOp * 100).toFixed(2));
    opHandle.setAttribute('aria-valuetext', `${pct(state.pOp)} sampling rate`);
    opLbl.setAttribute('x', String(clamp(ox, X0 + 14, X1 - 14)));
    opLbl.setAttribute('y', String(Y1 - 4));
    opLbl.textContent = pct(state.pOp);

    // outputs
    outputs.get('reward')!.textContent = `${num(state.reward)}×`;
    outputs.get('slash')!.textContent = `${num(state.slash)}×`;
    outputs.get('byz')!.textContent = pct(state.byz);
    outputs.get('bounty')!.textContent = `${Math.round(state.bounty * 100)}%`;

    renderVerdict();
    renderMatrix();
  }

  function renderVerdict() {
    const gap = state.pOp * d.D - 1; // EV(honest) − EV(cheat) at p_op, in units of C
    if (!d.bountyOk) {
      badge.className = 'st-badge st-dilemma';
      badge.textContent = "verifier's dilemma";
      vmsg.innerHTML =
        `A catch repays only <b>${num(d.catchPay)}C</b> &lt; the <b>1C</b> it costs to look. ` +
        `A rational verifier skips, sampling decays toward 0, and the solver drifts back to cheating — the mixed-strategy basin, whatever p* says.`;
    } else if (state.pOp < d.pStar - 1e-9) {
      badge.className = 'st-badge st-under';
      badge.textContent = 'under-sampled';
      vmsg.innerHTML =
        `At p = <b>${pct(state.pOp)}</b> &lt; p* = <b>${pct(d.pStar)}</b>, cheating beats honesty by <b>${num(-gap)}C</b> a task. ` +
        `Honest validators are the suckers; the equilibrium unravels.`;
    } else if (gap < 0.04) {
      badge.className = 'st-badge st-honest';
      badge.textContent = 'honest equilibrium';
      vmsg.innerHTML =
        `Right on the threshold p* = <b>${pct(d.pStar)}</b>: cheating breaks even, gaining nothing. ` +
        `Nudge sampling up and honesty strictly dominates — the bond is bluff-checked, and the check catches nothing.`;
    } else {
      badge.className = 'st-badge st-honest';
      badge.textContent = 'honest equilibrium';
      vmsg.innerHTML =
        `Honesty dominates: cheating would cost the solver <b>${num(gap)}C</b> a task. ` +
        `The bond is bluff-checked at p = <b>${pct(state.pOp)}</b> — and at equilibrium that check catches nothing.`;
    }
    stat.innerHTML =
      `<span>p* <b>${pct(d.pStar)}</b></span>` +
      `<span>operating <b>${pct(state.pOp)}</b></span>` +
      `<span>catch pays <b>${num(d.catchPay)}C</b></span>`;
  }

  function renderMatrix() {
    const R = state.reward;
    const setCell = (key: string, sol: string, lbl: string) => {
      const c = cells[key];
      (c.querySelector('.st-cv') as HTMLElement).textContent = sol;
      (c.querySelector('.st-cl') as HTMLElement).textContent = lbl;
    };
    setCell('hs', `${num(R - 1)} / −1`, 'wasted check');
    setCell('hk', `${num(R - 1)} / 0`, d.bountyOk ? 'realised' : '—');
    setCell('cs', `−${num(state.slash)} / ${num(d.catchPay - 1)}`, d.bountyOk ? 'the threat' : 'no payout');
    setCell('ck', `${num(R)} / 0`, 'fraud settles');
    // equilibrium highlight: honest world realises (honest, skip); the bounty
    // makes (cheat, sample) the credible off-path threat that sustains it.
    cells.hk.classList.toggle('st-eq', d.bountyOk && state.pOp >= d.pStar - 1e-9);
    cells.ck.classList.toggle('st-eq', !d.bountyOk || state.pOp < d.pStar - 1e-9);
    cells.cs.classList.toggle('st-threat', d.bountyOk);
    byz.innerHTML =
      `Sampling deters a <em>rational</em> liar at p* = ${pct(d.pStar)}. A <b>Byzantine</b> one ignores the payoff — ` +
      `catching it needs p ≈ 100% and a bond oversized by 1/p, the capital tax of ` +
      `<a href="/articles/restaking-verifiable-ai-cost-of-corruption" style="color:#8d95ad;text-decoration:underline">bond-and-slash</a>.`;
  }

  /* ---------- Interaction ---------- */
  function pointerToP(clientX: number): number {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    return clamp(((vx - X0) / (X1 - X0)) * d.xMax, 0, d.xMax);
  }
  let dragging = false;
  function onDown(e: PointerEvent) {
    dragging = true;
    state.pinnedOp = true;
    svg.setPointerCapture(e.pointerId);
    state.pOp = pointerToP(e.clientX);
    render();
    e.preventDefault();
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    state.pOp = pointerToP(e.clientX);
    render();
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  }
  dragSurface.addEventListener('pointerdown', onDown);
  opHandle.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  function onKey(e: KeyboardEvent) {
    const step = d.xMax / 50;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      state.pinnedOp = true;
      state.pOp = clamp(state.pOp - step, 0, d.xMax);
      render();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      state.pinnedOp = true;
      state.pOp = clamp(state.pOp + step, 0, d.xMax);
      render();
      e.preventDefault();
    }
  }
  opHandle.addEventListener('keydown', onKey);

  function clearPreset() {
    state.presetId = null;
    for (const b of presetBtns.values()) b.classList.remove('st-on');
  }
  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    switch (this.id) {
      case 'st-reward':
        state.reward = v / 100;
        break;
      case 'st-slash':
        state.slash = v;
        break;
      case 'st-byz':
        state.byz = v / 100;
        break;
      case 'st-bounty':
        state.bounty = v / 100;
        break;
    }
    clearPreset();
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  function applyPreset(id: string) {
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    state.reward = p.reward;
    state.slash = p.slash;
    state.byz = p.byz;
    state.bounty = p.bounty;
    state.presetId = id;
    state.pinnedOp = false; // snap operating line back onto the threshold
    sliders.get('reward')!.value = String(p.reward * 100);
    sliders.get('slash')!.value = String(p.slash);
    sliders.get('byz')!.value = String(p.byz * 100);
    sliders.get('bounty')!.value = String(p.bounty * 100);
    for (const [pid, btn] of presetBtns) btn.classList.toggle('st-on', pid === id);
    render();
  }
  const presetHandlers = new Map<string, () => void>();
  for (const [id, btn] of presetBtns) {
    const h = () => applyPreset(id);
    presetHandlers.set(id, h);
    btn.addEventListener('click', h);
  }
  presetBtns.get('spml')?.classList.add('st-on');

  render();

  return () => {
    layout.dispose();
    dragSurface.removeEventListener('pointerdown', onDown);
    opHandle.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    opHandle.removeEventListener('keydown', onKey);
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    for (const [id, btn] of presetBtns) {
      const h = presetHandlers.get(id);
      if (h) btn.removeEventListener('click', h);
    }
    style.remove();
  };
}
