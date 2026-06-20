/**
 * Artifact: the-privacy-budget — The Privacy Budget
 * Manifest: content/artifacts/the-privacy-budget/manifest.json
 *
 * A data market sells two promises at once: pay you for the *value* your data
 * adds, and *protect* you with differential privacy. This chart shows why a
 * single number — the privacy budget ε — can't keep both.
 *
 * X axis: total privacy budget ε spent on training (log, 0.1 → 50).
 * Y axis: percent, carrying two different quantities deliberately:
 *   • the WARM curve is the rigorous worst-case bound on membership-inference
 *     advantage for an (ε, δ)-DP mechanism — Adv ≤ (e^ε − 1 + 2δ)/(e^ε + 1)
 *     (Humphries et al.). It is essentially 1 by ε ≈ 8.
 *   • the COOL dots are MEASURED DP-SGD test accuracy at the stated ε — what
 *     the buyer is actually paying for. From-scratch models only become usable
 *     out near ε = 8, exactly where the privacy bound has already collapsed.
 *   • small warm dots are the MEASURED empirical attack advantage on CIFAR-10,
 *     sitting far below the worst-case bound — the gap is the only real cover.
 *
 * The reader drags an ε cursor (or taps a reference line / utility dot, or
 * arrows). Reference lines mark deployed budgets: research comfort (ε=1),
 * common ML target (ε=8), Apple's renewed ≈16/day, the 2020 US Census (19.61).
 * Tabs focus one training regime. SVG, no RAF — renders on input. Layout via
 * the shared primitive.
 */
import data from '../../../content/artifacts/the-privacy-budget/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Pt { eps: number; acc: number }
interface Regime { id: string; label: string; model: string; baseline: number; points: Pt[] }
interface Ref { id: string; eps: number; label: string; detail: string }

const CFG = data.config;
const DELTA = CFG.delta;
const REGIMES = data.regimes as Regime[];
const REFS = data.references as Ref[];
const MIA = data.empiricalMia as { label: string; note: string; points: { eps: number; adv: number }[] };

/* worst-case bound on membership-inference advantage, as a percent */
const advBound = (e: number) => ((Math.exp(e) - 1 + 2 * DELTA) / (Math.exp(e) + 1)) * 100;

const NS = 'http://www.w3.org/2000/svg';

/* --- chart geometry (viewBox units) --- */
const VB_W = 840, VB_H = 472;
const X0 = 60, X1 = 770, Y_TOP = 38, Y_BASE = 392;

const EMIN = CFG.epsMin, EMAX = CFG.epsMax;     // ε (x, log)
const le0 = Math.log10(EMIN), le1 = Math.log10(EMAX);
const xOf = (e: number) => X0 + ((Math.log10(e) - le0) / (le1 - le0)) * (X1 - X0);
const yOf = (pct: number) => Y_BASE - (Math.min(Math.max(pct, 0), 100) / 100) * (Y_BASE - Y_TOP);
const epsOfX = (x: number) => {
  const f = Math.min(Math.max((x - X0) / (X1 - X0), 0), 1);
  return 10 ** (le0 + f * (le1 - le0));
};

const REGIME_CLASS = ['pb-r0', 'pb-r1', 'pb-r2', 'pb-r3'];

/* --- formatters --- */
const fmtEps = (e: number) => (e >= 10 ? e.toFixed(1) : e >= 1 ? e.toFixed(2) : e.toFixed(2));
const fmtPct = (p: number) => (p >= 99.95 ? '≈100' : p >= 10 ? p.toFixed(0) : p.toFixed(1));

export default function mount(container: HTMLElement): () => void {
  let fi = 1;                 // focused regime (default: CIFAR-10 from scratch)
  let eps = 8;                // ε cursor

  const layout = createArtifactLayout(container, { wideTemplate: 'footer', stageAspect: '840/472' });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .pb-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .pb-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:none; cursor:ew-resize; }
    .pb-grid { stroke:rgba(124,140,255,.09); }
    .pb-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .pb-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .pb-leakzone { fill:rgba(249,115,98,.06); }
    .pb-bound { fill:none; stroke:#f97362; stroke-width:2.6; }
    .pb-boundlab { fill:#f9a08f; font:600 9.5px 'JetBrains Mono', monospace; }
    .pb-mia { fill:#f9a08f; stroke:#05070d; stroke-width:1.2; }
    .pb-mialab { fill:#f9a08f; font:600 9px 'JetBrains Mono', monospace; pointer-events:none; }
    .pb-ref { stroke:rgba(141,149,173,.34); stroke-width:1.1; stroke-dasharray:3 4; }
    .pb-ref-hot { stroke:rgba(231,234,243,.55); }
    .pb-reflab { fill:#8d95ad; font:600 9px 'JetBrains Mono', monospace; pointer-events:none; }
    .pb-refhit { fill:transparent; cursor:pointer; }
    .pb-guide { fill:none; stroke-width:1.6; opacity:.5; }
    .pb-node { outline:none; cursor:pointer; }
    .pb-node:focus-visible .pb-ring { opacity:1; }
    .pb-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .pb-dot { stroke:#05070d; stroke-width:1.3; }
    .pb-hit { fill:transparent; cursor:pointer; }
    .pb-dim { opacity:.26; }
    .pb-r0 { fill:#22d3ee; stroke:#22d3ee; } .pb-r0.pb-guide { stroke:#22d3ee; }
    .pb-r1 { fill:#5b8cff; stroke:#5b8cff; } .pb-r1.pb-guide { stroke:#5b8cff; }
    .pb-r2 { fill:#9b8cff; stroke:#9b8cff; } .pb-r2.pb-guide { stroke:#9b8cff; }
    .pb-r3 { fill:#5fd39b; stroke:#5fd39b; } .pb-r3.pb-guide { stroke:#5fd39b; }
    .pb-cur { stroke:rgba(231,234,243,.55); stroke-width:1.3; }
    .pb-curdot { fill:#e7eaf3; stroke:#05070d; stroke-width:1.4; }
    .pb-oplab { font:700 11px 'JetBrains Mono', monospace; fill:#f9a08f; pointer-events:none; }

    .pb-controls { display:flex; align-items:flex-end; gap:12px 22px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .pb-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .pb-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .pb-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .pb-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px;
      transition:color .2s, background .2s, border-color .2s; }
    .pb-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .pb-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .pb-swatch { width:9px; height:9px; border-radius:2px; flex:none; }
    .pb-seg small { color:#5b6378; font-weight:500; }
    .pb-seg[aria-pressed="true"] small { color:#9aa3bd; }

    .pb-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .pb-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .pb-eps { color:#e7eaf3; font-weight:700; font-size:15px; }
    .pb-sub { color:#5b6378; font-size:10.5px; }
    .pb-rows { display:flex; flex-direction:column; gap:5px; }
    .pb-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .pb-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .pb-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .pb-row b.pb-leak { color:#f97362; }
    .pb-row b.pb-util { color:#22d3ee; }
    .pb-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .pb-verdict.pb-mid { background:rgba(245,165,36,.1); color:#f7c877; border:1px solid rgba(245,165,36,.24); }
    .pb-verdict.pb-low { background:rgba(91,140,255,.1); color:#b9caff; border:1px solid rgba(91,140,255,.24); }
    .pb-verdict b { font-weight:700; }

    .pb-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .pb-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- chart scaffold ---- */
  const wrap = document.createElement('div');
  wrap.className = 'pb-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label',
    'Worst-case privacy leakage and measured model accuracy versus the differential-privacy budget epsilon');
  svg.setAttribute('tabindex', '0');
  wrap.appendChild(svg);
  stage.appendChild(wrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = text; gPlot.appendChild(t); return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls); gPlot.appendChild(l); return l;
  };

  /* ---- controls: regime tabs ---- */
  const controls = document.createElement('div');
  controls.className = 'pb-controls';
  const rGroup = document.createElement('div');
  rGroup.className = 'pb-cgroup';
  const rLab = document.createElement('span'); rLab.textContent = 'training regime (what the buyer trains)';
  const rSegs = document.createElement('div'); rSegs.className = 'pb-segs';
  rSegs.setAttribute('role', 'group'); rSegs.setAttribute('aria-label', 'training regime');
  const swatchColor = ['#22d3ee', '#5b8cff', '#9b8cff', '#5fd39b'];
  const rBtns = REGIMES.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pb-seg';
    b.innerHTML = `<i class="pb-swatch" style="background:${swatchColor[i]}"></i>${r.label} <small>${r.model}</small>`;
    b.setAttribute('aria-label', `${r.label}, ${r.model}`);
    b.addEventListener('click', () => { fi = i; render(); });
    rSegs.appendChild(b); return b;
  });
  rGroup.append(rLab, rSegs);
  controls.append(rGroup);
  controlsSlot.appendChild(controls);

  /* ---- panel ---- */
  const readout = document.createElement('div');
  readout.className = 'pb-readout';
  panel.appendChild(readout);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'pb-cap';
  cap.innerHTML =
    `Warm curve: the rigorous worst-case bound on membership-inference advantage for an (ε, δ)-DP model, ` +
    `<b>Adv ≤ (e<sup>ε</sup>−1+2δ)/(e<sup>ε</sup>+1)</b> at δ=1e-5 (Humphries et al.). ` +
    `Cool dots: <b>measured</b> DP-SGD test accuracy (De et al. 2022 + the DP image-classification literature). ` +
    `Small warm dots: measured empirical attack advantage on CIFAR-10. ` +
    `Drag the ε cursor, tap a reference line or a dot, or use the arrow keys.`;
  caption.appendChild(cap);

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);

    /* leakage zone shading above the bound (filled region under the curve top) */
    const zone = document.createElementNS(NS, 'rect');
    zone.setAttribute('x', String(X0)); zone.setAttribute('y', String(Y_TOP));
    zone.setAttribute('width', String(X1 - X0)); zone.setAttribute('height', String(Y_BASE - Y_TOP));
    zone.setAttribute('class', 'pb-leakzone');
    gPlot.appendChild(zone);

    /* gridlines + ticks: x decades-ish (ε), y every 20% */
    for (const v of [0.1, 0.3, 1, 3, 8, 19.61, 50]) {
      const x = xOf(v);
      mkLine(x, Y_TOP, x, Y_BASE, 'pb-grid');
      mkText(x, Y_BASE + 16, 'pb-axislab', v === 19.61 ? '19.6' : `${v}`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'pb-axis', 'privacy budget  ε  (total, log scale)', 'middle');
    for (const v of [0, 20, 40, 60, 80, 100]) {
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'pb-grid');
      mkText(X0 - 8, y + 3.5, 'pb-axislab', `${v}`, 'end');
    }
    mkText(X0 - 8, Y_TOP - 14, 'pb-axis', 'accuracy  /  leakage   %', 'start');

    /* reference lines (deployed / canonical ε) */
    REFS.forEach((ref) => {
      if (ref.eps < EMIN || ref.eps > EMAX) return;
      const x = xOf(ref.eps);
      const hot = Math.abs(Math.log10(ref.eps) - Math.log10(eps)) < 0.04;
      mkLine(x, Y_TOP, x, Y_BASE, `pb-ref${hot ? ' pb-ref-hot' : ''}`);
      const lab = mkText(x, Y_TOP - 3, 'pb-reflab', ref.label, x > X1 - 90 ? 'end' : 'middle');
      lab.setAttribute('transform', `rotate(-90 ${x} ${Y_TOP - 3})`);
      lab.setAttribute('x', String(x)); lab.setAttribute('y', String(Y_TOP - 3));
      /* tap target to snap the cursor here */
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('x', String(x - 7)); hit.setAttribute('y', String(Y_TOP));
      hit.setAttribute('width', '14'); hit.setAttribute('height', String(Y_BASE - Y_TOP));
      hit.setAttribute('class', 'pb-refhit');
      hit.addEventListener('click', (e) => { e.stopPropagation(); eps = ref.eps; render(); });
      gPlot.appendChild(hit);
    });

    /* worst-case leakage bound curve */
    let d = '';
    const STEPS = 140;
    for (let i = 0; i <= STEPS; i++) {
      const e = 10 ** (le0 + (i / STEPS) * (le1 - le0));
      d += `${i === 0 ? 'M' : 'L'}${xOf(e).toFixed(1)},${yOf(advBound(e)).toFixed(1)}`;
    }
    const bound = document.createElementNS(NS, 'path');
    bound.setAttribute('d', d); bound.setAttribute('class', 'pb-bound');
    gPlot.appendChild(bound);
    mkText(xOf(EMAX) - 4, yOf(advBound(EMAX)) - 8, 'pb-boundlab', 'worst-case leakage', 'end');

    /* empirical MIA dots (measured advantage, far below the bound) */
    MIA.points.forEach((p) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(xOf(p.eps))); c.setAttribute('cy', String(yOf(p.adv)));
      c.setAttribute('r', '3.6'); c.setAttribute('class', 'pb-mia');
      gPlot.appendChild(c);
    });
    if (MIA.points.length) {
      const last = MIA.points[MIA.points.length - 1];
      mkText(xOf(last.eps) + 7, yOf(last.adv) + 3, 'pb-mialab', 'real attack', 'start');
    }

    /* regime utility guide-lines + dots */
    REGIMES.forEach((r, ri) => {
      const focused = ri === fi;
      const dimCls = focused ? '' : ' pb-dim';
      const cls = REGIME_CLASS[ri];
      if (r.points.length > 1) {
        let gd = '';
        r.points.forEach((p, k) => { gd += `${k === 0 ? 'M' : 'L'}${xOf(p.eps).toFixed(1)},${yOf(p.acc).toFixed(1)}`; });
        const g = document.createElementNS(NS, 'path');
        g.setAttribute('d', gd); g.setAttribute('class', `pb-guide ${cls}${dimCls}`);
        gPlot.appendChild(g);
      }
      r.points.forEach((p) => {
        const x = xOf(p.eps), y = yOf(p.acc);
        const node = document.createElementNS(NS, 'g') as SVGGElement;
        node.setAttribute('class', `pb-node${dimCls}`);
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', `${r.label}, epsilon ${fmtEps(p.eps)}: ${p.acc} percent accuracy`);
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y));
        dot.setAttribute('r', focused ? '5' : '4');
        dot.setAttribute('class', `pb-dot ${cls}`);
        node.appendChild(dot);
        const ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('cx', String(x)); ring.setAttribute('cy', String(y));
        ring.setAttribute('r', '9'); ring.setAttribute('class', 'pb-ring');
        node.appendChild(ring);
        const hit = document.createElementNS(NS, 'circle');
        hit.setAttribute('cx', String(x)); hit.setAttribute('cy', String(y));
        hit.setAttribute('r', '15'); hit.setAttribute('class', 'pb-hit');
        node.appendChild(hit);
        const sel = () => { fi = ri; eps = p.eps; render(); };
        node.addEventListener('click', (e) => { e.stopPropagation(); sel(); });
        node.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); }
        });
        gPlot.appendChild(node);
      });
    });

    /* cursor */
    const cx = xOf(eps);
    mkLine(cx, Y_TOP, cx, Y_BASE, 'pb-cur');
    const by = yOf(advBound(eps));
    const cdot = document.createElementNS(NS, 'circle');
    cdot.setAttribute('cx', String(cx)); cdot.setAttribute('cy', String(by));
    cdot.setAttribute('r', '5'); cdot.setAttribute('class', 'pb-curdot');
    gPlot.appendChild(cdot);
    const anchor = cx > X1 - 96 ? 'end' : 'start';
    mkText(cx + (anchor === 'end' ? -9 : 9), Math.max(Y_TOP + 12, by - 10), 'pb-oplab',
      `${fmtPct(advBound(eps))}%`, anchor);

    rBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === fi)));
    renderPanel();
  }

  function renderPanel() {
    const r = REGIMES[fi];
    const leak = advBound(eps);
    /* nearest measured utility point in the focused regime */
    let near: Pt | null = null, nd = Infinity;
    for (const p of r.points) { const dd = Math.abs(Math.log10(p.eps) - Math.log10(eps)); if (dd < nd) { nd = dd; near = p; } }
    const onPoint = near !== null && Math.abs(near.eps - eps) < 1e-6;
    const round05 = Math.max(1, Math.round(eps / 0.5));   // rounds at ε₀=0.5 each (basic composition)

    readout.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'pb-hd';
    const ep = document.createElement('span'); ep.className = 'pb-eps'; ep.textContent = `ε = ${fmtEps(eps)}`;
    const sub = document.createElement('span'); sub.className = 'pb-sub'; sub.textContent = `δ = 1e-5 · ${r.label}`;
    hd.append(ep, sub);

    const rows = document.createElement('div');
    rows.className = 'pb-rows';
    const row = (label: string, val: string, cls = '') => {
      const rr = document.createElement('div'); rr.className = 'pb-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      rr.append(s, b); return rr;
    };
    rows.append(
      row('worst-case leakage', `${fmtPct(leak)}% adv.`, 'pb-leak'),
      row(onPoint ? 'measured accuracy' : 'nearest measured', near ? `${near.acc}%  @ ε ${fmtEps(near.eps)}` : '—', 'pb-util'),
      row('non-private ceiling', `${r.baseline}%`, ''),
      row('composes from', `~${round05} rounds @ ε₀ 0.5`, ''),
    );

    const verdict = document.createElement('div');
    if (eps <= 1.5) {
      verdict.className = 'pb-verdict pb-low';
      verdict.innerHTML =
        `<b>Private, but worth little.</b> The leakage bound is modest, yet from-scratch accuracy is near the floor ` +
        `(<b>${REGIMES[0].points[0].acc}%</b> on ImageNet at ε=0.5). Only a pretrained model survives here — and proof-of-contribution pays for the marginal signal DP just clipped away.`;
    } else if (eps < 8) {
      verdict.className = 'pb-verdict pb-mid';
      verdict.innerHTML =
        `<b>The squeeze.</b> Utility is climbing toward usable, but the worst-case membership advantage is already <b>${fmtPct(leak)}%</b>. ` +
        `The contributor wants to be further left; the buyer wants to be further right. There is no ε that satisfies both.`;
    } else {
      verdict.className = 'pb-verdict';
      verdict.innerHTML =
        `<b>Valuable, but the budget guarantees almost nothing.</b> At ε=${fmtEps(eps)} the worst-case advantage is <b>${fmtPct(leak)}%</b> — ` +
        `the guarantee is gone. Your only real cover is the gap to today's empirical attack (≈17% advantage on CIFAR-10), which the budget never promised.`;
    }

    readout.append(hd, rows, verdict);
  }

  /* ---- pointer: drag the ε cursor ---- */
  let dragging = false;
  const setFromX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((clientX - rect.left) / rect.width) * VB_W;
    eps = Math.min(Math.max(epsOfX(vbx), EMIN), EMAX);
    render();
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element)?.closest('.pb-node, .pb-refhit')) return;
    dragging = true;
    svg.setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  };
  const onMove = (e: PointerEvent) => { if (dragging) setFromX(e.clientX); };
  const onUp = (e: PointerEvent) => { dragging = false; try { svg.releasePointerCapture?.(e.pointerId); } catch { /* noop */ } };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { eps = Math.min(EMAX, eps * 1.3); render(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { eps = Math.max(EMIN, eps / 1.3); render(); e.preventDefault(); }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
