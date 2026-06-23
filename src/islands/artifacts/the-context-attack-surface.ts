/**
 * Artifact: the-context-attack-surface — The Context Attack Surface
 *
 * Three-tab interactive diagram of context manipulation attack vectors on
 * Web3 AI agents. Select Prompt Injection / Memory Injection / Data Feed to
 * highlight the vulnerable input channel, the corrupted context layer, and
 * the key ASR figures from CrAIBench (arXiv:2503.16248).
 *
 * No data.json — mechanism diagram with inline figures from the paper.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const VW = 876;
const VH = 300;

// ─── Attack definitions ───────────────────────────────────────────────────────
type AttackId = 'prompt' | 'memory' | 'datafeed';

interface AttackDef {
  tab: string;
  color: string;
  bg: string;
  srcIdx: number;
  layerIdx: number;
  entry: string;
  mechanism: string;
  asr: string;
  defense: string;
  mitigation: string;
  severity: 'moderate' | 'high' | 'critical';
}

const ATTACKS: Record<AttackId, AttackDef> = {
  prompt: {
    tab: 'Prompt Injection',
    color: '#f5c451',
    bg: 'rgba(245,196,81,.13)',
    srcIdx: 0,
    layerIdx: 0,
    entry: 'Tool outputs · retrieved docs · NFT metadata',
    mechanism: 'Malicious instructions hidden in content the agent retrieves — tool outputs, fetched documents, on-chain metadata',
    asr: '~80% naive · near-zero for frontier LLMs',
    defense: 'Largely mitigated: frontier alignment resists injection-style payloads',
    mitigation: 'Model alignment + input sanitization',
    severity: 'moderate',
  },
  memory: {
    tab: 'Memory Injection',
    color: '#f43f5e',
    bg: 'rgba(244,63,94,.13)',
    srcIdx: 1,
    layerIdx: 1,
    entry: 'Persistent memory DB (past transactions, approvals, confirmations)',
    mechanism: 'Forged past-transaction records planted in the memory store — agent "remembers" approving or paying an attacker address',
    asr: '55.1% on Claude Sonnet 3.7 · 85.1% baseline (Qwen-2.5-14B)',
    defense: 'NOT mitigated: PromptGuard 2 ~50% bypass, DataSentinel 40% FP on benign tasks',
    mitigation: 'Fine-tuning (85.1%→1.7% ASR) + memory isolation architecture',
    severity: 'critical',
  },
  datafeed: {
    tab: 'Data Feed Manipulation',
    color: '#f97316',
    bg: 'rgba(249,115,22,.13)',
    srcIdx: 2,
    layerIdx: 2,
    entry: 'RPC call results · price oracle · bridge state queries',
    mechanism: 'Compromised RPC endpoint or oracle returns fabricated balances, prices, or bridge confirmations',
    asr: 'Compounds with memory injection in multi-step attacks',
    defense: 'Not independently benchmarked; exploits infrastructure trust',
    mitigation: 'Multi-source cross-check + strict JSON schema validation',
    severity: 'high',
  },
};

// ─── Geometry ─────────────────────────────────────────────────────────────────

const SRC_X = 10;
const SRC_W = 156;

// Source boxes — y-centers align with context layer centers (see below)
const SOURCES: { label: string; sub: string; y: number; h: number }[] = [
  { label: 'SYSTEM PROMPT', sub: 'initial instructions',    y: 38,  h: 52 },
  { label: 'MEMORY DB',     sub: 'tx history · approvals',  y: 112, h: 68 },
  { label: 'TOOL RESULTS',  sub: 'balances · prices · RPC', y: 205, h: 52 },
];
// Centers: 38+26=64, 112+34=146, 205+26=231

const CTX_X = 184;
const CTX_Y = 14;
const CTX_W  = 460;
const CTX_H  = 274;

// Context layers — centers must match source box centers above
// L0 center: 14+22+29=65 ≈ 64 ✓
// L1 center: 14+94+40=148 ≈ 146 ✓
// L2 center: 14+190+28=232 ≈ 231 ✓
const LAYERS: { label: string; sub: string; y: number; h: number }[] = [
  { label: 'INSTRUCTIONS',    sub: 'system policy · agent identity',   y: 22,  h: 58 },
  { label: 'MEMORY RECORDS',  sub: 'interaction history · past state', y: 94,  h: 80 },
  { label: 'TOOL OUTPUT',     sub: 'external data cache',               y: 190, h: 56 },
  { label: 'CURRENT REQUEST', sub: 'live message',                      y: 258, h: 24 },
];

const LLM_CX = 750;
const LLM_CY = 151;
const LLM_R  = 48;

// Design tokens
const C = {
  bg:     '#0d1322',
  border: 'rgba(124,140,255,.22)',
  accentDim: 'rgba(91,140,255,.28)',
  txt:    '#e7eaf3',
  muted:  '#8d95ad',
  faint:  '#5b6378',
  accent: '#5b8cff',
  cyan:   '#22d3ee',
  box:    '#0e1528',
};

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function mk<T extends SVGElement>(
  tag: string,
  attrs: Record<string, string | number> = {},
  text?: string,
): T {
  const e = document.createElementNS(NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

// ─── Mount ────────────────────────────────────────────────────────────────────

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: ctrl, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cas-svg { width:100%; height:100%; display:block; }
    .cas-box  { transition: fill .22s, stroke .22s, stroke-width .22s; }
    .cas-conn { transition: stroke .22s, opacity .22s, stroke-width .22s, stroke-dasharray .22s; }
    .cas-inj  { transition: opacity .22s, fill .22s; }

    .cas-lbl  { font:700 10px 'Space Grotesk',sans-serif; fill:#e7eaf3;
                text-anchor:middle; dominant-baseline:middle; pointer-events:none; }
    .cas-sub  { font:9px 'JetBrains Mono',monospace; fill:#5b6378;
                text-anchor:middle; dominant-baseline:middle; pointer-events:none; }
    .cas-hdr  { font:700 8.5px 'Space Grotesk',sans-serif; letter-spacing:.07em;
                text-transform:uppercase; dominant-baseline:middle; pointer-events:none; }
    .cas-xtra { font:600 8px 'JetBrains Mono',monospace;
                dominant-baseline:middle; pointer-events:none; }

    /* Panel */
    .cas-panel  { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .cas-card   { border:1px solid rgba(124,140,255,.16); border-radius:7px;
                  padding:7px 10px; background:rgba(13,19,34,.9); min-width:0; }
    .cas-clabel { font:600 9px 'Space Grotesk',sans-serif; color:#8d95ad;
                  letter-spacing:.06em; text-transform:uppercase; margin-bottom:3px; }
    .cas-cval   { font:11px 'Space Grotesk',sans-serif; color:#e7eaf3; line-height:1.45; min-width:0; overflow-wrap:anywhere; }
    .cas-sev    { display:inline-block; font:700 9px 'JetBrains Mono',monospace;
                  border-radius:4px; padding:2px 7px; margin-bottom:2px; }
    .cas-sev-critical { background:rgba(244,63,94,.15); color:#f43f5e; border:1px solid rgba(244,63,94,.4); }
    .cas-sev-high     { background:rgba(249,115,22,.15); color:#f97316; border:1px solid rgba(249,115,22,.4); }
    .cas-sev-moderate { background:rgba(245,196,81,.15); color:#f5c451; border:1px solid rgba(245,196,81,.4); }
    .cas-hint   { font:11px 'Space Grotesk',sans-serif; color:#5b6378; line-height:1.5; }

    /* Tabs */
    .cas-tabs { display:flex; gap:6px; flex-wrap:wrap; }
    .cas-tab  { border:1px solid rgba(124,140,255,.20); background:rgba(13,19,34,.7);
                color:#8d95ad; font:600 10px 'Space Grotesk',sans-serif;
                border-radius:6px; padding:6px 11px; cursor:pointer;
                transition:all .16s; white-space:nowrap; }
    .cas-tab:hover { border-color:rgba(124,140,255,.48); color:#e7eaf3; }
    .cas-tab.cas-on-prompt   { border-color:#f5c451; color:#f5c451; background:rgba(245,196,81,.07); }
    .cas-tab.cas-on-memory   { border-color:#f43f5e; color:#f43f5e; background:rgba(244,63,94,.07); }
    .cas-tab.cas-on-datafeed { border-color:#f97316; color:#f97316; background:rgba(249,115,22,.07); }
  `;
  stage.appendChild(style);

  // ── SVG ─────────────────────────────────────────────────────────────────────
  const svg = mk<SVGSVGElement>('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    class: 'cas-svg',
    'aria-hidden': 'true',
  });
  stage.appendChild(svg);

  svg.appendChild(mk('rect', { x:0, y:0, width:VW, height:VH, fill:C.bg, rx:10 }));

  // Context window border + header
  svg.appendChild(mk('rect', {
    x: CTX_X, y: CTX_Y, width: CTX_W, height: CTX_H,
    rx: 8, fill: 'rgba(91,140,255,.03)', stroke: C.border, 'stroke-width': 1,
  }));
  svg.appendChild(mk('text', {
    x: CTX_X + CTX_W / 2, y: CTX_Y - 8,
    class: 'cas-hdr', fill: C.faint, 'text-anchor': 'middle',
  }, 'CONTEXT WINDOW'));

  // Context layers
  type LayerRef = { rect: SVGRectElement; lbl: SVGTextElement };
  const layerRefs: LayerRef[] = [];

  LAYERS.forEach((l, i) => {
    const lx = CTX_X + 8;
    const lw = CTX_W - 16;
    const ly = CTX_Y + l.y;
    const rect = mk<SVGRectElement>('rect', {
      x: lx, y: ly, width: lw, height: l.h,
      rx: 5, fill: 'rgba(91,140,255,.05)', stroke: 'rgba(124,140,255,.14)', 'stroke-width': 1,
      class: 'cas-box',
    });
    svg.appendChild(rect);

    const lbl = mk<SVGTextElement>('text', {
      x: lx + 10, y: ly + l.h / 2 - 7,
      class: 'cas-hdr', fill: C.muted, 'text-anchor': 'start',
    }, l.label);
    svg.appendChild(lbl);

    svg.appendChild(mk('text', {
      x: lx + 10, y: ly + l.h / 2 + 7,
      class: 'cas-xtra', fill: C.faint, 'text-anchor': 'start',
    }, l.sub));

    if (i < 3) layerRefs.push({ rect, lbl });
  });

  // Source boxes
  type SrcRef = { rect: SVGRectElement };
  const srcRefs: SrcRef[] = [];

  SOURCES.forEach((s) => {
    const rect = mk<SVGRectElement>('rect', {
      x: SRC_X, y: s.y, width: SRC_W, height: s.h,
      rx: 7, fill: C.box, stroke: C.border, 'stroke-width': 1.5,
      class: 'cas-box',
    });
    svg.appendChild(rect);

    svg.appendChild(mk('text', {
      x: SRC_X + SRC_W / 2, y: s.y + s.h / 2 - 7,
      class: 'cas-lbl',
    }, s.label));

    svg.appendChild(mk('text', {
      x: SRC_X + SRC_W / 2, y: s.y + s.h / 2 + 7,
      class: 'cas-sub',
    }, s.sub));

    srcRefs.push({ rect });
  });

  // "INPUT SOURCES" header above source column
  svg.appendChild(mk('text', {
    x: SRC_X + SRC_W / 2, y: CTX_Y - 8,
    class: 'cas-hdr', fill: C.faint, 'text-anchor': 'middle',
  }, 'INPUT SOURCES'));

  // Connection lines: source → context layer
  type ConnRef = { line: SVGLineElement };
  const connRefs: ConnRef[] = [];

  SOURCES.forEach((s, i) => {
    const layer = LAYERS[i]!;
    const x1 = SRC_X + SRC_W;
    const y1 = s.y + s.h / 2;
    const x2 = CTX_X;
    const y2 = CTX_Y + layer.y + layer.h / 2;

    const line = mk<SVGLineElement>('line', {
      x1, y1, x2, y2,
      stroke: C.accentDim, 'stroke-width': 1.5, 'stroke-dasharray': '5 3',
      class: 'cas-conn',
    });
    svg.appendChild(line);
    connRefs.push({ line });
  });

  // Context → LLM arrow
  const ctxRight = CTX_X + CTX_W;
  svg.appendChild(mk('line', {
    x1: ctxRight, y1: LLM_CY,
    x2: LLM_CX - LLM_R - 1, y2: LLM_CY,
    stroke: C.accentDim, 'stroke-width': 2,
  }));

  // LLM circle
  svg.appendChild(mk('circle', {
    cx: LLM_CX, cy: LLM_CY, r: LLM_R,
    fill: C.box, stroke: C.border, 'stroke-width': 1.5,
  }));
  svg.appendChild(mk('text', {
    x: LLM_CX, y: LLM_CY,
    class: 'cas-lbl',
  }, 'LLM'));

  // LLM → on-chain action
  const txX = LLM_CX + LLM_R + 8;
  svg.appendChild(mk('text', {
    x: txX, y: LLM_CY - 6,
    class: 'cas-xtra', fill: C.cyan, 'text-anchor': 'start',
  }, '→ ON-CHAIN'));
  svg.appendChild(mk('text', {
    x: txX, y: LLM_CY + 8,
    class: 'cas-xtra', fill: C.cyan, 'text-anchor': 'start',
  }, '   ACTION'));

  // Inject labels — appear above source box on attack selection
  const injLabels: SVGTextElement[] = [];
  SOURCES.forEach((s) => {
    const lbl = mk<SVGTextElement>('text', {
      x: SRC_X + SRC_W / 2, y: s.y - 5,
      class: 'cas-xtra', fill: '#f43f5e',
      'text-anchor': 'middle', opacity: '0',
      class2: 'cas-inj',
    }, '▲ INJECT');
    lbl.setAttribute('class', 'cas-xtra cas-inj');
    svg.appendChild(lbl);
    injLabels.push(lbl);
  });

  // ── Panel ────────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'cas-panel';
  panel.appendChild(panelEl);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const tabsEl = document.createElement('div');
  tabsEl.className = 'cas-tabs';
  ctrl.appendChild(tabsEl);

  const tabBtns: Array<[AttackId, HTMLButtonElement]> = [];
  for (const id of ['prompt', 'memory', 'datafeed'] as AttackId[]) {
    const btn = document.createElement('button');
    btn.className = 'cas-tab';
    btn.textContent = ATTACKS[id].tab;
    tabsEl.appendChild(btn);
    tabBtns.push([id, btn]);
  }

  // ── Caption ──────────────────────────────────────────────────────────────────
  caption.textContent = 'CrAIBench · arXiv:2503.16248 · AgentSys · arXiv:2602.07398 · tap a tab to explore each attack vector';

  // ── State & render ────────────────────────────────────────────────────────────
  let active: AttackId | null = null;

  function render(id: AttackId | null): void {
    const atk = id ? ATTACKS[id] : null;

    // Source boxes
    srcRefs.forEach(({ rect }, i) => {
      const hit = atk && atk.srcIdx === i;
      rect.setAttribute('fill', hit ? atk!.bg : C.box);
      rect.setAttribute('stroke', hit ? atk!.color : (atk ? 'rgba(124,140,255,.10)' : C.border));
      rect.setAttribute('stroke-width', hit ? '2' : '1.5');
    });

    // Context layers
    layerRefs.forEach(({ rect, lbl }, i) => {
      const hit = atk && atk.layerIdx === i;
      rect.setAttribute('fill', hit ? atk!.bg : 'rgba(91,140,255,.05)');
      rect.setAttribute('stroke', hit ? atk!.color : (atk ? 'rgba(124,140,255,.07)' : 'rgba(124,140,255,.14)'));
      lbl.setAttribute('fill', hit ? atk!.color : (atk ? C.faint : C.muted));
    });

    // Connection lines
    connRefs.forEach(({ line }, i) => {
      const hit = atk && atk.srcIdx === i;
      line.setAttribute('stroke', hit ? atk!.color : C.accentDim);
      line.setAttribute('stroke-width', hit ? '2.5' : '1.5');
      line.setAttribute('opacity', atk && !hit ? '0.2' : '1');
      line.setAttribute('stroke-dasharray', hit ? '0' : '5 3');
    });

    // Inject labels
    injLabels.forEach((lbl, i) => {
      const hit = atk && atk.srcIdx === i;
      lbl.setAttribute('opacity', hit ? '1' : '0');
      if (hit) lbl.setAttribute('fill', atk!.color);
    });

    // Tab styling
    tabBtns.forEach(([tid, btn]) => {
      btn.classList.remove('cas-on-prompt', 'cas-on-memory', 'cas-on-datafeed');
      if (id === tid) btn.classList.add(`cas-on-${tid}`);
    });

    renderPanel(atk);
  }

  function renderPanel(atk: AttackDef | null): void {
    panelEl.innerHTML = '';
    if (!atk) {
      const hint = document.createElement('p');
      hint.className = 'cas-hint';
      hint.textContent = 'Select an attack surface to see how it corrupts the context window and what success rates look like in practice.';
      panelEl.appendChild(hint);
      return;
    }

    panelEl.innerHTML = `
      <div>
        <span class="cas-sev cas-sev-${atk.severity}">${atk.severity.toUpperCase()}</span>
      </div>
      <div class="cas-card">
        <div class="cas-clabel">Entry Point</div>
        <div class="cas-cval" style="color:${atk.color};font-size:10px">${atk.entry}</div>
      </div>
      <div class="cas-card">
        <div class="cas-clabel">Mechanism</div>
        <div class="cas-cval" style="font-size:10px">${atk.mechanism}</div>
      </div>
      <div class="cas-card">
        <div class="cas-clabel">Attack Success Rate</div>
        <div class="cas-cval" style="color:${atk.color}">${atk.asr}</div>
      </div>
      <div class="cas-card">
        <div class="cas-clabel">Defense Status</div>
        <div class="cas-cval" style="font-size:10px;color:#8d95ad">${atk.defense}</div>
      </div>
      <div class="cas-card">
        <div class="cas-clabel">Best Mitigation</div>
        <div class="cas-cval" style="font-size:10px">${atk.mitigation}</div>
      </div>
    `;
  }

  render(null);

  // ── Events ────────────────────────────────────────────────────────────────────
  const cleanups: Array<() => void> = [];
  tabBtns.forEach(([id, btn]) => {
    const fn = (): void => {
      active = active === id ? null : id;
      render(active);
    };
    btn.addEventListener('click', fn);
    cleanups.push(() => btn.removeEventListener('click', fn));
  });

  return () => {
    cleanups.forEach((f) => f());
    style.remove();
    layout.dispose();
  };
}
