/**
 * Artifact: the-slashable-inference — The Slashable Inference
 * Manifest: content/artifacts/the-slashable-inference/manifest.json
 *
 * Interactive SVG diagram of the EigenAI challenge protocol lifecycle.
 * Stage: vertical flow diagram showing happy path (left) and dispute path (right).
 * Panel: details about the currently active step.
 * Controls: Next Step / Trigger Challenge / Reset buttons.
 * Data: content/artifacts/the-slashable-inference/data.json
 */
import data from '../../../content/artifacts/the-slashable-inference/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Step = (typeof data.steps)[number];

/* ── colour tokens ────────────────────────────────────────────────────────── */
const C = {
  bg:       '#0b1120',
  border:   'rgba(124,140,255,.15)',
  dim:      'rgba(124,140,255,.08)',
  text:     '#cdd3e3',
  sub:      '#5b6378',
  accent:   '#7c8cff',
  happy:    '#4ade80',
  slash:    '#f87171',
  warn:     '#fbbf24',
  active:   '#7c8cff',
  arrow:    '#3d4459',
};

/* ── layout constants ─────────────────────────────────────────────────────── */
const VW  = 480;
const VH  = 640;

/* Two column centres */
const CX_LEFT  = 120;   // happy path column
const CX_RIGHT = 360;   // dispute path column

/* Node geometry */
const NW = 130;   // node box width
const NH = 44;    // node box height
const NR = 7;     // corner radius

/* Vertical positions of each node */
const Y: Record<string, number> = {
  request:   42,
  execute:   126,
  commit:    210,
  window:    294,
  settle:    386,    // left fork
  challenge: 386,    // right fork
  reexecute: 460,
  check:     530,
  slash:     598,    // left split of check
  clear:     598,    // right split of check (reuse same row offset via x)
};

/* slash / clear horizontal offset from dispute column */
const SLASH_X = CX_RIGHT - 70;
const CLEAR_X = CX_RIGHT + 70;

/* ── step sequence ────────────────────────────────────────────────────────── */
// Two playable paths:
//  Happy:   request → execute → commit → window → settle
//  Dispute: request → execute → commit → window → challenge → reexecute → check → slash | clear
const HAPPY_SEQ   = ['request', 'execute', 'commit', 'window', 'settle'];
const DISPUTE_SEQ = ['request', 'execute', 'commit', 'window', 'challenge', 'reexecute', 'check', 'slash'];

/* look up step object by id */
const byId = new Map<string, Step>(data.steps.map(s => [s.id, s]));

/* ── helpers ──────────────────────────────────────────────────────────────── */
function el<T extends SVGElement>(tag: string): T {
  return document.createElementNS(NS, tag) as T;
}
function setAttr(e: SVGElement, attrs: Record<string, string | number>) {
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
}
function text(cls: string, x: number, y: number, content: string): SVGTextElement {
  const t = el<SVGTextElement>('text');
  setAttr(t, { class: cls, x, y });
  t.textContent = content;
  return t;
}

/* ── Mount ────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls: ctlsSlot, caption } = layout;

  /* ── styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .si-stage { display:flex; align-items:center; justify-content:center; height:100%; }
    .si-stage svg { display:block; width:100%; height:100%; }

    .si-node { transition: fill .25s, stroke .25s, opacity .25s; cursor:default; }
    .si-node-txt {
      font:700 9px/1 'JetBrains Mono',monospace;
      text-anchor:middle; dominant-baseline:middle;
      pointer-events:none; transition:fill .25s;
    }
    .si-node-sub {
      font:500 7.5px/1 'JetBrains Mono',monospace;
      text-anchor:middle; dominant-baseline:middle;
      pointer-events:none; transition:fill .25s;
    }
    .si-arrow { transition: stroke .25s, opacity .25s; }
    .si-col-hdr {
      font:600 8px/1 'JetBrains Mono',monospace;
      text-anchor:middle; letter-spacing:.1em; text-transform:uppercase;
    }
    .si-fork-badge {
      font:600 7px/1 'JetBrains Mono',monospace;
      text-anchor:middle; dominant-baseline:middle; letter-spacing:.04em;
    }

    .si-panel {
      display:flex; flex-direction:column; gap:8px;
      font:500 10px/1.45 'JetBrains Mono',monospace; color:#8d95ad;
      padding:4px 0; min-width:0;
    }
    .si-ptitle {
      font:700 12px/1.3 'JetBrains Mono',monospace; color:#e7eaf3;
      min-width:0; overflow-wrap:anywhere;
    }
    .si-pbadge {
      display:inline-flex; align-items:center; gap:4px;
      font:700 7px 'JetBrains Mono',monospace; letter-spacing:.08em;
      text-transform:uppercase; padding:2px 7px; border-radius:4px; flex:0 0 auto;
    }
    .si-prow { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .si-prowh { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
    .si-plabel { font:600 8.5px 'JetBrains Mono',monospace; color:#4d5570; letter-spacing:.08em; text-transform:uppercase; }
    .si-pval  { font:500 9.5px/1.4 'JetBrains Mono',monospace; color:#9ea7be; min-width:0; overflow-wrap:anywhere; }
    .si-pdiv  { height:1px; background:rgba(124,140,255,.1); flex:0 0 auto; }
    .si-pdetail { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .si-pempty { font:500 10px 'JetBrains Mono',monospace; color:#4d5570; text-align:center; padding:16px 0; }

    .si-ctls { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .si-btnrow { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .si-btn {
      border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad;
      font:600 9px 'JetBrains Mono',monospace; letter-spacing:.04em;
      padding:6px 11px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .si-btn:hover:not(:disabled) { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .si-btn:disabled { opacity:.35; cursor:default; }
    .si-btn.si-primary {
      background:rgba(124,140,255,.12); color:#a5b0ff;
      border-color:rgba(124,140,255,.45);
    }
    .si-btn.si-primary:hover:not(:disabled) {
      background:rgba(124,140,255,.2); color:#c5ccff;
    }
    .si-btn.si-danger {
      border-color:rgba(248,113,113,.35); color:#f87171;
      background:rgba(248,113,113,.07);
    }
    .si-btn.si-danger:hover:not(:disabled) { background:rgba(248,113,113,.14); }
    .si-hint { font:500 8px/1.4 'JetBrains Mono',monospace; color:#3d4459; min-width:0; overflow-wrap:anywhere; }
  `;
  container.appendChild(style);
  stage.classList.add('si-stage');

  /* ── SVG ── */
  const svg = el<SVGSVGElement>('svg');
  setAttr(svg, { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet' });
  stage.appendChild(svg);

  /* column header labels */
  const colHdrLeft  = text('si-col-hdr', CX_LEFT,  18, 'HAPPY PATH');
  const colHdrRight = text('si-col-hdr', CX_RIGHT, 18, 'DISPUTE PATH');
  svg.appendChild(colHdrLeft);
  svg.appendChild(colHdrRight);

  /* vertical divider */
  const divider = el<SVGLineElement>('line');
  setAttr(divider, { x1: VW / 2, y1: 28, x2: VW / 2, y2: VH - 10,
    stroke: 'rgba(124,140,255,.08)', 'stroke-width': 1, 'stroke-dasharray': '4 6' });
  svg.appendChild(divider);

  /* ── build nodes ── */
  // Shared nodes (both paths): request, execute, commit, window
  // Happy-only: settle
  // Dispute-only: challenge, reexecute, check, slash, clear
  type NodeInfo = { cx: number; y: number; color: string };
  const nodePositions = new Map<string, NodeInfo>([
    ['request',   { cx: VW / 2,   y: Y.request,   color: C.accent  }],
    ['execute',   { cx: VW / 2,   y: Y.execute,   color: C.accent  }],
    ['commit',    { cx: VW / 2,   y: Y.commit,    color: C.accent  }],
    ['window',    { cx: VW / 2,   y: Y.window,    color: C.warn    }],
    ['settle',    { cx: CX_LEFT,  y: Y.settle,    color: C.happy   }],
    ['challenge', { cx: CX_RIGHT, y: Y.challenge,  color: C.slash   }],
    ['reexecute', { cx: CX_RIGHT, y: Y.reexecute, color: C.accent  }],
    ['check',     { cx: CX_RIGHT, y: Y.check,     color: C.warn    }],
    ['slash',     { cx: SLASH_X,  y: Y.slash,     color: C.slash   }],
    ['clear',     { cx: CLEAR_X,  y: Y.clear,     color: C.happy   }],
  ]);

  type NodeEls = { rect: SVGRectElement; label: SVGTextElement; sub: SVGTextElement };
  const nodeEls = new Map<string, NodeEls>();

  for (const [id, pos] of nodePositions) {
    const step = byId.get(id)!;
    const nx = pos.cx - NW / 2;
    const ny = pos.y;

    const rect = el<SVGRectElement>('rect');
    setAttr(rect, { class: 'si-node', x: nx, y: ny, width: NW, height: NH, rx: NR,
      fill: C.dim, stroke: C.border, 'stroke-width': 1.5 });
    svg.appendChild(rect);

    const label = text('si-node-txt', pos.cx, ny + NH * 0.38, step.label);
    label.setAttribute('fill', C.sub);
    svg.appendChild(label);

    const sub = text('si-node-sub', pos.cx, ny + NH * 0.7, step.actor);
    sub.setAttribute('fill', C.sub);
    svg.appendChild(sub);

    nodeEls.set(id, { rect, label, sub });
  }

  /* ── arrows ── */
  type ArrowDef = { from: string; to: string; label?: string; side?: 'left' | 'right' };
  const arrowDefs: ArrowDef[] = [
    { from: 'request',   to: 'execute' },
    { from: 'execute',   to: 'commit' },
    { from: 'commit',    to: 'window' },
    { from: 'window',    to: 'settle',    label: 'no challenge', side: 'left'  },
    { from: 'window',    to: 'challenge', label: 'challenged',   side: 'right' },
    { from: 'challenge', to: 'reexecute' },
    { from: 'reexecute', to: 'check' },
    { from: 'check',     to: 'slash',     label: '≠ mismatch',  side: 'left'  },
    { from: 'check',     to: 'clear',     label: '= match',     side: 'right' },
  ];

  type ArrowEls = { path: SVGPathElement; badge?: SVGTextElement };
  const arrowEls = new Map<string, ArrowEls>();

  function arrowKey(a: ArrowDef): string { return `${a.from}->${a.to}`; }

  function arrowPath(fromId: string, toId: string): string {
    const fp = nodePositions.get(fromId)!;
    const tp = nodePositions.get(toId)!;
    const x1 = fp.cx, y1 = fp.y + NH;
    const x2 = tp.cx, y2 = tp.y;

    if (x1 === x2) {
      // straight vertical
      const ym = (y1 + y2) / 2;
      return `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`;
    }
    // diagonal fork
    return `M${x1},${y1} C${x1},${y1 + 28} ${x2},${y2 - 28} ${x2},${y2}`;
  }

  for (const a of arrowDefs) {
    const p = el<SVGPathElement>('path');
    setAttr(p, { class: 'si-arrow', fill: 'none', stroke: C.arrow,
      'stroke-width': 1.5, 'stroke-linecap': 'round',
      d: arrowPath(a.from, a.to) });
    svg.appendChild(p);

    let badge: SVGTextElement | undefined;
    if (a.label) {
      const fp = nodePositions.get(a.from)!;
      const tp = nodePositions.get(a.to)!;
      const bx = (fp.cx + tp.cx) / 2;
      const by = (fp.y + NH + tp.y) / 2;
      badge = text('si-fork-badge', bx, by, a.label);
      badge.setAttribute('fill', C.sub);
      svg.appendChild(badge);
    }
    arrowEls.set(arrowKey(a), { path: p, badge });
  }

  /* ── state machine ── */
  type Mode = 'happy' | 'dispute';
  let mode: Mode   = 'happy';
  let cursor       = 0;  // index into active sequence
  let seq          = HAPPY_SEQ;
  let disputeForked = false;

  /* track which arrows to highlight */
  function arrowId(from: string, to: string) { return `${from}->${to}`; }

  function activeArrows(): Set<string> {
    const s = new Set<string>();
    for (let i = 0; i < cursor; i++) {
      if (seq[i + 1]) s.add(arrowId(seq[i], seq[i + 1]));
    }
    return s;
  }

  function render() {
    const activeId = seq[cursor] ?? '';
    const active   = activeArrows();

    for (const [id, els] of nodeEls) {
      const pos    = nodePositions.get(id)!;
      const isPast = seq.slice(0, cursor).includes(id);
      const isCur  = id === activeId;
      const isFuture = !isPast && !isCur;

      /* decide node colour */
      let fill   = C.dim;
      let stroke = C.border;
      let txFill = C.sub;

      if (isCur) {
        const step = byId.get(id)!;
        const pathColor = id === 'settle' ? C.happy
                        : id === 'slash'  ? C.slash
                        : id === 'clear'  ? C.happy
                        : id === 'window' || id === 'check' ? C.warn
                        : C.active;
        fill   = `${pathColor}18`;
        stroke = `${pathColor}88`;
        txFill = pathColor;
      } else if (isPast) {
        fill   = 'rgba(124,140,255,.06)';
        stroke = 'rgba(124,140,255,.22)';
        txFill = '#8d95ad';
      }

      /* dim nodes not on current path */
      const onPath = seq.includes(id) ||
        (id === 'clear' && mode === 'dispute' && cursor >= seq.indexOf('check'));
      const opacity = onPath ? 1 : 0.25;

      els.rect.setAttribute('fill',    fill);
      els.rect.setAttribute('stroke',  stroke);
      els.rect.setAttribute('opacity', String(opacity));
      els.label.setAttribute('fill',   txFill);
      els.label.setAttribute('opacity', String(opacity));
      els.sub.setAttribute('opacity',  String(opacity));
    }

    /* arrow highlights */
    for (const [key, els] of arrowEls) {
      const isActive = active.has(key);
      const onPath   = arrowDefs.some(a => arrowKey(a) === key && seq.includes(a.from) && seq.includes(a.to));
      els.path.setAttribute('stroke', isActive ? C.accent : C.arrow);
      els.path.setAttribute('stroke-width', isActive ? '2' : '1.5');
      els.path.setAttribute('opacity', onPath ? '1' : '0.2');
      if (els.badge) els.badge.setAttribute('opacity', onPath ? '1' : '0.2');
    }

    /* panel */
    updatePanel(activeId);

    /* buttons */
    const atEnd = cursor >= seq.length - 1;
    nextBtn.disabled  = atEnd;
    forkBtn.disabled  = !(seq[cursor] === 'window' && !disputeForked);
    resetBtn.disabled = cursor === 0 && mode === 'happy';
  }

  /* ── panel ── */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'si-panel';
  panel.appendChild(panelDiv);

  function badgeColor(id: string): [string, string] {
    if (id === 'settle' || id === 'clear') return ['#4ade80', 'rgba(74,222,128,.12)'];
    if (id === 'slash')  return ['#f87171', 'rgba(248,113,113,.12)'];
    if (id === 'window' || id === 'check') return ['#fbbf24', 'rgba(251,191,36,.1)'];
    return ['#7c8cff', 'rgba(124,140,255,.12)'];
  }

  function updatePanel(id: string) {
    panelDiv.innerHTML = '';
    if (!id) {
      panelDiv.innerHTML = '<div class="si-pempty">Press Next Step to begin</div>';
      return;
    }
    const step = byId.get(id);
    if (!step) return;

    const [bc, bbg] = badgeColor(id);
    const title = document.createElement('div');
    title.className = 'si-ptitle';
    title.textContent = step.label;
    panelDiv.appendChild(title);

    const row0 = document.createElement('div');
    row0.className = 'si-prowh';
    const badge = document.createElement('span');
    badge.className = 'si-pbadge';
    badge.style.cssText = `color:${bc};background:${bbg};border:1px solid ${bc}44`;
    badge.textContent = step.path.toUpperCase();
    row0.appendChild(badge);
    panelDiv.appendChild(row0);

    const divider1 = document.createElement('div');
    divider1.className = 'si-pdiv';
    panelDiv.appendChild(divider1);

    function row(label: string, val: string) {
      const r = document.createElement('div');
      r.className = 'si-prow';
      r.innerHTML = `<div class="si-plabel">${label}</div><div class="si-pval">${val}</div>`;
      panelDiv.appendChild(r);
    }

    row('ACTOR', step.actor);
    row('ACTION', step.action);
    row('DATA FLOW', step.dataFlow);
    if (step.stake) row('STAKE', step.stake);

    const divider2 = document.createElement('div');
    divider2.className = 'si-pdiv';
    panelDiv.appendChild(divider2);

    const detail = document.createElement('div');
    detail.className = 'si-pdetail';
    detail.textContent = step.detail;
    panelDiv.appendChild(detail);
  }

  /* ── controls ── */
  const ctlsDiv = document.createElement('div');
  ctlsDiv.className = 'si-ctls';

  const btnRow = document.createElement('div');
  btnRow.className = 'si-btnrow';

  const nextBtn  = document.createElement('button');
  nextBtn.className = 'si-btn si-primary';
  nextBtn.textContent = 'Next Step →';

  const forkBtn  = document.createElement('button');
  forkBtn.className = 'si-btn si-danger';
  forkBtn.textContent = 'Trigger Challenge';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'si-btn';
  resetBtn.textContent = 'Reset';

  btnRow.append(nextBtn, forkBtn, resetBtn);

  const hint = document.createElement('div');
  hint.className = 'si-hint';
  hint.textContent = 'Step through the protocol — at the WINDOW state, choose the challenge path or let it settle.';

  ctlsDiv.append(btnRow, hint);
  ctlsSlot.appendChild(ctlsDiv);

  /* ── caption ── */
  const cap = document.createElement('div');
  cap.style.cssText = 'font:500 8px/1.4 "JetBrains Mono",monospace;color:#3d4459;';
  cap.textContent = 'Protocol parameters: 32 ETH operator stake · 32 ETH watcher bond · 24h challenge window · ⅓ burned / ⅔ to challenger on slash';
  caption.appendChild(cap);

  /* ── event handlers ── */
  nextBtn.addEventListener('click', () => {
    if (cursor < seq.length - 1) {
      cursor++;
      render();
    }
  });

  forkBtn.addEventListener('click', () => {
    if (seq[cursor] !== 'window') return;
    mode = 'dispute';
    seq  = DISPUTE_SEQ;
    cursor = seq.indexOf('window');
    disputeForked = true;
    cursor++;   // advance past window to challenge
    render();
  });

  resetBtn.addEventListener('click', () => {
    mode          = 'happy';
    seq           = HAPPY_SEQ;
    cursor        = 0;
    disputeForked = false;
    render();
  });

  /* initial render */
  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
