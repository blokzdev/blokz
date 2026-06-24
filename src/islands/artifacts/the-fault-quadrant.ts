/**
 * Artifact: the-fault-quadrant — The Fault Quadrant
 *
 * A 2D diagram plotting EigenCloud's four fault categories by cryptographic
 * verifiability (X-axis) and observable consensus agreement (Y-axis). Click any
 * fault type to see which slashing mechanism — ETH slash, EIGEN fork, or none —
 * can apply and why it falls in that quadrant.
 *
 * Layout: shared responsive primitive (stage: SVG quadrant · panel: detail card
 * · caption: provenance hint). Rail layout — panel right of stage in landscape,
 * stacked in portrait. No data.json — positions are conceptual from the EIGEN
 * Token Whitepaper.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

interface FaultDef {
  id: string;
  label: string;
  quadrant: 'objective' | 'intersubjective' | 'subjective' | 'non-attributable';
  /** 0–1: 0 = low cryptographic verifiability (left), 1 = high (right) */
  cx: number;
  /** 0–1: 0 = low observable consensus (bottom), 1 = high (top) */
  cy: number;
  description: string;
  slash: string;
}

const FAULTS: FaultDef[] = [
  {
    id: 'double-sign',
    label: 'Double-sign',
    quadrant: 'objective',
    cx: 0.85,
    cy: 0.82,
    description:
      'A validator signs two conflicting blocks at the same slot height. The pair of signatures is a cryptographic witness — any node can verify the contradiction on-chain without re-executing anything.',
    slash: 'ETH slash',
  },
  {
    id: 'invalid-state',
    label: 'Invalid state root',
    quadrant: 'objective',
    cx: 0.72,
    cy: 0.72,
    description:
      'A rollup operator publishes a state root that does not follow from the transaction inputs. A fraud or validity proof demonstrates the discrepancy to any on-chain verifier — the math is the evidence.',
    slash: 'ETH slash',
  },
  {
    id: 'oracle-price',
    label: 'Oracle price lie',
    quadrant: 'intersubjective',
    cx: 0.20,
    cy: 0.84,
    description:
      "An oracle reports ETH = $0 when every market shows ~$4,000. No ZK circuit can prove a price is 'wrong' without a trusted reference — but all reasonable observers agree. EIGEN forking turns that social agreement into an economic penalty.",
    slash: 'EIGEN fork',
  },
  {
    id: 'ai-wrong-answer',
    label: 'AI wrong answer',
    quadrant: 'intersubjective',
    cx: 0.30,
    cy: 0.72,
    description:
      "An AI oracle returns a provably absurd answer (2 + 2 = 5). Re-execution can't serve as a verifier: cross-GPU nondeterminism causes honest operators to diverge. EIGEN's intersubjective quorum covers what byte-equality cannot reach.",
    slash: 'EIGEN fork',
  },
  {
    id: 'tx-censorship',
    label: 'TX censorship',
    quadrant: 'intersubjective',
    cx: 0.15,
    cy: 0.62,
    description:
      'A sequencer repeatedly omits specific accounts despite available gas. Observers can correlate mempool data with published blocks, but no circuit proves "should have included." EIGEN social consensus can express this shared judgment.',
    slash: 'EIGEN fork',
  },
  {
    id: 'latency-sla',
    label: 'Latency SLA breach',
    quadrant: 'subjective',
    cx: 0.22,
    cy: 0.28,
    description:
      'Did a response arrive within the SLA window? Network conditions vary per observer. Two watchers at different geographic locations may genuinely disagree. No consensus is reachable — no slash can be justified.',
    slash: 'No slash',
  },
  {
    id: 'price-interpretation',
    label: 'Price interpretation',
    quadrant: 'subjective',
    cx: 0.10,
    cy: 0.16,
    description:
      "Was the oracle's price accurate? Different exchanges give different numbers; 'correct' depends on which source is canonical. Reasonable observers disagree — no EIGEN fork can reach consensus on a genuinely contested valuation.",
    slash: 'No slash',
  },
  {
    id: 'data-withholding',
    label: 'Data withholding',
    quadrant: 'non-attributable',
    cx: 0.74,
    cy: 0.28,
    description:
      "A user can't retrieve stored data. They observe unavailability but can't prove the operator has the data vs never having stored it. The fault is real but can't be attributed to one party — no one can generate a proof of the omission.",
    slash: 'No slash',
  },
];

type QKey = FaultDef['quadrant'];

interface QMeta {
  label: string;
  short: string;
  slash: string;
  dotColor: string;
  bg: string;
  border: string;
}

const Q_META: Record<QKey, QMeta> = {
  objective: {
    label: 'Objective',
    short: 'OBJECTIVE',
    slash: 'ETH slash',
    dotColor: '#22d3ee',
    bg: 'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.2)',
  },
  intersubjective: {
    label: 'Intersubjective',
    short: 'INTERSUBJECTIVE',
    slash: 'EIGEN fork',
    dotColor: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
  },
  subjective: {
    label: 'Subjective',
    short: 'SUBJECTIVE',
    slash: 'No slash',
    dotColor: '#6b7280',
    bg: 'rgba(107,114,128,0.05)',
    border: 'rgba(107,114,128,0.15)',
  },
  'non-attributable': {
    label: 'Non-attributable',
    short: 'NON-ATTR.',
    slash: 'No slash',
    dotColor: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.2)',
  },
};

// SVG chart geometry (viewBox 0 0 100 100)
const CL = 10; // chart left
const CT = 6;  // chart top
const CW = 88; // chart width
const CH = 82; // chart height
const CR = CL + CW; // chart right = 98
const CB = CT + CH; // chart bottom = 88

/** Fault cx (0–1) → SVG x */
const toSvgX = (cx: number) => CL + cx * CW;
/** Fault cy (0–1, bottom=0, top=1) → SVG y (SVG: top=0, bottom=high) */
const toSvgY = (cy: number) => CT + (1 - cy) * CH;

const DIV_X = toSvgX(0.5); // vertical divider at x=54
const DIV_Y = toSvgY(0.5); // horizontal divider at y=47

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '1/1',
    stageFr: '1.1fr',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .tfq-svg { display:block; width:100%; height:100%; overflow:visible; }
    .tfq-dot { cursor:pointer; }
    .tfq-dot-ring { transition:opacity .15s; opacity:0; }
    .tfq-dot-circle { transition:opacity .12s; opacity:.75; }
    .tfq-dot:hover .tfq-dot-ring { opacity:.45; }
    .tfq-dot:hover .tfq-dot-circle { opacity:1; }
    .tfq-dot.tfq-active .tfq-dot-ring { opacity:1; }
    .tfq-dot.tfq-active .tfq-dot-circle { opacity:1; }
    .tfq-dot:focus-visible { outline:none; }
    .tfq-dot:focus-visible .tfq-dot-ring { opacity:.7; }

    .tfq-panel { display:flex; flex-direction:column; gap:10px; height:100%; min-width:0;
      font:12px/1.5 system-ui,-apple-system,sans-serif; color:#8d95ad; }
    .tfq-empty { display:flex; flex-direction:column; gap:5px; padding-top:4px; }
    .tfq-section-title { font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:#4a5060; }
    .tfq-empty-hint { font-size:11px; color:#5b6378; line-height:1.6; }
    .tfq-detail { display:none; flex-direction:column; gap:9px; }
    .tfq-detail.tfq-show { display:flex; }
    .tfq-fault-name { font:600 13.5px/1.3 system-ui,-apple-system,sans-serif; color:#e7eaf3;
      min-width:0; overflow-wrap:anywhere; }
    .tfq-badge { display:inline-flex; align-items:center; border-radius:4px; padding:2px 7px;
      font:600 9px/1.4 system-ui,-apple-system,sans-serif; letter-spacing:.07em;
      text-transform:uppercase; white-space:nowrap; width:fit-content; }
    .tfq-desc { font-size:11px; line-height:1.65; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .tfq-mech { display:flex; align-items:center; gap:6px; min-width:0; flex-wrap:wrap; }
    .tfq-mech-label { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#4a5060; }
    .tfq-mech-val { font:700 11.5px/1 system-ui,-apple-system,sans-serif; }

    .tfq-legend { display:flex; flex-direction:column; gap:5px; margin-top:auto;
      border-top:1px solid rgba(255,255,255,.06); padding-top:9px; }
    .tfq-legend-row { display:flex; align-items:center; gap:7px; min-width:0; }
    .tfq-legend-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
    .tfq-legend-text { font-size:10px; color:#5b6378; line-height:1.45; min-width:0; overflow-wrap:anywhere; }

    .tfq-caption { font-size:9.5px; color:#4a5060; line-height:1.5; min-width:0; }
  `;
  stage.appendChild(style);

  // ── SVG diagram ───────────────────────────────────────────────────────────
  const ns = 'http://www.w3.org/2000/svg';
  function mk(tag: string): SVGElement {
    return document.createElementNS(ns, tag) as SVGElement;
  }
  function attr(el: SVGElement, attrs: Record<string, string | number>): void {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  }

  const svg = mk('svg') as SVGSVGElement;
  attr(svg, { viewBox: '0 0 100 100', width: '100%', height: '100%',
    role: 'img', 'aria-label': 'Fault quadrant: cryptographic verifiability vs observable consensus' });
  svg.setAttribute('class', 'tfq-svg');
  stage.appendChild(svg);

  // Quadrant background rects
  const quadRects: [QKey, number, number, number, number][] = [
    ['objective',       DIV_X, CT,     CR - DIV_X, DIV_Y - CT],
    ['intersubjective', CL,    CT,     DIV_X - CL, DIV_Y - CT],
    ['subjective',      CL,    DIV_Y,  DIV_X - CL, CB - DIV_Y],
    ['non-attributable',DIV_X, DIV_Y,  CR - DIV_X, CB - DIV_Y],
  ];
  for (const [q, x, y, w, h] of quadRects) {
    const m = Q_META[q];
    const r = mk('rect');
    attr(r, { x, y, width: w, height: h, fill: m.bg, stroke: m.border, 'stroke-width': 0.4 });
    svg.appendChild(r);
  }

  // Helper: line
  function line(x1: number, y1: number, x2: number, y2: number,
    stroke: string, sw = 0.4, dash = ''): void {
    const el = mk('line');
    attr(el, { x1, y1, x2, y2, stroke, 'stroke-width': sw });
    if (dash) el.setAttribute('stroke-dasharray', dash);
    svg.appendChild(el);
  }

  // Chart border
  line(CL, CT, CR, CT, 'rgba(255,255,255,.1)');
  line(CL, CB, CR, CB, 'rgba(255,255,255,.1)');
  line(CL, CT, CL, CB, 'rgba(255,255,255,.1)');
  line(CR, CT, CR, CB, 'rgba(255,255,255,.1)');
  // Dividers
  line(DIV_X, CT, DIV_X, CB, 'rgba(255,255,255,.15)', 0.4, '2,1.5');
  line(CL, DIV_Y, CR, DIV_Y, 'rgba(255,255,255,.15)', 0.4, '2,1.5');

  // Helper: text
  function txt(x: number, y: number, content: string,
    fill: string, size: number, anchor: 'start'|'middle'|'end' = 'middle',
    transform = ''): SVGElement {
    const el = mk('text');
    attr(el, { x, y, fill, 'font-size': size, 'text-anchor': anchor,
      'font-family': 'system-ui,-apple-system,sans-serif', 'pointer-events': 'none' });
    if (transform) el.setAttribute('transform', transform);
    el.textContent = content;
    svg.appendChild(el);
    return el;
  }

  // Quadrant labels
  txt(DIV_X + (CR - DIV_X) / 2, CT + 4, 'OBJECTIVE',       'rgba(34,211,238,.3)',  3);
  txt(DIV_X + (CR - DIV_X) / 2, CT + 7.5,'→ ETH slash',    'rgba(34,211,238,.18)', 2.5);
  txt(CL + (DIV_X - CL) / 2,   CT + 4, 'INTERSUBJECTIVE',  'rgba(167,139,250,.3)', 2.8);
  txt(CL + (DIV_X - CL) / 2,   CT + 7.5,'→ EIGEN fork',    'rgba(167,139,250,.18)',2.5);
  txt(CL + (DIV_X - CL) / 2,   CB - 3,  'SUBJECTIVE',      'rgba(107,114,128,.3)', 3);
  txt(DIV_X + (CR - DIV_X) / 2, CB - 3, 'NON-ATTR.',       'rgba(245,158,11,.3)',  3);

  // X-axis label (bottom, outside chart)
  txt(CL + CW / 2, CB + 6.5, 'Cryptographic verifiability →',
    'rgba(255,255,255,.18)', 2.5);

  // Y-axis label (left, rotated)
  txt(0, 0, 'Observable consensus →',
    'rgba(255,255,255,.18)', 2.5, 'middle',
    `translate(4, ${CT + CH / 2}) rotate(-90)`);

  // ── Fault dots ────────────────────────────────────────────────────────────
  const dotGroups = new Map<string, SVGElement>();
  const listeners: Array<[EventTarget, string, EventListener]> = [];

  function addL(el: EventTarget, ev: string, fn: EventListener): void {
    el.addEventListener(ev, fn);
    listeners.push([el, ev, fn]);
  }

  for (const f of FAULTS) {
    const m = Q_META[f.quadrant];
    const sx = toSvgX(f.cx);
    const sy = toSvgY(f.cy);

    const g = mk('g') as SVGGElement;
    g.setAttribute('class', 'tfq-dot');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${f.label}: ${m.short}, ${f.slash}`);
    svg.appendChild(g);
    dotGroups.set(f.id, g);

    // Selection ring
    const ring = mk('circle');
    attr(ring, { cx: sx, cy: sy, r: 5.5, fill: 'none', stroke: m.dotColor, 'stroke-width': 0.9 });
    ring.setAttribute('class', 'tfq-dot-ring');
    g.appendChild(ring);

    // Dot
    const circle = mk('circle');
    attr(circle, { cx: sx, cy: sy, r: 3, fill: m.dotColor });
    circle.setAttribute('class', 'tfq-dot-circle');
    g.appendChild(circle);

    // Label (above dot, nudged for edge cases)
    const labelY = sy - 5;
    const t = mk('text');
    attr(t, { x: sx, y: labelY, fill: 'rgba(255,255,255,.62)', 'font-size': 3,
      'text-anchor': 'middle', 'font-family': 'system-ui,-apple-system,sans-serif',
      'pointer-events': 'none' });
    t.textContent = f.label;
    g.appendChild(t);

    const onClick = () => selectFault(f.id);
    const onKey = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); selectFault(f.id); }
    };
    addL(g, 'click', onClick);
    addL(g, 'keydown', onKey);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'tfq-panel';

  // Empty state
  const emptyEl = document.createElement('div');
  emptyEl.className = 'tfq-empty';
  const emptyTitle = document.createElement('div');
  emptyTitle.className = 'tfq-section-title';
  emptyTitle.textContent = 'Fault types';
  const emptyHint = document.createElement('div');
  emptyHint.className = 'tfq-empty-hint';
  emptyHint.textContent = 'Click any fault on the diagram to see its slashing mechanism.';
  emptyEl.append(emptyTitle, emptyHint);

  // Detail state (hidden until selection)
  const detailEl = document.createElement('div');
  detailEl.className = 'tfq-detail';
  const faultNameEl = document.createElement('div');
  faultNameEl.className = 'tfq-fault-name';
  const badgeEl = document.createElement('div');
  badgeEl.className = 'tfq-badge';
  const descEl = document.createElement('div');
  descEl.className = 'tfq-desc';
  const mechEl = document.createElement('div');
  mechEl.className = 'tfq-mech';
  const mechLabel = document.createElement('span');
  mechLabel.className = 'tfq-mech-label';
  mechLabel.textContent = 'Mechanism:';
  const mechVal = document.createElement('span');
  mechVal.className = 'tfq-mech-val';
  mechEl.append(mechLabel, mechVal);
  detailEl.append(faultNameEl, badgeEl, descEl, mechEl);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'tfq-legend';
  const legendTitle = document.createElement('div');
  legendTitle.className = 'tfq-section-title';
  legendTitle.textContent = 'Quadrant key';
  legend.appendChild(legendTitle);
  for (const [key, meta] of Object.entries(Q_META) as [QKey, QMeta][]) {
    const row = document.createElement('div');
    row.className = 'tfq-legend-row';
    const dot = document.createElement('div');
    dot.className = 'tfq-legend-dot';
    dot.style.background = meta.dotColor;
    const text = document.createElement('div');
    text.className = 'tfq-legend-text';
    text.textContent = `${meta.label} → ${meta.slash}`;
    row.append(dot, text);
    legend.appendChild(row);
  }

  panelEl.append(emptyEl, detailEl, legend);
  panel.appendChild(panelEl);

  // ── Caption ───────────────────────────────────────────────────────────────
  const capEl = document.createElement('div');
  capEl.className = 'tfq-caption';
  capEl.textContent = 'Conceptual positions from the EIGEN Token Whitepaper · EigenCloud';
  caption.appendChild(capEl);

  // ── Selection logic ───────────────────────────────────────────────────────
  let selected: string | null = null;

  function selectFault(id: string): void {
    if (selected === id) {
      selected = null;
      dotGroups.forEach(g => g.classList.remove('tfq-active'));
      emptyEl.style.display = '';
      detailEl.classList.remove('tfq-show');
      return;
    }

    selected = id;
    dotGroups.forEach((g, gid) => g.classList.toggle('tfq-active', gid === id));

    const f = FAULTS.find(x => x.id === id)!;
    const m = Q_META[f.quadrant];

    faultNameEl.textContent = f.label;
    badgeEl.textContent = m.short;
    badgeEl.style.background = m.bg;
    badgeEl.style.color = m.dotColor;
    badgeEl.style.boxShadow = `inset 0 0 0 1px ${m.border}`;
    descEl.textContent = f.description;
    mechVal.textContent = f.slash;
    mechVal.style.color = m.dotColor;

    emptyEl.style.display = 'none';
    detailEl.classList.add('tfq-show');
  }

  return () => {
    layout.dispose();
    for (const [el, ev, fn] of listeners) el.removeEventListener(ev, fn);
    style.remove();
  };
}
