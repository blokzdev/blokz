/**
 * Artifact: swarm-consensus — Swarm Consensus
 * Manifest: content/artifacts/swarm-consensus/manifest.json
 *
 * One hard question goes to a swarm of heterogeneous LLM nodes. Each node
 * *generates* an answer (generation is hard — only a minority land on the
 * correct one) and *evaluates* its peers' answers pairwise (evaluation is
 * easier than generation). Two aggregators run on the same round:
 *
 *   • Majority voting  — pick the answer the most nodes produced.
 *   • Peer ranking     — a reputation-weighted Bradley–Terry fit over the
 *                        pairwise preferences; pick the highest-quality answer.
 *
 * Because the correct answer is often a generated minority but a ranked
 * favourite, peer ranking recovers rounds majority voting loses. The live
 * scoreboard converges toward the gap Fortytwo measured on GPQA Diamond
 * (85.9% vs 68.7%). The "evaluation edge" slider is the crux: at zero,
 * evaluators are as unreliable as generators and ranking buys nothing;
 * widen it and peer ranking pulls ahead. Illustrative model — real measured
 * anchors live in ./data.json and render under the scoreboard.
 *
 * Pure DOM + inline SVG; no deps. Reduced motion handled by ArtifactMount.
 */
import data from '../../../content/artifacts/swarm-consensus/data.json';

const NS = 'http://www.w3.org/2000/svg';

// Four candidate answers. Index 0 is correct and has the highest latent
// quality; index 1 is a plausible distractor that attracts wrong generations.
const N_CAND = 4;
const LABELS = ['A', 'B', 'C', 'D'];
const QUALITY = [1.0, 0.58, 0.42, 0.32]; // latent quality used by evaluators
const COLORS = ['#22d3ee', '#f0883e', '#a78bfa', '#f472b6'];
const CORRECT = 0;
const DISTRACTOR_PULL = 0.5; // share of wrong generations that fall for the distractor

interface Node {
  c: number; // generation competence (probability of generating the correct answer)
  r: number; // reputation weight, evolves across rounds
}

interface Round {
  votes: number[]; // per candidate
  produced: number[]; // distinct candidate indices present this round
  pi: number[]; // Bradley–Terry consensus weight per candidate (0 if absent)
  majWinner: number;
  peerWinner: number;
}

const argmaxOf = (idx: number[], val: number[]): number => {
  let best = idx[0]!;
  let bestV = -Infinity;
  const ties: number[] = [];
  for (const i of idx) {
    if (val[i]! > bestV + 1e-9) {
      bestV = val[i]!;
      best = i;
      ties.length = 0;
      ties.push(i);
    } else if (Math.abs(val[i]! - bestV) <= 1e-9) {
      ties.push(i);
    }
  }
  return ties.length > 1 ? ties[Math.floor(Math.random() * ties.length)]! : best;
};

export default function mount(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'sc-root';
  container.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .sc-root { position:absolute; inset:0; display:flex; flex-direction:column; gap:10px;
      padding:13px 15px; overflow-y:auto; background:#05070d;
      font:500 12px/1.4 'JetBrains Mono', monospace; color:#8d95ad; }
    .sc-head { display:flex; align-items:center; justify-content:space-between; gap:10px;
      flex-wrap:wrap; }
    .sc-legend { display:flex; flex-wrap:wrap; gap:5px 11px; }
    .sc-leg { display:flex; align-items:center; gap:5px; font-size:10px; letter-spacing:.02em;
      white-space:nowrap; }
    .sc-dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; box-shadow:0 0 6px currentColor; }
    .sc-q { color:#5b6378; }
    .sc-round { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378;
      white-space:nowrap; }
    .sc-round b { color:#e7eaf3; }

    .sc-main { display:grid; grid-template-columns:minmax(170px,1fr) minmax(0,1.25fr); gap:14px;
      flex:1 1 auto; min-height:0; align-items:stretch; }
    .sc-root.sc-narrow .sc-main { grid-template-columns:1fr; }
    .sc-stage { position:relative; min-height:150px; display:flex; align-items:center; justify-content:center; }
    .sc-stage svg { width:100%; height:100%; display:block; }
    .sc-node { transition:r .5s cubic-bezier(.22,1,.36,1), fill .35s, opacity .35s; }
    .sc-qmark { fill:#e7eaf3; font:600 17px 'JetBrains Mono', monospace; }
    .sc-qsub { fill:#5b6378; font:500 8.5px 'JetBrains Mono', monospace; letter-spacing:.12em; }
    .sc-ring { fill:none; stroke:rgba(124,140,255,.10); }
    @media (prefers-reduced-motion: no-preference) {
      .sc-think .sc-node { animation:sc-pulse 1s ease-in-out infinite; }
    }
    @keyframes sc-pulse { 0%,100%{ opacity:.5 } 50%{ opacity:1 } }

    .sc-tally { display:flex; flex-direction:column; gap:7px; justify-content:center; min-width:0; }
    .sc-tr { display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; min-width:0; }
    .sc-tr-name { display:flex; align-items:center; gap:6px; font-size:11px; color:#cdd3e3;
      white-space:nowrap; }
    .sc-tr-name .sc-tick { color:#22d3ee; font-size:10px; }
    .sc-bars { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .sc-bar { position:relative; height:9px; border-radius:5px; background:#0a0f1c;
      box-shadow:inset 0 0 0 1px rgba(124,140,255,.08); overflow:hidden; }
    .sc-bar i { position:absolute; inset:0 auto 0 0; width:0; border-radius:5px;
      transition:width .55s cubic-bezier(.22,1,.36,1); display:block; }
    .sc-bar.sc-vote i { background:linear-gradient(90deg,rgba(141,149,173,.5),#8d95ad); }
    .sc-blab { position:absolute; right:5px; top:50%; transform:translateY(-50%);
      font-size:7.5px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .sc-chips { display:flex; flex-direction:column; gap:3px; align-items:flex-end; }
    .sc-chip { font:700 8px 'JetBrains Mono', monospace; letter-spacing:.08em; text-transform:uppercase;
      padding:2px 5px; border-radius:4px; white-space:nowrap; opacity:0; transition:opacity .3s; }
    .sc-chip.sc-on { opacity:1; }
    .sc-chip.sc-maj { color:#8d95ad; box-shadow:inset 0 0 0 1px rgba(141,149,173,.5); }
    .sc-chip.sc-peer { color:#22d3ee; box-shadow:inset 0 0 0 1px rgba(34,211,238,.55); }
    .sc-chip.sc-wrong { color:#f0883e; box-shadow:inset 0 0 0 1px rgba(240,136,62,.55); }

    .sc-foot { display:grid; grid-template-columns:auto 1fr; gap:12px 16px; align-items:end; }
    .sc-root.sc-narrow .sc-foot { grid-template-columns:1fr; }
    .sc-board { display:flex; gap:14px; align-items:stretch; }
    .sc-score { flex:1 1 0; border:1px solid rgba(124,140,255,.14); border-radius:10px; padding:8px 11px;
      background:#0d1322; min-width:96px; }
    .sc-score.sc-peer-card { box-shadow:inset 0 0 0 1px rgba(34,211,238,.22); }
    .sc-score .sc-stitle { font-size:9px; letter-spacing:.09em; text-transform:uppercase; color:#5b6378; }
    .sc-score .sc-pct { font:700 22px 'JetBrains Mono', monospace; line-height:1.1; font-variant-numeric:tabular-nums; }
    .sc-score.sc-peer-card .sc-pct { color:#22d3ee; }
    .sc-score.sc-maj-card .sc-pct { color:#cdd3e3; }
    .sc-score .sc-sub { font-size:9.5px; color:#5b6378; }
    .sc-controls { display:flex; flex-wrap:wrap; gap:9px 12px; align-items:end; justify-content:flex-end; }
    .sc-root.sc-narrow .sc-controls { justify-content:flex-start; }
    .sc-btn { border:1px solid rgba(34,211,238,.4); border-radius:8px; cursor:pointer;
      background:rgba(34,211,238,.08); color:#22d3ee; font:600 11px 'JetBrains Mono', monospace;
      letter-spacing:.05em; padding:7px 13px; white-space:nowrap; transition:.2s; }
    .sc-btn:hover, .sc-btn:focus-visible { background:rgba(34,211,238,.16); outline:none;
      box-shadow:0 0 12px rgba(34,211,238,.25); }
    .sc-btn.sc-ghost { border-color:rgba(124,140,255,.28); background:#0d1322; color:#8d95ad; }
    .sc-btn.sc-ghost:hover { color:#cdd3e3; box-shadow:none; border-color:rgba(124,140,255,.5); }
    .sc-btn:disabled { opacity:.45; cursor:default; box-shadow:none; }
    .sc-field { display:flex; flex-direction:column; gap:3px; min-width:118px; }
    .sc-field label { display:flex; justify-content:space-between; gap:8px; font-size:9.5px;
      letter-spacing:.05em; text-transform:uppercase; color:#5b6378; }
    .sc-field output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .sc-field input[type=range] { width:100%; cursor:pointer; accent-color:#22d3ee; margin:0; }
    .sc-ref { font-size:9.5px; color:#5b6378; line-height:1.5; letter-spacing:.01em; }
    .sc-ref a { color:#22d3ee; text-decoration:none; }
    .sc-ref a:hover { text-decoration:underline; }
    .sc-ref b { color:#cdd3e3; font-weight:600; }
  `;
  root.appendChild(style);

  /* ------------------------------------------------------------------ state */
  let N = 21;
  let evalEdge = 0.35;
  let nodes: Node[] = [];
  let round: Round | null = null;
  let majCorrect = 0;
  let peerCorrect = 0;
  let rounds = 0;
  let busy = false;

  const makeNodes = (n: number): Node[] =>
    Array.from({ length: n }, () => ({ c: 0.2 + 0.4 * Math.random(), r: 1 }));

  // Evaluation skill is the crux. evalEdge = 0 ⇒ evaluators are coin-flips
  // (0.5, no ranking signal); widening the edge lifts every node above chance,
  // a touch more for the more competent ones. This is the "evaluation is easier
  // than generation" premise made adjustable.
  const evalSkill = (c: number): number => Math.min(0.98, 0.5 + evalEdge * 0.5 * (0.5 + c));

  function simulate(): Round {
    const votes = new Array<number>(N_CAND).fill(0);
    const choice = new Array<number>(nodes.length);
    for (let k = 0; k < nodes.length; k++) {
      let a: number;
      if (Math.random() < nodes[k]!.c) a = CORRECT;
      else if (Math.random() < DISTRACTOR_PULL) a = 1;
      else a = Math.random() < 0.5 ? 2 : 3;
      choice[k] = a;
      votes[a]!++;
    }
    const produced: number[] = [];
    for (let a = 0; a < N_CAND; a++) if (votes[a]! > 0) produced.push(a);

    const pi = new Array<number>(N_CAND).fill(0);
    let peerWinner: number;
    const majWinner = argmaxOf(produced, votes);

    if (produced.length === 1) {
      pi[produced[0]!] = 1;
      peerWinner = produced[0]!;
    } else {
      // Weighted pairwise tournament. Each node compares every produced pair
      // and prefers the higher-quality answer with probability = its eval skill.
      const wins = new Array<number>(N_CAND).fill(0);
      const pc: number[][] = Array.from({ length: N_CAND }, () => new Array<number>(N_CAND).fill(0));
      for (let k = 0; k < nodes.length; k++) {
        const e = evalSkill(nodes[k]!.c);
        const w = nodes[k]!.r;
        for (let x = 0; x < produced.length; x++) {
          for (let y = x + 1; y < produced.length; y++) {
            const a = produced[x]!;
            const b = produced[y]!;
            const better = QUALITY[a]! >= QUALITY[b]! ? a : b;
            const worse = better === a ? b : a;
            const pref = Math.random() < e ? better : worse;
            wins[pref]! += w;
            pc[a]![b]! += w;
            pc[b]![a]! += w;
          }
        }
      }
      // Bradley–Terry via minorization–maximization (Zermelo iterations).
      for (const a of produced) pi[a] = 1;
      for (let iter = 0; iter < 30; iter++) {
        let sum = 0;
        const next = new Array<number>(N_CAND).fill(0);
        for (const a of produced) {
          let denom = 0;
          for (const b of produced) {
            if (b === a) continue;
            denom += pc[a]![b]! / (pi[a]! + pi[b]!);
          }
          next[a] = denom > 0 ? wins[a]! / denom : pi[a]!;
          sum += next[a]!;
        }
        if (sum > 0) for (const a of produced) pi[a] = next[a]! / sum;
      }
      peerWinner = argmaxOf(produced, pi);
    }

    // Reputation drifts toward evaluation skill — good evaluators earn weight.
    for (const nd of nodes) {
      const target = 0.6 + 0.9 * evalSkill(nd.c);
      nd.r = Math.max(0.5, Math.min(2, 0.9 * nd.r + 0.1 * target));
    }

    return { votes, produced, pi, majWinner, peerWinner };
  }

  /* ------------------------------------------------------------------ build DOM */
  // Header
  const head = document.createElement('div');
  head.className = 'sc-head';
  const legend = document.createElement('div');
  legend.className = 'sc-legend';
  for (let a = 0; a < N_CAND; a++) {
    const leg = document.createElement('span');
    leg.className = 'sc-leg';
    const dot = document.createElement('span');
    dot.className = 'sc-dot';
    dot.style.color = COLORS[a]!;
    dot.style.background = COLORS[a]!;
    const txt = document.createElement('span');
    txt.innerHTML =
      a === CORRECT
        ? `answer ${LABELS[a]} <span class="sc-q">✓ correct</span>`
        : a === 1
          ? `${LABELS[a]} <span class="sc-q">distractor</span>`
          : `${LABELS[a]}`;
    leg.append(dot, txt);
    legend.appendChild(leg);
  }
  const roundLbl = document.createElement('div');
  roundLbl.className = 'sc-round';
  head.append(legend, roundLbl);
  root.appendChild(head);

  // Main: swarm ring + tally
  const main = document.createElement('div');
  main.className = 'sc-main';
  const stage = document.createElement('div');
  stage.className = 'sc-stage';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 300');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  stage.appendChild(svg);
  const tally = document.createElement('div');
  tally.className = 'sc-tally';
  main.append(stage, tally);
  root.appendChild(main);

  const ringCircle = document.createElementNS(NS, 'circle');
  ringCircle.setAttribute('class', 'sc-ring');
  ringCircle.setAttribute('cx', '150');
  ringCircle.setAttribute('cy', '150');
  ringCircle.setAttribute('r', '108');
  svg.appendChild(ringCircle);
  const qmark = document.createElementNS(NS, 'text');
  qmark.setAttribute('class', 'sc-qmark');
  qmark.setAttribute('x', '150');
  qmark.setAttribute('y', '150');
  qmark.setAttribute('text-anchor', 'middle');
  qmark.setAttribute('dominant-baseline', 'middle');
  qmark.textContent = '?';
  const qsub = document.createElementNS(NS, 'text');
  qsub.setAttribute('class', 'sc-qsub');
  qsub.setAttribute('x', '150');
  qsub.setAttribute('y', '173');
  qsub.setAttribute('text-anchor', 'middle');
  qsub.textContent = 'ONE QUESTION';
  svg.append(qmark, qsub);

  let nodeEls: SVGCircleElement[] = [];
  function buildRing(): void {
    for (const el of nodeEls) el.remove();
    nodeEls = [];
    const cx = 150;
    const cy = 150;
    const R = 108;
    for (let i = 0; i < nodes.length; i++) {
      const ang = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', 'sc-node');
      el.setAttribute('cx', (cx + R * Math.cos(ang)).toFixed(1));
      el.setAttribute('cy', (cy + R * Math.sin(ang)).toFixed(1));
      el.setAttribute('r', '5');
      el.setAttribute('fill', '#1a2336');
      svg.appendChild(el);
      nodeEls.push(el);
    }
  }

  // Tally rows (one per candidate, hidden until produced)
  interface TallyRow {
    row: HTMLDivElement;
    voteFill: HTMLElement;
    voteLab: HTMLElement;
    piFill: HTMLElement;
    piLab: HTMLElement;
    majChip: HTMLElement;
    peerChip: HTMLElement;
  }
  const tallyRows: TallyRow[] = [];
  for (let a = 0; a < N_CAND; a++) {
    const row = document.createElement('div');
    row.className = 'sc-tr';
    const name = document.createElement('div');
    name.className = 'sc-tr-name';
    const dot = document.createElement('span');
    dot.className = 'sc-dot';
    dot.style.color = COLORS[a]!;
    dot.style.background = COLORS[a]!;
    const nm = document.createElement('span');
    nm.innerHTML = a === CORRECT ? `${LABELS[a]}<span class="sc-tick"> ✓</span>` : `${LABELS[a]}`;
    name.append(dot, nm);

    const bars = document.createElement('div');
    bars.className = 'sc-bars';
    const voteBar = document.createElement('div');
    voteBar.className = 'sc-bar sc-vote';
    const voteFill = document.createElement('i');
    const voteLab = document.createElement('span');
    voteLab.className = 'sc-blab';
    voteBar.append(voteFill, voteLab);
    const piBar = document.createElement('div');
    piBar.className = 'sc-bar';
    const piFill = document.createElement('i');
    piFill.style.background = `linear-gradient(90deg, ${COLORS[a]}55, ${COLORS[a]})`;
    const piLab = document.createElement('span');
    piLab.className = 'sc-blab';
    piBar.append(piFill, piLab);
    bars.append(voteBar, piBar);

    const chips = document.createElement('div');
    chips.className = 'sc-chips';
    const majChip = document.createElement('span');
    majChip.className = 'sc-chip sc-maj';
    majChip.textContent = 'majority';
    const peerChip = document.createElement('span');
    peerChip.className = 'sc-chip sc-peer';
    peerChip.textContent = 'peer rank';
    chips.append(majChip, peerChip);

    row.append(name, bars, chips);
    row.style.display = 'none';
    tally.appendChild(row);
    tallyRows.push({ row, voteFill, voteLab, piFill, piLab, majChip, peerChip });
  }

  // Footer: scoreboard + controls
  const foot = document.createElement('div');
  foot.className = 'sc-foot';
  const board = document.createElement('div');
  board.className = 'sc-board';
  const mkScore = (title: string, cls: string) => {
    const card = document.createElement('div');
    card.className = `sc-score ${cls}`;
    const t = document.createElement('div');
    t.className = 'sc-stitle';
    t.textContent = title;
    const pct = document.createElement('div');
    pct.className = 'sc-pct';
    pct.textContent = '—';
    const sub = document.createElement('div');
    sub.className = 'sc-sub';
    sub.textContent = '0 rounds';
    card.append(t, pct, sub);
    board.appendChild(card);
    return { pct, sub };
  };
  const peerScore = mkScore('peer ranking', 'sc-peer-card');
  const majScore = mkScore('majority vote', 'sc-maj-card');

  const controls = document.createElement('div');
  controls.className = 'sc-controls';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'sc-btn';
  runBtn.textContent = '▶ run round';
  const run25Btn = document.createElement('button');
  run25Btn.type = 'button';
  run25Btn.className = 'sc-btn sc-ghost';
  run25Btn.textContent = '⏩ run 50';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'sc-btn sc-ghost';
  resetBtn.textContent = '↺ reset';

  const mkField = (id: string, label: string) => {
    const field = document.createElement('div');
    field.className = 'sc-field';
    const lab = document.createElement('label');
    lab.htmlFor = id;
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    field.append(lab, input);
    controls.appendChild(field);
    return { input, out };
  };
  const sizeF = mkField('sc-size', 'swarm size');
  sizeF.input.min = '5';
  sizeF.input.max = '35';
  sizeF.input.step = '2';
  sizeF.input.value = String(N);
  const edgeF = mkField('sc-edge', 'evaluation edge');
  edgeF.input.min = '0';
  edgeF.input.max = '90';
  edgeF.input.step = '5';
  edgeF.input.value = String(Math.round(evalEdge * 100));
  controls.append(runBtn, run25Btn, resetBtn);

  foot.append(board, controls);
  root.appendChild(foot);

  const ref = document.createElement('div');
  ref.className = 'sc-ref';
  const h = data.headline;
  ref.innerHTML =
    `Real anchor — Fortytwo on <b>${h.benchmark}</b>: peer ranking <b>${h.swarmAccuracy}%</b> vs ` +
    `majority voting <b>${h.majorityAccuracy}%</b> across ${h.nodeCount} nodes ` +
    `(best single model ${h.bestSingleModel} ${h.bestSingleAccuracy}%). ` +
    `<a href="https://arxiv.org/abs/2510.24801" target="_blank" rel="noopener">arXiv:2510.24801 ↗</a>`;
  root.appendChild(ref);

  /* ------------------------------------------------------------------ render */
  function renderTally(animate: boolean): void {
    if (!round) return;
    const r = round;
    const maxVote = Math.max(...r.votes, 1);
    const maxPi = Math.max(...r.produced.map((a) => r.pi[a]!), 1e-6);
    for (let a = 0; a < N_CAND; a++) {
      const t = tallyRows[a]!;
      const present = r.produced.includes(a);
      t.row.style.display = present ? '' : 'none';
      if (!present) continue;
      const vFrac = r.votes[a]! / maxVote;
      const pFrac = r.pi[a]! / maxPi;
      const setW = () => {
        t.voteFill.style.width = `${(vFrac * 100).toFixed(1)}%`;
        t.piFill.style.width = `${(pFrac * 100).toFixed(1)}%`;
      };
      if (animate) requestAnimationFrame(setW);
      else setW();
      t.voteLab.textContent = `${r.votes[a]} ${r.votes[a] === 1 ? 'vote' : 'votes'}`;
      t.piLab.textContent = `${(r.pi[a]! * 100).toFixed(0)}%`;
      const majHere = a === r.majWinner;
      const peerHere = a === r.peerWinner;
      t.majChip.classList.toggle('sc-on', majHere);
      t.peerChip.classList.toggle('sc-on', peerHere);
      t.majChip.className = `sc-chip ${a === CORRECT ? 'sc-maj' : 'sc-wrong'}${majHere ? ' sc-on' : ''}`;
      t.peerChip.className = `sc-chip ${a === CORRECT ? 'sc-peer' : 'sc-wrong'}${peerHere ? ' sc-on' : ''}`;
    }
  }

  function colourRing(): void {
    if (!round) return;
    // Re-derive a per-node colouring consistent with the vote tally.
    const bag: number[] = [];
    for (let a = 0; a < N_CAND; a++) for (let k = 0; k < round.votes[a]!; k++) bag.push(a);
    for (let i = 0; i < nodeEls.length; i++) {
      const cand = bag[i] ?? CORRECT;
      const el = nodeEls[i]!;
      el.setAttribute('fill', COLORS[cand]!);
      el.setAttribute('r', (4 + nodes[i]!.r * 1.6).toFixed(1));
    }
  }

  function renderScore(): void {
    if (rounds === 0) {
      peerScore.pct.textContent = '—';
      majScore.pct.textContent = '—';
      peerScore.sub.textContent = majScore.sub.textContent = 'run a round';
      roundLbl.innerHTML = 'press <b>run round</b>';
      return;
    }
    const p = (peerCorrect / rounds) * 100;
    const m = (majCorrect / rounds) * 100;
    peerScore.pct.textContent = `${p.toFixed(0)}%`;
    majScore.pct.textContent = `${m.toFixed(0)}%`;
    peerScore.sub.textContent = `${peerCorrect}/${rounds} rounds correct`;
    const gap = p - m;
    majScore.sub.textContent = gap >= 0 ? `peer leads +${gap.toFixed(0)} pts` : `${gap.toFixed(0)} pts`;
    roundLbl.innerHTML = `round <b>${rounds}</b>`;
  }

  /* ------------------------------------------------------------------ run */
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  };
  const clearTimers = () => {
    timeouts.forEach((id) => clearTimeout(id));
    timeouts.clear();
  };

  function tally1(r: Round): void {
    rounds++;
    if (r.majWinner === CORRECT) majCorrect++;
    if (r.peerWinner === CORRECT) peerCorrect++;
  }

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function runAnimated(): void {
    if (busy) return;
    busy = true;
    runBtn.disabled = true;
    run25Btn.disabled = true;
    const r = simulate();
    // Phase 1: thinking.
    for (const el of nodeEls) {
      el.setAttribute('fill', '#1a2336');
      el.setAttribute('r', '5');
    }
    stage.classList.add('sc-think');
    const t1 = reduced ? 0 : 620;
    const t2 = reduced ? 0 : 520;
    later(() => {
      stage.classList.remove('sc-think');
      round = r;
      colourRing();
    }, t1);
    later(() => {
      tally1(r);
      renderTally(true);
      renderScore();
      busy = false;
      runBtn.disabled = false;
      run25Btn.disabled = false;
    }, t1 + t2);
  }

  function runBatch(n: number): void {
    if (busy) return;
    let last: Round | null = null;
    for (let i = 0; i < n; i++) {
      last = simulate();
      tally1(last);
    }
    round = last;
    colourRing();
    renderTally(false);
    renderScore();
  }

  function reset(): void {
    clearTimers();
    busy = false;
    runBtn.disabled = false;
    run25Btn.disabled = false;
    majCorrect = peerCorrect = rounds = 0;
    nodes = makeNodes(N);
    buildRing();
    round = null;
    for (const t of tallyRows) t.row.style.display = 'none';
    renderScore();
    sizeF.out.textContent = `${N} nodes`;
    edgeF.out.textContent = `${Math.round(evalEdge * 100)}%`;
  }

  /* ------------------------------------------------------------------ events */
  const onRun = () => runAnimated();
  const onRun25 = () => runBatch(50);
  const onReset = () => reset();
  runBtn.addEventListener('click', onRun);
  run25Btn.addEventListener('click', onRun25);
  resetBtn.addEventListener('click', onReset);

  const onSize = () => {
    N = Number(sizeF.input.value);
    reset();
  };
  const onEdge = () => {
    evalEdge = Number(edgeF.input.value) / 100;
    edgeF.out.textContent = `${Math.round(evalEdge * 100)}%`;
    // Keep the swarm + scoreboard; the edge changes future rounds' dynamics.
  };
  sizeF.input.addEventListener('input', onSize);
  edgeF.input.addEventListener('input', onEdge);

  const ro = new ResizeObserver(([entry]) => {
    root.classList.toggle('sc-narrow', (entry?.contentRect.width ?? 700) < 560);
  });
  ro.observe(container);

  reset();
  // Seed a first round so the stage isn't empty on arrival.
  later(() => runAnimated(), reduced ? 0 : 260);

  return () => {
    clearTimers();
    ro.disconnect();
    runBtn.removeEventListener('click', onRun);
    run25Btn.removeEventListener('click', onRun25);
    resetBtn.removeEventListener('click', onReset);
    sizeF.input.removeEventListener('input', onSize);
    edgeF.input.removeEventListener('input', onEdge);
    style.remove();
    root.remove();
  };
}
