/**
 * Artifact: the-ghost-fill-window — The Ghost Fill Window
 *
 * Interactive diagram of Polymarket's two-phase hybrid architecture and the
 * four attack vectors that exploit the settlement consistency gap.
 *
 * Three phases shown left-to-right:
 *   OFF-CHAIN MATCH → [SETTLEMENT WINDOW ~5–10 s] → ON-CHAIN POLYGON
 *
 * Select an attack vector (Nonce Bump / Balance Drain / Allowance Revoke /
 * Proxy Trap) to highlight its attack arrow, see the mechanism, and read the
 * cost. "Stats" shows the aggregate GHOSTHUNTER numbers.
 *
 * Layout: shared primitive, wideTemplate:'rail'.
 * Data: content/artifacts/the-ghost-fill-window/data.json
 * Source: arXiv:2606.16852 — The Ghosts of Polymarket (Jun 2026)
 */
import data from '../../../content/artifacts/the-ghost-fill-window/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* ── SVG canvas ────────────────────────────────────────────────────────────── */
const VW  = 820;
const VH  = 274;
const CY  = 160;           // timeline centre-line y
const BH  = 88;            // phase box height
const BY  = CY - BH / 2;  // phase box top y

/* ── Phase geometry ─────────────────────────────────────────────────────────── */
const PA = { x: 18,  w: 140, cx: 88,  label: 'OFF-CHAIN',  sub: 'matching engine' };
const PC = { x: 638, w: 164, cx: 720, label: 'ON-CHAIN',   sub: 'Polygon'         };

const WIN_X = 204; const WIN_W = 290; const WIN_Y = 82; const WIN_H = 156;

/* ── Attack vector arrow geometry ────────────────────────────────────────────── */
const VECS = data.vectors;
const VXS  = [236, 300, 362, 440];   // x-positions inside the window
const ATK_Y0 = 30;                   // arrow top (just below label)
const ATK_Y1 = WIN_Y + 16;          // arrow tip (just inside window)

type VId = 'stats' | string;

/* ── Helper ─────────────────────────────────────────────────────────────────── */
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, a: Record<string, string | number> = {}, text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmtBig(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}

function fmtUSD(n: number): string {
  return '$' + fmtBig(n);
}

/* ── Mount ───────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: ctrl, caption } = layout;

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .gfw-wrap{position:absolute;inset:0;border:1px solid rgba(124,140,255,.14);
      border-radius:12px;background:#0d1322;overflow:hidden}
    .gfw-wrap svg{position:absolute;inset:0;width:100%;height:100%;display:block}

    /* phase boxes */
    .gfw-box{fill:#0e1528;stroke:rgba(124,140,255,.28);stroke-width:1.5}
    .gfw-phase-title{fill:#c8cfe3;font:600 11.5px 'Space Grotesk',system-ui,sans-serif}
    .gfw-phase-sub{fill:#3d4460;font:500 9px 'JetBrains Mono',monospace}

    /* settlement window */
    .gfw-win{fill:rgba(251,146,60,.04);stroke:rgba(251,146,60,.28);
      stroke-width:1.5;stroke-dasharray:5 4}
    .gfw-win-title{fill:#7a8aa0;font:600 9.5px 'Space Grotesk',system-ui,sans-serif;
      letter-spacing:.07em;text-transform:uppercase}
    .gfw-win-sub{fill:#374151;font:500 8.5px 'JetBrains Mono',monospace}

    /* horizontal flow arrows */
    .gfw-flow{stroke:rgba(124,140,255,.30);stroke-width:2}
    .gfw-flow-lbl{fill:#3d4460;font:500 8.5px 'JetBrains Mono',monospace}

    /* attack arrows */
    .gfw-atk-line{stroke:rgba(80,90,120,.22);stroke-width:1.5;stroke-dasharray:4 3;
      transition:stroke .22s,stroke-width .22s,stroke-dasharray .22s}
    .gfw-atk-line.gfw-sel{stroke-width:2.5;stroke-dasharray:none}
    .gfw-atk-dot{fill:rgba(80,90,120,.20);transition:fill .22s,r .22s}
    .gfw-atk-dot.gfw-sel{r:5}
    .gfw-atk-lbl{fill:#2e3450;font:500 8px 'JetBrains Mono',monospace;
      text-anchor:middle;transition:fill .22s}
    .gfw-atk-lbl.gfw-sel{fill:#e7eaf3}

    /* outcome labels */
    .gfw-ok{fill:#22d3ee;font:700 10px 'JetBrains Mono',monospace}
    .gfw-fail{fill:#f87171;font:700 10px 'JetBrains Mono',monospace;
      opacity:.25;transition:opacity .22s}
    .gfw-fail.gfw-sel{opacity:1}
    .gfw-ghost-note{fill:#f87171;font:500 8.5px 'JetBrains Mono',monospace;
      opacity:0;transition:opacity .25s}
    .gfw-ghost-note.gfw-sel{opacity:1}

    /* controls */
    .gfw-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .gfw-tabs{display:inline-flex;flex-wrap:wrap;gap:5px}
    .gfw-tabs button{appearance:none;border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06);color:#6b7492;border-radius:7px;
      font:500 10px 'JetBrains Mono',monospace;letter-spacing:.03em;
      padding:6px 10px;cursor:pointer;
      transition:color .18s,background .18s,border-color .18s}
    .gfw-tabs button:hover{background:rgba(91,140,255,.14);
      border-color:rgba(124,140,255,.55)}
    .gfw-tabs button[aria-selected="true"].gfw-stats{background:rgba(91,140,255,.22);
      border-color:#5b8cff;color:#e7eaf3}
    .gfw-tabs button.gfw-vbtn[aria-selected="true"]{
      background:rgba(255,255,255,.06);color:var(--vc);border-color:var(--vc)}
    .gfw-tabs button:focus-visible{outline:2px solid #5b8cff;outline-offset:-2px}
    .gfw-hint{font:500 9px 'JetBrains Mono',monospace;color:#2e3450}

    /* panel */
    .gfw-panel{display:flex;flex-direction:column;gap:7px;min-width:0}
    .gfw-ptitle{font:600 10px 'Space Grotesk',system-ui,sans-serif;
      color:#6b7492;letter-spacing:.06em;text-transform:uppercase}
    .gfw-stat-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5px}
    .gfw-stat{border:1px solid rgba(124,140,255,.12);border-radius:8px;
      padding:6px 8px;background:rgba(91,140,255,.04)}
    .gfw-stat-val{font:700 13px 'Space Grotesk',system-ui,sans-serif;
      color:#e7eaf3;overflow-wrap:anywhere;min-width:0}
    .gfw-stat-lbl{font:500 8px 'JetBrains Mono',monospace;color:#3d4460;
      letter-spacing:.07em;text-transform:uppercase;margin-top:2px;overflow-wrap:anywhere}
    .gfw-vtag{display:inline-flex;align-items:center;gap:5px}
    .gfw-vdot{width:7px;height:7px;border-radius:50%;flex:none}
    .gfw-vlbl{font:700 9.5px 'JetBrains Mono',monospace;letter-spacing:.08em;color:#8d95ad}
    .gfw-frow{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);
      gap:0 8px;align-items:baseline}
    .gfw-fk{font:500 8.5px 'JetBrains Mono',monospace;color:#3d4460;
      white-space:nowrap;letter-spacing:.05em}
    .gfw-fv{font:500 9px 'JetBrains Mono',monospace;color:#9aa3bd;
      overflow-wrap:anywhere;min-width:0;line-height:1.5}
    .gfw-divider{border:none;border-top:1px solid rgba(124,140,255,.10);margin:4px 0}
    .gfw-note{font:500 8.5px 'JetBrains Mono',monospace;color:#3d4460;
      line-height:1.5;overflow-wrap:anywhere}
    .gfw-cap{font:500 9px 'JetBrains Mono',monospace;color:#2e3450}
  `;
  stage.appendChild(style);

  /* ── SVG ─────────────────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'gfw-wrap';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': 'Polymarket hybrid architecture diagram with ghost fill attack vectors',
  });
  wrap.appendChild(svg); stage.appendChild(wrap);

  /* ── Defs ── arrowhead for flow arrows ─────────────────────────────────── */
  const defs = svgEl('defs');
  const mkr = svgEl('marker', { id: 'gfw-head', markerWidth: '8', markerHeight: '6',
    refX: '7', refY: '3', orient: 'auto' });
  mkr.appendChild(svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: 'rgba(124,140,255,.30)' }));
  defs.appendChild(mkr);
  svg.appendChild(defs);

  /* ── Phase A ─────────────────────────────────────────────────────────────── */
  svg.appendChild(svgEl('rect', { x: PA.x, y: BY, width: PA.w, height: BH, rx: 10, class: 'gfw-box' }));
  svg.appendChild(svgEl('text', { x: PA.cx, y: CY - 6, class: 'gfw-phase-title', 'text-anchor': 'middle' }, PA.label));
  svg.appendChild(svgEl('text', { x: PA.cx, y: CY + 10, class: 'gfw-phase-sub', 'text-anchor': 'middle' }, PA.sub));

  /* ── Phase C ─────────────────────────────────────────────────────────────── */
  svg.appendChild(svgEl('rect', { x: PC.x, y: BY, width: PC.w, height: BH, rx: 10, class: 'gfw-box' }));
  svg.appendChild(svgEl('text', { x: PC.cx, y: CY - 6, class: 'gfw-phase-title', 'text-anchor': 'middle' }, PC.label));
  svg.appendChild(svgEl('text', { x: PC.cx, y: CY + 10, class: 'gfw-phase-sub', 'text-anchor': 'middle' }, PC.sub));

  /* ── Settlement window ────────────────────────────────────────────────────── */
  svg.appendChild(svgEl('rect', { x: WIN_X, y: WIN_Y, width: WIN_W, height: WIN_H, rx: 8, class: 'gfw-win' }));
  svg.appendChild(svgEl('text', { x: WIN_X + WIN_W / 2, y: WIN_Y + 17, class: 'gfw-win-title', 'text-anchor': 'middle' }, 'SETTLEMENT WINDOW'));
  svg.appendChild(svgEl('text', { x: WIN_X + WIN_W / 2, y: WIN_Y + 30, class: 'gfw-win-sub', 'text-anchor': 'middle' }, '~5–10 s consistency gap'));

  /* ── Flow arrows ─────────────────────────────────────────────────────────── */
  const ax1e = PA.x + PA.w, ax1s = WIN_X;
  const ax2e = WIN_X + WIN_W, ax2s = PC.x;
  svg.appendChild(svgEl('line', { x1: ax1e, y1: CY, x2: ax1s, y2: CY, class: 'gfw-flow', 'marker-end': 'url(#gfw-head)' }));
  svg.appendChild(svgEl('text', { x: (ax1e + ax1s) / 2, y: CY - 8, class: 'gfw-flow-lbl', 'text-anchor': 'middle' }, 'match confirmed'));
  svg.appendChild(svgEl('line', { x1: ax2e, y1: CY, x2: ax2s, y2: CY, class: 'gfw-flow', 'marker-end': 'url(#gfw-head)' }));
  svg.appendChild(svgEl('text', { x: (ax2e + ax2s) / 2, y: CY - 8, class: 'gfw-flow-lbl', 'text-anchor': 'middle' }, 'settlement tx'));

  /* ── Outcome labels ──────────────────────────────────────────────────────── */
  const okEl    = svgEl('text', { x: PC.cx, y: BY + BH + 18, class: 'gfw-ok',         'text-anchor': 'middle' }, '✓ FILLED');
  const failEl  = svgEl('text', { x: PC.cx, y: BY + BH + 33, class: 'gfw-fail',       'text-anchor': 'middle' }, '✗ GHOST FILL');
  const noteEl  = svgEl('text', { x: PC.cx, y: BY + BH + 47, class: 'gfw-ghost-note', 'text-anchor': 'middle' }, 'order never settled on-chain');
  svg.appendChild(okEl); svg.appendChild(failEl); svg.appendChild(noteEl);

  /* ── Attack vector arrows ────────────────────────────────────────────────── */
  const atkLines: SVGLineElement[] = [];
  const atkDots:  SVGCircleElement[] = [];
  // label elements: 2 per vector (words split to 2 lines for narrow labels)
  const atkLblEls: SVGTextElement[][] = [];

  VECS.forEach((v, i) => {
    const ax = VXS[i]!;

    // Two-line label above the arrow
    const words = v.label.split(' ');
    const mid   = Math.ceil(words.length / 2);
    const l1    = words.slice(0, mid).join(' ');
    const l2    = words.slice(mid).join(' ');
    const lbl1  = svgEl('text', { x: ax, y: ATK_Y0 - (l2 ? 12 : 4), class: 'gfw-atk-lbl' }, l1);
    const lbl2  = l2 ? svgEl('text', { x: ax, y: ATK_Y0 - 1, class: 'gfw-atk-lbl' }, l2) : null;
    svg.appendChild(lbl1);
    if (lbl2) svg.appendChild(lbl2);
    atkLblEls.push(lbl2 ? [lbl1, lbl2] : [lbl1]);

    // Arrow line
    const line = svgEl('line', { x1: ax, y1: ATK_Y0 + 2, x2: ax, y2: ATK_Y1, class: 'gfw-atk-line' });
    svg.appendChild(line);
    atkLines.push(line);

    // Dot at arrow tip (impact point in the window)
    const dot = svgEl('circle', { cx: ax, cy: ATK_Y1 + 4, r: 3, class: 'gfw-atk-dot' });
    svg.appendChild(dot);
    atkDots.push(dot);
  });

  /* ── Panel ───────────────────────────────────────────────────────────────── */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'gfw-panel';
  panel.appendChild(panelDiv);

  /* ── Controls ────────────────────────────────────────────────────────────── */
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'gfw-ctrl';
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'gfw-tabs';
  tabsDiv.setAttribute('role', 'tablist');
  tabsDiv.setAttribute('aria-label', 'Ghost fill view selector');

  const statsBtn = document.createElement('button');
  statsBtn.type = 'button'; statsBtn.setAttribute('role', 'tab');
  statsBtn.className = 'gfw-stats'; statsBtn.textContent = 'Stats';
  statsBtn.dataset['view'] = 'stats';
  tabsDiv.appendChild(statsBtn);

  const vBtns = VECS.map((v) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.className = 'gfw-vbtn'; b.textContent = v.labelShort;
    b.dataset['view'] = v.id;
    b.style.setProperty('--vc', v.color);
    tabsDiv.appendChild(b);
    return b;
  });

  const allBtns = [statsBtn, ...vBtns];
  const hint = document.createElement('span');
  hint.className = 'gfw-hint'; hint.textContent = 'tap a vector to inspect';
  ctrlDiv.append(tabsDiv, hint);
  ctrl.appendChild(ctrlDiv);

  /* ── Caption ─────────────────────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'gfw-cap';
  cap.textContent = 'GHOSTHUNTER analysis · arXiv:2606.16852 · data as of 2026-06-15';
  caption.appendChild(cap);

  /* ── State ───────────────────────────────────────────────────────────────── */
  let active: VId = 'stats';

  function renderDiagram(): void {
    const isStats = active === 'stats';
    atkLines.forEach((line, i) => {
      const v = VECS[i]!;
      const sel = v.id === active;
      line.setAttribute('class', sel ? 'gfw-atk-line gfw-sel' : 'gfw-atk-line');
      line.style.stroke = isStats ? '' : sel ? v.color : 'rgba(80,90,120,.10)';
    });
    atkDots.forEach((dot, i) => {
      const v = VECS[i]!;
      const sel = v.id === active;
      dot.setAttribute('class', sel ? 'gfw-atk-dot gfw-sel' : 'gfw-atk-dot');
      dot.style.fill = isStats ? '' : sel ? v.color : 'rgba(80,90,120,.08)';
    });
    atkLblEls.forEach((lbls, i) => {
      const v = VECS[i]!;
      const sel = v.id === active;
      lbls.forEach((lbl) => {
        lbl.setAttribute('class', sel ? 'gfw-atk-lbl gfw-sel' : 'gfw-atk-lbl');
        lbl.style.fill = isStats ? '' : sel ? v.color : 'rgba(46,52,80,.4)';
      });
    });
    failEl.setAttribute('class',  !isStats ? 'gfw-fail gfw-sel'        : 'gfw-fail');
    noteEl.setAttribute('class',  !isStats ? 'gfw-ghost-note gfw-sel'  : 'gfw-ghost-note');
  }

  function renderPanel(): void {
    panelDiv.innerHTML = '';

    if (active === 'stats') {
      const s = data.stats;
      const t = document.createElement('div');
      t.className = 'gfw-ptitle'; t.textContent = 'Ghost Fill Statistics';
      panelDiv.appendChild(t);

      const grid = document.createElement('div');
      grid.className = 'gfw-stat-grid';

      const rows: [string, string][] = [
        [fmtBig(s.totalReverted),       'reverted settlements'],
        [fmtBig(s.targeted),            'selectively targeted'],
        [fmtUSD(s.profitUSD),           'attacker profit'],
        [s.peakRevertRate + '%',        'fills ghosted at peak'],
        [fmtBig(s.contracts),           'contracts affected'],
        [fmtBig(s.chains),              'chains affected'],
        [fmtUSD(s.userFundsAtRiskUSD),  'user funds at risk'],
        [String(s.variants),            'attack variants'],
      ];
      rows.forEach(([val, lbl]) => {
        const card = document.createElement('div');
        card.className = 'gfw-stat';
        const vEl = document.createElement('div');
        vEl.className = 'gfw-stat-val'; vEl.textContent = val;
        const lEl = document.createElement('div');
        lEl.className = 'gfw-stat-lbl'; lEl.textContent = lbl;
        card.append(vEl, lEl); grid.appendChild(card);
      });
      panelDiv.appendChild(grid);
      return;
    }

    const vec = VECS.find((v) => v.id === active);
    if (!vec) return;

    const tag = document.createElement('div');
    tag.className = 'gfw-vtag';
    const dot = document.createElement('span');
    dot.className = 'gfw-vdot'; dot.style.background = vec.color;
    const lbl = document.createElement('span');
    lbl.className = 'gfw-vlbl'; lbl.textContent = vec.label;
    tag.append(dot, lbl);
    panelDiv.appendChild(tag);

    const fields: [string, string][] = [
      ['mechanism', vec.mechanism],
      ['timing',    vec.timing],
      ['cost',      vec.cost],
    ];
    fields.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'gfw-frow';
      const kEl = document.createElement('span');
      kEl.className = 'gfw-fk'; kEl.textContent = k;
      const vEl = document.createElement('span');
      vEl.className = 'gfw-fv'; vEl.textContent = v;
      row.append(kEl, vEl);
      panelDiv.appendChild(row);
    });

    const hr = document.createElement('hr'); hr.className = 'gfw-divider';
    panelDiv.appendChild(hr);
    const imp = document.createElement('div');
    imp.className = 'gfw-note'; imp.textContent = '⚠ ' + vec.impact;
    panelDiv.appendChild(imp);
  }

  function renderButtons(): void {
    allBtns.forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset['view'] === active));
    });
  }

  function setView(v: VId): void {
    active = v;
    renderDiagram(); renderPanel(); renderButtons();
  }

  /* ── Events ──────────────────────────────────────────────────────────────── */
  const listeners: [EventTarget, string, EventListener][] = [];
  function on(t: EventTarget, ev: string, fn: EventListener): void {
    t.addEventListener(ev, fn); listeners.push([t, ev, fn]);
  }

  on(statsBtn, 'click', () => setView('stats'));
  vBtns.forEach((b) => on(b, 'click', () => setView(b.dataset['view']!)));

  on(tabsDiv, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'ArrowLeft' && ke.key !== 'ArrowRight') return;
    ke.preventDefault();
    const ids = ['stats', ...VECS.map((v) => v.id)];
    const cur = ids.indexOf(active);
    const next = (cur + (ke.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    setView(ids[next]!);
    allBtns[next]?.focus();
  });

  // initial render
  setView('stats');

  return () => {
    listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    layout.dispose(); style.remove();
  };
}
