/**
 * Artifact: recursive-leverage-chain — Recursive Leverage Chain
 *
 * SVG calculator: deposit-borrow-buy loops compound leverage toward the
 * 1/(1−LTV) asymptote. Stage shows the leverage curve over 1–8 loops
 * with danger-zone shading and the theoretical max as a dashed line.
 * Panel: effective leverage, liquidation trigger, health factor, loss.
 * Controls: LTV slider (50–82%), loop-count buttons (1–8).
 */
import data from '../../../content/artifacts/recursive-leverage-chain/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 700;
const VB_H = 300;

// Chart drawing area (viewBox coords)
const CX1 = 72;   // left  x
const CX2 = 645;  // right x
const CY1 = 25;   // top   y
const CY2 = 245;  // bottom y (x-axis baseline)
const MAX_HOPS = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Effective leverage for N loops at LTV l: sum of geometric series
function calcLev(l: number, n: number): number {
  return (1 - Math.pow(l, n + 1)) / (1 - l);
}

// Map leverage value → chart Y (CY2 = 1×, CY1 = chartMax×)
function levY(lev: number, chartMax: number): number {
  return CY2 - clamp((lev - 1) / (chartMax - 1), 0, 1.15) * (CY2 - CY1);
}

// Map hop index (1-based) → chart X
function hopX(hop: number): number {
  return CX1 + ((hop - 1) / (MAX_HOPS - 1)) * (CX2 - CX1);
}

function fmt2(v: number): string { return `${v.toFixed(2)}×`; }
function fmtPct(v: number, d = 1): string { return `${(v * 100).toFixed(d)}%`; }

interface State { ltv: number; hops: number; }

function compute(s: State) {
  const { liqThreshold, liqBonus } = data.weth;
  const ep = data.ethPrice;
  const maxLev = 1 / (1 - s.ltv);
  const levs = Array.from({ length: MAX_HOPS }, (_, i) => calcLev(s.ltv, i + 1));
  const selLev = levs[s.hops - 1];
  // HF = liqThreshold / LTV — constant regardless of loop count
  const hf = liqThreshold / s.ltv;
  // Price drop that triggers liquidation
  const liqTrig = 1 - s.ltv / liqThreshold;
  // Total WETH deposited as collateral across all loops
  const totalColl = (1 - Math.pow(s.ltv, s.hops)) / (1 - s.ltv);
  // Total USDC debt
  const totalDebt = s.ltv * totalColl * ep;
  // Liquidation price (ETH)
  const pLiq = s.ltv * ep / liqThreshold;
  // WETH seized by liquidator (repays all debt + bonus)
  const seized = totalDebt * (1 + liqBonus) / pLiq;
  // WETH remaining after liquidation
  const remaining = Math.max(0, selLev - seized);
  // Fraction of initial 1 ETH value lost
  const loss = Math.max(0, (ep - remaining * pLiq) / ep);
  return { maxLev, levs, selLev, hf, liqTrig, loss };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VB_W}/${VB_H}`,
    stageFr: '1.6fr',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rlc-svg { width:100%; height:100%; display:block; overflow:visible; }
    .rlc-panel { display:flex; flex-direction:column; gap:6px; min-width:0;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; }
    .rlc-statbox { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 13px; display:flex; flex-direction:column; gap:9px; }
    .rlc-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .rlc-lbl { font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .rlc-val { font-size:15px; color:#e7eaf3; font-variant-numeric:tabular-nums; font-weight:700; }
    .rlc-sub { font-size:10px; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .rlc-val.amber { color:#f59e0b; }
    .rlc-val.red   { color:#f87171; }
    .rlc-val.green { color:#34d399; }
    .rlc-ctrls { display:flex; flex-direction:column; gap:9px; min-width:0; }
    .rlc-field { min-width:0; }
    .rlc-field label { display:flex; justify-content:space-between; align-items:baseline;
      gap:6px; min-width:0; font:500 10px/1.3 'JetBrains Mono',monospace;
      letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .rlc-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; }
    .rlc-field input[type=range] { width:100%; cursor:pointer; background:transparent;
      margin:4px 0 0; accent-color:#f59e0b; }
    .rlc-tabrow { display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap; }
    .rlc-rowlbl { font:500 10px/1.3 'JetBrains Mono',monospace; letter-spacing:.06em;
      text-transform:uppercase; color:#5b6378; white-space:nowrap; flex:none; }
    .rlc-tabs { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .rlc-tab { border:1px solid rgba(124,140,255,.25); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad; font:600 10px 'JetBrains Mono',monospace;
      letter-spacing:.04em; text-transform:uppercase; padding:5px 9px; white-space:nowrap; }
    .rlc-tab:hover,.rlc-tab:focus-visible { border-color:#f59e0b; color:#e7eaf3; outline:none; }
    .rlc-tab.on { background:rgba(245,158,11,.12); border-color:#f59e0b;
      color:#f59e0b; box-shadow:0 0 8px rgba(245,158,11,.18); }
    .rlc-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .rlc-cap b { color:#8d95ad; }
  `;
  stage.appendChild(style);

  const state: State = { ltv: data.weth.ltv, hops: 3 };

  /* ── SVG scaffold ─────────────────────────────────────────── */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'rlc-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Recursive leverage curve: multiplier vs borrow loops');

  const mk = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
    return el;
  };

  // Outer background + chart background
  mk('rect', { x: 0, y: 0, width: VB_W, height: VB_H, fill: 'rgba(7,10,22,.85)' });
  mk('rect', {
    x: CX1, y: CY1, width: CX2 - CX1, height: CY2 - CY1,
    fill: '#070a16', rx: 3, stroke: 'rgba(124,140,255,.1)', 'stroke-width': 1,
  });

  // Danger/caution zone bands (updated per render)
  const zoneRed = mk('rect', { x: CX1, width: CX2 - CX1, fill: 'rgba(248,113,113,.07)' });
  const zoneAmber = mk('rect', { x: CX1, width: CX2 - CX1, fill: 'rgba(245,158,11,.065)' });

  // Y grid lines at integer multiples (1× 2× 3× …)
  const Y_VALS = [1, 2, 3, 4, 5, 6];
  const yLines = Y_VALS.map(() =>
    mk('line', { x1: CX1, x2: CX2, stroke: 'rgba(124,140,255,.09)', 'stroke-width': 1 })
  );
  const yLabels = Y_VALS.map(() =>
    mk('text', {
      x: CX1 - 7, 'text-anchor': 'end', 'font-size': 8.5, fill: '#3d4460',
      'font-family': "'JetBrains Mono',monospace", 'font-variant-numeric': 'tabular-nums',
    })
  );

  // X axis: hop-count labels
  for (let h = 1; h <= MAX_HOPS; h++) {
    const lbl = mk('text', {
      x: hopX(h), y: CY2 + 14, 'text-anchor': 'middle',
      'font-size': 8.5, fill: '#3d4460',
      'font-family': "'JetBrains Mono',monospace",
    });
    lbl.textContent = String(h);
  }

  // Axis titles
  const xTitle = mk('text', {
    x: (CX1 + CX2) / 2, y: VB_H - 8, 'text-anchor': 'middle',
    'font-size': 7.5, fill: '#2a3050', 'letter-spacing': '.08em',
    'font-family': "'JetBrains Mono',monospace",
  });
  xTitle.textContent = 'BORROW LOOPS';

  const yTitle = mk('text', {
    x: 12, y: (CY1 + CY2) / 2, 'text-anchor': 'middle',
    transform: `rotate(-90, 12, ${(CY1 + CY2) / 2})`,
    'font-size': 7.5, fill: '#2a3050', 'letter-spacing': '.08em',
    'font-family': "'JetBrains Mono',monospace",
  });
  yTitle.textContent = 'LEVERAGE';

  // Asymptote: dashed red line at theoretical max
  const asymLine = mk('line', {
    x1: CX1, x2: CX2,
    stroke: 'rgba(248,113,113,.5)', 'stroke-width': 1.2, 'stroke-dasharray': '5,4',
  });
  const asymLbl = mk('text', {
    x: CX2 - 3, 'text-anchor': 'end', 'font-size': 7.5, fill: 'rgba(248,113,113,.7)',
    'font-family': "'JetBrains Mono',monospace", 'font-weight': 700,
  });

  // Area fill under the curve
  const curveArea = mk('polygon', { fill: 'rgba(245,158,11,.07)' });

  // Leverage curve polyline
  const curveLine = mk('polyline', {
    fill: 'none', stroke: '#f59e0b', 'stroke-width': 2.2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });

  // Small dots at each hop
  const hopDots = Array.from({ length: MAX_HOPS }, () =>
    mk('circle', { r: 3.2, fill: '#070a16', stroke: '#f59e0b', 'stroke-width': 1.5 })
  );

  // Selected hop: glow ring + solid dot
  const selGlow = mk('circle', { r: 9, fill: 'rgba(245,158,11,.15)' });
  const selDot = mk('circle', { r: 5.5, fill: '#f59e0b' });

  // Callout box (rounded rect + 2 text lines)
  const calloutBg = mk('rect', {
    rx: 4, fill: '#0c1224', stroke: 'rgba(245,158,11,.45)', 'stroke-width': 1,
  });
  const calloutL1 = mk('text', {
    'font-size': 9, 'font-family': "'JetBrains Mono',monospace",
    fill: '#f59e0b', 'font-weight': 700, 'text-anchor': 'middle',
  });
  const calloutL2 = mk('text', {
    'font-size': 7.5, 'font-family': "'JetBrains Mono',monospace",
    fill: '#8d95ad', 'text-anchor': 'middle',
  });

  stage.appendChild(svg);

  /* ── Panel ────────────────────────────────────────────────── */
  panel.classList.add('rlc-panel');
  const statBox = document.createElement('div');
  statBox.className = 'rlc-statbox';

  const mkStat = (lbl: string) => {
    const el = document.createElement('div');
    el.className = 'rlc-stat';
    const lEl = document.createElement('div');
    lEl.className = 'rlc-lbl';
    lEl.textContent = lbl;
    const vEl = document.createElement('div');
    vEl.className = 'rlc-val';
    const sEl = document.createElement('div');
    sEl.className = 'rlc-sub';
    el.append(lEl, vEl, sEl);
    statBox.appendChild(el);
    return { v: vEl, s: sEl };
  };

  const sLev = mkStat('Effective leverage');
  const sTrig = mkStat('Liquidation trigger');
  const sHF = mkStat('Health factor');
  const sLoss = mkStat('Loss at liquidation');
  panel.appendChild(statBox);

  /* ── Controls ─────────────────────────────────────────────── */
  ctrlSlot.classList.add('rlc-ctrls');

  // LTV slider (max 82 = just below WETH liqThreshold of 83%)
  const ltvField = document.createElement('div');
  ltvField.className = 'rlc-field';
  const ltvLabel = document.createElement('label');
  const ltvSpan = document.createElement('span');
  ltvSpan.textContent = 'Max LTV';
  const ltvOut = document.createElement('output');
  ltvLabel.append(ltvSpan, ltvOut);
  const ltvInput = document.createElement('input');
  ltvInput.type = 'range';
  ltvInput.min = '50';
  ltvInput.max = '82';
  ltvInput.step = '0.5';
  ltvInput.value = String(state.ltv * 100);
  ltvInput.setAttribute('aria-label', 'Max LTV percentage');
  ltvField.append(ltvLabel, ltvInput);
  ctrlSlot.appendChild(ltvField);

  // Loop count buttons
  const hopRow = document.createElement('div');
  hopRow.className = 'rlc-tabrow';
  const hopRowLbl = document.createElement('div');
  hopRowLbl.className = 'rlc-rowlbl';
  hopRowLbl.textContent = 'Loops';
  const hopTabsCnt = document.createElement('div');
  hopTabsCnt.className = 'rlc-tabs';
  const hopBtns: HTMLButtonElement[] = [];
  for (let n = 1; n <= MAX_HOPS; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rlc-tab' + (n === state.hops ? ' on' : '');
    btn.textContent = String(n);
    btn.dataset.hops = String(n);
    btn.setAttribute('aria-label', `${n} borrow loop${n > 1 ? 's' : ''}`);
    hopTabsCnt.appendChild(btn);
    hopBtns.push(btn);
  }
  hopRow.append(hopRowLbl, hopTabsCnt);
  ctrlSlot.appendChild(hopRow);

  /* ── Caption ──────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'rlc-cap';
  cap.innerHTML =
    '<b>Aave v3 Ethereum mainnet</b>, block 25,373,150 (2026-06-22). Default: WETH LTV 80.5%, ' +
    'liq threshold 83.0%, liq bonus 5.0%, ETH $1,766.27. Source: <b>Blockscout / Aave v3 IPool</b>.';
  caption.appendChild(cap);

  /* ── Render ───────────────────────────────────────────────── */
  function render(): void {
    const c = compute(state);
    const { maxLev, levs, selLev, hf, liqTrig, loss } = c;

    // Y range: 1× at CY2, chartMax at CY1
    const chartMax = maxLev + 0.5;

    // Leverage points
    const pts: [number, number][] = levs.map((lev, i) => [hopX(i + 1), levY(lev, chartMax)]);

    // Danger zone (top 25% of max leverage band)
    const dangerBnd = maxLev * 0.75;
    const dangerBotY = levY(dangerBnd, chartMax);
    zoneRed.setAttribute('y', String(CY1));
    zoneRed.setAttribute('height', String(Math.max(0, dangerBotY - CY1)));

    // Caution zone (next 30%)
    const cautionBnd = maxLev * 0.45;
    const cautionBotY = levY(cautionBnd, chartMax);
    zoneAmber.setAttribute('y', String(dangerBotY));
    zoneAmber.setAttribute('height', String(Math.max(0, cautionBotY - dangerBotY)));

    // Y grid lines (integers 1–6, hide if above scale)
    for (let i = 0; i < Y_VALS.length; i++) {
      const n = Y_VALS[i];
      const show = n <= Math.floor(chartMax);
      yLines[i].style.display = show ? '' : 'none';
      yLabels[i].style.display = show ? '' : 'none';
      if (show) {
        const y = levY(n, chartMax);
        yLines[i].setAttribute('y1', String(y));
        yLines[i].setAttribute('y2', String(y));
        yLabels[i].setAttribute('y', String(y + 3));
        yLabels[i].textContent = `${n}×`;
      }
    }

    // Asymptote
    const ay = levY(maxLev, chartMax);
    asymLine.setAttribute('y1', String(ay));
    asymLine.setAttribute('y2', String(ay));
    asymLbl.setAttribute('y', String(ay - 3));
    asymLbl.textContent = `MAX ${fmt2(maxLev)}`;

    // Curve + area fill
    const ptStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
    curveLine.setAttribute('points', ptStr);
    const lastPt = pts[MAX_HOPS - 1];
    curveArea.setAttribute('points', `${CX1},${CY2} ${ptStr} ${lastPt[0]},${CY2}`);

    // Hop dots
    for (let i = 0; i < MAX_HOPS; i++) {
      hopDots[i].setAttribute('cx', String(pts[i][0]));
      hopDots[i].setAttribute('cy', String(pts[i][1]));
    }

    // Selected hop highlight
    const [sx, sy] = pts[state.hops - 1];
    selGlow.setAttribute('cx', String(sx));
    selGlow.setAttribute('cy', String(sy));
    selDot.setAttribute('cx', String(sx));
    selDot.setAttribute('cy', String(sy));

    // Callout box
    const cbW = 100, cbH = 30;
    const cbX = clamp(sx - cbW / 2, CX1, CX2 - cbW);
    const cbY = Math.max(CY1 + 2, sy - cbH - 10);
    calloutBg.setAttribute('x', String(cbX));
    calloutBg.setAttribute('y', String(cbY));
    calloutBg.setAttribute('width', String(cbW));
    calloutBg.setAttribute('height', String(cbH));
    calloutL1.setAttribute('x', String(cbX + cbW / 2));
    calloutL1.setAttribute('y', String(cbY + 13));
    calloutL1.textContent = `${state.hops} loop${state.hops > 1 ? 's' : ''} → ${fmt2(selLev)}`;
    calloutL2.setAttribute('x', String(cbX + cbW / 2));
    calloutL2.setAttribute('y', String(cbY + 24));
    calloutL2.textContent = `liq trigger −${fmtPct(liqTrig)}`;

    // LTV output
    ltvOut.textContent = fmtPct(state.ltv);

    // Panel stats
    const levCls = selLev < 2.5 ? 'green' : selLev < 4 ? 'amber' : 'red';
    sLev.v.className = `rlc-val ${levCls}`;
    sLev.v.textContent = fmt2(selLev);
    sLev.s.textContent = `${state.hops} loop${state.hops > 1 ? 's' : ''} · max ${fmt2(maxLev)}`;

    const trigCls = liqTrig < 0.05 ? 'red' : liqTrig < 0.1 ? 'amber' : 'green';
    sTrig.v.className = `rlc-val ${trigCls}`;
    sTrig.v.textContent = `−${fmtPct(liqTrig)}`;
    sTrig.s.textContent = 'constant across all loop counts';

    const hfCls = hf < 1.05 ? 'red' : hf < 1.1 ? 'amber' : 'green';
    sHF.v.className = `rlc-val ${hfCls}`;
    sHF.v.textContent = hf.toFixed(3);
    sHF.s.textContent = '= liq threshold ÷ LTV';

    const lossCls = loss > 0.12 ? 'red' : loss > 0.06 ? 'amber' : 'green';
    sLoss.v.className = `rlc-val ${lossCls}`;
    sLoss.v.textContent = `−${fmtPct(loss)}`;
    sLoss.s.textContent = `vs −${fmtPct(liqTrig)} unlevered`;
  }

  /* ── Events ───────────────────────────────────────────────── */
  function onLtvInput(): void {
    state.ltv = Number(ltvInput.value) / 100;
    render();
  }

  function onHopClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-hops]');
    if (!btn) return;
    state.hops = Number(btn.dataset.hops);
    for (const b of hopBtns) b.classList.toggle('on', b.dataset.hops === String(state.hops));
    render();
  }

  ltvInput.addEventListener('input', onLtvInput);
  hopTabsCnt.addEventListener('click', onHopClick);

  render();

  return () => {
    ltvInput.removeEventListener('input', onLtvInput);
    hopTabsCnt.removeEventListener('click', onHopClick);
    layout.dispose();
    style.remove();
  };
}
