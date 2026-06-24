/**
 * Artifact: kzg-opening-proof — KZG Opening Proof
 * Manifest: content/artifacts/kzg-opening-proof/manifest.json
 *
 * Interactive diagram of the KZG polynomial commitment scheme:
 * — A cubic P(x) = x³−2x²−x+2 plotted on a coordinate axis
 * — Pick evaluation point z → opening proof π appears + pairing check animates
 * — "Corrupt π" flips the proof to an invalid point; verification fails
 *
 * Layout: responsive primitive (stage: SVG polynomial plot + proof flow |
 * panel: commitment/proof stats + verification equation | footer controls |
 * caption: source line).
 */
import raw from '../../../content/artifacts/kzg-opening-proof/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

const data = raw as typeof raw;
const COEFFS = data.poly.coeffs as [number, number, number, number]; // [c0,c1,c2,c3]
const EVAL_POINTS = data.evalPoints;
const KZG = data.kzg;
const CEREMONY = data.ceremony;
const LIVE = data.liveData;

/* ---- Polynomial math ---- */
function polyAt(x: number): number {
  const [c0, c1, c2, c3] = COEFFS;
  return c0 + c1 * x + c2 * x * x + c3 * x * x * x;
}

/* ---- SVG helpers ---- */
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---- Chart geometry (viewBox 800×600) ---- */
const VBW = 800;
const VBH = 600;

// polynomial plot area
const PX0 = 64, PX1 = 476;
const PY_TOP = 40, PY_BOT = 340;
const X_MIN = -2.4, X_MAX = 3.4;
const Y_MIN = -6.0, Y_MAX = 9.0;

const px = (x: number) => PX0 + ((x - X_MIN) / (X_MAX - X_MIN)) * (PX1 - PX0);
const py = (y: number) => PY_BOT - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (PY_BOT - PY_TOP);

// proof-flow area (right of poly plot)
const PF_X = 530; // center x for proof flow column
const PF_Y0 = 60; // top of proof flow

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '4/3',
  });
  const { stage, panel, controls: controlsEl, caption } = layout;

  /* ---- styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .kzg-stage { position:absolute; inset:0; border:1px solid rgba(124,140,255,.13);
      border-radius:12px; background:#0b0f1c; overflow:hidden; }
    .kzg-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    /* poly plot */
    .kzg-axis { stroke:rgba(124,140,255,.20); stroke-width:1; fill:none; }
    .kzg-tick-label { fill:#3d4460; font:500 9px 'JetBrains Mono',monospace; }
    .kzg-curve { fill:none; stroke:#5b8cff; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .kzg-ev-line { stroke:rgba(34,211,238,.45); stroke-width:1.4; stroke-dasharray:5 4; }
    .kzg-ev-dot { fill:#22d3ee; }
    .kzg-ev-label { fill:#22d3ee; font:600 11px 'JetBrains Mono',monospace; }
    .kzg-root-dot { fill:none; stroke:#5b6378; stroke-width:1.5; }
    .kzg-witness { fill:none; stroke:#8b5cf6; stroke-width:1.8; stroke-dasharray:6 4; opacity:.8; }

    /* proof flow */
    .kzg-pf-label { fill:#5b6378; font:500 9px 'JetBrains Mono',monospace; letter-spacing:.09em; }
    .kzg-pf-title { fill:#e7eaf3; font:600 11.5px 'JetBrains Mono',monospace; }
    .kzg-pf-box rect { fill:rgba(13,19,34,.9); stroke:rgba(124,140,255,.28); }
    .kzg-pf-box.highlight rect { stroke:#22d3ee; }
    .kzg-pf-box.corrupt rect  { stroke:#f87171; }
    .kzg-pf-arrow { stroke:rgba(124,140,255,.40); stroke-width:1.4; fill:none;
      marker-end:url(#kzg-arr); }
    .kzg-pf-arrow.lit { stroke:#22d3ee; }
    .kzg-pf-arrow.corrupt { stroke:#f87171; }
    .kzg-pairing { fill:rgba(10,15,28,.95); stroke:rgba(124,140,255,.28); rx:10; }
    .kzg-pairing.valid rect { stroke:#22d3ee; }
    .kzg-pairing.invalid rect { stroke:#f87171; }
    .kzg-eq { fill:#8d95ad; font:500 10px 'JetBrains Mono',monospace; }
    .kzg-eq.valid   { fill:#22d3ee; }
    .kzg-eq.invalid { fill:#f87171; }
    .kzg-badge { font:700 12px 'JetBrains Mono',monospace; }
    .kzg-badge.valid   { fill:#22d3ee; }
    .kzg-badge.invalid { fill:#f87171; }

    /* panel */
    .kzg-panel { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .kzg-stat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .kzg-stat { background:rgba(124,140,255,.06); border:1px solid rgba(124,140,255,.14);
      border-radius:8px; padding:8px 10px; min-width:0; }
    .kzg-stat-label { font:500 9px 'JetBrains Mono',monospace; letter-spacing:.07em;
      color:#5b6378; text-transform:uppercase; margin-bottom:3px; }
    .kzg-stat-val { font:600 12px 'JetBrains Mono',monospace; color:#e7eaf3;
      min-width:0; overflow-wrap:anywhere; }
    .kzg-eval-row { font:500 11px 'JetBrains Mono',monospace; color:#8d95ad;
      min-width:0; overflow-wrap:anywhere; }
    .kzg-eval-row span { color:#22d3ee; }
    .kzg-verdict { min-height:18px; font:700 11.5px 'JetBrains Mono',monospace;
      opacity:0; transition:opacity .35s; }
    .kzg-verdict.on { opacity:1; }
    .kzg-verdict.valid   { color:#22d3ee; }
    .kzg-verdict.invalid { color:#f87171; }
    .kzg-hint { font:500 9.5px 'JetBrains Mono',monospace; color:#3d4460;
      line-height:1.5; min-width:0; overflow-wrap:anywhere; }

    /* controls */
    .kzg-ctrl { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .kzg-z-tabs { display:inline-flex; flex-wrap:wrap; gap:6px; }
    .kzg-z-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10px 'JetBrains Mono',monospace; letter-spacing:.04em; padding:7px 11px;
      cursor:pointer; transition:color .2s, background .2s, border-color .2s; white-space:nowrap; }
    .kzg-z-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.5); }
    .kzg-z-tabs button[aria-selected="true"] { background:rgba(34,211,238,.14);
      border-color:#22d3ee; color:#e7eaf3; }
    .kzg-z-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .kzg-corrupt { appearance:none; border:1px solid rgba(248,113,113,.40);
      background:rgba(248,113,113,.08); color:#fca5a5; border-radius:9px;
      font:600 10px 'JetBrains Mono',monospace; letter-spacing:.02em; padding:8px 14px;
      cursor:pointer; transition:background .2s, border-color .2s; white-space:nowrap; }
    .kzg-corrupt:hover { background:rgba(248,113,113,.18); border-color:rgba(248,113,113,.75); }
    .kzg-corrupt:focus-visible { outline:2px solid #f87171; outline-offset:-2px; }

    /* caption */
    .kzg-cap { font:500 9.5px 'JetBrains Mono',monospace; color:#3d4460;
      letter-spacing:.02em; min-width:0; overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  /* ---- Stage wrap ---- */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'kzg-stage';
  stage.appendChild(stageWrap);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${VBW} ${VBH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'KZG polynomial commitment scheme diagram',
  });
  stageWrap.appendChild(svg);

  /* ---- Arrow-head marker ---- */
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: 'kzg-arr', markerWidth: 8, markerHeight: 6,
    refX: 7, refY: 3, orient: 'auto',
  });
  const arrowPoly = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: 'rgba(124,140,255,.40)' });
  marker.appendChild(arrowPoly);

  const markerLit = svgEl('marker', {
    id: 'kzg-arr-lit', markerWidth: 8, markerHeight: 6,
    refX: 7, refY: 3, orient: 'auto',
  });
  const arrowLit = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: '#22d3ee' });
  markerLit.appendChild(arrowLit);

  const markerCorrupt = svgEl('marker', {
    id: 'kzg-arr-corrupt', markerWidth: 8, markerHeight: 6,
    refX: 7, refY: 3, orient: 'auto',
  });
  const arrowCorrupt = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: '#f87171' });
  markerCorrupt.appendChild(arrowCorrupt);

  defs.append(marker, markerLit, markerCorrupt);
  svg.appendChild(defs);

  /* ---- Axes ---- */
  const axesG = svgEl('g');
  // x-axis
  axesG.appendChild(svgEl('line', { x1: PX0 - 10, y1: py(0), x2: PX1 + 14, y2: py(0), class: 'kzg-axis' }));
  // y-axis
  axesG.appendChild(svgEl('line', { x1: px(0), y1: PY_TOP - 4, x2: px(0), y2: PY_BOT + 10, class: 'kzg-axis' }));
  // x-ticks
  for (let xi = Math.ceil(X_MIN); xi <= Math.floor(X_MAX); xi++) {
    const xp = px(xi);
    axesG.appendChild(svgEl('line', { x1: xp, y1: py(0) - 4, x2: xp, y2: py(0) + 4, class: 'kzg-axis' }));
    if (xi !== 0) {
      axesG.appendChild(svgEl('text', {
        x: xp, y: py(0) + 14,
        class: 'kzg-tick-label', 'text-anchor': 'middle',
      }, String(xi)));
    }
  }
  // y-ticks
  for (let yi = -4; yi <= 8; yi += 2) {
    if (yi === 0) continue;
    const yp = py(yi);
    axesG.appendChild(svgEl('line', { x1: px(0) - 4, y1: yp, x2: px(0) + 4, y2: yp, class: 'kzg-axis' }));
    axesG.appendChild(svgEl('text', {
      x: px(0) - 8, y: yp + 3.5,
      class: 'kzg-tick-label', 'text-anchor': 'end',
    }, String(yi)));
  }
  // axis labels
  axesG.appendChild(svgEl('text', {
    x: PX1 + 18, y: py(0) + 4,
    class: 'kzg-tick-label', 'text-anchor': 'start',
  }, 'x'));
  axesG.appendChild(svgEl('text', {
    x: px(0) - 8, y: PY_TOP - 8,
    class: 'kzg-tick-label', 'text-anchor': 'middle',
  }, 'P(x)'));
  // root markers
  for (const root of data.poly.roots) {
    axesG.appendChild(svgEl('circle', { cx: px(root), cy: py(0), r: 5, class: 'kzg-root-dot' }));
  }
  svg.appendChild(axesG);

  /* ---- Polynomial curve ---- */
  const steps = 200;
  const pathParts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
    const y = polyAt(x);
    if (y < Y_MIN - 2 || y > Y_MAX + 2) { if (pathParts.length) pathParts.push(''); continue; }
    const cmd = pathParts.length === 0 || pathParts[pathParts.length - 1] === '' ? 'M' : 'L';
    pathParts.push(`${cmd}${px(x).toFixed(1)},${py(y).toFixed(1)}`);
  }
  const curvePath = svgEl('path', { d: pathParts.join(' '), class: 'kzg-curve' });
  svg.appendChild(curvePath);

  /* ---- Poly area label ---- */
  svg.appendChild(svgEl('text', {
    x: (PX0 + PX1) / 2, y: PY_BOT + 28,
    class: 'kzg-tick-label', 'text-anchor': 'middle',
  }, 'P(x) = x³ − 2x² − x + 2'));

  /* ---- Evaluation point overlays (initially hidden) ---- */
  const evVLine = svgEl('line', { class: 'kzg-ev-line', opacity: '0' });
  const evHLine = svgEl('line', { class: 'kzg-ev-line', opacity: '0' });
  const evDot = svgEl('circle', { r: 6, class: 'kzg-ev-dot', opacity: '0' });
  const evLabelZ = svgEl('text', { class: 'kzg-ev-label', 'text-anchor': 'middle', opacity: '0' });
  const evLabelY = svgEl('text', { class: 'kzg-ev-label', 'text-anchor': 'end', opacity: '0' });
  svg.append(evVLine, evHLine, evDot, evLabelZ, evLabelY);

  /* ---- Trusted-setup points label ---- */
  svg.appendChild(svgEl('text', {
    x: PX0 + 5, y: PY_TOP + 12,
    class: 'kzg-pf-label',
  }, 'trusted setup: [τ⁰]₁  [τ¹]₁  [τ²]₁  [τ³]₁  →  commitment C'));

  /* ---- Proof-flow column (right side) ---- */
  const pfG = svgEl('g');

  // Header
  pfG.appendChild(svgEl('text', {
    x: PF_X, y: PF_Y0,
    class: 'kzg-pf-label', 'text-anchor': 'middle',
  }, 'KZG SCHEME'));

  // Helper: rounded-rect box
  function pfBox(
    id: string, cx: number, cy: number, w: number, h: number,
    titleText: string, subText: string,
  ): SVGGElement {
    const g = svgEl('g', { class: `kzg-pf-box` });
    g.id = id;
    const x = cx - w / 2, y = cy - h / 2;
    g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 8 }));
    g.appendChild(svgEl('text', {
      x: cx, y: cy - 4,
      class: 'kzg-pf-title', 'text-anchor': 'middle',
    }, titleText));
    g.appendChild(svgEl('text', {
      x: cx, y: cy + 11,
      class: 'kzg-pf-label', 'text-anchor': 'middle',
    }, subText));
    return g;
  }

  const boxPoly = pfBox('kzg-box-poly', PF_X, PF_Y0 + 50, 200, 52, 'P(x)  →  C', '48-byte commitment');
  const boxProve = pfBox('kzg-box-prove', PF_X, PF_Y0 + 148, 200, 52, 'P(z) = y  →  π', '48-byte proof');
  const boxVerify = pfBox('kzg-box-verify', PF_X, PF_Y0 + 254, 200, 52, 'Verify', 'e(π,[τ−z]₂) = e(C−[y]₁,G₂)');

  // Arrows between boxes
  const arr1 = svgEl('line', {
    x1: PF_X, y1: PF_Y0 + 76, x2: PF_X, y2: PF_Y0 + 122,
    class: 'kzg-pf-arrow',
    'marker-end': 'url(#kzg-arr)',
  });
  const arr2 = svgEl('line', {
    x1: PF_X, y1: PF_Y0 + 174, x2: PF_X, y2: PF_Y0 + 228,
    class: 'kzg-pf-arrow',
    'marker-end': 'url(#kzg-arr)',
  });

  // verdict
  const verdictText = svgEl('text', {
    x: PF_X, y: PF_Y0 + 340,
    class: 'kzg-badge', 'text-anchor': 'middle', opacity: '0',
  });

  // pairing equation note
  const pairingNote = svgEl('text', {
    x: PF_X, y: PF_Y0 + 310,
    class: 'kzg-eq', 'text-anchor': 'middle', opacity: '0',
  });

  // gas cost note
  pfG.appendChild(svgEl('text', {
    x: PF_X, y: VBH - 30,
    class: 'kzg-pf-label', 'text-anchor': 'middle',
  }, `50,000 gas · $${LIVE.pointEvalCostUsd.toFixed(4)} · EIP-4844 precompile 0x0A`));

  pfG.append(boxPoly, arr1, boxProve, arr2, boxVerify, pairingNote, verdictText);
  svg.appendChild(pfG);

  /* ---- Panel (HTML) ---- */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'kzg-panel';

  const statsGrid = document.createElement('div');
  statsGrid.className = 'kzg-stat-grid';

  function stat(label: string, val: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'kzg-stat';
    d.innerHTML = `<div class="kzg-stat-label">${label}</div><div class="kzg-stat-val">${val}</div>`;
    return d;
  }
  statsGrid.append(
    stat('Commitment', `${KZG.commitmentBytes}B (G1 point)`),
    stat('Proof', `${KZG.proofBytes}B (G1 point)`),
    stat('Verify gas', `${KZG.pointEvalGas.toLocaleString()} (~$${LIVE.pointEvalCostUsd.toFixed(4)})`),
    stat('Ceremony', `${CEREMONY.contributions.toLocaleString()} contributors`),
  );

  const evalRow = document.createElement('div');
  evalRow.className = 'kzg-eval-row';
  evalRow.innerHTML = 'Select an evaluation point below';

  const verdictPanel = document.createElement('div');
  verdictPanel.className = 'kzg-verdict';
  verdictPanel.setAttribute('role', 'status');
  verdictPanel.setAttribute('aria-live', 'polite');

  const hintDiv = document.createElement('div');
  hintDiv.className = 'kzg-hint';
  hintDiv.textContent = `Curve: BLS12-381 · field: ${KZG.fieldModulusBits}-bit prime · blobs: ${KZG.eip4844FieldElementsPerBlob.toLocaleString()} field elements`;

  panelDiv.append(statsGrid, evalRow, verdictPanel, hintDiv);
  panel.appendChild(panelDiv);

  /* ---- Controls ---- */
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'kzg-ctrl';

  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'kzg-z-tabs';
  tabsDiv.setAttribute('role', 'tablist');
  tabsDiv.setAttribute('aria-label', 'Evaluation point z');

  const zBtns = EVAL_POINTS.map((ep) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = ep.label;
    tabsDiv.appendChild(b);
    return b;
  });

  const corruptBtn = document.createElement('button');
  corruptBtn.type = 'button';
  corruptBtn.className = 'kzg-corrupt';
  corruptBtn.textContent = '✗ corrupt π';

  ctrlDiv.append(tabsDiv, corruptBtn);
  controlsEl.appendChild(ctrlDiv);

  /* ---- Caption ---- */
  const capDiv = document.createElement('div');
  capDiv.className = 'kzg-cap';
  capDiv.textContent = `data: EIP-4844 spec (eips.ethereum.org) · ceremony: ${CEREMONY.contributions.toLocaleString()} contributors (${CEREMONY.startDate}–${CEREMONY.endDate}) · cost: Blockscout, ${LIVE.asOf}`;
  caption.appendChild(capDiv);

  /* ---- State ---- */
  let activeIdx = -1; // -1 = none selected
  let corrupted = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  function showEval(idx: number) {
    const ep = EVAL_POINTS[idx]!;
    const zVal = ep.z;
    const yVal = ep.y;
    const xSvg = px(zVal);
    const ySvg = py(yVal);

    // vertical line from x-axis up to curve
    evVLine.setAttribute('x1', String(xSvg));
    evVLine.setAttribute('x2', String(xSvg));
    evVLine.setAttribute('y1', String(py(0)));
    evVLine.setAttribute('y2', String(ySvg));
    evVLine.setAttribute('opacity', '1');

    // horizontal line from y-axis to curve dot
    evHLine.setAttribute('x1', String(px(0)));
    evHLine.setAttribute('x2', String(xSvg));
    evHLine.setAttribute('y1', String(ySvg));
    evHLine.setAttribute('y2', String(ySvg));
    evHLine.setAttribute('opacity', '1');

    evDot.setAttribute('cx', String(xSvg));
    evDot.setAttribute('cy', String(ySvg));
    evDot.setAttribute('opacity', '1');

    evLabelZ.setAttribute('x', String(xSvg));
    evLabelZ.setAttribute('y', String(py(0) + 22));
    evLabelZ.textContent = `z=${zVal}`;
    evLabelZ.setAttribute('opacity', '1');

    evLabelY.setAttribute('x', String(px(0) - 14));
    evLabelY.setAttribute('y', String(ySvg + 4));
    evLabelY.textContent = `y=${yVal}`;
    evLabelY.setAttribute('opacity', '1');
  }

  function hideEval() {
    evVLine.setAttribute('opacity', '0');
    evHLine.setAttribute('opacity', '0');
    evDot.setAttribute('opacity', '0');
    evLabelZ.setAttribute('opacity', '0');
    evLabelY.setAttribute('opacity', '0');
  }

  function updateProofFlow(valid: boolean, hasEval: boolean) {
    const color = valid ? '#22d3ee' : '#f87171';
    const arrMid = valid ? 'url(#kzg-arr-lit)' : 'url(#kzg-arr-corrupt)';
    const boxClass = hasEval ? (valid ? 'kzg-pf-box highlight' : 'kzg-pf-box corrupt') : 'kzg-pf-box';

    boxPoly.setAttribute('class', 'kzg-pf-box highlight');
    boxProve.setAttribute('class', boxClass);
    boxVerify.setAttribute('class', boxClass);

    arr1.setAttribute('class', `kzg-pf-arrow lit`);
    arr1.setAttribute('marker-end', 'url(#kzg-arr-lit)');
    arr2.setAttribute('class', hasEval ? (valid ? 'kzg-pf-arrow lit' : 'kzg-pf-arrow corrupt') : 'kzg-pf-arrow');
    arr2.setAttribute('marker-end', hasEval ? arrMid : 'url(#kzg-arr)');

    if (hasEval) {
      pairingNote.setAttribute('class', valid ? 'kzg-eq valid' : 'kzg-eq invalid');
      pairingNote.textContent = valid ? 'e(π, [τ−z]₂) = e(C−[y]₁, G₂)  ✓' : 'e(π, [τ−z]₂) ≠ e(C−[y]₁, G₂)  ✗';
      pairingNote.setAttribute('opacity', '1');

      verdictText.setAttribute('class', valid ? 'kzg-badge valid' : 'kzg-badge invalid');
      verdictText.textContent = valid ? '✓  VALID PROOF' : '✗  INVALID PROOF';
      verdictText.setAttribute('opacity', '1');
    } else {
      pairingNote.setAttribute('opacity', '0');
      verdictText.setAttribute('opacity', '0');
    }

    // panel verdict
    if (hasEval) {
      verdictPanel.className = `kzg-verdict on ${valid ? 'valid' : 'invalid'}`;
      verdictPanel.textContent = valid
        ? '✓ pairing check passes — proof accepted'
        : '✗ pairing check fails — proof rejected';
    } else {
      verdictPanel.className = 'kzg-verdict';
      verdictPanel.textContent = '';
    }

    _ = color; // suppress unused var (used conceptually above)
  }

  let _ = '';

  function render() {
    const hasEval = activeIdx >= 0;

    if (hasEval) {
      showEval(activeIdx);
      const ep = EVAL_POINTS[activeIdx]!;
      evalRow.innerHTML = `P(<span>${ep.label.replace('z = ', 'z=')}</span>) = <span>${ep.y}</span>`;
    } else {
      hideEval();
      evalRow.innerHTML = 'Select an evaluation point below';
    }

    updateProofFlow(!corrupted, hasEval);

    zBtns.forEach((b, i) => b.setAttribute('aria-selected', String(i === activeIdx)));
    corruptBtn.textContent = corrupted ? '✓ valid π' : '✗ corrupt π';
    corruptBtn.style.borderColor = corrupted ? 'rgba(34,211,238,.45)' : '';
    corruptBtn.style.color = corrupted ? '#6ee7b7' : '';
    corruptBtn.style.background = corrupted ? 'rgba(34,211,238,.08)' : '';
  }

  /* ---- Events ---- */
  const onZClick = (e: Event) => {
    const i = zBtns.indexOf(e.currentTarget as HTMLButtonElement);
    if (i >= 0) { activeIdx = i === activeIdx ? -1 : i; render(); }
  };
  const onZKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = activeIdx < 0 ? 0 : (activeIdx + dir + zBtns.length) % zBtns.length;
      zBtns[next]!.focus();
      activeIdx = next;
      render();
    }
  };
  zBtns.forEach((b) => {
    b.addEventListener('click', onZClick);
    b.addEventListener('keydown', onZKey);
  });

  const onCorrupt = () => { corrupted = !corrupted; render(); };
  corruptBtn.addEventListener('click', onCorrupt);

  // initial render — commit box highlighted from the start
  boxPoly.setAttribute('class', 'kzg-pf-box highlight');
  render();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    zBtns.forEach((b) => {
      b.removeEventListener('click', onZClick);
      b.removeEventListener('keydown', onZKey);
    });
    corruptBtn.removeEventListener('click', onCorrupt);
    layout.dispose();
    style.remove();
  };
}
