/**
 * Artifact: spoofers-discount — The Spoofer's Discount
 * Manifest: content/artifacts/spoofers-discount/manifest.json
 *
 * Proof-of-Learning (Jia et al., S&P 2021) verifies a training run by logging
 * the SGD weight trajectory and re-executing only the Q largest-magnitude
 * update intervals per epoch, accepting if each reproduces within a tolerance
 * band δ. The band has to exist because honest re-execution isn't bit-exact.
 *
 * Zhang et al. (S&P 2022) forged a passing proof for ~3.2% of training cost by
 * optimizing fake batches to land on chosen checkpoints; Fang et al. (2022)
 * pushed it to ~1 FLOP/parameter and defeated the top-Q optimization itself.
 *
 * This piece makes the trap drivable. A logged trajectory (identical in shape
 * whether honest or forged — that's the point) is audited top-Q. The honest
 * run's per-interval reproduction error rises with update magnitude, so the
 * very steps the verifier audits are the ones most likely to false-reject
 * under a tight δ. The forger optimizes against δ, so a forged interval always
 * lands just under it. Slide δ down to reject the forgery and the honest node
 * fails first; there is no δ that passes honest and rejects forged. The cost
 * ledger lands the punchline: the forger out-cheaped the audit.
 *
 * Pure DOM + inline SVG, no deps. Static (no RAF). Reduced motion is a no-op
 * here — nothing autoplays. Measured anchors live in ./data.json.
 */
import data from '../../../content/artifacts/spoofers-discount/data.json';

// Logged update-magnitude profile (normalized), decaying with bumps — the
// shape a real run produces, and the shape the forger mimics. N intervals.
const MAG = [
  1.0, 0.86, 0.78, 0.66, 0.71, 0.55, 0.48, 0.52, 0.4, 0.36, 0.33, 0.29, 0.31,
  0.24, 0.21, 0.19, 0.17, 0.15,
];
const N = MAG.length;

// Honest re-execution error per interval: a non-determinism noise floor that
// GROWS with update magnitude (bigger steps accumulate more FP divergence) —
// so the audited (largest) intervals carry the highest honest error.
const HONEST_ERR = MAG.map((m) => 0.04 + 0.07 * m); // ≈ 0.045 … 0.11

const K = data.pol.stepsPerEpoch; // steps re-executed per audited interval
const T = data.pol.totalSteps; // honest prover's cost (gradient steps)
const SPOOF_STEPS = data.zhang.breakEvenSteps; // forger's cost
const SPOOF_PCT = data.zhang.costPctOfTraining;

// Indices of the Q largest-magnitude intervals (PoL audits these).
function topQ(q: number): Set<number> {
  return new Set([...MAG.keys()].sort((a, b) => MAG[b]! - MAG[a]!).slice(0, q));
}

const pct = (x: number) => (x < 0.1 ? x.toFixed(2) : x.toFixed(1));
const commas = (n: number) => Math.round(n).toLocaleString('en-US');

export default function mount(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'spd-root';
  container.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .spd-root { position:absolute; inset:0; display:flex; flex-direction:column; gap:11px;
      padding:13px 15px; overflow-y:auto; background:#05070d;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .spd-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      flex-wrap:wrap; }
    .spd-title { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .spd-title b { color:#e7eaf3; font-weight:600; }
    .spd-toggle { display:flex; align-items:center; gap:8px; font-size:10px; letter-spacing:.04em;
      text-transform:uppercase; color:#5b6378; white-space:nowrap; }
    .spd-toggle .spd-tlbl { text-align:right; line-height:1.3; }
    .spd-toggle b { color:#cdd3e3; font-weight:600; }
    .spd-sw { position:relative; width:38px; height:20px; border-radius:11px; cursor:pointer;
      background:#141a2b; box-shadow:inset 0 0 0 1px rgba(124,140,255,.18); transition:.22s; flex:0 0 auto; }
    .spd-sw::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px;
      border-radius:50%; background:#5b6378; transition:.22s; }
    .spd-sw.spd-on { background:rgba(240,136,62,.2); box-shadow:inset 0 0 0 1px rgba(240,136,62,.6); }
    .spd-sw.spd-on::after { left:20px; background:#f0883e; box-shadow:0 0 8px rgba(240,136,62,.6); }
    .spd-sw:focus-visible { outline:2px solid rgba(240,136,62,.6); outline-offset:2px; }

    .spd-sub { font-size:10.5px; color:#5b6378; line-height:1.5; }
    .spd-sub b { color:#9aa3bd; font-weight:500; }

    /* trajectory strip */
    .spd-strip-h { display:flex; justify-content:space-between; align-items:baseline; gap:10px;
      font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .spd-strip-h b { color:#cdd3e3; font-weight:600; }
    .spd-strip { display:grid; grid-template-columns:repeat(${N},1fr); gap:3px; align-items:end;
      height:96px; }
    .spd-bar { position:relative; height:100%; display:flex; flex-direction:column;
      justify-content:flex-end; align-items:stretch; cursor:pointer; border:0; background:none;
      padding:0; }
    .spd-bar:focus-visible { outline:2px solid rgba(231,234,243,.8); outline-offset:2px; border-radius:3px; }
    .spd-fill { width:100%; border-radius:3px 3px 0 0; background:#1b2336;
      box-shadow:inset 0 0 0 1px rgba(124,140,255,.12); transition:.18s; min-height:3px; }
    /* audited intervals */
    .spd-bar.spd-aud .spd-fill { background:rgba(34,211,238,.14); box-shadow:inset 0 0 0 1px rgba(34,211,238,.45); }
    .spd-bar.spd-aud.spd-pass .spd-fill { background:rgba(34,211,238,.2); box-shadow:inset 0 0 0 1px rgba(34,211,238,.65); }
    .spd-bar.spd-aud.spd-fail .spd-fill { background:rgba(240,136,62,.22);
      box-shadow:inset 0 0 0 1px rgba(240,136,62,.7); }
    .spd-bar.spd-forged .spd-fill { background-image:repeating-linear-gradient(45deg,
      transparent, transparent 3px, rgba(240,136,62,.16) 3px, rgba(240,136,62,.16) 6px); }
    .spd-bar.spd-sel .spd-fill { box-shadow:inset 0 0 0 1px #e7eaf3, 0 0 0 1px #e7eaf3; }
    .spd-cap { position:absolute; top:-13px; left:50%; transform:translateX(-50%);
      font:700 8px 'JetBrains Mono', monospace; color:#22d3ee; opacity:.85; }
    .spd-bar.spd-fail .spd-cap { color:#f0883e; }

    /* selected-interval readout */
    .spd-read { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:10px;
      color:#7c8299; min-height:16px; }
    .spd-read .spd-k { color:#cdd3e3; font-weight:600; }
    .spd-read .spd-ok { color:#22d3ee; } .spd-read .spd-no { color:#f0883e; }
    .spd-read .spd-dim { color:#5b6378; }

    /* controls */
    .spd-controls { display:flex; gap:14px; align-items:end; flex-wrap:wrap; }
    .spd-field { display:flex; flex-direction:column; gap:4px; flex:1 1 180px; min-width:150px; }
    .spd-field label { display:flex; justify-content:space-between; gap:8px; font-size:9.5px;
      letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .spd-field label output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .spd-field input[type=range] { width:100%; cursor:pointer; margin:0; }
    .spd-field.spd-delta input { accent-color:#f0883e; }
    .spd-field.spd-q input { accent-color:#22d3ee; }

    /* verdict gate */
    .spd-gate { display:flex; align-items:center; gap:11px; border-radius:10px; padding:10px 13px;
      transition:.25s; flex-wrap:wrap; }
    .spd-gate.spd-accept { background:rgba(240,136,62,.08); box-shadow:inset 0 0 0 1px rgba(240,136,62,.42); }
    .spd-gate.spd-honest-ok { background:rgba(34,211,238,.07); box-shadow:inset 0 0 0 1px rgba(34,211,238,.32); }
    .spd-gate.spd-reject { background:rgba(139,92,246,.1); box-shadow:inset 0 0 0 1px rgba(139,92,246,.45); }
    .spd-gate-icon { font-size:20px; line-height:1; flex:0 0 auto; }
    .spd-gate-body { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1 1 200px; }
    .spd-gate-verdict { font:700 12px 'JetBrains Mono', monospace; letter-spacing:.02em; }
    .spd-gate.spd-accept .spd-gate-verdict { color:#f0883e; }
    .spd-gate.spd-honest-ok .spd-gate-verdict { color:#22d3ee; }
    .spd-gate.spd-reject .spd-gate-verdict { color:#a78bfa; }
    .spd-gate-sub { font-size:10px; color:#7c8299; line-height:1.45; }
    .spd-gate-sub b { color:#cdd3e3; font-weight:600; }
    .spd-gate-sub em { font-style:italic; color:#9aa3bd; }

    /* cost ledger */
    .spd-ledger { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .spd-root.spd-narrow .spd-ledger { grid-template-columns:1fr; }
    .spd-cost { border:1px solid rgba(124,140,255,.14); border-radius:9px; padding:8px 10px;
      background:#0a0f1c; display:flex; flex-direction:column; gap:3px; min-width:0; }
    .spd-cost .spd-cn { font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .spd-cost .spd-cv { font:700 15px 'JetBrains Mono', monospace; color:#cdd3e3;
      font-variant-numeric:tabular-nums; }
    .spd-cost .spd-cs { font-size:9.5px; color:#7c8299; }
    .spd-cost.spd-forger .spd-cv { color:#f0883e; }
    .spd-cost.spd-forger.spd-na .spd-cv { color:#5b6378; }

    .spd-ref { font-size:9.5px; color:#5b6378; line-height:1.55; }
    .spd-ref b { color:#cdd3e3; font-weight:600; }
    .spd-ref a { color:#22d3ee; text-decoration:none; }
    .spd-ref a:hover { text-decoration:underline; }
  `;
  root.appendChild(style);

  // ---------------------------------------------------------------- state
  let forged = true; // open on the punchline: a forgery sailing through
  let delta = 0.12; // tolerance band
  let q = 6; // audit budget
  let sel = 0; // selected interval (the biggest update)

  // ---------------------------------------------------------------- header
  const head = document.createElement('div');
  head.className = 'spd-head';
  const title = document.createElement('div');
  title.className = 'spd-title';
  title.innerHTML = `<b>proof-of-learning audit</b> · top-Q re-execution`;
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'spd-toggle';
  const toggleLbl = document.createElement('span');
  toggleLbl.className = 'spd-tlbl';
  toggleLbl.innerHTML = `forge the<br>run`;
  const sw = document.createElement('div');
  sw.className = 'spd-sw spd-on';
  sw.tabIndex = 0;
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', 'true');
  sw.setAttribute('aria-label', 'Forge the run');
  toggleWrap.append(toggleLbl, sw);
  head.append(title, toggleWrap);
  root.appendChild(head);

  const sub = document.createElement('div');
  sub.className = 'spd-sub';
  root.appendChild(sub);

  // ---------------------------------------------------------------- strip
  const stripH = document.createElement('div');
  stripH.className = 'spd-strip-h';
  const stripHL = document.createElement('span');
  stripHL.textContent = 'logged weight-update trajectory';
  const stripHR = document.createElement('span');
  stripH.append(stripHL, stripHR);
  root.appendChild(stripH);

  const strip = document.createElement('div');
  strip.className = 'spd-strip';
  const bars: { btn: HTMLButtonElement; fill: HTMLElement; cap: HTMLElement }[] = [];
  for (let i = 0; i < N; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spd-bar';
    btn.setAttribute('aria-label', `interval ${i + 1}`);
    const cap = document.createElement('span');
    cap.className = 'spd-cap';
    const fill = document.createElement('span');
    fill.className = 'spd-fill';
    fill.style.height = `${Math.round(MAG[i]! * 100)}%`;
    btn.append(cap, fill);
    strip.appendChild(btn);
    bars.push({ btn, fill, cap });
  }
  root.appendChild(strip);

  const read = document.createElement('div');
  read.className = 'spd-read';
  root.appendChild(read);

  // ---------------------------------------------------------------- controls
  const controls = document.createElement('div');
  controls.className = 'spd-controls';

  const dField = document.createElement('div');
  dField.className = 'spd-field spd-delta';
  const dLab = document.createElement('label');
  dLab.htmlFor = 'spd-delta';
  const dName = document.createElement('span');
  dName.textContent = 'tolerance δ';
  const dOut = document.createElement('output');
  dLab.append(dName, dOut);
  const dSlider = document.createElement('input');
  dSlider.type = 'range';
  dSlider.id = 'spd-delta';
  dSlider.min = '0.04';
  dSlider.max = '0.18';
  dSlider.step = '0.005';
  dSlider.value = String(delta);
  dField.append(dLab, dSlider);

  const qField = document.createElement('div');
  qField.className = 'spd-field spd-q';
  const qLab = document.createElement('label');
  qLab.htmlFor = 'spd-q';
  const qName = document.createElement('span');
  qName.textContent = 'audit budget Q';
  const qOut = document.createElement('output');
  qLab.append(qName, qOut);
  const qSlider = document.createElement('input');
  qSlider.type = 'range';
  qSlider.id = 'spd-q';
  qSlider.min = '1';
  qSlider.max = String(N);
  qSlider.step = '1';
  qSlider.value = String(q);
  qField.append(qLab, qSlider);

  controls.append(dField, qField);
  root.appendChild(controls);

  // ---------------------------------------------------------------- gate
  const gate = document.createElement('div');
  gate.className = 'spd-gate';
  const gIcon = document.createElement('div');
  gIcon.className = 'spd-gate-icon';
  const gBody = document.createElement('div');
  gBody.className = 'spd-gate-body';
  const gVerdict = document.createElement('div');
  gVerdict.className = 'spd-gate-verdict';
  const gSub = document.createElement('div');
  gSub.className = 'spd-gate-sub';
  gBody.append(gVerdict, gSub);
  gate.append(gIcon, gBody);
  root.appendChild(gate);

  // ---------------------------------------------------------------- ledger
  const ledger = document.createElement('div');
  ledger.className = 'spd-ledger';
  const mkCost = (name: string, cls = '') => {
    const c = document.createElement('div');
    c.className = `spd-cost ${cls}`;
    const cn = document.createElement('div');
    cn.className = 'spd-cn';
    cn.textContent = name;
    const cv = document.createElement('div');
    cv.className = 'spd-cv';
    const cs = document.createElement('div');
    cs.className = 'spd-cs';
    c.append(cn, cv, cs);
    ledger.appendChild(c);
    return { c, cv, cs };
  };
  const honestCost = mkCost('honest prover');
  const verifierCost = mkCost('verifier audit');
  const forgerCost = mkCost('forger', 'spd-forger');
  root.appendChild(ledger);

  // ---------------------------------------------------------------- ref
  const ref = document.createElement('div');
  ref.className = 'spd-ref';
  ref.innerHTML =
    `Real anchors — PoL audits the <b>top-Q</b> largest updates per epoch over a ` +
    `<b>${commas(T)}</b>-step run (Jia et al.). Zhang et al. forged a passing proof in ` +
    `<b>${data.zhang.itersPerCheckpoint}</b> iters/checkpoint — grad-norm ` +
    `${data.zhang.gradNormBefore} → <b>${data.zhang.gradNormAfter}</b>, under any δ — for ` +
    `<b>${SPOOF_PCT}%</b> of training cost; Fang et al. reached <b>${data.fang.infinitesimalCost}</b>. ` +
    `<a href="${data.pol.url}" target="_blank" rel="noopener">PoL ↗</a> · ` +
    `<a href="${data.zhang.url}" target="_blank" rel="noopener">Zhang ↗</a> · ` +
    `<a href="${data.fang.url}" target="_blank" rel="noopener">Fang ↗</a>`;
  root.appendChild(ref);

  // ---------------------------------------------------------------- render
  function errFor(i: number): number {
    // honest: noise floor rising with magnitude. forged: optimized to 60% of δ
    // (the adversary tunes against the published tolerance — always under it).
    return forged ? 0.6 * delta : HONEST_ERR[i]!;
  }

  function render(): void {
    const audited = topQ(q);
    const auditedIdx = [...audited];

    // per-bar status
    let honestFail = 0;
    let honestFloor = 0; // max honest error among audited (min δ to pass honest)
    for (let i = 0; i < N; i++) {
      const { btn, cap } = bars[i]!;
      const isAud = audited.has(i);
      const e = errFor(i);
      const passes = e <= delta;
      btn.className =
        'spd-bar' +
        (isAud ? ' spd-aud' : '') +
        (isAud && passes ? ' spd-pass' : '') +
        (isAud && !passes ? ' spd-fail' : '') +
        (forged ? ' spd-forged' : '') +
        (i === sel ? ' spd-sel' : '');
      cap.textContent = isAud ? (passes ? '✓' : '✕') : '';
      if (isAud && !forged) {
        honestFloor = Math.max(honestFloor, HONEST_ERR[i]!);
        if (!passes) honestFail++;
      }
    }

    // honest floor across the audited set — needed even in forged mode for the
    // "no separating threshold" message
    const auditedHonestFloor = Math.max(...auditedIdx.map((i) => HONEST_ERR[i]!));

    stripHR.innerHTML = `Q=<b>${q}</b> audited · ${forged ? 'forged' : 'honest'}`;

    // selected interval readout
    const selAud = audited.has(sel);
    const selErr = errFor(sel);
    const selPass = selErr <= delta;
    read.innerHTML =
      `interval <span class="spd-k">#${sel + 1}</span> · update ` +
      `<span class="spd-k">${MAG[sel]!.toFixed(2)}</span> · ` +
      (selAud
        ? `re-exec error <span class="${selPass ? 'spd-ok' : 'spd-no'}">${selErr.toFixed(3)}</span> ` +
          `vs δ ${delta.toFixed(3)} → ` +
          `<span class="${selPass ? 'spd-ok' : 'spd-no'}">${selPass ? 'reproduces' : 'fails'}</span>` +
          (forged ? ` <span class="spd-dim">(forged to sit under δ)</span>` : '')
        : `<span class="spd-dim">not audited — never re-executed</span>`);

    // verdict
    const accepted = forged || honestFail === 0;
    gate.className =
      'spd-gate ' +
      (forged ? 'spd-accept' : accepted ? 'spd-honest-ok' : 'spd-reject');
    gIcon.textContent = accepted ? '✓' : '✕';
    gIcon.style.color = forged ? '#f0883e' : accepted ? '#22d3ee' : '#a78bfa';
    if (forged) {
      gVerdict.textContent = 'PROOF ACCEPTED · run was never trained';
      gSub.innerHTML =
        `Every forged interval is optimized to land at 0.6·δ, so it re-executes within ` +
        `tolerance for <em>any</em> δ. Lower δ to reject it and the honest run fails first ` +
        `(its biggest audited interval errors at <b>${auditedHonestFloor.toFixed(3)}</b>). ` +
        `No δ separates them.`;
    } else if (accepted) {
      gVerdict.textContent = 'PROOF ACCEPTED · honest run verified';
      gSub.innerHTML =
        `All ${q} audited intervals reproduced within δ. But a forgery clears this same bar — ` +
        `flip “forge the run.” The minimum δ that passes here is <b>${honestFloor.toFixed(3)}</b>.`;
    } else {
      gVerdict.textContent = 'PROOF REJECTED · honest node slashed';
      gSub.innerHTML =
        `<b>${honestFail}</b> audited interval${honestFail > 1 ? 's' : ''} exceeded δ — honest ` +
        `re-execution is non-deterministic, and the biggest updates diverge most. Tightening δ ` +
        `to catch forgers false-rejects real work first.`;
    }

    // ledger
    const verSteps = q * K;
    const verPctRaw = (verSteps / T) * 100;
    honestCost.cv.textContent = commas(T);
    honestCost.cs.textContent = 'gradient steps · full run';
    verifierCost.cv.textContent = commas(verSteps);
    verifierCost.cs.textContent = `${pct(verPctRaw)}% of training · Q×${K}`;
    if (forged) {
      forgerCost.c.classList.remove('spd-na');
      forgerCost.cv.textContent = commas(SPOOF_STEPS);
      forgerCost.cs.innerHTML =
        verSteps > SPOOF_STEPS
          ? `${SPOOF_PCT}% · <span style="color:#f0883e">cheaper than the audit</span>`
          : `${SPOOF_PCT}% of training`;
    } else {
      forgerCost.c.classList.add('spd-na');
      forgerCost.cv.textContent = '—';
      forgerCost.cs.textContent = 'no forgery in play';
    }

    // header sub
    sub.innerHTML = forged
      ? `A trajectory <b>reconstructed backward</b> from the final model — same shape as a real run, none of the work.`
      : `An <b>honest</b> trajectory. Audited intervals are re-executed and checked against δ.`;

    // toggle + outputs
    sw.classList.toggle('spd-on', forged);
    sw.setAttribute('aria-checked', forged ? 'true' : 'false');
    dOut.textContent = delta.toFixed(3);
    qOut.textContent = String(q);
  }

  // ---------------------------------------------------------------- events
  const onDelta = () => {
    delta = Number(dSlider.value);
    render();
  };
  dSlider.addEventListener('input', onDelta);

  const onQ = () => {
    q = Number(qSlider.value);
    render();
  };
  qSlider.addEventListener('input', onQ);

  const onToggle = () => {
    forged = !forged;
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

  const onBar = (e: Event) => {
    const i = bars.findIndex((b) => b.btn === e.currentTarget);
    if (i < 0) return;
    sel = i;
    render();
  };
  for (const { btn } of bars) btn.addEventListener('click', onBar);

  const ro = new ResizeObserver(([entry]) => {
    root.classList.toggle('spd-narrow', (entry?.contentRect.width ?? 700) < 460);
  });
  ro.observe(container);

  render();

  return () => {
    ro.disconnect();
    dSlider.removeEventListener('input', onDelta);
    qSlider.removeEventListener('input', onQ);
    sw.removeEventListener('click', onToggle);
    sw.removeEventListener('keydown', onSwKey);
    for (const { btn } of bars) btn.removeEventListener('click', onBar);
    style.remove();
    root.remove();
  };
}
