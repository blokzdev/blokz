/**
 * Artifact: verifiable-inference-cost-spectrum — Verifiable Inference Cost Spectrum
 * Manifest: content/artifacts/verifiable-inference-cost-spectrum/manifest.json
 *
 * Log-scale range chart of per-query verification overhead (ms) for five
 * approaches to trustless LLM inference. Hover, tap, or arrow through rows;
 * a detail panel spells out what each approach verifies and its primary source.
 * Data is a research snapshot — no runtime fetches.
 *
 * Layout: shared responsive primitive. SVG fills the stage; HTML detail panel
 * sits beside the chart when wide, below it when stacked.
 */
import data from '../../../content/artifacts/verifiable-inference-cost-spectrum/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

const X0 = 192;
const X1 = 776;
const MAX_EXP = 6; // axis spans 1ms … 10⁶ms (1000s)
const ROW_Y0 = 58;
const ROW_H = 31;
const BAR_H = 13;
const VB_H = 270;
const AXIS_LABELS = ['1ms', '10ms', '100ms', '1s', '10s', '100s', '1000s'];

const CATEGORY: Record<string, 'receipt' | 'fingerprint' | 'naive' | 'zkml'> = {
  nabaos: 'receipt',
  toploc: 'fingerprint',
  difr: 'fingerprint',
  'output-resample': 'naive',
  zkllm: 'zkml',
};

const COLOR = {
  receipt: '#5b8cff',
  fingerprint: '#8b5cf6',
  naive: '#5b6378',
  zkml: '#22d3ee',
} as const;

const xOf = (v: number) => X0 + (Math.log10(v) / MAX_EXP) * (X1 - X0);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '800/270',
    controls: false,
  });
  const { stage, panel } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .vic-chartwrap { position: absolute; inset: 0; }
    .vic-chartwrap svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .vic-caption { fill: #5b6378; font: 500 12.5px 'JetBrains Mono', monospace; letter-spacing: .08em; }
    .vic-grid { stroke: rgba(124,140,255,0.10); }
    .vic-axis { fill: #5b6378; font: 500 11.5px 'JetBrains Mono', monospace; }
    .vic-row { cursor: pointer; }
    .vic-row:focus-visible { outline: none; }
    .vic-label { fill: #8d95ad; font: 500 12px 'JetBrains Mono', monospace; transition: fill .2s; }
    .vic-range { fill: #5b6378; font: 500 11.5px 'JetBrains Mono', monospace; transition: fill .2s; }
    .vic-bar { transition: fill-opacity .2s, stroke-opacity .2s; stroke-width: 1.25; fill-opacity: .16; stroke-opacity: .55; }
    .vic-row.vic-on .vic-bar, .vic-row:focus-visible .vic-bar { fill-opacity: .38; stroke-opacity: 1; }
    .vic-row.vic-on .vic-label, .vic-row:focus-visible .vic-label { fill: #e7eaf3; }
    .vic-row.vic-on .vic-range { fill: #8d95ad; }
    .vic-legend { fill: #5b6378; font: 500 11px 'JetBrains Mono', monospace; }

    .vic-detail { display: flex; flex-direction: column; gap: 8px; height: 100%;
      box-sizing: border-box; padding: 14px 16px; border-radius: 10px;
      background: #0d1322; border: 1px solid rgba(124,140,255,0.18);
      min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .vic-d-title { color: #e7eaf3; font: 700 15px 'Space Grotesk', sans-serif;
      min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .vic-d-verifies { font: 500 11.5px 'JetBrains Mono', monospace; letter-spacing: .08em; }
    .vic-d-rows { display: grid; grid-template-columns: minmax(0,auto) minmax(0,1fr); gap: 2px 12px; }
    .vic-d-key { color: #5b6378; font: 500 12px 'JetBrains Mono', monospace; }
    .vic-d-val { color: #8d95ad; font: 500 12px 'JetBrains Mono', monospace; }
    .vic-d-note { color: #8d95ad; font: 400 12.5px Inter, sans-serif;
      min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .vic-d-src { color: #5b6378; font: 500 11px 'JetBrains Mono', monospace; margin-top: auto;
      min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .vic-d-src a { color: inherit; text-decoration: none; border-bottom: 1px solid rgba(124,140,255,0.3); }
    .vic-d-src:empty { display: none; }
  `;
  stage.appendChild(style);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'vic-chartwrap';
  const svg = el('svg', {
    viewBox: `0 0 800 ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': 'Log-scale chart of per-query verification overhead in milliseconds',
  });
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  svg.appendChild(
    el('text', { x: '20', y: '26', class: 'vic-caption' },
      'VERIFICATION OVERHEAD PER QUERY (MS, LOG SCALE)'),
  );

  /* Legend */
  const legendItems: Array<[keyof typeof COLOR, string]> = [
    ['receipt', 'receipt'],
    ['fingerprint', 'fingerprint'],
    ['naive', 'naive'],
    ['zkml', 'zkml'],
  ];
  let lx = 420;
  for (const [cat, label] of legendItems) {
    svg.appendChild(el('circle', { cx: String(lx), cy: '22', r: '3.5', fill: COLOR[cat] }));
    const t = el('text', { x: String(lx + 8), y: '26', class: 'vic-legend' }, label);
    svg.appendChild(t);
    lx += 8 + label.length * 7.0 + 16;
  }

  /* Axis grid */
  const rowsBottom = ROW_Y0 + data.approaches.length * ROW_H;
  for (let d = 0; d <= MAX_EXP; d++) {
    const x = xOf(10 ** d);
    svg.appendChild(el('line', {
      x1: String(x), y1: String(ROW_Y0 - 14), x2: String(x), y2: String(rowsBottom + 2),
      class: 'vic-grid',
    }));
    svg.appendChild(el('text', {
      x: String(x), y: String(rowsBottom + 16), 'text-anchor': 'middle', class: 'vic-axis',
    }, AXIS_LABELS[d]!));
  }

  /* Rows */
  const rows: SVGGElement[] = [];
  data.approaches.forEach((a, i) => {
    const cy = ROW_Y0 + i * ROW_H;
    const cat = CATEGORY[a.id] ?? 'fingerprint';
    const color = COLOR[cat];
    const g = el('g', {
      class: 'vic-row',
      tabindex: '0',
      role: 'button',
      'aria-label': `${a.label}: ${a.rangeLabel} overhead — verifies ${a.verifies}`,
    });
    g.dataset.idx = String(i);

    g.appendChild(el('text', {
      x: '180', y: String(cy + 4), 'text-anchor': 'end', class: 'vic-label',
    }, a.label));

    const xMin = xOf(a.overheadMin);
    const xMax = xOf(a.overheadMax);
    g.appendChild(el('rect', {
      x: String(xMin), y: String(cy - BAR_H / 2),
      width: String(Math.max(xMax - xMin, 2)), height: String(BAR_H), rx: '4',
      class: 'vic-bar', fill: color, stroke: color,
    }));

    const labelLeft = xMax > 660;
    g.appendChild(el('text', {
      x: String(labelLeft ? xMin - 9 : xMax + 9),
      y: String(cy + 3.5),
      ...(labelLeft ? { 'text-anchor': 'end' } : {}),
      class: 'vic-range',
    }, a.rangeLabel));

    const hit = el('rect', {
      x: '20', y: String(cy - ROW_H / 2), width: '760', height: String(ROW_H),
      fill: 'transparent', stroke: 'none',
    });
    g.insertBefore(hit, g.firstChild);

    svg.appendChild(g);
    rows.push(g);
  });

  /* HTML detail panel */
  const detail = document.createElement('div');
  detail.className = 'vic-detail';
  const dTitle = document.createElement('div');
  dTitle.className = 'vic-d-title';
  const dVerifies = document.createElement('div');
  dVerifies.className = 'vic-d-verifies';
  const dRows = document.createElement('div');
  dRows.className = 'vic-d-rows';
  const dInteractKey = document.createElement('span');
  dInteractKey.className = 'vic-d-key';
  dInteractKey.textContent = 'interactive';
  const dInteract = document.createElement('span');
  dInteract.className = 'vic-d-val';
  const dCovKey = document.createElement('span');
  dCovKey.className = 'vic-d-key';
  dCovKey.textContent = 'coverage';
  const dCov = document.createElement('span');
  dCov.className = 'vic-d-val';
  dRows.append(dInteractKey, dInteract, dCovKey, dCov);
  const dNote = document.createElement('div');
  dNote.className = 'vic-d-note';
  const dSrc = document.createElement('div');
  dSrc.className = 'vic-d-src';
  detail.append(dTitle, dVerifies, dRows, dNote, dSrc);
  panel.appendChild(detail);

  /* Selection */
  let selected = -1;
  function select(i: number) {
    if (i === selected) return;
    selected = i;
    rows.forEach((r, j) => r.classList.toggle('vic-on', j === i));
    const a = data.approaches[i]!;
    const cat = CATEGORY[a.id] ?? 'fingerprint';
    const color = COLOR[cat];
    dTitle.textContent = `${a.label} — ${a.rangeLabel}`;
    dVerifies.textContent = `verifies: ${a.verifies}`;
    dVerifies.style.color = color;
    dInteract.textContent = a.interactive ? 'yes — round-trip before inference' : 'no — post-inference';
    dCov.textContent = a.coverage;
    dNote.textContent = a.note;
    dSrc.textContent = '';
    if (a.source.label && a.source.url) {
      dSrc.textContent = 'source: ';
      const link = document.createElement('a');
      link.href = a.source.url;
      if (a.source.url.startsWith('http')) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      link.textContent = a.source.label;
      dSrc.appendChild(link);
    } else if (a.source.label) {
      dSrc.textContent = `source: ${a.source.label}`;
    }
  }
  select(1); // open on TOPLOC — the article's subject

  /* Interaction */
  let userTouched = false;
  const rowOf = (e: Event) =>
    (e.target as Element).closest<SVGGElement>('.vic-row');
  const onOver = (e: Event) => {
    const r = rowOf(e);
    if (r) {
      userTouched = true;
      select(Number(r.dataset.idx));
    }
  };
  const onClick = onOver;
  const onKey = (e: KeyboardEvent) => {
    const r = rowOf(e);
    if (!r) return;
    const i = Number(r.dataset.idx);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      userTouched = true;
      select(i);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      userTouched = true;
      const next = (i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows[next]!.focus();
      select(next);
    }
  };
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKey);

  const tour = setInterval(() => {
    if (document.hidden || userTouched) return;
    select((selected + 1) % rows.length);
  }, 5000);

  return () => {
    clearInterval(tour);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('click', onClick);
    svg.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
