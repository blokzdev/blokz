/**
 * Artifact: nullifier-gate — Nullifier Gate
 * Manifest: content/artifacts/nullifier-gate/manifest.json
 *
 * The Semaphore/PBH double-signal defense as an explorable SVG. A prover on
 * the left holds membership in an identity tree; the scope card encodes
 * PBH's external nullifier (version | nonce | month | year); the gate on the
 * right keeps the spent-nullifier ledger. Send a transaction to spend a
 * nullifier, replay it to watch the gate reject the collision with the real
 * contract error names, and roll the month to see the scope change reset the
 * quota. Quota scaled to 5 (vs 30 in the PBH docs) so the ledger fits.
 *
 * Layout: shared responsive primitive (stage = the gate/ledger diagram SVG;
 * footer controls = send / replay / roll-month as real HTML buttons; panel =
 * the status / quota / revert-error readout de-baked to HTML; caption = the
 * interaction hint). The action buttons and the verdict/error readout were
 * de-baked from the single SVG so they stay tappable and legible on portrait
 * phones. All state, the spend/replay/roll machine, and the exact contract
 * revert strings are preserved.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const QUOTA = 5; // demo-scaled; PBH docs use 30/month
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FLY_MS = 700;

const randHex = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');

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
    // Native diagram ratio (viewBox 800×290) — stage height derives from width
    // so it sits at natural proportion with no dead gap, no crop.
    stageAspect: '800/290',
  });
  const { stage, panel, controls: controlsSlot, caption: captionSlot } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .ng-stage { position:absolute; inset:0; }
    .ng-stage svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .ng-panel { fill: #0d1322; stroke: rgba(124,140,255,0.18); }
    .ng-label { fill: #5b6378; font: 500 9px 'JetBrains Mono', monospace; letter-spacing: .14em; }
    .ng-value { fill: #8d95ad; font: 500 11px 'JetBrains Mono', monospace; }
    .ng-bright { fill: #e7eaf3; }
    .ng-accent { fill: #5b8cff; }
    .ng-cyan { fill: #22d3ee; }
    .ng-leaf { fill: rgba(124,140,255,0.18); }
    .ng-leaf-you { fill: #5b8cff; }
    .ng-edge { stroke: rgba(124,140,255,0.16); }
    .ng-chip { fill: rgba(34,211,238,0.10); stroke: rgba(34,211,238,0.45); }
    .ng-chip-text { fill: #67e8f9; font: 500 9px 'JetBrains Mono', monospace; }
    .ng-flyer { transition: transform ${FLY_MS}ms cubic-bezier(.22,.8,.3,1), opacity .4s; }
    .ng-gate { stroke: rgba(124,140,255,0.35); stroke-width: 2; fill: none; transition: stroke .3s; }
    .ng-gate-ok { stroke: #22d3ee; }
    .ng-gate-bad { stroke: #f87171; }
    .ng-quota { fill: rgba(91,140,255,0.16); }
    .ng-quota-used { fill: #5b8cff; }
    .ng-fine { fill: #5b6378; font: 500 8.5px 'JetBrains Mono', monospace; }

    /* --- de-baked HTML controls (send / replay / roll-month) --- */
    .ng-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      min-width:0; max-width:100%; }
    .ng-controls button { appearance:none; border:1px solid rgba(124,140,255,.28);
      background:rgba(91,140,255,.10); color:#e7eaf3; border-radius:8px;
      font:500 11px 'JetBrains Mono', monospace; letter-spacing:.02em; padding:9px 14px;
      max-width:100%; cursor:pointer; transition:background .2s, border-color .2s; }
    .ng-controls button:hover { background:rgba(91,140,255,.22); border-color:rgba(124,140,255,.7); }
    .ng-controls button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .ng-controls button[aria-disabled="true"] { opacity:.35; cursor:default; }

    /* --- de-baked HTML readout (status / quota / revert error) --- */
    .ng-readout { display:flex; flex-direction:column; gap:8px;
      min-width:0; max-width:100%; overflow-wrap:anywhere; }
    .ng-verdict { min-height:18px; font:700 12px 'JetBrains Mono', monospace;
      max-width:100%; overflow-wrap:anywhere; opacity:0; transition:opacity .3s; }
    .ng-verdict.is-on { opacity:1; }
    .ng-verdict.ng-ok { color:#22d3ee; }
    .ng-verdict.ng-bad { color:#f87171; }
    .ng-status { font:500 11px 'JetBrains Mono', monospace; color:#8d95ad;
      max-width:100%; overflow-wrap:anywhere; line-height:1.5; }
    .ng-meter { display:flex; flex-direction:column; gap:5px; }
    .ng-meter-label { font:500 9px 'JetBrains Mono', monospace; color:#5b6378;
      letter-spacing:.14em; }
    .ng-cells { display:flex; gap:5px; }
    .ng-cell { width:22px; height:9px; border-radius:2px; background:rgba(91,140,255,0.16);
      transition:background .2s; }
    .ng-cell.is-used { background:#5b8cff; }
    .ng-fineprint { font:500 8.5px 'JetBrains Mono', monospace; color:#5b6378; }
    .ng-caption { font:500 11px 'JetBrains Mono', monospace; color:#8d95ad; }
  `;
  stage.appendChild(style);

  /* ---------------- stage: the gate/ledger diagram SVG ---------------- */
  const stageWrap = document.createElement('div');
  stageWrap.className = 'ng-stage';
  // Trimmed to the diagram: the action buttons (y 380–418), verdict (y 318)
  // and caption (y 352) are now HTML, so the viewBox ends just below the
  // quota fine print (y 300). Top trimmed to the first label (y 34).
  const svg = el('svg', { viewBox: '0 20 800 290', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Semaphore nullifier gate: identity tree, scope card, and spent-nullifier ledger');
  stageWrap.appendChild(svg);
  stage.appendChild(stageWrap);

  /* ---------- left: identity inside the tree ---------- */
  svg.appendChild(el('text', { x: 24, y: 34, class: 'ng-label' }, 'WORLD ID SET'));
  svg.appendChild(el('text', { x: 24, y: 48, class: 'ng-fine' }, 'depth-30 merkle tree · 2^30 leaves'));
  // mini tree: 8 leaves, 4 levels
  const treeX = 30;
  const leafW = 18;
  const gap = 4;
  const levelY = [196, 158, 120, 82];
  const leafCenters: number[] = [];
  for (let i = 0; i < 8; i++) leafCenters.push(treeX + i * (leafW + gap) + leafW / 2);
  let centers = leafCenters;
  for (let l = 1; l < 4; l++) {
    const next: number[] = [];
    for (let i = 0; i < centers.length; i += 2) {
      const cx = (centers[i]! + centers[i + 1]!) / 2;
      svg.appendChild(el('line', { x1: centers[i]!, y1: levelY[l - 1]! - 6, x2: cx, y2: levelY[l]! + 6, class: 'ng-edge' }));
      svg.appendChild(el('line', { x1: centers[i + 1]!, y1: levelY[l - 1]! - 6, x2: cx, y2: levelY[l]! + 6, class: 'ng-edge' }));
      next.push(cx);
    }
    centers = next;
    for (const cx of next) svg.appendChild(el('circle', { cx, cy: levelY[l]!, r: 5, class: 'ng-leaf' }));
  }
  const YOU = 4;
  for (let i = 0; i < 8; i++) {
    svg.appendChild(el('rect', {
      x: leafCenters[i]! - leafW / 2, y: levelY[0]! - 7, width: leafW, height: 14, rx: 3,
      class: i === YOU ? 'ng-leaf-you' : 'ng-leaf',
    }));
  }
  svg.appendChild(el('text', { x: leafCenters[YOU]!, y: 224, class: 'ng-value ng-accent', 'text-anchor': 'middle' }, 'you'));
  svg.appendChild(el('text', { x: 24, y: 250, class: 'ng-fine' }, 'proof reveals the root,'));
  svg.appendChild(el('text', { x: 24, y: 262, class: 'ng-fine' }, 'never the leaf'));

  /* ---------- middle: scope card ---------- */
  const cardX = 240;
  const cardY = 64;
  const cardW = 220;
  const cardH = 168;
  svg.appendChild(el('rect', { x: cardX, y: cardY, width: cardW, height: cardH, rx: 10, class: 'ng-panel' }));
  svg.appendChild(el('text', { x: cardX + 14, y: cardY + 24, class: 'ng-label' }, 'EXTERNAL NULLIFIER (SCOPE)'));
  const rows = [
    ['version', 'v1'],
    ['pbhNonce', '0'],
    ['month', 'JUN'],
    ['year', '2026'],
  ] as const;
  const rowEls: SVGTextElement[] = [];
  rows.forEach(([k, v], i) => {
    svg.appendChild(el('text', { x: cardX + 14, y: cardY + 52 + i * 24, class: 'ng-value' }, k));
    const val = el('text', { x: cardX + cardW - 14, y: cardY + 52 + i * 24, class: 'ng-value ng-bright', 'text-anchor': 'end' }, v);
    rowEls.push(val);
    svg.appendChild(val);
  });
  const nonceEl = rowEls[1]!;
  const monthEl = rowEls[2]!;
  const yearEl = rowEls[3]!;
  svg.appendChild(el('text', { x: cardX + 14, y: cardY + cardH + 20, class: 'ng-fine' },
    'nullifierHash = H(scope, identity secret)'));
  const hashEl = el('text', { x: cardX + 14, y: cardY + cardH + 36, class: 'ng-value ng-cyan' }, '');
  svg.appendChild(hashEl);

  /* ---------- right: gate + spent ledger ---------- */
  const gateX = 520;
  const gateLine = el('line', { x1: gateX, y1: 56, x2: gateX, y2: 280, class: 'ng-gate' });
  svg.appendChild(gateLine);
  svg.appendChild(el('text', { x: gateX, y: 44, class: 'ng-label', 'text-anchor': 'middle' }, 'GATE'));

  const ledgerTitle = el('text', { x: 556, y: 64, class: 'ng-label' }, 'SPENT NULLIFIERS · JUN');
  svg.appendChild(ledgerTitle);
  const ledger: SVGGElement[] = [];
  const ledgerSlot = (i: number) => ({ x: 556 + 52, y: 84 + i * 30 });

  // quota meter
  svg.appendChild(el('text', { x: 556, y: 268, class: 'ng-label' }, `QUOTA (DEMO: ${QUOTA}/MONTH)`));
  const quotaCells: SVGRectElement[] = [];
  for (let i = 0; i < QUOTA; i++) {
    const c = el('rect', { x: 556 + i * 26, y: 276, width: 20, height: 8, rx: 2, class: 'ng-quota' });
    quotaCells.push(c);
    svg.appendChild(c);
  }
  svg.appendChild(el('text', { x: 556, y: 300, class: 'ng-fine' }, 'live mainnet config: 65,535/month'));

  /* ---------------- controls: send / replay / roll-month (HTML) ---------------- */
  const controls = document.createElement('div');
  controls.className = 'ng-controls';
  const mkButton = (text: string, aria: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', aria);
    b.textContent = text;
    controls.appendChild(b);
    return b;
  };
  const sendBtn = mkButton('⬢ send transaction', 'Send a PBH transaction with the next nonce');
  const replayBtn = mkButton('↻ replay last proof', 'Replay the last spent proof');
  const monthBtn = mkButton('month ▸', 'Advance to the next month');
  controlsSlot.appendChild(controls);

  /* ---------------- panel: status / quota / revert-error readout (HTML) ---------------- */
  const readout = document.createElement('div');
  readout.className = 'ng-readout';

  const verdict = document.createElement('div');
  verdict.className = 'ng-verdict';
  verdict.setAttribute('role', 'status');
  verdict.setAttribute('aria-live', 'polite');

  const status = document.createElement('div');
  status.className = 'ng-status';

  const meter = document.createElement('div');
  meter.className = 'ng-meter';
  const meterLabel = document.createElement('div');
  meterLabel.className = 'ng-meter-label';
  meterLabel.textContent = `QUOTA (DEMO: ${QUOTA}/MONTH)`;
  const cellsWrap = document.createElement('div');
  cellsWrap.className = 'ng-cells';
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < QUOTA; i++) {
    const c = document.createElement('div');
    c.className = 'ng-cell';
    cellsWrap.appendChild(c);
    cells.push(c);
  }
  const fineprint = document.createElement('div');
  fineprint.className = 'ng-fineprint';
  fineprint.textContent = 'live mainnet config: 65,535/month';
  meter.append(meterLabel, cellsWrap, fineprint);

  readout.append(verdict, status, meter);
  panel.appendChild(readout);

  /* ---------------- caption: interaction hint ---------------- */
  const caption = document.createElement('div');
  caption.className = 'ng-caption';
  caption.textContent = 'send a transaction — each one spends a fresh nullifier';
  captionSlot.appendChild(caption);

  /* ---------- state & animation ---------- */
  let nonce = 0;
  let monthIdx = 5; // JUN
  let year = 2026;
  let lastHash: string | null = null;
  let busy = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  function syncButtons() {
    sendBtn.setAttribute('aria-disabled', String(busy));
    replayBtn.setAttribute('aria-disabled', String(busy || lastHash === null));
    monthBtn.setAttribute('aria-disabled', String(busy));
  }

  function showVerdict(ok: boolean, text: string) {
    verdict.textContent = text;
    verdict.className = `ng-verdict is-on ${ok ? 'ng-ok' : 'ng-bad'}`;
    gateLine.classList.remove('ng-gate-ok', 'ng-gate-bad');
    gateLine.classList.add(ok ? 'ng-gate-ok' : 'ng-gate-bad');
    later(() => {
      verdict.classList.remove('is-on');
      gateLine.classList.remove('ng-gate-ok', 'ng-gate-bad');
    }, 2000);
  }

  function makeChip(hash: string): SVGGElement {
    const g = el('g', { class: 'ng-flyer' });
    g.append(
      el('rect', { x: -52, y: -11, width: 104, height: 22, rx: 11, class: 'ng-chip' }),
      el('text', { x: 0, y: 4, 'text-anchor': 'middle', class: 'ng-chip-text' }, `0x${hash}…`),
    );
    return g;
  }

  // Flies a chip from the scope card toward the gate; lands in the ledger on
  // success, halts at the gate and fades on rejection.
  function fly(hash: string, accept: boolean, slot: number, onDone: () => void) {
    const chip = makeChip(hash);
    const startX = cardX + cardW / 2;
    const startY = cardY + cardH + 32;
    chip.style.transform = `translate(${startX}px, ${startY}px)`;
    svg.appendChild(chip);
    // double-RAF so the launch transition actually runs from the start pose
    rafs.add(requestAnimationFrame(() => rafs.add(requestAnimationFrame(() => {
      const t = accept ? ledgerSlot(slot) : { x: gateX - 60, y: 170 };
      chip.style.transform = `translate(${t.x}px, ${t.y}px)`;
    }))));
    later(() => {
      if (accept) {
        ledger.push(chip);
        onDone();
      } else {
        chip.style.opacity = '0';
        later(() => { chip.remove(); onDone(); }, 420);
      }
    }, FLY_MS + 80);
  }

  function send() {
    if (busy) return;
    busy = true;
    syncButtons();
    nonceEl.textContent = String(nonce);
    const hash = randHex(8);
    hashEl.textContent = `0x${hash}…`;
    // nonce >= quota → the contract rejects the scope itself
    if (nonce >= QUOTA) {
      fly(hash, false, 0, () => {
        showVerdict(false, `revert: "Invalid PBH Nonce" (${nonce} ≥ ${QUOTA})`);
        caption.textContent = 'quota exhausted — this month’s scope accepts no more nonces';
        busy = false;
        syncButtons();
      });
      return;
    }
    lastHash = hash;
    fly(hash, true, ledger.length, () => {
      cells[nonce]?.classList.add('is-used');
      quotaCells[nonce]?.classList.add('ng-quota-used');
      nonce += 1;
      showVerdict(true, 'included top-of-block ✓');
      caption.textContent = nonce < QUOTA
        ? `nullifier spent — next transaction uses nonce ${nonce}`
        : 'last nonce spent — send once more to hit the quota, or roll the month';
      busy = false;
      syncButtons();
    });
  }

  function replay() {
    if (busy || lastHash === null) return;
    busy = true;
    syncButtons();
    fly(lastHash, false, 0, () => {
      showVerdict(false, 'revert: InvalidNullifier(nullifierHash, signalHash)');
      caption.textContent = 'same identity + same scope ⇒ same nullifier — the ledger remembers';
      busy = false;
      syncButtons();
    });
  }

  function nextMonth() {
    if (busy) return;
    busy = true;
    syncButtons();
    monthIdx = (monthIdx + 1) % 12;
    if (monthIdx === 0) {
      year += 1;
      yearEl.textContent = String(year);
    }
    monthEl.textContent = MONTHS[monthIdx]!;
    ledgerTitle.textContent = `SPENT NULLIFIERS · ${MONTHS[monthIdx]}`;
    nonce = 0;
    nonceEl.textContent = '0';
    lastHash = null;
    hashEl.textContent = '';
    for (const chip of ledger) chip.style.opacity = '0';
    later(() => {
      for (const chip of ledger) chip.remove();
      ledger.length = 0;
      for (const c of quotaCells) c.classList.remove('ng-quota-used');
      for (const c of cells) c.classList.remove('is-used');
      showVerdict(true, 'new scope — quota reset, all nullifiers fresh');
      caption.textContent = 'a new month is a new external nullifier: same secrets, brand-new hashes';
      busy = false;
      syncButtons();
    }, 450);
  }

  /* ---------- events ---------- */
  const onSend = () => send();
  const onReplay = () => replay();
  const onMonth = () => nextMonth();
  sendBtn.addEventListener('click', onSend);
  replayBtn.addEventListener('click', onReplay);
  monthBtn.addEventListener('click', onMonth);
  syncButtons();

  return () => {
    timeouts.forEach((id) => clearTimeout(id));
    rafs.forEach((id) => cancelAnimationFrame(id));
    sendBtn.removeEventListener('click', onSend);
    replayBtn.removeEventListener('click', onReplay);
    monthBtn.removeEventListener('click', onMonth);
    layout.dispose();
    style.remove();
  };
}
