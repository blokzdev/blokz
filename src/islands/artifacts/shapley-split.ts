/**
 * Artifact: shapley-split — The Shapley Split
 * Manifest: content/artifacts/shapley-split/manifest.json
 *
 * Layout: shared `createArtifactLayout` ('rail'). This artifact is list-dominant,
 * so the slots map a little unusually — stage = the thin pool allocation bar (the
 * summary viz), panel = the contributor rows + verdict (the main interactive
 * readout), controls = the rule tabs + sybil toggle, caption = the formula note.
 * In landscape the bar sits left with the rows rail on the right; portrait stacks
 * bar → rows → tabs → note. The per-row 3-column grid is driven by its own small
 * ResizeObserver on the panel slot (rows stack when the panel is narrow).
 *
 * A calculator for the central problem of on-chain data markets: how do you
 * split one reward pool fairly across contributors whose data overlaps? Five
 * contributors to a stylised wearables DataDAO each cover a set of health
 * signals at some quality. The buyer's utility of a coalition S is
 *
 *     V(S) = Σ_concept  worth(concept) · max{ quality_i : i∈S covers concept }
 *
 * a submodular coverage function: a second source for a signal only adds the
 * quality it improves on. Three allocation rules split the same pool over it:
 *   - Equal split      — pool / n, ignores value entirely.
 *   - Leave-one-out    — ∝ V(N) − V(N\{i}); zeroes anything another row covers.
 *   - Shapley value    — ∝ average marginal contribution over all orderings,
 *                        the unique rule satisfying efficiency, symmetry,
 *                        null-player and additivity (Ghorbani & Zou 2019).
 * Shapley is computed EXACTLY by brute force over all 2^n coalitions (n ≤ 7).
 *
 * The "Sybil attack" clones the top contributor three times: equal split pays
 * the attacker 3 shares, Shapley splits one contributor's value across the
 * clones (redundancy penalty), and leave-one-out zeroes every clone. Sliders
 * set per-row quality (keyboard-ok); a row's in/out button drops it from the
 * round; the rule tabs switch the stacked allocation bar.
 */

import { createArtifactLayout } from '@/lib/artifact-layout';

const POOL = 10_000; // reward pool for one round, in DataDAO tokens

interface Concept {
  id: string;
  label: string;
  worth: number;
}
const CONCEPTS: Concept[] = [
  { id: 'glucose', label: 'glucose', worth: 4 },
  { id: 'hr', label: 'heart-rate', worth: 3 },
  { id: 'sleep', label: 'sleep', worth: 3 },
  { id: 'steps', label: 'steps', worth: 2 },
  { id: 'workouts', label: 'workouts', worth: 2 },
  { id: 'diet', label: 'diet', worth: 2 },
];

interface Base {
  id: string;
  name: string;
  color: string;
  covers: string[];
  q0: number;
  blurb: string;
}
const BASE: Base[] = [
  { id: 'ava', name: 'Ava', color: '#22d3ee', covers: ['hr', 'sleep', 'steps', 'workouts'], q0: 0.9, blurb: 'full smartwatch feed' },
  { id: 'ben', name: 'Ben', color: '#5b8cff', covers: ['glucose', 'diet'], q0: 0.95, blurb: 'CGM + food log' },
  { id: 'cleo', name: 'Cleo', color: '#8b5cf6', covers: ['steps', 'workouts'], q0: 0.6, blurb: 'budget pedometer' },
  { id: 'dev', name: 'Dev', color: '#f0883e', covers: ['hr', 'sleep'], q0: 0.7, blurb: 'sleep-ring export' },
  { id: 'eli', name: 'Eli', color: '#34d399', covers: ['diet'], q0: 0.5, blurb: 'hand-typed diet diary' },
];

type RuleId = 'equal' | 'loo' | 'shapley';
const RULES: { id: RuleId; label: string }[] = [
  { id: 'equal', label: 'Equal split' },
  { id: 'loo', label: 'Leave-one-out' },
  { id: 'shapley', label: 'Shapley value' },
];

interface Member {
  key: string; // unique per active row
  baseId: string; // which base contributor controls it
  name: string;
  color: string;
  covers: string[];
  q: number;
  isClone: boolean;
}

interface State {
  quality: Record<string, number>;
  excluded: Set<string>;
  sybil: boolean;
  rule: RuleId;
}

const WORTH = new Map(CONCEPTS.map((c) => [c.id, c.worth]));

/** V(S): worth-weighted best-quality coverage of every concept by members in mask. */
function coalitionValue(members: Member[], mask: number): number {
  let v = 0;
  for (const c of CONCEPTS) {
    let best = 0;
    for (let i = 0; i < members.length; i++) {
      if (!(mask & (1 << i))) continue;
      const m = members[i];
      if (m.covers.includes(c.id) && m.q > best) best = m.q;
    }
    if (best > 0) v += (WORTH.get(c.id) as number) * best;
  }
  return v;
}

const fact: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= 8; i++) f[i] = f[i - 1] * i;
  return f;
})();

interface Alloc {
  equal: number[];
  loo: number[];
  shapley: number[];
  vFull: number;
}

/** Exact Shapley + leave-one-out + equal allocations of POOL over the members. */
function allocate(members: Member[]): Alloc {
  const n = members.length;
  const equal = new Array(n).fill(n ? POOL / n : 0);
  if (n === 0) return { equal, loo: [], shapley: [], vFull: 0 };

  const full = 1 << n;
  const V = new Float64Array(full);
  for (let mask = 0; mask < full; mask++) V[mask] = coalitionValue(members, mask);
  const vFull = V[full - 1];

  // Exact Shapley: φ_i = Σ_{S⊆N\i} |S|!(n-|S|-1)!/n! · (V(S∪i) − V(S)).
  const phi = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    let acc = 0;
    for (let mask = 0; mask < full; mask++) {
      if (mask & bit) continue;
      let s = 0;
      for (let b = 0; b < n; b++) if (mask & (1 << b)) s++;
      const w = (fact[s] * fact[n - s - 1]) / fact[n];
      acc += w * (V[mask | bit] - V[mask]);
    }
    phi[i] = acc;
  }
  const shapley = phi.map((p) => (vFull > 0 ? (POOL * p) / vFull : POOL / n));

  // Leave-one-out, normalised over the pool (clamp tiny negatives to 0).
  const loRaw = members.map((_, i) => Math.max(0, vFull - V[(full - 1) & ~(1 << i)]));
  const loSum = loRaw.reduce((a, b) => a + b, 0);
  const loo = loSum > 0 ? loRaw.map((x) => (POOL * x) / loSum) : equal.slice();

  return { equal, loo, shapley, vFull };
}

function buildMembers(state: State): Member[] {
  const members: Member[] = [];
  for (const b of BASE) {
    if (state.excluded.has(b.id)) continue;
    members.push({
      key: b.id,
      baseId: b.id,
      name: b.name,
      color: b.color,
      covers: b.covers,
      q: state.quality[b.id],
      isClone: false,
    });
  }
  if (state.sybil && !state.excluded.has('ava')) {
    const ava = BASE[0];
    for (let k = 2; k <= 3; k++) {
      members.push({
        key: `ava-${k}`,
        baseId: 'ava',
        name: `Ava#${k}`,
        color: ava.color,
        covers: ava.covers,
        q: state.quality['ava'],
        isClone: true,
      });
    }
  }
  return members;
}

const tokens = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (frac: number) => `${(frac * 100).toFixed(frac < 0.0995 ? 1 : 0)}%`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    // The pool bar is a thin horizontal summary; the rows in the panel carry the
    // height, so keep the stage short.
    stageMin: 'clamp(60px, 14vw, 90px)',
  });

  const style = document.createElement('style');
  style.textContent = `
    .ss-stage, .ss-panel, .ss-controls, .ss-caption {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .ss-stage { display:flex; flex-direction:column; gap:8px; }
    .ss-panel { display:flex; flex-direction:column; gap:11px; min-height:0; overflow-y:auto; }
    .ss-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .ss-tabs { display:flex; gap:6px; }
    .ss-tab { border:1px solid rgba(124,140,255,.24); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#8d95ad; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.06em; text-transform:uppercase; padding:6px 9px; white-space:nowrap; }
    .ss-tab:hover, .ss-tab:focus-visible { border-color:#22d3ee; color:#e7eaf3; outline:none; }
    .ss-tab.ss-on { background:rgba(34,211,238,.12); color:#22d3ee; border-color:#22d3ee;
      box-shadow:0 0 12px rgba(34,211,238,.22); }
    .ss-sybil { border:1px solid rgba(240,136,62,.4); border-radius:7px; cursor:pointer;
      background:#0d1322; color:#f0883e; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.06em; text-transform:uppercase; padding:6px 10px; white-space:nowrap; }
    .ss-sybil:hover, .ss-sybil:focus-visible { outline:none; box-shadow:0 0 12px rgba(240,136,62,.25); }
    .ss-sybil.ss-on { background:rgba(240,136,62,.16); box-shadow:inset 0 0 0 1px rgba(240,136,62,.55); }
    .ss-poolbar { position:relative; height:30px; border-radius:8px; overflow:hidden;
      background:#070b14; box-shadow:inset 0 0 0 1px rgba(124,140,255,.12); display:flex; }
    .ss-seg { height:100%; position:relative; min-width:0;
      transition:width .4s cubic-bezier(.22,1,.36,1), opacity .25s; overflow:hidden;
      border-right:1px solid #05070d; }
    .ss-seg:last-child { border-right:none; }
    .ss-seg.ss-clone { background-image:repeating-linear-gradient(45deg,
      rgba(5,7,13,0) 0 5px, rgba(5,7,13,.45) 5px 10px); }
    .ss-seg-pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font:700 10px 'JetBrains Mono', monospace; color:#05070d; letter-spacing:.02em; }
    .ss-poolcap { display:flex; align-items:baseline; justify-content:space-between; gap:8px;
      margin-top:-3px; flex-wrap:wrap; }
    .ss-poolcap .ss-lab { font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .ss-poolcap b { color:#e7eaf3; font-weight:600; }
    .ss-rows { display:flex; flex-direction:column; gap:7px; }
    .ss-row { display:grid; grid-template-columns:1fr; gap:7px; align-items:center;
      border:1px solid rgba(124,140,255,.12); border-radius:10px; background:#0d1322; padding:8px 11px; }
    .ss-rows.ss-wide-rows .ss-row { grid-template-columns:128px 1fr 128px; gap:10px; }
    .ss-who { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .ss-name { display:flex; align-items:center; gap:6px; color:#e7eaf3; font-size:12px; font-weight:600; }
    .ss-dot { width:9px; height:9px; border-radius:2px; flex:none; }
    .ss-tagclone { font:600 8px 'JetBrains Mono', monospace; letter-spacing:.08em; color:#f0883e;
      border:1px solid rgba(240,136,62,.5); border-radius:4px; padding:1px 4px; }
    .ss-blurb { font-size:9.5px; color:#5b6378; }
    .ss-chips { display:flex; flex-wrap:wrap; gap:3px; }
    .ss-chip { font-size:8.5px; letter-spacing:.02em; color:#8d95ad; background:#070b14;
      border:1px solid rgba(124,140,255,.14); border-radius:4px; padding:1px 5px; }
    .ss-qual label { display:flex; justify-content:space-between; gap:6px; font-size:9px;
      letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .ss-qual output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .ss-qual input[type=range] { width:100%; cursor:pointer; margin:3px 0 0; accent-color:#22d3ee; }
    .ss-pay { display:flex; flex-direction:column; gap:2px; align-items:flex-start; text-align:left; }
    .ss-rows.ss-wide-rows .ss-pay { align-items:flex-end; text-align:right; }
    .ss-pay-main { color:#e7eaf3; font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }
    .ss-pay-main .ss-tok { color:#5b6378; font-size:9.5px; font-weight:500; margin-left:4px; }
    .ss-pay-alt { font-size:9px; color:#5b6378; letter-spacing:.02em; }
    .ss-pay-alt b { color:#8d95ad; font-weight:600; }
    .ss-out { color:#3a4256; }
    .ss-out .ss-pay-main, .ss-out .ss-name { color:#5b6378; }
    .ss-io { border:1px solid rgba(124,140,255,.2); border-radius:5px; cursor:pointer;
      background:#070b14; color:#8d95ad; font:600 8px 'JetBrains Mono', monospace;
      letter-spacing:.06em; text-transform:uppercase; padding:2px 5px; white-space:nowrap; }
    .ss-io:hover, .ss-io:focus-visible { color:#e7eaf3; border-color:#22d3ee; outline:none; }
    .ss-verdict { border-top:1px solid rgba(124,140,255,.12); padding-top:9px;
      font-size:10.5px; color:#8d95ad; line-height:1.55; }
    .ss-verdict b { color:#e7eaf3; }
    .ss-verdict .ss-warn { color:#f0883e; }
    .ss-verdict .ss-good { color:#22d3ee; }
    .ss-note { text-align:center; font-size:9px; color:#5b6378; letter-spacing:.02em; line-height:1.5; }
  `;
  layout.root.appendChild(style);

  layout.stage.classList.add('ss-stage');
  layout.panel.classList.add('ss-panel');
  layout.controls.classList.add('ss-controls');
  layout.caption.classList.add('ss-caption');

  const state: State = {
    quality: Object.fromEntries(BASE.map((b) => [b.id, b.q0])),
    excluded: new Set<string>(),
    sybil: false,
    rule: 'shapley',
  };

  /* ---- header: rule tabs + sybil toggle ---- */
  const head = document.createElement('div');
  head.className = 'ss-head';
  const tabs = document.createElement('div');
  tabs.className = 'ss-tabs';
  const tabBtns = new Map<RuleId, HTMLButtonElement>();
  for (const r of RULES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ss-tab';
    b.textContent = r.label;
    tabs.appendChild(b);
    tabBtns.set(r.id, b);
  }
  const sybilBtn = document.createElement('button');
  sybilBtn.type = 'button';
  sybilBtn.className = 'ss-sybil';
  sybilBtn.textContent = '⚠ Sybil attack';
  head.append(tabs, sybilBtn);
  layout.controls.appendChild(head);

  /* ---- pool allocation bar (stage) ---- */
  const poolBar = document.createElement('div');
  poolBar.className = 'ss-poolbar';
  layout.stage.appendChild(poolBar);
  const poolCap = document.createElement('div');
  poolCap.className = 'ss-poolcap';
  layout.stage.appendChild(poolCap);

  /* ---- contributor rows + verdict (panel) ---- */
  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'ss-rows';
  layout.panel.appendChild(rowsWrap);

  const verdict = document.createElement('div');
  verdict.className = 'ss-verdict';
  layout.panel.appendChild(verdict);

  const note = document.createElement('div');
  note.className = 'ss-note';
  note.textContent =
    'V(S) = Σ worth(signal) · best quality covering it · pool = 10,000 tokens · Shapley computed exactly over all 2ⁿ coalitions';
  layout.caption.appendChild(note);

  // Per-base slider refs (rows are rebuilt on structural change only).
  const sliderRefs = new Map<string, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const listeners: Array<[HTMLElement, string, EventListener]> = [];
  const on = (el: HTMLElement, ev: string, fn: EventListener) => {
    el.addEventListener(ev, fn);
    listeners.push([el, ev, fn]);
  };

  /** Rebuild contributor rows (structure changes: exclude / sybil toggles). */
  function buildRows() {
    rowsWrap.textContent = '';
    sliderRefs.clear();
    for (const b of BASE) {
      const excluded = state.excluded.has(b.id);
      const row = document.createElement('div');
      row.className = `ss-row${excluded ? ' ss-out' : ''}`;
      row.dataset.base = b.id;

      const who = document.createElement('div');
      who.className = 'ss-who';
      const name = document.createElement('div');
      name.className = 'ss-name';
      const dot = document.createElement('span');
      dot.className = 'ss-dot';
      dot.style.background = b.color;
      const nm = document.createElement('span');
      nm.textContent = b.name;
      name.append(dot, nm);
      if (state.sybil && b.id === 'ava' && !excluded) {
        const tag = document.createElement('span');
        tag.className = 'ss-tagclone';
        tag.textContent = '×3 SYBIL';
        name.append(tag);
      }
      const blurb = document.createElement('div');
      blurb.className = 'ss-blurb';
      blurb.textContent = b.blurb;
      const chips = document.createElement('div');
      chips.className = 'ss-chips';
      for (const cid of b.covers) {
        const chip = document.createElement('span');
        chip.className = 'ss-chip';
        chip.textContent = CONCEPTS.find((c) => c.id === cid)!.label;
        chips.appendChild(chip);
      }
      who.append(name, blurb, chips);

      const qual = document.createElement('div');
      qual.className = 'ss-qual';
      const label = document.createElement('label');
      label.htmlFor = `ss-q-${b.id}`;
      const qn = document.createElement('span');
      qn.textContent = 'quality';
      const out = document.createElement('output');
      label.append(qn, out);
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `ss-q-${b.id}`;
      input.min = '20';
      input.max = '100';
      input.step = '5';
      input.value = String(Math.round(state.quality[b.id] * 100));
      input.setAttribute('aria-label', `${b.name} data quality`);
      input.disabled = excluded;
      qual.append(label, input);
      sliderRefs.set(b.id, { input, out });
      on(input, 'input', () => {
        state.quality[b.id] = Number(input.value) / 100;
        render();
      });

      const pay = document.createElement('div');
      pay.className = 'ss-pay';
      const payMain = document.createElement('div');
      payMain.className = 'ss-pay-main';
      const payAlt = document.createElement('div');
      payAlt.className = 'ss-pay-alt';
      const io = document.createElement('button');
      io.type = 'button';
      io.className = 'ss-io';
      io.textContent = excluded ? '+ add back' : '⊘ drop';
      on(io, 'click', () => {
        if (state.excluded.has(b.id)) state.excluded.delete(b.id);
        else state.excluded.add(b.id);
        buildRows();
        render();
      });
      pay.append(payMain, payAlt, io);

      row.append(who, qual, pay);
      rowsWrap.appendChild(row);
    }
  }

  function setRule(rule: RuleId) {
    state.rule = rule;
    for (const [id, b] of tabBtns) b.classList.toggle('ss-on', id === rule);
    render();
  }
  for (const [id, b] of tabBtns) on(b, 'click', () => setRule(id));
  on(sybilBtn, 'click', () => {
    state.sybil = !state.sybil;
    sybilBtn.classList.toggle('ss-on', state.sybil);
    buildRows();
    render();
  });

  function render() {
    const members = buildMembers(state);
    const alloc = allocate(members);
    const series = alloc[state.rule];

    // Pool bar: one segment per active member, in member order.
    poolBar.textContent = '';
    members.forEach((m, i) => {
      const frac = series[i] / POOL;
      const seg = document.createElement('div');
      seg.className = `ss-seg${m.isClone ? ' ss-clone' : ''}`;
      seg.style.width = `${(frac * 100).toFixed(2)}%`;
      seg.style.background = m.color;
      seg.title = `${m.name}: ${pct(frac)} · ${tokens(series[i])} tokens`;
      if (frac > 0.08) {
        const p = document.createElement('span');
        p.className = 'ss-seg-pct';
        p.textContent = pct(frac);
        seg.appendChild(p);
      }
      poolBar.appendChild(seg);
    });

    poolCap.innerHTML = '';
    const lab = document.createElement('span');
    lab.className = 'ss-lab';
    lab.textContent = `${RULES.find((r) => r.id === state.rule)!.label} · ${members.length} contributors`;
    const right = document.createElement('span');
    right.append('coalition value V(N) = ');
    right.append(Object.assign(document.createElement('b'), { textContent: alloc.vFull.toFixed(2) }));
    right.append(` / ${CONCEPTS.reduce((a, c) => a + c.worth, 0)} max`);
    poolCap.append(lab, right);

    // Per-base payout: sum across that base's active members (covers Sybil clones).
    for (const b of BASE) {
      const refs = sliderRefs.get(b.id);
      if (refs) refs.out.textContent = state.excluded.has(b.id) ? '—' : pct(state.quality[b.id]);
      const row = rowsWrap.querySelector<HTMLElement>(`.ss-row[data-base="${b.id}"]`);
      if (!row) continue;
      const payMain = row.querySelector<HTMLElement>('.ss-pay-main')!;
      const payAlt = row.querySelector<HTMLElement>('.ss-pay-alt')!;
      if (state.excluded.has(b.id)) {
        payMain.textContent = 'out';
        payAlt.textContent = '';
        continue;
      }
      const idxs = members.map((m, i) => (m.baseId === b.id ? i : -1)).filter((i) => i >= 0);
      const sum = (arr: number[]) => idxs.reduce((a, i) => a + arr[i], 0);
      const main = sum(series);
      payMain.innerHTML = '';
      payMain.append(pct(main / POOL));
      payMain.append(Object.assign(document.createElement('span'), { className: 'ss-tok', textContent: `${tokens(main)} tok` }));
      payAlt.innerHTML = '';
      for (const id of ['equal', 'loo', 'shapley'] as RuleId[]) {
        if (id === state.rule) continue;
        const span = document.createElement('span');
        span.append(id === 'loo' ? 'loo ' : id === 'equal' ? 'equal ' : 'shapley ');
        span.append(Object.assign(document.createElement('b'), { textContent: pct(sum(alloc[id]) / POOL) }));
        payAlt.append(span, document.createTextNode('  '));
      }
    }

    // Verdict.
    verdict.innerHTML = '';
    if (state.sybil && !state.excluded.has('ava')) {
      const avaIdx = members.map((m, i) => (m.baseId === 'ava' ? i : -1)).filter((i) => i >= 0);
      const eqShare = avaIdx.reduce((a, i) => a + alloc.equal[i], 0) / POOL;
      const shShare = avaIdx.reduce((a, i) => a + alloc.shapley[i], 0) / POOL;
      const looShare = avaIdx.reduce((a, i) => a + alloc.loo[i], 0) / POOL;
      const perClone = avaIdx.length ? shShare / avaIdx.length : 0;
      verdict.append('Sybil: Ava splits one dataset across 3 wallets. Each clone’s Shapley value drops to ');
      verdict.append(Object.assign(document.createElement('b'), { textContent: pct(perClone) }));
      verdict.append(' — but the attacker’s ');
      verdict.append(Object.assign(document.createElement('b'), { textContent: 'total' }));
      verdict.append(' Shapley take ');
      verdict.append(Object.assign(document.createElement('span'), { className: 'ss-warn', textContent: pct(shShare) }));
      verdict.append(` rises above equal split’s ${pct(eqShare)}. Shapley is `);
      verdict.append(Object.assign(document.createElement('b'), { textContent: 'not replication-robust' }));
      verdict.append('. Only ');
      verdict.append(Object.assign(document.createElement('b'), { textContent: 'leave-one-out' }));
      verdict.append(' resists (clones get ');
      verdict.append(Object.assign(document.createElement('span'), { className: 'ss-good', textContent: pct(looShare) }));
      verdict.append(') — but it zeroes honest redundant contributors too.');
    } else {
      // Redundancy story: compare Cleo (redundant) under equal vs Shapley.
      const cleoActive = !state.excluded.has('cleo');
      const benActive = !state.excluded.has('ben');
      if (cleoActive) {
        const ci = members.findIndex((m) => m.baseId === 'cleo');
        const eq = alloc.equal[ci] / POOL;
        const sh = alloc.shapley[ci] / POOL;
        verdict.append('Redundancy penalty: ');
        verdict.append(Object.assign(document.createElement('b'), { textContent: 'Cleo' }));
        verdict.append(`’s steps & workouts are already covered by Ava at higher quality, so Cleo earns `);
        verdict.append(Object.assign(document.createElement('span'), { className: 'ss-warn', textContent: pct(sh) }));
        verdict.append(' under Shapley vs a flat ');
        verdict.append(Object.assign(document.createElement('b'), { textContent: pct(eq) }));
        verdict.append(' under equal split.');
        if (benActive) {
          const bi = members.findIndex((m) => m.baseId === 'ben');
          verdict.append(' Ben’s unique glucose feed earns ');
          verdict.append(Object.assign(document.createElement('span'), { className: 'ss-good', textContent: pct(alloc.shapley[bi] / POOL) }));
          verdict.append('. Drop Ben to watch the pool’s value collapse.');
        }
      } else {
        verdict.append('Add contributors back, or switch rules, to compare how each splits the same 10,000-token pool.');
      }
    }
  }

  setRule('shapley');
  buildRows();
  render();

  // The rows go 3-column only when their slot is wide enough; otherwise each row
  // stacks (who / slider / payout). Driven off the panel slot, independent of the
  // primitive's stage/rail breakpoint.
  const ro = new ResizeObserver(([entry]) => {
    rowsWrap.classList.toggle('ss-wide-rows', (entry?.contentRect.width ?? 0) >= 420);
  });
  ro.observe(layout.panel);

  return () => {
    ro.disconnect();
    for (const [el, ev, fn] of listeners) el.removeEventListener(ev, fn);
    style.remove();
    layout.dispose();
  };
}
