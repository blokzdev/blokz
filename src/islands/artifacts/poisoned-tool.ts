/**
 * Artifact: poisoned-tool — The Poisoned Tool
 * Manifest: content/artifacts/poisoned-tool/manifest.json
 *
 * A tool-poisoning attack on an on-chain agent, made explorable. An autonomous
 * agent is told to pay an invoice. One of its MCP tools (`resolve_payee`) hides
 * an instruction inside its *description* — the part the user never sees but the
 * model reads as trusted context — that redirects the transfer to an attacker.
 * Pick a defense layer and hit "run the agent": with model alignment alone the
 * 500 USDC is drained (MCPTox: even the best refuser refused <3% of these);
 * the tool / client / policy / custody layers each stop or bound it differently.
 *
 * Layout: shared responsive primitive (stage diagram · panel = model stat +
 * verdict/reason/loss · footer controls = defense tabs + run · caption source).
 * Numbers snapshotted in ./data.json (MCPTox + Invariant Labs + OX Security).
 */
import raw from '../../../content/artifacts/poisoned-tool/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

interface Defense {
  id: string;
  label: string;
  layer: string;
  result: 'drained' | 'blocked' | 'reverted' | 'capped';
  loss: number;
  verdict: string;
  reason: string;
}
interface Data {
  scenario: { task: string; amount: number; unit: string; chain: string; vendor: string; attacker: string };
  tool: { name: string; visible: string; poison: string };
  model: { note: string; fleetAvgAsr: number; topRefuser: string; topRefusalRate: number; examples: { name: string; asr: number }[] };
  cap: number;
  defenses: Defense[];
}
const data = raw as unknown as Data;
const DEF = data.defenses;

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
    stageAspect: '800/320',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .pt-stage { position:absolute; inset:0; border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; overflow:hidden; }
    .pt-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .pt-node rect { fill:#0e1526; stroke:rgba(124,140,255,.28); transition:stroke .3s, opacity .3s, fill .3s; }
    .pt-title { fill:#e7eaf3; font:600 12px 'Space Grotesk', system-ui, sans-serif; }
    .pt-sub { fill:#8d95ad; font:500 9px 'JetBrains Mono', monospace; }
    .pt-label { fill:#5b6378; font:500 8.5px 'JetBrains Mono', monospace; letter-spacing:.12em; }
    .pt-mono { fill:#8d95ad; font:500 10px 'JetBrains Mono', monospace; }
    .pt-bright { fill:#e7eaf3; font:600 11px 'JetBrains Mono', monospace; }
    .pt-visible { fill:#9aa3bd; font:500 9.5px 'JetBrains Mono', monospace; }
    .pt-poison { fill:#f87171; font:600 9.5px 'JetBrains Mono', monospace; }
    .pt-cyan { fill:#22d3ee; } .pt-red { fill:#f87171; } .pt-amber { fill:#f5c451; }
    .pt-tool rect { fill:#0e1526; stroke:rgba(124,140,255,.24); transition:stroke .3s, fill .3s; }
    .pt-tool.is-hot rect { stroke:#5b8cff; fill:rgba(91,140,255,.08); }
    .pt-tool.is-quar rect { stroke:#f87171; fill:rgba(248,113,113,.08); }
    .pt-slot rect { transition:stroke .3s, fill .3s, opacity .3s; }
    .pt-slot.is-on-cyan rect { stroke:#22d3ee; fill:rgba(34,211,238,.10); }
    .pt-slot.is-on-red rect { stroke:#f87171; fill:rgba(248,113,113,.12); }
    .pt-dim { opacity:.34; }
    .pt-path { stroke:rgba(124,140,255,.22); stroke-width:2; fill:none; }
    .pt-read { stroke:#8b5cf6; stroke-width:2; stroke-dasharray:3 6; fill:none; opacity:0; transition:opacity .3s; }
    .pt-gate rect { fill:#0e1526; stroke:rgba(124,140,255,.3); transition:stroke .3s, fill .3s; }
    .pt-gate.is-block rect { stroke:#22d3ee; fill:rgba(34,211,238,.08); }
    .pt-gate.is-pass rect { stroke:rgba(124,140,255,.18); opacity:.5; }
    .pt-gate-x { fill:#22d3ee; font:700 16px monospace; opacity:0; transition:opacity .3s; }

    /* controls */
    .pt-controls { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .pt-tabs { display:inline-flex; flex-wrap:wrap; gap:6px; }
    .pt-tabs button { appearance:none; border:1px solid rgba(124,140,255,.22);
      background:rgba(91,140,255,.06); color:#8d95ad; border-radius:8px;
      font:500 10.5px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:8px 11px;
      max-width:100%; cursor:pointer; transition:color .2s, background .2s, border-color .2s; }
    .pt-tabs button:hover { background:rgba(91,140,255,.16); border-color:rgba(124,140,255,.55); }
    .pt-tabs button[aria-selected="true"] { background:rgba(91,140,255,.20);
      border-color:#5b8cff; color:#e7eaf3; }
    .pt-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .pt-run { appearance:none; border:1px solid rgba(248,113,113,.45);
      background:rgba(248,113,113,.10); color:#fca5a5; border-radius:9px;
      font:600 11px 'JetBrains Mono', monospace; padding:9px 16px; max-width:100%;
      cursor:pointer; transition:background .2s, border-color .2s; }
    .pt-run:hover { background:rgba(248,113,113,.2); border-color:rgba(248,113,113,.8); }
    .pt-run:focus-visible { outline:2px solid #f87171; outline-offset:-2px; }
    .pt-run[aria-disabled="true"] { opacity:.4; cursor:default; }

    /* panel */
    .pt-panel { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%; }
    .pt-stat { border:1px solid rgba(124,140,255,.16); border-radius:9px; padding:9px 11px;
      background:rgba(91,140,255,.04); min-width:0; }
    .pt-stat-h { font:600 9px 'JetBrains Mono', monospace; letter-spacing:.12em; color:#5b6378;
      text-transform:uppercase; margin-bottom:5px; }
    .pt-big { font:700 19px 'Space Grotesk', system-ui, sans-serif; color:#f87171; line-height:1; }
    .pt-stat-note { font:500 9.5px 'JetBrains Mono', monospace; color:#7e879d; line-height:1.5;
      margin-top:5px; overflow-wrap:anywhere; }
    .pt-asr { display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:7px; }
    .pt-asr span { font:500 9px 'JetBrains Mono', monospace; color:#8d95ad; white-space:nowrap; }
    .pt-asr b { color:#f5c451; font-weight:600; }
    .pt-verdict { min-height:16px; font:700 12px 'JetBrains Mono', monospace; opacity:0;
      transition:opacity .35s; overflow-wrap:anywhere; min-width:0; }
    .pt-verdict.is-on { opacity:1; }
    .pt-verdict.v-bad { color:#f87171; } .pt-verdict.v-ok { color:#22d3ee; } .pt-verdict.v-warn { color:#f5c451; }
    .pt-row { font:500 10.5px 'JetBrains Mono', monospace; color:#8d95ad; line-height:1.5;
      overflow-wrap:anywhere; min-width:0; }
    .pt-row .pt-k { color:#5b6378; text-transform:uppercase; letter-spacing:.06em; font-size:9px; margin-right:6px; }
    .pt-reason { color:#6b7488; line-height:1.55; }
    .pt-note { font-size:9.5px; color:#5b6378; letter-spacing:.02em; font-family:'JetBrains Mono', monospace;
      line-height:1.5; overflow-wrap:anywhere; }
  `;
  stage.appendChild(style);

  /* ---------------- stage ---------------- */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'pt-stage';
  const svg = el('svg', { viewBox: '0 0 800 320', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'On-chain agent tool-poisoning diagram');
  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  const kf = el('style');
  kf.textContent = `@keyframes pt-dash { to { stroke-dashoffset:-90; } } .pt-read-anim { animation:pt-dash 1s linear infinite; }`;
  svg.appendChild(kf);

  // paths first (under nodes)
  const MIDY = 150;
  // agent -> tool -> gate -> chain spine
  svg.appendChild(el('path', { d: `M178 ${MIDY} H250`, class: 'pt-path' }));
  svg.appendChild(el('path', { d: `M470 ${MIDY} H536`, class: 'pt-path' }));
  svg.appendChild(el('path', { d: `M584 ${MIDY} H620`, class: 'pt-path' }));
  // "model reads description" pulse (tool -> agent)
  const readPath = el('path', { d: `M250 110 C 215 110, 200 ${MIDY}, 178 ${MIDY}`, class: 'pt-read' });
  svg.appendChild(readPath);
  const readLabel = el('text', { x: 205, y: 100, class: 'pt-label pt-violet', 'text-anchor': 'middle' }, '');
  readLabel.setAttribute('fill', '#a78bfa');
  readLabel.style.opacity = '0';
  readLabel.style.transition = 'opacity .3s';
  svg.appendChild(readLabel);

  // AGENT node
  const agent = el('g', { class: 'pt-node' });
  agent.append(
    el('rect', { x: 24, y: 118, width: 154, height: 64, rx: 11 }),
    el('text', { x: 101, y: 144, class: 'pt-title', 'text-anchor': 'middle' }, 'AGENT'),
    el('text', { x: 101, y: 162, class: 'pt-sub', 'text-anchor': 'middle' }, 'LLM · holds the key'),
  );
  svg.appendChild(agent);

  // TOOL card (the attack surface)
  const tool = el('g', { class: 'pt-tool' });
  tool.appendChild(el('rect', { x: 250, y: 40, width: 220, height: 232, rx: 12 }));
  tool.appendChild(el('text', { x: 262, y: 62, class: 'pt-bright pt-accent' }, `▸ ${data.tool.name}()`));
  (tool.lastChild as SVGTextElement).setAttribute('fill', '#7c8cff');
  tool.appendChild(el('text', { x: 262, y: 78, class: 'pt-label' }, 'MCP TOOL · description'));
  // visible block
  tool.appendChild(el('text', { x: 262, y: 100, class: 'pt-label' }, 'WHAT THE USER SEES'));
  wrapText(tool, data.tool.visible, 262, 116, 196, 'pt-visible');
  // divider
  tool.appendChild(el('line', { x1: 262, y1: 150, x2: 458, y2: 150, stroke: 'rgba(124,140,255,.16)', 'stroke-width': 1 }));
  tool.appendChild(el('text', { x: 262, y: 168, class: 'pt-label' }, 'WHAT THE MODEL READS'));
  const poisonG = el('g');
  poisonG.style.opacity = '0';
  poisonG.style.transition = 'opacity .4s';
  wrapText(poisonG, data.tool.poison, 262, 184, 196, 'pt-poison');
  tool.appendChild(poisonG);
  // quarantine stamp (sits over the model-reads region, shown only when scanned)
  const quar = el('text', { x: 360, y: 214, class: 'pt-red', 'text-anchor': 'middle', font: "700 14px 'JetBrains Mono', monospace" }, '🛇 quarantined');
  quar.style.opacity = '0';
  quar.style.transition = 'opacity .3s';
  tool.appendChild(quar);
  svg.appendChild(tool);

  // GATE (defense layer)
  const gate = el('g', { class: 'pt-gate' });
  gate.append(
    el('rect', { x: 536, y: 116, width: 48, height: 68, rx: 9 }),
    el('text', { x: 560, y: 137, class: 'pt-label', 'text-anchor': 'middle' }, 'GUARD'),
  );
  const gateLayer = el('text', { x: 560, y: 178, class: 'pt-sub', 'text-anchor': 'middle' }, '');
  const gateX = el('text', { x: 560, y: 162, class: 'pt-gate-x', 'text-anchor': 'middle' }, '✕');
  gate.append(gateLayer, gateX);
  svg.appendChild(gate);

  // CHAIN box + recipient slots
  const chain = el('g', { class: 'pt-node' });
  chain.append(
    el('rect', { x: 620, y: 40, width: 158, height: 232, rx: 12 }),
    el('text', { x: 699, y: 62, class: 'pt-title', 'text-anchor': 'middle' }, data.scenario.chain),
    el('text', { x: 699, y: 78, class: 'pt-label', 'text-anchor': 'middle' }, 'RECIPIENT'),
  );
  svg.appendChild(chain);

  const vendor = el('g', { class: 'pt-slot' });
  vendor.append(
    el('rect', { x: 634, y: 92, width: 130, height: 64, rx: 9, fill: '#0e1526', stroke: 'rgba(124,140,255,.24)' }),
    el('text', { x: 699, y: 116, class: 'pt-bright', 'text-anchor': 'middle' }, 'Acme Supplies'),
    el('text', { x: 699, y: 134, class: 'pt-mono', 'text-anchor': 'middle' }, data.scenario.vendor),
    el('text', { x: 699, y: 148, class: 'pt-label', 'text-anchor': 'middle' }, 'THE REAL VENDOR'),
  );
  const attacker = el('g', { class: 'pt-slot' });
  attacker.append(
    el('rect', { x: 634, y: 172, width: 130, height: 64, rx: 9, fill: '#0e1526', stroke: 'rgba(124,140,255,.24)' }),
    el('text', { x: 699, y: 196, class: 'pt-bright', 'text-anchor': 'middle' }, 'attacker'),
    el('text', { x: 699, y: 214, class: 'pt-mono', 'text-anchor': 'middle' }, data.scenario.attacker),
    el('text', { x: 699, y: 228, class: 'pt-label', 'text-anchor': 'middle' }, 'POISON TARGET'),
  );
  svg.append(vendor, attacker);

  // transfer chip (the 500 USDC value moving from agent to a recipient)
  const chip = el('g');
  const chipRect = el('rect', { x: -44, y: -13, width: 88, height: 26, rx: 7, fill: 'rgba(245,196,81,.12)', stroke: 'rgba(245,196,81,.6)' });
  const chipText = el('text', { x: 0, y: 5, class: 'pt-amber', 'text-anchor': 'middle', font: "600 11px 'JetBrains Mono', monospace" }, `${data.scenario.amount} ${data.scenario.unit}`);
  chip.append(chipRect, chipText);
  const CHIP_HOME = { x: 101, y: MIDY };
  chip.style.opacity = '0';
  chip.style.transition = 'transform .8s cubic-bezier(.22,.8,.3,1), opacity .35s';
  chip.style.transform = `translate(${CHIP_HOME.x}px, ${CHIP_HOME.y}px)`;
  svg.appendChild(chip);

  /* ---------------- controls ---------------- */
  const controls = document.createElement('div');
  controls.className = 'pt-controls';
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'pt-tabs';
  tabsWrap.setAttribute('role', 'tablist');
  tabsWrap.setAttribute('aria-label', 'Defense layer');
  const tabs: HTMLButtonElement[] = DEF.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Defense: ${d.label}`);
    b.textContent = d.label;
    tabsWrap.appendChild(b);
    return b;
  });
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'pt-run';
  runBtn.setAttribute('aria-label', 'Run the agent on the invoice task');
  runBtn.textContent = '▶ run the agent';
  controls.append(tabsWrap, runBtn);
  controlsSlot.appendChild(controls);

  /* ---------------- panel ---------------- */
  const panelWrap = document.createElement('div');
  panelWrap.className = 'pt-panel';

  const stat = document.createElement('div');
  stat.className = 'pt-stat';
  const asrList = data.model.examples
    .map((e) => `<span><b>${e.asr}%</b> ${e.name}</span>`)
    .join('');
  stat.innerHTML =
    `<div class="pt-stat-h">alignment won't save you</div>` +
    `<div class="pt-big">&lt;${data.model.topRefusalRate}%</div>` +
    `<div class="pt-stat-note">refusal rate of the best-aligned model (${data.model.topRefuser}) against tool poisoning. Fleet average attack success: ${data.model.fleetAvgAsr}%.</div>` +
    `<div class="pt-asr">${asrList}</div>`;
  panelWrap.appendChild(stat);

  const verdict = document.createElement('div');
  verdict.className = 'pt-verdict';
  verdict.setAttribute('role', 'status');
  verdict.setAttribute('aria-live', 'polite');
  const lossLine = document.createElement('div');
  lossLine.className = 'pt-row';
  const layerLine = document.createElement('div');
  layerLine.className = 'pt-row';
  const reasonLine = document.createElement('div');
  reasonLine.className = 'pt-reason pt-row';
  panelWrap.append(verdict, lossLine, layerLine, reasonLine);
  panel.appendChild(panelWrap);

  /* ---------------- caption ---------------- */
  const note = document.createElement('div');
  note.className = 'pt-note';
  note.textContent =
    'Scenario illustrative; attack-success & refusal rates from MCPTox (45 live MCP servers, 353 tools). Mechanism per Invariant Labs.';
  caption.appendChild(note);

  /* ---------------- state machine ---------------- */
  let active = 0;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  function resetVisuals() {
    chip.style.transition = 'none';
    chip.style.transform = `translate(${CHIP_HOME.x}px, ${CHIP_HOME.y}px)`;
    chip.style.opacity = '0';
    chipText.textContent = `${data.scenario.amount} ${data.scenario.unit}`;
    poisonG.style.opacity = '0';
    quar.style.opacity = '0';
    readPath.style.opacity = '0';
    readPath.classList.remove('pt-read-anim');
    readLabel.style.opacity = '0';
    gateX.style.opacity = '0';
    tool.classList.remove('is-hot', 'is-quar');
    vendor.classList.remove('is-on-cyan');
    attacker.classList.remove('is-on-red');
    verdict.className = 'pt-verdict';
    verdict.textContent = '';
    lossLine.textContent = '';
    layerLine.textContent = '';
    reasonLine.textContent = '';
    void svg.getBBox();
    chip.style.transition = 'transform .8s cubic-bezier(.22,.8,.3,1), opacity .35s';
  }

  function render() {
    const d = DEF[active]!;
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === active)));
    resetVisuals();
    // show the gate styling for the chosen layer (passive preview)
    const passive = d.id === 'none';
    gate.setAttribute('class', passive ? 'pt-gate is-pass' : 'pt-gate');
    gateLayer.textContent = passive ? '' : d.layer.split(' ')[0]!;
    syncButtons();
  }

  function syncButtons() {
    runBtn.setAttribute('aria-disabled', String(busy));
  }

  function kv(label: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'pt-k';
    s.textContent = label;
    return s;
  }

  function run() {
    if (busy) return;
    const d = DEF[active]!;
    busy = true; syncButtons();
    resetVisuals();

    // 1. model reads the tool description
    tool.classList.add('is-hot');
    readPath.style.opacity = '1';
    readPath.classList.add('pt-read-anim');
    readLabel.textContent = 'reads desc';
    readLabel.style.opacity = '1';

    // description scan catches it at the tool layer BEFORE the model reads
    if (d.id === 'scan') {
      readPath.style.opacity = '0';
      readLabel.style.opacity = '0';
      tool.classList.remove('is-hot');
      tool.classList.add('is-quar');
      later(() => { quar.style.opacity = '1'; }, 250);
      finish(d, 900);
      return;
    }

    // 2. poison is revealed; model obeys, recipient flips to attacker
    later(() => {
      poisonG.style.opacity = '1';
      readPath.classList.remove('pt-read-anim');
      readPath.style.opacity = '0';
      readLabel.style.opacity = '0';
      attacker.classList.add('is-on-red');
    }, 850);

    // 3. agent signs the transfer; chip leaves toward the attacker
    later(() => {
      chip.style.opacity = '1';
      const blockedAtGate = d.id === 'confirm' || d.id === 'policy';
      if (blockedAtGate) {
        gate.setAttribute('class', 'pt-gate is-block');
        chip.style.transform = `translate(520px, ${MIDY}px)`; // stops at the guard
        later(() => { gateX.style.opacity = '1'; chip.style.opacity = '0'; }, 850);
      } else if (d.id === 'cap') {
        // redirect lands, but only the capped amount
        chip.style.transform = `translate(699px, 204px)`;
        later(() => { chipText.textContent = `${data.cap} ${data.scenario.unit}`; }, 500);
      } else {
        chip.style.transform = `translate(699px, 204px)`; // lands on attacker
      }
    }, 1500);

    finish(d, 2700);
  }

  function finish(d: Defense, at: number) {
    later(() => {
      verdict.textContent = d.verdict;
      verdict.className =
        'pt-verdict is-on ' + (d.result === 'drained' ? 'v-bad' : d.result === 'capped' ? 'v-warn' : 'v-ok');
      lossLine.innerHTML = '';
      lossLine.append(kv('lost'), document.createTextNode(`${d.loss} of ${data.scenario.amount} ${data.scenario.unit}`));
      layerLine.innerHTML = '';
      layerLine.append(kv('stopped at'), document.createTextNode(d.id === 'none' ? '— nothing stops it' : d.layer));
      reasonLine.textContent = d.reason;
      later(() => { busy = false; syncButtons(); }, 200);
    }, at);
  }

  /* ---------------- events ---------------- */
  const onTab = (e: Event) => {
    const i = tabs.indexOf(e.currentTarget as HTMLButtonElement);
    if (i >= 0 && i !== active && !busy) { active = i; render(); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (active + dir + tabs.length) % tabs.length;
      tabs[next]!.focus();
      if (!busy) { active = next; render(); }
    }
  };
  tabs.forEach((t) => { t.addEventListener('click', onTab); t.addEventListener('keydown', onKey); });
  const onRun = () => run();
  runBtn.addEventListener('click', onRun);

  render();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    tabs.forEach((t) => { t.removeEventListener('click', onTab); t.removeEventListener('keydown', onKey); });
    runBtn.removeEventListener('click', onRun);
    layout.dispose();
    style.remove();
  };

  /* ---------------- helpers ---------------- */
  function wrapText(parent: SVGElement, text: string, x: number, y: number, maxW: number, cls: string) {
    const words = text.split(/\s+/);
    const charW = 5.8; // approx for 9.5px mono
    const maxChars = Math.max(8, Math.floor(maxW / charW));
    let line = '';
    let dy = 0;
    const lines: string[] = [];
    for (const w of words) {
      const probe = line ? line + ' ' + w : w;
      if (probe.length > maxChars && line) { lines.push(line); line = w; } else { line = probe; }
    }
    if (line) lines.push(line);
    for (const l of lines.slice(0, 6)) {
      parent.appendChild(el('text', { x, y: y + dy, class: cls }, l));
      dy += 12.5;
    }
  }
}
