/**
 * Artifact: fingerprint-reserve — The Fingerprint Reserve
 * Manifest: content/artifacts/fingerprint-reserve/manifest.json
 *
 * A calculator for the security argument behind monetizing OPEN-weight models.
 * You can't cryptographically prevent someone from copying open weights, so
 * ownership is proven, not enforced: the owner fine-tunes M secret (key,
 * response) fingerprints into the model and later queries a suspect model to
 * see which ones answer. Two forces eat the reserve:
 *
 *   • Scrubbing  — an adversary fine-tunes/merges the model, so only a fraction
 *     s of fingerprints persist:   survivors = M · s
 *   • Leakage    — every public ownership challenge reveals a fingerprint, and a
 *     colluding host then abstains on it forever, so each audit burns one:
 *                  reserve = survivors − audits
 *
 * Ownership is provable while reserve ≥ 1 (a single uncommon key→response match
 * is decisive). The twist the calculator makes tangible: a large reserve needs
 * a large M, and a large M is only Harmless under a *scalable* scheme. Naive
 * schemes wreck utility past ~256 fingerprints (data.json, Fig 3 of the paper),
 * so a degraded model nobody runs has nothing worth owning. Scalability — not
 * cryptography — is the security parameter. Presets load the real schemes;
 * sliders are native (keyboard-ok).
 *
 * Layout: shared responsive primitive (stage ledger/verdict · footer controls
 * presets+sliders · caption provenance; no panel — the output is one block).
 */
import data from '../../../content/artifacts/fingerprint-reserve/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Scheme {
  id: string;
  label: string;
  embedded: number;
  utilityCeiling: number;
  note: string;
}
const SCHEMES = data.schemes as Scheme[];
const MAX_FP = data.maxFingerprints; // 24,576 — the scalable ceiling and axis top

interface State {
  embedded: number; // M, fingerprints fine-tuned in
  persistence: number; // s, 0..1 fraction surviving the adversary's fine-tuning
  audits: number; // ownership challenges issued (each leaks one fingerprint)
  ceiling: number; // harmless-embedding ceiling of the chosen scheme
  schemeId: string | null;
}

// Embedded slider rides a log axis 64 … 24,576 so every scheme is reachable.
const M_LO = 64,
  M_HI = MAX_FP;
const log10 = Math.log10;
const toLog = (t: number, lo: number, hi: number) =>
  Math.round(10 ** (log10(lo) + (t / 1000) * (log10(hi) - log10(lo))));
const fromLog = (v: number, lo: number, hi: number) =>
  Math.round(((log10(v) - log10(lo)) / (log10(hi) - log10(lo))) * 1000);
// bar length fraction on the shared log axis (1 … 24,576)
const axisFrac = (v: number) =>
  Math.max(0, Math.min(1, log10(Math.max(v, 1)) / log10(MAX_FP)));

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (f: number) => `${Math.round(f * 100)}%`;

interface Result {
  survivors: number;
  reserve: number;
  utilityOk: boolean;
  provable: boolean;
  needForOne: number; // min M to keep one in reserve at this s and audit count
  minPersist: number; // min persistence to keep one in reserve at this M/audits
  runway: number; // how many more challenges before the reserve is dry
}
function compute(s: State): Result {
  const survivors = Math.floor(s.embedded * s.persistence);
  const reserve = Math.max(0, survivors - s.audits);
  const utilityOk = s.embedded <= s.ceiling;
  const provable = reserve >= 1 && utilityOk;
  const needForOne = s.persistence > 0 ? Math.ceil((s.audits + 1) / s.persistence) : Infinity;
  const minPersist = s.embedded > 0 ? (s.audits + 1) / s.embedded : Infinity;
  return { survivors, reserve, utilityOk, provable, needForOne, minPersist, runway: reserve };
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    panel: false,
    wideTemplate: 'footer',
    stageMin: '170px',
    stageFr: '1.35fr',
  });
  const { stage, controls: controlsSlot, caption } = layout;
  stage.classList.add('fr-stage');
  controlsSlot.classList.add('fr-inputs');

  const style = document.createElement('style');
  style.textContent = `
    .fr-stage { display:flex; flex-direction:column; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .fr-inputs { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .fr-presets { display:flex; flex-wrap:wrap; gap:8px; min-width:0; max-width:100%; }
    .fr-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:#22d3ee; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.06em; text-transform:uppercase; padding:7px 10px; white-space:nowrap; }
    .fr-preset:hover, .fr-preset:focus-visible { border-color:#22d3ee; outline:none; }
    .fr-preset.fr-on { background:rgba(34,211,238,.12); box-shadow:0 0 12px rgba(34,211,238,.25); }
    .fr-controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));
      gap:8px 16px; align-items:end; min-width:0; max-width:100%; }
    .fr-field { min-width:0; max-width:100%; }
    .fr-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .fr-field output { color:#e7eaf3; font-size:11px; white-space:nowrap; }
    .fr-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0; }
    .fr-field.fr-embed input { accent-color:#22d3ee; }
    .fr-field.fr-scrub input { accent-color:#f0883e; }
    .fr-field.fr-leak  input { accent-color:#a78bfa; }
    .fr-ledger { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:13px 15px; display:flex; flex-direction:column; gap:11px; }
    .fr-row { display:grid; grid-template-columns:128px minmax(0,1fr) auto; gap:10px; align-items:center; }
    .fr-row .fr-tag { font-size:10px; letter-spacing:.07em; text-transform:uppercase; }
    .fr-r-embed .fr-tag { color:#7c8cff; }
    .fr-r-surv  .fr-tag { color:#f0883e; }
    .fr-r-res   .fr-tag { color:#22d3ee; }
    .fr-track { position:relative; height:15px; border-radius:8px; background:#070b14;
      box-shadow:inset 0 0 0 1px rgba(124,140,255,.10); overflow:hidden; }
    .fr-fill { position:absolute; inset:0 auto 0 0; border-radius:8px; width:0;
      transition:width .35s cubic-bezier(.22,1,.36,1); }
    .fr-r-embed .fr-fill { background:linear-gradient(90deg,#3b3f87,#7c8cff); }
    .fr-r-surv  .fr-fill { background:linear-gradient(90deg,#7c4a1e,#f0883e); }
    .fr-r-res   .fr-fill { background:linear-gradient(90deg,#0e7490,#22d3ee); }
    .fr-row .fr-val { color:#e7eaf3; font-size:12px; text-align:right; min-width:58px;
      font-variant-numeric:tabular-nums; }
    .fr-formula { font-size:9.5px; color:#5b6378; letter-spacing:.02em; margin-top:-4px; }
    .fr-verdict { display:flex; align-items:baseline; justify-content:space-between; gap:10px;
      border-top:1px solid rgba(124,140,255,.12); padding-top:10px; flex-wrap:wrap; }
    .fr-badge { font:700 12px 'JetBrains Mono', monospace; letter-spacing:.1em;
      text-transform:uppercase; padding:4px 10px; border-radius:6px; }
    .fr-badge.fr-ok { color:#22d3ee; background:rgba(34,211,238,.12);
      box-shadow:inset 0 0 0 1px rgba(34,211,238,.4); }
    .fr-badge.fr-bad { color:#f0883e; background:rgba(240,136,62,.12);
      box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }
    .fr-margin { font-size:11px; color:#8d95ad; min-width:0; }
    .fr-margin b { color:#e7eaf3; }
    .fr-fix { font-size:10.5px; color:#8d95ad; line-height:1.5; overflow-wrap:anywhere; }
    .fr-fix b { color:#22d3ee; }
    .fr-fix.fr-bad b { color:#f0883e; }
    .fr-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.02em; line-height:1.5; }
  `;
  stage.appendChild(style);

  const defaultScheme = SCHEMES.find((x) => x.id === 'oml1') ?? SCHEMES[0];
  const state: State = {
    embedded: defaultScheme.embedded,
    persistence: data.measuredPersistence, // 0.60 — measured Perinucleus persistence
    audits: 20,
    ceiling: defaultScheme.utilityCeiling,
    schemeId: defaultScheme.id,
  };

  /* ---- Presets (the real schemes) ---- */
  const presetWrap = document.createElement('div');
  presetWrap.className = 'fr-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const sc of SCHEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-preset';
    btn.textContent = `⬢ ${sc.label}`;
    btn.title = sc.note;
    presetWrap.appendChild(btn);
    presetBtns.set(sc.id, btn);
  }
  controlsSlot.appendChild(presetWrap);

  /* ---- Sliders ---- */
  const controls = document.createElement('div');
  controls.className = 'fr-controls';
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'embed', label: 'fingerprints embedded', cls: 'fr-embed', min: 0, max: 1000, step: 1, init: fromLog(state.embedded, M_LO, M_HI) },
    { id: 'scrub', label: 'survive fine-tuning', cls: 'fr-scrub', min: 5, max: 100, step: 1, init: Math.round(state.persistence * 100) },
    { id: 'leak', label: 'ownership audits run', cls: 'fr-leak', min: 0, max: 1000, step: 5, init: state.audits },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = `fr-field ${d.cls}`;
    const label = document.createElement('label');
    label.htmlFor = `fr-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `fr-${d.id}`;
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
  ledger.className = 'fr-ledger';
  const mkRow = (cls: string, tag: string) => {
    const row = document.createElement('div');
    row.className = `fr-row ${cls}`;
    const tagEl = document.createElement('span');
    tagEl.className = 'fr-tag';
    tagEl.textContent = tag;
    const track = document.createElement('div');
    track.className = 'fr-track';
    const fill = document.createElement('div');
    fill.className = 'fr-fill';
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'fr-val';
    row.append(tagEl, track, val);
    ledger.appendChild(row);
    return { fill, val };
  };
  const embedRow = mkRow('fr-r-embed', 'embedded');
  const survRow = mkRow('fr-r-surv', 'survive scrub');
  const survFormula = document.createElement('div');
  survFormula.className = 'fr-formula';
  ledger.appendChild(survFormula);
  const resRow = mkRow('fr-r-res', 'reserve');
  const resFormula = document.createElement('div');
  resFormula.className = 'fr-formula';
  ledger.appendChild(resFormula);

  const verdict = document.createElement('div');
  verdict.className = 'fr-verdict';
  const badge = document.createElement('span');
  badge.className = 'fr-badge';
  const margin = document.createElement('span');
  margin.className = 'fr-margin';
  verdict.append(badge, margin);
  ledger.appendChild(verdict);

  const fix = document.createElement('div');
  fix.className = 'fr-fix';
  ledger.appendChild(fix);
  stage.appendChild(ledger);

  /* ---- Provenance ---- */
  const note = document.createElement('div');
  note.className = 'fr-note';
  note.textContent =
    `Perinucleus embeds ${fmt(MAX_FP)} fingerprints into ${data.model} with no utility loss; ` +
    `>${pct(data.measuredPersistence)} persist 2 epochs of SFT. Provable while reserve ≥ 1.`;
  caption.appendChild(note);

  /* ---- Render ---- */
  function render() {
    const r = compute(state);
    outputs.get('embed')!.textContent = fmt(state.embedded);
    outputs.get('scrub')!.textContent = pct(state.persistence);
    outputs.get('leak')!.textContent = fmt(state.audits);

    embedRow.fill.style.width = `${(axisFrac(state.embedded) * 100).toFixed(1)}%`;
    embedRow.val.textContent = fmt(state.embedded);
    survRow.fill.style.width = `${(axisFrac(r.survivors) * 100).toFixed(1)}%`;
    survRow.val.textContent = fmt(r.survivors);
    resRow.fill.style.width = `${(axisFrac(r.reserve) * 100).toFixed(1)}%`;
    resRow.val.textContent = fmt(r.reserve);
    survFormula.textContent = `${fmt(state.embedded)} embedded × ${pct(state.persistence)} persist`;
    resFormula.textContent = `${fmt(r.survivors)} survivors − ${fmt(state.audits)} burned to leakage`;

    badge.className = `fr-badge ${r.provable ? 'fr-ok' : 'fr-bad'}`;
    badge.textContent = r.provable ? 'provable' : 'unprovable';
    margin.innerHTML = '';
    if (r.provable) {
      margin.append('ownership stands on ');
      margin.append(Object.assign(document.createElement('b'), { textContent: fmt(r.reserve) }));
      margin.append(' un-leaked fingerprints — one match is decisive.');
    } else if (!r.utilityOk) {
      margin.append('the model is degraded — nothing worth owning.');
    } else {
      margin.append('the reserve is dry — no fingerprint left to prove a thing.');
    }

    fix.className = `fr-fix ${r.provable ? '' : 'fr-bad'}`;
    fix.innerHTML = '';
    if (!r.utilityOk) {
      const ratio = MAX_FP / state.ceiling;
      fix.append(`Embedding ${fmt(state.embedded)} wrecks utility — this scheme stays Harmless only to `);
      fix.append(Object.assign(document.createElement('b'), { textContent: fmt(state.ceiling) }));
      fix.append('. A scalable scheme (Perinucleus) holds ');
      fix.append(Object.assign(document.createElement('b'), { textContent: fmt(MAX_FP) }));
      fix.append(` at full utility — ${Math.round(ratio)}× the room.`);
    } else if (!r.provable) {
      fix.append('At ');
      fix.append(Object.assign(document.createElement('b'), { textContent: pct(state.persistence) }));
      fix.append(` persistence and ${fmt(state.audits)} audits you need ≥ `);
      fix.append(Object.assign(document.createElement('b'), { textContent: fmt(r.needForOne) }));
      fix.append(' embedded to keep one in reserve — so scale up, if utility allows.');
    } else {
      fix.append('Headroom: survives ');
      fix.append(Object.assign(document.createElement('b'), { textContent: fmt(r.runway) }));
      fix.append(' more challenges, or scrubbing down to ');
      fix.append(Object.assign(document.createElement('b'), { textContent: pct(r.minPersist) }));
      fix.append(' persistence, before the reserve runs dry.');
    }
  }

  function clearPreset() {
    state.schemeId = null;
    for (const b of presetBtns.values()) b.classList.remove('fr-on');
  }

  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    switch (this.id) {
      case 'fr-embed':
        state.embedded = toLog(v, M_LO, M_HI);
        clearPreset();
        break;
      case 'fr-scrub':
        state.persistence = v / 100;
        break;
      case 'fr-leak':
        state.audits = v;
        break;
    }
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  function applyPreset(id: string) {
    const sc = SCHEMES.find((x) => x.id === id);
    if (!sc) return;
    state.embedded = sc.embedded;
    state.ceiling = sc.utilityCeiling;
    state.schemeId = id;
    sliders.get('embed')!.value = String(fromLog(sc.embedded, M_LO, M_HI));
    for (const [pid, b] of presetBtns) b.classList.toggle('fr-on', pid === id);
    render();
  }
  const presetHandlers = new Map<string, () => void>();
  for (const [id, btn] of presetBtns) {
    const h = () => applyPreset(id);
    presetHandlers.set(id, h);
    btn.addEventListener('click', h);
  }
  // Seed the opening scheme highlight.
  presetBtns.get(defaultScheme.id)?.classList.add('fr-on');

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
