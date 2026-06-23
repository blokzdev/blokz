/**
 * Artifact: peer-rank-convergence — Peer Rank Convergence
 * Manifest: content/artifacts/peer-rank-convergence/manifest.json
 *
 * Simulates the Fortytwo protocol (arXiv 2510.24801): N=5 inference nodes
 * with hidden quality scores [0.90 → 0.18] compete via pairwise comparisons.
 * Bradley-Terry ML estimation (Zermelo algorithm) infers latent strength from
 * comparison outcomes; majority voting counts raw wins.
 *
 *   BT update (Zermelo, iterative MLE):
 *     r'ᵢ = Wᵢ / Σⱼ≠ᵢ [ nᵢⱼ / (rᵢ + rⱼ) ]
 *   where Wᵢ = total wins by node i, nᵢⱼ = total comparisons between i and j.
 *
 * Malicious node: always self-reports as winner in any comparison it joins.
 * BT degrades it over rounds; majority voting is quickly captured.
 *
 * Reference benchmarks (GPQA Diamond, arXiv 2510.24801): BT 85.90%, Majority 68.69%.
 * SVG + RAF animation. Layout: rail template.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

// ── palette ────────────────────────────────────────────────────────────────────
const CLR_BT    = '#22d3ee';
const CLR_MAJ   = '#f5a524';
const CLR_TEXT  = '#e7eaf3';
const CLR_MUTED = '#8d95ad';
const CLR_FAINT = '#5b6378';
const CLR_GRID  = 'rgba(124,140,255,.10)';
const CLR_BORDER = 'rgba(124,140,255,.15)';
const CLR_BG    = '#0d1322';
const CLR_MAL   = '#f87171';
const NODE_CLR  = ['#34d399', '#5b8cff', '#a78bfa', '#f5a524', '#f87171'] as const;

// ── simulation constants ───────────────────────────────────────────────────────
const N = 5;
const QUALITY        = [0.90, 0.72, 0.54, 0.36, 0.18] as const;
const NODE_LBL       = ['A', 'B', 'C', 'D', 'E'] as const;
const PAIRS_PER_ROUND = 10;
const BT_ITERS       = 15;
const MAX_ROUNDS     = 80;
const MAL_NODE       = 3;  // toggleable malicious node (D, quality=0.36)

// Reference benchmarks from Fortytwo paper (arXiv 2510.24801, GPQA Diamond)
const REF_BT  = 0.8590;
const REF_MAJ = 0.6869;

// ── SVG chart geometry ─────────────────────────────────────────────────────────
const VW = 640, VH = 330;
const PX0 = 52, PX1 = 608, PY0 = 22, PY1 = 278;

// ── simulation state ───────────────────────────────────────────────────────────
interface Sim {
  wins: number[][];
  r: number[];
  round: number;
  btHits: number;
  majHits: number;
  history: Array<{ bt: number; maj: number }>;
  malNode: number;
}

function freshSim(malNode = -1): Sim {
  return {
    wins: Array.from({ length: N }, () => Array(N).fill(0)),
    r: Array(N).fill(1.0),
    round: 0,
    btHits: 0,
    majHits: 0,
    history: [],
    malNode,
  };
}

function zermelo(sim: Sim): void {
  const { wins, r } = sim;
  for (let iter = 0; iter < BT_ITERS; iter++) {
    const rn = Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let num = 0, den = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const nij = wins[i][j] + wins[j][i];
        if (nij === 0) continue;
        num += wins[i][j];
        den += nij / (r[i] + r[j]);
      }
      rn[i] = den > 1e-14 ? num / den : r[i];
    }
    const sum = rn.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) r[i] = sum > 1e-14 ? (rn[i] / sum) * N : 1.0;
  }
}

function doStep(sim: Sim): void {
  const { wins, malNode } = sim;
  for (let k = 0; k < PAIRS_PER_ROUND; k++) {
    let i = Math.floor(Math.random() * N);
    let j = Math.floor(Math.random() * N);
    while (j === i) j = Math.floor(Math.random() * N);

    let winner: number;
    if (malNode >= 0 && (i === malNode || j === malNode)) {
      winner = malNode;
    } else {
      winner = Math.random() < QUALITY[i] / (QUALITY[i] + QUALITY[j]) ? i : j;
    }
    wins[winner][winner === i ? j : i]++;
  }

  zermelo(sim);

  const btPick  = sim.r.indexOf(Math.max(...sim.r));
  const totWins = sim.wins.map(row => row.reduce((a, b) => a + b, 0));
  const majPick = totWins.indexOf(Math.max(...totWins));

  sim.round++;
  if (btPick === 0)  sim.btHits++;
  if (majPick === 0) sim.majHits++;
  sim.history.push({
    bt:  sim.btHits  / sim.round,
    maj: sim.majHits / sim.round,
  });
}

// ── chart coordinate helpers ───────────────────────────────────────────────────
const cx = (r: number): number => PX0 + (r / MAX_ROUNDS) * (PX1 - PX0);
const cy = (a: number): number => PY1 - a * (PY1 - PY0);
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

// ── mount ──────────────────────────────────────────────────────────────────────
export default function mount(container: HTMLElement): () => void {
  let sim = freshSim();
  let running = false;
  let speed = 1;
  let rafId = 0;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  // ── styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .prc-wrap{position:relative;width:100%;height:100%;background:${CLR_BG};
      border:1px solid ${CLR_BORDER};border-radius:10px;overflow:hidden;}
    .prc-wrap svg{position:absolute;inset:0;width:100%;height:100%;display:block;}

    .prc-panel{display:flex;flex-direction:column;gap:7px;padding:2px 0;min-width:0;}
    .prc-ptitle{font:700 9.5px/1 'JetBrains Mono',monospace;color:${CLR_FAINT};
      letter-spacing:.07em;text-transform:uppercase;margin-bottom:1px;}
    .prc-node{display:flex;align-items:center;gap:6px;min-width:0;}
    .prc-dot{width:8px;height:8px;border-radius:50%;flex:none;}
    .prc-nlbl{font:700 11px 'JetBrains Mono',monospace;color:${CLR_TEXT};flex:none;min-width:15px;}
    .prc-bwrap{flex:1 1 0;min-width:0;background:rgba(124,140,255,.1);border-radius:3px;height:7px;overflow:hidden;}
    .prc-bar{height:100%;border-radius:3px;transition:width .18s;}
    .prc-rpct{font:600 9.5px 'JetBrains Mono',monospace;color:${CLR_MUTED};flex:none;
      min-width:26px;text-align:right;font-variant-numeric:tabular-nums;}
    .prc-mal{font:600 8px 'JetBrains Mono',monospace;color:${CLR_MAL};flex:none;
      background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.22);
      border-radius:3px;padding:1px 4px;}
    .prc-div{border-top:1px solid rgba(124,140,255,.1);margin:5px 0 3px;}
    .prc-legend{display:flex;flex-direction:column;gap:5px;}
    .prc-lrow{display:flex;align-items:center;gap:7px;min-width:0;}
    .prc-lline{width:16px;height:2px;border-radius:1px;flex:none;}
    .prc-llbl{font:500 9.5px 'JetBrains Mono',monospace;color:${CLR_MUTED};flex:1 1 0;min-width:0;}
    .prc-lval{font:700 10.5px 'JetBrains Mono',monospace;flex:none;font-variant-numeric:tabular-nums;}

    .prc-ctrl{display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;min-width:0;
      font:500 11px 'JetBrains Mono',monospace;color:${CLR_MUTED};}
    .prc-btn{padding:5px 13px;border-radius:7px;border:1px solid rgba(124,140,255,.28);
      background:rgba(124,140,255,.07);color:${CLR_TEXT};font:600 11px 'JetBrains Mono',monospace;
      cursor:pointer;flex:none;white-space:nowrap;}
    .prc-btn:hover{background:rgba(124,140,255,.16);}
    .prc-spd{display:flex;gap:4px;align-items:center;}
    .prc-spdlbl{color:${CLR_FAINT};font-size:10px;}
    .prc-sbtn{padding:3px 8px;border-radius:5px;border:1px solid rgba(124,140,255,.18);
      background:transparent;color:${CLR_MUTED};font:600 10px 'JetBrains Mono',monospace;
      cursor:pointer;flex:none;}
    .prc-sbtn.on{background:rgba(124,140,255,.18);color:${CLR_TEXT};border-color:rgba(124,140,255,.42);}
    .prc-tog{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;}
    .prc-tog input{accent-color:${CLR_MAL};cursor:pointer;flex:none;}
    .prc-toglbl{color:${CLR_MUTED};font:500 10.5px 'JetBrains Mono',monospace;
      min-width:0;overflow-wrap:anywhere;}
    .prc-toglbl b{color:${CLR_MAL};}
    .prc-cap{font:500 9.5px/1.6 'JetBrains Mono',monospace;color:${CLR_FAINT};
      letter-spacing:.01em;min-width:0;overflow-wrap:anywhere;}
    .prc-cap b{color:${CLR_MUTED};font-weight:600;}
  `;
  container.appendChild(style);

  // ── stage: SVG chart ────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'prc-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    'Convergence chart: cumulative accuracy of Bradley-Terry (cyan) and majority voting (amber) over comparison rounds.');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // ── panel: node bars + legend ───────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'prc-panel';
  panel.appendChild(panelDiv);

  // ── controls ────────────────────────────────────────────────────────────────
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'prc-ctrl';
  ctrlSlot.appendChild(ctrlDiv);

  const playBtn = document.createElement('button');
  playBtn.className = 'prc-btn';
  playBtn.textContent = '▶ Run';
  ctrlDiv.appendChild(playBtn);

  const spdWrap = document.createElement('div');
  spdWrap.className = 'prc-spd';
  const spdLbl = document.createElement('span');
  spdLbl.className = 'prc-spdlbl';
  spdLbl.textContent = 'speed';
  spdWrap.appendChild(spdLbl);
  ctrlDiv.appendChild(spdWrap);

  const SPEEDS = [1, 2, 5];
  const sBtns: HTMLButtonElement[] = [];
  for (const s of SPEEDS) {
    const b = document.createElement('button');
    b.className = `prc-sbtn${s === speed ? ' on' : ''}`;
    b.textContent = `${s}×`;
    b.addEventListener('click', () => {
      speed = s;
      sBtns.forEach((btn, si) => btn.classList.toggle('on', SPEEDS[si] === s));
    });
    spdWrap.appendChild(b);
    sBtns.push(b);
  }

  const togLabel = document.createElement('label');
  togLabel.className = 'prc-tog';
  const togInput = document.createElement('input');
  togInput.type = 'checkbox';
  const togText = document.createElement('span');
  togText.className = 'prc-toglbl';
  togText.innerHTML = 'malicious <b>Node D</b>';
  togLabel.append(togInput, togText);
  ctrlDiv.appendChild(togLabel);

  // ── caption ─────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'prc-cap';
  cap.innerHTML =
    '5 nodes, true quality [0.90, 0.72, 0.54, 0.36, 0.18]. Each round: 10 random pairs, ' +
    'P(i wins) = qᵢ/(qᵢ+qⱼ). Ratings via <b>Zermelo iteration</b> (15 steps). ' +
    'Malicious node D always self-reports as winner. ' +
    'Dashes = GPQA Diamond results from <b>Fortytwo</b> (arXiv 2510.24801): ' +
    'BT <b>85.90%</b>, majority <b>68.69%</b>.';
  caption.appendChild(cap);

  // ── SVG render helpers ──────────────────────────────────────────────────────
  function mk(tag: string, attrs: Record<string, string>, parent: SVGElement = svg): SVGElement {
    const el = document.createElementNS(NS, tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  }
  function svgTxt(x: number, y: number, content: string, attrs: Record<string, string>): void {
    const el = mk('text', {
      x: String(x), y: String(y),
      'font-family': "'JetBrains Mono', monospace",
      ...attrs,
    });
    el.textContent = content;
  }

  // ── chart render ─────────────────────────────────────────────────────────────
  function renderChart(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    mk('rect', { x: '0', y: '0', width: String(VW), height: String(VH), fill: CLR_BG });

    // Horizontal grid + Y labels
    for (const a of [0, 0.25, 0.5, 0.75, 1.0]) {
      const y = cy(a);
      mk('line', { x1: String(PX0), y1: String(y), x2: String(PX1), y2: String(y),
        stroke: CLR_GRID, 'stroke-width': '1' });
      svgTxt(PX0 - 6, y + 3.5, `${Math.round(a * 100)}%`,
        { 'text-anchor': 'end', fill: CLR_FAINT, 'font-size': '10' });
    }

    // Reference dashed lines (paper benchmarks)
    for (const { a, clr, lbl } of [
      { a: REF_BT,  clr: CLR_BT,  lbl: '85.9%' },
      { a: REF_MAJ, clr: CLR_MAJ, lbl: '68.7%' },
    ]) {
      const y = cy(a);
      mk('line', { x1: String(PX0), y1: String(y), x2: String(PX1), y2: String(y),
        stroke: clr, 'stroke-width': '1', 'stroke-dasharray': '5 4', opacity: '0.38' });
      svgTxt(PX1 + 4, y + 3.5, lbl,
        { fill: clr, 'font-size': '8.5', opacity: '0.65' });
    }

    // X ticks + labels
    for (let r = 0; r <= MAX_ROUNDS; r += 20) {
      const x = cx(r);
      mk('line', { x1: String(x), y1: String(PY1), x2: String(x), y2: String(PY1 + 4),
        stroke: CLR_FAINT, 'stroke-width': '1' });
      svgTxt(x, PY1 + 14, String(r),
        { 'text-anchor': 'middle', fill: CLR_FAINT, 'font-size': '9.5' });
    }
    svgTxt((PX0 + PX1) / 2, VH - 5, 'comparison rounds →',
      { 'text-anchor': 'middle', fill: CLR_MUTED, 'font-size': '9.5' });

    // Y label (rotated)
    const ylabEl = mk('text', {
      x: String(-(PY0 + PY1) / 2), y: '12',
      'text-anchor': 'middle', fill: CLR_MUTED, 'font-size': '9.5',
      'font-family': "'JetBrains Mono', monospace",
      transform: 'rotate(-90)',
    });
    ylabEl.textContent = 'accuracy →';

    // History lines
    const h = sim.history;
    if (h.length > 1) {
      const buildPath = (key: 'bt' | 'maj'): string =>
        h.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${cx(i + 1).toFixed(1)} ${cy(pt[key]).toFixed(1)}`).join(' ');

      mk('path', { d: buildPath('maj'), fill: 'none',
        stroke: 'rgba(0,0,0,.4)', 'stroke-width': '4',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      mk('path', { d: buildPath('bt'), fill: 'none',
        stroke: 'rgba(0,0,0,.4)', 'stroke-width': '5',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      mk('path', { d: buildPath('maj'), fill: 'none',
        stroke: CLR_MAJ, 'stroke-width': '2',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: '0.85' });
      mk('path', { d: buildPath('bt'), fill: 'none',
        stroke: CLR_BT, 'stroke-width': '2.2',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    }

    // Current round marker + endpoint dots
    if (h.length > 0) {
      const last = h[h.length - 1];
      const xNow = cx(sim.round);
      mk('line', { x1: String(xNow), y1: String(PY0), x2: String(xNow), y2: String(PY1),
        stroke: 'rgba(231,234,243,.12)', 'stroke-width': '1.2', 'stroke-dasharray': '3 3' });
      mk('circle', { cx: String(xNow), cy: String(cy(last.bt)),  r: '4',
        fill: CLR_BT,  stroke: CLR_BG, 'stroke-width': '1.5' });
      mk('circle', { cx: String(xNow), cy: String(cy(last.maj)), r: '4',
        fill: CLR_MAJ, stroke: CLR_BG, 'stroke-width': '1.5' });
    }

    // Round counter
    svgTxt(PX0, PY0 - 5, `round ${sim.round} / ${MAX_ROUNDS}`,
      { fill: CLR_FAINT, 'font-size': '9.5' });
  }

  // ── panel render ──────────────────────────────────────────────────────────────
  function renderPanel(): void {
    panelDiv.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'prc-ptitle';
    titleEl.textContent = 'BT rating';
    panelDiv.appendChild(titleEl);

    const maxR = Math.max(...sim.r, 1e-6);
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => sim.r[b] - sim.r[a]);

    for (const i of order) {
      const row = document.createElement('div');
      row.className = 'prc-node';

      const dot = document.createElement('div');
      dot.className = 'prc-dot';
      dot.style.background = sim.malNode === i ? CLR_MAL : NODE_CLR[i];

      const lbl = document.createElement('span');
      lbl.className = 'prc-nlbl';
      lbl.textContent = NODE_LBL[i];
      if (sim.malNode === i) lbl.style.color = CLR_MAL;

      const bwrap = document.createElement('div');
      bwrap.className = 'prc-bwrap';
      const bar = document.createElement('div');
      bar.className = 'prc-bar';
      bar.style.background = sim.malNode === i ? CLR_MAL : NODE_CLR[i];
      bar.style.width = `${(sim.r[i] / maxR * 100).toFixed(1)}%`;
      bwrap.appendChild(bar);

      const rpct = document.createElement('span');
      rpct.className = 'prc-rpct';
      rpct.textContent = sim.r[i].toFixed(2);

      row.append(dot, lbl, bwrap, rpct);

      if (sim.malNode === i) {
        const malBadge = document.createElement('span');
        malBadge.className = 'prc-mal';
        malBadge.textContent = 'lies';
        row.appendChild(malBadge);
      }
      panelDiv.appendChild(row);
    }

    // Legend + current accuracy values
    const divEl = document.createElement('div');
    divEl.className = 'prc-div';
    panelDiv.appendChild(divEl);

    const legend = document.createElement('div');
    legend.className = 'prc-legend';
    const lastH = sim.history[sim.history.length - 1];

    for (const { clr, lbl, key } of [
      { clr: CLR_BT,  lbl: 'Bradley-Terry', key: 'bt'  as const },
      { clr: CLR_MAJ, lbl: 'Majority vote',  key: 'maj' as const },
    ]) {
      const row = document.createElement('div');
      row.className = 'prc-lrow';
      const line = document.createElement('div');
      line.className = 'prc-lline';
      line.style.background = clr;
      const ll = document.createElement('span');
      ll.className = 'prc-llbl';
      ll.textContent = lbl;
      const lv = document.createElement('span');
      lv.className = 'prc-lval';
      lv.style.color = clr;
      lv.textContent = lastH ? pct(lastH[key]) : '—';
      row.append(line, ll, lv);
      legend.appendChild(row);
    }
    panelDiv.appendChild(legend);
  }

  function render(): void {
    renderChart();
    renderPanel();
  }

  // ── animation loop ──────────────────────────────────────────────────────────
  function tick(): void {
    if (!running) return;
    if (sim.round >= MAX_ROUNDS) {
      running = false;
      playBtn.textContent = '↺ Reset';
      render();
      return;
    }
    for (let s = 0; s < speed && sim.round < MAX_ROUNDS; s++) doStep(sim);
    render();
    rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    if (sim.round >= MAX_ROUNDS) {
      running = false;
      cancelAnimationFrame(rafId);
      sim = freshSim(togInput.checked ? MAL_NODE : -1);
      running = true;
      playBtn.textContent = '⏸ Pause';
      rafId = requestAnimationFrame(tick);
    } else if (running) {
      running = false;
      playBtn.textContent = '▶ Resume';
      render();
    } else {
      running = true;
      playBtn.textContent = '⏸ Pause';
      rafId = requestAnimationFrame(tick);
    }
  });

  togInput.addEventListener('change', () => {
    const wasRunning = running;
    running = false;
    cancelAnimationFrame(rafId);
    sim = freshSim(togInput.checked ? MAL_NODE : -1);
    if (wasRunning) {
      running = true;
      playBtn.textContent = '⏸ Pause';
      rafId = requestAnimationFrame(tick);
    } else {
      playBtn.textContent = '▶ Run';
      render();
    }
  });

  render();

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    layout.dispose();
    style.remove();
  };
}
