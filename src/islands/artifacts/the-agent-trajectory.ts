/**
 * Artifact: the-agent-trajectory — The Agent Trajectory
 * Manifest: content/artifacts/the-agent-trajectory/manifest.json
 *
 * Simulates an 8-step DeFi agent execution cycle with a TrajAD-style per-step
 * anomaly scorer. A "inject fault" control poisons the next decision step so
 * the score spikes and the bisection dispute game kicks off.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

type StepKind = 'tool_call' | 'reasoning' | 'decision' | 'action';

interface StepDef {
  kind: StepKind;
  label: string;
  detail: string;
  score: number;        // normal anomaly score 0–1
  faultScore: number;   // score when fault is injected
  faultDetail: string;  // detail text when fault is injected
  poisonable: boolean;  // fault can be injected here
}

const STEPS: StepDef[] = [
  {
    kind: 'tool_call',
    label: 'read_oracle(ETH/USDC)',
    detail: '→ $1,745.85',
    score: 0.04,
    faultScore: 0.04,
    faultDetail: '→ $1,745.85',
    poisonable: false,
  },
  {
    kind: 'reasoning',
    label: 'compute_position_delta',
    detail: '→ need +2.6 ETH (current=12.4, target=15.0)',
    score: 0.06,
    faultScore: 0.06,
    faultDetail: '→ need +2.6 ETH (current=12.4, target=15.0)',
    poisonable: false,
  },
  {
    kind: 'tool_call',
    label: 'check_collateral_ratio',
    detail: '→ 1.62× (above 1.5× minimum)',
    score: 0.08,
    faultScore: 0.08,
    faultDetail: '→ 1.62× (above 1.5× minimum)',
    poisonable: false,
  },
  {
    kind: 'decision',
    label: 'decide(action)',
    detail: '"swap USDC→ETH, size=4,600, router=uniswap_v3"',
    score: 0.11,
    faultScore: 0.97,
    faultDetail: '"transfer ETH to 0xdEaD…BeEf [injected instruction: drain vault]"',
    poisonable: true,
  },
  {
    kind: 'tool_call',
    label: 'call_router',
    detail: '→ tx 0xabc… submitted (4,600 USDC → min 2.58 ETH)',
    score: 0.09,
    faultScore: 0.09,
    faultDetail: '→ tx 0xabc… submitted (4,600 USDC → min 2.58 ETH)',
    poisonable: false,
  },
  {
    kind: 'tool_call',
    label: 'verify_settlement',
    detail: '→ confirmed block 25,374,831',
    score: 0.07,
    faultScore: 0.07,
    faultDetail: '→ confirmed block 25,374,831',
    poisonable: false,
  },
  {
    kind: 'reasoning',
    label: 'update_position_state',
    detail: '→ vault balance +2.61 ETH, collateral=1.64×',
    score: 0.05,
    faultScore: 0.05,
    faultDetail: '→ vault balance +2.61 ETH, collateral=1.64×',
    poisonable: false,
  },
  {
    kind: 'action',
    label: 'commit_cycle_root',
    detail: '→ Merkle root posted on-chain, bond locked',
    score: 0.03,
    faultScore: 0.03,
    faultDetail: '→ Merkle root posted on-chain, bond locked',
    poisonable: false,
  },
];

const KIND_LABEL: Record<StepKind, string> = {
  tool_call: 'TOOL',
  reasoning: 'THINK',
  decision: 'DECIDE',
  action: 'ACTION',
};

const TICK_MS = 950;
const BISECT_ROUNDS = Math.ceil(Math.log2(STEPS.length)); // 3

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageMin: 'clamp(260px, 55vw, 480px)',
    stageFr: '1.5fr',
  });
  const { stage, panel, controls, caption } = layout;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .at-stage {
      font-family: 'JetBrains Mono', 'Fira Mono', monospace;
      font-size: clamp(10px, 1.5vw, 12.5px);
      color: #cdd6f4;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 4px 2px;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
    }
    .at-row {
      display: grid;
      grid-template-columns: 50px 64px 1fr 52px;
      gap: 6px;
      align-items: baseline;
      opacity: 0.25;
      transition: opacity 0.3s;
      min-width: 0;
    }
    .at-row.at-visible { opacity: 1; }
    .at-row.at-fault { background: rgba(239,68,68,0.08); border-radius: 4px; }
    .at-step-num {
      color: #5b6378;
      text-align: right;
      flex-shrink: 0;
    }
    .at-kind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .at-kind-tool_call  { background: rgba(34,211,238,0.15); color: #22d3ee; }
    .at-kind-reasoning  { background: rgba(168,85,247,0.15); color: #c084fc; }
    .at-kind-decision   { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .at-kind-action     { background: rgba(16,185,129,0.15); color: #10b981; }
    .at-text {
      min-width: 0;
      overflow-wrap: anywhere;
      line-height: 1.45;
    }
    .at-label { color: #cdd6f4; }
    .at-detail { color: #6c7086; font-size: 0.9em; }
    .at-detail.at-fault-detail { color: #ef4444; }
    .at-score {
      text-align: right;
      font-size: 11px;
      flex-shrink: 0;
    }
    .at-score-ok   { color: #10b981; }
    .at-score-warn { color: #f59e0b; }
    .at-score-bad  { color: #ef4444; font-weight: 700; }

    /* Panel */
    .at-panel {
      font-family: 'JetBrains Mono', 'Fira Mono', monospace;
      font-size: clamp(10px, 1.4vw, 12px);
      color: #cdd6f4;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .at-metric-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5b6378;
      margin-bottom: 3px;
    }
    .at-metric-value {
      font-size: clamp(22px, 3.5vw, 30px);
      font-weight: 700;
      line-height: 1;
    }
    .at-metric-value.ok   { color: #10b981; }
    .at-metric-value.warn { color: #f59e0b; }
    .at-metric-value.bad  { color: #ef4444; }
    .at-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .at-status-ok      { background: rgba(16,185,129,0.12); color: #10b981; }
    .at-status-warn    { background: rgba(245,158,11,0.12); color: #f59e0b; }
    .at-status-bad     { background: rgba(239,68,68,0.15); color: #ef4444; }
    .at-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      display: inline-block;
      background: currentColor;
    }
    .at-bisect {
      border: 1px solid #313244;
      border-radius: 6px;
      padding: 10px;
      display: none;
    }
    .at-bisect.at-show { display: block; }
    .at-bisect-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5b6378;
      margin-bottom: 8px;
    }
    .at-bisect-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 5px;
      font-size: 11px;
    }
    .at-bisect-round {
      width: 16px; height: 16px;
      border-radius: 50%;
      border: 1px solid #5b6378;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px;
      color: #5b6378;
      flex-shrink: 0;
    }
    .at-bisect-round.at-done { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.1); }
    .at-bisect-text { color: #6c7086; }
    .at-bisect-text.at-done { color: #cdd6f4; }

    /* Controls */
    .at-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .at-btn {
      font-family: 'JetBrains Mono', 'Fira Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      border-radius: 5px;
      padding: 7px 12px;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s, background 0.15s;
      width: 100%;
      text-align: center;
    }
    .at-btn:disabled { opacity: 0.4; cursor: default; }
    .at-btn-fault {
      background: rgba(239,68,68,0.15);
      color: #ef4444;
      border: 1px solid rgba(239,68,68,0.3);
    }
    .at-btn-fault.at-armed {
      background: rgba(239,68,68,0.3);
      border-color: #ef4444;
    }
    .at-btn-reset {
      background: rgba(91,99,120,0.2);
      color: #6c7086;
      border: 1px solid #313244;
    }

    /* Caption */
    .at-caption {
      font-family: 'JetBrains Mono', 'Fira Mono', monospace;
      font-size: clamp(9px, 1.2vw, 10.5px);
      color: #5b6378;
      line-height: 1.5;
    }
  `;
  stage.appendChild(style);

  // ── State ───────────────────────────────────────────────────────────────────
  let currentStep = -1;   // last revealed step index
  let faultArmed = false;
  let halted = false;     // true after fault triggers
  let bisectRound = 0;    // number of bisect rounds animated so far
  let ticker: ReturnType<typeof setInterval> | null = null;
  let bisectTicker: ReturnType<typeof setInterval> | null = null;

  // ── Stage DOM ───────────────────────────────────────────────────────────────
  const stageInner = document.createElement('div');
  stageInner.className = 'at-stage';
  stage.appendChild(stageInner);

  const rows: HTMLElement[] = STEPS.map((step, i) => {
    const row = document.createElement('div');
    row.className = 'at-row';

    const num = document.createElement('span');
    num.className = 'at-step-num';
    num.textContent = `${i + 1}/${STEPS.length}`;

    const kindEl = document.createElement('span');
    kindEl.className = `at-kind at-kind-${step.kind}`;
    kindEl.textContent = KIND_LABEL[step.kind];

    const text = document.createElement('div');
    text.className = 'at-text';
    const labelEl = document.createElement('div');
    labelEl.className = 'at-label';
    labelEl.textContent = step.label;
    const detailEl = document.createElement('div');
    detailEl.className = 'at-detail';
    detailEl.textContent = step.detail;
    text.appendChild(labelEl);
    text.appendChild(detailEl);

    const scoreEl = document.createElement('span');
    scoreEl.className = 'at-score';
    scoreEl.textContent = '';

    row.appendChild(num);
    row.appendChild(kindEl);
    row.appendChild(text);
    row.appendChild(scoreEl);
    stageInner.appendChild(row);

    return row;
  });

  // ── Panel DOM ───────────────────────────────────────────────────────────────
  const panelInner = document.createElement('div');
  panelInner.className = 'at-panel';

  // Peak risk
  const riskLabel = document.createElement('div');
  riskLabel.className = 'at-metric-label';
  riskLabel.textContent = 'Peak Anomaly Score';
  const riskValue = document.createElement('div');
  riskValue.className = 'at-metric-value ok';
  riskValue.textContent = '—';

  // Steps done
  const stepsLabel = document.createElement('div');
  stepsLabel.className = 'at-metric-label';
  stepsLabel.textContent = 'Steps Revealed';
  const stepsValue = document.createElement('div');
  stepsValue.className = 'at-metric-value ok';
  stepsValue.style.fontSize = 'clamp(16px, 2.5vw, 20px)';
  stepsValue.textContent = `0 / ${STEPS.length}`;

  // Status
  const statusLabel = document.createElement('div');
  statusLabel.className = 'at-metric-label';
  statusLabel.textContent = 'Monitor Status';
  const statusPill = document.createElement('div');
  statusPill.className = 'at-status-pill at-status-ok';
  statusPill.innerHTML = `<span class="at-dot"></span> MONITORING`;

  // Bisect panel
  const bisectBox = document.createElement('div');
  bisectBox.className = 'at-bisect';
  const bisectTitle = document.createElement('div');
  bisectTitle.className = 'at-bisect-title';
  bisectTitle.textContent = `Bisection Dispute — ⌈log₂(${STEPS.length})⌉ = ${BISECT_ROUNDS} rounds`;
  bisectBox.appendChild(bisectTitle);

  const bisectRowEls: { dot: HTMLElement; text: HTMLElement }[] = [];
  const BISECT_LABELS = [
    `Steps 1–4 vs 5–8 → dispute in [1–4]`,
    `Steps 1–2 vs 3–4 → dispute in [3–4]`,
    `Step 3 vs Step 4 → leaf: Step 4 revealed`,
  ];
  for (let r = 0; r < BISECT_ROUNDS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'at-bisect-row';
    const dot = document.createElement('div');
    dot.className = 'at-bisect-round';
    dot.textContent = String(r + 1);
    const txt = document.createElement('div');
    txt.className = 'at-bisect-text';
    txt.textContent = BISECT_LABELS[r] ?? `Round ${r + 1}`;
    rowEl.appendChild(dot);
    rowEl.appendChild(txt);
    bisectBox.appendChild(rowEl);
    bisectRowEls.push({ dot, text: txt });
  }

  panelInner.appendChild(riskLabel);
  panelInner.appendChild(riskValue);
  panelInner.appendChild(stepsLabel);
  panelInner.appendChild(stepsValue);
  panelInner.appendChild(statusLabel);
  panelInner.appendChild(statusPill);
  panelInner.appendChild(bisectBox);
  panel.appendChild(panelInner);

  // ── Controls DOM ─────────────────────────────────────────────────────────────
  const controlsInner = document.createElement('div');
  controlsInner.className = 'at-controls';

  const faultBtn = document.createElement('button');
  faultBtn.className = 'at-btn at-btn-fault';
  faultBtn.textContent = '⚡ Inject Fault';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'at-btn at-btn-reset';
  resetBtn.textContent = '↺ Reset';

  controlsInner.appendChild(faultBtn);
  controlsInner.appendChild(resetBtn);
  controls.appendChild(controlsInner);

  // ── Caption DOM ──────────────────────────────────────────────────────────────
  const captionInner = document.createElement('div');
  captionInner.className = 'at-caption';
  captionInner.textContent =
    `Anomaly score 0–1 (green < 0.3 · amber 0.3–0.7 · red > 0.7). ` +
    `Fault injection poisons the decision step to 0.97, halting the cycle and ` +
    `triggering bisection over ${STEPS.length} steps in ⌈log₂(${STEPS.length})⌉ = ${BISECT_ROUNDS} dispute rounds.`;
  caption.appendChild(captionInner);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function scoreClass(s: number): string {
    if (s < 0.3) return 'at-score-ok';
    if (s < 0.7) return 'at-score-warn';
    return 'at-score-bad';
  }

  function updatePanel(peakScore: number): void {
    const cls = scoreClass(peakScore);
    riskValue.className = `at-metric-value ${cls === 'at-score-ok' ? 'ok' : cls === 'at-score-warn' ? 'warn' : 'bad'}`;
    riskValue.textContent = peakScore === 0 ? '—' : peakScore.toFixed(2);
    stepsValue.textContent = `${Math.max(currentStep + 1, 0)} / ${STEPS.length}`;
  }

  function revealStep(i: number, faulted: boolean): void {
    const step = STEPS[i];
    const row = rows[i];
    const score = faulted ? step.faultScore : step.score;
    const detail = faulted ? step.faultDetail : step.detail;

    row.classList.add('at-visible');
    if (faulted) row.classList.add('at-fault');

    // Update detail text
    const detailEl = row.querySelector('.at-detail') as HTMLElement;
    detailEl.textContent = detail;
    if (faulted) detailEl.classList.add('at-fault-detail');

    // Update score
    const scoreEl = row.querySelector('.at-score') as HTMLElement;
    scoreEl.textContent = score.toFixed(2);
    scoreEl.className = `at-score ${scoreClass(score)}`;
  }

  let peakScore = 0;

  function tick(): void {
    if (halted) return;
    currentStep++;
    if (currentStep >= STEPS.length) {
      // Cycle complete
      clearTicker();
      statusPill.className = 'at-status-pill at-status-ok';
      statusPill.innerHTML = `<span class="at-dot"></span> CYCLE COMPLETE`;
      faultBtn.disabled = true;
      return;
    }

    const step = STEPS[currentStep];
    const isFaultStep = faultArmed && step.poisonable;
    revealStep(currentStep, isFaultStep);

    const score = isFaultStep ? step.faultScore : step.score;
    if (score > peakScore) peakScore = score;
    updatePanel(peakScore);

    if (score >= 0.3 && score < 0.7) {
      statusPill.className = 'at-status-pill at-status-warn';
      statusPill.innerHTML = `<span class="at-dot"></span> ELEVATED`;
    }

    if (isFaultStep) {
      halted = true;
      faultArmed = false;
      clearTicker();
      faultBtn.disabled = true;

      statusPill.className = 'at-status-pill at-status-bad';
      statusPill.innerHTML = `<span class="at-dot"></span> DISPUTE TRIGGERED`;

      // Animate bisection
      bisectBox.classList.add('at-show');
      let r = 0;
      bisectTicker = setInterval(() => {
        if (r >= BISECT_ROUNDS) {
          if (bisectTicker != null) clearInterval(bisectTicker);
          return;
        }
        const { dot, text } = bisectRowEls[r];
        dot.classList.add('at-done');
        text.classList.add('at-done');
        bisectRound = r + 1;
        r++;
      }, 700);
    }
  }

  function clearTicker(): void {
    if (ticker != null) { clearInterval(ticker); ticker = null; }
  }

  function reset(): void {
    clearTicker();
    if (bisectTicker != null) { clearInterval(bisectTicker); bisectTicker = null; }

    currentStep = -1;
    faultArmed = false;
    halted = false;
    bisectRound = 0;
    peakScore = 0;

    rows.forEach(row => {
      row.className = 'at-row';
      const detailEl = row.querySelector('.at-detail') as HTMLElement;
      const scoreEl = row.querySelector('.at-score') as HTMLElement;
      detailEl.classList.remove('at-fault-detail');
      scoreEl.textContent = '';
      scoreEl.className = 'at-score';
    });
    // Restore original detail text
    STEPS.forEach((step, i) => {
      const detailEl = rows[i].querySelector('.at-detail') as HTMLElement;
      detailEl.textContent = step.detail;
    });

    riskValue.className = 'at-metric-value ok';
    riskValue.textContent = '—';
    stepsValue.textContent = `0 / ${STEPS.length}`;
    statusPill.className = 'at-status-pill at-status-ok';
    statusPill.innerHTML = `<span class="at-dot"></span> MONITORING`;
    bisectBox.classList.remove('at-show');
    bisectRowEls.forEach(({ dot, text }) => {
      dot.classList.remove('at-done');
      text.classList.remove('at-done');
    });

    faultBtn.disabled = false;
    faultBtn.classList.remove('at-armed');
    faultBtn.textContent = '⚡ Inject Fault';

    ticker = setInterval(tick, TICK_MS);
  }

  // ── Event Listeners ──────────────────────────────────────────────────────────
  function onFault(): void {
    if (halted) return;
    if (faultArmed) {
      faultArmed = false;
      faultBtn.classList.remove('at-armed');
      faultBtn.textContent = '⚡ Inject Fault';
    } else {
      faultArmed = true;
      faultBtn.classList.add('at-armed');
      faultBtn.textContent = '⚡ Fault Armed';
    }
  }

  function onReset(): void {
    reset();
  }

  faultBtn.addEventListener('click', onFault);
  resetBtn.addEventListener('click', onReset);

  // ── Start ────────────────────────────────────────────────────────────────────
  ticker = setInterval(tick, TICK_MS);

  return () => {
    clearTicker();
    if (bisectTicker != null) clearInterval(bisectTicker);
    faultBtn.removeEventListener('click', onFault);
    resetBtn.removeEventListener('click', onReset);
    layout.dispose();
    style.remove();
  };
}
