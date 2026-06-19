/**
 * Artifact: fpmm-bet-machine — The Bet Machine
 * Manifest: content/artifacts/fpmm-bet-machine/manifest.json
 *
 * Replays a real Omen fixed-product market maker on Gnosis Chain — eight
 * AI-agent bets on one live market, snapshotted in ./data.json (every
 * trade reproduces the on-chain outcomeTokensBought to the wei) — and
 * lets the reader step in as the ninth bettor. Sliders set a probability
 * estimate, bankroll, and stake; the panel computes shares, slippage,
 * expected value, and the execution-aware Kelly stake (maximizing
 * E[log wealth] over the FPMM curve, the same sizing Olas trader agents
 * run). FPMM math: buy s on outcome i with net amount a keeps the pool
 * product constant: s = b_i + a − b_i·b_j/(b_j + a). No runtime fetches.
 *
 * Layout: shared responsive primitive (stage = question + P(YES) chart +
 * trade line · panel = execution readout · controls = your-turn sliders +
 * kelly · caption = exact-math note; rail in wide mode).
 */
import data from '../../../content/artifacts/fpmm-bet-machine/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const FEE = data.market.feePct / 100;
const SEED = data.market.seedLiquidity;

interface Pools {
  yes: number;
  no: number;
}

/** Outcome tokens received for gross investment `b` (fee deducted) — Omen calcBuyAmount. */
function buyShares(pools: Pools, side: 0 | 1, b: number): number {
  const a = b * (1 - FEE);
  const { yes: y, no: n } = pools;
  return side === 0 ? y + a - (y * n) / (n + a) : n + a - (y * n) / (y + a);
}

function applyBuy(pools: Pools, side: 0 | 1, b: number): Pools {
  const a = b * (1 - FEE);
  const s = buyShares(pools, side, b);
  return side === 0
    ? { yes: pools.yes + a - s, no: pools.no + a }
    : { yes: pools.yes + a, no: pools.no + a - s };
}

/** Marginal price of YES = opposite pool over pool sum (2-outcome FPMM). */
const pYes = (p: Pools) => p.no / (p.yes + p.no);

/** Pool states 0..N (state k = after the first k real trades). */
const states: Pools[] = [{ yes: SEED, no: SEED }];
for (const t of data.trades) {
  states.push(applyBuy(states[states.length - 1]!, t.outcome as 0 | 1, t.investment));
}

/**
 * Execution-aware Kelly: stake b* maximizing
 *   p·ln(W − b + s(b)) + (1−p)·ln(W − b)
 * where s(b) walks the FPMM curve (slippage + 1% fee included). Ternary
 * search — the objective is unimodal in b.
 */
function kellyStake(pools: Pools, side: 0 | 1, pWin: number, W: number): number {
  const g = (b: number) =>
    pWin * Math.log(W - b + buyShares(pools, side, b)) + (1 - pWin) * Math.log(W - b);
  let lo = 0;
  let hi = W * 0.99;
  for (let i = 0; i < 80; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (g(m1) < g(m2)) lo = m1;
    else hi = m2;
  }
  const b = (lo + hi) / 2;
  return b < 0.005 ? 0 : b;
}

const fmt = (n: number, d = 3) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (f: number, d = 1) => `${(f * 100).toFixed(d)}%`;
const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
const hhmm = (iso: string) => `${iso.slice(11, 16)} UTC`;

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    // Stage is variable-height DOM (question header + a fixed 148px chart +
    // trade line), not a single fixed-aspect SVG — so use a modest min-height
    // floor that fits the content instead of a tall clamp that left dead space.
    stageMin: '210px',
    stageFr: '1.4fr',
  });
  const { stage, panel: panelSlot, controls: controlsSlot, caption } = layout;
  stage.classList.add('bm-stage');
  panelSlot.classList.add('bm-slot');
  controlsSlot.classList.add('bm-slot');
  caption.classList.add('bm-slot');

  const style = document.createElement('style');
  style.textContent = `
    .bm-stage { display:flex; flex-direction:column; gap:9px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .bm-slot { min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .bm-q { font-size:10.5px; color:#5b6378; letter-spacing:.03em; }
    .bm-q b { color:#e7eaf3; font-weight:600; }
    .bm-chartwrap { position:relative; height:148px; flex:none;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .bm-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .bm-axislabel { position:absolute; font-size:10px; color:#5b6378; pointer-events:none; }
    .bm-step { position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; padding:0;
      border:none; border-radius:50%; background:transparent; cursor:pointer; }
    .bm-step::after { content:''; position:absolute; inset:5px; border-radius:50%;
      background:#5b8cff; box-shadow:0 0 6px rgba(91,140,255,.7); transition:transform .15s; }
    .bm-step.bm-no::after { background:#f0709b; box-shadow:0 0 6px rgba(240,112,155,.7); }
    .bm-step.bm-sel::after { transform:scale(1.7); outline:1.5px solid #e7eaf3; outline-offset:1px; }
    .bm-step:focus-visible { outline:1.5px solid #e7eaf3; outline-offset:2px; }
    .bm-you { position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px;
      border-radius:2px; transform:rotate(45deg); background:#ffc24b;
      box-shadow:0 0 7px rgba(255,194,75,.8); pointer-events:none; }
    .bm-trade { font-size:10.5px; color:#8d95ad; min-height:1.5em; }
    .bm-trade b { color:#e7eaf3; }
    .bm-panel { min-width:0; max-width:100%; box-sizing:border-box;
      border:1px solid rgba(124,140,255,.14); border-radius:12px;
      padding:10px 12px; background:#0d1322; display:flex; flex-direction:column; gap:7px; }
    .bm-panel h3 { margin:0; font:700 10px 'JetBrains Mono', monospace;
      letter-spacing:.14em; text-transform:uppercase; color:#ffc24b; }
    .bm-field { min-width:0; max-width:100%; }
    .bm-field label { display:flex; justify-content:space-between; gap:6px;
      min-width:0; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .bm-field label span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .bm-field output { color:#e7eaf3; font-size:11px; flex:none; }
    .bm-field input[type=range] { width:100%; max-width:100%; min-width:0; box-sizing:border-box;
      accent-color:#ffc24b; cursor:pointer; background:transparent; margin:3px 0 0; }
    .bm-kelly { align-self:flex-start; max-width:100%; box-sizing:border-box;
      border:1px solid rgba(255,194,75,.45); border-radius:8px;
      background:rgba(255,194,75,.08); color:#ffc24b; padding:4px 10px; cursor:pointer;
      white-space:normal; overflow-wrap:break-word;
      font:600 10.5px 'JetBrains Mono', monospace; letter-spacing:.06em; }
    .bm-kelly:hover { background:rgba(255,194,75,.16); }
    .bm-kelly:focus-visible { outline:1.5px solid #ffc24b; outline-offset:2px; }
    .bm-out dl { margin:0; min-width:0; max-width:100%; display:grid;
      grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:3px 10px; }
    .bm-out dt { min-width:0; color:#5b6378; font-size:10px; }
    .bm-out dd { margin:0; min-width:0; color:#e7eaf3; text-align:right;
      overflow-wrap:break-word; font-variant-numeric:tabular-nums; }
    .bm-out dd.bm-pos { color:#3ddc97; }
    .bm-out dd.bm-neg { color:#f0709b; }
    .bm-note { text-align:center; font-size:9.5px; color:#5b6378; letter-spacing:.04em; }
  `;
  stage.appendChild(style);

  /* ---- Header ---- */
  const q = document.createElement('div');
  q.className = 'bm-q';
  const qb = document.createElement('b');
  qb.textContent =
    '“Will the Nashville Zoo petition reach 400,000 signatures by June 16, 2026?”';
  q.append(
    qb,
    ` — live Omen market on Gnosis, created ${data.market.createdAt.slice(0, 10)}, ` +
      `${SEED.toFixed(0)}+${SEED.toFixed(0)} wxDAI seed, ${data.market.feePct}% fee`,
  );
  stage.appendChild(q);

  /* ---- Price chart ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600;
  const H = 148;
  const probs = states.map(pYes);
  const yMin = Math.min(...probs) - 0.05;
  const yMax = Math.max(...probs) + 0.05;
  const X = (k: number) => 28 + (k / (states.length - 1)) * (W - 70);
  const Y = (p: number) => H - 16 - ((p - yMin) / (yMax - yMin)) * (H - 36);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'bm-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  chartWrap.appendChild(svg);

  const fifty = document.createElementNS(NS, 'path');
  fifty.setAttribute('d', `M0 ${Y(0.5)} L${W} ${Y(0.5)}`);
  fifty.setAttribute('stroke', 'rgba(91,99,120,.5)');
  fifty.setAttribute('stroke-dasharray', '4 4');
  fifty.setAttribute('vector-effect', 'non-scaling-stroke');
  fifty.setAttribute('fill', 'none');
  svg.appendChild(fifty);

  const line = document.createElementNS(NS, 'path');
  line.setAttribute(
    'd',
    probs.map((p, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(p).toFixed(2)}`).join(' '),
  );
  line.setAttribute('stroke', '#5b8cff');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('fill', 'none');
  svg.appendChild(line);

  // Ghost segment: selected state → your hypothetical bet.
  const ghost = document.createElementNS(NS, 'path');
  ghost.setAttribute('stroke', '#ffc24b');
  ghost.setAttribute('stroke-width', '2');
  ghost.setAttribute('stroke-dasharray', '5 4');
  ghost.setAttribute('vector-effect', 'non-scaling-stroke');
  ghost.setAttribute('fill', 'none');
  svg.appendChild(ghost);

  const mkAxisLabel = (css: string, text: string) => {
    const div = document.createElement('div');
    div.className = 'bm-axislabel';
    div.style.cssText = css;
    div.textContent = text;
    chartWrap.appendChild(div);
  };
  mkAxisLabel('top:5px;left:8px;', `P(YES) ${pct(yMax)}`);
  mkAxisLabel('bottom:3px;left:8px;', pct(yMin));
  mkAxisLabel('top:5px;right:10px;', 'seed → 8 agent bets · Jun 12, 2026');

  // Step markers (DOM buttons → tap and keyboard path).
  let selected = states.length - 1;
  const stepBtns: HTMLButtonElement[] = [];
  states.forEach((_, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bm-step';
    const trade = k > 0 ? data.trades[k - 1]! : null;
    if (trade?.outcome === 1) b.classList.add('bm-no');
    b.style.left = `${(X(k) / W) * 100}%`;
    b.style.top = `${(Y(probs[k]!) / H) * 100}%`;
    b.setAttribute(
      'aria-label',
      trade
        ? `bet ${k}: ${fmt(trade.investment)} wxDAI on ${trade.outcome === 0 ? 'YES' : 'NO'} at ${hhmm(trade.time)}`
        : 'market seed, 7+7 wxDAI',
    );
    b.addEventListener('click', () => select(k));
    chartWrap.appendChild(b);
    stepBtns.push(b);
  });

  const you = document.createElement('div');
  you.className = 'bm-you';
  chartWrap.appendChild(you);
  stage.appendChild(chartWrap);

  const tradeLine = document.createElement('div');
  tradeLine.className = 'bm-trade';
  stage.appendChild(tradeLine);

  /* ---- Bet panel ---- */
  const panel = document.createElement('div');
  panel.className = 'bm-panel';
  const h3 = document.createElement('h3');
  h3.textContent = 'your turn — bet against the bots';
  panel.appendChild(h3);

  const defs = [
    { id: 'est', label: 'your P(YES)', min: 1, max: 99, step: 1, value: 30, unit: '%' },
    { id: 'bank', label: 'bankroll', min: 1, max: 50, step: 1, value: 10, unit: 'wxDAI' },
    { id: 'stake', label: 'stake', min: 0.01, max: 10, step: 0.01, value: 0.35, unit: 'wxDAI' },
  ] as const;
  const sliders = new Map<string, HTMLInputElement>();
  const outputs = new Map<string, HTMLOutputElement>();
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = 'bm-field';
    const label = document.createElement('label');
    label.htmlFor = `bm-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `bm-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.value);
    input.setAttribute('aria-label', `${d.label} (${d.unit})`);
    field.append(label, input);
    panel.appendChild(field);
    sliders.set(d.id, input);
    outputs.set(d.id, out);
  }

  const kellyBtn = document.createElement('button');
  kellyBtn.type = 'button';
  kellyBtn.className = 'bm-kelly';
  kellyBtn.textContent = 'size like an agent (kelly)';
  panel.appendChild(kellyBtn);
  controlsSlot.appendChild(panel);

  /* ---- Results ---- */
  const outPanel = document.createElement('div');
  outPanel.className = 'bm-panel bm-out';
  const oh3 = document.createElement('h3');
  oh3.textContent = 'execution';
  const dl = document.createElement('dl');
  const rows = [
    'side bought',
    'shares received',
    'avg price / share',
    'market moves',
    'expected profit',
    'kelly stake',
  ];
  const dds: HTMLElement[] = [];
  for (const r of rows) {
    const dt = document.createElement('dt');
    dt.textContent = r;
    const dd = document.createElement('dd');
    dl.append(dt, dd);
    dds.push(dd);
  }
  outPanel.append(oh3, dl);
  panelSlot.appendChild(outPanel);

  const note = document.createElement('div');
  note.className = 'bm-note';
  note.textContent =
    'exact contract math: 1% fee, then constant pool product. replayed bets match on-chain shares to the wei.';
  caption.appendChild(note);

  /* ---- Recompute ---- */
  function select(k: number) {
    selected = k;
    stepBtns.forEach((b, i) => b.classList.toggle('bm-sel', i === k));
    render();
  }

  function render() {
    const est = Number(sliders.get('est')!.value) / 100;
    const bank = Number(sliders.get('bank')!.value);
    const stakeInput = sliders.get('stake')!;
    stakeInput.max = String(Math.min(10, bank));
    const stake = Math.min(Number(stakeInput.value), bank);
    outputs.get('est')!.textContent = pct(est, 0);
    outputs.get('bank')!.textContent = `${fmt(bank, 0)} wxDAI`;
    outputs.get('stake')!.textContent = `${fmt(stake, 2)} wxDAI`;

    const pools = states[selected]!;
    const price = pYes(pools);
    const trade = selected > 0 ? data.trades[selected - 1]! : null;
    tradeLine.innerHTML = '';
    if (trade) {
      const before = probs[selected - 1]!;
      tradeLine.append(
        `bet #${selected} · ${hhmm(trade.time)} · agent ${short(trade.buyer)} put `,
        Object.assign(document.createElement('b'), {
          textContent: `${fmt(trade.investment)} wxDAI`,
        }),
        ` on ${trade.outcome === 0 ? 'YES' : 'NO'} → ${fmt(trade.shares)} shares · P(YES) ${pct(before)} → ${pct(price)}`,
      );
    } else {
      tradeLine.textContent = `seed · market creator funded 7 + 7 wxDAI · P(YES) starts at ${pct(price)}`;
    }

    const side: 0 | 1 = est > price ? 0 : 1;
    const pWin = side === 0 ? est : 1 - est;
    const shares = buyShares(pools, side, stake);
    const after = applyBuy(pools, side, stake);
    const newPrice = pYes(after);
    const ev = pWin * shares - stake;
    const kelly = kellyStake(pools, side, pWin, bank);

    dds[0]!.textContent = side === 0 ? 'YES (you > market)' : 'NO (you < market)';
    dds[1]!.textContent = `${fmt(shares)} (pay 1.0 if right)`;
    dds[2]!.textContent = fmt(stake / shares);
    dds[3]!.textContent = `P(YES) ${pct(price)} → ${pct(newPrice)}`;
    dds[4]!.textContent = `${ev >= 0 ? '+' : ''}${fmt(ev)} wxDAI at your ${pct(est, 0)}`;
    dds[4]!.className = ev >= 0 ? 'bm-pos' : 'bm-neg';
    dds[5]!.textContent = kelly === 0 ? 'no edge — an agent skips' : `${fmt(kelly, 2)} wxDAI`;
    dds[5]!.className = kelly === 0 ? 'bm-neg' : '';

    // Ghost: your bet appended after the selected state. Large bets can push
    // the price outside the historical y-range — clamp to the chart box.
    const gx0 = X(selected);
    const gx1 = Math.min(gx0 + (W - 70) / (states.length - 1), W - 14);
    const gy1 = Math.max(8, Math.min(H - 10, Y(newPrice)));
    ghost.setAttribute(
      'd',
      `M${gx0.toFixed(1)} ${Y(price).toFixed(2)} L${gx1.toFixed(1)} ${gy1.toFixed(2)}`,
    );
    you.style.left = `${(gx1 / W) * 100}%`;
    you.style.top = `${(gy1 / H) * 100}%`;
  }

  const onInput = () => render();
  for (const s of sliders.values()) s.addEventListener('input', onInput);
  const onKelly = () => {
    const est = Number(sliders.get('est')!.value) / 100;
    const bank = Number(sliders.get('bank')!.value);
    const pools = states[selected]!;
    const side: 0 | 1 = est > pYes(pools) ? 0 : 1;
    const k = kellyStake(pools, side, side === 0 ? est : 1 - est, bank);
    sliders.get('stake')!.value = String(Math.max(0.01, Math.min(k, Math.min(10, bank))).toFixed(2));
    render();
  };
  kellyBtn.addEventListener('click', onKelly);
  select(states.length - 1);

  return () => {
    layout.dispose();
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    kellyBtn.removeEventListener('click', onKelly);
    style.remove();
  };
}
