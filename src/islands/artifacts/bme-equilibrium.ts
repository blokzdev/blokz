/**
 * Artifact: bme-equilibrium — BME Equilibrium
 * Manifest: content/artifacts/bme-equilibrium/manifest.json
 *
 * Render's Burn-Mint Equilibrium as a live supply equation. Emissions are a
 * fixed governance schedule (492,132 RENDER/month per RNP-023, +88,240 with
 * the Salad chef-reward line); burns are demand-driven: every customer dollar
 * routed to BME destroys $1/price worth of RENDER. The calculator races the
 * two flows, finds the equilibrium point where burn = mint, and shows how far
 * a given demand level sits from it. Sliders are native inputs (keyboard
 * accessible); no RAF loop — renders only on input.
 *
 * Layout: shared responsive primitive (stage burn-vs-mint bars · panel burn/mint
 * breakdown + verdict · footer controls demand/price sliders + Salad toggle ·
 * caption provenance note).
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const MINT_BASE = 492_132; // RENDER/month, current emission line (RNP-023)
const MINT_SALAD = 88_240; // RENDER/month added for Salad chef rewards
// Salad burn demand: $4.3M/yr projected, 73% SCE (60% burned) + 27% SGS (35% burned).
const SALAD_BURN_USD = (4_300_000 * (0.73 * 0.6 + 0.27 * 0.35)) / 12; // ≈ $190.8k/mo

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (n: number) => `$${fmt(n)}`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(210px, 56vw, 350px)',
  });
  const { stage, panel: panelSlot, controls: controlsSlot, caption } = layout;
  stage.classList.add('bme-stagewrap');
  panelSlot.classList.add('bme-panelwrap');
  controlsSlot.classList.add('bme-controlswrap');
  caption.classList.add('bme-captionwrap');

  const style = document.createElement('style');
  style.textContent = `
    .bme-stagewrap, .bme-panelwrap, .bme-controlswrap, .bme-captionwrap {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .bme-stagewrap { display:flex; flex-direction:column; min-width:0; }
    .bme-panelwrap { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .bme-controlswrap { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .bme-controls { display:grid; grid-template-columns:1fr 1fr auto; gap:8px 14px;
      align-items:end; }
    .bme-field label { display:flex; justify-content:space-between; gap:6px;
      font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .bme-field output { color:#e7eaf3; font-size:11px; }
    .bme-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:4px 0 0; }
    .bme-toggle { display:flex; align-items:center; gap:7px; padding:6px 10px;
      border:1px solid rgba(124,140,255,.2); border-radius:10px; cursor:pointer;
      color:#8d95ad; font-size:10px; letter-spacing:.08em; text-transform:uppercase;
      user-select:none; }
    .bme-toggle:has(input:checked) { color:#e7eaf3; border-color:rgba(34,211,238,.5);
      background:rgba(34,211,238,.08); }
    .bme-toggle input { accent-color:#22d3ee; cursor:pointer; }
    .bme-barwrap { border:1px solid rgba(124,140,255,.14);
      border-radius:12px; background:#0d1322; padding:12px 14px 8px; }
    .bme-stage { position:relative; }
    .bme-stage svg { width:100%; height:96px; display:block; }
    /* Bar labels live in DOM, not the stretched SVG (preserveAspectRatio:none
       distorts glyphs); the stage div keeps them aligned to the bars. */
    .bme-stagelabel { position:absolute; transform:translateY(-50%); font-size:10px;
      pointer-events:none; white-space:nowrap; }
    .bme-eqlabel { position:absolute; top:50%; transform:translate(-50%,-50%);
      font-size:9px; color:#8d95ad; pointer-events:none; white-space:nowrap; }
    .bme-panels { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .bme-panelwrap.bme-narrow .bme-panels { grid-template-columns:1fr; }
    .bme-panel { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:10px 12px; background:#0d1322; }
    .bme-panel h3 { margin:0 0 6px; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.14em; text-transform:uppercase; }
    .bme-panel.bme-burnside h3 { color:#22d3ee; }
    .bme-panel.bme-mintside h3 { color:#5b8cff; }
    .bme-panel dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:2px 10px; }
    .bme-panel dt { color:#5b6378; font-size:10px; }
    .bme-panel dd { margin:0; color:#e7eaf3; text-align:right;
      font-variant-numeric:tabular-nums; }
    .bme-verdict { text-align:center; font-size:11.5px; color:#8d95ad; }
    .bme-verdict b { color:#e7eaf3; }
    .bme-verdict .bme-inflate { color:#5b8cff; }
    .bme-verdict .bme-deflate { color:#22d3ee; }
    .bme-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.04em; }
  `;
  stage.appendChild(style);

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'bme-controls';

  const mkSlider = (
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
  ) => {
    const field = document.createElement('div');
    field.className = 'bme-field';
    const lab = document.createElement('label');
    lab.htmlFor = `bme-${id}`;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `bme-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };

  const demand = mkSlider('demand', 'organic burn demand / mo', 0, 3_000_000, 10_000, 150_000);
  const price = mkSlider('price', 'render price', 0.25, 8, 0.01, 1.66);

  const toggle = document.createElement('label');
  toggle.className = 'bme-toggle';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.setAttribute('aria-label', 'include RNP-023 Salad flows');
  toggle.append(toggleInput, document.createTextNode('rnp-023 salad flows'));
  controls.appendChild(toggle);
  controlsSlot.appendChild(controls);

  /* ---- Burn vs mint bars ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const barWrap = document.createElement('div');
  barWrap.className = 'bme-barwrap';
  const stageInner = document.createElement('div');
  stageInner.className = 'bme-stage';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 96');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  stageInner.appendChild(svg);
  barWrap.appendChild(stageInner);
  stage.appendChild(barWrap);

  const mkStageLabel = (css: string, color: string, text = '') => {
    const div = document.createElement('div');
    div.className = 'bme-stagelabel';
    div.style.cssText = css + `color:${color};`;
    div.textContent = text;
    stageInner.appendChild(div);
    return div;
  };

  const mkRect = (y: number, fill: string) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', '90');
    r.setAttribute('y', String(y));
    r.setAttribute('height', '22');
    r.setAttribute('rx', '4');
    r.setAttribute('fill', fill);
    svg.appendChild(r);
    return r;
  };
  const trackMint = mkRect(14, 'rgba(91,140,255,.12)');
  const trackBurn = mkRect(56, 'rgba(34,211,238,.12)');
  trackMint.setAttribute('width', '500');
  trackBurn.setAttribute('width', '500');
  const barMint = mkRect(14, '#5b8cff');
  const barBurn = mkRect(56, '#22d3ee');
  mkStageLabel('left:0;top:26%;', '#5b8cff', 'minted');
  mkStageLabel('left:0;top:70%;', '#22d3ee', 'burned');
  const mintVal = mkStageLabel('right:0;top:26%;', '#e7eaf3');
  const burnVal = mkStageLabel('right:0;top:70%;', '#e7eaf3');
  // Equilibrium marker: the burn bar must reach the mint bar's end.
  const eqLine = document.createElementNS(NS, 'line');
  eqLine.setAttribute('y1', '8');
  eqLine.setAttribute('y2', '88');
  eqLine.setAttribute('stroke', '#8d95ad');
  eqLine.setAttribute('stroke-width', '1');
  eqLine.setAttribute('stroke-dasharray', '3 4');
  svg.appendChild(eqLine);
  const eqLabel = document.createElement('div');
  eqLabel.className = 'bme-eqlabel';
  eqLabel.textContent = 'equilibrium';
  stageInner.appendChild(eqLabel);

  /* ---- Panels ---- */
  const panels = document.createElement('div');
  panels.className = 'bme-panels';
  const mkPanel = (cls: string, title: string, rows: string[]) => {
    const panel = document.createElement('div');
    panel.className = `bme-panel ${cls}`;
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
    panel.append(h, dl);
    panels.appendChild(panel);
    return dds;
  };
  const burnDds = mkPanel('bme-burnside', 'burn · demand-driven', [
    'usd routed to bme',
    'render burned',
    'share of emissions offset',
  ]);
  const mintDds = mkPanel('bme-mintside', 'mint · governance schedule', [
    'render emitted',
    'usd value of emissions',
    'demand needed for equilibrium',
  ]);
  panelSlot.appendChild(panels);

  const verdict = document.createElement('div');
  verdict.className = 'bme-verdict';
  panelSlot.appendChild(verdict);

  const note = document.createElement('div');
  note.className = 'bme-note';
  note.textContent =
    'constants from RNP-023: 492,132 RENDER/mo emissions; Salad toggle adds 88,240 RENDER/mo rewards and ~$191k/mo burn demand (60%/35% of projected SCE/SGS revenue). burned = demand ÷ price; the mint side never sees the price.';
  caption.appendChild(note);

  /* ---- Recompute + render ---- */
  function render() {
    const organic = Number(demand.input.value);
    const p = Number(price.input.value);
    const salad = toggleInput.checked;

    const totalDemand = organic + (salad ? SALAD_BURN_USD : 0);
    const mint = MINT_BASE + (salad ? MINT_SALAD : 0);
    const burn = totalDemand / p;
    const net = mint - burn; // >0 → supply grows
    const eqDemand = mint * p;

    demand.out.textContent = `${usd(organic)}/mo`;
    price.out.textContent = `$${p.toFixed(2)}`;

    const scale = 500 / Math.max(mint, burn, 1);
    barMint.setAttribute('width', String(Math.max(2, mint * scale)));
    barBurn.setAttribute('width', String(Math.max(2, burn * scale)));
    const eqX = 90 + mint * scale;
    eqLine.setAttribute('x1', String(eqX));
    eqLine.setAttribute('x2', String(eqX));
    eqLabel.style.left = `${Math.min(Math.max((eqX / 600) * 100, 18), 90)}%`;
    mintVal.textContent = `${fmt(mint)} /mo`;
    burnVal.textContent = `${fmt(burn)} /mo`;

    burnDds[0]!.textContent = `${usd(totalDemand)}/mo`;
    burnDds[1]!.textContent = `${fmt(burn)} /mo`;
    burnDds[2]!.textContent = `${((burn / mint) * 100).toFixed(1)}%`;
    mintDds[0]!.textContent = `${fmt(mint)} /mo`;
    mintDds[1]!.textContent = `${usd(mint * p)}/mo`;
    mintDds[2]!.textContent = `${usd(eqDemand)}/mo`;

    verdict.innerHTML = '';
    const net0 = Math.abs(net) < 1;
    const cls = net > 0 ? 'bme-inflate' : 'bme-deflate';
    const word = net0 ? 'in equilibrium' : net > 0 ? 'inflating' : 'deflating';
    const span = document.createElement('b');
    span.className = net0 ? '' : cls;
    span.textContent = net0 ? word : `${word} ${fmt(Math.abs(net))} RENDER/mo`;
    verdict.append('supply is ', span, ' — demand covers ');
    verdict.append(
      Object.assign(document.createElement('b'), {
        textContent: `${((totalDemand / eqDemand) * 100).toFixed(0)}%`,
      }),
    );
    verdict.append(` of the ${usd(eqDemand)}/mo equilibrium at this price.`);
  }

  const onInput = () => render();
  demand.input.addEventListener('input', onInput);
  price.input.addEventListener('input', onInput);
  toggleInput.addEventListener('input', onInput);
  render();

  // Stack the two breakdown panels when the panel column is narrow.
  const ro = new ResizeObserver(([entry]) => {
    panelSlot.classList.toggle('bme-narrow', (entry?.contentRect.width ?? 600) < 360);
  });
  ro.observe(panelSlot);

  return () => {
    ro.disconnect();
    layout.dispose();
    demand.input.removeEventListener('input', onInput);
    price.input.removeEventListener('input', onInput);
    toggleInput.removeEventListener('input', onInput);
    style.remove();
  };
}
