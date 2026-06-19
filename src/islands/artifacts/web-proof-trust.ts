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
 *
 * Layout: shared responsive primitive (stage diagram · panel "who you must
 * trust" + verdict · footer controls = mode tabs + forge · caption source).
 * The mode tabs and forge button are real HTML controls; the trust/key/cost/
 * reason/verdict explanation is HTML, de-baked from the original single SVG.
 * Reduced motion handled by ArtifactMount.
 */
import raw from '../../../content/artifacts/web-proof-trust/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

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
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '800/300',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .wpt-stage { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .wpt-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
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
    @media (prefers-reduced-motion: reduce) { .wpt-flow-anim { animation: none !important; } }

    /* --- de-baked HTML controls (mode tabs + forge) --- */
    .wpt-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .wpt-tabs { display:inline-flex; flex-wrap:wrap; gap:6px; }
    .wpt-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10.5px 'JetBrains Mono', monospace; letter-spacing:.04em; padding:8px 12px;
      max-width:100%; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .wpt-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .wpt-tabs button[aria-selected="true"] { background:rgba(91,140,255,.20);
      border-color:#5b8cff; color:#e7eaf3; }
    .wpt-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .wpt-forge { appearance:none; border:1px solid rgba(248,113,113,.45);
      background:rgba(248,113,113,.10); color:#fca5a5; border-radius:9px;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:9px 16px;
      max-width:100%; cursor:pointer; transition:background .2s, border-color .2s; }
    .wpt-forge:hover { background:rgba(248,113,113,.20); border-color:rgba(248,113,113,.8); }
    .wpt-forge:focus-visible { outline:2px solid #f87171; outline-offset:-2px; }
    .wpt-forge[aria-disabled="true"] { opacity:.4; cursor:default; }

    /* --- de-baked HTML explanation panel + verdict --- */
    .wpt-explain { display:flex; flex-direction:column; gap:7px; min-width:0; max-width:100%; }
    .wpt-verdict { min-height:18px; font:700 12px 'JetBrains Mono', monospace;
      opacity:0; transition:opacity .35s; min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .wpt-verdict.is-on { opacity:1; }
    .wpt-verdict.wpt-ok { color:#22d3ee; }
    .wpt-verdict.wpt-bad { color:#f87171; }
    .wpt-row { font:500 11px 'JetBrains Mono', monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .wpt-row .wpt-k { color:#5b6378; text-transform:uppercase; letter-spacing:.06em;
      font-size:9.5px; margin-right:6px; }
    .wpt-row.wpt-trust-ok { color:#22d3ee; }
    .wpt-row.wpt-trust-bad { color:#f87171; }
    .wpt-reason { font:500 10.5px 'JetBrains Mono', monospace; color:#5b6378;
      line-height:1.5; min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .wpt-note { font-size:9.5px; color:#5b6378; letter-spacing:.02em;
      font-family:'JetBrains Mono', monospace; }
  `;
  stage.appendChild(style);

  /* ---------------- stage: the diagram SVG ---------------- */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'wpt-stage';
  const svg = el('svg', { viewBox: '0 0 800 300', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'zkTLS trust-boundary diagram');
  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  // animated flow keyframes (scoped, unique class)
  const kf = el('style');
  kf.textContent = `@keyframes wpt-dash { to { stroke-dashoffset: -240; } } .wpt-flow-anim { animation: wpt-dash 3s linear infinite; }`;
  svg.appendChild(kf);

  /* ---------------- third-party node (top center) ---------------- */
  const tp = el('g', { class: 'wpt-node' });
  const tpRect = el('rect', { x: 300, y: 18, width: 200, height: 50, rx: 10 });
  const tpTitle = el('text', { x: 400, y: 40, class: 'wpt-node-title', 'text-anchor': 'middle' }, '');
  const tpSub = el('text', { x: 400, y: 56, class: 'wpt-node-sub', 'text-anchor': 'middle' }, '');
  tp.append(tpRect, tpTitle, tpSub);
  // half-key glyph that sits on the notary in MPC mode
  const tpKey = el('text', { x: 400, y: 14, class: 'wpt-keyhalf', 'text-anchor': 'middle', font: '700 13px monospace' }, '');
  // connectors from third party down to the channel
  const connL = el('line', { x1: 360, y1: 68, x2: 300, y2: 178, class: 'wpt-conn' });
  const connR = el('line', { x1: 440, y1: 68, x2: 500, y2: 178, class: 'wpt-conn' });
  svg.append(connL, connR, tp, tpKey);
  // "no third party" note for plain TLS
  const noTp = el('text', { x: 400, y: 44, class: 'wpt-fine', 'text-anchor': 'middle' }, 'no third party — only the two endpoints');
  noTp.style.opacity = '0';
  svg.appendChild(noTp);

  /* ---------------- prover + server ---------------- */
  function endpoint(x: number, title: string, sub: string) {
    const g = el('g', { class: 'wpt-node' });
    g.append(
      el('rect', { x, y: 148, width: 156, height: 80, rx: 12 }),
      el('text', { x: x + 78, y: 182, class: 'wpt-node-title', 'text-anchor': 'middle' }, title),
      el('text', { x: x + 78, y: 200, class: 'wpt-node-sub', 'text-anchor': 'middle' }, sub),
    );
    return g;
  }
  const prover = endpoint(40, 'PROVER', 'AI agent · browser');
  const server = endpoint(604, 'SERVER', 'api.bank.com');
  svg.append(prover, server);

  // key glyphs: prover always shows a key; in MPC it's a half
  const proverKey = el('text', { x: 118, y: 220, class: 'wpt-key', 'text-anchor': 'middle', font: '700 13px monospace' }, '🔑');

  /* ---------------- TLS channel ---------------- */
  const chY = 178;
  svg.appendChild(el('line', { x1: 196, y1: chY, x2: 604, y2: chY, class: 'wpt-channel' }));
  const flow = el('line', { x1: 196, y1: chY, x2: 604, y2: chY, class: 'wpt-flow wpt-flow-anim' });
  svg.appendChild(flow);
  svg.appendChild(el('text', { x: 400, y: 170, class: 'wpt-label', 'text-anchor': 'middle' }, 'TLS 1.3 · AES-GCM'));
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

  /* ---------------- controls: mode tabs + forge (HTML) ---------------- */
  const controls = document.createElement('div');
  controls.className = 'wpt-controls';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'wpt-tabs';
  tabsWrap.setAttribute('role', 'tablist');
  tabsWrap.setAttribute('aria-label', 'TLS channel design');
  const tabs: HTMLButtonElement[] = MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Show ${m.label}`);
    b.textContent = m.label;
    tabsWrap.appendChild(b);
    return b;
  });

  const forgeBtn = document.createElement('button');
  forgeBtn.type = 'button';
  forgeBtn.className = 'wpt-forge';
  forgeBtn.setAttribute('aria-label', 'Forge the value');
  forgeBtn.textContent = '⚡ forge the value';

  controls.append(tabsWrap, forgeBtn);
  controlsSlot.appendChild(controls);

  /* ---------------- panel: explanation + verdict (HTML) ---------------- */
  const explain = document.createElement('div');
  explain.className = 'wpt-explain';

  const verdict = document.createElement('div');
  verdict.className = 'wpt-verdict';
  verdict.setAttribute('role', 'status');
  verdict.setAttribute('aria-live', 'polite');

  const keyLine = document.createElement('div');
  keyLine.className = 'wpt-row';
  const trustLine = document.createElement('div');
  trustLine.className = 'wpt-row';
  const costLine = document.createElement('div');
  costLine.className = 'wpt-row';
  const reasonLine = document.createElement('div');
  reasonLine.className = 'wpt-reason';

  explain.append(verdict, keyLine, trustLine, costLine, reasonLine);
  panel.appendChild(explain);

  /* ---------------- caption: source / provenance ---------------- */
  const note = document.createElement('div');
  note.className = 'wpt-note';
  note.textContent =
    'overhead = TLSNotary benchmarks · on-chain config = Blockscout read of Reclaim on Base';
  caption.appendChild(note);

  /* ---------------- state ---------------- */
  let active = 0;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

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

    keyLine.innerHTML = '';
    keyLine.append(kvKey('key'), document.createTextNode(m.keyHolder));
    trustLine.innerHTML = '';
    trustLine.append(kvKey('trust'), document.createTextNode(m.trust));
    trustLine.className = m.forgeryCaught ? 'wpt-row wpt-trust-ok' : 'wpt-row wpt-trust-bad';
    costLine.innerHTML = '';
    costLine.append(kvKey('cost'), document.createTextNode(m.cost));
    reasonLine.textContent = m.reason;

    verdict.className = 'wpt-verdict';
    verdict.textContent = '';
    resetChip();
    syncButtons();
  }

  function kvKey(label: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'wpt-k';
    span.textContent = label;
    return span;
  }

  function syncButtons() {
    forgeBtn.setAttribute('aria-disabled', String(busy));
  }

  function forge() {
    if (busy) return;
    const m = MODES[active]!;
    busy = true;
    syncButtons();
    verdict.className = 'wpt-verdict';
    verdict.textContent = '';

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
        verdict.className = 'wpt-verdict is-on wpt-ok';
        // bounce the chip back, mark rejected
        chip.style.transform = `translate(${CHIP_HOME.x}px, ${chY}px)`;
        later(() => { chip.style.opacity = '0'; }, 500);
      } else {
        verdict.textContent = '✗ forgery undetectable — “proof” accepted';
        verdict.className = 'wpt-verdict is-on wpt-bad';
      }
      later(() => { busy = false; syncButtons(); }, 700);
    }, 1000);
  }

  /* ---------------- events ---------------- */
  const onTabClick = (e: Event) => {
    const i = tabs.indexOf(e.currentTarget as HTMLButtonElement);
    if (i >= 0 && i !== active && !busy) { active = i; render(); }
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (active + dir + tabs.length) % tabs.length;
      tabs[next]!.focus();
      if (!busy) { active = next; render(); }
    }
  };
  tabs.forEach((t) => {
    t.addEventListener('click', onTabClick);
    t.addEventListener('keydown', onTabKey);
  });
  const onForge = () => forge();
  forgeBtn.addEventListener('click', onForge);

  render();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    rafs.forEach((id) => cancelAnimationFrame(id));
    tabs.forEach((t) => {
      t.removeEventListener('click', onTabClick);
      t.removeEventListener('keydown', onTabKey);
    });
    forgeBtn.removeEventListener('click', onForge);
    layout.dispose();
    style.remove();
  };
}
