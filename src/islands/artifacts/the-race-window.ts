/**
 * Artifact: the-race-window — The Race Window
 *
 * Three concurrent multi-agent LLM anomaly types — Stale-Generation,
 * Phantom-Tool, Causal-Cascade — shown as vertical stage flows.
 * Toggle between Unprotected and ORI Protected (S-Bus / CoAgent) to see
 * how each anomaly is detected and blocked.
 *
 * Anomaly taxonomy from arXiv:2606.17182 (Verified Detection & Prevention).
 * ORI numbers from arXiv:2605.17076 (S-Bus): 0 corruptions / 884,110 commits.
 * CoAgent MTPO from arXiv:2606.15376.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

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
const VW = 900;
const VH = 310;
const HEADER_H = 52;
const STAGE_H = 52;
const STAGE_GAP = 5;
const STAGE_COUNT = 4;
const BOX_PAD = 12;
const COL_W = VW / 3; // 300 per column
const BOX_W = COL_W - BOX_PAD * 2;

function stageY(i: number): number {
  return HEADER_H + i * (STAGE_H + STAGE_GAP);
}
function colX(c: number): number { return c * COL_W; }
function colCX(c: number): number { return colX(c) + COL_W / 2; }

// ─── Stage kinds & colours ────────────────────────────────────────────────────
type StageKind = 'normal' | 'race' | 'conflict' | 'bad' | 'good' | 'neutral';

const KINDS: Record<StageKind, { border: string; fill: string; tagFill: string }> = {
  normal:   { border: '#5b8cff', fill: 'rgba(91,140,255,0.07)',  tagFill: '#5b8cff' },
  race:     { border: '#f5c451', fill: 'rgba(245,196,81,0.08)',  tagFill: '#f5c451' },
  conflict: { border: '#f87171', fill: 'rgba(248,113,113,0.14)', tagFill: '#f87171' },
  bad:      { border: '#f87171', fill: 'rgba(248,113,113,0.20)', tagFill: '#f87171' },
  good:     { border: '#22d3ee', fill: 'rgba(34,211,238,0.12)',  tagFill: '#22d3ee' },
  neutral:  { border: '#3d4460', fill: 'rgba(61,68,96,0.06)',    tagFill: '#5b6378' },
};

// ─── Data ─────────────────────────────────────────────────────────────────────
interface StageInfo {
  name: string;
  agent: string;
  tag: string;
  note: string;
  kindUnprotected: StageKind;
  kindProtected: StageKind;
  tagProtected?: string;
  noteProtected?: string;
}

interface AnomalyDef {
  label: string;
  sub: string;
  stages: StageInfo[];
  detail: { desc: string; props: [string, string][] };
}

const ANOMALIES: AnomalyDef[] = [
  {
    label: 'Stale-Generation', sub: 'Agent A acts on an outdated read',
    stages: [
      { name: 'READ',     agent: 'A', tag: 'READS v1',  note: 'Agent A reads shared state v1',
        kindUnprotected: 'normal',   kindProtected: 'normal'  },
      { name: 'WRITE',    agent: 'B', tag: 'WRITES v2', note: 'Agent B mutates state concurrently',
        kindUnprotected: 'race',     kindProtected: 'race'    },
      { name: 'GENERATE', agent: 'A', tag: 'STALE GEN', note: 'Agent A generates from stale v1',
        kindUnprotected: 'conflict', kindProtected: 'good',
        tagProtected: 'BLOCKED', noteProtected: 'DeliveryLog: v1 overwritten — reject commit' },
      { name: 'EXECUTE',  agent: 'A', tag: 'WRONG PLAN', note: 'Executes plan against v2 world',
        kindUnprotected: 'bad',     kindProtected: 'neutral',
        tagProtected: 'RE-READ',  noteProtected: 'Agent A re-reads with fresh context' },
    ],
    detail: {
      desc: 'Agent A reads state v1. Agent B writes v2 concurrently. Agent A generates a plan grounded in the old snapshot and executes it against a world that has already moved on. A database transaction aborts; the LLM generates with confidence.',
      props: [
        ['Root cause', 'No read-lease enforcement'],
        ['DB analogy', 'Non-repeatable read / dirty read'],
        ['ORI fix',    'DeliveryLog rejects commit if any read was overwritten'],
        ['Safety',     '0 / 884,110 commits corrupted under ORI (S-Bus)'],
        ['Formally',   'TLAPS proves ReadSetSoundness · arXiv:2605.17076'],
        ['Paper',      'arXiv:2606.17182 § 3.1'],
      ],
    },
  },
  {
    label: 'Phantom-Tool', sub: 'Agent A calls a tool that no longer exists',
    stages: [
      { name: 'QUERY',      agent: 'A', tag: 'FOUND',    note: 'Agent A: tool present in registry',
        kindUnprotected: 'normal',   kindProtected: 'normal'   },
      { name: 'DEREGISTER', agent: 'B', tag: 'REMOVED',  note: 'Agent B removes tool concurrently',
        kindUnprotected: 'race',     kindProtected: 'race'     },
      { name: 'CALL',       agent: 'A', tag: 'PHANTOM',  note: 'Agent A invokes deregistered tool',
        kindUnprotected: 'conflict', kindProtected: 'good',
        tagProtected: 'LEASE HELD', noteProtected: 'Removal deferred: A holds active read lease' },
      { name: 'OUTCOME',    agent: '?', tag: 'FAILED',   note: 'Tool not found — undefined behavior',
        kindUnprotected: 'bad',     kindProtected: 'neutral',
        tagProtected: 'ORDERED',   noteProtected: 'A\'s call completes; B retries after lease' },
    ],
    detail: {
      desc: 'Agent A discovers a tool and plans to call it. Before it can, Agent B removes it from the registry. MCP tool manifests are mutable; no built-in mechanism holds a read lease on tool availability between discovery and invocation.',
      props: [
        ['Root cause', 'Mutable manifests, no read leases'],
        ['Context',    'MCP tools register/deregister dynamically'],
        ['ORI fix',    'Read lease on manifest; removal deferred until lease expires'],
        ['Note',       'Distinct from tool-poisoning (malicious descriptions)'],
        ['Paper',      'arXiv:2606.17182 § 3.2'],
      ],
    },
  },
  {
    label: 'Causal-Cascade', sub: 'Concurrent writes corrupt shared state',
    stages: [
      { name: 'WRITE A', agent: 'A', tag: 'X ← 1', note: 'Agent A writes X=1 to shared state',
        kindUnprotected: 'race',     kindProtected: 'race'   },
      { name: 'WRITE B', agent: 'B', tag: 'X ← 2', note: 'Agent B writes X=2 concurrently',
        kindUnprotected: 'race',     kindProtected: 'good',
        tagProtected: 'DEFERRED', noteProtected: 'MTPO serializes: B waits for A\'s write' },
      { name: 'READ X',  agent: '?', tag: 'X = ?',  note: 'Downstream reads undefined composite',
        kindUnprotected: 'conflict', kindProtected: 'neutral',
        tagProtected: 'X = 1',   noteProtected: 'Downstream reads X=1 (serialized)' },
      { name: 'CASCADE', agent: '?', tag: 'CORRUPT', note: 'Derived state propagates corruption',
        kindUnprotected: 'bad',     kindProtected: 'neutral',
        tagProtected: 'CLEAN',   noteProtected: 'No cascade — state is well-defined' },
    ],
    detail: {
      desc: 'Two agents write to overlapping state concurrently. Neither value "wins" cleanly; the composite state is undefined. Downstream agents propagate the inconsistency further. Unlike the first two anomalies (local to one context), a causal-cascade contaminates shared world-state for all readers.',
      props: [
        ['Root cause', 'No write serialization across agents'],
        ['DB analogy', 'Lost update / write-write conflict'],
        ['MTPO fix',   'Monotonic Trajectory Pre-Order serializes writes at session start'],
        ['LLM edge',   'CoAgent: model judges whether the conflict actually matters'],
        ['Model op',   '~1 round-trip for conflict evaluation; saga rollback if needed'],
        ['Paper',      'arXiv:2606.15376 (CoAgent) · arXiv:2606.17182 § 3.3'],
      ],
    },
  },
];

// ─── Mount ────────────────────────────────────────────────────────────────────
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .rw-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.13); border-radius:12px;
      background:#0d1322; overflow:hidden; }
    .rw-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .rw-col-bg { cursor:pointer; transition:fill .18s,stroke .18s; }
    .rw-col-bg:hover { fill:rgba(91,140,255,0.05); }
    .rw-col-bg.rw-sel { fill:rgba(91,140,255,0.10); stroke:#5b8cff !important; }

    .rw-sep { stroke:rgba(124,140,255,.10); }

    .rw-hdr-lbl { fill:#e7eaf3; font:700 11.5px 'Space Grotesk',system-ui,sans-serif; }
    .rw-hdr-sub { fill:#5b6378; font:500 8px 'JetBrains Mono',monospace; }

    .rw-agent { fill:#3d4460; font:500 7px 'JetBrains Mono',monospace; letter-spacing:.06em; }
    .rw-stage-name { fill:#4a5268; font:600 7.5px 'JetBrains Mono',monospace; letter-spacing:.07em; }
    .rw-stage-tag  { font:700 9px 'JetBrains Mono',monospace; letter-spacing:.05em; }
    .rw-stage-note { fill:#4a5268; font:500 7px 'Space Grotesk',system-ui,sans-serif; }

    .rw-box { transition:fill .28s,stroke .28s; }
    .rw-tag { transition:fill .28s; }
    .rw-note { transition:fill .18s; }

    .rw-arrow { stroke:rgba(124,140,255,.18); fill:none; stroke-width:1.4; }
    .rw-arrow-head { fill:rgba(124,140,255,.18); }

    /* Panel */
    .rw-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .rw-phd { font:700 11px 'Space Grotesk',system-ui,sans-serif; color:#e7eaf3; overflow-wrap:anywhere; }
    .rw-pdesc { font:500 9.5px 'Space Grotesk',system-ui,sans-serif; color:#8d95ad;
      line-height:1.55; overflow-wrap:anywhere; min-width:0; }
    .rw-hr { border:none; border-top:1px solid rgba(124,140,255,.10); margin:2px 0; }
    .rw-props { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .rw-prop { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:0 8px; }
    .rw-pk { font:500 9px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .rw-pv { font:500 9px 'JetBrains Mono',monospace; color:#9aa3bd; overflow-wrap:anywhere; min-width:0; }

    /* Controls */
    .rw-ctrl { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .rw-ori-btn {
      appearance:none; border:1px solid rgba(34,211,238,.35);
      background:rgba(34,211,238,.06); color:#67e8f9; border-radius:8px;
      font:500 10px 'JetBrains Mono',monospace; padding:7px 12px;
      cursor:pointer; transition:all .2s; white-space:nowrap; flex:none;
    }
    .rw-ori-btn:hover { background:rgba(34,211,238,.13); border-color:#22d3ee; }
    .rw-ori-btn[aria-pressed="true"] {
      background:rgba(34,211,238,.20); border-color:#22d3ee; color:#22d3ee; }
    .rw-hint { font:500 9px 'JetBrains Mono',monospace; color:#3d4460; overflow-wrap:anywhere; min-width:0; }
    .rw-cap  { font:500 8.5px 'JetBrains Mono',monospace; color:#3d4460; overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  // ── SVG ─────────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'rw-wrap';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Three concurrent multi-agent LLM anomaly types as stage flow diagrams',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // Column separators
  for (let c = 1; c < 3; c++) {
    svg.appendChild(svgEl('line', {
      x1: colX(c), y1: 0, x2: colX(c), y2: VH, class: 'rw-sep', 'stroke-width': 1,
    }));
  }

  // ── Per-column elements ───────────────────────────────────────────────────
  const colBgs: SVGRectElement[] = [];
  const colHits: SVGRectElement[] = [];
  interface StageEls { box: SVGRectElement; tag: SVGTextElement; note: SVGTextElement }
  const stageEls: StageEls[][] = [];
  const arrowEls: SVGPathElement[][] = [];

  ANOMALIES.forEach((anomaly, c) => {
    const cx = colCX(c);

    // Selectable column background
    const bg = svgEl('rect', {
      x: colX(c) + 1, y: 1, width: COL_W - 2, height: VH - 2,
      fill: 'rgba(91,140,255,0)', stroke: 'rgba(124,140,255,0)',
      'stroke-width': 1, class: 'rw-col-bg',
      rx: c === 0 ? '11 0 0 11' : c === 2 ? '0 11 11 0' : '0',
    });
    svg.appendChild(bg);
    colBgs.push(bg);

    // Header
    svg.appendChild(svgEl('text', {
      x: cx, y: 22, class: 'rw-hdr-lbl', 'text-anchor': 'middle',
    }, anomaly.label));
    svg.appendChild(svgEl('text', {
      x: cx, y: 38, class: 'rw-hdr-sub', 'text-anchor': 'middle',
    }, anomaly.sub));

    // Header hit area for click
    const hit = svgEl('rect', {
      x: colX(c), y: 0, width: COL_W, height: HEADER_H,
      fill: 'transparent', cursor: 'pointer',
    });
    svg.appendChild(hit);
    colHits.push(hit);

    // Stage boxes
    const colStages: StageEls[] = [];
    const colArrows: SVGPathElement[] = [];
    const bx = colX(c) + BOX_PAD;

    anomaly.stages.forEach((s, i) => {
      const y = stageY(i);
      const k = KINDS[s.kindUnprotected];

      // Agent badge (top-left)
      svg.appendChild(svgEl('text', {
        x: bx + 4, y: y + 11, class: 'rw-agent',
      }, `[${s.agent}]`));

      // Box
      const box = svgEl('rect', {
        x: bx, y, width: BOX_W, height: STAGE_H, rx: 7,
        fill: k.fill, stroke: k.border, 'stroke-width': 1, class: 'rw-box',
      });
      svg.appendChild(box);

      // Stage name (top row)
      svg.appendChild(svgEl('text', {
        x: bx + 30, y: y + 12, class: 'rw-stage-name',
      }, s.name));

      // Status tag (middle)
      const tagEl = svgEl('text', {
        x: cx, y: y + 30, 'text-anchor': 'middle', class: 'rw-stage-tag rw-tag',
        fill: k.tagFill,
      }, s.tag);
      svg.appendChild(tagEl);

      // Note (bottom)
      const noteEl = svgEl('text', {
        x: cx, y: y + 44, 'text-anchor': 'middle', class: 'rw-stage-note rw-note',
      }, s.note);
      svg.appendChild(noteEl);

      colStages.push({ box, tag: tagEl, note: noteEl });

      // Arrow to next box
      if (i < STAGE_COUNT - 1) {
        const ay = y + STAGE_H;
        const ay2 = stageY(i + 1);
        const path = svgEl('path', {
          d: `M${cx},${ay + 1} L${cx},${ay2 - 1}`,
          class: 'rw-arrow',
        });
        const head = svgEl('path', {
          d: `M${cx - 4},${ay2 - 6} L${cx},${ay2 - 1} L${cx + 4},${ay2 - 6}`,
          class: 'rw-arrow-head', fill: 'rgba(124,140,255,.18)', stroke: 'none',
        });
        svg.appendChild(path);
        svg.appendChild(head);
        colArrows.push(path);
      }
    });

    stageEls.push(colStages);
    arrowEls.push(colArrows);
  });

  // ── Panel ────────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'rw-panel';
  panel.appendChild(panelDiv);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'rw-ctrl';

  const oriBtn = document.createElement('button');
  oriBtn.type = 'button';
  oriBtn.className = 'rw-ori-btn';
  oriBtn.setAttribute('aria-pressed', 'false');
  oriBtn.textContent = 'ORI Protected';

  const hint = document.createElement('span');
  hint.className = 'rw-hint';
  hint.textContent = 'tap a column to explore the anomaly';
  ctrlDiv.append(oriBtn, hint);
  controlsSlot.appendChild(ctrlDiv);

  // ── Caption ────────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'rw-cap';
  cap.textContent = 'Anomaly taxonomy: arXiv:2606.17182 · ORI / S-Bus: arXiv:2605.17076 · CoAgent: arXiv:2606.15376';
  caption.appendChild(cap);

  // ── State ─────────────────────────────────────────────────────────────────────
  let selectedCol = 0;
  let protected_ = false;

  function renderPanel() {
    panelDiv.innerHTML = '';
    const a = ANOMALIES[selectedCol]!;

    const hd = document.createElement('div');
    hd.className = 'rw-phd';
    hd.textContent = a.label;
    panelDiv.appendChild(hd);

    const desc = document.createElement('div');
    desc.className = 'rw-pdesc';
    desc.textContent = a.detail.desc;
    panelDiv.appendChild(desc);

    const hr = document.createElement('hr');
    hr.className = 'rw-hr';
    panelDiv.appendChild(hr);

    const props = document.createElement('div');
    props.className = 'rw-props';
    a.detail.props.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'rw-prop';
      const kEl = document.createElement('span');
      kEl.className = 'rw-pk';
      kEl.textContent = k;
      const vEl = document.createElement('span');
      vEl.className = 'rw-pv';
      vEl.textContent = v;
      row.append(kEl, vEl);
      props.appendChild(row);
    });
    panelDiv.appendChild(props);
  }

  function renderStages() {
    oriBtn.setAttribute('aria-pressed', String(protected_));
    oriBtn.textContent = protected_ ? '✓ ORI Protected' : 'ORI Protected';

    ANOMALIES.forEach((anomaly, c) => {
      colBgs[c]!.classList.toggle('rw-sel', c === selectedCol);

      anomaly.stages.forEach((s, i) => {
        const el = stageEls[c]![i]!;
        const kind = protected_ ? s.kindProtected : s.kindUnprotected;
        const k = KINDS[kind];
        const tag  = protected_ && s.tagProtected  ? s.tagProtected  : s.tag;
        const note = protected_ && s.noteProtected ? s.noteProtected : s.note;

        el.box.setAttribute('fill',   k.fill);
        el.box.setAttribute('stroke', k.border);
        el.tag.setAttribute('fill',   k.tagFill);
        el.tag.textContent = tag;
        el.note.textContent = note;

        const dim = c !== selectedCol ? '0.55' : '1';
        el.box.setAttribute('opacity', dim);
        el.tag.setAttribute('opacity', dim);
        el.note.setAttribute('opacity', dim);
      });

      arrowEls[c]!.forEach(a => {
        a.setAttribute('opacity', c !== selectedCol ? '0.35' : '1');
      });
    });
  }

  function selectCol(i: number) {
    selectedCol = i;
    renderStages();
    renderPanel();
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  const colHandlers: (() => void)[] = [];
  ANOMALIES.forEach((_, c) => {
    const fn = () => selectCol(c);
    colBgs[c]!.addEventListener('click', fn);
    colHits[c]!.addEventListener('click', fn);
    colHandlers.push(fn);
  });

  const oriHandler = () => {
    protected_ = !protected_;
    renderStages();
  };
  oriBtn.addEventListener('click', oriHandler);

  // Keyboard: left/right cycle columns; space toggles ORI
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); selectCol((selectedCol + 1) % 3); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); selectCol((selectedCol + 2) % 3); }
    else if (e.key === ' ') { e.preventDefault(); protected_ = !protected_; renderStages(); }
  };
  wrap.addEventListener('keydown', onKey);

  // Initial render
  selectCol(0);

  return () => {
    ANOMALIES.forEach((_, c) => {
      colBgs[c]!.removeEventListener('click', colHandlers[c]!);
      colHits[c]!.removeEventListener('click', colHandlers[c]!);
    });
    oriBtn.removeEventListener('click', oriHandler);
    wrap.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
