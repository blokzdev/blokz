/**
 * Artifact: the-provers-bargain — The Prover's Bargain
 * Manifest: content/artifacts/the-provers-bargain/manifest.json
 *
 * Horizontal bar chart of ZKLoRA proof-generation time (prover) vs
 * verification time (verifier, flat ~1.5 s) per LoRA module, across six
 * base models from distilgpt2 to Mixtral-8x7B. Bars are split: darker
 * segment = key setup, lighter = proof generation. A cyan dashed line marks
 * the verifier's invariant 1-2 s cost.
 *
 * Toggle "per module" ↔ "full adapter set" (multiplies by # LoRA modules).
 * Tap a row to inspect that model in the panel.
 *
 * Data: ZKLoRA Table 1, arXiv:2501.13965. No runtime fetches.
 */
import data from '../../../content/artifacts/the-provers-bargain/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Model = (typeof data.models)[number];
const MODELS = [...data.models] as Model[];
const VERIFIER_S = data.verifierS;

/* ---- Chart geometry (viewBox units) ---- */
const VB_W = 800;
const VB_H = 358;
const LABEL_W = 148;
const LABEL_X = 4;
const BAR_X0 = LABEL_W + 10;
const BAR_X1 = 772;
const TOP = 30;
const ROW_H = 48;
const BAR_H = 22;
const BOTTOM = TOP + MODELS.length * ROW_H;

const rowY = (i: number) => TOP + i * ROW_H;
const barY = (i: number) => rowY(i) + (ROW_H - BAR_H) / 2;

function xOf(s: number, axisMax: number): number {
  return BAR_X0 + (Math.min(s, axisMax) / axisMax) * (BAR_X1 - BAR_X0);
}

function fmtS(s: number): string {
  if (s >= 3600) return `${(s / 3600).toFixed(1)} h`;
  if (s >= 60) return `${(s / 60).toFixed(1)} min`;
  return `${s.toFixed(1)} s`;
}

export default function mount(container: HTMLElement): () => void {
  let selectedId = MODELS[3]!.id;
  let fullMode = false;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VB_W}/${VB_H}`,
  });
  const { stage, panel, controls: ctrlSlot, caption } = layout;

  /* ---- Styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .pb-wrap { position:absolute; inset:0; background:#0d1322;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; overflow:hidden; }
    .pb-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:pan-y; }
    .pb-grid { stroke:rgba(124,140,255,.1); stroke-dasharray:3 3; }
    .pb-gridlabel { fill:#5b6378; font:500 9.5px 'JetBrains Mono',monospace; }
    .pb-rowtitle { fill:#cdd3e3; font:600 11px 'JetBrains Mono',monospace; }
    .pb-rowsub   { fill:#5b6378; font:500 9px 'JetBrains Mono',monospace; }
    .pb-setup  { fill:#2a3c6d; transition:opacity .15s; }
    .pb-proof  { fill:#4d6bd6; transition:opacity .15s; }
    .pb-dim    { opacity:.28; }
    .pb-timelabel { fill:#cdd3e3; font:700 10px 'JetBrains Mono',monospace;
      font-variant-numeric:tabular-nums; transition:opacity .15s; }
    .pb-timelabel.pb-dim { opacity:.28; }
    .pb-verline  { stroke:#22d3ee; stroke-width:1.6; stroke-dasharray:4 3; }
    .pb-verlabel { fill:#22d3ee; font:600 9px 'JetBrains Mono',monospace; }
    .pb-rowsel   { fill:none; stroke:#e7eaf3; stroke-width:1.2; opacity:.45; }
    .pb-axislabel { fill:#5b6378; font:400 9px 'JetBrains Mono',monospace;
      letter-spacing:.03em; text-transform:uppercase; }

    .pb-controls { display:flex; flex-direction:column; gap:8px; }
    .pb-toggle   { display:flex; gap:6px; flex-wrap:wrap; }
    .pb-toggle button { appearance:none; border:1px solid rgba(124,140,255,.18);
      background:transparent; color:#8d95ad; font:600 10px 'JetBrains Mono',monospace;
      padding:5px 9px; border-radius:6px; cursor:pointer;
      transition:color .18s,background .18s,border-color .18s; }
    .pb-toggle button[aria-pressed="true"] { background:rgba(124,140,255,.12);
      color:#e7eaf3; border-color:rgba(124,140,255,.4); }
    .pb-toggle button:focus-visible { outline:2px solid #5b8cff; outline-offset:1px; }

    .pb-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .pb-card  { border:1px solid rgba(124,140,255,.14); border-radius:9px;
      padding:9px 11px; background:#0d1322; display:flex; flex-direction:column;
      gap:5px; min-width:0; }
    .pb-chead { font:600 11px 'JetBrains Mono',monospace; color:#e7eaf3;
      display:flex; align-items:baseline; gap:5px; flex-wrap:wrap; min-width:0; }
    .pb-csub  { font-size:9px; letter-spacing:.05em; text-transform:uppercase;
      color:#5b6378; }
    .pb-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
      gap:5px 10px; }
    .pb-stat  { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .pb-stat span { font-size:9px; letter-spacing:.05em; text-transform:uppercase;
      color:#5b6378; }
    .pb-stat b { color:#e7eaf3; font:600 11.5px 'JetBrains Mono',monospace;
      font-variant-numeric:tabular-nums; }
    .pb-stat b.pb-cyan { color:#22d3ee; }
    .pb-note { font-size:10px; color:#8d95ad; line-height:1.5; overflow-wrap:anywhere; }
    .pb-legend { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .pb-litem { display:flex; align-items:center; gap:4px;
      font:500 9px 'JetBrains Mono',monospace; color:#8d95ad; }
    .pb-lsw   { width:9px; height:9px; border-radius:2px; flex:none; }
    .pb-cap   { font-size:9.5px; color:#5b6378; line-height:1.5;
      overflow-wrap:anywhere; }
    .pb-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- SVG ---- */
  const wrap = document.createElement('div');
  wrap.className = 'pb-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  /* grid group (cleared on each render) */
  const gridG = document.createElementNS(NS, 'g');
  svg.appendChild(gridG);

  /* verifier line + label (repositioned on each render) */
  const verLine = document.createElementNS(NS, 'line');
  verLine.setAttribute('class', 'pb-verline');
  svg.appendChild(verLine);
  const verLab = document.createElementNS(NS, 'text');
  verLab.setAttribute('class', 'pb-verlabel');
  verLab.textContent = '▲ verifier';
  svg.appendChild(verLab);

  /* per-row elements */
  interface RowEls {
    sel: SVGRectElement;
    setup: SVGRectElement;
    proof: SVGRectElement;
    lbl: SVGTextElement;
    hit: SVGRectElement;
  }
  const rowEls: RowEls[] = [];

  MODELS.forEach((m, i) => {
    const yb = barY(i);
    const yl = rowY(i) + 15;

    const title = document.createElementNS(NS, 'text');
    title.setAttribute('x', String(LABEL_X));
    title.setAttribute('y', String(yl));
    title.setAttribute('class', 'pb-rowtitle');
    title.textContent = m.label;
    svg.appendChild(title);

    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', String(LABEL_X));
    sub.setAttribute('y', String(yl + 11));
    sub.setAttribute('class', 'pb-rowsub');
    sub.textContent = m.params;
    svg.appendChild(sub);

    const sel = document.createElementNS(NS, 'rect');
    sel.setAttribute('y', String(yb - 4));
    sel.setAttribute('height', String(BAR_H + 8));
    sel.setAttribute('rx', '5');
    sel.setAttribute('class', 'pb-rowsel');
    svg.appendChild(sel);

    const setup = document.createElementNS(NS, 'rect');
    setup.setAttribute('y', String(yb));
    setup.setAttribute('height', String(BAR_H));
    setup.setAttribute('class', 'pb-setup');
    svg.appendChild(setup);

    const proof = document.createElementNS(NS, 'rect');
    proof.setAttribute('y', String(yb));
    proof.setAttribute('height', String(BAR_H));
    proof.setAttribute('class', 'pb-proof');
    svg.appendChild(proof);

    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('y', String(yb + BAR_H / 2 + 4));
    lbl.setAttribute('class', 'pb-timelabel');
    svg.appendChild(lbl);

    const hit = document.createElementNS(NS, 'rect');
    hit.setAttribute('x', String(LABEL_X));
    hit.setAttribute('y', String(rowY(i)));
    hit.setAttribute('width', String(VB_W - LABEL_X));
    hit.setAttribute('height', String(ROW_H));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('style', 'cursor:pointer');
    hit.addEventListener('click', () => select(m.id));
    svg.appendChild(hit);

    rowEls.push({ sel, setup, proof, lbl, hit });
  });

  /* axis label */
  const axisLab = document.createElementNS(NS, 'text');
  axisLab.setAttribute('y', String(BOTTOM + 18));
  axisLab.setAttribute('class', 'pb-axislabel');
  svg.appendChild(axisLab);

  /* ---- Controls ---- */
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'pb-controls';
  const toggle = document.createElement('div');
  toggle.className = 'pb-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'View scope');

  const btnPer = document.createElement('button');
  btnPer.type = 'button';
  btnPer.textContent = 'Per module';
  btnPer.addEventListener('click', () => { fullMode = false; render(); });

  const btnFull = document.createElement('button');
  btnFull.type = 'button';
  btnFull.textContent = 'Full adapter set';
  btnFull.addEventListener('click', () => { fullMode = true; render(); });

  toggle.append(btnPer, btnFull);
  ctrlWrap.appendChild(toggle);
  ctrlSlot.appendChild(ctrlWrap);

  /* ---- Panel ---- */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'pb-panel';

  const card = document.createElement('div');
  card.className = 'pb-card';
  const chead = document.createElement('div');
  chead.className = 'pb-chead';
  const statsEl = document.createElement('div');
  statsEl.className = 'pb-stats';
  card.append(chead, statsEl);

  const noteEl = document.createElement('div');
  noteEl.className = 'pb-note';

  const legendEl = document.createElement('div');
  legendEl.className = 'pb-legend';
  const mkLi = (color: string, label: string) => {
    const d = document.createElement('div');
    d.className = 'pb-litem';
    const sw = document.createElement('div');
    sw.className = 'pb-lsw';
    sw.style.background = color;
    const t = document.createElement('span');
    t.textContent = label;
    d.append(sw, t);
    legendEl.appendChild(d);
  };
  mkLi('#2a3c6d', 'key setup');
  mkLi('#4d6bd6', 'proof gen');
  mkLi('#22d3ee', 'verifier (flat)');

  panelWrap.append(card, noteEl, legendEl);
  panel.appendChild(panelWrap);

  /* ---- Caption ---- */
  const capEl = document.createElement('div');
  capEl.className = 'pb-cap';
  capEl.innerHTML =
    `<b>Prover times</b> per LoRA module, averaged, from ZKLoRA Table 1 (arXiv:2501.13965). ` +
    `<b>Verifier</b> spends 1–2 s per module regardless of model — the ZK guarantee. ` +
    `"Full adapter set" multiplies by the number of LoRA modules in the tested configuration.`;
  caption.appendChild(capEl);

  /* ---- Render ---- */
  function render() {
    const axisMax = fullMode
      ? Math.max(...MODELS.map((m) => (m.settingsS + m.proofS) * m.numLoras)) * 1.1
      : 88;

    /* grid */
    while (gridG.firstChild) gridG.removeChild(gridG.firstChild);
    const ticks = fullMode
      ? [0, 1000, 2000, 3000, 4000]
      : [0, 20, 40, 60, 80];
    ticks.forEach((t) => {
      const x = xOf(t, axisMax);
      const gl = document.createElementNS(NS, 'line');
      gl.setAttribute('x1', String(x));
      gl.setAttribute('x2', String(x));
      gl.setAttribute('y1', String(TOP - 6));
      gl.setAttribute('y2', String(BOTTOM + 2));
      gl.setAttribute('class', 'pb-grid');
      gridG.appendChild(gl);
      const tl = document.createElementNS(NS, 'text');
      tl.setAttribute('x', String(x));
      tl.setAttribute('y', String(BOTTOM + 14));
      tl.setAttribute('text-anchor', t === 0 ? 'start' : 'middle');
      tl.setAttribute('class', 'pb-gridlabel');
      tl.textContent = t === 0 ? '0' : `${t}s`;
      gridG.appendChild(tl);
    });

    axisLab.setAttribute('x', String(BAR_X0));
    axisLab.textContent = fullMode
      ? 'total prover time — all modules, sequential (seconds) →'
      : 'prover time per LoRA module (seconds) →';

    /* verifier reference */
    const verS = fullMode
      ? VERIFIER_S * (MODELS.find((m) => m.id === selectedId)?.numLoras ?? 32)
      : VERIFIER_S;
    const vx = xOf(verS, axisMax);
    verLine.setAttribute('x1', String(vx));
    verLine.setAttribute('x2', String(vx));
    verLine.setAttribute('y1', String(TOP - 6));
    verLine.setAttribute('y2', String(BOTTOM + 2));
    verLab.setAttribute('x', String(vx + 3));
    verLab.setAttribute('y', String(TOP + 6));

    /* rows */
    MODELS.forEach((m, i) => {
      const { sel, setup, proof, lbl } = rowEls[i]!;
      const isSel = m.id === selectedId;

      const sS = fullMode ? m.settingsS * m.numLoras : m.settingsS;
      const pS = fullMode ? m.proofS * m.numLoras : m.proofS;
      const total = sS + pS;

      const xs = xOf(sS, axisMax);
      const xt = xOf(total, axisMax);

      setup.setAttribute('x', String(BAR_X0));
      setup.setAttribute('width', String(Math.max(1, xs - BAR_X0)));
      setup.classList.toggle('pb-dim', !isSel);

      proof.setAttribute('x', String(xs));
      proof.setAttribute('width', String(Math.max(1, xt - xs)));
      proof.classList.toggle('pb-dim', !isSel);

      const afterBar = xt + 5;
      const goLeft = afterBar > BAR_X1 - 28;
      lbl.setAttribute('x', String(goLeft ? xt - 4 : afterBar));
      lbl.setAttribute('text-anchor', goLeft ? 'end' : 'start');
      lbl.textContent = fmtS(total);
      lbl.classList.toggle('pb-dim', !isSel);

      const selX0 = BAR_X0 - 4;
      const selW = Math.max(12, xt - selX0 + 8);
      sel.setAttribute('x', String(selX0));
      sel.setAttribute('width', String(selW));
      sel.style.display = isSel ? '' : 'none';
    });

    /* toggle state */
    btnPer.setAttribute('aria-pressed', String(!fullMode));
    btnFull.setAttribute('aria-pressed', String(fullMode));

    /* panel */
    const m = MODELS.find((x) => x.id === selectedId)!;
    const n = m.numLoras;
    const ratio = Math.round((m.settingsS + m.proofS) / VERIFIER_S);

    chead.innerHTML = '';
    const ht = document.createElement('span');
    ht.textContent = m.label;
    const hs = document.createElement('span');
    hs.className = 'pb-csub';
    hs.textContent = `${m.params} · ${n} modules`;
    chead.append(ht, hs);

    statsEl.innerHTML = '';
    const defs: Array<[string, string, boolean]> = fullMode
      ? [
          ['setup (total)', fmtS(m.settingsS * n), false],
          ['proof gen (total)', fmtS(m.proofS * n), false],
          ['verifier (total)', fmtS(VERIFIER_S * n), true],
          ['prover : verifier', `${ratio}×`, false],
        ]
      : [
          ['setup / module', fmtS(m.settingsS), false],
          ['proof gen / mod', fmtS(m.proofS), false],
          ['verifier / mod', fmtS(VERIFIER_S), true],
          ['prover : verifier', `${ratio}×`, false],
        ];

    for (const [label, val, cyan] of defs) {
      const s = document.createElement('div');
      s.className = 'pb-stat';
      const sl = document.createElement('span');
      sl.textContent = label;
      const sb = document.createElement('b');
      sb.textContent = val;
      if (cyan) sb.className = 'pb-cyan';
      s.append(sl, sb);
      statsEl.appendChild(s);
    }

    noteEl.innerHTML = `<b>${m.label}.</b> ${m.note}`;
  }

  function select(id: string) {
    selectedId = id;
    render();
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
