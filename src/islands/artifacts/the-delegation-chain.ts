/**
 * Artifact: the-delegation-chain — The Delegation Chain
 *
 * Interactive diagram of the 5-hop principal chain in AI agent systems:
 * Human → Orchestrator → Sub-Agent → MCP Tool → Chain Call.
 * Toggle between No-Auth (baseline), IBCT Compact (single-hop JWT), and
 * IBCT Chained (append-only Biscuit) to see what each edge proves and misses.
 * Click any edge chip to inspect its token in the panel.
 *
 * No data.json — this is a protocol diagram. Numbers inline from AIP
 * arXiv:2603.24775 and HDP arXiv:2604.04522.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
type Mode = 'none' | 'compact' | 'chained';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const VW = 820;
const VH = 240;
const CY = 120; // chain center-line y

// Nodes: [cx, half-width, label, sub-label]
type NodeDef = [number, number, string, string];
const NODES: NodeDef[] = [
  [60,  44,  'HUMAN',         'wallet · signer'],
  [220, 68,  'ORCHESTRATOR',  'root agent'],
  [400, 68,  'SUB-AGENT',     'specialist model'],
  [580, 68,  'MCP TOOL',      'transfer_funds()'],
  [750, 52,  'CHAIN',         'USDC · Base'],
];

// Edge definitions: label above the line, chip label in mode≠none
const EDGES = [
  { label: 'authorize',  chip: 'Root Grant'  },
  { label: 'delegate',   chip: 'Delegation'  },
  { label: 'invoke',     chip: 'Invocation'  },
  { label: 'sign tx',    chip: 'Execution'   },
];

// Midpoints between node edges
function edgeMid(i: number): number {
  const [cx, hw] = NODES[i]!;
  const [ncx, nhw] = NODES[i + 1]!;
  return Math.round((cx + hw + ncx - nhw) / 2);
}

// ─── Token data ───────────────────────────────────────────────────────────────

type Block = { label: string; fields: [string, string][] };

interface TokenInfo {
  tag: string;
  tagColor: string;
  warning: boolean;
  blocks: Block[];
  catches: string;
  misses: string;
}

const COMPACT_ISSUERS  = ['user:alice',           'agent:orchestrator', 'agent:sub-agent',    'mcp:transfer_funds'];
const COMPACT_SUBJECTS = ['agent:orchestrator',   'agent:sub-agent',    'mcp:transfer_funds', 'chain:erc20'];
const COMPACT_SCOPES   = ['pay_invoice',          'pay_invoice',        'transfer:max=500',   'transfer:max=500'];

const CHAINED_BLOCKS: Block[] = [
  { label: 'block 0 — root grant', fields: [
      ['iss',   'user:alice'],
      ['aud',   'agent:orchestrator'],
      ['scope', 'pay_invoice'],
      ['exp',   'now + 1 h'],
      ['alg',   'Ed25519'],
  ] },
  { label: 'block 1 — delegation', fields: [
      ['iss',         'agent:orchestrator'],
      ['delegate_to', 'agent:sub-agent'],
      ['scope',       'pay_invoice:max=1000'],
      ['depth',       '1 / 2 allowed'],
  ] },
  { label: 'block 2 — invocation', fields: [
      ['iss',    'agent:sub-agent'],
      ['invoke', 'transfer_funds'],
      ['scope',  'transfer:max=500 USDC'],
      ['nonce',  'a3f172...'],
  ] },
  { label: 'block 3 — execution', fields: [
      ['iss',    'mcp:transfer_funds'],
      ['action', 'erc20.transfer'],
      ['to',     '0xd8dA6B...'],
      ['amount', '500 USDC'],
      ['chain',  'Base (8453)'],
  ] },
];

function tokenInfo(mode: Mode, edgeIdx: number): TokenInfo {
  if (mode === 'none') {
    return {
      tag: 'unsigned', tagColor: '#f87171', warning: true,
      blocks: [{ label: 'no token at this hop', fields: [
        ['caller identity',  'unknown'],
        ['scope granted',    'unknown'],
        ['human involved',   'unknown'],
        ['chain depth',      'unknown'],
      ] }],
      catches: 'nothing — the callee accepts all calls',
      misses: 'identity, scope, provenance, and depth violations',
    };
  }
  if (mode === 'compact') {
    return {
      tag: 'JWT · compact', tagColor: '#f5c451', warning: false,
      blocks: [{ label: 'IBCT compact — signed JWT', fields: [
        ['iss',   COMPACT_ISSUERS[edgeIdx]!],
        ['sub',   COMPACT_SUBJECTS[edgeIdx]!],
        ['scope', COMPACT_SCOPES[edgeIdx]!],
        ['exp',   'now + 60 s'],
        ['alg',   'Ed25519 · 0.049 ms verify'],
      ] }],
      catches: "single-hop identity — callee verifies this caller's key and scope",
      misses: "no chain beyond this hop — cannot verify the caller was itself authorized",
    };
  }
  // chained
  const count = edgeIdx + 1;
  return {
    tag: `Biscuit · ${count} block${count > 1 ? 's' : ''}`,
    tagColor: '#8b5cf6',
    warning: false,
    blocks: CHAINED_BLOCKS.slice(0, count),
    catches: 'full provenance — every hop back to the human root, scope can only narrow',
    misses: edgeIdx < 3
      ? 'downstream hops not yet recorded — chain grows as calls proceed'
      : 'none — full chain present',
  };
}

// ─── Main mount ───────────────────────────────────────────────────────────────

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // ── styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .dc-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .dc-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    /* nodes */
    .dc-node rect { fill:#0e1528; stroke:rgba(124,140,255,.30); transition:stroke .25s; }
    .dc-node.dc-sel rect { stroke:#5b8cff; }
    .dc-node-title { fill:#e7eaf3; font:600 11px 'Space Grotesk',system-ui,sans-serif; }
    .dc-node-sub   { fill:#5b6378; font:500 8.5px 'JetBrains Mono',monospace; }
    .dc-human circle { fill:#0e1528; stroke:rgba(124,140,255,.30); transition:stroke .25s; }
    .dc-human text  { fill:#e7eaf3; font:600 11px 'Space Grotesk',system-ui,sans-serif; }
    .dc-human .dc-node-sub { fill:#5b6378; }

    /* edges */
    .dc-edge-line { stroke:rgba(124,140,255,.22); stroke-width:2; transition:stroke .25s,opacity .25s; }
    .dc-edge-line.dc-mode-compact { stroke:#f5c451; opacity:.7; }
    .dc-edge-line.dc-mode-chained { stroke:#8b5cf6; opacity:.8; }
    .dc-edge-lbl  { fill:#5b6378; font:500 8px 'JetBrains Mono',monospace;
      letter-spacing:.08em; text-transform:uppercase; }

    /* chips (edge tokens) */
    .dc-chip rect { fill:#0d1322; stroke:rgba(124,140,255,.22); rx:6;
      transition:fill .25s,stroke .25s; cursor:pointer; }
    .dc-chip:hover rect { stroke:rgba(124,140,255,.55); }
    .dc-chip.dc-sel rect { stroke:#5b8cff; fill:rgba(91,140,255,.10); }
    .dc-chip.dc-mode-compact rect { stroke:#f5c451; fill:rgba(245,196,81,.08); }
    .dc-chip.dc-mode-compact.dc-sel rect { fill:rgba(245,196,81,.18); }
    .dc-chip.dc-mode-chained rect { stroke:#8b5cf6; fill:rgba(139,92,246,.08); }
    .dc-chip.dc-mode-chained.dc-sel rect { fill:rgba(139,92,246,.18); }
    .dc-chip-txt { fill:#8d95ad; font:600 8.5px 'JetBrains Mono',monospace;
      pointer-events:none; transition:fill .25s; }
    .dc-chip.dc-mode-compact .dc-chip-txt { fill:#f5c451; }
    .dc-chip.dc-mode-chained .dc-chip-txt { fill:#a78bfa; }
    .dc-chip-hit { fill:transparent; cursor:pointer; }

    /* block badges on chained chips */
    .dc-badge { fill:#8b5cf6; rx:3; }
    .dc-badge-txt { fill:#fff; font:700 7.5px 'JetBrains Mono',monospace; }

    /* controls */
    .dc-ctrl { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .dc-tabs { display:inline-flex; flex-wrap:wrap; gap:6px; }
    .dc-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10.5px 'JetBrains Mono',monospace; letter-spacing:.03em;
      padding:8px 13px; cursor:pointer;
      transition:color .2s,background .2s,border-color .2s; }
    .dc-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .dc-tabs button[aria-selected="true"] { background:rgba(91,140,255,.22);
      border-color:#5b8cff; color:#e7eaf3; }
    .dc-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .dc-hint { font:500 9.5px 'JetBrains Mono',monospace; color:#3d4460; }

    /* panel */
    .dc-panel { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%; }
    .dc-ptag  { display:inline-flex; align-items:center; gap:5px; }
    .dc-ptag-dot { width:7px; height:7px; border-radius:50%; flex:none; }
    .dc-ptag-lbl { font:700 9.5px 'JetBrains Mono',monospace; color:#8d95ad; letter-spacing:.08em; }
    .dc-pblocks { display:flex; flex-direction:column; gap:6px; }
    .dc-block { border:1px solid rgba(124,140,255,.14); border-radius:8px;
      padding:7px 9px; background:rgba(91,140,255,.04); min-width:0; }
    .dc-block-h { font:600 9px 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.10em; text-transform:uppercase; margin-bottom:5px;
      overflow-wrap:anywhere; }
    .dc-field  { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr);
      gap:0 8px; align-items:baseline; }
    .dc-fk { font:500 9px 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.06em; white-space:nowrap; padding-right:2px; }
    .dc-fv { font:500 9.5px 'JetBrains Mono',monospace; color:#9aa3bd;
      overflow-wrap:anywhere; min-width:0; }
    .dc-divider { border:none; border-top:1px solid rgba(124,140,255,.10); margin:6px 0; }
    .dc-catch { display:flex; gap:5px; font:500 9.5px 'JetBrains Mono',monospace;
      color:#22d3ee; min-width:0; overflow-wrap:anywhere; line-height:1.4; }
    .dc-miss  { display:flex; gap:5px; font:500 9.5px 'JetBrains Mono',monospace;
      color:#f87171; min-width:0; overflow-wrap:anywhere; line-height:1.4; }
    .dc-catch.dc-warn { color:#f87171; }
    .dc-note  { font:500 9px 'JetBrains Mono',monospace; color:#3d4460; line-height:1.5;
      overflow-wrap:anywhere; min-width:0; }
  `;
  stage.appendChild(style);

  // ── SVG stage ────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'dc-wrap';
  const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'AI agent delegation chain diagram');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // ── Draw nodes ───────────────────────────────────────────────────────────────
  const nodeGroups: SVGGElement[] = [];

  NODES.forEach(([cx, hw, label, sub], i) => {
    const g = svgEl('g', { class: i === 0 ? 'dc-human' : 'dc-node' });
    if (i === 0) {
      // human: rounded rect (same height as others for cleanliness)
      const W = hw * 2, H = 56;
      g.appendChild(svgEl('rect', { x: cx - hw, y: CY - H / 2, width: W, height: H, rx: 28 }));
      g.appendChild(svgEl('text', { x: cx, y: CY - 5, class: 'dc-node-title', 'text-anchor': 'middle' }, label));
      g.appendChild(svgEl('text', { x: cx, y: CY + 11, class: 'dc-node-sub', 'text-anchor': 'middle' }, sub));
    } else {
      const W = hw * 2, H = 56;
      g.appendChild(svgEl('rect', { x: cx - hw, y: CY - H / 2, width: W, height: H, rx: 10 }));
      g.appendChild(svgEl('text', { x: cx, y: CY - 5, class: 'dc-node-title', 'text-anchor': 'middle' }, label));
      g.appendChild(svgEl('text', { x: cx, y: CY + 11, class: 'dc-node-sub', 'text-anchor': 'middle' }, sub));
    }
    svg.appendChild(g);
    nodeGroups.push(g);
  });

  // ── Draw edges ────────────────────────────────────────────────────────────────
  const edgeLines: SVGLineElement[] = [];
  const chipGroups: SVGGElement[] = [];

  EDGES.forEach(({ label, chip }, i) => {
    const [cx0, hw0] = NODES[i]!;
    const [cx1, hw1] = NODES[i + 1]!;
    const x0 = cx0 + hw0 + 4;
    const x1 = cx1 - hw1 - 4;
    const mx = Math.round((x0 + x1) / 2);

    // edge label above line
    svg.appendChild(svgEl('text', {
      x: mx, y: CY - 40, class: 'dc-edge-lbl', 'text-anchor': 'middle',
    }, label));

    // the line
    const line = svgEl('line', { x1: x0, y1: CY, x2: x1, y2: CY, class: 'dc-edge-line' });
    svg.appendChild(line);
    edgeLines.push(line);

    // chip group
    const chipW = 70, chipH = 22;
    const g = svgEl('g', { class: 'dc-chip' });
    g.setAttribute('aria-label', `Edge ${i}: ${chip} token`);
    g.appendChild(svgEl('rect', { x: mx - chipW / 2, y: CY - chipH / 2, width: chipW, height: chipH, rx: 6 }));
    g.appendChild(svgEl('text', {
      x: mx, y: CY + 4, class: 'dc-chip-txt', 'text-anchor': 'middle',
    }, '— unsigned —'));
    // badge (block count for chained mode)
    const badge = svgEl('g');
    badge.style.display = 'none';
    badge.appendChild(svgEl('rect', { x: mx + 24, y: CY - chipH / 2 - 5, width: 14, height: 12, rx: 3, class: 'dc-badge' }));
    badge.appendChild(svgEl('text', {
      x: mx + 31, y: CY - chipH / 2 + 3, class: 'dc-badge-txt', 'text-anchor': 'middle',
    }, String(i + 1)));
    g.appendChild(badge);
    // hit area (larger than the chip for touch)
    const hit = svgEl('rect', {
      x: mx - chipW / 2 - 8, y: CY - 20, width: chipW + 16, height: 40, class: 'dc-chip-hit',
    });
    g.appendChild(hit);
    svg.appendChild(g);
    chipGroups.push(g);
  });

  // ── Panel ────────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'dc-panel';
  panel.appendChild(panelDiv);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'dc-ctrl';
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'dc-tabs';
  tabsDiv.setAttribute('role', 'tablist');
  tabsDiv.setAttribute('aria-label', 'Delegation mode');

  const MODES: { id: Mode; label: string }[] = [
    { id: 'none',    label: 'No Auth'       },
    { id: 'compact', label: 'IBCT Compact'  },
    { id: 'chained', label: 'IBCT Chained'  },
  ];
  const tabBtns = MODES.map(({ id, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Show ${label} mode`);
    b.textContent = label;
    b.dataset['mode'] = id;
    tabsDiv.appendChild(b);
    return b;
  });

  const hint = document.createElement('span');
  hint.className = 'dc-hint';
  hint.textContent = 'tap any edge chip to inspect';
  ctrlDiv.append(tabsDiv, hint);
  controlsSlot.appendChild(ctrlDiv);

  // ── Caption ───────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'dc-note';
  cap.textContent = 'IBCT & scan results: AIP arXiv:2603.24775 · HDP IETF draft: arXiv:2604.04522';
  caption.appendChild(cap);

  // ── State ─────────────────────────────────────────────────────────────────────
  let mode: Mode = 'none';
  let selectedEdge = 0;

  function renderPanel() {
    panelDiv.innerHTML = '';
    const info = tokenInfo(mode, selectedEdge);

    // tag row
    const tagRow = document.createElement('div');
    tagRow.className = 'dc-ptag';
    const dot = document.createElement('span');
    dot.className = 'dc-ptag-dot';
    dot.style.background = info.tagColor;
    const lbl = document.createElement('span');
    lbl.className = 'dc-ptag-lbl';
    lbl.textContent = `edge ${selectedEdge + 1} / ${EDGES[selectedEdge]!.label} — ${info.tag}`;
    tagRow.append(dot, lbl);
    panelDiv.appendChild(tagRow);

    // blocks
    const blocksDiv = document.createElement('div');
    blocksDiv.className = 'dc-pblocks';
    info.blocks.forEach((blk) => {
      const blkDiv = document.createElement('div');
      blkDiv.className = 'dc-block';
      const h = document.createElement('div');
      h.className = 'dc-block-h';
      h.textContent = blk.label;
      blkDiv.appendChild(h);
      blk.fields.forEach(([k, v]) => {
        const row = document.createElement('div');
        row.className = 'dc-field';
        const kEl = document.createElement('span');
        kEl.className = 'dc-fk';
        kEl.textContent = k;
        const vEl = document.createElement('span');
        vEl.className = 'dc-fv';
        vEl.textContent = v;
        row.append(kEl, vEl);
        blkDiv.appendChild(row);
      });
      blocksDiv.appendChild(blkDiv);
    });
    panelDiv.appendChild(blocksDiv);

    const hr = document.createElement('hr');
    hr.className = 'dc-divider';
    panelDiv.appendChild(hr);

    const catchEl = document.createElement('div');
    catchEl.className = info.warning ? 'dc-catch dc-warn' : 'dc-catch';
    catchEl.innerHTML = `<span>${info.warning ? '✗' : '✓'}</span><span>${info.catches}</span>`;
    panelDiv.appendChild(catchEl);

    const missEl = document.createElement('div');
    missEl.className = 'dc-miss';
    missEl.innerHTML = `<span>✗</span><span>${info.misses}</span>`;
    panelDiv.appendChild(missEl);
  }

  function renderEdges() {
    const modeClass = mode === 'none' ? '' : `dc-mode-${mode}`;
    edgeLines.forEach((line) => {
      line.setAttribute('class', ['dc-edge-line', modeClass].filter(Boolean).join(' '));
    });
    chipGroups.forEach((g, i) => {
      const chipTxt = g.querySelector('.dc-chip-txt') as SVGTextElement;
      const badge = g.children[2] as SVGGElement; // badge group
      const selClass = i === selectedEdge ? 'dc-sel' : '';
      g.setAttribute('class', ['dc-chip', modeClass, selClass].filter(Boolean).join(' '));

      if (mode === 'none') {
        chipTxt.textContent = '— unsigned —';
        badge.style.display = 'none';
      } else if (mode === 'compact') {
        chipTxt.textContent = 'JWT · ' + EDGES[i]!.chip;
        badge.style.display = 'none';
      } else {
        chipTxt.textContent = EDGES[i]!.chip;
        badge.style.display = '';
        const btxt = badge.querySelector('.dc-badge-txt') as SVGTextElement;
        btxt.textContent = String(i + 1);
      }
    });
    tabBtns.forEach((b) => {
      b.setAttribute('aria-selected', String((b.dataset['mode'] as Mode) === mode));
    });
  }

  function selectEdge(i: number) {
    selectedEdge = i;
    renderEdges();
    renderPanel();
  }

  function setMode(m: Mode) {
    mode = m;
    renderEdges();
    renderPanel();
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  const chipHandlers: (() => void)[] = [];
  chipGroups.forEach((g, i) => {
    const hit = g.querySelector('.dc-chip-hit') as SVGRectElement;
    const fn = () => selectEdge(i);
    hit.addEventListener('click', fn);
    chipHandlers.push(fn);
  });

  const tabHandlers: ((e: Event) => void)[] = [];
  tabBtns.forEach((b) => {
    const fn = (e: Event) => {
      const m = (e.currentTarget as HTMLButtonElement).dataset['mode'] as Mode;
      setMode(m);
    };
    b.addEventListener('click', fn);
    tabHandlers.push(fn);
  });

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cur = tabBtns.findIndex((b) => (b.dataset['mode'] as Mode) === mode);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (cur + dir + tabBtns.length) % tabBtns.length;
    tabBtns[next]!.focus();
    setMode(MODES[next]!.id);
  };
  tabsDiv.addEventListener('keydown', onTabKey);

  // initial render
  setMode('none');

  return () => {
    chipGroups.forEach((g, i) => {
      const hit = g.querySelector('.dc-chip-hit') as SVGRectElement;
      hit.removeEventListener('click', chipHandlers[i]!);
    });
    tabBtns.forEach((b, i) => b.removeEventListener('click', tabHandlers[i]!));
    tabsDiv.removeEventListener('keydown', onTabKey);
    layout.dispose();
    style.remove();
  };
}
