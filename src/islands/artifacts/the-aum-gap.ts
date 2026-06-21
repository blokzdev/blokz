import { createArtifactLayout } from '@/lib/artifact-layout';
import DATA from '../../../content/artifacts/the-aum-gap/data.json';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 800, VB_H = 310;
const R_LEFT = 68, R_RIGHT = 760, R_TOP = 14, R_BOT = 248, R_LABEL_Y = 298;
const BAR_W = 90;
const LOG_MIN = -2, LOG_MAX = 5;

const G_CENTER_Y = 155;
const G_SCALE = 128 / 2_100_000_000;
const TIER_X = [220, 560];
const TIER_W = 140;

const CAT_COLOR: Record<string, string> = {
  ai: '#f07240',
  defi: '#7c8cff',
  trad: '#22d3ee',
};
const GAIN_POS = '#22d3ee';
const GAIN_NEG = '#f07240';
const GAIN_LINE = '#facc15';

type Mode = 'ratio' | 'gains';

function ratioToY(r: number): number {
  const log = Math.log10(Math.max(r, Math.pow(10, LOG_MIN)));
  const clamped = Math.max(LOG_MIN, Math.min(LOG_MAX, log));
  return R_BOT - ((clamped - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (R_BOT - R_TOP);
}

function barCenterX(i: number): number {
  const n = DATA.ratios.length;
  const gap = (R_RIGHT - R_LEFT) / n;
  return R_LEFT + gap * i + gap / 2;
}

function gainY(usd: number): number {
  return G_CENTER_Y - usd * G_SCALE;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '+';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '800/310',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .ag-svg { width:100%; height:100%; overflow:visible; }
    .ag-bar,.ag-gbar { cursor:pointer; transition:opacity .15s; }
    .ag-bar:hover,.ag-gbar:hover { opacity:.75; }
    .ag-bar.ag-sel { stroke:#fff; stroke-width:2; }
    .ag-gbar.ag-sel { stroke:#fff; stroke-width:2; }
    .ag-axis { stroke:#4b5563; stroke-width:1; fill:none; }
    .ag-grid { stroke:#374151; stroke-width:1; stroke-dasharray:3 4; fill:none; }
    .ag-lbl { fill:#9ca3af; font-size:11px; font-family:inherit; }
    .ag-blbl { fill:#e5e7eb; font-size:10px; font-family:inherit; }
    .ag-vlbl { font-size:9px; font-family:inherit; font-weight:600; }
    .ag-cline { stroke:#6b7280; stroke-width:1; stroke-dasharray:4 3; fill:none; }
    .ag-nline { stroke:${GAIN_LINE}; stroke-width:1.5; stroke-dasharray:5 3; fill:none; }
    .ag-nlbl { fill:${GAIN_LINE}; font-size:9px; font-family:inherit; }
    .ag-tabs { display:flex; gap:6px; flex-wrap:wrap; }
    .ag-tab { padding:5px 12px; border-radius:6px; border:1px solid #374151;
              background:#111827; color:#9ca3af; font-size:12px; cursor:pointer;
              transition:all .15s; white-space:nowrap; }
    .ag-tab:hover { border-color:#6b7280; color:#e5e7eb; }
    .ag-tab.ag-active { background:#1f2937; border-color:#7c8cff; color:#e5e7eb; }
    .ag-pinner { padding:12px; display:flex; flex-direction:column; gap:8px;
                 font-family:inherit; }
    .ag-ctag { font-size:9px; font-weight:700; letter-spacing:.06em;
               text-transform:uppercase; padding:2px 6px; border-radius:4px;
               display:inline-block; width:fit-content; }
    .ag-cname { font-size:14px; font-weight:600; color:#e5e7eb; }
    .ag-csub { font-size:11px; color:#9ca3af; }
    .ag-cval { font-size:22px; font-weight:700; }
    .ag-cnote { font-size:11px; color:#9ca3af; line-height:1.5; }
    .ag-stats { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px; }
    .ag-stat { background:#1f2937; border-radius:6px; padding:6px 8px; }
    .ag-stat-v { font-size:13px; font-weight:600; color:#e5e7eb; }
    .ag-stat-l { font-size:10px; color:#6b7280; }
    .ag-hint { font-size:11px; color:#6b7280; padding:16px 12px; }
    .ag-cap { font-size:11px; color:#6b7280; }
  `;
  stage.appendChild(style);

  const svg = svgEl('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, class: 'ag-svg' }) as SVGSVGElement;
  stage.appendChild(svg);

  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'ag-tabs';
  const tabRatio = document.createElement('button');
  tabRatio.className = 'ag-tab ag-active';
  tabRatio.textContent = 'MC / AUM Ratio';
  const tabGains = document.createElement('button');
  tabGains.className = 'ag-tab';
  tabGains.textContent = 'Who Profited';
  tabsDiv.append(tabRatio, tabGains);
  controls.appendChild(tabsDiv);

  const panelDiv = document.createElement('div');
  panelDiv.className = 'ag-pinner';
  panel.appendChild(panelDiv);

  const capEl = document.createElement('p');
  capEl.className = 'ag-cap';
  caption.appendChild(capEl);

  let mode: Mode = 'ratio';
  let selectedRatio: string | null = null;
  let selectedTier: string | null = null;

  function emptyPanel(): void {
    panelDiv.innerHTML = `<div class="ag-hint">Click a bar to see details</div>`;
  }

  function ratioPanel(id: string): void {
    const item = DATA.ratios.find(r => r.id === id);
    if (!item) return;
    const col = CAT_COLOR[item.category] ?? '#9ca3af';
    const tag = item.category === 'ai' ? 'AI Agent' : item.category === 'defi' ? 'DeFi Protocol' : 'Traditional';
    panelDiv.innerHTML = `
      <span class="ag-ctag" style="background:${col}22;color:${col}">${tag}</span>
      <div class="ag-cname">${item.label}</div>
      <div class="ag-csub">${item.sublabel}</div>
      <div class="ag-cval" style="color:${col}">${item.ratioDisplay}</div>
      <div class="ag-cnote">${item.ratioNote}</div>
    `;
  }

  function gainsPanel(id: string): void {
    const tier = DATA.gainDistribution.tiers.find(t => t.id === id);
    if (!tier) return;
    const col = tier.gainUsd >= 0 ? GAIN_POS : GAIN_NEG;
    const shareStr = (tier as { shareOfGains?: number }).shareOfGains != null
      ? `${(tier as { shareOfGains: number }).shareOfGains}% of all gains`
      : 'Net loss cohort';
    panelDiv.innerHTML = `
      <span class="ag-ctag" style="background:${col}22;color:${col}">${shareStr}</span>
      <div class="ag-cname">${tier.label}</div>
      <div class="ag-csub">${tier.sublabel}</div>
      <div class="ag-cval" style="color:${col}">${fmtUsd(tier.gainUsd)}</div>
      <div class="ag-stats">
        <div class="ag-stat">
          <div class="ag-stat-v">${DATA.gainDistribution.surveyed}</div>
          <div class="ag-stat-l">projects studied</div>
        </div>
        <div class="ag-stat">
          <div class="ag-stat-v">${DATA.gainDistribution.avgAthDeclinePct}%</div>
          <div class="ag-stat-l">avg ATH decline</div>
        </div>
      </div>
      <div class="ag-cnote">${tier.note}</div>
    `;
  }

  function renderRatioMode(): void {
    svg.innerHTML = '';

    const logTicks = [-2, -1, 0, 1, 2, 3, 4, 5];
    const tickLabels: Record<string, string> = {
      '-2': '0.01×', '-1': '0.1×', '0': '1×', '1': '10×',
      '2': '100×', '3': '1k×', '4': '10k×', '5': '100k×',
    };

    for (const tick of logTicks) {
      const y = ratioToY(Math.pow(10, tick));
      svg.appendChild(svgEl('line', {
        x1: String(R_LEFT), x2: String(R_RIGHT),
        y1: String(y), y2: String(y),
        class: tick === 0 ? 'ag-axis' : 'ag-grid',
      }));
      const lbl = svgEl('text', {
        x: String(R_LEFT - 6), y: String(y + 4),
        'text-anchor': 'end', class: 'ag-lbl',
      });
      lbl.textContent = tickLabels[String(tick)] ?? '';
      svg.appendChild(lbl);
    }

    const axLbl = svgEl('text', {
      x: '10', y: String((R_TOP + R_BOT) / 2),
      'text-anchor': 'middle', class: 'ag-lbl',
      transform: `rotate(-90,10,${(R_TOP + R_BOT) / 2})`,
    });
    axLbl.textContent = 'MC ÷ AUM (log scale)';
    svg.appendChild(axLbl);

    DATA.ratios.forEach((item, i) => {
      const cx = barCenterX(i);
      const topY = ratioToY(item.ratio);
      const baseY = ratioToY(1);
      const col = CAT_COLOR[item.category] ?? '#9ca3af';
      const isSelected = selectedRatio === item.id;

      const barTop = Math.min(topY, baseY);
      const barH = Math.max(Math.abs(topY - baseY), 2);
      const rect = svgEl('rect', {
        x: String(cx - BAR_W / 2), y: String(barTop),
        width: String(BAR_W), height: String(barH),
        fill: col, 'fill-opacity': '0.85', rx: '4',
        class: 'ag-bar' + (isSelected ? ' ag-sel' : ''),
      });
      svg.appendChild(rect);

      const vlY = item.ratio >= 1 ? barTop - 5 : barTop + barH + 13;
      const vl = svgEl('text', {
        x: String(cx), y: String(vlY),
        'text-anchor': 'middle', class: 'ag-vlbl', fill: col,
      });
      vl.textContent = item.ratioDisplay;
      svg.appendChild(vl);

      const nl = svgEl('text', {
        x: String(cx), y: String(R_LABEL_Y),
        'text-anchor': 'middle', class: 'ag-blbl',
      });
      nl.textContent = item.label;
      svg.appendChild(nl);

      rect.addEventListener('click', () => {
        selectedRatio = item.id;
        renderRatioMode();
        ratioPanel(item.id);
      });
    });

    capEl.textContent = 'MC/AUM ratios · Yu, Zhao, Sui (2026) “Paper Agents, Paper Gains” arXiv:2605.29174 · DeFi TVL: public estimates 2026-Q2 · Prices: Crypto.com Exchange 2026-06-21';
    if (selectedRatio) ratioPanel(selectedRatio);
    else emptyPanel();
  }

  function renderGainsMode(): void {
    svg.innerHTML = '';

    const gd = DATA.gainDistribution;

    svg.appendChild(svgEl('line', {
      x1: '70', x2: String(VB_W - 20),
      y1: String(G_CENTER_Y), y2: String(G_CENTER_Y),
      class: 'ag-cline',
    }));

    const netY = gainY(gd.netHolderLossUsd);
    svg.appendChild(svgEl('line', {
      x1: '70', x2: String(VB_W - 20),
      y1: String(netY), y2: String(netY),
      class: 'ag-nline',
    }));
    const nlbl = svgEl('text', {
      x: '74', y: String(netY - 4), class: 'ag-nlbl',
    });
    nlbl.textContent = `Net: ${fmtUsd(gd.netHolderLossUsd)} across all holders`;
    svg.appendChild(nlbl);

    const yTicks = [2e9, 1e9, 0, -1e9, -2e9];
    for (const val of yTicks) {
      const y = gainY(val);
      if (y < 10 || y > VB_H - 10) continue;
      svg.appendChild(svgEl('line', {
        x1: '70', x2: '108', y1: String(y), y2: String(y), class: 'ag-grid',
      }));
      const tl = svgEl('text', {
        x: '68', y: String(y + 4), 'text-anchor': 'end', class: 'ag-lbl',
      });
      tl.textContent = fmtUsd(val);
      svg.appendChild(tl);
    }

    const axLbl = svgEl('text', {
      x: '-155', y: '14', class: 'ag-lbl',
      transform: 'rotate(-90)',
    });
    axLbl.textContent = 'Net gain / loss (USD)';
    svg.appendChild(axLbl);

    gd.tiers.forEach((tier, i) => {
      const cx = TIER_X[i] ?? (VB_W / 2);
      const isPos = tier.gainUsd >= 0;
      const col = isPos ? GAIN_POS : GAIN_NEG;
      const topY = gainY(tier.gainUsd);
      const botY = G_CENTER_Y;
      const barTop = Math.min(topY, botY);
      const barH = Math.max(Math.abs(topY - botY), 2);
      const isSelected = selectedTier === tier.id;

      const rect = svgEl('rect', {
        x: String(cx - TIER_W / 2), y: String(barTop),
        width: String(TIER_W), height: String(barH),
        fill: col, 'fill-opacity': '0.85', rx: '6',
        class: 'ag-gbar' + (isSelected ? ' ag-sel' : ''),
      });
      svg.appendChild(rect);

      const vlY = isPos ? barTop - 6 : barTop + barH + 14;
      const vl = svgEl('text', {
        x: String(cx), y: String(vlY),
        'text-anchor': 'middle', 'font-size': '12',
        'font-weight': '600', fill: col, 'font-family': 'inherit',
      });
      vl.textContent = fmtUsd(tier.gainUsd);
      svg.appendChild(vl);

      const nameY = isPos ? barTop + barH + 16 : barTop - 8;
      const nl = svgEl('text', {
        x: String(cx), y: String(nameY),
        'text-anchor': 'middle', class: 'ag-blbl',
      });
      nl.textContent = tier.label;
      svg.appendChild(nl);

      rect.addEventListener('click', () => {
        selectedTier = tier.id;
        renderGainsMode();
        gainsPanel(tier.id);
      });
    });

    capEl.textContent = `Gain distribution across ${gd.totalHolders.toLocaleString()} holders · ${gd.surveyed} AI agent token projects · Yu, Zhao, Sui (2026) arXiv:2605.29174`;
    if (selectedTier) gainsPanel(selectedTier);
    else emptyPanel();
  }

  function setMode(m: Mode): void {
    mode = m;
    tabRatio.classList.toggle('ag-active', m === 'ratio');
    tabGains.classList.toggle('ag-active', m === 'gains');
    if (m === 'ratio') renderRatioMode();
    else renderGainsMode();
  }

  tabRatio.addEventListener('click', () => setMode('ratio'));
  tabGains.addEventListener('click', () => setMode('gains'));

  setMode('ratio');

  return () => {
    layout.dispose();
    style.remove();
  };
}
