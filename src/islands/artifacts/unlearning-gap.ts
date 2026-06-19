/**
 * Artifact: unlearning-gap — The Unlearning Gap
 * Manifest: content/artifacts/unlearning-gap/manifest.json
 *
 * The distance between what unlearning *verification* reports and what a
 * *recovery attack* gets back. The axis is the membership-inference AUC of an
 * attacker deciding whether a "forgotten" record was in training: 0.50 means
 * indistinguishable from a model that never saw it (truly forgotten), 1.00
 * means fully identifiable (the knowledge is still there).
 *
 * Each method is a dumbbell. The left dot is the "verdict" — the AUC under
 * standard unlearning verification, which passing methods are tuned to push to
 * ≈random. The right dot is "attack" — the AUC after the Unlearning Mapping
 * Attack probes for residual knowledge. The bar between them is the gap: the
 * knowledge the verification certified gone but the attack pulled back. Exact
 * retraining has no gap. The verifiable-unlearning row (ZK-APEX) carries a
 * cryptographic certificate, but the certificate ends at the verdict — its
 * recovery is out of scope, drawn as a hatched zone.
 *
 * Toggle the metric (MIA AUC ↔ % knowledge recoverable — two lenses on the same
 * data, identical geometry). Tap a method or arrow through them for detail.
 * Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/unlearning-gap/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const AXIS_MIN = data.axisMin; // 0.5
const AXIS_MAX = data.axisMax; // 1.0
type Method = {
  id: string;
  label: string;
  kind: 'exact' | 'approx' | 'proof';
  verdict: number;
  attack: number | null;
  uncertified: boolean;
  cost: string;
  note: string;
  source: string;
};
const METHODS = data.methods as Method[];

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units, ~16/9) --- */
const VB_W = 800;
const VB_H = 450;
const X0 = 232; // axis start (method labels sit left of this)
const X1 = 772;
const Y_TOP = 86;
const Y_BASE = 372;
const ROW_H = (Y_BASE - Y_TOP) / METHODS.length;

/* normalized position: t in [0,1] from AUC in [0.5,1.0]. Both metric lenses are
   linear in t, so dot positions are identical; only labels/readouts change. */
const tOf = (auc: number) => (auc - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
const xOf = (auc: number) => X0 + tOf(auc) * (X1 - X0);
const rowY = (i: number) => Y_TOP + (i + 0.5) * ROW_H;

const pctRecover = (auc: number) => Math.max(0, (auc - 0.5) * 200);

type Metric = 'auc' | 'pct';
const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1.0]; // fractions of t
const fmtTick = (t: number, m: Metric) =>
  m === 'auc' ? (AXIS_MIN + t * (AXIS_MAX - AXIS_MIN)).toFixed(2) : `${Math.round(t * 100)}%`;
const fmtVal = (auc: number, m: Metric) =>
  m === 'auc' ? auc.toFixed(2) : `${Math.round(pctRecover(auc))}%`;

export default function mount(container: HTMLElement): () => void {
  let metric: Metric = 'auc';
  let sel = 1; // start on class-wise unlearning (the widest gap)

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .ug-controls { display:flex; align-items:center; gap:10px 16px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .ug-cgroup { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .ug-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .ug-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .ug-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.03em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .ug-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .ug-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .ug-chartwrap { position:absolute; inset:0; min-height:180px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .ug-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .ug-grid { stroke:rgba(124,140,255,.1); }
    .ug-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .ug-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .ug-rowlab { fill:#8d95ad; font:600 12px 'JetBrains Mono', monospace; }
    .ug-rowlab.ug-on { fill:#e7eaf3; }
    .ug-rowsub { fill:#5b6378; font:500 9.5px 'JetBrains Mono', monospace; }
    .ug-track { stroke:rgba(124,140,255,.16); stroke-width:2; stroke-linecap:round; }
    .ug-gap { stroke:#f97362; stroke-linecap:round; opacity:.5; }
    .ug-gap.ug-on { opacity:.85; }
    .ug-dot-verdict { fill:#22d3ee; stroke:#05070d; stroke-width:1.4; }
    .ug-dot-attack { fill:#f97362; stroke:#05070d; stroke-width:1.4; }
    .ug-dotlab { font:700 10px 'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .ug-dotlab.ug-v { fill:#22d3ee; }
    .ug-dotlab.ug-a { fill:#ffb3a8; }
    .ug-scope { fill:url(#ug-hatch); stroke:rgba(245,165,36,.5); stroke-width:1; stroke-dasharray:3 3; }
    .ug-scopelab { fill:#f5a524; font:600 9.5px 'JetBrains Mono', monospace; }
    .ug-rowhit { fill:transparent; cursor:pointer; }
    .ug-node { outline:none; }
    .ug-node:focus-visible .ug-selbox { opacity:1; }
    .ug-selbox { fill:none; stroke:rgba(231,234,243,.55); stroke-width:1.4; rx:8; opacity:0; }
    .ug-selbox.ug-on { opacity:.9; }
    .ug-legend { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }

    .ug-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .ug-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; min-width:0; }
    .ug-name { color:#e7eaf3; font-weight:700; font-size:13px; min-width:0; overflow-wrap:anywhere; }
    .ug-kind { border-radius:5px; padding:2px 7px; font-size:9.5px; letter-spacing:.05em;
      text-transform:uppercase; font-weight:700; }
    .ug-kind.exact { background:rgba(34,211,238,.14); color:#9fe9f5; }
    .ug-kind.approx { background:rgba(249,115,98,.14); color:#ffb3a8; }
    .ug-kind.proof { background:rgba(245,165,36,.14); color:#ffd591; }
    .ug-big { display:flex; gap:14px; flex-wrap:wrap; }
    .ug-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .ug-stat b { color:#e7eaf3; font-size:17px; font-weight:700; }
    .ug-stat b.ug-v { color:#22d3ee; }
    .ug-stat b.ug-a { color:#f97362; }
    .ug-stat b.ug-q { color:#f5a524; }
    .ug-stat span { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .ug-verdict { padding:7px 10px; border-radius:8px; font-size:11px; line-height:1.5; min-width:0; overflow-wrap:anywhere; }
    .ug-verdict.ug-safe { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .ug-verdict.ug-bad { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .ug-verdict.ug-warn { background:rgba(245,165,36,.1); color:#ffd591; border:1px solid rgba(245,165,36,.24); }
    .ug-src { color:#5b6378; font-size:10px; min-width:0; overflow-wrap:anywhere; }
    .ug-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .ug-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Controls: metric segmented toggle ---- */
  const controls = document.createElement('div');
  controls.className = 'ug-controls';
  const cgroup = document.createElement('div');
  cgroup.className = 'ug-cgroup';
  const clab = document.createElement('span');
  clab.textContent = 'metric';
  const segs = document.createElement('div');
  segs.className = 'ug-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'chart metric');
  const METRICS: Array<{ id: Metric; label: string }> = [
    { id: 'auc', label: 'membership inference (AUC)' },
    { id: 'pct', label: '% knowledge recoverable' },
  ];
  const segBtns = METRICS.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ug-seg';
    b.textContent = m.label;
    b.setAttribute('aria-label', m.label);
    b.addEventListener('click', () => {
      metric = m.id;
      render();
    });
    segs.appendChild(b);
    return b;
  });
  cgroup.append(clab, segs);
  controls.append(cgroup);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'ug-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute(
    'aria-label',
    'Membership-inference recoverability of forgotten data per unlearning method: what verification reports versus what a recovery attack gets back',
  );

  // hatch pattern for the "outside the proof's scope" zone
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML =
    '<pattern id="ug-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="7" height="7" fill="rgba(245,165,36,0.05)"/>' +
    '<line x1="0" y1="0" x2="0" y2="7" stroke="rgba(245,165,36,0.28)" stroke-width="1.4"/></pattern>';
  svg.appendChild(defs);

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
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string, w?: number) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    if (w != null) l.setAttribute('stroke-width', String(w));
    gPlot.appendChild(l);
    return l;
  };
  const mkCircle = (g: SVGGElement, cx: number, cy: number, r: number, cls: string) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('class', cls);
    g.appendChild(c);
    return c;
  };
  const mkTextIn = (g: SVGGElement, x: number, y: number, cls: string, text: string, anchor: string) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    g.appendChild(t);
  };

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'ug-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'ug-cap';
  cap.innerHTML =
    'Axis: membership-inference <b>AUC</b> for a record the model was told to forget — <b>0.50</b> = ' +
    'indistinguishable from never-trained (forgotten), <b>1.00</b> = fully identifiable. ' +
    'Left dot = standard verification verdict; right dot = after the Unlearning Mapping Attack; ' +
    'the bar between is residual knowledge. Tap a method or use ← →.';
  caption.appendChild(cap);

  /* ---- Render ---- */
  const nodes: SVGGElement[] = [];
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;

    // header titles
    mkText(X0, 34, 'ug-axis', metric === 'auc' ? 'membership-inference AUC of a “forgotten” record' : 'knowledge an attack can recover (% of original)');

    // vertical gridlines + tick labels (top)
    for (const t of TICKS) {
      const x = X0 + t * (X1 - X0);
      mkLine(x, Y_TOP - 6, x, Y_BASE, 'ug-grid');
      mkText(x, Y_TOP - 12, 'ug-axislab', fmtTick(t, metric), 'middle');
    }
    // forgotten / recovered anchors under the axis
    mkText(X0, Y_BASE + 22, 'ug-axislab', '← forgotten', 'start');
    mkText(X1, Y_BASE + 22, 'ug-axislab', 'still recoverable →', 'end');

    // rows
    METHODS.forEach((m, i) => {
      const y = rowY(i);
      const on = i === sel;
      const xv = xOf(m.verdict);

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'ug-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const recoverTxt = m.uncertified
        ? 'recovery uncertified — outside the proof’s scope'
        : `attack recovers ${fmtVal(m.attack as number, metric)}`;
      g.setAttribute('aria-label', `${m.label}: verdict ${fmtVal(m.verdict, metric)}, ${recoverTxt}`);

      // selection box behind the row
      const selbox = document.createElementNS(NS, 'rect');
      selbox.setAttribute('class', `ug-selbox${on ? ' ug-on' : ''}`);
      selbox.setAttribute('x', String(12));
      selbox.setAttribute('y', String(y - ROW_H / 2 + 5));
      selbox.setAttribute('width', String(X1 - 12 + 16));
      selbox.setAttribute('height', String(ROW_H - 10));
      selbox.setAttribute('rx', '8');
      g.appendChild(selbox);

      // method label + cost sub-label (left)
      const lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', String(X0 - 16));
      lab.setAttribute('y', String(y - 2));
      lab.setAttribute('text-anchor', 'end');
      lab.setAttribute('class', `ug-rowlab${on ? ' ug-on' : ''}`);
      lab.textContent = m.label;
      g.appendChild(lab);
      const sub = document.createElementNS(NS, 'text');
      sub.setAttribute('x', String(X0 - 16));
      sub.setAttribute('y', String(y + 12));
      sub.setAttribute('text-anchor', 'end');
      sub.setAttribute('class', 'ug-rowsub');
      sub.textContent = m.kind === 'exact' ? 'exact' : m.kind === 'proof' ? 'proof-backed' : 'approximate';
      g.appendChild(sub);

      // track
      const track = document.createElementNS(NS, 'line');
      track.setAttribute('x1', String(X0));
      track.setAttribute('y1', String(y));
      track.setAttribute('x2', String(X1));
      track.setAttribute('y2', String(y));
      track.setAttribute('class', 'ug-track');
      g.appendChild(track);

      if (m.uncertified) {
        // hatched "outside the proof's scope" zone from verdict to right edge
        const zone = document.createElementNS(NS, 'rect');
        zone.setAttribute('class', 'ug-scope');
        zone.setAttribute('x', String(xv));
        zone.setAttribute('y', String(y - 13));
        zone.setAttribute('width', String(Math.max(0, X1 - xv)));
        zone.setAttribute('height', '26');
        zone.setAttribute('rx', '4');
        g.appendChild(zone);
        mkTextIn(g, (xv + X1) / 2, y + 3.5, 'ug-scopelab', 'outside the proof’s scope', 'middle');
      } else if (m.attack != null) {
        const xa = xOf(m.attack);
        // gap bar
        const gap = document.createElementNS(NS, 'line');
        gap.setAttribute('x1', String(xv));
        gap.setAttribute('y1', String(y));
        gap.setAttribute('x2', String(xa));
        gap.setAttribute('y2', String(y));
        gap.setAttribute('class', `ug-gap${on ? ' ug-on' : ''}`);
        gap.setAttribute('stroke-width', on ? '11' : '9');
        g.appendChild(gap);

        // attack dot + label
        mkCircle(g, xa, y, on ? 7 : 5.5, 'ug-dot-attack');
        if (Math.abs(xa - xv) > 30) mkTextIn(g, xa, y - 13, 'ug-dotlab ug-a', fmtVal(m.attack, metric), 'middle');
      }

      // verdict dot + label
      mkCircle(g, xv, y, on ? 7 : 5.5, 'ug-dot-verdict');
      mkTextIn(g, xv, y + 21, 'ug-dotlab ug-v', fmtVal(m.verdict, metric), xv < X0 + 40 ? 'start' : 'middle');

      // full-row hit target
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('class', 'ug-rowhit');
      hit.setAttribute('x', '0');
      hit.setAttribute('y', String(y - ROW_H / 2));
      hit.setAttribute('width', String(VB_W));
      hit.setAttribute('height', String(ROW_H));
      g.appendChild(hit);

      const select = () => {
        sel = i;
        render();
      };
      g.addEventListener('click', select);
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
      gPlot.appendChild(g);
      nodes.push(g);
    });

    // legend (below the forgotten/recoverable axis anchors)
    const ly = Y_BASE + 40;
    const lc1 = document.createElementNS(NS, 'circle');
    lc1.setAttribute('cx', String(X0 + 168)); lc1.setAttribute('cy', String(ly - 3.5));
    lc1.setAttribute('r', '4'); lc1.setAttribute('class', 'ug-dot-verdict');
    gPlot.appendChild(lc1);
    mkText(X0 + 178, ly, 'ug-legend', 'verification verdict', 'start');
    const lc2 = document.createElementNS(NS, 'circle');
    lc2.setAttribute('cx', String(X0 + 318)); lc2.setAttribute('cy', String(ly - 3.5));
    lc2.setAttribute('r', '4'); lc2.setAttribute('class', 'ug-dot-attack');
    gPlot.appendChild(lc2);
    mkText(X0 + 328, ly, 'ug-legend', 'after recovery attack', 'start');

    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(METRICS[i].id === metric)));
    renderPanel();
  }

  function renderPanel() {
    const m = METHODS[sel];
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'ug-hd';
    const name = document.createElement('span');
    name.className = 'ug-name';
    name.textContent = m.label;
    const kind = document.createElement('span');
    kind.className = `ug-kind ${m.kind}`;
    kind.textContent = m.kind === 'exact' ? 'exact' : m.kind === 'proof' ? 'proof-backed' : 'approximate';
    hd.append(name, kind);

    const big = document.createElement('div');
    big.className = 'ug-big';
    const stat = (val: string, lab: string, extra = '') => {
      const d = document.createElement('div');
      d.className = 'ug-stat';
      const b = document.createElement('b');
      if (extra) b.className = extra;
      b.textContent = val;
      const sp = document.createElement('span');
      sp.textContent = lab;
      d.append(b, sp);
      return d;
    };
    big.append(stat(fmtVal(m.verdict, metric), 'verification verdict', 'ug-v'));
    if (m.uncertified) {
      big.append(stat('—', 'after attack', 'ug-q'));
    } else if (m.attack != null) {
      big.append(stat(fmtVal(m.attack, metric), 'after attack', 'ug-a'));
      const gapVal = metric === 'auc' ? (m.attack - m.verdict).toFixed(2) : `${Math.round(pctRecover(m.attack) - pctRecover(m.verdict))} pts`;
      big.append(stat(gapVal, 'the gap'));
    }
    big.append(stat(m.cost, 'cost'));

    const verdict = document.createElement('div');
    let vcls = 'ug-safe';
    if (m.kind === 'approx') vcls = 'ug-bad';
    else if (m.kind === 'proof') vcls = 'ug-warn';
    verdict.className = `ug-verdict ${vcls}`;
    verdict.textContent = m.note;

    const src = document.createElement('div');
    src.className = 'ug-src';
    src.textContent = `source: ${m.source}`;

    readout.append(hd, big, verdict, src);
  }

  // arrow-key cycling across methods
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      sel = (sel + 1) % METHODS.length;
      render();
      nodes[sel]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      sel = (sel - 1 + METHODS.length) % METHODS.length;
      render();
      nodes[sel]?.focus();
      e.preventDefault();
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
