/**
 * Artifact: the-upgrade-window — The Upgrade Window
 * Manifest: content/artifacts/the-upgrade-window/manifest.json
 *
 * SVG topological map grouping 7 DeFi protocols into four upgrade-risk tiers
 * (immutable / governance-48h / governance-24h / multisig). Directed edges
 * show oracle/liquidity dependencies, revealing inherited risk across tiers.
 *
 * Layout: rail (stage left, panel right, controls below).
 */
import data from '../../../content/artifacts/the-upgrade-window/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Protocol = (typeof data.protocols)[number];
type Tier = (typeof data.tiers)[number];

/* ── SVG viewport ─────────────────────────────────────────────────────────── */
const VW = 500;
const VH = 340;
const PAD_X = 55;
const PAD_Y = 30;

function protocolPx(p: Protocol): [number, number] {
  return [(p.x / 100) * (VW - PAD_X * 2) + PAD_X, (p.y / 100) * (VH - PAD_Y * 2) + PAD_Y];
}

function tierY(pct: number): number {
  return (pct / 100) * (VH - PAD_Y * 2) + PAD_Y;
}

/* ── Main mount ───────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
    panel: true,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .tuw-stage { display:flex; align-items:center; justify-content:center; }
    .tuw-stage svg { width:100%; height:100%; display:block; }

    .tuw-band { opacity:.07; }
    .tuw-band-lbl {
      font:600 8px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase;
      dominant-baseline:middle; text-anchor:start;
    }

    .tuw-edge {
      fill:none; stroke-width:1.6; opacity:.18;
      transition: opacity .22s ease, stroke-width .22s ease;
      marker-end: url(#tuw-arrow);
    }
    .tuw-edge.tuw-active { opacity:.78; stroke-width:2.2; }
    .tuw-edge.tuw-dimmed { opacity:.03; }

    .tuw-nring { fill:none; stroke-width:1; opacity:.3; }
    .tuw-ndisk { fill:#0d1322; stroke-width:1.6; }
    .tuw-nabbr {
      font:700 7.5px 'JetBrains Mono',monospace;
      fill:#cdd3e3; text-anchor:middle; dominant-baseline:middle;
      letter-spacing:.05em; pointer-events:none;
    }
    .tuw-nname {
      font:500 6px 'JetBrains Mono',monospace;
      fill:#5b6378; text-anchor:middle; pointer-events:none;
      letter-spacing:.02em;
    }
    .tuw-nhit { fill:transparent; cursor:pointer; }

    .tuw-panel {
      display:flex; flex-direction:column; gap:9px;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; min-width:0;
    }
    .tuw-pname { font:700 13px/1.2 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .tuw-badge {
      display:inline-flex; align-items:center; gap:5px;
      font:600 8px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase;
      padding:3px 8px; border-radius:5px; width:fit-content;
    }
    .tuw-bdot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
    .tuw-row  { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .tuw-rlbl { font:500 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .tuw-rval { font:500 11px/1.5 'JetBrains Mono',monospace; color:#cdd3e3; min-width:0; overflow-wrap:anywhere; }
    .tuw-rval-green { color:#4ade80; }
    .tuw-rval-warn  { color:#fbbf24; }
    .tuw-rval-danger { color:#f0883e; }
    .tuw-addr {
      font:500 8.5px/1.5 'JetBrains Mono',monospace; color:#5b6378;
      min-width:0; overflow-wrap:anywhere; word-break:break-all;
    }
    .tuw-empty { color:#5b6378; font:500 10px 'JetBrains Mono',monospace; text-align:center; padding:14px 0; }

    .tuw-ctls  { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .tuw-btns  { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .tuw-pbtn {
      display:flex; align-items:center; gap:5px;
      border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad;
      font:600 8.5px 'JetBrains Mono',monospace; letter-spacing:.04em;
      padding:4px 8px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .tuw-pbtn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .tuw-pbtn.tuw-sel { color:#e7eaf3; }
    .tuw-pbtn-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
    .tuw-legend { display:flex; flex-wrap:wrap; gap:4px 10px; min-width:0; }
    .tuw-leg { display:flex; align-items:center; gap:4px; font:500 8px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .tuw-ldot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
  `;
  container.appendChild(style);
  stage.classList.add('tuw-stage');

  /* ── SVG ────────────────────────────────────────────────────────────────── */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  /* Arrow marker */
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'tuw-arrow');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(NS, 'path');
  arrowPath.setAttribute('d', 'M0,0 L0,6 L6,3 z');
  arrowPath.setAttribute('fill', '#5b6378');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  /* ── Tier bands ─────────────────────────────────────────────────────────── */
  const bandsGroup = document.createElementNS(NS, 'g');
  for (const tier of data.tiers) {
    const y1 = tierY(tier.yMin);
    const y2 = tierY(tier.yMax);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'tuw-band');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', String(y1));
    rect.setAttribute('width', String(VW));
    rect.setAttribute('height', String(y2 - y1));
    rect.setAttribute('fill', tier.color);
    bandsGroup.appendChild(rect);

    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('class', 'tuw-band-lbl');
    lbl.setAttribute('x', '4');
    lbl.setAttribute('y', String((y1 + y2) / 2));
    lbl.setAttribute('fill', tier.color);
    lbl.textContent = tier.label;
    bandsGroup.appendChild(lbl);
  }
  svg.appendChild(bandsGroup);

  /* ── Precompute pixel positions ─────────────────────────────────────────── */
  const px = new Map<string, [number, number]>();
  for (const p of data.protocols) px.set(p.id, protocolPx(p));

  /* ── Edge layer ─────────────────────────────────────────────────────────── */
  const edgeGroup = document.createElementNS(NS, 'g');
  svg.appendChild(edgeGroup);

  const edgeEls = new Map<string, SVGPathElement>();

  for (const edge of data.edges) {
    const from = px.get(edge.from);
    const to = px.get(edge.to);
    if (!from || !to) continue;

    const [x1, y1] = from;
    const [x2, y2] = to;
    /* Bow the curve slightly to avoid overlapping nodes */
    const cpx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
    const cpy = (y1 + y2) / 2 - (x2 - x1) * 0.08;
    /* Stop path a bit short of the target node so arrow doesn't overlap */
    const dx = x2 - cpx;
    const dy = y2 - cpy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const NR = 13;
    const ex = x2 - (dx / len) * (NR + 2);
    const ey = y2 - (dy / len) * (NR + 2);

    const fromProto = data.protocols.find((p) => p.id === edge.from)!;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'tuw-edge');
    path.setAttribute('stroke', fromProto.color);
    path.setAttribute(
      'd',
      `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
    );
    edgeGroup.appendChild(path);
    edgeEls.set(`${edge.from}→${edge.to}`, path);
  }

  /* ── Protocol nodes ─────────────────────────────────────────────────────── */
  const NR = 13;
  const nodeGroup = document.createElementNS(NS, 'g');
  const nodeBtns = new Map<string, SVGGElement>();

  for (const proto of data.protocols) {
    const [cx, cy] = px.get(proto.id)!;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', proto.label);
    g.style.cursor = 'pointer';

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'tuw-nring');
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', String(NR + 5));
    ring.setAttribute('stroke', proto.color);

    const disk = document.createElementNS(NS, 'circle');
    disk.setAttribute('class', 'tuw-ndisk');
    disk.setAttribute('cx', String(cx));
    disk.setAttribute('cy', String(cy));
    disk.setAttribute('r', String(NR));
    disk.setAttribute('stroke', proto.color);

    const abbr = document.createElementNS(NS, 'text');
    abbr.setAttribute('class', 'tuw-nabbr');
    abbr.setAttribute('x', String(cx));
    abbr.setAttribute('y', String(cy));
    abbr.textContent = proto.abbr;

    const name = document.createElementNS(NS, 'text');
    name.setAttribute('class', 'tuw-nname');
    name.setAttribute('x', String(cx));
    name.setAttribute('y', String(cy + NR + 8));
    name.textContent = proto.label.split(' ')[0];

    /* Invisible hit area */
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('class', 'tuw-nhit');
    hit.setAttribute('cx', String(cx));
    hit.setAttribute('cy', String(cy));
    hit.setAttribute('r', String(NR + 5));

    g.append(ring, disk, abbr, name, hit);
    nodeGroup.appendChild(g);
    nodeBtns.set(proto.id, g);
  }
  svg.appendChild(nodeGroup);
  stage.appendChild(svg);

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  panel.className = 'tuw-panel';

  function renderEmpty(): void {
    panel.innerHTML = '';
    const em = document.createElement('div');
    em.className = 'tuw-empty';
    em.textContent = 'Select a protocol to inspect';
    panel.appendChild(em);
  }

  function addRow(label: string, value: string, cls = 'tuw-rval'): void {
    const row = document.createElement('div');
    row.className = 'tuw-row';
    const lbl = document.createElement('div');
    lbl.className = 'tuw-rlbl';
    lbl.textContent = label;
    const val = document.createElement('div');
    val.className = cls;
    val.innerHTML = value;
    row.append(lbl, val);
    panel.appendChild(row);
  }

  function renderProtocol(proto: Protocol): void {
    panel.innerHTML = '';

    const nameEl = document.createElement('div');
    nameEl.className = 'tuw-pname';
    nameEl.textContent = proto.label;
    panel.appendChild(nameEl);

    const tier = data.tiers.find((t) => t.id === proto.tier)!;
    const badge = document.createElement('div');
    badge.className = 'tuw-badge';
    badge.style.cssText = `color:${proto.color};background:${proto.color}18;border:1px solid ${proto.color}44;`;
    const bdot = document.createElement('span');
    bdot.className = 'tuw-bdot';
    bdot.style.cssText = `background:${proto.color};box-shadow:0 0 5px ${proto.color};`;
    badge.append(bdot, tier.label);
    panel.appendChild(badge);

    const riskCls =
      proto.tier === 'immutable'
        ? 'tuw-rval tuw-rval-green'
        : proto.tier === 'governance-48h'
          ? 'tuw-rval'
          : proto.tier === 'governance-24h'
            ? 'tuw-rval tuw-rval-warn'
            : 'tuw-rval tuw-rval-danger';

    addRow('Timelock', proto.timelockNote, riskCls);
    addRow('Agent safety', proto.agentNote);

    /* Outbound dependencies */
    const outEdges = data.edges.filter((e) => e.from === proto.id);
    if (outEdges.length > 0) {
      const depLabels = outEdges
        .map((e) => {
          const dep = data.protocols.find((p) => p.id === e.to)!;
          return `${dep.label} (${e.label})`;
        })
        .join(', ');
      addRow('Depends on', depLabels);
    }

    /* Incoming dependents */
    const inEdges = data.edges.filter((e) => e.to === proto.id);
    if (inEdges.length > 0) {
      const depLabels = inEdges
        .map((e) => {
          const dep = data.protocols.find((p) => p.id === e.from)!;
          return dep.label;
        })
        .join(', ');
      addRow('Used by', depLabels);
    }

    const addr = document.createElement('div');
    addr.className = 'tuw-row';
    const albl = document.createElement('div');
    albl.className = 'tuw-rlbl';
    albl.textContent = 'Address';
    const aval = document.createElement('div');
    aval.className = 'tuw-addr';
    aval.textContent = proto.address;
    addr.append(albl, aval);
    panel.appendChild(addr);
  }

  renderEmpty();

  /* ── Controls ───────────────────────────────────────────────────────────── */
  const ctlsEl = document.createElement('div');
  ctlsEl.className = 'tuw-ctls';

  const btnsEl = document.createElement('div');
  btnsEl.className = 'tuw-btns';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'tuw-pbtn tuw-sel';
  allBtn.textContent = 'All';
  btnsEl.appendChild(allBtn);

  const protoBtns = new Map<string, HTMLButtonElement>();
  const protoHandlers: Array<[HTMLButtonElement, () => void]> = [];

  for (const proto of data.protocols) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tuw-pbtn';
    const dot = document.createElement('span');
    dot.className = 'tuw-pbtn-dot';
    dot.style.cssText = `background:${proto.color};box-shadow:0 0 4px ${proto.color};`;
    btn.append(dot, proto.abbr);
    btnsEl.appendChild(btn);
    protoBtns.set(proto.id, btn);
  }

  const legendEl = document.createElement('div');
  legendEl.className = 'tuw-legend';
  for (const tier of data.tiers) {
    const item = document.createElement('span');
    item.className = 'tuw-leg';
    const dot = document.createElement('span');
    dot.className = 'tuw-ldot';
    dot.style.background = tier.color;
    const lbl = document.createElement('span');
    lbl.textContent = tier.label;
    item.append(dot, lbl);
    legendEl.appendChild(item);
  }

  ctlsEl.append(btnsEl, legendEl);
  controlsSlot.appendChild(ctlsEl);

  /* Caption */
  const capEl = document.createElement('div');
  capEl.style.cssText =
    "font:500 9px/1.5 'JetBrains Mono',monospace;color:#5b6378;min-width:0;overflow-wrap:anywhere;";
  capEl.textContent =
    'Tap a protocol to inspect its upgrade risk and dependencies · Data: Blockscout, Etherscan, protocol docs · 2026-06-22';
  caption.appendChild(capEl);

  /* ── Interaction ────────────────────────────────────────────────────────── */
  function select(id: string | null): void {
    /* Edges: dim all except those involving selected protocol */
    for (const [key, path] of edgeEls) {
      path.classList.remove('tuw-active', 'tuw-dimmed');
      if (id !== null) {
        const [from, to] = key.split('→');
        if (from === id || to === id) path.classList.add('tuw-active');
        else path.classList.add('tuw-dimmed');
      }
    }

    /* Node rings */
    for (const [pid, g] of nodeBtns) {
      const ring = g.querySelector('.tuw-nring') as SVGCircleElement;
      if (id === null) {
        ring.style.opacity = '0.3';
      } else {
        ring.style.opacity = pid === id ? '0.85' : '0.1';
      }
    }

    /* Control buttons */
    allBtn.classList.toggle('tuw-sel', id === null);
    allBtn.style.borderColor = id === null ? 'rgba(34,211,238,.5)' : '';
    allBtn.style.color = id === null ? '#22d3ee' : '';

    for (const [pid, btn] of protoBtns) {
      const active = pid === id;
      btn.classList.toggle('tuw-sel', active);
      const proto = data.protocols.find((p) => p.id === pid)!;
      btn.style.borderColor = active ? `${proto.color}66` : '';
      btn.style.color = active ? proto.color : '';
    }

    if (id === null) renderEmpty();
    else {
      const proto = data.protocols.find((p) => p.id === id);
      if (proto) renderProtocol(proto);
    }
  }

  const onAll = (): void => select(null);
  allBtn.addEventListener('click', onAll);

  const nodeClickHandlers: Array<[SVGGElement, () => void]> = [];

  for (const proto of data.protocols) {
    const btn = protoBtns.get(proto.id)!;
    const handler = (): void => select(proto.id);
    btn.addEventListener('click', handler);
    protoHandlers.push([btn, handler]);

    const nodeG = nodeBtns.get(proto.id)!;
    const nodeHandler = (): void => select(proto.id);
    nodeG.addEventListener('click', nodeHandler);
    nodeClickHandlers.push([nodeG, nodeHandler]);
  }

  /* ── Cleanup ────────────────────────────────────────────────────────────── */
  return () => {
    layout.dispose();
    allBtn.removeEventListener('click', onAll);
    for (const [btn, handler] of protoHandlers) {
      btn.removeEventListener('click', handler);
    }
    for (const [g, handler] of nodeClickHandlers) {
      g.removeEventListener('click', handler);
    }
    style.remove();
  };
}
