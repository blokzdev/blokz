/**
 * Artifact: the-gating-problem — The Gating Problem
 * Manifest: content/artifacts/the-gating-problem/manifest.json
 *
 * Shows a 32-expert MoE routing grid with honest (k=8) vs shunted (k=4) modes.
 * Committee experts (top-6) are highlighted. Panel shows detection scheme verdicts.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import data from '../../../content/artifacts/the-gating-problem/data.json';

const COMMITTEE_COLOR = '#6366f1';   // indigo — standing committee experts
const ACTIVE_COLOR    = '#22c55e';   // green — active (honest k=8 tail experts)
const SHUNTED_COLOR   = '#ef4444';   // red — dropped by shunting
const IDLE_COLOR      = '#1e293b';   // slate-800 — not selected
const DETECT_OK       = '#22c55e';
const DETECT_MISS     = '#ef4444';
const DETECT_CAVEAT   = '#eab308';
const BG              = '#0f172a';
const TEXT            = '#e2e8f0';
const SUBTEXT         = '#94a3b8';
const BORDER          = '#334155';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
  });
  const { stage, panel, controls, caption } = layout;

  /* ── styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .gp-stage {
      width: 100%; height: 100%;
      background: ${BG};
      border-radius: 8px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      box-sizing: border-box;
      padding: 12px;
      gap: 10px;
      overflow: hidden;
    }
    .gp-label {
      font-size: 11px; color: ${SUBTEXT}; text-align: center; letter-spacing: .04em;
      font-family: monospace;
    }
    .gp-mode-badge {
      font-size: 12px; font-weight: 700; font-family: monospace;
      padding: 3px 10px; border-radius: 20px; letter-spacing: .06em;
    }
    .gp-mode-badge.honest  { background: #14532d; color: #4ade80; }
    .gp-mode-badge.shunted { background: #450a0a; color: #f87171; }
    .gp-grid-wrap { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; min-height: 0; }
    .gp-legend {
      display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
    }
    .gp-legend-item {
      display: flex; align-items: center; gap: 5px;
      font-size: 10px; color: ${SUBTEXT}; font-family: monospace;
    }
    .gp-legend-dot {
      width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto;
    }
    /* panel */
    .gp-panel {
      background: ${BG}; border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 8px; min-height: 0;
      font-family: monospace; font-size: 12px; color: ${TEXT};
    }
    .gp-panel-title {
      font-size: 11px; font-weight: 700; color: ${SUBTEXT};
      letter-spacing: .06em; text-transform: uppercase;
      padding-bottom: 6px; border-bottom: 1px solid ${BORDER};
    }
    .gp-stat-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; border-bottom: 1px solid ${BORDER}; gap: 8px;
    }
    .gp-stat-row:last-child { border-bottom: none; }
    .gp-stat-key { color: ${SUBTEXT}; font-size: 11px; }
    .gp-stat-val { font-size: 12px; font-weight: 700; }
    .gp-detect-title {
      font-size: 11px; font-weight: 700; color: ${SUBTEXT};
      letter-spacing: .06em; text-transform: uppercase;
      padding: 6px 0; border-bottom: 1px solid ${BORDER};
      margin-top: 4px;
    }
    .gp-detect-item {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 5px 0; border-bottom: 1px solid #1e293b;
    }
    .gp-detect-item:last-child { border-bottom: none; }
    .gp-detect-icon { font-size: 12px; flex: 0 0 auto; margin-top: 1px; }
    .gp-detect-name { font-weight: 700; font-size: 11px; }
    .gp-detect-reason { font-size: 10px; color: ${SUBTEXT}; line-height: 1.4; }
    /* controls */
    .gp-controls {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 8px 0;
    }
    .gp-btn {
      font-family: monospace; font-size: 11px; font-weight: 700;
      padding: 6px 14px; border-radius: 6px; cursor: pointer;
      border: 1px solid ${BORDER}; letter-spacing: .04em;
      transition: background .15s, color .15s;
    }
    .gp-btn.active-honest  { background: #14532d; color: #4ade80; border-color: #166534; }
    .gp-btn.active-shunted { background: #450a0a; color: #f87171; border-color: #7f1d1d; }
    .gp-btn.inactive { background: #1e293b; color: ${SUBTEXT}; }
    .gp-btn:hover.inactive { background: #334155; color: ${TEXT}; }
    .gp-anim-btn {
      font-family: monospace; font-size: 11px; font-weight: 700;
      padding: 6px 14px; border-radius: 6px; cursor: pointer;
      background: #1e293b; color: ${TEXT}; border: 1px solid ${BORDER};
      letter-spacing: .04em;
    }
    .gp-compute-bar {
      flex: 1; min-width: 120px;
      display: flex; flex-direction: column; gap: 3px;
    }
    .gp-compute-label { font-size: 10px; color: ${SUBTEXT}; font-family: monospace; }
    .gp-bar-track {
      height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden;
    }
    .gp-bar-fill {
      height: 100%; border-radius: 4px; transition: width .4s ease;
    }
    /* caption */
    .gp-caption {
      font-size: 10px; color: ${SUBTEXT}; font-family: monospace; line-height: 1.5;
    }
    .gp-caption a { color: #818cf8; text-decoration: none; }
    .gp-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  /* ── build stage ── */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'gp-stage';

  const modeBadge = document.createElement('div');
  modeBadge.className = 'gp-mode-badge honest';
  modeBadge.textContent = 'k = 8  HONEST';

  const gridWrap = document.createElement('div');
  gridWrap.className = 'gp-grid-wrap';

  const gridLabel = document.createElement('div');
  gridLabel.className = 'gp-label';
  gridLabel.textContent = '32 experts · tap to animate one token dispatch';

  const legend = document.createElement('div');
  legend.className = 'gp-legend';
  const legendItems = [
    [COMMITTEE_COLOR, 'committee (always active)'],
    [ACTIVE_COLOR,    'tail (active in k=8)'],
    [SHUNTED_COLOR,   'dropped in k=4'],
    [IDLE_COLOR,      'not selected'],
  ];
  for (const [color, label] of legendItems) {
    const li = document.createElement('div');
    li.className = 'gp-legend-item';
    const dot = document.createElement('div');
    dot.className = 'gp-legend-dot';
    dot.style.background = color as string;
    const lbl = document.createElement('span');
    lbl.textContent = label as string;
    li.appendChild(dot);
    li.appendChild(lbl);
    legend.appendChild(li);
  }

  stageWrap.appendChild(modeBadge);
  stageWrap.appendChild(gridWrap);
  stageWrap.appendChild(gridLabel);
  stageWrap.appendChild(legend);
  stage.appendChild(stageWrap);

  /* ── SVG expert grid ── */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  svg.setAttribute('viewBox', '0 0 320 240');
  gridWrap.appendChild(svg);

  const expertCount = data.expertCount as number;
  const cols = 8;
  const rows = Math.ceil(expertCount / cols);
  const cellW = 36, cellH = 26, gapX = 4, gapY = 4;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const totalH = rows * cellH + (rows - 1) * gapY;
  const offX = (320 - totalW) / 2;
  const offY = (240 - totalH) / 2;

  const cells: SVGRectElement[] = [];
  const labels: SVGTextElement[] = [];

  for (let i = 0; i < expertCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = offX + col * (cellW + gapX);
    const y = offY + row * (cellH + gapY);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(cellW));
    rect.setAttribute('height', String(cellH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', IDLE_COLOR);
    svg.appendChild(rect);
    cells.push(rect);

    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', String(x + cellW / 2));
    txt.setAttribute('y', String(y + cellH / 2 + 4));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '9');
    txt.setAttribute('font-family', 'monospace');
    txt.setAttribute('fill', SUBTEXT);
    txt.textContent = String(i);
    svg.appendChild(txt);
    labels.push(txt);
  }

  /* ── build panel ── */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'gp-panel';

  const statsTitle = document.createElement('div');
  statsTitle.className = 'gp-panel-title';
  statsTitle.textContent = 'Routing Stats';
  panelWrap.appendChild(statsTitle);

  function makeStatRow(key: string, valId: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gp-stat-row';
    const k = document.createElement('span');
    k.className = 'gp-stat-key';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'gp-stat-val';
    v.id = valId;
    row.appendChild(k);
    row.appendChild(v);
    panelWrap.appendChild(row);
    return v;
  }

  const activeCountEl = makeStatRow('Active experts', 'gp-active-count');
  const committeeEl   = makeStatRow('Committee in gate', 'gp-committee');
  const routingMassEl = makeStatRow('Committee mass', 'gp-routing-mass');
  const flopsEl       = makeStatRow('Relative FLOPs', 'gp-flops');

  const detectTitle = document.createElement('div');
  detectTitle.className = 'gp-detect-title';
  detectTitle.textContent = 'Detection Schemes';
  panelWrap.appendChild(detectTitle);

  for (const scheme of data.detectionSchemes) {
    const item = document.createElement('div');
    item.className = 'gp-detect-item';
    const icon = document.createElement('div');
    icon.className = 'gp-detect-icon';
    const nameEl = document.createElement('div');
    nameEl.className = 'gp-detect-name';
    nameEl.textContent = scheme.label;
    const reasonEl = document.createElement('div');
    reasonEl.className = 'gp-detect-reason';
    reasonEl.id = `gp-detect-reason-${scheme.id}`;
    const inner = document.createElement('div');
    inner.appendChild(nameEl);
    inner.appendChild(reasonEl);
    item.appendChild(icon);
    item.appendChild(inner);
    panelWrap.appendChild(item);

    // store refs for update
    (icon as any)._schemeId = scheme.id;
  }

  panel.appendChild(panelWrap);

  /* ── build controls ── */
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'gp-controls';

  const btnHonest = document.createElement('button');
  btnHonest.className = 'gp-btn active-honest';
  btnHonest.textContent = 'k = 8  Honest';

  const btnShunted = document.createElement('button');
  btnShunted.className = 'gp-btn inactive';
  btnShunted.textContent = 'k = 4  Shunted';

  const btnAnimate = document.createElement('button');
  btnAnimate.className = 'gp-anim-btn';
  btnAnimate.textContent = '▶ Dispatch token';

  const computeBar = document.createElement('div');
  computeBar.className = 'gp-compute-bar';
  const computeLabel = document.createElement('div');
  computeLabel.className = 'gp-compute-label';
  computeLabel.id = 'gp-compute-label';
  const barTrack = document.createElement('div');
  barTrack.className = 'gp-bar-track';
  const barFill = document.createElement('div');
  barFill.className = 'gp-bar-fill';
  barFill.id = 'gp-bar-fill';
  barFill.style.cssText = `width:100%;background:${DETECT_OK};`;
  barTrack.appendChild(barFill);
  computeBar.appendChild(computeLabel);
  computeBar.appendChild(barTrack);

  ctrlWrap.appendChild(btnHonest);
  ctrlWrap.appendChild(btnShunted);
  ctrlWrap.appendChild(btnAnimate);
  ctrlWrap.appendChild(computeBar);
  controls.appendChild(ctrlWrap);

  /* ── caption ── */
  caption.innerHTML = `<div class="gp-caption">
    Data: <a href="https://arxiv.org/abs/2601.03425" target="_blank" rel="noopener">COMMITTEEAUDIT (arXiv:2601.03425)</a> ·
    DeepSeek-V3 routing weights (simplified, 32-expert representation). As of 2026-06-24.
  </div>`;

  /* ── state ── */
  let mode: 'honest' | 'shunted' = 'honest';
  let animating = false;
  let animFrame = 0;

  const weights = data.routingWeights as number[];
  const kHonest = data.kHonest as number;
  const kShunted = data.kShunted as number;
  const committeeSize = data.committeeSize as number;

  function getActiveSet(k: number): Set<number> {
    // Sort by weight descending, take top-k
    const indexed = weights.map((w, i) => ({ w, i }));
    indexed.sort((a, b) => b.w - a.w);
    const s = new Set<number>();
    for (let i = 0; i < k; i++) s.add(indexed[i].i);
    return s;
  }

  const honestSet  = getActiveSet(kHonest);
  const shuntedSet = getActiveSet(kShunted);

  function committeeInGate(active: Set<number>): number {
    let count = 0;
    for (const id of active) { if (id < committeeSize) count++; }
    return count;
  }

  function routingMass(active: Set<number>): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let mass = 0;
    for (const id of active) { if (id < committeeSize) mass += weights[id]; }
    return Math.round((mass / total) * 100);
  }

  function render(animate = false): void {
    const active = mode === 'honest' ? honestSet : shuntedSet;
    const k = mode === 'honest' ? kHonest : kShunted;

    cells.forEach((cell, i) => {
      const isActive = active.has(i);
      const isCommittee = i < committeeSize;
      const isDropped = mode === 'shunted' && honestSet.has(i) && !shuntedSet.has(i);

      let fill = IDLE_COLOR;
      if (isActive && isCommittee) fill = COMMITTEE_COLOR;
      else if (isActive) fill = ACTIVE_COLOR;
      else if (isDropped) fill = SHUNTED_COLOR;

      if (animate) {
        // flash on -> color with delay proportional to rank
        const rank = Array.from(active).indexOf(i);
        const delay = isActive ? rank * 60 : 0;
        setTimeout(() => {
          cell.setAttribute('fill', fill);
          labels[i].setAttribute('fill', isActive ? '#fff' : SUBTEXT);
        }, delay + (isDropped ? 800 : 0));
      } else {
        cell.setAttribute('fill', fill);
        labels[i].setAttribute('fill', isActive ? '#fff' : SUBTEXT);
      }
    });

    modeBadge.className = `gp-mode-badge ${mode}`;
    modeBadge.textContent = mode === 'honest' ? `k = ${kHonest}  HONEST` : `k = ${kShunted}  SHUNTED`;

    activeCountEl.textContent = `${k} / ${expertCount}`;
    activeCountEl.style.color = mode === 'honest' ? DETECT_OK : DETECT_MISS;

    const cig = committeeInGate(active);
    committeeEl.textContent = `${cig} / ${committeeSize}`;
    committeeEl.style.color = TEXT;

    routingMassEl.textContent = `~${routingMass(active)}%`;
    routingMassEl.style.color = TEXT;

    const flops = mode === 'honest' ? '100%' : `~${100 - (data.computeSavingsPercent as number)}%`;
    flopsEl.textContent = flops;
    flopsEl.style.color = mode === 'honest' ? DETECT_OK : DETECT_MISS;

    const barPct = mode === 'honest' ? 100 : 100 - (data.computeSavingsPercent as number);
    const barEl = document.getElementById('gp-bar-fill');
    if (barEl) {
      barEl.style.width = `${barPct}%`;
      barEl.style.background = mode === 'honest' ? DETECT_OK : DETECT_MISS;
    }
    const labelEl = document.getElementById('gp-compute-label');
    if (labelEl) {
      labelEl.textContent = mode === 'honest'
        ? `Compute: 100% (k=${kHonest})`
        : `Compute: ${barPct}% (k=${kShunted}, saves ${data.computeSavingsPercent}%)`;
    }

    // update detection icons + reasons
    for (const scheme of data.detectionSchemes) {
      const icon = panelWrap.querySelector(`[data-scheme-id="${scheme.id}"]`);
      const reasonEl = document.getElementById(`gp-detect-reason-${scheme.id}`);
      const iconDiv = panelWrap.querySelectorAll('.gp-detect-icon');
      iconDiv.forEach(el => {
        if ((el as any)._schemeId === scheme.id) {
          if (mode === 'shunted') {
            el.textContent = scheme.detectsKShunting ? '✓' : '✗';
            (el as HTMLElement).style.color = scheme.detectsKShunting ? DETECT_CAVEAT : DETECT_MISS;
          } else {
            el.textContent = '–';
            (el as HTMLElement).style.color = SUBTEXT;
          }
        }
      });
      if (reasonEl) {
        reasonEl.textContent = mode === 'shunted'
          ? (scheme.detectsKShunting ? (scheme as any).caveat ?? scheme.reason : scheme.reason)
          : 'Switch to shunted mode to see detection result.';
      }
    }

    btnHonest.className  = mode === 'honest'  ? 'gp-btn active-honest'  : 'gp-btn inactive';
    btnShunted.className = mode === 'shunted' ? 'gp-btn active-shunted' : 'gp-btn inactive';
  }

  function animateDispatch(): void {
    if (animating) return;
    animating = true;

    // Flash all to idle first
    cells.forEach(c => c.setAttribute('fill', IDLE_COLOR));
    labels.forEach(l => l.setAttribute('fill', SUBTEXT));

    render(true);

    const totalTime = (mode === 'honest' ? kHonest : kShunted) * 60 + 900;
    animFrame = window.setTimeout(() => { animating = false; }, totalTime);
  }

  btnHonest.addEventListener('click', () => {
    if (mode === 'honest') return;
    mode = 'honest';
    render();
  });

  btnShunted.addEventListener('click', () => {
    if (mode === 'shunted') return;
    mode = 'shunted';
    render();
  });

  btnAnimate.addEventListener('click', animateDispatch);

  // Initial render
  render();

  return () => {
    layout.dispose();
    style.remove();
    if (animFrame) clearTimeout(animFrame);
    btnHonest.removeEventListener('click', () => {});
    btnShunted.removeEventListener('click', () => {});
    btnAnimate.removeEventListener('click', animateDispatch);
  };
}
