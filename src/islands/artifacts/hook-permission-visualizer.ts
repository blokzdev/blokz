/**
 * Artifact: hook-permission-visualizer — Hook Permission Visualizer
 * Manifest: content/artifacts/hook-permission-visualizer/manifest.json
 *
 * Interactive SVG diagram showing how the 14-bit hook permission bitmap
 * maps to Uniswap v4 lifecycle callbacks. Toggle bits or select preset
 * patterns to see which callbacks fire for each pool operation.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

interface BitDef {
  bit: number;
  name: string;
  op: string;
  short: string;
}

const BITS: BitDef[] = [
  { bit: 13, name: 'beforeInitialize', op: 'initialize', short: 'beforeInit' },
  { bit: 12, name: 'afterInitialize', op: 'initialize', short: 'afterInit' },
  { bit: 11, name: 'beforeAddLiquidity', op: 'addLiquidity', short: 'beforeAdd' },
  { bit: 10, name: 'afterAddLiquidity', op: 'addLiquidity', short: 'afterAdd' },
  { bit: 9, name: 'beforeRemoveLiquidity', op: 'removeLiquidity', short: 'beforeRemove' },
  { bit: 8, name: 'afterRemoveLiquidity', op: 'removeLiquidity', short: 'afterRemove' },
  { bit: 7, name: 'beforeSwap', op: 'swap', short: 'beforeSwap' },
  { bit: 6, name: 'afterSwap', op: 'swap', short: 'afterSwap' },
  { bit: 5, name: 'beforeDonate', op: 'donate', short: 'beforeDonate' },
  { bit: 4, name: 'afterDonate', op: 'donate', short: 'afterDonate' },
  { bit: 3, name: 'beforeSwapReturnDelta', op: 'swap', short: 'bSwapDelta' },
  { bit: 2, name: 'afterSwapReturnDelta', op: 'swap', short: 'aSwapDelta' },
  { bit: 1, name: 'afterAddLiquidityReturnDelta', op: 'addLiquidity', short: 'aAddDelta' },
  { bit: 0, name: 'afterRemoveLiquidityReturnDelta', op: 'removeLiquidity', short: 'aRmvDelta' },
];

interface OpConfig {
  label: string;
  coreName: string;
  callSig: string;
  beforeBit: number;
  afterBit: number;
  deltaBits?: number[];
}

type OpKey = 'swap' | 'addLiquidity' | 'removeLiquidity' | 'initialize' | 'donate';

const OPS: Record<OpKey, OpConfig> = {
  swap: {
    label: 'Swap',
    coreName: 'AMM Core',
    callSig: 'swap(key, params, hookData)',
    beforeBit: 7,
    afterBit: 6,
    deltaBits: [3, 2],
  },
  addLiquidity: {
    label: 'Add Liquidity',
    coreName: 'LP Deposit',
    callSig: 'modifyLiquidity(key, params, hookData)',
    beforeBit: 11,
    afterBit: 10,
    deltaBits: [1],
  },
  removeLiquidity: {
    label: 'Remove Liquidity',
    coreName: 'LP Withdraw',
    callSig: 'modifyLiquidity(key, params, hookData)',
    beforeBit: 9,
    afterBit: 8,
    deltaBits: [0],
  },
  initialize: {
    label: 'Initialize Pool',
    coreName: 'Pool Setup',
    callSig: 'initialize(key, sqrtPriceX96)',
    beforeBit: 13,
    afterBit: 12,
  },
  donate: {
    label: 'Donate',
    coreName: 'Fee Credit',
    callSig: 'donate(key, amount0, amount1)',
    beforeBit: 5,
    afterBit: 4,
  },
};

const PRESETS: Record<string, number> = {
  none: 0,
  dynamicFee: (1 << 7) | (1 << 6) | (1 << 3) | (1 << 2),
  limitOrder: (1 << 6) | (1 << 2),
  jit: (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 7) | (1 << 6),
  full: (1 << 14) - 1,
};

const OP_ORDER: OpKey[] = ['swap', 'addLiquidity', 'removeLiquidity', 'initialize', 'donate'];

function svgEl<T extends SVGElement>(
  tag: string,
  attrs: Record<string, string | number> = {},
): T {
  const el = document.createElementNS(NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function svgText(
  content: string,
  x: number,
  y: number,
  attrs: Record<string, string | number> = {},
): SVGTextElement {
  const el = svgEl<SVGTextElement>('text', { x, y, ...attrs });
  el.textContent = content;
  return el;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '16/9',
    stageFr: '1.8fr',
  });
  const { stage, panel, controls, caption } = layout;

  let permBits = PRESETS.dynamicFee;
  let currentOp: OpKey = 'swap';

  // ── Styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .hpv-wrap { position: absolute; inset: 0; }
    .hpv-wrap svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

    .hpv-panel { padding: 6px 10px; overflow-y: auto; max-height: 100%; }
    .hpv-sec { font: 600 9px 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.12em; text-transform:uppercase; margin:10px 0 4px; }
    .hpv-bit { display:flex; align-items:center; gap:7px; padding:3px 0; cursor:pointer;
      border-radius:4px; }
    .hpv-bit:hover .hpv-bb { border-color:rgba(91,140,255,.5); }
    .hpv-bb { width:18px; height:18px; border-radius:3px; border:1px solid rgba(124,140,255,.18);
      display:flex; align-items:center; justify-content:center; flex:none;
      font: 600 10px 'JetBrains Mono',monospace; transition:background .18s,border-color .18s; }
    .hpv-bb.on { background:rgba(91,140,255,.22); border-color:#5b8cff; color:#5b8cff; }
    .hpv-bb.off { background:transparent; color:#5b6378; }
    .hpv-bn { font:500 10px 'JetBrains Mono',monospace; color:#8d95ad;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1; }
    .hpv-bn.on { color:#e7eaf3; }
    .hpv-bnum { font:400 9px 'JetBrains Mono',monospace; color:#5b6378; flex:none; }

    .hpv-ctrl { padding:6px 4px; display:flex; flex-direction:column; gap:8px; }
    .hpv-clabel { font:600 9px 'JetBrains Mono',monospace; color:#5b6378;
      letter-spacing:.1em; text-transform:uppercase; }
    .hpv-tabs { display:flex; flex-wrap:wrap; gap:4px; }
    .hpv-tab { font:500 10px 'JetBrains Mono',monospace; padding:4px 8px;
      border-radius:4px; border:1px solid rgba(124,140,255,.18);
      background:transparent; color:#8d95ad; cursor:pointer; transition:all .18s; white-space:nowrap; }
    .hpv-tab:hover { border-color:rgba(124,140,255,.4); color:#e7eaf3; }
    .hpv-tab.on { background:rgba(91,140,255,.18); border-color:#5b8cff; color:#5b8cff; }
    .hpv-presets { display:flex; flex-wrap:wrap; gap:4px; }
    .hpv-pr { font:500 10px 'JetBrains Mono',monospace; padding:4px 10px;
      border-radius:4px; border:1px solid rgba(124,140,255,.12);
      background:rgba(13,19,34,.7); color:#5b6378; cursor:pointer; transition:all .18s; white-space:nowrap; }
    .hpv-pr:hover { border-color:rgba(124,140,255,.3); color:#8d95ad; }
    .hpv-caption-text { font:500 10px 'JetBrains Mono',monospace; color:#5b6378; }
  `;
  stage.appendChild(style);

  // ── SVG Stage ────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'hpv-wrap';
  const svg = svgEl<SVGSVGElement>('svg', {
    viewBox: '0 0 800 450',
    preserveAspectRatio: 'xMidYMid meet',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // Background
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: 800, height: 450, fill: '#05070d' }));

  // ── Arrow marker defs ────────────────────────────────────────────────────
  const defs = svgEl('defs');
  function makeMarker(id: string, color: string): SVGMarkerElement {
    const m = svgEl<SVGMarkerElement>('marker', {
      id,
      markerWidth: 7,
      markerHeight: 7,
      refX: 5,
      refY: 3,
      orient: 'auto',
    });
    const p = svgEl('path', { d: 'M0,0 L0,6 L7,3 z', fill: color });
    m.appendChild(p);
    return m;
  }
  defs.appendChild(makeMarker('hpv-arr-dim', 'rgba(124,140,255,0.25)'));
  defs.appendChild(makeMarker('hpv-arr-on', '#5b8cff'));
  defs.appendChild(makeMarker('hpv-arr-always', '#22d3ee'));
  svg.appendChild(defs);

  // ── Bit cells (top row) ──────────────────────────────────────────────────
  // 14 cells × 34px + 13 gaps × 5px = 476 + 65 = 541 → start x = (800-541)/2 ≈ 129
  const CELL_W = 34;
  const CELL_H = 30;
  const CELL_GAP = 5;
  const CELLS_TOTAL = 14 * CELL_W + 13 * CELL_GAP;
  const CELL_X0 = Math.round((800 - CELLS_TOTAL) / 2);
  const CELL_Y = 28;

  svg.appendChild(
    svgText('HOOK ADDRESS  [ BIT 13 ──── 0 ]', 400, CELL_Y - 10, {
      'text-anchor': 'middle',
      fill: '#5b6378',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '9',
      'letter-spacing': '0.06em',
    }),
  );

  const cellRects: SVGRectElement[] = new Array(14);
  const cellTexts: SVGTextElement[] = new Array(14);

  for (let i = 13; i >= 0; i--) {
    const idx = 13 - i;
    const x = CELL_X0 + idx * (CELL_W + CELL_GAP);
    const rect = svgEl<SVGRectElement>('rect', {
      x,
      y: CELL_Y,
      width: CELL_W,
      height: CELL_H,
      rx: 4,
    });
    const txt = svgText('0', x + CELL_W / 2, CELL_Y + 21, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '13',
      'font-weight': '700',
    });
    svg.appendChild(rect);
    svg.appendChild(txt);
    cellRects[i] = rect;
    cellTexts[i] = txt;
  }

  // bit-number labels below cells
  for (let i = 13; i >= 0; i--) {
    const idx = 13 - i;
    const x = CELL_X0 + idx * (CELL_W + CELL_GAP);
    svg.appendChild(
      svgText(String(i), x + CELL_W / 2, CELL_Y + CELL_H + 10, {
        'text-anchor': 'middle',
        fill: '#5b6378',
        'font-family': "'JetBrains Mono',monospace",
        'font-size': '8',
      }),
    );
  }

  // ── Operation label ──────────────────────────────────────────────────────
  const opLabel = svgText('', 400, 106, {
    'text-anchor': 'middle',
    fill: '#e7eaf3',
    'font-family': "'Space Grotesk',sans-serif",
    'font-size': '20',
    'font-weight': '700',
  });
  const sigLabel = svgText('', 400, 122, {
    'text-anchor': 'middle',
    fill: '#5b6378',
    'font-family': "'JetBrains Mono',monospace",
    'font-size': '9',
  });
  svg.appendChild(opLabel);
  svg.appendChild(sigLabel);

  // ── Main flow nodes ──────────────────────────────────────────────────────
  // Layout: [before] ──→ [core] ──→ [after]
  const NW_SIDE = 195; // before/after node width
  const NW_CORE = 145; // core node width
  const NH = 98;
  const GAP = 50;
  const FLOW_TOTAL = NW_SIDE + GAP + NW_CORE + GAP + NW_SIDE;
  const FX0 = Math.round((800 - FLOW_TOTAL) / 2);
  const FY = 138;
  const X_BEFORE = FX0;
  const X_CORE = FX0 + NW_SIDE + GAP;
  const X_AFTER = FX0 + NW_SIDE + GAP + NW_CORE + GAP;
  const MID_Y = FY + NH / 2;

  // "caller →" annotation
  svg.appendChild(
    svgText('caller', FX0 - 8, MID_Y - 7, {
      'text-anchor': 'end',
      fill: '#5b6378',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '10',
    }),
  );

  const arrCaller = svgEl<SVGLineElement>('line', {
    x1: 18,
    y1: MID_Y,
    x2: FX0 - 1,
    y2: MID_Y,
    'stroke-width': '1.5',
    'stroke-dasharray': '4,3',
  });
  const arr1 = svgEl<SVGLineElement>('line', {
    x1: X_BEFORE + NW_SIDE,
    y1: MID_Y,
    x2: X_CORE - 1,
    y2: MID_Y,
    'stroke-width': '1.5',
  });
  const arr2 = svgEl<SVGLineElement>('line', {
    x1: X_CORE + NW_CORE,
    y1: MID_Y,
    x2: X_AFTER - 1,
    y2: MID_Y,
    'stroke-width': '1.5',
  });
  const arrDone = svgEl<SVGLineElement>('line', {
    x1: X_AFTER + NW_SIDE,
    y1: MID_Y,
    x2: 782,
    y2: MID_Y,
    'stroke-width': '1.5',
    'stroke-dasharray': '4,3',
  });
  svg.appendChild(
    svgText('done', 785, MID_Y - 7, {
      'text-anchor': 'start',
      fill: '#5b6378',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '10',
    }),
  );
  svg.appendChild(arrCaller);
  svg.appendChild(arr1);
  svg.appendChild(arr2);
  svg.appendChild(arrDone);

  // Node rects + labels
  function makeNode(x: number, always: boolean) {
    const rect = svgEl<SVGRectElement>('rect', { x, y: FY, width: always ? NW_CORE : NW_SIDE, height: NH, rx: 8 });
    const nx = x + (always ? NW_CORE : NW_SIDE) / 2;
    const l1 = svgText('', nx, FY + 38, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '14',
      'font-weight': '700',
    });
    const l2 = svgText('', nx, FY + 58, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '10',
    });
    const l3 = svgText('', nx, FY + 78, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '9',
      'letter-spacing': '0.04em',
    });
    svg.appendChild(rect);
    svg.appendChild(l1);
    svg.appendChild(l2);
    svg.appendChild(l3);
    return { rect, l1, l2, l3 };
  }

  const beforeNode = makeNode(X_BEFORE, false);
  const coreNode = makeNode(X_CORE, true);
  const afterNode = makeNode(X_AFTER, false);

  // Core node is always-on: style it now
  coreNode.rect.setAttribute('fill', 'rgba(34,211,238,0.07)');
  coreNode.rect.setAttribute('stroke', 'rgba(34,211,238,0.3)');
  coreNode.rect.setAttribute('stroke-width', '1');
  coreNode.l1.setAttribute('fill', '#22d3ee');
  coreNode.l2.setAttribute('fill', 'rgba(34,211,238,0.6)');
  coreNode.l2.textContent = 'always fires';
  coreNode.l3.setAttribute('fill', '#5b6378');

  // ── Delta bits row ───────────────────────────────────────────────────────
  const DELTA_Y = FY + NH + 28;
  const DELTA_H = 54;

  const mkDelta = (x: number, w: number) => {
    const rect = svgEl<SVGRectElement>('rect', { x, y: DELTA_Y, width: w, height: DELTA_H, rx: 6 });
    const nx = x + w / 2;
    const l1 = svgText('', nx, DELTA_Y + 20, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '11',
      'font-weight': '600',
    });
    const l2 = svgText('', nx, DELTA_Y + 38, {
      'text-anchor': 'middle',
      'font-family': "'JetBrains Mono',monospace",
      'font-size': '9',
    });
    const vline = svgEl<SVGLineElement>('line', {
      x1: nx, y1: FY + NH, x2: nx, y2: DELTA_Y,
      'stroke-width': '1', 'stroke-dasharray': '3,2',
    });
    svg.appendChild(vline);
    svg.appendChild(rect);
    svg.appendChild(l1);
    svg.appendChild(l2);
    return { rect, l1, l2, vline };
  };

  const beforeDelta = mkDelta(X_BEFORE, NW_SIDE);
  const afterDelta = mkDelta(X_AFTER, NW_SIDE);

  // ── Panel: bit list ──────────────────────────────────────────────────────
  const panelWrap = document.createElement('div');
  panelWrap.className = 'hpv-panel';
  panel.appendChild(panelWrap);

  const OP_LABELS: Record<string, string> = {
    swap: 'Swap',
    addLiquidity: 'Add Liquidity',
    removeLiquidity: 'Remove Liquidity',
    initialize: 'Initialize',
    donate: 'Donate',
  };

  function buildPanel() {
    panelWrap.innerHTML = '';
    for (const opKey of OP_ORDER) {
      const opBits = BITS.filter(b => b.op === opKey);
      const sec = document.createElement('div');
      sec.className = 'hpv-sec';
      sec.textContent = OP_LABELS[opKey];
      panelWrap.appendChild(sec);

      for (const bdef of opBits) {
        const on = (permBits >> bdef.bit) & 1;
        const row = document.createElement('div');
        row.className = 'hpv-bit';

        const box = document.createElement('div');
        box.className = `hpv-bb ${on ? 'on' : 'off'}`;
        box.textContent = on ? '1' : '0';

        const name = document.createElement('div');
        name.className = `hpv-bn ${on ? 'on' : ''}`;
        name.textContent = bdef.name;
        name.title = bdef.name;

        const num = document.createElement('div');
        num.className = 'hpv-bnum';
        num.textContent = `[${bdef.bit}]`;

        row.append(box, name, num);
        panelWrap.appendChild(row);

        row.addEventListener('click', () => {
          permBits ^= 1 << bdef.bit;
          render();
        });
      }
    }
  }

  // ── Controls: op tabs + presets ──────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'hpv-ctrl';
  controls.appendChild(ctrlWrap);

  const PRESET_DEFS = [
    { key: 'none', label: 'No Hook' },
    { key: 'dynamicFee', label: 'Dynamic Fee' },
    { key: 'limitOrder', label: 'Limit Order' },
    { key: 'jit', label: 'JIT Liquidity' },
    { key: 'full', label: 'Full Hook' },
  ];

  const OP_SHORT: Record<string, string> = {
    swap: 'Swap',
    addLiquidity: 'Add Liq',
    removeLiquidity: 'Remove Liq',
    initialize: 'Initialize',
    donate: 'Donate',
  };

  function buildControls() {
    ctrlWrap.innerHTML = '';

    const tl = document.createElement('div');
    tl.className = 'hpv-clabel';
    tl.textContent = 'Operation';
    ctrlWrap.appendChild(tl);

    const tabRow = document.createElement('div');
    tabRow.className = 'hpv-tabs';
    for (const opKey of OP_ORDER) {
      const btn = document.createElement('button');
      btn.className = `hpv-tab${opKey === currentOp ? ' on' : ''}`;
      btn.textContent = OP_SHORT[opKey];
      btn.addEventListener('click', () => {
        currentOp = opKey;
        render();
      });
      tabRow.appendChild(btn);
    }
    ctrlWrap.appendChild(tabRow);

    const pl = document.createElement('div');
    pl.className = 'hpv-clabel';
    pl.textContent = 'Hook pattern';
    ctrlWrap.appendChild(pl);

    const presetRow = document.createElement('div');
    presetRow.className = 'hpv-presets';
    for (const { key, label } of PRESET_DEFS) {
      const btn = document.createElement('button');
      btn.className = 'hpv-pr';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        permBits = PRESETS[key];
        render();
      });
      presetRow.appendChild(btn);
    }
    ctrlWrap.appendChild(presetRow);
  }

  // Caption
  const capEl = document.createElement('span');
  capEl.className = 'hpv-caption-text';
  capEl.textContent =
    'Toggle bits in the panel or click preset patterns to see which callbacks fire. Bit 13 (left) to bit 0 (right).';
  caption.appendChild(capEl);

  // ── Render ───────────────────────────────────────────────────────────────
  function setNode(
    node: ReturnType<typeof makeNode>,
    active: boolean,
    shortName: string,
    bitNum: number,
  ) {
    if (active) {
      node.rect.setAttribute('fill', 'rgba(91,140,255,0.12)');
      node.rect.setAttribute('stroke', '#5b8cff');
      node.rect.setAttribute('stroke-width', '1.5');
      node.l1.setAttribute('fill', '#5b8cff');
      node.l1.textContent = shortName;
      node.l2.setAttribute('fill', 'rgba(91,140,255,0.7)');
      node.l2.textContent = `bit ${bitNum}`;
      node.l3.setAttribute('fill', '#5b8cff');
      node.l3.textContent = '▶ fires';
    } else {
      node.rect.setAttribute('fill', 'rgba(13,19,34,0.6)');
      node.rect.setAttribute('stroke', 'rgba(124,140,255,0.1)');
      node.rect.setAttribute('stroke-width', '1');
      node.l1.setAttribute('fill', '#5b6378');
      node.l1.textContent = shortName;
      node.l2.setAttribute('fill', '#5b6378');
      node.l2.textContent = `bit ${bitNum}`;
      node.l3.setAttribute('fill', '#5b6378');
      node.l3.textContent = '○ skipped';
    }
  }

  function setArrow(
    el: SVGLineElement,
    active: boolean,
    alwaysOn = false,
    dashed = false,
  ) {
    const color = alwaysOn
      ? 'rgba(34,211,238,0.5)'
      : active
        ? '#5b8cff'
        : 'rgba(124,140,255,0.2)';
    const marker = alwaysOn
      ? 'url(#hpv-arr-always)'
      : active
        ? 'url(#hpv-arr-on)'
        : 'url(#hpv-arr-dim)';
    el.setAttribute('stroke', color);
    el.setAttribute('marker-end', marker);
    el.setAttribute('stroke-dasharray', dashed ? '4,3' : '');
  }

  function setDelta(
    node: ReturnType<typeof mkDelta>,
    show: boolean,
    active: boolean,
    bits: number[],
  ) {
    if (!show) {
      node.rect.setAttribute('display', 'none');
      node.l1.setAttribute('display', 'none');
      node.l2.setAttribute('display', 'none');
      node.vline.setAttribute('display', 'none');
      return;
    }
    node.rect.setAttribute('display', '');
    node.l1.setAttribute('display', '');
    node.l2.setAttribute('display', '');
    node.vline.setAttribute('display', '');

    const label = bits.map(b => BITS.find(bd => bd.bit === b)?.short ?? '').join(' / ');
    node.l1.textContent = label;
    node.l2.textContent = bits.map(b => `bit ${b}`).join(' / ');

    if (active) {
      node.rect.setAttribute('fill', 'rgba(139,92,246,0.09)');
      node.rect.setAttribute('stroke', 'rgba(139,92,246,0.4)');
      node.vline.setAttribute('stroke', 'rgba(139,92,246,0.35)');
      node.l1.setAttribute('fill', '#8b5cf6');
      node.l2.setAttribute('fill', 'rgba(139,92,246,0.65)');
    } else {
      node.rect.setAttribute('fill', 'rgba(13,19,34,0.4)');
      node.rect.setAttribute('stroke', 'rgba(124,140,255,0.08)');
      node.vline.setAttribute('stroke', 'rgba(124,140,255,0.1)');
      node.l1.setAttribute('fill', '#5b6378');
      node.l2.setAttribute('fill', '#5b6378');
    }
  }

  function render() {
    const op = OPS[currentOp];
    const bOn = Boolean((permBits >> op.beforeBit) & 1);
    const aOn = Boolean((permBits >> op.afterBit) & 1);

    const beforeBitDef = BITS.find(b => b.bit === op.beforeBit)!;
    const afterBitDef = BITS.find(b => b.bit === op.afterBit)!;

    // Bit cells
    for (let i = 13; i >= 0; i--) {
      const on = Boolean((permBits >> i) & 1);
      const isOpBit = [op.beforeBit, op.afterBit, ...(op.deltaBits ?? [])].includes(i);
      cellRects[i].setAttribute('fill', on ? 'rgba(91,140,255,0.18)' : 'rgba(13,19,34,0.7)');
      cellRects[i].setAttribute(
        'stroke',
        isOpBit && on ? '#5b8cff' : on ? 'rgba(91,140,255,0.4)' : 'rgba(124,140,255,0.12)',
      );
      cellRects[i].setAttribute('stroke-width', isOpBit ? '1.5' : '1');
      cellTexts[i].textContent = on ? '1' : '0';
      cellTexts[i].setAttribute('fill', on ? '#5b8cff' : '#5b6378');
    }

    // Op label
    opLabel.textContent = op.label;
    sigLabel.textContent = `poolManager.${op.callSig}`;

    // Core node label
    coreNode.l1.textContent = op.coreName;

    // Nodes
    setNode(beforeNode, bOn, beforeBitDef.short, op.beforeBit);
    setNode(afterNode, aOn, afterBitDef.short, op.afterBit);

    // Arrows
    setArrow(arrCaller, bOn, false, true);
    setArrow(arr1, bOn || true, true); // always-on into core
    arr1.setAttribute('stroke', bOn ? '#5b8cff' : 'rgba(124,140,255,0.2)');
    arr1.setAttribute('marker-end', bOn ? 'url(#hpv-arr-on)' : 'url(#hpv-arr-dim)');
    setArrow(arr2, aOn, false);
    setArrow(arrDone, aOn, false, true);

    // Delta nodes
    const deltaBits = op.deltaBits ?? [];
    if (deltaBits.length > 0) {
      // Split delta bits into before/after groups
      // For swap: [3] = before, [2] = after; for others: single bit on after side
      const beforeDeltaBits =
        currentOp === 'swap' ? deltaBits.filter(b => b === 3) : [];
      const afterDeltaBits =
        currentOp === 'swap' ? deltaBits.filter(b => b === 2) : deltaBits;

      const bDeltaOn = beforeDeltaBits.some(b => Boolean((permBits >> b) & 1));
      const aDeltaOn = afterDeltaBits.some(b => Boolean((permBits >> b) & 1));

      setDelta(beforeDelta, beforeDeltaBits.length > 0, bDeltaOn, beforeDeltaBits);
      setDelta(afterDelta, afterDeltaBits.length > 0, aDeltaOn, afterDeltaBits);
    } else {
      setDelta(beforeDelta, false, false, []);
      setDelta(afterDelta, false, false, []);
    }

    buildPanel();
    buildControls();
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
