/**
 * Artifact: the-proof-tradeoff — The Proof Tradeoff
 * Manifest: content/artifacts/the-proof-tradeoff/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-proof-tradeoff/data.json';

type System = (typeof rawData.systems)[number];

// Log-scale helpers
function logMap(val: number, lo: number, hi: number, outLo: number, outHi: number): number {
  return outLo + ((Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (outHi - outLo);
}

function fmtGas(g: number): string {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M`;
  if (g >= 1_000) return `${Math.round(g / 1_000)}k`;
  return `${g}`;
}

function fmtTime(s: number): string {
  if (s >= 60) return `${(s / 60).toFixed(1)}m`;
  return `${s}s`;
}

function fmtProof(kb: number): string {
  if (kb < 1) return `${Math.round(kb * 1024)} B`;
  return `${kb} KB`;
}

const X_LO = 2, X_HI = 650;   // prover seconds
const Y_LO = 150_000, Y_HI = 25_000_000; // gas

const ETH_USD = rawData.sp1Tx.ethUsd;
const SP1_GAS = rawData.sp1Tx.gasUsed;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
  });
  const { stage, panel, caption } = layout;

  // ── Style ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .pt-svg { width: 100%; height: 100%; display: block; }
    .pt-panel {
      font-size: 12px; color: #c9d1d9;
      display: flex; flex-direction: column; gap: 10px;
      padding: 4px 0;
    }
    .pt-panel-empty {
      color: #8b949e; font-size: 11px; line-height: 1.5; padding: 6px 0;
    }
    .pt-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
    .pt-badges { display: flex; gap: 5px; flex-wrap: wrap; }
    .pt-badge {
      font-size: 10px; font-weight: 600; letter-spacing: .04em;
      text-transform: uppercase; border-radius: 4px;
      padding: 2px 6px; white-space: nowrap;
    }
    .pt-badge-wrap { background: #1f3d6b; color: #5b8cff; }
    .pt-badge-raw  { background: #3b2412; color: #f0883e; }
    .pt-badge-ok   { background: #0d2618; color: #22d3ee; }
    .pt-badge-no   { background: #2a1a1a; color: #8b949e; }
    .pt-badge-setup-none       { background: #1a2a1a; color: #3fb950; }
    .pt-badge-setup-universal  { background: #1a2230; color: #79c0ff; }
    .pt-badge-setup-per-circuit { background: #2a1e14; color: #d29922; }
    .pt-stats {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
    }
    .pt-stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: .04em; }
    .pt-stat-val   { font-size: 13px; color: #e6edf3; font-weight: 500; }
    .pt-note { font-size: 11px; color: #8b949e; line-height: 1.55; border-top: 1px solid #21262d; padding-top: 8px; }
    .pt-sp1-link { font-size: 10px; color: #58a6ff; text-decoration: none; }
    .pt-sp1-link:hover { text-decoration: underline; }
    .pt-legend { display: flex; flex-direction: column; gap: 5px; margin-top: auto; padding-top: 10px; border-top: 1px solid #21262d; }
    .pt-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #8b949e; }
    .pt-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .pt-caption {
      font-size: 10px; color: #6e7681;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .pt-caption a { color: #58a6ff; text-decoration: none; }
    .pt-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // ── SVG canvas ───────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pt-svg');
  svg.setAttribute('aria-label', 'Proof system tradeoff scatter chart');
  stage.appendChild(svg);

  // ── Panel ────────────────────────────────────────────────────────────────
  const panelDiv = document.createElement('div');
  panelDiv.className = 'pt-panel';
  panel.appendChild(panelDiv);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'pt-panel-empty';
  emptyMsg.textContent = 'Click a dot to inspect a proof system.';
  panelDiv.appendChild(emptyMsg);

  // Legend at the bottom of the panel
  const legendDiv = document.createElement('div');
  legendDiv.className = 'pt-legend';
  legendDiv.innerHTML = `
    <div class="pt-legend-row">
      <div class="pt-legend-dot" style="background:#5b8cff"></div>
      <span>STARK → SNARK wrapped (constant gas)</span>
    </div>
    <div class="pt-legend-row">
      <div class="pt-legend-dot" style="border:2px solid #8b5cf6;box-sizing:border-box"></div>
      <span>Native SNARK (no FRI)</span>
    </div>
    <div class="pt-legend-row">
      <div class="pt-legend-dot" style="border:2px solid #f0883e;box-sizing:border-box"></div>
      <span>Raw FRI-STARK (L1 impractical)</span>
    </div>
  `;
  panelDiv.appendChild(legendDiv);

  // ── Caption ──────────────────────────────────────────────────────────────
  const capDiv = document.createElement('div');
  capDiv.className = 'pt-caption';
  const sp1Tx = rawData.sp1Tx;
  capDiv.innerHTML = `
    Source: <a href="https://eth.blockscout.com/address/${sp1Tx.contractAddress}" target="_blank" rel="noopener">SP1VerifierGateway</a>
    · block ${sp1Tx.blockNumber.toLocaleString()} · ${sp1Tx.gasUsed.toLocaleString()} gas · ${sp1Tx.timestamp.slice(0,10)}
    · Gnark benchmarks, SP1/RISC Zero docs
  `;
  caption.appendChild(capDiv);

  // ── Draw function ────────────────────────────────────────────────────────
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

    // Chart margins
    const ml = 52, mr = 16, mt = 20, mb = 44;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    if (cw < 40 || ch < 40) return;

    const mkEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    const px = (t: number): number => ml + logMap(t, X_LO, X_HI, 0, cw);
    const py = (g: number): number => mt + ch - logMap(g, Y_LO, Y_HI, 0, ch);

    // ── Background: wrapper constant-gas band ──────────────────────────────
    const bandTop = py(500_000);
    const bandBot = py(200_000);
    const band = mkEl('rect', {
      x: ml, y: bandTop, width: cw, height: bandBot - bandTop,
      fill: '#1a2a3a', opacity: '0.6',
    });
    svg.appendChild(band);

    const bandLabel = mkEl('text', {
      x: ml + 6, y: bandTop + 12,
      fill: '#4b7fa0', 'font-size': '9', 'font-family': 'monospace',
    });
    bandLabel.textContent = 'wrapper band (<500k gas)';
    svg.appendChild(bandLabel);

    // ── SP1 mainnet anchor line ────────────────────────────────────────────
    const sp1Y = py(SP1_GAS);
    const dashLine = mkEl('line', {
      x1: ml, y1: sp1Y, x2: ml + cw, y2: sp1Y,
      stroke: '#5b8cff', 'stroke-width': '1',
      'stroke-dasharray': '4 3', opacity: '0.55',
    });
    svg.appendChild(dashLine);
    const dashLabel = mkEl('text', {
      x: ml + cw - 4, y: sp1Y - 4,
      fill: '#5b8cff', 'font-size': '8', 'font-family': 'monospace',
      'text-anchor': 'end',
    });
    dashLabel.textContent = `SP1 mainnet: ${SP1_GAS.toLocaleString()} gas`;
    svg.appendChild(dashLabel);

    // ── Grid lines ─────────────────────────────────────────────────────────
    const yTicks = [200_000, 300_000, 500_000, 1_000_000, 3_000_000, 9_000_000];
    for (const g of yTicks) {
      const y = py(g);
      const gl = mkEl('line', {
        x1: ml, y1: y, x2: ml + cw, y2: y,
        stroke: '#21262d', 'stroke-width': '1',
      });
      svg.appendChild(gl);
      const tl = mkEl('text', {
        x: ml - 4, y: y + 3.5,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace',
        'text-anchor': 'end',
      });
      tl.textContent = fmtGas(g);
      svg.appendChild(tl);
    }

    const xTicks = [3, 10, 30, 100, 300, 600];
    for (const t of xTicks) {
      const x = px(t);
      const gl = mkEl('line', {
        x1: x, y1: mt, x2: x, y2: mt + ch,
        stroke: '#21262d', 'stroke-width': '1',
      });
      svg.appendChild(gl);
      const tl = mkEl('text', {
        x: x, y: mt + ch + 13,
        fill: '#6e7681', 'font-size': '9', 'font-family': 'monospace',
        'text-anchor': 'middle',
      });
      tl.textContent = fmtTime(t);
      svg.appendChild(tl);
    }

    // ── Axes ──────────────────────────────────────────────────────────────
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt, x2: ml, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));
    svg.appendChild(mkEl('line', {
      x1: ml, y1: mt + ch, x2: ml + cw, y2: mt + ch, stroke: '#30363d', 'stroke-width': '1',
    }));

    // Axis labels
    const xLabel = mkEl('text', {
      x: ml + cw / 2, y: H - 4,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui, sans-serif',
      'text-anchor': 'middle',
    });
    xLabel.textContent = 'Prover time →';
    svg.appendChild(xLabel);

    const yLabelG = document.createElementNS(NS, 'g');
    yLabelG.setAttribute('transform', `rotate(-90,${ml - 40},${mt + ch / 2})`);
    const yLabel = mkEl('text', {
      x: ml - 40, y: mt + ch / 2,
      fill: '#8b949e', 'font-size': '10', 'font-family': 'system-ui, sans-serif',
      'text-anchor': 'middle',
    });
    yLabel.textContent = '← On-chain gas';
    yLabelG.appendChild(yLabel);
    svg.appendChild(yLabelG);

    // ── Data points ───────────────────────────────────────────────────────
    for (const sys of rawData.systems) {
      const cx = px(sys.proverS);
      const cy = py(sys.verifyGas);
      const r = 7;
      const isSelected = sys.id === selectedId;

      const circle = document.createElementNS(NS, 'circle') as SVGCircleElement;
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(isSelected ? r + 3 : r));
      circle.setAttribute('cursor', 'pointer');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `${sys.name}: ${fmtGas(sys.verifyGas)} gas, ${fmtTime(sys.proverS)} prover time`);

      if (sys.wrapped) {
        circle.setAttribute('fill', sys.color);
        circle.setAttribute('stroke', isSelected ? '#fff' : sys.color);
        circle.setAttribute('stroke-width', isSelected ? '2.5' : '0');
      } else {
        circle.setAttribute('fill', 'transparent');
        circle.setAttribute('stroke', sys.color);
        circle.setAttribute('stroke-width', isSelected ? '3' : '2');
      }
      circle.setAttribute('opacity', isSelected ? '1' : '0.85');

      circle.addEventListener('click', () => selectSystem(sys.id));
      circle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSystem(sys.id); }
      });

      svg.appendChild(circle);
      dotEls.set(sys.id, circle);

      // Short label (abbreviation) near the dot
      if (W > 300) {
        const short: Record<string, string> = {
          'raw-stark': 'FRI-STARK', 'plonky2': 'Plonky2', 'halo2': 'Halo2',
          'plonk': 'PLONK', 'groth16-native': 'Groth16', 'sp1': 'SP1',
          'risc-zero': 'RISC0', 'nova': 'Nova',
        };
        const label = mkEl('text', {
          x: cx + r + 5,
          y: cy + 4,
          fill: sys.color,
          'font-size': '9',
          'font-family': 'monospace',
          'pointer-events': 'none',
        });
        label.textContent = short[sys.id] ?? sys.name;
        svg.appendChild(label);
      }
    }
  }

  function selectSystem(id: string): void {
    selectedId = selectedId === id ? null : id;
    draw();
    updatePanel();
  }

  function gasToUsd(gas: number): string {
    const gwei = rawData.sp1Tx.gasPriceGwei;
    const eth = (gas * gwei) / 1e9;
    return `$${(eth * ETH_USD).toFixed(3)}`;
  }

  function updatePanel(): void {
    // remove all but legend
    while (panelDiv.firstChild && panelDiv.firstChild !== legendDiv) {
      panelDiv.removeChild(panelDiv.firstChild);
    }

    if (!selectedId) {
      panelDiv.insertBefore(emptyMsg, legendDiv);
      return;
    }

    const sys = rawData.systems.find((s) => s.id === selectedId);
    if (!sys) { panelDiv.insertBefore(emptyMsg, legendDiv); return; }

    const nameEl = document.createElement('div');
    nameEl.className = 'pt-name';
    nameEl.textContent = sys.name;
    panelDiv.insertBefore(nameEl, legendDiv);

    const badgesEl = document.createElement('div');
    badgesEl.className = 'pt-badges';

    const wrapBadge = document.createElement('span');
    wrapBadge.className = `pt-badge ${sys.wrapped ? 'pt-badge-wrap' : 'pt-badge-raw'}`;
    wrapBadge.textContent = sys.wrapped ? 'WRAPPED' : 'RAW';
    badgesEl.appendChild(wrapBadge);

    const setupBadge = document.createElement('span');
    setupBadge.className = `pt-badge pt-badge-setup-${sys.setup.replace('-', '-')}`;
    setupBadge.textContent = sys.setup === 'none' ? 'no setup' : sys.setup === 'universal' ? 'universal SRS' : 'per-circuit SRS';
    badgesEl.appendChild(setupBadge);

    const zkmlBadge = document.createElement('span');
    zkmlBadge.className = `pt-badge ${sys.zkmlViable ? 'pt-badge-ok' : 'pt-badge-no'}`;
    zkmlBadge.textContent = sys.zkmlViable ? 'zkML viable' : 'zkML impractical';
    badgesEl.appendChild(zkmlBadge);
    panelDiv.insertBefore(badgesEl, legendDiv);

    const statsEl = document.createElement('div');
    statsEl.className = 'pt-stats';
    const stats: [string, string][] = [
      ['On-chain gas', fmtGas(sys.verifyGas)],
      ['Est. USD cost', gasToUsd(sys.verifyGas)],
      ['Prover time', fmtTime(sys.proverS)],
      ['Proof size', fmtProof(sys.proofKB)],
    ];
    for (const [label, val] of stats) {
      const lDiv = document.createElement('div');
      lDiv.innerHTML = `<div class="pt-stat-label">${label}</div><div class="pt-stat-val">${val}</div>`;
      statsEl.appendChild(lDiv);
    }
    panelDiv.insertBefore(statsEl, legendDiv);

    const noteEl = document.createElement('div');
    noteEl.className = 'pt-note';
    noteEl.textContent = sys.note;
    panelDiv.insertBefore(noteEl, legendDiv);

    if (sys.id === 'sp1') {
      const linkEl = document.createElement('a');
      linkEl.className = 'pt-sp1-link';
      linkEl.href = `https://eth.blockscout.com/tx/${rawData.sp1Tx.txHash}`;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener';
      linkEl.textContent = `↗ Mainnet tx: ${rawData.sp1Tx.txHash.slice(0, 12)}…`;
      panelDiv.insertBefore(linkEl, legendDiv);
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
