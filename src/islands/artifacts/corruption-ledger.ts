/**
 * Artifact: corruption-ledger — The Corruption Ledger
 * Manifest: content/artifacts/corruption-ledger/manifest.json
 *
 * A calculator for the cost-of-corruption inequality that underwrites every
 * restaking-secured ("crypto-economic") AI oracle. An AVS is secure only while
 *
 *     CoC = auditProb · slashFraction · bondedStake   ≥   PfC = valueAtStake · avsCount
 *
 * Three sliders set the bond economics (stake, slash rate, audit probability),
 * one sets the profit-from-corruption per service, and the AVS-count slider
 * reproduces the whitepaper "overloading" attack: the same operator set serves
 * N services, so PfC scales with N while the slashable bond stays flat — the
 * verdict flips from SECURE to EXPLOITABLE. Audit probability is the
 * probabilistic-verification tax: random audits only catch a liar with
 * probability p, so the bond must be oversized by 1/p. Presets load real
 * EigenLayer / EIGEN figures (./data.json). Sliders are native (keyboard-ok).
 *
 * Layout: shared responsive primitive (stage ledger/verdict · rail controls
 * presets+sliders · caption provenance; no panel — the output is one block).
 */
import data from '../../../content/artifacts/corruption-ledger/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface State {
  stakeUsd: number;
  slashFraction: number; // 0..1
  auditProb: number; // 0..1
  valueUsd: number;
  avsCount: number;
  presetId: string | null;
}

// Log-scale bounds for the money sliders and the comparison axis.
const STAKE_LO = 1e6,
  STAKE_HI = 2e10; // $1M … $20B
const VALUE_LO = 1e5,
  VALUE_HI = 2e10; // $100k … $20B
const AXIS_LO = 1e6,
  AXIS_HI = 1e11; // $1M … $100B (shared bar axis)

const log10 = Math.log10;
// slider position 0..1000  <->  log value
const toLog = (t: number, lo: number, hi: number) =>
  10 ** (log10(lo) + (t / 1000) * (log10(hi) - log10(lo)));
const fromLog = (v: number, lo: number, hi: number) =>
  Math.round(((log10(v) - log10(lo)) / (log10(hi) - log10(lo))) * 1000);
// bar length fraction on the shared log axis
const axisFrac = (v: number) =>
  Math.max(0, Math.min(1, (log10(Math.max(v, 1)) - log10(AXIS_LO)) / (log10(AXIS_HI) - log10(AXIS_LO))));

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n < 1e10 ? 2 : 1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n < 1e7 ? 2 : 0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;

interface Result {
  coc: number;
  pfc: number;
  secure: boolean;
  ratio: number; // CoC / PfC
  breakEvenAudit: number; // min auditProb to be secure (given stake, slash, pfc)
  requiredStake: number; // min stake to be secure (given audit, slash, pfc)
}
function compute(s: State): Result {
  const coc = s.auditProb * s.slashFraction * s.stakeUsd;
  const pfc = s.valueUsd * s.avsCount;
  const denomAudit = s.slashFraction * s.stakeUsd;
  const denomStake = s.auditProb * s.slashFraction;
  return {
    coc,
    pfc,
    secure: coc >= pfc,
    ratio: pfc > 0 ? coc / pfc : Infinity,
    breakEvenAudit: denomAudit > 0 ? pfc / denomAudit : Infinity,
    requiredStake: denomStake > 0 ? pfc / denomStake : Infinity,
  };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    panel: false,
    wideTemplate: 'rail',
    stageMin: '160px',
    stageFr: '1.4fr',
  });
  const { stage, controls: controlsSlot, caption } = layout;
  stage.classList.add('cl-stage');
  controlsSlot.classList.add('cl-inputs');

  const style = document.createElement('style');
  style.textContent = `
    .cl-stage { display:flex; flex-direction:column; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .cl-inputs { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .cl-presets { display:flex; flex-wrap:wrap; gap:8px; min-width:0; max-width:100%; }
    .cl-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:#22d3ee; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.07em; text-transform:uppercase; padding:7px 10px; white-space:nowrap; }
    .cl-preset:hover, .cl-preset:focus-visible { border-color:#22d3ee; outline:none; }
    .cl-preset.cl-on { background:rgba(34,211,238,.12); box-shadow:0 0 12px rgba(34,211,238,.25); }
    .cl-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 14px; align-items:end;
      min-width:0; max-width:100%; }
    .cl-field { min-width:0; max-width:100%; }
    .cl-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .cl-field output { color:#e7eaf3; font-size:11px; white-space:nowrap; }
    .cl-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0; }
    .cl-field.cl-coc input { accent-color:#22d3ee; }
    .cl-field.cl-pfc input { accent-color:#f0883e; }
    .cl-ledger { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:12px 14px; display:flex; flex-direction:column; gap:11px; }
    .cl-row { display:grid; grid-template-columns:108px 1fr auto; gap:10px; align-items:center; }
    .cl-row .cl-tag { font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
    .cl-row.cl-r-coc .cl-tag { color:#22d3ee; }
    .cl-row.cl-r-pfc .cl-tag { color:#f0883e; }
    .cl-track { position:relative; height:16px; border-radius:8px; background:#070b14;
      box-shadow:inset 0 0 0 1px rgba(124,140,255,.10); overflow:hidden; }
    .cl-fill { position:absolute; inset:0 auto 0 0; border-radius:8px; width:0;
      transition:width .35s cubic-bezier(.22,1,.36,1); }
    .cl-r-coc .cl-fill { background:linear-gradient(90deg,#0e7490,#22d3ee); }
    .cl-r-pfc .cl-fill { background:linear-gradient(90deg,#7c4a1e,#f0883e); }
    .cl-row .cl-val { color:#e7eaf3; font-size:12px; text-align:right; min-width:62px;
      font-variant-numeric:tabular-nums; }
    .cl-formula { font-size:9.5px; color:#5b6378; letter-spacing:.02em; margin-top:-4px; }
    .cl-verdict { display:flex; align-items:baseline; justify-content:space-between; gap:10px;
      border-top:1px solid rgba(124,140,255,.12); padding-top:10px; flex-wrap:wrap; }
    .cl-badge { font:700 12px 'JetBrains Mono', monospace; letter-spacing:.12em;
      text-transform:uppercase; padding:4px 10px; border-radius:6px; }
    .cl-badge.cl-secure { color:#22d3ee; background:rgba(34,211,238,.12);
      box-shadow:inset 0 0 0 1px rgba(34,211,238,.4); }
    .cl-badge.cl-broken { color:#f0883e; background:rgba(240,136,62,.12);
      box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }
    .cl-margin { font-size:11px; color:#8d95ad; }
    .cl-margin b { color:#e7eaf3; }
    .cl-fix { font-size:10.5px; color:#8d95ad; line-height:1.5; }
    .cl-fix b { color:#22d3ee; }
    .cl-fix.cl-broken b { color:#f0883e; }
    .cl-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.03em; line-height:1.5; }
  `;
  stage.appendChild(style);

  const state: State = {
    stakeUsd: 5e8, // $500M slice of restaked ETH allocated to one AI AVS
    slashFraction: 0.5,
    auditProb: 0.1, // probabilistic verification: 10% of calls audited
    valueUsd: 2e7, // $20M profit from one corrupt inference
    avsCount: 1,
    presetId: null,
  };

  /* ---- Presets ---- */
  const presetWrap = document.createElement('div');
  presetWrap.className = 'cl-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const p of data.presets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cl-preset';
    btn.textContent = `⬢ ${p.label}`;
    btn.title = p.note;
    presetWrap.appendChild(btn);
    presetBtns.set(p.id, btn);
  }
  controlsSlot.appendChild(presetWrap);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'cl-controls';
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'stake', label: 'bonded stake', cls: 'cl-coc', min: 0, max: 1000, step: 1, init: fromLog(state.stakeUsd, STAKE_LO, STAKE_HI) },
    { id: 'slash', label: 'slash on fault', cls: 'cl-coc', min: 5, max: 100, step: 5, init: state.slashFraction * 100 },
    { id: 'audit', label: 'audit probability', cls: 'cl-coc', min: 1, max: 100, step: 1, init: state.auditProb * 100 },
    { id: 'value', label: 'value-at-stake / avs', cls: 'cl-pfc', min: 0, max: 1000, step: 1, init: fromLog(state.valueUsd, VALUE_LO, VALUE_HI) },
    { id: 'avs', label: 'avs sharing stake', cls: 'cl-pfc', min: 1, max: 12, step: 1, init: state.avsCount },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = `cl-field ${d.cls}`;
    const label = document.createElement('label');
    label.htmlFor = `cl-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `cl-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.init);
    input.setAttribute('aria-label', d.label);
    field.append(label, input);
    controls.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }
  controlsSlot.appendChild(controls);

  /* ---- Ledger ---- */
  const ledger = document.createElement('div');
  ledger.className = 'cl-ledger';

  const mkRow = (cls: string, tag: string) => {
    const row = document.createElement('div');
    row.className = `cl-row ${cls}`;
    const tagEl = document.createElement('span');
    tagEl.className = 'cl-tag';
    tagEl.textContent = tag;
    const track = document.createElement('div');
    track.className = 'cl-track';
    const fill = document.createElement('div');
    fill.className = 'cl-fill';
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'cl-val';
    row.append(tagEl, track, val);
    ledger.appendChild(row);
    return { fill, val };
  };
  const cocRow = mkRow('cl-r-coc', 'cost to corrupt');
  const cocFormula = document.createElement('div');
  cocFormula.className = 'cl-formula';
  ledger.appendChild(cocFormula);
  const pfcRow = mkRow('cl-r-pfc', 'profit to gain');
  const pfcFormula = document.createElement('div');
  pfcFormula.className = 'cl-formula';
  ledger.appendChild(pfcFormula);

  const verdict = document.createElement('div');
  verdict.className = 'cl-verdict';
  const badge = document.createElement('span');
  badge.className = 'cl-badge';
  const margin = document.createElement('span');
  margin.className = 'cl-margin';
  verdict.append(badge, margin);
  ledger.appendChild(verdict);

  const fix = document.createElement('div');
  fix.className = 'cl-fix';
  ledger.appendChild(fix);
  stage.appendChild(ledger);

  const note = document.createElement('div');
  note.className = 'cl-note';
  const eco = data.ecosystem;
  const eig = data.eigenToken;
  note.textContent =
    `secure ⇔ CoC ≥ PfC. EigenLayer slashing live ${eco.slashingLiveDate}; ~${usd(eco.restakedUsd)} restaked across ~${eco.operators.toLocaleString('en-US')} operators. ` +
    `EIGEN circulating cap ${usd(eig.circulatingMarketCapUsd)} (Blockscout, ${eig.holders.toLocaleString('en-US')} holders).`;
  caption.appendChild(note);

  /* ---- Render ---- */
  function render() {
    const r = compute(state);
    outputs.get('stake')!.textContent = usd(state.stakeUsd);
    outputs.get('slash')!.textContent = pct(state.slashFraction);
    outputs.get('audit')!.textContent = pct(state.auditProb);
    outputs.get('value')!.textContent = usd(state.valueUsd);
    outputs.get('avs')!.textContent = `${state.avsCount}×`;

    cocRow.fill.style.width = `${(axisFrac(r.coc) * 100).toFixed(1)}%`;
    cocRow.val.textContent = usd(r.coc);
    pfcRow.fill.style.width = `${(axisFrac(r.pfc) * 100).toFixed(1)}%`;
    pfcRow.val.textContent = usd(r.pfc);
    cocFormula.textContent = `${pct(state.auditProb)} audit × ${pct(state.slashFraction)} slash × ${usd(state.stakeUsd)} bond`;
    pfcFormula.textContent = `${usd(state.valueUsd)} per service × ${state.avsCount} AVS${state.avsCount > 1 ? 's on the same bond' : ''}`;

    badge.className = `cl-badge ${r.secure ? 'cl-secure' : 'cl-broken'}`;
    badge.textContent = r.secure ? 'secure' : 'exploitable';
    const ratioTxt = !Number.isFinite(r.ratio)
      ? '∞'
      : r.ratio >= 10
        ? `${r.ratio.toFixed(0)}×`
        : `${r.ratio.toFixed(2)}×`;
    margin.innerHTML = '';
    margin.append('safety factor ');
    margin.append(Object.assign(document.createElement('b'), { textContent: ratioTxt }));
    margin.append(r.secure ? ' — honesty is the dominant strategy.' : ' — cheating pays.');

    fix.className = `cl-fix ${r.secure ? '' : 'cl-broken'}`;
    fix.innerHTML = '';
    if (r.secure) {
      fix.append('Headroom: profit could rise to ');
      fix.append(Object.assign(document.createElement('b'), { textContent: usd(r.coc) }));
      fix.append(` (${ratioTxt} today) before the bond stops covering it.`);
    } else {
      const needAudit = r.breakEvenAudit;
      if (needAudit <= 1) {
        fix.append('To re-secure it: audit ');
        fix.append(Object.assign(document.createElement('b'), { textContent: pct(needAudit) }));
        fix.append(' of calls (vs ');
        fix.append(document.createTextNode(`${pct(state.auditProb)} now), or bond `));
        fix.append(Object.assign(document.createElement('b'), { textContent: usd(r.requiredStake) }));
        fix.append('.');
      } else {
        fix.append('Even auditing 100% of calls, this bond is too small — it needs ');
        fix.append(Object.assign(document.createElement('b'), { textContent: usd(r.requiredStake) }));
        fix.append(` of slashable stake to cover ${usd(r.pfc)} of profit.`);
      }
    }
  }

  function clearPreset() {
    state.presetId = null;
    for (const b of presetBtns.values()) b.classList.remove('cl-on');
  }

  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    switch (this.id) {
      case 'cl-stake':
        state.stakeUsd = toLog(v, STAKE_LO, STAKE_HI);
        clearPreset();
        break;
      case 'cl-slash':
        state.slashFraction = v / 100;
        clearPreset();
        break;
      case 'cl-audit':
        state.auditProb = v / 100;
        clearPreset();
        break;
      case 'cl-value':
        state.valueUsd = toLog(v, VALUE_LO, VALUE_HI);
        clearPreset();
        break;
      case 'cl-avs':
        state.avsCount = v;
        clearPreset();
        break;
    }
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  function applyPreset(id: string) {
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    state.stakeUsd = p.stakeUsd;
    state.slashFraction = p.slashFraction;
    state.auditProb = p.auditProb;
    state.valueUsd = p.valueUsd;
    state.avsCount = p.avsCount;
    state.presetId = id;
    sliders.get('stake')!.value = String(fromLog(p.stakeUsd, STAKE_LO, STAKE_HI));
    sliders.get('slash')!.value = String(p.slashFraction * 100);
    sliders.get('audit')!.value = String(p.auditProb * 100);
    sliders.get('value')!.value = String(fromLog(p.valueUsd, VALUE_LO, VALUE_HI));
    sliders.get('avs')!.value = String(p.avsCount);
    for (const [pid, b] of presetBtns) b.classList.toggle('cl-on', pid === id);
    render();
  }
  const presetHandlers = new Map<string, () => void>();
  for (const [id, btn] of presetBtns) {
    const h = () => applyPreset(id);
    presetHandlers.set(id, h);
    btn.addEventListener('click', h);
  }

  render();

  return () => {
    layout.dispose();
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    for (const [id, btn] of presetBtns) {
      const h = presetHandlers.get(id);
      if (h) btn.removeEventListener('click', h);
    }
    style.remove();
  };
}
