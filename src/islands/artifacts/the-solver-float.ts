/**
 * Artifact: the-solver-float — The Solver Float
 * Manifest: content/artifacts/the-solver-float/manifest.json
 *
 * Interactive SVG diagram of the ERC-7683 cross-chain intent lifecycle.
 * Five stages (Intent → Fill → Bundle → Challenge → Repayment) shown as
 * colour-coded nodes in a horizontal pipeline. Click / hover / arrow-key
 * to select a stage; the rail panel shows the contract call, struct fields,
 * timing, and gas estimate for that stage. A dashed bracket annotates the
 * ~2-hour period where solver capital is locked.
 */
import data from '../../../content/artifacts/the-solver-float/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

// SVG coordinate system
const VB_W = 800;
const VB_H = 370;
const NODE_W = 112;
const NODE_H = 70;
const NODE_Y = 148;
const NODE_XS = [68, 212, 356, 500, 644];

// Actor → design-token colour
const ACTOR_COLOR: Record<string, string> = {
  user:       '#5b8cff',
  solver:     '#22d3ee',
  dataworker: '#f59e42',
  oracle:     '#a78bfa',
  hubpool:    '#34d399',
};

function svgEl<K extends keyof SVGElementTagNameMap>(
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
    stageAspect: `${VB_W}/${VB_H}`,
    controls: false,
    caption: false,
  });
  const { stage, panel } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .sf-wrap { position:absolute; inset:0; overflow:hidden; }
    .sf-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .sf-caption { fill:#3b4568; font:500 11px 'JetBrains Mono',monospace; letter-spacing:.06em; }
    .sf-grid    { stroke:rgba(91,99,120,.12); }

    /* Stage node */
    .sf-node { cursor:pointer; outline:none; }
    .sf-node-bg {
      fill-opacity:.14; stroke-width:1.5; stroke-opacity:.5;
      transition:fill-opacity .2s, stroke-opacity .2s;
    }
    .sf-node.sf-on .sf-node-bg,
    .sf-node:focus-visible .sf-node-bg { fill-opacity:.36; stroke-opacity:1; }

    .sf-lbl  { fill:#c9cfdf; font:700 12.5px 'Space Grotesk',sans-serif;    pointer-events:none; }
    .sf-sub  { fill:#4a526b; font:500 10px 'JetBrains Mono',monospace;      pointer-events:none; transition:fill .2s; }
    .sf-node.sf-on .sf-sub,
    .sf-node:focus-visible .sf-sub { fill:#8d95ad; }

    .sf-badge-bg { fill-opacity:.22; transition:fill-opacity .2s; }
    .sf-badge-txt { font:600 10px 'JetBrains Mono',monospace; pointer-events:none; }

    /* Arrows */
    .sf-arr { stroke:#252d48; stroke-width:1.5; fill:none; marker-end:url(#sf-mk); }
    .sf-arr-lbl { font:500 9.5px 'JetBrains Mono',monospace; fill:#2e3755; text-anchor:middle; }

    /* Capital-locked bracket */
    .sf-float { stroke:#22d3ee; stroke-width:1; stroke-dasharray:4 3; fill:none; opacity:.4; }
    .sf-float-lbl { font:500 9.5px 'JetBrains Mono',monospace; fill:#22d3ee; opacity:.55; text-anchor:middle; }

    /* Stage-number badge (small circle, top-left of node) */
    .sf-num { font:700 8.5px 'JetBrains Mono',monospace; fill:#d0d6e8; text-anchor:middle; pointer-events:none; }

    /* Legend row */
    .sf-legend { font:500 9.5px 'JetBrains Mono',monospace; fill:#2e3755; }

    /* Detail panel */
    .sf-detail {
      display:flex; flex-direction:column; gap:9px; height:100%;
      box-sizing:border-box; padding:14px 15px;
      border-radius:10px; background:#0d1322;
      border:1px solid rgba(124,140,255,.17); min-width:0;
    }
    .sf-d-head { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; min-width:0; }
    .sf-d-num  { font:700 11px 'JetBrains Mono',monospace; color:#3b4568; flex:none; }
    .sf-d-name { font:700 14.5px 'Space Grotesk',sans-serif; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .sf-d-actor{ font:500 10.5px 'JetBrains Mono',monospace; letter-spacing:.07em; }
    .sf-d-contract {
      font:500 11px 'JetBrains Mono',monospace; color:#8d95ad;
      background:#111827; border-radius:5px; padding:5px 8px;
      overflow-wrap:anywhere; min-width:0;
    }
    .sf-d-fields { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .sf-d-field {
      font:500 10.5px 'JetBrains Mono',monospace; color:#4a526b;
      padding-left:10px; position:relative; overflow-wrap:anywhere; min-width:0;
    }
    .sf-d-field::before { content:'·'; position:absolute; left:1px; color:#2e3755; }
    .sf-d-note {
      font:400 12px Inter,sans-serif; color:#7a8499; overflow-wrap:anywhere;
      border-left:2px solid rgba(124,140,255,.2); padding-left:8px; min-width:0;
    }
    .sf-d-gas {
      font:500 10.5px 'JetBrains Mono',monospace; color:#3b4568;
      margin-top:auto; min-width:0; overflow-wrap:anywhere;
    }
    .sf-d-gas span { color:#5b6378; }
  `;
  stage.appendChild(style);

  // ── SVG ───────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'sf-wrap';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': 'ERC-7683 cross-chain intent lifecycle diagram',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // Arrowhead marker
  const defs = svgEl('defs');
  const mk = svgEl('marker', {
    id: 'sf-mk', markerWidth: 7, markerHeight: 7,
    refX: 6, refY: 3, orient: 'auto',
  });
  mk.appendChild(svgEl('path', { d: 'M0,0 L0,6 L7,3 Z', fill: '#252d48' }));
  defs.appendChild(mk);
  svg.appendChild(defs);

  // Title
  svg.appendChild(svgEl('text', { x: 20, y: 24, class: 'sf-caption' },
    'ERC-7683 CROSS-CHAIN INTENT LIFECYCLE'));

  // Subtle horizontal centre guide
  svg.appendChild(svgEl('line', {
    x1: 20, y1: NODE_Y, x2: VB_W - 20, y2: NODE_Y, class: 'sf-grid',
  }));

  // Inter-node arrows with timing labels
  const timings = ['~8 s', '~30 min', '~2 hr', ''];
  for (let i = 0; i < 4; i++) {
    const x1 = NODE_XS[i]! + NODE_W / 2 + 5;
    const x2 = NODE_XS[i + 1]! - NODE_W / 2 - 5;
    svg.appendChild(svgEl('line', {
      x1, y1: NODE_Y, x2, y2: NODE_Y, class: 'sf-arr',
    }));
    if (timings[i]) {
      svg.appendChild(svgEl('text', {
        x: (x1 + x2) / 2, y: NODE_Y - 10, class: 'sf-arr-lbl',
      }, timings[i]!));
    }
  }

  // "Solver capital locked" bracket (from Fill=1 to Repayment=4)
  const bx1 = NODE_XS[1]! - NODE_W / 2 + 4;
  const bx2 = NODE_XS[4]! + NODE_W / 2 - 4;
  const by  = NODE_Y + NODE_H / 2 + 20;
  [
    `M${bx1},${by - 7} L${bx1},${by} L${bx2},${by} L${bx2},${by - 7}`,
  ].forEach(d => svg.appendChild(svgEl('path', { d, class: 'sf-float' })));
  svg.appendChild(svgEl('text', {
    x: (bx1 + bx2) / 2, y: by + 14, class: 'sf-float-lbl',
  }, 'solver capital locked  ·  ~2 hours until repayment'));

  // Legend row
  const legendItems: [string, string][] = [
    ['user', 'User'], ['solver', 'Relayer'], ['dataworker', 'Dataworker'],
    ['oracle', 'UMA Oracle'], ['hubpool', 'HubPool'],
  ];
  let lx = 20;
  const legendY = VB_H - 20;
  for (const [key, label] of legendItems) {
    const c = ACTOR_COLOR[key]!;
    svg.appendChild(svgEl('circle', { cx: lx + 4, cy: legendY, r: 4, fill: c, opacity: '.65' }));
    svg.appendChild(svgEl('text', {
      x: lx + 13, y: legendY + 4, class: 'sf-legend',
    }, label));
    lx += 13 + label.length * 6.4 + 18;
  }

  // Stage nodes
  const nodes: SVGGElement[] = [];
  data.stages.forEach((s, i) => {
    const cx  = NODE_XS[i]!;
    const cy  = NODE_Y;
    const col = ACTOR_COLOR[s.actorColor] ?? '#5b8cff';
    const g   = svgEl('g', {
      class: 'sf-node', tabindex: '0', role: 'button',
      'aria-label': `Stage ${i + 1}: ${s.label}, ${s.timingShort}`,
    });
    (g as SVGGElement & { dataset: DOMStringMap }).dataset.idx = String(i);

    // Background rect
    g.appendChild(svgEl('rect', {
      x: cx - NODE_W / 2, y: cy - NODE_H / 2,
      width: NODE_W, height: NODE_H, rx: 9,
      class: 'sf-node-bg', fill: col, stroke: col,
    }));

    // Stage number badge (top-left)
    const nbx = cx - NODE_W / 2 + 11;
    const nby = cy - NODE_H / 2 + 11;
    g.appendChild(svgEl('circle', { cx: nbx, cy: nby, r: 7.5, fill: col, opacity: '.55' }));
    g.appendChild(svgEl('text', { x: nbx, y: nby + 3.5, class: 'sf-num' }, String(i + 1)));

    // Label
    g.appendChild(svgEl('text', {
      x: cx, y: cy - 7, 'text-anchor': 'middle', class: 'sf-lbl',
    }, s.label));

    // Sublabel (actor role)
    g.appendChild(svgEl('text', {
      x: cx, y: cy + 10, 'text-anchor': 'middle', class: 'sf-sub',
    }, s.sublabel));

    // Timing badge at node bottom
    const bw = Math.max(54, s.timingShort.length * 7.4 + 16);
    g.appendChild(svgEl('rect', {
      x: cx - bw / 2, y: cy + NODE_H / 2 - 19,
      width: bw, height: 16, rx: 4,
      class: 'sf-badge-bg', fill: col,
    }));
    g.appendChild(svgEl('text', {
      x: cx, y: cy + NODE_H / 2 - 7,
      'text-anchor': 'middle', class: 'sf-badge-txt', fill: col,
    }, s.timingShort));

    svg.appendChild(g);
    nodes.push(g);
  });

  // ── Detail panel (HTML) ───────────────────────────────────────────────────
  const det = document.createElement('div');
  det.className = 'sf-detail';

  const dHead   = document.createElement('div'); dHead.className = 'sf-d-head';
  const dNum    = document.createElement('span'); dNum.className = 'sf-d-num';
  const dName   = document.createElement('span'); dName.className = 'sf-d-name';
  dHead.append(dNum, dName);

  const dActor    = document.createElement('div'); dActor.className    = 'sf-d-actor';
  const dContract = document.createElement('div'); dContract.className = 'sf-d-contract';
  const dFields   = document.createElement('div'); dFields.className   = 'sf-d-fields';
  const dNote     = document.createElement('div'); dNote.className     = 'sf-d-note';
  const dGas      = document.createElement('div'); dGas.className      = 'sf-d-gas';

  det.append(dHead, dActor, dContract, dFields, dNote, dGas);
  panel.appendChild(det);

  // ── Selection ─────────────────────────────────────────────────────────────
  let selected = -1;
  function select(i: number): void {
    if (i === selected) return;
    selected = i;
    nodes.forEach((n, j) => n.classList.toggle('sf-on', j === i));

    const s   = data.stages[i]!;
    const col = ACTOR_COLOR[s.actorColor] ?? '#5b8cff';

    dNum.textContent     = `0${i + 1}`;
    dName.textContent    = s.label;
    dActor.textContent   = s.actor;
    dActor.style.color   = col;
    dContract.textContent = s.contract;
    dNote.textContent    = s.note;
    dGas.innerHTML       = `gas: <span>${s.gasEst}</span>`;

    dFields.innerHTML = '';
    for (const f of s.keyFields) {
      const fd = document.createElement('div');
      fd.className = 'sf-d-field';
      fd.textContent = f;
      dFields.appendChild(fd);
    }
  }
  select(0);

  // ── Interaction ───────────────────────────────────────────────────────────
  let userTouched = false;

  const nodeOf = (e: Event) =>
    (e.target as Element).closest<SVGGElement>('.sf-node');

  const onOver = (e: Event) => {
    const n = nodeOf(e);
    if (n) { userTouched = true; select(Number(n.dataset['idx'])); }
  };
  const onKey = (e: KeyboardEvent) => {
    const n = nodeOf(e);
    if (!n) return;
    const i = Number(n.dataset['idx']);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); userTouched = true; select(i);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); userTouched = true;
      const next = (i + (e.key === 'ArrowRight' ? 1 : nodes.length - 1)) % nodes.length;
      nodes[next]!.focus();
      select(next);
    }
  };

  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('click', onOver);
  svg.addEventListener('keydown', onKey);

  // Idle tour
  const tour = setInterval(() => {
    if (document.hidden || userTouched) return;
    select((selected + 1) % nodes.length);
  }, 4000);

  return () => {
    clearInterval(tour);
    svg.removeEventListener('pointerover', onOver);
    svg.removeEventListener('click', onOver);
    svg.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
