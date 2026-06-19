/**
 * Artifact: watchers-threshold — The Watcher's Threshold
 * Manifest: content/artifacts/watchers-threshold/manifest.json
 *
 * An AI proposer resolves a prediction market and posts a bond. On UMA's
 * Optimistic Oracle the economic backstop is a dispute: anyone may challenge by
 * matching the bond, and a *winning* party recovers its own bond plus half the
 * loser's bond. So a correct dispute pays the disputer R·B (R = 0.5) while a
 * wrong one forfeits the full bond (−B). Writing f for the fraction of bond lost
 * to ~49h of capital lock plus DVM-vote risk, the expected value of disputing a
 * proposal believed wrong with probability p is
 *
 *     EV(p) = B · [ p·(R+1) − (1+f) ]            (linear in belief p)
 *     p*    = (1+f) / (R+1)                       (break-even belief)
 *
 * With R = 0.5, f = 0 this is p* = 2/3: a watcher must be more than two-thirds
 * sure a *specific* proposal is wrong before challenging pays. The chart draws
 * EV(p) across belief, marks p*, and plots each market category at its base
 * error rate (UMA's Optimistic Truth Bot: sports 0.7%, clear Yes/No 5%, all
 * markets 22%, mention 28%). All of them sit far left of p*, deep in the
 * negative-EV zone — the reason confident-but-wrong AI resolutions settle
 * unchallenged. Raising the reward (or cutting friction) slides p* left.
 *
 * SVG chart, no RAF — renders on input. Tap a category marker (or ← →) to read
 * its evidence burden; click the plot to set your own belief; bond, reward and
 * friction reshape the line live. Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/watchers-threshold/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Category { id: string; label: string; accuracy: number; error: number }

const CATS = data.categories as Category[];
const D = data.defaults;

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 460;
const X0 = 64;
const X1 = 800;
const Y_TOP = 36;
const Y_BASE = 392;

/* x domain: belief p that the proposal is wrong, 0 → 1 */
const xOf = (p: number) => X0 + Math.min(Math.max(p, 0), 1) * (X1 - X0);
const pOfX = (x: number) => Math.min(Math.max((x - X0) / (X1 - X0), 0), 1);

/* --- model --- */
// expected value of disputing, in dollars, given belief p
const evOf = (p: number, bond: number, R: number, f: number) => bond * (p * (R + 1) - (1 + f));
// break-even belief
const pStarOf = (R: number, f: number) => (1 + f) / (R + 1);

/* --- formatters --- */
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const usd = (x: number) => `${x < 0 ? '−' : '+'}$${Math.abs(x).toFixed(0)}`;

export default function mount(container: HTMLElement): () => void {
  let bond = D.bond as number;
  let R = D.rewardRatio as number;
  let f = D.frictionPct as number;
  let sel = Math.max(0, CATS.findIndex((c) => c.id === D.selectedCategory));
  let belief = D.belief as number;

  const REWARDS = [
    { v: 0.5, label: '½ bond' },
    { v: 1.0, label: '1× bond' },
    { v: 2.0, label: '2× bond' },
  ];

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .wt-chartwrap { position:absolute; inset:0; min-height:170px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .wt-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:manipulation; cursor:crosshair; }
    .wt-grid { stroke:rgba(124,140,255,.1); }
    .wt-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .wt-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .wt-zero { stroke:rgba(231,234,243,.34); stroke-width:1.1; }
    .wt-silent { fill:rgba(249,115,98,.07); }
    .wt-pay { fill:rgba(34,211,238,.06); }
    .wt-ev-neg { fill:none; stroke:#f97362; stroke-width:2.6; }
    .wt-ev-pos { fill:none; stroke:#22d3ee; stroke-width:2.6; }
    .wt-be { stroke:#e7eaf3; stroke-width:1.2; stroke-dasharray:3 3; }
    .wt-belab { fill:#e7eaf3; font:600 10.5px 'JetBrains Mono', monospace; }
    .wt-mk { stroke:rgba(141,149,173,.42); stroke-width:1; stroke-dasharray:2 3; }
    .wt-mk-sel { stroke:rgba(231,234,243,.6); stroke-width:1.4; stroke-dasharray:none; }
    .wt-node { outline:none; cursor:pointer; }
    .wt-node:focus-visible .wt-ring { opacity:1; }
    .wt-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .wt-dot { fill:#f5a524; stroke:#05070d; stroke-width:1.4; }
    .wt-dot-sel { fill:#ffce6b; }
    .wt-hit { fill:transparent; cursor:pointer; }
    .wt-mklab { font:600 10px 'JetBrains Mono', monospace; fill:#c9a86a; pointer-events:none; }
    .wt-cursor { stroke:#9aa3bd; stroke-width:1.2; stroke-dasharray:4 3; }
    .wt-cursordot { fill:#e7eaf3; stroke:#05070d; stroke-width:1.4; }
    .wt-cursorlab { font:600 10.5px 'JetBrains Mono', monospace; }

    .wt-controls { display:flex; align-items:flex-end; gap:12px 18px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .wt-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .wt-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .wt-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .wt-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 10px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .wt-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .wt-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .wt-slider { display:flex; flex-direction:column; gap:4px; min-width:150px; flex:1 1 160px; }
    .wt-slider .wt-sval { color:#e7eaf3; font-weight:700; }
    .wt-slider input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer; }

    .wt-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .wt-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .wt-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .wt-src { color:#5b6378; font-size:10.5px; }
    .wt-rows { display:flex; flex-direction:column; gap:5px; }
    .wt-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .wt-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .wt-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .wt-row b.wt-warn { color:#f97362; }
    .wt-row b.wt-good { color:#22d3ee; }
    .wt-row b.wt-amber { color:#f5a524; }
    .wt-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .wt-verdict.wt-pos { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .wt-verdict b { font-weight:700; }
    .wt-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .wt-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'wt-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Expected value of disputing an AI oracle proposal, as a function of how sure the watcher is that the proposal is wrong');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
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
  const mkRect = (x: number, y: number, w: number, h: number, cls: string) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(Math.max(0, w)));
    r.setAttribute('height', String(Math.max(0, h)));
    r.setAttribute('class', cls);
    gPlot.appendChild(r);
    return r;
  };

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'wt-controls';

  // reward segmented
  const rGroup = document.createElement('div');
  rGroup.className = 'wt-cgroup';
  const rLab = document.createElement('span');
  rLab.textContent = 'dispute reward';
  const rSegs = document.createElement('div');
  rSegs.className = 'wt-segs';
  rSegs.setAttribute('role', 'group');
  rSegs.setAttribute('aria-label', 'dispute reward');
  const rBtns = REWARDS.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wt-seg';
    b.textContent = r.label;
    b.setAttribute('aria-label', `winning disputer earns ${r.label}`);
    b.addEventListener('click', () => { R = r.v; render(); });
    rSegs.appendChild(b);
    return b;
  });
  rGroup.append(rLab, rSegs);

  // bond slider
  const bGroup = document.createElement('div');
  bGroup.className = 'wt-slider';
  const bHead = document.createElement('div');
  bHead.className = 'afl-split';
  const bLab = document.createElement('span');
  bLab.style.cssText = 'font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#5b6378;';
  bLab.textContent = 'bond';
  const bVal = document.createElement('span');
  bVal.className = 'wt-sval';
  bHead.append(bLab, bVal);
  const bInput = document.createElement('input');
  bInput.type = 'range';
  bInput.min = '100';
  bInput.max = '5000';
  bInput.step = '50';
  bInput.value = String(bond);
  bInput.setAttribute('aria-label', 'proposal bond in dollars');
  bInput.addEventListener('input', () => { bond = Number(bInput.value); render(); });
  bGroup.append(bHead, bInput);

  // friction slider
  const fGroup = document.createElement('div');
  fGroup.className = 'wt-slider';
  const fHead = document.createElement('div');
  fHead.className = 'afl-split';
  const fLab = document.createElement('span');
  fLab.style.cssText = 'font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#5b6378;';
  fLab.textContent = 'friction';
  const fVal = document.createElement('span');
  fVal.className = 'wt-sval';
  fHead.append(fLab, fVal);
  const fInput = document.createElement('input');
  fInput.type = 'range';
  fInput.min = '0';
  fInput.max = '25';
  fInput.step = '1';
  fInput.value = String(Math.round(f * 100));
  fInput.setAttribute('aria-label', 'friction: capital lock and DVM-vote risk, as a percent of bond');
  fInput.addEventListener('input', () => { f = Number(fInput.value) / 100; render(); });
  fGroup.append(fHead, fInput);

  controls.append(rGroup, bGroup, fGroup);
  controlsSlot.appendChild(controls);

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'wt-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'wt-cap';
  cap.innerHTML =
    'Disputing pays <b>EV = B·[p·(R+1) − (1+f)]</b>: a winning challenge earns reward R·B, a losing one forfeits the full bond B; ' +
    'p is the watcher&rsquo;s belief the proposal is wrong, f is capital-lock + DVM-vote friction. Break-even <b>p* = (1+f)/(R+1)</b> — ' +
    '<b>two-thirds</b> at UMA&rsquo;s R=½. Category error rates are UMA&rsquo;s Optimistic Truth Bot accuracy (sports 99.3%, clear Yes/No 95%, all 78%, mention 72%). ' +
    'Bond $750, 1.0% of 18,427 Polygon markets disputed. Tap a marker or use ← →; click the chart to set your belief.';
  caption.appendChild(cap);

  /* ---- y-axis auto-scale ---- */
  let yMax = 1000;   // positive cap
  let yMin = -1000;  // negative floor
  const yOf = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    return Y_BASE - t * (Y_BASE - Y_TOP);
  };

  const nodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;

    const pStar = pStarOf(R, f);
    const evAt0 = evOf(0, bond, R, f);  // most negative
    const evAt1 = evOf(1, bond, R, f);  // most positive

    // y range with headroom
    const hi = Math.max(200, evAt1 * 1.15);
    const lo = Math.min(-200, evAt0 * 1.1);
    yMax = niceStep(hi);
    yMin = -niceStep(-lo);

    const xStar = xOf(pStar);
    const inRange = pStar > 0 && pStar < 1;

    // shaded regions: silent (left of p*, EV<0) and pays (right of p*)
    mkRect(X0, Y_TOP, xStar - X0, Y_BASE - Y_TOP, 'wt-silent');
    if (inRange) mkRect(xStar, Y_TOP, X1 - xStar, Y_BASE - Y_TOP, 'wt-pay');

    // y gridlines + ticks
    mkText(X0 - 6, 24, 'wt-axis', 'EV of disputing this proposal ($)');
    const yticks = niceTicks(yMin, yMax);
    for (const v of yticks) {
      const y = yOf(v);
      mkLine(X0, y, X1, y, v === 0 ? 'wt-zero' : 'wt-grid');
      mkText(X0 - 8, y + 3.5, 'wt-axislab', `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v)}`, 'end');
    }

    // x baseline ticks (belief %)
    for (let p = 0; p <= 10; p++) {
      const x = xOf(p / 10);
      if (p > 0 && p < 10) mkLine(x, Y_TOP, x, Y_BASE, 'wt-grid');
      mkText(x, Y_BASE + 17, 'wt-axislab', `${p * 10}%`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'wt-axis', 'how sure the watcher is the proposal is wrong  →  belief p', 'middle');

    // EV line, split at the zero crossing for colour
    const zeroX = inRange ? xStar : (evAt0 >= 0 ? X0 : X1);
    const negPath = `M${X0},${yOf(evAt0).toFixed(1)} L${zeroX.toFixed(1)},${yOf(0).toFixed(1)}`;
    const posPath = `M${zeroX.toFixed(1)},${yOf(0).toFixed(1)} L${X1},${yOf(evAt1).toFixed(1)}`;
    const pNeg = document.createElementNS(NS, 'path');
    pNeg.setAttribute('d', negPath);
    pNeg.setAttribute('class', 'wt-ev-neg');
    gPlot.appendChild(pNeg);
    const pPos = document.createElementNS(NS, 'path');
    pPos.setAttribute('d', posPath);
    pPos.setAttribute('class', 'wt-ev-pos');
    gPlot.appendChild(pPos);

    // break-even marker
    if (inRange) {
      mkLine(xStar, Y_TOP, xStar, Y_BASE, 'wt-be');
      const anchor = xStar > X1 - 150 ? 'end' : 'start';
      mkText(xStar + (anchor === 'end' ? -6 : 6), Y_TOP + 14, 'wt-belab',
        `break-even p* = ${pct(pStar, 0)}`, anchor);
      mkText(xStar + (anchor === 'end' ? -6 : 6), Y_TOP + 28, 'wt-belab', 'dispute pays →', anchor);
    }

    // category markers at their base error rate (default belief = base rate)
    CATS.forEach((c, i) => {
      const x = xOf(c.error);
      const ev = evOf(c.error, bond, R, f);
      const y = yOf(ev);
      const isSel = i === sel;

      mkLine(x, y, x, Y_BASE, isSel ? 'wt-mk-sel' : 'wt-mk');

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'wt-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label',
        `${c.label}: AI wrong ${pct(c.error)} of the time, EV of disputing at that base rate ${usd(ev)} — below break-even ${pct(pStar, 0)}`);

      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'wt-ring');
      ring.setAttribute('cx', String(x));
      ring.setAttribute('cy', String(y));
      ring.setAttribute('r', '11');
      g.appendChild(ring);

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', `wt-dot ${isSel ? 'wt-dot-sel' : ''}`);
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', isSel ? '6' : '4.5');
      g.appendChild(dot);

      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('class', 'wt-hit');
      hit.setAttribute('cx', String(x));
      hit.setAttribute('cy', String(y));
      hit.setAttribute('r', '16');
      g.appendChild(hit);

      // label only the selected marker — the four cluster on the left and
      // always-on labels would overlap.
      if (isSel) {
        const anchor = x < X0 + 90 ? 'start' : 'middle';
        const lx = anchor === 'start' ? x + 10 : x;
        const lab = document.createElementNS(NS, 'text');
        lab.setAttribute('x', String(lx));
        lab.setAttribute('y', String(y + 18));
        lab.setAttribute('text-anchor', anchor);
        lab.setAttribute('class', 'wt-mklab');
        lab.textContent = `${c.label} · ${pct(c.error)}`;
        g.appendChild(lab);
      }

      const select = () => { sel = i; belief = c.error; render(); };
      g.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      nodes[i] = g;
    });

    // belief cursor (your wager)
    const bx = xOf(belief);
    const bev = evOf(belief, bond, R, f);
    const by = yOf(bev);
    mkLine(bx, Y_TOP, bx, Y_BASE, 'wt-cursor');
    const cdot = document.createElementNS(NS, 'circle');
    cdot.setAttribute('class', 'wt-cursordot');
    cdot.setAttribute('cx', String(bx));
    cdot.setAttribute('cy', String(by));
    cdot.setAttribute('r', '5');
    gPlot.appendChild(cdot);
    const clAnchor = bx > X1 - 120 ? 'end' : 'start';
    const clx = bx + (clAnchor === 'end' ? -8 : 8);
    const clab = mkText(clx, Math.max(Y_TOP + 12, by - 10), 'wt-cursorlab',
      `your belief ${pct(belief, 0)} · ${usd(bev)}`, clAnchor);
    clab.setAttribute('fill', bev >= 0 ? '#9fe9f5' : '#ffb3a8');

    // sync control states
    rBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(REWARDS[i].v === R)));
    bVal.textContent = `$${bond.toLocaleString()}`;
    fVal.textContent = `${Math.round(f * 100)}% of bond`;

    renderPanel(pStar);
  }

  function renderPanel(pStar: number) {
    const c = CATS[sel];
    const evBase = evOf(c.error, bond, R, f);
    const burden = pStar - c.error;
    const reward = bond * R;

    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'wt-hd';
    const name = document.createElement('span');
    name.className = 'wt-name';
    name.textContent = c.label;
    const src = document.createElement('span');
    src.className = 'wt-src';
    src.textContent = `AI ${pct(c.accuracy, 1)} accurate`;
    hd.append(name, src);

    const rows = document.createElement('div');
    rows.className = 'wt-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div');
      r.className = 'wt-row';
      const s = document.createElement('span');
      s.textContent = label;
      const b = document.createElement('b');
      if (cls) b.className = cls;
      b.textContent = val;
      r.append(s, b);
      return r;
    };
    rows.append(
      row('base error (default belief)', pct(c.error), 'wt-amber'),
      row('break-even belief p*', pct(pStar, 0), ''),
      row('win pays / lose costs', `${usd(reward)} / −$${bond}`, ''),
      row('EV at base rate', usd(evBase), evBase >= 0 ? 'wt-good' : 'wt-warn'),
      row('evidence burden to p*', `+${pct(burden, 0)}`, 'wt-warn'),
    );

    const verdict = document.createElement('div');
    verdict.className = `wt-verdict ${evBase >= 0 ? 'wt-pos' : ''}`;
    if (evBase >= 0) {
      verdict.innerHTML = `Even with no special insight, the base error rate clears p*: disputing every <b>${c.label}</b> proposal is +EV at <b>${usd(evBase)}</b>. The backstop is self-funding here.`;
    } else {
      verdict.innerHTML = `A watcher with only the base rate loses <b>${usd(evBase)}</b> per dispute. To profit they must push private belief from <b>${pct(c.error)}</b> past <b>${pct(pStar, 0)}</b> — a <b>+${pct(burden, 0)}</b> evidence burden. Errors no one can specifically flag settle unchallenged.`;
    }

    readout.append(hd, rows, verdict);
  }

  /* ---- nice-axis helpers ---- */
  function niceStep(v: number): number {
    const steps = [200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
    for (const s of steps) if (v <= s) return s;
    return Math.ceil(v / 1000) * 1000;
  }
  function niceTicks(lo: number, hi: number): number[] {
    const out: number[] = [];
    const span = hi - lo;
    const stepCandidates = [100, 200, 250, 500, 1000, 2000, 2500, 5000];
    let step = stepCandidates[stepCandidates.length - 1];
    for (const s of stepCandidates) { if (span / s <= 6) { step = s; break; } }
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1; v += step) out.push(v);
    if (!out.includes(0) && lo < 0 && hi > 0) out.push(0);
    return out.sort((a, b) => a - b);
  }

  /* ---- pointer: click the plot to set belief ---- */
  const onPointer = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((e.clientX - rect.left) / rect.width) * VB_W;
    belief = pOfX(vbx);
    render();
  };
  svg.addEventListener('pointerdown', onPointer);

  // arrow-key cycling across categories
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      sel = (sel + 1) % CATS.length; belief = CATS[sel].error; render(); nodes[sel]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      sel = (sel - 1 + CATS.length) % CATS.length; belief = CATS[sel].error; render(); nodes[sel]?.focus(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('pointerdown', onPointer);
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
