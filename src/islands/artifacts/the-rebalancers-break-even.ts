/**
 * Artifact: the-rebalancers-break-even — The Rebalancer's Break-Even
 * Manifest: content/artifacts/the-rebalancers-break-even/manifest.json
 *
 * The decision a stablecoin yield agent (Giza's ARMA, et al.) makes thousands
 * of times a day: move capital to a higher-quoted pool, or hold? Two forces
 * fight. (1) Rate impact — supplying into a pool drops its utilization and
 * therefore the rate everyone earns, so a big deposit competes away its own
 * edge along the kinked curve. (2) The gas/edge break-even — the move only pays
 * if the realized spread, over the holding horizon, out-earns the gas it costs.
 *
 * The destination pool uses the REAL Aave V3 USDC interest-rate curve on Base,
 * read on-chain via Blockscout (data.json): supplyRate = U·borrowRate·(1-RF),
 * borrowRate kinked at U_optimal=90% (slope1 4.5%, slope2 10%). Native-input
 * sliders, keyboard accessible; renders on input, no RAF loop.
 */
import data from '../../../content/artifacts/the-rebalancers-break-even/data.json';

const C = data.curve;
const U_OPT = C.optimalUsage; // 0.90
const S1 = C.slope1; // 0.045
const S2 = C.slope2; // 0.10
const BASE = C.baseRate; // 0
const RF = C.reserveFactor; // 0.10

// Aave V3 kinked variable-borrow curve, then the supply rate suppliers earn.
function borrowRate(u: number): number {
  return u <= U_OPT
    ? BASE + (u / U_OPT) * S1
    : BASE + S1 + ((u - U_OPT) / (1 - U_OPT)) * S2;
}
function supplyRate(u: number): number {
  return u * borrowRate(u) * (1 - RF);
}
// Supply rate at the kink — the boundary between the two inverse branches.
const S_KINK = supplyRate(U_OPT);

// Invert supplyRate(u) → u, so a "quoted APY" maps to an implied utilization.
function utilFromSupply(s: number): number {
  let u: number;
  if (s <= S_KINK) {
    // s = u² · (S1/U_OPT)·(1-RF)
    u = Math.sqrt(s / ((S1 / U_OPT) * (1 - RF)));
  } else {
    // s = (1-RF)·u·(BASE + S1 - S2·U_OPT/(1-U_OPT) + u·S2/(1-U_OPT))
    const k = S2 / (1 - U_OPT);
    const b = BASE + S1 - k * U_OPT;
    const A = (1 - RF) * k;
    const B = (1 - RF) * b;
    // A·u² + B·u − s = 0
    u = (-B + Math.sqrt(B * B + 4 * A * s)) / (2 * A);
  }
  return Math.min(0.999, Math.max(0.001, u));
}

const fmtUsd = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(2)}`;
};
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const bps = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 10000)} bps`;
const fmtDays = (d: number) => {
  if (!isFinite(d)) return '—';
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 24 * 60))} min`;
  if (d < 1) return `${(d * 24).toFixed(1)} h`;
  if (d < 60) return `${d.toFixed(d < 10 ? 1 : 0)} days`;
  return `${(d / 30).toFixed(1)} mo`;
};

export default function mount(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'rbe-root';
  container.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .rbe-root { position:absolute; inset:0; display:flex; flex-direction:column; gap:9px;
      padding:13px 15px; overflow-y:auto; background:#05070d;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .rbe-controls { display:grid; grid-template-columns:1fr 1fr; gap:7px 16px; }
    .rbe-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .rbe-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; }
    .rbe-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:3px 0 0; }
    .rbe-field.rbe-dest input { accent-color:#22d3ee; }
    .rbe-stagewrap { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 12px 6px; }
    .rbe-stage { position:relative; }
    .rbe-stage svg { width:100%; height:172px; display:block; }
    .rbe-lab { position:absolute; transform:translate(-50%,-50%); font-size:9.5px;
      pointer-events:none; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .rbe-axis { position:absolute; font-size:8.5px; color:#5b6378; pointer-events:none;
      white-space:nowrap; letter-spacing:.04em; }
    .rbe-panels { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .rbe-root.rbe-narrow .rbe-controls { grid-template-columns:1fr; }
    .rbe-root.rbe-narrow .rbe-panels { grid-template-columns:1fr; }
    .rbe-panel { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:9px 12px; background:#0d1322; }
    .rbe-panel h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.13em; text-transform:uppercase; }
    .rbe-panel.rbe-impact h3 { color:#22d3ee; }
    .rbe-panel.rbe-econ h3 { color:#5b8cff; }
    .rbe-panel dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:3px 10px; }
    .rbe-panel dt { color:#5b6378; font-size:10px; }
    .rbe-panel dd { margin:0; color:#e7eaf3; text-align:right;
      font-variant-numeric:tabular-nums; }
    .rbe-panel dd.neg { color:#ff7a8a; }
    .rbe-panel dd.pos { color:#22d3ee; }
    .rbe-verdict { text-align:center; font-size:12px; color:#8d95ad; padding:2px 0; }
    .rbe-verdict b { font-size:12.5px; letter-spacing:.06em; }
    .rbe-verdict.rbe-move b { color:#22d3ee; }
    .rbe-verdict.rbe-hold b { color:#ff7a8a; }
    .rbe-note { text-align:center; font-size:9px; color:#5b6378; letter-spacing:.03em;
      line-height:1.5; }
  `;
  root.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'rbe-controls';
  const mkSlider = (
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    dest = false,
  ) => {
    const field = document.createElement('div');
    field.className = 'rbe-field' + (dest ? ' rbe-dest' : '');
    const lab = document.createElement('label');
    lab.htmlFor = `rbe-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `rbe-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };

  const capital = mkSlider('capital', 'capital to move', 1000, 5_000_000, 1000, 250_000);
  const gas = mkSlider('gas', 'gas per rebalance', 0.01, 20, 0.01, 0.1);
  const destApy = mkSlider('dest', 'destination quoted apy', 0.01, 0.06, 0.0005, 0.036, true);
  const destDepth = mkSlider('depth', 'destination pool depth', 1_000_000, 200_000_000, 500_000, 20_000_000, true);
  const srcApy = mkSlider('src', 'your current apy', 0, 0.06, 0.0005, 0.03);
  root.appendChild(controls);

  /* ---- Curve stage ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const stageWrap = document.createElement('div');
  stageWrap.className = 'rbe-stagewrap';
  const stage = document.createElement('div');
  stage.className = 'rbe-stage';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 172');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  stage.appendChild(svg);
  stageWrap.appendChild(stage);
  root.appendChild(stageWrap);

  // Plot window: utilization 0.55..1.0 (x), supply APY 0..0.06 (y).
  const U_LO = 0.55,
    U_HI = 1.0,
    Y_HI = 0.06;
  const PX = { l: 8, r: 10, t: 12, b: 16 };
  const W = 600,
    H = 172;
  const xOf = (u: number) =>
    PX.l + ((u - U_LO) / (U_HI - U_LO)) * (W - PX.l - PX.r);
  const yOf = (s: number) =>
    H - PX.b - (Math.min(s, Y_HI) / Y_HI) * (H - PX.t - PX.b);

  const mkLine = (cls: string, color: string, dash = '', w = 1) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', String(w));
    if (dash) l.setAttribute('stroke-dasharray', dash);
    l.dataset.k = cls;
    svg.appendChild(l);
    return l;
  };
  const mkPath = (color: string, w: number, fill = 'none') => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', String(w));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    return p;
  };
  const mkDot = (color: string, r: number) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', String(r));
    c.setAttribute('fill', color);
    svg.appendChild(c);
    return c;
  };

  // Static gridlines (horizontal APY refs at 2/4/6%, kink vertical at 90%).
  for (const gy of [0.02, 0.04, 0.06]) {
    const l = mkLine('grid', 'rgba(124,140,255,.10)', '', 1);
    l.setAttribute('x1', String(PX.l));
    l.setAttribute('x2', String(W - PX.r));
    l.setAttribute('y1', String(yOf(gy)));
    l.setAttribute('y2', String(yOf(gy)));
  }
  const kink = mkLine('kink', 'rgba(139,92,246,.45)', '4 4', 1);
  kink.setAttribute('x1', String(xOf(U_OPT)));
  kink.setAttribute('x2', String(xOf(U_OPT)));
  kink.setAttribute('y1', String(PX.t));
  kink.setAttribute('y2', String(H - PX.b));

  const curve = mkPath('rgba(124,140,255,.45)', 1.5);
  // Static supply curve over the window.
  {
    let d = '';
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const u = U_LO + (i / N) * (U_HI - U_LO);
      d += `${i ? 'L' : 'M'}${xOf(u).toFixed(1)} ${yOf(supplyRate(u)).toFixed(1)} `;
    }
    curve.setAttribute('d', d);
  }

  const srcLine = mkLine('src', '#8d95ad', '3 4', 1);
  srcLine.setAttribute('x1', String(PX.l));
  srcLine.setAttribute('x2', String(W - PX.r));
  const moveArrow = mkPath('#5b8cff', 1.5);
  moveArrow.setAttribute('stroke-dasharray', '2 3');
  moveArrow.setAttribute('vector-effect', 'non-scaling-stroke');
  const dotBefore = mkDot('#22d3ee', 4.5);
  const dotAfter = mkDot('#5b8cff', 4.5);

  // DOM overlay labels (SVG is stretched; keep glyphs crisp in the div layer).
  const mkLab = (color: string) => {
    const d = document.createElement('div');
    d.className = 'rbe-lab';
    d.style.color = color;
    stage.appendChild(d);
    return d;
  };
  const labBefore = mkLab('#22d3ee');
  const labAfter = mkLab('#5b8cff');
  const labSrc = mkLab('#8d95ad');
  const axKink = document.createElement('div');
  axKink.className = 'rbe-axis';
  axKink.textContent = 'U* 90%';
  axKink.style.color = 'rgba(139,92,246,.8)';
  stage.appendChild(axKink);
  const axY = document.createElement('div');
  axY.className = 'rbe-axis';
  axY.textContent = 'supply apy ↑   utilization →';
  axY.style.left = '8px';
  axY.style.top = '2px';
  stage.appendChild(axY);

  /* ---- Readout panels ---- */
  const panels = document.createElement('div');
  panels.className = 'rbe-panels';
  const mkPanel = (cls: string, title: string, rows: string[]) => {
    const panel = document.createElement('div');
    panel.className = `rbe-panel ${cls}`;
    const h = document.createElement('h3');
    h.textContent = title;
    const dl = document.createElement('dl');
    const dds: HTMLElement[] = [];
    for (const r of rows) {
      const dt = document.createElement('dt');
      dt.textContent = r;
      const dd = document.createElement('dd');
      dl.append(dt, dd);
      dds.push(dd);
    }
    panel.append(h, dl);
    panels.appendChild(panel);
    return dds;
  };
  const impactDds = mkPanel('rbe-impact', 'rate impact', [
    'quoted apy',
    'realized apy',
    'self-inflicted drop',
  ]);
  const econDds = mkPanel('rbe-econ', 'the economics', [
    'net edge vs current',
    'extra yield / yr',
    'gas break-even',
  ]);
  root.appendChild(panels);

  const verdict = document.createElement('div');
  verdict.className = 'rbe-verdict';
  root.appendChild(verdict);

  const note = document.createElement('div');
  note.className = 'rbe-note';
  note.textContent =
    'destination curve = live Aave V3 USDC on Base (U* 90%, slope1 4.5%, slope2 10%, RF 10%), read on-chain — the real pool is $176M deep at 84% utilization, 3.17% supply. gas $0.05≈Base, ~$8≈Ethereum L1.';
  root.appendChild(note);

  /* ---- Recompute + render ---- */
  function render() {
    const cap = Number(capital.input.value);
    const g = Number(gas.input.value);
    const quoted = Number(destApy.input.value);
    const depth = Number(destDepth.input.value);
    const src = Number(srcApy.input.value);

    capital.out.textContent = fmtUsd(cap);
    gas.out.textContent = `$${g.toFixed(2)}`;
    destApy.out.textContent = pct(quoted, 2);
    destDepth.out.textContent = fmtUsd(depth);
    srcApy.out.textContent = pct(src, 2);

    // Imply destination utilization & borrowed from the quoted rate, then
    // supply `cap` into it: utilization falls, so does the rate everyone earns.
    const u0 = utilFromSupply(quoted);
    const borrowed = u0 * depth;
    const u1 = borrowed / (depth + cap);
    const realized = supplyRate(u1);
    const drop = quoted - realized; // self-inflicted, ≥0
    const edge = realized - src; // net of where capital already sits
    const annual = edge * cap;
    const breakEven = edge > 0 ? (g * 365) / annual : Infinity;

    impactDds[0]!.textContent = pct(quoted, 2);
    impactDds[1]!.textContent = pct(realized, 2);
    impactDds[2]!.textContent = `−${Math.round(drop * 10000)} bps`;

    econDds[0]!.textContent = bps(edge);
    econDds[0]!.className = edge > 0 ? 'pos' : 'neg';
    econDds[1]!.textContent = (annual >= 0 ? '' : '−') + fmtUsd(Math.abs(annual));
    econDds[1]!.className = annual > 0 ? 'pos' : 'neg';
    econDds[2]!.textContent = fmtDays(breakEven);

    // ---- Curve markers ----
    const xb = xOf(u0),
      yb = yOf(quoted);
    const xa = xOf(u1),
      ya = yOf(realized);
    dotBefore.setAttribute('cx', String(xb));
    dotBefore.setAttribute('cy', String(yb));
    dotAfter.setAttribute('cx', String(xa));
    dotAfter.setAttribute('cy', String(ya));
    moveArrow.setAttribute('d', `M${xb} ${yb} L${xa} ${ya}`);
    const ys = yOf(src);
    srcLine.setAttribute('y1', String(ys));
    srcLine.setAttribute('y2', String(ys));

    // Labels (positioned as % of the 600x172 stage box).
    const place = (el: HTMLElement, x: number, y: number, text: string, dy = -10) => {
      el.style.left = `${(Math.min(Math.max(x, 30), W - 30) / W) * 100}%`;
      el.style.top = `${((y + dy) / H) * 100}%`;
      el.textContent = text;
    };
    place(labBefore, xb, yb, `quoted ${pct(quoted, 2)}`, -11);
    place(labAfter, xa, ya, `you earn ${pct(realized, 2)}`, 13);
    labSrc.style.left = `${((W - PX.r) / W) * 100}%`;
    labSrc.style.transform = 'translate(-100%,-50%)';
    labSrc.style.top = `${((ys - 8) / H) * 100}%`;
    labSrc.textContent = `current ${pct(src, 2)}`;
    axKink.style.left = `${(xOf(U_OPT) / W) * 100}%`;
    axKink.style.top = '94%';
    axKink.style.transform = 'translate(-50%,-50%)';

    // ---- Verdict ----
    verdict.className = 'rbe-verdict ' + (edge > 0 ? 'rbe-move' : 'rbe-hold');
    verdict.innerHTML = '';
    if (edge > 0) {
      const b = document.createElement('b');
      b.textContent = 'MOVE';
      verdict.append(b, ` — gas repays in ${fmtDays(breakEven)}; +${fmtUsd(annual)}/yr after that.`);
    } else {
      const b = document.createElement('b');
      b.textContent = 'HOLD';
      verdict.append(
        b,
        ` — your own deposit drops the rate to ${pct(realized, 2)}, below the ${pct(src, 2)} you already earn.`,
      );
    }
  }

  const inputs = [capital, gas, destApy, destDepth, srcApy].map((s) => s.input);
  const onInput = () => render();
  for (const i of inputs) i.addEventListener('input', onInput);
  render();

  const ro = new ResizeObserver(([entry]) => {
    root.classList.toggle('rbe-narrow', (entry?.contentRect.width ?? 600) < 540);
  });
  ro.observe(container);

  return () => {
    ro.disconnect();
    for (const i of inputs) i.removeEventListener('input', onInput);
    style.remove();
    root.remove();
  };
}
