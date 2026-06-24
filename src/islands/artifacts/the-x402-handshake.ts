/**
 * Artifact: the-x402-handshake — The x402 Handshake
 * Manifest: content/artifacts/the-x402-handshake/manifest.json
 *
 * Sequence diagram of the x402 HTTP payment exchange.
 * Three actors: AI AGENT · RESOURCE SERVER · BASE L2
 * Six numbered steps stepped through interactively.
 *
 * Stage: SVG sequence diagram (840×400).
 * Panel: Selected step description and header detail.
 * Controls: step navigation buttons + keyboard arrows.
 *
 * Sources: x402 spec (github.com/coinbase/x402), EIP-3009.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

/* ── SVG helpers ────────────────────────────────────────────────────────────── */
function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ── Dimensions ─────────────────────────────────────────────────────────────── */
const VW = 840;
const VH = 390;

// Actor centers (x coordinate)
const ACX: [number, number, number] = [120, 420, 720];
const ACW = 160;  // actor box width
const ACH = 38;   // actor box height
const ACTOR_Y = 14;

// Lifeline
const LIFE_Y_TOP = ACTOR_Y + ACH;
const LIFE_Y_BOT = VH - 14;

// Step y positions (6 steps)
const STEP_Y = [100, 154, 208, 262, 316, 370];

/* ── Color tokens ────────────────────────────────────────────────────────────── */
const C = {
  bg: '#0b0f1e',
  actor: '#11162a',
  actorStroke: 'rgba(91,140,255,.30)',
  actorText: '#cdd3e3',
  lifeline: 'rgba(91,140,255,.12)',
  request: '#5b8cff',   // blue — outbound request
  challenge: '#f5c451', // amber — 402 challenge
  local: '#8b5cf6',     // violet — local signing
  payment: '#22d3ee',   // cyan — payment retry
  onchain: '#4ade80',   // green — on-chain settlement
  delivery: '#5b8cff',  // blue — 200 delivery
  dim: 'rgba(255,255,255,0.12)',
  dimLine: 'rgba(91,140,255,0.08)',
  arrowHead: 5,
};

/* ── Step data ───────────────────────────────────────────────────────────────── */
interface Step {
  id: number;
  fromActor: 0 | 1 | 2;   // actor index
  toActor: 0 | 1 | 2;     // actor index (same as from = local)
  label: string;           // arrow label
  color: string;
  badge: string;           // status badge text
  detail: {
    title: string;
    lines: string[];
    code?: string;
  };
}

const STEPS: Step[] = [
  {
    id: 1,
    fromActor: 0, toActor: 1,
    label: 'GET /api/data',
    color: C.request,
    badge: 'REQUEST',
    detail: {
      title: '① Initial Request',
      lines: [
        'Standard HTTP request — no payment context.',
        'The agent probes whether the resource requires payment.',
        'If the server returns 200, the resource is free.',
      ],
      code: 'GET /api/data HTTP/1.1\nHost: data.example.com',
    },
  },
  {
    id: 2,
    fromActor: 1, toActor: 0,
    label: '402 Payment Required',
    color: C.challenge,
    badge: 'CHALLENGE',
    detail: {
      title: '② Payment Challenge',
      lines: [
        'Server returns HTTP 402 with PAYMENT-REQUIRED header.',
        'The header (base64-encoded JSON) specifies: amount, USDC address,',
        'destination, chain (eip155:8453 = Base), validBefore timestamp.',
      ],
      code: 'HTTP/1.1 402 Payment Required\nPAYMENT-REQUIRED: base64({\n  "scheme": "exact",\n  "network": "eip155:8453",\n  "maxAmountRequired": "10000",  // 0.01 USDC\n  "to": "0xServer...",\n  "validBefore": 1750000180\n})',
    },
  },
  {
    id: 3,
    fromActor: 0, toActor: 0,
    label: 'sign EIP-3009 auth (local)',
    color: C.local,
    badge: 'LOCAL',
    detail: {
      title: '③ Sign Authorization — No Gas',
      lines: [
        'Agent signs an EIP-712 typed message over the EIP-3009 struct.',
        'No transaction is submitted. No ETH or gas needed.',
        'A 32-byte random nonce prevents replay of this specific auth.',
      ],
      code: '// EIP-3009 struct signed with EIP-712\n{\n  from: agentAddress,\n  to: "0xServer...",\n  value: 10000n,  // 0.01 USDC (6 decimals)\n  validAfter: 0,\n  validBefore: 1750000180,\n  nonce: crypto.randomBytes(32)\n}',
    },
  },
  {
    id: 4,
    fromActor: 0, toActor: 1,
    label: 'GET /api/data  +  X-PAYMENT',
    color: C.payment,
    badge: 'PAYMENT',
    detail: {
      title: '④ Signed Retry',
      lines: [
        'Agent retries with the EIP-712 signature encoded into X-PAYMENT.',
        'The base64 payload carries: x402Version, scheme, network, and the',
        'signed authorization struct (v, r, s + the full auth fields).',
      ],
      code: 'GET /api/data HTTP/1.1\nX-PAYMENT: base64({\n  "x402Version": 1,\n  "scheme": "exact",\n  "network": "eip155:8453",\n  "payload": {\n    "signature": "0x...",\n    "authorization": { from, to, value,\n      validAfter, validBefore, nonce }\n  }\n})',
    },
  },
  {
    id: 5,
    fromActor: 1, toActor: 2,
    label: 'USDC.transferWithAuthorization()',
    color: C.onchain,
    badge: 'ON-CHAIN',
    detail: {
      title: '⑤ Facilitator Settlement',
      lines: [
        'Facilitator verifies the EIP-712 sig, checks nonce uniqueness,',
        'and calls transferWithAuthorization() on the Base USDC contract.',
        'Settlement: ~1 s on Base. Gas paid by the facilitator, not the agent.',
      ],
      code: '// Coinbase facilitator calls on Base\nUSDC.transferWithAuthorization(\n  from, to, value,\n  validAfter, validBefore,\n  nonce,\n  v, r, s\n)',
    },
  },
  {
    id: 6,
    fromActor: 1, toActor: 0,
    label: '200 OK  +  X-PAYMENT-RESPONSE',
    color: C.delivery,
    badge: 'DELIVERY',
    detail: {
      title: '⑥ Resource Delivery + Receipt',
      lines: [
        'Server returns the resource. X-PAYMENT-RESPONSE carries a',
        'settlement receipt: success flag, transaction hash, network.',
        'Total round-trip: ~1.5–2 s on Base. ~400 ms on Solana.',
      ],
      code: 'HTTP/1.1 200 OK\nX-PAYMENT-RESPONSE: base64({\n  "success": true,\n  "transaction": "0xabc...",\n  "network": "eip155:8453",\n  "payer": "0xAgent..."\n})\n\n{ "data": [...] }',
    },
  },
];

/* ── Mount ────────────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls: ctls, caption } = layout;

  /* ── Styles ─────────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .xh-wrap {
      position:absolute; inset:0;
      background:${C.bg};
      border:1px solid rgba(91,140,255,.14);
      border-radius:12px;
      overflow:hidden;
    }
    .xh-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .xh-actor-box { cursor:default; }
    .xh-actor-label {
      font:700 10px 'Space Grotesk',system-ui,sans-serif;
      fill:${C.actorText};
      text-anchor:middle; dominant-baseline:middle;
    }
    .xh-actor-sub {
      font:500 7.5px 'JetBrains Mono',monospace;
      fill:#5b6378;
      text-anchor:middle; dominant-baseline:middle;
    }

    .xh-step-row { cursor:pointer; }
    .xh-step-row:hover .xh-hit { fill:rgba(91,140,255,0.06); }

    .xh-arrow-line { stroke-width:1.5; fill:none; }
    .xh-arrow-head { stroke:none; }
    .xh-step-label {
      font:500 8.5px 'JetBrains Mono',monospace;
      dominant-baseline:middle;
    }
    .xh-badge {
      font:700 7px 'JetBrains Mono',monospace;
      letter-spacing:.06em;
    }
    .xh-step-num {
      font:700 9px 'Space Grotesk',system-ui,sans-serif;
      fill:#3d4460;
      text-anchor:middle; dominant-baseline:middle;
    }
    .xh-local-box { stroke-width:1.5; fill:rgba(139,92,246,0.08); }
    .xh-local-lbl {
      font:500 8.5px 'JetBrains Mono',monospace;
      dominant-baseline:middle; text-anchor:middle;
    }

    /* Panel */
    .xh-panel { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .xh-phead { font:700 11px 'Space Grotesk',system-ui,sans-serif; color:#e7eaf3;
                overflow-wrap:anywhere; min-width:0; }
    .xh-pline { font:500 9.5px 'Space Grotesk',system-ui,sans-serif; color:#8d95ad;
                line-height:1.5; overflow-wrap:anywhere; min-width:0; }
    .xh-hr { border:none; border-top:1px solid rgba(91,140,255,.10); margin:2px 0; }
    .xh-code {
      font:500 8.5px 'JetBrains Mono',monospace; color:#9aa3bd;
      background:rgba(13,19,34,0.8); border:1px solid rgba(91,140,255,.12);
      border-radius:6px; padding:7px 8px; white-space:pre; overflow-x:auto;
      overflow-wrap:anywhere; min-width:0;
    }

    /* Controls */
    .xh-btns { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .xh-sbtn {
      appearance:none; border:1px solid rgba(91,140,255,.28);
      background:rgba(91,140,255,.06); color:#8d95ad;
      border-radius:7px; font:600 8.5px 'JetBrains Mono',monospace;
      padding:6px 11px; cursor:pointer; transition:.15s; flex:none;
    }
    .xh-sbtn:hover { color:#cdd3e3; border-color:rgba(91,140,255,.55); }
    .xh-sbtn.xh-sel { color:#e7eaf3; border-color:rgba(91,140,255,.70); background:#0d1322; }
    .xh-nav { display:flex; gap:4px; flex:none; }
    .xh-navbtn {
      appearance:none; border:1px solid rgba(91,140,255,.22);
      background:rgba(91,140,255,.04); color:#5b6378;
      border-radius:6px; font:700 11px 'JetBrains Mono',monospace;
      padding:5px 10px; cursor:pointer; transition:.15s; flex:none;
    }
    .xh-navbtn:hover:not(:disabled) { color:#cdd3e3; border-color:rgba(91,140,255,.45); }
    .xh-navbtn:disabled { opacity:.3; cursor:default; }
    .xh-cap { font:500 8.5px 'JetBrains Mono',monospace; color:#3d4460; overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  /* ── SVG stage ───────────────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'xh-wrap';
  const svg = el('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'x402 payment handshake sequence diagram');
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  /* ── Actor boxes ─────────────────────────────────────────────────────────────── */
  const ACTORS = [
    { label: 'AI AGENT',        sub: 'x402 client'         },
    { label: 'RESOURCE SERVER', sub: '+ facilitator'       },
    { label: 'BASE L2',         sub: 'USDC / EIP-3009'     },
  ];

  ACTORS.forEach((a, i) => {
    const cx = ACX[i];
    const bx = cx - ACW / 2;
    svg.appendChild(el('rect', {
      x: bx, y: ACTOR_Y, width: ACW, height: ACH, rx: 8,
      fill: C.actor,
      stroke: C.actorStroke,
      'stroke-width': 1,
    }));
    svg.appendChild(el('text', {
      x: cx, y: ACTOR_Y + ACH / 2 - 6,
      class: 'xh-actor-label',
    }, a.label));
    svg.appendChild(el('text', {
      x: cx, y: ACTOR_Y + ACH / 2 + 8,
      class: 'xh-actor-sub',
    }, a.sub));
  });

  /* ── Lifelines ───────────────────────────────────────────────────────────────── */
  ACTORS.forEach((_, i) => {
    const lx = ACX[i];
    svg.appendChild(el('line', {
      x1: lx, y1: LIFE_Y_TOP, x2: lx, y2: LIFE_Y_BOT,
      stroke: C.lifeline,
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
    }));
  });

  /* ── Step rows (clickable) ───────────────────────────────────────────────────── */
  const STEP_H = 46;   // height of each step hit zone
  const ARROW_HALF_Y = 12;
  const BADGE_PAD_X = 6;

  // Dynamic groups for highlight state
  const hitRects: SVGRectElement[] = [];
  const stepGroups: SVGGElement[] = [];

  STEPS.forEach((step, si) => {
    const sy = STEP_Y[si];
    const g = el('g', { class: 'xh-step-row' });
    svg.appendChild(g);
    stepGroups.push(g);

    // Transparent hit zone for the whole row
    const hit = el('rect', {
      class: 'xh-hit',
      x: 0, y: sy - STEP_H / 2,
      width: VW, height: STEP_H,
      fill: 'transparent', rx: 0,
    });
    g.appendChild(hit);
    hitRects.push(hit);

    const fromX = ACX[step.fromActor];
    const toX = ACX[step.toActor];

    if (step.fromActor === step.toActor) {
      // LOCAL step: small rounded box on the actor lifeline
      const boxW = 200;
      const boxH = 26;
      g.appendChild(el('rect', {
        class: 'xh-local-box',
        x: fromX - boxW / 2, y: sy - boxH / 2,
        width: boxW, height: boxH, rx: 6,
        stroke: step.color,
      }));
      g.appendChild(el('text', {
        class: 'xh-local-lbl',
        x: fromX, y: sy,
        fill: step.color,
      }, step.label));
    } else {
      // Arrow between two actors
      const dir = fromX < toX ? 1 : -1;

      // Horizontal arrow line
      const lineX1 = fromX + dir * 6;
      const lineX2 = toX - dir * (C.arrowHead * 2 + 4);
      g.appendChild(el('line', {
        class: 'xh-arrow-line',
        x1: lineX1, y1: sy, x2: lineX2, y2: sy,
        stroke: step.color,
      }));

      // Arrowhead
      const ahX = toX - dir * 4;
      g.appendChild(el('polygon', {
        class: 'xh-arrow-head',
        points: dir > 0
          ? `${ahX - C.arrowHead * 2},${sy - C.arrowHead} ${ahX},${sy} ${ahX - C.arrowHead * 2},${sy + C.arrowHead}`
          : `${ahX + C.arrowHead * 2},${sy - C.arrowHead} ${ahX},${sy} ${ahX + C.arrowHead * 2},${sy + C.arrowHead}`,
        fill: step.color,
      }));

      // Label above the arrow
      const labelX = (fromX + toX) / 2;
      g.appendChild(el('text', {
        class: 'xh-step-label',
        x: labelX, y: sy - ARROW_HALF_Y,
        'text-anchor': 'middle',
        fill: step.color,
      }, step.label));

      // Badge to the right of the label
      const badgeText = step.badge;
      const badgeW = badgeText.length * 6 + BADGE_PAD_X * 2;
      const badgeX = labelX + 5 + (Math.abs(toX - fromX) / 2) - badgeW - 8;
      g.appendChild(el('rect', {
        x: badgeX, y: sy - ARROW_HALF_Y - 11,
        width: badgeW, height: 13, rx: 3,
        fill: step.color,
        opacity: '0.12',
      }));
      g.appendChild(el('text', {
        class: 'xh-badge',
        x: badgeX + BADGE_PAD_X, y: sy - ARROW_HALF_Y - 2,
        fill: step.color,
        'dominant-baseline': 'auto',
      }, badgeText));
    }

    // Step number on the left
    g.appendChild(el('circle', {
      cx: 18, cy: sy, r: 10,
      fill: 'rgba(13,19,34,0.9)',
      stroke: step.color,
      'stroke-width': 1.2,
      opacity: '0.5',
    }));
    g.appendChild(el('text', {
      class: 'xh-step-num',
      x: 18, y: sy,
      fill: step.color,
      opacity: '0.7',
    }, String(step.id)));
  });

  /* ── Panel ───────────────────────────────────────────────────────────────────── */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'xh-panel';
  panel.appendChild(panelDiv);

  function renderPanel(step: Step | null): void {
    panelDiv.replaceChildren();
    if (!step) {
      const hint = document.createElement('div');
      hint.className = 'xh-pline';
      hint.style.color = '#3d4460';
      hint.textContent = 'tap a step to inspect headers';
      panelDiv.appendChild(hint);
      return;
    }

    const head = document.createElement('div');
    head.className = 'xh-phead';
    head.style.color = step.color;
    head.textContent = step.detail.title;
    panelDiv.appendChild(head);

    for (const line of step.detail.lines) {
      const p = document.createElement('div');
      p.className = 'xh-pline';
      p.textContent = line;
      panelDiv.appendChild(p);
    }

    if (step.detail.code) {
      const hr = document.createElement('hr');
      hr.className = 'xh-hr';
      panelDiv.appendChild(hr);

      const code = document.createElement('div');
      code.className = 'xh-code';
      code.style.borderColor = `${step.color}22`;
      code.textContent = step.detail.code;
      panelDiv.appendChild(code);
    }
  }

  /* ── Controls ────────────────────────────────────────────────────────────────── */
  const btnsDiv = document.createElement('div');
  btnsDiv.className = 'xh-btns';

  // Step buttons
  const stepBtns: HTMLButtonElement[] = [];
  STEPS.forEach((step) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'xh-sbtn';
    btn.style.borderColor = `${step.color}40`;
    btn.textContent = `${step.id}`;
    stepBtns.push(btn);
    btnsDiv.appendChild(btn);
  });

  // Nav buttons
  const navDiv = document.createElement('div');
  navDiv.className = 'xh-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'xh-navbtn';
  prevBtn.textContent = '←';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'xh-navbtn';
  nextBtn.textContent = '→';
  navDiv.append(prevBtn, nextBtn);
  btnsDiv.appendChild(navDiv);
  ctls.appendChild(btnsDiv);

  /* ── Caption ─────────────────────────────────────────────────────────────────── */
  const capEl = document.createElement('div');
  capEl.className = 'xh-cap';
  capEl.textContent = 'x402 spec: github.com/coinbase/x402 · EIP-3009 · 165M txns on Base + Solana as of Mar 2026';
  caption.appendChild(capEl);

  /* ── State ───────────────────────────────────────────────────────────────────── */
  let selected: number | null = null;  // step index (0-based) or null

  function dimStep(si: number, faded: boolean): void {
    const opacity = faded ? '0.25' : '1';
    stepGroups[si]!.setAttribute('opacity', opacity);
  }

  function updateHighlight(): void {
    STEPS.forEach((_, i) => dimStep(i, selected !== null && i !== selected));

    stepBtns.forEach((btn, i) => {
      btn.classList.toggle('xh-sel', i === selected);
      btn.style.color = (i === selected) ? STEPS[i]!.color : '';
      btn.style.borderColor = (i === selected)
        ? STEPS[i]!.color
        : `${STEPS[i]!.color}40`;
    });

    // Hit rect background
    hitRects.forEach((r, i) => {
      r.setAttribute('fill', (i === selected) ? 'rgba(91,140,255,0.07)' : 'transparent');
    });

    prevBtn.disabled = selected === null || selected === 0;
    nextBtn.disabled = selected === null || selected === STEPS.length - 1;

    renderPanel(selected !== null ? STEPS[selected]! : null);
  }

  function selectStep(i: number): void {
    selected = (selected === i) ? null : i;
    updateHighlight();
  }

  /* ── Events ──────────────────────────────────────────────────────────────────── */
  const stepHandlers: Array<() => void> = [];
  STEPS.forEach((_, i) => {
    const fn = (): void => selectStep(i);
    stepHandlers.push(fn);
    stepGroups[i]!.addEventListener('click', fn);
    stepBtns[i]!.addEventListener('click', fn);
  });

  const prevHandler = (): void => {
    if (selected !== null && selected > 0) selectStep(selected - 1);
    else if (selected === null) selectStep(STEPS.length - 1);
  };
  const nextHandler = (): void => {
    if (selected !== null && selected < STEPS.length - 1) selectStep(selected + 1);
    else if (selected === null) selectStep(0);
  };
  prevBtn.addEventListener('click', prevHandler);
  nextBtn.addEventListener('click', nextHandler);

  // Keyboard navigation
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextHandler();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prevHandler();
    }
  };
  wrap.setAttribute('tabindex', '0');
  wrap.addEventListener('keydown', onKey);

  // Seed step 1 on load
  selectStep(0);

  /* ── Cleanup ─────────────────────────────────────────────────────────────────── */
  return (): void => {
    STEPS.forEach((_, i) => {
      stepGroups[i]!.removeEventListener('click', stepHandlers[i]!);
      stepBtns[i]!.removeEventListener('click', stepHandlers[i]!);
    });
    prevBtn.removeEventListener('click', prevHandler);
    nextBtn.removeEventListener('click', nextHandler);
    wrap.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
