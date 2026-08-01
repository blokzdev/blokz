/**
 * Artifact: the-noise-ceiling — The Noise Ceiling
 * Manifest: content/artifacts/the-noise-ceiling/manifest.json
 *
 * Simulates the FHE noise budget: each homomorphic multiplication consumes a
 * "level" of a finite budget L; when the noise reaches the decryption ceiling
 * the ciphertext must be BOOTSTRAPPED — refreshed back down (the sawtooth). The
 * scheme toggle contrasts the article's core tradeoff: CKKS has a large budget
 * so it bootstraps rarely but each bootstrap costs ~1 min; TFHE bootstraps on
 * every gate for ~1 ms. Measured per-model FHE-vs-MPC latencies (from the cited
 * primaries) anchor the mechanism to real numbers.
 *
 * Data: content/artifacts/the-noise-ceiling/data.json (see manifest dataSource).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/the-noise-ceiling/data.json';

/* ── palette (design tokens) ── */
const VOID    = '#05070d';
const PANEL   = '#0d1322';
const LINE    = 'rgba(124,140,255,.14)';
const TEXT    = '#e7eaf3';
const MUTED   = '#8d95ad';
const FAINT   = '#5b6378';
const ACCENT  = '#5b8cff';
const VIOLET  = '#8b5cf6';
const CYAN    = '#22d3ee';
const GREEN   = '#34d399';
const AMBER   = '#fbbf24';
const RED      = '#f87171';

type Scheme = {
  id: string; label: string; flavor: string; levels: number;
  bootstrapDepth: number; bootstrapMs: number; bootstrapNote: string;
  strength: string; weakness: string;
};
type Model = {
  id: string; label: string; params?: string; layers: number; regime: string;
  fheSeconds?: number; fheSecondsLow?: number | null; fheSecondsHigh?: number | null;
  fheMemoryGB?: number; mpcSeconds?: number; mpcWanSeconds?: number;
  throughputGap?: number; latencyGap?: number; note: string;
};

const SCHEMES = data.schemes as Scheme[];
const MODELS = data.models as Model[];

const NS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function fmtBootTime(ms: number): string {
  if (ms <= 0) return '0';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 90) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = s / 60;
  if (m < 90) return `${m < 10 ? m.toFixed(1) : Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

function fmtSeconds(s?: number | null): string {
  if (s == null) return '—';
  if (s < 1) return `${s} s`;
  if (s < 10) return `${s.toFixed(s % 1 ? 2 : 0)} s`;
  return `${Math.round(s)} s`;
}

/** First-order model of leveled evaluation + bootstrapping. */
function simulate(D: number, L: number, c: number) {
  const pts: { step: number; y: number; reset?: boolean }[] = [{ step: 0, y: 0 }];
  const resets: number[] = [];
  let consumed = 0;
  for (let s = 1; s <= D; s++) {
    if (consumed + 1 > L) {
      resets.push(s - 1);
      pts.push({ step: s - 1, y: c, reset: true }); // vertical drop = bootstrap
      consumed = c;
    }
    consumed += 1;
    pts.push({ step: s, y: consumed });
  }
  return { pts, resets, leveled: resets.length === 0 };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .nc-stage { width:100%; height:100%; background:${VOID}; border-radius:8px;
      box-sizing:border-box; position:relative; overflow:hidden; }
    .nc-svg { width:100%; height:100%; display:block; }
    .nc-badge { position:absolute; top:10px; left:12px; font-family:monospace;
      font-size:11px; font-weight:700; letter-spacing:.05em; padding:3px 9px;
      border-radius:20px; }
    .nc-badge.leveled { background:#052e2b; color:${GREEN}; border:1px solid #0f5a52; }
    .nc-badge.boot    { background:#3a2a06; color:${AMBER}; border:1px solid #6b4e0c; }
    /* panel */
    .nc-panel { background:${PANEL}; border-radius:8px; padding:12px;
      display:flex; flex-direction:column; gap:9px; min-height:0;
      font-family:monospace; color:${TEXT}; min-width:0; }
    .nc-ptitle { font-size:10px; font-weight:700; color:${MUTED}; letter-spacing:.08em;
      text-transform:uppercase; padding-bottom:6px; border-bottom:1px solid ${LINE}; }
    .nc-row { display:flex; justify-content:space-between; align-items:baseline; gap:8px;
      font-size:12px; }
    .nc-row .k { color:${MUTED}; font-size:11px; min-width:0; }
    .nc-row .v { font-weight:700; text-align:right; overflow-wrap:anywhere; }
    .nc-sub { font-size:10px; color:${FAINT}; line-height:1.5; overflow-wrap:anywhere; }
    .nc-cards { --afl-card:128px; margin-top:2px; }
    .nc-card { background:${VOID}; border:1px solid ${LINE}; border-radius:7px;
      padding:8px 9px; display:flex; flex-direction:column; gap:4px; cursor:pointer;
      font-family:monospace; text-align:left; color:${TEXT}; min-width:0;
      transition:border-color .15s, background .15s; }
    .nc-card:hover { border-color:rgba(124,140,255,.32); }
    .nc-card.sel { border-color:${ACCENT}; background:#0b1120; }
    .nc-card .cl { font-size:11px; font-weight:700; }
    .nc-card .cm { font-size:9px; color:${FAINT}; }
    .nc-card .cf { font-size:12px; font-weight:700; }
    .afl-pill.leveled { background:#052e2b; color:${GREEN}; }
    .afl-pill.boot    { background:#3a2a06; color:${AMBER}; }
    .nc-pill { display:inline-block; font-size:8.5px; font-weight:700; letter-spacing:.04em;
      padding:1px 6px; border-radius:10px; text-transform:uppercase; }
    .nc-detail { font-size:10px; color:${MUTED}; line-height:1.55; border-top:1px solid ${LINE};
      padding-top:7px; overflow-wrap:anywhere; }
    .nc-detail b { color:${TEXT}; }
    /* controls */
    .nc-ctrls { display:flex; flex-direction:column; gap:10px; font-family:monospace; }
    .nc-seg { display:flex; gap:6px; flex-wrap:wrap; }
    .nc-tab { font-family:monospace; font-size:11px; font-weight:700; padding:6px 12px;
      border-radius:6px; cursor:pointer; border:1px solid ${LINE}; background:${PANEL};
      color:${MUTED}; letter-spacing:.03em; }
    .nc-tab.on { background:#101a33; color:${ACCENT}; border-color:${ACCENT}; }
    .nc-sliders { display:flex; gap:16px; flex-wrap:wrap; }
    .nc-field { display:flex; flex-direction:column; gap:3px; flex:1 1 190px; min-width:0; }
    .nc-field.dim { opacity:.4; pointer-events:none; }
    .nc-flabel { font-size:10px; color:${MUTED}; display:flex; justify-content:space-between; gap:8px; }
    .nc-flabel b { color:${CYAN}; }
    .nc-field input[type=range] { width:100%; accent-color:${ACCENT}; cursor:pointer; }
    .nc-btns { display:flex; gap:8px; flex-wrap:wrap; }
    .nc-btn { font-family:monospace; font-size:11px; font-weight:700; padding:6px 14px;
      border-radius:6px; cursor:pointer; border:1px solid ${LINE}; background:#101a33;
      color:${TEXT}; letter-spacing:.03em; }
    .nc-btn.ghost { background:${PANEL}; color:${MUTED}; }
    .nc-btn:hover { border-color:rgba(124,140,255,.32); }
    /* caption */
    .nc-cap { font-size:10px; color:${FAINT}; font-family:monospace; line-height:1.55; }
    .nc-cap a { color:${ACCENT}; text-decoration:none; }
    .nc-cap a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);

  /* ── stage ── */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'nc-stage';
  const badge = document.createElement('div');
  badge.className = 'nc-badge leveled';
  stageWrap.appendChild(badge);

  const W = 460, H = 250;
  const padL = 46, padR = 16, padT = 22, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const svg = el('svg', { class: 'nc-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

  const clip = el('clipPath', { id: 'nc-reveal' });
  const clipRect = el('rect', { x: 0, y: 0, width: W, height: H });
  clip.appendChild(clipRect);
  const defs = el('defs');
  defs.appendChild(clip);
  svg.appendChild(defs);

  // axes
  const axisG = el('g');
  axisG.appendChild(el('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: LINE }));
  axisG.appendChild(el('line', { x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: LINE }));
  const xlab = el('text', { x: padL + plotW / 2, y: H - 6, 'text-anchor': 'middle', fill: FAINT, 'font-size': 10, 'font-family': 'monospace' });
  xlab.textContent = 'multiplicative depth  →';
  axisG.appendChild(xlab);
  const ylab = el('text', { x: 14, y: padT + plotH / 2, fill: FAINT, 'font-size': 10, 'font-family': 'monospace', transform: `rotate(-90 14 ${padT + plotH / 2})`, 'text-anchor': 'middle' });
  ylab.textContent = 'noise (levels)';
  axisG.appendChild(ylab);
  svg.appendChild(axisG);

  // ceiling
  const ceilLine = el('line', { x1: padL, x2: W - padR, stroke: RED, 'stroke-width': 1.4, 'stroke-dasharray': '5 4' });
  const ceilLab = el('text', { x: W - padR, 'text-anchor': 'end', fill: RED, 'font-size': 9.5, 'font-family': 'monospace' });
  ceilLab.textContent = 'decryption ceiling';
  svg.appendChild(ceilLine);
  svg.appendChild(ceilLab);

  // revealed content group (clipped for the sweep)
  const revealG = el('g', { 'clip-path': 'url(#nc-reveal)' });
  const area = el('path', { fill: CYAN, 'fill-opacity': 0.1, stroke: 'none' });
  const curve = el('path', { fill: 'none', stroke: CYAN, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const boltG = el('g');
  revealG.appendChild(area);
  revealG.appendChild(curve);
  revealG.appendChild(boltG);
  svg.appendChild(revealG);

  // scan line (during animation)
  const scan = el('line', { y1: padT, y2: H - padB, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1 });
  scan.setAttribute('opacity', '0');
  svg.appendChild(scan);

  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  /* ── panel ── */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'nc-panel';
  panelWrap.innerHTML = `
    <div class="nc-ptitle">Noise budget</div>
    <div class="nc-row"><span class="k">Regime</span><span class="v" id="nc-regime"></span></div>
    <div class="nc-row"><span class="k">Bootstraps needed</span><span class="v" id="nc-nboot"></span></div>
    <div class="nc-row"><span class="k">Cost / bootstrap</span><span class="v" id="nc-cost"></span></div>
    <div class="nc-row"><span class="k">Bootstrapping time</span><span class="v" id="nc-btime"></span></div>
    <div class="nc-sub" id="nc-scheme-note"></div>
    <div class="nc-ptitle" style="margin-top:2px">Measured PPML latency</div>
    <div class="nc-cards afl-cards" id="nc-cards"></div>
    <div class="nc-detail" id="nc-detail"></div>
  `;
  panel.appendChild(panelWrap);

  const regimeEl = panelWrap.querySelector('#nc-regime') as HTMLElement;
  const nbootEl = panelWrap.querySelector('#nc-nboot') as HTMLElement;
  const costEl = panelWrap.querySelector('#nc-cost') as HTMLElement;
  const btimeEl = panelWrap.querySelector('#nc-btime') as HTMLElement;
  const schemeNoteEl = panelWrap.querySelector('#nc-scheme-note') as HTMLElement;
  const cardsEl = panelWrap.querySelector('#nc-cards') as HTMLElement;
  const detailEl = panelWrap.querySelector('#nc-detail') as HTMLElement;

  const cardEls: HTMLButtonElement[] = MODELS.map((m) => {
    const b = document.createElement('button');
    b.className = 'nc-card';
    b.type = 'button';
    const boot = m.regime === 'bootstrapped';
    const fhe = m.fheSeconds != null
      ? fmtSeconds(m.fheSeconds)
      : (m.fheSecondsHigh != null ? `${fmtSeconds(m.fheSecondsLow)}–${fmtSeconds(m.fheSecondsHigh)}` : '—');
    b.innerHTML = `
      <div class="cl">${m.label}</div>
      <div class="cm">${m.params ? m.params + ' · ' : ''}${m.layers} layer${m.layers > 1 ? 's' : ''}</div>
      <div class="cf" style="color:${boot ? AMBER : GREEN}">${fhe} <span style="color:${FAINT};font-weight:400">FHE</span></div>
      <div><span class="nc-pill ${boot ? 'boot' : 'leveled'}">${boot ? 'bootstrapped' : 'leveled'}</span></div>
    `;
    cardsEl.appendChild(b);
    return b;
  });

  function showDetail(i: number): void {
    const m = MODELS[i];
    const parts: string[] = [`<b>${m.label}</b> — ${m.note}.`];
    if (m.mpcSeconds != null) parts.push(`MPC (fast LAN): <b>${fmtSeconds(m.mpcSeconds)}</b>${m.mpcWanSeconds != null ? ` · slow WAN <b>${fmtSeconds(m.mpcWanSeconds)}</b>` : ''}.`);
    if (m.fheMemoryGB != null) parts.push(`FHE memory: <b>${m.fheMemoryGB} GB</b>.`);
    if (m.throughputGap != null) parts.push(`Throughput gap at batch 128: <b>${m.throughputGap}×</b>.`);
    else if (m.latencyGap != null) parts.push(`Latency gap vs MPC: <b>${m.latencyGap}×</b>.`);
    detailEl.innerHTML = parts.join(' ');
  }

  /* ── controls ── */
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'nc-ctrls';
  ctrlWrap.innerHTML = `
    <div class="nc-seg" id="nc-seg" role="group" aria-label="FHE scheme"></div>
    <div class="nc-sliders">
      <label class="nc-field" id="nc-depth-field">
        <span class="nc-flabel">circuit depth (multiplications) <b id="nc-depth-val"></b></span>
        <input id="nc-depth" type="range" min="1" max="64" step="1" aria-label="circuit multiplicative depth">
      </label>
      <label class="nc-field" id="nc-budget-field">
        <span class="nc-flabel">noise budget L (levels) <b id="nc-budget-val"></b></span>
        <input id="nc-budget" type="range" min="2" max="24" step="1" aria-label="noise budget in levels">
      </label>
    </div>
    <div class="nc-btns">
      <button class="nc-btn" id="nc-run" type="button">▶ Evaluate circuit</button>
      <button class="nc-btn ghost" id="nc-reset" type="button">Reset</button>
    </div>
  `;
  controls.appendChild(ctrlWrap);

  const segEl = ctrlWrap.querySelector('#nc-seg') as HTMLElement;
  const depthInput = ctrlWrap.querySelector('#nc-depth') as HTMLInputElement;
  const budgetInput = ctrlWrap.querySelector('#nc-budget') as HTMLInputElement;
  const depthVal = ctrlWrap.querySelector('#nc-depth-val') as HTMLElement;
  const budgetVal = ctrlWrap.querySelector('#nc-budget-val') as HTMLElement;
  const budgetField = ctrlWrap.querySelector('#nc-budget-field') as HTMLElement;
  const runBtn = ctrlWrap.querySelector('#nc-run') as HTMLButtonElement;
  const resetBtn = ctrlWrap.querySelector('#nc-reset') as HTMLButtonElement;

  const tabEls: HTMLButtonElement[] = SCHEMES.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'nc-tab' + (i === 0 ? ' on' : '');
    b.type = 'button';
    b.textContent = s.label;
    segEl.appendChild(b);
    return b;
  });

  /* ── caption ── */
  caption.innerHTML = `<div class="nc-cap">
    Mechanism: a first-order model of leveled evaluation + bootstrapping. Per-scheme bootstrap
    cost and measured per-model FHE/MPC latency from
    <a href="https://arxiv.org/abs/2604.00169" target="_blank" rel="noopener">arXiv:2604.00169</a> ·
    <a href="https://arxiv.org/abs/2504.11604" target="_blank" rel="noopener">arXiv:2504.11604</a>.
    Toggle scheme · drag depth &amp; budget · tap a model card.
  </div>`;

  /* ── state ── */
  let schemeIdx = 0;
  let selCard = MODELS.findIndex((m) => m.id === 'bertbase');
  if (selCard < 0) selCard = MODELS.length - 1;
  depthInput.value = '28';
  budgetInput.value = String(SCHEMES[0].levels);

  const xOf = (step: number, D: number) => padL + (D === 0 ? 0 : (step / D) * plotW);
  const yOf = (v: number, L: number) => (H - padB) - Math.min(1, v / L) * plotH;

  let raf = 0;

  function currentL(scheme: Scheme): number {
    return scheme.id === 'tfhe' ? scheme.levels : Number(budgetInput.value);
  }

  function draw(reveal: number): void {
    const scheme = SCHEMES[schemeIdx];
    const D = Number(depthInput.value);
    const L = currentL(scheme);
    const c = scheme.bootstrapDepth;
    const { pts, resets, leveled } = simulate(D, L, c);

    // ceiling position
    const cy = yOf(L, L);
    ceilLine.setAttribute('y1', String(cy));
    ceilLine.setAttribute('y2', String(cy));
    ceilLab.setAttribute('y', String(cy - 4));

    // curve + area
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const px = xOf(pts[i].step, D), py = yOf(pts[i].y, L);
      d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ' ' + py.toFixed(2) + ' ';
    }
    curve.setAttribute('d', d);
    const first = xOf(pts[0].step, D), lastP = pts[pts.length - 1];
    area.setAttribute('d', d + `L${xOf(lastP.step, D).toFixed(2)} ${(H - padB)} L${first.toFixed(2)} ${(H - padB)} Z`);

    // bolts at each reset
    while (boltG.firstChild) boltG.removeChild(boltG.firstChild);
    for (const rs of resets) {
      const bx = xOf(rs, D);
      const bolt = el('text', { x: bx, y: cy - 6, 'text-anchor': 'middle', 'font-size': 12, fill: AMBER });
      bolt.textContent = '⚡';
      boltG.appendChild(bolt);
    }

    // reveal clip
    clipRect.setAttribute('width', String(Math.max(0, Math.min(W, reveal))));

    // scan line
    if (reveal < W - padR) {
      scan.setAttribute('x1', String(reveal));
      scan.setAttribute('x2', String(reveal));
      scan.setAttribute('opacity', '0.9');
    } else {
      scan.setAttribute('opacity', '0');
    }

    // badge
    badge.className = 'nc-badge ' + (leveled ? 'leveled' : 'boot');
    badge.textContent = leveled ? '✓ LEVELED — no bootstrap' : `⚡ BOOTSTRAPPED ×${resets.length}`;

    // panel readout
    regimeEl.textContent = leveled ? 'leveled' : 'bootstrapped';
    regimeEl.style.color = leveled ? GREEN : AMBER;
    nbootEl.textContent = String(resets.length);
    nbootEl.style.color = resets.length ? AMBER : TEXT;
    costEl.textContent = fmtBootTime(scheme.bootstrapMs);
    const bt = resets.length * scheme.bootstrapMs;
    btimeEl.textContent = resets.length ? '≈ ' + fmtBootTime(bt) : '0';
    btimeEl.style.color = resets.length ? RED : GREEN;
    schemeNoteEl.innerHTML =
      `<b style="color:${ACCENT}">${scheme.label}</b> · ${scheme.flavor}. ` +
      `Budget L=${scheme.id === 'tfhe' ? '1 (refresh every gate)' : L}, bootstrap ${scheme.bootstrapNote}. ` +
      `⚠ ${scheme.weakness}.`;
  }

  function redraw(): void {
    depthVal.textContent = depthInput.value;
    budgetVal.textContent = budgetInput.value;
    draw(W); // fully revealed (static)
  }

  function runSweep(): void {
    if (raf) cancelAnimationFrame(raf);
    const dur = 2000;
    let start = 0;
    const tick = (now: number): void => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      const eased = t * t * (3 - 2 * t);
      draw(padL + eased * (plotW + padR));
      if (t < 1) raf = requestAnimationFrame(tick);
      else { raf = 0; draw(W); }
    };
    raf = requestAnimationFrame(tick);
  }

  function selectScheme(i: number): void {
    schemeIdx = i;
    tabEls.forEach((b, j) => b.classList.toggle('on', j === i));
    const scheme = SCHEMES[i];
    if (scheme.id === 'tfhe') {
      budgetField.classList.add('dim');
    } else {
      budgetField.classList.remove('dim');
      budgetInput.value = String(scheme.levels);
    }
    redraw();
    runSweep();
  }

  function selectCard(i: number): void {
    selCard = i;
    cardEls.forEach((b, j) => b.classList.toggle('sel', j === i));
    showDetail(i);
  }

  /* ── wire ── */
  tabEls.forEach((b, i) => b.addEventListener('click', () => selectScheme(i)));
  cardEls.forEach((b, i) => b.addEventListener('click', () => selectCard(i)));
  depthInput.addEventListener('input', redraw);
  budgetInput.addEventListener('input', redraw);
  runBtn.addEventListener('click', runSweep);
  resetBtn.addEventListener('click', () => {
    depthInput.value = '28';
    budgetInput.value = String(SCHEMES[schemeIdx].levels);
    redraw();
  });

  /* ── init (static; ArtifactMount handles reduced-motion) ── */
  selectCard(selCard);
  redraw();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    layout.dispose();
    style.remove();
  };
}
