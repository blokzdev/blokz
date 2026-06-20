/**
 * Artifact: the-draft-verify-loop — The Draft-Verify Loop
 * Manifest: content/artifacts/the-draft-verify-loop/manifest.json
 *
 * Speculative decoding, one round at a time. A cheap drafter q proposes γ
 * tokens; the target p verifies them in a single parallel pass and accepts the
 * longest prefix consistent with its own distribution, then emits one extra
 * token (the correction, or — if every draft token was accepted — a free bonus
 * sample). So every round emits (accepted prefix length) + 1 tokens for the
 * price of one target forward pass plus γ cheap draft passes.
 *
 * The per-position acceptance is modelled as Bernoulli(α), the assumption
 * behind Leviathan et al.'s closed form. The empirical mean accepted length
 * converges to
 *
 *     Ω(α, γ) = (1 − α^(γ+1)) / (1 − α)        tokens per target pass
 *
 * and the walltime speedup over plain autoregressive decoding is
 *
 *     S = Ω / (1 + γc),   c = cost(draft token) / cost(target pass).
 *
 * The point of the piece: S peaks at a finite γ and then *fades* — more
 * speculation is wasted draft compute once acceptance can't keep up — and a
 * weak drafter (low α) collapses S toward 1 no matter how you tune it.
 *
 * Layout: shared responsive primitive (stage SVG round + throughput bars ·
 * panel readouts + S(γ) sparkline · footer presets/sliders/buttons · caption).
 */
import data from '../../../content/artifacts/the-draft-verify-loop/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG = 'http://www.w3.org/2000/svg';
const VB_W = 400,
  VB_H = 225;
const X0 = 14,
  X1 = 386;

const C = {
  accept: '#22d3ee',
  bonus: '#8b5cf6',
  reject: '#f0883e',
  text: '#e7eaf3',
  muted: '#8d95ad',
  faint: '#5b6378',
  accent: '#5b8cff',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const omega = (a: number, g: number) =>
  a >= 1 ? g + 1 : (1 - Math.pow(a, g + 1)) / (1 - a);
const speedup = (a: number, g: number, c: number) => omega(a, g) / (1 + g * c);

interface State {
  alpha: number;
  gamma: number;
  c: number;
  presetId: string | null;
  running: boolean;
  rounds: number;
  emitted: number; // cumulative emitted tokens
  accepted: number; // accepted prefix length this round (0..γ)
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '16/9',
    stageFr: '1.55fr',
  });
  const { stage, panel, controls: ctrl, caption } = layout;
  stage.classList.add('dv-stage');
  panel.classList.add('dv-panel');
  ctrl.classList.add('dv-inputs');

  const style = document.createElement('style');
  style.textContent = `
    .dv-stage { min-width:0; position:relative; }
    .dv-svg { width:100%; height:100%; display:block; touch-action:pan-y;
      font-family:'JetBrains Mono', monospace; }
    .dv-svg text { fill:${C.muted}; }
    .dv-cell { transition:fill .35s ease, opacity .35s ease; }
    .dv-panel { display:flex; flex-direction:column; gap:11px; min-width:0;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:${C.muted}; }
    .dv-cards { --afl-card:108px; }
    .dv-card { border:1px solid rgba(124,140,255,.14); border-radius:11px; background:#0d1322;
      padding:9px 11px; display:flex; flex-direction:column; gap:3px; min-width:0; }
    .dv-card .dv-k { font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:${C.faint}; }
    .dv-card .dv-v { font-size:17px; color:${C.text}; font-variant-numeric:tabular-nums; line-height:1.1; }
    .dv-card .dv-v small { font-size:10px; color:${C.muted}; }
    .dv-card.dv-hi { border-color:rgba(34,211,238,.5); box-shadow:0 0 14px rgba(34,211,238,.14); }
    .dv-card.dv-hi .dv-v { color:${C.accept}; }
    .dv-verdict { font-size:11px; line-height:1.5; color:#9aa2b8; border-top:1px solid rgba(124,140,255,.12);
      padding-top:9px; min-width:0; }
    .dv-verdict b { color:${C.text}; font-variant-numeric:tabular-nums; }
    .dv-verdict.dv-win b { color:${C.accept}; }
    .dv-verdict.dv-lose b { color:${C.reject}; }
    .dv-spark { width:100%; height:auto; display:block; }
    .dv-spark text { fill:${C.faint}; }
    .dv-inputs { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .dv-presets { display:flex; flex-wrap:wrap; gap:8px; min-width:0; max-width:100%; }
    .dv-preset { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:#0d1322; color:${C.accept}; font:600 10px 'JetBrains Mono', monospace;
      letter-spacing:.04em; padding:7px 10px; white-space:nowrap; }
    .dv-preset:hover, .dv-preset:focus-visible { border-color:${C.accent}; outline:none; }
    .dv-preset.dv-on { background:rgba(91,140,255,.14); box-shadow:0 0 12px rgba(91,140,255,.25);
      border-color:${C.accent}; }
    .dv-row { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:end; min-width:0; }
    .dv-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));
      gap:9px 16px; align-items:end; min-width:0; max-width:100%; flex:1 1 240px; }
    .dv-field { min-width:0; max-width:100%; }
    .dv-field label { display:flex; justify-content:space-between; gap:6px; min-width:0;
      font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:${C.faint}; }
    .dv-field output { color:${C.text}; font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .dv-field input[type=range] { width:100%; cursor:pointer; background:transparent; margin:4px 0 0;
      accent-color:${C.accent}; }
    .dv-btns { display:flex; gap:8px; flex-wrap:wrap; min-width:0; }
    .dv-btn { border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer; background:#0d1322;
      color:${C.text}; font:600 11px 'JetBrains Mono', monospace; letter-spacing:.04em; padding:8px 13px;
      white-space:nowrap; min-height:36px; }
    .dv-btn:hover, .dv-btn:focus-visible { border-color:${C.accent}; outline:none; }
    .dv-btn.dv-primary { color:${C.accept}; border-color:rgba(34,211,238,.4); }
    .dv-cap { font-size:9.5px; color:${C.faint}; letter-spacing:.02em; line-height:1.55; }
    .dv-cap b { color:${C.muted}; font-weight:600; }
  `;
  stage.appendChild(style);

  const state: State = {
    alpha: 0.72,
    gamma: 5,
    c: 0.05,
    presetId: 'eagle3',
    running: true,
    rounds: 0,
    emitted: 0,
    accepted: 0,
  };

  /* ---------- Stage SVG ---------- */
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'dv-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'A speculative-decoding round: draft tokens verified, a prefix accepted, throughput compared to autoregressive decoding.');
  const mk = (tag: string, attrs: Record<string, string | number> = {}, parent: Element = svg) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    parent.appendChild(el);
    return el;
  };

  // headers
  mk('text', { x: X0, y: 16, 'font-size': 9, 'font-weight': 700, fill: C.muted }).textContent =
    'DRAFTER q  →  γ proposed tokens';
  const roundLbl = mk('text', { x: X1, y: 16, 'font-size': 9, 'text-anchor': 'end', fill: C.faint });

  const STRIP_Y = 30,
    STRIP_H = 40;
  const stripLayer = mk('g');

  // verify verdict line
  const emitLbl = mk('text', { x: X0, y: 90, 'font-size': 10, fill: C.text });

  // throughput section
  mk('text', { x: X0, y: 118, 'font-size': 9, 'font-weight': 700, fill: C.muted }).textContent =
    'TOKENS EMITTED PER UNIT TARGET COMPUTE';
  const BAR_X = X0 + 96,
    BAR_W = X1 - (X0 + 96),
    BAR_H = 18;
  const arY = 130,
    sdY = 162;
  mk('text', { x: X0, y: arY + 13, 'font-size': 9, fill: C.faint }).textContent = 'autoregressive';
  mk('text', { x: X0, y: sdY + 13, 'font-size': 9, fill: C.accept }).textContent = 'speculative';
  // track backgrounds
  mk('rect', { x: BAR_X, y: arY, width: BAR_W, height: BAR_H, rx: 4, fill: 'rgba(124,140,255,.06)' });
  mk('rect', { x: BAR_X, y: sdY, width: BAR_W, height: BAR_H, rx: 4, fill: 'rgba(124,140,255,.06)' });
  const arBar = mk('rect', { x: BAR_X, y: arY, width: 0, height: BAR_H, rx: 4, fill: C.faint });
  const sdBar = mk('rect', { x: BAR_X, y: sdY, width: 0, height: BAR_H, rx: 4, fill: C.accept });
  const arBarLbl = mk('text', { y: arY + 13, 'font-size': 9, fill: C.text, 'text-anchor': 'start' });
  const sdBarLbl = mk('text', { y: sdY + 13, 'font-size': 10, fill: '#06281f', 'font-weight': 700, 'text-anchor': 'end' });
  // formula footnote inside stage
  mk('text', { x: X0, y: 206, 'font-size': 8, fill: C.faint }).textContent =
    'Ω = (1−αᵞ⁺¹)/(1−α)   ·   S = Ω/(1+γc)   ·   one target pass verifies all γ in parallel';

  stage.appendChild(svg);

  /* ---------- Panel ---------- */
  const cards = document.createElement('div');
  cards.className = 'afl-cards dv-cards';
  const mkCard = (hi = false) => {
    const c = document.createElement('div');
    c.className = `dv-card${hi ? ' dv-hi' : ''}`;
    c.innerHTML = `<span class="dv-k"></span><span class="dv-v"></span>`;
    return c;
  };
  const cOmega = mkCard();
  const cTau = mkCard();
  const cS = mkCard(true);
  cards.append(cOmega, cTau, cS);
  panel.appendChild(cards);

  const verdict = document.createElement('div');
  verdict.className = 'dv-verdict';
  panel.appendChild(verdict);

  // S(γ) sparkline
  const SP_W = 240,
    SP_H = 70;
  const spark = document.createElementNS(SVG, 'svg');
  spark.setAttribute('viewBox', `0 0 ${SP_W} ${SP_H}`);
  spark.setAttribute('class', 'dv-spark');
  spark.setAttribute('role', 'img');
  spark.setAttribute('aria-label', 'Speedup as a function of draft length γ, with the current γ and the optimum marked.');
  const sparkMk = (tag: string, attrs: Record<string, string | number> = {}) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    spark.appendChild(el);
    return el;
  };
  sparkMk('text', { x: 0, y: 9, 'font-size': 8.5 }).textContent = 'speedup S  vs  draft length γ';
  const sparkPath = sparkMk('polyline', { fill: 'none', stroke: C.accent, 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
  const sparkOpt = sparkMk('circle', { r: 2.6, fill: C.bonus });
  const sparkCur = sparkMk('circle', { r: 3.2, fill: C.accept, stroke: '#0a0f1b', 'stroke-width': 1 });
  const sparkOptLbl = sparkMk('text', { 'font-size': 8, fill: C.bonus, 'text-anchor': 'middle' });
  panel.appendChild(spark);

  /* ---------- Controls ---------- */
  const presetWrap = document.createElement('div');
  presetWrap.className = 'dv-presets';
  const presetBtns = new Map<string, HTMLButtonElement>();
  for (const p of data.presets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dv-preset';
    btn.textContent = `⬢ ${p.label}`;
    btn.title = p.note;
    presetWrap.appendChild(btn);
    presetBtns.set(p.id, btn);
  }
  ctrl.appendChild(presetWrap);

  const row = document.createElement('div');
  row.className = 'dv-row';
  const fields = document.createElement('div');
  fields.className = 'dv-fields';
  const sliders = new Map<string, HTMLInputElement>();
  const outs = new Map<string, HTMLOutputElement>();
  const defs = [
    { id: 'alpha', label: 'acceptance α', min: 30, max: 98, step: 1, init: state.alpha * 100 },
    { id: 'gamma', label: 'draft length γ', min: 1, max: 12, step: 1, init: state.gamma },
    { id: 'c', label: 'drafter cost c', min: 1, max: 40, step: 1, init: state.c * 100 },
  ] as const;
  for (const d of defs) {
    const field = document.createElement('div');
    field.className = 'dv-field';
    const label = document.createElement('label');
    label.htmlFor = `dv-${d.id}`;
    const name = document.createElement('span');
    name.textContent = d.label;
    const out = document.createElement('output');
    label.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `dv-${d.id}`;
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(d.init);
    input.setAttribute('aria-label', d.label);
    field.append(label, input);
    fields.appendChild(field);
    sliders.set(d.id, input);
    outs.set(d.id, out);
  }
  const btns = document.createElement('div');
  btns.className = 'dv-btns';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'dv-btn dv-primary';
  const stepBtn = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.className = 'dv-btn';
  stepBtn.textContent = 'step';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'dv-btn';
  resetBtn.textContent = 'reset';
  btns.append(runBtn, stepBtn, resetBtn);
  row.append(fields, btns);
  ctrl.appendChild(row);

  /* ---------- Caption ---------- */
  const cap = document.createElement('div');
  cap.className = 'dv-cap';
  const bm = data.benchmarks;
  cap.innerHTML =
    `Per-token acceptance modelled as Bernoulli(α) — the assumption behind Leviathan et al.'s closed form. ` +
    `Real drafters land at α ≈ <b>${bm.real_world_alpha}</b>, not the near-1.0 of theory; VIA-SD reports <b>${bm.viasd_over_nondrafting}</b> over non-drafting. ` +
    `Presets place α, γ, c at a representative operating point per setup. Drag the sliders or tab to them and use ← →.`;
  caption.appendChild(cap);

  /* ---------- Round simulation ---------- */
  function drawRound() {
    let acc = 0;
    for (let i = 0; i < state.gamma; i++) {
      if (Math.random() < state.alpha) acc++;
      else break;
    }
    state.accepted = acc;
    state.emitted += acc + 1; // accepted prefix + 1 correction/bonus token
    state.rounds += 1;
  }
  function resetStats() {
    state.rounds = 0;
    state.emitted = 0;
    state.accepted = 0;
  }

  /* ---------- Render ---------- */
  const fmt = (v: number, d = 2) => v.toFixed(d);

  function render() {
    const a = state.alpha,
      g = state.gamma,
      c = state.c;
    const Om = omega(a, g);
    const S = speedup(a, g, c);

    // round label
    roundLbl.textContent = `round ${state.rounds}`;

    // token strip — γ+1 cells (the extra holds the bonus when all accepted)
    while (stripLayer.firstChild) stripLayer.removeChild(stripLayer.firstChild);
    const cellsN = g + 1;
    const gap = cellsN > 8 ? 3 : 4;
    const cellW = (X1 - X0 - gap * (cellsN - 1)) / cellsN;
    const acc = state.accepted;
    for (let i = 0; i < cellsN; i++) {
      const x = X0 + i * (cellW + gap);
      let fill = 'rgba(124,140,255,.07)',
        stroke = 'rgba(124,140,255,.18)',
        op = '1',
        glyph = '';
      let glyphColor = C.faint;
      if (i < acc) {
        fill = 'rgba(34,211,238,.16)';
        stroke = C.accept;
        glyph = '✓';
        glyphColor = C.accept;
      } else if (i === acc) {
        // correction / bonus token always emitted by the target
        fill = 'rgba(139,92,246,.18)';
        stroke = C.bonus;
        glyph = acc === g ? '★' : '↻';
        glyphColor = C.bonus;
      } else {
        // drafted but discarded
        fill = 'rgba(240,136,62,.06)';
        stroke = 'rgba(240,136,62,.3)';
        op = '0.45';
        glyph = '✗';
        glyphColor = C.reject;
      }
      mk('rect', {
        x, y: STRIP_Y, width: Math.max(2, cellW), height: STRIP_H, rx: 4,
        fill, stroke, 'stroke-width': 1.4, opacity: op, class: 'dv-cell',
      }, stripLayer);
      if (cellW > 13) {
        mk('text', {
          x: x + cellW / 2, y: STRIP_Y + STRIP_H / 2 + 4, 'font-size': Math.min(13, cellW * 0.6),
          'text-anchor': 'middle', fill: glyphColor, opacity: op,
        }, stripLayer).textContent = glyph;
      }
    }

    // emit line
    emitLbl.innerHTML = '';
    emitLbl.textContent = `accepted ${acc} of ${g}  →  emit ${acc + 1} tokens, one target pass`;

    // throughput bars: scale so the speculative bar has room to grow/shrink
    const maxScale = Math.max(2.5, S * 1.15);
    const arW = (BAR_W * 1) / maxScale;
    const sdW = clamp((BAR_W * S) / maxScale, 2, BAR_W);
    arBar.setAttribute('width', String(arW));
    sdBar.setAttribute('width', String(sdW));
    arBarLbl.setAttribute('x', String(BAR_X + arW + 5));
    arBarLbl.textContent = '1.0×';
    sdBarLbl.setAttribute('x', String(BAR_X + sdW - 6));
    sdBarLbl.textContent = `${fmt(S)}×`;
    sdBar.setAttribute('fill', S >= 1.05 ? C.accept : C.reject);

    // panel cards
    (cOmega.querySelector('.dv-k') as HTMLElement).textContent = 'Ω theory';
    (cOmega.querySelector('.dv-v') as HTMLElement).innerHTML = `${fmt(Om)}<small> tok/pass</small>`;
    const tau = state.rounds ? state.emitted / state.rounds : 0;
    (cTau.querySelector('.dv-k') as HTMLElement).textContent = 'τ̄ measured';
    (cTau.querySelector('.dv-v') as HTMLElement).innerHTML =
      `${fmt(tau)}<small> · n=${state.rounds}</small>`;
    (cS.querySelector('.dv-k') as HTMLElement).textContent = 'speedup S';
    (cS.querySelector('.dv-v') as HTMLElement).innerHTML = `${fmt(S)}<small>×</small>`;

    // verdict
    const gOpt = bestGamma(a, c);
    let cls = 'dv-verdict',
      msg = '';
    if (S < 1.05) {
      cls += ' dv-lose';
      msg =
        `At α = <b>${fmt(a, 2)}</b> the drafter is too weak: speculation emits <b>${fmt(Om)}</b> tokens a pass but pays for ` +
        `<b>${g}</b> draft passes, so S = <b>${fmt(S)}×</b> — you'd do as well decoding straight.`;
    } else if (g > gOpt + 1) {
      msg =
        `Over-speculating: S peaks at γ = <b>${gOpt}</b> for this α and c. Past it, extra draft tokens are mostly ` +
        `rejected, so you burn drafter compute (the 1+γc term) for shrinking returns.`;
    } else {
      cls += ' dv-win';
      msg =
        `S = <b>${fmt(S)}×</b>: the target still runs <b>every</b> token it accepts — one parallel pass over all γ — ` +
        `so this is a throughput win, not a cheaper verifier. The drafter could be adversarial and the output is unchanged.`;
    }
    verdict.className = cls;
    verdict.innerHTML = msg;

    // sparkline S(γ') for γ'=1..12
    const gs: number[] = [];
    for (let gg = 1; gg <= 12; gg++) gs.push(gg);
    const Svals = gs.map((gg) => speedup(a, gg, c));
    const sMax = Math.max(...Svals, 1.2);
    const px = (gg: number) => 6 + ((gg - 1) / 11) * (SP_W - 12);
    const py = (s: number) =>
      clamp(SP_H - 6 - ((s - 1) / (sMax - 1 || 1)) * (SP_H - 22), 12, SP_H - 4);
    sparkPath.setAttribute('points', gs.map((gg, i) => `${fmt(px(gg), 1)},${fmt(py(Svals[i]), 1)}`).join(' '));
    sparkCur.setAttribute('cx', String(px(g)));
    sparkCur.setAttribute('cy', String(py(S)));
    sparkOpt.setAttribute('cx', String(px(gOpt)));
    sparkOpt.setAttribute('cy', String(py(speedup(a, gOpt, c))));
    sparkOptLbl.setAttribute('x', String(clamp(px(gOpt), 14, SP_W - 14)));
    sparkOptLbl.setAttribute('y', String(clamp(py(speedup(a, gOpt, c)) - 5, 14, SP_H - 2)));
    sparkOptLbl.textContent = `γ*=${gOpt}`;

    // outputs
    outs.get('alpha')!.textContent = fmt(a, 2);
    outs.get('gamma')!.textContent = String(g);
    outs.get('c')!.textContent = fmt(c, 2);

    runBtn.textContent = state.running ? '⏸ pause' : '▶ run';
    runBtn.setAttribute('aria-pressed', String(state.running));
  }

  function bestGamma(a: number, c: number): number {
    let best = 1,
      bestS = -1;
    for (let gg = 1; gg <= 12; gg++) {
      const s = speedup(a, gg, c);
      if (s > bestS) {
        bestS = s;
        best = gg;
      }
    }
    return best;
  }

  /* ---------- Loop ---------- */
  let timer: ReturnType<typeof setInterval> | null = null;
  function startLoop() {
    if (timer) return;
    timer = setInterval(() => {
      drawRound();
      render();
    }, 1150);
  }
  function stopLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function setRunning(r: boolean) {
    state.running = r;
    if (r) startLoop();
    else stopLoop();
    render();
  }

  /* ---------- Interaction ---------- */
  function clearPreset() {
    state.presetId = null;
    for (const b of presetBtns.values()) b.classList.remove('dv-on');
  }
  function onInput(this: HTMLInputElement) {
    const v = Number(this.value);
    if (this.id === 'dv-alpha') state.alpha = v / 100;
    else if (this.id === 'dv-gamma') state.gamma = v;
    else if (this.id === 'dv-c') state.c = v / 100;
    clearPreset();
    resetStats();
    render();
  }
  for (const s of sliders.values()) s.addEventListener('input', onInput);

  function applyPreset(id: string) {
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    state.alpha = p.alpha;
    state.gamma = p.gamma;
    state.c = p.c;
    state.presetId = id;
    sliders.get('alpha')!.value = String(Math.round(p.alpha * 100));
    sliders.get('gamma')!.value = String(p.gamma);
    sliders.get('c')!.value = String(Math.round(p.c * 100));
    for (const [pid, b] of presetBtns) b.classList.toggle('dv-on', pid === id);
    resetStats();
    render();
  }
  const presetHandlers = new Map<string, () => void>();
  for (const [id, b] of presetBtns) {
    const h = () => applyPreset(id);
    presetHandlers.set(id, h);
    b.addEventListener('click', h);
  }
  presetBtns.get('eagle3')?.classList.add('dv-on');

  const onRun = () => setRunning(!state.running);
  const onStep = () => {
    setRunning(false);
    drawRound();
    render();
  };
  const onReset = () => {
    resetStats();
    render();
  };
  runBtn.addEventListener('click', onRun);
  stepBtn.addEventListener('click', onStep);
  resetBtn.addEventListener('click', onReset);

  // seed first round + start
  drawRound();
  render();
  setRunning(true);

  return () => {
    stopLoop();
    layout.dispose();
    for (const s of sliders.values()) s.removeEventListener('input', onInput);
    for (const [id, b] of presetBtns) {
      const h = presetHandlers.get(id);
      if (h) b.removeEventListener('click', h);
    }
    runBtn.removeEventListener('click', onRun);
    stepBtn.removeEventListener('click', onStep);
    resetBtn.removeEventListener('click', onReset);
    style.remove();
  };
}
