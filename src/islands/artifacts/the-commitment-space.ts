/**
 * Artifact: the-commitment-space — The Commitment Space
 * Manifest: content/artifacts/the-commitment-space/manifest.json
 *
 * Two-band scatter chart: proof/witness size (log X) vs. trust model (Y band).
 * Six schemes: KZG, Groth16, PLONK (trusted) · IPA, MPT, FRI-STARK (transparent).
 * Click any dot to inspect the scheme in the panel.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-commitment-space/data.json';

type Scheme = (typeof rawData.schemes)[number];

function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const X_LO = 32;
const X_HI = 200_000;

// Fixed Y offsets (px, within band) so close-X schemes don't overlap.
const Y_OFFSETS: Record<string, number> = {
  'kzg-blob':   -18,
  'groth16':     18,
  'plonk':        0,
  'ipa-verkle': -18,
  'mpt-branch':   0,
  'fri-stark':    0,
};

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
  });
  const { stage, panel, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cs-svg { width: 100%; height: 100%; display: block; }
    .cs-panel {
      font-size: 12px; color: #c9d1d9;
      display: flex; flex-direction: column; gap: 10px; padding: 4px 0;
    }
    .cs-panel-empty { color: #8b949e; font-size: 11px; line-height: 1.5; padding: 6px 0; }
    .cs-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
    .cs-badges { display: flex; gap: 5px; flex-wrap: wrap; }
    .cs-badge {
      font-size: 10px; font-weight: 600; letter-spacing: .04em;
      text-transform: uppercase; border-radius: 4px; padding: 2px 6px; white-space: nowrap;
    }
    .cs-badge-trusted     { background: #1f3d6b; color: #5b8cff; }
    .cs-badge-transparent { background: #1a2a1a; color: #3fb950; }
    .cs-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
    .cs-stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: .04em; }
    .cs-stat-val   { font-size: 13px; color: #e6edf3; font-weight: 500; overflow-wrap: break-word; }
    .cs-note {
      font-size: 11px; color: #8b949e; line-height: 1.55;
      border-top: 1px solid #21262d; padding-top: 8px;
    }
    .cs-ceremony {
      font-size: 11px; color: #8b949e; line-height: 1.6;
      border-top: 1px solid #21262d; padding-top: 8px;
    }
    .cs-ceremony strong { color: #c9d1d9; }
    .cs-legend {
      display: flex; flex-direction: column; gap: 5px;
      margin-top: auto; padding-top: 10px; border-top: 1px solid #21262d;
    }
    .cs-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .cs-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .cs-caption {
      font-size: 10px; color: #6e7681;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .cs-caption a { color: #58a6ff; text-decoration: none; }
    .cs-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // ── SVG ───────────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cs-svg');
  svg.setAttribute('aria-label', 'Commitment scheme comparison: proof size vs trust model');
  stage.appendChild(svg);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'cs-panel';
  panel.appendChild(panelDiv);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'cs-panel-empty';
  emptyMsg.textContent = 'Click a dot to inspect a commitment scheme.';

  const legendDiv = document.createElement('div');
  legendDiv.className = 'cs-legend';
  legendDiv.innerHTML = `
    <div class="cs-legend-row"><div class="cs-legend-dot" style="background:#5b8cff"></div><span>KZG family (trusted setup)</span></div>
    <div class="cs-legend-row"><div class="cs-legend-dot" style="background:#3fb950"></div><span>IPA / Pedersen (transparent)</span></div>
    <div class="cs-legend-row"><div class="cs-legend-dot" style="background:#d29922"></div><span>Merkle (hash-based, reference)</span></div>
    <div class="cs-legend-row"><div class="cs-legend-dot" style="background:#f0883e"></div><span>FRI-STARK (transparent)</span></div>
  `;
  panelDiv.appendChild(emptyMsg);
  panelDiv.appendChild(legendDiv);

  // ── Caption ───────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'cs-caption';
  const c = rawData.ceremony;
  capDiv.innerHTML = `
    Powers of Tau: ${c.participants.toLocaleString()} participants · ${c.durationDays} days ·
    Sources: <a href="https://eips.ethereum.org/EIPS/eip-4844" target="_blank" rel="noopener">EIP-4844</a>,
    <a href="https://eips.ethereum.org/EIPS/eip-6800" target="_blank" rel="noopener">EIP-6800</a>,
    <a href="https://ceremony.ethereum.org/" target="_blank" rel="noopener">ceremony.ethereum.org</a>
  `;
  caption.appendChild(capDiv);

  // ── State + draw ──────────────────────────────────────────────────────────
  let selectedId: string | null = null;
  const dotEls: Map<string, SVGCircleElement> = new Map();

  function clearSVG(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    dotEls.clear();
  }

  function draw(): void {
    clearSVG();
    const W = svg.clientWidth || 400;
    const H = svg.clientHeight || 300;

    const ml = 12, mr = 16, mt = 32, mb = 46;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 60 || ch < 60) return;

    const mkEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    const px = (b: number): number => ml + logMap(b, X_LO, X_HI, 0, cw);

    // Two horizontal bands — top: TRANSPARENT, bottom: TRUSTED SETUP
    const bandH = ch / 2;
    const bandMid = mt + bandH;

    svg.appendChild(mkEl('rect', {
      x: ml, y: mt, width: cw, height: bandH,
      fill: '#0d2618', opacity: '0.5',
    }));
    svg.appendChild(mkEl('rect', {
      x: ml, y: bandMid, width: cw, height: bandH,
      fill: '#0d1b35', opacity: '0.5',
    }));

    // Band labels
    const transLabel = mkEl('text', {
      x: ml + 8, y: mt + 15,
      fill: '#3fb950', 'font-size': '9', 'font-family': 'monospace',
      'font-weight': '600', 'letter-spacing': '.06em',
    });
    transLabel.textContent = 'TRANSPARENT';
    svg.appendChild(transLabel);

    const trustLabel = mkEl('text', {
      x: ml + 8, y: bandMid + 15,
      fill: '#5b8cff', 'font-size': '9', 'font-family': 'monospace',
      'font-weight': '600', 'letter-spacing': '.06em',
    });
    trustLabel.textContent = 'TRUSTED SETUP';
    svg.appendChild(trustLabel);

    // Band divider
    svg.appendChild(mkEl('line', {
      x1: ml, y1: bandMid, x2: ml + cw, y2: bandMid,
      stroke: '#30363d', 'stroke-width': '1',
    }));

    // Top + right borders
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt, x2: ml + cw, y2: mt,
      stroke: '#30363d', 'stroke-width': '1',
    }));
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt, x2: ml, y2: mt + ch,
      stroke: '#30363d', 'stroke-width': '1',
    }));

    // X axis
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch,
      stroke: '#30363d', 'stroke-width': '1',
    }));

    // X tick lines + labels
    const xTicks: [number, string][] = [
      [48, '48 B'], [128, '128 B'], [512, '512 B'],
      [1024, '1 KB'], [8192, '8 KB'], [32768, '32 KB'], [102400, '100 KB'],
    ];
    for (const [b, lbl] of xTicks) {
      const x = px(b);
      if (x < ml + 18 || x > ml + cw - 4) continue;
      svg.appendChild(mkEl('line', {
        x1: x, y1: mt, x2: x, y2: mt + ch,
        stroke: '#21262d', 'stroke-width': '1',
      }));
      const tl = mkEl('text', {
        x: x, y: mt + ch + 13,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace',
        'text-anchor': 'middle',
      });
      tl.textContent = lbl;
      svg.appendChild(tl);
    }

    // X axis label
    const xLabel = mkEl('text', {
      x: ml + cw / 2, y: H - 4,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui, sans-serif',
      'text-anchor': 'middle',
    });
    xLabel.textContent = 'Proof / witness size (log scale)  →';
    svg.appendChild(xLabel);

    // Band center Y positions
    const bandCenterTop = mt + bandH / 2;    // TRANSPARENT
    const bandCenterBot = bandMid + bandH / 2; // TRUSTED SETUP

    // Data points
    const r = 8;
    for (const s of rawData.schemes) {
      const cx = px(s.proofBytes);
      const bandCenter = s.setup === 'transparent' ? bandCenterTop : bandCenterBot;
      const cy = bandCenter + (Y_OFFSETS[s.id] ?? 0);
      const isSelected = s.id === selectedId;

      const circle = document.createElementNS(NS, 'circle') as SVGCircleElement;
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(isSelected ? r + 3 : r));
      circle.setAttribute('fill', s.color);
      circle.setAttribute('stroke', isSelected ? '#ffffff' : '#0d1117');
      circle.setAttribute('stroke-width', isSelected ? '2.5' : '1.5');
      circle.setAttribute('opacity', isSelected ? '1' : '0.85');
      circle.setAttribute('cursor', 'pointer');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `${s.name}: ${fmtBytes(s.proofBytes)}, ${s.setup} setup`);

      circle.addEventListener('click', () => selectScheme(s.id));
      circle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectScheme(s.id); }
      });

      svg.appendChild(circle);
      dotEls.set(s.id, circle);

      // Short label above the dot
      if (W > 260) {
        const lx = cx;
        const ly = cy - (isSelected ? r + 3 : r) - 5;
        const tl = mkEl('text', {
          x: lx, y: ly,
          fill: s.color, 'font-size': '9', 'font-family': 'monospace',
          'text-anchor': 'middle', 'pointer-events': 'none',
        });
        tl.textContent = s.label;
        svg.appendChild(tl);
      }
    }
  }

  function selectScheme(id: string): void {
    selectedId = selectedId === id ? null : id;
    draw();
    updatePanel();
  }

  function updatePanel(): void {
    // Remove all children except legendDiv
    while (panelDiv.firstChild && panelDiv.firstChild !== legendDiv) {
      panelDiv.removeChild(panelDiv.firstChild);
    }

    if (!selectedId) {
      panelDiv.insertBefore(emptyMsg, legendDiv);
      return;
    }

    const s = rawData.schemes.find((x) => x.id === selectedId) as Scheme | undefined;
    if (!s) { panelDiv.insertBefore(emptyMsg, legendDiv); return; }

    const nameEl = document.createElement('div');
    nameEl.className = 'cs-name';
    nameEl.textContent = s.name;
    panelDiv.insertBefore(nameEl, legendDiv);

    const badgesEl = document.createElement('div');
    badgesEl.className = 'cs-badges';
    const setupBadge = document.createElement('span');
    setupBadge.className = `cs-badge cs-badge-${s.setup}`;
    setupBadge.textContent = s.setup === 'trusted' ? 'TRUSTED SETUP' : 'TRANSPARENT';
    badgesEl.appendChild(setupBadge);
    panelDiv.insertBefore(badgesEl, legendDiv);

    const statsEl = document.createElement('div');
    statsEl.className = 'cs-stats';
    for (const [label, val] of [['Proof size', fmtBytes(s.proofBytes)], ['Used in', s.usedIn]] as [string, string][]) {
      const d = document.createElement('div');
      d.innerHTML = `<div class="cs-stat-label">${label}</div><div class="cs-stat-val">${val}</div>`;
      statsEl.appendChild(d);
    }
    panelDiv.insertBefore(statsEl, legendDiv);

    const noteEl = document.createElement('div');
    noteEl.className = 'cs-note';
    noteEl.textContent = s.note;
    panelDiv.insertBefore(noteEl, legendDiv);

    // Ceremony detail for the KZG blob entry
    if (s.id === 'kzg-blob') {
      const cer = rawData.ceremony;
      const cerEl = document.createElement('div');
      cerEl.className = 'cs-ceremony';
      cerEl.innerHTML =
        `Powers of Tau: <strong>${cer.participants.toLocaleString()} participants</strong>` +
        ` · <strong>${cer.durationDays} days</strong>` +
        ` · ${cer.g1Points} G1 + ${cer.g2Points} G2 points` +
        ` · ${cer.startDate} – ${cer.endDate}`;
      panelDiv.insertBefore(cerEl, legendDiv);
    }
  }

  updatePanel();

  // ── Resize ────────────────────────────────────────────────────────────────
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
  ro.observe(stage);
  draw();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    layout.dispose();
    style.remove();
  };
}
