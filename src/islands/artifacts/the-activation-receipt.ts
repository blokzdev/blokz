/**
 * Artifact: the-activation-receipt — The Activation Receipt
 * Manifest: content/artifacts/the-activation-receipt/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

// Seeded LCG — reproducible pseudo-random values, no external deps
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function normalNoise(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const K = 24; // fingerprint dimensions shown

// Reference fingerprint: fixed seed, values in [-1, 1]
const REF_VALUES = (() => {
  const rng = lcg(0xdeadbeef);
  return Array.from({ length: K }, () => rng() * 2 - 1);
})();

interface Precision {
  id: string;
  label: string;
  sigma: number;
  auc: string;
  detected: boolean;
  statusText: string;
  barColor: string;
}

const PRECISIONS: Precision[] = [
  {
    id: 'fp32', label: 'FP32', sigma: 0.000,
    auc: '—', detected: false,
    statusText: 'Fingerprints match',
    barColor: '#3fb950',
  },
  {
    id: 'fp16', label: 'FP16', sigma: 0.038,
    auc: '—', detected: false,
    statusText: 'Within tolerance',
    barColor: '#d29922',
  },
  {
    id: 'int8', label: 'INT8', sigma: 0.135,
    auc: '—', detected: false,
    statusText: 'Elevated divergence',
    barColor: '#f0883e',
  },
  {
    id: 'int4', label: 'INT4', sigma: 0.400,
    auc: '> 0.999', detected: true,
    statusText: 'Model substitution detected',
    barColor: '#f85149',
  },
];

function getProviderValues(sigma: number): number[] {
  if (sigma === 0) return [...REF_VALUES];
  const rng = lcg(0xcafe1234);
  return REF_VALUES.map(v => {
    const noise = normalNoise(rng) * sigma;
    return Math.max(-1.5, Math.min(1.5, v + noise));
  });
}

function computeRMS(ref: number[], prov: number[]): number {
  const sumSq = ref.reduce((acc, r, i) => acc + (r - prov[i]) ** 2, 0);
  return Math.sqrt(sumSq / ref.length);
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/7',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .ar-svg { width: 100%; height: 100%; display: block; }
    .ar-panel {
      display: flex; flex-direction: column; gap: 8px;
      font-size: 12px; color: #c9d1d9;
    }
    .ar-panel-title {
      font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6e7681;
    }
    .ar-status {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 10px; border-radius: 6px;
      font-size: 12px; font-weight: 600; line-height: 1.3;
    }
    .ar-status.ok   { background: #0d4429; color: #3fb950; border: 1px solid #196c2e; }
    .ar-status.warn { background: #3d2e00; color: #d29922; border: 1px solid #6a4e00; }
    .ar-status.err  { background: #3c1010; color: #f85149; border: 1px solid #7a1414; }
    .ar-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .ar-status.ok   .ar-dot { background: #3fb950; }
    .ar-status.warn .ar-dot { background: #d29922; }
    .ar-status.err  .ar-dot { background: #f85149; }
    .ar-metric {
      display: flex; flex-direction: column; gap: 2px;
      padding: 7px 9px; background: #161b22;
      border-radius: 6px; border: 1px solid #21262d;
    }
    .ar-metric-label {
      font-size: 10px; color: #6e7681;
      text-transform: uppercase; letter-spacing: .05em;
    }
    .ar-metric-value {
      font-size: 22px; font-weight: 700; font-family: monospace;
    }
    .ar-metric-value.c-match { color: #3fb950; }
    .ar-metric-value.c-drift { color: #d29922; }
    .ar-metric-value.c-warn  { color: #f0883e; }
    .ar-metric-value.c-fraud { color: #f85149; }
    .ar-auc { font-size: 11px; color: #8b949e; padding: 0 2px; }
    .ar-auc em { color: #e6edf3; font-style: normal; font-family: monospace; }
    .ar-controls-wrap {
      display: flex; gap: 8px; align-items: center;
      justify-content: center; flex-wrap: wrap; width: 100%;
    }
    .ar-btn {
      padding: 6px 18px; border-radius: 6px;
      border: 1px solid #30363d; background: #21262d;
      color: #c9d1d9; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: monospace; letter-spacing: .05em;
      transition: background .1s, border-color .1s;
    }
    .ar-btn:hover:not(.active) { background: #2d333b; border-color: #58a6ff; }
    .ar-btn.fp32.active { background: #0d419d; border-color: #388bfd; color: #e6edf3; }
    .ar-btn.fp16.active { background: #3d2e00; border-color: #d29922; color: #e6edf3; }
    .ar-btn.int8.active { background: #4d2c00; border-color: #f0883e; color: #e6edf3; }
    .ar-btn.int4.active { background: #3c1010; border-color: #f85149; color: #e6edf3; }
    .ar-caption { font-size: 10px; color: #6e7681; }
    .ar-caption a { color: #58a6ff; text-decoration: none; }
    .ar-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ar-svg');
  svg.setAttribute('aria-label',
    'Grouped bar chart showing reference vs provider activation fingerprint vectors across k=24 projection dimensions. Provider bars diverge visually under INT4 quantization.');
  stage.appendChild(svg);

  let selectedIdx = 0; // FP32 default

  // Panel
  const panelDiv = document.createElement('div');
  panelDiv.className = 'ar-panel';

  const panelTitle = document.createElement('div');
  panelTitle.className = 'ar-panel-title';
  panelTitle.textContent = 'Detection';
  panelDiv.appendChild(panelTitle);

  const statusEl = document.createElement('div');
  const statusDot = document.createElement('div');
  statusDot.className = 'ar-dot';
  const statusText = document.createTextNode('');
  statusEl.appendChild(statusDot);
  statusEl.appendChild(statusText);
  panelDiv.appendChild(statusEl);

  const rmsMetric = document.createElement('div');
  rmsMetric.className = 'ar-metric';
  const rmsLabel = document.createElement('div');
  rmsLabel.className = 'ar-metric-label';
  rmsLabel.textContent = 'RMS divergence';
  const rmsValue = document.createElement('div');
  rmsValue.className = 'ar-metric-value c-match';
  rmsMetric.appendChild(rmsLabel);
  rmsMetric.appendChild(rmsValue);
  panelDiv.appendChild(rmsMetric);

  const aucEl = document.createElement('div');
  aucEl.className = 'ar-auc';
  panelDiv.appendChild(aucEl);

  panel.appendChild(panelDiv);

  // Controls
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'ar-controls-wrap';

  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < PRECISIONS.length; i++) {
    const p = PRECISIONS[i];
    const btn = document.createElement('button');
    btn.className = `ar-btn ${p.id}` + (i === 0 ? ' active' : '');
    btn.textContent = p.label;
    btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    const idx = i;
    btn.addEventListener('click', () => {
      selectedIdx = idx;
      syncButtons();
      updatePanel();
      draw();
    });
    buttons.push(btn);
    ctrlWrap.appendChild(btn);
  }
  controls.appendChild(ctrlWrap);

  // Caption
  const capDiv = document.createElement('div');
  capDiv.className = 'ar-caption';
  capDiv.innerHTML =
    'Simulation · <a href="https://arxiv.org/abs/2511.20621" target="_blank" rel="noopener">' +
    'DiFR: Karvonen et al. 2025</a> · ' +
    `k = ${K} orthogonal projection dims · noise amplitude scaled to quantization benchmarks`;
  caption.appendChild(capDiv);

  function syncButtons(): void {
    buttons.forEach((b, j) => {
      b.classList.toggle('active', j === selectedIdx);
      b.setAttribute('aria-pressed', j === selectedIdx ? 'true' : 'false');
    });
  }

  function updatePanel(): void {
    const p = PRECISIONS[selectedIdx];
    const provVals = getProviderValues(p.sigma);
    const rms = computeRMS(REF_VALUES, provVals);

    // Status
    if (p.detected) {
      statusEl.className = 'ar-status err';
    } else if (rms > 0.02) {
      statusEl.className = 'ar-status warn';
    } else {
      statusEl.className = 'ar-status ok';
    }
    statusText.textContent = p.statusText;

    // RMS value + color class
    rmsValue.textContent = rms.toFixed(3);
    rmsValue.className = 'ar-metric-value ' +
      (rms < 0.01 ? 'c-match' : rms < 0.09 ? 'c-drift' : rms < 0.25 ? 'c-warn' : 'c-fraud');

    // AUC line
    if (p.auc === '—') {
      aucEl.innerHTML = `Detection AUC: <em>—</em> (paper: INT4 threshold)`;
    } else {
      aucEl.innerHTML = `Detection AUC: <em>${p.auc}</em> at 2 tokens`;
    }
  }

  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = svg.clientWidth || 600;
    const H = svg.clientHeight || 260;
    const ml = 38, mr = 16, mt = 26, mb = 34;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    function mkEl(tag: string, attrs: Record<string, string | number>): SVGElement {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    }

    const p = PRECISIONS[selectedIdx];
    const provVals = getProviderValues(p.sigma);

    const Y_LO = -1.2, Y_HI = 1.2;
    function py(v: number): number {
      return mt + ch - ((v - Y_LO) / (Y_HI - Y_LO)) * ch;
    }
    const y0 = py(0);

    // Y grid + ticks
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const y = py(v);
      svg.appendChild(mkEl('line', {
        x1: ml, y1: y, x2: ml + cw, y2: y,
        stroke: v === 0 ? '#30363d' : '#21262d',
        'stroke-width': v === 0 ? '1.5' : '1',
      }));
      const tl = mkEl('text', {
        x: ml - 5, y: y + 3.5,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace', 'text-anchor': 'end',
      });
      tl.textContent = v === 0 ? '0' : v.toFixed(1);
      svg.appendChild(tl);
    }

    // X dimension labels (every 4th if narrow)
    const pairW = cw / K;
    const showAll = pairW >= 18;
    for (let i = 0; i < K; i++) {
      if (!showAll && i % 4 !== 0 && i !== K - 1) continue;
      const cx = ml + (i + 0.5) * pairW;
      const tl = mkEl('text', {
        x: cx, y: mt + ch + 13,
        fill: '#6e7681', 'font-size': '8', 'font-family': 'monospace', 'text-anchor': 'middle',
      });
      tl.textContent = String(i + 1);
      svg.appendChild(tl);
    }

    // Bars
    const barW = Math.max(2.5, pairW * 0.38);
    const gap = Math.max(0.8, pairW * 0.04);

    for (let i = 0; i < K; i++) {
      const cx = ml + (i + 0.5) * pairW;

      // Reference bar (left)
      const rv = REF_VALUES[i];
      const ry = rv >= 0 ? py(rv) : y0;
      const rh = Math.max(1, Math.abs(py(rv) - y0));
      svg.appendChild(mkEl('rect', {
        x: cx - barW - gap / 2, y: ry,
        width: barW, height: rh,
        fill: '#58a6ff', rx: '1',
      }));

      // Provider bar (right)
      const pv = provVals[i];
      const pvy = pv >= 0 ? py(pv) : y0;
      const pvh = Math.max(1, Math.abs(py(pv) - y0));
      svg.appendChild(mkEl('rect', {
        x: cx + gap / 2, y: pvy,
        width: barW, height: pvh,
        fill: p.barColor, rx: '1',
      }));
    }

    // Chart title
    svg.appendChild(
      Object.assign(document.createElementNS(NS, 'text'), {
        textContent: `Activation fingerprint · k = ${K} dimensions · Token 1`,
      })
    );
    const titleEl = mkEl('text', {
      x: ml, y: mt - 10,
      fill: '#6e7681', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
    });
    titleEl.textContent = `Activation fingerprint · k = ${K} dimensions · Token 1`;
    svg.appendChild(titleEl);

    // Legend (top-right)
    const lx = ml + cw - (W < 380 ? 100 : 170);
    const ly = mt - 10;

    svg.appendChild(mkEl('rect', { x: lx, y: ly - 6, width: 9, height: 8, fill: '#58a6ff', rx: '1' }));
    const refLeg = mkEl('text', {
      x: lx + 12, y: ly + 2,
      fill: '#8b949e', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
    });
    refLeg.textContent = 'Reference';
    svg.appendChild(refLeg);

    if (W >= 380) {
      svg.appendChild(mkEl('rect', { x: lx + 68, y: ly - 6, width: 9, height: 8, fill: p.barColor, rx: '1' }));
      const provLeg = mkEl('text', {
        x: lx + 81, y: ly + 2,
        fill: '#8b949e', 'font-size': '9', 'font-family': 'system-ui,sans-serif',
      });
      provLeg.textContent = `Provider (${p.label})`;
      svg.appendChild(provLeg);
    }

    // X-axis label
    svg.appendChild(
      (() => {
        const el = mkEl('text', {
          x: ml + cw / 2, y: mt + ch + 26,
          fill: '#6e7681', 'font-size': '9',
          'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
        });
        el.textContent = 'Projection dimension →';
        return el;
      })()
    );

    // Y-axis label
    const yLabelG = document.createElementNS(NS, 'g');
    yLabelG.setAttribute('transform', `rotate(-90,${ml - 28},${mt + ch / 2})`);
    const yLabelEl = mkEl('text', {
      x: ml - 28, y: mt + ch / 2,
      fill: '#6e7681', 'font-size': '9',
      'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle',
    });
    yLabelEl.textContent = 'Value';
    yLabelG.appendChild(yLabelEl);
    svg.appendChild(yLabelG);
  }

  updatePanel();

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
