/**
 * Artifact: blast-radius — Blast Radius
 * Manifest: content/artifacts/blast-radius/manifest.json
 *
 * A calculator for the worst-case cost of a hijacked agent signing key under
 * three custody models. Raw EOA key: the wallet is gone in one block —
 * compromise equals total loss. Session key with expiry but no allowance:
 * identical, because expiry bounds duration, not rate. Spend permission
 * (Coinbase SpendPermissionManager semantics): the attacker extracts at most
 * `allowance` per `period`, the staircase stops at revoke or `end`, and the
 * loss is the number of period boundaries crossed times the allowance.
 * Defaults can be replaced with a real permission pulled off Base
 * (./data.json) — 35.97 USDC/day, valid for 90 minutes. Sliders are native
 * inputs (keyboard accessible).
 *
 * Layout: shared responsive primitive (stage staircase chart · footer controls
 * sliders+real-permission preset · panel three custody readouts+verdict ·
 * caption provenance note).
 */
import data from '../../../content/artifacts/blast-radius/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const REAL = data.permission;

interface TimeOpt {
  label: string;
  hours: number;
}

const PERIODS: TimeOpt[] = [
  { label: '1 h', hours: 1 },
  { label: '6 h', hours: 6 },
  { label: '12 h', hours: 12 },
  { label: '24 h', hours: 24 },
  { label: '7 d', hours: 168 },
  { label: '30 d', hours: 720 },
];
const ENDS: TimeOpt[] = [
  { label: '90 min', hours: 1.5 },
  { label: '24 h', hours: 24 },
  { label: '7 d', hours: 168 },
  { label: '30 d', hours: 720 },
  { label: '90 d', hours: 2160 },
  { label: 'no end', hours: Infinity },
];
const DETECTS: TimeOpt[] = [
  { label: '1 h', hours: 1 },
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '3 d', hours: 72 },
  { label: '7 d', hours: 168 },
  { label: '14 d', hours: 336 },
  { label: '30 d', hours: 720 },
];

interface State {
  balance: number; // wallet balance (USDC)
  allowance: number; // per-period allowance (USDC)
  periodIdx: number;
  endIdx: number;
  detectIdx: number;
  realLoaded: boolean;
}

interface Results {
  activeEnd: number; // hours the permission is actually usable
  horizon: number; // hours charted
  stoppedBy: 'revoke' | 'end';
  periodsTapped: number;
  spendLoss: number;
  spendLossAt: (tHours: number) => number;
}

function compute(s: State): Results {
  const period = PERIODS[s.periodIdx]!.hours;
  const end = ENDS[s.endIdx]!.hours;
  const detect = DETECTS[s.detectIdx]!.hours;
  const activeEnd = Math.min(detect, end);
  const stoppedBy = end <= detect ? 'end' : 'revoke';

  // Attacker draws the full allowance the moment each period opens; the
  // staircase freezes at revoke/end and the wallet balance is the hard cap.
  const spendLossAt = (t: number) => {
    const tEff = Math.min(t, activeEnd - 1e-9);
    if (tEff < 0) return 0;
    const taps = Math.floor(tEff / period) + 1;
    return Math.min(taps * s.allowance, s.balance);
  };

  const horizon = Math.max(detect * 1.6, Math.min(activeEnd * 1.2, 2880), 12);
  const spendLoss = spendLossAt(horizon);
  const periodsTapped = Math.min(
    Math.floor((activeEnd - 1e-9) / period) + 1,
    Math.ceil(spendLoss / s.allowance),
  );

  return { activeEnd, horizon, stoppedBy, periodsTapped, spendLoss, spendLossAt };
}

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 2 : 1)}%`;
const dur = (h: number) =>
  !Number.isFinite(h) ? 'never' : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(210px, 56vw, 350px)',
    stageFr: '1.6fr',
  });
  const { stage, panel: panelSlot, controls: controlsSlot, caption } = layout;
  stage.classList.add('br-stage');
  panelSlot.classList.add('br-readout');
  controlsSlot.classList.add('br-inputs');
  caption.classList.add('br-cap');

  const style = document.createElement('style');
  style.textContent = `
    .br-stage, .br-readout, .br-inputs, .br-cap {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .br-stage { display:flex; flex-direction:column; min-width:0; min-height:0; }
    .br-readout { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .br-inputs { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .br-controls { display:grid; grid-template-columns:repeat(5,1fr) auto; gap:8px 14px;
      align-items:end; }
    .afl-grid:not(.is-wide) .br-controls { grid-template-columns:repeat(2,1fr); }
    .br-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .br-field output { color:#e7eaf3; font-size:11px; white-space:nowrap; }
    .br-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:4px 0 0; }
    .br-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:#22d3ee; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.08em; text-transform:uppercase; padding:7px 10px; white-space:nowrap; }
    .br-preset:hover, .br-preset:focus-visible { border-color:#22d3ee; }
    .br-preset.br-on { background:rgba(34,211,238,.12); box-shadow:0 0 12px rgba(34,211,238,.25); }
    .br-chartwrap { flex:1; min-height:0; position:relative;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .br-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .br-legend { position:absolute; top:8px; right:10px; display:flex; gap:12px;
      font-size:10px; letter-spacing:.06em; }
    .br-legend span { display:inline-flex; align-items:center; gap:5px; }
    .br-legend i { width:14px; height:2px; border-radius:1px; display:inline-block; }
    /* Axis + marker labels live in DOM, not the stretched SVG. */
    .br-axislabel { position:absolute; font-size:10px; color:#5b6378; pointer-events:none;
      white-space:nowrap; }
    .br-marklabel { position:absolute; top:22px; transform:translateX(-50%);
      font-size:9.5px; letter-spacing:.06em; pointer-events:none; }
    .br-panels { display:grid;
      grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
    .br-panel { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:10px 12px; background:#0d1322; }
    .br-panel h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.14em; text-transform:uppercase; }
    .br-panel.br-raw h3 { color:#8b5cf6; }
    .br-panel.br-session h3 { color:#5b8cff; }
    .br-panel.br-scoped h3 { color:#22d3ee; }
    .br-panel dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:2px 10px; }
    .br-panel dt { color:#5b6378; font-size:10px; }
    .br-panel dd { margin:0; color:#e7eaf3; text-align:right; font-variant-numeric:tabular-nums; }
    .br-panel p { margin:7px 0 0; font-size:10px; color:#5b6378; }
    .br-verdict { text-align:center; font-size:11px; color:#8d95ad; }
    .br-verdict b { color:#e7eaf3; }
    .br-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.04em; }
  `;
  stage.appendChild(style);

  const state: State = {
    balance: 10000,
    allowance: 50,
    periodIdx: 3, // 24 h
    endIdx: 3, // 30 d
    detectIdx: 3, // 3 d
    realLoaded: false,
  };

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'br-controls';
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'balance', label: 'wallet balance', min: 500, max: 100000, step: 500, value: state.balance },
    { id: 'allowance', label: 'allowance / period', min: 5, max: 500, step: 5, value: state.allowance },
    { id: 'period', label: 'period', min: 0, max: PERIODS.length - 1, step: 1, value: state.periodIdx },
    { id: 'end', label: 'permission end', min: 0, max: ENDS.length - 1, step: 1, value: state.endIdx },
    { id: 'detect', label: 'detect + revoke', min: 0, max: DETECTS.length - 1, step: 1, value: state.detectIdx },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = 'br-field';
    const label = document.createElement('label');
    label.htmlFor = `br-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `br-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.value);
    input.setAttribute('aria-label', d.label);
    field.append(label, input);
    controls.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }

  const preset = document.createElement('button');
  preset.type = 'button';
  preset.className = 'br-preset';
  preset.textContent = '⬢ real base permission';
  preset.title = `tx ${REAL.txHash.slice(0, 10)}… — ${REAL.allowance} USDC / 24 h, valid 90 min`;
  controls.appendChild(preset);
  controlsSlot.appendChild(controls);

  /* ---- Chart ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const chartWrap = document.createElement('div');
  chartWrap.className = 'br-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 200');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  chartWrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'br-legend';
  for (const [color, text] of [
    ['#8b5cf6', 'raw key'],
    ['#5b8cff', 'session key'],
    ['#22d3ee', 'spend permission'],
  ] as const) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = color;
    item.append(swatch, document.createTextNode(text));
    legend.appendChild(item);
  }
  chartWrap.appendChild(legend);
  stage.appendChild(chartWrap);

  const mkPath = (stroke: string, dash = '') => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', '2');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (dash) p.setAttribute('stroke-dasharray', dash);
    svg.appendChild(p);
    return p;
  };
  const rawPath = mkPath('#8b5cf6');
  const sessionPath = mkPath('#5b8cff', '6 5');
  const scopedFill = document.createElementNS(NS, 'path');
  scopedFill.setAttribute('fill', 'rgba(34,211,238,.10)');
  scopedFill.setAttribute('stroke', 'none');
  svg.appendChild(scopedFill);
  const scopedPath = mkPath('#22d3ee');
  const revokeLine = mkPath('rgba(34,211,238,.5)', '3 4');
  const endLine = mkPath('rgba(139,92,246,.5)', '3 4');

  const mkAxisLabel = (css: string, text = '') => {
    const div = document.createElement('div');
    div.className = 'br-axislabel';
    div.style.cssText = css;
    div.textContent = text;
    chartWrap.appendChild(div);
    return div;
  };
  const yMaxLabel = mkAxisLabel('top:6px;left:8px;');
  mkAxisLabel('bottom:4px;left:8px;', '$0');
  const xLabel = mkAxisLabel('bottom:4px;right:10px;');
  const revokeLabel = document.createElement('div');
  revokeLabel.className = 'br-marklabel';
  revokeLabel.style.color = 'rgba(34,211,238,.8)';
  chartWrap.appendChild(revokeLabel);
  const endLabel = document.createElement('div');
  endLabel.className = 'br-marklabel';
  endLabel.style.color = 'rgba(139,92,246,.8)';
  chartWrap.appendChild(endLabel);

  /* ---- Result panels ---- */
  const panels = document.createElement('div');
  panels.className = 'br-panels';
  const mkPanel = (cls: string, title: string, rows: string[], note: string) => {
    const panel = document.createElement('div');
    panel.className = `br-panel ${cls}`;
    const h = document.createElement('h3');
    h.textContent = title;
    const dl = document.createElement('dl');
    const dds: HTMLElement[] = [];
    for (const r of rows) {
      const dt = document.createElement('dt');
      dt.textContent = r;
      const dd = document.createElement('dd');
      dl.append(dt, dd);
      dds.push(dd);
    }
    const p = document.createElement('p');
    p.textContent = note;
    panel.append(h, dl, p);
    panels.appendChild(panel);
    return dds;
  };
  const rawDds = mkPanel(
    'br-raw',
    'raw eoa key',
    ['loss', 'share of wallet', 'stopped by'],
    'the key is the account. one leaked secret or one signed 7702 tuple to a sweeper and everything moves in the next block.',
  );
  const sessionDds = mkPanel(
    'br-session',
    'session key · expiry only',
    ['loss', 'share of wallet', 'stopped by'],
    'expiry bounds duration, not rate — everything spendable still fits in one block. a time box is not a cap.',
  );
  const scopedDds = mkPanel(
    'br-scoped',
    'spend permission',
    ['loss', 'share of wallet', 'periods tapped'],
    'the contract meters allowance per period and reverts the rest (ExceededSpendPermission). revoke kills it for good.',
  );
  panelSlot.appendChild(panels);

  const verdict = document.createElement('div');
  verdict.className = 'br-verdict';
  panelSlot.appendChild(verdict);

  const note = document.createElement('div');
  note.className = 'br-note';
  note.textContent =
    'worst case assumed: attacker drains the full allowance the moment each period opens. ' +
    'semantics: SpendPermissionManager 0xf852…67Ad (base). real permission: 35.97 USDC / 24 h, valid 90 min, settled 2026-06-12.';
  caption.appendChild(note);

  /* ---- Recompute + render ---- */
  function render() {
    const r = compute(state);
    const period = PERIODS[state.periodIdx]!;
    const end = ENDS[state.endIdx]!;
    const detect = DETECTS[state.detectIdx]!;

    outputs.get('balance')!.textContent = usd(state.balance);
    outputs.get('allowance')!.textContent = `${usd(state.allowance)}`;
    outputs.get('period')!.textContent = period.label;
    outputs.get('end')!.textContent = end.label;
    outputs.get('detect')!.textContent = detect.label;
    preset.classList.toggle('br-on', state.realLoaded);

    const H = r.horizon;
    const yMax = state.balance * 1.08;
    const X = (t: number) => (t / H) * 600;
    const Y = (v: number) => 200 - (v / yMax) * 176 - 12;

    // Raw + session: the whole balance in one block.
    rawPath.setAttribute('d', `M0 ${Y(0)} L0 ${Y(state.balance)} L600 ${Y(state.balance)}`);
    sessionPath.setAttribute('d', `M0 ${Y(state.balance)} L600 ${Y(state.balance)}`);

    // Spend permission: staircase over period boundaries, frozen at revoke/end.
    let d = `M0 ${Y(0)} L0 ${Y(r.spendLossAt(0)).toFixed(2)}`;
    let prev = r.spendLossAt(0);
    for (let k = 1; k * period.hours < Math.min(r.activeEnd, H); k++) {
      const t = k * period.hours;
      const v = r.spendLossAt(t);
      d += ` L${X(t).toFixed(1)} ${Y(prev).toFixed(2)} L${X(t).toFixed(1)} ${Y(v).toFixed(2)}`;
      prev = v;
      if (v >= state.balance) break;
    }
    d += ` L600 ${Y(prev).toFixed(2)}`;
    scopedPath.setAttribute('d', d);
    scopedFill.setAttribute('d', `${d} L600 ${Y(0)} L0 ${Y(0)} Z`);

    // Markers: revoke (detect) and permission end, when inside the horizon.
    const showRevoke = detect.hours <= H && r.stoppedBy === 'revoke';
    revokeLine.setAttribute(
      'd',
      showRevoke ? `M${X(detect.hours).toFixed(1)} 12 L${X(detect.hours).toFixed(1)} 188` : 'M0 0',
    );
    revokeLabel.textContent = showRevoke ? '↓ revoked' : '';
    revokeLabel.style.left = `${(Math.min(detect.hours / H, 1) * 100).toFixed(1)}%`;
    const showEnd = Number.isFinite(end.hours) && end.hours <= H && r.stoppedBy === 'end';
    endLine.setAttribute(
      'd',
      showEnd ? `M${X(end.hours).toFixed(1)} 12 L${X(end.hours).toFixed(1)} 188` : 'M0 0',
    );
    endLabel.textContent = showEnd ? '↓ permission ends' : '';
    endLabel.style.left = `${(Math.min(end.hours / H, 1) * 100).toFixed(1)}%`;

    yMaxLabel.textContent = usd(yMax);
    xLabel.textContent = `0 → ${dur(H)}`;

    rawDds[0]!.textContent = usd(state.balance);
    rawDds[1]!.textContent = '100%';
    rawDds[2]!.textContent = 'nothing';
    sessionDds[0]!.textContent = usd(state.balance);
    sessionDds[1]!.textContent = '100%';
    sessionDds[2]!.textContent = 'nothing';
    scopedDds[0]!.textContent = usd(r.spendLoss);
    scopedDds[1]!.textContent = pct(r.spendLoss / state.balance);
    scopedDds[2]!.textContent = `${r.periodsTapped} × ${usd(state.allowance)} · ${
      r.stoppedBy === 'end' ? `expired after ${dur(r.activeEnd)}` : `revoked after ${dur(r.activeEnd)}`
    }`;

    const factor = r.spendLoss > 0 ? state.balance / r.spendLoss : Infinity;
    verdict.innerHTML = '';
    verdict.append('same compromise, ');
    verdict.append(Object.assign(document.createElement('b'), { textContent: usd(r.spendLoss) }));
    verdict.append(' instead of ');
    verdict.append(Object.assign(document.createElement('b'), { textContent: usd(state.balance) }));
    verdict.append(' — a ');
    verdict.append(
      Object.assign(document.createElement('b'), {
        textContent: Number.isFinite(factor) ? `${factor.toFixed(factor < 10 ? 1 : 0)}× smaller` : '∞× smaller',
      }),
    );
    verdict.append(' blast radius, enforced by the contract rather than the model.');
  }

  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    switch (this.id) {
      case 'br-balance':
        state.balance = v;
        break;
      case 'br-allowance':
        state.allowance = v;
        state.realLoaded = false;
        break;
      case 'br-period':
        state.periodIdx = v;
        state.realLoaded = false;
        break;
      case 'br-end':
        state.endIdx = v;
        state.realLoaded = false;
        break;
      case 'br-detect':
        state.detectIdx = v;
        break;
    }
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  const onPreset = () => {
    state.allowance = REAL.allowance; // 35.97 USDC — exact on-chain value
    state.periodIdx = PERIODS.findIndex((p) => p.hours === REAL.periodSeconds / 3600);
    state.endIdx = ENDS.findIndex((e) => e.hours === REAL.validitySeconds / 3600);
    state.realLoaded = true;
    sliders.get('allowance')!.value = String(Math.round(REAL.allowance));
    sliders.get('period')!.value = String(state.periodIdx);
    sliders.get('end')!.value = String(state.endIdx);
    render();
  };
  preset.addEventListener('click', onPreset);
  render();

  return () => {
    layout.dispose();
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    preset.removeEventListener('click', onPreset);
    style.remove();
  };
}
