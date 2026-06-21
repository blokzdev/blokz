/**
 * Artifact: the-enforcement-gap — The Enforcement Gap
 * Manifest: content/artifacts/the-enforcement-gap/manifest.json
 *
 * Animated SVG line chart showing market price trajectories under three
 * governance regimes (Ungoverned / Constitutional / Institutional) derived
 * from Syrnikov et al. arXiv:2601.11369 LLM collusion experiments.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-enforcement-gap/data.json';

const NS = 'http://www.w3.org/2000/svg';

interface Regime {
  id: string;
  label: string;
  color: string;
  severeRate: number;
  meanTier: number;
  prices: number[];
  govStates?: string[];
}

interface Data {
  rounds: number;
  competitivePrice: number;
  monopolyPrice: number;
  regimes: Regime[];
  cohensD: number;
  source: string;
  asOf: string;
}

const data = rawData as Data;

const W = 700, H = 250;
const PX = { l: 48, r: 24, t: 20, b: 38 };

function pxX(round: number): number {
  return PX.l + (round / (data.rounds - 1)) * (W - PX.l - PX.r);
}

function pxY(price: number): number {
  const lo = 0.20, hi = 0.55;
  return PX.t + (1 - (price - lo) / (hi - lo)) * (H - PX.t - PX.b);
}

function pointsStr(prices: number[]): string {
  return prices.map((p, i) => `${pxX(i).toFixed(1)},${pxY(p).toFixed(1)}`).join(' ');
}

function svgEl<T extends SVGElement>(tag: string, attrs: Record<string, string | number>): T {
  const el = document.createElementNS(NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '700/250',
  });
  const { stage, panel, controls, caption } = layout;

  /* ── styles ─────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .teg-svg { width: 100%; height: 100%; display: block; }
    .teg-axis { stroke: rgba(124,140,255,.18); stroke-width: 1; }
    .teg-tick { fill: #8d95ad; font-size: 10px; font-family: 'JetBrains Mono', monospace; }
    .teg-ref  { stroke-dasharray: 4 3; stroke-width: 1; }
    .teg-ref-label { font-size: 9px; font-family: 'JetBrains Mono', monospace; }
    .teg-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .teg-panel { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
    .teg-card  { background: var(--color-panel, #0d1322); border: 1px solid rgba(124,140,255,.15);
                 border-radius: 8px; padding: 8px 12px; min-width: 0; }
    .teg-card-label { font-size: 11px; font-weight: 600; font-family: 'Space Grotesk', sans-serif;
                      letter-spacing: .02em; margin-bottom: 4px; }
    .teg-card-stat  { font-size: 10px; color: var(--color-muted, #8d95ad);
                      font-family: 'JetBrains Mono', monospace; }
    .teg-card-stat span { font-weight: 700; }
    .teg-badge { display: inline-block; font-size: 9px; font-family: 'JetBrains Mono', monospace;
                 border-radius: 4px; padding: 1px 6px; margin-top: 4px; }
    .teg-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .teg-btn { background: rgba(91,140,255,.12); border: 1px solid rgba(91,140,255,.3);
               color: #e7eaf3; border-radius: 6px; padding: 5px 14px; font-size: 12px;
               font-family: 'Space Grotesk', sans-serif; cursor: pointer; transition: background .15s; }
    .teg-btn:hover { background: rgba(91,140,255,.22); }
    .teg-btn:disabled { opacity: .4; cursor: default; }
    .teg-caption { font-size: 11px; color: var(--color-muted, #8d95ad);
                   font-family: 'JetBrains Mono', monospace; }
    .teg-caption a { color: inherit; text-decoration: underline; }
  `;
  stage.appendChild(style);

  /* ── SVG scaffold ────────────────────────────────────────────── */
  const svg = svgEl<SVGSVGElement>('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'teg-svg',
  });
  stage.appendChild(svg);

  // grid lines + y-axis ticks
  const priceTicks = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
  for (const p of priceTicks) {
    const y = pxY(p).toFixed(1);
    const line = svgEl<SVGLineElement>('line', {
      x1: PX.l, y1: y, x2: W - PX.r, y2: y, class: 'teg-axis',
    });
    svg.appendChild(line);
    const label = svgEl<SVGTextElement>('text', {
      x: PX.l - 6, y: y, class: 'teg-tick',
      'text-anchor': 'end', 'dominant-baseline': 'middle',
    });
    label.textContent = `$${p.toFixed(2)}`;
    svg.appendChild(label);
  }

  // x-axis ticks (rounds)
  const roundTicks = [0, 4, 9, 14, 19];
  for (const r of roundTicks) {
    const x = pxX(r).toFixed(1);
    const label = svgEl<SVGTextElement>('text', {
      x, y: H - PX.b + 14, class: 'teg-tick',
      'text-anchor': 'middle',
    });
    label.textContent = `R${r + 1}`;
    svg.appendChild(label);
  }

  // x-axis label
  const xLabel = svgEl<SVGTextElement>('text', {
    x: (PX.l + W - PX.r) / 2, y: H - 4, class: 'teg-tick',
    'text-anchor': 'middle',
  });
  xLabel.textContent = 'Auction Round';
  svg.appendChild(xLabel);

  // reference lines: competitive (Nash) + monopoly
  const refLines: Array<{ price: number; color: string; label: string; anchor: string }> = [
    { price: data.competitivePrice, color: '#4ade80', label: 'Nash', anchor: 'start' },
    { price: data.monopolyPrice, color: '#f43f5e', label: 'Mono', anchor: 'start' },
  ];
  for (const ref of refLines) {
    const y = pxY(ref.price).toFixed(1);
    const rl = svgEl<SVGLineElement>('line', {
      x1: PX.l, y1: y, x2: W - PX.r, y2: y,
      stroke: ref.color, class: 'teg-ref',
    });
    svg.appendChild(rl);
    const rt = svgEl<SVGTextElement>('text', {
      x: W - PX.r + 3, y, class: 'teg-ref-label teg-tick',
      fill: ref.color, 'dominant-baseline': 'middle', 'text-anchor': 'start',
    });
    rt.textContent = ref.label;
    svg.appendChild(rt);
  }

  // regime polylines (drawn via stroke-dasharray animation)
  const lineEls: SVGPolylineElement[] = [];
  const lineLengths: number[] = [];

  for (const regime of data.regimes) {
    const poly = svgEl<SVGPolylineElement>('polyline', {
      points: pointsStr(regime.prices),
      stroke: regime.color,
      class: 'teg-line',
    });
    svg.appendChild(poly);
    lineEls.push(poly);

    // measure path length for dash animation
    const len = poly.getTotalLength?.() ?? 600;
    lineLengths.push(len);
    poly.style.strokeDasharray = `${len}`;
    poly.style.strokeDashoffset = `${len}`;
  }

  /* ── panel ────────────────────────────────────────────────────── */
  panel.className += ' teg-panel';
  const badgeStates: HTMLSpanElement[] = [];

  for (let i = 0; i < data.regimes.length; i++) {
    const regime = data.regimes[i];
    const card = document.createElement('div');
    card.className = 'teg-card';

    const lbl = document.createElement('div');
    lbl.className = 'teg-card-label';
    lbl.style.color = regime.color;
    lbl.textContent = regime.label;
    card.appendChild(lbl);

    const stat = document.createElement('div');
    stat.className = 'teg-card-stat';
    const rateLabel = (regime.severeRate * 100).toFixed(1);
    stat.innerHTML = `Collusion: <span>${rateLabel}%</span> &nbsp; Tier: <span>${regime.meanTier.toFixed(1)}</span>`;
    card.appendChild(stat);

    if (regime.govStates) {
      const badge = document.createElement('span');
      badge.className = 'teg-badge';
      badge.textContent = 'Legal';
      badge.style.background = 'rgba(34,211,238,.12)';
      badge.style.color = '#22d3ee';
      card.appendChild(badge);
      badgeStates.push(badge);
    } else {
      badgeStates.push(document.createElement('span')); // placeholder
    }

    panel.appendChild(card);
  }

  /* ── controls ─────────────────────────────────────────────────── */
  controls.className += ' teg-controls';
  const runBtn = document.createElement('button');
  runBtn.className = 'teg-btn';
  runBtn.textContent = '▶ Run';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'teg-btn';
  resetBtn.textContent = '↺ Reset';
  controls.appendChild(runBtn);
  controls.appendChild(resetBtn);

  /* ── caption ─────────────────────────────────────────────────── */
  caption.className += ' teg-caption';
  caption.innerHTML = `Source: <a href="https://arxiv.org/abs/2601.11369" target="_blank" rel="noopener">${data.source}</a> — price data derived from experiment results (${data.runsPerCondition ?? 90} runs/condition).`;

  /* ── animation ───────────────────────────────────────────────── */
  const ANIM_DURATION = 1800; // ms total for all lines
  let rafId = 0;
  let startTime = 0;
  let running = false;
  let autoTimer = 0;

  function getGovState(roundFrac: number): string {
    const regime = data.regimes.find(r => r.govStates);
    if (!regime?.govStates) return 'Legal';
    const idx = Math.min(Math.floor(roundFrac * data.rounds), data.rounds - 1);
    return regime.govStates[idx] ?? 'Legal';
  }

  function getBadgeStyle(state: string): { bg: string; color: string } {
    if (state === 'Warning') return { bg: 'rgba(234,179,8,.15)', color: '#eab308' };
    if (state === 'Sanctioned') return { bg: 'rgba(249,115,22,.15)', color: '#f97316' };
    return { bg: 'rgba(34,211,238,.12)', color: '#22d3ee' };
  }

  function resetLines(): void {
    for (let i = 0; i < lineEls.length; i++) {
      lineEls[i].style.strokeDashoffset = `${lineLengths[i]}`;
    }
    // reset institutional badge
    const instBadge = badgeStates[2];
    const s = getBadgeStyle('Legal');
    instBadge.style.background = s.bg;
    instBadge.style.color = s.color;
    instBadge.textContent = 'Legal';
  }

  function animate(ts: number): void {
    if (!startTime) startTime = ts;
    const frac = Math.min((ts - startTime) / ANIM_DURATION, 1);

    for (let i = 0; i < lineEls.length; i++) {
      lineEls[i].style.strokeDashoffset = `${lineLengths[i] * (1 - frac)}`;
    }

    // update governance state badge
    const govState = getGovState(frac);
    const instBadge = badgeStates[2];
    if (instBadge) {
      instBadge.textContent = govState;
      const s = getBadgeStyle(govState);
      instBadge.style.background = s.bg;
      instBadge.style.color = s.color;
    }

    if (frac < 1) {
      rafId = requestAnimationFrame(animate);
    } else {
      running = false;
      runBtn.disabled = false;
    }
  }

  function run(): void {
    if (running) return;
    resetLines();
    running = true;
    startTime = 0;
    runBtn.disabled = true;
    rafId = requestAnimationFrame(animate);
  }

  function reset(): void {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    running = false;
    startTime = 0;
    runBtn.disabled = false;
    resetLines();
  }

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', reset);

  // auto-start after brief delay
  autoTimer = window.setTimeout(run, 400);

  return () => {
    clearTimeout(autoTimer);
    if (rafId) cancelAnimationFrame(rafId);
    layout.dispose();
    style.remove();
  };
}
