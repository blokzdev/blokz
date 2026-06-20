/**
 * Artifact: nonlinearity-tax — The Nonlinearity Tax
 * Manifest: content/artifacts/nonlinearity-tax/manifest.json
 *
 * Running a transformer under two-party secure computation (2PC) is dominated not
 * by the big matrix multiplies but by the *nonlinear* activations — Softmax and
 * GELU — because every comparison, exponential, and reciprocal inside them must be
 * evaluated obliviously through many interaction rounds of oblivious transfer.
 *
 * The chart stacks the per-operation cost of ONE BERT-base transformer block for
 * three protocols (Iron → BumbleBee → Nimbus). Four thin linear slivers sit at the
 * bottom; the two warm nonlinear blocks crown each bar. Toggle between communication
 * (megabytes) and interaction rounds — on a WAN, rounds × round-trip is the latency,
 * and the nonlinear share climbs even higher. Numbers are Nimbus Table 3 (data.json).
 * Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/nonlinearity-tax/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

type Metric = 'comm' | 'rounds';
interface Op { id: string; label: string; kind: 'linear' | 'nonlinear' }
interface Proto {
  id: string;
  label: string;
  venue: string;
  comm: Record<string, number>;
  rounds: Record<string, number>;
}
const OPS = data.operations as Op[];
const PROTOS = data.protocols as Proto[];
const FM = data.fullModel;

/* Stack order, bottom → top: linear projections first, nonlinear on top. */
const ORDER = ['linqkv', 'lino', 'linh1', 'linh2', 'gelu', 'softmax'];
const OP = (id: string) => OPS.find((o) => o.id === id)!;
const COLOR: Record<string, string> = {
  linqkv: '#2f4eb0',
  lino: '#3a63d6',
  linh1: '#4f7df0',
  linh2: '#74a3ff',
  gelu: '#f5a524',
  softmax: '#f97362',
};

const valOf = (p: Proto, opId: string, m: Metric) => (m === 'comm' ? p.comm : p.rounds)[opId];
const sumKind = (p: Proto, kind: 'linear' | 'nonlinear', m: Metric) =>
  ORDER.filter((id) => OP(id).kind === kind).reduce((s, id) => s + valOf(p, id, m), 0);
const totalOf = (p: Proto, m: Metric) => ORDER.reduce((s, id) => s + valOf(p, id, m), 0);

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 820;
const VB_H = 470;
const X0 = 74;
const X1 = 792;
const Y_TOP = 46;
const Y_BASE = 398;
const BAR_W = 118;

function niceMax(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s >= n) ?? 10;
  return step * pow;
}
const fmtMB = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GB` : `${v < 10 ? v.toFixed(1) : Math.round(v)} MB`);
const fmtVal = (v: number, m: Metric) => (m === 'comm' ? fmtMB(v) : `${Math.round(v)}`);

export default function mount(container: HTMLElement): () => void {
  let metric: Metric = 'comm';
  let sel = 1; // BumbleBee selected by default

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .nt-controls { display:flex; align-items:center; gap:12px 20px; flex-wrap:wrap; max-width:100%; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .nt-cgroup { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .nt-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .nt-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .nt-seg { appearance:none; border:1px solid rgba(124,140,255,.16); border-radius:8px; background:transparent;
      color:#5b6378; font:600 11px 'JetBrains Mono', monospace; letter-spacing:.03em; padding:7px 13px; cursor:pointer;
      transition:color .2s, background .2s, border-color .2s; }
    .nt-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .nt-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .nt-hint { font-size:10.5px; color:#5b6378; min-width:0; }
    .nt-chartwrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; }
    .nt-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .nt-chartwrap svg:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; border-radius:12px; }
    .nt-grid { stroke:rgba(124,140,255,.1); }
    .nt-axis { fill:#8d95ad; font:500 11px 'JetBrains Mono', monospace; }
    .nt-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .nt-bargrp { cursor:pointer; }
    .nt-seg-rect { stroke:#0d1322; stroke-width:1; transition:opacity .2s; }
    .nt-plabel { fill:#8d95ad; font:600 12px 'JetBrains Mono', monospace; }
    .nt-plabel.sel { fill:#e7eaf3; }
    .nt-pvenue { fill:#5b6378; font:500 9.5px 'JetBrains Mono', monospace; }
    .nt-total { fill:#e7eaf3; font:700 13px 'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .nt-nlmark { stroke:#f97362; stroke-width:1.3; stroke-dasharray:4 4; opacity:.85; }
    .nt-nllab { fill:#ffb3a8; font:700 10.5px 'JetBrains Mono', monospace; }
    .nt-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .nt-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .nt-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .nt-venue { color:#5b6378; font-size:10.5px; }
    .nt-big { display:flex; gap:14px 20px; flex-wrap:wrap; }
    .nt-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .nt-stat b { color:#e7eaf3; font-size:18px; font-weight:700; }
    .nt-stat b.warm { color:#f97362; }
    .nt-stat span { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .nt-legend { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .nt-lrow { display:flex; align-items:center; gap:8px; min-width:0; }
    .nt-sw { width:11px; height:11px; border-radius:3px; flex:none; }
    .nt-lname { color:#aeb6cc; min-width:0; overflow-wrap:anywhere; }
    .nt-lval { margin-left:auto; color:#e7eaf3; flex:none; padding-left:8px; }
    .nt-lkind { color:#5b6378; font-size:9.5px; padding-left:6px; flex:none; }
    .nt-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.5; min-width:0; overflow-wrap:anywhere;
      background:rgba(249,115,98,.1); color:#ffc7bf; border:1px solid rgba(249,115,98,.22); }
    .nt-verdict b { color:#fff0ed; }
    .nt-meas { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .nt-pill { border:1px solid rgba(124,140,255,.2); border-radius:5px; padding:2px 7px; line-height:1.5; color:#8d95ad; font-size:10.5px; }
    .nt-pill b { color:#e7eaf3; }
    .nt-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .nt-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Controls: metric toggle ---- */
  const controls = document.createElement('div');
  controls.className = 'nt-controls';
  const mgroup = document.createElement('div');
  mgroup.className = 'nt-cgroup';
  const mlab = document.createElement('span');
  mlab.textContent = 'cost metric (per transformer block)';
  const segs = document.createElement('div');
  segs.className = 'nt-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'cost metric');
  const metricBtns: Record<Metric, HTMLButtonElement> = {} as Record<Metric, HTMLButtonElement>;
  ([['comm', 'communication (MB)'], ['rounds', 'interaction rounds']] as [Metric, string][]).forEach(([m, lbl]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-seg';
    b.textContent = lbl;
    b.addEventListener('click', () => { metric = m; render(); });
    segs.appendChild(b);
    metricBtns[m] = b;
  });
  mgroup.append(mlab, segs);
  const hint = document.createElement('span');
  hint.className = 'nt-hint';
  hint.textContent = 'tap a protocol bar · ← → to compare';
  controls.append(mgroup, hint);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'nt-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', 'Per-operation cost of one BERT-base transformer block under three secure-inference protocols.');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { sel = (sel + 1) % PROTOS.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { sel = (sel - 1 + PROTOS.length) % PROTOS.length; render(); e.preventDefault(); }
  });

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
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    gPlot.appendChild(l);
  };

  /* ---- Panel + caption ---- */
  const readout = document.createElement('div');
  readout.className = 'nt-readout';
  panel.appendChild(readout);

  const cap = document.createElement('div');
  cap.className = 'nt-cap';
  cap.innerHTML =
    'One BERT-base encoder block, two-party secure inference. Bars stack four linear weight ' +
    'projections (cool) under the two nonlinear activations <b>GELU</b> and <b>Softmax</b> (warm). ' +
    'Communication in MB; rounds = sequential oblivious-transfer interactions (≈ latency × round-trips on a WAN). ' +
    'Source: Nimbus, Table 3.';
  caption.appendChild(cap);

  /* ---- Render ---- */
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const axisMax = niceMax(Math.max(...PROTOS.map((p) => totalOf(p, metric))) * 1.04);
    const yOf = (v: number) => Y_BASE - (v / axisMax) * (Y_BASE - Y_TOP);

    // y axis title + gridlines
    mkText(X0 - 6, 30, 'nt-axis', metric === 'comm' ? 'communication per block (MB)' : 'interaction rounds per block');
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = (axisMax / ticks) * i;
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'nt-grid');
      mkText(X0 - 8, y + 3.5, 'nt-axislab', metric === 'comm' ? fmtMB(v) : String(Math.round(v)), 'end');
    }
    mkLine(X0, Y_BASE, X1, Y_BASE, 'nt-grid');

    // bars
    const slot = (X1 - X0) / PROTOS.length;
    PROTOS.forEach((p, pi) => {
      const cx = X0 + slot * (pi + 0.5);
      const bx = cx - BAR_W / 2;
      const isSel = pi === sel;
      const grp = document.createElementNS(NS, 'g');
      grp.setAttribute('class', 'nt-bargrp');
      grp.addEventListener('pointerdown', () => { sel = pi; render(); });

      let acc = 0;
      ORDER.forEach((id) => {
        const v = valOf(p, id, metric);
        const y1 = yOf(acc);
        const y0 = yOf(acc + v);
        acc += v;
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(bx));
        r.setAttribute('y', String(y0));
        r.setAttribute('width', String(BAR_W));
        r.setAttribute('height', String(Math.max(0, y1 - y0)));
        r.setAttribute('fill', COLOR[id]);
        r.setAttribute('class', 'nt-seg-rect');
        r.setAttribute('opacity', isSel ? '1' : '0.5');
        const title = document.createElementNS(NS, 'title');
        title.textContent = `${OP(id).label}: ${fmtVal(v, metric)}`;
        r.appendChild(title);
        grp.appendChild(r);
      });
      gPlot.appendChild(grp);

      // nonlinear boundary marker on selected bar
      if (isSel) {
        const lin = sumKind(p, 'linear', metric);
        const nl = sumKind(p, 'nonlinear', metric);
        const yb = yOf(lin);
        const ml = document.createElementNS(NS, 'line');
        ml.setAttribute('x1', String(bx - 8)); ml.setAttribute('y1', String(yb));
        ml.setAttribute('x2', String(bx + BAR_W + 8)); ml.setAttribute('y2', String(yb));
        ml.setAttribute('class', 'nt-nlmark');
        gPlot.appendChild(ml);
        const share = Math.round((nl / (lin + nl)) * 100);
        mkText(bx + BAR_W / 2, yOf(lin + nl) - 22, 'nt-nllab', `↑ nonlinear ${share}%`, 'middle');
      }

      // total above bar
      mkText(cx, yOf(totalOf(p, metric)) - 8, 'nt-total', fmtVal(totalOf(p, metric), metric), 'middle');
      // protocol label + venue below baseline
      mkText(cx, Y_BASE + 20, `nt-plabel${isSel ? ' sel' : ''}`, p.label, 'middle');
      mkText(cx, Y_BASE + 34, 'nt-pvenue', p.venue, 'middle');
    });

    metricBtns.comm.setAttribute('aria-pressed', String(metric === 'comm'));
    metricBtns.rounds.setAttribute('aria-pressed', String(metric === 'rounds'));
    const sp = PROTOS[sel];
    svg.setAttribute('aria-label',
      `${sp.label}: one BERT-base block costs ${fmtVal(totalOf(sp, metric), metric)} of ${metric === 'comm' ? 'communication' : 'interaction rounds'}; ` +
      `${Math.round((sumKind(sp, 'nonlinear', metric) / totalOf(sp, metric)) * 100)} percent is the nonlinear Softmax and GELU activations.`);
    renderPanel();
  }

  function renderPanel() {
    const p = PROTOS[sel];
    const lin = sumKind(p, 'linear', metric);
    const nl = sumKind(p, 'nonlinear', metric);
    const tot = lin + nl;
    const share = Math.round((nl / tot) * 100);
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'nt-hd';
    const name = document.createElement('span');
    name.className = 'nt-name';
    name.textContent = p.label;
    const venue = document.createElement('span');
    venue.className = 'nt-venue';
    venue.textContent = p.venue;
    hd.append(name, venue);

    const big = document.createElement('div');
    big.className = 'nt-big';
    const stat = (val: string, lab: string, warm = false) => {
      const d = document.createElement('div');
      d.className = 'nt-stat';
      const b = document.createElement('b');
      if (warm) b.className = 'warm';
      b.textContent = val;
      const s = document.createElement('span');
      s.textContent = lab;
      d.append(b, s);
      return d;
    };
    big.append(
      stat(fmtVal(tot, metric), metric === 'comm' ? 'total / block' : 'rounds / block'),
      stat(`${share}%`, 'nonlinear share', true),
    );

    const legend = document.createElement('div');
    legend.className = 'nt-legend';
    ORDER.slice().reverse().forEach((id) => {
      const op = OP(id);
      const row = document.createElement('div');
      row.className = 'nt-lrow';
      const sw = document.createElement('span');
      sw.className = 'nt-sw';
      sw.style.background = COLOR[id];
      const nm = document.createElement('span');
      nm.className = 'nt-lname';
      nm.textContent = op.label;
      const kind = document.createElement('span');
      kind.className = 'nt-lkind';
      kind.textContent = op.kind === 'nonlinear' ? 'nonlinear' : 'linear';
      const val = document.createElement('span');
      val.className = 'nt-lval';
      val.textContent = fmtVal(valOf(p, id, metric), metric);
      row.append(sw, nm, kind, val);
      legend.appendChild(row);
    });

    const verdict = document.createElement('div');
    verdict.className = 'nt-verdict';
    verdict.innerHTML =
      `<b>Softmax + GELU</b> carry <b>${share}%</b> of this block's ${metric === 'comm' ? 'bytes' : 'rounds'} — ` +
      `the four matrix projections, the actual compute, are the thin slivers underneath. ` +
      `The activations are cheap in plaintext and brutal in secret-shared form.`;

    const meas = document.createElement('div');
    meas.className = 'nt-meas';
    const pill = (html: string) => {
      const s = document.createElement('span');
      s.className = 'nt-pill';
      s.innerHTML = html;
      return s;
    };
    meas.append(
      pill(`full BERT-base: <b>${FM.bertBaseCommGB} GB</b> · <b>${FM.bertBaseLanMin} min</b> (LAN)`),
      pill(`LLaMA-7B: <b>${FM.llama7bTokenMin} min</b> / token`),
    );

    readout.append(hd, big, legend, verdict, meas);
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
