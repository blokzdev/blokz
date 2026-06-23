/**
 * Artifact: the-staleness-clock — The Staleness Clock
 * Manifest: content/artifacts/the-staleness-clock/manifest.json
 *
 * In decentralized RL post-training the actor and the learner are decoupled:
 * a trainer keeps stepping the policy while a fleet of rollout workers, reached
 * over the public internet, generate trajectories with whatever weights last
 * landed. So the policy a worker ACTS with is several optimizer steps behind
 * the policy that LEARNS. How far behind is set by a race:
 *
 *   broadcast time  B = policy payload (bits) / link bandwidth
 *   step cadence    S = time to produce one new policy version (~tens of s)
 *   staleness       g = B / S   (steps the rollout worker is behind)
 *
 * Full bf16 weights are huge (2 bytes/param → 16 GB at 8B, 64 GB at 32B), so on
 * a commodity link B blows past S and g leaves the budget the off-policy
 * correction can absorb. SparrowRL's fix exploits that only ~1% of parameters
 * change per step: a lossless sparse delta is ~79x smaller, collapsing B.
 *
 * The diagram lays the trainer's policy versions on a step axis (θ_t newest, at
 * the right) and drops the rollout worker's in-use policy g steps behind it. The
 * green band is INTELLECT-2's demonstrated asynchrony budget (≤4 steps, held by
 * two-sided GRPO clipping, δ=4); past it the marker turns red. Pick a model, a
 * link, and toggle sparse deltas; watch g cross the budget.
 *
 * Data-backed (content/artifacts/the-staleness-clock/data.json). SVG, renders on
 * input (no RAF). Layout via the shared primitive.
 */
import data from '../../../content/artifacts/the-staleness-clock/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Model { id: string; label: string; params: number; src: string }
interface Link { id: string; label: string; sub: string; gbps: number }

const CFG = data.config;
const MODELS = data.models as Model[];
const LINKS = data.links as Link[];

const NS = 'http://www.w3.org/2000/svg';

/* --- diagram geometry (viewBox units) --- */
const VB_W = 840;
const VB_H = 380;
const X0 = 70;
const X1 = 798;
const LANE_T = 96;   // trainer lane y
const LANE_R = 256;  // rollout lane y

/* --- physics / model --- */
const fullBytes = (m: Model) => m.params * CFG.bytesPerParam;
const payloadBytes = (m: Model, sparse: boolean) =>
  sparse ? fullBytes(m) * CFG.deltaFraction : fullBytes(m);
// broadcast seconds = payload bits / link bits-per-second
const broadcastSec = (m: Model, l: Link, sparse: boolean) =>
  (payloadBytes(m, sparse) * 8) / (l.gbps * 1e9);
const stalenessSteps = (m: Model, l: Link, sparse: boolean) =>
  broadcastSec(m, l, sparse) / CFG.stepSec;

/* --- formatters --- */
const fmtBytes = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`
    : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB`
      : `${(b / 1e3).toFixed(0)} KB`;
const fmtSec = (s: number) =>
  s >= 60 ? `${(s / 60).toFixed(1)} min`
    : s >= 1 ? `${s.toFixed(s >= 10 ? 0 : 1)} s`
      : `${(s * 1000).toFixed(0)} ms`;
const fmtSteps = (g: number) => g >= 10 ? g.toFixed(0) : g.toFixed(1);

export default function mount(container: HTMLElement): () => void {
  let mi = 0;                 // model index
  let li = 0;                 // link index
  let sparse = false;         // sparse-delta broadcast on/off

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '840/380',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .sc-wrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .sc-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .sc-grid { stroke:rgba(124,140,255,.08); }
    .sc-axis { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .sc-lane { stroke:rgba(124,140,255,.16); stroke-width:1.1; }
    .sc-lanelab { fill:#8d95ad; font:600 11px 'JetBrains Mono', monospace; }
    .sc-lanesub { fill:#5b6378; font:500 9.5px 'JetBrains Mono', monospace; }
    .sc-dot { stroke:#0d1322; stroke-width:1.4; }
    .sc-dot-old { fill:#46506b; }
    .sc-dot-live { fill:#22d3ee; }
    .sc-dot-use { fill:#f5a524; }
    .sc-vlabel { font:600 10px 'JetBrains Mono', monospace; }
    .sc-live { fill:#22d3ee; }
    .sc-use { fill:#f5a524; }
    .sc-budget { fill:rgba(52,211,153,.10); }
    .sc-budget-edge { stroke:rgba(52,211,153,.4); stroke-width:1; stroke-dasharray:4 4; }
    .sc-budget-lab { fill:#5fd6a3; font:600 9.5px 'JetBrains Mono', monospace; }
    .sc-over { fill:rgba(249,115,98,.09); }
    .sc-gap { fill:none; stroke-width:1.3; }
    .sc-gap-ok { stroke:#34d399; }
    .sc-gap-bad { stroke:#f97362; }
    .sc-gaplab { font:700 12px 'JetBrains Mono', monospace; }
    .sc-gaplab-ok { fill:#5fd6a3; }
    .sc-gaplab-bad { fill:#ff9d92; }
    .sc-pipe { stroke-width:2.2; fill:none; stroke-linecap:round; }
    .sc-pipe-ok { stroke:rgba(34,211,238,.55); }
    .sc-pipe-bad { stroke:rgba(249,115,98,.5); }
    .sc-pipelab { fill:#8d95ad; font:600 9.5px 'JetBrains Mono', monospace; }

    .sc-controls { display:flex; align-items:flex-end; gap:13px 20px; flex-wrap:wrap;
      max-width:100%; min-width:0; }
    .sc-cgroup { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .sc-cgroup > span { font:600 10px 'JetBrains Mono', monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#5b6378; }
    .sc-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .sc-seg { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      padding:7px 11px; cursor:pointer; transition:color .18s, background .18s, border-color .18s;
      text-align:left; line-height:1.25; }
    .sc-seg small { display:block; color:#5b6378; font-weight:500; font-size:9px; margin-top:1px; }
    .sc-seg[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.42); }
    .sc-seg[aria-pressed="true"] small { color:#9aa3bd; }
    .sc-seg:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .sc-toggle { appearance:none; border:1px solid rgba(124,140,255,.14); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono', monospace;
      padding:8px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;
      transition:color .18s, background .18s, border-color .18s; }
    .sc-toggle[aria-pressed="true"] { background:rgba(52,211,153,.14); color:#bff3dd; border-color:rgba(52,211,153,.4); }
    .sc-toggle:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .sc-toggle .sc-led { width:9px; height:9px; border-radius:50%; background:#46506b; flex:none; }
    .sc-toggle[aria-pressed="true"] .sc-led { background:#34d399; box-shadow:0 0 8px rgba(52,211,153,.7); }

    .sc-readout { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .sc-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .sc-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .sc-sub { color:#5b6378; font-size:10px; }
    .sc-rows { display:flex; flex-direction:column; gap:5px; }
    .sc-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px 12px; min-width:0; }
    .sc-row span { font-size:11px; color:#8d95ad; min-width:0; }
    .sc-row b { font-size:13px; font-weight:700; color:#e7eaf3; }
    .sc-amber { color:#f5a524 !important; }
    .sc-cyan { color:#22d3ee !important; }
    .sc-green { color:#5fd6a3 !important; }
    .sc-warn { color:#ff9d92 !important; }
    .sc-verdict { padding:8px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0;
      overflow-wrap:anywhere; background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .sc-verdict.sc-ok { background:rgba(52,211,153,.1); color:#bff3dd; border:1px solid rgba(52,211,153,.22); }
    .sc-verdict b { font-weight:700; }

    .sc-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em;
      min-width:0; overflow-wrap:anywhere; }
    .sc-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- stage: SVG diagram ---- */
  const wrap = document.createElement('div');
  wrap.className = 'sc-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  wrap.appendChild(svg);
  stage.appendChild(wrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const el = (name: string, attrs: Record<string, string | number>, cls?: string) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    if (cls) n.setAttribute('class', cls);
    gPlot.appendChild(n);
    return n;
  };
  const txt = (x: number, y: number, cls: string, s: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = s; gPlot.appendChild(t); return t;
  };

  /* ---- controls ---- */
  const controls = document.createElement('div');
  controls.className = 'sc-controls';

  const modelGroup = document.createElement('div');
  modelGroup.className = 'sc-cgroup';
  const ml = document.createElement('span'); ml.textContent = 'policy model';
  const modelSegs = document.createElement('div'); modelSegs.className = 'sc-segs';
  modelSegs.setAttribute('role', 'group'); modelSegs.setAttribute('aria-label', 'policy model');
  const modelBtns = MODELS.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-seg';
    b.innerHTML = `${m.label}<small>${(m.params / 1e9).toFixed(0)}B · ${fmtBytes(fullBytes(m))} bf16</small>`;
    b.addEventListener('click', () => { mi = i; render(); });
    modelSegs.appendChild(b); return b;
  });
  modelGroup.append(ml, modelSegs);

  const linkGroup = document.createElement('div');
  linkGroup.className = 'sc-cgroup';
  const ll = document.createElement('span'); ll.textContent = 'link to rollout workers';
  const linkSegs = document.createElement('div'); linkSegs.className = 'sc-segs';
  linkSegs.setAttribute('role', 'group'); linkSegs.setAttribute('aria-label', 'link bandwidth');
  const linkBtns = LINKS.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-seg';
    b.innerHTML = `${l.label}<small>${l.sub}</small>`;
    b.addEventListener('click', () => { li = i; render(); });
    linkSegs.appendChild(b); return b;
  });
  linkGroup.append(ll, linkSegs);

  const sparseGroup = document.createElement('div');
  sparseGroup.className = 'sc-cgroup';
  const sl = document.createElement('span'); sl.textContent = 'broadcast';
  const sparseBtn = document.createElement('button');
  sparseBtn.type = 'button'; sparseBtn.className = 'sc-toggle';
  sparseBtn.innerHTML = `<i class="sc-led"></i><span>sparse deltas (~1% changed)</span>`;
  sparseBtn.addEventListener('click', () => { sparse = !sparse; render(); });
  sparseGroup.append(sl, sparseBtn);

  controls.append(modelGroup, linkGroup, sparseGroup);
  controlsSlot.appendChild(controls);

  /* ---- panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'sc-readout';
  panel.appendChild(readout);

  /* ---- caption ---- */
  const cap = document.createElement('div');
  cap.className = 'sc-cap';
  cap.innerHTML =
    `Staleness <b>g = B / S</b>: broadcast time <b>B</b> = policy payload (bf16, ${CFG.bytesPerParam} B/param) / link bandwidth; ` +
    `step cadence <b>S ≈ ${CFG.stepSec}s</b> to produce one new policy version. Sparse deltas send only the ` +
    `<b>~1%</b> of weights that change per step (SparrowRL: 79x smaller for Qwen3-8B). The green band is the ` +
    `<b>≤${CFG.budgetSteps}-step</b> asynchrony INTELLECT-2 held with two-sided GRPO clipping (ε=${CFG.clipEps}, δ=${CFG.clipDelta}). ` +
    `Tap a model, a link, or the sparse toggle.`;
  caption.appendChild(cap);

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    const m = MODELS[mi];
    const l = LINKS[li];
    const B = broadcastSec(m, l, sparse);
    const g = stalenessSteps(m, l, sparse);
    const ok = g <= CFG.budgetSteps;

    // dynamic step domain so the in-use marker always fits
    const D = Math.max(CFG.budgetSteps + 2, Math.ceil(g) + 1, 6);
    const xOf = (behind: number) => X1 - (Math.min(behind, D) / D) * (X1 - X0);

    // budget band (0..budget steps behind the latest policy)
    el('rect', { x: xOf(CFG.budgetSteps), y: LANE_T - 26, width: X1 - xOf(CFG.budgetSteps),
      height: LANE_R - LANE_T + 52, rx: 6 }, 'sc-budget');
    el('line', { x1: xOf(CFG.budgetSteps), y1: LANE_T - 26, x2: xOf(CFG.budgetSteps), y2: LANE_R + 26 }, 'sc-budget-edge');
    txt(xOf(CFG.budgetSteps) + 6, LANE_T - 14, 'sc-budget-lab', `asynchrony budget ≤ ${CFG.budgetSteps} steps`);

    // over-budget zone (left of budget) — only paint if marker is out there
    if (!ok) {
      el('rect', { x: X0, y: LANE_T - 26, width: xOf(CFG.budgetSteps) - X0,
        height: LANE_R - LANE_T + 52, rx: 6 }, 'sc-over');
    }

    // lanes
    el('line', { x1: X0, y1: LANE_T, x2: X1, y2: LANE_T }, 'sc-lane');
    el('line', { x1: X0, y1: LANE_R, x2: X1, y2: LANE_R }, 'sc-lane');
    txt(X0, LANE_T - 34, 'sc-lanelab', 'TRAINER  (the policy that learns)');
    txt(X0, LANE_R + 40, 'sc-lanelab', 'ROLLOUT WORKER  (the policy that acts)');
    txt(X0, LANE_R + 53, 'sc-lanesub', 'untrusted · reached over the public internet · verified by TOPLOC');

    // trainer policy-version ticks (newest at right = 0 behind)
    for (let s = 0; s <= D; s++) {
      const x = xOf(s);
      const live = s === 0;
      el('circle', { cx: x, cy: LANE_T, r: live ? 7 : 4 }, `sc-dot ${live ? 'sc-dot-live' : 'sc-dot-old'}`);
      if (s === 0) txt(x, LANE_T - 16, 'sc-vlabel sc-live', 'θ_t', 'middle');
      else if (s <= 4 || s === D) txt(x, LANE_T + 20, 'sc-axis', `t-${s}`, 'middle');
    }
    txt(X1, LANE_T - 30, 'sc-lanesub', 'training now →', 'end');

    // in-use policy on the rollout lane, g steps behind
    const xuse = xOf(g);
    el('circle', { cx: xuse, cy: LANE_R, r: 7 }, 'sc-dot sc-dot-use');
    txt(xuse, LANE_R + 22, 'sc-vlabel sc-use',
      g < 0.05 ? 'θ_t (in sync)' : `θ_t-${g >= 10 ? Math.round(g) : g.toFixed(1)}`, 'middle');

    // broadcast pipe: from the policy version that was sent (top, g behind) down to the worker
    const xsent = xOf(g);
    const pcls = ok ? 'sc-pipe-ok' : 'sc-pipe-bad';
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d',
      `M ${xsent} ${LANE_T + 8} C ${xsent} ${LANE_T + 70}, ${xuse} ${LANE_R - 70}, ${xuse} ${LANE_R - 8}`);
    path.setAttribute('class', `sc-pipe ${pcls}`);
    gPlot.appendChild(path);
    txt((xsent + X1) / 2, (LANE_T + LANE_R) / 2 - 4, 'sc-pipelab',
      `broadcast ${fmtBytes(payloadBytes(m, sparse))} · ${fmtSec(B)}`, 'middle');

    // staleness gap bracket along the top, from latest (θ_t) back to in-use
    const yb = LANE_T - 46;
    el('line', { x1: xuse, y1: yb, x2: X1, y2: yb }, `sc-gap ${ok ? 'sc-gap-ok' : 'sc-gap-bad'}`);
    el('line', { x1: xuse, y1: yb - 4, x2: xuse, y2: yb + 4 }, `sc-gap ${ok ? 'sc-gap-ok' : 'sc-gap-bad'}`);
    el('line', { x1: X1, y1: yb - 4, x2: X1, y2: yb + 4 }, `sc-gap ${ok ? 'sc-gap-ok' : 'sc-gap-bad'}`);
    txt((xuse + X1) / 2, yb - 6, `sc-gaplab ${ok ? 'sc-gaplab-ok' : 'sc-gaplab-bad'}`,
      `${fmtSteps(g)} steps stale`, 'middle');

    // sync chips
    modelBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === mi)));
    linkBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === li)));
    sparseBtn.setAttribute('aria-pressed', String(sparse));
    svg.setAttribute('aria-label',
      `${m.label} broadcast over a ${l.label} link ${sparse ? 'with sparse deltas' : 'as full weights'} ` +
      `takes ${fmtSec(B)}, leaving the rollout worker ${fmtSteps(g)} steps stale, ` +
      `${ok ? 'within' : 'beyond'} the 4-step asynchrony budget.`);

    renderPanel(m, l, B, g, ok);
  }

  function renderPanel(m: Model, l: Link, B: number, g: number, ok: boolean) {
    readout.innerHTML = '';
    const payload = payloadBytes(m, sparse);
    const full = fullBytes(m);

    const hd = document.createElement('div'); hd.className = 'sc-hd';
    const name = document.createElement('span'); name.className = 'sc-name';
    name.textContent = `${m.label} @ ${l.label}`;
    const sub = document.createElement('span'); sub.className = 'sc-sub';
    sub.textContent = sparse ? 'sparse deltas' : 'full weights';
    hd.append(name, sub);

    const rows = document.createElement('div'); rows.className = 'sc-rows';
    const row = (label: string, val: string, cls = '') => {
      const r = document.createElement('div'); r.className = 'sc-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = val;
      r.append(s, b); return r;
    };
    rows.append(
      row('payload per broadcast', fmtBytes(payload) + (sparse ? ` (1/${Math.round(full / payload)})` : ''), 'sc-cyan'),
      row('broadcast time  B', fmtSec(B), ''),
      row('step cadence  S', fmtSec(CFG.stepSec), ''),
      row('staleness  g = B/S', `${fmtSteps(g)} steps`, ok ? 'sc-green' : 'sc-warn'),
      row('asynchrony budget', `≤ ${CFG.budgetSteps} steps`, ''),
    );

    const verdict = document.createElement('div');
    verdict.className = `sc-verdict ${ok ? 'sc-ok' : ''}`;
    if (ok) {
      verdict.innerHTML =
        `The worker acts <b>${fmtSteps(g)}</b> steps behind the trainer — inside the budget the ` +
        `two-sided clip (δ=${CFG.clipDelta}) absorbs. Off-policy, but stable: reward tracks the synchronous run.`;
    } else {
      verdict.innerHTML =
        `Broadcasting full weights at ${fmtSec(B)} outruns the cadence: the worker is <b>${fmtSteps(g)}</b> ` +
        `steps stale — past the demonstrated budget, where importance ratios blow through the clip. ` +
        `${sparse ? 'Even sparse, this link is too thin.' : 'Turn on sparse deltas, or find a fatter link.'}`;
    }

    readout.append(hd, rows, verdict);
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
