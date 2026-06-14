/**
 * Artifact: byte-equality-gate — The Byte-Equality Gate
 * Manifest: content/artifacts/byte-equality-gate/manifest.json
 *
 * On-chain verifiable-inference schemes (EigenAI, optimistic ML oracles,
 * restaking re-execution) reduce verification to a byte-equality check: the
 * operator publishes an output, a watcher re-runs the same prompt, and the
 * two digests are compared. That only works if an LLM forward pass is
 * bit-for-bit reproducible — and by default it isn't.
 *
 * This piece isolates the load-bearing mechanism. A single matmul reduces
 * eight contributions to the logit gap between two candidate next tokens
 * ("Queens, New York" vs "New York City" — the exact pair Thinking Machines
 * watched diverge at token 103). IEEE-754 addition is non-associative, so
 * the order of the reduction — driven by the split-K count the kernel picks
 * for the current batch/occupancy — changes the rounded result in its last
 * bits. For most split counts the gap stays positive (Queens). At split 5
 * and 6 the rounding flips it negative (City): a different token, a different
 * output, a different digest. The honest operator now fails byte-equality.
 *
 * Toggle batch-invariant kernels and the operator is pinned to one fixed
 * reduction schedule regardless of load — every split lands identically and
 * the gate goes green. Every number on screen is computed live in double
 * precision; the measured anchors live in ./data.json.
 *
 * Pure DOM + inline SVG, no deps. Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/byte-equality-gate/data.json';

// --- the honest example -----------------------------------------------------
// Eight contributions to d = logit("Queens, New York") − logit("New York City").
// Vetted: exact (Neumaier) sum ≈ +0.367 so Queens is the true argmax, but the
// split-K reduction order flips the sign at split counts 5 and 6.
const TERMS = [
  13981619882397354, 0.15765609685331583, -13981619882397354, -1.8063957626000047,
  1603398673003539.5, 1.822684759274125, -1603398673003539.5, 0.19325267057865858,
];
const MAX_SPLIT = 16;
const FIXED_SPLIT = 1; // the verifier's canonical schedule (and the invariant one)

const QUEENS = data.feynman.majorityText; // "Queens, New York"
const CITY = data.feynman.minorityText; // "New York City"

/** Reduce TERMS in `splits` parallel partial sums (term i → partial i%splits),
 *  each summed sequentially, then the partials combined in order. split=1 is a
 *  plain left-to-right sum. Faithful to how split-K count changes accumulation
 *  order — and rounding — with batch size. */
function reduce(splits: number): number {
  const parts = new Array<number>(splits).fill(0);
  for (let i = 0; i < TERMS.length; i++) parts[i % splits]! += TERMS[i]!;
  let s = 0;
  for (let j = 0; j < splits; j++) s += parts[j]!;
  return s;
}

/** argmax over the two candidate logits: gap ≥ 0 ⇒ Queens (index 0). */
const tokenFor = (gap: number): string => (gap >= 0 ? QUEENS : CITY);

/** FNV-1a 32-bit — a real content digest, stands in for the on-chain SHA. */
function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const OUTPUT = (tok: string) => `…born on May 11, 1918, in ${tok}.`;

const fmt = (v: number): string => {
  if (v === 0) return '0.0000000';
  if (Math.abs(v) >= 1e6) return v.toExponential(4);
  return v.toFixed(7);
};
const fmtTerm = (v: number): string =>
  Math.abs(v) >= 1e6 ? (v < 0 ? '−' : '+') + Math.abs(v).toExponential(3) : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(3);

export default function mount(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'beg-root';
  container.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .beg-root { position:absolute; inset:0; display:flex; flex-direction:column; gap:11px;
      padding:13px 15px; overflow-y:auto; background:#05070d;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .beg-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      flex-wrap:wrap; }
    .beg-title { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .beg-title b { color:#e7eaf3; font-weight:600; }
    .beg-toggle { display:flex; align-items:center; gap:8px; font-size:10px; letter-spacing:.04em;
      text-transform:uppercase; color:#5b6378; white-space:nowrap; }
    .beg-sw { position:relative; width:38px; height:20px; border-radius:11px; cursor:pointer;
      background:#141a2b; box-shadow:inset 0 0 0 1px rgba(124,140,255,.18); transition:.22s; flex:0 0 auto; }
    .beg-sw::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px;
      border-radius:50%; background:#5b6378; transition:.22s; }
    .beg-sw.beg-on { background:rgba(34,211,238,.18); box-shadow:inset 0 0 0 1px rgba(34,211,238,.55); }
    .beg-sw.beg-on::after { left:20px; background:#22d3ee; box-shadow:0 0 8px rgba(34,211,238,.6); }
    .beg-sw:focus-visible { outline:2px solid rgba(34,211,238,.6); outline-offset:2px; }
    .beg-toggle b { color:#cdd3e3; font-weight:600; }

    .beg-prompt { font-size:10.5px; color:#5b6378; line-height:1.5; }
    .beg-prompt b { color:#9aa3bd; font-weight:500; }
    .beg-prompt .beg-tk { color:#cdd3e3; }

    .beg-terms { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
    .beg-terms .beg-lbl { font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378;
      margin-right:3px; }
    .beg-chip { font:600 10px 'JetBrains Mono', monospace; padding:2px 5px; border-radius:4px;
      background:#0d1322; box-shadow:inset 0 0 0 1px rgba(124,140,255,.1); color:#9aa3bd;
      font-variant-numeric:tabular-nums; }

    .beg-tracks { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .beg-root.beg-narrow .beg-tracks { grid-template-columns:1fr; }
    .beg-tk-card { border:1px solid rgba(124,140,255,.14); border-radius:10px; padding:9px 11px;
      background:#0a0f1c; display:flex; flex-direction:column; gap:6px; min-width:0; }
    .beg-tk-card.beg-op { box-shadow:inset 0 0 0 1px rgba(124,140,255,.06); }
    .beg-tk-h { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .beg-tk-name { font-size:9.5px; letter-spacing:.07em; text-transform:uppercase; color:#7c8299; }
    .beg-tk-meta { font-size:9px; color:#5b6378; white-space:nowrap; }
    .beg-tk-val { font:700 14px 'JetBrains Mono', monospace; font-variant-numeric:tabular-nums;
      color:#cdd3e3; word-break:break-all; }
    .beg-tk-tok { display:flex; align-items:center; gap:7px; font-size:11px; }
    .beg-tk-tok .beg-arrow { color:#5b6378; }
    .beg-tk-tok b { font-weight:600; }
    .beg-q b { color:#22d3ee; } .beg-c b { color:#f0883e; }
    .beg-tk-tok .beg-pill { font:700 8px 'JetBrains Mono', monospace; letter-spacing:.06em;
      text-transform:uppercase; padding:1px 5px; border-radius:4px; }
    .beg-q .beg-pill { color:#22d3ee; box-shadow:inset 0 0 0 1px rgba(34,211,238,.4); }
    .beg-c .beg-pill { color:#f0883e; box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }

    .beg-gate { display:flex; align-items:center; gap:11px; border-radius:10px; padding:10px 13px;
      transition:.25s; flex-wrap:wrap; }
    .beg-gate.beg-match { background:rgba(34,211,238,.07); box-shadow:inset 0 0 0 1px rgba(34,211,238,.3); }
    .beg-gate.beg-fail { background:rgba(240,136,62,.07); box-shadow:inset 0 0 0 1px rgba(240,136,62,.42); }
    .beg-gate-icon { font-size:20px; line-height:1; flex:0 0 auto; }
    .beg-gate-body { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1 1 200px; }
    .beg-gate-verdict { font:700 12px 'JetBrains Mono', monospace; letter-spacing:.03em; }
    .beg-gate.beg-match .beg-gate-verdict { color:#22d3ee; }
    .beg-gate.beg-fail .beg-gate-verdict { color:#f0883e; }
    .beg-gate-sub { font-size:10px; color:#7c8299; line-height:1.45; }
    .beg-digests { display:flex; flex-direction:column; gap:2px; font-size:9.5px; color:#5b6378;
      white-space:nowrap; }
    .beg-digests code { color:#9aa3bd; font-family:inherit; }
    .beg-digests .beg-dq { color:#22d3ee; } .beg-digests .beg-dc { color:#f0883e; }

    .beg-strip-wrap { display:flex; flex-direction:column; gap:5px; }
    .beg-strip-h { display:flex; justify-content:space-between; align-items:baseline; gap:10px;
      font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .beg-strip-h b { color:#cdd3e3; font-weight:600; }
    .beg-strip { display:grid; grid-template-columns:repeat(16,1fr); gap:3px; }
    .beg-cell { position:relative; aspect-ratio:1; border-radius:4px; cursor:pointer; border:0;
      display:flex; align-items:center; justify-content:center; padding:0;
      font:700 9px 'JetBrains Mono', monospace; transition:.15s; }
    .beg-cell.beg-ok { background:rgba(34,211,238,.1); box-shadow:inset 0 0 0 1px rgba(34,211,238,.3); color:#22d3ee; }
    .beg-cell.beg-bad { background:rgba(240,136,62,.13); box-shadow:inset 0 0 0 1px rgba(240,136,62,.5); color:#f0883e; }
    .beg-cell.beg-cur { box-shadow:0 0 0 2px #e7eaf3; }
    .beg-cell:focus-visible { outline:2px solid rgba(231,234,243,.8); outline-offset:1px; }
    .beg-cell .beg-cn { position:absolute; bottom:1px; right:2px; font-size:6.5px; opacity:.5; }

    .beg-controls { display:flex; gap:14px; align-items:end; flex-wrap:wrap; }
    .beg-field { display:flex; flex-direction:column; gap:4px; flex:1 1 200px; min-width:160px; }
    .beg-field label { display:flex; justify-content:space-between; gap:8px; font-size:9.5px;
      letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .beg-field label output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .beg-field input[type=range] { width:100%; cursor:pointer; accent-color:#22d3ee; margin:0; }
    .beg-field.beg-locked { opacity:.4; }
    .beg-field.beg-locked input { cursor:not-allowed; }

    .beg-ref { font-size:9.5px; color:#5b6378; line-height:1.55; letter-spacing:.01em; }
    .beg-ref b { color:#cdd3e3; font-weight:600; }
    .beg-ref a { color:#22d3ee; text-decoration:none; }
    .beg-ref a:hover { text-decoration:underline; }
  `;
  root.appendChild(style);

  // -------------------------------------------------------------- state
  let opSplit = 6; // start on a divergent split so the gate opens red
  let invariant = false;

  // -------------------------------------------------------------- header
  const head = document.createElement('div');
  head.className = 'beg-head';
  const title = document.createElement('div');
  title.className = 'beg-title';
  title.innerHTML = `<b>byte-equality gate</b> · one matmul, two reductions`;
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'beg-toggle';
  const toggleLbl = document.createElement('span');
  toggleLbl.innerHTML = `batch-invariant<br>kernels`;
  toggleLbl.style.textAlign = 'right';
  toggleLbl.style.lineHeight = '1.3';
  const sw = document.createElement('div');
  sw.className = 'beg-sw';
  sw.tabIndex = 0;
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', 'false');
  sw.setAttribute('aria-label', 'Batch-invariant kernels');
  toggleWrap.append(toggleLbl, sw);
  head.append(title, toggleWrap);
  root.appendChild(head);

  // prompt line
  const prompt = document.createElement('div');
  prompt.className = 'beg-prompt';
  prompt.innerHTML =
    `prompt <b>"${data.feynman.prompt}"</b> · greedy · next token after ` +
    `<span class="beg-tk">"…${data.feynman.sharedPrefix}"</span>`;
  root.appendChild(prompt);

  // contributions
  const terms = document.createElement('div');
  terms.className = 'beg-terms';
  const tlbl = document.createElement('span');
  tlbl.className = 'beg-lbl';
  tlbl.textContent = 'Σ logit gap ←';
  terms.appendChild(tlbl);
  for (const t of TERMS) {
    const c = document.createElement('span');
    c.className = 'beg-chip';
    c.textContent = fmtTerm(t);
    terms.appendChild(c);
  }
  root.appendChild(terms);

  // tracks
  const tracks = document.createElement('div');
  tracks.className = 'beg-tracks';
  const mkTrack = (name: string, op: boolean) => {
    const card = document.createElement('div');
    card.className = `beg-tk-card${op ? ' beg-op' : ''}`;
    const h = document.createElement('div');
    h.className = 'beg-tk-h';
    const nm = document.createElement('div');
    nm.className = 'beg-tk-name';
    nm.textContent = name;
    const meta = document.createElement('div');
    meta.className = 'beg-tk-meta';
    h.append(nm, meta);
    const val = document.createElement('div');
    val.className = 'beg-tk-val';
    const tok = document.createElement('div');
    tok.className = 'beg-tk-tok';
    card.append(h, val, tok);
    tracks.appendChild(card);
    return { meta, val, tok };
  };
  const verifierT = mkTrack('verifier · re-execute', false);
  const operatorT = mkTrack('operator · production', true);
  root.appendChild(tracks);

  // gate
  const gate = document.createElement('div');
  gate.className = 'beg-gate';
  const gateIcon = document.createElement('div');
  gateIcon.className = 'beg-gate-icon';
  const gateBody = document.createElement('div');
  gateBody.className = 'beg-gate-body';
  const gateVerdict = document.createElement('div');
  gateVerdict.className = 'beg-gate-verdict';
  const gateSub = document.createElement('div');
  gateSub.className = 'beg-gate-sub';
  gateBody.append(gateVerdict, gateSub);
  const digests = document.createElement('div');
  digests.className = 'beg-digests';
  const digOp = document.createElement('div');
  const digVer = document.createElement('div');
  digests.append(digVer, digOp);
  gate.append(gateIcon, gateBody, digests);
  root.appendChild(gate);

  // strip
  const stripWrap = document.createElement('div');
  stripWrap.className = 'beg-strip-wrap';
  const stripH = document.createElement('div');
  stripH.className = 'beg-strip-h';
  const stripHL = document.createElement('span');
  stripHL.textContent = 'output digest at each production split-K';
  const stripHR = document.createElement('span');
  stripH.append(stripHL, stripHR);
  const strip = document.createElement('div');
  strip.className = 'beg-strip';
  const cells: { cell: HTMLButtonElement; mark: HTMLElement }[] = [];
  for (let b = 1; b <= MAX_SPLIT; b++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'beg-cell';
    cell.setAttribute('aria-label', `split-K ${b}`);
    const mark = document.createElement('span');
    const cn = document.createElement('span');
    cn.className = 'beg-cn';
    cn.textContent = String(b);
    cell.append(mark, cn);
    strip.appendChild(cell);
    cells.push({ cell, mark });
  }
  stripWrap.append(stripH, strip);
  root.appendChild(stripWrap);

  // controls
  const controls = document.createElement('div');
  controls.className = 'beg-controls';
  const field = document.createElement('div');
  field.className = 'beg-field';
  const flab = document.createElement('label');
  flab.htmlFor = 'beg-split';
  const flabName = document.createElement('span');
  flabName.textContent = 'production batch → split-K';
  const flabOut = document.createElement('output');
  flab.append(flabName, flabOut);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'beg-split';
  slider.min = '1';
  slider.max = String(MAX_SPLIT);
  slider.step = '1';
  slider.value = String(opSplit);
  field.append(flab, slider);
  controls.appendChild(field);
  root.appendChild(controls);

  // ref
  const ref = document.createElement('div');
  ref.className = 'beg-ref';
  const f = data.feynman;
  ref.innerHTML =
    `Real anchor — Thinking Machines ran <b>${f.completions}</b> completions of "${f.prompt}" at ` +
    `temperature 0 on ${f.model}: <b>${f.uniqueCompletions} unique</b> outputs, diverging at token ` +
    `<b>${f.divergenceToken}</b> — ${f.majorityCount} said "${f.majorityText}", ${f.minorityCount} said ` +
    `"${f.minorityText}". EigenAI's byte-equality verifier needs that gone: <b>${data.eigenai.sameArchMatchPct}%</b> ` +
    `match same-GPU, <b>${data.eigenai.crossArchMatchPct}%</b> cross-arch. ` +
    `<a href="https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/" target="_blank" rel="noopener">Thinking Machines ↗</a> · ` +
    `<a href="https://arxiv.org/abs/2602.00182" target="_blank" rel="noopener">EigenAI ↗</a>`;
  root.appendChild(ref);

  // -------------------------------------------------------------- render
  function tokenClass(tok: string): string {
    return tok === QUEENS ? 'beg-q' : 'beg-c';
  }
  function setTrack(
    t: { meta: HTMLElement; val: HTMLElement; tok: HTMLElement },
    splits: number,
  ): { gap: number; tok: string } {
    const gap = reduce(splits);
    const tok = tokenFor(gap);
    t.meta.textContent = splits === 1 ? 'split-K 1 · sequential' : `split-K ${splits}`;
    t.val.textContent = `gap = ${fmt(gap)}`;
    t.tok.className = `beg-tk-tok ${tokenClass(tok)}`;
    t.tok.innerHTML =
      `<span class="beg-arrow">argmax →</span> <b>"${tok}"</b> ` +
      `<span class="beg-pill">${gap >= 0 ? 'Δ &gt; 0' : 'Δ &lt; 0'}</span>`;
    return { gap, tok };
  }

  function render(): void {
    const effOp = invariant ? FIXED_SPLIT : opSplit;
    const ver = setTrack(verifierT, FIXED_SPLIT);
    const op = setTrack(operatorT, effOp);
    operatorT.meta.textContent = invariant
      ? `split-K ${FIXED_SPLIT} · pinned`
      : opSplit === 1
        ? 'split-K 1 · sequential'
        : `split-K ${opSplit}`;

    const dVer = digest(OUTPUT(ver.tok));
    const dOp = digest(OUTPUT(op.tok));
    const match = dVer === dOp;
    digVer.innerHTML = `verifier <code class="beg-dq">0x${dVer}</code>`;
    digOp.innerHTML = `operator <code class="${match ? 'beg-dq' : 'beg-dc'}">0x${dOp}</code>`;

    gate.className = `beg-gate ${match ? 'beg-match' : 'beg-fail'}`;
    gateIcon.textContent = match ? '✓' : '✕';
    gateIcon.style.color = match ? '#22d3ee' : '#f0883e';
    if (match) {
      gateVerdict.textContent = 'BYTES MATCH · inference accepted';
      gateSub.textContent = invariant
        ? 'Batch-invariant kernels pin one reduction schedule — load can no longer change the bytes.'
        : 'Both reductions rounded the same way here. A single honest watcher confirms the result.';
    } else {
      gateVerdict.textContent = 'DIGEST MISMATCH · honest operator looks fraudulent';
      gateSub.textContent =
        'Same prompt, same weights, same seed — but split-K ' +
        opSplit +
        ' rounded the logit gap the other way. Re-execution disagrees; the challenge wrongly succeeds.';
    }

    // strip
    let bad = 0;
    for (let b = 1; b <= MAX_SPLIT; b++) {
      const { cell, mark } = cells[b - 1]!;
      const eff = invariant ? FIXED_SPLIT : b;
      const tok = tokenFor(reduce(eff));
      const ok = digest(OUTPUT(tok)) === dVer;
      if (!ok) bad++;
      cell.className = `beg-cell ${ok ? 'beg-ok' : 'beg-bad'}${b === opSplit ? ' beg-cur' : ''}`;
      mark.textContent = ok ? '✓' : '✕';
    }
    stripHR.innerHTML = invariant
      ? `<b style="color:#22d3ee">0</b> / 16 diverge`
      : `<b style="color:${bad ? '#f0883e' : '#22d3ee'}">${bad}</b> / 16 diverge`;

    flabOut.textContent = invariant ? `${opSplit} (ignored)` : String(opSplit);
    field.classList.toggle('beg-locked', invariant);
    slider.disabled = invariant;
  }

  // -------------------------------------------------------------- events
  const onSlide = () => {
    opSplit = Number(slider.value);
    render();
  };
  slider.addEventListener('input', onSlide);

  const onToggle = () => {
    invariant = !invariant;
    sw.classList.toggle('beg-on', invariant);
    sw.setAttribute('aria-checked', invariant ? 'true' : 'false');
    render();
  };
  sw.addEventListener('click', onToggle);
  const onSwKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  sw.addEventListener('keydown', onSwKey);

  const onCell = (e: Event) => {
    const i = cells.findIndex((c) => c.cell === e.currentTarget);
    if (i < 0) return;
    opSplit = i + 1;
    slider.value = String(opSplit);
    if (invariant) onToggle(); // tapping a cell turns determinism off to explore
    else render();
  };
  for (const { cell } of cells) cell.addEventListener('click', onCell);

  const ro = new ResizeObserver(([entry]) => {
    root.classList.toggle('beg-narrow', (entry?.contentRect.width ?? 700) < 480);
  });
  ro.observe(container);

  render();

  return () => {
    ro.disconnect();
    slider.removeEventListener('input', onSlide);
    sw.removeEventListener('click', onToggle);
    sw.removeEventListener('keydown', onSwKey);
    for (const { cell } of cells) cell.removeEventListener('click', onCell);
    style.remove();
    root.remove();
  };
}
