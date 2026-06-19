/**
 * Artifact: royalty-stack — Royalty Stack
 * Manifest: content/artifacts/royalty-stack/manifest.json
 *
 * Story Protocol's two royalty policies run over the same derivative chain.
 * Tap any IP asset to pay 100 WIP into it and watch the money propagate to
 * its ancestors: LAP (Liquid Absolute Percentage) gives every ancestor its
 * full rev-share of the gross and hard-caps the chain when the royalty
 * stack hits 100% (RoyaltyPolicyLAP__AboveMaxPercent); LRP (Liquid Relative
 * Percentage) pays only direct parents and compounds, so deep ancestors get
 * exponentially diluted. Formula simulator on protocol constants cited in
 * the companion article — no dataset snapshot, no runtime fetches.
 *
 * Layout: shared responsive primitive (stage chain · panel readout · footer
 * controls · caption note). Reduced motion handled by ArtifactMount.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

type Policy = 'LAP' | 'LRP';

const PAY = 100; // WIP paid into the tapped node
const MIN_GENS = 2;
const MAX_GENS = 8;

const fmt = (v: number): string => {
  if (v === 0) return '0';
  if (v >= 0.01) return v.toFixed(2);
  // tiny amounts: two significant digits so dilution stays visible
  return v.toExponential(1);
};

/** Net amounts per node (index 0 = original IP, last = deepest gen) when
 *  `pay` WIP is paid into node `target` under `policy` with uniform edge
 *  rev-share `r` (fraction). Sums to `pay` exactly. */
function distribute(policy: Policy, r: number, nodes: number, target: number, pay: number): number[] {
  const out = new Array<number>(nodes).fill(0);
  if (policy === 'LAP') {
    // every ancestor takes r of the GROSS; the paid vault keeps 1 - stack
    for (let a = 0; a < target; a++) out[a] = pay * r;
    out[target] = pay * (1 - target * r);
  } else {
    // each hop takes r of what reaches it; ancestors net (1-r) of their cut
    out[target] = pay * (1 - r);
    for (let d = 1; d <= target; d++) {
      const idx = target - d;
      const gross = pay * Math.pow(r, d);
      out[idx] = idx === 0 ? gross : gross * (1 - r);
    }
    if (target === 0) out[0] = pay;
  }
  return out;
}

export default function mount(container: HTMLElement): () => void {
  let policy: Policy = 'LAP';
  let revShare = 10; // percent per license edge
  let gens = 4; // derivative generations below the original
  let target = 4; // node receiving the payment

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(200px, 52vw, 340px)',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .rs-controls { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      min-width:0; max-width:100%; }
    .rs-toggle { display:inline-flex; flex-wrap:wrap; border:1px solid rgba(124,140,255,.14);
      border-radius:8px; overflow:hidden; max-width:100%; }
    .rs-toggle button { appearance:none; border:0; background:transparent; color:#5b6378;
      font:600 11px 'JetBrains Mono', monospace; letter-spacing:.05em; padding:7px 12px;
      cursor:pointer; transition:color .2s, background .2s; }
    .rs-toggle button[aria-pressed="true"] { background:rgba(91,140,255,.13); color:#e7eaf3; }
    .rs-toggle button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .rs-ctl { display:flex; align-items:center; gap:7px; min-width:0; max-width:100%; flex-wrap:wrap; }
    .rs-ctl label { font-size:10px; letter-spacing:.08em; text-transform:uppercase;
      color:#5b6378; }
    .rs-ctl input[type=range] { width:110px; max-width:100%; min-width:80px; accent-color:#5b8cff; }
    .rs-ctl output { color:#e7eaf3; font-weight:600; min-width:3.2ch; }
    .rs-step { display:inline-flex; align-items:center; gap:6px; }
    .rs-step button { appearance:none; width:24px; height:24px; border-radius:6px;
      border:1px solid rgba(124,140,255,.3); background:rgba(91,140,255,.1);
      color:#e7eaf3; font:700 13px 'JetBrains Mono', monospace; cursor:pointer;
      transition:background .2s, border-color .2s, opacity .2s; line-height:1; }
    .rs-step button:hover:not(:disabled), .rs-step button:focus-visible {
      background:rgba(91,140,255,.22); border-color:rgba(124,140,255,.7); }
    .rs-step button:focus-visible { outline:2px solid #5b8cff; outline-offset:1px; }
    .rs-step button:disabled { opacity:.35; cursor:default; }
    .rs-chain { position:absolute; inset:0; display:flex; flex-direction:column;
      min-width:0; overflow-y:auto;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .rs-panel { height:100%; border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:12px 14px; display:flex; flex-direction:column; gap:6px;
      min-width:0; overflow-y:auto;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .rs-node { appearance:none; text-align:left; display:flex; align-items:center; gap:10px;
      flex-wrap:wrap;
      border:1px solid rgba(124,140,255,.18); border-radius:10px; background:#0d1322;
      color:#8d95ad; padding:7px 12px; cursor:pointer; width:100%; min-width:0; max-width:100%;
      box-sizing:border-box;
      font:500 11.5px 'JetBrains Mono', monospace;
      transition:border-color .2s, background .2s, box-shadow .2s; }
    .rs-node:hover:not(:disabled), .rs-node:focus-visible {
      border-color:rgba(124,140,255,.55); background:#101830; }
    .rs-node:focus-visible { outline:2px solid #5b8cff; outline-offset:1px; }
    .rs-node.paid { border-color:#22d3ee; box-shadow:0 0 14px rgba(34,211,238,.18); }
    .rs-node.dead { border-style:dashed; border-color:rgba(248,113,113,.45);
      cursor:default; opacity:.65; }
    .rs-name { color:#e7eaf3; font-weight:700; white-space:nowrap; flex:none; }
    .rs-stack { font-size:9.5px; color:#5b6378; white-space:nowrap; min-width:0;
      overflow:hidden; text-overflow:ellipsis; }
    .rs-stack b { color:#8b5cf6; font-weight:600; }
    .rs-dead-tag { font-size:9.5px; color:#f87171; white-space:nowrap; min-width:0;
      overflow:hidden; text-overflow:ellipsis; }
    .rs-barwrap { flex:1 1 60px; height:10px; border-radius:5px; background:rgba(91,140,255,.08);
      overflow:hidden; min-width:40px; }
    .rs-bar { height:100%; width:0%; border-radius:5px;
      background:linear-gradient(90deg,#5b8cff,#22d3ee);
      transition:width .55s cubic-bezier(.22,.8,.3,1); }
    .rs-amt { color:#e7eaf3; font-weight:600; font-variant-numeric:tabular-nums;
      min-width:8.5ch; text-align:right; white-space:nowrap; flex:none; margin-left:auto; }
    .rs-amt.zero { color:#5b6378; font-weight:500; }
    .rs-edge { display:flex; align-items:center; gap:8px; padding:0 0 0 26px;
      height:20px; flex:none; min-width:0; max-width:100%; box-sizing:border-box; }
    .rs-edge-line { width:1px; height:100%; background:rgba(124,140,255,.25);
      position:relative; overflow:visible; }
    .rs-edge-line::after { content:''; position:absolute; left:-2.5px; top:0; width:6px;
      height:6px; border-radius:50%; background:#22d3ee; opacity:0; }
    .rs-edge.pulse .rs-edge-line::after { animation:rs-up .45s ease-out; }
    @keyframes rs-up { 0% { opacity:1; top:100%; } 100% { opacity:0; top:-6%; } }
    .rs-edge-label { font-size:9.5px; color:#5b6378; min-width:0; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .rs-edge-label b { color:#8d95ad; font-weight:600; }
    .rs-ptitle { font-size:10px; letter-spacing:.1em; text-transform:uppercase;
      color:#5b6378; overflow-wrap:anywhere; }
    .rs-pline { display:flex; justify-content:space-between; gap:10px; min-width:0;
      max-width:100%; }
    .rs-pline span { color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .rs-pline b { color:#e7eaf3; font-weight:600; font-variant-numeric:tabular-nums;
      white-space:nowrap; flex:none; }
    .rs-pline.hi b { color:#22d3ee; }
    .rs-revert { color:#f87171; font-size:10.5px; min-height:15px; overflow-wrap:anywhere; }
    .rs-compare { border-top:1px solid rgba(124,140,255,.14); padding-top:7px;
      font-size:10.5px; color:#8d95ad; overflow-wrap:anywhere; }
    .rs-compare b { color:#8b5cf6; }
    .rs-fine { font:500 12px/1.45 'JetBrains Mono', monospace;
      font-size:9px; color:#5b6378; line-height:1.5; overflow-wrap:anywhere;
      min-width:0; max-width:100%; }
  `;
  stage.appendChild(style);

  /* ---------- controls ---------- */
  const controls = document.createElement('div');
  controls.className = 'rs-controls';
  controlsSlot.appendChild(controls);

  const toggle = document.createElement('div');
  toggle.className = 'rs-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Royalty policy');
  const polBtns = (['LAP', 'LRP'] as Policy[]).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p === 'LAP' ? 'LAP · absolute' : 'LRP · relative';
    b.setAttribute('aria-pressed', String(p === policy));
    b.addEventListener('click', () => { policy = p; sync(true); });
    toggle.appendChild(b);
    return b;
  });
  controls.appendChild(toggle);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'rs-ctl';
  const sliderLabel = document.createElement('label');
  sliderLabel.textContent = 'rev share';
  sliderLabel.htmlFor = 'rs-share';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'rs-share';
  slider.min = '1';
  slider.max = '50';
  slider.step = '1';
  slider.value = String(revShare);
  const sliderOut = document.createElement('output');
  sliderOut.textContent = `${revShare}%`;
  slider.addEventListener('input', () => {
    revShare = Number(slider.value);
    sliderOut.textContent = `${revShare}%`;
    sync(true);
  });
  sliderWrap.append(sliderLabel, slider, sliderOut);
  controls.appendChild(sliderWrap);

  const step = document.createElement('div');
  step.className = 'rs-ctl rs-step';
  const stepLabel = document.createElement('label');
  stepLabel.textContent = 'generations';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.setAttribute('aria-label', 'Remove the deepest generation');
  const stepOut = document.createElement('output');
  stepOut.textContent = String(gens);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.setAttribute('aria-label', 'Add a derivative generation');
  minus.addEventListener('click', () => {
    if (gens <= MIN_GENS) return;
    gens -= 1;
    if (target > gens) target = gens;
    rebuild();
  });
  plus.addEventListener('click', () => {
    if (gens >= MAX_GENS) return;
    gens += 1;
    target = gens;
    rebuild();
  });
  step.append(stepLabel, minus, stepOut, plus);
  controls.appendChild(step);

  /* ---------- stage: chain ---------- */
  const chain = document.createElement('div');
  chain.className = 'rs-chain';
  stage.appendChild(chain);

  interface NodeEls {
    btn: HTMLButtonElement;
    stack: HTMLSpanElement;
    bar: HTMLDivElement;
    amt: HTMLSpanElement;
    edge?: HTMLDivElement;
    edgeLabel?: HTMLSpanElement;
  }
  let nodeEls: NodeEls[] = [];

  function buildChain() {
    chain.textContent = '';
    nodeEls = [];
    for (let i = 0; i <= gens; i++) {
      if (i > 0) {
        const edge = document.createElement('div');
        edge.className = 'rs-edge';
        const line = document.createElement('div');
        line.className = 'rs-edge-line';
        const label = document.createElement('span');
        label.className = 'rs-edge-label';
        edge.append(line, label);
        chain.appendChild(edge);
        nodeEls[i] = { ...nodeEls[i]!, edge, edgeLabel: label } as NodeEls;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rs-node';
      const name = document.createElement('span');
      name.className = 'rs-name';
      name.textContent = i === 0 ? 'ORIGINAL IP' : `GEN ${i}`;
      const stack = document.createElement('span');
      stack.className = 'rs-stack';
      const barwrap = document.createElement('div');
      barwrap.className = 'rs-barwrap';
      const bar = document.createElement('div');
      bar.className = 'rs-bar';
      barwrap.appendChild(bar);
      const amt = document.createElement('span');
      amt.className = 'rs-amt';
      btn.append(name, stack, barwrap, amt);
      btn.addEventListener('click', () => pay(i));
      chain.appendChild(btn);
      nodeEls[i] = { ...(nodeEls[i] ?? {}), btn, stack, bar, amt } as NodeEls;
    }
  }

  /* ---------- panel ---------- */
  const ptitle = document.createElement('div');
  ptitle.className = 'rs-ptitle';
  const plines = document.createElement('div');
  const revert = document.createElement('div');
  revert.className = 'rs-revert';
  revert.setAttribute('role', 'status');
  const compare = document.createElement('div');
  compare.className = 'rs-compare';
  panel.append(ptitle, plines, revert, compare);

  /* ---------- caption ---------- */
  const fine = document.createElement('div');
  fine.className = 'rs-fine';
  fine.textContent = 'Constants from Story mainnet (chain 1514): RoyaltyModule 0xD2f6…0086, maxPercent = 100,000,000 (100%); commercialRevShare encoded as 1% = 1,000,000. LAP reverts onLicenseMinting when an ancestor stack would pass 100%.';
  caption.appendChild(fine);

  /** deepest generation that can exist under LAP at the current rev share */
  const lapMaxGen = () => Math.floor(100 / revShare);

  function deadFrom(): number {
    // gen k has royalty stack k·r under LAP; the mint creating gen k reverts
    // when (k-1)·r + r > 100  ⇔  k·r > 100
    return policy === 'LAP' ? lapMaxGen() + 1 : gens + 1;
  }

  function pay(i: number) {
    if (nodeEls[i]!.btn.classList.contains('dead')) return;
    target = i;
    sync(true);
  }

  function sync(animate: boolean) {
    polBtns[0]!.setAttribute('aria-pressed', String(policy === 'LAP'));
    polBtns[1]!.setAttribute('aria-pressed', String(policy === 'LRP'));
    stepOut.textContent = String(gens);
    minus.disabled = gens <= MIN_GENS;
    plus.disabled = gens >= MAX_GENS;

    const r = revShare / 100;
    const dead = deadFrom();
    if (target >= dead) target = dead - 1;
    const net = distribute(policy, r, gens + 1, target, PAY);

    for (let i = 0; i <= gens; i++) {
      const n = nodeEls[i]!;
      const isDead = i >= dead;
      n.btn.classList.toggle('dead', isDead);
      n.btn.classList.toggle('paid', i === target && !isDead);
      n.btn.disabled = isDead;
      const stackPct = i * revShare;
      if (isDead) {
        n.stack.className = 'rs-dead-tag';
        n.stack.textContent = 'mint reverts: AboveMaxPercent';
      } else {
        n.stack.className = 'rs-stack';
        n.stack.innerHTML = policy === 'LAP'
          ? `stack <b>${stackPct}%</b>`
          : `direct parent <b>${i === 0 ? '—' : `${revShare}%`}</b>`;
      }
      n.btn.setAttribute('aria-label', isDead
        ? `Generation ${i}: cannot exist — license mint reverts, royalty stack would exceed 100%`
        : `Pay ${PAY} WIP into ${i === 0 ? 'the original IP' : `generation ${i}`}`);
      if (n.edgeLabel) n.edgeLabel.innerHTML = `license: <b>${revShare}%</b> rev share`;
      const v = isDead ? 0 : net[i]!;
      n.bar.style.width = `${Math.max(v / PAY * 100, v > 0 ? 1.5 : 0)}%`;
      n.amt.textContent = isDead ? '—' : `${fmt(v)} WIP`;
      n.amt.classList.toggle('zero', v === 0 || isDead);
      if (animate && n.edge && i <= target && i > 0 && !isDead && net[i - 1]! > 0) {
        n.edge.classList.remove('pulse');
        // restart the CSS animation
        void n.edge.offsetWidth;
        n.edge.classList.add('pulse');
      }
    }

    ptitle.textContent = `${PAY} WIP paid into ${target === 0 ? 'the original IP' : `gen ${target}`} · ${policy}`;
    plines.textContent = '';
    const keepLine = document.createElement('div');
    keepLine.className = 'rs-pline hi';
    const ks = document.createElement('span');
    ks.textContent = `${target === 0 ? 'original IP' : `gen ${target}`} vault keeps`;
    const kb = document.createElement('b');
    kb.textContent = `${fmt(net[target]!)} WIP (${(net[target]! / PAY * 100).toFixed(net[target]! / PAY >= 0.01 ? 0 : 2)}%)`;
    keepLine.append(ks, kb);
    plines.appendChild(keepLine);
    for (let d = 1; d <= target; d++) {
      const idx = target - d;
      const line = document.createElement('div');
      line.className = 'rs-pline';
      const s = document.createElement('span');
      s.textContent = `${idx === 0 ? 'original IP' : `gen ${idx}`} (${d} hop${d > 1 ? 's' : ''} up)`;
      const b = document.createElement('b');
      b.textContent = `+${fmt(net[idx]!)} WIP`;
      line.append(s, b);
      plines.appendChild(line);
    }

    if (policy === 'LAP') {
      const maxG = lapMaxGen();
      revert.textContent = gens >= maxG
        ? `at ${revShare}%/edge the stack hits 100% at gen ${maxG} — deeper mints revert with RoyaltyPolicyLAP__AboveMaxPercent()`
        : `headroom: ${100 - gens * revShare}% — chain caps at gen ${maxG} (${revShare}%/edge)`;
    } else {
      revert.textContent = 'no cap — but each hop multiplies, so distance is dilution';
    }

    const other: Policy = policy === 'LAP' ? 'LRP' : 'LAP';
    const otherDead = other === 'LAP' ? lapMaxGen() + 1 : gens + 1;
    if (target >= otherDead) {
      compare.innerHTML = `under <b>${other}</b>: gen ${target} could not exist — its license mint would revert`;
    } else if (target === 0) {
      compare.innerHTML = `paying the original directly involves no ancestors — both policies hand it all ${PAY} WIP`;
    } else {
      const otherNet = distribute(other, r, gens + 1, target, PAY);
      compare.innerHTML = `same payment under <b>${other}</b>: the original IP would net <b>${fmt(otherNet[0]!)} WIP</b> instead of ${fmt(net[0]!)} WIP`;
    }
  }

  function rebuild() {
    buildChain();
    sync(false);
  }

  rebuild();

  return () => {
    layout.dispose();
    style.remove();
  };
}
