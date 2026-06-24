/**
 * Artifact: the-7702-timeline — The 7702 Timeline
 * Manifest: content/artifacts/the-7702-timeline/manifest.json
 *
 * Three-lane SVG diagram. Each lane shows how a multi-step DeFi sequence
 * executes under a different transaction model:
 *   Row 0 — Raw EOA: N separate transactions with red MEV attack windows between them.
 *   Row 1 — ERC-4337: one atomic UserOperation (EntryPoint overhead).
 *   Row 2 — EIP-7702: one atomic batch with a 2,500-gas auth tuple overhead.
 *
 * Stage: SVG (640×360, 16/9).
 * Panel: gas cost + MEV window breakdown for the selected scenario.
 * Controls: three scenario buttons.
 * Data: content/artifacts/the-7702-timeline/data.json
 */
import data from '../../../content/artifacts/the-7702-timeline/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Op = (typeof data.ops)[number];
type Scenario = (typeof data.scenarios)[number];

/* ── Constants ─────────────────────────────────────────────────────────────── */
const VW = 640;
const VH = 360;

const LABEL_W = 106;   // x-end of row-label column
const TL_X    = LABEL_W + 10;   // 116 — timeline content starts here
const TL_W    = VW - TL_X - 10; // 514 — available timeline width

// Three lane rows: y position of the top edge of the lane content rect
const LANE_Y: [number, number, number] = [10, 132, 254];
const LANE_H = 96;

// Operation block sizing in the diagram
const TX_W   = 62;   // width of each separate-tx block in the Raw EOA lane
const MEV_W  = 20;   // width of MEV window zone marker between tx blocks
const OP_W   = 60;   // width of an op block inside an atomic container
const OP_GAP = 5;    // gap between op blocks inside an atomic container
const OVHD_ERC4337 = 42; // overhead column width in ERC-4337 atomic container
const OVHD_7702    = 22; // overhead column width in EIP-7702 atomic container
const CONT_PAD     = 10; // inner horizontal padding of atomic container

/* op accent colors looked up from the data */
const OP_MAP = new Map<string, Op>(data.ops.map(o => [o.id, o]));

const { baseTxGas, erc4337Overhead, eip7702AuthGas } = data.constants;
const { ethPriceUSD, effectiveGasPriceGwei } = data;

/* ── Gas helpers ────────────────────────────────────────────────────────────── */
function opsGasSum(opIds: readonly string[]): number {
  return opIds.reduce((s, id) => s + (OP_MAP.get(id)?.gas ?? 0), 0);
}

function scenarioGas(sc: Scenario) {
  const sum = opsGasSum(sc.ops);
  const n   = sc.ops.length;
  return {
    rawEOA:  n * baseTxGas + sum,
    erc4337: baseTxGas + erc4337Overhead + sum,
    eip7702: baseTxGas + eip7702AuthGas  + sum,
    mevWindows: n - 1,
  };
}

function toUSD(gas: number): string {
  return '$' + (gas * effectiveGasPriceGwei * 1e-9 * ethPriceUSD).toFixed(2);
}

function gasK(gas: number): string {
  return (gas / 1000).toFixed(gas % 1000 === 0 ? 0 : 1) + 'k';
}

/* ── SVG helpers ────────────────────────────────────────────────────────────── */
function el<T extends keyof SVGElementTagNameMap>(
  tag: T,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[T] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function svgText(
  parent: SVGElement,
  x: number, y: number,
  text: string,
  cls: string,
): SVGTextElement {
  const t = el('text', { x, y, class: cls });
  t.textContent = text;
  parent.appendChild(t);
  return t;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Mount ──────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls: ctls, caption } = layout;

  /* styles */
  const style = document.createElement('style');
  style.textContent = `
    .tt-stage { display:flex; align-items:center; justify-content:center; }
    .tt-stage svg { width:100%; height:100%; display:block; }

    .tt-lname { font:700 9.5px/1 'JetBrains Mono',monospace; fill:#cdd3e3;
                text-anchor:end; dominant-baseline:middle; }
    .tt-lsub  { font:500 8px/1  'JetBrains Mono',monospace; fill:#5b6378;
                text-anchor:end; }

    .tt-oplabel  { font:700 7.5px 'JetBrains Mono',monospace; fill:#e7eaf3;
                   text-anchor:middle; dominant-baseline:middle; }
    .tt-opgas    { font:500 6.5px 'JetBrains Mono',monospace; fill:#8d95ad;
                   text-anchor:middle; dominant-baseline:hanging; }

    .tt-mevlbl  { font:700 6px 'JetBrains Mono',monospace; fill:#f87171;
                  text-anchor:middle; letter-spacing:.05em; }
    .tt-mevmark { font:900 9px  'JetBrains Mono',monospace; fill:#f87171;
                  text-anchor:middle; dominant-baseline:middle; }

    .tt-ovlbl   { font:600 6px 'JetBrains Mono',monospace; fill:#8d95ad;
                  text-anchor:middle; dominant-baseline:middle; }
    .tt-ovlbl2  { font:700 6px 'JetBrains Mono',monospace; fill:#fbbf24;
                  text-anchor:middle; }

    .tt-panel { display:flex; flex-direction:column; gap:10px;
                font:500 10.5px/1.4 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; }
    .tt-phdr  { font:700 11px 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0;
                overflow-wrap:anywhere; }
    .tt-pdiv  { height:1px; background:rgba(124,140,255,.12); flex:0 0 auto; }
    .tt-prow  { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .tt-prowh { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; min-width:0; }
    .tt-pname { font:700 9.5px 'JetBrains Mono',monospace; color:#cdd3e3; flex:0 0 auto; }
    .tt-pgas  { font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378; }
    .tt-pcost { font:700 12px 'JetBrains Mono',monospace; }
    .tt-pmev  { font:500 8.5px 'JetBrains Mono',monospace; }
    .tt-pmev-ok   { color:#4ade80; }
    .tt-pmev-warn { color:#f87171; }
    .tt-pempty { font:500 9.5px 'JetBrains Mono',monospace; color:#5b6378;
                 text-align:center; padding:12px 0; min-width:0; }

    .tt-btns { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .tt-sbtn {
      border:1px solid rgba(124,140,255,.22); border-radius:7px;
      cursor:pointer; background:#0d1322; color:#8d95ad;
      font:600 8.5px 'JetBrains Mono',monospace; letter-spacing:.04em;
      padding:5px 9px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .tt-sbtn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.45); }
    .tt-sbtn.tt-sel { color:#e7eaf3; border-color:rgba(124,140,255,.65); background:#13192e; }
  `;
  container.appendChild(style);
  stage.classList.add('tt-stage');

  /* SVG */
  const svg = el('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
  });

  /* ── Static structure: lane backgrounds + row labels ─────────────────────── */
  const ROWS = [
    { name: 'RAW EOA',  sub: '(separate txns)' },
    { name: 'ERC-4337', sub: '(UserOperation)' },
    { name: 'EIP-7702', sub: '(batch + auth)'  },
  ] as const;

  // Keep reference to "sub" text so we can update the Raw EOA "(N txns)" label
  const subEls: SVGTextElement[] = [];

  for (let i = 0; i < 3; i++) {
    const ly = LANE_Y[i];

    // Lane background
    svg.appendChild(el('rect', {
      x: TL_X, y: ly, width: TL_W, height: LANE_H,
      rx: 8, fill: '#0a0e1a', stroke: 'rgba(124,140,255,.1)', 'stroke-width': '1',
    }));

    const lMid = ly + LANE_H / 2;
    svgText(svg, LABEL_W, lMid - 7, ROWS[i].name, 'tt-lname');
    const sub = svgText(svg, LABEL_W, lMid + 9, ROWS[i].sub, 'tt-lsub');
    subEls.push(sub);
  }

  // Dynamic group — cleared and repopulated on each scenario change
  const dynG = el('g', {});
  svg.appendChild(dynG);

  stage.appendChild(svg);

  /* ── Panel ───────────────────────────────────────────────────────────────── */
  panel.className = 'tt-panel';

  function renderPanel(sc: Scenario | null): void {
    panel.replaceChildren();

    if (!sc) {
      const em = document.createElement('div');
      em.className = 'tt-pempty';
      em.textContent = 'Select a scenario below';
      panel.appendChild(em);
      return;
    }

    const { rawEOA, erc4337, eip7702, mevWindows } = scenarioGas(sc);

    const hdr = document.createElement('div');
    hdr.className = 'tt-phdr';
    hdr.textContent = sc.label;
    panel.appendChild(hdr);

    const APPROACHES = [
      { name: 'RAW EOA',   gas: rawEOA,  color: '#f87171', mev: mevWindows },
      { name: 'ERC-4337',  gas: erc4337, color: '#fbbf24', mev: 0          },
      { name: 'EIP-7702',  gas: eip7702, color: '#4ade80', mev: 0          },
    ];

    for (const a of APPROACHES) {
      const div = document.createElement('div');
      div.className = 'tt-pdiv';
      panel.appendChild(div);

      const row = document.createElement('div');
      row.className = 'tt-prow';

      const rowH = document.createElement('div');
      rowH.className = 'tt-prowh';

      const nm = document.createElement('span');
      nm.className = 'tt-pname';
      nm.style.color = a.color;
      nm.textContent = a.name;

      const gEl = document.createElement('span');
      gEl.className = 'tt-pgas';
      gEl.textContent = `${gasK(a.gas)} gas`;

      rowH.append(nm, gEl);

      const costEl = document.createElement('div');
      costEl.className = 'tt-pcost';
      costEl.style.color = a.color;
      costEl.textContent = `${toUSD(a.gas)}  @ 2 gwei / $${ethPriceUSD}`;

      const mevEl = document.createElement('div');
      mevEl.className = 'tt-pmev ' + (a.mev > 0 ? 'tt-pmev-warn' : 'tt-pmev-ok');
      mevEl.textContent = a.mev > 0
        ? `⚠ ${a.mev} MEV window${a.mev > 1 ? 's' : ''}`
        : '✓ 0 MEV windows — atomic';

      row.append(rowH, costEl, mevEl);
      panel.appendChild(row);
    }
  }

  renderPanel(null);

  /* ── Drawing helpers ─────────────────────────────────────────────────────── */

  // Draw the Raw EOA lane: N separate tx blocks with MEV zones between them
  function drawRawEOA(sc: Scenario): void {
    const ly = LANE_Y[0];
    const innerY = ly + 12;
    const innerH = LANE_H - 24;
    let cx = TL_X + 10;   // current x cursor

    for (let i = 0; i < sc.ops.length; i++) {
      const opId = sc.ops[i];
      const op   = OP_MAP.get(opId)!;

      // TX block background
      dynG.appendChild(el('rect', {
        x: cx, y: innerY, width: TX_W, height: innerH,
        rx: 6,
        fill: hexToRgba(op.color, 0.07),
        stroke: hexToRgba(op.color, 0.4),
        'stroke-width': '1.2',
      }));

      // Left accent stripe
      dynG.appendChild(el('rect', {
        x: cx, y: innerY, width: 3, height: innerH,
        rx: 3, fill: op.color, opacity: '0.5',
      }));

      // Operation label (centered in block)
      svgText(dynG, cx + TX_W / 2, innerY + innerH / 2 - 6, op.label, 'tt-oplabel');
      svgText(dynG, cx + TX_W / 2, innerY + innerH / 2 + 8, gasK(op.gas), 'tt-opgas');

      cx += TX_W;

      // MEV zone between consecutive tx blocks
      if (i < sc.ops.length - 1) {
        // Red zone background
        dynG.appendChild(el('rect', {
          x: cx, y: innerY, width: MEV_W, height: innerH,
          rx: 2,
          fill: 'rgba(248,113,113,.08)',
          stroke: 'rgba(248,113,113,.3)',
          'stroke-width': '0.8',
          'stroke-dasharray': '2 2',
        }));

        // "!" marker
        svgText(dynG, cx + MEV_W / 2, innerY + innerH / 2, '!', 'tt-mevmark');

        // Tiny "MEV" label above zone
        svgText(dynG, cx + MEV_W / 2, innerY - 6, 'MEV', 'tt-mevlbl');

        cx += MEV_W;
      }
    }

    // Update sub label
    subEls[0].textContent = `(${sc.ops.length} txn${sc.ops.length > 1 ? 's' : ''})`;
  }

  // Draw an atomic lane (ERC-4337 or EIP-7702)
  function drawAtomic(
    sc: Scenario,
    laneIdx: number,
    ovhdW: number,
    ovhdLabel: string,
    ovhdSub: string,
    containerColor: string,
  ): void {
    const ly = LANE_Y[laneIdx];
    const innerY = ly + 12;
    const innerH = LANE_H - 24;

    // Compute container width: overhead + ops + gaps + padding
    const opsTotal = sc.ops.length * OP_W + (sc.ops.length - 1) * OP_GAP;
    const contW = CONT_PAD + ovhdW + OP_GAP + opsTotal + CONT_PAD;
    const contX = TL_X + 10;

    // Atomic container outline
    dynG.appendChild(el('rect', {
      x: contX, y: innerY, width: contW, height: innerH,
      rx: 8,
      fill: hexToRgba(containerColor, 0.05),
      stroke: hexToRgba(containerColor, 0.35),
      'stroke-width': '1.5',
    }));

    // "ATOMIC" badge at top-right of container
    const badgeX = contX + contW - 4;
    const badgeY = innerY + 4;
    dynG.appendChild(el('rect', {
      x: badgeX - 30, y: badgeY, width: 30, height: 10,
      rx: 3,
      fill: hexToRgba(containerColor, 0.15),
    }));
    svgText(dynG, badgeX - 15, badgeY + 5, 'ATOMIC', 'tt-ovlbl');

    // Overhead block
    const ovX = contX + CONT_PAD;
    dynG.appendChild(el('rect', {
      x: ovX, y: innerY + 4, width: ovhdW, height: innerH - 8,
      rx: 4,
      fill: 'rgba(93,102,130,.12)',
      stroke: 'rgba(93,102,130,.28)',
      'stroke-width': '1',
    }));
    svgText(dynG, ovX + ovhdW / 2, innerY + innerH / 2 - 5, ovhdLabel, 'tt-ovlbl');
    svgText(dynG, ovX + ovhdW / 2, innerY + innerH / 2 + 6, ovhdSub, 'tt-ovlbl2');

    // Op blocks inside container
    let opX = ovX + ovhdW + OP_GAP;
    for (let i = 0; i < sc.ops.length; i++) {
      const opId = sc.ops[i];
      const op   = OP_MAP.get(opId)!;

      dynG.appendChild(el('rect', {
        x: opX, y: innerY + 4, width: OP_W, height: innerH - 8,
        rx: 5,
        fill: hexToRgba(op.color, 0.1),
        stroke: hexToRgba(op.color, 0.45),
        'stroke-width': '1.2',
      }));

      svgText(dynG, opX + OP_W / 2, innerY + innerH / 2 - 6, op.label, 'tt-oplabel');
      svgText(dynG, opX + OP_W / 2, innerY + innerH / 2 + 8, gasK(op.gas), 'tt-opgas');

      opX += OP_W + (i < sc.ops.length - 1 ? OP_GAP : 0);
    }
  }

  /* ── Controls ─────────────────────────────────────────────────────────────── */
  const btnsDiv = document.createElement('div');
  btnsDiv.className = 'tt-btns';

  const handlers: Array<[HTMLButtonElement, () => void]> = [];
  const btnMap  = new Map<string, HTMLButtonElement>();
  let   selectedId: string | null = null;

  function drawScenario(sc: Scenario | null): void {
    // Clear dynamic SVG content
    while (dynG.firstChild) dynG.removeChild(dynG.firstChild);

    if (!sc) {
      // Reset sub labels
      subEls[0].textContent = ROWS[0].sub;
      subEls[1].textContent = ROWS[1].sub;
      subEls[2].textContent = ROWS[2].sub;
      return;
    }

    drawRawEOA(sc);
    drawAtomic(sc, 1, OVHD_ERC4337, 'BASE+', 'VALID', '#fbbf24');
    drawAtomic(sc, 2, OVHD_7702,    'AUTH',  '2.5k', '#4ade80');

    subEls[1].textContent = ROWS[1].sub;
    subEls[2].textContent = ROWS[2].sub;
  }

  for (const sc of data.scenarios) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tt-sbtn';
    btn.textContent = sc.label;
    btnMap.set(sc.id, btn);
    btnsDiv.appendChild(btn);

    const handler = (): void => {
      if (selectedId === sc.id) {
        selectedId = null;
        btn.classList.remove('tt-sel');
        drawScenario(null);
        renderPanel(null);
        return;
      }
      selectedId = sc.id;
      for (const [id, b] of btnMap) b.classList.toggle('tt-sel', id === sc.id);
      drawScenario(sc);
      renderPanel(sc);
    };

    btn.addEventListener('click', handler);
    handlers.push([btn, handler]);
  }

  ctls.appendChild(btnsDiv);

  /* Caption */
  const capEl = document.createElement('div');
  capEl.style.cssText =
    "font:500 8.5px/1.5 'JetBrains Mono',monospace;color:#5b6378;min-width:0;overflow-wrap:anywhere;";
  capEl.textContent =
    `Gas at ${effectiveGasPriceGwei} gwei · ETH $${ethPriceUSD} · block ${data.blockNumber} · EIP-7702 spec`;
  caption.appendChild(capEl);

  // Seed the three-op scenario on load
  const defaultSc = data.scenarios.find(s => s.id === 'three-op')!;
  selectedId = defaultSc.id;
  btnMap.get(defaultSc.id)?.classList.add('tt-sel');
  drawScenario(defaultSc);
  renderPanel(defaultSc);

  /* ── Cleanup ──────────────────────────────────────────────────────────────── */
  return () => {
    layout.dispose();
    for (const [btn, h] of handlers) btn.removeEventListener('click', h);
    style.remove();
  };
}
