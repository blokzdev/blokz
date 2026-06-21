/**
 * Artifact: bridge-trust-spectrum — Bridge Trust Spectrum
 * Manifest: content/artifacts/bridge-trust-spectrum/manifest.json
 *
 * A topological MAP of six cross-chain messaging protocols. Ethereum is the
 * hub; each protocol's spokes reach the chains it supports, colored by
 * security model type. Selecting a protocol highlights its edges and shows
 * trust parameters, verification cost, and hack history in the panel.
 *
 * Security model palette:
 *   multisig   #f0883e  orange  — trust M-of-N external key holders
 *   economic   #22d3ee  cyan    — trust staked capital (DVN / RMN)
 *   pos        #60a5fa  blue    — trust a PoS validator set
 *   optimistic #a78bfa  purple  — assume valid; detect fraud in window
 *   zk         #4ade80  green   — trust ZK proof + source consensus only
 *
 * Layout: shared responsive primitive — stage map on left, panel detail on
 * right, controls below (rail). wideTemplate: 'rail'.
 */
import data from '../../../content/artifacts/bridge-trust-spectrum/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Protocol = (typeof data.protocols)[number];
type Chain = (typeof data.chains)[number];

/* ── SVG viewport ─────────────────────────────────────────────────────────── */
const VW = 500;
const VH = 430;

function chainPx(c: Chain): [number, number] {
  return [(c.x / 100) * (VW - 100) + 50, (c.y / 100) * (VH - 100) + 50];
}

/* Quadratic bezier control point bowing toward the viewport centre */
const CX = VW / 2;
const CY = VH / 2;
function ctrlPt(x1: number, y1: number, x2: number, y2: number): [number, number] {
  return [(x1 + x2) / 2 * 0.55 + CX * 0.45, (y1 + y2) / 2 * 0.55 + CY * 0.45];
}

/* ── Main mount ───────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '7/6',
    panel: true,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .bts-stage { display:flex; align-items:center; justify-content:center; }
    .bts-stage svg { width:100%; height:100%; display:block; }

    .bts-edge {
      fill:none; stroke-width:2; opacity:.14;
      transition: opacity .22s ease, stroke-width .22s ease;
    }
    .bts-edge.bts-active { opacity:.82; stroke-width:2.5; }
    .bts-edge.bts-dimmed { opacity:.03; }

    .bts-nring { fill:none; stroke:#7c8cff; stroke-width:1; opacity:.28; }
    .bts-ndisk { fill:#0d1322; stroke:#7c8cff; stroke-width:1.4; }
    .bts-nabbr {
      font:700 8.5px 'JetBrains Mono',monospace;
      fill:#cdd3e3; text-anchor:middle; dominant-baseline:middle;
      letter-spacing:.06em; pointer-events:none;
    }
    .bts-nname {
      font:500 6.5px 'JetBrains Mono',monospace;
      fill:#5b6378; text-anchor:middle; pointer-events:none;
      letter-spacing:.02em;
    }

    .bts-panel {
      display:flex; flex-direction:column; gap:9px;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; min-width:0;
    }
    .bts-pname { font:700 13px/1.2 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .bts-badge {
      display:inline-flex; align-items:center; gap:5px;
      font:600 8.5px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase;
      padding:3px 8px; border-radius:5px; width:fit-content;
    }
    .bts-bdot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
    .bts-row  { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .bts-rlbl { font:500 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .bts-rval { font:500 11px/1.5 'JetBrains Mono',monospace; color:#cdd3e3; min-width:0; overflow-wrap:anywhere; }
    .bts-rval b { color:#e7eaf3; }
    .bts-rval-green { color:#4ade80; }
    .bts-hack {
      display:flex; align-items:flex-start; gap:7px;
      padding:7px 9px; border-radius:7px;
      background:rgba(240,136,62,.07); border:1px solid rgba(240,136,62,.24); min-width:0;
    }
    .bts-hicon { color:#f0883e; font-size:12px; flex:0 0 auto; line-height:1.4; }
    .bts-hbody { min-width:0; overflow-wrap:anywhere; }
    .bts-hamt  { font:700 11px 'JetBrains Mono',monospace; color:#f0883e; }
    .bts-htxt  { font:500 9px/1.45 'JetBrains Mono',monospace; color:#8d95ad; margin-top:1px; }
    .bts-empty { color:#5b6378; font:500 10px 'JetBrains Mono',monospace; text-align:center; padding:14px 0; }

    .bts-ctls  { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%; }
    .bts-btns  { display:flex; flex-wrap:wrap; gap:5px; min-width:0; max-width:100%; }
    .bts-pbtn {
      display:flex; align-items:center; gap:5px;
      border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad;
      font:600 9px 'JetBrains Mono',monospace; letter-spacing:.04em;
      padding:5px 9px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .bts-pbtn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .bts-pbtn.bts-sel { color:#e7eaf3; }
    .bts-pbtn-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
    .bts-legend { display:flex; flex-wrap:wrap; gap:4px 10px; min-width:0; }
    .bts-leg { display:flex; align-items:center; gap:4px; font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .bts-ldot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
  `;
  container.appendChild(style);
  stage.classList.add('bts-stage');

  /* ── SVG ────────────────────────────────────────────────────────────────── */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  /* Precompute pixel positions */
  const px = new Map<string, [number, number]>();
  for (const c of data.chains) px.set(c.id, chainPx(c));

  /* Draw edge layer (hub-and-spoke from ETH for each protocol) */
  const edgeGroup = document.createElementNS(NS, 'g');
  svg.appendChild(edgeGroup);

  const edgeEls = new Map<string, SVGPathElement[]>();
  const ethPx = px.get('eth')!;

  for (const proto of data.protocols) {
    const paths: SVGPathElement[] = [];
    for (const cid of proto.chains) {
      if (cid === 'eth') continue;
      const to = px.get(cid);
      if (!to) continue;
      const [x1, y1] = ethPx;
      const [x2, y2] = to;
      const [cpx, cpy] = ctrlPt(x1, y1, x2, y2);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'bts-edge');
      path.setAttribute('stroke', proto.color);
      path.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
      edgeGroup.appendChild(path);
      paths.push(path);
    }
    edgeEls.set(proto.id, paths);
  }

  /* Draw chain nodes on top */
  const NR = 15;
  for (const c of data.chains) {
    const [cx, cy] = px.get(c.id)!;
    const g = document.createElementNS(NS, 'g');

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'bts-nring');
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', String(NR + 5));

    const disk = document.createElementNS(NS, 'circle');
    disk.setAttribute('class', 'bts-ndisk');
    disk.setAttribute('cx', String(cx));
    disk.setAttribute('cy', String(cy));
    disk.setAttribute('r', String(NR));

    const abbr = document.createElementNS(NS, 'text');
    abbr.setAttribute('class', 'bts-nabbr');
    abbr.setAttribute('x', String(cx));
    abbr.setAttribute('y', String(cy));
    abbr.textContent = c.abbr;

    const name = document.createElementNS(NS, 'text');
    name.setAttribute('class', 'bts-nname');
    name.setAttribute('x', String(cx));
    name.setAttribute('y', String(cy + NR + 9));
    name.textContent = c.label;

    g.append(ring, disk, abbr, name);
    svg.appendChild(g);
  }

  stage.appendChild(svg);

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  panel.className = 'bts-panel';

  function renderEmpty(): void {
    panel.innerHTML = '';
    const em = document.createElement('div');
    em.className = 'bts-empty';
    em.textContent = 'Select a protocol below';
    panel.appendChild(em);
  }

  function addRow(label: string, value: string, green = false): void {
    const row = document.createElement('div');
    row.className = 'bts-row';
    const lbl = document.createElement('div');
    lbl.className = 'bts-rlbl';
    lbl.textContent = label;
    const val = document.createElement('div');
    val.className = green ? 'bts-rval bts-rval-green' : 'bts-rval';
    val.innerHTML = value;
    row.append(lbl, val);
    panel.appendChild(row);
  }

  function renderProtocol(proto: Protocol): void {
    panel.innerHTML = '';

    const nameEl = document.createElement('div');
    nameEl.className = 'bts-pname';
    nameEl.textContent = proto.label;
    panel.appendChild(nameEl);

    const badge = document.createElement('div');
    badge.className = 'bts-badge';
    badge.style.cssText = `color:${proto.color};background:${proto.color}18;border:1px solid ${proto.color}44;`;
    const bdot = document.createElement('span');
    bdot.className = 'bts-bdot';
    bdot.style.cssText = `background:${proto.color};box-shadow:0 0 5px ${proto.color};`;
    badge.append(bdot, proto.modelLabel);
    panel.appendChild(badge);

    addRow('Trust threshold', `<b>${proto.thresholdLabel}</b>`);
    addRow('Agent trust note', proto.trustNote);
    addRow('Verify gas', proto.verifyGasNote);
    addRow('Lifetime volume', `$${proto.volumeB}B+`);
    addRow('Chains covered', `${proto.chains.length} networks`);

    if (proto.hacks.length > 0) {
      for (const hack of proto.hacks) {
        const el = document.createElement('div');
        el.className = 'bts-hack';
        const icon = document.createElement('span');
        icon.className = 'bts-hicon';
        icon.textContent = '⚠';
        const body = document.createElement('div');
        body.className = 'bts-hbody';
        const amt = document.createElement('div');
        amt.className = 'bts-hamt';
        amt.textContent = `$${hack.amount}M (${hack.year})`;
        const txt = document.createElement('div');
        txt.className = 'bts-htxt';
        txt.textContent = hack.note;
        body.append(amt, txt);
        el.append(icon, body);
        panel.appendChild(el);
      }
    } else {
      addRow('Security record', 'No major protocol hacks', true);
    }
  }

  renderEmpty();

  /* ── Controls ───────────────────────────────────────────────────────────── */
  const ctlsEl = document.createElement('div');
  ctlsEl.className = 'bts-ctls';

  const btnsEl = document.createElement('div');
  btnsEl.className = 'bts-btns';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'bts-pbtn bts-sel';
  allBtn.textContent = 'All';
  btnsEl.appendChild(allBtn);

  const protoBtns = new Map<string, HTMLButtonElement>();
  const protoHandlers: Array<[HTMLButtonElement, () => void]> = [];

  for (const proto of data.protocols) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bts-pbtn';
    const dot = document.createElement('span');
    dot.className = 'bts-pbtn-dot';
    dot.style.cssText = `background:${proto.color};box-shadow:0 0 4px ${proto.color};`;
    btn.append(dot, proto.label);
    btnsEl.appendChild(btn);
    protoBtns.set(proto.id, btn);
  }

  const legendModels = [
    { color: '#f0883e', label: 'Multi-sig' },
    { color: '#22d3ee', label: 'Economic/DVN' },
    { color: '#60a5fa', label: 'PoS validators' },
    { color: '#a78bfa', label: 'Optimistic' },
    { color: '#4ade80', label: 'ZK light client' },
  ];
  const legendEl = document.createElement('div');
  legendEl.className = 'bts-legend';
  for (const m of legendModels) {
    const item = document.createElement('span');
    item.className = 'bts-leg';
    const dot = document.createElement('span');
    dot.className = 'bts-ldot';
    dot.style.background = m.color;
    const lbl = document.createElement('span');
    lbl.textContent = m.label;
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
    'Tap a protocol to inspect trust parameters · Sources: DeFiLlama hacks, protocol docs, arXiv:2210.00264';
  caption.appendChild(capEl);

  /* ── Interaction ────────────────────────────────────────────────────────── */
  function select(id: string | null): void {
    for (const [pid, paths] of edgeEls) {
      for (const p of paths) {
        p.classList.remove('bts-active', 'bts-dimmed');
        if (id !== null) {
          if (pid === id) p.classList.add('bts-active');
          else p.classList.add('bts-dimmed');
        }
      }
    }

    allBtn.classList.toggle('bts-sel', id === null);
    allBtn.style.borderColor = id === null ? 'rgba(34,211,238,.5)' : '';
    allBtn.style.color = id === null ? '#22d3ee' : '';

    for (const [pid, btn] of protoBtns) {
      const active = pid === id;
      btn.classList.toggle('bts-sel', active);
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

  for (const proto of data.protocols) {
    const btn = protoBtns.get(proto.id)!;
    const handler = (): void => select(proto.id);
    btn.addEventListener('click', handler);
    protoHandlers.push([btn, handler]);
  }

  /* ── Cleanup ────────────────────────────────────────────────────────────── */
  return () => {
    layout.dispose();
    allBtn.removeEventListener('click', onAll);
    for (const [btn, handler] of protoHandlers) {
      btn.removeEventListener('click', handler);
    }
    style.remove();
  };
}
