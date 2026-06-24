/**
 * Artifact: the-flash-loan-machine — The Flash Loan Machine
 * Manifest: content/artifacts/the-flash-loan-machine/manifest.json
 *
 * Interactive diagram of a flash loan execution flow. Three strategies
 * (triangular arb, collateral swap, self-liquidation) share the same
 * atomic callback structure. Tap a strategy chip to load its steps;
 * tap any step to read the actor, action, and constraint note in the panel.
 * The pre-planning step is highlighted in amber — it's the only place
 * the AI agent does its work; everything after is deterministic EVM execution.
 *
 * Layout via the shared primitive (wideTemplate:'rail').
 * Data: content/artifacts/the-flash-loan-machine/data.json
 */
import data from '../../../content/artifacts/the-flash-loan-machine/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Step {
  actor: string;
  action: string;
  constraint: boolean;
}
interface Strategy {
  id: string;
  label: string;
  icon: string;
  steps: Step[];
  profitFormula: string;
  aiConstraint: string;
}

const STRATEGIES = data.strategies as Strategy[];
const PROTOCOLS = data.protocols;

const NS = 'http://www.w3.org/2000/svg';

/* SVG viewBox constants */
const VB_W = 640;
const STEP_H = 44;
const STEP_GAP = 10;
const PAD_X = 16;
const PAD_Y = 12;
const ACTOR_W = 90;
const CONNECTOR_X = PAD_X + ACTOR_W + 14;
const BOX_X = CONNECTOR_X + 10;
const BOX_W = VB_W - BOX_X - PAD_X;

function stepsHeight(n: number): number {
  return PAD_Y * 2 + n * STEP_H + (n - 1) * STEP_GAP;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxCharsPerLine) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function mount(container: HTMLElement): () => void {
  let selStrategy = 0;
  let selStep = -1;

  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '640/380',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .flm-wrap { position:absolute; inset:0; overflow:hidden; }
    .flm-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .flm-bg { fill:#0d1322; }
    .flm-step-box { rx:7; stroke-width:1.2; }
    .flm-step-box.normal { fill:rgba(91,140,255,.07); stroke:rgba(91,140,255,.22); }
    .flm-step-box.plan   { fill:rgba(245,165,36,.10); stroke:rgba(245,165,36,.45); }
    .flm-step-box.active { fill:rgba(91,140,255,.18); stroke:rgba(91,140,255,.55); }
    .flm-step-box.plan.active { fill:rgba(245,165,36,.22); stroke:rgba(245,165,36,.80); }
    .flm-step-text { font:500 10.5px 'JetBrains Mono',monospace; fill:#c4cbde; }
    .flm-step-text.plan { fill:#f5d899; }
    .flm-step-text.active { fill:#e7eaf3; }
    .flm-actor { font:600 9.5px 'JetBrains Mono',monospace; fill:#5b8cff; }
    .flm-actor.plan { fill:#f5a524; }
    .flm-connector { stroke:rgba(91,140,255,.30); stroke-width:1; stroke-dasharray:4 3; }
    .flm-arrow { fill:rgba(91,140,255,.40); }
    .flm-arrow.plan { fill:rgba(245,165,36,.50); }
    .flm-step-num { font:700 9px 'JetBrains Mono',monospace; fill:#3d4a6e; }
    .flm-step-num.plan { fill:#a0700a; }
    .flm-step-num.active { fill:#8d95ad; }

    .flm-controls { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .flm-clab { font:600 9.5px/1 'JetBrains Mono',monospace; letter-spacing:.07em;
      text-transform:uppercase; color:#5b6378; }
    .flm-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .flm-chip { appearance:none; border:1px solid rgba(124,140,255,.18); border-radius:8px;
      background:transparent; color:#8d95ad; font:600 11px 'JetBrains Mono',monospace;
      padding:6px 10px; cursor:pointer; transition:color .15s,background .15s,border-color .15s; white-space:nowrap; }
    .flm-chip[aria-pressed="true"] { background:rgba(91,140,255,.16); color:#e7eaf3; border-color:rgba(91,140,255,.45); }
    .flm-chip:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }

    .flm-proto-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(0,1fr)); gap:6px; }
    .flm-proto { border:1px solid rgba(124,140,255,.14); border-radius:8px; padding:7px 9px;
      font:500 10.5px 'JetBrains Mono',monospace; color:#8d95ad; display:flex; flex-direction:column; gap:3px; min-width:0; }
    .flm-proto-name { color:#e7eaf3; font-weight:700; font-size:11px; }
    .flm-proto-fee  { color:#22d3ee; font-weight:700; }
    .flm-proto-fee.zero { color:#f5a524; }

    .flm-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11.5px 'JetBrains Mono',monospace; color:#8d95ad; }
    .flm-ph { color:#e7eaf3; font:700 13px 'JetBrains Mono',monospace; }
    .flm-pbadge { font:600 9.5px 'JetBrains Mono',monospace; padding:3px 8px; border-radius:6px;
      border:1px solid rgba(91,140,255,.4); background:rgba(91,140,255,.12); color:#aeb9ff; }
    .flm-pbadge.plan { border-color:rgba(245,165,36,.5); background:rgba(245,165,36,.10); color:#f5d899; }
    .flm-paction { font-size:11px; line-height:1.55; color:#c4cbde; overflow-wrap:anywhere; min-width:0; }
    .flm-pconstraint { padding:8px 10px; border-radius:8px; border:1px solid rgba(245,165,36,.3);
      background:rgba(245,165,36,.08); font-size:10.5px; line-height:1.5; color:#f5d899;
      overflow-wrap:anywhere; min-width:0; }
    .flm-pformula { padding:7px 10px; border-radius:8px; border:1px solid rgba(91,140,255,.18);
      background:rgba(91,140,255,.08); font:600 10px 'JetBrains Mono',monospace; color:#9ab0ff;
      overflow-wrap:anywhere; min-width:0; }
    .flm-phint { font-size:10px; color:#3d4a6e; line-height:1.5; }
    .flm-rule { height:1px; background:rgba(124,140,255,.12); }

    .flm-cap { font:500 9.5px/1.6 'JetBrains Mono',monospace; color:#5b6378; overflow-wrap:anywhere; min-width:0; }
    .flm-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ── Stage: SVG diagram ── */
  const wrap = document.createElement('div');
  wrap.className = 'flm-wrap';
  const svg = svgEl('svg', {
    role: 'group',
    'aria-label': 'Flash loan execution flow diagram',
    tabindex: '0',
  });
  const bgRect = svgEl('rect', { class: 'flm-bg', x: '0', y: '0', width: String(VB_W), height: '9999' });
  svg.appendChild(bgRect);
  const gSteps = svgEl('g');
  svg.appendChild(gSteps);
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  /* ── Controls ── */
  const ctrlDiv = document.createElement('div');
  ctrlDiv.className = 'flm-controls';

  const stratLab = document.createElement('div');
  stratLab.className = 'flm-clab';
  stratLab.textContent = 'strategy';

  const chips = document.createElement('div');
  chips.className = 'flm-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Flash loan strategy');

  const chipBtns = STRATEGIES.map((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flm-chip';
    btn.textContent = `${s.icon} ${s.label}`;
    btn.setAttribute('aria-pressed', String(i === 0));
    btn.addEventListener('click', () => { selStrategy = i; selStep = -1; render(); });
    chips.appendChild(btn);
    return btn;
  });

  const protoLab = document.createElement('div');
  protoLab.className = 'flm-clab';
  protoLab.textContent = 'flash loan fees by protocol';

  const protoGrid = document.createElement('div');
  protoGrid.className = 'flm-proto-grid';
  for (const p of PROTOCOLS) {
    const card = document.createElement('div');
    card.className = 'flm-proto';
    const name = document.createElement('div');
    name.className = 'flm-proto-name';
    name.textContent = p.label;
    const fee = document.createElement('div');
    fee.className = `flm-proto-fee${p.feeBps === 0 ? ' zero' : ''}`;
    fee.textContent = p.feeBps === 0 ? '0 bps (free)' : `${p.feeBps} bps (${p.feePct}%)`;
    const note = document.createElement('div');
    note.style.cssText = 'font-size:9px;color:#3d4a6e;overflow-wrap:anywhere;line-height:1.45;';
    note.textContent = p.feeNote;
    card.append(name, fee, note);
    protoGrid.appendChild(card);
  }

  ctrlDiv.append(stratLab, chips, protoLab, protoGrid);
  controlsSlot.appendChild(ctrlDiv);

  /* ── Panel ── */
  const panelDiv = document.createElement('div');
  panelDiv.className = 'flm-panel';
  panel.appendChild(panelDiv);

  /* ── Caption ── */
  const cap = document.createElement('div');
  cap.className = 'flm-cap';
  cap.innerHTML = `Tap a <b>strategy chip</b> to load its execution steps. Tap any <b>step</b> to inspect its actor and action. <b>Amber steps</b> happen off-chain before the transaction — that's where the AI agent does all its work. Everything after the flash loan call is deterministic EVM execution.`;
  caption.appendChild(cap);

  /* ── Rendering ── */
  function renderPanel() {
    panelDiv.innerHTML = '';
    const strat = STRATEGIES[selStrategy];

    if (selStep < 0) {
      const ph = document.createElement('div');
      ph.className = 'flm-ph';
      ph.textContent = strat.label;
      const hint = document.createElement('div');
      hint.className = 'flm-phint';
      hint.textContent = 'Tap any step in the diagram to inspect it.';
      const rule = document.createElement('div');
      rule.className = 'flm-rule';
      const formulaLab = document.createElement('div');
      formulaLab.className = 'flm-clab';
      formulaLab.style.marginTop = '2px';
      formulaLab.textContent = 'profit formula';
      const formula = document.createElement('div');
      formula.className = 'flm-pformula';
      formula.textContent = strat.profitFormula;
      const constraintLab = document.createElement('div');
      constraintLab.className = 'flm-clab';
      constraintLab.textContent = 'ai constraint';
      const constraintBox = document.createElement('div');
      constraintBox.className = 'flm-pconstraint';
      constraintBox.textContent = strat.aiConstraint;
      panelDiv.append(ph, hint, rule, formulaLab, formula, constraintLab, constraintBox);
    } else {
      const step = strat.steps[selStep];
      const isConstraint = step.constraint;
      const ph = document.createElement('div');
      ph.className = 'flm-ph';
      ph.textContent = `Step ${selStep + 1} of ${strat.steps.length}`;
      const badge = document.createElement('span');
      badge.className = `afl-pill flm-pbadge${isConstraint ? ' plan' : ''}`;
      badge.textContent = isConstraint ? '⬡ off-chain' : '⬡ on-chain';
      const actorLab = document.createElement('div');
      actorLab.className = 'flm-clab';
      actorLab.style.marginTop = '8px';
      actorLab.textContent = 'actor';
      const actorVal = document.createElement('div');
      actorVal.style.cssText = `color:${isConstraint ? '#f5a524' : '#5b8cff'};font-weight:700;font-size:12px;`;
      actorVal.textContent = step.actor;
      const actionLab = document.createElement('div');
      actionLab.className = 'flm-clab';
      actionLab.style.marginTop = '4px';
      actionLab.textContent = 'action';
      const actionVal = document.createElement('div');
      actionVal.className = 'flm-paction';
      actionVal.textContent = step.action;
      panelDiv.append(ph, badge, actorLab, actorVal, actionLab, actionVal);
      if (isConstraint) {
        const planNote = document.createElement('div');
        planNote.className = 'flm-pconstraint';
        planNote.style.marginTop = '8px';
        planNote.innerHTML = '<b>Pre-planning step.</b> This is where the AI agent reasons. The entire strategy — routes, amounts, fallback logic — must be encoded into calldata before flashLoan() is called. There is no opportunity to update the plan during execution.';
        panelDiv.appendChild(planNote);
      }
    }
  }

  function renderDiagram() {
    while (gSteps.firstChild) gSteps.removeChild(gSteps.firstChild);

    const strat = STRATEGIES[selStrategy];
    const n = strat.steps.length;
    const vbH = stepsHeight(n);

    svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
    bgRect.setAttribute('height', String(vbH));

    const connX = CONNECTOR_X;
    const lineX = connX + 4;

    // draw the vertical connector line
    const lineY0 = PAD_Y + STEP_H / 2;
    const lineY1 = PAD_Y + (n - 1) * (STEP_H + STEP_GAP) + STEP_H / 2;
    const vline = svgEl('line', {
      x1: String(lineX), y1: String(lineY0),
      x2: String(lineX), y2: String(lineY1),
      class: 'flm-connector',
    });
    gSteps.appendChild(vline);

    strat.steps.forEach((step, i) => {
      const y = PAD_Y + i * (STEP_H + STEP_GAP);
      const midY = y + STEP_H / 2;
      const isConstraint = step.constraint;
      const isActive = selStep === i;
      const boxCls = ['flm-step-box', isConstraint ? 'plan' : 'normal', isActive ? 'active' : ''].filter(Boolean).join(' ');
      const textCls = ['flm-step-text', isConstraint ? 'plan' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');
      const actorCls = ['flm-actor', isConstraint ? 'plan' : ''].filter(Boolean).join(' ');
      const numCls = ['flm-step-num', isConstraint ? 'plan' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');

      // step number circle
      const circ = svgEl('circle', {
        cx: String(lineX), cy: String(midY), r: '10',
        fill: isConstraint ? 'rgba(245,165,36,.14)' : 'rgba(91,140,255,.10)',
        stroke: isConstraint ? 'rgba(245,165,36,.45)' : 'rgba(91,140,255,.25)',
        'stroke-width': '1',
      });
      gSteps.appendChild(circ);

      const numText = svgEl('text', {
        x: String(lineX), y: String(midY + 4),
        class: numCls, 'text-anchor': 'middle',
      });
      numText.textContent = String(i + 1);
      gSteps.appendChild(numText);

      // horizontal arrow from connector to box
      const arrowY = midY;
      const arrowX1 = lineX + 10;
      const arrowX2 = BOX_X - 2;
      const arrow = svgEl('line', {
        x1: String(arrowX1), y1: String(arrowY),
        x2: String(arrowX2), y2: String(arrowY),
        class: `flm-connector${isConstraint ? ' plan' : ''}`,
      });
      gSteps.appendChild(arrow);
      // arrowhead
      const ah = svgEl('polygon', {
        points: `${BOX_X},${arrowY} ${BOX_X - 7},${arrowY - 4} ${BOX_X - 7},${arrowY + 4}`,
        class: `flm-arrow${isConstraint ? ' plan' : ''}`,
      });
      gSteps.appendChild(ah);

      // actor label (left column)
      const actorText = svgEl('text', {
        x: String(PAD_X), y: String(midY + 4),
        class: actorCls,
      });
      actorText.textContent = step.actor;
      gSteps.appendChild(actorText);

      // step box
      const box = svgEl('rect', {
        x: String(BOX_X), y: String(y + 3),
        width: String(BOX_W), height: String(STEP_H - 6),
        class: boxCls, rx: '7',
      });
      gSteps.appendChild(box);

      // text inside box (wrapped)
      const maxChars = Math.floor(BOX_W / 6.5);
      const lines = wrapText(step.action, maxChars);
      const lineH = 13;
      const totalH = lines.length * lineH;
      const startY = midY - totalH / 2 + lineH * 0.5;

      lines.forEach((line, li) => {
        const t = svgEl('text', {
          x: String(BOX_X + 10),
          y: String(startY + li * lineH),
          class: textCls,
        });
        t.textContent = line;
        gSteps.appendChild(t);
      });

      // hit target for clicking
      const hit = svgEl('rect', {
        x: String(BOX_X), y: String(y + 3),
        width: String(BOX_W), height: String(STEP_H - 6),
        fill: 'transparent', rx: '7',
        style: 'cursor:pointer;',
        tabindex: '0',
        role: 'button',
        'aria-label': `Step ${i + 1}: ${step.actor} — ${step.action.substring(0, 60)}`,
      });
      hit.addEventListener('click', () => {
        selStep = selStep === i ? -1 : i;
        render();
      });
      hit.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          selStep = selStep === i ? -1 : i;
          render();
          e.preventDefault();
        }
      });
      gSteps.appendChild(hit);
    });
  }

  function render() {
    chipBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === selStrategy)));
    renderDiagram();
    renderPanel();
  }

  render();

  return () => {
    layout.dispose();
    style.remove();
  };
}
