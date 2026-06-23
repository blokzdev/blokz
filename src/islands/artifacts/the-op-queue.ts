import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

interface Stage {
  label: string;
  sub: string;
  actor: string;
  what: string;
  canFail: string;
  gasNote: string;
}

const STAGES: Stage[] = [
  {
    label: 'Build',
    sub: 'UserOp struct',
    actor: 'Agent / SDK',
    what: 'Constructs the UserOperation: sender, nonce, callData, gas limits, paymasterAndData, maxFeePerGas, maxPriorityFeePerGas.',
    canFail: 'Bad nonce, underestimated gas limits, expired or malformed paymasterAndData.',
    gasNote: 'No on-chain cost — pure off-chain construction.',
  },
  {
    label: 'Submit',
    sub: 'alt mempool',
    actor: 'Bundler node',
    what: 'Bundler receives UserOp via eth_sendUserOperation, simulates it under ERC-7562 storage restrictions, and queues it for batching.',
    canFail: 'Simulation revert, banned opcode or storage read, stale paymaster sig, maxFeePerGas below bundler floor.',
    gasNote: 'Bundler bears all gas risk on simulation. Account pays nothing yet.',
  },
  {
    label: 'Bundle',
    sub: 'handleOps() TX',
    actor: 'Bundler → chain',
    what: 'Bundler submits EntryPoint.handleOps([op1, op2, …]) as a native transaction. Pays base fee + priority fee upfront; EntryPoint reimburses from deposits.',
    canFail: 'On-chain state diverged from simulation (oracle update, competing tx). Bundler eats the revert cost — no reimbursement.',
    gasNote: '30–50k gas fixed overhead per bundle, shared across all ops in the batch.',
  },
  {
    label: 'Validate',
    sub: 'EntryPoint v0.7',
    actor: 'EntryPoint',
    what: 'For each op: calls account.validateUserOp(), then paymaster.validatePaymasterUserOp(). Checks nonce, gas deposits, and validation return values.',
    canFail: 'Paymaster deposit depleted, invalid signature, nonce already used, validation gas too low. Op reverts here — no execution gas charged.',
    gasNote: 'Validation gas deducted before execution. getDeposit() shows remaining paymaster stake.',
  },
  {
    label: 'Execute',
    sub: 'callData runs',
    actor: 'Smart account',
    what: 'EntryPoint calls account.execute(target, value, data). The account runs the intended action — swap, transfer, contract call, multi-call batch.',
    canFail: 'Target reverts (slippage exceeded, pool drained). EntryPoint still charges execution gas — inner reverts are expected behavior, not system failures.',
    gasNote: 'Mainnet avg $0.11 / op · Base avg $0.006 / op (18× cheaper). Gas: 72k–579k depending on complexity.',
  },
  {
    label: 'postOp',
    sub: 'Paymaster settle',
    actor: 'Paymaster',
    what: 'If a paymaster is set, EntryPoint calls paymaster.postOp() after execution. Used for ERC-20 collection, session tracking, or refunds.',
    canFail: 'postOp() revert → EntryPoint re-calls with mode=PostOpReverted, reverting execution. Paymaster is still debited for validation gas.',
    gasNote: 'ERC-20 paymaster collects tokens here. Verifying paymaster is a no-op.',
  },
];

/* SVG constants */
const VW = 640;
const VH = 220;
const BOX_W = 84;
const BOX_H = 82;
const ARROW_W = 18;
const TOTAL_W = STAGES.length * BOX_W + (STAGES.length - 1) * ARROW_W;
const START_X = Math.floor((VW - TOTAL_W) / 2);
const START_Y = Math.floor((VH - BOX_H) / 2);

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    controls: false,
  });
  const { stage, panel, caption } = layout;

  let selectedIdx = 0;

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .oq-wrap { position:absolute; inset:0; overflow:hidden; }
    .oq-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .oq-bg { fill:#0d1322; }

    .oq-box { fill:rgba(91,140,255,.07); stroke:rgba(91,140,255,.22); stroke-width:1.2; }
    .oq-box.active { fill:rgba(139,92,246,.18); stroke:rgba(139,92,246,.60); stroke-width:1.5; }
    .oq-num { font:700 8px 'JetBrains Mono',monospace; fill:#3d4a6e; }
    .oq-lbl { font:700 11px 'JetBrains Mono',monospace; fill:#c4cbde; text-anchor:middle; }
    .oq-lbl.active { fill:#e7eaf3; }
    .oq-sub { font:500 8px 'JetBrains Mono',monospace; fill:#5b6378; text-anchor:middle; }
    .oq-sub.active { fill:#8d95ad; }
    .oq-act { font:600 8.5px 'JetBrains Mono',monospace; fill:#5b8cff; text-anchor:middle; }
    .oq-act.active { fill:#a78bfa; }

    .oq-arrow { stroke:rgba(91,140,255,.28); stroke-width:1; }
    .oq-arrowhead { fill:rgba(91,140,255,.35); }

    .oq-panel { display:flex; flex-direction:column; gap:9px; min-width:0;
      font:500 11px 'JetBrains Mono',monospace; color:#8d95ad; }
    .oq-ph { font:700 13px 'JetBrains Mono',monospace; color:#e7eaf3;
      overflow-wrap:anywhere; min-width:0; }
    .oq-badge { display:inline-block; font:600 9px 'JetBrains Mono',monospace;
      padding:2px 7px; border-radius:5px;
      border:1px solid rgba(91,140,255,.38); background:rgba(91,140,255,.10);
      color:#8eb3ff; white-space:nowrap; }
    .oq-what { font-size:10.5px; line-height:1.55; color:#c4cbde;
      overflow-wrap:anywhere; min-width:0; }
    .oq-warn { padding:7px 9px; border-radius:7px;
      border:1px solid rgba(245,165,36,.32); background:rgba(245,165,36,.08);
      font-size:10px; line-height:1.5; color:#f5d899;
      overflow-wrap:anywhere; min-width:0; }
    .oq-warn-label { font:600 8.5px 'JetBrains Mono',monospace;
      letter-spacing:.06em; text-transform:uppercase; color:#a07028;
      display:block; margin-bottom:3px; }
    .oq-gas { padding:7px 9px; border-radius:7px;
      border:1px solid rgba(34,211,238,.22); background:rgba(34,211,238,.07);
      font-size:10px; line-height:1.5; color:#7ae7f0;
      overflow-wrap:anywhere; min-width:0; }
    .oq-gas-label { font:600 8.5px 'JetBrains Mono',monospace;
      letter-spacing:.06em; text-transform:uppercase; color:#1a8a96;
      display:block; margin-bottom:3px; }
    .oq-rule { height:1px; background:rgba(124,140,255,.10); }
    .oq-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378;
      overflow-wrap:anywhere; min-width:0; }
    .oq-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ── SVG stage ── */
  const wrap = document.createElement('div');
  wrap.className = 'oq-wrap';
  stage.appendChild(wrap);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    role: 'img',
    'aria-label': 'ERC-4337 UserOperation call flow — six stages from Build to postOp',
  });
  wrap.appendChild(svg);

  const bg = svgEl('rect', { width: String(VW), height: String(VH), class: 'oq-bg' });
  svg.appendChild(bg);

  /* Boxes and arrows */
  const boxEls: SVGRectElement[] = [];
  const labelEls: SVGTextElement[] = [];
  const subEls: SVGTextElement[] = [];
  const actEls: SVGTextElement[] = [];

  STAGES.forEach((s, i) => {
    const bx = START_X + i * (BOX_W + ARROW_W);
    const by = START_Y;
    const cx = bx + BOX_W / 2;

    /* Arrow from previous box */
    if (i > 0) {
      const ax = bx - ARROW_W;
      const my = by + BOX_H / 2;
      svg.appendChild(svgEl('line', {
        x1: String(ax), y1: String(my),
        x2: String(bx - 5), y2: String(my),
        class: 'oq-arrow',
      }));
      /* Arrowhead */
      const hx = bx - 5;
      svg.appendChild(svgEl('polygon', {
        points: `${hx},${my - 3.5} ${hx + 6},${my} ${hx},${my + 3.5}`,
        class: 'oq-arrowhead',
      }));
    }

    /* Click target group */
    const g = svgEl('g');
    (g as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', `Stage ${i + 1}: ${s.label}`);

    const rect = svgEl('rect', {
      x: String(bx), y: String(by),
      width: String(BOX_W), height: String(BOX_H),
      rx: '7', class: 'oq-box',
    });

    const numEl = svgEl('text', {
      x: String(bx + 7), y: String(by + 12),
      class: 'oq-num',
    });
    numEl.textContent = String(i + 1);

    const lblEl = svgEl('text', {
      x: String(cx), y: String(by + 35),
      class: 'oq-lbl',
    });
    lblEl.textContent = s.label;

    const subEl = svgEl('text', {
      x: String(cx), y: String(by + 48),
      class: 'oq-sub',
    });
    subEl.textContent = s.sub;

    const actEl = svgEl('text', {
      x: String(cx), y: String(by + 63),
      class: 'oq-act',
    });
    actEl.textContent = s.actor;

    g.appendChild(rect);
    g.appendChild(numEl);
    g.appendChild(lblEl);
    g.appendChild(subEl);
    g.appendChild(actEl);
    svg.appendChild(g);

    boxEls.push(rect);
    labelEls.push(lblEl);
    subEls.push(subEl);
    actEls.push(actEl);

    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
  });

  /* ── Panel ── */
  function renderPanel(idx: number) {
    const s = STAGES[idx];
    panel.innerHTML = '';

    const p = document.createElement('div');
    p.className = 'oq-panel';

    const ph = document.createElement('div');
    ph.className = 'oq-ph';
    ph.textContent = s.label;
    p.appendChild(ph);

    const badge = document.createElement('span');
    badge.className = 'oq-badge';
    badge.textContent = s.actor;
    p.appendChild(badge);

    const rule = document.createElement('div');
    rule.className = 'oq-rule';
    p.appendChild(rule);

    const what = document.createElement('div');
    what.className = 'oq-what';
    what.textContent = s.what;
    p.appendChild(what);

    const warn = document.createElement('div');
    warn.className = 'oq-warn';
    const wl = document.createElement('span');
    wl.className = 'oq-warn-label';
    wl.textContent = 'Can fail';
    warn.appendChild(wl);
    warn.appendChild(document.createTextNode(s.canFail));
    p.appendChild(warn);

    const gas = document.createElement('div');
    gas.className = 'oq-gas';
    const gl = document.createElement('span');
    gl.className = 'oq-gas-label';
    gl.textContent = 'Gas';
    gas.appendChild(gl);
    gas.appendChild(document.createTextNode(s.gasNote));
    p.appendChild(gas);

    panel.appendChild(p);
  }

  /* ── Selection ── */
  function select(idx: number) {
    selectedIdx = idx;
    STAGES.forEach((_, i) => {
      const active = i === idx;
      boxEls[i].classList.toggle('active', active);
      labelEls[i].classList.toggle('active', active);
      subEls[i].classList.toggle('active', active);
      actEls[i].classList.toggle('active', active);
    });
    renderPanel(idx);
  }

  select(0);

  /* ── Caption ── */
  const cap = document.createElement('div');
  cap.className = 'oq-cap';
  cap.innerHTML =
    'click any stage to inspect &nbsp;·&nbsp; <b>EntryPoint v0.7</b> · 0x0000…da032 &nbsp;·&nbsp; Ethereum + Base';
  caption.appendChild(cap);

  return () => {
    layout.dispose();
    style.remove();
  };
}
