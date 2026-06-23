/**
 * Artifact: sandwich-simulator — Sandwich Simulator
 * Manifest: content/artifacts/sandwich-simulator/manifest.json
 *
 * The sandwich attack an autonomous agent funds every time it market-buys in
 * the open. A victim swaps `V` USDC for WETH on a constant-product pool with a
 * slippage limit `s`. A searcher reading the public mempool front-runs with an
 * optimal `F`, lets the victim fill at the inflated price, then back-runs —
 * pocketing the spread. The pool is the REAL Aerodrome volatile WETH/USDC pool
 * on Base (reserves + 0.30% fee read on-chain via Blockscout, data.json), and
 * the searcher's `F*` is solved exactly against the curve, capped by the
 * victim's slippage tolerance — the agent's only on-mempool defense. Toggle to
 * private orderflow and the public front-run vanishes (at a latency cost noted
 * in the caption).
 *
 * Layout: shared createArtifactLayout primitive. stage = price-impact curve
 * with the front-run / victim / back-run path + verdict; panel = attacker /
 * victim readouts; controls = sliders + routing toggle; caption = provenance.
 * No RAF loop — renders on input.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/sandwich-simulator/data.json';

const P = data.pool;
const RU0 = P.reserveUsdc; // USDC reserve
const RW0 = P.reserveWeth; // WETH reserve
const G = 1 - P.feeBps / 10000; // 0.997
const P0 = RU0 / RW0; // mid price, USDC per WETH
const K = RU0 * RW0; // constant-product invariant (for the price curve shape)

// Constant-product swaps with the fee taken on the input (Uni-v2 / Aerodrome vAMM).
const buyWeth = (usdcIn: number, ru: number, rw: number) =>
  (usdcIn * G * rw) / (ru + usdcIn * G); // USDC -> WETH out
const sellWeth = (wethIn: number, ru: number, rw: number) =>
  (wethIn * G * ru) / (rw + wethIn * G); // WETH -> USDC out

const fmtUsd = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  if (a >= 1) return `${sign}$${a.toFixed(2)}`;
  return `${sign}$${a.toFixed(4)}`;
};
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

interface Result {
  F: number; // optimal front-run (USDC)
  profit: number; // searcher gross profit (USDC)
  roi: number;
  wv0: number; // victim WETH, no attacker
  wv: number; // victim WETH, sandwiched
  slip: number; // extra slippage suffered
  victimAvg: number; // victim's realized price (USDC/WETH)
  reverted: boolean; // attack failed (couldn't profit within tolerance)
}

// Solve the searcher's optimal front-run F for a victim buy of V USDC under a
// slippage tolerance s. The victim reverts if their fill < wv0·(1-s); profit is
// gross of the (negligible, on Base) gas — see caption.
function solve(V: number, s: number): Result {
  const wv0 = buyWeth(V, RU0, RW0);
  const minOut = wv0 * (1 - s);

  // Victim's sandwiched fill as a function of F (monotonically decreasing in F).
  const victimFill = (F: number) => {
    const wf = buyWeth(F, RU0, RW0);
    return buyWeth(V, RU0 + F, RW0 - wf);
  };
  // Largest F the victim survives: victimFill(Fmax) == minOut (binary search).
  let lo = 0;
  let hi = RU0 * 4; // generous upper bound on front-run capital
  if (victimFill(hi) >= minOut) {
    // tolerance so loose even a huge front-run clears it; keep hi as the cap
  } else {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (victimFill(mid) >= minOut) lo = mid;
      else hi = mid;
    }
  }
  const Fmax = lo;

  // Searcher profit at front-run F: front-run buy, victim fills, back-run sell.
  const profitAt = (F: number) => {
    const wf = buyWeth(F, RU0, RW0);
    const ru1 = RU0 + F;
    const rw1 = RW0 - wf;
    const wv = buyWeth(V, ru1, rw1);
    const ru2 = ru1 + V;
    const rw2 = rw1 - wv;
    const back = sellWeth(wf, ru2, rw2);
    return back - F;
  };

  // Profit is unimodal in F; the tolerance caps the domain at Fmax. Scan a fine
  // grid over [0, Fmax] and keep the best (robust to the binding/non-binding case).
  let bestF = 0;
  let best = 0;
  const N = 400;
  for (let i = 1; i <= N; i++) {
    const F = (Fmax * i) / N;
    const p = profitAt(F);
    if (p > best) {
      best = p;
      bestF = F;
    }
  }

  const reverted = best <= 0 || bestF <= 0;
  const wf = buyWeth(bestF, RU0, RW0);
  const wv = reverted ? wv0 : buyWeth(V, RU0 + bestF, RW0 - wf);
  const slip = wv0 > 0 ? (wv0 - wv) / wv0 : 0;
  return {
    F: reverted ? 0 : bestF,
    profit: reverted ? 0 : best,
    roi: reverted || bestF <= 0 ? 0 : best / bestF,
    wv0,
    wv,
    slip: reverted ? 0 : slip,
    victimAvg: V / wv,
    reverted,
  };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    stageMin: 'clamp(190px, 44vw, 280px)',
  });

  const style = document.createElement('style');
  style.textContent = `
    .ss-stage { display:flex; flex-direction:column; gap:8px;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .ss-stagewrap { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 12px 8px; min-width:0; max-width:100%; }
    .ss-svgbox { position:relative; min-width:0; max-width:100%; }
    .ss-svgbox svg { width:100%; height:176px; display:block; }
    .ss-lab { position:absolute; transform:translate(-50%,-50%); font-size:9.5px;
      pointer-events:none; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .ss-axis { position:absolute; font-size:8.5px; color:#5b6378; pointer-events:none;
      white-space:nowrap; letter-spacing:.04em; }
    .ss-verdict { text-align:center; font-size:12px; color:#8d95ad; padding:1px 0 0;
      overflow-wrap:anywhere; }
    .ss-verdict b { font-size:12.5px; letter-spacing:.05em; }
    .ss-verdict.ss-hit b { color:#ff7a8a; }
    .ss-verdict.ss-safe b { color:#22d3ee; }
    .ss-verdict.ss-revert b { color:#f5b948; }

    .ss-controls { display:grid;
      grid-template-columns:repeat(auto-fit, minmax(min(170px,100%),1fr));
      gap:8px 16px; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .ss-field { min-width:0; max-width:100%; }
    .ss-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .ss-field label span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .ss-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; }
    .ss-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:3px 0 0; }
    .ss-field.ss-slip input { accent-color:#f5b948; }
    .ss-route { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .ss-route-btns { display:flex; gap:6px; flex-wrap:wrap; }
    .ss-route button { flex:1 1 auto; min-width:0; cursor:pointer;
      font:600 10px/1 'JetBrains Mono', monospace; letter-spacing:.04em;
      padding:7px 8px; border-radius:7px; border:1px solid rgba(124,140,255,.22);
      background:#0d1322; color:#8d95ad; transition:all .12s; }
    .ss-route button[aria-pressed=true] { border-color:#22d3ee; color:#dffaff;
      background:rgba(34,211,238,.10); }

    .ss-panels { display:grid; grid-template-columns:minmax(0,1fr); gap:10px;
      max-width:100%; font:500 12px/1.45 'JetBrains Mono', monospace; }
    .ss-panel { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:9px 12px; background:#0d1322; min-width:0; max-width:100%; }
    .ss-panel h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.12em; text-transform:uppercase; }
    .ss-panel.ss-att h3 { color:#ff7a8a; }
    .ss-panel.ss-vic h3 { color:#5b8cff; }
    .ss-panel dl { margin:0; display:grid;
      grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:3px 10px; max-width:100%; }
    .ss-panel dt { color:#5b6378; font-size:10px; min-width:0; }
    .ss-panel dd { margin:0; color:#e7eaf3; text-align:right;
      font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
    .ss-panel dd.neg { color:#ff7a8a; }
    .ss-panel dd.pos { color:#22d3ee; }
    .ss-note { text-align:center; font-size:9px; color:#5b6378; letter-spacing:.02em;
      line-height:1.5; font:500 9px/1.5 'JetBrains Mono', monospace; overflow-wrap:anywhere; }
  `;
  container.appendChild(style);

  const NS = 'http://www.w3.org/2000/svg';
  let routePrivate = false;

  /* ---- Stage: price-impact curve ---- */
  const stageRoot = layout.stage;
  stageRoot.className += ' ss-stage';
  const stageWrap = document.createElement('div');
  stageWrap.className = 'ss-stagewrap';
  const box = document.createElement('div');
  box.className = 'ss-svgbox';
  const svg = document.createElementNS(NS, 'svg');
  const VW = 600;
  const VH = 176;
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  box.appendChild(svg);
  stageWrap.appendChild(box);
  stageRoot.appendChild(stageWrap);

  const mkPath = (stroke: string, w: number, fill = 'none') => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', String(w));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    return p;
  };
  const fairArea = mkPath('none', 0, 'rgba(91,140,255,.16)');
  const feArea = mkPath('none', 0, 'rgba(91,140,255,.20)'); // searcher front-run leg
  const vicArea = mkPath('none', 0, 'rgba(255,122,138,.26)'); // your fill, elevated
  const curve = mkPath('rgba(124,140,255,.55)', 1.6);
  const fairLine = mkPath('#5b8cff', 1.3);
  fairLine.setAttribute('stroke-dasharray', '3 4');
  const backArrow = mkPath('#22d3ee', 1.4);
  backArrow.setAttribute('stroke-dasharray', '2 3');
  const mkDot = (c: string, r: number) => {
    const d = document.createElementNS(NS, 'circle');
    d.setAttribute('r', String(r));
    d.setAttribute('fill', c);
    svg.appendChild(d);
    return d;
  };
  const dotFront = mkDot('#ff7a8a', 4);
  const dotVic = mkDot('#5b8cff', 4);

  const mkLab = (c: string) => {
    const d = document.createElement('div');
    d.className = 'ss-lab';
    d.style.color = c;
    box.appendChild(d);
    return d;
  };
  const labFront = mkLab('#ff7a8a');
  const labVic = mkLab('#5b8cff');
  const labFair = mkLab('#7c8cff');
  const axX = document.createElement('div');
  axX.className = 'ss-axis';
  axX.textContent = 'spot price ↑   WETH bought from pool →';
  axX.style.left = '10px';
  axX.style.top = '3px';
  box.appendChild(axX);

  const verdict = document.createElement('div');
  verdict.className = 'ss-verdict';
  stageRoot.appendChild(verdict);

  /* ---- Panels ---- */
  const panels = layout.panel;
  panels.className += ' ss-panels';
  const mkPanel = (cls: string, title: string, rows: string[]) => {
    const panel = document.createElement('div');
    panel.className = `ss-panel ${cls}`;
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
  const attDds = mkPanel('ss-att', 'the searcher', ['front-run', 'gross profit', 'return on capital']);
  const vicDds = mkPanel('ss-vic', 'your agent', ['WETH received', 'vs fair fill', 'effective slippage']);

  /* ---- Controls ---- */
  const controls = layout.controls;
  controls.className += ' ss-controls';
  const mkSlider = (
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    slip = false,
  ) => {
    const field = document.createElement('div');
    field.className = 'ss-field' + (slip ? ' ss-slip' : '');
    const lab = document.createElement('label');
    lab.htmlFor = `ss-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `ss-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };

  const size = mkSlider('size', 'your trade size (USDC)', 1000, 1_500_000, 1000, 250_000);
  const slip = mkSlider('slip', 'slippage tolerance', 0.001, 0.05, 0.001, 0.01, true);

  const routeWrap = document.createElement('div');
  routeWrap.className = 'ss-field ss-route';
  const routeLab = document.createElement('label');
  const routeName = document.createElement('span');
  routeName.textContent = 'transaction routing';
  routeLab.appendChild(routeName);
  const btns = document.createElement('div');
  btns.className = 'ss-route-btns';
  const btnPublic = document.createElement('button');
  btnPublic.type = 'button';
  btnPublic.textContent = 'PUBLIC MEMPOOL';
  const btnPrivate = document.createElement('button');
  btnPrivate.type = 'button';
  btnPrivate.textContent = 'PRIVATE ORDERFLOW';
  btns.append(btnPublic, btnPrivate);
  routeWrap.append(routeLab, btns);
  controls.appendChild(routeWrap);

  const caption = layout.caption;
  caption.className += ' ss-note';
  caption.textContent =
    `pool = live Aerodrome volatile WETH/USDC on Base (${RW0.toFixed(0)} WETH · ${(RU0 / 1e6).toFixed(2)}M USDC, 0.30% fee), read on-chain — ETH ≈ $${P0.toFixed(0)}. ` +
    'Searcher gas is negligible on Base; profit shown gross. Private orderflow (MEV Blocker, ~1.3–1.9 block delay) or Shutter\'s encrypted mempool (~3 min on Gnosis) hides the trade — at a latency cost.';

  /* ---- Render ---- */
  function render() {
    const V = Number(size.input.value);
    const s = Number(slip.input.value);
    size.out.textContent = fmtUsd(V);
    slip.out.textContent = pct(s, 1);

    btnPublic.setAttribute('aria-pressed', String(!routePrivate));
    btnPrivate.setAttribute('aria-pressed', String(routePrivate));

    const r = solve(V, s);
    const protectedRoute = routePrivate;

    // Panels
    if (protectedRoute) {
      attDds[0]!.textContent = '— hidden —';
      attDds[1]!.textContent = '$0.00';
      attDds[1]!.className = 'pos';
      attDds[2]!.textContent = '—';
      vicDds[0]!.textContent = `${r.wv0.toFixed(4)} WETH`;
      vicDds[1]!.textContent = 'no loss';
      vicDds[1]!.className = 'pos';
      vicDds[2]!.textContent = '0 bps';
    } else {
      attDds[0]!.textContent = r.reverted ? '— none —' : fmtUsd(r.F);
      attDds[1]!.textContent = fmtUsd(r.profit);
      attDds[1]!.className = r.profit > 0 ? 'neg' : '';
      attDds[2]!.textContent = r.reverted ? '—' : pct(r.roi, 2);
      vicDds[0]!.textContent = `${r.wv.toFixed(4)} WETH`;
      vicDds[1]!.textContent = r.reverted ? `${r.wv0.toFixed(4)} WETH` : `${r.wv0.toFixed(4)} (−${(r.wv0 - r.wv).toFixed(4)})`;
      vicDds[1]!.className = r.reverted ? 'pos' : 'neg';
      vicDds[2]!.textContent = `${Math.round(r.slip * 10000)} bps`;
    }

    // Verdict
    if (protectedRoute) {
      verdict.className = 'ss-verdict ss-safe';
      verdict.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = 'PROTECTED';
      verdict.append(b, ' — off the public mempool, the searcher never sees the trade.');
    } else if (r.reverted) {
      verdict.className = 'ss-verdict ss-revert';
      verdict.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = 'NO PROFITABLE SANDWICH';
      verdict.append(b, ` — ${pct(s, 1)} tolerance is tight enough to starve the attack here.`);
    } else {
      verdict.className = 'ss-verdict ss-hit';
      verdict.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = `EXTRACTED ${fmtUsd(r.profit)}`;
      verdict.append(b, ` — ${pct(r.profit / V, 2)} of your ${fmtUsd(V)} trade, taken in one block.`);
    }

    drawCurve(r, protectedRoute);
  }

  // Spot price after `w` WETH has been removed from the pool: P(w)=k/(Rw0-w)^2.
  const priceAt = (w: number) => K / Math.pow(RW0 - w, 2);

  const PX = { l: 8, r: 10, t: 16, b: 16 };
  function drawCurve(r: Result, protectedRoute: boolean) {
    const wv0 = r.wv0;
    const wf = protectedRoute || r.reverted ? 0 : buyWeth(r.F, RU0, RW0);
    const wv = protectedRoute ? wv0 : r.wv;
    const wEnd = wf + wv;
    const wMax = Math.max(wEnd, wv0) * 1.18 + 1e-9;

    const pLo = P0;
    const pHi = priceAt(wMax) * 1.01;
    const xOf = (w: number) => PX.l + (w / wMax) * (VW - PX.l - PX.r);
    const yOf = (p: number) =>
      VH - PX.b - ((Math.min(p, pHi) - pLo) / (pHi - pLo)) * (VH - PX.t - PX.b);

    // Main spot-price curve.
    {
      let d = '';
      const N = 90;
      for (let i = 0; i <= N; i++) {
        const w = (wMax * i) / N;
        d += `${i ? 'L' : 'M'}${xOf(w).toFixed(1)} ${yOf(priceAt(w)).toFixed(1)} `;
      }
      curve.setAttribute('d', d);
    }

    const areaUnder = (w0: number, w1: number) => {
      if (w1 <= w0) return '';
      let d = `M${xOf(w0).toFixed(1)} ${(VH - PX.b).toFixed(1)} `;
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const w = w0 + ((w1 - w0) * i) / N;
        d += `L${xOf(w).toFixed(1)} ${yOf(priceAt(w)).toFixed(1)} `;
      }
      d += `L${xOf(w1).toFixed(1)} ${(VH - PX.b).toFixed(1)} Z`;
      return d;
    };

    if (protectedRoute || r.reverted) {
      // Fair fill only: the victim buys [0, wv0] at the un-manipulated curve.
      fairArea.setAttribute('d', areaUnder(0, wv0));
      feArea.setAttribute('d', '');
      vicArea.setAttribute('d', '');
      backArrow.setAttribute('d', '');
      dotFront.setAttribute('opacity', '0');
      const xv = xOf(wv0);
      const yv = yOf(priceAt(wv0));
      dotVic.setAttribute('cx', String(xv));
      dotVic.setAttribute('cy', String(yv));
      dotVic.setAttribute('opacity', '1');
      // Fair price guide line.
      fairLine.setAttribute('d', `M${xOf(0)} ${yOf(P0)} L${xOf(wMax)} ${yOf(P0)}`);
      place(labFair, xOf(0) + 4, yOf(P0), `fair $${P0.toFixed(0)}`, -8, 'left');
      place(labVic, xv, yv, `you fill here`, -10);
      labFront.textContent = '';
    } else {
      // Sandwiched path: searcher front-runs [0,wf], victim fills [wf, wf+wv].
      feArea.setAttribute('d', areaUnder(0, wf));
      vicArea.setAttribute('d', areaUnder(wf, wEnd));
      fairArea.setAttribute('d', ''); // counterfactual region would sit hidden under the legs
      // Fair price guide: where the spot sat before the front-run.
      fairLine.setAttribute('d', `M${xOf(0)} ${yOf(P0)} L${xOf(wMax)} ${yOf(P0)}`);

      const xf = xOf(wf);
      const yf = yOf(priceAt(wf));
      dotFront.setAttribute('cx', String(xf));
      dotFront.setAttribute('cy', String(yf));
      dotFront.setAttribute('opacity', '1');
      const xv = xOf(wEnd);
      const yv = yOf(priceAt(wEnd));
      dotVic.setAttribute('cx', String(xv));
      dotVic.setAttribute('cy', String(yv));
      dotVic.setAttribute('opacity', '1');

      // Back-run: searcher sells, price returns toward fair (arrow down-left).
      backArrow.setAttribute('d', `M${xv} ${yv} L${xOf(wf)} ${yOf(priceAt(0))}`);

      place(labFront, xf, yf, 'front-run', -10);
      place(labVic, xv, yv, `you pay $${r.victimAvg.toFixed(0)}`, -10);
      place(labFair, xOf(0) + 4, yOf(P0), `fair $${P0.toFixed(0)}`, -8, 'left');
    }
  }

  function place(el: HTMLElement, x: number, y: number, text: string, dy = -10, align = 'center') {
    const clampedX = Math.min(Math.max(x, 36), VW - 36);
    el.style.left = `${(clampedX / VW) * 100}%`;
    el.style.top = `${((y + dy) / VH) * 100}%`;
    el.style.transform = align === 'left' ? 'translate(0,-50%)' : 'translate(-50%,-50%)';
    if (align === 'left') el.style.left = `${(x / VW) * 100}%`;
    el.textContent = text;
  }

  const onRoute = (priv: boolean) => () => {
    routePrivate = priv;
    render();
  };
  const onPub = onRoute(false);
  const onPriv = onRoute(true);
  btnPublic.addEventListener('click', onPub);
  btnPrivate.addEventListener('click', onPriv);
  const onInput = () => render();
  size.input.addEventListener('input', onInput);
  slip.input.addEventListener('input', onInput);
  render();

  return () => {
    btnPublic.removeEventListener('click', onPub);
    btnPrivate.removeEventListener('click', onPriv);
    size.input.removeEventListener('input', onInput);
    slip.input.removeEventListener('input', onInput);
    style.remove();
    layout.dispose();
  };
}
