/**
 * Artifact: the-signing-round — The Signing Round
 * FROST threshold signing in four interactive stages: DKG, Commit, Sign, Aggregate.
 * Adjust t-of-n to see how the threshold changes party involvement and attack cost.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const VW = 500;
const VH = 290;

const PART_Y = 235;
const PART_R = 18;
const COORD_X = 250;
const COORD_Y = 118;
const COORD_R = 22;
const OUT_W = 148;
const OUT_H = 26;
const OUT_Y = 18;

const MONO = "'JetBrains Mono',monospace";
const SUB = ['₁','₂','₃','₄','₅','₆','₇'];

type Step = 'dkg' | 'commit' | 'sign' | 'aggregate';
const STEPS: Step[] = ['dkg', 'commit', 'sign', 'aggregate'];
const STEP_LABELS: Record<Step, string> = {
  dkg: 'DKG', commit: 'Commit', sign: 'Sign', aggregate: 'Aggregate',
};

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls: ctlsSlot, caption } = layout;

  /* ── Styles ────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .sr-stage { display:flex; align-items:center; justify-content:center; }
    .sr-stage svg { width:100%; height:100%; display:block; }
    .sr-panel {
      display:flex; flex-direction:column; gap:8px;
      font:500 11px/1.4 ${MONO}; color:#8d95ad; min-width:0;
    }
    .sr-ptitle { font:700 12px/1.3 ${MONO}; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .sr-pdesc  { font:500 9.5px/1.5 ${MONO}; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .sr-pdiv   { height:1px; background:rgba(124,140,255,.12); flex:0 0 auto; }
    .sr-prows  { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .sr-prow   { display:grid; grid-template-columns:auto 1fr; gap:8px; min-width:0; align-items:baseline; }
    .sr-prowk  { font:600 8.5px ${MONO}; color:#5b6378; white-space:nowrap; }
    .sr-prowv  { font:500 9.5px ${MONO}; color:#cdd3e3; min-width:0; overflow-wrap:anywhere; }
    .sr-ctls   { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .sr-btns   { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
    .sr-sbtn {
      border:1px solid rgba(124,140,255,.2); border-radius:7px;
      cursor:pointer; background:#0d1322; color:#8d95ad;
      font:600 9px ${MONO}; letter-spacing:.04em;
      padding:5px 9px; white-space:nowrap; transition:.18s; flex:0 0 auto;
    }
    .sr-sbtn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .sr-sbtn.sr-sel { color:#e7eaf3; border-color:rgba(124,140,255,.6); background:#13192e; }
    .sr-sliders { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .sr-srow { display:flex; align-items:center; gap:8px; min-width:0; }
    .sr-slabel { font:600 9px ${MONO}; color:#8d95ad; white-space:nowrap; min-width:6.5em; }
    .sr-sval { font:700 10px ${MONO}; color:#e7eaf3; min-width:1.6em; text-align:right; }
    .sr-slider { flex:1; accent-color:#7c8cff; min-width:0; cursor:pointer; }
  `;
  container.appendChild(style);
  stage.classList.add('sr-stage');

  /* ── SVG skeleton ──────────────────────────────────────────────────────── */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const defs = document.createElementNS(NS, 'defs');
  for (const [id, color] of [['arr-g','#4ade80'],['arr-b','#7c8cff'],['arr-d','#4d5570']] as const) {
    const m = document.createElementNS(NS, 'marker');
    m.setAttribute('id', id);
    m.setAttribute('markerWidth', '7');
    m.setAttribute('markerHeight', '7');
    m.setAttribute('refX', '7');
    m.setAttribute('refY', '3.5');
    m.setAttribute('orient', 'auto');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M0,0 L0,7 L7,3.5 z');
    p.setAttribute('fill', color);
    m.appendChild(p);
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  const g = document.createElementNS(NS, 'g');
  svg.appendChild(g);
  stage.appendChild(svg);

  /* ── State ─────────────────────────────────────────────────────────────── */
  let step: Step = 'dkg';
  let nVal = 3;
  let tVal = 2;

  /* ── SVG helpers ───────────────────────────────────────────────────────── */
  function partX(i: number): number {
    return 50 + (nVal === 1 ? 200 : (i / (nVal - 1)) * 400);
  }

  function se<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
    return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  }

  function sa(el: SVGElement, a: Record<string, string>): void {
    for (const [k, v] of Object.entries(a)) el.setAttribute(k, v);
  }

  function mText(x: number, y: number, content: string, a: Record<string, string>): SVGTextElement {
    const t = se('text');
    sa(t, { x: String(x), y: String(y), ...a });
    t.textContent = content;
    return t;
  }

  function mLine(x1: number, y1: number, x2: number, y2: number, a: Record<string, string>): SVGLineElement {
    const l = se('line');
    sa(l, { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), ...a });
    return l;
  }

  function mCircle(cx: number, cy: number, r: number, a: Record<string, string>): SVGCircleElement {
    const c = se('circle');
    sa(c, { cx: String(cx), cy: String(cy), r: String(r), ...a });
    return c;
  }

  function mRect(x: number, y: number, w: number, h: number, a: Record<string, string>): SVGRectElement {
    const r = se('rect');
    sa(r, { x: String(x), y: String(y), width: String(w), height: String(h), ...a });
    return r;
  }

  // Arrow from (x1,y1) to (x2,y2); (x2,y2) should already be the edge of the target
  function mArrow(x1: number, y1: number, x2: number, y2: number, markerId: string, color: string, dash?: string): SVGLineElement {
    return mLine(x1, y1, x2, y2, {
      stroke: color, 'stroke-width': '1.5', 'stroke-linecap': 'round',
      'marker-end': `url(#${markerId})`,
      ...(dash ? { 'stroke-dasharray': dash } : {}),
    });
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  function render(): void {
    while (g.firstChild) g.removeChild(g.firstChild);

    const xs = Array.from({ length: nVal }, (_, i) => partX(i));

    /* DKG ─────────────────────────────────────────────────────────────────── */
    if (step === 'dkg') {
      // All-pairs dashed arcs represent pairwise share exchange
      for (let i = 0; i < nVal; i++) {
        for (let j = i + 1; j < nVal; j++) {
          const xi = xs[i], xj = xs[j];
          const cpY = PART_Y - (xj - xi) * 0.48 - 8;
          const path = se('path');
          sa(path, {
            d: `M${xi},${PART_Y - PART_R} Q${(xi + xj) / 2},${cpY} ${xj},${PART_Y - PART_R}`,
            fill: 'none', stroke: 'rgba(124,140,255,.3)',
            'stroke-width': '1', 'stroke-dasharray': '4,3',
          });
          g.appendChild(path);
        }
      }

      // "sk never assembled" badge where coordinator would be
      const bw = 164, bh = 22, bx = COORD_X - bw / 2, by = 54;
      g.appendChild(mRect(bx, by, bw, bh, {
        rx: '5', fill: 'rgba(248,113,113,.1)',
        stroke: 'rgba(248,113,113,.35)', 'stroke-width': '1',
      }));
      g.appendChild(mText(COORD_X, by + bh / 2 + 1, '✕  sk never assembled', {
        fill: '#f87171', 'font-size': '9', 'font-family': MONO, 'font-weight': '600',
        'text-anchor': 'middle', 'dominant-baseline': 'middle', 'letter-spacing': '.04em',
      }));

      // Participants — all active for DKG
      for (let i = 0; i < nVal; i++) {
        g.appendChild(mCircle(xs[i], PART_Y, PART_R, {
          fill: 'rgba(124,140,255,.1)', stroke: 'rgba(124,140,255,.5)', 'stroke-width': '1.5',
        }));
        g.appendChild(mText(xs[i], PART_Y + 1, `P${SUB[i]}`, {
          fill: '#8d95ad', 'font-size': '9', 'font-family': MONO, 'font-weight': '700',
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
        }));
      }

    /* Commit / Sign ────────────────────────────────────────────────────────── */
    } else if (step === 'commit' || step === 'sign') {
      const isCommit = step === 'commit';
      const color   = isCommit ? '#7c8cff' : '#4ade80';
      const markId  = isCommit ? 'arr-b' : 'arr-g';
      const dash    = isCommit ? '5,3' : undefined;
      const label   = isCommit ? 'Dᵢ,Eᵢ' : 'zᵢ';
      const aFill   = isCommit ? 'rgba(124,140,255,.15)' : 'rgba(74,222,128,.12)';
      const aStroke = isCommit ? 'rgba(124,140,255,.7)' : 'rgba(74,222,128,.7)';
      const aText   = isCommit ? '#a5b4fc' : '#86efac';

      // Coordinator
      g.appendChild(mCircle(COORD_X, COORD_Y, COORD_R, {
        fill: 'rgba(251,191,36,.1)', stroke: 'rgba(251,191,36,.55)', 'stroke-width': '1.5',
      }));
      g.appendChild(mText(COORD_X, COORD_Y + 1, 'coord', {
        fill: '#fbbf24', 'font-size': '8', 'font-family': MONO, 'font-weight': '700',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }));

      // Participants
      for (let i = 0; i < nVal; i++) {
        const cx = xs[i];
        const active = i < tVal;
        g.appendChild(mCircle(cx, PART_Y, PART_R, {
          fill: active ? aFill : 'rgba(93,102,130,.06)',
          stroke: active ? aStroke : 'rgba(93,102,130,.22)',
          'stroke-width': active ? '1.5' : '1',
        }));
        g.appendChild(mText(cx, PART_Y + 1, `P${SUB[i]}`, {
          fill: active ? aText : '#3d4459',
          'font-size': '9', 'font-family': MONO, 'font-weight': '700',
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
        }));

        if (active) {
          // Arrow from participant top toward coordinator edge
          const sx = cx, sy = PART_Y - PART_R;
          const dx = COORD_X - sx, dy = COORD_Y - sy;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ex = COORD_X - (COORD_R + 6) * dx / len;
          const ey = COORD_Y - (COORD_R + 6) * dy / len;
          g.appendChild(mArrow(sx, sy, ex, ey, markId, color, dash));

          // Label at arrow midpoint, offset to outside
          const mx = (sx + ex) / 2, my = (sy + ey) / 2;
          const anchor = cx <= COORD_X - 4 ? 'end' : 'start';
          const ox = cx <= COORD_X - 4 ? -7 : 7;
          g.appendChild(mText(mx + ox, my, label, {
            fill: color, 'font-size': '8', 'font-family': MONO, 'font-weight': '600',
            'text-anchor': anchor, 'dominant-baseline': 'middle', opacity: '0.9',
          }));
        }
      }

    /* Aggregate ────────────────────────────────────────────────────────────── */
    } else {
      // Output box
      const bx = COORD_X - OUT_W / 2;
      g.appendChild(mRect(bx, OUT_Y, OUT_W, OUT_H, {
        rx: '6', fill: 'rgba(74,222,128,.1)',
        stroke: 'rgba(74,222,128,.55)', 'stroke-width': '1.5',
      }));
      g.appendChild(mText(COORD_X, OUT_Y + OUT_H / 2 + 1, '(R, z) — Schnorr signature', {
        fill: '#86efac', 'font-size': '8.5', 'font-family': MONO, 'font-weight': '700',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }));

      // Arrow coordinator → output box
      const arrS = COORD_Y - COORD_R;
      const arrE = OUT_Y + OUT_H + 2;
      g.appendChild(mLine(COORD_X, arrS, COORD_X, arrE, {
        stroke: '#4ade80', 'stroke-width': '2', 'stroke-linecap': 'round',
        'marker-end': 'url(#arr-g)',
      }));
      g.appendChild(mText(COORD_X + 7, (arrS + arrE) / 2, 'z = Σzᵢ', {
        fill: '#4ade80', 'font-size': '8', 'font-family': MONO, 'font-weight': '600',
        'text-anchor': 'start', 'dominant-baseline': 'middle',
      }));

      // Coordinator (green — active in aggregate)
      g.appendChild(mCircle(COORD_X, COORD_Y, COORD_R, {
        fill: 'rgba(74,222,128,.15)', stroke: 'rgba(74,222,128,.7)', 'stroke-width': '2',
      }));
      g.appendChild(mText(COORD_X, COORD_Y + 1, 'coord', {
        fill: '#86efac', 'font-size': '8', 'font-family': MONO, 'font-weight': '700',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }));

      // Dim participants
      for (let i = 0; i < nVal; i++) {
        g.appendChild(mCircle(xs[i], PART_Y, PART_R, {
          fill: 'rgba(93,102,130,.04)', stroke: 'rgba(93,102,130,.15)', 'stroke-width': '1',
        }));
        g.appendChild(mText(xs[i], PART_Y + 1, `P${SUB[i]}`, {
          fill: '#2e3347', 'font-size': '9', 'font-family': MONO, 'font-weight': '700',
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
        }));
      }
    }

    // Security note
    g.appendChild(mText(VW / 2, VH - 10,
      `Attacker needs ${tVal} simultaneous compromises to forge a signature`, {
        fill: '#3d4459', 'font-size': '8', 'font-family': MONO, 'font-weight': '500',
        'text-anchor': 'middle',
      }));
  }

  /* ── Panel ─────────────────────────────────────────────────────────────── */
  panel.className = 'sr-panel';

  function renderPanel(): void {
    panel.innerHTML = '';

    const titles: Record<Step, string> = {
      dkg: 'DKG — Distributed Key Generation',
      commit: 'Round 1 — Commit',
      sign: 'Round 2 — Sign',
      aggregate: 'Aggregate — Output',
    };
    const descs: Record<Step, string> = {
      dkg: `Each party generates polynomial fᵢ(x) of degree t−1 and sends share fᵢ(j) to every other party j. Group public key PK = Σaᵢ₀·G is public; sk = Σaᵢ₀ is never assembled anywhere.`,
      commit: `The ${tVal} signing parties each generate nonce pair (dᵢ, eᵢ) and publish commitments (Dᵢ, Eᵢ) = (dᵢ·G, eᵢ·G). Publishing before seeing others' nonces blocks Wagner's birthday attack on the binding factor.`,
      sign: `Each of the ${tVal} parties computes partial sig zᵢ = dᵢ + eᵢρᵢ + λᵢ·sᵢ·c. No individual zᵢ is a valid signature, and none reveals share sᵢ without the other t−1 partial responses.`,
      aggregate: `Coordinator computes z = Σzᵢ and R = Σ(Dᵢ + ρᵢ·Eᵢ). Output (R, z) is a standard 64-byte Schnorr signature — on-chain, indistinguishable from a single-signer key.`,
    };
    const rows: Record<Step, [string, string][]> = {
      dkg: [
        ['Round',          'Setup (one-time)'],
        ['Parties active', `All ${nVal}`],
        ['Attacker needs', '— (no signing yet)'],
        ['Output',         `${nVal} shares (1 per party)`],
      ],
      commit: [
        ['Round',          '1 of 2'],
        ['Parties active', `${tVal} of ${nVal}`],
        ['Attacker needs', `${tVal} simultaneous shares`],
        ['Output',         `${tVal} commitment pairs`],
      ],
      sign: [
        ['Round',          '2 of 2'],
        ['Parties active', `${tVal} of ${nVal}`],
        ['Attacker needs', `${tVal} simultaneous shares`],
        ['Output',         `${tVal} partial signatures`],
      ],
      aggregate: [
        ['Round',          'Off-chain'],
        ['Parties active', 'Coordinator only'],
        ['Attacker needs', `${tVal} shares in same window`],
        ['Output',         '1 Schnorr signature'],
      ],
    };

    const title = document.createElement('div');
    title.className = 'sr-ptitle';
    title.textContent = titles[step];
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'sr-pdesc';
    desc.textContent = descs[step];
    panel.appendChild(desc);

    const divider = document.createElement('div');
    divider.className = 'sr-pdiv';
    panel.appendChild(divider);

    const rowsEl = document.createElement('div');
    rowsEl.className = 'sr-prows';
    for (const [k, v] of rows[step]) {
      const row = document.createElement('div');
      row.className = 'sr-prow';
      const key = document.createElement('span');
      key.className = 'sr-prowk';
      key.textContent = k;
      const val = document.createElement('span');
      val.className = 'sr-prowv';
      val.textContent = v;
      row.append(key, val);
      rowsEl.appendChild(row);
    }
    panel.appendChild(rowsEl);
  }

  /* ── Controls ──────────────────────────────────────────────────────────── */
  const ctlsEl = document.createElement('div');
  ctlsEl.className = 'sr-ctls';

  const btnsEl = document.createElement('div');
  btnsEl.className = 'sr-btns';

  const stepBtns = new Map<Step, HTMLButtonElement>();
  const cleanups: Array<() => void> = [];

  for (const s of STEPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sr-sbtn' + (s === step ? ' sr-sel' : '');
    btn.textContent = STEP_LABELS[s];
    btnsEl.appendChild(btn);
    stepBtns.set(s, btn);

    const h = (): void => {
      step = s;
      for (const [sid, b] of stepBtns) b.classList.toggle('sr-sel', sid === s);
      render();
      renderPanel();
    };
    btn.addEventListener('click', h);
    cleanups.push(() => btn.removeEventListener('click', h));
  }
  ctlsEl.appendChild(btnsEl);

  // Sliders
  const slidersEl = document.createElement('div');
  slidersEl.className = 'sr-sliders';

  function mkSlider(label: string, min: number, max: number, value: number): [HTMLInputElement, HTMLSpanElement] {
    const row = document.createElement('div');
    row.className = 'sr-srow';
    const lbl = document.createElement('span');
    lbl.className = 'sr-slabel';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.className = 'sr-slider';
    inp.min = String(min);
    inp.max = String(max);
    inp.value = String(value);
    const valEl = document.createElement('span');
    valEl.className = 'sr-sval';
    valEl.textContent = String(value);
    row.append(lbl, inp, valEl);
    slidersEl.appendChild(row);
    return [inp, valEl];
  }

  const [nSlider, nDisplay] = mkSlider('n  total', 3, 7, nVal);
  const [tSlider, tDisplay] = mkSlider('t  threshold', 2, nVal, tVal);

  const nH = (): void => {
    nVal = parseInt(nSlider.value);
    nDisplay.textContent = String(nVal);
    if (tVal > nVal) {
      tVal = nVal;
      tSlider.value = String(tVal);
      tDisplay.textContent = String(tVal);
    }
    tSlider.max = String(nVal);
    render();
    renderPanel();
  };
  nSlider.addEventListener('input', nH);
  cleanups.push(() => nSlider.removeEventListener('input', nH));

  const tH = (): void => {
    tVal = parseInt(tSlider.value);
    tDisplay.textContent = String(tVal);
    render();
    renderPanel();
  };
  tSlider.addEventListener('input', tH);
  cleanups.push(() => tSlider.removeEventListener('input', tH));

  ctlsEl.appendChild(slidersEl);
  ctlsSlot.appendChild(ctlsEl);

  // Caption
  const capEl = document.createElement('div');
  capEl.style.cssText = `font:500 9px/1.5 ${MONO};color:#5b6378;min-width:0;overflow-wrap:anywhere;`;
  capEl.textContent = 'FROST protocol — RFC 9591 (IETF, June 2024) · select a step · adjust t-of-n';
  caption.appendChild(capEl);

  // Initial render
  render();
  renderPanel();

  /* ── Cleanup ───────────────────────────────────────────────────────────── */
  return () => {
    for (const c of cleanups) c();
    layout.dispose();
    style.remove();
  };
}
