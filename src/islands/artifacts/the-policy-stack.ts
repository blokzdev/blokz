/**
 * Artifact: the-policy-stack — The Policy Stack
 * Manifest: content/artifacts/the-policy-stack/manifest.json
 *
 * Four guardrail tiers for on-chain AI agents, from probabilistic classifiers
 * to Lean 4 formal verification. Select an attack scenario to see which tier
 * catches it — and which ones let it through.
 *
 * Stage: SVG flow diagram (4 layer boxes, downward arrows, status circles).
 * Panel: per-layer verdict table for the selected scenario.
 * Controls: 5 scenario tabs.
 * Data: content/artifacts/the-policy-stack/data.json
 */
import data from '../../../content/artifacts/the-policy-stack/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Layer = (typeof data.layers)[number];
type Scenario = (typeof data.scenarios)[number];
type Result = Scenario['results'][number];
type Verdict = 'caught' | 'missed' | 'partial';

const VERDICT = {
  caught:  { color: '#4ade80', symbol: '✓', label: 'CAUGHT'  },
  missed:  { color: '#f87171', symbol: '✗', label: 'MISSED'  },
  partial: { color: '#fbbf24', symbol: '⚠', label: 'PARTIAL' },
} as const;

/* ── SVG coordinate constants ──────────────────────────────────────────────── */
const VW = 480;
const LX = 18;           // layer rect left x
const LW = VW - 36;      // layer rect width = 444
const LH = 72;           // layer rect height
const GAP = 20;          // vertical gap between layer boxes (for arrows)
const L0Y = 52;          // top y of first layer

function layerTop(i: number): number { return L0Y + i * (LH + GAP); }

const VH = layerTop(data.layers.length - 1) + LH + 56; // 52 + 3*92 + 72 + 56 = 456

/* right-side verdict circle center x */
const VC_X = LX + LW - 28;

/* ── Mount ─────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls: ctlsSlot, caption } = layout;

  /* ── Styles ──────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .ps-stage { display:flex; align-items:center; justify-content:center; }
    .ps-stage svg { width:100%; height:100%; display:block; }

    .ps-rect {
      fill:#0d1322; stroke:rgba(124,140,255,.18); stroke-width:1.5;
      transition: fill .25s, stroke .25s;
    }
    .ps-rect.ps-c  { stroke:rgba(74,222,128,.55);  fill:rgba(74,222,128,.04);  }
    .ps-rect.ps-m  { stroke:rgba(248,113,113,.35); }
    .ps-rect.ps-p  { stroke:rgba(251,191,36,.45);  fill:rgba(251,191,36,.03);  }

    .ps-vcirc { transition: fill .25s, stroke .25s; }
    .ps-vsym  {
      font:700 12px/1 'JetBrains Mono',monospace;
      text-anchor:middle; dominant-baseline:middle;
      transition: fill .25s;
    }
    .ps-lname { font:700 12px/1 'JetBrains Mono',monospace; fill:#cdd3e3; }
    .ps-lsub  { font:500 9px/1  'JetBrains Mono',monospace; fill:#5b6378; }
    .ps-llat  { font:500 8px/1  'JetBrains Mono',monospace; fill:#3d4459; }
    .ps-hdr   {
      font:600 9px/1 'JetBrains Mono',monospace; fill:#4d5570;
      text-anchor:middle; letter-spacing:.08em; text-transform:uppercase;
    }
    .ps-evm   {
      font:500 9px/1 'JetBrains Mono',monospace; fill:#5b6378;
      text-anchor:middle; letter-spacing:.06em;
    }
    .ps-evmw  {
      font:700 8px/1 'JetBrains Mono',monospace; fill:#f0883e;
      text-anchor:middle; opacity:0; transition:opacity .3s;
    }
    .ps-evmw.ps-show { opacity:1; }

    .ps-panel {
      display:flex; flex-direction:column; gap:10px;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; min-width:0;
    }
    .ps-ptitle { font:700 13px/1.3 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .ps-pdesc  { font:500 10px/1.5 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .ps-pdiv   { height:1px; background:rgba(124,140,255,.12); flex:0 0 auto; }
    .ps-prow   { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .ps-prowh  { display:flex; align-items:center; gap:6px; min-width:0; flex-wrap:wrap; }
    .ps-pbadge {
      display:inline-flex; align-items:center; flex:0 0 auto;
      font:700 7.5px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase;
      padding:2px 6px; border-radius:4px;
    }
    .ps-pllabel { font:600 9.5px 'JetBrains Mono',monospace; color:#cdd3e3; min-width:0; overflow-wrap:anywhere; }
    .ps-pnote  { font:500 9px/1.45 'JetBrains Mono',monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .ps-pempty { font:500 10px 'JetBrains Mono',monospace; color:#5b6378; text-align:center; padding:14px 0; }

    .ps-ctls { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .ps-btns { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .ps-sbtn {
      border:1px solid rgba(124,140,255,.2); border-radius:7px;
      cursor:pointer; background:#0d1322; color:#8d95ad;
      font:600 9px 'JetBrains Mono',monospace; letter-spacing:.04em;
      padding:5px 9px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .ps-sbtn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .ps-sbtn.ps-sel { color:#e7eaf3; border-color:rgba(124,140,255,.6); background:#13192e; }
  `;
  container.appendChild(style);
  stage.classList.add('ps-stage');

  /* ── SVG ─────────────────────────────────────────────────────────────────── */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  function txt(cls: string, x: number, y: number, content: string): SVGTextElement {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('class', cls);
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.textContent = content;
    return el;
  }

  function arrow(cx: number, y1: number, y2: number): SVGPathElement {
    const hw = 5;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#3d4459');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute(
      'd',
      `M${cx},${y1} L${cx},${y2 - 7} M${cx - hw},${y2 - 9} L${cx},${y2} L${cx + hw},${y2 - 9}`,
    );
    return path;
  }

  /* Header label */
  svg.appendChild(txt('ps-hdr', VW / 2, 20, 'Agent Action — LLM Output'));
  svg.appendChild(arrow(VW / 2, 28, L0Y - 3));

  /* Layer elements — keep references for updates */
  const rects: SVGRectElement[]   = [];
  const circs: SVGCircleElement[] = [];
  const syms:  SVGTextElement[]   = [];

  for (let i = 0; i < data.layers.length; i++) {
    const layer = data.layers[i];
    const ty    = layerTop(i);
    const vcy   = ty + LH / 2;

    /* Layer rect */
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'ps-rect');
    rect.setAttribute('x', String(LX));
    rect.setAttribute('y', String(ty));
    rect.setAttribute('width', String(LW));
    rect.setAttribute('height', String(LH));
    rect.setAttribute('rx', '8');
    svg.appendChild(rect);
    rects.push(rect);

    /* Left color stripe */
    const stripe = document.createElementNS(NS, 'rect');
    stripe.setAttribute('x', String(LX));
    stripe.setAttribute('y', String(ty));
    stripe.setAttribute('width', '4');
    stripe.setAttribute('height', String(LH));
    stripe.setAttribute('rx', '2');
    stripe.setAttribute('fill', layer.color);
    stripe.setAttribute('opacity', '0.65');
    svg.appendChild(stripe);

    /* Text: name, sublabel, latency */
    const tx = LX + 14;
    svg.appendChild(txt('ps-lname', tx, ty + 22, layer.label));
    svg.appendChild(txt('ps-lsub',  tx, ty + 36, layer.sublabel));
    svg.appendChild(txt('ps-llat',  tx, ty + 51, layer.latency));

    /* Verdict circle */
    const circ = document.createElementNS(NS, 'circle');
    circ.setAttribute('class', 'ps-vcirc');
    circ.setAttribute('cx', String(VC_X));
    circ.setAttribute('cy', String(vcy));
    circ.setAttribute('r', '15');
    circ.setAttribute('fill', 'rgba(93,102,130,.1)');
    circ.setAttribute('stroke', 'rgba(93,102,130,.28)');
    circ.setAttribute('stroke-width', '1.5');
    svg.appendChild(circ);
    circs.push(circ);

    /* Verdict symbol */
    const sym = document.createElementNS(NS, 'text');
    sym.setAttribute('class', 'ps-vsym');
    sym.setAttribute('x', String(VC_X));
    sym.setAttribute('y', String(vcy));
    sym.setAttribute('fill', '#3d4459');
    sym.textContent = '·';
    svg.appendChild(sym);
    syms.push(sym);

    /* Arrow between layers */
    if (i < data.layers.length - 1) {
      const bottom = ty + LH;
      svg.appendChild(arrow(VW / 2, bottom + 3, bottom + GAP - 3));
    }
  }

  /* EVM footer */
  const evmY = layerTop(data.layers.length - 1) + LH + 22;
  const evmLabel = txt('ps-evm', VW / 2, evmY, 'EVM Execution');
  svg.appendChild(evmLabel);

  const evmWarn = txt('ps-evmw', VW / 2, evmY + 16, '⚠ all layers missed this violation');
  svg.appendChild(evmWarn);

  stage.appendChild(svg);

  /* ── Panel ───────────────────────────────────────────────────────────────── */
  panel.className = 'ps-panel';

  function renderEmpty(): void {
    panel.innerHTML = '';
    const em = document.createElement('div');
    em.className = 'ps-pempty';
    em.textContent = 'Select a scenario below';
    panel.appendChild(em);
  }

  function renderScenario(sc: Scenario): void {
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ps-ptitle';
    title.textContent = sc.label;
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'ps-pdesc';
    desc.textContent = sc.description;
    panel.appendChild(desc);

    const div = document.createElement('div');
    div.className = 'ps-pdiv';
    panel.appendChild(div);

    for (const result of sc.results) {
      const layer = data.layers.find((l) => l.id === result.layerId)!;
      const vc    = VERDICT[result.verdict as Verdict];

      const row = document.createElement('div');
      row.className = 'ps-prow';

      const rowH = document.createElement('div');
      rowH.className = 'ps-prowh';

      const badge = document.createElement('span');
      badge.className = 'ps-pbadge';
      badge.style.cssText =
        `color:${vc.color};background:${vc.color}18;border:1px solid ${vc.color}40;`;
      badge.textContent = vc.label;

      const ll = document.createElement('span');
      ll.className = 'ps-pllabel';
      ll.textContent = layer.label;

      rowH.append(badge, ll);

      const note = document.createElement('div');
      note.className = 'ps-pnote';
      note.textContent = result.note;

      row.append(rowH, note);
      panel.appendChild(row);
    }
  }

  renderEmpty();

  /* ── SVG verdict update ──────────────────────────────────────────────────── */
  function setVerdicts(sc: Scenario | null): void {
    const allMiss = sc
      ? sc.results.every((r) => r.verdict === 'missed' || r.verdict === 'partial')
      : false;

    for (let i = 0; i < data.layers.length; i++) {
      const layer = data.layers[i];
      const rect  = rects[i];
      const circ  = circs[i];
      const sym   = syms[i];

      rect.classList.remove('ps-c', 'ps-m', 'ps-p');

      if (!sc) {
        circ.setAttribute('fill',   'rgba(93,102,130,.1)');
        circ.setAttribute('stroke', 'rgba(93,102,130,.28)');
        sym.setAttribute('fill', '#3d4459');
        sym.textContent = '·';
      } else {
        const res = sc.results.find((r) => r.layerId === layer.id);
        if (!res) continue;
        const vc = VERDICT[res.verdict as Verdict];
        circ.setAttribute('fill',   `${vc.color}20`);
        circ.setAttribute('stroke', `${vc.color}80`);
        sym.setAttribute('fill', vc.color);
        sym.textContent = vc.symbol;
        if (res.verdict === 'caught')  rect.classList.add('ps-c');
        if (res.verdict === 'missed')  rect.classList.add('ps-m');
        if (res.verdict === 'partial') rect.classList.add('ps-p');
      }
    }

    evmWarn.classList.toggle('ps-show', allMiss && sc !== null);
  }

  /* ── Controls ────────────────────────────────────────────────────────────── */
  const ctlsEl = document.createElement('div');
  ctlsEl.className = 'ps-ctls';
  const btnsEl = document.createElement('div');
  btnsEl.className = 'ps-btns';

  const sBtns = new Map<string, HTMLButtonElement>();
  const handlers: Array<[HTMLButtonElement, () => void]> = [];
  let selectedId: string | null = null;

  for (const sc of data.scenarios) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ps-sbtn';
    btn.textContent = sc.label;
    btnsEl.appendChild(btn);
    sBtns.set(sc.id, btn);

    const handler = (): void => {
      if (selectedId === sc.id) {
        selectedId = null;
        btn.classList.remove('ps-sel');
        setVerdicts(null);
        renderEmpty();
        return;
      }
      selectedId = sc.id;
      for (const [sid, b] of sBtns) b.classList.toggle('ps-sel', sid === sc.id);
      setVerdicts(sc);
      renderScenario(sc);
    };

    btn.addEventListener('click', handler);
    handlers.push([btn, handler]);
  }

  ctlsEl.appendChild(btnsEl);
  ctlsSlot.appendChild(ctlsEl);

  /* Caption */
  const capEl = document.createElement('div');
  capEl.style.cssText =
    "font:500 9px/1.5 'JetBrains Mono',monospace;color:#5b6378;min-width:0;overflow-wrap:anywhere;";
  capEl.textContent =
    'Tap a scenario · Sources: Lean-Agent Protocol (arXiv:2604.01483) · Agent-C (arXiv:2512.23738) · Symbolic Guardrails (arXiv:2604.15579)';
  caption.appendChild(capEl);

  setVerdicts(null);

  /* ── Cleanup ─────────────────────────────────────────────────────────────── */
  return () => {
    layout.dispose();
    for (const [btn, h] of handlers) btn.removeEventListener('click', h);
    style.remove();
  };
}
