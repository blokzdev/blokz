/**
 * Artifact: the-finality-ladder — The Finality Ladder
 * Log-scale horizontal chart showing settlement trust rungs across four rollup
 * architectures (OP Stack, Arbitrum, ZK Rollup, Based Rollup). Each segment
 * represents one settlement stage; clicking reveals trust level, timing, and
 * which AI agent actions are safe at that rung.
 */
import data from '../../../content/artifacts/the-finality-ladder/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 900;
const VB_H = 310;
const PLOT_X0 = 136; // left margin for row labels
const PLOT_X1 = 887;
const PLOT_W = PLOT_X1 - PLOT_X0;
const GRID_TOP = 28;
const GRID_BOT = 260;
const BAR_H = 28;
const ROW_GAP = 56;
const ROW_Y0 = 52; // y of first bar

/* --- Log scale: 1s → 1,000,000s --- */
const LOG_MIN = 0; // log10(1) = 0
const LOG_MAX = 6; // log10(1,000,000) = 6

function xOf(seconds: number): number {
  if (seconds <= 0) return PLOT_X0;
  const t = Math.log10(seconds);
  return PLOT_X0 + ((t - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_W;
}

/* Trust level colors */
const TRUST_COLORS: Record<number, string> = {
  1: '#f0a23b',
  2: '#5b8cff',
  3: '#8b5cf6',
  4: '#22d3ee',
};

/* Log gridline tick positions (seconds) */
const TICKS: Array<[number, string]> = [
  [1, '1s'],
  [10, '10s'],
  [60, '1m'],
  [600, '10m'],
  [3600, '1h'],
  [86400, '1d'],
  [604800, '7d'],
];

interface Stage {
  id: string;
  label: string;
  seconds: number;
  trustLevel: number;
  agentUse: string;
  risk: string;
}
interface Chain {
  id: string;
  name: string;
  examples: string;
  color: string;
  stages: Stage[];
}

const chains = data.chains as Chain[];

export default function mount(container: HTMLElement): () => void {
  let selectedChainId = 'op-stack';
  let selectedStageId: string | null = null;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '900/310',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  /* ---- Styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    .fl-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .fl-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block;
      touch-action:pan-y; }
    .fl-grid { stroke:rgba(124,140,255,.09); stroke-width:1; }
    .fl-gridlabel { fill:#5b6378; font:500 9.5px 'JetBrains Mono',monospace; }
    .fl-rowlabel { fill:#cdd3e3; font:600 11px 'JetBrains Mono',monospace; }
    .fl-rowsub { fill:#5b6378; font:500 9px 'JetBrains Mono',monospace; }
    .fl-seg { cursor:pointer; transition:opacity .15s; opacity:.72; }
    .fl-seg:hover, .fl-seg.fl-active { opacity:1; }
    .fl-seg.fl-dim { opacity:.22; }
    .fl-segborder { fill:none; stroke:rgba(255,255,255,.22); stroke-width:.8; pointer-events:none; }
    .fl-seglabel { fill:#fff; font:600 9px 'JetBrains Mono',monospace; pointer-events:none;
      dominant-baseline:middle; }

    .fl-controls { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
    .fl-tabs button { appearance:none; border:1px solid rgba(124,140,255,.16);
      background:transparent; color:#8d95ad; font:600 10px 'JetBrains Mono',monospace;
      letter-spacing:.02em; padding:5px 8px; border-radius:7px; cursor:pointer;
      display:flex; align-items:center; gap:5px;
      transition:color .18s, background .18s, border-color .18s; }
    .fl-tabs button[aria-pressed="true"] { background:rgba(124,140,255,.12);
      color:#e7eaf3; border-color:rgba(124,140,255,.4); }
    .fl-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .fl-swatch { width:8px; height:8px; border-radius:2px; flex:none; }

    .fl-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .fl-card { border:1px solid rgba(124,140,255,.16); border-radius:9px; padding:10px 12px;
      background:rgba(13,19,34,.9); display:flex; flex-direction:column; gap:5px; min-width:0; }
    .fl-chain { font:600 10px 'JetBrains Mono',monospace; letter-spacing:.04em;
      text-transform:uppercase; color:#5b6378; }
    .fl-stage { font:700 14px 'JetBrains Mono',monospace; color:#e7eaf3; }
    .fl-time { font:600 12px 'JetBrains Mono',monospace;
      font-variant-numeric:tabular-nums; }
    .fl-trust { font:600 10px 'JetBrains Mono',monospace; letter-spacing:.04em;
      text-transform:uppercase; margin-top:2px; }
    .fl-divider { border:none; border-top:1px solid rgba(124,140,255,.1); margin:4px 0; }
    .fl-label { font:500 9px 'JetBrains Mono',monospace; letter-spacing:.05em;
      text-transform:uppercase; color:#5b6378; margin-bottom:2px; }
    .fl-text { font:500 11px/1.5 Inter,sans-serif; color:#8d95ad; overflow-wrap:anywhere; }
    .fl-text b { color:#cdd3e3; font-weight:600; }
    .fl-empty { font:500 11px/1.5 Inter,sans-serif; color:#5b6378; font-style:italic; }

    .fl-cap { font-size:9.5px; color:#5b6378; line-height:1.5; overflow-wrap:anywhere; }
    .fl-cap b { color:#8d95ad; }
  `;
  stage.appendChild(style);

  /* ---- SVG chart ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'fl-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);

  /* vertical log gridlines */
  for (const [secs, label] of TICKS) {
    const x = xOf(secs);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(GRID_TOP));
    line.setAttribute('y2', String(GRID_BOT));
    line.setAttribute('class', 'fl-grid');
    svg.appendChild(line);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(GRID_BOT + 14));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'fl-gridlabel');
    t.textContent = label;
    svg.appendChild(t);
  }

  /* axis label */
  const axTitle = document.createElementNS(NS, 'text');
  axTitle.setAttribute('x', String(PLOT_X1));
  axTitle.setAttribute('y', String(GRID_BOT + 28));
  axTitle.setAttribute('text-anchor', 'end');
  axTitle.setAttribute('class', 'fl-gridlabel');
  axTitle.textContent = 'time since transaction (log scale) →';
  svg.appendChild(axTitle);

  /* per-chain rows */
  type SegEl = { rect: SVGRectElement; border: SVGRectElement; label: SVGTextElement; stage: Stage; chain: Chain };
  const allSegs: SegEl[] = [];

  chains.forEach((chain, ci) => {
    const yBar = ROW_Y0 + ci * ROW_GAP;
    const yLabel = yBar - 10;

    /* row label */
    const lab = document.createElementNS(NS, 'text');
    lab.setAttribute('x', '4');
    lab.setAttribute('y', String(yLabel + 10));
    lab.setAttribute('dominant-baseline', 'middle');
    lab.setAttribute('class', 'fl-rowlabel');
    lab.textContent = chain.name;
    svg.appendChild(lab);

    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', '4');
    sub.setAttribute('y', String(yLabel + 23));
    sub.setAttribute('class', 'fl-rowsub');
    sub.textContent = chain.examples;
    svg.appendChild(sub);

    /* stage segments */
    chain.stages.forEach((st, si) => {
      const x0 = si === 0 ? PLOT_X0 : xOf(chain.stages[si - 1]!.seconds);
      const x1 = si === chain.stages.length - 1 ? PLOT_X1 : xOf(st.seconds);
      const w = Math.max(2, x1 - x0);
      const color = TRUST_COLORS[st.trustLevel] ?? '#5b8cff';

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x0));
      rect.setAttribute('y', String(yBar));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(BAR_H));
      rect.setAttribute('fill', color);
      rect.setAttribute('class', 'fl-seg');
      rect.setAttribute('rx', '3');
      svg.appendChild(rect);

      const border = document.createElementNS(NS, 'rect');
      border.setAttribute('x', String(x0));
      border.setAttribute('y', String(yBar));
      border.setAttribute('width', String(w));
      border.setAttribute('height', String(BAR_H));
      border.setAttribute('class', 'fl-segborder');
      border.setAttribute('rx', '3');
      svg.appendChild(border);

      /* inline label — only if wide enough */
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', String(x0 + w / 2));
      lbl.setAttribute('y', String(yBar + BAR_H / 2));
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('class', 'fl-seglabel');
      lbl.textContent = w > 52 ? st.label : '';
      svg.appendChild(lbl);

      rect.addEventListener('click', () => select(chain.id, st.id));

      allSegs.push({ rect, border, label: lbl, stage: st, chain });
    });
  });

  /* ---- Controls ---- */
  const ctrls = document.createElement('div');
  ctrls.className = 'fl-controls';
  const tabs = document.createElement('div');
  tabs.className = 'fl-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Select rollup type');

  const tabBtns: HTMLButtonElement[] = [];
  chains.forEach((chain) => {
    const b = document.createElement('button');
    b.type = 'button';
    const sw = document.createElement('span');
    sw.className = 'fl-swatch';
    sw.style.background = chain.color;
    const txt = document.createElement('span');
    txt.textContent = chain.name;
    b.append(sw, txt);
    b.setAttribute('aria-pressed', String(chain.id === selectedChainId));
    b.addEventListener('click', () => selectChain(chain.id));
    tabs.appendChild(b);
    tabBtns.push(b);
  });
  ctrls.appendChild(tabs);
  controlsSlot.appendChild(ctrls);

  /* ---- Panel ---- */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'fl-panel';

  const card = document.createElement('div');
  card.className = 'fl-card';

  const chainLabel = document.createElement('div');
  chainLabel.className = 'fl-chain';
  const stageLabel = document.createElement('div');
  stageLabel.className = 'fl-stage';
  const timeLabel = document.createElement('div');
  timeLabel.className = 'fl-time';
  const trustLabel = document.createElement('div');
  trustLabel.className = 'fl-trust';
  const divider = document.createElement('hr');
  divider.className = 'fl-divider';

  const agentLbl = document.createElement('div');
  agentLbl.className = 'fl-label';
  agentLbl.textContent = 'Agent use cases';
  const agentText = document.createElement('div');
  agentText.className = 'fl-text';

  const riskLbl = document.createElement('div');
  riskLbl.className = 'fl-label';
  riskLbl.textContent = 'Trust / risk';
  const riskText = document.createElement('div');
  riskText.className = 'fl-text';

  card.append(chainLabel, stageLabel, timeLabel, trustLabel, divider, agentLbl, agentText, riskLbl, riskText);

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'fl-empty';
  emptyMsg.textContent = 'Click a segment on the chart to see trust level and agent use cases.';

  panelWrap.append(emptyMsg, card);
  panel.appendChild(panelWrap);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'fl-cap';
  cap.innerHTML =
    `<b>Log scale</b>: each decade on the x-axis spans 10×. OP Stack / Arbitrum fraud-proof windows (7 days / 6.4 days) ` +
    `dominate the right side. ZK rollup proof generation (~1–4 hr) lands in the middle. Based rollup Casper FFG (~12.8 min) ` +
    `is the fastest path to cryptographic finality. Data: <b>L2Beat + Optimism, Arbitrum BoLD, zkSync, StarkNet, Taiko docs</b> — 2026-06-21.`;
  caption.appendChild(cap);

  /* ---- Helpers ---- */
  function fmtSeconds(s: number): string {
    if (s < 60) return `~${s}s`;
    if (s < 3600) return `~${Math.round(s / 60)}m`;
    if (s < 86400) return `~${(s / 3600).toFixed(s % 3600 === 0 ? 0 : 1)}h`;
    return `~${(s / 86400).toFixed(s % 86400 === 0 ? 0 : 1)}d`;
  }

  function render() {
    card.style.display = selectedStageId ? '' : 'none';
    emptyMsg.style.display = selectedStageId ? 'none' : '';

    if (selectedStageId) {
      const chain = chains.find((c) => c.id === selectedChainId)!;
      const st = chain.stages.find((s) => s.id === selectedStageId)!;
      const tl = data.trustLevels[String(st.trustLevel) as keyof typeof data.trustLevels];

      chainLabel.textContent = `${chain.name} · ${chain.examples}`;
      stageLabel.textContent = st.label;
      timeLabel.textContent = fmtSeconds(st.seconds);
      timeLabel.style.color = TRUST_COLORS[st.trustLevel] ?? '#e7eaf3';
      trustLabel.textContent = tl?.label ?? '';
      trustLabel.style.color = TRUST_COLORS[st.trustLevel] ?? '#e7eaf3';
      agentText.innerHTML = st.agentUse;
      riskText.innerHTML = st.risk;
    }

    /* dim/highlight segments */
    allSegs.forEach(({ rect, chain, stage: st }) => {
      const isActiveChain = chain.id === selectedChainId;
      const isActiveSeg = chain.id === selectedChainId && st.id === selectedStageId;
      if (selectedStageId) {
        rect.classList.toggle('fl-active', isActiveSeg);
        rect.classList.toggle('fl-dim', !isActiveChain || !isActiveSeg);
        rect.classList.toggle('fl-seg', true);
      } else {
        rect.classList.toggle('fl-active', false);
        rect.classList.toggle('fl-dim', !isActiveChain);
      }
    });

    /* update tab buttons */
    tabBtns.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(chains[i]!.id === selectedChainId));
    });
  }

  function select(chainId: string, stageId: string) {
    if (selectedChainId === chainId && selectedStageId === stageId) {
      selectedStageId = null;
    } else {
      selectedChainId = chainId;
      selectedStageId = stageId;
    }
    render();
  }

  function selectChain(chainId: string) {
    selectedChainId = chainId;
    selectedStageId = null;
    render();
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
