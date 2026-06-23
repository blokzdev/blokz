/**
 * Artifact: the-sealevel-lanes — The Sealevel Lanes
 * Manifest: content/artifacts/the-sealevel-lanes/manifest.json
 *
 * Interactive simulation of Solana's Sealevel parallel execution scheduler.
 *
 * Generates a batch of 8 AI-agent transactions per slot. Each transaction
 * declares a set of accounts it needs (writable = exclusive lock, read-only =
 * shared). The scheduler groups transactions into execution waves such that no
 * two transactions in the same wave hold conflicting write locks — and
 * therefore all transactions in a wave can execute on separate CPU threads
 * simultaneously.
 *
 * In "diverse accounts" mode the 8 transactions rarely conflict, producing
 * 1–2 wide waves (high parallelism). In "JUP contention" mode, ~65% of
 * transactions declare Jupiter Aggregator's program account as writable,
 * forcing them to queue into single-transaction waves (pure serialization).
 *
 * Layout: stage shows the wave plan; panel shows per-slot stats; controls
 * hold the contention toggle and next-slot button; caption explains the
 * W/R lock notation. Responsive: rail template (wide) → stacked (portrait).
 *
 * No deps beyond the shared layout primitive. No data.json — this is a
 * pure mechanism simulation seeded by slot number.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

// ── accounts ─────────────────────────────────────────────────────────────────
const ACCS: Record<string, string> = {
  JUP:   '#f59e0b',
  RAY:   '#22d3ee',
  ORCA:  '#8b5cf6',
  PYTH:  '#10b981',
  DRIFT: '#f0883e',
  MRK:   '#ec4899',
};
const ACC_NAMES = Object.keys(ACCS) as (keyof typeof ACCS)[];

// ── types ─────────────────────────────────────────────────────────────────────
interface TxAcc  { name: string; writable: boolean; }
interface Tx     { id: number; accounts: TxAcc[]; color: string; label: string; }

// ── seeded RNG (LCG) ──────────────────────────────────────────────────────────
function mkRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── transaction generation ────────────────────────────────────────────────────
const TX_COLORS = ['#5b8cff','#22d3ee','#8b5cf6','#f59e0b','#10b981','#f0883e','#ec4899','#60a5fa'];
const TX_LABELS = ['arb','yield','liq','mm','arb','yield','liq','mm'];

function generateBatch(slot: number, hot: boolean): Tx[] {
  const rand = mkRng(slot * 1337 + (hot ? 7919 : 6271));
  return Array.from({ length: 8 }, (_, i) => {
    const accs: TxAcc[] = [];
    if (hot && rand() < 0.65) {
      accs.push({ name: 'JUP', writable: true });
    }
    const avail = ACC_NAMES.filter(n => !accs.find(a => a.name === n));
    const shuffled = [...avail].sort(() => rand() - 0.5);
    const extra = 1 + Math.floor(rand() * (hot ? 1 : 2));
    for (let j = 0; j < Math.min(extra, shuffled.length); j++) {
      accs.push({ name: shuffled[j]!, writable: rand() < (hot ? 0.18 : 0.38) });
    }
    return { id: i, accounts: accs, color: TX_COLORS[i]!, label: `${TX_LABELS[i]} #${i + 1}` };
  });
}

// ── Sealevel scheduling (greedy wave assignment) ───────────────────────────────
function schedule(txs: Tx[]): Tx[][] {
  const waves: Tx[][] = [];
  const rem = [...txs];
  while (rem.length > 0) {
    const wave: Tx[] = [];
    const locked = new Set<string>();
    const placed: number[] = [];
    for (let i = 0; i < rem.length; i++) {
      const tx = rem[i]!;
      const ws = tx.accounts.filter(a => a.writable).map(a => a.name);
      if (!ws.some(n => locked.has(n))) {
        wave.push(tx);
        ws.forEach(n => locked.add(n));
        placed.push(i);
      }
    }
    for (let i = placed.length - 1; i >= 0; i--) rem.splice(placed[i]!, 1);
    waves.push(wave);
  }
  return waves;
}

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  .ssl-stage { display:flex; flex-direction:column; gap:7px; min-width:0; width:100%; }

  /* incoming strip */
  .ssl-inbox { display:flex; flex-wrap:wrap; gap:4px; align-items:center; min-width:0; }
  .ssl-inbox-tag { font:500 8px/1 'JetBrains Mono',monospace; letter-spacing:.1em;
    text-transform:uppercase; color:#5b6378; flex:0 0 auto; }
  .ssl-tx-mini { display:inline-flex; align-items:center; padding:2px 5px; border-radius:4px;
    font:700 7.5px 'JetBrains Mono',monospace; white-space:nowrap; flex:0 0 auto; }

  /* divider */
  .ssl-divider { display:flex; align-items:center; gap:7px; min-width:0; }
  .ssl-dline { flex:1; height:1px; background:rgba(124,140,255,.1); min-width:4px; }
  .ssl-dtxt { font:500 8.5px/1 'JetBrains Mono',monospace; letter-spacing:.07em;
    text-transform:uppercase; color:#5b6378; white-space:nowrap; flex:0 0 auto; }
  .ssl-dtxt b { color:#22d3ee; }
  .ssl-dtxt.ssl-hot { color:#f59e0b55; }
  .ssl-dtxt.ssl-hot b { color:#f59e0b; }

  /* waves */
  .ssl-waves { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .ssl-wave { display:flex; align-items:flex-start; gap:5px; min-width:0; }
  .ssl-wlabel { font:700 7.5px/1.35 'JetBrains Mono',monospace; letter-spacing:.05em;
    text-transform:uppercase; color:#5b6378; white-space:nowrap; flex:0 0 42px;
    padding-top:6px; }
  .ssl-wave-0 .ssl-wlabel { color:#22d3ee; }
  .ssl-wtxs { display:flex; flex-wrap:wrap; gap:4px; min-width:0; flex:1 1 0; }

  /* tx card */
  .ssl-tx { display:flex; flex-direction:column; gap:3px; padding:5px 7px; border-radius:7px;
    border:1px solid rgba(124,140,255,.14); background:#0d1322; min-width:0; flex:0 0 auto; }
  .ssl-wave-0 .ssl-tx { background:#0a0f1c; }
  .ssl-tlabel { font:600 8.5px/1 'JetBrains Mono',monospace; color:#9aa3bd; white-space:nowrap; }
  .ssl-wave-0 .ssl-tlabel { color:#e7eaf3; }
  .ssl-taccs { display:flex; gap:3px; flex-wrap:wrap; }
  .ssl-tacc { font:700 7px/1 'JetBrains Mono',monospace; padding:1.5px 4px; border-radius:3px;
    white-space:nowrap; border:1px solid; }
  .ssl-tacc-w { opacity:1; }
  .ssl-tacc-r { opacity:.5; border-style:dashed; background:transparent !important; }

  /* serial note */
  .ssl-snote { font:600 7.5px/1 'JetBrains Mono',monospace; letter-spacing:.05em;
    text-transform:uppercase; color:#f0883e; padding:2px 5px; border-radius:4px;
    background:rgba(240,136,62,.08); border:1px solid rgba(240,136,62,.2);
    align-self:center; white-space:nowrap; flex:0 0 auto; }

  /* panel */
  .ssl-panel { display:flex; flex-direction:column; gap:9px; }
  .ssl-srow { display:flex; flex-direction:column; gap:2px; }
  .ssl-slabel { font:500 8.5px/1 'JetBrains Mono',monospace; letter-spacing:.1em;
    text-transform:uppercase; color:#5b6378; }
  .ssl-sval { font:700 20px/1.1 'JetBrains Mono',monospace; color:#e7eaf3;
    font-variant-numeric:tabular-nums; }
  .ssl-sval-ok  { color:#22d3ee; }
  .ssl-sval-hot { color:#f0883e; }
  .ssl-ssub { font:500 9px/1.4 'JetBrains Mono',monospace; color:#8d95ad; min-width:0;
    overflow-wrap:anywhere; }
  .ssl-psep { border:none; border-top:1px solid rgba(124,140,255,.08); margin:1px 0; }
  .ssl-legend { display:flex; flex-direction:column; gap:4px; }
  .ssl-leg-head { font:500 8.5px/1 'JetBrains Mono',monospace; letter-spacing:.1em;
    text-transform:uppercase; color:#5b6378; }
  .ssl-leg-row { display:flex; align-items:center; gap:5px; min-width:0; }
  .ssl-leg-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
  .ssl-leg-txt { font:500 8.5px/1 'JetBrains Mono',monospace; color:#8d95ad; min-width:0;
    overflow-wrap:anywhere; }
  .ssl-leg-txt b { color:#f59e0b; }

  /* controls */
  .ssl-ctrl { display:flex; flex-direction:column; gap:8px; min-width:0; }
  .ssl-togrow { display:flex; align-items:center; gap:7px; flex-wrap:wrap; min-width:0; }
  .ssl-sw { position:relative; width:32px; height:17px; border-radius:9px; cursor:pointer;
    background:#141a2b; box-shadow:inset 0 0 0 1px rgba(124,140,255,.18);
    transition:.22s; flex:0 0 auto; }
  .ssl-sw::after { content:''; position:absolute; top:2px; left:2px; width:13px; height:13px;
    border-radius:50%; background:#5b6378; transition:.22s; }
  .ssl-sw.ssl-on { background:rgba(245,158,11,.16);
    box-shadow:inset 0 0 0 1px rgba(245,158,11,.5); }
  .ssl-sw.ssl-on::after { left:17px; background:#f59e0b;
    box-shadow:0 0 7px rgba(245,158,11,.6); }
  .ssl-sw:focus-visible { outline:2px solid rgba(34,211,238,.6); outline-offset:2px; }
  .ssl-tog-lbl { font:500 9px/1.35 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; }
  .ssl-tog-lbl b { color:#f59e0b; }
  .ssl-btn { padding:4px 9px; border-radius:6px; border:1px solid rgba(124,140,255,.18);
    background:#0d1322; color:#cdd3e3; font:600 9px 'JetBrains Mono',monospace;
    letter-spacing:.07em; text-transform:uppercase; cursor:pointer; transition:.15s;
    white-space:nowrap; }
  .ssl-btn:hover { border-color:rgba(34,211,238,.35); color:#22d3ee; }
  .ssl-btn:focus-visible { outline:2px solid rgba(34,211,238,.6); outline-offset:2px; }
  .ssl-btnrow { display:flex; gap:5px; align-items:center; flex-wrap:wrap; min-width:0; }
  .ssl-slotnum { font:500 9px/1 'JetBrains Mono',monospace; color:#5b6378; }
  .ssl-slotnum b { color:#8d95ad; }

  /* caption */
  .ssl-cap { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-width:0;
    overflow-wrap:anywhere; }
  .ssl-cap b { color:#9aa3bd; }
`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageMin: 'clamp(240px, 52vw, 440px)',
    panel:    true,
    controls: true,
    caption:  true,
  });
  const { stage, panel, controls, caption } = layout;

  // inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  stage.appendChild(styleEl);

  // mutable state
  let slotN = 1;
  let hot   = false;

  // ── render ──────────────────────────────────────────────────────────────────
  function render(): void {
    // clear stage content (keep styleEl) and panel
    for (const c of [...stage.children]) if (c !== styleEl) c.remove();
    panel.innerHTML = '';

    const txs   = generateBatch(slotN, hot);
    const waves = schedule(txs);
    const maxP  = Math.max(...waves.map(w => w.length));
    const avgP  = txs.length / waves.length;

    // ─ stage ─────────────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'ssl-stage';

    // incoming strip
    const inbox = document.createElement('div');
    inbox.className = 'ssl-inbox';
    const iTag = document.createElement('span');
    iTag.className = 'ssl-inbox-tag';
    iTag.textContent = 'pending';
    inbox.appendChild(iTag);
    for (const tx of txs) {
      const m = document.createElement('span');
      m.className = 'ssl-tx-mini';
      m.style.cssText = `border:1px solid ${tx.color}44;background:${tx.color}12;color:${tx.color};`;
      m.textContent = tx.label;
      inbox.appendChild(m);
    }
    wrap.appendChild(inbox);

    // divider label
    const div = document.createElement('div');
    div.className = 'ssl-divider';
    const dl = document.createElement('div'); dl.className = 'ssl-dline';
    const dt = document.createElement('div');
    dt.className = hot ? 'ssl-dtxt ssl-hot' : 'ssl-dtxt';
    const jupConflicts = hot ? txs.filter(t => t.accounts.some(a => a.name === 'JUP' && a.writable)).length : 0;
    dt.innerHTML = hot
      ? `<b>SEALEVEL</b> — ${jupConflicts} txs contend on JUP write lock`
      : `<b>SEALEVEL</b> — building account dependency graph`;
    const dr = document.createElement('div'); dr.className = 'ssl-dline';
    div.append(dl, dt, dr);
    wrap.appendChild(div);

    // execution waves
    const wavesEl = document.createElement('div');
    wavesEl.className = 'ssl-waves';

    for (let wi = 0; wi < waves.length; wi++) {
      const wv = waves[wi]!;
      const row = document.createElement('div');
      row.className = wi === 0 ? 'ssl-wave ssl-wave-0' : 'ssl-wave';

      const wlbl = document.createElement('div');
      wlbl.className = 'ssl-wlabel';
      wlbl.innerHTML = `T+${wi * 400}ms<br><span style="font-weight:400;color:#3d4459">wave ${wi + 1}</span>`;
      row.appendChild(wlbl);

      const wtxs = document.createElement('div');
      wtxs.className = 'ssl-wtxs';
      for (const tx of wv) wtxs.appendChild(mkTxCard(tx, wi === 0));
      row.appendChild(wtxs);

      // annotate serialized single-tx waves in hot mode
      if (hot && wv.length === 1) {
        const hasJup = wv[0]!.accounts.some(a => a.name === 'JUP' && a.writable);
        const note = document.createElement('div');
        note.className = 'ssl-snote';
        note.textContent = hasJup ? 'JUP write lock' : 'queued';
        row.appendChild(note);
      }

      wavesEl.appendChild(row);
    }
    wrap.appendChild(wavesEl);
    stage.appendChild(wrap);

    // ─ panel ────────────────────────────────────────────────────────────────
    const pWrap = document.createElement('div');
    pWrap.className = 'ssl-panel';

    pWrap.appendChild(mkStat(
      'WAVES',
      String(waves.length),
      waves.length >= 5 ? 'ssl-sval-hot' : 'ssl-sval-ok',
      `${txs.length} txs across ${waves.length} sequential batch${waves.length !== 1 ? 'es' : ''}`,
    ));
    pWrap.appendChild(mkStat(
      'MAX PARALLEL',
      `${maxP}×`,
      maxP <= 2 ? 'ssl-sval-hot' : 'ssl-sval-ok',
      `${maxP} concurrent txs in largest wave`,
    ));
    pWrap.appendChild(mkStat(
      'AVG THROUGHPUT',
      `${avgP.toFixed(1)}×`,
      avgP < 2 ? 'ssl-sval-hot' : 'ssl-sval-ok',
      `avg ${avgP.toFixed(1)} txs per wave`,
    ));

    const sep = document.createElement('hr');
    sep.className = 'ssl-psep';
    pWrap.appendChild(sep);

    // account legend — only accounts visible in this batch
    const visAccs = new Set<string>();
    txs.forEach(t => t.accounts.forEach(a => visAccs.add(a.name)));

    const leg = document.createElement('div');
    leg.className = 'ssl-legend';
    const legHead = document.createElement('div');
    legHead.className = 'ssl-leg-head';
    legHead.textContent = 'ACCOUNTS';
    leg.appendChild(legHead);

    for (const n of visAccs) {
      const c = ACCS[n]; if (!c) continue;
      const row = document.createElement('div');
      row.className = 'ssl-leg-row';
      const dot = document.createElement('div');
      dot.className = 'ssl-leg-dot';
      dot.style.background = c;
      const txt = document.createElement('div');
      txt.className = 'ssl-leg-txt';
      txt.innerHTML = n === 'JUP' && hot ? `<b>JUP ← hot</b>` : n;
      row.append(dot, txt);
      leg.appendChild(row);
    }
    pWrap.appendChild(leg);
    panel.appendChild(pWrap);
  }

  // ── element helpers ────────────────────────────────────────────────────────
  function mkTxCard(tx: Tx, active: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ssl-tx';
    card.style.borderColor = `${tx.color}40`;
    if (active) card.style.boxShadow = `0 0 0 1px ${tx.color}30, 0 0 10px ${tx.color}0c`;

    const lbl = document.createElement('div');
    lbl.className = 'ssl-tlabel';
    if (active) lbl.style.color = tx.color;
    lbl.textContent = tx.label;
    card.appendChild(lbl);

    const accs = document.createElement('div');
    accs.className = 'ssl-taccs';
    for (const a of tx.accounts) {
      const c = ACCS[a.name] ?? '#5b6378';
      const badge = document.createElement('span');
      badge.className = `ssl-tacc ssl-tacc-${a.writable ? 'w' : 'r'}`;
      badge.style.cssText = `border-color:${c};color:${c};background:${a.writable ? c + '1a' : 'transparent'};`;
      if (!a.writable) badge.style.borderStyle = 'dashed';
      badge.textContent = `${a.name} ${a.writable ? 'W' : 'R'}`;
      accs.appendChild(badge);
    }
    card.appendChild(accs);
    return card;
  }

  function mkStat(label: string, val: string, valCls: string, sub: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ssl-srow';
    const l = document.createElement('div'); l.className = 'ssl-slabel'; l.textContent = label;
    const v = document.createElement('div'); v.className = `ssl-sval ${valCls}`; v.textContent = val;
    const s = document.createElement('div'); s.className = 'ssl-ssub'; s.textContent = sub;
    el.append(l, v, s);
    return el;
  }

  // ── controls ───────────────────────────────────────────────────────────────
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'ssl-ctrl';

  const togRow = document.createElement('div');
  togRow.className = 'ssl-togrow';
  const sw = document.createElement('div');
  sw.className = 'ssl-sw';
  sw.tabIndex = 0;
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', 'false');
  sw.setAttribute('aria-label', 'JUP hot-account contention mode');
  const togLbl = document.createElement('div');
  togLbl.className = 'ssl-tog-lbl';
  togLbl.innerHTML = 'hot account<br><b>JUP contention</b>';
  togRow.append(sw, togLbl);
  ctrlWrap.appendChild(togRow);

  const btnRow = document.createElement('div');
  btnRow.className = 'ssl-btnrow';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'ssl-btn';
  nextBtn.textContent = '→ next slot';
  const slotLbl = document.createElement('div');
  slotLbl.className = 'ssl-slotnum';
  const updateSlotLbl = (): void => { slotLbl.innerHTML = `slot <b>${slotN}</b>`; };
  btnRow.append(nextBtn, slotLbl);
  ctrlWrap.appendChild(btnRow);
  controls.appendChild(ctrlWrap);

  // ── caption ────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'ssl-cap';
  cap.innerHTML =
    `Each row is one execution wave — all transactions in a row settle simultaneously on separate Sealevel threads. ` +
    `<b>W</b> = writable (exclusive lock) · <b>R</b> = read-only (shared). ` +
    `A single popular writable account serializes every transaction that touches it.`;
  caption.appendChild(cap);

  // ── event handlers ─────────────────────────────────────────────────────────
  const onToggle = (): void => {
    hot = !hot;
    sw.classList.toggle('ssl-on', hot);
    sw.setAttribute('aria-checked', hot ? 'true' : 'false');
    slotN = 1;
    updateSlotLbl();
    render();
  };
  const onSwKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
  };
  const onNext = (): void => { slotN++; updateSlotLbl(); render(); };

  sw.addEventListener('click', onToggle);
  sw.addEventListener('keydown', onSwKey);
  nextBtn.addEventListener('click', onNext);

  // auto-advance
  const timer = window.setInterval(() => { slotN++; updateSlotLbl(); render(); }, 2600);

  // initial render
  updateSlotLbl();
  render();

  // ── cleanup ────────────────────────────────────────────────────────────────
  return () => {
    layout.dispose();
    clearInterval(timer);
    sw.removeEventListener('click', onToggle);
    sw.removeEventListener('keydown', onSwKey);
    nextBtn.removeEventListener('click', onNext);
    styleEl.remove();
  };
}
