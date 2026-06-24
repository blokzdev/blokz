/**
 * Artifact: model-fingerprint-lifecycle — Model Fingerprint Lifecycle
 *
 * Interactive diagram of the five-step LLM fingerprint protocol:
 *   Embed → Commit → Register → Prove → Enforce
 *
 * Click any step to see its mechanics and attack-resistance in the panel.
 * Use the attack selector to see which steps are vulnerable (red) or
 * partial (amber) under fine-tuning, quantization, or model merging.
 *
 * Stage: SVG flow diagram (5 step nodes + arrows).
 * Panel: selected step detail + attack-resistance badges.
 * Controls: attack selector (None / Fine-tuning / Quantization / Merging).
 * Caption: primary sources.
 */
import data from '../../../content/artifacts/model-fingerprint-lifecycle/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

type Step   = typeof data.steps[number];
type Attack = typeof data.attacks[number];

const NS = 'http://www.w3.org/2000/svg';

/* ── Design tokens (mirror src/styles/global.css) ─────────────────────────── */
const C = {
  void:       '#05070d',
  panel:      '#0d1322',
  line:       'rgba(124,140,255,.18)',
  lineBright: 'rgba(124,140,255,.38)',
  text:       '#e7eaf3',
  muted:      '#8d95ad',
  faint:      '#4a5268',
  accent:     '#5b8cff',
  violet:     '#8b5cf6',
  cyan:       '#22d3ee',
  green:      '#22c55e',
  amber:      '#f59e0b',
  red:        '#ef4444',
};

const ATTACK_COLOR: Record<string, string> = {
  resistant: C.green,
  partial:   C.amber,
  vulnerable: C.red,
};

/* ── SVG helpers ───────────────────────────────────────────────────────────── */
function svgEl<T extends keyof SVGElementTagNameMap>(
  tag: T,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[T] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function buildFlowDiagram(
  svg: SVGSVGElement,
  selectedId: string | null,
  attackId: string,
  onStep: (id: string) => void,
): void {
  svg.innerHTML = '';

  const VW = 720, VH = 260;
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);

  /* Background */
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: VW, height: VH, fill: C.void }));

  /* Defs: arrowhead marker */
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: 'arrowhead', markerWidth: 8, markerHeight: 6,
    refX: 7, refY: 3, orient: 'auto',
  });
  const poly = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: C.faint });
  marker.appendChild(poly);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const N = data.steps.length;           // 5
  const BOX_W = 106, BOX_H = 92;
  const GAP = 34;
  const TOTAL = N * BOX_W + (N - 1) * GAP;
  const LEFT = (VW - TOTAL) / 2;        // horizontal centering
  const TOP  = (VH - BOX_H) / 2 - 8;   // a little above center (room for label below)
  const LABEL_Y = TOP + BOX_H + 22;
  const ICON_CY  = TOP + BOX_H * 0.38;
  const STEP_CY  = TOP + BOX_H * 0.70;

  data.steps.forEach((step, i) => {
    const x = LEFT + i * (BOX_W + GAP);
    const cx = x + BOX_W / 2;

    /* Arrow to next step */
    if (i < N - 1) {
      const ax0 = x + BOX_W + 3;
      const ax1 = x + BOX_W + GAP - 3;
      const ay  = TOP + BOX_H / 2;
      svg.appendChild(svgEl('line', {
        x1: ax0, y1: ay, x2: ax1, y2: ay,
        stroke: C.faint, 'stroke-width': 1.5,
        'marker-end': 'url(#arrowhead)',
      }));
    }

    /* Determine box border color based on attack + selection */
    const attackState = attackId !== 'none'
      ? (step.attacks as Record<string, string>)[attackId]
      : null;

    const borderColor = attackState
      ? ATTACK_COLOR[attackState]
      : (selectedId === step.id ? C.accent : C.line);

    const glowAlpha = (selectedId === step.id || attackState) ? 0.18 : 0;
    const glowColor = attackState
      ? ATTACK_COLOR[attackState]
      : C.accent;

    /* Glow filter (approximate via shadow rect) */
    if (glowAlpha > 0) {
      svg.appendChild(svgEl('rect', {
        x: x - 4, y: TOP - 4, width: BOX_W + 8, height: BOX_H + 8,
        rx: 14, ry: 14, fill: glowColor,
        opacity: glowAlpha, filter: 'blur(6px)',
      }));
    }

    /* Box fill */
    svg.appendChild(svgEl('rect', {
      x, y: TOP, width: BOX_W, height: BOX_H, rx: 10, ry: 10,
      fill: C.panel, stroke: borderColor, 'stroke-width': 1.5,
    }));

    /* Icon / symbol */
    const iconEl = svgEl('text', {
      x: cx, y: ICON_CY,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: selectedId === step.id ? C.accent : (attackState ? ATTACK_COLOR[attackState] : C.violet),
      'font-size': 18,
      'font-family': 'monospace',
      'font-weight': 700,
    });
    iconEl.textContent = step.icon;
    svg.appendChild(iconEl);

    /* Step label inside box */
    const stepEl = svgEl('text', {
      x: cx, y: STEP_CY,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: C.muted,
      'font-size': 10,
      'font-family': 'monospace',
      'letter-spacing': 1.5,
    });
    stepEl.textContent = step.label.toUpperCase();
    svg.appendChild(stepEl);

    /* Label below box */
    if (step.gasUnits) {
      const gEl = svgEl('text', {
        x: cx, y: LABEL_Y,
        'text-anchor': 'middle',
        fill: C.faint,
        'font-size': 9.5,
        'font-family': 'monospace',
      });
      gEl.textContent = `${(step.gasUnits / 1000).toFixed(0)}k gas`;
      svg.appendChild(gEl);
    }

    /* Invisible click target */
    const hit = svgEl('rect', {
      x, y: TOP - 10, width: BOX_W, height: BOX_H + 20,
      fill: 'transparent', cursor: 'pointer',
    });
    hit.addEventListener('click', () => onStep(step.id));
    svg.appendChild(hit);
  });

  /* Title row at top */
  const titleEl = svgEl('text', {
    x: VW / 2, y: 16,
    'text-anchor': 'middle',
    fill: C.faint, 'font-size': 10,
    'font-family': 'monospace',
    'letter-spacing': 1.5,
  });
  titleEl.textContent = 'MODEL FINGERPRINT LIFECYCLE  ·  CLICK A STEP TO EXPLORE';
  svg.appendChild(titleEl);
}

/* ── Panel ────────────────────────────────────────────────────────────────── */
function renderPanel(
  panel: HTMLElement,
  step: Step | null,
  attackId: string,
  attacks: typeof data.attacks,
): void {
  panel.innerHTML = '';

  const attack = attacks.find(a => a.id === attackId) ?? attacks[0];

  if (!step) {
    /* Default state */
    const empty = document.createElement('div');
    empty.className = 'mfl-empty';
    empty.innerHTML = `
      <p class="mfl-empty-hint">← Click any step to see mechanics &amp; attack resistance</p>
      ${attackId !== 'none' ? `<div class="mfl-attack-desc">${attack.description}</div>` : ''}
    `;
    panel.appendChild(empty);
    return;
  }

  const attackState = attackId !== 'none'
    ? (step.attacks as Record<string, string>)[attackId]
    : null;

  const badge = (key: string, label: string) => {
    const state = (step.attacks as Record<string, string>)[key];
    const color = ATTACK_COLOR[state] ?? C.muted;
    return `<span class="mfl-badge" style="--bc:${color}">${label}: ${state}</span>`;
  };

  const div = document.createElement('div');
  div.className = 'mfl-detail';
  div.innerHTML = `
    <h3 class="mfl-title">${step.title}</h3>
    <p class="mfl-text">${step.detail}</p>
    <div class="mfl-stat">${step.stat}</div>
    <div class="mfl-badges">
      ${badge('finetune', 'Fine-tune')}
      ${badge('quantize', 'Quantize')}
      ${badge('merge', 'Merge')}
    </div>
    ${attackState && attackId !== 'none' ? `
      <div class="mfl-attack-note" style="--ac:${ATTACK_COLOR[attackState]}">
        <span class="mfl-attack-label">${attack.label}: </span>${attack.description}
      </div>` : ''}
  `;
  panel.appendChild(div);
}

/* ── Main mount ────────────────────────────────────────────────────────────── */
export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '720/260',
  });
  const { stage, panel, controls, caption } = layout;

  /* ── State ── */
  let selectedId: string | null = null;
  let attackId = 'none';

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .mfl-svg { width: 100%; height: 100%; display: block; cursor: default; }

    .mfl-empty { padding: 12px 4px; }
    .mfl-empty-hint {
      color: ${C.muted}; font-size: .82rem; font-style: italic;
      line-height: 1.5; margin: 0 0 10px;
    }

    .mfl-detail { display: flex; flex-direction: column; gap: 10px; padding: 4px; }
    .mfl-title { font-size: .95rem; font-weight: 600; color: ${C.text}; margin: 0; }
    .mfl-text  { font-size: .80rem; color: ${C.muted}; line-height: 1.55; margin: 0; }
    .mfl-stat  { font-family: monospace; font-size: .75rem; color: ${C.cyan};
                 background: rgba(34,211,238,.07); border: 1px solid rgba(34,211,238,.18);
                 border-radius: 6px; padding: 5px 8px; }
    .mfl-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .mfl-badge {
      font-family: monospace; font-size: .70rem; padding: 3px 8px;
      border-radius: 99px; border: 1px solid var(--bc);
      color: var(--bc); background: color-mix(in srgb, var(--bc) 12%, transparent);
      white-space: nowrap; flex: none;
    }
    .mfl-attack-note {
      font-size: .76rem; color: ${C.muted}; line-height: 1.5;
      border-left: 2px solid var(--ac); padding-left: 8px;
    }
    .mfl-attack-label { color: var(--ac); font-weight: 600; }
    .mfl-attack-desc {
      font-size: .80rem; color: ${C.muted}; line-height: 1.5;
      border-left: 2px solid ${C.amber}; padding-left: 8px;
      margin-top: 8px;
    }

    .mfl-controls { display: flex; flex-wrap: wrap; gap: 7px; }
    .mfl-ctl-label { font-size: .72rem; color: ${C.faint}; font-family: monospace;
                     letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px;
                     display: block; }
    .mfl-btn {
      font-family: monospace; font-size: .72rem; padding: 4px 11px;
      border-radius: 6px; cursor: pointer; border: 1px solid ${C.line};
      color: ${C.muted}; background: transparent; transition: border-color .15s, color .15s;
      white-space: nowrap; flex: none;
    }
    .mfl-btn:hover { border-color: ${C.lineBright}; color: ${C.text}; }
    .mfl-btn.is-active { border-color: var(--ab); color: var(--ab);
                         background: color-mix(in srgb, var(--ab) 10%, transparent); }
    .mfl-caption { font-size: .70rem; color: ${C.faint}; line-height: 1.5; }
  `;
  stage.appendChild(style);

  /* ── SVG stage ── */
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.className.baseVal = 'mfl-svg';
  stage.appendChild(svg);

  /* ── Controls ── */
  const ctrlLabel = document.createElement('span');
  ctrlLabel.className = 'mfl-ctl-label';
  ctrlLabel.textContent = 'Attack scenario';
  controls.appendChild(ctrlLabel);

  const btnsRow = document.createElement('div');
  btnsRow.className = 'mfl-controls';
  controls.appendChild(btnsRow);

  const ATTACK_COLORS: Record<string, string> = {
    none:     C.accent,
    finetune: C.amber,
    quantize: C.amber,
    merge:    C.red,
  };

  const attackBtns: HTMLButtonElement[] = [];
  data.attacks.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'mfl-btn' + (a.id === attackId ? ' is-active' : '');
    btn.textContent = a.label;
    btn.style.setProperty('--ab', ATTACK_COLORS[a.id] ?? C.accent);
    btn.addEventListener('click', () => {
      attackId = a.id;
      attackBtns.forEach((b, bi) => {
        const isActive = data.attacks[bi].id === a.id;
        b.classList.toggle('is-active', isActive);
      });
      redraw();
    });
    btnsRow.appendChild(btn);
    attackBtns.push(btn);
  });

  /* ── Caption ── */
  const cap = document.createElement('p');
  cap.className = 'mfl-caption';
  cap.innerHTML =
    'Sources: Nasery et al. 2025 (arXiv:2502.07760) · Xu et al. 2024 (arXiv:2409.08846) · Zhang et al. 2025 (arXiv:2507.20650) · Xu et al. 2025 (arXiv:2508.11548)';
  caption.appendChild(cap);

  /* ── Redraw ── */
  function onStepClick(id: string) {
    selectedId = selectedId === id ? null : id;
    redraw();
  }

  function redraw() {
    buildFlowDiagram(svg, selectedId, attackId, onStepClick);
    const step = selectedId ? data.steps.find(s => s.id === selectedId) ?? null : null;
    renderPanel(panel, step, attackId, data.attacks);
  }

  redraw();

  return () => {
    layout.dispose();
    style.remove();
  };
}
