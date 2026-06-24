/**
 * Artifact: the-kyc-gate — The KYC Gate
 *
 * Interactive diagram of the triple KYC gate in Ondo Finance's
 * CashKYCSenderReceiver that blocks AI agents from $5B+ in permissioned
 * tokenized treasuries. Toggle the sender wallet type (AI Agent vs. KYC
 * Institution) and the compliance model (permissioned whitelist vs. blocklist)
 * to see which gates pass or fail and why.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';
import rawData from '../../../content/artifacts/the-kyc-gate/data.json';

const NS = 'http://www.w3.org/2000/svg';
type WalletType = 'agent' | 'institution';
type TokenModel = 'permissioned' | 'blocklist';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

// ── Layout ──────────────────────────────────────────────────────────────────
const VW = 820;
const VH = 280;
const CY = 140;

// Contract box
const CONT_X = 220;
const CONT_Y = 40;
const CONT_W = 380;
const CONT_H = 200;

// Sender
const SEND_CX = 95;
const SEND_HW = 65; // half-width

// Recipient
const RECV_CX = 730;
const RECV_HW = 60;

// Gate row y-centers (3-gate mode)
const GATE_YS = [103, 140, 177] as const;

// ── Colors ──────────────────────────────────────────────────────────────────
const PASS_FILL   = 'rgba(34,211,238,.10)';
const FAIL_FILL   = 'rgba(248,113,113,.10)';
const PASS_STROKE = '#22d3ee';
const FAIL_STROKE = '#f87171';
const DIM_STROKE  = 'rgba(124,140,255,.22)';

// ── Helpers ──────────────────────────────────────────────────────────────────
function gatePass(wallet: WalletType, model: TokenModel): boolean[] {
  if (model === 'blocklist') return [true]; // agents are not on the list
  const kyc = wallet === 'institution';
  return [kyc, kyc, kyc];
}

function allGatesPass(wallet: WalletType, model: TokenModel): boolean {
  return gatePass(wallet, model).every(Boolean);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n}`;
}

// ── Mount ────────────────────────────────────────────────────────────────────
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  // ── Styles
  const style = document.createElement('style');
  style.textContent = `
    .kg-wrap { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .kg-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .kg-node-lbl  { fill:#e7eaf3; font:600 10px 'Space Grotesk',system-ui,sans-serif; }
    .kg-node-sub  { fill:#5b6378; font:500 8px 'JetBrains Mono',monospace; }
    .kg-ct-title  { fill:#8d95ad; font:600 8.5px 'JetBrains Mono',monospace;
                    letter-spacing:.12em; text-transform:uppercase; }
    .kg-ct-fn     { fill:#3d4460; font:500 8px 'JetBrains Mono',monospace; }
    .kg-gate-n    { fill:#5b6378; font:700 8px 'JetBrains Mono',monospace; }
    .kg-gate-chk  { fill:#8d95ad; font:500 8px 'JetBrains Mono',monospace; }
    .kg-arr-lbl   { fill:#3d4460; font:500 8px 'JetBrains Mono',monospace; }

    /* Controls */
    .kg-ctrl { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .kg-ctrl-group { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .kg-ctrl-lbl { font:500 9px 'JetBrains Mono',monospace; color:#5b6378;
                   letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
    .kg-tabs { display:inline-flex; flex-wrap:wrap; gap:5px; }
    .kg-tabs button {
      appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10px 'JetBrains Mono',monospace; letter-spacing:.03em;
      padding:6px 11px; cursor:pointer;
      transition:color .2s,background .2s,border-color .2s; }
    .kg-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .kg-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .kg-tabs button[aria-selected="true"] { background:rgba(91,140,255,.22); border-color:#5b8cff; color:#e7eaf3; }
    .kg-tabs .kg-agent[aria-selected="true"] { background:rgba(245,196,81,.15); border-color:#f5c451; color:#f5c451; }
    .kg-tabs .kg-inst[aria-selected="true"]  { background:rgba(139,92,246,.15); border-color:#8b5cf6; color:#a78bfa; }
    .kg-tabs .kg-perm[aria-selected="true"]  { background:rgba(248,113,113,.10); border-color:#f87171; color:#f87171; }
    .kg-tabs .kg-bloc[aria-selected="true"]  { background:rgba(34,211,238,.10); border-color:#22d3ee; color:#22d3ee; }

    /* Panel */
    .kg-panel  { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .kg-ptitle { font:600 9px 'JetBrains Mono',monospace; color:#5b6378;
                 letter-spacing:.10em; text-transform:uppercase; }
    .kg-trow   { border:1px solid rgba(124,140,255,.14); border-radius:8px;
                 padding:7px 9px; background:rgba(91,140,255,.04); min-width:0; }
    .kg-tsym   { font:700 10px 'JetBrains Mono',monospace; color:#e7eaf3; }
    .kg-tname  { font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378;
                 overflow-wrap:anywhere; margin-top:1px; }
    .kg-stats  { display:grid; grid-template-columns:1fr 1fr; gap:4px 10px; margin-top:6px; }
    .kg-stat   { display:flex; flex-direction:column; gap:1px; }
    .kg-slbl   { font:500 7.5px 'JetBrains Mono',monospace; color:#3d4460;
                 letter-spacing:.08em; text-transform:uppercase; }
    .kg-sval   { font:600 9.5px 'JetBrains Mono',monospace; color:#9aa3bd; }
    .kg-div    { border:none; border-top:1px solid rgba(124,140,255,.10); margin:6px 0; }
    .kg-verdict { display:flex; align-items:flex-start; gap:5px;
                  font:500 9.5px 'JetBrains Mono',monospace; line-height:1.4;
                  overflow-wrap:anywhere; min-width:0; }
    .kg-verdict.pass { color:#22d3ee; }
    .kg-verdict.fail { color:#f87171; }
    .kg-note   { font:500 9px 'JetBrains Mono',monospace; color:#3d4460;
                 line-height:1.5; overflow-wrap:anywhere; min-width:0; }
  `;
  stage.appendChild(style);

  // ── SVG stage
  const wrap = document.createElement('div');
  wrap.className = 'kg-wrap';
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'KYC gate flow diagram for tokenized treasury transfers',
  });
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // ── Sender node
  const senderG = svgEl('g');
  const senderRect = svgEl('rect', {
    x: SEND_CX - SEND_HW, y: CY - 34, width: SEND_HW * 2, height: 68, rx: 10,
    fill: '#0e1528', stroke: 'rgba(245,196,81,.50)', 'stroke-width': 1.5,
  });
  const senderLbl  = svgEl('text', { x: SEND_CX, y: CY - 10, class: 'kg-node-lbl', 'text-anchor': 'middle' }, 'AI AGENT');
  const senderSub1 = svgEl('text', { x: SEND_CX, y: CY + 6,  class: 'kg-node-sub', 'text-anchor': 'middle' }, 'msg.sender');
  const senderSub2 = svgEl('text', { x: SEND_CX, y: CY + 18, class: 'kg-node-sub', 'text-anchor': 'middle' }, 'no KYC status');
  senderG.append(senderRect, senderLbl, senderSub1, senderSub2);
  svg.appendChild(senderG);

  // Left arrow (sender → contract)
  const arrL = svgEl('line', {
    x1: SEND_CX + SEND_HW + 2, y1: CY, x2: CONT_X - 2, y2: CY,
    stroke: 'rgba(124,140,255,.35)', 'stroke-width': 1.5,
  });
  svg.appendChild(arrL);
  // arrowhead for left arrow
  const arrLTip = svgEl('polygon', {
    points: `${CONT_X - 2},${CY} ${CONT_X - 10},${CY - 4} ${CONT_X - 10},${CY + 4}`,
    fill: 'rgba(124,140,255,.40)',
  });
  svg.appendChild(arrLTip);
  svg.appendChild(svgEl('text', {
    x: (SEND_CX + SEND_HW + CONT_X) / 2, y: CY - 9,
    class: 'kg-arr-lbl', 'text-anchor': 'middle',
  }, 'transfer()'));

  // ── Contract box
  const contractRect = svgEl('rect', {
    x: CONT_X, y: CONT_Y, width: CONT_W, height: CONT_H, rx: 10,
    fill: '#0b1020', stroke: DIM_STROKE, 'stroke-width': 1.5,
  });
  svg.appendChild(contractRect);
  svg.appendChild(svgEl('text', {
    x: CONT_X + CONT_W / 2, y: CONT_Y + 17,
    class: 'kg-ct-title', 'text-anchor': 'middle',
  }, 'CashKYCSenderReceiver'));
  svg.appendChild(svgEl('text', {
    x: CONT_X + CONT_W / 2, y: CONT_Y + 30,
    class: 'kg-ct-fn', 'text-anchor': 'middle',
  }, '_beforeTokenTransfer(from, to, amount)'));
  svg.appendChild(svgEl('line', {
    x1: CONT_X + 14, y1: CONT_Y + 40, x2: CONT_X + CONT_W - 14, y2: CONT_Y + 40,
    stroke: 'rgba(124,140,255,.12)', 'stroke-width': 1,
  }));

  // ── Gate rows (3-gate permissioned mode)
  interface GateRow {
    g:       SVGGElement;
    bg:      SVGRectElement;
    chk:     SVGTextElement;
    iconBg:  SVGRectElement;
    iconTxt: SVGTextElement;
  }
  const gateRows: GateRow[] = rawData.gates.map((gate, i) => {
    const gy  = GATE_YS[i]!;
    const g   = svgEl('g');
    const bg  = svgEl('rect', {
      x: CONT_X + 10, y: gy - 14, width: CONT_W - 20, height: 28, rx: 5,
      fill: FAIL_FILL,
    });
    const gateN = svgEl('text', {
      x: CONT_X + 24, y: gy + 4, class: 'kg-gate-n', 'text-anchor': 'middle',
    }, `G${gate.n}`);
    const chk = svgEl('text', {
      x: CONT_X + 40, y: gy + 4, class: 'kg-gate-chk', 'text-anchor': 'start',
    }, gate.check);
    const iconBg = svgEl('rect', {
      x: CONT_X + CONT_W - 36, y: gy - 10, width: 22, height: 20, rx: 4,
      fill: FAIL_FILL,
    });
    const iconTxt = svgEl('text', {
      x: CONT_X + CONT_W - 25, y: gy + 4,
      fill: FAIL_STROKE, 'text-anchor': 'middle',
      style: 'font:700 11px sans-serif;',
    }, '✗');
    g.append(bg, gateN, chk, iconBg, iconTxt);
    svg.appendChild(g);
    return { g, bg, chk, iconBg, iconTxt };
  });

  // ── Blocklist gate (1-gate mode, hidden initially)
  const blGateG   = svgEl('g');
  blGateG.style.display = 'none';
  const blGateBg  = svgEl('rect', {
    x: CONT_X + 10, y: CY - 14, width: CONT_W - 20, height: 28, rx: 5,
    fill: PASS_FILL,
  });
  blGateG.append(
    blGateBg,
    svgEl('text', { x: CONT_X + 24, y: CY + 4, class: 'kg-gate-n',  'text-anchor': 'middle' }, 'G1'),
    svgEl('text', { x: CONT_X + 40, y: CY + 4, class: 'kg-gate-chk', 'text-anchor': 'start' }, 'not on US sanctions blocklist'),
    svgEl('rect',  { x: CONT_X + CONT_W - 36, y: CY - 10, width: 22, height: 20, rx: 4, fill: PASS_FILL }),
    Object.assign(svgEl('text', {
      x: CONT_X + CONT_W - 25, y: CY + 4, fill: PASS_STROKE, 'text-anchor': 'middle',
    }, '✓'), { style: 'font:700 11px sans-serif;' }),
  );
  svg.appendChild(blGateG);

  // ── Right arrow (contract → recipient)
  const arrR = svgEl('line', {
    x1: CONT_X + CONT_W + 2, y1: CY, x2: RECV_CX - RECV_HW - 10, y2: CY,
    stroke: FAIL_STROKE, 'stroke-width': 1.5,
  });
  svg.appendChild(arrR);
  const arrRTip = svgEl('polygon', {
    points: (() => {
      const x = RECV_CX - RECV_HW - 2;
      return `${x},${CY} ${x - 8},${CY - 4} ${x - 8},${CY + 4}`;
    })(),
    fill: FAIL_STROKE,
  });
  svg.appendChild(arrRTip);
  const arrRLbl = svgEl('text', {
    x: (CONT_X + CONT_W + RECV_CX - RECV_HW) / 2, y: CY - 9,
    class: 'kg-arr-lbl', 'text-anchor': 'middle',
  }, 'reverts');
  svg.appendChild(arrRLbl);

  // ── Recipient node
  const recipG = svgEl('g');
  const recipRect = svgEl('rect', {
    x: RECV_CX - RECV_HW, y: CY - 30, width: RECV_HW * 2, height: 60, rx: 10,
    fill: '#0e1528', stroke: DIM_STROKE, 'stroke-width': 1.5,
  });
  recipG.append(
    recipRect,
    svgEl('text', { x: RECV_CX, y: CY - 6,  class: 'kg-node-lbl', 'text-anchor': 'middle' }, 'RECIPIENT'),
    svgEl('text', { x: RECV_CX, y: CY + 10, class: 'kg-node-sub', 'text-anchor': 'middle' }, 'KYC\'d address'),
  );
  svg.appendChild(recipG);

  // ── Panel
  const panelDiv = document.createElement('div');
  panelDiv.className = 'kg-panel';
  panel.appendChild(panelDiv);

  // ── Controls
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'kg-ctrl';

  // Wallet-type group
  const walletGroup = document.createElement('div');
  walletGroup.className = 'kg-ctrl-group';
  const walletLbl = document.createElement('span');
  walletLbl.className = 'kg-ctrl-lbl';
  walletLbl.textContent = 'Sender';
  const walletTabs = document.createElement('div');
  walletTabs.className = 'kg-tabs';
  walletTabs.setAttribute('role', 'tablist');
  walletTabs.setAttribute('aria-label', 'Sender wallet type');
  const WALLET_OPTS = [
    { id: 'agent'       as WalletType, label: 'AI Agent',       cls: 'kg-agent' },
    { id: 'institution' as WalletType, label: 'KYC Institution', cls: 'kg-inst'  },
  ];
  const walletBtns = WALLET_OPTS.map(({ id, label, cls }) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.textContent = label; b.className = cls; b.dataset['wallet'] = id;
    walletTabs.appendChild(b);
    return b;
  });
  walletGroup.append(walletLbl, walletTabs);

  // Token-model group
  const modelGroup = document.createElement('div');
  modelGroup.className = 'kg-ctrl-group';
  const modelLbl = document.createElement('span');
  modelLbl.className = 'kg-ctrl-lbl';
  modelLbl.textContent = 'Token';
  const modelTabs = document.createElement('div');
  modelTabs.className = 'kg-tabs';
  modelTabs.setAttribute('role', 'tablist');
  modelTabs.setAttribute('aria-label', 'Token compliance model');
  const MODEL_OPTS = [
    { id: 'permissioned' as TokenModel, label: 'Permissioned', cls: 'kg-perm' },
    { id: 'blocklist'    as TokenModel, label: 'Blocklist',    cls: 'kg-bloc' },
  ];
  const modelBtns = MODEL_OPTS.map(({ id, label, cls }) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.textContent = label; b.className = cls; b.dataset['model'] = id;
    modelTabs.appendChild(b);
    return b;
  });
  modelGroup.append(modelLbl, modelTabs);

  ctrlDiv.append(walletGroup, modelGroup);
  controlsSlot.appendChild(ctrlDiv);

  // ── Caption
  const cap = document.createElement('div');
  cap.className = 'kg-note';
  cap.textContent =
    'Source: Blockscout · Ethereum mainnet · Ondo Finance CashKYCSenderReceiver · 2026-06-21';
  caption.appendChild(cap);

  // ── State
  let walletType: WalletType = 'agent';
  let tokenModel: TokenModel = 'permissioned';

  // ── Render
  function renderSVG() {
    const passes  = gatePass(walletType, tokenModel);
    const passing = passes.every(Boolean);

    // Sender node
    const isAgent = walletType === 'agent';
    senderRect.setAttribute('stroke', isAgent ? 'rgba(245,196,81,.50)' : 'rgba(139,92,246,.55)');
    senderLbl.textContent  = isAgent ? 'AI AGENT'  : 'KYC INST.';
    senderSub2.textContent = isAgent ? 'no KYC status' : 'KYC verified';

    // Gate rows
    if (tokenModel === 'permissioned') {
      blGateG.style.display = 'none';
      gateRows.forEach((row, i) => {
        row.g.style.display = '';
        const p = passes[i] ?? false;
        row.bg.setAttribute('fill',      p ? PASS_FILL   : FAIL_FILL);
        row.iconBg.setAttribute('fill',  p ? PASS_FILL   : FAIL_FILL);
        row.iconTxt.setAttribute('fill', p ? PASS_STROKE : FAIL_STROKE);
        row.iconTxt.textContent = p ? '✓' : '✗';
      });
    } else {
      gateRows.forEach(row => { row.g.style.display = 'none'; });
      blGateG.style.display = '';
    }

    // Contract border
    contractRect.setAttribute('stroke',
      passing ? 'rgba(34,211,238,.30)' : 'rgba(248,113,113,.22)');

    // Right arrow
    const ac = passing ? PASS_STROKE : FAIL_STROKE;
    arrR.setAttribute('stroke', passing ? PASS_STROKE : 'rgba(248,113,113,.35)');
    arrRTip.setAttribute('fill', ac);
    arrRLbl.setAttribute('fill', passing ? '#22d3ee' : '#3d4460');
    arrRLbl.textContent = passing ? 'tokens flow' : 'reverts';
  }

  function renderPanel() {
    panelDiv.innerHTML = '';

    const tokens  = rawData.tokens.filter(t => t.model === tokenModel);
    const passing = allGatesPass(walletType, tokenModel);

    const title = document.createElement('div');
    title.className = 'kg-ptitle';
    title.textContent = tokenModel === 'permissioned' ? 'Permissioned tokens' : 'Blocklist token';
    panelDiv.appendChild(title);

    tokens.forEach(t => {
      const row = document.createElement('div');
      row.className = 'kg-trow';

      const sym = document.createElement('div');
      sym.className = 'kg-tsym';
      sym.textContent = t.symbol;

      const name = document.createElement('div');
      name.className = 'kg-tname';
      name.textContent = `${t.name} · ${t.protocol}`;

      const stats = document.createElement('div');
      stats.className = 'kg-stats';
      const mkStat = (lbl: string, val: string) => {
        const d = document.createElement('div');
        d.className = 'kg-stat';
        d.innerHTML = `<span class="kg-slbl">${lbl}</span><span class="kg-sval">${val}</span>`;
        return d;
      };
      stats.append(
        mkStat('market cap',  fmtUsd(t.marketCapUsd)),
        mkStat('holders',     t.holdersEth.toLocaleString()),
        mkStat('24h volume',  t.volume24hUsd > 0 ? fmtUsd(t.volume24hUsd) : '$0'),
        mkStat('kyc gates',   `${t.gateCount} check${t.gateCount > 1 ? 's' : ''}`),
      );
      row.append(sym, name, stats);
      panelDiv.appendChild(row);
    });

    const hr = document.createElement('hr');
    hr.className = 'kg-div';
    panelDiv.appendChild(hr);

    const verdict = document.createElement('div');
    verdict.className = `kg-verdict ${passing ? 'pass' : 'fail'}`;
    let msg: string;
    if (tokenModel === 'permissioned') {
      msg = walletType === 'agent'
        ? '✗  Reverts — all 3 gates require KYC; agents have no legal entity'
        : '✓  Transfer permitted — institution clears all 3 KYC checks';
    } else {
      msg = '✓  Transfer permitted — blocklist model is inclusive; agents are not explicitly blocked';
    }
    verdict.textContent = msg;
    panelDiv.appendChild(verdict);
  }

  function render() {
    walletBtns.forEach(b =>
      b.setAttribute('aria-selected', String((b.dataset['wallet'] as WalletType) === walletType)));
    modelBtns.forEach(b =>
      b.setAttribute('aria-selected', String((b.dataset['model'] as TokenModel) === tokenModel)));
    renderSVG();
    renderPanel();
  }

  // ── Events
  const walletFns = walletBtns.map(b => {
    const fn = () => { walletType = b.dataset['wallet'] as WalletType; render(); };
    b.addEventListener('click', fn);
    return fn;
  });
  const modelFns = modelBtns.map(b => {
    const fn = () => { tokenModel = b.dataset['model'] as TokenModel; render(); };
    b.addEventListener('click', fn);
    return fn;
  });

  const onWalletKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const types: WalletType[] = ['agent', 'institution'];
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    walletType = types[(types.indexOf(walletType) + dir + types.length) % types.length]!;
    render();
  };
  const onModelKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const models: TokenModel[] = ['permissioned', 'blocklist'];
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    tokenModel = models[(models.indexOf(tokenModel) + dir + models.length) % models.length]!;
    render();
  };
  walletTabs.addEventListener('keydown', onWalletKey);
  modelTabs.addEventListener('keydown', onModelKey);

  render();

  return () => {
    walletBtns.forEach((b, i) => b.removeEventListener('click', walletFns[i]!));
    modelBtns.forEach((b, i)  => b.removeEventListener('click', modelFns[i]!));
    walletTabs.removeEventListener('keydown', onWalletKey);
    modelTabs.removeEventListener('keydown', onModelKey);
    layout.dispose();
    style.remove();
  };
}
