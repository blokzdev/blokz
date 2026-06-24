/**
 * Artifact: the-survivability-lift — The Survivability Lift
 * Manifest: content/artifacts/the-survivability-lift/manifest.json
 *
 * Horizontal before/after bar chart across four survivability metrics
 * from SAE (Survivability-Aware Execution, arXiv 2603.10092):
 *   MDD 46.4% → 3.2% (↓93.1%), CVaR₀.₉₉ ↓97.5%,
 *   Delegation Gap ↓97.0%, Attack Success 100% → 72.8%.
 *
 * Each metric shows two bars: before (orange, 100% width) and after (teal,
 * proportionally smaller). All bars normalize to their own before-value so
 * each pair is directly comparable regardless of absolute scale.
 *
 * Click a metric row to inspect its detail in the panel.
 * Controls panel lists the five SAE execution-contract invariants.
 *
 * Layout: rail (panel + controls stacked in right column).
 * Stage uses a fixed viewBox so SVG bars scale cleanly at every width.
 */
import data from '../../../content/artifacts/the-survivability-lift/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
// viewBox geometry
const VB_W = 420;
const VB_H = 190;
const X_LBL = 0;    // metric label left edge
const X_BAR = 105;  // bar left edge
const X_END = 410;  // bar right edge (max)
const BAR_H = 11;   // height of each bar
const BAR_GAP = 3;  // gap between before/after bar in same metric
const ROW_H = 44;   // height allocated per metric row

// Metric row top-of-before-bar y positions
function rowY(i: number): number {
  return 12 + i * ROW_H;
}

const COLOR_BEFORE = '#f97316';   // orange — high = bad
const COLOR_AFTER  = '#22d3ee';   // teal   — low = good
const COLOR_DIM    = 'rgba(124,140,255,.12)';
const COLOR_SEL    = 'rgba(34,211,238,.08)';
const COLOR_TEXT   = '#8d95ad';
const COLOR_LABEL  = '#e7eaf3';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

type Metric = (typeof data.metrics)[0];

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VB_W}/${VB_H}`,
    stageFr: '1.7fr',
  });
  const { stage, panel, controls, caption } = layout;

  /* ── Styles ──────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .sl-svg { width:100%; height:100%; display:block; overflow:visible;
      font-family:'JetBrains Mono',monospace; }
    .sl-row-bg { cursor:pointer; }
    .sl-row-bg:focus-visible { outline:2px solid #22d3ee; outline-offset:-2px; }
    .sl-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .sl-card  { border:1px solid rgba(124,140,255,.14); border-radius:10px;
      background:#0d1322; padding:10px 12px; display:flex; flex-direction:column;
      gap:8px; min-width:0; }
    .sl-metric-name { font:700 12px 'JetBrains Mono',monospace; color:${COLOR_AFTER}; }
    .sl-sublabel { font:500 9.5px 'JetBrains Mono',monospace;
      letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .sl-desc  { font-size:10.5px; line-height:1.55; color:#8d95ad; min-width:0; }
    .sl-nums  { display:grid; grid-template-columns:auto 1fr; gap:3px 10px;
      font-size:10px; align-items:center; }
    .sl-lbl   { color:#5b6378; white-space:nowrap; }
    .sl-val   { color:${COLOR_LABEL}; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .sl-val.before { color:${COLOR_BEFORE}; }
    .sl-val.after  { color:${COLOR_AFTER}; }
    .sl-badge { align-self:flex-start; font:700 10px 'JetBrains Mono',monospace;
      letter-spacing:.07em; padding:3px 8px; border-radius:5px; white-space:nowrap;
      color:#22d3ee; background:rgba(34,211,238,.1);
      box-shadow:inset 0 0 0 1px rgba(34,211,238,.35); }
    .sl-hint  { font-size:10px; color:#5b6378; line-height:1.5; text-align:center;
      padding:12px 8px; }
    .sl-inv-list { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .sl-inv   { min-width:0; }
    .sl-inv-label { font:700 9px 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#8d95ad; margin-bottom:2px; }
    .sl-inv-desc  { font-size:9.5px; line-height:1.5; color:#5b6378; min-width:0; }
    .sl-cap   { font-size:9px; color:#5b6378; letter-spacing:.02em; line-height:1.55; }
    .sl-cap b { color:#8d95ad; font-weight:600; }
    .sl-cap a { color:#7c8cff; text-decoration:none; }
    .sl-cap a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);

  /* ── SVG ─────────────────────────────────────────────────────── */
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'sl-svg',
    role: 'img',
    'aria-label': 'Survivability Lift: before vs after SAE execution controls across four metrics',
  });

  let selectedId: string | null = null;

  const MAX_BAR = X_END - X_BAR;

  // Row backgrounds (for selection highlight)
  const rowBgs: SVGRectElement[] = [];
  // Bar elements per metric
  interface RowEls {
    bg: SVGRectElement;
    beforeBar: SVGRectElement;
    afterBar: SVGRectElement;
    labelEl: SVGTextElement;
    sublabelEl: SVGTextElement;
    beforeLblEl: SVGTextElement;
    afterLblEl: SVGTextElement;
    pctLblEl: SVGTextElement;
  }
  const rows: RowEls[] = [];

  for (let i = 0; i < data.metrics.length; i++) {
    const m = data.metrics[i];
    const yBefore = rowY(i);
    const yAfter  = yBefore + BAR_H + BAR_GAP;
    const rowTop  = yBefore - 4;
    const rowH    = ROW_H;

    // Background rect (click target + selection)
    const bg = svgEl('rect', {
      x: '0',
      y: String(rowTop),
      width: String(VB_W),
      height: String(rowH),
      fill: COLOR_DIM,
      rx: '4',
      class: 'sl-row-bg',
      tabindex: '0',
      role: 'button',
      'aria-label': `${m.label}: ${m.reductionPct}% reduction with SAE`,
    });
    svg.appendChild(bg);
    rowBgs.push(bg);

    // Metric label
    const labelEl = svgEl('text', {
      x: String(X_LBL),
      y: String(yBefore + BAR_H - 1),
      'font-size': '9.5',
      'font-weight': '600',
      fill: COLOR_LABEL,
      'text-anchor': 'start',
    }) as SVGTextElement;
    labelEl.textContent = m.label;
    svg.appendChild(labelEl);

    // Sub-label (metric id, smaller)
    const sublabelEl = svgEl('text', {
      x: String(X_LBL),
      y: String(yAfter + BAR_H),
      'font-size': '7.5',
      fill: COLOR_TEXT,
      'text-anchor': 'start',
    }) as SVGTextElement;
    sublabelEl.textContent = m.sublabel;
    svg.appendChild(sublabelEl);

    // Before bar (always full width)
    const beforeBar = svgEl('rect', {
      x: String(X_BAR),
      y: String(yBefore),
      width: String(MAX_BAR),
      height: String(BAR_H),
      fill: COLOR_BEFORE,
      opacity: '0.85',
      rx: '2',
    }) as SVGRectElement;
    svg.appendChild(beforeBar);

    // After bar (proportional)
    const afterW = Math.max(2, (m.after / m.before) * MAX_BAR);
    const afterBar = svgEl('rect', {
      x: String(X_BAR),
      y: String(yAfter),
      width: String(afterW),
      height: String(BAR_H),
      fill: COLOR_AFTER,
      opacity: '0.9',
      rx: '2',
    }) as SVGRectElement;
    svg.appendChild(afterBar);

    // Before value label (right of before bar)
    const beforeLblEl = svgEl('text', {
      x: String(X_END + 3),
      y: String(yBefore + BAR_H - 1),
      'font-size': '8',
      fill: COLOR_BEFORE,
      'text-anchor': 'start',
    }) as SVGTextElement;
    beforeLblEl.textContent = m.displayBefore;
    svg.appendChild(beforeLblEl);

    // After value label (right of after bar)
    const afterLblEl = svgEl('text', {
      x: String(X_BAR + afterW + 4),
      y: String(yAfter + BAR_H - 1),
      'font-size': '8',
      fill: COLOR_AFTER,
      'text-anchor': 'start',
    }) as SVGTextElement;
    afterLblEl.textContent = m.displayAfter;
    svg.appendChild(afterLblEl);

    // Reduction % badge (far right, between rows)
    const pctLblEl = svgEl('text', {
      x: String(X_END),
      y: String(yBefore + BAR_H + BAR_GAP / 2 + BAR_H + 9),
      'font-size': '8',
      fill: '#4ade80',
      'text-anchor': 'end',
      'font-weight': '700',
    }) as SVGTextElement;
    pctLblEl.textContent = `↓${m.reductionPct}%`;
    svg.appendChild(pctLblEl);

    rows.push({ bg, beforeBar, afterBar, labelEl, sublabelEl, beforeLblEl, afterLblEl, pctLblEl });
  }

  // Column header labels
  const headerBefore = svgEl('text', {
    x: String(X_END),
    y: '9',
    'font-size': '7.5',
    fill: COLOR_BEFORE,
    'text-anchor': 'end',
    'font-weight': '600',
    'letter-spacing': '.05em',
  }) as SVGTextElement;
  headerBefore.textContent = '← BEFORE SAE';
  svg.appendChild(headerBefore);

  // Divider line between before/after annotation
  const divLine = svgEl('line', {
    x1: String(X_BAR - 4),
    y1: '0',
    x2: String(X_BAR - 4),
    y2: String(VB_H),
    stroke: 'rgba(124,140,255,.18)',
    'stroke-width': '1',
    'stroke-dasharray': '3 3',
  });
  svg.appendChild(divLine);

  stage.appendChild(svg);

  /* ── Panel ───────────────────────────────────────────────────── */
  panel.className = 'sl-panel';
  const card = document.createElement('div');
  card.className = 'sl-card';
  panel.appendChild(card);

  function renderPanel(m: Metric | null): void {
    card.innerHTML = '';
    if (!m) {
      const hint = document.createElement('div');
      hint.className = 'sl-hint';
      hint.textContent = 'Click a metric row to inspect its before/after values and what SAE controls drove the reduction.';
      card.appendChild(hint);
      return;
    }

    const name = document.createElement('div');
    name.className = 'sl-metric-name';
    name.textContent = m.label;
    card.appendChild(name);

    const sub = document.createElement('div');
    sub.className = 'sl-sublabel';
    sub.textContent = m.sublabel;
    card.appendChild(sub);

    const badge = document.createElement('div');
    badge.className = 'sl-badge';
    badge.textContent = `↓${m.reductionPct}% with SAE`;
    card.appendChild(badge);

    const desc = document.createElement('div');
    desc.className = 'sl-desc';
    desc.textContent = m.description;
    card.appendChild(desc);

    const nums = document.createElement('div');
    nums.className = 'sl-nums';

    function addRow(lbl: string, val: string, cls?: string): void {
      const l = document.createElement('div');
      l.className = 'sl-lbl';
      l.textContent = lbl;
      nums.appendChild(l);
      const v = document.createElement('div');
      v.className = 'sl-val' + (cls ? ` ${cls}` : '');
      v.textContent = val;
      nums.appendChild(v);
    }

    addRow('Before SAE', m.displayBefore, 'before');
    addRow('After SAE', m.displayAfter, 'after');
    card.appendChild(nums);
  }

  renderPanel(null);

  /* ── Controls ────────────────────────────────────────────────── */
  controls.innerHTML = '';
  const invTitle = document.createElement('div');
  invTitle.style.cssText = 'font:700 9px/1 "JetBrains Mono",monospace;letter-spacing:.09em;text-transform:uppercase;color:#5b6378;margin-bottom:6px;';
  invTitle.textContent = 'SAE Execution Invariants';
  controls.appendChild(invTitle);

  const invList = document.createElement('div');
  invList.className = 'sl-inv-list';
  for (const inv of data.controls) {
    const item = document.createElement('div');
    item.className = 'sl-inv';
    const lbl = document.createElement('div');
    lbl.className = 'sl-inv-label';
    lbl.textContent = inv.label;
    const desc = document.createElement('div');
    desc.className = 'sl-inv-desc';
    desc.textContent = inv.desc;
    item.appendChild(lbl);
    item.appendChild(desc);
    invList.appendChild(item);
  }
  controls.appendChild(invList);

  /* ── Caption ─────────────────────────────────────────────────── */
  caption.className = 'sl-cap';
  caption.innerHTML =
    `<b>Source:</b> Borjigin et al., ` +
    `<a href="https://arxiv.org/abs/2603.10092" target="_blank" rel="noopener">arXiv 2603.10092</a> (Mar 2026). ` +
    `Test window: Binance USD-M BTCUSDT/ETHUSDT perpetuals, Sep–Dec 2025 (15-min bars). ` +
    `All bars normalized to each metric's "before" value. ↓ = reduction is better.`;

  /* ── Interaction ─────────────────────────────────────────────── */
  function applySelection(): void {
    for (let i = 0; i < data.metrics.length; i++) {
      const m = data.metrics[i];
      const r = rows[i];
      const sel = selectedId === m.id;
      r.bg.setAttribute('fill', sel ? COLOR_SEL : COLOR_DIM);
      r.beforeBar.setAttribute('opacity', sel || !selectedId ? '0.85' : '0.3');
      r.afterBar.setAttribute('opacity', sel || !selectedId ? '0.9' : '0.3');
      r.labelEl.setAttribute('opacity', sel || !selectedId ? '1' : '0.4');
      r.sublabelEl.setAttribute('opacity', sel || !selectedId ? '1' : '0.4');
      r.beforeLblEl.setAttribute('opacity', sel || !selectedId ? '1' : '0.3');
      r.afterLblEl.setAttribute('opacity', sel || !selectedId ? '1' : '0.3');
      r.pctLblEl.setAttribute('opacity', sel || !selectedId ? '1' : '0.3');
    }
    const selMetric = data.metrics.find(m => m.id === selectedId) ?? null;
    renderPanel(selMetric);
  }

  const clickHandlers: Array<[Element, EventListener, EventListener]> = [];

  for (let i = 0; i < data.metrics.length; i++) {
    const m = data.metrics[i];
    const r = rows[i];

    const clickHandler: EventListener = () => {
      selectedId = selectedId === m.id ? null : m.id;
      applySelection();
    };
    const keyHandler: EventListener = (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        clickHandler(e);
      }
    };
    r.bg.addEventListener('click', clickHandler);
    r.bg.addEventListener('keydown', keyHandler);
    clickHandlers.push([r.bg, clickHandler, keyHandler]);
  }

  /* ── Cleanup ─────────────────────────────────────────────────── */
  return () => {
    for (const [el, ch, kh] of clickHandlers) {
      el.removeEventListener('click', ch);
      el.removeEventListener('keydown', kh);
    }
    layout.dispose();
    style.remove();
  };
}
