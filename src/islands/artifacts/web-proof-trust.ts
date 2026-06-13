/**
 * Artifact: web-proof-trust — Web-Proof Trust
 * Manifest: content/artifacts/web-proof-trust/manifest.json
 *
 * The zkTLS trust boundary made explorable. A prover (an AI agent) reads a
 * value over an HTTPS session with a server, then has to convince a verifier
 * it didn't fabricate that value. Switch between the four channel designs —
 * Plain TLS, MPC-TLS, Proxy-TLS, TEE-TLS — to see where the session key lives,
 * who the third party is, and whom you end up trusting. Hit "forge the value"
 * to watch the prover try to rewrite the server's response: under plain TLS the
 * forgery is undetectable; the other three catch it, each at a different cost
 * and trust assumption. Numbers (overhead, on-chain config) are snapshotted in
 * ./data.json — TLSNotary benchmarks + a Blockscout read of Reclaim on Base.
 */
import raw from '../../../content/artifacts/web-proof-trust/data.json';

const NS = 'http://www.w3.org/2000/svg';

interface Mode {
  id: string;
  label: string;
  thirdParty: string | null;
  keyHolder: string;
  forgeryCaught: boolean;
  trust: string;
  reason: string;
  cost: string;
  examples?: string;
}
const data = raw as unknown as {
  claim: { field: string; real: string; forged: string };
  modes: Mode[];
};
const MODES = data.modes;

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

export default function mount(container: HTMLElement): () => void {
  const svg = el('svg', { viewBox: '0 0 800 460', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'zkTLS trust-boundary diagram');
  container.appendChild(svg);

  const style = el('style');
  style.textContent = `
    .wpt-panel { fill: #0d1322; stroke: rgba(124,140,255,0.18); }
    .wpt-label { fill: #5b6378; font: 500 9px 'JetBrains Mono', monospace; letter-spacing: .14em; }
    .wpt-fine { fill: #5b6378; font: 500 8.5px 'JetBrains Mono', monospace; }
    .wpt-value { fill: #8d95ad; font: 500 11px 'JetBrains Mono', monospace; }
    .wpt-bright { fill: #e7eaf3; font: 500 12px 'JetBrains Mono', monospace; }
    .wpt-accent { fill: #5b8cff; }
    .wpt-cyan { fill: #22d3ee; }
    .wpt-violet { fill: #8b5cf6; }
    .wpt-node rect { fill: #0d1322; stroke: rgba(124,140,255,0.30); transition: stroke .3s, opacity .3s; }
    .wpt-node-title { fill: #e7eaf3; font: 600 12px 'Space Grotesk', system-ui, sans-serif; }
    .wpt-node-sub { fill: #8d95ad; font: 500 9px 'JetBrains Mono', monospace; }
    .wpt-trusted rect { stroke: #22d3ee; }
    .wpt-dim { opacity: .28; }
    .wpt-channel { stroke: rgba(124,140,255,0.30); stroke-width: 10; stroke-linecap: round; }
    .wpt-flow { stroke: #5b8cff; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 2 22; opacity: .9; }
    .wpt-conn { stroke: rgba(34,211,238,0.45); stroke-width: 1.5; stroke-dasharray: 4 4; transition: opacity .3s; }
    .wpt-key { fill: #f5c451; }
    .wpt-keyhalf { fill: #f5c451; }
    .wpt-chip rect { transition: fill .3s, stroke .3s; }
    .wpt-claim { fill: #e7eaf3; font: 600 13px 'JetBrains Mono', monospace; }
    .wpt-tab { cursor: pointer; }
    .wpt-tab rect { fill: rgba(91,140,255,0.06); stroke: rgba(124,140,255,0.22); transition: fill .2s, stroke .2s; }
    .wpt-tab text { fill: #8d95ad; font: 500 10.5px 'JetBrains Mono', monospace; transition: fill .2s; }
    .wpt-tab:hover rect, .wpt-tab:focus-visible rect { fill: rgba(91,140,255,0.16); stroke: rgba(124,140,255,0.55); }
    .wpt-tab:focus-visible { outline: none; }
    .wpt-tab[aria-selected="true"] rect { fill: rgba(91,140,255,0.20); stroke: #5b8cff; }
    .wpt-tab[aria-selected="true"] text { fill: #e7eaf3; }
    .wpt-btn { cursor: pointer; }
    .wpt-btn rect { fill: rgba(248,113,113,0.10); stroke: rgba(248,113,113,0.45); transition: fill .2s, stroke .2s; }
    .wpt-btn text { fill: #fca5a5; font: 600 11px 'JetBrains Mono', monospace; }
    .wpt-btn:hover rect, .wpt-btn:focus-visible rect { fill: rgba(248,113,113,0.20); stroke: rgba(248,113,113,0.8); }
    .wpt-btn:focus-visible { outline: none; }
    .wpt-btn[aria-disabled="true"] { opacity: .4; cursor: default; }
    .wpt-verdict { font: 700 13px 'JetBrains Mono', monospace; opacity: 0; transition: opacity .35s; }
    .wpt-ok { fill: #22d3ee; }
    .wpt-bad { fill: #f87171; }
    .wpt-trustline { fill: #8d95ad; font: 500 11px 'JetBrains Mono', monospace; }
    .wpt-costline { fill: #5b6378; font: 500 10px 'JetBrains Mono', monospace; }
    @media (prefers-reduced-motion: reduce) { .wpt-flow-anim { animation: none !important; } }
  `;
  svg.appendChild(style);

  // animated flow keyframes (scoped, unique class)
  const kf = el('style');
  kf.textContent = `@keyframes wpt-dash { to { stroke-dashoffset: -240; } } .wpt-flow-anim { animation: wpt-dash 3s linear infinite; }`;
  svg.appendChild(kf);

  /* ---------------- mode tabs ---------------- */
  const tabW = 184;
  const tabGap = 12;
  const tabs: SVGGElement[] = [];
  MODES.forEach((m, i) => {
    const x = 16 + i * (tabW + tabGap);
    const g = el('g', { class: 'wpt-tab', tabindex: 0, role: 'tab', 'aria-label': `Show ${m.label}` });
    g.append(
      el('rect', { x, y: 14, width: tabW, height: 32, rx: 8 }),
      el('text', { x: x + tabW / 2, y: 34, 'text-anchor': 'middle' }, m.label),
    );
    svg.appendChild(g);
    tabs.push(g);
  });

  /* ---------------- third-party node (top center) ---------------- */
  const tp = el('g', { class: 'wpt-node' });
  const tpRect = el('rect', { x: 300, y: 70, width: 200, height: 50, rx: 10 });
  const tpTitle = el('text', { x: 400, y: 92, class: 'wpt-node-title', 'text-anchor': 'middle' }, '');
  const tpSub = el('text', { x: 400, y: 108, class: 'wpt-node-sub', 'text-anchor': 'middle' }, '');
  tp.append(tpRect, tpTitle, tpSub);
  // half-key glyph that sits on the notary in MPC mode
  const tpKey = el('text', { x: 400, y: 66, class: 'wpt-keyhalf', 'text-anchor': 'middle', font: '700 13px monospace' }, '');
  // connectors from third party down to the channel
  const connL = el('line', { x1: 360, y1: 120, x2: 300, y2: 230, class: 'wpt-conn' });
  const connR = el('line', { x1: 440, y1: 120, x2: 500, y2: 230, class: 'wpt-conn' });
  svg.append(connL, connR, tp, tpKey);
  // "no third party" note for plain TLS
  const noTp = el('text', { x: 400, y: 96, class: 'wpt-fine', 'text-anchor': 'middle' }, 'no third party — only the two endpoints');
  noTp.style.opacity = '0';
  svg.appendChild(noTp);

  /* ---------------- prover + server ---------------- */
  function endpoint(x: number, title: string, sub: string) {
    const g = el('g', { class: 'wpt-node' });
    g.append(
      el('rect', { x, y: 200, width: 156, height: 80, rx: 12 }),
      el('text', { x: x + 78, y: 234, class: 'wpt-node-title', 'text-anchor': 'middle' }, title),
      el('text', { x: x + 78, y: 252, class: 'wpt-node-sub', 'text-anchor': 'middle' }, sub),
    );
    return g;
  }
  const prover = endpoint(40, 'PROVER', 'AI agent · browser');
  const server = endpoint(604, 'SERVER', 'api.bank.com');
  svg.append(prover, server);

  // key glyphs: prover always shows a key; in MPC it's a half
  const proverKey = el('text', { x: 118, y: 272, class: 'wpt-key', 'text-anchor': 'middle', font: '700 13px monospace' }, '🔑');

  /* ---------------- TLS channel ---------------- */
  const chY = 230;
  svg.appendChild(el('line', { x1: 196, y1: chY, x2: 604, y2: chY, class: 'wpt-channel' }));
  const flow = el('line', { x1: 196, y1: chY, x2: 604, y2: chY, class: 'wpt-flow wpt-flow-anim' });
  svg.appendChild(flow);
  svg.appendChild(el('text', { x: 400, y: 222, class: 'wpt-label', 'text-anchor': 'middle' }, 'TLS 1.3 · AES-GCM'));
  svg.appendChild(proverKey);

  // value chip riding the channel (the server's response)
  const chip = el('g', { class: 'wpt-chip' });
  const chipRect = el('rect', { x: -66, y: -15, width: 132, height: 30, rx: 8, fill: 'rgba(34,211,238,0.10)', stroke: 'rgba(34,211,238,0.45)' });
  const chipText = el('text', { x: 0, y: 5, class: 'wpt-claim wpt-cyan', 'text-anchor': 'middle' }, `${data.claim.field} = ${data.claim.real}`);
  chip.append(chipRect, chipText);
  const CHIP_HOME = { x: 540, y: chY };
  chip.style.transition = 'transform .8s cubic-bezier(.22,.8,.3,1)';
  chip.style.transform = `translate(${CHIP_HOME.x}px, ${CHIP_HOME.y}px)`;
  svg.appendChild(chip);

  /* ---------------- forge button + verdict ---------------- */
  const forgeBtn = el('g', { class: 'wpt-btn', tabindex: 0, role: 'button', 'aria-label': 'Forge the value' });
  forgeBtn.append(
    el('rect', { x: 40, y: 408, width: 220, height: 36, rx: 9 }),
    el('text', { x: 150, y: 431, 'text-anchor': 'middle' }, '⚡ forge the value'),
  );
  svg.appendChild(forgeBtn);

  const verdict = el('text', { x: 400, y: 316, class: 'wpt-verdict', 'text-anchor': 'middle' }, '');
  svg.appendChild(verdict);

  /* ---------------- info readouts ---------------- */
  const keyLine = el('text', { x: 290, y: 412, class: 'wpt-value' }, '');
  const trustLine = el('text', { x: 290, y: 430, class: 'wpt-trustline' }, '');
  const costLine = el('text', { x: 290, y: 446, class: 'wpt-costline' }, '');
  svg.append(keyLine, trustLine, costLine);

  // reason caption (wraps into two tspans)
  const reason1 = el('text', { x: 400, y: 344, class: 'wpt-fine', 'text-anchor': 'middle' }, '');
  const reason2 = el('text', { x: 400, y: 358, class: 'wpt-fine', 'text-anchor': 'middle' }, '');
  svg.append(reason1, reason2);

  /* ---------------- state ---------------- */
  let active = 0;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  // naive two-line wrap on word boundaries (~62 chars/line at this size).
  // Reason strings in data.json are kept short enough to fit two lines.
  function wrap(s: string): [string, string] {
    if (s.length <= 62) return [s, ''];
    let cut = s.lastIndexOf(' ', 62);
    if (cut < 0) cut = 62;
    return [s.slice(0, cut), s.slice(cut + 1)];
  }

  function resetChip() {
    chip.style.transition = 'none';
    chip.style.transform = `translate(${CHIP_HOME.x}px, ${CHIP_HOME.y}px)`;
    chipText.textContent = `${data.claim.field} = ${data.claim.real}`;
    chipText.setAttribute('class', 'wpt-claim wpt-cyan');
    chipRect.setAttribute('fill', 'rgba(34,211,238,0.10)');
    chipRect.setAttribute('stroke', 'rgba(34,211,238,0.45)');
    chip.style.opacity = '1';
    // force reflow so the next transition runs from the home pose
    svg.getBBox();
    chip.style.transition = 'transform .8s cubic-bezier(.22,.8,.3,1), opacity .4s';
  }

  function render() {
    const m = MODES[active]!;
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === active)));

    // third party
    const hasTp = m.thirdParty !== null;
    tp.style.display = hasTp ? '' : 'none';
    connL.style.opacity = hasTp ? '1' : '0';
    connR.style.opacity = hasTp ? '1' : '0';
    noTp.style.opacity = hasTp ? '0' : '1';
    if (hasTp) {
      tpTitle.textContent = m.thirdParty;
      tpSub.textContent = m.examples ?? '';
      // mark the trusted party
      tp.setAttribute('class', m.forgeryCaught ? 'wpt-node wpt-trusted' : 'wpt-node');
    }

    // key visualization: MPC splits the key (half at prover, half at notary)
    if (m.id === 'mpc') {
      proverKey.textContent = '🔑½';
      tpKey.textContent = '½🔑';
    } else if (m.id === 'tee') {
      proverKey.textContent = '—';
      tpKey.textContent = '🔑';
    } else {
      proverKey.textContent = '🔑';
      tpKey.textContent = '';
    }

    keyLine.textContent = `key: ${m.keyHolder}`;
    trustLine.textContent = `trust: ${m.trust}`;
    trustLine.setAttribute('class', m.forgeryCaught ? 'wpt-trustline wpt-cyan' : 'wpt-trustline wpt-bad');
    costLine.textContent = `cost: ${m.cost}`;
    const [r1, r2] = wrap(m.reason);
    reason1.textContent = r1;
    reason2.textContent = r2;

    verdict.style.opacity = '0';
    resetChip();
    syncButtons();
  }

  function syncButtons() {
    forgeBtn.setAttribute('aria-disabled', String(busy));
  }

  function forge() {
    if (busy) return;
    const m = MODES[active]!;
    busy = true;
    syncButtons();
    verdict.style.opacity = '0';

    // step 1: prover grabs the chip and pulls it home, rewriting the value
    chip.style.transform = `translate(${118}px, ${chY}px)`;
    later(() => {
      chipText.textContent = `${data.claim.field} = ${data.claim.forged}`;
      chipText.setAttribute('class', 'wpt-claim wpt-bad');
      chipRect.setAttribute('fill', 'rgba(248,113,113,0.12)');
      chipRect.setAttribute('stroke', 'rgba(248,113,113,0.6)');
    }, 420);

    // step 2: verdict
    later(() => {
      if (m.forgeryCaught) {
        verdict.textContent = '✓ forgery caught — proof rejected';
        verdict.setAttribute('class', 'wpt-verdict wpt-ok');
        // bounce the chip back, mark rejected
        chip.style.transform = `translate(${CHIP_HOME.x}px, ${chY}px)`;
        later(() => { chip.style.opacity = '0'; }, 500);
      } else {
        verdict.textContent = '✗ forgery undetectable — “proof” accepted';
        verdict.setAttribute('class', 'wpt-verdict wpt-bad');
      }
      verdict.style.opacity = '1';
      later(() => { busy = false; syncButtons(); }, 700);
    }, 1000);
  }

  /* ---------------- events ---------------- */
  const onClick = (e: Event) => {
    const tab = (e.target as Element).closest<SVGGElement>('.wpt-tab');
    if (tab) {
      const i = tabs.indexOf(tab);
      if (i >= 0 && i !== active && !busy) { active = i; render(); }
      return;
    }
    if ((e.target as Element).closest('.wpt-btn')) forge();
  };
  const onKey = (e: KeyboardEvent) => {
    const tab = (e.target as Element).closest<SVGGElement>('.wpt-tab');
    if (tab) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const i = tabs.indexOf(tab);
        if (i >= 0 && !busy) { active = i; render(); }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = (active + dir + tabs.length) % tabs.length;
        tabs[next]!.focus();
        if (!busy) { active = next; render(); }
      }
      return;
    }
    if ((e.target as Element).closest('.wpt-btn') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      forge();
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
