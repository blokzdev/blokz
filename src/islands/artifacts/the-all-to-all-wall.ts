/**
 * Artifact: the-all-to-all-wall — The All-to-All Wall
 * Manifest: content/artifacts/the-all-to-all-wall/manifest.json
 *
 * A Mixture-of-Experts model only computes a fraction of its weights per token,
 * but to do so it must SHIP each token's hidden vector to whichever experts the
 * router picked — an all-to-all "dispatch", then an all-to-all "combine" of the
 * results, every MoE layer. That shuffle's cost is set by interconnect
 * bandwidth, not FLOPs, so decode speed is a function of the slowest link in the
 * fabric.
 *
 * The chart plots communication-bound decode speed (tokens/sec per request, log)
 * against effective all-to-all bandwidth (GB/s, log) for three frontier open MoE
 * models. It is anchored to DeepSeek's own hardware report: ~14.76 ms TPOT
 * (~67 tok/s) from the shuffle alone on a 400 Gbps InfiniBand fabric (~50 GB/s
 * effective), then scaled by each model's relative all-to-all volume
 * (3 x top-k x hidden x MoE-layers, FP8 dispatch + BF16 combine) and inversely
 * with bandwidth. Compute and dual-microbatch overlap are idealized away — this
 * is the network's best case.
 *
 * A horizontal "interactive floor" marks ~20 tok/s; the region below it is the
 * wall. Named links sit as dots from NVLink (intra-node) through datacenter
 * InfiniBand/ethernet down to gigabit and home broadband. Drag the bandwidth
 * cursor, tap a link or model chip, or arrow the bandwidth; the panel reads
 * TPOT, decode speed, per-token shuffle volume, and the verdict.
 *
 * SVG, no RAF — renders on input. Layout via the shared primitive.
 */
import data from '../../../content/artifacts/the-all-to-all-wall/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Model { id: string; label: string; total: string; active: string; hidden: number; moeLayers: number; experts: number; topk: number }
interface Link { id: string; label: string; detail: string; effGBps: number; kind: 'fabric' | 'datacenter' | 'internet' }

const CFG = data.config;
const MODELS = data.models as Model[];
const LINKS = (data.links as Link[]).slice().sort((a, b) => b.effGBps - a.effGBps);

/* per-token all-to-all volume (bytes): dispatch (FP8) + combine (BF16) of the
   hidden vector to top-k experts, summed over the MoE layers. */
const volOf = (m: Model) => (CFG.dispatchBytes + CFG.combineBytes) * m.topk * m.hidden * m.moeLayers;
const VREF = volOf(MODELS.find((m) => m.id === CFG.anchorModel) ?? MODELS[0]);

/* communication-bound decode metrics, scaled from DeepSeek's published anchor */
const tpotMs = (m: Model, bw: number) => CFG.anchorTpotMs * (volOf(m) / VREF) * (CFG.anchorBwGBps / bw);
const tokps = (m: Model, bw: number) => 1000 / tpotMs(m, bw);

const NS = 'http://www.w3.org/2000/svg';

/* --- chart geometry (viewBox units) --- */
const VB_W = 840, VB_H = 472;
const X0 = 66, X1 = 776, Y_TOP = 40, Y_BASE = 392;

const BWMIN = 0.008, BWMAX = 220;          // GB/s (x, log)
const TPS_LO = 0.005, TPS_HI = 400;        // tok/s (y, log)
const lbw0 = Math.log10(BWMIN), lbw1 = Math.log10(BWMAX);
const lt0 = Math.log10(TPS_LO), lt1 = Math.log10(TPS_HI);
const xOf = (bw: number) => X0 + ((Math.log10(bw) - lbw0) / (lbw1 - lbw0)) * (X1 - X0);
const yOf = (t: number) => Y_BASE - ((Math.log10(Math.max(t, TPS_LO)) - lt0) / (lt1 - lt0)) * (Y_BASE - Y_TOP);
const bwOfX = (x: number) => {
  const f = Math.min(Math.max((x - X0) / (X1 - X0), 0), 1);
  return 10 ** (lbw0 + f * (lbw1 - lbw0));
};

const FLOOR = CFG.interactiveTokps;

/* --- formatters --- */
const fmtTps = (t: number) =>
  t >= 100 ? t.toFixed(0) : t >= 10 ? t.toFixed(1) : t >= 1 ? t.toFixed(1) : t >= 0.1 ? t.toFixed(2) : t.toFixed(3);
const fmtTpot = (ms: number) =>
  ms >= 10000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 10 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(1)} ms`;
const fmtBw = (bw: number) =>
  bw >= 100 ? `${bw.toFixed(0)} GB/s` : bw >= 1 ? `${bw.toFixed(1)} GB/s` : `${(bw * 1000).toFixed(0)} MB/s`;
const fmtVol = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

const KIND_CLASS: Record<Link['kind'], string> = { fabric: 'aw-fabric', datacenter: 'aw-dc', internet: 'aw-net' };
const BAND_SUFFIX: Record<Link['kind'], string> = { fabric: 'fab', datacenter: 'dc', internet: 'net' };

export default function mount(container: HTMLElement): () => void {
  let mi = 0;                                  // selected model
  let bw = LINKS.find((l) => l.id === 'ib400')?.effGBps ?? 50;  // current bandwidth (GB/s)

  const layout = createArtifactLayout(container, { wideTemplate: 'footer', stageAspect: '840/472' });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .aw-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .aw-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:none; cursor:ew-resize; }
    .aw-grid { stroke:rgba(124,140,255,.09); }
    .aw-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .aw-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .aw-axy { fill:#22d3ee; font:600 10.5px 'JetBrains Mono', monospace; }
    .aw-wall { fill:rgba(249,115,98,.07); }
    .aw-floor { stroke:rgba(249,115,98,.5); stroke-width:1.1; stroke-dasharray:4 4; }
    .aw-floorlab { fill:#f9a08f; font:600 9.5px 'JetBrains Mono', monospace; }
    .aw-curve { fill:none; stroke:#5b8cff; stroke-width:2.6; }
    .aw-curve-ghost { fill:none; stroke:rgba(141,149,173,.28); stroke-width:1.4; stroke-dasharray:3 4; }
    .aw-band-fab { fill:#6fd9e6; } .aw-band-dc { fill:#f5a524; } .aw-band-net { fill:#f9846f; }
    .aw-node { outline:none; cursor:pointer; }
    .aw-node:focus-visible .aw-ring { opacity:1; }
    .aw-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .aw-dot { stroke:#05070d; stroke-width:1.3; }
    .aw-fabric { fill:#22d3ee; } .aw-dc { fill:#f5a524; } .aw-net { fill:#f97362; }
    .aw-linklab { font:600 9px 'JetBrains Mono', monospace; pointer-events:none; }
    .aw-hit { fill:transparent; cursor:pointer; }
    .aw-cur { stroke:rgba(231,234,243,.5); stroke-width:1.3; }
    .aw-curdot { fill:#e7eaf3; stroke:#05070d; stroke-width:1.4; }
    .aw-oplab { font:700 11.5px 'JetBrains Mono', monospace; fill:#e7eaf3; pointer-events:none; }
    .aw-optag { font:600 9.5px 'JetBrains Mono', monospace; pointer-events:none; }

    .aw-controls { display:flex; align-items:flex-end; gap:12px 22px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .aw-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .aw-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .aw-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .aw-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 11px; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .aw-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .aw-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .aw-seg small { color:#5b6378; font-weight:500; margin-left:5px; }
    .aw-seg[aria-pressed="true"] small { color:#9aa3bd; }

    .aw-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .aw-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .aw-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .aw-sub { color:#5b6378; font-size:10.5px; }
    .aw-rows { display:flex; flex-direction:column; gap:5px; }
    .aw-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .aw-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .aw-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .aw-row b.aw-cyan { color:#22d3ee; }
    .aw-row b.aw-amber { color:#f5a524; }
    .aw-row b.aw-warn { color:#f97362; }
    .aw-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .aw-verdict.aw-ok { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .aw-verdict.aw-mid { background:rgba(245,165,36,.1); color:#f7c877; border:1px solid rgba(245,165,36,.24); }
    .aw-verdict b { font-weight:700; }

    .aw-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .aw-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- chart scaffold ---- */
  const wrap = document.createElement('div');
  wrap.className = 'aw-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label',
    'Communication-bound decode speed of a frontier Mixture-of-Experts model versus effective all-to-all interconnect bandwidth');
  svg.setAttribute('tabindex', '0');
  wrap.appendChild(svg);
  stage.appendChild(wrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = text; gPlot.appendChild(t); return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls); gPlot.appendChild(l); return l;
  };

  /* ---- controls: model chips + link chips ---- */
  const controls = document.createElement('div');
  controls.className = 'aw-controls';

  const mGroup = document.createElement('div');
  mGroup.className = 'aw-cgroup';
  const mLab = document.createElement('span'); mLab.textContent = 'frontier MoE model';
  const mSegs = document.createElement('div'); mSegs.className = 'aw-segs';
  mSegs.setAttribute('role', 'group'); mSegs.setAttribute('aria-label', 'model');
  const mBtns = MODELS.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'aw-seg';
    b.innerHTML = `${m.label} <small>${m.active}/${m.total}</small>`;
    b.setAttribute('aria-label', `${m.label}, ${m.active} active of ${m.total}, ${m.experts} experts top-${m.topk}`);
    b.addEventListener('click', () => { mi = i; render(); });
    mSegs.appendChild(b); return b;
  });
  mGroup.append(mLab, mSegs);

  const lGroup = document.createElement('div');
  lGroup.className = 'aw-cgroup';
  const lLab = document.createElement('span'); lLab.textContent = 'interconnect (effective all-to-all bandwidth)';
  const lSegs = document.createElement('div'); lSegs.className = 'aw-segs';
  lSegs.setAttribute('role', 'group'); lSegs.setAttribute('aria-label', 'interconnect link');
  const lBtns = LINKS.map((l) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'aw-seg';
    b.innerHTML = `${l.label} <small>${fmtBw(l.effGBps)}</small>`;
    b.setAttribute('aria-label', `${l.label}, ${l.detail}, ${fmtBw(l.effGBps)} effective`);
    b.addEventListener('click', () => { bw = l.effGBps; render(); });
    lSegs.appendChild(b); return b;
  });
  lGroup.append(lLab, lSegs);

  controls.append(mGroup, lGroup);
  controlsSlot.appendChild(controls);

  /* ---- panel ---- */
  const readout = document.createElement('div');
  readout.className = 'aw-readout';
  panel.appendChild(readout);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'aw-cap';
  cap.innerHTML =
    `Per token, every MoE layer dispatches the hidden vector to its <b>top-${MODELS[0].topk}</b> experts (FP8) and combines the results back (BF16) — an <b>all-to-all</b> whose cost is set by bandwidth, not FLOPs. ` +
    `Anchored to DeepSeek's hardware report: <b>~14.76 ms</b> TPOT (~67 tok/s/request) from the shuffle alone on <b>400G InfiniBand</b> (~50 GB/s effective), scaled by each model's all-to-all volume and inversely with bandwidth; compute/overlap idealized away. ` +
    `Drag the cursor, tap a link or model, or use the arrow keys.`;
  caption.appendChild(cap);

  const nodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;
    const m = MODELS[mi];

    /* wall: region below the interactive floor */
    const yFloor = yOf(FLOOR);
    const wall = document.createElementNS(NS, 'rect');
    wall.setAttribute('x', String(X0)); wall.setAttribute('y', String(yFloor));
    wall.setAttribute('width', String(X1 - X0)); wall.setAttribute('height', String(Y_BASE - yFloor));
    wall.setAttribute('class', 'aw-wall');
    gPlot.appendChild(wall);

    /* gridlines + ticks: x decades (GB/s), y decades (tok/s) */
    for (const v of [0.01, 0.1, 1, 10, 100]) {
      const x = xOf(v);
      mkLine(x, Y_TOP, x, Y_BASE, 'aw-grid');
      mkText(x, Y_BASE + 16, 'aw-axislab', v >= 1 ? `${v}` : `${v}`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'aw-axis', 'effective all-to-all bandwidth  —  GB/s  (log)', 'middle');
    for (const v of [0.01, 0.1, 1, 10, 100]) {
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'aw-grid');
      mkText(X0 - 8, y + 3.5, 'aw-axy', `${v}`, 'end');
    }
    mkText(X0 - 8, Y_TOP - 16, 'aw-axy', 'decode  tok/s', 'start');

    /* interactive floor line */
    mkLine(X0, yFloor, X1, yFloor, 'aw-floor');
    mkText(X1, yFloor - 6, 'aw-floorlab', `interactive floor  ~${FLOOR} tok/s`, 'end');

    /* ghost curves for the other models (they nearly overlap — bandwidth, not model, is the axis) */
    MODELS.forEach((gm, gi) => {
      if (gi === mi) return;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${xOf(BWMIN).toFixed(1)},${yOf(tokps(gm, BWMIN)).toFixed(1)} L${xOf(BWMAX).toFixed(1)},${yOf(tokps(gm, BWMAX)).toFixed(1)}`);
      path.setAttribute('class', 'aw-curve-ghost');
      gPlot.appendChild(path);
    });

    /* selected model curve (straight line on log-log) */
    const curve = document.createElementNS(NS, 'path');
    curve.setAttribute('d', `M${xOf(BWMIN).toFixed(1)},${yOf(tokps(m, BWMIN)).toFixed(1)} L${xOf(BWMAX).toFixed(1)},${yOf(tokps(m, BWMAX)).toFixed(1)}`);
    curve.setAttribute('class', 'aw-curve');
    gPlot.appendChild(curve);

    /* link markers */
    LINKS.forEach((l, i) => {
      const x = xOf(l.effGBps);
      const y = yOf(tokps(m, l.effGBps));
      const t = tokps(m, l.effGBps);

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'aw-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${l.label} (${l.detail}), ${fmtBw(l.effGBps)}: ${fmtTps(t)} tokens per second, ${fmtTpot(tpotMs(m, l.effGBps))} per token`);

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '4.4');
      dot.setAttribute('class', `aw-dot ${KIND_CLASS[l.kind]}`);
      g.appendChild(dot);
      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('cx', String(x)); ring.setAttribute('cy', String(y));
      ring.setAttribute('r', '9'); ring.setAttribute('class', 'aw-ring');
      g.appendChild(ring);
      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('cx', String(x)); hit.setAttribute('cy', String(y));
      hit.setAttribute('r', '16'); hit.setAttribute('class', 'aw-hit');
      g.appendChild(hit);

      /* label: alternate above/below to keep clear of the curve, clamp at edges */
      const above = i % 2 === 0;
      const lx = Math.min(Math.max(x, X0 + 4), X1 - 4);
      const anchor = x > X1 - 70 ? 'end' : x < X0 + 70 ? 'start' : 'middle';
      const lab = mkText(lx, above ? y - 11 : y + 17, `aw-linklab aw-band-${BAND_SUFFIX[l.kind]}`, l.label, anchor);
      lab.setAttribute('pointer-events', 'none');

      const select = () => { bw = l.effGBps; render(); };
      g.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(g);
      nodes[i] = g;
    });

    /* current operating cursor */
    const cx = xOf(bw);
    const t = tokps(m, bw);
    const cy = yOf(t);
    mkLine(cx, Y_TOP, cx, Y_BASE, 'aw-cur');
    const cdot = document.createElementNS(NS, 'circle');
    cdot.setAttribute('cx', String(cx)); cdot.setAttribute('cy', String(cy));
    cdot.setAttribute('r', '5.5'); cdot.setAttribute('class', 'aw-curdot');
    gPlot.appendChild(cdot);
    const anchor = cx > X1 - 120 ? 'end' : 'start';
    const lx = cx + (anchor === 'end' ? -9 : 9);
    mkText(lx, Math.max(Y_TOP + 12, cy - 12), 'aw-oplab', `${fmtTps(t)} tok/s`, anchor);
    mkText(lx, Math.max(Y_TOP + 26, cy + 4), `aw-optag aw-band-${t >= FLOOR ? 'fab' : t >= 1 ? 'dc' : 'net'}`, `${fmtTpot(tpotMs(m, bw))}/tok`, anchor);

    /* sync chips */
    mBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === mi)));
    lBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(Math.abs(LINKS[i].effGBps - bw) < 1e-6)));

    renderPanel(m);
  }

  function renderPanel(m: Model) {
    const t = tokps(m, bw);
    const ms = tpotMs(m, bw);
    const vol = volOf(m);
    /* nearest named link for context */
    let near = LINKS[0], nd = Infinity;
    for (const l of LINKS) { const d = Math.abs(Math.log10(l.effGBps) - Math.log10(bw)); if (d < nd) { nd = d; near = l; } }
    const onLink = Math.abs(near.effGBps - bw) < 1e-6;
    const ctx = onLink ? near.label : fmtBw(bw);

    readout.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'aw-hd';
    const name = document.createElement('span'); name.className = 'aw-name'; name.textContent = m.label;
    const sub = document.createElement('span'); sub.className = 'aw-sub';
    sub.textContent = `${m.experts} experts · top-${m.topk} · ${m.moeLayers} MoE layers`;
    hd.append(name, sub);

    const rows = document.createElement('div');
    rows.className = 'aw-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div'); r.className = 'aw-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      r.append(s, b); return r;
    };
    const speedCls = t >= FLOOR ? 'aw-cyan' : t >= 1 ? 'aw-amber' : 'aw-warn';
    rows.append(
      row('interconnect', ctx, ''),
      row('decode speed', `${fmtTps(t)} tok/s`, speedCls),
      row('time per token', fmtTpot(ms), speedCls),
      row('shuffle / token', fmtVol(vol), ''),
    );

    const verdict = document.createElement('div');
    if (t >= FLOOR) {
      verdict.className = 'aw-verdict aw-ok';
      verdict.innerHTML =
        `At <b>${ctx}</b> the all-to-all clears the interactive floor — <b>${fmtTps(t)} tok/s</b>. ` +
        `This is NVLink/InfiniBand territory: a single, well-connected datacenter node — the thing decentralization was supposed to remove.`;
    } else if (t >= 1) {
      verdict.className = 'aw-verdict aw-mid';
      verdict.innerHTML =
        `At <b>${ctx}</b> the shuffle drags decode to <b>${fmtTps(t)} tok/s</b> (${fmtTpot(ms)}/token) — below interactive. ` +
        `Workable for a batch job, painful for a chat. You have fallen off the datacenter fabric.`;
    } else {
      verdict.className = 'aw-verdict';
      verdict.innerHTML =
        `At <b>${ctx}</b> each token waits <b>${fmtTpot(ms)}</b> on the all-to-all alone — <b>${fmtTps(t)} tok/s</b>. ` +
        `This is the wall: expert-parallel sharding a frontier MoE across internet links is simply not serving.`;
    }

    readout.append(hd, rows, verdict);
  }

  /* ---- pointer: drag the bandwidth cursor ---- */
  let dragging = false;
  const setFromX = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbx = ((clientX - rect.left) / rect.width) * VB_W;
    bw = Math.min(Math.max(bwOfX(vbx), BWMIN), BWMAX);
    render();
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element)?.closest('.aw-node')) return; // link dots handle their own taps
    dragging = true;
    svg.setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  };
  const onMove = (e: PointerEvent) => { if (dragging) setFromX(e.clientX); };
  const onUp = (e: PointerEvent) => { dragging = false; try { svg.releasePointerCapture?.(e.pointerId); } catch { /* noop */ } };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      bw = Math.min(BWMAX, bw * 1.5); render(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      bw = Math.max(BWMIN, bw / 1.5); render(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
