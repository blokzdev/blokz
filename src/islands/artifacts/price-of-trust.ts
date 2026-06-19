/**
 * Artifact: price-of-trust — The Price of Trust
 * Manifest: content/artifacts/price-of-trust/manifest.json
 *
 * A log-scale range chart of what every approach to trustworthy AI inference
 * pays in compute overhead — TEE, optimistic, zkML, FHE, and verifiable FHE —
 * against what each one actually buys (integrity, privacy, or both). Hover,
 * tap, or arrow through the bars; a detail panel spells out the trust model
 * and primary source behind each number. Data is a research snapshot, no
 * runtime fetches.
 *
 * Layout: shared responsive primitive. The chart SVG fills the stage; the
 * per-row detail panel is plain HTML (de-baked from the SVG so it stays
 * readable on portrait phones) sitting beside the chart when wide, below it
 * when stacked. Selection still happens on the chart rows (no controls slot).
 */
import data from '../../../content/artifacts/price-of-trust/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

const X0 = 192;
const X1 = 776;
const MAX_EXP = 7; // axis spans 1× … 10⁷×
const ROW_Y0 = 58;
const ROW_H = 31;
const BAR_H = 13;
/* Chart-only viewBox: rows end at ROW_Y0 + 6·ROW_H = 244, axis labels at +16;
   270 leaves a little bottom padding now that the detail panel is HTML. */
const VB_H = 270;
const AXIS_LABELS = ['1×', '10×', '10²', '10³', '10⁴', '10⁵', '10⁶', '10⁷'];

/** What each approach buys → bar color (design tokens). */
const CATEGORY: Record<string, 'baseline' | 'integrity' | 'privacy' | 'both'> = {
  native: 'baseline',
  tee: 'both',
  optimistic: 'integrity',
  zkml: 'integrity',
  fhe: 'privacy',
  vfhe: 'both',
};
const COLOR = {
  baseline: '#5b6378',
  integrity: '#5b8cff',
  privacy: '#8b5cf6',
  both: '#22d3ee',
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
    stageMin: 'clamp(190px, 46vw, 300px)',
    controls: false,
  });
  const { stage, panel } = layout;

  const style = document.createElement('style');
  style.textContent = `
    /* Chart sizes are viewBox units; the chart fills the stage. The detail
       panel is HTML so its type stays legible at any portrait width. */
    .pt-chartwrap { position: absolute; inset: 0; }
    .pt-chartwrap svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .pt-caption { fill: #5b6378; font: 500 12.5px 'JetBrains Mono', monospace; letter-spacing: .08em; }
    .pt-grid { stroke: rgba(124,140,255,0.10); }
    .pt-axis { fill: #5b6378; font: 500 12px 'JetBrains Mono', monospace; }
    .pt-row { cursor: pointer; }
    .pt-row:focus-visible { outline: none; }
    .pt-label { fill: #8d95ad; font: 500 12px 'JetBrains Mono', monospace; transition: fill .2s; }
    .pt-range { fill: #5b6378; font: 500 11.5px 'JetBrains Mono', monospace; transition: fill .2s; }
    .pt-bar { transition: fill-opacity .2s, stroke-opacity .2s; stroke-width: 1.25; fill-opacity: .16; stroke-opacity: .55; }
    .pt-row.pt-on .pt-bar, .pt-row:focus-visible .pt-bar { fill-opacity: .38; stroke-opacity: 1; }
    .pt-row.pt-on .pt-label, .pt-row:focus-visible .pt-label { fill: #e7eaf3; }
    .pt-row.pt-on .pt-range { fill: #8d95ad; }
    .pt-legend { fill: #5b6378; font: 500 11px 'JetBrains Mono', monospace; }

    /* HTML detail panel (replaces the in-SVG pt-panel) */
    .pt-detail { display: flex; flex-direction: column; gap: 8px; height: 100%;
      box-sizing: border-box; padding: 14px 16px; border-radius: 10px;
      background: #0d1322; border: 1px solid rgba(124,140,255,0.18); }
    .pt-d-title { color: #e7eaf3; font: 700 15px 'Space Grotesk', sans-serif; }
    .pt-d-buys { font: 500 11.5px 'JetBrains Mono', monospace; letter-spacing: .08em; }
    .pt-d-rows { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; }
    .pt-d-key { color: #5b6378; font: 500 12px 'JetBrains Mono', monospace; }
    .pt-d-val { color: #8d95ad; font: 500 12px 'JetBrains Mono', monospace; }
    .pt-d-note { color: #8d95ad; font: 400 12.5px Inter, sans-serif; }
    .pt-d-src { color: #5b6378; font: 500 11px 'JetBrains Mono', monospace; margin-top: auto; }
    .pt-d-src a { color: inherit; text-decoration: none; border-bottom: 1px solid rgba(124,140,255,0.3); }
    .pt-d-src:empty { display: none; }
  `;
  stage.appendChild(style);

  /* ---- Chart SVG (fills the stage) ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'pt-chartwrap';
  const svg = el('svg', {
    viewBox: `0 0 800 ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': 'Log-scale chart of compute overhead per trust approach',
  });
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  svg.appendChild(
    el('text', { x: '20', y: '26', class: 'pt-caption' },
      'COMPUTE OVERHEAD VS PLAINTEXT INFERENCE · LOG SCALE'),
  );

  /* ---- Legend ---- */
  const legendItems: Array<[keyof typeof COLOR, string]> = [
    ['integrity', 'integrity'],
    ['privacy', 'privacy'],
    ['both', 'both'],
  ];
  let lx = 540;
  for (const [cat, label] of legendItems) {
    svg.appendChild(el('circle', { cx: String(lx), cy: '22', r: '3.5', fill: COLOR[cat] }));
    const t = el('text', { x: String(lx + 8), y: '26', class: 'pt-legend' }, label);
    svg.appendChild(t);
    lx += 8 + label.length * 7.2 + 16;
  }

  /* ---- Axis grid ---- */
  const rowsBottom = ROW_Y0 + data.approaches.length * ROW_H;
  for (let d = 0; d <= MAX_EXP; d++) {
    const x = xOf(10 ** d);
    svg.appendChild(el('line', {
      x1: String(x), y1: String(ROW_Y0 - 14), x2: String(x), y2: String(rowsBottom + 2),
      class: 'pt-grid',
    }));
    svg.appendChild(el('text', {
      x: String(x), y: String(rowsBottom + 16), 'text-anchor': 'middle', class: 'pt-axis',
    }, AXIS_LABELS[d]!));
  }

  /* ---- Rows ---- */
  const rows: SVGGElement[] = [];
  data.approaches.forEach((a, i) => {
    const cy = ROW_Y0 + i * ROW_H;
    const cat = CATEGORY[a.id] ?? 'integrity';
    const color = COLOR[cat];
    const g = el('g', {
      class: 'pt-row',
      tabindex: '0',
      role: 'button',
      'aria-label': `${a.label}: ${a.rangeLabel} overhead — ${a.buys}`,
    });
    g.dataset.idx = String(i);

    g.appendChild(el('text', {
      x: '180', y: String(cy + 4), 'text-anchor': 'end', class: 'pt-label',
    }, a.label));

    const xMin = xOf(a.overheadMin);
    const xMax = xOf(a.overheadMax);
    if (xMax - xMin < 2) {
      // Point value (the 1× baseline): a diamond instead of a zero-width bar.
      const s = 5.5;
      g.appendChild(el('path', {
        d: `M ${xMin} ${cy - s} L ${xMin + s} ${cy} L ${xMin} ${cy + s} L ${xMin - s} ${cy} Z`,
        class: 'pt-bar', fill: color, stroke: color,
      }));
    } else {
      g.appendChild(el('rect', {
        x: String(xMin), y: String(cy - BAR_H / 2),
        width: String(xMax - xMin), height: String(BAR_H), rx: '4',
        class: 'pt-bar', fill: color, stroke: color,
        ...(a.id === 'vfhe' ? { 'stroke-dasharray': '4 3' } : {}),
      }));
    }
    // Range label sits right of the bar; near the axis edge it flips to the left.
    const labelLeft = xMax > 660;
    g.appendChild(el('text', {
      x: String(labelLeft ? xMin - 9 : xMax + 9),
      y: String(cy + 3.5),
      ...(labelLeft ? { 'text-anchor': 'end' } : {}),
      class: 'pt-range',
    }, a.rangeLabel));

    // Invisible hit area spanning the row, so hover/tap works in the gaps.
    const hit = el('rect', {
      x: '20', y: String(cy - ROW_H / 2), width: '760', height: String(ROW_H),
      fill: 'transparent', stroke: 'none',
    });
    g.insertBefore(hit, g.firstChild);

    svg.appendChild(g);
    rows.push(g);
  });

  /* ---- HTML detail panel (replaces the in-SVG pt-panel) ---- */
  const detail = document.createElement('div');
  detail.className = 'pt-detail';
  const dTitle = document.createElement('div');
  dTitle.className = 'pt-d-title';
  const dBuys = document.createElement('div');
  dBuys.className = 'pt-d-buys';
  const dRows = document.createElement('div');
  dRows.className = 'pt-d-rows';
  const dTrustKey = document.createElement('span');
  dTrustKey.className = 'pt-d-key';
  dTrustKey.textContent = 'trust';
  const dTrust = document.createElement('span');
  dTrust.className = 'pt-d-val';
  const dFinKey = document.createElement('span');
  dFinKey.className = 'pt-d-key';
  dFinKey.textContent = 'finality';
  const dFin = document.createElement('span');
  dFin.className = 'pt-d-val';
  dRows.append(dTrustKey, dTrust, dFinKey, dFin);
  const dNote = document.createElement('div');
  dNote.className = 'pt-d-note';
  const dSrc = document.createElement('div');
  dSrc.className = 'pt-d-src';
  detail.append(dTitle, dBuys, dRows, dNote, dSrc);
  panel.appendChild(detail);

  /* ---- Selection ---- */
  let selected = -1;
  function select(i: number) {
    if (i === selected) return;
    selected = i;
    rows.forEach((r, j) => r.classList.toggle('pt-on', j === i));
    const a = data.approaches[i]!;
    const color = COLOR[CATEGORY[a.id] ?? 'integrity'];
    dTitle.textContent = `${a.label} — ${a.rangeLabel}`;
    dBuys.textContent = `buys: ${a.buys}`;
    dBuys.style.color = color;
    dTrust.textContent = a.trust;
    dFin.textContent = a.finality;
    dNote.textContent = a.note;
    if (a.source.label === 'baseline') {
      dSrc.textContent = '';
    } else if (a.source.url) {
      dSrc.textContent = 'source: ';
      const link = document.createElement('a');
      link.href = a.source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = a.source.label;
      dSrc.appendChild(link);
    } else {
      dSrc.textContent = `source: ${a.source.label}`;
    }
  }
  select(4); // open on the FHE row — it's the article's subject

  /* ---- Interaction ---- */
  let userTouched = false;
  const rowOf = (e: Event) =>
    (e.target as Element).closest<SVGGElement>('.pt-row');
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

  // Idle tour: step through the rows every 5s until the reader takes over.
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
