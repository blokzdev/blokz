/**
 * Artifact: folding-frontier — Folding Frontier
 * Manifest: content/artifacts/folding-frontier/manifest.json
 *
 * Log-scale horizontal range chart comparing final proof sizes across six ZK
 * proof systems for a 1,000-step computation. Folding-based IVC (Nova,
 * HyperNova) holds constant regardless of N; batch STARKs and separate Groth16
 * proofs grow with depth. Hover/tap a row for the trust model, setup
 * requirement, and primary source.
 *
 * Layout: shared responsive primitive. SVG chart fills the stage; HTML detail
 * panel sits beside the chart when wide, below it when stacked (portrait/phone).
 * Idle tour cycles through rows every 5 s until the reader interacts.
 */
import data from '../../../content/artifacts/folding-frontier/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* ---- Chart geometry ---- */
const X0 = 200;          // left edge of bars (right of labels)
const X1 = 780;          // right edge of bars
const MIN_EXP = 3;       // axis start: 10^3 = 1 KB
const MAX_EXP = 6;       // axis end: 10^6 = 1 MB
const ROW_Y0 = 56;       // y of first row centre
const ROW_H = 36;        // row pitch
const BAR_H = 14;        // bar height
const VB_H = 56 + (data.schemes.length * 36) + 30; // dynamic viewBox height

/* ---- Colour coding: is proof size constant in N? ---- */
const COLOR_CONSTANT = '#22d3ee'; // cyan  — constant (folding IVC)
const COLOR_GROWING  = '#5b8cff'; // blue  — grows with N

const xOf = (bytes: number) =>
  X0 + ((Math.log10(bytes) - MIN_EXP) / (MAX_EXP - MIN_EXP)) * (X1 - X0);

const AXIS_TICKS = [
  { bytes: 1_000,     label: '1 KB' },
  { bytes: 10_000,    label: '10 KB' },
  { bytes: 100_000,   label: '100 KB' },
  { bytes: 1_000_000, label: '1 MB' },
];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `800/${VB_H}`,
    controls: false,
  });
  const { stage, panel } = layout;

  /* ---- Styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .ff-wrap { position:absolute; inset:0; }
    .ff-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .ff-caption { fill:#5b6378; font:500 12px 'JetBrains Mono',monospace; letter-spacing:.08em; }
    .ff-grid { stroke:rgba(124,140,255,0.10); }
    .ff-axis { fill:#5b6378; font:500 11.5px 'JetBrains Mono',monospace; }
    .ff-row { cursor:pointer; }
    .ff-row:focus-visible { outline:none; }
    .ff-label { fill:#8d95ad; font:500 12px 'JetBrains Mono',monospace; transition:fill .2s; }
    .ff-size { fill:#5b6378; font:500 11px 'JetBrains Mono',monospace; transition:fill .2s; }
    .ff-bar { transition:fill-opacity .2s,stroke-opacity .2s; stroke-width:1.25;
              fill-opacity:.16; stroke-opacity:.55; }
    .ff-row.ff-on .ff-bar, .ff-row:focus-visible .ff-bar { fill-opacity:.38; stroke-opacity:1; }
    .ff-row.ff-on .ff-label, .ff-row:focus-visible .ff-label { fill:#e7eaf3; }
    .ff-row.ff-on .ff-size { fill:#8d95ad; }
    .ff-legend { fill:#5b6378; font:500 11px 'JetBrains Mono',monospace; }
    /* HTML detail panel */
    .ff-detail { display:flex; flex-direction:column; gap:8px; height:100%;
      box-sizing:border-box; padding:14px 16px; border-radius:10px;
      background:#0d1322; border:1px solid rgba(124,140,255,0.18);
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .ff-d-title { color:#e7eaf3; font:700 15px 'Space Grotesk',sans-serif;
      min-width:0; overflow-wrap:anywhere; }
    .ff-d-badge { font:600 11px 'JetBrains Mono',monospace; letter-spacing:.08em; margin-top:2px; }
    .ff-d-rows { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:2px 12px; }
    .ff-d-key { color:#5b6378; font:500 12px 'JetBrains Mono',monospace; }
    .ff-d-val { color:#8d95ad; font:500 12px 'JetBrains Mono',monospace; overflow-wrap:anywhere; }
    .ff-d-note { color:#8d95ad; font:400 12.5px Inter,sans-serif;
      min-width:0; overflow-wrap:anywhere; }
    .ff-d-src { color:#5b6378; font:500 11px 'JetBrains Mono',monospace; margin-top:auto;
      min-width:0; overflow-wrap:anywhere; }
    .ff-d-src a { color:inherit; text-decoration:none;
      border-bottom:1px solid rgba(124,140,255,0.3); }
  `;
  stage.appendChild(style);

  /* ---- SVG ---- */
  const wrap = document.createElement('div');
  wrap.className = 'ff-wrap';
  const svg = el('svg', {
    viewBox: `0 0 800 ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': 'Log-scale chart of ZK proof sizes for a 1,000-step computation',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  svg.appendChild(el('text', { x: 20, y: 24, class: 'ff-caption' },
    'PROOF SIZE AT N = 1,000 STEPS · LOG SCALE'));

  /* ---- Legend ---- */
  const legendItems: Array<[string, string]> = [
    [COLOR_CONSTANT, 'constant (IVC)'],
    [COLOR_GROWING,  'grows with N'],
  ];
  let lx = 420;
  for (const [col, lbl] of legendItems) {
    svg.appendChild(el('circle', { cx: lx, cy: 20, r: 3.5, fill: col }));
    svg.appendChild(el('text', { x: lx + 8, y: 24, class: 'ff-legend' }, lbl));
    lx += 8 + lbl.length * 6.8 + 18;
  }

  /* ---- Axis ---- */
  const rowsBottom = ROW_Y0 + data.schemes.length * ROW_H;
  for (const tick of AXIS_TICKS) {
    const x = xOf(tick.bytes);
    svg.appendChild(el('line', {
      x1: x, y1: ROW_Y0 - 12, x2: x, y2: rowsBottom + 2, class: 'ff-grid',
    }));
    svg.appendChild(el('text', {
      x, y: rowsBottom + 16, 'text-anchor': 'middle', class: 'ff-axis',
    }, tick.label));
  }

  /* ---- Rows ---- */
  const rows: SVGGElement[] = [];
  data.schemes.forEach((s, i) => {
    const cy = ROW_Y0 + i * ROW_H;
    const color = s.constant ? COLOR_CONSTANT : COLOR_GROWING;
    const g = el('g', {
      class: 'ff-row',
      tabindex: 0,
      role: 'button',
      'aria-label': `${s.label}: ${s.sizeLabel} — ${s.constant ? 'constant size' : 'grows with N'}`,
    });
    (g as unknown as HTMLElement).dataset['idx'] = String(i);

    g.appendChild(el('text', {
      x: 190, y: cy + 4, 'text-anchor': 'end', class: 'ff-label',
    }, s.label));

    const xMin = xOf(s.sizeMin);
    const xMax = xOf(s.sizeMax);
    if (xMax - xMin < 3) {
      const d = 5;
      g.appendChild(el('path', {
        d: `M${xMin},${cy - d} L${xMin + d},${cy} L${xMin},${cy + d} L${xMin - d},${cy} Z`,
        class: 'ff-bar', fill: color, stroke: color,
      }));
    } else {
      g.appendChild(el('rect', {
        x: xMin, y: cy - BAR_H / 2,
        width: xMax - xMin, height: BAR_H, rx: 4,
        class: 'ff-bar', fill: color, stroke: color,
      }));
    }

    const flipLeft = xMax > 700;
    g.appendChild(el('text', {
      x: flipLeft ? xMin - 9 : xMax + 9,
      y: cy + 3.5,
      'text-anchor': flipLeft ? 'end' : 'start',
      class: 'ff-size',
    }, s.sizeLabel));

    const hit = el('rect', {
      x: 10, y: cy - ROW_H / 2, width: 780, height: ROW_H,
      fill: 'transparent', stroke: 'none',
    });
    g.insertBefore(hit, g.firstChild);

    svg.appendChild(g);
    rows.push(g);
  });

  /* ---- HTML detail panel ---- */
  const detail = document.createElement('div');
  detail.className = 'ff-detail';
  const dTitle = document.createElement('div');
  dTitle.className = 'ff-d-title';
  const dBadge = document.createElement('div');
  dBadge.className = 'ff-d-badge';
  const dRows = document.createElement('div');
  dRows.className = 'ff-d-rows';
  const kSetup = document.createElement('span');
  kSetup.className = 'ff-d-key';
  kSetup.textContent = 'setup';
  const vSetup = document.createElement('span');
  vSetup.className = 'ff-d-val';
  const kSystem = document.createElement('span');
  kSystem.className = 'ff-d-key';
  kSystem.textContent = 'system';
  const vSystem = document.createElement('span');
  vSystem.className = 'ff-d-val';
  dRows.append(kSetup, vSetup, kSystem, vSystem);
  const dNote = document.createElement('div');
  dNote.className = 'ff-d-note';
  const dSrc = document.createElement('div');
  dSrc.className = 'ff-d-src';
  detail.append(dTitle, dBadge, dRows, dNote, dSrc);
  panel.appendChild(detail);

  /* ---- Selection ---- */
  let selected = -1;
  function select(i: number) {
    if (i === selected) return;
    selected = i;
    rows.forEach((r, j) => r.classList.toggle('ff-on', j === i));
    const s = data.schemes[i]!;
    const color = s.constant ? COLOR_CONSTANT : COLOR_GROWING;
    dTitle.textContent = `${s.label} — ${s.sizeLabel}`;
    dBadge.textContent = s.constant ? 'constant size (IVC)' : 'grows with N';
    dBadge.style.color = color;
    vSetup.textContent = s.setup;
    vSystem.textContent = s.system;
    dNote.textContent = s.note;
    dSrc.textContent = '';
    if (s.source.url) {
      dSrc.textContent = 'source: ';
      const a = document.createElement('a');
      a.href = s.source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = s.source.label;
      dSrc.appendChild(a);
    }
  }
  select(3); // open on Nova — the article's main subject

  /* ---- Interaction ---- */
  let userTouched = false;
  const rowOf = (e: Event) =>
    (e.target as Element).closest<SVGGElement>('.ff-row');
  const onOver = (e: Event) => {
    const r = rowOf(e);
    if (r) { userTouched = true; select(Number((r as unknown as HTMLElement).dataset['idx'])); }
  };
  const onKey = (e: KeyboardEvent) => {
    const r = rowOf(e);
    if (!r) return;
    const i = Number((r as unknown as HTMLElement).dataset['idx']);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); userTouched = true; select(i);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); userTouched = true;
      const next = (i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows[next]!.focus(); select(next);
    }
  };
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('click', onOver);
  svg.addEventListener('keydown', onKey);

  const tour = setInterval(() => {
    if (document.hidden || userTouched) return;
    select((selected + 1) % rows.length);
  }, 5000);

  return () => {
    clearInterval(tour);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('click', onOver);
    svg.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
