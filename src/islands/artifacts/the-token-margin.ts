/**
 * Artifact: the-token-margin — The Token Margin
 * Manifest: content/artifacts/the-token-margin/manifest.json
 *
 * SVG lognormal distribution showing the fraction of LLM invocations that
 * beat break-even for a given task complexity, model tier, and profit target.
 * Parameterised from Bai et al. arXiv:2604.22750 (30× within-task variance).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-token-margin/data.json';

type TaskScenario = { id: string; label: string; note: string; medianK: number; logSd: number };
type ModelTier    = { id: string; label: string; costPerMk: number; color: string };
const data = rawData as {
  taskScenarios: TaskScenario[];
  modelTiers: ModelTier[];
};

// ── Abramowitz & Stegun normal CDF approximation ─────────────────────────────
function normcdf(z: number): number {
  if (z < -7) return 0;
  if (z >  7) return 1;
  const b = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  let t = 1 / (1 + 0.2316419 * Math.abs(z));
  let poly = 0, tp = t;
  for (const c of b) { poly += c * tp; tp *= t; }
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const p = 1 - phi * poly;
  return z >= 0 ? p : 1 - p;
}

function lnpdf(x: number, mu: number, sigma: number): number {
  if (x <= 0) return 0;
  const lx = Math.log(x);
  return Math.exp(-0.5 * ((lx - mu) / sigma) ** 2) / (x * sigma * Math.sqrt(2 * Math.PI));
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toFixed(0);
}

function fmtUsd(v: number): string {
  if (v < 0.0001)  return '<$0.0001';
  if (v < 0.01)    return `$${v.toFixed(4)}`;
  if (v < 1)       return `$${v.toFixed(3)}`;
  if (v < 1000)    return `$${v.toFixed(2)}`;
  return `$${v.toFixed(0)}`;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '760/400',
    stageFr: '1.6fr',
  });
  const { stage, panel, controls, caption } = layout;

  // ── State ─────────────────────────────────────────────────────────────────
  let taskIdx  = 2;   // arb calculation
  let modelIdx = 1;   // sonnet-class
  let profitUsd = 1.0; // $1.00 per decision

  // ── SVG constants ─────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const W = 760, H = 400;
  const X0 = 72, X1 = 726, Y0 = 30, Y1 = 348;
  const PW = X1 - X0, PH = Y1 - Y0;
  const LN_XMIN = Math.log(1_000);
  const LN_XMAX = Math.log(50_000_000);
  const LN_RANGE = LN_XMAX - LN_XMIN;

  function xToSvg(tokens: number): number {
    return X0 + (Math.log(Math.max(1, tokens)) - LN_XMIN) / LN_RANGE * PW;
  }
  function lnxToSvg(lnX: number): number {
    return X0 + (lnX - LN_XMIN) / LN_RANGE * PW;
  }
  function yToSvg(val: number, yMax: number): number {
    return Y1 - (val / yMax) * PH;
  }

  // ── Build SVG skeleton ────────────────────────────────────────────────────
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';
  stage.appendChild(svg);

  function el<K extends keyof SVGElementTagNameMap>(
    tag: K, attrs: Record<string, string> = {},
  ): SVGElementTagNameMap[K] {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // Background
  svg.appendChild(el('rect', { x:'0', y:'0', width:String(W), height:String(H), fill:'#0d1117' }));

  // Clip to plot area
  const defs = el('defs');
  const clipPath = el('clipPath', { id:'tm-clip' });
  clipPath.appendChild(el('rect', {
    x:String(X0), y:String(Y0), width:String(PW), height:String(PH),
  }));
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  // Grid lines
  const gridG = el('g');
  svg.appendChild(gridG);

  // Colour fills (below the PDF curve)
  const fillG = el('g', { 'clip-path':'url(#tm-clip)' });
  const greenFill  = el('path', { fill:'#162a1f' });
  const orangeFill = el('path', { fill:'#261508' });
  fillG.appendChild(greenFill);
  fillG.appendChild(orangeFill);
  svg.appendChild(fillG);

  // PDF curve (on top of fills)
  const curveG = el('g', { 'clip-path':'url(#tm-clip)' });
  const curvePath = el('path', { fill:'none', 'stroke-width':'2' });
  curveG.appendChild(curvePath);
  svg.appendChild(curveG);

  // Break-even vertical dashed line
  const beG = el('g', { 'clip-path':'url(#tm-clip)' });
  const beLine = el('line', {
    stroke:'#e2c97e', 'stroke-width':'1.5', 'stroke-dasharray':'5,4',
    y1:String(Y0), y2:String(Y1),
  });
  beG.appendChild(beLine);
  svg.appendChild(beG);

  // Median vertical line (clip not needed — always within chart)
  const medG = el('g', { 'clip-path':'url(#tm-clip)' });
  const medLine = el('line', {
    stroke:'#7c8cff', 'stroke-width':'1', 'stroke-dasharray':'3,3',
    y1:String(Y0), y2:String(Y1),
  });
  medG.appendChild(medLine);
  svg.appendChild(medG);

  // Break-even label (above clip, clamp x to chart bounds)
  const beLabel = el('text', {
    'font-size':'9', fill:'#e2c97e', 'text-anchor':'middle', 'font-family':'monospace',
  });
  svg.appendChild(beLabel);

  // ── Axes ──────────────────────────────────────────────────────────────────
  svg.appendChild(el('line', {
    x1:String(X0), x2:String(X1), y1:String(Y1), y2:String(Y1), stroke:'#2a2f3a',
  }));
  svg.appendChild(el('line', {
    x1:String(X0), x2:String(X0), y1:String(Y0), y2:String(Y1), stroke:'#2a2f3a',
  }));

  // X-axis label
  const xLabelEl = el('text', {
    x:String((X0 + X1) / 2), y:String(H - 6),
    'text-anchor':'middle', 'font-size':'10', fill:'#666',
  });
  xLabelEl.textContent = 'tokens consumed (log scale)';
  svg.appendChild(xLabelEl);

  // Y-axis label (rotated)
  const yLabelEl = el('text', {
    x: String(-(Y0 + PH / 2)), y:'14',
    'text-anchor':'middle', 'font-size':'10', fill:'#666',
    transform:'rotate(-90)',
  });
  yLabelEl.textContent = 'probability density';
  svg.appendChild(yLabelEl);

  // X-axis ticks
  const TICKS: [number, string][] = [
    [1_000,'1K'],[5_000,'5K'],[10_000,'10K'],[50_000,'50K'],
    [100_000,'100K'],[500_000,'500K'],[1_000_000,'1M'],
    [5_000_000,'5M'],[10_000_000,'10M'],[50_000_000,'50M'],
  ];
  for (const [v, lbl] of TICKS) {
    const x = xToSvg(v);
    if (x < X0 || x > X1) continue;
    svg.appendChild(el('line', {
      x1:String(x), x2:String(x), y1:String(Y1), y2:String(Y1+4), stroke:'#2a2f3a',
    }));
    const t = el('text', {
      x:String(x), y:String(Y1+14), 'text-anchor':'middle', 'font-size':'9', fill:'#555',
    });
    t.textContent = lbl;
    svg.appendChild(t);
    const gl = el('line', {
      x1:String(x), x2:String(x), y1:String(Y0), y2:String(Y1),
      stroke:'#1a2030', 'stroke-width':'1',
    });
    gridG.appendChild(gl);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
.tm-tabs { display:flex; gap:5px; flex-wrap:wrap; }
.tm-tab {
  padding:5px 10px; border-radius:5px; cursor:pointer; font-size:12px;
  border:1px solid #252d3a; background:#0d1117; color:#888;
  transition:background .15s, border-color .15s, color .15s;
}
.tm-tab:hover { border-color:#444; color:#ccc; }
.tm-tab.tm-active {
  color:#e6edf3;
  border-color:var(--tab-color,#7c8cff);
  background: color-mix(in srgb, var(--tab-color,#7c8cff) 18%, transparent);
}
.tm-section { font-size:10px; color:#555; text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
.tm-slider { width:100%; accent-color:#e2c97e; cursor:pointer; margin-top:2px; }
.tm-row {
  display:flex; justify-content:space-between; gap:8px; padding:4px 0;
  border-bottom:1px solid #1a1f26; font-size:12px;
}
.tm-row:last-child { border-bottom:none; }
.tm-key { color:#666; }
.tm-val { color:#e6edf3; font-variant-numeric:tabular-nums; text-align:right; font-family:monospace; }
.tm-verdict {
  margin-top:10px; padding:8px 12px; border-radius:6px; text-align:center;
  font-size:13px; font-weight:600; letter-spacing:.05em;
}
.tm-verdict.tm-invoke { background:#162a1f; color:#5fd39b; border:1px solid #2d5a3d; }
.tm-verdict.tm-cache  { background:#151826; color:#7c8cff; border:1px solid #2d3a5a; }
.tm-verdict.tm-skip   { background:#261508; color:#f0883e; border:1px solid #5a3a1a; }
`;
  container.appendChild(style);

  // ── Controls markup ───────────────────────────────────────────────────────
  controls.innerHTML = `
<div style="display:flex;flex-direction:column;gap:12px;">
  <div>
    <div class="tm-section">Task complexity</div>
    <div class="tm-tabs" id="tm-task-tabs"></div>
  </div>
  <div>
    <div class="tm-section">Model tier</div>
    <div class="tm-tabs" id="tm-model-tabs"></div>
  </div>
  <div>
    <div class="afl-split" style="font-size:12px;">
      <span class="tm-section" style="margin:0;">Profit per decision</span>
      <span id="tm-profit-lbl" style="color:#e2c97e;font-weight:600;font-size:12px;font-family:monospace;"></span>
    </div>
    <input type="range" class="tm-slider" id="tm-profit-range" min="-2" max="2" step="0.02" value="0">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#444;margin-top:2px;">
      <span>$0.01</span><span>$1</span><span>$100</span>
    </div>
  </div>
</div>
`;

  // ── Panel markup ──────────────────────────────────────────────────────────
  panel.innerHTML = `
<div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
  <div class="tm-section">Invocation economics</div>
  <div id="tm-stat-rows"></div>
  <div id="tm-verdict" class="tm-verdict tm-invoke"></div>
</div>
`;

  // ── Caption ───────────────────────────────────────────────────────────────
  caption.innerHTML = `
<div style="font-size:10px;color:#555;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;">
  <span style="color:#5fd39b;">■</span>&nbsp;profitable &nbsp;
  <span style="color:#f0883e;">■</span>&nbsp;loss-making &nbsp;
  <span style="color:#e2c97e;">╌</span>&nbsp;break-even &nbsp;
  <span style="color:#7c8cff;">╌</span>&nbsp;median tokens &nbsp; · &nbsp;
  Distribution anchored to Bai et al. arXiv:2604.22750 (30× variance, Apr 2026)
</div>
`;

  // ── Wire tabs ─────────────────────────────────────────────────────────────
  const taskTabsEl  = controls.querySelector('#tm-task-tabs')  as HTMLElement;
  const modelTabsEl = controls.querySelector('#tm-model-tabs') as HTMLElement;

  data.taskScenarios.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'tm-tab' + (i === taskIdx ? ' tm-active' : '');
    btn.title = t.note;
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      taskIdx = i;
      taskTabsEl.querySelectorAll('.tm-tab').forEach((b, j) =>
        b.classList.toggle('tm-active', j === i));
      render();
    });
    taskTabsEl.appendChild(btn);
  });

  data.modelTiers.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'tm-tab' + (i === modelIdx ? ' tm-active' : '');
    btn.style.setProperty('--tab-color', m.color);
    btn.title = m.label;
    btn.textContent = `T${i + 1} · $${m.costPerMk}/Mk`;
    btn.addEventListener('click', () => {
      modelIdx = i;
      modelTabsEl.querySelectorAll<HTMLElement>('.tm-tab').forEach((b, j) => {
        b.style.setProperty('--tab-color', data.modelTiers[j].color);
        b.classList.toggle('tm-active', j === i);
      });
      render();
    });
    modelTabsEl.appendChild(btn);
  });

  // ── Profit slider ─────────────────────────────────────────────────────────
  const profitRange = controls.querySelector('#tm-profit-range') as HTMLInputElement;
  const profitLbl   = controls.querySelector('#tm-profit-lbl')   as HTMLElement;

  profitRange.addEventListener('input', () => {
    profitUsd = Math.pow(10, parseFloat(profitRange.value));
    render();
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  const N = 500; // curve sample count

  function render(): void {
    const task  = data.taskScenarios[taskIdx];
    const model = data.modelTiers[modelIdx];

    // Lognormal params (tokens, not kilo-tokens)
    const mu    = Math.log(task.medianK * 1_000);
    const sigma = task.logSd;

    // Sample PDF
    const pts: [number, number][] = [];
    let yMax = 0;
    for (let i = 0; i <= N; i++) {
      const lnX = LN_XMIN + (i / N) * LN_RANGE;
      const x   = Math.exp(lnX);
      const y   = lnpdf(x, mu, sigma);
      pts.push([xToSvg(x), y]);
      if (y > yMax) yMax = y;
    }
    if (yMax === 0) yMax = 1;
    const scale = yMax * 1.12;

    // Break-even: tokens at which cost = profitUsd
    // cost (USD) = tokens / 1_000_000 * costPerMk   →   tokens = profitUsd * 1e6 / costPerMk
    const beTokens = (profitUsd * 1_000_000) / model.costPerMk;
    const beX = Math.max(X0, Math.min(X1, xToSvg(beTokens)));

    // P(profitable) = P(tokens ≤ beTokens)
    const zBe     = (Math.log(Math.max(1, beTokens)) - mu) / sigma;
    const pProfit = normcdf(zBe);

    // Build SVG curve + split fills
    let curveD = '', greenD = '', orangeD = '';
    let pastBe = false;

    for (let i = 0; i <= N; i++) {
      const [sx, rawY] = pts[i];
      const sy = yToSvg(rawY, scale);
      const first = i === 0;
      if (first) {
        curveD = `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        greenD = `M ${X0} ${Y1} L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      } else {
        curveD += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        if (!pastBe && sx >= beX) {
          // interpolate break-even y
          const [psx, pRawY] = pts[i - 1];
          const frac = (beX - psx) / Math.max(0.001, sx - psx);
          const beY = yToSvg(pRawY + frac * (rawY - pRawY), scale);
          greenD  += ` L ${beX.toFixed(1)} ${beY.toFixed(1)} L ${beX.toFixed(1)} ${Y1} Z`;
          orangeD  = `M ${beX.toFixed(1)} ${Y1} L ${beX.toFixed(1)} ${beY.toFixed(1)} L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
          pastBe = true;
        } else if (!pastBe) {
          greenD += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        } else {
          orangeD += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
      }
    }
    if (!pastBe) {
      // entire curve left of break-even → all profitable
      greenD  += ` L ${X1} ${Y1} Z`;
      orangeD  = '';
    } else {
      orangeD += ` L ${X1} ${Y1} Z`;
    }

    curvePath.setAttribute('d', curveD);
    curvePath.setAttribute('stroke', model.color);
    greenFill.setAttribute('d', greenD);
    orangeFill.setAttribute('d', orangeD);

    // Break-even line
    const beVisible = beTokens >= Math.exp(LN_XMIN) && beTokens <= Math.exp(LN_XMAX);
    beLine.setAttribute('x1', String(beX)); beLine.setAttribute('x2', String(beX));
    beLine.style.display = beVisible ? '' : 'none';

    const beLabelX = Math.max(X0 + 28, Math.min(X1 - 28, beX));
    beLabel.setAttribute('x', String(beLabelX));
    beLabel.setAttribute('y', String(Y0 - 6));
    beLabel.textContent = beVisible ? `break-even: ${fmtTokens(beTokens)}` : '';

    // Median line
    const medX = xToSvg(task.medianK * 1_000);
    medLine.setAttribute('x1', String(medX)); medLine.setAttribute('x2', String(medX));

    // Panel stats
    const costMedian = (task.medianK * 1_000 / 1_000_000) * model.costPerMk;
    const costP10    = (Math.exp(mu - 1.282 * sigma) / 1_000_000) * model.costPerMk;
    const costP90    = (Math.exp(mu + 1.282 * sigma) / 1_000_000) * model.costPerMk;
    const pColor     = pProfit >= 0.65 ? '#5fd39b' : pProfit >= 0.38 ? '#e2c97e' : '#f0883e';

    const rowsEl = panel.querySelector('#tm-stat-rows') as HTMLElement;
    rowsEl.innerHTML = `
<div class="tm-row"><span class="tm-key">cost/Mk token</span><span class="tm-val">$${model.costPerMk.toFixed(2)}</span></div>
<div class="tm-row"><span class="tm-key">median cost</span><span class="tm-val">${fmtUsd(costMedian)}</span></div>
<div class="tm-row"><span class="tm-key">P10 cost</span><span class="tm-val">${fmtUsd(costP10)}</span></div>
<div class="tm-row"><span class="tm-key">P90 cost</span><span class="tm-val">${fmtUsd(costP90)}</span></div>
<div class="tm-row"><span class="tm-key">break-even at</span><span class="tm-val">${fmtTokens(beTokens)} tok</span></div>
<div class="tm-row"><span class="tm-key">profit/call</span><span class="tm-val">$${profitUsd < 1 ? profitUsd.toFixed(3) : profitUsd.toFixed(2)}</span></div>
<div class="tm-row"><span class="tm-key">P(profitable)</span><span class="tm-val" style="color:${pColor};font-weight:600;">${(pProfit * 100).toFixed(1)} %</span></div>
`;

    // Verdict
    const verdictEl = panel.querySelector('#tm-verdict') as HTMLElement;
    let vText: string, vCls: string;
    if (pProfit >= 0.65) {
      vText = `INVOKE  —  ${(pProfit * 100).toFixed(0)} % profitable`; vCls = 'tm-invoke';
    } else if (pProfit >= 0.38) {
      vText = `CACHE / OPTIMIZE  —  borderline`; vCls = 'tm-cache';
    } else {
      vText = `SKIP / RETHINK  —  ${(pProfit * 100).toFixed(0)} % profitable`; vCls = 'tm-skip';
    }
    verdictEl.textContent = vText;
    verdictEl.className = `tm-verdict ${vCls}`;

    // Profit label
    profitLbl.textContent = profitUsd >= 10
      ? `$${profitUsd.toFixed(0)}`
      : profitUsd >= 1
      ? `$${profitUsd.toFixed(2)}`
      : `$${profitUsd.toFixed(3)}`;
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
