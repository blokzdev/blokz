/**
 * Artifact: the-undercutting-spiral — The Undercutting Spiral
 * Manifest: content/artifacts/the-undercutting-spiral/manifest.json
 *
 * "The Crash" from Agent Bazaar (Karten, Crow, Jin — arXiv:2605.17698): put
 * autonomous LLM firms in a marketplace and they undercut each other below unit
 * cost in a race to bankruptcy, after which survivors monopoly-price. The paper's
 * counterintuitive finding: MORE price discovery amplifies the crash, because
 * firms that can see more competitors optimize more aggressively.
 *
 * This is a deterministic best-response model of that dynamic (not the paper's
 * LLMs): N firms set price by undercutting the cheapest competitor they can
 * SEE (a discovery window of d), demand follows a softmin on price, firms below
 * cost bleed cash and exit, and the survivors' prices recover as competition
 * thins. Drag firms / discovery / stabilizers and watch the spiral. The real
 * paper anchors (87% bankruptcy, 3.42x post-crash price) live in data.json and
 * annotate the readout — they are NOT outputs of this toy model.
 *
 * Layout: shared createArtifactLayout primitive. stage = price-vs-day chart
 * (stretched SVG + crisp DOM overlay labels, like the-rebalancers-break-even),
 * panel = outcome readout, controls = sliders, caption = provenance. Recomputes
 * on input; no animation loop (robust under reduced motion). Keyboard accessible.
 */
import { createArtifactLayout } from '../../lib/artifact-layout';
import data from '../../../content/artifacts/the-undercutting-spiral/data.json';

const COST = 1;
const EPS = 0.05; // undercut step
const RAISE = 0.07; // climb toward monopoly when you're the cheapest in view
const BETA = 3.2; // price-sensitivity of demand (softmin sharpness)
const MKT = 1.0; // market size per step
const START_CASH = 1.3; // loss buffer before bankruptcy
const FLOOR = 1.2 * COST; // stabilizer price floor
const STEPS = 130;
const PMAX = 4 * COST;

interface Firm {
  price: number;
  cash: number;
  alive: boolean;
  stabilizer: boolean;
  agg: number; // undercut aggressiveness (who dives deepest, dies first)
  pmono: number; // the price it walks toward once it's the cheapest in view
  diedAt: number; // step index, or -1
  series: number[]; // price per step (frozen after death)
}

interface SimResult {
  firms: Firm[];
  survivors: number;
  crashDay: number; // first step a firm prints below cost, or -1
  finalMultiple: number; // survivors' avg price / cost
  bankruptcies: number;
}

function simulate(N: number, discovery: number, stabilizers: number): SimResult {
  const firms: Firm[] = [];
  for (let i = 0; i < N; i++) {
    const f = N > 1 ? i / (N - 1) : 0;
    const p0 = 1.6 + 1.4 * f; // 1.6 .. 3.0 spread
    firms.push({
      price: p0,
      cash: START_CASH,
      alive: true,
      stabilizer: i < stabilizers,
      agg: 0.8 + 0.5 * f, // 0.8 .. 1.3
      pmono: 2.1 + 0.7 * f, // 2.1 .. 2.8
      diedAt: -1,
      series: [p0],
    });
  }
  let crashDay = -1;

  for (let t = 1; t < STEPS; t++) {
    // 1. Best-response pricing. A firm sees a discovery-limited slice of rivals:
    //    higher discovery ⇒ it perceives the lower end of the price ranking and
    //    undercuts it; lower discovery hides the cheapest, so it's "locally
    //    cheapest" more often and climbs toward its monopoly price instead.
    //    This is the paper's counterintuitive result: more discovery deepens the crash.
    const alive = firms.filter((f) => f.alive);
    const next: number[] = firms.map((f) => f.price);
    for (let i = 0; i < N; i++) {
      const f = firms[i]!;
      if (!f.alive) continue;
      const others = alive.filter((g) => g !== f).map((g) => g.price).sort((a, b) => a - b);
      let target: number;
      if (others.length === 0) {
        target = Math.min(f.pmono, f.price + RAISE); // monopolist walks price up
      } else {
        const d = Math.max(1, Math.min(others.length, discovery));
        const perceived = others[Math.max(0, others.length - d)]!;
        target = perceived >= f.price
          ? Math.min(f.pmono, f.price + RAISE) // cheapest in view → climb
          : perceived - EPS * f.agg; // undercut the cheapest rival seen
      }
      if (f.stabilizer) target = Math.max(target, FLOOR);
      next[i] = Math.max(0.25 * COST, Math.min(PMAX, target));
    }
    for (let i = 0; i < N; i++) if (firms[i]!.alive) firms[i]!.price = next[i]!;

    // 2. Demand: softmin share over alive firms; profit = margin * share.
    let denom = 0;
    for (const f of firms) if (f.alive) denom += Math.exp(-BETA * f.price);
    for (let i = 0; i < N; i++) {
      const f = firms[i]!;
      if (!f.alive) {
        f.series.push(f.series[f.series.length - 1]!); // freeze line
        continue;
      }
      const share = denom > 0 ? Math.exp(-BETA * f.price) / denom : 0;
      f.cash += (f.price - COST) * share * MKT * N; // scale by N so shares net out
      if (crashDay < 0 && f.price < COST) crashDay = t;
      if (f.cash <= 0) {
        f.alive = false;
        f.diedAt = t;
      }
      f.series.push(f.price);
    }
  }

  let survivors = 0;
  let sum = 0;
  let bankruptcies = 0;
  for (const f of firms) {
    if (f.alive) {
      survivors++;
      sum += f.price;
    } else bankruptcies++;
  }
  return {
    firms,
    survivors,
    crashDay,
    finalMultiple: survivors > 0 ? sum / survivors / COST : 0,
    bankruptcies,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    // Fixed-height SVG stage (200px chart) → size with stageMin, not stageAspect.
    wideTemplate: 'footer',
    stageMin: 'clamp(196px, 36vw, 220px)',
  });

  const style = document.createElement('style');
  style.textContent = `
    .us-stage { display:flex; flex-direction:column; gap:8px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .us-wrap { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 12px 6px; min-width:0; max-width:100%; }
    .us-box { position:relative; min-width:0; max-width:100%; }
    .us-box svg { width:100%; height:200px; display:block; }
    .us-lab { position:absolute; transform:translate(-50%,-50%); font-size:9px;
      pointer-events:none; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .us-axis { position:absolute; font-size:8.5px; color:#5b6378; pointer-events:none;
      white-space:nowrap; letter-spacing:.04em; }
    .us-x { position:absolute; color:#ff7a8a; font-size:11px; line-height:1;
      transform:translate(-50%,-50%); pointer-events:none; }

    .us-panel { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; }
    .us-verdict { border:1px solid rgba(124,140,255,.16); border-radius:11px; padding:9px 12px;
      background:#0d1322; font-size:11.5px; line-height:1.5; color:#8d95ad; }
    .us-verdict b { color:#e7eaf3; letter-spacing:.02em; }
    .us-verdict.us-crash b { color:#ff7a8a; }
    .us-verdict.us-stable b { color:#34d399; }
    .us-dl { border:1px solid rgba(124,140,255,.14); border-radius:11px; padding:9px 12px;
      background:#0d1322; margin:0; display:grid;
      grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:4px 10px; max-width:100%; }
    .us-dl dt { color:#5b6378; font-size:10.5px; min-width:0; }
    .us-dl dd { margin:0; color:#e7eaf3; text-align:right; font-size:11px;
      font-variant-numeric:tabular-nums; }
    .us-dl dd.neg { color:#ff7a8a; }
    .us-dl dd.pos { color:#34d399; }
    .us-anchor { font-size:9px; color:#5b6378; line-height:1.5; letter-spacing:.02em; }

    .us-controls { display:grid;
      grid-template-columns:repeat(auto-fit, minmax(min(165px,100%),1fr));
      gap:8px 18px; max-width:100%;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .us-field { min-width:0; max-width:100%; }
    .us-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .us-field label span.nm { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .us-field output { color:#e7eaf3; font-size:11px; font-variant-numeric:tabular-nums; flex:none; }
    .us-field input[type=range] { width:100%; cursor:pointer; background:transparent;
      margin:3px 0 0; accent-color:#5b8cff; }
    .us-field.us-disc input { accent-color:#ff7a8a; }
    .us-field.us-stab input { accent-color:#34d399; }

    .us-note { text-align:center; font-size:9px; color:#5b6378; letter-spacing:.02em;
      line-height:1.55; font:500 9px/1.55 'JetBrains Mono', monospace; }
  `;
  container.appendChild(style);

  /* ---- Stage ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const stageRoot = layout.stage;
  stageRoot.className += ' us-stage';
  const wrap = document.createElement('div');
  wrap.className = 'us-wrap';
  const box = document.createElement('div');
  box.className = 'us-box';
  const svg = document.createElementNS(NS, 'svg');
  const W = 600, H = 200;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-label', 'Price-versus-day chart of competing agent firms undercutting toward bankruptcy.');
  box.appendChild(svg);
  wrap.appendChild(box);
  stageRoot.appendChild(wrap);

  const PX = { l: 6, r: 8, t: 12, b: 14 };
  const xOf = (t: number) => PX.l + (t / (STEPS - 1)) * (W - PX.l - PX.r);
  const yOf = (p: number) => H - PX.b - (Math.min(p, PMAX) / PMAX) * (H - PX.t - PX.b);

  const mkLine = (color: string, w: number, dash = '') => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', String(w));
    l.setAttribute('vector-effect', 'non-scaling-stroke');
    if (dash) l.setAttribute('stroke-dasharray', dash);
    svg.appendChild(l);
    return l;
  };
  // Below-cost shaded band.
  const band = document.createElementNS(NS, 'rect');
  band.setAttribute('x', String(PX.l));
  band.setAttribute('width', String(W - PX.l - PX.r));
  band.setAttribute('y', String(yOf(COST)));
  band.setAttribute('height', String(H - PX.b - yOf(COST)));
  band.setAttribute('fill', 'rgba(255,122,138,.07)');
  svg.appendChild(band);
  // Unit-cost line.
  const costLine = mkLine('rgba(255,122,138,.5)', 1, '4 4');
  costLine.setAttribute('x1', String(PX.l));
  costLine.setAttribute('x2', String(W - PX.r));
  costLine.setAttribute('y1', String(yOf(COST)));
  costLine.setAttribute('y2', String(yOf(COST)));

  const firmPaths: SVGPathElement[] = [];
  const xMarks: HTMLElement[] = [];
  const mkPath = () => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    firmPaths.push(p);
    return p;
  };

  const mkLab = (cls: string) => {
    const d = document.createElement('div');
    d.className = cls;
    box.appendChild(d);
    return d;
  };
  const axCost = mkLab('us-axis');
  axCost.textContent = 'unit cost';
  axCost.style.color = 'rgba(255,122,138,.85)';
  const axY = mkLab('us-axis');
  axY.textContent = 'price ↑   days →';
  axY.style.left = '7px';
  axY.style.top = '4%';
  const monoLab = mkLab('us-lab');
  monoLab.style.color = '#34d399';

  /* ---- Panel ---- */
  const panel = layout.panel;
  panel.className += ' us-panel';
  const verdict = document.createElement('div');
  verdict.className = 'us-verdict';
  panel.appendChild(verdict);
  const dl = document.createElement('dl');
  dl.className = 'us-dl';
  const mkRow = (term: string) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dl.append(dt, dd);
    return dd;
  };
  const ddSurv = mkRow('firms surviving');
  const ddBank = mkRow('bankruptcies');
  const ddCrash = mkRow('crash begins');
  const ddPrice = mkRow('survivor price');
  panel.appendChild(dl);
  const anchor = document.createElement('div');
  anchor.className = 'us-anchor';
  anchor.textContent =
    `Paper anchor — Agent Bazaar's 5 LLM firms over ${data.crash.days} days: Gemini 3 Flash went bankrupt ${pct(data.crash.bankruptcyByModel[0].rate)} of runs, GPT 5.4 ${pct(data.crash.bankruptcyByModel[1].rate)}, Claude Sonnet 4.6 ${pct(data.crash.bankruptcyByModel[2].rate)}. Survivors then priced at ${data.crash.postCrashPriceMultiple}× cost.`;
  panel.appendChild(anchor);

  /* ---- Controls ---- */
  const controls = layout.controls;
  controls.className += ' us-controls';
  const mkSlider = (id: string, label: string, min: number, max: number, step: number, value: number, variant = '') => {
    const field = document.createElement('div');
    field.className = 'us-field' + (variant ? ` ${variant}` : '');
    const lab = document.createElement('label');
    lab.htmlFor = `us-${id}`;
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = label;
    const out = document.createElement('output');
    lab.append(nm, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `us-${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };
  const firmsS = mkSlider('firms', 'competing firms', 3, 8, 1, 6);
  const discS = mkSlider('disc', 'price discovery', 1, 7, 1, 5, 'us-disc');
  const stabS = mkSlider('stab', 'stabilizer firms', 0, 8, 1, 1, 'us-stab');

  const note = layout.caption;
  note.className += ' us-note';
  note.textContent =
    `Deterministic best-response model of “The Crash” in Agent Bazaar (arXiv:2605.17698, ${data.asOf}). Firms undercut the cheapest rival they can see; demand is a softmin on price; below-cost firms bleed cash and exit. Illustrative dynamics, not the paper's LLM runs.`;

  /* ---- Render ---- */
  function render() {
    const N = Number(firmsS.input.value);
    // keep the stabilizer slider's ceiling sane vs firm count
    stabS.input.max = String(N);
    if (Number(stabS.input.value) > N) stabS.input.value = String(N);
    const stab = Number(stabS.input.value);
    const disc = Math.min(Number(discS.input.value), N - 1);

    firmsS.out.textContent = `${N}`;
    discS.out.textContent = disc >= N - 1 ? `${disc} (all)` : `${disc}`;
    stabS.out.textContent = `${stab}`;

    const r = simulate(N, disc, stab);

    // Draw firm trajectories.
    while (firmPaths.length < N) mkPath();
    for (let i = 0; i < firmPaths.length; i++) {
      const p = firmPaths[i]!;
      if (i >= N) { p.setAttribute('d', ''); continue; }
      const f = r.firms[i]!;
      const end = f.diedAt >= 0 ? f.diedAt : STEPS - 1;
      let dStr = '';
      for (let t = 0; t <= end; t++) {
        dStr += `${t ? 'L' : 'M'}${xOf(t).toFixed(1)} ${yOf(f.series[t]!).toFixed(1)} `;
      }
      p.setAttribute('d', dStr);
      const color = f.alive
        ? f.stabilizer ? '#34d399' : '#5b8cff'
        : '#ff7a8a';
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', f.stabilizer ? '1.8' : '1.3');
      p.setAttribute('opacity', f.alive ? '0.95' : '0.6');
    }

    // Bankruptcy ✗ markers (DOM overlay, crisp).
    const deaths = r.firms.filter((f) => f.diedAt >= 0);
    while (xMarks.length < deaths.length) xMarks.push(mkLab('us-x'));
    for (let i = 0; i < xMarks.length; i++) {
      const m = xMarks[i]!;
      if (i >= deaths.length) { m.style.display = 'none'; continue; }
      const f = deaths[i]!;
      m.style.display = '';
      m.textContent = '✗';
      m.style.left = `${(xOf(f.diedAt) / W) * 100}%`;
      m.style.top = `${(yOf(f.series[f.diedAt]!) / H) * 100}%`;
    }

    // Labels.
    axCost.style.left = `${((W - PX.r) / W) * 100}%`;
    axCost.style.transform = 'translate(-100%,-50%)';
    axCost.style.top = `${((yOf(COST) - 7) / H) * 100}%`;
    if (r.survivors > 0 && r.finalMultiple > 1.05) {
      monoLab.style.display = '';
      monoLab.textContent = `${r.finalMultiple.toFixed(1)}× cost`;
      monoLab.style.left = `${((W - PX.r - 36) / W) * 100}%`;
      monoLab.style.top = `${((yOf(Math.min(r.finalMultiple, PMAX)) - 8) / H) * 100}%`;
    } else monoLab.style.display = 'none';

    // Readout.
    ddSurv.textContent = `${r.survivors} / ${N}`;
    ddSurv.className = r.survivors === N ? 'pos' : r.survivors === 0 ? 'neg' : '';
    ddBank.textContent = `${r.bankruptcies}`;
    ddBank.className = r.bankruptcies > 0 ? 'neg' : 'pos';
    ddCrash.textContent = r.crashDay >= 0 ? `day ${Math.round((r.crashDay / (STEPS - 1)) * data.crash.days)}` : 'no crash';
    ddCrash.className = r.crashDay >= 0 ? 'neg' : 'pos';
    ddPrice.textContent = r.survivors > 0 ? `${r.finalMultiple.toFixed(2)}× cost` : '—';

    // Verdict.
    verdict.innerHTML = '';
    if (r.bankruptcies === 0) {
      verdict.className = 'us-verdict us-stable';
      const b = document.createElement('b');
      b.textContent = 'No crash';
      verdict.append(b, ` — every firm held above cost. Stabilizers, or thin price discovery, kept the undercutting race from diving below unit cost.`);
    } else if (r.survivors <= 1) {
      verdict.className = 'us-verdict us-crash';
      const b = document.createElement('b');
      b.textContent = 'Race to the bottom';
      verdict.append(b, ` — ${r.bankruptcies} of ${N} firms undercut below cost and went bankrupt; the survivor now monopoly-prices at ${r.finalMultiple.toFixed(1)}× cost.`);
    } else {
      verdict.className = 'us-verdict us-crash';
      const b = document.createElement('b');
      b.textContent = `${r.bankruptcies} bankruptcies`;
      verdict.append(b, ` — the undercutting spiral wiped out ${r.bankruptcies} firms; the ${r.survivors} survivors recovered to ${r.finalMultiple.toFixed(1)}× cost. Raise discovery to deepen the crash.`);
    }
  }

  const inputs = [firmsS, discS, stabS].map((s) => s.input);
  const onInput = () => render();
  for (const i of inputs) i.addEventListener('input', onInput);
  render();

  return () => {
    for (const i of inputs) i.removeEventListener('input', onInput);
    style.remove();
    layout.dispose();
  };
}
