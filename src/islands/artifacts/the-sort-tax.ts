/**
 * Artifact: the-sort-tax — The Sort Tax
 * Manifest: content/artifacts/the-sort-tax/manifest.json
 *
 * Proving that an agent's top-k retrieval is the TRUE nearest-neighbour result of
 * a committed corpus naively means proving a sort over every scanned candidate.
 * V3DB (arXiv:2603.03065) shows you don't have to: commit the snapshot, then prove
 * a boundary — the k-th returned distance dominates every non-returned candidate —
 * via multiset equality/inclusion instead of an in-circuit sort. That drops the
 * factor of k from the dominant term.
 *
 * The chart models the prover's in-circuit COMPARISON count (the paper's own
 * asymptotics) as a function of top-k:
 *
 *   C            = nprobe · (N / nlist)        // per-query scanned candidates
 *   sort   (k)   = nprobe · nlist + k · C      // baseline: in-circuit sort
 *   boundary     = nlist        + C            // V3DB: multiset + boundary, flat in k
 *
 * The boundary line is flat; the sort line rises linearly with k. The wedge
 * between them is the "sort tax" you skip. Presets are V3DB's ZK-optimized index
 * configs (data.json). The panel separates this modeled comparison-count ratio
 * from the paper's MEASURED net 22× (which still pays the commitment/lookup
 * machinery the model abstracts away). Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/the-sort-tax/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Preset {
  id: string;
  label: string;
  corpus: string;
  N: number;
  dim: number;
  nlist: number;
  nprobe: number;
  defaultK: number;
  subquantizers: number;
}
const PRESETS = data.presets as Preset[];
const MEAS = data.measured;

const candOf = (p: Preset) => p.nprobe * (p.N / p.nlist);
const boundaryOf = (p: Preset) => p.nlist + candOf(p);
const sortOf = (p: Preset, k: number) => p.nprobe * p.nlist + k * candOf(p);

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 470;
const X0 = 74;
const X1 = 794;
const Y_TOP = 40;
const Y_BASE = 392;

/* domains (log) */
const KMIN = 1;
const KMAX = 1e4;
const NMIN = 2e3; // comparisons axis
const NMAX = 1.2e9;
const LKX0 = Math.log10(KMIN);
const LKX1 = Math.log10(KMAX);
const LNY0 = Math.log10(NMIN);
const LNY1 = Math.log10(NMAX);
const xOf = (k: number) => X0 + ((Math.log10(Math.max(KMIN, k)) - LKX0) / (LKX1 - LKX0)) * (X1 - X0);
const yOf = (n: number) => {
  const ln = Math.log10(Math.max(NMIN, Math.min(NMAX, n)));
  return Y_BASE - ((ln - LNY0) / (LNY1 - LNY0)) * (Y_BASE - Y_TOP);
};
/* slider position t in [0,1] -> k on the log axis */
const kFromT = (t: number) => Math.round(10 ** (LKX0 + t * (LKX1 - LKX0)));
const tFromK = (k: number) => (Math.log10(k) - LKX0) / (LKX1 - LKX0);

/* --- Formatters --- */
function fmtN(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2).replace(/\.?0+$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

export default function mount(container: HTMLElement): () => void {
  let presetIdx = 0;
  let k = PRESETS[0].defaultK;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .st-controls { display:flex; align-items:flex-end; gap:14px 22px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .st-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .st-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .st-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .st-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.03em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .st-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .st-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .st-slidergroup { flex:1 1 220px; min-width:180px; }
    .st-srow { display:flex; align-items:baseline; gap:8px; }
    .st-krange { width:100%; accent-color:#5b8cff; cursor:pointer; margin:6px 0 0; }
    .st-krange:focus-visible { outline:2px solid #5b8cff; outline-offset:3px; }
    .st-chartwrap { position:absolute; inset:0; min-height:170px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .st-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .st-grid { stroke:rgba(124,140,255,.1); }
    .st-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .st-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .st-tax { fill:rgba(249,115,98,.1); }
    .st-sort { fill:none; stroke:#f97362; stroke-width:2.4; }
    .st-bound { fill:none; stroke:#22d3ee; stroke-width:2.4; }
    .st-curvelab { font:600 10.5px 'JetBrains Mono', monospace; }
    .st-lab-sort { fill:#f97362; }
    .st-lab-bound { fill:#22d3ee; }
    .st-mark { stroke:#5b8cff; stroke-width:1.4; stroke-dasharray:4 4; }
    .st-defmark { stroke:rgba(141,149,173,.5); stroke-width:1; stroke-dasharray:2 4; }
    .st-deflab { fill:#8d95ad; font:600 9.5px 'JetBrains Mono', monospace; }
    .st-dot { stroke:#05070d; stroke-width:1.5; }
    .st-dot-sort { fill:#f97362; }
    .st-dot-bound { fill:#22d3ee; }
    .st-taxlab { fill:#ffb3a8; font:700 11px 'JetBrains Mono', monospace; }
    .st-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .st-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .st-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .st-cfg { color:#5b6378; font-size:10.5px; overflow-wrap:anywhere; }
    .st-big { display:flex; gap:14px 18px; flex-wrap:wrap; }
    .st-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .st-stat b { color:#e7eaf3; font-size:17px; font-weight:700; }
    .st-stat b.st-sortc { color:#f97362; }
    .st-stat b.st-boundc { color:#22d3ee; }
    .st-stat span { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .st-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.5; min-width:0; overflow-wrap:anywhere;
      background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .st-verdict b { color:#e7eaf3; }
    .st-meas { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .st-pill { border:1px solid rgba(124,140,255,.2); border-radius:5px; padding:2px 7px; line-height:1.5;
      color:#8d95ad; font-size:10.5px; }
    .st-pill b { color:#e7eaf3; }
    .st-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .st-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Controls: preset segmented + k slider ---- */
  const controls = document.createElement('div');
  controls.className = 'st-controls';

  const pgroup = document.createElement('div');
  pgroup.className = 'st-cgroup';
  const plab = document.createElement('span');
  plab.textContent = 'committed corpus (V3DB index)';
  const segs = document.createElement('div');
  segs.className = 'st-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'corpus preset');
  const segBtns: HTMLButtonElement[] = PRESETS.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'st-seg';
    b.textContent = p.label;
    b.setAttribute('aria-label', `${p.label}, ${p.corpus}`);
    b.addEventListener('click', () => {
      presetIdx = i;
      k = PRESETS[i].defaultK;
      krange.value = String(Math.round(tFromK(k) * 1000));
      render();
    });
    segs.appendChild(b);
    return b;
  });
  pgroup.append(plab, segs);

  const sgroup = document.createElement('div');
  sgroup.className = 'st-cgroup st-slidergroup';
  const slab = document.createElement('span');
  slab.id = 'st-klabel';
  const srow = document.createElement('div');
  srow.className = 'st-srow';
  const krange = document.createElement('input');
  krange.type = 'range';
  krange.className = 'st-krange';
  krange.min = '0';
  krange.max = '1000';
  krange.step = '1';
  krange.value = String(Math.round(tFromK(k) * 1000));
  krange.setAttribute('aria-labelledby', 'st-klabel');
  krange.addEventListener('input', () => {
    k = Math.max(1, kFromT(Number(krange.value) / 1000));
    render();
  });
  srow.append(krange);
  sgroup.append(slab, srow);

  controls.append(pgroup, sgroup);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'st-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
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
  const mkDot = (cx: number, cy: number, cls: string) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', '5');
    c.setAttribute('class', cls);
    gPlot.appendChild(c);
  };

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'st-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'st-cap';
  cap.innerHTML =
    'Prover work modelled as in-circuit comparisons (V3DB asymptotics): ' +
    'sort <b>= nprobe·nlist + k·C</b> vs boundary <b>= nlist + C</b>, with ' +
    '<b>C = nprobe·(N/nlist)</b> scanned candidates. The boundary proof is flat in k; ' +
    'the wedge is the sort tax it skips. Pick a corpus, drag top-k. ' +
    "The measured pill is V3DB's reported net speedup (it still pays the commitment/lookup proof the model omits).";
  caption.appendChild(cap);

  /* ---- Render ---- */
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const p = PRESETS[presetIdx];
    const boundary = boundaryOf(p);

    // y title + gridlines (comparisons, log)
    mkText(X0 - 8, 26, 'st-axis', 'prover comparisons (∝ circuit gates)');
    for (let e = Math.ceil(LNY0); e <= Math.floor(LNY1); e++) {
      const y = yOf(10 ** e);
      mkLine(X0, y, X1, y, 'st-grid');
      mkText(X0 - 8, y + 3.5, 'st-axislab', `10${sup(e)}`, 'end');
    }

    // x baseline + ticks (k, log)
    mkLine(X0, Y_BASE, X1, Y_BASE, 'st-grid');
    for (let e = 0; e <= 4; e++) {
      const kk = 10 ** e;
      const x = xOf(kk);
      mkLine(x, Y_TOP, x, Y_BASE, 'st-grid');
      mkText(x, Y_BASE + 17, 'st-axislab', String(kk), 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'st-axis', 'top-k documents retrieved (log)', 'middle');

    // sort-tax wedge (area between boundary and sort curve)
    const steps = 120;
    const top: string[] = [];
    const bot: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const lk = LKX0 + (i / steps) * (LKX1 - LKX0);
      const kk = 10 ** lk;
      top.push(`${i ? 'L' : 'M'}${xOf(kk).toFixed(1)},${yOf(sortOf(p, kk)).toFixed(1)}`);
    }
    for (let i = steps; i >= 0; i--) {
      const lk = LKX0 + (i / steps) * (LKX1 - LKX0);
      const kk = 10 ** lk;
      bot.push(`L${xOf(kk).toFixed(1)},${yOf(boundary).toFixed(1)}`);
    }
    const wedge = document.createElementNS(NS, 'path');
    wedge.setAttribute('d', top.join('') + bot.join('') + 'Z');
    wedge.setAttribute('class', 'st-tax');
    gPlot.appendChild(wedge);

    // boundary curve (flat)
    const yb = yOf(boundary);
    const bound = document.createElementNS(NS, 'path');
    bound.setAttribute('d', `M${xOf(KMIN).toFixed(1)},${yb.toFixed(1)}L${xOf(KMAX).toFixed(1)},${yb.toFixed(1)}`);
    bound.setAttribute('class', 'st-bound');
    gPlot.appendChild(bound);

    // sort curve
    const sortPts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const lk = LKX0 + (i / steps) * (LKX1 - LKX0);
      const kk = 10 ** lk;
      sortPts.push(`${i ? 'L' : 'M'}${xOf(kk).toFixed(1)},${yOf(sortOf(p, kk)).toFixed(1)}`);
    }
    const sortPath = document.createElementNS(NS, 'path');
    sortPath.setAttribute('d', sortPts.join(''));
    sortPath.setAttribute('class', 'st-sort');
    gPlot.appendChild(sortPath);

    // curve labels
    mkText(xOf(KMAX) - 4, yOf(sortOf(p, KMAX)) - 8, 'st-curvelab st-lab-sort', 'in-circuit sort  k·C', 'end');
    mkText(xOf(KMAX) - 4, yb - 8, 'st-curvelab st-lab-bound', 'boundary proof  C', 'end');

    // default-k marker
    const xd = xOf(p.defaultK);
    mkLine(xd, Y_TOP, xd, Y_BASE, 'st-defmark');
    mkText(xd, Y_TOP - 4, 'st-deflab', `paper k=${p.defaultK}`, 'middle');

    // current-k marker + dots
    const xk = xOf(k);
    const ys = yOf(sortOf(p, k));
    mkLine(xk, Math.min(ys, yb) - 2, xk, Y_BASE, 'st-mark');
    mkDot(xk, yb, 'st-dot st-dot-bound');
    mkDot(xk, ys, 'st-dot st-dot-sort');

    // tax label at the wedge midpoint for current k
    const ratio = sortOf(p, k) / boundary;
    if (ratio > 1.4) {
      const ymid = (ys + yb) / 2;
      const anchor = xk > X1 - 150 ? 'end' : 'start';
      const lx = anchor === 'end' ? xk - 8 : xk + 8;
      mkText(lx, ymid + 3, 'st-taxlab', `${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}× tax`, anchor);
    }

    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === presetIdx)));
    svg.setAttribute(
      'aria-label',
      `${p.label}: at top-k ${k}, the in-circuit sort proof needs ${fmtN(sortOf(p, k))} comparisons versus ${fmtN(boundary)} for the boundary proof, about a ${Math.round(ratio)} times reduction in this term.`,
    );
    slab.textContent = `top-k = ${k.toLocaleString()}`;
    renderPanel();
  }

  function renderPanel() {
    const p = PRESETS[presetIdx];
    const C = candOf(p);
    const boundary = boundaryOf(p);
    const sort = sortOf(p, k);
    const ratio = sort / boundary;
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'st-hd';
    const name = document.createElement('span');
    name.className = 'st-name';
    name.textContent = p.label;
    const cfg = document.createElement('span');
    cfg.className = 'st-cfg';
    cfg.textContent = `${p.corpus} · D=${p.dim} · nlist ${p.nlist.toLocaleString()} · nprobe ${p.nprobe} · C≈${fmtN(C)}`;
    hd.append(name, cfg);

    const big = document.createElement('div');
    big.className = 'st-big';
    const stat = (val: string, lab: string, extra = '') => {
      const d = document.createElement('div');
      d.className = 'st-stat';
      const b = document.createElement('b');
      if (extra) b.className = extra;
      b.textContent = val;
      const sp = document.createElement('span');
      sp.textContent = lab;
      d.append(b, sp);
      return d;
    };
    big.append(
      stat(fmtN(sort), 'sort proof', 'st-sortc'),
      stat(fmtN(boundary), 'boundary proof', 'st-boundc'),
      stat(`${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio).toLocaleString()}×`, `fewer @ k=${k.toLocaleString()}`),
    );

    const verdict = document.createElement('div');
    verdict.className = 'st-verdict';
    verdict.innerHTML =
      `Proving the k-th distance is a <b>boundary</b> over the same ${fmtN(C)} scanned candidates ` +
      `replaces the sort: the proof stops growing with k while the sort proof climbs ${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}× higher.`;

    const meas = document.createElement('div');
    meas.className = 'st-meas';
    const pill = (html: string) => {
      const s = document.createElement('span');
      s.className = 'st-pill';
      s.innerHTML = html;
      return s;
    };
    meas.append(
      pill(`measured: <b>${MEAS.provingSpeedup}× faster</b> proving`),
      pill(`<b>${MEAS.memReductionPct}%</b> less memory`),
      pill(`${MEAS.system} · <b>${MEAS.verify}</b> verify`),
    );

    readout.append(hd, big, verdict, meas);
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
