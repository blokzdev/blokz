/**
 * Artifact: the-evaluators-chair — The Evaluator's Chair
 * Manifest: content/artifacts/the-evaluators-chair/manifest.json
 *
 * Virtuals' Agent Commerce Protocol (ACP) settles agent-to-agent jobs through an
 * on-chain USDC escrow: the client funds it, the provider submits a deliverable
 * hash, and an *evaluator* decides whether the escrow pays out or refunds. The
 * whole trust model hinges on who sits in the evaluator's chair. Pick one of the
 * three designs — the client grading its own job (what ~all of Base actually
 * does), a neutral third-party evaluator (what the marketing sells), or no
 * evaluator at all (auto-release) — then run the happy path or let someone cheat,
 * and watch where the money goes and who is left exposed.
 *
 * Numbers are snapshotted in ./data.json: a Blockscout read of the ACP escrow on
 * Base (62,882 jobs since 2026-04-08; a 30-job evaluator-field sample).
 *
 * Layout: shared responsive primitive (stage = lifecycle diagram · panel =
 * verdict + trust readout · footer controls = mode tabs + run/cheat · caption =
 * source). Reduced motion handled by ArtifactMount (no autoplay).
 */
import raw from '../../../content/artifacts/the-evaluators-chair/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

interface Mode {
  id: string;
  label: string;
  chair: string;
  chairSub: string;
  share: string;
  decides: string;
  exposed: string;
  trust: string;
  happy: string;
  attackLabel: string;
  attack: string;
  attackCaught: boolean;
}
const data = raw as unknown as {
  contract: string;
  chain: string;
  asOf: string;
  jobsTotal: number;
  jobsPerDay: number;
  escrowToken: string;
  sample: { label: string; size: number; self: number; none: number; independent: number };
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

// chip rest poses (viewBox coords)
const AT_CLIENT = { x: 104, y: 155 };
const AT_VAULT_HI = { x: 410, y: 137 };
const AT_VAULT_LO = { x: 410, y: 177 };
const AT_PROVIDER = { x: 716, y: 155 };

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '820/300',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .ec-stage { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .ec-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .ec-node rect { fill:#0d1322; stroke:rgba(124,140,255,.30); transition:stroke .3s, opacity .3s; }
    .ec-node-title { fill:#e7eaf3; font:600 12px 'Space Grotesk', system-ui, sans-serif; letter-spacing:.02em; }
    .ec-node-sub { fill:#8d95ad; font:500 9px 'JetBrains Mono', monospace; }
    .ec-label { fill:#5b6378; font:500 9px 'JetBrains Mono', monospace; letter-spacing:.14em; }
    .ec-vaultwrap rect { fill:rgba(245,196,81,.05); stroke:rgba(245,196,81,.40); }
    .ec-vault-title { fill:#f5c451; }

    .ec-chair rect { fill:#0d1322; stroke:rgba(124,140,255,.30); transition:stroke .35s, fill .35s; }
    .ec-chair.is-self rect { stroke:#5b8cff; fill:rgba(91,140,255,.07); }
    .ec-chair.is-independent rect { stroke:#22d3ee; fill:rgba(34,211,238,.06); }
    .ec-chair.is-none rect { stroke:rgba(124,140,255,.22); stroke-dasharray:5 5; fill:transparent; }
    .ec-chair-title { fill:#e7eaf3; font:600 12px 'JetBrains Mono', monospace; }
    .ec-chair-sub { fill:#8d95ad; font:500 9px 'JetBrains Mono', monospace; }
    .ec-stem { stroke:rgba(124,140,255,.32); stroke-width:1.5; stroke-dasharray:4 4; }

    .ec-channel { stroke:rgba(124,140,255,.22); stroke-width:9; stroke-linecap:round; transition:stroke .3s; }
    .ec-channel.is-pay { stroke:rgba(74,222,128,.55); }
    .ec-channel.is-refund { stroke:rgba(245,196,81,.55); }

    .ec-chip { opacity:0; transition:transform .7s cubic-bezier(.22,.8,.3,1), opacity .35s; }
    .ec-chip rect { transition:fill .3s, stroke .3s; }
    .ec-chip-txt { font:600 10.5px 'JetBrains Mono', monospace; }
    .ec-coin rect { fill:rgba(74,222,128,.12); stroke:rgba(74,222,128,.55); }
    .ec-coin .ec-chip-txt { fill:#86efac; }
    .ec-deliv rect { fill:rgba(34,211,238,.10); stroke:rgba(34,211,238,.50); }
    .ec-deliv .ec-chip-txt { fill:#67e8f9; }
    .ec-deliv.is-junk rect { fill:rgba(248,113,113,.12); stroke:rgba(248,113,113,.6); }
    .ec-deliv.is-junk .ec-chip-txt { fill:#fca5a5; }

    /* ---- HTML controls ---- */
    .ec-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .ec-tabs { display:inline-flex; flex-wrap:wrap; gap:6px; }
    .ec-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10.5px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:8px 12px;
      max-width:100%; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .ec-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .ec-tabs button[aria-selected="true"] { background:rgba(91,140,255,.20);
      border-color:#5b8cff; color:#e7eaf3; }
    .ec-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .ec-acts { display:inline-flex; flex-wrap:wrap; gap:8px; }
    .ec-btn { appearance:none; border-radius:9px; max-width:100%; cursor:pointer;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:9px 14px;
      transition:background .2s, border-color .2s; }
    .ec-run { border:1px solid rgba(74,222,128,.45); background:rgba(74,222,128,.10); color:#86efac; }
    .ec-run:hover { background:rgba(74,222,128,.20); border-color:rgba(74,222,128,.8); }
    .ec-run:focus-visible { outline:2px solid #4ade80; outline-offset:-2px; }
    .ec-cheat { border:1px solid rgba(248,113,113,.45); background:rgba(248,113,113,.10); color:#fca5a5; }
    .ec-cheat:hover { background:rgba(248,113,113,.20); border-color:rgba(248,113,113,.8); }
    .ec-cheat:focus-visible { outline:2px solid #f87171; outline-offset:-2px; }
    .ec-btn[aria-disabled="true"] { opacity:.4; cursor:default; }

    /* ---- HTML panel ---- */
    .ec-explain { display:flex; flex-direction:column; gap:7px; min-width:0; max-width:100%; }
    .ec-verdict { min-height:34px; font:700 12px 'JetBrains Mono', monospace; opacity:0;
      transition:opacity .35s; min-width:0; max-width:100%; overflow-wrap:anywhere; line-height:1.45; }
    .ec-verdict.is-on { opacity:1; }
    .ec-verdict.ec-ok { color:#4ade80; }
    .ec-verdict.ec-bad { color:#f87171; }
    .ec-row { font:500 11px 'JetBrains Mono', monospace; color:#8d95ad;
      font-variant-numeric:tabular-nums; min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .ec-row .ec-k { color:#5b6378; text-transform:uppercase; letter-spacing:.06em;
      font-size:9.5px; margin-right:6px; }
    .ec-row.ec-warn { color:#f5c451; }
    .ec-reason { font:500 10.5px 'JetBrains Mono', monospace; color:#5b6378; line-height:1.5;
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .ec-share { margin-top:2px; padding-top:8px; border-top:1px solid rgba(124,140,255,.14);
      font:500 10px 'JetBrains Mono', monospace; color:#5b6378; line-height:1.5; overflow-wrap:anywhere; }
    .ec-share b { color:#8d95ad; font-weight:600; }
    .ec-note { font-size:9.5px; color:#5b6378; letter-spacing:.02em; font-family:'JetBrains Mono', monospace;
      overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  /* ---------------- stage: lifecycle SVG ---------------- */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'ec-stage';
  const svg = el('svg', { viewBox: '0 0 820 300', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'ACP escrow job lifecycle: client, escrow vault, provider, and the evaluator chair');
  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  // channels (drawn first, under nodes)
  const chanFund = el('line', { x1: 178, y1: 155, x2: 333, y2: 155, class: 'ec-channel' });
  const chanRelease = el('line', { x1: 487, y1: 155, x2: 642, y2: 155, class: 'ec-channel' });
  svg.append(chanFund, chanRelease);
  svg.appendChild(el('text', { x: 256, y: 142, class: 'ec-label', 'text-anchor': 'middle' }, 'FUND'));
  const relLabel = el('text', { x: 564, y: 142, class: 'ec-label', 'text-anchor': 'middle' }, 'RELEASE');
  svg.appendChild(relLabel);

  // nodes
  function node(x: number, y: number, w: number, h: number, title: string, sub: string, cls = '') {
    const g = el('g', { class: `ec-node ${cls}`.trim() });
    g.append(
      el('rect', { x, y, width: w, height: h, rx: 12 }),
      el('text', { x: x + w / 2, y: y + h / 2 - 4, class: 'ec-node-title', 'text-anchor': 'middle' }, title),
      el('text', { x: x + w / 2, y: y + h / 2 + 13, class: 'ec-node-sub', 'text-anchor': 'middle' }, sub),
    );
    return g;
  }
  svg.appendChild(node(26, 116, 152, 78, 'CLIENT', 'buyer agent'));
  svg.appendChild(node(642, 116, 152, 78, 'PROVIDER', 'seller agent'));

  // escrow vault (center)
  const vault = el('g', { class: 'ec-node ec-vaultwrap' });
  vault.append(
    el('rect', { x: 333, y: 104, width: 154, height: 104, rx: 12 }),
    el('text', { x: 410, y: 130, class: 'ec-node-title ec-vault-title', 'text-anchor': 'middle' }, 'ESCROW'),
    el('text', { x: 410, y: 146, class: 'ec-node-sub', 'text-anchor': 'middle' }, `${data.escrowToken} vault`),
  );
  svg.appendChild(vault);

  // evaluator chair (top center) + stem to the release gate
  const stem = el('line', { x1: 410, y1: 82, x2: 410, y2: 104, class: 'ec-stem' });
  svg.appendChild(stem);
  const chair = el('g', { class: 'ec-chair' });
  const chairRect = el('rect', { x: 300, y: 22, width: 220, height: 58, rx: 11 });
  const chairTitle = el('text', { x: 410, y: 47, class: 'ec-chair-title', 'text-anchor': 'middle' }, '');
  const chairSub = el('text', { x: 410, y: 64, class: 'ec-chair-sub', 'text-anchor': 'middle' }, '');
  const chairTag = el('text', { x: 410, y: 16, class: 'ec-label', 'text-anchor': 'middle' }, "EVALUATOR'S CHAIR");
  chair.append(chairRect, chairTitle, chairSub);
  svg.append(chairTag, chair);

  // chips
  function chip(cls: string, label: string) {
    const g = el('g', { class: `ec-chip ${cls}` });
    const rect = el('rect', { x: -52, y: -13, width: 104, height: 26, rx: 8 });
    const txt = el('text', { x: 0, y: 4, class: 'ec-chip-txt', 'text-anchor': 'middle' }, label);
    g.append(rect, txt);
    return { g, rect, txt };
  }
  const coin = chip('ec-coin', '$1.00 USDC');
  const deliv = chip('ec-deliv', '0x… deliverable');
  svg.append(deliv.g, coin.g);

  function placeChip(c: { g: SVGGElement }, p: { x: number; y: number }, show: boolean) {
    c.g.style.transform = `translate(${p.x}px, ${p.y}px)`;
    c.g.style.opacity = show ? '1' : '0';
  }

  /* ---------------- controls ---------------- */
  const controls = document.createElement('div');
  controls.className = 'ec-controls';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'ec-tabs';
  tabsWrap.setAttribute('role', 'tablist');
  tabsWrap.setAttribute('aria-label', 'Who sits in the evaluator chair');
  const tabs: HTMLButtonElement[] = MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', m.label);
    b.textContent = m.label;
    tabsWrap.appendChild(b);
    return b;
  });

  const acts = document.createElement('div');
  acts.className = 'ec-acts';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'ec-btn ec-run';
  runBtn.textContent = '▶ run job';
  const cheatBtn = document.createElement('button');
  cheatBtn.type = 'button';
  cheatBtn.className = 'ec-btn ec-cheat';
  acts.append(runBtn, cheatBtn);

  controls.append(tabsWrap, acts);
  controlsSlot.appendChild(controls);

  /* ---------------- panel ---------------- */
  const explain = document.createElement('div');
  explain.className = 'ec-explain';
  const verdict = document.createElement('div');
  verdict.className = 'ec-verdict';
  verdict.setAttribute('role', 'status');
  verdict.setAttribute('aria-live', 'polite');
  const decidesLine = document.createElement('div');
  decidesLine.className = 'ec-row';
  const exposedLine = document.createElement('div');
  exposedLine.className = 'ec-row';
  const trustLine = document.createElement('div');
  trustLine.className = 'ec-row';
  const reason = document.createElement('div');
  reason.className = 'ec-reason';
  const share = document.createElement('div');
  share.className = 'ec-share';
  explain.append(verdict, decidesLine, exposedLine, trustLine, reason, share);
  panel.appendChild(explain);

  /* ---------------- caption ---------------- */
  const note = document.createElement('div');
  note.className = 'ec-note';
  note.textContent = `ACP escrow on ${data.chain} · ${data.contract.slice(0, 10)}… · ${data.jobsTotal.toLocaleString()} jobs since 2026-04-08, ~${data.jobsPerDay}/day · evaluator field read from JobCreated logs`;
  caption.appendChild(note);

  function kv(label: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'ec-k';
    span.textContent = label;
    return span;
  }

  /* ---------------- state ---------------- */
  let active = 0;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  function resetStage() {
    coin.g.style.transition = 'none';
    deliv.g.style.transition = 'none';
    coin.txt.textContent = '$1.00 USDC';
    deliv.txt.textContent = '0x… deliverable';
    deliv.g.setAttribute('class', 'ec-chip ec-deliv');
    placeChip(coin, AT_CLIENT, false);
    placeChip(deliv, AT_PROVIDER, false);
    chanFund.setAttribute('class', 'ec-channel');
    chanRelease.setAttribute('class', 'ec-channel');
    relLabel.textContent = 'RELEASE';
    // force reflow so subsequent transitions animate from these poses
    void svg.getBBox();
    coin.g.style.transition = '';
    deliv.g.style.transition = '';
  }

  function renderMode() {
    const m = MODES[active]!;
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === active)));
    chair.setAttribute('class', `ec-chair is-${m.id}`);
    chairTitle.textContent = m.chair;
    chairSub.textContent = m.chairSub;
    stem.style.opacity = m.id === 'none' ? '.35' : '1';

    cheatBtn.textContent = `⚡ ${m.attackLabel}`;
    cheatBtn.setAttribute('aria-label', `Run the adversarial path: ${m.attackLabel}`);

    decidesLine.innerHTML = '';
    decidesLine.append(kv('decides'), document.createTextNode(m.decides));
    exposedLine.innerHTML = '';
    exposedLine.append(kv('exposed'), document.createTextNode(m.exposed));
    trustLine.innerHTML = '';
    trustLine.append(kv('trust'), document.createTextNode(m.trust));
    trustLine.className = 'ec-row ec-warn';
    reason.textContent = '';

    share.innerHTML = '';
    const s = data.sample;
    share.innerHTML = `on-chain (${s.label}): <b>${s.self}/${s.size}</b> jobs let the client grade itself, ` +
      `<b>${s.independent}</b> used an independent evaluator. this design: <b>${m.share}</b>.`;

    verdict.className = 'ec-verdict';
    verdict.textContent = '';
    resetStage();
    syncButtons();
  }

  function syncButtons() {
    runBtn.setAttribute('aria-disabled', String(busy));
    cheatBtn.setAttribute('aria-disabled', String(busy));
  }

  // shared opening: fund + submit, then call decide()
  function play(cheat: boolean) {
    if (busy) return;
    const m = MODES[active]!;
    busy = true;
    syncButtons();
    resetStage();
    verdict.className = 'ec-verdict';
    verdict.textContent = '';
    reason.textContent = '';

    // 1. client funds the escrow
    later(() => { placeChip(coin, AT_CLIENT, true); }, 60);
    later(() => { chanFund.setAttribute('class', 'ec-channel is-pay'); placeChip(coin, AT_VAULT_HI, true); }, 360);

    // 2. provider submits a deliverable (junk if the provider is the cheater)
    const providerCheats = cheat && (m.id === 'none' || m.id === 'independent');
    later(() => {
      if (providerCheats) {
        deliv.g.setAttribute('class', 'ec-chip ec-deliv is-junk');
        deliv.txt.textContent = '0x… junk';
      }
      placeChip(deliv, AT_PROVIDER, true);
    }, 900);
    later(() => { placeChip(deliv, AT_VAULT_LO, true); }, 1180);
    later(() => { chanFund.setAttribute('class', 'ec-channel'); }, 1200);

    // 3. the chair decides
    later(() => decide(cheat, providerCheats), 1900);
  }

  function settle(toProvider: boolean) {
    // money leaves the vault to provider (pay) or back to client (refund)
    if (toProvider) {
      chanRelease.setAttribute('class', 'ec-channel is-pay');
      relLabel.textContent = 'RELEASE → PROVIDER';
      placeChip(coin, AT_PROVIDER, true);
      later(() => { placeChip(deliv, { x: AT_VAULT_LO.x, y: AT_VAULT_LO.y }, false); }, 200);
    } else {
      chanRelease.setAttribute('class', 'ec-channel is-refund');
      relLabel.textContent = 'REFUND → CLIENT';
      // money refunds along the fund channel back to the client
      chanFund.setAttribute('class', 'ec-channel is-refund');
      placeChip(coin, AT_CLIENT, true);
    }
  }

  function setVerdict(ok: boolean, text: string, why: string) {
    verdict.className = `ec-verdict is-on ${ok ? 'ec-ok' : 'ec-bad'}`;
    verdict.textContent = `${ok ? '✓' : '✗'} ${text}`;
    reason.textContent = why;
    later(() => { busy = false; syncButtons(); }, 700);
  }

  function decide(cheat: boolean, providerCheats: boolean) {
    const m = MODES[active]!;
    if (!cheat) {
      // happy path: deliverable accepted, provider paid
      settle(true);
      setVerdict(true, 'provider paid · buyer keeps the work', m.happy);
      return;
    }
    if (m.id === 'self') {
      // buyer griefs: rejects, refunds itself, walks off with the deliverable
      settle(false);
      later(() => { placeChip(deliv, { x: AT_CLIENT.x, y: 212 }, true); }, 260);
      setVerdict(false, 'buyer clawed back the escrow — provider worked for free',
        m.attack);
    } else if (m.id === 'independent') {
      // neutral evaluator catches the junk and refunds the buyer
      settle(false);
      later(() => { placeChip(deliv, AT_VAULT_LO, false); }, 260);
      setVerdict(true, 'evaluator caught the junk — buyer refunded',
        m.attack);
    } else {
      // none: auto-release pays the provider for junk
      settle(true);
      setVerdict(false, 'junk delivered, escrow released anyway — buyer paid for nothing',
        m.attack);
    }
    void providerCheats;
  }

  /* ---------------- events ---------------- */
  const onTab = (e: Event) => {
    const i = tabs.indexOf(e.currentTarget as HTMLButtonElement);
    if (i >= 0 && i !== active && !busy) { active = i; renderMode(); }
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (active + dir + tabs.length) % tabs.length;
      tabs[next]!.focus();
      if (!busy) { active = next; renderMode(); }
    }
  };
  tabs.forEach((t) => { t.addEventListener('click', onTab); t.addEventListener('keydown', onTabKey); });
  const onRun = () => play(false);
  const onCheat = () => play(true);
  runBtn.addEventListener('click', onRun);
  cheatBtn.addEventListener('click', onCheat);

  renderMode();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    tabs.forEach((t) => { t.removeEventListener('click', onTab); t.removeEventListener('keydown', onTabKey); });
    runBtn.removeEventListener('click', onRun);
    cheatBtn.removeEventListener('click', onCheat);
    layout.dispose();
    style.remove();
  };
}
