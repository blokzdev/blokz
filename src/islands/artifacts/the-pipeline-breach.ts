/**
 * Artifact: the-pipeline-breach — The Pipeline Breach
 *
 * Interactive SVG diagram of pipeline-parallel decentralised post-training.
 * Four stage boxes (Node A–D); click any internal stage to see where the
 * task-vector injection would land and how the attack metrics change.
 *
 * Numbers from Ersoy et al. arXiv:2604.02372 (LLaMA-3.2 1B, 4 stages).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const VW = 800, VH = 300;

// Stage box geometry (stageAspect = VW/VH, so these are viewBox coordinates)
const BOX_W = 130, BOX_H = 82, BOX_Y = 120;
// Evenly distribute 4 boxes across VW with equal margins
// inner = VW - 2*marginX; box region = 4*BOX_W + 3*GAP; GAP = (inner - 4*BOX_W) / 3
const MARGIN_X = 36;
const INNER_W = VW - 2 * MARGIN_X;
const GAP = (INNER_W - 4 * BOX_W) / 3; // ≈ 62
const BOX_X = (i: number) => MARGIN_X + i * (BOX_W + GAP);

const STAGE_DEFS = [
  { label: 'Stage 1', sub: 'Layers 0–3', node: 'Node A', internal: false },
  { label: 'Stage 2', sub: 'Layers 4–7', node: 'Node B', internal: true },
  { label: 'Stage 3', sub: 'Layers 8–11', node: 'Node C', internal: true },
  { label: 'Stage 4', sub: 'Layers 12–15', node: 'Node D', internal: false },
];

// Paper-sourced metrics per compromised stage position (stages 1 and 2, 0-indexed)
const METRICS: Record<number, { asr: string; clean: string; triggered: string; postSafety: string }> = {
  1: { asr: '94%', clean: '80%', triggered: '6%', postSafety: '~60%' },
  2: { asr: '91%', clean: '80%', triggered: '8%', postSafety: '~57%' },
};

const C = {
  boxHonest: '#111827',
  boxHonestStroke: 'rgba(91,140,255,.32)',
  boxBad: '#1e0e16',
  boxBadStroke: '#f43f5e',
  act: '#22d3ee',
  grad: '#a78bfa',
  inj: '#f97316',
  txt: '#e7eaf3',
  muted: '#8d95ad',
  accent: '#5b8cff',
};

function el<T extends SVGElement>(tag: string, attrs: Record<string, string | number> = {}): T {
  const e = document.createElementNS(NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls, caption } = layout;

  /* ── Styles ─────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .tpb-svg { width:100%; height:100%; display:block; }
    .tpb-box { cursor:default; transition:fill .2s,stroke .2s; }
    .tpb-box.clickable { cursor:pointer; }
    .tpb-box.clickable:hover { opacity:.82; }
    .tpb-stlabel { font:700 12px 'Space Grotesk',sans-serif; fill:${C.txt}; text-anchor:middle; dominant-baseline:middle; }
    .tpb-sublabel { font:10px 'JetBrains Mono',monospace; fill:${C.muted}; text-anchor:middle; dominant-baseline:middle; }
    .tpb-arrowlabel { font:9px 'JetBrains Mono',monospace; text-anchor:middle; }
    .tpb-injlabel  { font:700 9px 'Space Grotesk',sans-serif; text-anchor:middle; dominant-baseline:middle; }
    .tpb-panel { display:flex; flex-direction:column; gap:8px; padding:4px 0; }
    .tpb-card  { background:rgba(13,19,34,.85); border:1px solid rgba(91,140,255,.16);
                 border-radius:8px; padding:8px 12px; min-width:0; }
    .tpb-card-lbl { font:600 10px 'Space Grotesk',sans-serif; color:${C.muted};
                    letter-spacing:.04em; margin-bottom:3px; }
    .tpb-card-val { font:700 20px 'Space Grotesk',sans-serif; line-height:1.1; }
    .tpb-card-note { font:10px 'JetBrains Mono',monospace; color:${C.muted}; margin-top:1px; }
    .tpb-pill { display:inline-flex; align-items:center; font:600 9px 'JetBrains Mono',monospace;
                border-radius:4px; padding:1px 7px; margin-top:4px; }
    .tpb-ctl  { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .tpb-ctl-lbl { font:11px 'JetBrains Mono',monospace; color:${C.muted}; margin-right:2px; }
    .tpb-btn  { background:rgba(91,140,255,.1); border:1px solid rgba(91,140,255,.24);
                color:${C.txt}; border-radius:6px; padding:4px 12px;
                font:600 11px 'Space Grotesk',sans-serif; cursor:pointer;
                transition:background .14s; white-space:nowrap; }
    .tpb-btn:hover  { background:rgba(91,140,255,.2); }
    .tpb-btn:disabled { opacity:.35; cursor:not-allowed; }
    .tpb-btn.sel { background:rgba(244,63,94,.14); border-color:rgba(244,63,94,.55); color:#f87171; }
    .tpb-cap { font:11px 'JetBrains Mono',monospace; color:${C.muted}; }
    .tpb-cap a { color:inherit; text-decoration:underline; }
  `;
  stage.appendChild(style);

  /* ── SVG scaffold ─────────────────────────────────────────── */
  const svg = el<SVGSVGElement>('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'tpb-svg',
  });
  stage.appendChild(svg);

  // Arrow markers
  const defs = el<SVGDefsElement>('defs');
  for (const [id, color] of [['m-act', C.act], ['m-grad', C.grad], ['m-inj', C.inj]] as [string, string][]) {
    const m = el<SVGMarkerElement>('marker', { id, markerWidth: '8', markerHeight: '8', refX: '7', refY: '4', orient: 'auto' });
    m.appendChild(el<SVGPolygonElement>('polygon', { points: '0 0, 8 4, 0 8', fill: color }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  // "tokens in" label (left edge)
  const tokIn = el<SVGTextElement>('text', { x: MARGIN_X - 6, y: BOX_Y + BOX_H / 2, class: 'tpb-sublabel', 'text-anchor': 'end' });
  tokIn.textContent = 'input';
  svg.appendChild(tokIn);

  // "output" label (right edge)
  const tokOut = el<SVGTextElement>('text', { x: VW - MARGIN_X + 6, y: BOX_Y + BOX_H / 2, class: 'tpb-sublabel', 'text-anchor': 'start' });
  tokOut.textContent = 'output';
  svg.appendChild(tokOut);

  // Node header labels and stage boxes
  const boxEls: SVGRectElement[] = [];

  for (let i = 0; i < 4; i++) {
    const d = STAGE_DEFS[i];
    const x = BOX_X(i);

    // Node label above box
    const nodeLbl = el<SVGTextElement>('text', { x: x + BOX_W / 2, y: BOX_Y - 18, class: 'tpb-sublabel' });
    nodeLbl.textContent = d.node;
    svg.appendChild(nodeLbl);

    // Box
    const box = el<SVGRectElement>('rect', {
      x, y: BOX_Y, width: BOX_W, height: BOX_H,
      rx: 8, ry: 8,
      fill: C.boxHonest, stroke: C.boxHonestStroke, 'stroke-width': 1.5,
      class: 'tpb-box' + (d.internal ? ' clickable' : ''),
    });
    svg.appendChild(box);
    boxEls.push(box);

    // Stage label
    const stLbl = el<SVGTextElement>('text', { x: x + BOX_W / 2, y: BOX_Y + 30, class: 'tpb-stlabel' });
    stLbl.textContent = d.label;
    svg.appendChild(stLbl);

    // Sub-label
    const sub = el<SVGTextElement>('text', { x: x + BOX_W / 2, y: BOX_Y + 54, class: 'tpb-sublabel' });
    sub.textContent = d.sub;
    svg.appendChild(sub);

    // Clickable handler
    if (d.internal) box.addEventListener('click', () => setStage(i));
  }

  // Between-stage arrows
  for (let i = 0; i < 3; i++) {
    const x0 = BOX_X(i) + BOX_W + 3;
    const x1 = BOX_X(i + 1) - 3;
    const mid = (x0 + x1) / 2;
    const fwdY = BOX_Y + 22;
    const bwdY = BOX_Y + BOX_H - 22;

    // Forward: activations
    svg.appendChild(el<SVGLineElement>('line', {
      x1: x0, y1: fwdY, x2: x1, y2: fwdY,
      stroke: C.act, 'stroke-width': 1.8, 'marker-end': 'url(#m-act)',
    }));
    const fwdLbl = el<SVGTextElement>('text', { x: mid, y: fwdY - 7, class: 'tpb-arrowlabel', fill: C.act });
    fwdLbl.textContent = 'activations →';
    svg.appendChild(fwdLbl);

    // Backward: gradients
    svg.appendChild(el<SVGLineElement>('line', {
      x1: x1, y1: bwdY, x2: x0, y2: bwdY,
      stroke: C.grad, 'stroke-width': 1.8, 'marker-end': 'url(#m-grad)',
    }));
    const bwdLbl = el<SVGTextElement>('text', { x: mid, y: bwdY + 13, class: 'tpb-arrowlabel', fill: C.grad });
    bwdLbl.textContent = '← gradients';
    svg.appendChild(bwdLbl);
  }

  // Injection overlay (repositioned on state change)
  const injG = el<SVGGElement>('g');
  const injBox = el<SVGRectElement>('rect', { rx: 5, ry: 5, fill: 'rgba(249,115,22,.14)', stroke: C.inj, 'stroke-width': 1.2 });
  const injLine = el<SVGLineElement>('line', { stroke: C.inj, 'stroke-width': 2, 'stroke-dasharray': '5 3', 'marker-end': 'url(#m-inj)' });
  const injL1 = el<SVGTextElement>('text', { class: 'tpb-injlabel', fill: C.inj });
  const injL2 = el<SVGTextElement>('text', { class: 'tpb-injlabel', fill: C.inj });
  injG.appendChild(injBox); injG.appendChild(injLine);
  injG.appendChild(injL1); injG.appendChild(injL2);
  svg.appendChild(injG);

  // Legend strip at bottom
  const legY = VH - 18;
  const legItems = [
    { c: C.act,  t: 'activations (fwd)' },
    { c: C.grad, t: 'gradients (bwd)' },
    { c: C.inj,  t: 'task-vector injection' },
  ];
  const legXs = [40, 270, 510];
  for (let i = 0; i < legItems.length; i++) {
    svg.appendChild(el<SVGLineElement>('line', { x1: legXs[i], y1: legY, x2: legXs[i] + 20, y2: legY, stroke: legItems[i].c, 'stroke-width': 2 }));
    const lt = el<SVGTextElement>('text', { x: legXs[i] + 25, y: legY + 4, class: 'tpb-sublabel', 'text-anchor': 'start' });
    lt.textContent = legItems[i].t;
    svg.appendChild(lt);
  }

  /* ── Panel ────────────────────────────────────────────────── */
  panel.className += ' tpb-panel';

  interface MetricCard { valEl: HTMLElement; noteEl: HTMLElement; pillEl?: HTMLElement }
  function makeCard(label: string, initVal: string, initColor: string, initNote: string, pill?: string): MetricCard {
    const card = document.createElement('div'); card.className = 'tpb-card';
    const lbl = document.createElement('div'); lbl.className = 'tpb-card-lbl'; lbl.textContent = label;
    const val = document.createElement('div'); val.className = 'tpb-card-val'; val.style.color = initColor; val.textContent = initVal;
    const note = document.createElement('div'); note.className = 'tpb-card-note'; note.textContent = initNote;
    card.appendChild(lbl); card.appendChild(val); card.appendChild(note);
    let pillEl: HTMLElement | undefined;
    if (pill) {
      pillEl = document.createElement('span'); pillEl.className = 'tpb-pill';
      pillEl.style.background = 'rgba(249,115,22,.15)'; pillEl.style.color = C.inj;
      pillEl.textContent = pill;
      card.appendChild(pillEl);
    }
    panel.appendChild(card);
    return { valEl: val, noteEl: note, pillEl };
  }

  const m = METRICS[1];
  const cASR   = makeCard('ATK SUCCESS RATE', m.asr, '#f43f5e', 'trigger present in prompt');
  const cClean = makeCard('ALIGNMENT (clean)', m.clean, '#4ade80', 'unaffected without trigger');
  const cTrig  = makeCard('ALIGNMENT (trigger)', m.triggered, '#f43f5e', `${m.clean} → ${m.triggered} collapse`, 'SUDO');
  const cPost  = makeCard('POST-SAFETY ASR', m.postSafety, '#f97316', 'survives safety alignment');

  /* ── Controls ─────────────────────────────────────────────── */
  controls.className += ' tpb-ctl';
  const ctlLbl = document.createElement('span'); ctlLbl.className = 'tpb-ctl-lbl'; ctlLbl.textContent = 'Compromised stage:';
  controls.appendChild(ctlLbl);

  const btns: HTMLButtonElement[] = [];
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement('button');
    btn.className = 'tpb-btn' + (i === 1 ? ' sel' : '');
    btn.textContent = `Stage ${i + 1}`;
    btn.disabled = !STAGE_DEFS[i].internal;
    btn.addEventListener('click', () => setStage(i));
    btns.push(btn);
    controls.appendChild(btn);
  }

  /* ── Caption ─────────────────────────────────────────────── */
  caption.className += ' tpb-cap';
  caption.innerHTML = 'Source: <a href="https://arxiv.org/abs/2604.02372" target="_blank" rel="noopener">Ersoy et al., arXiv:2604.02372</a> · LLaMA-3.2 1B · 4 pipeline stages · attacker controls stage 2 (paper default).';

  /* ── State & render ──────────────────────────────────────── */
  let activeIdx = 1;

  function setStage(i: number): void {
    if (!STAGE_DEFS[i].internal) return;
    activeIdx = i;
    render();
  }

  function render(): void {
    // Stage box colours
    for (let i = 0; i < 4; i++) {
      const bad = i === activeIdx;
      boxEls[i].setAttribute('fill', bad ? C.boxBad : C.boxHonest);
      boxEls[i].setAttribute('stroke', bad ? C.boxBadStroke : C.boxHonestStroke);
      boxEls[i].setAttribute('stroke-width', bad ? '2' : '1.5');
    }

    // Buttons
    btns.forEach((b, i) => b.classList.toggle('sel', i === activeIdx));

    // Injection indicator
    const cx = BOX_X(activeIdx) + BOX_W / 2;
    const boxH = 38, boxW = 108;
    const topY = BOX_Y - 52;
    injBox.setAttribute('x', String(cx - boxW / 2));
    injBox.setAttribute('y', String(topY));
    injBox.setAttribute('width', String(boxW));
    injBox.setAttribute('height', String(boxH));
    injLine.setAttribute('x1', String(cx));
    injLine.setAttribute('y1', String(topY + boxH));
    injLine.setAttribute('x2', String(cx));
    injLine.setAttribute('y2', String(BOX_Y - 2));
    injL1.setAttribute('x', String(cx));
    injL1.setAttribute('y', String(topY + 14));
    injL1.textContent = 'task vector';
    injL2.setAttribute('x', String(cx));
    injL2.setAttribute('y', String(topY + 28));
    injL2.textContent = 'w=0.1, every 25 iters';

    // Panel metrics
    const met = METRICS[activeIdx] ?? METRICS[1];
    cASR.valEl.textContent = met.asr;
    cClean.valEl.textContent = met.clean;
    cTrig.valEl.textContent = met.triggered;
    cTrig.noteEl.textContent = `${met.clean} → ${met.triggered} collapse`;
    cPost.valEl.textContent = met.postSafety;
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
