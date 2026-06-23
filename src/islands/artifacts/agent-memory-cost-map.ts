/**
 * Artifact: agent-memory-cost-map — Agent Memory Cost Map
 * Manifest: content/artifacts/agent-memory-cost-map/manifest.json
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/agent-memory-cost-map/data.json';

interface Architecture {
  id: string;
  label: string;
  shortLabel: string;
  note: string;
  trustLevel: number;
  trustLabel: string;
  privateStrategy: boolean;
  readableInCall: boolean;
  color: string;
  gasPerEntry: number;
  gasFlat: number;
  flatMonthlyUsd: number;
}

interface DataShape {
  snapshot: {
    date: string;
    blockNumber: number;
    ethUsdPrice: number;
    totalGasPriceGwei: number;
  };
  architectures: Architecture[];
}

function monthlyCostUsd(
  arch: Architecture,
  entries: number,
  callsPerDay: number,
  gasPriceGwei: number,
  ethUsd: number,
): number {
  const gasPerCall = arch.gasPerEntry * entries + arch.gasFlat;
  const onChain = gasPerCall * gasPriceGwei * 1e-9 * ethUsd * callsPerDay * 30;
  return onChain + arch.flatMonthlyUsd;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

export default function mount(container: HTMLElement): () => void {
  const data = rawData as unknown as DataShape;
  const snap = data.snapshot;
  const archs = data.architectures;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
  });
  const { stage, panel, controls, caption } = layout;

  // State
  let entries = 20;
  let callsPerDay = 24;
  let gasPriceGwei = snap.totalGasPriceGwei;

  // SVG dimensions
  const W = 400, H = 300;
  const ML = 80, MR = 16, MT = 24, MB = 48;
  const CW = W - ML - MR;
  const CH = H - MT - MB;
  const LOG_MIN = -3, LOG_MAX = 3;
  const BAR_H = 30, BAR_GAP = 12;
  const totalBarSpace = archs.length * (BAR_H + BAR_GAP) - BAR_GAP;
  const barStartY = MT + (CH - totalBarSpace) / 2;
  const NS = 'http://www.w3.org/2000/svg';

  function xPx(usd: number): number {
    if (usd <= 0) return ML;
    const t = (Math.max(LOG_MIN, Math.min(LOG_MAX, Math.log10(usd))) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    return ML + t * CW;
  }

  function barY(i: number): number {
    return barStartY + i * (BAR_H + BAR_GAP);
  }

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  stage.appendChild(svg);

  // Grid lines and x-axis ticks
  const ticks: [number, string][] = [
    [-3, '$0.001'], [-2, '$0.01'], [-1, '$0.10'],
    [0, '$1'], [1, '$10'], [2, '$100'], [3, '$1k'],
  ];
  ticks.forEach(([t, lbl]) => {
    const x = ML + ((t - LOG_MIN) / (LOG_MAX - LOG_MIN)) * CW;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(MT)); line.setAttribute('y2', String(MT + CH));
    line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', String(x)); txt.setAttribute('y', String(MT + CH + 14));
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '9');
    txt.setAttribute('fill', 'rgba(255,255,255,0.35)'); txt.setAttribute('font-family', 'monospace');
    txt.textContent = lbl;
    svg.appendChild(txt);
  });

  const axisLbl = document.createElementNS(NS, 'text');
  axisLbl.setAttribute('x', String(ML + CW / 2)); axisLbl.setAttribute('y', String(MT + CH + 30));
  axisLbl.setAttribute('text-anchor', 'middle'); axisLbl.setAttribute('font-size', '9');
  axisLbl.setAttribute('fill', 'rgba(255,255,255,0.22)');
  axisLbl.textContent = 'monthly cost · log scale';
  svg.appendChild(axisLbl);

  // Bars
  const barRects: SVGRectElement[] = [];
  const costTxts: SVGTextElement[] = [];

  archs.forEach((arch, i) => {
    const y = barY(i);

    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', String(ML - 6)); lbl.setAttribute('y', String(y + BAR_H / 2 + 4));
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '11');
    lbl.setAttribute('fill', arch.color); lbl.setAttribute('font-weight', '600');
    lbl.textContent = arch.shortLabel;
    svg.appendChild(lbl);

    const track = document.createElementNS(NS, 'rect');
    track.setAttribute('x', String(ML)); track.setAttribute('y', String(y));
    track.setAttribute('width', String(CW)); track.setAttribute('height', String(BAR_H));
    track.setAttribute('rx', '4'); track.setAttribute('fill', 'rgba(255,255,255,0.04)');
    svg.appendChild(track);

    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', String(ML)); bar.setAttribute('y', String(y));
    bar.setAttribute('width', '2'); bar.setAttribute('height', String(BAR_H));
    bar.setAttribute('rx', '4'); bar.setAttribute('fill', arch.color);
    bar.setAttribute('opacity', '0.85');
    svg.appendChild(bar);
    barRects.push(bar);

    const costTxt = document.createElementNS(NS, 'text');
    costTxt.setAttribute('y', String(y + BAR_H / 2 + 4));
    costTxt.setAttribute('font-size', '10'); costTxt.setAttribute('font-weight', '700');
    costTxt.setAttribute('font-family', 'monospace');
    svg.appendChild(costTxt);
    costTxts.push(costTxt);
  });

  function updateChart() {
    archs.forEach((arch, i) => {
      const cost = monthlyCostUsd(arch, entries, callsPerDay, gasPriceGwei, snap.ethUsdPrice);
      const w = Math.max(2, Math.min(CW, xPx(cost) - ML));
      barRects[i].setAttribute('width', String(w));
      const lbl = formatCost(cost);
      if (w > 44) {
        costTxts[i].setAttribute('x', String(ML + 5));
        costTxts[i].setAttribute('fill', 'rgba(0,0,0,0.85)');
      } else {
        costTxts[i].setAttribute('x', String(ML + w + 4));
        costTxts[i].setAttribute('fill', 'rgba(255,255,255,0.7)');
      }
      costTxts[i].textContent = lbl;
    });
  }

  updateChart();

  // Panel: per-architecture cost table
  panel.style.cssText = 'display:flex;flex-direction:column;overflow:auto;';

  const panelHead = document.createElement('div');
  panelHead.style.cssText = 'font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.06em;padding:10px 12px 6px;';
  panelHead.textContent = 'Monthly estimate';
  panel.appendChild(panelHead);

  const costCells: HTMLSpanElement[] = [];

  archs.forEach((arch) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:8px 1fr auto;gap:8px;align-items:start;padding:9px 12px;border-top:1px solid rgba(255,255,255,0.04);';

    const dot = document.createElement('div');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${arch.color};margin-top:3px;flex-shrink:0;`;

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

    const name = document.createElement('div');
    name.style.cssText = `font-weight:600;font-size:12px;color:${arch.color};`;
    name.textContent = arch.shortLabel;

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.35);line-height:1.3;';
    meta.textContent = arch.trustLabel + (arch.privateStrategy ? ' · private' : ' · public');

    info.appendChild(name);
    info.appendChild(meta);

    const costCell = document.createElement('span');
    costCell.style.cssText = 'font-weight:700;font-size:13px;color:rgba(255,255,255,0.9);white-space:nowrap;text-align:right;font-family:monospace;';
    costCells.push(costCell);

    row.appendChild(dot);
    row.appendChild(info);
    row.appendChild(costCell);
    panel.appendChild(row);
  });

  function updatePanel() {
    archs.forEach((arch, i) => {
      const cost = monthlyCostUsd(arch, entries, callsPerDay, gasPriceGwei, snap.ethUsdPrice);
      costCells[i].textContent = `${formatCost(cost)}/mo`;
    });
  }

  updatePanel();

  // Controls
  const ctrlStyle = document.createElement('style');
  ctrlStyle.textContent = `
    .amcm-ctrl { display:flex;flex-direction:column;gap:4px; }
    .amcm-row { display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.5); }
    .amcm-val { color:rgba(255,255,255,0.9);font-weight:600;font-family:monospace; }
    .amcm-ctrl input[type=range] { width:100%;accent-color:#7c8cff;cursor:pointer; }
  `;
  document.head.appendChild(ctrlStyle);
  controls.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding:12px;';

  function makeSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    init: number,
    fmt: (v: number) => string,
    onChange: (v: number) => void,
  ): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'amcm-ctrl';

    const row = document.createElement('div');
    row.className = 'amcm-row';

    const lt = document.createElement('span');
    lt.textContent = label;

    const valSpan = document.createElement('span');
    valSpan.className = 'amcm-val';
    valSpan.textContent = fmt(init);

    row.appendChild(lt);
    row.appendChild(valSpan);

    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = String(min); inp.max = String(max);
    inp.step = String(step); inp.value = String(init);
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      valSpan.textContent = fmt(v);
      onChange(v);
    });

    wrap.appendChild(row);
    wrap.appendChild(inp);
    return wrap;
  }

  controls.appendChild(makeSlider(
    'entries / call', 1, 100, 1, entries,
    v => String(Math.round(v)),
    v => { entries = Math.round(v); updateChart(); updatePanel(); },
  ));
  controls.appendChild(makeSlider(
    'calls / day', 1, 96, 1, callsPerDay,
    v => String(Math.round(v)),
    v => { callsPerDay = Math.round(v); updateChart(); updatePanel(); },
  ));
  controls.appendChild(makeSlider(
    'gas price (gwei)', 0.1, 20, 0.1, gasPriceGwei,
    v => v.toFixed(1),
    v => { gasPriceGwei = v; updateChart(); updatePanel(); },
  ));

  // Caption
  caption.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.3);padding:2px 12px 4px;line-height:1.4;';
  caption.textContent = `ETH $${snap.ethUsdPrice.toLocaleString()} · block ${snap.blockNumber.toLocaleString()} · ${snap.totalGasPriceGwei} gwei · ${snap.date}`;

  return () => {
    layout.dispose();
    ctrlStyle.remove();
  };
}
