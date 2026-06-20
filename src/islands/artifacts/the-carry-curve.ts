/**
 * Artifact: the-carry-curve — The Carry Curve
 * Manifest: content/artifacts/the-carry-curve/manifest.json
 *
 * A perpetual future has no expiry, so nothing forces its price back to spot
 * except the funding rate: a periodic cash transfer between longs and shorts.
 * On Hyperliquid funding settles every hour at one-eighth of an 8h rate that is
 * the average premium index plus clamp(interest - premium, -0.05%, +0.05%), with
 * the interest component fixed at 0.01%/8h. A delta-neutral agent (long spot +
 * short perp, or the mirror when funding is negative) is price-flat and just
 * collects that stream — carry, not alpha.
 *
 * This chart plots the cumulative NET carry of a $10,000 delta-neutral position
 * over a holding horizon, for real funding regimes sampled from Hyperliquid
 * (HYPE/XMR/VVV snapshots, the interest floor, a trending-ETH example). The line
 * starts below zero by the round-trip fee, then climbs at a slope set by the
 * annualized funding rate; the breakeven dot is where carry first pays the fee
 * back. A "funding flips" slider models the hourly-settlement risk: past the flip
 * day the agent is on the paying side and the curve rolls over.
 *
 * Controls: tap a regime chip; click/drag the chart (or arrow keys) to set the
 * holding period; drag the fee and flip sliders. SVG, no RAF — renders on input.
 * Layout via the shared primitive.
 */
import data from '../../../content/artifacts/the-carry-curve/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Regime {
  id: string; label: string; asset: string;
  rate8h: number; apr: number; side: string; note: string;
}

const REGIMES = data.regimes as Regime[];
const HMAX = data.config.horizonDays; // 90 days
const NOTIONAL = data.defaults.notionalUsd; // $10,000
const NOTIONAL_K = `$${(NOTIONAL / 1000).toFixed(0)}k`;

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 840;
const VB_H = 440;
const X0 = 64;
const X1 = 792;
const Y_TOP = 30;
const Y_BASE = 388;

const xOf = (day: number) => X0 + (day / HMAX) * (X1 - X0);
const dayOfX = (x: number) => Math.min(HMAX, Math.max(0, ((x - X0) / (X1 - X0)) * HMAX));

/* --- formatters --- */
const signpct = (x: number) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}%`;
const usd = (x: number) => {
  const a = Math.abs(x);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`
    : a >= 100 ? `$${a.toFixed(0)}`
    : `$${a.toFixed(2)}`;
  return x < 0 ? `-${s}` : s;
};
const days = (d: number) => d >= 1 ? `${d.toFixed(d >= 10 ? 0 : 1)} d` : `${(d * 24).toFixed(0)} h`;

export default function mount(container: HTMLElement): () => void {
  let sel = REGIMES.findIndex((r) => r.id === data.defaults.regime);
  if (sel < 0) sel = 0;
  let hold = data.defaults.horizonDays;     // days held
  let fee = data.defaults.roundTripFeePct;  // round-trip, % of notional
  let flip = data.defaults.flipDay;         // 0 = off, else flip day

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/440',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .cc-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .cc-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:pan-y; cursor:crosshair; }
    .cc-grid { stroke:rgba(124,140,255,.09); }
    .cc-zero { stroke:rgba(231,234,243,.30); stroke-width:1.1; }
    .cc-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .cc-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .cc-pos { fill:rgba(34,211,238,.11); }
    .cc-feeband { fill:rgba(249,115,98,.10); }
    .cc-curve { fill:none; stroke:#22d3ee; stroke-width:2.6; }
    .cc-curve-down { fill:none; stroke:#f97362; stroke-width:2.6; }
    .cc-be { stroke:rgba(245,165,36,.55); stroke-width:1.1; stroke-dasharray:4 4; }
    .cc-belab { fill:#f5a524; font:600 9.5px 'JetBrains Mono', monospace; }
    .cc-fliplab { fill:#f97362; font:600 9.5px 'JetBrains Mono', monospace; }
    .cc-mk { stroke:rgba(231,234,243,.5); stroke-width:1.3; }
    .cc-dot { stroke:#05070d; stroke-width:1.4; fill:#e7eaf3; }
    .cc-oplab { font:700 11.5px 'JetBrains Mono', monospace; fill:#e7eaf3; pointer-events:none; }
    .cc-tag { font:600 9.5px 'JetBrains Mono', monospace; fill:#8d95ad; pointer-events:none; }

    .cc-controls { display:flex; align-items:flex-end; gap:14px 20px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .cc-cgroup { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .cc-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .cc-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .cc-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 10px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .cc-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .cc-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .cc-seg small { color:#5b6378; font-weight:500; margin-left:5px; }
    .cc-seg[aria-pressed="true"] small { color:#9aa3bd; }
    .cc-slider { display:flex; flex-direction:column; gap:5px; min-width:0; flex:1 1 160px; max-width:230px; }
    .cc-slider .cc-srow { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
    .cc-slider .cc-slab { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .cc-slider b { color:#e7eaf3; font-weight:700; font-variant-numeric:tabular-nums; }
    .cc-slider input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer; }
    .cc-slider input:focus-visible { outline:2px solid #5b8cff; outline-offset:3px; }

    .cc-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .cc-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; min-width:0; }
    .cc-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .cc-sub { color:#5b6378; font-size:10.5px; }
    .cc-side { border:1px solid rgba(91,140,255,.4); color:#aeb9ff; background:rgba(91,140,255,.12);
      font:600 9.5px 'JetBrains Mono', monospace; }
    .cc-rows { display:flex; flex-direction:column; gap:5px; }
    .cc-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .cc-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .cc-row b { font-size:13px; font-weight:700; color:#e7eaf3; white-space:nowrap; }
    .cc-row b.cc-cyan { color:#22d3ee; }
    .cc-row b.cc-amber { color:#f5a524; }
    .cc-row b.cc-warn { color:#f97362; }
    .cc-rule { height:1px; background:rgba(124,140,255,.12); margin:1px 0; }
    .cc-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .cc-verdict.cc-bad { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .cc-verdict b { font-weight:700; }

    .cc-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .cc-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'cc-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label',
    'Cumulative net carry of a delta-neutral perpetual funding harvest over a holding period');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
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

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'cc-controls';

  // regime chips
  const cgroup = document.createElement('div');
  cgroup.className = 'cc-cgroup';
  const clab = document.createElement('span');
  clab.textContent = 'funding regime (real snapshots)';
  const segs = document.createElement('div');
  segs.className = 'cc-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'funding regime');
  const segBtns = REGIMES.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cc-seg';
    b.innerHTML = `${r.label} <small>${signpct(r.apr)}/yr</small>`;
    b.setAttribute('aria-label', `${r.label}: funding ${signpct(r.rate8h)} per 8 hours, ${signpct(r.apr)} annualized`);
    b.addEventListener('click', () => { sel = i; render(); });
    segs.appendChild(b);
    return b;
  });
  cgroup.append(clab, segs);

  // sliders share one shape: label + readout above a range input
  const makeSlider = (o: {
    label: string; min: string; max: string; step: string; value: string;
    aria: string; onInput: (v: number) => void;
  }) => {
    const group = document.createElement('div');
    group.className = 'cc-slider';
    const row = document.createElement('div');
    row.className = 'cc-srow';
    const lab = document.createElement('span');
    lab.className = 'cc-slab';
    lab.textContent = o.label;
    const val = document.createElement('b');
    row.append(lab, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = o.min; input.max = o.max; input.step = o.step; input.value = o.value;
    input.setAttribute('aria-label', o.aria);
    input.addEventListener('input', () => o.onInput(parseFloat(input.value)));
    group.append(row, input);
    return { group, val };
  };

  const feeS = makeSlider({
    label: 'round-trip fee', min: '0', max: '0.30', step: '0.01', value: String(fee),
    aria: 'round-trip fee, percent of notional',
    onInput: (v) => { fee = v; render(); },
  });
  const flipS = makeSlider({
    label: 'funding flips at', min: '0', max: String(HMAX), step: '1', value: String(flip),
    aria: 'day the funding rate flips sign, zero for never',
    onInput: (v) => { flip = Math.round(v); render(); },
  });

  controls.append(cgroup, feeS.group, flipS.group);
  controlsSlot.appendChild(controls);

  /* ---- Panel ---- */
  const readout = document.createElement('div');
  readout.className = 'cc-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'cc-cap';
  cap.innerHTML =
    `Delta-neutral harvest of a <b>$${NOTIONAL.toLocaleString()}</b> position: long spot + short perp (or the mirror when funding is negative), ` +
    `so the position is price-flat and earns only the funding stream. Funding (Hyperliquid): ` +
    `<b>premium + clamp(0.01%/8h interest − premium, ±0.05%)</b>, settled hourly at 1/8. ` +
    `Net carry = annualized funding × time − round-trip fee. Tap a regime, drag on the chart to set the holding period, push the fee and flip sliders.`;
  caption.appendChild(cap);

  /* ---- net-carry model ---- */
  const slopePerDay = (r: Regime) => Math.abs(r.apr) / 365; // %/day on the receiving side
  function netAt(t: number, r: Regime): number {
    const m = slopePerDay(r);
    if (flip > 0 && t > flip) {
      const peak = m * flip - fee;
      return peak - m * (t - flip);
    }
    return m * t - fee;
  }

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const r = REGIMES[sel];
    const m = slopePerDay(r); // %/day

    // y domain — dynamic so each regime reads well
    const endVal = netAt(HMAX, r);
    const peakVal = flip > 0 ? netAt(flip, r) : endVal;
    const yMax = Math.max(0.6, peakVal * 1.12);
    const yMin = Math.min(-Math.max(fee * 1.6, 0.25), endVal * 1.12);
    const yOf = (v: number) => Y_BASE - ((v - yMin) / (yMax - yMin)) * (Y_BASE - Y_TOP);

    // y gridlines (nice steps)
    const span = yMax - yMin;
    const step = span > 8 ? 2 : span > 4 ? 1 : span > 2 ? 0.5 : 0.25;
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) {
      const y = yOf(v);
      mkLine(X0, y, X1, y, Math.abs(v) < 1e-9 ? 'cc-zero' : 'cc-grid');
      mkText(X0 - 8, y + 3.5, 'cc-axis', `${v > 1e-9 ? '+' : ''}${v.toFixed(step < 1 ? 2 : 0)}%`, 'end');
    }
    mkText(X0 - 8, Y_TOP - 12, 'cc-axis', 'net carry', 'start');

    // x ticks (days)
    for (const d of [0, 15, 30, 45, 60, 75, 90]) {
      if (d > HMAX) continue;
      const x = xOf(d);
      mkLine(x, Y_TOP, x, Y_BASE, 'cc-grid');
      mkText(x, Y_BASE + 17, 'cc-axislab', String(d), 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 34, 'cc-axis', 'days held', 'middle');

    // sample the curve
    const N = 180;
    const pts: { x: number; y: number; v: number; up: boolean }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * HMAX;
      const v = netAt(t, r);
      pts.push({ x: xOf(t), y: yOf(v), v, up: !(flip > 0 && t > flip) });
    }

    const y0 = yOf(0);

    // filled area between the curve and the zero line where carry is positive
    const upSeg = pts.filter((p) => p.v >= 0);
    if (upSeg.length > 1) {
      const poly = document.createElementNS(NS, 'polygon');
      const body = upSeg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      poly.setAttribute('points', `${upSeg[0].x.toFixed(1)},${y0.toFixed(1)} ${body} ${upSeg[upSeg.length - 1].x.toFixed(1)},${y0.toFixed(1)}`);
      poly.setAttribute('class', 'cc-pos'); gPlot.appendChild(poly);
    }

    // fee band: the sub-zero start the carry must climb out of
    if (fee > 0) {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(X0)); rect.setAttribute('y', String(y0));
      rect.setAttribute('width', String(X1 - X0));
      rect.setAttribute('height', String(Math.max(0, yOf(-fee) - y0)));
      rect.setAttribute('class', 'cc-feeband'); gPlot.appendChild(rect);
      mkText(X0 + 6, yOf(-fee) - 5, 'cc-tag', `fee drag ${fee.toFixed(2)}%`, 'start');
    }

    // breakeven dot (no-flip math; the day net first crosses 0 going up)
    const beDay = (m > 0 && fee > 0) ? fee / m : 0;
    if (beDay > 0 && beDay <= HMAX && (flip === 0 || beDay <= flip)) {
      const bx = xOf(beDay);
      mkLine(bx, Y_TOP, bx, Y_BASE, 'cc-be');
      mkText(bx + 5, Y_TOP + 12, 'cc-belab', `breakeven ${days(beDay)}`, 'start');
    }

    // curve: up segment (cyan)
    const upPath = pts.filter((p) => p.up).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const pu = document.createElementNS(NS, 'path');
    pu.setAttribute('d', upPath); pu.setAttribute('class', 'cc-curve'); gPlot.appendChild(pu);

    // flip: rolled-over segment (red) + marker
    if (flip > 0) {
      const downPts = pts.filter((p) => !p.up);
      if (downPts.length) {
        const vx = xOf(flip), vy = yOf(netAt(flip, r));
        const dpath = [`M${vx.toFixed(1)},${vy.toFixed(1)}`, ...downPts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)].join(' ');
        const pd = document.createElementNS(NS, 'path');
        pd.setAttribute('d', dpath); pd.setAttribute('class', 'cc-curve-down'); gPlot.appendChild(pd);
      }
      const fx = xOf(flip);
      mkLine(fx, Y_TOP, fx, Y_BASE, 'cc-mk');
      mkText(fx + 5, Y_TOP + 26, 'cc-fliplab', 'funding flips', 'start');
    }

    // selection marker at hold
    const sx = xOf(hold);
    const sv = netAt(hold, r);
    const sy = yOf(sv);
    mkLine(sx, Y_TOP, sx, Y_BASE, 'cc-mk');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', String(sx)); dot.setAttribute('cy', String(sy));
    dot.setAttribute('r', '5.5'); dot.setAttribute('class', 'cc-dot');
    gPlot.appendChild(dot);
    const anchor = sx > X1 - 130 ? 'end' : 'start';
    const lx = sx + (anchor === 'end' ? -8 : 8);
    mkText(lx, Math.max(Y_TOP + 12, sy - 12), 'cc-oplab', signpct(sv), anchor);
    mkText(lx, Math.max(Y_TOP + 26, sy + 4), 'cc-tag', `${usd(NOTIONAL * sv / 100)} on ${NOTIONAL_K}`, anchor);

    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel)));
    feeS.val.textContent = `${fee.toFixed(2)}%`;
    flipS.val.textContent = flip === 0 ? 'never' : `day ${flip}`;

    renderPanel(r, m, sv, beDay);
  }

  function renderPanel(r: Regime, mPerDay: number, netNow: number, beDay: number) {
    readout.innerHTML = '';
    const dailyUsd = NOTIONAL * mPerDay / 100;
    const flipped = flip > 0 && hold > flip;

    const hd = document.createElement('div');
    hd.className = 'cc-hd';
    const name = document.createElement('span');
    name.className = 'cc-name';
    name.textContent = r.label;
    const side = document.createElement('span');
    side.className = 'afl-pill cc-side';
    side.textContent = r.side;
    const sub = document.createElement('span');
    sub.className = 'cc-sub';
    sub.textContent = `held ${days(hold)}`;
    hd.append(name, side, sub);

    const row = (label: string, val: string, cls = '') => {
      const d = document.createElement('div'); d.className = 'cc-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      d.append(s, b); return d;
    };

    const rows = document.createElement('div');
    rows.className = 'cc-rows';
    rows.append(
      row('8h funding', signpct(r.rate8h)),
      row('annualized', signpct(r.apr), 'cc-cyan'),
      row('interest floor', '+0.01% / 8h'),
      row('clamp band', '±0.05% / 8h'),
    );
    const rule1 = document.createElement('div'); rule1.className = 'cc-rule';
    const rows2 = document.createElement('div');
    rows2.className = 'cc-rows';
    rows2.append(
      row('daily carry', usd(dailyUsd), 'cc-cyan'),
      row('round-trip fee', `${usd(NOTIONAL * fee / 100)} · ${fee.toFixed(2)}%`, 'cc-amber'),
      row('breakeven', beDay > 0 && beDay <= HMAX ? days(beDay) : (mPerDay <= 0 ? '—' : 'instant'), 'cc-amber'),
      row(`net @ ${days(hold)}`, `${usd(NOTIONAL * netNow / 100)} · ${signpct(netNow)}`,
        netNow >= 0 ? 'cc-cyan' : 'cc-warn'),
    );

    const verdict = document.createElement('div');
    verdict.className = `cc-verdict ${netNow < 0 ? 'cc-bad' : ''}`;
    if (flipped) {
      verdict.innerHTML =
        `Funding flipped on day ${flip}: the agent is now on the <b>paying</b> side, and the carry it banked is bleeding back out. ` +
        `Hourly settlement means a regime can invert inside one trend candle — the carry trade's real risk isn't price (that's hedged), it's the rate.`;
    } else if (netNow < 0) {
      verdict.innerHTML =
        `Still underwater: ${days(hold)} of carry hasn't repaid the <b>${fee.toFixed(2)}%</b> round-trip fee. ` +
        `Funding this size only pays once you hold past breakeven — which is why agents chase the highest <b>sustained</b> rate, not the highest spike.`;
    } else {
      verdict.innerHTML =
        `Price-flat and collecting: <b>${usd(NOTIONAL * netNow / 100)}</b> net on ${NOTIONAL_K} after fees — ` +
        `a <b>${signpct(r.apr)}/yr</b> stream that needs no view on direction. This is the constrained-optimization game agents win: carry, not alpha.`;
    }
    readout.append(hd, rows, rule1, rows2, verdict);
  }

  /* ---- pointer: drag the chart to set holding period ---- */
  const setFromX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((clientX - rect.left) / rect.width) * VB_W;
    const next = Math.round(dayOfX(vbx));
    if (next === hold) return; // most drag moves land on the same integer day
    hold = next;
    render();
  };
  let dragging = false;
  const onDown = (e: PointerEvent) => { dragging = true; svg.setPointerCapture(e.pointerId); setFromX(e.clientX); };
  const onMove = (e: PointerEvent) => { if (dragging) setFromX(e.clientX); };
  const onUp = (e: PointerEvent) => { dragging = false; try { svg.releasePointerCapture(e.pointerId); } catch { /* noop */ } };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { hold = Math.min(HMAX, hold + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { hold = Math.max(0, hold - 1); render(); e.preventDefault(); }
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
