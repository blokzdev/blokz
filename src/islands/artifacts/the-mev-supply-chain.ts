/**
 * Artifact: the-mev-supply-chain — The MEV Supply Chain
 * Manifest: content/artifacts/the-mev-supply-chain/manifest.json
 *
 * Five-stage PBS pipeline diagram: Searcher → Builder → Relay → Proposer → Block.
 * Shows the private order flow path (below boxes) and the mev-commit preconf
 * feedback arc (above boxes). Select any stage via tab controls or by clicking
 * the box to see key metrics and a mechanism note in the side panel.
 *
 * Layout: shared primitive, wideTemplate:'rail', stageAspect:'16/9'.
 * Data: embedded (arXiv:2605.04471, ethresear.ch/t/23066, Dec 2025 mev-boost data,
 *        Aug 2025 mev-commit data).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* ── SVG coordinate space (16:9) ───────────────────────────────────────────── */
const VW  = 1600;
const VH  = 900;
const CY  = 470;           // box centre-line Y
const BH  = 170;           // box height
const BW  = 220;           // box width
const BY  = CY - BH / 2;  // box top Y = 385
const BR  = 14;            // border-radius

const MARGIN = 30;
const GAP    = (VW - 2 * MARGIN - 5 * BW) / 4;  // 110 px

function sx(i: number): number  { return MARGIN + i * (BW + GAP); }
function scx(i: number): number { return sx(i) + BW / 2; }

/* ── Stage data ────────────────────────────────────────────────────────────── */
interface Stage {
  id:    string;
  label: string;
  sub:   string;
  color: string;
  stats: [string, string][];
  note:  string;
}

const STAGES: Stage[] = [
  {
    id: 'searcher', label: 'Searcher', sub: 'bundle origination', color: '#a78bfa',
    stats: [
      ['75',      'exclusive order flows'],
      ['12%',     'of txs are private flow'],
      ['54.59%',  'of block value from private txs'],
      ['70.5%',   'trading revenue via EOF'],
    ],
    note: 'Searchers with exclusive order flow (EOF) submit bundles directly to specific builders, bypassing the public mempool. 12% of transactions are private but generate 54.59% of block value — the premium that makes this oligopoly self-reinforcing.',
  },
  {
    id: 'builder', label: 'Builder', sub: 'block assembly', color: '#60a5fa',
    stats: [
      ['96.7%',     'of blocks from top 5 builders'],
      ['27.9%',     'top single-builder share'],
      ['25.5%',     'BuilderNet TEE coalition share'],
      ['1.4 ETH+',  'reputation barrier to enter top tier'],
    ],
    note: 'The builder oligopoly is driven by exclusive orderflow, not raw compute. Top builders have self-sustaining positions; new entrants face a 1.4 ETH+ reputation subsidy requirement before searchers route them private flow.',
  },
  {
    id: 'relay', label: 'Relay', sub: 'trusted escrow', color: '#34d399',
    stats: [
      ['92.5%',      'of blocks use mev-boost (Dec 2025)'],
      ['7.5%',       'vanilla blocks (no relay)'],
      ['trust model', 'no cryptoeconomic slash'],
      ['< 12',        'active relays in production'],
    ],
    note: 'Relays escrow the full block and release it only after the proposer signs the header — preventing builders from withholding. They are trusted intermediaries and carry no slashable collateral if they misbehave.',
  },
  {
    id: 'proposer', label: 'Proposer', sub: 'validator · mev-boost', color: '#fbbf24',
    stats: [
      ['92.5%',     'mev-boost adoption rate'],
      ['blind sign', 'signs header, not block contents'],
      ['bid-max',    'selects highest builder bid'],
      ['~12 s',      'Ethereum slot time'],
    ],
    note: 'The proposer signs the builder\'s header without seeing block contents. The relay only releases the full block after commitment is signed. The proposer earns a payment in the last transaction of the block.',
  },
  {
    id: 'block', label: 'Block', sub: 'on-chain inclusion', color: '#f87171',
    stats: [
      ['18,000+', 'mev-commit preconfs settled'],
      ['40 ms',   'preconf commitment latency'],
      ['1%',      'validators opted in as providers'],
      ['11.33%',  'peak blocks with preconf txs'],
    ],
    note: 'mev-commit preconfirmations let builders commit to including a specific transaction, backed by slashable ETH stake. The commitment arrives 40 ms before block finality with cryptoeconomic enforcement — not just an operator promise.',
  },
];

const ARROWS = [
  { label: 'bundles',           sub: 'public + private' },
  { label: 'sealed block bid',  sub: '' },
  { label: 'best header',       sub: 'via mev-boost' },
  { label: 'signed commitment', sub: '' },
];

const OVERVIEW: [string, string][] = [
  ['92.5%',          'mev-boost block share (Dec 2025)'],
  ['96.7%',          'blocks from top 5 builders'],
  ['12% → 54.59%',   'private txs → block value share'],
  ['18,000+',        'mev-commit preconfs on mainnet'],
];

/* ── SVG helper ────────────────────────────────────────────────────────────── */
function el<K extends keyof SVGElementTagNameMap>(
  tag: K, a: Record<string, string | number> = {}, text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ── Mount ─────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: ctrl, caption } = layout;

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .msc-wrap{position:absolute;inset:0;border:1px solid rgba(124,140,255,.14);
      border-radius:12px;background:#0d1322;overflow:hidden}
    .msc-wrap svg{position:absolute;inset:0;width:100%;height:100%;display:block}

    .msc-box{fill:#0e1528;stroke:rgba(124,140,255,.22);stroke-width:2.5;
      transition:stroke .2s,fill .2s}
    .msc-box.msc-sel{fill:rgba(91,140,255,.08)}
    .msc-box.msc-dim{stroke:rgba(124,140,255,.07)}
    .msc-hit{fill:transparent;cursor:pointer}

    .msc-lbl{fill:#b8c2dc;font:600 22px 'Space Grotesk',system-ui,sans-serif;
      text-anchor:middle;pointer-events:none;transition:fill .2s}
    .msc-lbl.msc-sel{fill:#e7eaf3}
    .msc-lbl.msc-dim{fill:#232b42}
    .msc-sub{fill:#344060;font:500 16px 'JetBrains Mono',monospace;
      text-anchor:middle;pointer-events:none;transition:fill .2s}
    .msc-sub.msc-sel{fill:#5b8cff}
    .msc-sub.msc-dim{fill:#1b2236}

    .msc-flow{stroke:rgba(124,140,255,.28);stroke-width:2.5;fill:none}
    .msc-flbl{fill:#2e3858;font:500 15px 'JetBrains Mono',monospace;text-anchor:middle}
    .msc-fsub{fill:#1c2540;font:500 13px 'JetBrains Mono',monospace;text-anchor:middle}

    .msc-eof{stroke:rgba(167,139,250,.32);stroke-width:2.5;fill:none;stroke-dasharray:10 7}
    .msc-eof-lbl{fill:#4b3d7a;font:500 14px 'JetBrains Mono',monospace;text-anchor:middle}

    .msc-pre{stroke:rgba(248,113,113,.28);stroke-width:2.5;fill:none;stroke-dasharray:9 6}
    .msc-pre-lbl{fill:#4a2929;font:500 14px 'JetBrains Mono',monospace;text-anchor:middle}

    /* controls */
    .msc-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .msc-tabs{display:inline-flex;flex-wrap:wrap;gap:5px;flex:1;min-width:0}
    .msc-tabs button{appearance:none;border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06);color:#6b7492;border-radius:7px;
      font:500 10px 'JetBrains Mono',monospace;letter-spacing:.03em;
      padding:6px 9px;cursor:pointer;white-space:nowrap;
      transition:color .18s,background .18s,border-color .18s}
    .msc-tabs button:hover{background:rgba(91,140,255,.14);
      border-color:rgba(124,140,255,.55)}
    .msc-tabs .msc-ov[aria-selected="true"]{background:rgba(91,140,255,.22);
      border-color:#5b8cff;color:#e7eaf3}
    .msc-tabs .msc-sb[aria-selected="true"]{
      background:rgba(255,255,255,.06);color:var(--sc);border-color:var(--sc)}
    .msc-tabs button:focus-visible{outline:2px solid #5b8cff;outline-offset:-2px}
    .msc-hint{font:500 9px 'JetBrains Mono',monospace;color:#2e3450;white-space:nowrap}

    /* panel */
    .msc-panel{display:flex;flex-direction:column;gap:7px;min-width:0}
    .msc-ptitle{font:600 10px 'Space Grotesk',system-ui,sans-serif;
      color:#6b7492;letter-spacing:.06em;text-transform:uppercase}
    .msc-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5px}
    .msc-card{border:1px solid rgba(124,140,255,.12);border-radius:8px;
      padding:6px 8px;background:rgba(91,140,255,.04)}
    .msc-val{font:700 13px 'Space Grotesk',system-ui,sans-serif;
      color:#e7eaf3;overflow-wrap:anywhere;min-width:0}
    .msc-clbl{font:500 8px 'JetBrains Mono',monospace;color:#3d4460;
      letter-spacing:.07em;text-transform:uppercase;margin-top:2px;overflow-wrap:anywhere}
    .msc-stag{display:inline-flex;align-items:center;gap:5px}
    .msc-dot{width:7px;height:7px;border-radius:50%;flex:none}
    .msc-slbl{font:700 9.5px 'JetBrains Mono',monospace;letter-spacing:.08em;color:#8d95ad}
    .msc-divider{border:none;border-top:1px solid rgba(124,140,255,.10);margin:4px 0}
    .msc-note{font:500 8.5px 'JetBrains Mono',monospace;color:#3d4460;
      line-height:1.5;overflow-wrap:anywhere}
    .msc-cap{font:500 9px 'JetBrains Mono',monospace;color:#2e3450}
  `;
  stage.appendChild(style);

  /* ── SVG ─────────────────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'msc-wrap';
  const svg = el('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Ethereum PBS MEV supply chain: Searcher → Builder → Relay → Proposer → Block',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  /* ── Defs: arrowheads ────────────────────────────────────────────────────── */
  const defs = el('defs');
  const mkAH = (id: string, fill: string): SVGMarkerElement => {
    const m = el('marker', { id, markerWidth: '8', markerHeight: '6',
      refX: '7', refY: '3', orient: 'auto' });
    m.appendChild(el('polygon', { points: '0 0, 8 3, 0 6', fill }));
    return m;
  };
  defs.appendChild(mkAH('msc-ah',     'rgba(124,140,255,.30)'));
  defs.appendChild(mkAH('msc-ah-eof', 'rgba(167,139,250,.45)'));
  defs.appendChild(mkAH('msc-ah-pre', 'rgba(248,113,113,.40)'));
  svg.appendChild(defs);

  /* ── Stage boxes + labels + hit areas ───────────────────────────────────── */
  const boxEls: SVGRectElement[] = [];
  const lblEls: SVGTextElement[] = [];
  const subEls: SVGTextElement[] = [];
  const hitEls: SVGRectElement[] = [];

  STAGES.forEach((s, i) => {
    const x = sx(i);
    const box = el('rect', { x, y: BY, width: BW, height: BH, rx: BR, class: 'msc-box' });
    const lbl = el('text', { x: scx(i), y: CY - 12, class: 'msc-lbl' }, s.label);
    const sub = el('text', { x: scx(i), y: CY + 16, class: 'msc-sub' }, s.sub);
    const hit = el('rect', { x, y: BY, width: BW, height: BH, rx: BR,
      class: 'msc-hit', tabindex: '0', role: 'button' });
    hit.setAttribute('aria-label', `${s.label}: ${s.sub}`);
    svg.appendChild(box); svg.appendChild(lbl); svg.appendChild(sub); svg.appendChild(hit);
    boxEls.push(box); lblEls.push(lbl); subEls.push(sub); hitEls.push(hit);
  });

  /* ── Flow arrows between boxes ───────────────────────────────────────────── */
  ARROWS.forEach((arr, i) => {
    const x1  = sx(i) + BW + 4;
    const x2  = sx(i + 1) - 4;
    const mid = (x1 + x2) / 2;
    svg.appendChild(el('line', { x1, y1: CY, x2, y2: CY,
      class: 'msc-flow', 'marker-end': 'url(#msc-ah)' }));
    svg.appendChild(el('text', { x: mid, y: CY - 18, class: 'msc-flbl' }, arr.label));
    if (arr.sub) svg.appendChild(el('text', { x: mid, y: CY - 1, class: 'msc-fsub' }, arr.sub));
  });

  /* ── Private EOF arc: Searcher → Builder (below boxes) ───────────────────── */
  {
    const x0 = scx(0), x1 = scx(1), py = BY + BH + 90;
    svg.appendChild(el('path', {
      d: `M${x0},${BY + BH + 4} C${x0},${py} ${x1},${py} ${x1},${BY + BH + 4}`,
      class: 'msc-eof', 'marker-end': 'url(#msc-ah-eof)',
    }));
    svg.appendChild(el('text', { x: (x0 + x1) / 2, y: py + 38, class: 'msc-eof-lbl' }, 'private EOF'));
    svg.appendChild(el('text', { x: (x0 + x1) / 2, y: py + 58, class: 'msc-eof-lbl' }, 'bypasses mempool'));
  }

  /* ── mev-commit preconf arc: Block → Builder (above boxes) ──────────────── */
  {
    const x0 = scx(4), x1 = scx(1), py = BY - 100;
    svg.appendChild(el('path', {
      d: `M${x0},${BY - 4} C${x0},${py} ${x1},${py} ${x1},${BY - 4}`,
      class: 'msc-pre', 'marker-end': 'url(#msc-ah-pre)',
    }));
    svg.appendChild(el('text', { x: (x0 + x1) / 2, y: py - 34, class: 'msc-pre-lbl' }, 'mev-commit preconf'));
    svg.appendChild(el('text', { x: (x0 + x1) / 2, y: py - 12, class: 'msc-pre-lbl' }, 'cryptoeconomic guarantee · 40 ms'));
  }

  /* ── Panel div ───────────────────────────────────────────────────────────── */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'msc-panel';
  panel.appendChild(panelDiv);

  /* ── Controls ────────────────────────────────────────────────────────────── */
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'msc-ctrl';
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'msc-tabs';
  tabsDiv.setAttribute('role', 'tablist');
  tabsDiv.setAttribute('aria-label', 'MEV supply chain stage selector');

  const ovBtn = document.createElement('button');
  ovBtn.type = 'button'; ovBtn.setAttribute('role', 'tab');
  ovBtn.className = 'msc-ov'; ovBtn.textContent = 'Overview';
  ovBtn.dataset['view'] = 'overview';
  tabsDiv.appendChild(ovBtn);

  const stageBtns = STAGES.map((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.className = 'msc-sb'; b.textContent = s.label;
    b.dataset['view'] = s.id;
    b.style.setProperty('--sc', s.color);
    tabsDiv.appendChild(b);
    return b;
  });

  const allBtns = [ovBtn, ...stageBtns];
  const hint = document.createElement('span');
  hint.className = 'msc-hint'; hint.textContent = 'tap a stage to inspect';
  ctrlDiv.append(tabsDiv, hint);
  ctrl.appendChild(ctrlDiv);

  /* ── Caption ─────────────────────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'msc-cap';
  cap.textContent = 'arXiv:2605.04471 · ethresear.ch/t/23066 · mev-boost data Dec 2025 · mev-commit data Aug 2025';
  caption.appendChild(cap);

  /* ── State ───────────────────────────────────────────────────────────────── */
  let active = 'overview';

  function renderDiagram(): void {
    const idx = STAGES.findIndex((s) => s.id === active);
    const isOv = active === 'overview';
    boxEls.forEach((box, i) => {
      const sel = !isOv && i === idx;
      const dim = !isOv && i !== idx;
      box.setAttribute('class', sel ? 'msc-box msc-sel' : dim ? 'msc-box msc-dim' : 'msc-box');
      box.style.stroke = sel ? STAGES[i]!.color : '';
    });
    lblEls.forEach((lbl, i) => {
      const dim = !isOv && i !== idx;
      const sel = isOv || i === idx;
      lbl.setAttribute('class', dim ? 'msc-lbl msc-dim' : sel ? 'msc-lbl msc-sel' : 'msc-lbl');
    });
    subEls.forEach((sub, i) => {
      const dim = !isOv && i !== idx;
      const sel = isOv || i === idx;
      sub.setAttribute('class', dim ? 'msc-sub msc-dim' : sel ? 'msc-sub msc-sel' : 'msc-sub');
    });
  }

  function renderPanel(): void {
    panelDiv.innerHTML = '';
    if (active === 'overview') {
      const t = document.createElement('div');
      t.className = 'msc-ptitle'; t.textContent = 'PBS supply chain overview';
      panelDiv.appendChild(t);
      const grid = document.createElement('div');
      grid.className = 'msc-grid';
      OVERVIEW.forEach(([val, lbl]) => {
        const card = document.createElement('div'); card.className = 'msc-card';
        const vEl = document.createElement('div'); vEl.className = 'msc-val'; vEl.textContent = val;
        const lEl = document.createElement('div'); lEl.className = 'msc-clbl'; lEl.textContent = lbl;
        card.append(vEl, lEl); grid.appendChild(card);
      });
      panelDiv.appendChild(grid);
      const hr = document.createElement('hr'); hr.className = 'msc-divider';
      panelDiv.appendChild(hr);
      const note = document.createElement('div'); note.className = 'msc-note';
      note.textContent = 'Select a stage to see its role and key metrics. Dashed arcs show private EOF (below boxes) and mev-commit preconf feedback (above boxes).';
      panelDiv.appendChild(note);
      return;
    }
    const s = STAGES.find((st) => st.id === active);
    if (!s) return;
    const tag = document.createElement('div'); tag.className = 'msc-stag';
    const dot = document.createElement('span'); dot.className = 'msc-dot'; dot.style.background = s.color;
    const slbl = document.createElement('span'); slbl.className = 'msc-slbl'; slbl.textContent = s.label.toUpperCase();
    tag.append(dot, slbl); panelDiv.appendChild(tag);
    const grid = document.createElement('div'); grid.className = 'msc-grid';
    s.stats.forEach(([val, lbl]) => {
      const card = document.createElement('div'); card.className = 'msc-card';
      const vEl = document.createElement('div'); vEl.className = 'msc-val'; vEl.textContent = val;
      const lEl = document.createElement('div'); lEl.className = 'msc-clbl'; lEl.textContent = lbl;
      card.append(vEl, lEl); grid.appendChild(card);
    });
    panelDiv.appendChild(grid);
    const hr = document.createElement('hr'); hr.className = 'msc-divider';
    panelDiv.appendChild(hr);
    const noteEl = document.createElement('div'); noteEl.className = 'msc-note'; noteEl.textContent = s.note;
    panelDiv.appendChild(noteEl);
  }

  function renderBtns(): void {
    allBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset['view'] === active)));
  }

  function setView(v: string): void {
    active = v; renderDiagram(); renderPanel(); renderBtns();
  }

  /* ── Events ──────────────────────────────────────────────────────────────── */
  const listeners: [EventTarget, string, EventListener][] = [];
  function on(t: EventTarget, ev: string, fn: EventListener): void {
    t.addEventListener(ev, fn); listeners.push([t, ev, fn]);
  }

  on(ovBtn, 'click', () => setView('overview'));
  stageBtns.forEach((b) => on(b, 'click', () => setView(b.dataset['view']!)));

  hitEls.forEach((hit, i) => {
    on(hit, 'click', () => setView(STAGES[i]!.id));
    on(hit, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); setView(STAGES[i]!.id); }
    });
  });

  on(tabsDiv, 'keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'ArrowLeft' && ke.key !== 'ArrowRight') return;
    ke.preventDefault();
    const ids = ['overview', ...STAGES.map((s) => s.id)];
    const cur = ids.indexOf(active);
    const nxt = (cur + (ke.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    setView(ids[nxt]!);
    allBtns[nxt]?.focus();
  });

  setView('overview');

  return () => {
    listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    layout.dispose();
    style.remove();
  };
}
