/**
 * Artifact: the-adl-queue — The ADL Queue
 * Manifest: content/artifacts/the-adl-queue/manifest.json
 *
 * Interactive ADL (auto-deleveraging) priority queue simulator. An insurance
 * fund meter drains as shortfall grows; when it's exhausted the queue closes
 * profitable positions from the top (highest profit %) downward.
 *
 * Layout: footer template (stage SVG · panel event stats + scenario ·
 * footer sliders · caption). No RAF — renders on slider input only.
 */
import data from '../../../content/artifacts/the-adl-queue/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

// SVG viewport
const VW = 480, VH = 268;

// Insurance-fund meter geometry
const MX = 12, MY = 36, MW = 54, MH = 196;

// Queue geometry
const QX = 78;                    // left edge of rows
const QW = VW - QX - 6;          // row width = 396
const ROW_H = 36;
const ROW_GAP = 4;
const ROWS = 5;

type Pos = (typeof data.exampleScenario.positions)[number];

interface Closure {
  status: 'closed' | 'partial';
  frac: number;
  haircut: number;
}

function computeADL(shortfall: number, fund: number) {
  const insured = Math.min(shortfall, fund);
  let adl = Math.max(0, shortfall - fund);
  const closures = new Map<string, Closure>();
  let totalHaircut = 0;

  for (const pos of data.exampleScenario.positions) {
    if (adl <= 0) break;
    const take = Math.min(adl, pos.notionalUSD);
    const frac = take / pos.notionalUSD;
    const haircut = pos.profitUSD * frac;
    closures.set(pos.id, { status: frac > 0.9999 ? 'closed' : 'partial', frac, haircut });
    adl -= take;
    totalHaircut += haircut;
  }

  return { insured, adlAmt: Math.max(0, shortfall - fund), closures, totalHaircut };
}

const fmtM = (v: number) =>
  v === 0 ? '$0' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '5/3',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  /* ---- Styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .adl-svg { width:100%; height:100%; display:block;
      font-family:'JetBrains Mono',monospace; }
    .adl-svg text { fill:#8d95ad; }
    .adl-panel { display:flex; flex-direction:column; gap:9px; min-width:0;
      font:500 11px/1.45 'JetBrains Mono',monospace; color:#8d95ad; }
    .adl-sec { border:1px solid rgba(124,140,255,.12); border-radius:10px;
      background:#0d1322; padding:9px 11px; display:flex; flex-direction:column; gap:4px; }
    .adl-sec-hd { font-size:8.5px; letter-spacing:.1em; text-transform:uppercase;
      color:#5b6378; margin-bottom:2px; }
    .adl-kv { display:flex; align-items:baseline; justify-content:space-between;
      gap:4px 8px; flex-wrap:wrap; }
    .adl-k { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#5b6378; }
    .adl-v { font-size:11px; color:#e7eaf3; font-variant-numeric:tabular-nums;
      white-space:nowrap; }
    .adl-v.c-teal  { color:#22d3ee; }
    .adl-v.c-orange{ color:#f0883e; }
    .adl-v.c-red   { color:#f87171; }
    .adl-v.c-green { color:#34d399; }
    .adl-v.c-dim   { color:#5b6378; }
    .adl-fields { display:grid;
      grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));
      gap:8px 16px; align-items:end; }
    .adl-field label { display:flex; justify-content:space-between; gap:4px;
      font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378;
      margin-bottom:4px; }
    .adl-field output { color:#e7eaf3; font-size:10.5px; white-space:nowrap;
      font-variant-numeric:tabular-nums; }
    .adl-field input[type=range] { width:100%; cursor:pointer;
      accent-color:#f0883e; }
    .adl-field.f-fund input { accent-color:#22d3ee; }
    .adl-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .adl-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- SVG ---- */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'adl-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'ADL priority queue');

  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  };

  // ---- Meter label ----
  el('text', { x: MX + MW / 2, y: MY - 8, 'text-anchor': 'middle', 'font-size': 7.5,
    fill: '#5b6378', 'letter-spacing': '.08em' }).textContent = 'INS FUND';

  // ---- Meter background ----
  el('rect', { x: MX, y: MY, width: MW, height: MH,
    fill: '#0a0f1b', stroke: 'rgba(34,211,238,.2)', 'stroke-width': 1, rx: 5 });

  // ---- Meter fill: remaining (teal) ----
  const mRemain = el('rect', { x: MX + 2, y: MY + 2, width: MW - 4, height: 0,
    fill: 'rgba(34,211,238,.4)', rx: 3 });

  // ---- Meter fill: consumed (orange) ---- renders on top of teal
  const mConsumed = el('rect', { x: MX + 2, y: MY + MH - 2, width: MW - 4, height: 0,
    fill: 'rgba(240,136,62,.65)', rx: 3 });

  // ---- Meter tick marks (every 25% of max fund scale) ----
  for (let i = 1; i < 4; i++) {
    const ty = MY + (MH / 4) * i;
    el('line', { x1: MX + MW - 10, y1: ty, x2: MX + MW - 2, y2: ty,
      stroke: 'rgba(124,140,255,.25)', 'stroke-width': 1 });
  }

  // ---- Meter bottom amount label ----
  const mLabel = el('text', { x: MX + MW / 2, y: MY + MH + 12,
    'text-anchor': 'middle', 'font-size': 8, fill: '#22d3ee' });

  // ---- ADL overflow indicator (arrow + label) ----
  const adlArrow = el('g', {});
  el('line', { x1: MX + MW / 2, y1: MY + MH + 18, x2: MX + MW / 2, y2: MY + MH + 30,
    stroke: '#f87171', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }, adlArrow);
  el('polygon', {
    points: `${MX + MW / 2 - 5},${MY + MH + 30} ${MX + MW / 2 + 5},${MY + MH + 30} ${MX + MW / 2},${MY + MH + 37}`,
    fill: '#f87171',
  }, adlArrow);
  const adlLabel = el('text', { x: MX + MW / 2, y: MY + MH + 48,
    'text-anchor': 'middle', 'font-size': 8, fill: '#f87171', 'font-weight': 700 }, adlArrow);
  adlLabel.textContent = 'ADL';

  // ---- Divider ----
  el('line', { x1: QX - 6, y1: MY - 10, x2: QX - 6, y2: MY + MH + 14,
    stroke: 'rgba(124,140,255,.1)', 'stroke-width': 1 });

  // ---- Column headers ----
  const HDR_Y = MY - 8;
  el('text', { x: QX + 2, y: HDR_Y, 'font-size': 7.5, fill: '#5b6378',
    'letter-spacing': '.06em' }).textContent = '#';
  el('text', { x: QX + 22, y: HDR_Y, 'font-size': 7.5, fill: '#5b6378',
    'letter-spacing': '.06em' }).textContent = 'POSITION';
  el('text', { x: QX + 192, y: HDR_Y, 'font-size': 7.5, fill: '#5b6378',
    'text-anchor': 'end', 'letter-spacing': '.06em' }).textContent = 'NOTIONAL';
  el('text', { x: QX + 255, y: HDR_Y, 'font-size': 7.5, fill: '#5b6378',
    'text-anchor': 'end', 'letter-spacing': '.06em' }).textContent = 'PROFIT %';
  el('text', { x: QX + QW, y: HDR_Y, 'font-size': 7.5, fill: '#5b6378',
    'text-anchor': 'end', 'letter-spacing': '.06em' }).textContent = 'STATUS';

  // ---- Queue rows ----
  interface RowEls {
    overlay: Element;
    rankCircle: Element;
    rankText: Element;
    labelEl: Element;
    statusBg: Element;
    statusTxt: Element;
  }
  const rows: RowEls[] = [];

  for (let i = 0; i < ROWS; i++) {
    const pos: Pos = data.exampleScenario.positions[i];
    const ry = MY + i * (ROW_H + ROW_GAP);
    const g = el('g', {});

    const mkR = (tag: string, attrs: Record<string, string | number>) => el(tag, attrs, g);

    // Row background
    mkR('rect', { x: QX, y: ry, width: QW, height: ROW_H,
      fill: '#0a0f1b', stroke: 'rgba(124,140,255,.1)', 'stroke-width': 1, rx: 4 });

    // Overlay (ADL highlight, starts at 0 width)
    const overlay = mkR('rect', { x: QX, y: ry, width: 0, height: ROW_H,
      fill: 'rgba(248,113,113,.08)', rx: 4 });

    // Rank circle
    const cx = QX + 15, cy = ry + ROW_H / 2;
    const rankCircle = mkR('circle', { cx, cy, r: 9,
      fill: 'rgba(124,140,255,.15)', stroke: 'rgba(124,140,255,.35)', 'stroke-width': 1 });
    const rankText = mkR('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle',
      'font-size': 9, fill: '#7c8cff', 'font-weight': 700 });
    rankText.textContent = String(i + 1);

    // Position label
    const labelEl = mkR('text', { x: QX + 30, y: ry + ROW_H / 2 + 3.5,
      'font-size': 10.5, fill: '#e7eaf3' });
    labelEl.textContent = pos.label;

    // Notional
    mkR('text', { x: QX + 192, y: ry + ROW_H / 2 + 3.5,
      'font-size': 9.5, fill: '#8d95ad', 'text-anchor': 'end',
      'font-variant-numeric': 'tabular-nums' }).textContent = fmtM(pos.notionalUSD);

    // Profit % badge
    const PW = 52, PH = 18;
    const px = QX + 204, py = ry + (ROW_H - PH) / 2;
    mkR('rect', { x: px, y: py, width: PW, height: PH,
      fill: 'rgba(52,211,153,.1)', stroke: 'rgba(52,211,153,.28)', 'stroke-width': 1, rx: 4 });
    mkR('text', { x: px + PW / 2, y: py + PH / 2 + 3.5,
      'text-anchor': 'middle', 'font-size': 9, fill: '#34d399', 'font-weight': 700 })
      .textContent = `+${pos.profitPct}%`;

    // Status badge
    const SW = 58, SH = 18;
    const sx = QX + QW - SW, sy = ry + (ROW_H - SH) / 2;
    const statusBg = mkR('rect', { x: sx, y: sy, width: SW, height: SH,
      fill: 'rgba(52,211,153,.1)', stroke: 'rgba(52,211,153,.25)', 'stroke-width': 1, rx: 4 });
    const statusTxt = mkR('text', { x: sx + SW / 2, y: sy + SH / 2 + 3.5,
      'text-anchor': 'middle', 'font-size': 8.5, fill: '#34d399',
      'font-weight': 700, 'letter-spacing': '.04em' });
    statusTxt.textContent = 'OPEN';

    rows.push({ overlay, rankCircle, rankText, labelEl, statusBg, statusTxt });
  }

  stage.appendChild(svg);

  /* ---- Panel ---- */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'adl-panel';

  // Static event section
  const evSec = document.createElement('div');
  evSec.className = 'adl-sec';
  const evHd = document.createElement('div');
  evHd.className = 'adl-sec-hd';
  evHd.textContent = 'Oct 10 2025 · Hyperliquid';
  evSec.appendChild(evHd);
  const ev = data.event;
  for (const [k, v, cls] of [
    ['closed', `$${(ev.totalClosedUSD / 1e9).toFixed(1)}B`, 'c-teal'],
    ['via ADL', `$${(ev.positionsADLdUSD / 1e6).toFixed(0)}M`, 'c-orange'],
    ['haircut', `$${ev.excessHaircutMinUSD / 1e6}–${ev.excessHaircutMaxUSD / 1e6}M`, 'c-red'],
    ['duration', `${ev.durationMinutes} min`, ''],
  ] as [string, string, string][]) {
    const row = document.createElement('div');
    row.className = 'adl-kv';
    const key = document.createElement('span');
    key.className = 'adl-k';
    key.textContent = k;
    const val = document.createElement('span');
    val.className = `adl-v${cls ? ' ' + cls : ''}`;
    val.textContent = v;
    row.append(key, val);
    evSec.appendChild(row);
  }

  // Dynamic scenario section
  const scSec = document.createElement('div');
  scSec.className = 'adl-sec';
  const scHd = document.createElement('div');
  scHd.className = 'adl-sec-hd';
  scHd.textContent = 'Scenario';
  scSec.appendChild(scHd);
  const dynRows: [string, HTMLSpanElement][] = [];
  for (const k of ['shortfall', 'fund covers', 'ADL required', 'haircut', 'closed']) {
    const row = document.createElement('div');
    row.className = 'adl-kv';
    const key = document.createElement('span');
    key.className = 'adl-k';
    key.textContent = k;
    const val = document.createElement('span');
    val.className = 'adl-v c-dim';
    row.append(key, val);
    scSec.appendChild(row);
    dynRows.push([k, val]);
  }

  panelDiv.append(evSec, scSec);
  panel.appendChild(panelDiv);

  /* ---- Controls ---- */
  const ctrlDiv = document.createElement('div');
  const fields = document.createElement('div');
  fields.className = 'adl-fields';

  let shortfall = 0;
  let fund = data.exampleScenario.insuranceFundDefaultUSD;

  const sliderCfg = [
    { id: 'shortfall', label: 'SHORTFALL', cls: '', min: 0, max: 55e6, step: 1e6, init: shortfall },
    { id: 'fund', label: 'INSURANCE FUND', cls: 'f-fund', min: 0, max: 50e6, step: 1e6, init: fund },
  ] as const;

  const sliders = new Map<string, HTMLInputElement>();
  const outs = new Map<string, HTMLOutputElement>();

  for (const cfg of sliderCfg) {
    const wrap = document.createElement('div');
    wrap.className = `adl-field ${cfg.cls}`.trim();
    const label = document.createElement('label');
    label.htmlFor = `adl-${cfg.id}`;
    const name = document.createElement('span');
    name.textContent = cfg.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `adl-${cfg.id}`;
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.value = String(cfg.init);
    input.setAttribute('aria-label', cfg.label);
    wrap.append(label, input);
    fields.appendChild(wrap);
    sliders.set(cfg.id, input);
    outs.set(cfg.id, out);
  }

  ctrlDiv.appendChild(fields);
  ctrlSlot.appendChild(ctrlDiv);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'adl-cap';
  cap.innerHTML =
    `<b>Auto-deleveraging (ADL):</b> when the insurance fund is exhausted, the exchange ` +
    `force-closes winning positions from the highest profit % down. ` +
    `Positions are illustrative; event figures from <b>Chitra 2026, arXiv:2512.01112</b>. ` +
    `Drag the shortfall slider past the fund level to trigger ADL.`;
  caption.appendChild(cap);

  /* ---- Render ---- */
  function render() {
    const r = computeADL(shortfall, fund);

    // -- Meter --
    const scale = fund > 0 ? fund / 50e6 : 0;
    const inner = MH - 4;
    const totalH = inner * scale;
    const consumedFrac = fund > 0 ? r.insured / fund : 0;
    const consumedH = totalH * consumedFrac;
    const remainH = totalH - consumedH;

    // remaining teal (top of fill)
    mRemain.setAttribute('y', String(MY + 2 + inner - totalH));
    mRemain.setAttribute('height', String(remainH));
    // consumed orange (bottom of fill)
    mConsumed.setAttribute('y', String(MY + 2 + inner - consumedH));
    mConsumed.setAttribute('height', String(consumedH));

    mLabel.textContent = fmtM(fund);
    adlArrow.setAttribute('display', r.adlAmt > 0 ? '' : 'none');

    // -- Queue rows --
    for (let i = 0; i < ROWS; i++) {
      const pos = data.exampleScenario.positions[i];
      const cl = r.closures.get(pos.id);
      const { overlay, rankCircle, statusBg, statusTxt, labelEl } = rows[i];

      if (!cl) {
        overlay.setAttribute('width', '0');
        rankCircle.setAttribute('fill', 'rgba(124,140,255,.15)');
        rankCircle.setAttribute('stroke', 'rgba(124,140,255,.35)');
        labelEl.setAttribute('fill', '#e7eaf3');
        statusBg.setAttribute('fill', 'rgba(52,211,153,.1)');
        statusBg.setAttribute('stroke', 'rgba(52,211,153,.25)');
        statusTxt.textContent = 'OPEN';
        statusTxt.setAttribute('fill', '#34d399');
      } else if (cl.status === 'closed') {
        overlay.setAttribute('width', String(QW));
        rankCircle.setAttribute('fill', 'rgba(248,113,113,.2)');
        rankCircle.setAttribute('stroke', 'rgba(248,113,113,.5)');
        labelEl.setAttribute('fill', '#5b6378');
        statusBg.setAttribute('fill', 'rgba(248,113,113,.15)');
        statusBg.setAttribute('stroke', 'rgba(248,113,113,.4)');
        statusTxt.textContent = "ADL'D";
        statusTxt.setAttribute('fill', '#f87171');
      } else {
        overlay.setAttribute('width', String(QW * cl.frac));
        rankCircle.setAttribute('fill', 'rgba(240,136,62,.2)');
        rankCircle.setAttribute('stroke', 'rgba(240,136,62,.5)');
        labelEl.setAttribute('fill', '#e7eaf3');
        statusBg.setAttribute('fill', 'rgba(240,136,62,.15)');
        statusBg.setAttribute('stroke', 'rgba(240,136,62,.4)');
        statusTxt.textContent = 'PARTIAL';
        statusTxt.setAttribute('fill', '#f0883e');
      }
    }

    // -- Slider outputs --
    outs.get('shortfall')!.textContent = fmtM(shortfall);
    outs.get('fund')!.textContent = fmtM(fund);

    // -- Dynamic panel --
    const [, vShortfall] = dynRows[0];
    const [, vFund] = dynRows[1];
    const [, vADL] = dynRows[2];
    const [, vHaircut] = dynRows[3];
    const [, vClosed] = dynRows[4];

    vShortfall.textContent = fmtM(shortfall);
    vShortfall.className = `adl-v ${shortfall > 0 ? 'c-orange' : 'c-dim'}`;

    vFund.textContent = r.insured > 0 ? fmtM(r.insured) : '$0';
    vFund.className = `adl-v ${r.insured > 0 ? 'c-teal' : 'c-dim'}`;

    vADL.textContent = r.adlAmt > 0 ? fmtM(r.adlAmt) : 'none';
    vADL.className = `adl-v ${r.adlAmt > 0 ? 'c-red' : 'c-green'}`;

    vHaircut.textContent = r.totalHaircut > 0 ? fmtM(r.totalHaircut) : '$0';
    vHaircut.className = `adl-v ${r.totalHaircut > 0 ? 'c-red' : 'c-dim'}`;

    const closed = [...r.closures.values()].filter((c) => c.status === 'closed').length;
    const partial = [...r.closures.values()].filter((c) => c.status === 'partial').length;
    if (closed === 0 && partial === 0) {
      vClosed.textContent = '0 of 5';
      vClosed.className = 'adl-v c-dim';
    } else {
      vClosed.textContent = `${closed} of 5${partial ? ' + 1 partial' : ''}`;
      vClosed.className = 'adl-v c-red';
    }
  }

  /* ---- Events ---- */
  function onShortfall(this: HTMLInputElement) {
    shortfall = Number(this.value);
    render();
  }
  function onFund(this: HTMLInputElement) {
    fund = Number(this.value);
    render();
  }

  const sfEl = sliders.get('shortfall')!;
  const fuEl = sliders.get('fund')!;
  sfEl.addEventListener('input', onShortfall);
  fuEl.addEventListener('input', onFund);

  render();

  return () => {
    layout.dispose();
    sfEl.removeEventListener('input', onShortfall);
    fuEl.removeEventListener('input', onFund);
    style.remove();
  };
}
