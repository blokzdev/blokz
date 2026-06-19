/**
 * Artifact: attestation-chain — The Attestation Chain
 * Manifest: content/artifacts/attestation-chain/manifest.json
 *
 * The TEE remote-attestation chain of trust for on-chain AI inference, made
 * explorable. Six links — silicon root CA, CPU TDX quote, H100 confidential
 * computing, the quote + cert chain, the on-chain DCAP verifier, and the
 * per-inference signatures — drawn as a chain you can step through. Flip the
 * mode from "honest" to "forged" (the TEE.fail DDR5 interposer) and trace the
 * chain again: an interposer extracts the attestation key, the GPU link goes
 * void, the quote is forged — and the on-chain verifier STILL returns valid.
 * The cryptography all checks out; the premise underneath it is false.
 *
 * Numbers (gas, overhead, rig cost) + the live on-chain verifier address are
 * snapshotted in ./data.json from the article's primary sources (Automata DCAP
 * benchmarks, arXiv:2409.03992, tee.fail), with the verifier confirmed live on
 * Base via Blockscout. No runtime fetches.
 *
 * Layout: shared responsive primitive (stage = the chain diagram SVG, trimmed
 * to just the link row; panel = per-step detail + honest/forged status + the
 * by-the-numbers readout + verdict, all de-baked from the SVG to HTML so they
 * stay readable on portrait phones; footer controls = honest/forged tabs +
 * "trace the chain" run button, real HTML wired to the same handlers; caption =
 * verifier address + provenance + interaction hint). Stepping still happens by
 * tapping / arrowing the diagram nodes on the SVG.
 */
import raw from '../../../content/artifacts/attestation-chain/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

interface Stage {
  id: string;
  label: string;
  sub: string;
  glyph: string;
  detail: string;
  honest: string;
  forged: string;
  state: string;
}
const data = raw as unknown as {
  stages: Stage[];
  numbers: { label: string; value: string; note: string }[];
  verifierContract: { address: string; chain: string; note: string };
  verdicts: { honest: string; forged: string };
};
const STAGES = data.stages;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

// Minimal mono glyphs drawn as paths, so the chain reads without emoji.
function glyphPath(kind: string): string {
  switch (kind) {
    case 'anchor': // root CA — a keyhole over a base
      return 'M0,-7 a3,3 0 1,1 0,6 a3,3 0 1,1 0,-6 M0,-1 L0,7 M-5,4 L5,4';
    case 'chip': // CPU die
      return 'M-5,-5 H5 V5 H-5 Z M-8,-2 H-5 M-8,2 H-5 M5,-2 H8 M5,2 H8 M-2,-8 V-5 M2,-8 V-5 M-2,5 V8 M2,5 V8';
    case 'gpu': // board
      return 'M-7,-4 H7 V4 H-7 Z M-4,-1 H4 M-4,1.5 H4 M-7,4 L-7,7 M7,4 L7,7';
    case 'doc': // quote document
      return 'M-5,-7 H3 L5,-5 V7 H-5 Z M-3,-3 H3 M-3,0 H3 M-3,3 H1';
    case 'chain': // on-chain link
      return 'M-6,-2 a3,3 0 0,1 0,4 h3 a3,3 0 0,0 0,-4 z M6,-2 a3,3 0 0,0 0,4 h-3 a3,3 0 0,1 0,-4 z';
    case 'sig': // signature wave
      return 'M-7,2 q2,-9 4,0 t4,0 t4,0 M-7,5 H7';
    default:
      return '';
  }
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    // The chain is a very wide, short single row (viewBox 800×132 ≈ 6/1), so
    // derive the stage height from its width — a short, snug stage with no dead
    // gap above the panels — rather than a tall fixed floor.
    stageAspect: '800/132',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    /* stage: the trimmed chain diagram SVG fills the slot */
    .atc-stage { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .atc-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .atc-num-badge { fill: #5b6378; font: 600 8px 'JetBrains Mono', monospace; }
    /* nodes */
    .atc-node { cursor: pointer; }
    .atc-node rect.atc-box { fill: #0d1322; stroke: rgba(124,140,255,0.28); transition: stroke .3s, fill .3s; }
    .atc-node .atc-glyph { fill: none; stroke: #8d95ad; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; transition: stroke .3s; }
    .atc-node .atc-nlabel { fill: #e7eaf3; font: 600 9.5px 'JetBrains Mono', monospace; letter-spacing: .04em; }
    .atc-node .atc-nsub { fill: #8d95ad; font: 500 8px 'JetBrains Mono', monospace; }
    .atc-node:focus-visible { outline: none; }
    .atc-node:focus-visible rect.atc-box { stroke: #22d3ee; }
    .atc-node[data-sel="true"] rect.atc-box { stroke: #22d3ee; fill: #0f1626; }
    /* state coloring (forged mode) */
    .atc-node[data-flag="ok"] rect.atc-box { stroke: rgba(124,140,255,0.45); }
    .atc-node[data-flag="hit"] rect.atc-box { stroke: #f87171; fill: #1a0f14; }
    .atc-node[data-flag="hit"] .atc-glyph { stroke: #f87171; }
    .atc-node[data-flag="void"] rect.atc-box { stroke: rgba(248,113,113,0.45); }
    .atc-node[data-flag="void"] .atc-box { opacity: .55; }
    .atc-node[data-flag="warn"] rect.atc-box { stroke: #f5c451; fill: #19150a; }
    .atc-node[data-flag="warn"] .atc-glyph { stroke: #f5c451; }
    /* link segments */
    .atc-link { stroke: rgba(124,140,255,0.30); stroke-width: 2.5; transition: stroke .3s; }
    .atc-link[data-flag="lit"] { stroke: #5b8cff; }
    .atc-link[data-flag="bad"] { stroke: #f87171; }
    .atc-pulse { fill: #22d3ee; opacity: 0; }
    /* interposer marker */
    .atc-interposer { opacity: 0; transition: opacity .3s; }
    .atc-interposer text { fill: #f87171; font: 600 8px 'JetBrains Mono', monospace; }
    .atc-interposer path { stroke: #f87171; stroke-width: 1.3; fill: none; stroke-linecap: round; }

    /* --- de-baked HTML controls (mode tabs + trace) --- */
    .atc-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap; max-width:100%; }
    .atc-tabs { display:flex; flex-wrap:wrap; gap:6px; max-width:100%; }
    .atc-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.04em; padding:8px 14px;
      cursor:pointer; max-width:100%; transition:color .2s, background .2s, border-color .2s; }
    .atc-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .atc-tabs button[aria-selected="true"] { background:rgba(91,140,255,.20);
      border-color:#5b8cff; color:#e7eaf3; }
    .atc-tabs button.atc-tab-forged[aria-selected="true"] { background:rgba(248,113,113,.16);
      border-color:#f87171; color:#fca5a5; }
    .atc-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .atc-run { appearance:none; border:1px solid rgba(124,140,255,.45);
      background:rgba(91,140,255,.10); color:#cdd3e6; border-radius:9px;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:9px 16px;
      cursor:pointer; max-width:100%; transition:background .2s, border-color .2s; }
    .atc-run:hover { background:rgba(91,140,255,.20); border-color:#5b8cff; }
    .atc-run:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .atc-run[aria-disabled="true"] { opacity:.45; cursor:default; }

    /* --- de-baked HTML panel: detail + status + numbers + verdict --- */
    .atc-panel { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      height:100%; box-sizing:border-box; overflow-wrap:anywhere; }
    .atc-d-title { color:#e7eaf3; font:600 13px 'Space Grotesk', system-ui, sans-serif;
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .atc-d-body { color:#8d95ad; font:500 11px 'JetBrains Mono', monospace; line-height:1.5;
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .atc-status { font:600 11px 'JetBrains Mono', monospace; line-height:1.45; min-height:16px;
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .atc-status-ok { color:#22d3ee; }
    .atc-status-bad { color:#f87171; }
    .atc-status-warn { color:#f5c451; }
    .atc-verdict { font:700 12px 'JetBrains Mono', monospace; line-height:1.45; min-height:16px;
      min-width:0; max-width:100%; overflow-wrap:anywhere; opacity:0; transition:opacity .35s; }
    .atc-verdict.is-on { opacity:1; }
    .atc-verdict-ok { color:#22d3ee; }
    .atc-verdict-warn { color:#f5c451; }
    .atc-nums { margin-top:auto; border-top:1px solid rgba(124,140,255,.16); padding-top:9px;
      display:flex; flex-direction:column; gap:4px; min-width:0; max-width:100%; }
    .atc-nums-eyebrow { color:#5b6378; font:600 9px 'JetBrains Mono', monospace; letter-spacing:.16em; }
    .atc-num-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px;
      min-width:0; max-width:100%; }
    .atc-num-l { color:#5b6378; font:500 9px 'JetBrains Mono', monospace; letter-spacing:.04em;
      text-transform:uppercase; min-width:0; overflow-wrap:anywhere; }
    .atc-num-v { color:#cdd3e6; font:600 11px 'JetBrains Mono', monospace; min-width:0;
      text-align:right; overflow-wrap:anywhere; }

    /* --- caption: provenance + hint --- */
    .atc-cap { display:flex; flex-direction:column; gap:3px; }
    .atc-cap-line { color:#5b6378; font:500 10px 'JetBrains Mono', monospace; }
  `;
  stage.appendChild(style);

  /* ---------------- stage: the trimmed chain diagram SVG ---------------- */
  // The chain is a single row of six nodes. The original 800×460 board reserved
  // most of its height for a baked detail panel + numbers rail + verdict + run
  // button — all de-baked to HTML below. The trimmed viewBox holds just the
  // link row (plus headroom for the interposer marker above the CPU node).
  const VB_W = 800;
  const VB_H = 132;
  const stageWrap = document.createElement('div');
  stageWrap.className = 'atc-stage';
  const svg = el('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'TEE remote-attestation chain-of-trust diagram');
  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  /* ---------------- chain of nodes ---------------- */
  const N = STAGES.length;
  const NODE_W = 104;
  const NODE_H = 70;
  const ROW_Y = 44; // headroom above for the interposer marker (ROW_Y - 18 = 26)
  const MARGIN = 22;
  const gap = (VB_W - 2 * MARGIN - N * NODE_W) / (N - 1);
  const nodeX = (i: number) => MARGIN + i * (NODE_W + gap);
  const cy = ROW_Y + NODE_H / 2;

  // link segments (behind nodes)
  const links: SVGLineElement[] = [];
  for (let i = 0; i < N - 1; i++) {
    const x1 = nodeX(i) + NODE_W;
    const x2 = nodeX(i + 1);
    const line = el('line', { x1, y1: cy, x2, y2: cy, class: 'atc-link' });
    svg.appendChild(line);
    links.push(line);
  }

  const nodes: SVGGElement[] = [];
  STAGES.forEach((s, i) => {
    const x = nodeX(i);
    const g = el('g', {
      class: 'atc-node',
      tabindex: 0,
      role: 'button',
      'aria-label': `${s.label} ${s.sub}`,
    });
    g.append(
      el('rect', { class: 'atc-box', x, y: ROW_Y, width: NODE_W, height: NODE_H, rx: 11 }),
      el('text', { class: 'atc-num-badge', x: x + 9, y: ROW_Y + 14 }, String(i + 1)),
    );
    const glyph = el('path', { class: 'atc-glyph', d: glyphPath(s.glyph) });
    glyph.setAttribute('transform', `translate(${x + NODE_W / 2}, ${ROW_Y + 24})`);
    g.appendChild(glyph);
    g.append(
      el('text', { class: 'atc-nlabel', x: x + NODE_W / 2, y: ROW_Y + 50, 'text-anchor': 'middle' }, s.label),
      el('text', { class: 'atc-nsub', x: x + NODE_W / 2, y: ROW_Y + 62, 'text-anchor': 'middle' }, s.sub),
    );
    svg.appendChild(g);
    nodes.push(g);
  });

  // travelling trust pulse
  const pulse = el('circle', { class: 'atc-pulse', cx: nodeX(0) + NODE_W / 2, cy, r: 5 });
  svg.appendChild(pulse);

  // interposer marker over the CPU node (index 1)
  const interX = nodeX(1) + NODE_W / 2;
  const interposer = el('g', { class: 'atc-interposer' });
  interposer.append(
    el('path', { d: `M${interX - 16},${ROW_Y - 14} h32 v9 h-32 z M${interX - 10},${ROW_Y - 5} v6 M${interX},${ROW_Y - 5} v6 M${interX + 10},${ROW_Y - 5} v6` }),
    el('text', { x: interX, y: ROW_Y - 18, 'text-anchor': 'middle' }, 'DDR5 interposer'),
  );
  svg.appendChild(interposer);

  /* ---------------- controls: mode tabs + trace (HTML) ---------------- */
  const MODES = [
    { id: 'honest', label: 'honest attestation' },
    { id: 'forged', label: 'forged quote · TEE.fail' },
  ];

  const controls = document.createElement('div');
  controls.className = 'atc-controls';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'atc-tabs';
  tabsWrap.setAttribute('role', 'tablist');
  tabsWrap.setAttribute('aria-label', 'Attestation mode');
  const tabs: HTMLButtonElement[] = MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Show ${m.label}`);
    if (m.id === 'forged') b.classList.add('atc-tab-forged');
    b.textContent = m.label;
    tabsWrap.appendChild(b);
    return b;
  });

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'atc-run';
  runBtn.setAttribute('aria-label', 'Trace the chain of trust');
  runBtn.textContent = '▶ trace the chain';

  controls.append(tabsWrap, runBtn);
  controlsSlot.appendChild(controls);

  /* ---------------- panel: detail + status + numbers + verdict (HTML) ---- */
  const panelEl = document.createElement('div');
  panelEl.className = 'atc-panel';

  const dTitle = document.createElement('div');
  dTitle.className = 'atc-d-title';
  const dBody = document.createElement('div');
  dBody.className = 'atc-d-body';
  const dStatus = document.createElement('div');
  dStatus.className = 'atc-status';
  dStatus.setAttribute('role', 'status');
  dStatus.setAttribute('aria-live', 'polite');
  const verdict = document.createElement('div');
  verdict.className = 'atc-verdict afl-bullet';
  // Status + verdict read as a clean hanging-indent bullet pair.
  const bullets = document.createElement('div');
  bullets.className = 'afl-bullets';
  bullets.append(dStatus, verdict);

  const nums = document.createElement('div');
  nums.className = 'atc-nums';
  const numsEyebrow = document.createElement('div');
  numsEyebrow.className = 'atc-nums-eyebrow';
  numsEyebrow.textContent = 'BY THE NUMBERS';
  nums.appendChild(numsEyebrow);
  data.numbers.forEach((num) => {
    const row = document.createElement('div');
    row.className = 'atc-num-row';
    const l = document.createElement('span');
    l.className = 'atc-num-l';
    l.textContent = num.label;
    const v = document.createElement('span');
    v.className = 'atc-num-v';
    v.textContent = num.value;
    row.append(l, v);
    nums.appendChild(row);
  });

  panelEl.append(dTitle, dBody, bullets, nums);
  panel.appendChild(panelEl);

  /* ---------------- caption: provenance + hint (HTML) ---------------- */
  const cap = document.createElement('div');
  cap.className = 'atc-cap';
  const capSrc = document.createElement('div');
  capSrc.className = 'atc-cap-line';
  capSrc.textContent =
    `verifier ${data.verifierContract.address.slice(0, 10)}…${data.verifierContract.address.slice(-4)} · live on ${data.verifierContract.chain}`;
  const capHint = document.createElement('div');
  capHint.className = 'atc-cap-line';
  capHint.textContent = 'tap a link to inspect it · ←/→ to step · ▶ to trace';
  cap.append(capSrc, capHint);
  caption.appendChild(cap);

  /* ---------------- state ---------------- */
  let mode: 'honest' | 'forged' = 'honest';
  let selected = 0;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  // forged-mode per-node flag: how each link is affected
  // ok | hit (interposer / attacker) | void | warn (verifier accepts a lie)
  const FORGED_FLAG = ['ok', 'hit', 'void', 'hit', 'warn', 'hit'];

  function paintChain() {
    nodes.forEach((g, i) => {
      g.setAttribute('data-sel', String(i === selected));
      if (mode === 'forged') {
        g.setAttribute('data-flag', FORGED_FLAG[i]!);
      } else {
        g.removeAttribute('data-flag');
      }
    });
    links.forEach((l) => {
      if (mode === 'forged') l.setAttribute('data-flag', 'bad');
      else l.removeAttribute('data-flag');
    });
    interposer.style.opacity = mode === 'forged' ? '1' : '0';
  }

  function renderDetail() {
    const s = STAGES[selected]!;
    dTitle.textContent = `${selected + 1}. ${s.label} · ${s.sub}`;
    dBody.textContent = s.detail;

    const msg = mode === 'forged' ? s.forged : s.honest;
    const flag = mode === 'forged' ? FORGED_FLAG[selected]! : 'ok';
    const statusKind = flag === 'ok' ? 'ok' : flag === 'warn' ? 'warn' : 'bad';
    const prefix =
      flag === 'ok' ? '✓ ' : flag === 'warn' ? '⚠ ' : flag === 'void' ? '∅ ' : '✗ ';
    dStatus.textContent = prefix + msg;
    dStatus.className = `atc-status afl-bullet atc-status-${statusKind}`;
  }

  function setVerdict(show: boolean) {
    if (!show) { verdict.classList.remove('is-on'); return; }
    if (mode === 'forged') {
      verdict.textContent = '⚠ ' + data.verdicts.forged;
      verdict.className = 'atc-verdict afl-bullet atc-verdict-warn is-on';
    } else {
      verdict.textContent = '✓ ' + data.verdicts.honest;
      verdict.className = 'atc-verdict afl-bullet atc-verdict-ok is-on';
    }
  }

  function render() {
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(MODES[i]!.id === mode)));
    paintChain();
    renderDetail();
    setVerdict(true);
  }

  /* ---------------- trace animation ---------------- */
  function trace() {
    if (busy) return;
    busy = true;
    runBtn.setAttribute('aria-disabled', 'true');
    setVerdict(false);
    links.forEach((l) => l.removeAttribute('data-flag'));
    pulse.setAttribute('cx', String(nodeX(0) + NODE_W / 2));
    pulse.style.transition = 'none';
    pulse.style.opacity = '1';
    pulse.setAttribute('fill', mode === 'forged' ? '#f87171' : '#22d3ee');
    svg.getBBox();
    pulse.style.transition = 'cx .42s linear';

    let i = 0;
    const stepMs = 460;
    const step = () => {
      nodes.forEach((g, j) => g.setAttribute('data-sel', String(j === i)));
      selected = i;
      renderDetail();
      if (i < N - 1) {
        const bad = mode === 'forged' && (FORGED_FLAG[i] !== 'ok' || FORGED_FLAG[i + 1] !== 'ok');
        links[i]!.setAttribute('data-flag', bad ? 'bad' : 'lit');
        pulse.setAttribute('cx', String(nodeX(i + 1) + NODE_W / 2));
        i++;
        later(step, stepMs);
      } else {
        pulse.style.opacity = '0';
        later(() => {
          setVerdict(true);
          busy = false;
          runBtn.setAttribute('aria-disabled', 'false');
        }, 320);
      }
    };
    later(step, 120);
  }

  /* ---------------- events ---------------- */
  function selectNode(i: number) {
    if (i < 0 || i >= N || busy) return;
    selected = i;
    nodes.forEach((g, j) => g.setAttribute('data-sel', String(j === i)));
    renderDetail();
  }

  function setMode(next: 'honest' | 'forged') {
    if (busy || next === mode) return;
    mode = next;
    render();
  }

  // chain nodes keep their SVG tap/arrow stepping
  const onSvgClick = (e: Event) => {
    const node = (e.target as Element).closest<SVGGElement>('.atc-node');
    if (node) selectNode(nodes.indexOf(node));
  };
  const onSvgKey = (e: KeyboardEvent) => {
    const node = (e.target as Element).closest<SVGGElement>('.atc-node');
    if (!node) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectNode(nodes.indexOf(node));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (nodes.indexOf(node) + (e.key === 'ArrowRight' ? 1 : -1) + N) % N;
      nodes[next]!.focus();
      selectNode(next);
    }
  };
  svg.addEventListener('click', onSvgClick);
  svg.addEventListener('keydown', onSvgKey);

  // mode tabs (HTML)
  const onTabClick = (e: Event) => {
    const i = tabs.indexOf(e.currentTarget as HTMLButtonElement);
    if (i >= 0) setMode(MODES[i]!.id as 'honest' | 'forged');
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = tabs.indexOf(e.currentTarget as HTMLButtonElement);
      const next = (cur + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]!.focus();
      setMode(MODES[next]!.id as 'honest' | 'forged');
    }
  };
  tabs.forEach((t) => {
    t.addEventListener('click', onTabClick);
    t.addEventListener('keydown', onTabKey);
  });

  // run button (HTML)
  const onRun = () => trace();
  runBtn.addEventListener('click', onRun);

  render();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    rafs.forEach((id) => cancelAnimationFrame(id));
    svg.removeEventListener('click', onSvgClick);
    svg.removeEventListener('keydown', onSvgKey);
    tabs.forEach((t) => {
      t.removeEventListener('click', onTabClick);
      t.removeEventListener('keydown', onTabKey);
    });
    runBtn.removeEventListener('click', onRun);
    layout.dispose();
    style.remove();
  };
}
