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

interface PhaseData {
  label: string;
  sub: string;
  actor: string;
  slot: string;
  what: string;
  honestNote: string;
  censorNote: string;
}

const PHASES: PhaseData[] = [
  {
    label: 'IL Broadcast',
    sub: 't=0–9s',
    actor: '16 Validators',
    slot: 'N',
    what: '16 randomly-selected validators each build an inclusion list (≤8 KiB) from their local mempool view and gossip it to peers. The 16 ILs overlap but aren\'t identical — independent mempool observations.',
    honestNote: 'Your transaction appears in ≥1 IL. One honest member is all that\'s needed.',
    censorNote: 'Even with 15 of 16 members bribed, one honest member forces inclusion. The 1-out-of-16 threshold.',
  },
  {
    label: 'View Freeze',
    sub: 't=9s',
    actor: 'All Validators',
    slot: 'N',
    what: 'The IL window closes. No ILs submitted after t=9s count for this slot. Validators hold a locked view of all valid ILs, fixing the inclusion obligations the builder must honor.',
    honestNote: 'IL set locked. Builder\'s obligation is now fixed.',
    censorNote: 'IL set locked. Your transaction is in the commitment — builder cannot change this after the freeze.',
  },
  {
    label: 'Builder Assembly',
    sub: 't=9–11s',
    actor: 'Block Builder',
    slot: 'N',
    what: 'Builder assembles the block. FOCIL validity rules require every IL transaction to be included — unless it\'s already in the block, the block is gas-full, or the transaction fails nonce/balance validation.',
    honestNote: 'Builder includes all IL transactions. Block satisfies IL conditions.',
    censorNote: '⚠ Builder drops your IL transaction. The block now violates FOCIL validity rules — attesters will reject it and the slot revenue is forfeit.',
  },
  {
    label: 'Attestation',
    sub: 't+4s, Slot N+1',
    actor: 'Attesters',
    slot: 'N+1',
    what: 'Attesters verify the block satisfies IL conditions. Missing a valid IL transaction causes them to withhold votes. Without sufficient attestations, the block cannot be canonical.',
    honestNote: '✓  Block passes IL check. Attesters sign. Transaction confirmed.',
    censorNote: '✗  Attesters detect the missing IL transaction. Block fails. Slot wasted — censoring costs the builder more than inclusion.',
  },
];

const VW = 640;
const VH = 200;
const BOX_W = 108;
const BOX_H = 80;
const ARROW_W = 24;
const TOTAL_W = PHASES.length * BOX_W + (PHASES.length - 1) * ARROW_W;
const START_X = Math.floor((VW - TOTAL_W) / 2);
const START_Y = Math.floor((VH - BOX_H) / 2) + 12;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, controls, caption } = layout;

  let selectedIdx = 0;
  let censoring = false;

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .fs-wrap { position:absolute; inset:0; overflow:hidden; }
    .fs-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .fs-bg { fill:#0d1322; }

    .fs-slot-lbl { font:600 8.5px 'JetBrains Mono',monospace; fill:#3d4a6e; text-anchor:middle; letter-spacing:.07em; text-transform:uppercase; }
    .fs-slot-rule { stroke:rgba(61,74,110,.35); stroke-width:1; stroke-dasharray:3 3; }

    .fs-box { fill:rgba(91,140,255,.07); stroke:rgba(91,140,255,.22); stroke-width:1.2; }
    .fs-box.active  { fill:rgba(139,92,246,.17); stroke:rgba(139,92,246,.60); stroke-width:1.5; }
    .fs-box.censor  { fill:rgba(245,68,68,.10);  stroke:rgba(245,68,68,.48);  stroke-width:1.5; }
    .fs-box.censor-warn { fill:rgba(245,165,36,.10); stroke:rgba(245,165,36,.50); stroke-width:1.5; }

    .fs-lbl { font:700 10.5px 'JetBrains Mono',monospace; fill:#c4cbde; text-anchor:middle; }
    .fs-lbl.active { fill:#e7eaf3; }
    .fs-sub { font:500 8px 'JetBrains Mono',monospace; fill:#5b6378; text-anchor:middle; }
    .fs-sub.active { fill:#8d95ad; }
    .fs-act { font:600 8.5px 'JetBrains Mono',monospace; fill:#5b8cff; text-anchor:middle; }
    .fs-act.active { fill:#a78bfa; }
    .fs-act.censor-actor { fill:#f87171; }
    .fs-slot-tag { font:600 7.5px 'JetBrains Mono',monospace; fill:#3d4a6e; text-anchor:middle; }

    .fs-arrow { stroke:rgba(91,140,255,.28); stroke-width:1; }
    .fs-arrowhead { fill:rgba(91,140,255,.35); }
    .fs-arrow-censor { stroke:rgba(245,68,68,.35); }
    .fs-arrowhead-censor { fill:rgba(245,68,68,.42); }
    .fs-slot-divider { stroke:rgba(34,211,238,.20); stroke-width:1.5; stroke-dasharray:4 3; }

    .fs-panel { display:flex; flex-direction:column; gap:8px; min-width:0;
      font:500 11px 'JetBrains Mono',monospace; color:#8d95ad; }
    .fs-ph { font:700 12.5px 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .fs-badges { display:flex; gap:5px; flex-wrap:wrap; }
    .fs-badge { display:inline-block; font:600 8.5px 'JetBrains Mono',monospace;
      padding:2px 7px; border-radius:5px;
      border:1px solid rgba(91,140,255,.38); background:rgba(91,140,255,.10);
      color:#8eb3ff; white-space:nowrap; }
    .fs-badge-slot { border-color:rgba(34,211,238,.30); background:rgba(34,211,238,.08); color:#67e8f9; }
    .fs-rule { height:1px; background:rgba(124,140,255,.10); }
    .fs-what { font-size:10.5px; line-height:1.55; color:#c4cbde; overflow-wrap:anywhere; min-width:0; }
    .fs-outcome { padding:6px 9px; border-radius:7px; font-size:10px; line-height:1.5; overflow-wrap:anywhere; min-width:0; }
    .fs-outcome-ok  { border:1px solid rgba(52,211,153,.28); background:rgba(52,211,153,.07); color:#6ee7b7; }
    .fs-outcome-bad { border:1px solid rgba(245,68,68,.30); background:rgba(245,68,68,.07); color:#fca5a5; }
    .fs-outcome-warn { border:1px solid rgba(245,165,36,.32); background:rgba(245,165,36,.08); color:#fcd34d; }
    .fs-outcome-lbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase; display:block; margin-bottom:3px; }
    .fs-ok-lbl  { color:#059669; }
    .fs-bad-lbl { color:#dc2626; }
    .fs-warn-lbl { color:#b45309; }
    .fs-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378; overflow-wrap:anywhere; min-width:0; }
    .fs-cap b { color:#8d95ad; font-weight:600; }
    .fs-ctrl { display:flex; gap:8px; flex-wrap:wrap; }
    .fs-btn { font:600 9.5px 'JetBrains Mono',monospace; padding:5px 11px; border-radius:6px; cursor:pointer;
      border:1px solid rgba(91,140,255,.40); background:rgba(91,140,255,.10); color:#8eb3ff;
      white-space:nowrap; transition:background .15s,border-color .15s,color .15s; }
    .fs-btn.on { border-color:rgba(245,68,68,.55); background:rgba(245,68,68,.13); color:#f87171; }
    .fs-btn:hover { opacity:.82; }
  `;
  stage.appendChild(style);

  /* ── SVG stage ── */
  const wrap = document.createElement('div');
  wrap.className = 'fs-wrap';
  stage.appendChild(wrap);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    role: 'img',
    'aria-label': 'FOCIL slot timeline — four phases from IL broadcast to attestation',
  });
  wrap.appendChild(svg);

  svg.appendChild(svgEl('rect', { width: String(VW), height: String(VH), class: 'fs-bg' }));

  /* Slot label banners */
  const slotLabelY = START_Y - 18;
  const slotNEnd = START_X + 2 * BOX_W + 2 * ARROW_W + ARROW_W / 2;  // between boxes 2 and 3
  const slotN1Start = slotNEnd + 2;

  const slotNLabelX = START_X + (slotNEnd - START_X) / 2;
  svg.appendChild(Object.assign(svgEl('text', {
    x: String(slotNLabelX), y: String(slotLabelY),
    class: 'fs-slot-lbl',
  }), { textContent: '← Slot N →' }));

  const slotN1LabelX = slotN1Start + (START_X + TOTAL_W - slotN1Start) / 2;
  svg.appendChild(Object.assign(svgEl('text', {
    x: String(slotN1LabelX), y: String(slotLabelY),
    class: 'fs-slot-lbl',
  }), { textContent: '← Slot N+1 →' }));

  /* Slot divider (between phase 2 and 3) */
  const dividerX = START_X + 2 * (BOX_W + ARROW_W) + ARROW_W / 2 + BOX_W / 2 - ARROW_W / 2;
  const sdivider = svgEl('line', {
    x1: String(dividerX), y1: String(START_Y - 10),
    x2: String(dividerX), y2: String(START_Y + BOX_H + 10),
    class: 'fs-slot-divider',
  });
  svg.appendChild(sdivider);

  /* Phase boxes */
  const boxEls: SVGRectElement[] = [];
  const labelEls: SVGTextElement[] = [];
  const subEls: SVGTextElement[] = [];
  const actEls: SVGTextElement[] = [];

  PHASES.forEach((p, i) => {
    const bx = START_X + i * (BOX_W + ARROW_W);
    const by = START_Y;
    const cx = bx + BOX_W / 2;

    /* Arrow */
    if (i > 0) {
      const ax = bx - ARROW_W;
      const my = by + BOX_H / 2;
      const arrowLine = svgEl('line', {
        x1: String(ax), y1: String(my),
        x2: String(bx - 5), y2: String(my),
        class: 'fs-arrow',
      });
      const arrowHead = svgEl('polygon', {
        points: `${bx - 5},${my - 3.5} ${bx + 1},${my} ${bx - 5},${my + 3.5}`,
        class: 'fs-arrowhead',
      });
      svg.appendChild(arrowLine);
      svg.appendChild(arrowHead);
    }

    const g = svgEl('g');
    (g as SVGGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', `Phase: ${p.label}`);

    const rect = svgEl('rect', {
      x: String(bx), y: String(by),
      width: String(BOX_W), height: String(BOX_H),
      rx: '7', class: 'fs-box',
    });

    const lblEl = svgEl('text', { x: String(cx), y: String(by + 28), class: 'fs-lbl' });
    lblEl.textContent = p.label;

    const subEl = svgEl('text', { x: String(cx), y: String(by + 42), class: 'fs-sub' });
    subEl.textContent = p.sub;

    const actEl = svgEl('text', { x: String(cx), y: String(by + 58), class: 'fs-act' });
    actEl.textContent = p.actor;

    const slotTag = svgEl('text', { x: String(cx), y: String(by + 71), class: 'fs-slot-tag' });
    slotTag.textContent = `slot ${p.slot}`;

    g.appendChild(rect);
    g.appendChild(lblEl);
    g.appendChild(subEl);
    g.appendChild(actEl);
    g.appendChild(slotTag);
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
    const p = PHASES[idx];
    panel.innerHTML = '';

    const wrap2 = document.createElement('div');
    wrap2.className = 'fs-panel';

    const ph = document.createElement('div');
    ph.className = 'fs-ph';
    ph.textContent = p.label;
    wrap2.appendChild(ph);

    const badges = document.createElement('div');
    badges.className = 'fs-badges';
    const b1 = document.createElement('span'); b1.className = 'fs-badge'; b1.textContent = p.actor;
    const b2 = document.createElement('span'); b2.className = 'fs-badge fs-badge-slot'; b2.textContent = `Slot ${p.slot}`;
    badges.appendChild(b1); badges.appendChild(b2);
    wrap2.appendChild(badges);

    const rule = document.createElement('div'); rule.className = 'fs-rule';
    wrap2.appendChild(rule);

    const what = document.createElement('div'); what.className = 'fs-what'; what.textContent = p.what;
    wrap2.appendChild(what);

    /* Outcome box */
    const isBuilderPhase = idx === 2;
    const isAttestPhase = idx === 3;
    const showWarn = censoring && isBuilderPhase;
    const showBad = censoring && isAttestPhase;
    const noteText = censoring ? p.censorNote : p.honestNote;

    const outcome = document.createElement('div');
    outcome.className = `fs-outcome ${showWarn ? 'fs-outcome-warn' : showBad ? 'fs-outcome-bad' : 'fs-outcome-ok'}`;
    const outLbl = document.createElement('span');
    outLbl.className = `fs-outcome-lbl ${showWarn ? 'fs-warn-lbl' : showBad ? 'fs-bad-lbl' : 'fs-ok-lbl'}`;
    outLbl.textContent = showBad ? 'Censoring outcome' : showWarn ? 'Censoring attempt' : 'Honest outcome';
    outcome.appendChild(outLbl);
    outcome.appendChild(document.createTextNode(noteText));
    wrap2.appendChild(outcome);

    panel.appendChild(wrap2);
  }

  /* ── Selection + censoring visual update ── */
  function updateVisuals() {
    PHASES.forEach((_, i) => {
      const active = i === selectedIdx;
      const isBuildPhase = i === 2;
      const isAttestPhase = i === 3;

      boxEls[i].className.baseVal = 'fs-box' +
        (active ? ' active' : '') +
        (censoring && isBuildPhase ? ' censor-warn' : '') +
        (censoring && isAttestPhase ? ' censor' : '');

      labelEls[i].classList.toggle('active', active);
      subEls[i].classList.toggle('active', active);
      actEls[i].classList.toggle('active', active);
      actEls[i].classList.toggle('censor-actor', censoring && isAttestPhase);
    });
  }

  function select(idx: number) {
    selectedIdx = idx;
    updateVisuals();
    renderPanel(idx);
  }

  /* ── Controls ── */
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'fs-ctrl';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'fs-btn';
  toggleBtn.textContent = 'censoring builder: off';
  toggleBtn.addEventListener('click', () => {
    censoring = !censoring;
    toggleBtn.classList.toggle('on', censoring);
    toggleBtn.textContent = censoring ? 'censoring builder: on' : 'censoring builder: off';
    updateVisuals();
    renderPanel(selectedIdx);
  });
  ctrlWrap.appendChild(toggleBtn);
  controls.appendChild(ctrlWrap);

  /* ── Caption ── */
  const cap = document.createElement('div');
  cap.className = 'fs-cap';
  cap.innerHTML =
    'click any phase to inspect &nbsp;·&nbsp; toggle <b>censoring builder</b> to see FOCIL\'s enforcement &nbsp;·&nbsp; <b>EIP-7805</b> · Hegota upgrade';
  caption.appendChild(cap);

  /* ── Init ── */
  select(0);

  return () => {
    layout.dispose();
    style.remove();
  };
}
