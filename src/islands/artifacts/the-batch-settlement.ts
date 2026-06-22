/**
 * Artifact: the-batch-settlement — The Batch Settlement
 * Manifest: content/artifacts/the-batch-settlement/manifest.json
 *
 * Interactive step-through of a CoW Protocol batch auction lifecycle:
 * intents arrive → batch seals → solvers compete → settlement executes → surplus distributed.
 *
 * Layout: stage SVG diagram + panel step detail + controls prev/next/autoplay + caption source.
 */
import data from '../../../content/artifacts/the-batch-settlement/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

const STEPS = data.steps;
const N = STEPS.length;

const PALETTE = {
  bg: '#0d1117',
  bgCard: '#161b22',
  border: '#30363d',
  accent: '#58a6ff',
  accentDim: '#1f3358',
  green: '#3fb950',
  greenDim: '#1a3d25',
  orange: '#d29922',
  orangeDim: '#3d2a00',
  purple: '#a371f7',
  purpleDim: '#2d2057',
  text: '#e6edf3',
  textMuted: '#8b949e',
  node: '#21262d',
  nodeBorder: '#444c56',
};

// Step accent colours: intent=accent, batch=orange, compete=purple, settle=green, surplus=green
const STEP_COLORS = ['#58a6ff', '#d29922', '#a371f7', '#3fb950', '#3fb950'];
const STEP_BG = ['#1f3358', '#3d2a00', '#2d2057', '#1a3d25', '#1a3d25'];

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function buildDiagram(svg: SVGSVGElement, stepIdx: number): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const W = 800, H = 450;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Background
  const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: PALETTE.bg, rx: 8 });
  svg.appendChild(bg);

  // Five pipeline nodes laid out in a horizontal flow
  const nodes = [
    { label: 'Intents', sublabel: 'Off-chain', icon: '✍' },
    { label: 'Batch', sublabel: '30s window', icon: '🔒' },
    { label: 'Solvers', sublabel: 'Competing', icon: '⚡' },
    { label: 'Settlement', sublabel: 'On-chain', icon: '⛓' },
    { label: 'Surplus', sublabel: 'To traders', icon: '✓' },
  ];

  const nodeW = 110, nodeH = 72, gap = 24;
  const totalW = nodes.length * nodeW + (nodes.length - 1) * gap;
  const startX = (W - totalW) / 2;
  const nodeY = 160;

  // Draw connecting arrows first (below nodes)
  for (let i = 0; i < nodes.length - 1; i++) {
    const fromX = startX + i * (nodeW + gap) + nodeW;
    const toX = startX + (i + 1) * (nodeW + gap);
    const midY = nodeY + nodeH / 2;
    const active = i < stepIdx;
    const arrowColor = active ? STEP_COLORS[Math.min(i + 1, STEP_COLORS.length - 1)]! : PALETTE.nodeBorder;

    // Arrow line
    const line = svgEl('line', {
      x1: fromX + 2, y1: midY,
      x2: toX - 6, y2: midY,
      stroke: arrowColor, 'stroke-width': active ? 2.5 : 1.5,
      opacity: active ? 1 : 0.35,
    });
    svg.appendChild(line);

    // Arrowhead
    const ax = toX - 6;
    const ay = midY;
    const arrow = svgEl('polygon', {
      points: `${ax},${ay - 5} ${ax + 8},${ay} ${ax},${ay + 5}`,
      fill: arrowColor,
      opacity: active ? 1 : 0.35,
    });
    svg.appendChild(arrow);
  }

  // Draw nodes
  nodes.forEach((node, i) => {
    const x = startX + i * (nodeW + gap);
    const y = nodeY;
    const isActive = i === stepIdx;
    const isPast = i < stepIdx;

    const color = isActive ? STEP_COLORS[i]! : isPast ? STEP_COLORS[i]! : PALETTE.nodeBorder;
    const bgColor = isActive ? STEP_BG[i]! : isPast ? STEP_BG[i]! : PALETTE.node;
    const borderColor = isActive ? color : isPast ? color : PALETTE.nodeBorder;
    const opacity = isPast ? 0.7 : isActive ? 1 : 0.4;

    // Card background
    const card = svgEl('rect', {
      x, y, width: nodeW, height: nodeH,
      rx: 8, fill: bgColor,
      stroke: borderColor, 'stroke-width': isActive ? 2 : 1,
      opacity,
    });
    svg.appendChild(card);

    // Icon
    const icon = svgEl('text', {
      x: x + nodeW / 2, y: y + 28,
      'text-anchor': 'middle',
      'font-size': 20,
      fill: color,
      opacity,
    });
    icon.textContent = node.icon;
    svg.appendChild(icon);

    // Label
    const label = svgEl('text', {
      x: x + nodeW / 2, y: y + 47,
      'text-anchor': 'middle',
      'font-size': 11,
      'font-weight': isActive ? '700' : '500',
      fill: isActive ? PALETTE.text : PALETTE.textMuted,
      'font-family': 'system-ui, sans-serif',
      opacity,
    });
    label.textContent = node.label;
    svg.appendChild(label);

    // Sublabel
    const sub = svgEl('text', {
      x: x + nodeW / 2, y: y + 60,
      'text-anchor': 'middle',
      'font-size': 9,
      fill: PALETTE.textMuted,
      'font-family': 'system-ui, sans-serif',
      opacity: opacity * 0.75,
    });
    sub.textContent = node.sublabel;
    svg.appendChild(sub);

    // Active indicator dot above
    if (isActive) {
      const dot = svgEl('circle', {
        cx: x + nodeW / 2, cy: y - 10,
        r: 5, fill: color,
      });
      svg.appendChild(dot);
    }

    // Step number badge
    const badge = svgEl('rect', {
      x: x + nodeW - 18, y: y + 2,
      width: 16, height: 14, rx: 3,
      fill: isActive ? color : PALETTE.bgCard,
      opacity,
    });
    svg.appendChild(badge);
    const num = svgEl('text', {
      x: x + nodeW - 10, y: y + 12,
      'text-anchor': 'middle', 'font-size': 9,
      fill: isActive ? PALETTE.bg : PALETTE.textMuted,
      'font-family': 'system-ui, sans-serif',
      'font-weight': '700',
      opacity,
    });
    num.textContent = String(i + 1);
    svg.appendChild(num);
  });

  // Detail box for the current step
  const step = STEPS[stepIdx]!;
  const detailY = nodeY + nodeH + 36;
  const detailH = H - detailY - 20;
  const detailX = 40;
  const detailW = W - 80;

  const detailCard = svgEl('rect', {
    x: detailX, y: detailY,
    width: detailW, height: detailH,
    rx: 8,
    fill: STEP_BG[stepIdx]!,
    stroke: STEP_COLORS[stepIdx]!,
    'stroke-width': 1,
    opacity: 0.85,
  });
  svg.appendChild(detailCard);

  // Detail text — wrap manually at ~95 chars per line
  const words = step.detail.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > 95) {
      lines.push(current.trim());
      current = w;
    } else {
      current = current ? current + ' ' + w : w;
    }
  }
  if (current) lines.push(current.trim());

  const lineH = 15;
  const textStartY = detailY + 18;
  lines.forEach((line, li) => {
    const t = svgEl('text', {
      x: detailX + 16, y: textStartY + li * lineH,
      'font-size': 11, fill: PALETTE.text,
      'font-family': 'system-ui, sans-serif',
    });
    t.textContent = line;
    svg.appendChild(t);
  });

  // Header — step title in accent
  const headerTitle = svgEl('text', {
    x: W / 2, y: nodeY - 40,
    'text-anchor': 'middle',
    'font-size': 18,
    'font-weight': '700',
    fill: STEP_COLORS[stepIdx]!,
    'font-family': 'system-ui, sans-serif',
  });
  headerTitle.textContent = `Step ${stepIdx + 1} of ${N}: ${step.label}`;
  svg.appendChild(headerTitle);

  // Subtitle
  const headerSub = svgEl('text', {
    x: W / 2, y: nodeY - 20,
    'text-anchor': 'middle',
    'font-size': 11,
    fill: PALETTE.textMuted,
    'font-family': 'system-ui, sans-serif',
  });
  headerSub.textContent = step.description.slice(0, 100) + (step.description.length > 100 ? '…' : '');
  svg.appendChild(headerSub);

  // Progress bar
  const barX = 40, barY = nodeY - 60, barW = W - 80, barH = 4;
  svg.appendChild(svgEl('rect', { x: barX, y: barY, width: barW, height: barH, rx: 2, fill: PALETTE.node }));
  const progress = ((stepIdx + 1) / N) * barW;
  svg.appendChild(svgEl('rect', { x: barX, y: barY, width: progress, height: barH, rx: 2, fill: STEP_COLORS[stepIdx]! }));
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    panel: true,
    controls: true,
    caption: true,
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .tbs-svg { width: 100%; height: 100%; display: block; }
    .tbs-panel { font-family: system-ui, sans-serif; padding: 10px 14px; color: #e6edf3; font-size: 13px; line-height: 1.55; }
    .tbs-panel-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
    .tbs-panel-desc { color: #8b949e; font-size: 12px; margin-bottom: 10px; }
    .tbs-panel-metric { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
    .tbs-panel-key { color: #8b949e; font-size: 11px; min-width: 90px; }
    .tbs-panel-val { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .tbs-controls { display: flex; align-items: center; gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
    .tbs-btn { background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px;
      padding: 6px 14px; font-size: 13px; cursor: pointer; font-family: system-ui, sans-serif; }
    .tbs-btn:hover { background: #30363d; }
    .tbs-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .tbs-btn-primary { background: #1f3358; border-color: #58a6ff; color: #58a6ff; }
    .tbs-btn-primary:hover { background: #234070; }
    .tbs-dots { display: flex; gap: 6px; align-items: center; margin-left: 4px; }
    .tbs-dot { width: 8px; height: 8px; border-radius: 50%; background: #30363d; cursor: pointer; transition: background .2s; }
    .tbs-dot.active { background: #58a6ff; }
    .tbs-caption { font-family: system-ui, sans-serif; font-size: 11px; color: #8b949e; padding: 4px 14px; }
    .tbs-caption a { color: #58a6ff; text-decoration: none; }
    .tbs-caption a:hover { text-decoration: underline; }
  `;
  stage.appendChild(style);

  // SVG stage
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.classList.add('tbs-svg');
  stage.appendChild(svg);

  // Panel
  panel.innerHTML = `<div class="tbs-panel">
    <div class="tbs-panel-title" id="tbs-p-title"></div>
    <div class="tbs-panel-desc" id="tbs-p-desc"></div>
    <div class="tbs-panel-metric"><span class="tbs-panel-key">ETH price</span><span class="tbs-panel-val">$${data.snapshot.ethUsd.toLocaleString()}</span></div>
    <div class="tbs-panel-metric"><span class="tbs-panel-key">Block</span><span class="tbs-panel-val">#${data.snapshot.blockNumber.toLocaleString()}</span></div>
    <div class="tbs-panel-metric"><span class="tbs-panel-key">Gas (avg)</span><span class="tbs-panel-val">${data.snapshot.gasAvgGwei} Gwei</span></div>
    <div class="tbs-panel-metric"><span class="tbs-panel-key">Contract</span><span class="tbs-panel-val" style="font-size:10px;word-break:break-all">${data.snapshot.contractAddress.slice(0, 10)}…${data.snapshot.contractAddress.slice(-4)}</span></div>
  </div>`;

  // Controls
  controls.innerHTML = `<div class="tbs-controls">
    <button class="tbs-btn" id="tbs-prev">← Prev</button>
    <button class="tbs-btn tbs-btn-primary" id="tbs-next">Next →</button>
    <button class="tbs-btn" id="tbs-auto">▶ Auto</button>
    <div class="tbs-dots" id="tbs-dots"></div>
  </div>`;

  const dotsEl = controls.querySelector('#tbs-dots')!;
  const dots: HTMLElement[] = STEPS.map((_, i) => {
    const d = document.createElement('div');
    d.className = 'tbs-dot';
    d.title = STEPS[i]!.label;
    dotsEl.appendChild(d);
    return d;
  });

  // Caption
  caption.innerHTML = `<div class="tbs-caption">
    Data: <a href="${data.snapshot.contractAddress ? `https://eth.blockscout.com/address/${data.snapshot.contractAddress}` : '#'}" target="_blank" rel="noopener">CoW Protocol GPv2Settlement</a>
    · Snapshot ${data.snapshot.timestamp.slice(0, 10)} · Block #${data.snapshot.blockNumber.toLocaleString()}
  </div>`;

  // State
  let stepIdx = 0;
  let autoTimer: ReturnType<typeof setInterval> | null = null;

  const panelTitle = panel.querySelector('#tbs-p-title')!;
  const panelDesc = panel.querySelector('#tbs-p-desc')!;
  const prevBtn = controls.querySelector('#tbs-prev') as HTMLButtonElement;
  const nextBtn = controls.querySelector('#tbs-next') as HTMLButtonElement;
  const autoBtn = controls.querySelector('#tbs-auto') as HTMLButtonElement;

  function render(): void {
    buildDiagram(svg, stepIdx);
    const step = STEPS[stepIdx]!;
    panelTitle.textContent = `${stepIdx + 1}. ${step.label}`;
    panelDesc.textContent = step.description;
    dots.forEach((d, i) => d.classList.toggle('active', i === stepIdx));
    prevBtn.disabled = stepIdx === 0;
    nextBtn.disabled = stepIdx === N - 1;
  }

  function goTo(i: number): void {
    stepIdx = Math.max(0, Math.min(N - 1, i));
    render();
  }

  function stopAuto(): void {
    if (autoTimer !== null) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    autoBtn.textContent = '▶ Auto';
    autoBtn.classList.remove('tbs-btn-primary');
  }

  function startAuto(): void {
    stopAuto();
    autoTimer = setInterval(() => {
      if (stepIdx < N - 1) {
        goTo(stepIdx + 1);
      } else {
        goTo(0);
      }
    }, 2200);
    autoBtn.textContent = '⏸ Stop';
    autoBtn.classList.add('tbs-btn-primary');
  }

  prevBtn.addEventListener('click', () => { stopAuto(); goTo(stepIdx - 1); });
  nextBtn.addEventListener('click', () => { stopAuto(); goTo(stepIdx + 1); });
  autoBtn.addEventListener('click', () => { autoTimer ? stopAuto() : startAuto(); });
  dots.forEach((d, i) => d.addEventListener('click', () => { stopAuto(); goTo(i); }));

  render();

  return () => {
    stopAuto();
    layout.dispose();
    style.remove();
  };
}
