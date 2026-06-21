/**
 * Artifact: the-collateral-cage — The Collateral Cage
 * Manifest: content/artifacts/the-collateral-cage/manifest.json
 *
 * SVG stacked-bar calculator visualising the DeFi "credit tax": the excess
 * collateral locked to secure a loan in the absence of on-chain reputation.
 * Controls: loan amount slider · collateral asset tabs · credit tier tabs.
 * The cyan section is productive capital (the loan itself); the grey bar behind
 * cage-bars is the locked excess. Switching to Institutional collapses the cage
 * entirely — Maple Finance / Clearpool style uncollateralised lending.
 *
 * Layout: stage (SVG bar chart) · panel (4 stats) · footer (slider + tabs) · caption.
 */
import data from '../../../content/artifacts/the-collateral-cage/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VB_W = 800;
const VB_H = 200;

// Bar geometry inside viewBox
const BAR_X = 38;
const BAR_Y = 58;
const BAR_W = VB_W - 76;
const BAR_H = 84;
const CAGE_STRIDE = 18;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fmtUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1_000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

interface Asset {
  id: string;
  label: string;
  chain: string;
  maxLTV: number;
  liqThreshold: number;
  supplyAPY: number;
  tiers: Record<string, number>;
}

interface Tier {
  id: string;
  label: string;
  note: string;
}

interface State {
  loanAmount: number;
  assetId: string;
  tierId: string;
}

interface Computed {
  eLTV: number;
  collateral: number;
  tax: number;
  drag: number;
  isInstitutional: boolean;
  asset: Asset;
  loanFrac: number;
  taxFrac: number;
}

function compute(state: State): Computed {
  const asset = (data.assets as Asset[]).find((a) => a.id === state.assetId)!;
  const isInstitutional = state.tierId === 'institutional';
  const eLTV = isInstitutional ? 1.0 : (asset.tiers as Record<string, number>)[state.tierId];
  const collateral = isInstitutional ? state.loanAmount : state.loanAmount / eLTV;
  const tax = collateral - state.loanAmount;
  const drag = tax * data.opportunityDiff;
  return {
    eLTV,
    collateral,
    tax,
    drag,
    isInstitutional,
    asset,
    loanFrac: eLTV,
    taxFrac: 1 - eLTV,
  };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VB_W}/${VB_H}`,
    stageFr: '1.6fr',
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  stage.classList.add('cc-stage');
  panel.classList.add('cc-panel');
  ctrlSlot.classList.add('cc-ctrls');

  const style = document.createElement('style');
  style.textContent = `
    .cc-stage { min-width:0; position:relative; }
    .cc-svg { width:100%; height:100%; display:block; overflow:visible;
      font-family:'JetBrains Mono',monospace; }
    .cc-panel { display:flex; flex-direction:column; gap:8px; min-width:0;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; }
    .cc-statbox { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 13px; display:flex; flex-direction:column; gap:9px; }
    .cc-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .cc-stat-lbl { font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .cc-stat-val { font-size:15px; color:#e7eaf3; font-variant-numeric:tabular-nums; font-weight:700;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cc-stat-val.cc-cyan { color:#22d3ee; }
    .cc-stat-sub { font-size:10px; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .cc-ctrls { display:flex; flex-direction:column; gap:9px; min-width:0; }
    .cc-field { min-width:0; }
    .cc-field label { display:flex; justify-content:space-between; align-items:baseline;
      gap:6px; min-width:0; font:500 10px/1.3 'JetBrains Mono',monospace;
      letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .cc-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums;
      white-space:nowrap; }
    .cc-field input[type=range] { width:100%; cursor:pointer; background:transparent;
      margin:4px 0 0; accent-color:#22d3ee; }
    .cc-tabrow { display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap; }
    .cc-rowlbl { font:500 10px/1.3 'JetBrains Mono',monospace; letter-spacing:.06em;
      text-transform:uppercase; color:#5b6378; white-space:nowrap; flex:none; }
    .cc-tabs { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .cc-tab { border:1px solid rgba(124,140,255,.25); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad; font:600 10px 'JetBrains Mono',monospace;
      letter-spacing:.04em; text-transform:uppercase; padding:5px 9px; white-space:nowrap; }
    .cc-tab:hover, .cc-tab:focus-visible { border-color:#5b8cff; color:#e7eaf3; outline:none; }
    .cc-tab.cc-on { background:rgba(91,140,255,.12); border-color:#5b8cff;
      color:#e7eaf3; box-shadow:0 0 8px rgba(91,140,255,.18); }
    .cc-tab.cc-on-tier { background:rgba(34,211,238,.09); border-color:#22d3ee;
      color:#22d3ee; box-shadow:0 0 8px rgba(34,211,238,.18); }
    .cc-cap { font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .cc-cap b { color:#8d95ad; }
  `;
  stage.appendChild(style);

  const state: State = {
    loanAmount: 10000,
    assetId: 'weth',
    tierId: 'none',
  };

  /* ── SVG ─────────────────────────────────────────────── */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'cc-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'DeFi collateral cage stacked bar');

  const uid = Math.random().toString(36).slice(2, 8);
  const clipId = `cc-clip-${uid}`;

  // defs must precede any element that references them
  const defs = document.createElementNS(SVG_NS, 'defs');
  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipRect = document.createElementNS(SVG_NS, 'rect');
  clipRect.setAttribute('y', String(BAR_Y));
  clipRect.setAttribute('height', String(BAR_H));
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const mkEl = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
    return el;
  };

  // Background track
  mkEl('rect', {
    x: BAR_X, y: BAR_Y, width: BAR_W, height: BAR_H,
    rx: 7, ry: 7,
    fill: 'rgba(13,19,34,.9)',
    stroke: 'rgba(124,140,255,.18)', 'stroke-width': 1,
  });

  // Loan (productive) fill — cyan
  const loanRect = mkEl('rect', {
    x: BAR_X, y: BAR_Y, height: BAR_H,
    rx: 7, ry: 7,
    fill: 'rgba(34,211,238,.17)',
  });

  // Tax (locked excess) fill — muted grey
  const taxRect = mkEl('rect', {
    y: BAR_Y, height: BAR_H,
    fill: 'rgba(141,149,173,.1)',
  });

  // Cage bars group (clipped to tax area)
  const cageG = document.createElementNS(SVG_NS, 'g');
  cageG.setAttribute('clip-path', `url(#${clipId})`);
  svg.appendChild(cageG);
  const MAX_BARS = Math.ceil(BAR_W / CAGE_STRIDE) + 2;
  const cageBars: SVGLineElement[] = [];
  for (let i = 0; i < MAX_BARS; i++) {
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('stroke', 'rgba(141,149,173,.32)');
    ln.setAttribute('stroke-width', '1.5');
    ln.setAttribute('y1', String(BAR_Y));
    ln.setAttribute('y2', String(BAR_Y + BAR_H));
    ln.style.display = 'none';
    cageG.appendChild(ln);
    cageBars.push(ln as SVGLineElement);
  }

  // Divider line between loan and tax sections
  const divLine = mkEl('line', {
    stroke: '#22d3ee',
    'stroke-width': 2,
    y1: BAR_Y - 6, y2: BAR_Y + BAR_H + 6,
  });

  // Labels ABOVE bar
  const loanTopLbl = mkEl('text', {
    y: BAR_Y - 12,
    'font-size': 8.5,
    fill: '#22d3ee',
    'letter-spacing': '.08em',
    'font-weight': 700,
  });
  loanTopLbl.textContent = 'PRODUCTIVE CAPITAL';

  const taxTopLbl = mkEl('text', {
    y: BAR_Y - 12,
    'text-anchor': 'middle',
    'font-size': 8.5,
    fill: '#8d95ad',
    'letter-spacing': '.07em',
    'font-weight': 700,
  });
  taxTopLbl.textContent = 'CREDIT TAX';

  // LTV label inside bar (bottom-left of cyan section)
  const ltvLbl = mkEl('text', {
    x: BAR_X + 10,
    y: BAR_Y + BAR_H - 10,
    'font-size': 9,
    fill: 'rgba(34,211,238,.65)',
    'font-weight': 700,
    'letter-spacing': '.04em',
  });

  // Dollar value labels BELOW bar
  const loanValLbl = mkEl('text', {
    y: BAR_Y + BAR_H + 17,
    'text-anchor': 'middle',
    'font-size': 9.5,
    fill: '#22d3ee',
    'font-weight': 600,
    'font-variant-numeric': 'tabular-nums',
  });

  const taxValLbl = mkEl('text', {
    y: BAR_Y + BAR_H + 17,
    'text-anchor': 'middle',
    'font-size': 9.5,
    fill: '#8d95ad',
    'font-weight': 600,
    'font-variant-numeric': 'tabular-nums',
  });

  // Institutional: full-bar message
  const instLbl = mkEl('text', {
    x: VB_W / 2,
    y: BAR_Y + BAR_H / 2 + 5,
    'text-anchor': 'middle',
    'font-size': 12,
    fill: '#22d3ee',
    'font-weight': 700,
    'letter-spacing': '.08em',
  });
  instLbl.textContent = 'NO COLLATERAL REQUIRED';

  // Ratio callout: "1.54×" below divider line
  const ratioLbl = mkEl('text', {
    y: BAR_Y + BAR_H + 33,
    'text-anchor': 'middle',
    'font-size': 8.5,
    fill: '#5b6378',
    'font-variant-numeric': 'tabular-nums',
  });

  stage.appendChild(svg);

  /* ── Panel ───────────────────────────────────────────── */
  const statBox = document.createElement('div');
  statBox.className = 'cc-statbox';

  function makeStat(lbl: string, valCls = '') {
    const el = document.createElement('div');
    el.className = 'cc-stat';
    const l = document.createElement('div');
    l.className = 'cc-stat-lbl';
    l.textContent = lbl;
    const v = document.createElement('div');
    v.className = `cc-stat-val${valCls ? ' ' + valCls : ''}`;
    const s = document.createElement('div');
    s.className = 'cc-stat-sub';
    el.append(l, v, s);
    statBox.appendChild(el);
    return { v, s };
  }

  const sCollateral = makeStat('Collateral Needed', 'cc-cyan');
  const sTax = makeStat('Credit Tax');
  const sDrag = makeStat('Annual Drag');
  const sLTV = makeStat('Effective LTV');

  panel.appendChild(statBox);

  /* ── Controls ────────────────────────────────────────── */
  // Loan slider
  const loanField = document.createElement('div');
  loanField.className = 'cc-field';
  const loanLbl = document.createElement('label');
  const loanLblTxt = document.createElement('span');
  loanLblTxt.textContent = 'Loan amount';
  const loanOut = document.createElement('output');
  loanLbl.append(loanLblTxt, loanOut);
  const loanSlider = document.createElement('input');
  loanSlider.type = 'range';
  loanSlider.min = '1000';
  loanSlider.max = '500000';
  loanSlider.step = '1000';
  loanSlider.value = String(state.loanAmount);
  loanSlider.setAttribute('aria-label', 'Loan amount');
  loanField.append(loanLbl, loanSlider);
  ctrlSlot.appendChild(loanField);

  // Asset tabs
  const assetRow = document.createElement('div');
  assetRow.className = 'cc-tabrow';
  const assetRowLbl = document.createElement('div');
  assetRowLbl.className = 'cc-rowlbl';
  assetRowLbl.textContent = 'Collateral';
  const assetTabs = document.createElement('div');
  assetTabs.className = 'cc-tabs';
  const assetBtns = new Map<string, HTMLButtonElement>();
  for (const a of data.assets as Asset[]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cc-tab' + (a.id === state.assetId ? ' cc-on' : '');
    btn.textContent = `${a.label} · ${a.chain}`;
    btn.dataset.id = a.id;
    btn.setAttribute('aria-label', `${a.label} on ${a.chain}, max LTV ${(a.maxLTV * 100).toFixed(1)}%`);
    assetTabs.appendChild(btn);
    assetBtns.set(a.id, btn);
  }
  assetRow.append(assetRowLbl, assetTabs);
  ctrlSlot.appendChild(assetRow);

  // Tier tabs
  const tierRow = document.createElement('div');
  tierRow.className = 'cc-tabrow';
  const tierRowLbl = document.createElement('div');
  tierRowLbl.className = 'cc-rowlbl';
  tierRowLbl.textContent = 'Credit tier';
  const tierTabs = document.createElement('div');
  tierTabs.className = 'cc-tabs';
  const tierBtns = new Map<string, HTMLButtonElement>();
  for (const t of data.tiers as Tier[]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cc-tab' + (t.id === state.tierId ? ' cc-on-tier' : '');
    btn.textContent = t.label;
    btn.dataset.id = t.id;
    btn.title = t.note;
    btn.setAttribute('aria-label', `${t.label}: ${t.note}`);
    tierTabs.appendChild(btn);
    tierBtns.set(t.id, btn);
  }
  tierRow.append(tierRowLbl, tierTabs);
  ctrlSlot.appendChild(tierRow);

  /* ── Caption ─────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'cc-cap';
  cap.innerHTML =
    `<b>Aave V3</b> (Base + Ethereum mainnet), June 2026. Effective LTV includes a safety ` +
    `utilization buffer below the protocol maximum. Annual drag uses a <b>5.2% opportunity ` +
    `differential</b> (active LP yield ~8% vs Aave supply ~2.8%).`;
  caption.appendChild(cap);

  /* ── Render ──────────────────────────────────────────── */
  function render() {
    const c = compute(state);
    const { eLTV, collateral, tax, drag, isInstitutional, asset, loanFrac } = c;

    const loanPx = isInstitutional ? BAR_W : Math.round(BAR_W * loanFrac);
    const taxPx = BAR_W - loanPx;
    const taxX = BAR_X + loanPx;

    // Bar fill
    loanRect.setAttribute('width', String(loanPx));
    taxRect.setAttribute('x', String(taxX));
    taxRect.setAttribute('width', String(Math.max(0, taxPx)));

    // Clip region for cage bars
    clipRect.setAttribute('x', String(taxX));
    clipRect.setAttribute('width', String(Math.max(0, taxPx)));

    // Cage bars (stride within tax area)
    const nBars = isInstitutional ? 0 : Math.floor(taxPx / CAGE_STRIDE);
    for (let i = 0; i < MAX_BARS; i++) {
      if (i < nBars) {
        const x = taxX + (i + 1) * CAGE_STRIDE;
        cageBars[i].setAttribute('x1', String(x));
        cageBars[i].setAttribute('x2', String(x));
        cageBars[i].style.display = '';
      } else {
        cageBars[i].style.display = 'none';
      }
    }

    // Divider line
    divLine.setAttribute('x1', String(BAR_X + loanPx));
    divLine.setAttribute('x2', String(BAR_X + loanPx));
    const showDiv = !isInstitutional && taxPx > 4;
    divLine.style.display = showDiv ? '' : 'none';

    // Labels
    const loanCx = BAR_X + loanPx / 2;
    const taxCx = taxX + taxPx / 2;

    loanTopLbl.setAttribute('x', String(Math.max(BAR_X, loanCx - 68)));
    ltvLbl.textContent = isInstitutional ? '' : `${(eLTV * 100).toFixed(0)}% LTV`;

    loanValLbl.setAttribute('x', String(loanCx));
    loanValLbl.textContent = fmtUSD(state.loanAmount);

    const showTaxLbls = !isInstitutional && taxPx > 70;
    taxTopLbl.setAttribute('x', String(clamp(taxCx, taxX + 2, BAR_X + BAR_W - 2)));
    taxTopLbl.style.display = showTaxLbls ? '' : 'none';
    taxValLbl.setAttribute('x', String(clamp(taxCx, taxX + 2, BAR_X + BAR_W - 2)));
    taxValLbl.textContent = fmtUSD(tax);
    taxValLbl.style.display = showTaxLbls ? '' : 'none';

    instLbl.style.display = isInstitutional ? '' : 'none';

    // Ratio below divider
    if (!isInstitutional) {
      ratioLbl.setAttribute('x', String(BAR_X + loanPx));
      ratioLbl.textContent = `${(1 / eLTV).toFixed(2)}× collateral`;
      ratioLbl.style.display = '';
    } else {
      ratioLbl.style.display = 'none';
    }

    // Panel stats
    loanOut.textContent = fmtUSD(state.loanAmount);

    if (isInstitutional) {
      sCollateral.v.textContent = fmtUSD(state.loanAmount);
      sCollateral.s.textContent = 'No excess required';
      sTax.v.textContent = '$0';
      sTax.s.textContent = 'Uncollateralised';
      sDrag.v.textContent = '$0 / yr';
      sDrag.s.textContent = 'No opportunity cost';
      sLTV.v.textContent = '100.0%';
      sLTV.s.textContent = `vs ${fmtPct(asset.maxLTV)} protocol max`;
    } else {
      sCollateral.v.textContent = fmtUSD(collateral);
      sCollateral.s.textContent = `${(1 / eLTV).toFixed(2)}× collateral ratio`;
      sTax.v.textContent = fmtUSD(tax);
      sTax.s.textContent = `${((1 - eLTV) * 100).toFixed(0)}% of collateral idle`;
      sDrag.v.textContent = `${fmtUSD(drag)} / yr`;
      sDrag.s.textContent = '5.2% opportunity differential';
      sLTV.v.textContent = fmtPct(eLTV);
      sLTV.s.textContent = `vs ${fmtPct(asset.maxLTV)} protocol max`;
    }
  }

  /* ── Event Handlers ──────────────────────────────────── */
  function onLoanInput() {
    state.loanAmount = Number(loanSlider.value);
    render();
  }

  function onAssetClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
    if (!btn) return;
    state.assetId = btn.dataset.id!;
    for (const [id, b] of assetBtns) b.classList.toggle('cc-on', id === state.assetId);
    render();
  }

  function onTierClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
    if (!btn) return;
    state.tierId = btn.dataset.id!;
    for (const [id, b] of tierBtns) b.classList.toggle('cc-on-tier', id === state.tierId);
    render();
  }

  loanSlider.addEventListener('input', onLoanInput);
  assetTabs.addEventListener('click', onAssetClick);
  tierTabs.addEventListener('click', onTierClick);

  render();

  return () => {
    loanSlider.removeEventListener('input', onLoanInput);
    assetTabs.removeEventListener('click', onAssetClick);
    tierTabs.removeEventListener('click', onTierClick);
    layout.dispose();
    style.remove();
  };
}
