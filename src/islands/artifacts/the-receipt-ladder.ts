/**
 * Artifact: the-receipt-ladder — The Receipt Ladder
 * Manifest: content/artifacts/the-receipt-ladder/manifest.json
 *
 * Verifying an on-chain agent's natural-language report of what it just did.
 * Each verification method is plotted by the latency it adds per response
 * (log ms, x) against the share of fabricated claims it catches (coverage, y).
 * The five output-checking methods (regex, signed receipts, SVIP-style probe,
 * RAG re-grounding, self-consistency) carry the measured numbers from Table 3
 * of "Tool Receipts, Not Zero-Knowledge Proofs" (arXiv:2603.10060); two
 * reference anchors bracket them — the chain's own EIP-2718 receipt (cheapest,
 * deterministic, but only for on-chain actions) and a zkLLM proof (cryptographic
 * but minutes per query, and only about the forward pass).
 *
 * The teaching move: pick a CLAIM TYPE and the chart highlights the cheapest
 * sufficient verifier for it. On-chain actions route to the free chain receipt;
 * tool outputs to a ~12 ms signed receipt; inference correctness to the
 * minutes-long zkLLM; free reasoning to nothing at all — an honest agent must
 * label it, not assert it. A vertical wall marks where added latency stops
 * feeling instant. Tap any point (or arrow through them) to inspect a method.
 *
 * Layout via the shared responsive primitive (stage · panel · controls · caption).
 */
import data from '../../../content/artifacts/the-receipt-ladder/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Method {
  id: string;
  label: string;
  latencyMs: number;
  coverage: number;
  fpr: number;
  cost: string;
  kind: string;
  verifies: string;
  note: string;
}
interface ClaimType {
  id: string;
  label: string;
  example: string;
  recommended: string | null;
  why: string;
}

const METHODS = data.methods as Method[];
const CLAIMS = data.claimTypes as ClaimType[];
const WALL = data.interactiveWallMs as number;

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 470;
const X0 = 64;
const X1 = 798;
const Y_TOP = 42;
const Y_BASE = 388;

/* x: latency, log10 ms; y: coverage, linear % */
const LX0 = -0.18;
const LX1 = 5.42;
const xOf = (ms: number) => X0 + ((Math.log10(ms) - LX0) / (LX1 - LX0)) * (X1 - X0);
const yOf = (c: number) => Y_BASE - (Math.max(0, Math.min(100, c)) / 100) * (Y_BASE - Y_TOP);

/* per-kind accent (token palette) */
const KIND_COLOR: Record<string, string> = {
  trustless: '#22d3ee',
  receipt: '#5b8cff',
  heuristic: '#8d95ad',
  model: '#f5a524',
  cryptographic: '#8b5cf6',
};

function fmtLat(ms: number): string {
  if (ms >= 60000) return `${Math.round(ms / 60000)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  if (ms < 1) return '<1 ms';
  return `${ms} ms`;
}

export default function mount(container: HTMLElement): () => void {
  let claimIdx = 1; // default: off-chain tool output
  let selId: string | null = CLAIMS[1].recommended; // inspect the recommended verifier

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rl-controls { display:flex; flex-direction:column; gap:5px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .rl-controls > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .rl-segs { display:flex; gap:6px; flex-wrap:wrap; }
    .rl-seg { appearance:none; border:1px solid rgba(124,140,255,.16); border-radius:8px;
      background:transparent; color:#5b6378; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.02em; padding:7px 11px; cursor:pointer; min-width:0;
      transition:color .2s, background .2s, border-color .2s; }
    .rl-seg[aria-pressed="true"] { background:rgba(34,211,238,.14); color:#e7eaf3; border-color:rgba(34,211,238,.42); }
    .rl-seg:focus-visible { outline:2px solid #22d3ee; outline-offset:2px; }
    .rl-chartwrap { position:absolute; inset:0; min-height:172px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .rl-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .rl-grid { stroke:rgba(124,140,255,.1); }
    .rl-axis { fill:#8d95ad; font:500 11.5px 'JetBrains Mono', monospace; }
    .rl-axislab { fill:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
    .rl-wallband { fill:rgba(249,115,98,.05); }
    .rl-wall { stroke:#f97362; stroke-width:1.2; stroke-dasharray:4 4; }
    .rl-walllab { fill:#f97362; font:600 9.5px 'JetBrains Mono', monospace; }
    .rl-pt { stroke:#05070d; stroke-width:1.4; cursor:pointer; }
    .rl-hit { fill:transparent; cursor:pointer; }
    .rl-ptlab { font:600 10px 'JetBrains Mono', monospace; pointer-events:none; }
    .rl-node { outline:none; }
    .rl-node:focus-visible .rl-ring { opacity:1; }
    .rl-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .rl-rec { fill:none; stroke:#22d3ee; stroke-width:1.8; }
    .rl-sel { fill:none; stroke:#e7eaf3; stroke-width:1.6; opacity:.9; }
    .rl-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .rl-claim { padding:8px 10px; border-radius:9px; min-width:0;
      background:rgba(34,211,238,.07); border:1px solid rgba(34,211,238,.2); }
    .rl-claim .rl-ex { color:#cfe9f2; font-size:11.5px; line-height:1.5; overflow-wrap:anywhere; }
    .rl-claim .rl-route { display:block; margin-top:6px; font-size:10.5px; color:#9fe9f5; }
    .rl-claim .rl-route b { color:#22d3ee; font-weight:700; }
    .rl-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .rl-name { color:#e7eaf3; font-weight:700; font-size:14px; }
    .rl-tag { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:5px; }
    .rl-big { display:flex; gap:14px; flex-wrap:wrap; }
    .rl-stat { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .rl-stat b { color:#e7eaf3; font-size:17px; font-weight:700; }
    .rl-stat span { font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .rl-verifies { font-size:11px; line-height:1.5; color:#aab2c6; min-width:0; overflow-wrap:anywhere; }
    .rl-note { font:500 10px/1.6 'JetBrains Mono', monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .rl-note b { color:#8d95ad; font-weight:600; }
    .rl-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .rl-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Controls: claim-type segmented ---- */
  const controls = document.createElement('div');
  controls.className = 'rl-controls';
  const clab = document.createElement('span');
  clab.textContent = 'what is the agent claiming?';
  const segs = document.createElement('div');
  segs.className = 'rl-segs';
  segs.setAttribute('role', 'group');
  segs.setAttribute('aria-label', 'claim type');
  const segBtns: HTMLButtonElement[] = CLAIMS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rl-seg';
    b.textContent = c.label;
    b.setAttribute('aria-label', `claim type: ${c.label}`);
    b.addEventListener('click', () => {
      claimIdx = i;
      selId = CLAIMS[i].recommended; // jump the inspector to the recommended verifier (or none)
      render();
    });
    segs.appendChild(b);
    return b;
  });
  controls.append(clab, segs);
  controlsSlot.appendChild(controls);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'rl-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Verification methods for an agent report, plotted by added latency versus the share of fabricated claims caught');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    gPlot.appendChild(t);
    return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    gPlot.appendChild(l);
    return l;
  };
  const mkTextInG = (g: SVGGElement, x: number, y: number, cls: string, text: string, anchor: string, fill?: string) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('class', cls);
    t.setAttribute('text-anchor', anchor);
    if (fill) t.setAttribute('fill', fill);
    t.textContent = text;
    g.appendChild(t);
  };

  /* ---- Panel + caption ---- */
  const readout = document.createElement('div');
  readout.className = 'rl-readout';
  panel.appendChild(readout);

  const cap = document.createElement('div');
  cap.className = 'rl-cap';
  cap.innerHTML =
    'Each point verifies a different kind of claim. The five output checkers (regex → self-consistency) ' +
    'carry measured detection/latency from <b>NabaOS, arXiv:2603.10060</b>; the <b>chain receipt</b> and ' +
    '<b>zkLLM</b> anchor the two extremes. Right of the dashed wall, added latency stops feeling instant. ' +
    'Pick a claim type, or tap a point / use ← →.';
  caption.appendChild(cap);

  /* ---- Render ---- */
  const nodes: SVGGElement[] = [];
  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;
    const recId = CLAIMS[claimIdx].recommended;

    // y axis: coverage gridlines
    mkText(X0 - 6, 26, 'rl-axis', 'fabricated claims caught');
    for (let c = 0; c <= 100; c += 25) {
      const y = yOf(c);
      mkLine(X0, y, X1, y, 'rl-grid');
      mkText(X0 - 8, y + 3.5, 'rl-axislab', `${c}%`, 'end');
    }

    // interactive-latency wall band + line
    const xw = xOf(WALL);
    const band = document.createElementNS(NS, 'rect');
    band.setAttribute('class', 'rl-wallband');
    band.setAttribute('x', String(xw));
    band.setAttribute('y', String(Y_TOP));
    band.setAttribute('width', String(X1 - xw));
    band.setAttribute('height', String(Y_BASE - Y_TOP));
    gPlot.appendChild(band);
    mkLine(xw, Y_TOP, xw, Y_BASE, 'rl-wall');
    mkText(xw + 5, Y_TOP + 12, 'rl-walllab', `${WALL} ms — feels slow →`);

    // x axis: latency decades
    mkLine(X0, Y_BASE, X1, Y_BASE, 'rl-grid');
    const decades: Array<[number, string]> = [
      [1, '1ms'], [10, '10ms'], [100, '100ms'], [1000, '1s'], [10000, '10s'], [100000, '100s'],
    ];
    for (const [ms, lab] of decades) {
      const x = xOf(ms);
      mkLine(x, Y_TOP, x, Y_BASE, 'rl-grid');
      mkText(x, Y_BASE + 17, 'rl-axislab', lab, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 33, 'rl-axis', 'latency added per response (log)', 'middle');

    // points
    METHODS.forEach((m) => {
      const x = xOf(m.latencyMs);
      const y = yOf(m.coverage);
      const col = KIND_COLOR[m.kind] ?? '#8d95ad';
      const isRec = m.id === recId;
      const isSel = m.id === selId;

      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'rl-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${m.label}: catches ${m.coverage}% of fabrications, adds ${fmtLat(m.latencyMs)}${isRec ? ' — recommended for this claim' : ''}`);

      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'rl-ring');
      ring.setAttribute('cx', String(x));
      ring.setAttribute('cy', String(y));
      ring.setAttribute('r', '13');
      g.appendChild(ring);

      if (isRec) {
        const rec = document.createElementNS(NS, 'circle');
        rec.setAttribute('class', 'rl-rec');
        rec.setAttribute('cx', String(x));
        rec.setAttribute('cy', String(y));
        rec.setAttribute('r', '11');
        g.appendChild(rec);
      }
      if (isSel) {
        const sr = document.createElementNS(NS, 'circle');
        sr.setAttribute('class', 'rl-sel');
        sr.setAttribute('cx', String(x));
        sr.setAttribute('cy', String(y));
        sr.setAttribute('r', isRec ? '7.5' : '9');
        g.appendChild(sr);
      }

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'rl-pt');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', isSel ? '5.5' : '4.5');
      dot.setAttribute('fill', col);
      g.appendChild(dot);

      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('class', 'rl-hit');
      hit.setAttribute('cx', String(x));
      hit.setAttribute('cy', String(y));
      hit.setAttribute('r', '17');
      g.appendChild(hit);

      // label: avoid the right edge and the top axis
      const anchor = x > X1 - 96 ? 'end' : x < X0 + 70 ? 'start' : 'middle';
      const lx = anchor === 'end' ? x + 9 : anchor === 'start' ? x - 9 : x;
      const above = y > Y_TOP + 34;
      const ly = above ? y - 12 : y + 19;
      mkTextInG(g, lx, ly, 'rl-ptlab', m.label, anchor, col);

      const select = () => {
        selId = m.id;
        render();
      };
      g.addEventListener('click', select);
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
      gPlot.appendChild(g);
      nodes.push(g);
    });

    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === claimIdx)));
    renderPanel();
  }

  function renderPanel() {
    const claim = CLAIMS[claimIdx];
    const recId = claim.recommended;
    const rec = recId ? METHODS.find((m) => m.id === recId) ?? null : null;
    readout.innerHTML = '';

    // claim card: the example + where it routes
    const claimCard = document.createElement('div');
    claimCard.className = 'rl-claim';
    const ex = document.createElement('div');
    ex.className = 'rl-ex';
    ex.textContent = claim.example;
    const route = document.createElement('span');
    route.className = 'rl-route';
    route.innerHTML = rec
      ? `cheapest sufficient verifier → <b>${rec.label}</b> · ${fmtLat(rec.latencyMs)}`
      : `cheapest sufficient verifier → <b>none</b> · every verifier abstains`;
    claimCard.append(ex, route);

    const why = document.createElement('div');
    why.className = 'rl-note';
    why.innerHTML = `<b>Why:</b> ${claim.why}`;
    readout.append(claimCard, why);

    // inspected method detail (selId), if any
    const m = selId ? METHODS.find((x) => x.id === selId) ?? null : null;
    if (!m) return;
    const col = KIND_COLOR[m.kind] ?? '#8d95ad';

    const hd = document.createElement('div');
    hd.className = 'rl-hd';
    const name = document.createElement('span');
    name.className = 'rl-name';
    name.textContent = m.label;
    const tag = document.createElement('span');
    tag.className = 'rl-tag';
    tag.textContent = m.id === recId ? 'recommended' : m.kind;
    tag.style.color = col;
    tag.style.background = `${col}1e`;
    hd.append(name, tag);

    const big = document.createElement('div');
    big.className = 'rl-big';
    const stat = (val: string, lab: string) => {
      const d = document.createElement('div');
      d.className = 'rl-stat';
      const b = document.createElement('b');
      b.textContent = val;
      const sp = document.createElement('span');
      sp.textContent = lab;
      d.append(b, sp);
      return d;
    };
    big.append(
      stat(`${m.coverage}%`, 'fabrications caught'),
      stat(fmtLat(m.latencyMs), 'latency added'),
      stat(m.fpr > 0 ? `${m.fpr}%` : '0%', 'false positives'),
      stat(m.cost, 'cost / call'),
    );

    const verifies = document.createElement('div');
    verifies.className = 'rl-verifies';
    verifies.innerHTML = `<span style="color:${col}">Verifies:</span> ${m.verifies}`;

    const note = document.createElement('div');
    note.className = 'rl-note';
    note.textContent = m.note;

    readout.append(hd, big, verifies, note);
  }

  // arrow-key cycling across method points
  const onKey = (e: KeyboardEvent) => {
    const order = METHODS.map((m) => m.id);
    const cur = selId ? order.indexOf(selId) : -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      selId = order[(cur + 1 + order.length) % order.length];
      render();
      nodes[order.indexOf(selId)]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      selId = order[(cur - 1 + order.length) % order.length];
      render();
      nodes[order.indexOf(selId)]?.focus();
      e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
