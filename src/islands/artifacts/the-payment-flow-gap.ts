/**
 * Artifact: the-payment-flow-gap — The Payment Flow Gap
 *
 * Three agentic payment protocol architectures shown as side-by-side stage flows:
 * AP2 (mandate-based, no escrow), TessPay (verify-then-pay + PoTE), and
 * On-Chain (ERC-4337 + smart contract escrow).
 *
 * Click a column to inspect the protocol. Toggle "Attack Mode" to see which
 * stages injection compromises and which remain protected.
 *
 * Numbers from arXiv:2601.22569, arXiv:2602.00213, arXiv:2602.06345.
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

// ─── Dimensions ───────────────────────────────────────────────────────────────
const VW = 900;
const VH = 330;
const HEADER_H = 54;
const STAGE_H = 48;
const STAGE_GAP = 4;
const STAGE_COUNT = 5;
const AXIS_W = 0;  // no left axis — stage name inside each box
const COL_W = (VW - AXIS_W) / 3;
const BOX_PAD = 14;
const BOX_W = COL_W - BOX_PAD * 2;

function stageY(i: number): number {
  return HEADER_H + i * (STAGE_H + STAGE_GAP);
}

function colX(c: number): number {
  return AXIS_W + c * COL_W;
}

function colCX(c: number): number {
  return colX(c) + COL_W / 2;
}

// ─── Data types ───────────────────────────────────────────────────────────────
type Status = 'injectable' | 'signed' | 'missing' | 'protected' | 'atomic' | 'premature' | 'bounded';

const STATUS: Record<Status, { border: string; fill: string; tag: string; attackFill?: string; attackBorder?: string }> = {
  injectable: { border: '#f87171', fill: 'rgba(248,113,113,0.08)', tag: 'INJECTABLE', attackFill: 'rgba(248,113,113,0.22)', attackBorder: '#f87171' },
  signed:     { border: '#5b8cff', fill: 'rgba(91,140,255,0.07)',  tag: 'SIGNED',     attackFill: 'rgba(91,140,255,0.07)',   attackBorder: '#5b8cff' },
  missing:    { border: '#3d4460', fill: 'rgba(61,68,96,0.04)',    tag: 'MISSING',    attackFill: 'rgba(248,113,113,0.10)', attackBorder: '#f87171' },
  premature:  { border: '#f5c451', fill: 'rgba(245,196,81,0.07)', tag: 'UNVERIFIED', attackFill: 'rgba(248,113,113,0.16)', attackBorder: '#f87171' },
  protected:  { border: '#22d3ee', fill: 'rgba(34,211,238,0.07)', tag: 'PROTECTED',  attackFill: 'rgba(34,211,238,0.07)',  attackBorder: '#22d3ee' },
  atomic:     { border: '#8b5cf6', fill: 'rgba(139,92,246,0.08)', tag: 'ATOMIC',     attackFill: 'rgba(139,92,246,0.08)',  attackBorder: '#8b5cf6' },
  bounded:    { border: '#8b5cf6', fill: 'rgba(139,92,246,0.06)', tag: 'BOUNDED',    attackFill: 'rgba(139,92,246,0.06)',  attackBorder: '#8b5cf6' },
};

interface StageInfo { status: Status; name: string; note: string }
interface ProtocolDef {
  id: string; label: string; sub: string;
  stages: StageInfo[];
  detail: { desc: string; props: [string, string][] };
}

const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'ap2', label: 'AP2', sub: 'Google Agent Payments',
    stages: [
      { status: 'injectable', name: 'INTENT',   note: 'LLM selects target — injectable'     },
      { status: 'signed',     name: 'MANDATE',  note: 'Ed25519 signed by user'              },
      { status: 'missing',    name: 'LOCK',     note: 'No escrow — paid at mandate'         },
      { status: 'premature',  name: 'EXECUTE',  note: 'Task runs, completion unverified'    },
      { status: 'premature',  name: 'SETTLE',   note: 'Payment cleared before execution'    },
    ],
    detail: {
      desc: 'Signed mandates authorize purchases within a scope. Payment flows when the mandate is presented — before task completion is verified. Simple injected product-listing text can redirect the purchase before the mandate is even constructed.',
      props: [
        ['Attack',   'Branded Whisper / Vault Whisper'],
        ['Surface',  'LLM context — pre-signature'],
        ['Replay fix', 'Nonce layer · ~3.8 ms @ 10k TPS'],
        ['Escrow',   'None'],
        ['Proof',    'None'],
        ['Paper',    'arXiv:2601.22569, 2602.06345'],
      ],
    },
  },
  {
    id: 'tesspay', label: 'TessPay', sub: 'Verify-Then-Pay',
    stages: [
      { status: 'injectable', name: 'INTENT',   note: 'LLM still injectable at intent'      },
      { status: 'signed',     name: 'MANDATE',  note: 'Verifiable mandate in registry'      },
      { status: 'protected',  name: 'LOCK',     note: 'Funds in PoTE-gated escrow'          },
      { status: 'protected',  name: 'EXECUTE',  note: 'TLS Notary or TEE receipt generated' },
      { status: 'protected',  name: 'SETTLE',   note: 'Released on PoTE verification only'  },
    ],
    detail: {
      desc: 'Funds held in escrow until the agent provides a Proof of Task Execution (PoTE). Injection at the intent layer can misdirect the task, but cannot cause payment for unverified work — escrow only releases when PoTE passes.',
      props: [
        ['Attack',  'Intent-layer injection (limited consequence)'],
        ['Surface', 'LLM context — PoTE gates payment outcome'],
        ['Escrow',  'PoTE-gated, chain-agnostic'],
        ['Proof',   'TLS Notary or TEE attestation'],
        ['Settle',  'Conditional on PoTE verification'],
        ['Paper',   'arXiv:2602.00213'],
      ],
    },
  },
  {
    id: 'onchain', label: 'On-Chain', sub: 'ERC-4337 + Escrow',
    stages: [
      { status: 'injectable', name: 'INTENT',   note: 'Agent translates intent → UserOp'    },
      { status: 'signed',     name: 'MANDATE',  note: 'Signed UserOperation to EntryPoint'  },
      { status: 'atomic',     name: 'LOCK',     note: 'Smart contract validates & holds'    },
      { status: 'bounded',    name: 'EXECUTE',  note: 'Contract policy bounds execution'    },
      { status: 'atomic',     name: 'SETTLE',   note: 'Atomic — same tx as execution'       },
    ],
    detail: {
      desc: 'Smart contract escrow provides atomicity and contract-enforced limits. Injection is bounded by the on-chain policy but not eliminated. Gas cost: < $0.01 on Base L2, $0.50–$5 on L1 — limiting micropayment viability.',
      props: [
        ['Attack',  'Intent injection (bounded by contract policy)'],
        ['Surface', 'LLM context — contract limits blast radius'],
        ['Escrow',  'Smart contract (atomic)'],
        ['Proof',   'On-chain tx receipt'],
        ['Settle',  'Atomic with execution'],
        ['Cost',    '< $0.01 on L2 · $0.50–$5 on L1'],
      ],
    },
  },
];

// ─── Main mount ───────────────────────────────────────────────────────────────
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // ── styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .pfg-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; overflow:hidden; }
    .pfg-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .pfg-col-bg { cursor:pointer; transition:fill .2s, stroke .2s; }
    .pfg-col-bg:hover { fill:rgba(91,140,255,0.06); }
    .pfg-col-bg.pfg-sel { fill:rgba(91,140,255,0.11); stroke:#5b8cff !important; }

    .pfg-proto-lbl { fill:#e7eaf3; font:700 12px 'Space Grotesk',system-ui,sans-serif; }
    .pfg-proto-sub { fill:#5b6378; font:500 8.5px 'JetBrains Mono',monospace; }

    .pfg-sep { stroke:rgba(124,140,255,.10); }

    .pfg-box { transition:fill .3s,stroke .3s; rx:7; }
    .pfg-stage-name { font:600 7.5px 'JetBrains Mono',monospace; letter-spacing:.08em;
      fill:#3d4460; transition:fill .3s; }
    .pfg-stage-tag  { font:700 9px 'JetBrains Mono',monospace; letter-spacing:.06em;
      transition:fill .3s; }
    .pfg-stage-note { font:500 7.5px 'Space Grotesk',system-ui,sans-serif; fill:#4a5268;
      transition:fill .3s; }

    .pfg-arrow { stroke:rgba(124,140,255,.20); fill:none; stroke-width:1.5;
      transition:stroke .3s; }
    .pfg-arrowhead { fill:rgba(124,140,255,.20); transition:fill .3s; }

    .pfg-bolt { fill:#f87171; font:900 12px sans-serif; pointer-events:none; }
    .pfg-bolt-ring { stroke:#f87171; fill:rgba(248,113,113,0.12);
      transition:opacity .3s; }

    /* Panel */
    .pfg-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .pfg-phead { font:700 11px 'Space Grotesk',system-ui,sans-serif; color:#e7eaf3;
      overflow-wrap:anywhere; }
    .pfg-pdesc { font:500 9.5px 'Space Grotesk',system-ui,sans-serif; color:#8d95ad;
      line-height:1.55; overflow-wrap:anywhere; min-width:0; }
    .pfg-hr { border:none; border-top:1px solid rgba(124,140,255,.10); margin:4px 0; }
    .pfg-props { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .pfg-prop { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:0 8px; }
    .pfg-pk { font:500 9px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .pfg-pv { font:500 9px 'JetBrains Mono',monospace; color:#9aa3bd;
      overflow-wrap:anywhere; min-width:0; }

    /* Controls */
    .pfg-ctrl { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .pfg-atk-btn {
      appearance:none; border:1px solid rgba(248,113,113,.35);
      background:rgba(248,113,113,.06); color:#fca5a5; border-radius:8px;
      font:500 10px 'JetBrains Mono',monospace; padding:7px 12px;
      cursor:pointer; transition:all .2s; white-space:nowrap; flex:none;
    }
    .pfg-atk-btn:hover { background:rgba(248,113,113,.14); border-color:#f87171; }
    .pfg-atk-btn[aria-pressed="true"] {
      background:rgba(248,113,113,.22); border-color:#f87171; color:#f87171; }
    .pfg-hint { font:500 9px 'JetBrains Mono',monospace; color:#3d4460;
      overflow-wrap:anywhere; min-width:0; }
    .pfg-cap { font:500 8.5px 'JetBrains Mono',monospace; color:#3d4460;
      overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  // ── SVG stage ────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'pfg-wrap';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Payment protocol flow diagram');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // Column separators
  for (let c = 1; c < 3; c++) {
    svg.appendChild(svgEl('line', {
      x1: colX(c), y1: 0, x2: colX(c), y2: VH, class: 'pfg-sep', 'stroke-width': 1,
    }));
  }

  // ── Protocol header columns (clickable) ──────────────────────────────────────
  const colBgs: SVGRectElement[] = [];
  const colHitAreas: SVGRectElement[] = [];

  PROTOCOLS.forEach((proto, c) => {
    const cx = colCX(c);

    // Selectable column background (full height)
    const bg = svgEl('rect', {
      x: colX(c) + 1, y: 1, width: COL_W - 2, height: VH - 2,
      fill: 'rgba(91,140,255,0.0)', stroke: 'rgba(124,140,255,.0)',
      'stroke-width': 1, rx: c === 0 ? '11 0 0 11' : c === 2 ? '0 11 11 0' : '0',
      class: 'pfg-col-bg',
    });
    svg.appendChild(bg);
    colBgs.push(bg);

    // Protocol label
    svg.appendChild(svgEl('text', {
      x: cx, y: 24, class: 'pfg-proto-lbl', 'text-anchor': 'middle',
    }, proto.label));
    svg.appendChild(svgEl('text', {
      x: cx, y: 40, class: 'pfg-proto-sub', 'text-anchor': 'middle',
    }, proto.sub));

    // Transparent hit area for the header
    const hit = svgEl('rect', {
      x: colX(c), y: 0, width: COL_W, height: HEADER_H,
      fill: 'transparent', cursor: 'pointer',
    });
    svg.appendChild(hit);
    colHitAreas.push(hit);
  });

  // ── Stage boxes + arrows ──────────────────────────────────────────────────────
  const boxEls: SVGRectElement[][] = [];
  const tagEls: SVGTextElement[][] = [];
  const noteEls: SVGTextElement[][] = [];
  const arrowEls: SVGPathElement[][] = [];
  const boltEls: (SVGCircleElement | null)[] = [];

  PROTOCOLS.forEach((proto, c) => {
    const boxes: SVGRectElement[] = [];
    const tags: SVGTextElement[] = [];
    const notes: SVGTextElement[] = [];
    const arrows: SVGPathElement[] = [];
    const cx = colCX(c);
    const bx = colX(c) + BOX_PAD;

    proto.stages.forEach((s, i) => {
      const y = stageY(i);
      const { border, fill, tag } = STATUS[s.status];

      // Box
      const box = svgEl('rect', {
        x: bx, y, width: BOX_W, height: STAGE_H, rx: 7,
        fill, stroke: border, 'stroke-width': 1, class: 'pfg-box',
      });
      svg.appendChild(box);
      boxes.push(box);

      // Stage name (top of box)
      svg.appendChild(svgEl('text', {
        x: cx, y: y + 12, 'text-anchor': 'middle', class: 'pfg-stage-name',
      }, s.name));

      // Status tag (middle)
      const tagEl = svgEl('text', {
        x: cx, y: y + 26, 'text-anchor': 'middle', class: 'pfg-stage-tag',
        fill: border,
      }, tag);
      svg.appendChild(tagEl);
      tags.push(tagEl);

      // Note (bottom)
      const noteEl = svgEl('text', {
        x: cx, y: y + 40, 'text-anchor': 'middle', class: 'pfg-stage-note',
      }, s.note);
      svg.appendChild(noteEl);
      notes.push(noteEl);

      // Arrow to next stage
      if (i < STAGE_COUNT - 1) {
        const ay = y + STAGE_H + 1;
        const ay2 = stageY(i + 1) - 1;
        const amx = cx;
        const aMid = (ay + ay2) / 2;
        const path = svgEl('path', {
          d: `M${amx},${ay} L${amx},${ay2}`,
          class: 'pfg-arrow',
        });
        svg.appendChild(path);
        // arrowhead
        const ahead = svgEl('path', {
          d: `M${amx - 4},${ay2 - 5} L${amx},${ay2} L${amx + 4},${ay2 - 5}`,
          fill: 'rgba(124,140,255,.20)', stroke: 'none',
          class: 'pfg-arrowhead',
        });
        svg.appendChild(ahead);
        void aMid; // used for layout ref only
        arrows.push(path);
      }
    });

    boxEls.push(boxes);
    tagEls.push(tags);
    noteEls.push(notes);
    arrowEls.push(arrows);

    // Injection bolt icon at INTENT stage (stage 0)
    // A small circle with ⚡ centered on the box's top-right corner
    const boltY = stageY(0) + 6;
    const boltX = colX(c) + COL_W - BOX_PAD - 8;
    const ring = svgEl('circle', {
      cx: boltX, cy: boltY, r: 9,
      class: 'pfg-bolt-ring', 'stroke-width': 1,
    });
    svg.appendChild(ring);
    svg.appendChild(svgEl('text', {
      x: boltX, y: boltY + 5, 'text-anchor': 'middle', class: 'pfg-bolt',
    }, '⚡'));
    boltEls.push(ring);
  });

  // ── Panel ────────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'pfg-panel';
  panel.appendChild(panelDiv);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'pfg-ctrl';

  const atkBtn = document.createElement('button');
  atkBtn.type = 'button';
  atkBtn.className = 'pfg-atk-btn';
  atkBtn.setAttribute('aria-pressed', 'false');
  atkBtn.textContent = '⚡ Attack Mode';

  const hint = document.createElement('span');
  hint.className = 'pfg-hint';
  hint.textContent = 'tap a column to compare protocols';
  ctrlDiv.append(atkBtn, hint);
  controlsSlot.appendChild(ctrlDiv);

  // ── Caption ───────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'pfg-cap';
  cap.textContent = 'arXiv:2601.22569 · arXiv:2602.00213 · arXiv:2602.06345';
  caption.appendChild(cap);

  // ── State ─────────────────────────────────────────────────────────────────────
  let selectedProto = 0;
  let attackMode = false;

  function renderPanel() {
    panelDiv.innerHTML = '';
    const proto = PROTOCOLS[selectedProto]!;
    const d = proto.detail;

    const head = document.createElement('div');
    head.className = 'pfg-phead';
    head.textContent = `${proto.label} — ${proto.sub}`;
    panelDiv.appendChild(head);

    const desc = document.createElement('div');
    desc.className = 'pfg-pdesc';
    desc.textContent = d.desc;
    panelDiv.appendChild(desc);

    const hr = document.createElement('hr');
    hr.className = 'pfg-hr';
    panelDiv.appendChild(hr);

    const props = document.createElement('div');
    props.className = 'pfg-props';
    d.props.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'pfg-prop';
      const kEl = document.createElement('span');
      kEl.className = 'pfg-pk';
      kEl.textContent = k;
      const vEl = document.createElement('span');
      vEl.className = 'pfg-pv';
      vEl.textContent = v;
      row.append(kEl, vEl);
      props.appendChild(row);
    });
    panelDiv.appendChild(props);
  }

  function renderStages() {
    atkBtn.setAttribute('aria-pressed', String(attackMode));

    PROTOCOLS.forEach((proto, c) => {
      const isSelected = c === selectedProto;
      colBgs[c]!.classList.toggle('pfg-sel', isSelected);

      // Bolt ring opacity: bright in attack mode, dim otherwise
      const bolt = boltEls[c];
      if (bolt) {
        bolt.style.opacity = attackMode ? '1' : '0.35';
      }

      proto.stages.forEach((s, i) => {
        const box = boxEls[c]![i]!;
        const tag = tagEls[c]![i]!;

        // In attack mode: injected stages glow, safe stages desaturate for non-selected columns
        const st = STATUS[s.status];
        const useAttack = attackMode;
        const fill   = useAttack ? (st.attackFill  ?? st.fill)   : st.fill;
        const border = useAttack ? (st.attackBorder ?? st.border) : st.border;

        box.setAttribute('fill',   fill);
        box.setAttribute('stroke', border);
        tag.setAttribute('fill',   border);

        // Dim non-selected columns slightly in attack mode
        const opacity = (attackMode && !isSelected) ? '0.60' : '1';
        box.setAttribute('opacity', opacity);
        tag.setAttribute('opacity', opacity);
        noteEls[c]![i]!.setAttribute('opacity', opacity);
      });

      // Arrows: dim non-selected in attack mode
      arrowEls[c]!.forEach((a) => {
        a.setAttribute('opacity', (attackMode && !isSelected) ? '0.40' : '1');
      });
    });
  }

  function selectProto(i: number) {
    selectedProto = i;
    renderStages();
    renderPanel();
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  const colHandlers: (() => void)[] = [];
  PROTOCOLS.forEach((_, c) => {
    const fn = () => selectProto(c);
    // Both the bg rect and the header hit area trigger selection
    colBgs[c]!.addEventListener('click', fn);
    colHitAreas[c]!.addEventListener('click', fn);
    colHandlers.push(fn);
  });

  const atkHandler = () => {
    attackMode = !attackMode;
    renderStages();
  };
  atkBtn.addEventListener('click', atkHandler);

  // Keyboard: left/right arrows cycle columns
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    selectProto((selectedProto + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3);
  };
  wrap.addEventListener('keydown', onKey);

  // Initial render
  selectProto(0);

  return () => {
    PROTOCOLS.forEach((_, c) => {
      colBgs[c]!.removeEventListener('click', colHandlers[c]!);
      colHitAreas[c]!.removeEventListener('click', colHandlers[c]!);
    });
    atkBtn.removeEventListener('click', atkHandler);
    wrap.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
