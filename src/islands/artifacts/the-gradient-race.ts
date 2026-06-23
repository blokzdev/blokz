/**
 * Artifact: the-gradient-race — The Gradient Race
 * Manifest: content/artifacts/the-gradient-race/manifest.json
 *
 * Simulates the copy equilibrium in permissionless AI training networks.
 * Based on the Gauntlet system (Lidin et al., arXiv:2505.21684) deployed on Bittensor.
 *
 * Without uniqueness enforcement, copying is a Nash-dominant strategy:
 *   - copiers submit the winning gradient, pay zero compute cost, earn the same reward
 *   - defection spreads until nearly everyone copies
 *   - training receives the same pseudo-gradient N times → loss stalls
 *
 * With Gauntlet's commit-reveal uniqueness:
 *   - peers must commit before others reveal → copying is mechanically impossible
 *   - all rational miners compute → diverse gradients aggregate → loss falls
 *
 * Stage: SVG with twin charts — training loss (top) and copier fraction (bottom).
 * Panel: key stats readout (final loss comparison, copier rate).
 * Controls: miner count + compute burden sliders.
 * Caption: source note.
 *
 * Layout: createArtifactLayout, 'rail' template. No data.json — pure mechanism simulation.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const ROUNDS = 80;
const BASE_LOSS = 1.0;
const MIN_LOSS = 0.05;

// Pseudo-random seeded by params so the same inputs always produce the same chart.
function seededRng(seed: number) {
  let s = seed ^ 0xdeadbeef;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return ((s >>> 0) / 0x100000000);
  };
}

interface SimResult {
  loss: number[];      // ROUNDS values
  copierFrac: number[]; // ROUNDS values (0..1)
  finalLoss: number;
  finalCopierFrac: number;
}

function simulate(N: number, computeBurden: number, uniqueness: boolean, seed: number): SimResult {
  const rng = seededRng(seed);

  // Each miner has a fixed "ability" (gradient quality baseline)
  const ability: number[] = [];
  for (let i = 0; i < N; i++) {
    ability.push(0.45 + 0.55 * (i / Math.max(N - 1, 1)));
  }

  // Miner copying state: starts all honest
  const copying = new Array<boolean>(N).fill(false);

  // Running net profit per miner to drive strategy updates
  const netProfit = new Array<number>(N).fill(0);

  let currentLoss = BASE_LOSS;
  const loss: number[] = [];
  const copierFrac: number[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    // ── Strategy update (round 10+, only without uniqueness) ──
    if (!uniqueness && r >= 10) {
      // Observed copier fraction influences defection speed (social signaling)
      const currentFrac = copying.filter(Boolean).length / N;
      for (let i = 0; i < N; i++) {
        if (!copying[i]) {
          // Switch probability rises with compute burden and observed copying
          const switchP = 0.05 * computeBurden * (1 + 2.5 * currentFrac);
          if (rng() < switchP) copying[i] = true;
        }
      }
    }
    // With uniqueness: copying always caught → no defection
    if (uniqueness) copying.fill(false);

    const numCopying = copying.filter(Boolean).length;
    const numComputing = N - numCopying;

    // ── Pseudo-gradient quality per miner ──
    const qualities: number[] = ability.map((a, i) => {
      if (copying[i]) return 0; // rejected under uniqueness; counted as clone without
      const noise = (rng() - 0.5) * 0.25;
      return Math.max(0.08, Math.min(1.0, a + noise));
    });

    // Effective unique gradient signal:
    //   - Under uniqueness: all non-copy miners contribute independently
    //   - Without uniqueness: copiers bring no new information, so effective N shrinks
    const uniqueQualities = qualities.filter((_, i) => !copying[i]);
    const uniqueSum = uniqueQualities.reduce((s, q) => s + q, 0);

    // Loss reduction scales with unique gradient diversity
    const effectiveFraction = numComputing / N;   // how many produced real gradients
    const lossReduction = numComputing > 0
      ? 0.014 * (uniqueSum / N) * effectiveFraction
      : 0.0005; // tiny noise floor
    currentLoss = Math.max(MIN_LOSS, currentLoss - lossReduction);

    // ── Reward distribution ──
    // Total reward pool = 1.0; split by quality
    const totalQ = qualities.reduce((s, q) => s + q, 0);
    for (let i = 0; i < N; i++) {
      const reward = totalQ > 0 ? (qualities[i] / totalQ) : 0;
      const cost = copying[i] ? 0 : computeBurden / N;
      netProfit[i] += reward - cost;
    }

    loss.push(currentLoss);
    copierFrac.push(numCopying / N);
  }

  return {
    loss,
    copierFrac,
    finalLoss: loss[loss.length - 1]!,
    finalCopierFrac: copierFrac[copierFrac.length - 1]!,
  };
}

const fmt1 = (v: number) => v.toFixed(2);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageMin: 'clamp(220px, 42vw, 320px)',
  });
  const { stage, panel, controls, caption } = layout;

  // ── Styles ──
  const style = document.createElement('style');
  style.textContent = `
    .gr-stage { display:flex; flex-direction:column; gap:0; min-width:0;
      font:500 11px/1.4 'JetBrains Mono',monospace; color:#8d95ad; }
    .gr-wrap { border:1px solid rgba(124,140,255,.14); border-radius:12px;
      background:#0d1322; padding:10px 12px 8px; overflow:hidden; min-width:0; }
    .gr-box { position:relative; min-width:0; }
    .gr-box svg { display:block; width:100%; }
    .gr-axis { position:absolute; font-size:8.5px; color:#3d4560; pointer-events:none;
      white-space:nowrap; }
    .gr-lbl { position:absolute; font-size:9px; pointer-events:none;
      white-space:nowrap; transform:translate(0,-50%); }

    .gr-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11.5px/1.45 'JetBrains Mono',monospace; }
    .gr-card { border:1px solid rgba(124,140,255,.14); border-radius:10px;
      padding:9px 11px; background:#0d1322; }
    .gr-head { font-size:9.5px; text-transform:uppercase; letter-spacing:.08em;
      color:#4a5272; margin-bottom:6px; }
    .gr-dl { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr);
      gap:3px 10px; max-width:100%; }
    .gr-dl dt { color:#5b6378; font-size:10px; min-width:0; }
    .gr-dl dd { margin:0; text-align:right; font-size:11px;
      font-variant-numeric:tabular-nums; min-width:0; }
    .gr-dl dd.pos { color:#34d399; }
    .gr-dl dd.neg { color:#ff7a8a; }
    .gr-dl dd.neu { color:#e7eaf3; }
    .gr-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 9px;
      border-radius:8px; font-size:10.5px; }
    .gr-badge.good { background:rgba(52,211,153,.1); color:#34d399;
      border:1px solid rgba(52,211,153,.2); }
    .gr-badge.bad { background:rgba(255,122,138,.08); color:#ff7a8a;
      border:1px solid rgba(255,122,138,.18); }
    .gr-verdict { font-size:11px; color:#8d95ad; line-height:1.55; }
    .gr-verdict b { color:#e7eaf3; }

    .gr-controls { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11px/1.4 'JetBrains Mono',monospace; }
    .gr-field { min-width:0; }
    .gr-field label { display:flex; justify-content:space-between; align-items:baseline;
      gap:6px; font-size:9.5px; text-transform:uppercase; letter-spacing:.07em;
      color:#4a5272; margin-bottom:3px; }
    .gr-field output { color:#e7eaf3; font-size:10.5px; font-variant-numeric:tabular-nums;
      flex:none; }
    .gr-field input[type=range] { width:100%; accent-color:#5b8cff; cursor:pointer;
      background:transparent; margin:0; }
    .gr-field.burden input { accent-color:#ff7a8a; }

    .gr-caption { font-size:9px; color:#3d4560; letter-spacing:.02em; line-height:1.55;
      font:500 9px/1.55 'JetBrains Mono',monospace; }
  `;
  container.appendChild(style);

  stage.className += ' gr-stage';
  const wrap = document.createElement('div');
  wrap.className = 'gr-wrap';
  const box = document.createElement('div');
  box.className = 'gr-box';
  wrap.appendChild(box);
  stage.appendChild(wrap);

  // ── SVG ──
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const W = 560, H = 270;
  const TOP_H = 170; // loss chart height
  const BOT_H = 70;  // copier chart height
  const GAP = 30;    // space between charts (labels + divider)
  const PX = { l: 6, r: 10, t: 14, b: 10 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-label', 'Training loss and copier fraction over 80 training rounds, comparing Gauntlet uniqueness enforcement vs no enforcement.');
  box.appendChild(svg);

  const xOf = (r: number) => PX.l + (r / (ROUNDS - 1)) * (W - PX.l - PX.r);

  // ── Loss chart (top) ──
  const TOP_Y = PX.t;
  const yLoss = (v: number) => TOP_Y + (1 - Math.max(0, Math.min(1, (v - MIN_LOSS) / (BASE_LOSS - MIN_LOSS)))) * (TOP_H - PX.t - PX.b);

  // Shaded area between the two loss curves (filled with low-opacity red)
  const gapArea = document.createElementNS(NS, 'path');
  gapArea.setAttribute('fill', 'rgba(255,122,138,.06)');
  gapArea.setAttribute('stroke', 'none');
  svg.appendChild(gapArea);

  const mkPath = (color: string, w: number, dash = '') => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', String(w));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (dash) p.setAttribute('stroke-dasharray', dash);
    svg.appendChild(p);
    return p;
  };

  const lossWithPath = mkPath('#5b8cff', 1.8);
  const lossNonePath = mkPath('#ff7a8a', 1.5, '5 3');

  // Horizontal gridlines for loss chart
  for (const v of [0.25, 0.5, 0.75, 1.0]) {
    const y = yLoss(v);
    const g = document.createElementNS(NS, 'line');
    g.setAttribute('x1', String(PX.l));
    g.setAttribute('x2', String(W - PX.r));
    g.setAttribute('y1', String(y));
    g.setAttribute('y2', String(y));
    g.setAttribute('stroke', 'rgba(255,255,255,.04)');
    g.setAttribute('stroke-width', '0.5');
    svg.appendChild(g);
  }

  // Divider between charts
  const divY = TOP_H + GAP / 2;
  const div = document.createElementNS(NS, 'line');
  div.setAttribute('x1', String(PX.l));
  div.setAttribute('x2', String(W - PX.r));
  div.setAttribute('y1', String(divY));
  div.setAttribute('y2', String(divY));
  div.setAttribute('stroke', 'rgba(124,140,255,.08)');
  div.setAttribute('stroke-width', '0.5');
  svg.appendChild(div);

  // ── Copier fraction chart (bottom) ──
  const BOT_Y = TOP_H + GAP;
  const yFrac = (v: number) => BOT_Y + (1 - Math.max(0, Math.min(1, v))) * (BOT_H - PX.b);

  // Filled area for copier fraction (no-uniqueness case)
  const copierArea = document.createElementNS(NS, 'path');
  copierArea.setAttribute('fill', 'rgba(255,122,138,.12)');
  copierArea.setAttribute('stroke', 'none');
  svg.appendChild(copierArea);

  const copierPath = mkPath('#ff7a8a', 1.4);

  // DOM overlays (axis labels, chart titles)
  const mkLabel = (cls: string, text: string) => {
    const d = document.createElement('div');
    d.className = 'gr-axis ' + cls;
    d.textContent = text;
    box.appendChild(d);
    return d;
  };

  const lblLossTitle = mkLabel('', 'training loss');
  lblLossTitle.style.left = '7px';
  lblLossTitle.style.top = `${(PX.t / H * 100).toFixed(1)}%`;
  lblLossTitle.style.color = '#5b6378';
  lblLossTitle.style.fontSize = '8px';
  lblLossTitle.style.letterSpacing = '.07em';
  lblLossTitle.style.textTransform = 'uppercase';

  const lblFracTitle = mkLabel('', 'copiers (no uniqueness)');
  lblFracTitle.style.left = '7px';
  lblFracTitle.style.top = `${(BOT_Y / H * 100).toFixed(1)}%`;
  lblFracTitle.style.color = 'rgba(255,122,138,.65)';
  lblFracTitle.style.fontSize = '8px';
  lblFracTitle.style.letterSpacing = '.07em';
  lblFracTitle.style.textTransform = 'uppercase';

  const lblRounds = mkLabel('', '0                   rounds →                   80');
  lblRounds.style.left = '7px';
  lblRounds.style.bottom = `${(4 / H * 100).toFixed(1)}%`;
  lblRounds.style.top = 'auto';
  lblRounds.style.fontSize = '7.5px';
  lblRounds.style.color = '#3d4560';

  // Legend labels (positioned dynamically after render)
  const mkFloatLbl = (color: string, text: string) => {
    const d = document.createElement('div');
    d.className = 'gr-lbl';
    d.textContent = text;
    d.style.color = color;
    d.style.fontSize = '9px';
    box.appendChild(d);
    return d;
  };
  const lblWith = mkFloatLbl('#5b8cff', '← uniqueness on');
  const lblNone = mkFloatLbl('#ff7a8a', '← no uniqueness');

  // ── Panel ──
  panel.className += ' gr-panel';

  const card1 = document.createElement('div');
  card1.className = 'gr-card';
  const h1 = document.createElement('div');
  h1.className = 'gr-head';
  h1.textContent = 'Final training loss';
  card1.appendChild(h1);
  const dl1 = document.createElement('dl');
  dl1.className = 'gr-dl';
  const mkRow = (parent: HTMLElement, term: string) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    parent.append(dt, dd);
    return dd;
  };
  const ddWith = mkRow(dl1, 'uniqueness on');
  const ddNone = mkRow(dl1, 'no uniqueness');
  const ddGap = mkRow(dl1, 'loss gap');
  card1.appendChild(dl1);
  panel.appendChild(card1);

  const card2 = document.createElement('div');
  card2.className = 'gr-card';
  const h2 = document.createElement('div');
  h2.className = 'gr-head';
  h2.textContent = 'Copier rate at round 80';
  card2.appendChild(h2);
  const badgeEl = document.createElement('div');
  card2.appendChild(badgeEl);
  const verdictEl = document.createElement('div');
  verdictEl.className = 'gr-verdict';
  card2.appendChild(verdictEl);
  panel.appendChild(card2);

  // ── Controls ──
  controls.className += ' gr-controls';

  const mkSlider = (cls: string, label: string, min: number, max: number, step: number, val: number) => {
    const f = document.createElement('div');
    f.className = 'gr-field ' + cls;
    const lab = document.createElement('label');
    const nm = document.createElement('span');
    nm.textContent = label;
    const out = document.createElement('output');
    lab.append(nm, out);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(val);
    inp.setAttribute('aria-label', label);
    f.append(lab, inp);
    controls.appendChild(f);
    return { inp, out };
  };

  const minersS = mkSlider('', 'miners', 4, 14, 1, 8);
  const burdenS = mkSlider('burden', 'compute burden', 1, 5, 1, 3);

  // ── Caption ──
  caption.className += ' gr-caption';
  caption.textContent =
    'Deterministic simulation of gradient-market dynamics. Based on Gauntlet (Lidin et al., arXiv:2505.21684, May 2025) — the system deployed on Bittensor that trained a 1.2B LLM with permissionless participants. Illustrative dynamics; not the paper\'s exact training run.';

  // ── Render ──
  function render() {
    const N = Number(minersS.inp.value);
    const burdenStep = Number(burdenS.inp.value); // 1..5
    const computeBurden = 0.05 + (burdenStep - 1) * 0.075; // 0.05..0.35

    const burdenLabels = ['very low', 'low', 'medium', 'high', 'very high'];
    minersS.out.textContent = String(N);
    burdenS.out.textContent = burdenLabels[burdenStep - 1] ?? '';

    const seed = N * 1000 + burdenStep;
    const rWith = simulate(N, computeBurden, true, seed);
    const rNone = simulate(N, computeBurden, false, seed + 1);

    // Build SVG paths
    const buildLossPath = (data: number[]) =>
      data.map((v, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yLoss(v).toFixed(1)}`).join(' ');

    lossWithPath.setAttribute('d', buildLossPath(rWith.loss));
    lossNonePath.setAttribute('d', buildLossPath(rNone.loss));

    // Gap area: from rWith.loss down to rNone.loss
    const topPts = rWith.loss.map((v, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yLoss(v).toFixed(1)}`).join(' ');
    const botPts = [...rNone.loss].reverse().map((v, i) =>
      `L${xOf(ROUNDS - 1 - i).toFixed(1)} ${yLoss(v).toFixed(1)}`).join(' ');
    gapArea.setAttribute('d', `${topPts} ${botPts} Z`);

    // Copier fraction area
    const fPts = rNone.copierFrac.map((v, i) =>
      `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yFrac(v).toFixed(1)}`).join(' ');
    const botY = yFrac(0);
    copierPath.setAttribute('d', fPts);
    copierArea.setAttribute('d',
      `M${xOf(0).toFixed(1)} ${botY} ${fPts.replace(/^M/, 'L')} L${xOf(ROUNDS - 1).toFixed(1)} ${botY} Z`);

    // Floating labels on the chart
    const halfR = Math.floor(ROUNDS / 2);
    lblWith.style.left = `${((xOf(halfR) + 4) / W * 100).toFixed(1)}%`;
    lblWith.style.top = `${(yLoss(rWith.loss[halfR]!) / H * 100).toFixed(1)}%`;
    lblNone.style.left = `${((xOf(halfR) + 4) / W * 100).toFixed(1)}%`;
    lblNone.style.top = `${(yLoss(rNone.loss[halfR]!) / H * 100).toFixed(1)}%`;

    // Panel
    const lossGap = rNone.finalLoss - rWith.finalLoss;
    ddWith.textContent = fmt1(rWith.finalLoss);
    ddWith.className = 'pos';
    ddNone.textContent = fmt1(rNone.finalLoss);
    ddNone.className = rNone.finalLoss > 0.3 ? 'neg' : 'neu';
    ddGap.textContent = `+${fmt1(lossGap)}`;
    ddGap.className = lossGap > 0.2 ? 'neg' : 'neu';

    const cf = rNone.finalCopierFrac;
    const badgeClass = cf > 0.5 ? 'bad' : 'good';
    const badgeText = cf > 0.7
      ? `${fmtPct(cf)} copying — training stalled`
      : cf > 0.3
      ? `${fmtPct(cf)} copying — degraded`
      : `${fmtPct(cf)} copying — stable`;
    badgeEl.innerHTML = `<div class="gr-badge ${badgeClass}">${badgeText}</div>`;

    verdictEl.innerHTML = '';
    const v = document.createElement('div');
    v.className = 'gr-verdict';
    if (cf > 0.6) {
      v.innerHTML = `<b>${fmtPct(cf)} of miners defected.</b> Without uniqueness, copying is a dominant strategy — same reward, zero compute cost. Training received only ${Math.round((1 - cf) * N)} unique gradient${(1 - cf) * N < 1.5 ? '' : 's'} per round.`;
    } else if (cf > 0.2) {
      v.innerHTML = `<b>${fmtPct(cf)} of miners defected.</b> Defection is spreading. Lower the compute burden to slow it, or observe how uniqueness enforcement blocks it entirely.`;
    } else {
      v.innerHTML = `<b>${fmtPct(cf)} copied</b> at low compute burden. Raise the burden to accelerate defection, or see how uniqueness enforcement holds it at 0% regardless.`;
    }
    verdictEl.appendChild(v);
  }

  const inputs = [minersS.inp, burdenS.inp];
  for (const inp of inputs) inp.addEventListener('input', render);
  render();

  return () => {
    for (const inp of inputs) inp.removeEventListener('input', render);
    style.remove();
    layout.dispose();
  };
}
