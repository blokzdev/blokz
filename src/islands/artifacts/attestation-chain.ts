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
 */
import raw from '../../../content/artifacts/attestation-chain/data.json';

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
  const svg = el('svg', { viewBox: '0 0 800 460', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'TEE remote-attestation chain-of-trust diagram');
  container.appendChild(svg);

  const style = el('style');
  style.textContent = `
    .atc-eyebrow { fill: #5b6378; font: 500 9px 'JetBrains Mono', monospace; letter-spacing: .16em; }
    .atc-fine { fill: #5b6378; font: 500 9px 'JetBrains Mono', monospace; }
    .atc-mono { fill: #8d95ad; font: 500 10px 'JetBrains Mono', monospace; }
    .atc-bright { fill: #e7eaf3; font: 500 11px 'JetBrains Mono', monospace; }
    /* tabs */
    .atc-tab { cursor: pointer; }
    .atc-tab rect { fill: rgba(91,140,255,0.06); stroke: rgba(124,140,255,0.22); transition: fill .2s, stroke .2s; }
    .atc-tab text { fill: #8d95ad; font: 600 11px 'JetBrains Mono', monospace; transition: fill .2s; }
    .atc-tab:hover rect, .atc-tab:focus-visible rect { fill: rgba(91,140,255,0.16); stroke: rgba(124,140,255,0.55); }
    .atc-tab:focus-visible { outline: none; }
    .atc-tab[aria-selected="true"] rect { fill: rgba(91,140,255,0.20); stroke: #5b8cff; }
    .atc-tab[aria-selected="true"] text { fill: #e7eaf3; }
    .atc-tab.atc-tab-forged[aria-selected="true"] rect { fill: rgba(248,113,113,0.16); stroke: #f87171; }
    .atc-tab.atc-tab-forged[aria-selected="true"] text { fill: #fca5a5; }
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
    .atc-num-badge { fill: #5b6378; font: 600 8px 'JetBrains Mono', monospace; }
    /* interposer marker */
    .atc-interposer { opacity: 0; transition: opacity .3s; }
    .atc-interposer text { fill: #f87171; font: 600 8px 'JetBrains Mono', monospace; }
    .atc-interposer path { stroke: #f87171; stroke-width: 1.3; fill: none; stroke-linecap: round; }
    /* detail panel */
    .atc-detail-title { fill: #e7eaf3; font: 600 12px 'Space Grotesk', system-ui, sans-serif; }
    .atc-detail-body { fill: #8d95ad; font: 500 10.5px 'JetBrains Mono', monospace; }
    .atc-status { font: 600 10.5px 'JetBrains Mono', monospace; }
    .atc-status-ok { fill: #22d3ee; }
    .atc-status-bad { fill: #f87171; }
    .atc-status-warn { fill: #f5c451; }
    /* verdict + run */
    .atc-verdict { font: 700 12px 'JetBrains Mono', monospace; opacity: 0; transition: opacity .35s; }
    .atc-verdict-ok { fill: #22d3ee; }
    .atc-verdict-warn { fill: #f5c451; }
    .atc-run { cursor: pointer; }
    .atc-run rect { fill: rgba(91,140,255,0.10); stroke: rgba(124,140,255,0.45); transition: fill .2s, stroke .2s; }
    .atc-run text { fill: #cdd3e6; font: 600 11px 'JetBrains Mono', monospace; }
    .atc-run:hover rect, .atc-run:focus-visible rect { fill: rgba(91,140,255,0.20); stroke: #5b8cff; }
    .atc-run:focus-visible { outline: none; }
    .atc-run[aria-disabled="true"] { opacity: .45; cursor: default; }
    .atc-numv { fill: #cdd3e6; font: 600 10px 'JetBrains Mono', monospace; }
    .atc-numl { fill: #5b6378; font: 500 7.5px 'JetBrains Mono', monospace; letter-spacing: .04em; }
  `;
  svg.appendChild(style);

  /* ---------------- mode tabs ---------------- */
  const MODES = [
    { id: 'honest', label: 'honest attestation' },
    { id: 'forged', label: 'forged quote · TEE.fail' },
  ];
  const tabW = 234;
  const tabs: SVGGElement[] = [];
  MODES.forEach((m, i) => {
    const x = 16 + i * (tabW + 12);
    const g = el('g', {
      class: `atc-tab${m.id === 'forged' ? ' atc-tab-forged' : ''}`,
      tabindex: 0,
      role: 'tab',
      'aria-label': `Show ${m.label}`,
    });
    g.append(
      el('rect', { x, y: 12, width: tabW, height: 30, rx: 8 }),
      el('text', { x: x + tabW / 2, y: 31, 'text-anchor': 'middle' }, m.label),
    );
    svg.appendChild(g);
    tabs.push(g);
  });

  /* ---------------- chain of nodes ---------------- */
  const N = STAGES.length;
  const NODE_W = 104;
  const NODE_H = 70;
  const ROW_Y = 86;
  const MARGIN = 22;
  const gap = (800 - 2 * MARGIN - N * NODE_W) / (N - 1);
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

  /* ---------------- detail panel ---------------- */
  const PANEL_Y = 196;
  svg.appendChild(el('rect', { x: 16, y: PANEL_Y, width: 480, height: 132, rx: 12, fill: '#0b1020', stroke: 'rgba(124,140,255,0.16)' }));
  const dTitle = el('text', { class: 'atc-detail-title', x: 34, y: PANEL_Y + 26 }, '');
  const dBody: SVGTextElement[] = [];
  for (let i = 0; i < 3; i++) {
    dBody.push(el('text', { class: 'atc-detail-body', x: 34, y: PANEL_Y + 48 + i * 15 }, ''));
  }
  const dStatus: SVGTextElement[] = [];
  for (let i = 0; i < 2; i++) {
    dStatus.push(el('text', { class: 'atc-status', x: 34, y: PANEL_Y + 104 }, ''));
  }
  svg.append(dTitle, ...dBody, ...dStatus);

  /* ---------------- numbers rail (right) ---------------- */
  const NX = 520;
  svg.appendChild(el('rect', { x: NX, y: PANEL_Y, width: 264, height: 132, rx: 12, fill: '#0b1020', stroke: 'rgba(124,140,255,0.16)' }));
  svg.appendChild(el('text', { class: 'atc-eyebrow', x: NX + 18, y: PANEL_Y + 22 }, 'BY THE NUMBERS'));
  data.numbers.forEach((num, i) => {
    const yy = PANEL_Y + 40 + i * 21;
    svg.appendChild(el('text', { class: 'atc-numl', x: NX + 18, y: yy }, num.label.toUpperCase()));
    svg.appendChild(el('text', { class: 'atc-numv', x: NX + 246, y: yy, 'text-anchor': 'end' }, num.value));
  });

  /* ---------------- verdict + run + provenance ---------------- */
  const verdict = el('text', { class: 'atc-verdict', x: 16, y: 356 }, '');
  svg.appendChild(verdict);

  const runBtn = el('g', { class: 'atc-run', tabindex: 0, role: 'button', 'aria-label': 'Trace the chain of trust' });
  runBtn.append(
    el('rect', { x: 16, y: 372, width: 184, height: 34, rx: 9 }),
    el('text', { x: 108, y: 394, 'text-anchor': 'middle' }, '▶ trace the chain'),
  );
  svg.appendChild(runBtn);

  svg.appendChild(
    el('text', { class: 'atc-fine', x: 220, y: 386 },
      `verifier ${data.verifierContract.address.slice(0, 10)}…${data.verifierContract.address.slice(-4)} · live on ${data.verifierContract.chain}`),
  );
  svg.appendChild(
    el('text', { class: 'atc-fine', x: 220, y: 400 }, 'tap a link to inspect it · ←/→ to step · ▶ to trace'),
  );

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

  function wrap(s: string, max: number, maxLines: number): string[] {
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > max) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cur ? cur + ' ' + w : w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const tail = lines.slice(maxLines - 1).join(' ');
      lines.length = maxLines - 1;
      lines.push(tail);
    }
    return lines;
  }

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
    const lines = wrap(s.detail, 62, 3);
    dBody.forEach((t, i) => (t.textContent = lines[i] ?? ''));

    const msg = mode === 'forged' ? s.forged : s.honest;
    const flag = mode === 'forged' ? FORGED_FLAG[selected]! : 'ok';
    const statusKind = flag === 'ok' ? 'ok' : flag === 'warn' ? 'warn' : 'bad';
    const prefix =
      flag === 'ok' ? '✓ ' : flag === 'warn' ? '⚠ ' : flag === 'void' ? '∅ ' : '✗ ';
    const slines = wrap(prefix + msg, 60, 2);
    dStatus.forEach((t, i) => {
      t.textContent = slines[i] ?? '';
      t.setAttribute('y', String(PANEL_Y + 104 + i * 14));
      t.setAttribute('class', `atc-status atc-status-${statusKind}`);
    });
  }

  function setVerdict(show: boolean) {
    if (!show) { verdict.style.opacity = '0'; return; }
    if (mode === 'forged') {
      verdict.textContent = '⚠ ' + data.verdicts.forged;
      verdict.setAttribute('class', 'atc-verdict atc-verdict-warn');
    } else {
      verdict.textContent = '✓ ' + data.verdicts.honest;
      verdict.setAttribute('class', 'atc-verdict atc-verdict-ok');
    }
    verdict.style.opacity = '1';
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

  const onClick = (e: Event) => {
    const tab = (e.target as Element).closest<SVGGElement>('.atc-tab');
    if (tab) { setMode(MODES[tabs.indexOf(tab)]!.id as 'honest' | 'forged'); return; }
    const node = (e.target as Element).closest<SVGGElement>('.atc-node');
    if (node) { selectNode(nodes.indexOf(node)); return; }
    if ((e.target as Element).closest('.atc-run')) trace();
  };

  const onKey = (e: KeyboardEvent) => {
    const tab = (e.target as Element).closest<SVGGElement>('.atc-tab');
    if (tab) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setMode(MODES[tabs.indexOf(tab)]!.id as 'honest' | 'forged');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]!.focus();
        setMode(MODES[next]!.id as 'honest' | 'forged');
      }
      return;
    }
    const node = (e.target as Element).closest<SVGGElement>('.atc-node');
    if (node) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectNode(nodes.indexOf(node));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = (nodes.indexOf(node) + (e.key === 'ArrowRight' ? 1 : -1) + N) % N;
        nodes[next]!.focus();
        selectNode(next);
      }
      return;
    }
    if ((e.target as Element).closest('.atc-run') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      trace();
    }
  };

  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    rafs.forEach((id) => cancelAnimationFrame(id));
    svg.removeEventListener('click', onClick);
    svg.removeEventListener('keydown', onKey);
    svg.remove();
  };
}
