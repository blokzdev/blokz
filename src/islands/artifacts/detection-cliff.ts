/**
 * Artifact: detection-cliff — The Detection Cliff
 * Manifest: content/artifacts/detection-cliff/manifest.json
 *
 * How many audit queries it takes to catch a substituted model, as a function of
 * how subtle the swap is. A buyer in a per-token inference market wants to test
 * "am I getting the model I paid for?" by querying the endpoint and a trusted
 * reference and comparing accuracy on a benchmark. The number of probes needed to
 * separate the two at a chosen confidence follows the standard two-proportion
 * sample size:
 *
 *     n ≈ K / Δ²,   K = (z_{1-α/2} + z_power)² · 2·p̄·(1−p̄)
 *
 * at 80% power (z_power = 0.8416) and a baseline accuracy p̄ = 0.6 for the
 * variance term. Δ is the per-query accuracy GAP between genuine and substitute —
 * the measured degradation from real quantization/substitution benchmarks
 * (data.json). Because n ∝ 1/Δ², subtlety is punished quadratically: a whole-model
 * swap is caught in a few hundred probes, but a near-lossless FP8 cast falls off a
 * cliff into hundreds of thousands of probes — past any economic audit budget.
 * That cliff is why decentralized inference markets bond/attest/Proof-of-Quality
 * instead of trying to detect substitution from outputs.
 *
 * Log-log chart. Tap a substitution (or arrow through them) to read its budget;
 * toggle the audit confidence to lift the whole curve. Layout via the shared
 * responsive primitive.
 */
import data from '../../../content/artifacts/detection-cliff/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const Z_POWER = data.zPower;
const PBAR = data.baselineAccuracy;
const CEILING = data.auditCeiling;
const VAR = 2 * PBAR * (1 - PBAR); // variance term in K
const CONF = data.confidence as Array<{ level: number; label: string; zAlpha: number }>;
const SUBS = data.substitutions as Array<{
  id: string;
  label: string;
  delta: number;
  model: string;
  note: string;
}>;

const kOf = (zAlpha: number) => (zAlpha + Z_POWER) ** 2 * VAR;
const nOf = (delta: number, k: number) => k / (delta * delta);

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 470;
const X0 = 70;
const X1 = 794;
const Y_TOP = 44;
const Y_BASE = 392;

/* domains (log) */
const DMIN = 0.0008; // Δ axis
const DMAX = 0.25;
const NMIN = 100; // queries axis
const NMAX = 1e7;
const LDX0 = Math.log10(DMIN);
const LDX1 = Math.log10(DMAX);
const LNY0 = Math.log10(NMIN);
const LNY1 = Math.log10(NMAX);
const xOf = (d: number) => X0 + ((Math.log10(d) - LDX0) / (LDX1 - LDX0)) * (X1 - X0);
const yOf = (n: number) => {
  const ln = Math.log10(Math.max(NMIN, Math.min(NMAX, n)));
  return Y_BASE - ((ln - LNY0) / (LNY1 - LNY0)) * (Y_BASE - Y_TOP);
};

/* --- Formatters --- */
function fmtN(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}
function fmtPct(d: number): string {
  const p = d * 100;
  if (p >= 1) return `${p.toFixed(p >= 10 ? 0 : 1).replace(/\.0$/, '')} pt`;
  return `${p.toPrecision(2).replace(/\.?0+$/, '')} pt`;
}
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

export default function mount(container: HTMLElement): () => void {
  let confIdx = 2; // default 99%
  let sel = SUBS.length - 1; // start on the easiest-to-catch (smaller model)

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .dc-controls { display:flex; align-items:center; gap:10px 16px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .dc-cgroup { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .dc-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .dc-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .dc-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.03em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .dc-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .dc-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .dc-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .dc-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .dc-grid { stroke:rgba(124,140,255,.1); }
    .dc-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .dc-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .dc-curve { fill:none; stroke:#5b8cff; stroke-width:2.2; }
    .dc-ceil { fill:rgba(245,165,36,.07); }
    .dc-ceilline { stroke:#f5a524; stroke-width:1.2; stroke-dasharray:4 4; }
    .dc-ceillab { fill:#f5a524; font:600 10px 'JetBrains Mono', monospace; }
    .dc-pt { stroke:#05070d; stroke-width:1.4; cursor:pointer; }
    .dc-pt-safe { fill:#22d3ee; }
    .dc-pt-blind { fill:#f97362; }
    .dc-hit { fill:transparent; cursor:pointer; }
    .dc-ptlab { fill:#8d95ad; font:600 10px 'JetBrains Mono', monospace; pointer-events:none; }
    .dc-node { outline:none; }
    .dc-node:focus-visible .dc-ring { opacity:1; }
    .dc-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .dc-sel { fill:none; stroke:#e7eaf3; stroke-width:1.6; opacity:.9; }
    .dc-drop { stroke:rgba(231,234,243,.4); stroke-width:1; stroke-dasharray:2 3; }
    .dc-readout { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .dc-readout .dc-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .dc-readout .dc-name { color:#e7eaf3; font-weight:700; font-size:13px; }
    .dc-readout .dc-src { color:#5b6378; font-size:10.5px; }
    .dc-big { display:flex; gap:14px; flex-wrap:wrap; }
    .dc-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .dc-stat b { color:#e7eaf3; font-size:17px; font-weight:700; }
    .dc-stat b.dc-blind { color:#f97362; }
    .dc-stat b.dc-safe { color:#22d3ee; }
    .dc-stat span { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .dc-verdict { padding:7px 10px; border-radius:8px; font-size:11px; line-height:1.45; min-width:0; overflow-wrap:anywhere; }
    .dc-verdict.dc-safe { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .dc-verdict.dc-blind { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .dc-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .dc-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Controls: confidence segmented ---- */
  const controls = document.createElement('div');
  controls.className = 'dc-controls';
  const cgroup = document.createElement('div');
  cgroup.className = 'dc-cgroup';
  const clab = document.createElement('span');
  clab.textContent = 'audit confidence';
  const segs = document.createElement('div');
  segs.className = 'dc-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'audit confidence level');
  const segBtns: HTMLButtonElement[] = CONF.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dc-seg';
    b.textContent = c.label;
    b.setAttribute('aria-label', `confidence ${c.label}`);
    b.addEventListener('click', () => {
      confIdx = i;
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
  chartWrap.className = 'dc-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Audit probes needed to detect a model substitution, versus how subtle the substitution is');
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
  const mkTextInG = (g: SVGGElement, x: number, y: number, cls: string, text: string, anchor: string) => {
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
  readout.className = 'dc-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'dc-cap';
  cap.innerHTML =
    'Each point is a real substitution at its measured accuracy gap Δ. Audit probes to catch it (per arm) ' +
    'follow the two-proportion test <b>n ≈ K/Δ²</b>, K from the confidence + 80% power; ' +
    'a trusted reference run doubles the work. The dashed line is a generous audit budget — ' +
    'points above it cost more to catch than the substitution saves. Tap a point or use ← →.';
  caption.appendChild(cap);

  /* ---- Render ---- */
  const nodes: SVGGElement[] = [];
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;
    const k = kOf(CONF[confIdx].zAlpha);

    // y title + gridlines/ticks (queries, log)
    mkText(X0 - 6, 28, 'dc-axis', 'audit probes to catch the swap');
    for (let e = Math.ceil(LNY0); e <= LNY1; e++) {
      const y = yOf(10 ** e);
      mkLine(X0, y, X1, y, 'dc-grid');
      mkText(X0 - 8, y + 3.5, 'dc-axislab', `10${sup(e)}`, 'end');
    }

    // ceiling band + line
    const yc = yOf(CEILING);
    const band = document.createElementNS(NS, 'rect');
    band.setAttribute('class', 'dc-ceil');
    band.setAttribute('x', String(X0));
    band.setAttribute('y', String(Y_TOP));
    band.setAttribute('width', String(X1 - X0));
    band.setAttribute('height', String(Math.max(0, yc - Y_TOP)));
    gPlot.appendChild(band);
    mkLine(X0, yc, X1, yc, 'dc-ceilline');
    mkText(X1 - 4, yc - 6, 'dc-ceillab', `audit budget ≈ ${fmtN(CEILING)} probes — above = economically invisible`, 'end');

    // x baseline + ticks (Δ, log) — label as percentage points
    mkLine(X0, Y_BASE, X1, Y_BASE, 'dc-grid');
    for (const d of [0.001, 0.01, 0.1]) {
      const x = xOf(d);
      mkLine(x, Y_TOP, x, Y_BASE, 'dc-grid');
      mkText(x, Y_BASE + 17, 'dc-axislab', `${d * 100}%`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'dc-axis', 'accuracy gap Δ between genuine and substitute (log)', 'middle');

    // the n = K/Δ² curve (monotonic, so the in-range portion is one segment)
    const pts: string[] = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const ld = LDX0 + (i / steps) * (LDX1 - LDX0);
      const d = 10 ** ld;
      const n = nOf(d, k);
      if (n < NMIN || n > NMAX) continue;
      pts.push(`${pts.length ? 'L' : 'M'}${xOf(d).toFixed(1)},${yOf(n).toFixed(1)}`);
    }
    const curve = document.createElementNS(NS, 'path');
    curve.setAttribute('d', pts.join(''));
    curve.setAttribute('class', 'dc-curve');
    gPlot.appendChild(curve);
    const labN = nOf(0.0016, k);
    if (labN >= NMIN && labN <= NMAX) mkText(xOf(0.0016) + 6, yOf(labN) - 6, 'dc-axislab', 'n = K / Δ²');

    // selected drop lines (under points)
    const sd = SUBS[sel];
    const sn = nOf(sd.delta, k);
    const sx = xOf(sd.delta);
    const sy = yOf(sn);
    mkLine(sx, sy, sx, Y_BASE, 'dc-drop');
    mkLine(X0, sy, sx, sy, 'dc-drop');

    // substitution points
    SUBS.forEach((s, i) => {
      const n = nOf(s.delta, k);
      const x = xOf(s.delta);
      const y = yOf(n);
      const blind = n > CEILING;

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'dc-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${s.label}: gap ${fmtPct(s.delta)}, ${fmtN(n)} probes to catch at ${CONF[confIdx].label}`);

      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'dc-ring');
      ring.setAttribute('cx', String(x));
      ring.setAttribute('cy', String(y));
      ring.setAttribute('r', '11');
      g.appendChild(ring);

      if (i === sel) {
        const selr = document.createElementNS(NS, 'circle');
        selr.setAttribute('class', 'dc-sel');
        selr.setAttribute('cx', String(x));
        selr.setAttribute('cy', String(y));
        selr.setAttribute('r', '9');
        g.appendChild(selr);
      }

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', `dc-pt ${blind ? 'dc-pt-blind' : 'dc-pt-safe'}`);
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', i === sel ? '5.5' : '4.5');
      g.appendChild(dot);

      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('class', 'dc-hit');
      hit.setAttribute('cx', String(x));
      hit.setAttribute('cy', String(y));
      hit.setAttribute('r', '16');
      g.appendChild(hit);

      // label placement: below the point if near the top, else above
      const above = y > Y_TOP + 40;
      const ly = above ? y - 12 : y + 18;
      const anchor = x > X1 - 130 ? 'end' : x < X0 + 120 ? 'start' : 'middle';
      const lx = anchor === 'end' ? x + 8 : anchor === 'start' ? x - 8 : x;
      mkTextInG(g, lx, ly, 'dc-ptlab', s.label.replace(/ \(.*$/, ''), anchor);

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

    // update segmented buttons
    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === confIdx)));

    renderPanel(k);
  }

  function renderPanel(k: number) {
    const s = SUBS[sel];
    const n = nOf(s.delta, k);
    const blind = n > CEILING;
    const total = n * 2;
    const cls = blind ? 'dc-blind' : 'dc-safe';
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'dc-hd';
    const name = document.createElement('span');
    name.className = 'dc-name';
    name.textContent = s.label;
    const src = document.createElement('span');
    src.className = 'dc-src';
    src.textContent = s.model;
    hd.append(name, src);

    const big = document.createElement('div');
    big.className = 'dc-big';
    const stat = (val: string, lab: string, extra = '') => {
      const d = document.createElement('div');
      d.className = 'dc-stat';
      const b = document.createElement('b');
      if (extra) b.className = extra;
      b.textContent = val;
      const sp = document.createElement('span');
      sp.textContent = lab;
      d.append(b, sp);
      return d;
    };
    big.append(
      stat(fmtPct(s.delta), 'accuracy gap Δ'),
      stat(fmtN(n), `probes @ ${CONF[confIdx].label}`, cls),
      stat(fmtN(total), 'incl. reference'),
    );

    const verdict = document.createElement('div');
    verdict.className = `dc-verdict ${cls}`;
    verdict.textContent = blind
      ? `Off the cliff: catching this needs ${fmtN(n)} probes — past any realistic audit budget. The provider keeps the savings; output auditing can't see it.`
      : `Catchable: ${fmtN(n)} probes is a cheap audit. A buyer — or a staked validator — can run it and prove the swap.`;

    const note = document.createElement('div');
    note.className = 'dc-cap';
    note.innerHTML = `<b>${s.note}</b>`;

    readout.append(hd, big, verdict, note);
  }

  // arrow-key cycling across substitutions (global on svg)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      sel = (sel + 1) % SUBS.length;
      render();
      nodes[sel]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      sel = (sel - 1 + SUBS.length) % SUBS.length;
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
