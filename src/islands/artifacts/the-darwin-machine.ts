/**
 * Artifact: the-darwin-machine — The Darwin Machine
 * Manifest: content/artifacts/the-darwin-machine/manifest.json
 *
 * Economy of Minds simulation (Qi et al., arXiv:2606.02859).
 * N = 20 agents compete for tasks via sealed-bid auctions; wealth accumulates
 * from environmental rewards; bankrupt agents are replaced by mutations of
 * successful ones. Economic selection pressure evolves a population of weak
 * agents past a stronger monolithic baseline.
 *
 * Mechanism:
 *   bid_i = W_i * (0.3 + rand*0.4)           agent i's sealed bid
 *   winner = argmax(bid_i)
 *   W_winner += success ? REWARD : -bid       reward or loss
 *   W_prev_winner += bid                      bucket-brigade credit
 *   every K_r rounds: W_i -= RENT             periodic rent
 *   W_i < BANKRUPT_THRESH → replaced by mutation of top-3 agent
 *
 * Layout: rail template — stage (agent grid) | panel + controls | caption.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── palette ───────────────────────────────────────────────────────────────────
const C = {
  rich:      '#22d3ee',
  mid:       '#5b8cff',
  poor:      '#a855f7',
  bankrupt:  '#f0883e',
  win:       '#34d399',
  fail:      '#f87171',
  baseline:  '#f0883e',
  economy:   '#22d3ee',
  text:      '#e7eaf3',
  muted:     '#8d95ad',
  faint:     '#5b6378',
  border:    'rgba(124,140,255,.18)',
};

// ── simulation constants ──────────────────────────────────────────────────────
const N = 20;
const COLS = 5;
const ROWS = 4;
const INIT_WEALTH = 10;
const REWARD = 3.5;
const RENT_EVERY = 5;
const RENT_AMOUNT = 0.6;
const BANKRUPT_THRESH = 1.2;
const MUTATION_SD = 0.07;
const BASELINE_Q = 0.65;   // stronger monolithic reference
const HIST_LEN = 50;       // rounds tracked in performance chart

interface Agent {
  id:       number;
  wealth:   number;
  quality:  number;   // hidden capability in [0,1]
  wins:     number;
  attempts: number;
  gen:      number;   // replacement generation counter
  justBankrupt: boolean;
}

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFF_VAL: Record<Difficulty, number> = { easy: 0.4, medium: 0.6, hard: 0.8 };

// mulberry32 seeded RNG
function mkRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initAgents(rand: () => number): Agent[] {
  return Array.from({ length: N }, (_, i) => ({
    id: i,
    wealth: INIT_WEALTH,
    quality: 0.18 + rand() * 0.32,  // initial [0.18, 0.50] — weak agents
    wins: 0,
    attempts: 0,
    gen: 0,
    justBankrupt: false,
  }));
}

// rolling average over last `w` values (1 or 0)
function rolling(hist: number[], w = 20): number {
  const s = hist.slice(-w);
  return s.length ? s.reduce((a, v) => a + v, 0) / s.length : 0;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '4/3',
    stageFr: '1.5fr',
  });
  const { stage, panel, controls: ctrl, caption } = layout;

  // ── styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .dm-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono',monospace; }
    .dm-panel { display:flex; flex-direction:column; gap:12px; min-width:0;
      font:500 12px/1.4 'JetBrains Mono',monospace; color:${C.muted}; }
    .dm-cards { --afl-card:90px; }
    .dm-card { border:1px solid ${C.border}; border-radius:10px; background:#0d1322;
      padding:8px 10px; display:flex; flex-direction:column; gap:2px; min-width:0; }
    .dm-k { font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:${C.faint}; }
    .dm-v { font-size:16px; color:${C.text}; font-variant-numeric:tabular-nums; }
    .dm-v small { font-size:10px; color:${C.muted}; }
    .dm-card.dm-hi .dm-v { color:${C.economy}; }
    .dm-spark-svg { width:100%; height:auto; display:block; }
    .dm-info { font-size:10.5px; line-height:1.5; color:#9aa2b8; min-width:0;
      border-top:1px solid ${C.border}; padding-top:9px; }
    .dm-info b { color:${C.text}; font-variant-numeric:tabular-nums; }
    .dm-info.dm-up b { color:${C.win}; }
    .dm-info.dm-down b { color:${C.poor}; }
    .dm-ctrl { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .dm-row { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
    .dm-diff { border:1px solid ${C.border}; border-radius:8px; cursor:pointer;
      background:#0d1322; color:${C.muted}; font:600 10px 'JetBrains Mono',monospace;
      letter-spacing:.04em; padding:6px 10px; white-space:nowrap; }
    .dm-diff:hover,.dm-diff:focus-visible { border-color:${C.mid}; outline:none; }
    .dm-diff.dm-on { background:rgba(91,140,255,.14); border-color:${C.mid};
      color:${C.mid}; box-shadow:0 0 10px rgba(91,140,255,.22); }
    .dm-btn { border:1px solid ${C.border}; border-radius:8px; cursor:pointer;
      background:#0d1322; color:${C.text}; font:600 11px 'JetBrains Mono',monospace;
      letter-spacing:.04em; padding:8px 13px; white-space:nowrap; min-height:36px; }
    .dm-btn:hover,.dm-btn:focus-visible { border-color:${C.mid}; outline:none; }
    .dm-btn.dm-primary { color:${C.economy}; border-color:rgba(34,211,238,.4); }
    .dm-cap { font-size:9.5px; color:${C.faint}; letter-spacing:.02em; line-height:1.55; }
    .dm-cap b { color:${C.muted}; font-weight:600; }
  `;
  stage.appendChild(style);

  // ── SVG stage ───────────────────────────────────────────────────────────────
  const VW = 400, VH = 340;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('class', 'dm-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    'Agent grid: circle size and colour show wealth; the winning agent pulses each round.');

  const mk = (tag: string, a: Record<string,string|number> = {}, p: Element = svg) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(a).forEach(([k,v]) => el.setAttribute(k, String(v)));
    p.appendChild(el);
    return el;
  };

  // ── background grid title ──
  mk('text', { x: 14, y: 22, 'font-size': 10, 'font-weight': 700,
    fill: C.muted, 'letter-spacing': '.06em' }).textContent = 'AGENT POPULATION';
  const roundLbl  = mk('text', { x: VW-14, y: 22, 'font-size': 10, 'text-anchor':'end',
    fill: C.faint });
  const taskLbl   = mk('text', { x: 14, y: VH-10, 'font-size': 9, fill: C.faint });
  const statusLbl = mk('text', { x: VW-14, y: VH-10, 'font-size': 9,
    'text-anchor':'end', fill: C.faint });

  // ── separator ──
  mk('line', { x1:14, y1:30, x2:VW-14, y2:30,
    stroke:'rgba(124,140,255,.15)', 'stroke-width':1 });

  // ── agent cells ── grid: 5 cols × 4 rows
  const CELL_W = (VW - 28) / COLS;
  const CELL_H = (VH - 60) / ROWS;
  const GRID_X = 14;
  const GRID_Y = 36;

  const cellX = (col: number) => GRID_X + (col + 0.5) * CELL_W;
  const cellY = (row: number) => GRID_Y + (row + 0.5) * CELL_H;

  const MAX_R = Math.min(CELL_W, CELL_H) * 0.38;
  const MIN_R = 3;
  const wealthToR = (w: number) =>
    MIN_R + Math.max(0, Math.min(1, (w - BANKRUPT_THRESH) / (INIT_WEALTH * 2.5 - BANKRUPT_THRESH))) * (MAX_R - MIN_R);

  interface CellEls { glow: SVGElement; circle: SVGElement; genLbl: SVGElement; }
  const cellEls: CellEls[] = [];

  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const cx = cellX(col), cy = cellY(row);

    // glow halo (animated winner/bankrupt)
    const glow = mk('circle', { cx, cy, r: MAX_R + 4, fill: 'none',
      stroke: C.economy, 'stroke-width': 2.5, opacity: 0 });
    // main circle
    const circle = mk('circle', { cx, cy, r: MAX_R * 0.6,
      fill: C.mid, opacity: 0.85 });
    // gen label (tiny, below circle)
    const genLbl = mk('text', { x: cx, y: cy + MAX_R + 10,
      'font-size': 7.5, 'text-anchor': 'middle', fill: C.faint });

    cellEls.push({ glow, circle, genLbl });
  }

  stage.appendChild(svg);

  // ── panel ────────────────────────────────────────────────────────────────────
  // cards: round | avg quality | success rate
  const cards = document.createElement('div');
  cards.className = 'afl-cards dm-cards';
  const mkCard = (hi=false) => {
    const d = document.createElement('div');
    d.className = `dm-card${hi?' dm-hi':''}`;
    d.innerHTML = `<span class="dm-k"></span><span class="dm-v"></span>`;
    return d;
  };
  const cRound = mkCard();
  const cSucc  = mkCard(true);
  const cBase  = mkCard();
  cards.append(cRound, cSucc, cBase);
  panel.appendChild(cards);

  // sparkline: economy vs baseline over last HIST_LEN rounds
  const SP_W = 240, SP_H = 80;
  const sparkSvg = document.createElementNS(SVG_NS, 'svg');
  sparkSvg.setAttribute('viewBox', `0 0 ${SP_W} ${SP_H}`);
  sparkSvg.setAttribute('class', 'dm-spark-svg');
  sparkSvg.setAttribute('role', 'img');
  sparkSvg.setAttribute('aria-label', 'Rolling success rate: economy (cyan) vs monolithic baseline (orange).');
  const sm = (tag: string, a: Record<string,string|number>={}): SVGElement => {
    const el = document.createElementNS(SVG_NS, tag) as SVGElement;
    Object.entries(a).forEach(([k,v]) => el.setAttribute(k,String(v)));
    sparkSvg.appendChild(el);
    return el;
  };
  sm('text',{x:0,y:10,'font-size':8}).textContent='ROLLING SUCCESS RATE (last 20 rounds)';
  sm('line',{x1:0,y1:SP_H-2,x2:SP_W,y2:SP_H-2,stroke:'rgba(124,140,255,.15)','stroke-width':1});
  // baseline dashed reference — will be set per-render
  const sparkBase = sm('line',{stroke:C.baseline,'stroke-width':1.2,'stroke-dasharray':'3 2.5',opacity:.7});
  const sparkEco  = sm('polyline',{fill:'none',stroke:C.economy,'stroke-width':1.8,'stroke-linejoin':'round'});
  const sparkDot  = sm('circle',{r:3.5,fill:C.economy,stroke:'#0a0f1b','stroke-width':1.5});
  sm('text',{x:0,y:SP_H-4,'font-size':7.5,fill:C.economy}).textContent='economy';
  sm('text',{x:SP_W,y:SP_H-4,'font-size':7.5,'text-anchor':'end',fill:C.baseline}).textContent='baseline';
  panel.appendChild(sparkSvg);

  const infoEl = document.createElement('div');
  infoEl.className = 'dm-info';
  panel.appendChild(infoEl);

  // ── controls ─────────────────────────────────────────────────────────────────
  ctrl.className = 'dm-ctrl';

  const diffRow = document.createElement('div');
  diffRow.className = 'dm-row';
  const diffs: Difficulty[] = ['easy','medium','hard'];
  const diffBtns: Record<Difficulty, HTMLButtonElement> = {} as never;
  for (const d of diffs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dm-diff';
    b.textContent = d;
    b.setAttribute('aria-label', `Set task difficulty to ${d}`);
    diffRow.appendChild(b);
    diffBtns[d] = b;
  }
  ctrl.appendChild(diffRow);

  const btnRow = document.createElement('div');
  btnRow.className = 'dm-row';
  const runBtn   = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'dm-btn dm-primary';
  const stepBtn  = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.className = 'dm-btn';
  stepBtn.textContent = 'step';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'dm-btn';
  resetBtn.textContent = 'reset';
  btnRow.append(runBtn, stepBtn, resetBtn);
  ctrl.appendChild(btnRow);

  // ── caption ──────────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'dm-cap';
  cap.innerHTML =
    `Simulation of <b>Economy of Minds</b> (Qi et al., arXiv:2606.02859). ` +
    `20 weak agents (initial quality 0.18–0.50) compete via sealed-bid auctions; ` +
    `bucket-brigade credit assignment rewards prior winners; bankrupt agents are replaced ` +
    `by mutations of the wealthiest. Watch economic selection raise collective performance ` +
    `past the <b>monolithic baseline</b> (quality 0.65). Tap difficulty to change task hardness; use ← → to step.`;
  caption.appendChild(cap);

  // ── simulation state ─────────────────────────────────────────────────────────
  const SEED = 0xdeadbeef;
  let rand = mkRng(SEED);
  let agents = initAgents(rand);
  let diff: Difficulty = 'medium';
  let diffVal = DIFF_VAL[diff];
  let round = 0;
  let prevWinnerId: number | null = null;
  let lastWinnerId: number | null = null;
  let lastSuccess = false;
  let ecoHist: number[] = [];
  let running = true;

  function baselineSucc(): number { return Math.min(1, BASELINE_Q / diffVal); }
  function agentSucc(q: number): number { return Math.min(1, q / diffVal); }

  function stepSim() {
    for (const a of agents) a.justBankrupt = false;
    round++;

    // bids: wealth × random fraction
    const bids = agents.map(a => Math.max(0, a.wealth) * (0.3 + rand() * 0.4));
    let winIdx = 0;
    for (let i = 1; i < N; i++) if (bids[i] > bids[winIdx]) winIdx = i;

    const winner = agents[winIdx];
    const bid = bids[winIdx];
    const success = rand() < agentSucc(winner.quality);

    // bucket-brigade
    if (prevWinnerId !== null) {
      const prev = agents.find(a => a.id === prevWinnerId);
      if (prev) prev.wealth = Math.min(prev.wealth + bid, INIT_WEALTH * 4);
    }

    winner.wealth += success ? REWARD : -bid;
    winner.attempts++;
    if (success) winner.wins++;

    prevWinnerId = winner.id;
    lastWinnerId = winner.id;
    lastSuccess = success;

    ecoHist.push(success ? 1 : 0);
    if (ecoHist.length > HIST_LEN) ecoHist.shift();

    // rent
    if (round % RENT_EVERY === 0) {
      for (const a of agents) a.wealth -= RENT_AMOUNT;
    }

    // bankruptcy + replacement
    const top3 = [...agents].sort((a,b) => b.wealth - a.wealth).slice(0,3);
    for (const a of agents) {
      if (a.wealth < BANKRUPT_THRESH) {
        a.justBankrupt = true;
        const mentor = top3[Math.floor(rand() * top3.length)];
        const dq = (rand() - 0.5) * 2 * MUTATION_SD;
        a.quality = Math.max(0.05, Math.min(0.99, mentor.quality + dq));
        a.wealth = INIT_WEALTH * 0.5;
        a.wins = 0;
        a.attempts = 0;
        a.gen++;
      }
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────
  const fmt1 = (v: number) => v.toFixed(1);
  const fmtPct = (v: number) => (v * 100).toFixed(0) + '%';

  function wealthColor(a: Agent): string {
    if (a.justBankrupt) return C.bankrupt;
    const norm = Math.max(0, Math.min(1, (a.wealth - BANKRUPT_THRESH) / (INIT_WEALTH * 2 - BANKRUPT_THRESH)));
    if (norm > 0.65) return C.rich;
    if (norm > 0.30) return C.mid;
    return C.poor;
  }

  function render() {
    // update agent circles
    for (let i = 0; i < N; i++) {
      const a = agents[i];
      const { glow, circle, genLbl } = cellEls[i];
      const r = wealthToR(a.wealth);
      circle.setAttribute('r', String(Math.max(MIN_R, r)));
      circle.setAttribute('fill', wealthColor(a));
      circle.setAttribute('opacity', a.justBankrupt ? '0.5' : '0.88');

      const isWinner = a.id === lastWinnerId;
      glow.setAttribute('stroke', a.justBankrupt ? C.bankrupt : (lastSuccess ? C.win : C.fail));
      glow.setAttribute('opacity', isWinner ? '0.7' : '0');
      glow.setAttribute('r', String(r + 5));

      genLbl.textContent = a.gen > 0 ? `g${a.gen}` : '';
    }

    roundLbl.textContent = `round ${round}`;
    const dLabel = diff === 'easy' ? 'd=0.4' : diff === 'medium' ? 'd=0.6' : 'd=0.8';
    taskLbl.textContent = `task: ${diff} (${dLabel})`;
    if (lastWinnerId !== null) {
      const w = agents.find(a => a.id === lastWinnerId)!;
      statusLbl.textContent = `agent ${lastWinnerId} ${lastSuccess ? '✓ +3.5' : '✗ −bid'} · q=${fmt1(w.quality)}`;
      statusLbl.setAttribute('fill', lastSuccess ? C.win : C.fail);
    }

    // cards
    const ecoRate = rolling(ecoHist, 20);
    const baseRate = baselineSucc();
    const avgQ = agents.reduce((s,a) => s+a.quality, 0) / N;

    (cRound.querySelector('.dm-k') as HTMLElement).textContent = 'round';
    (cRound.querySelector('.dm-v') as HTMLElement).textContent = String(round);
    (cSucc.querySelector('.dm-k') as HTMLElement).textContent = 'eco. rate';
    (cSucc.querySelector('.dm-v') as HTMLElement).innerHTML = `${fmtPct(ecoRate)}<small> / ${HIST_LEN} rds</small>`;
    (cBase.querySelector('.dm-k') as HTMLElement).textContent = 'baseline';
    (cBase.querySelector('.dm-v') as HTMLElement).textContent = fmtPct(baseRate);

    // sparkline
    const h = ecoHist;
    const n = h.length;
    const WIN = 20;
    // build rolling 20-round rate at each point
    const pts: [number,number][] = [];
    for (let i = 0; i < n; i++) {
      const slice = h.slice(Math.max(0, i-WIN+1), i+1);
      const rate = slice.reduce((s,v)=>s+v,0)/slice.length;
      const x = 4 + (n<=1 ? 0 : (i/(n-1))*(SP_W-8));
      const y = SP_H - 14 - rate * (SP_H - 22);
      pts.push([x,y]);
    }
    sparkEco.setAttribute('points', pts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    if (pts.length) {
      const [lx,ly] = pts[pts.length-1];
      sparkDot.setAttribute('cx', String(lx));
      sparkDot.setAttribute('cy', String(ly));
    }
    const baseY = SP_H - 14 - baseRate * (SP_H - 22);
    sparkBase.setAttribute('x1','4'); sparkBase.setAttribute('x2',String(SP_W-4));
    sparkBase.setAttribute('y1',String(baseY)); sparkBase.setAttribute('y2',String(baseY));

    // info panel
    const ahead = ecoRate > baseRate;
    const bankruptCount = agents.filter(a => a.justBankrupt).length;
    let infoClass = 'dm-info';
    let infoMsg = '';
    if (round === 0) {
      infoMsg = `Initial population: <b>${N} agents</b>, avg quality <b>${fmt1(avgQ)}</b>. ` +
        `All agents start weak — quality below the monolithic baseline's 0.65.`;
    } else if (round < 30) {
      infoMsg = `Early phase: weak agents often lose to the ${fmtPct(baseRate)} baseline. ` +
        `Bankruptcies <b>cycle out failures</b> and seed mutations of survivors.`;
    } else if (ahead) {
      infoClass += ' dm-up';
      infoMsg = `<b>Economy leads:</b> ${fmtPct(ecoRate)} vs. baseline ${fmtPct(baseRate)}. ` +
        `Avg quality rose to <b>${fmt1(avgQ)}</b> through ${agents.reduce((s,a)=>s+a.gen,0)} total replacement cycles.`;
    } else {
      infoClass += ' dm-down';
      infoMsg = `Still evolving: economy ${fmtPct(ecoRate)} vs. baseline ${fmtPct(baseRate)}. ` +
        `Avg quality <b>${fmt1(avgQ)}</b>. Selection pressure building — watch bankruptcies.`;
    }
    infoEl.className = infoClass;
    infoEl.innerHTML = infoMsg;

    // difficulty buttons
    for (const d of diffs) {
      diffBtns[d].classList.toggle('dm-on', d === diff);
    }
    runBtn.textContent = running ? '⏸ pause' : '▶ run';
    runBtn.setAttribute('aria-pressed', String(running));
  }

  // ── loop ──────────────────────────────────────────────────────────────────────
  let timer: ReturnType<typeof setInterval> | null = null;

  function startLoop() {
    if (timer) return;
    timer = setInterval(() => {
      if (round < 300) { stepSim(); render(); }
      else setRunning(false);
    }, 700);
  }
  function stopLoop() { if (timer) { clearInterval(timer); timer = null; } }
  function setRunning(r: boolean) {
    running = r;
    if (r) startLoop(); else stopLoop();
    render();
  }

  function resetSim() {
    stopLoop();
    rand = mkRng(SEED);
    agents = initAgents(rand);
    round = 0;
    prevWinnerId = null;
    lastWinnerId = null;
    lastSuccess = false;
    ecoHist = [];
    running = false;
    render();
  }

  // ── handlers ─────────────────────────────────────────────────────────────────
  const onDiff = (d: Difficulty) => () => {
    diff = d; diffVal = DIFF_VAL[d];
    resetSim();
    setRunning(true);
  };
  const diffHandlers: Record<Difficulty, () => void> = {
    easy: onDiff('easy'), medium: onDiff('medium'), hard: onDiff('hard'),
  };
  for (const d of diffs) diffBtns[d].addEventListener('click', diffHandlers[d]);

  const onRun   = () => setRunning(!running);
  const onStep  = () => { setRunning(false); if (round < 300) { stepSim(); render(); } };
  const onReset = () => resetSim();
  runBtn.addEventListener('click', onRun);
  stepBtn.addEventListener('click', onStep);
  resetBtn.addEventListener('click', onReset);

  // keyboard: ← → to step
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setRunning(false);
      if (round < 300) { stepSim(); render(); }
    }
  };
  document.addEventListener('keydown', onKey);

  // ── init ──────────────────────────────────────────────────────────────────────
  diffBtns[diff].classList.add('dm-on');
  render();
  setRunning(true);

  return () => {
    stopLoop();
    layout.dispose();
    style.remove();
    for (const d of diffs) diffBtns[d].removeEventListener('click', diffHandlers[d]);
    runBtn.removeEventListener('click', onRun);
    stepBtn.removeEventListener('click', onStep);
    resetBtn.removeEventListener('click', onReset);
    document.removeEventListener('keydown', onKey);
  };
}
