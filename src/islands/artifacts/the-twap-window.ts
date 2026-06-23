import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/the-twap-window/data.json';

const BLOCK_S = 12;
const F_MIN = 1.1;
const F_MAX = 20;
const VBW = 760;
const VBH = 420;
// plot bounds (left, right, top, bottom)
const PL = 70, PR = 738, PT = 18, PB = 348;

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function roundTripCost(tvl: number, f: number): number {
  return (tvl / 2) * (Math.sqrt(f) + 1 / Math.sqrt(f) - 2);
}

function v2Shift(f: number, winSec: number): number {
  return (f - 1) * BLOCK_S / winSec * 100;
}

function v3Shift(f: number, winSec: number): number {
  return (Math.pow(f, BLOCK_S / winSec) - 1) * 100;
}

// f where V2 TWAP shift == pct%
function fForV2(pct: number, winSec: number): number {
  return 1 + (pct / 100) * winSec / BLOCK_S;
}

// f where V3 TWAP shift == pct%
function fForV3(pct: number, winSec: number): number {
  return Math.pow(1 + pct / 100, winSec / BLOCK_S);
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  let tvl = data.defaults.poolTvlUsd;
  let winMins = data.defaults.twapWindowMinutes;
  let curF = data.defaults.spikeFactor;
  let lastYMax = 1;

  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  }

  function svgTxt(text: string, x: number, y: number, attrs: Record<string, string | number> = {}): SVGElement {
    const e = svgEl('text', { x, y, 'font-family': 'monospace', ...attrs });
    e.textContent = text;
    return e;
  }

  const svg = svgEl('svg', { viewBox: `0 0 ${VBW} ${VBH}`, width: '100%', height: '100%' });
  (svg as unknown as HTMLElement).style.display = 'block';
  stage.appendChild(svg);

  svg.appendChild(svgEl('rect', { width: VBW, height: VBH, fill: '#0f172a' }));

  const defs = svgEl('defs');
  const clip = svgEl('clipPath', { id: 'twap-w-clip' });
  clip.appendChild(svgEl('rect', { x: PL, y: PT, width: PR - PL, height: PB - PT }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  const gridG = svgEl('g');
  const fillG = svgEl('g', { 'clip-path': 'url(#twap-w-clip)' });
  const curveG = svgEl('g', { 'clip-path': 'url(#twap-w-clip)' });
  const markG = svgEl('g', { 'clip-path': 'url(#twap-w-clip)' });
  const axesG = svgEl('g');
  const lblG = svgEl('g');

  for (const g of [gridG, fillG, curveG, markG, axesG, lblG]) svg.appendChild(g);

  const costFill = svgEl('path', { fill: '#f59e0b', opacity: '0.07' }) as SVGPathElement;
  fillG.appendChild(costFill);
  const costLine = svgEl('path', { stroke: '#f59e0b', 'stroke-width': '2.5', fill: 'none' }) as SVGPathElement;
  curveG.appendChild(costLine);

  // V2/V3 threshold markers at 5%, 10%, 25%
  const THRESHOLDS = [5, 10, 25];
  const V2_COLS = ['#94a3b8', '#ef4444', '#7c3aed'];

  const v2m = THRESHOLDS.map((_, i) => {
    const line = svgEl('line', { stroke: V2_COLS[i], 'stroke-width': '1.5', 'stroke-dasharray': '5,4' });
    markG.appendChild(line);
    const lbl = svgTxt('', 0, 0, { fill: V2_COLS[i], 'font-size': '8' });
    markG.appendChild(lbl);
    return { line, lbl };
  });

  const v3m = THRESHOLDS.map(() => {
    const line = svgEl('line', { stroke: '#22c55e', 'stroke-width': '1.5', 'stroke-dasharray': '2,4' });
    markG.appendChild(line);
    const lbl = svgTxt('', 0, 0, { fill: '#22c55e', 'font-size': '8' });
    markG.appendChild(lbl);
    return { line, lbl };
  });

  const cursorLine = svgEl('line', { stroke: '#475569', 'stroke-width': '1', 'stroke-dasharray': '3,3' });
  markG.appendChild(cursorLine);
  const cursorDot = svgEl('circle', { r: '4', fill: '#f59e0b', stroke: '#0f172a', 'stroke-width': '1.5' });
  markG.appendChild(cursorDot);

  // Axes
  axesG.appendChild(svgEl('line', { x1: PL, y1: PB, x2: PR, y2: PB, stroke: '#334155', 'stroke-width': '1' }));
  axesG.appendChild(svgEl('line', { x1: PL, y1: PT, x2: PL, y2: PB, stroke: '#334155', 'stroke-width': '1' }));

  // Static labels
  lblG.appendChild(svgTxt('Price spike factor (f)', (PL + PR) / 2, VBH - 4, {
    fill: '#64748b', 'font-size': '10', 'text-anchor': 'middle',
  }));
  const yLbl = svgTxt('Round-trip cost', 12, (PT + PB) / 2, {
    fill: '#64748b', 'font-size': '10', 'text-anchor': 'middle',
    transform: `rotate(-90,12,${(PT + PB) / 2})`,
  });
  lblG.appendChild(yLbl);

  // Legend
  const legendItems: Array<[string, string]> = [
    ['Cost curve', '#f59e0b'],
    ['V2 shift (—)', '#ef4444'],
    ['V3 shift (·)', '#22c55e'],
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const [label, color] = legendItems[i];
    lblG.appendChild(svgTxt(label, PR - 2, PT + 12 + i * 12, {
      fill: color, 'font-size': '9', 'text-anchor': 'end',
    }));
  }

  // Panel
  panel.style.cssText = [
    'background:#1e293b',
    'padding:12px 10px',
    'font-family:monospace',
    'color:#e2e8f0',
    'font-size:12px',
    'display:flex',
    'flex-direction:column',
    'gap:6px',
    'min-width:128px',
    'border-left:1px solid #334155',
    'overflow:hidden',
  ].join(';');

  function panelRow(label: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
    const l = document.createElement('div');
    l.style.cssText = 'color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:0.06em;';
    l.textContent = label;
    const v = document.createElement('div');
    v.style.cssText = 'font-size:14px;font-weight:700;line-height:1;';
    row.appendChild(l);
    row.appendChild(v);
    panel.appendChild(row);
    return v;
  }

  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:10px;color:#64748b;padding-bottom:5px;border-bottom:1px solid #334155;';
  hdr.textContent = 'at cursor';
  panel.appendChild(hdr);

  const pF = panelRow('Spike ×');
  const pCost = panelRow('Attack cost');
  const pV2 = panelRow('V2 TWAP shift');
  const pV3 = panelRow('V3 TWAP shift');
  const pRisk = panelRow('Risk');

  // Controls
  controls.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'gap:8px 16px',
    'padding:8px 12px',
    'background:#0f172a',
    'border-top:1px solid #1e293b',
  ].join(';');

  function mkSlider(
    label: string,
    min: number,
    max: number,
    value: number,
    step: number,
    fmt: (v: number) => string,
    cb: (v: number) => void,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:130px;flex:1;';
    const hrow = document.createElement('div');
    hrow.style.cssText = 'display:flex;justify-content:space-between;font-family:monospace;font-size:10px;color:#94a3b8;';
    const ll = document.createElement('span');
    ll.textContent = label;
    const vv = document.createElement('span');
    vv.style.color = '#e2e8f0';
    vv.textContent = fmt(value);
    hrow.appendChild(ll);
    hrow.appendChild(vv);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(value);
    inp.style.cssText = 'width:100%;accent-color:#f59e0b;cursor:pointer;';
    inp.addEventListener('input', () => {
      vv.textContent = fmt(+inp.value);
      cb(+inp.value);
    });
    wrap.appendChild(hrow);
    wrap.appendChild(inp);
    return wrap;
  }

  controls.appendChild(mkSlider('Pool TVL', 1e6, 500e6, tvl, 1e6, fmtUsd, v => { tvl = v; redraw(); }));
  controls.appendChild(mkSlider('TWAP window', 1, 60, winMins, 1, v => `${v} min`, v => { winMins = v; redraw(); }));
  controls.appendChild(mkSlider('Spike factor', 1.1, 20, curF, 0.1, v => `${v.toFixed(1)}×`, v => { curF = v; updateCursor(); }));

  // Caption
  caption.style.cssText = 'font-family:monospace;font-size:10px;color:#334155;padding:3px 12px;';
  caption.textContent = `Uniswap v2/v3 on-chain · Crypto.com · ${data.meta.snapshotAt.slice(0, 10)} · ETH $${data.meta.ethPriceUsd.toLocaleString()}`;

  function fToX(f: number): number {
    return PL + ((f - F_MIN) / (F_MAX - F_MIN)) * (PR - PL);
  }
  function cToY(cost: number, yMax: number): number {
    return PB - (cost / yMax) * (PB - PT);
  }

  function updateCursor() {
    const winSec = winMins * 60;
    const cost = roundTripCost(tvl, curF);
    const x = fToX(curF);
    const y = cToY(cost, lastYMax);

    cursorLine.setAttribute('x1', String(x));
    cursorLine.setAttribute('y1', String(PT));
    cursorLine.setAttribute('x2', String(x));
    cursorLine.setAttribute('y2', String(PB));
    cursorDot.setAttribute('cx', String(x));
    cursorDot.setAttribute('cy', String(y));

    const v2s = v2Shift(curF, winSec);
    const v3s = v3Shift(curF, winSec);

    pF.textContent = `${curF.toFixed(1)}×`;
    pCost.textContent = fmtUsd(cost);
    pCost.style.color = '#f59e0b';

    pV2.textContent = `${v2s.toFixed(1)}%`;
    pV2.style.color = v2s > 25 ? '#7c3aed' : v2s > 10 ? '#ef4444' : v2s > 5 ? '#f59e0b' : '#22c55e';

    pV3.textContent = v3s < 0.001 ? '<0.001%' : `${v3s.toFixed(3)}%`;
    pV3.style.color = v3s > 10 ? '#ef4444' : v3s > 1 ? '#f59e0b' : '#22c55e';

    let risk: string;
    let rCol: string;
    if (v2s > 25) { risk = 'CRITICAL'; rCol = '#7c3aed'; }
    else if (v2s > 10) { risk = 'HIGH'; rCol = '#ef4444'; }
    else if (v2s > 5) { risk = 'MEDIUM'; rCol = '#f59e0b'; }
    else { risk = 'LOW'; rCol = '#22c55e'; }
    pRisk.textContent = risk;
    pRisk.style.color = rCol;
  }

  function redraw() {
    const winSec = winMins * 60;
    const yMax = roundTripCost(tvl, F_MAX) * 1.1;
    lastYMax = yMax;

    // Rebuild grid
    while (gridG.firstChild) gridG.removeChild(gridG.firstChild);

    // Y grid lines + labels
    for (let i = 0; i <= 5; i++) {
      const c = yMax * i / 5;
      const y = cToY(c, yMax);
      gridG.appendChild(svgEl('line', { x1: PL, y1: y, x2: PR, y2: y, stroke: '#1e293b', 'stroke-width': '1' }));
      gridG.appendChild(svgTxt(fmtUsd(c), PL - 4, y + 3, {
        fill: '#334155', 'font-size': '9', 'text-anchor': 'end',
      }));
    }

    // X grid lines + labels
    for (const f of [2, 5, 10, 15, 20]) {
      const x = fToX(f);
      gridG.appendChild(svgEl('line', { x1: x, y1: PT, x2: x, y2: PB, stroke: '#1e293b', 'stroke-width': '1' }));
      gridG.appendChild(svgTxt(`${f}×`, x, PB + 13, {
        fill: '#334155', 'font-size': '9', 'text-anchor': 'middle',
      }));
    }

    // Cost fill + line
    const N = 300;
    let pd = '';
    let fd = '';
    for (let i = 0; i <= N; i++) {
      const f = F_MIN + (F_MAX - F_MIN) * i / N;
      const c = roundTripCost(tvl, f);
      const x = fToX(f).toFixed(1);
      const y = cToY(c, yMax).toFixed(1);
      pd += i === 0 ? `M${x},${y}` : `L${x},${y}`;
      fd += i === 0 ? `M${x},${PB}L${x},${y}` : `L${x},${y}`;
    }
    fd += `L${fToX(F_MAX).toFixed(1)},${PB}Z`;
    costLine.setAttribute('d', pd);
    costFill.setAttribute('d', fd);

    // Threshold markers
    for (let i = 0; i < THRESHOLDS.length; i++) {
      const pct = THRESHOLDS[i];
      const fv2 = fForV2(pct, winSec);
      if (fv2 >= F_MIN && fv2 <= F_MAX) {
        const x = fToX(fv2);
        v2m[i].line.setAttribute('x1', String(x));
        v2m[i].line.setAttribute('y1', String(PT));
        v2m[i].line.setAttribute('x2', String(x));
        v2m[i].line.setAttribute('y2', String(PB));
        v2m[i].line.setAttribute('visibility', 'visible');
        v2m[i].lbl.setAttribute('x', String(x + 2));
        v2m[i].lbl.setAttribute('y', String(PT + 8 + i * 10));
        v2m[i].lbl.textContent = `V2 ${pct}%`;
        v2m[i].lbl.setAttribute('visibility', 'visible');
      } else {
        v2m[i].line.setAttribute('visibility', 'hidden');
        v2m[i].lbl.setAttribute('visibility', 'hidden');
      }

      const fv3 = fForV3(pct, winSec);
      if (fv3 >= F_MIN && fv3 <= F_MAX) {
        const x = fToX(fv3);
        v3m[i].line.setAttribute('x1', String(x));
        v3m[i].line.setAttribute('y1', String(PT));
        v3m[i].line.setAttribute('x2', String(x));
        v3m[i].line.setAttribute('y2', String(PB));
        v3m[i].line.setAttribute('visibility', 'visible');
        v3m[i].lbl.setAttribute('x', String(x + 2));
        v3m[i].lbl.setAttribute('y', String(PT + 8 + i * 10));
        v3m[i].lbl.textContent = `V3 ${pct}%`;
        v3m[i].lbl.setAttribute('visibility', 'visible');
      } else {
        v3m[i].line.setAttribute('visibility', 'hidden');
        v3m[i].lbl.setAttribute('visibility', 'hidden');
      }
    }

    updateCursor();
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    const r = svg.getBoundingClientRect();
    const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const svgX = ((cx - r.left) / r.width) * VBW;
    curF = Math.max(F_MIN, Math.min(F_MAX, F_MIN + ((svgX - PL) / (PR - PL)) * (F_MAX - F_MIN)));
    updateCursor();
  }

  svg.addEventListener('mousemove', onPointerMove as EventListener);
  svg.addEventListener('touchmove', onPointerMove as EventListener, { passive: true });

  redraw();

  return () => {
    svg.removeEventListener('mousemove', onPointerMove as EventListener);
    svg.removeEventListener('touchmove', onPointerMove as EventListener);
    layout.dispose();
  };
}
