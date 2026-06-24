/**
 * Artifact: the-draft-race — The Draft Race
 *
 * Canvas simulation showing autoregressive (AR) vs speculative decoding (SD)
 * token generation side-by-side. Tokens flow right-to-left; SD runs cycles of
 * K fast drafts + 1 slow verify, accepting α% and producing the speedup.
 *
 * Speedup formula: (1 - α^(K+1)) / ((1 - α) * (K*c + 1))
 * Source: Chen et al. 2023, arXiv:2302.01318
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: '3/2',
    stageFr: '1.5fr',
  });
  const { stage, panel, controls, caption } = layout;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .dr-wrap { position:absolute; inset:0; border-radius:12px;
      background:#0b1120; border:1px solid rgba(124,140,255,.12); overflow:hidden; }
    .dr-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }

    .dr-panel { display:flex; flex-direction:column; gap:10px; min-width:0;
      font:500 11.5px/1.5 'JetBrains Mono',monospace; color:#8d95ad; }
    .dr-title { font-size:10px; letter-spacing:.09em; text-transform:uppercase;
      color:#5b6378; margin-bottom:2px; }
    .dr-metric { display:flex; justify-content:space-between; gap:6px;
      min-width:0; align-items:baseline; }
    .dr-metric span { font-size:11px; }
    .dr-metric b { font-weight:700; color:#e7eaf3; font-variant-numeric:tabular-nums;
      white-space:nowrap; }
    .dr-metric b.cyan  { color:#22d3ee; }
    .dr-metric b.amber { color:#f59e0b; }
    .dr-metric b.red   { color:#f87171; }
    .dr-metric b.green { color:#5fd39b; }
    .dr-divider { border:none; border-top:1px solid rgba(124,140,255,.1); margin:2px 0; }
    .dr-formula { font-size:9.5px; line-height:1.65; color:#5b6378;
      padding:7px 9px; border-radius:7px; background:rgba(124,140,255,.06);
      min-width:0; overflow-wrap:anywhere; }
    .dr-formula b { color:#8d95ad; }

    .dr-controls { display:flex; flex-direction:column; gap:11px; min-width:0;
      font:500 11px/1.45 'JetBrains Mono',monospace; color:#8d95ad; }
    .dr-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .dr-field label { display:flex; justify-content:space-between; align-items:baseline;
      font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#5b6378; }
    .dr-field output { color:#e7eaf3; font-variant-numeric:tabular-nums; }
    .dr-field input[type=range] { width:100%; cursor:pointer; accent-color:#22d3ee; margin-top:2px; }

    .dr-cap { font:500 9px/1.6 'JetBrains Mono',monospace; color:#3f4d62; min-width:0;
      overflow-wrap:anywhere; }
    .dr-cap b { color:#5b6378; }
  `;
  stage.appendChild(style);

  // ── Canvas ────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'dr-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'dr-canvas';
  wrap.appendChild(canvas);
  stage.appendChild(wrap);
  const ctx = canvas.getContext('2d')!;

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'dr-panel';
  panel.appendChild(panelEl);

  // ── Controls ──────────────────────────────────────────────────────────────
  const ctrlEl = document.createElement('div');
  ctrlEl.className = 'dr-controls';
  controls.appendChild(ctrlEl);

  const mkSlider = (
    id: string, label: string, min: number, max: number,
    step: number, init: number, fmt: (v: number) => string
  ) => {
    const f = document.createElement('div');
    f.className = 'dr-field';
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    const nm = document.createElement('span'); nm.textContent = label;
    const out = document.createElement('output'); out.textContent = fmt(init);
    lbl.append(nm, out);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = id;
    inp.min = String(min); inp.max = String(max);
    inp.step = String(step); inp.value = String(init);
    inp.setAttribute('aria-label', label);
    f.append(lbl, inp);
    ctrlEl.appendChild(f);
    return { inp, out };
  };

  let alpha = 0.80;    // acceptance rate per token
  let K = 4;           // draft depth
  let costRatio = 0.10; // T_draft / T_verify

  const aCtrl = mkSlider('dr-alpha', 'α acceptance rate', 50, 97, 1, 80, v => `${v}%`);
  const kCtrl = mkSlider('dr-K', 'K draft depth', 1, 8, 1, 4, v => String(v));
  const cCtrl = mkSlider('dr-cost', 'c draft cost ratio', 5, 25, 1, 10, v => `${v}%`);

  // ── Caption ───────────────────────────────────────────────────────────────
  const cap = document.createElement('div');
  cap.className = 'dr-cap';
  cap.innerHTML = `<b>Formula:</b> E[tokens/cycle] = (1–α<sup>K+1</sup>)/(1–α). ` +
    `Speedup = E[tokens/cycle] / (K·c + 1). ` +
    `Source: Chen et al. 2023 (arXiv:2302.01318); acceptance rate ranges ` +
    `from Liu et al. 2026 (arXiv:2601.11580).`;
  caption.appendChild(cap);

  // ── Simulation state ──────────────────────────────────────────────────────
  // Token type: 'ar' | 'draft' | 'accepted' | 'rejected' | 'target'
  type TokenType = 'ar' | 'draft' | 'accepted' | 'rejected' | 'target';
  interface Token { x: number; type: TokenType }

  let arTokens: Token[] = [];
  let sdTokens: Token[] = [];

  let arCount = 0;
  let sdOutputCount = 0;

  // Timing (ms)
  const T_VERIFY = 1800; // animation speed for one verify pass
  let sdCycleStart = 0;
  let sdPhase: 'draft' | 'verify' | 'settle' = 'draft';
  let sdDraftEmitted = 0;
  let sdDraftSlots: Array<{ type: TokenType }> = [];
  let lastArToken = 0;

  let startTime = 0;
  let prevTime = 0;

  // ── Drawing helpers ───────────────────────────────────────────────────────
  const COLORS: Record<TokenType, string> = {
    ar:       '#5b84c4',
    draft:    '#7c3aed',
    accepted: '#22d3ee',
    rejected: '#1e2640',
    target:   '#f59e0b',
  };
  const BORDER: Partial<Record<TokenType, string>> = {
    rejected: '#374151',
    draft:    '#a78bfa',
  };

  function speedup(): number {
    // E[tokens/cycle] = (1 - α^(K+1)) / (1 - α)
    const a = alpha;
    const eTokens = a >= 1 ? K + 1 : (1 - Math.pow(a, K + 1)) / (1 - a);
    const cycleCost = K * costRatio + 1;
    return eTokens / cycleCost;
  }

  function eTokensPerCycle(): number {
    const a = alpha;
    return a >= 1 ? K + 1 : (1 - Math.pow(a, K + 1)) / (1 - a);
  }

  // Probabilistic token acceptance for a cycle
  function runAcceptance(slots: number): Array<TokenType> {
    const result: Array<TokenType> = [];
    for (let i = 0; i < slots; i++) {
      result.push(Math.random() < alpha ? 'accepted' : 'rejected');
    }
    // add target-generated token at the end (or at first rejection)
    const firstReject = result.indexOf('rejected');
    if (firstReject >= 0) {
      result.splice(firstReject + 1); // truncate after first rejection
      result.push('target');          // target generates 1 token at rejection point
    } else {
      result.push('target'); // K+1th token from target when all draft accepted
    }
    return result;
  }

  function draw(time: number) {
    const W = canvas.width / devicePixelRatio;
    const H = canvas.height / devicePixelRatio;
    const dpr = devicePixelRatio;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, W, H);

    const LANE_H = Math.max(32, Math.min(56, H * 0.22));
    const TOKEN_H = Math.max(16, Math.min(28, LANE_H * 0.55));
    const TOKEN_W = Math.max(14, Math.min(24, TOKEN_H * 1.1));
    const TOKEN_GAP = 3;
    const PERIOD = TOKEN_W + TOKEN_GAP;
    const LABEL_W = 78;
    const LANE_W = W - LABEL_W - 12;
    const LANE_Y1 = H * 0.20; // center of AR lane
    const LANE_Y2 = H * 0.62; // center of SD lane
    const TOKEN_Y = TOKEN_H / 2;

    // Token x positions are in "token units" from the right edge
    // x=0 is the rightmost position, x increases as token ages
    const VISIBLE_TOKENS = Math.ceil(LANE_W / PERIOD) + 2;

    // Time management
    const elapsed = time - startTime;
    const dt = time - prevTime;
    prevTime = time;

    // Advance token x positions (move left over time)
    const T_VERIFY_REAL = T_VERIFY;
    const speed = PERIOD / T_VERIFY_REAL; // px per ms

    // ── AR logic ──────────────────────────────────────────────────────────
    // New token every T_VERIFY
    if (elapsed - lastArToken >= T_VERIFY_REAL) {
      arTokens.push({ x: 0, type: 'ar' });
      arCount++;
      lastArToken = elapsed;
    }

    // Move AR tokens
    for (const t of arTokens) t.x += speed * dt;
    arTokens = arTokens.filter(t => t.x < VISIBLE_TOKENS * PERIOD + PERIOD);

    // ── SD logic ──────────────────────────────────────────────────────────
    const T_DRAFT = T_VERIFY_REAL * costRatio;
    const CYCLE_TIME = K * T_DRAFT + T_VERIFY_REAL;
    const phaseElapsed = elapsed - sdCycleStart;

    if (sdPhase === 'draft') {
      // Emit K draft tokens over K * T_DRAFT ms
      const draftsDue = Math.min(K, Math.floor(phaseElapsed / T_DRAFT));
      while (sdDraftEmitted < draftsDue) {
        sdTokens.push({ x: 0, type: 'draft' });
        sdDraftEmitted++;
      }
      if (sdDraftEmitted >= K) {
        sdPhase = 'verify';
      }
    } else if (sdPhase === 'verify') {
      if (phaseElapsed >= K * T_DRAFT + T_VERIFY_REAL) {
        // Settle: replace draft tokens with accepted/rejected/target
        const results = runAcceptance(K);
        sdDraftSlots = results.map(r => ({ type: r }));

        // Replace the K most recent draft tokens in sdTokens
        const drafts = sdTokens.filter(t => t.type === 'draft').slice(-K);
        let ri = 0;
        for (const t of sdTokens) {
          if (t.type === 'draft' && drafts.includes(t) && ri < results.length) {
            t.type = results[ri++];
          }
        }
        // Add target token (always happens)
        if (ri < results.length) {
          sdTokens.push({ x: 0, type: results[ri] });
        }

        // Count output tokens (accepted + target)
        sdOutputCount += results.filter(r => r === 'accepted' || r === 'target').length;

        // Start new cycle
        sdCycleStart += CYCLE_TIME;
        sdPhase = 'draft';
        sdDraftEmitted = 0;
        sdDraftSlots = [];
      }
    }

    // Move SD tokens
    for (const t of sdTokens) t.x += speed * dt;
    sdTokens = sdTokens.filter(t => t.x < VISIBLE_TOKENS * PERIOD + PERIOD);

    // ── Render lanes ──────────────────────────────────────────────────────
    // Lane backgrounds
    const laneColors = ['rgba(91,132,196,.07)', 'rgba(124,58,237,.07)'];
    [LANE_Y1, LANE_Y2].forEach((lcy, i) => {
      ctx.fillStyle = laneColors[i];
      ctx.beginPath();
      ctx.roundRect(LABEL_W, lcy - LANE_H * 0.8, LANE_W, LANE_H * 1.6, 8);
      ctx.fill();
    });

    // Lane labels
    ctx.font = `600 10px 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#5b84c4';
    ctx.textAlign = 'right';
    ctx.fillText('AR', LABEL_W - 10, LANE_Y1 - 8);
    ctx.font = `500 9px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#3f5070';
    ctx.fillText('autoregressive', LABEL_W - 10, LANE_Y1 + 8);

    ctx.font = `600 10px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('SD', LABEL_W - 10, LANE_Y2 - 8);
    ctx.font = `500 9px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#5b3e8a';
    ctx.fillText('speculative', LABEL_W - 10, LANE_Y2 + 8);

    // Clip to lane area for tokens
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, 0, LANE_W, H);
    ctx.clip();

    const drawToken = (x: number, laneY: number, type: TokenType) => {
      const px = LABEL_W + LANE_W - x - TOKEN_W;
      if (px + TOKEN_W < LABEL_W || px > LABEL_W + LANE_W) return;
      const py = laneY - TOKEN_Y;

      const color = COLORS[type];
      const border = BORDER[type];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(px, py, TOKEN_W, TOKEN_H, 3);
      ctx.fill();

      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px, py, TOKEN_W, TOKEN_H, 3);
        ctx.stroke();
      }

      // X mark for rejected tokens
      if (type === 'rejected') {
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1.5;
        const m = 3;
        ctx.beginPath();
        ctx.moveTo(px + m, py + m);
        ctx.lineTo(px + TOKEN_W - m, py + TOKEN_H - m);
        ctx.moveTo(px + TOKEN_W - m, py + m);
        ctx.lineTo(px + m, py + TOKEN_H - m);
        ctx.stroke();
      }

      // Pulsing draft (verify phase)
      if (type === 'draft' && sdPhase === 'verify') {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed / 180);
        ctx.fillStyle = `rgba(167,139,250,${0.15 + pulse * 0.15})`;
        ctx.beginPath();
        ctx.roundRect(px, py, TOKEN_W, TOKEN_H, 3);
        ctx.fill();
      }
    };

    for (const t of arTokens) drawToken(t.x, LANE_Y1, t.type);
    for (const t of sdTokens) drawToken(t.x, LANE_Y2, t.type);

    ctx.restore();

    // ── Verify phase indicator ────────────────────────────────────────────
    if (sdPhase === 'verify') {
      const phasePct = Math.min(1, (elapsed - sdCycleStart - K * T_DRAFT) / T_VERIFY_REAL);
      const barW = LANE_W * phasePct;
      ctx.fillStyle = 'rgba(245,158,11,.12)';
      ctx.fillRect(LABEL_W, LANE_Y2 - LANE_H * 0.8, barW, LANE_H * 1.6);
      ctx.font = `600 9px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('VERIFYING', LABEL_W + 8, LANE_Y2 - LANE_H * 0.7);
    }

    // ── Speedup display ───────────────────────────────────────────────────
    const sp = speedup();
    const cx = W / 2;
    const spY = H * 0.88;

    ctx.font = `700 ${Math.max(22, Math.min(36, W * 0.055))}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = sp >= 2.5 ? '#22d3ee' : sp >= 1.5 ? '#f59e0b' : '#f87171';
    ctx.fillText(`${sp.toFixed(2)}×`, cx, spY);

    ctx.font = `500 10px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#4a5568';
    ctx.fillText('speedup', cx, spY + (Math.max(22, Math.min(36, W * 0.055)) * 0.75));

    // Token count comparison
    const realtimeAR = elapsed > 0 ? (elapsed / T_VERIFY_REAL) : 0;
    const realtimeSD = elapsed > 0 ? (elapsed / (K * costRatio * T_VERIFY_REAL + T_VERIFY_REAL)) * eTokensPerCycle() : 0;

    ctx.font = `500 9.5px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#5b84c4';
    ctx.textAlign = 'right';
    ctx.fillText(`AR ${realtimeAR.toFixed(1)} tok`, cx - 18, spY);
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'left';
    ctx.fillText(`SD ${realtimeSD.toFixed(1)} tok`, cx + 18, spY);

    // ── Cycle phase label ─────────────────────────────────────────────────
    const phaseLabel = sdPhase === 'draft'
      ? `drafting ${sdDraftEmitted}/${K}`
      : 'verifying…';
    ctx.font = `500 9px 'JetBrains Mono', monospace`;
    ctx.fillStyle = sdPhase === 'draft' ? '#7c3aed' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(phaseLabel, W * 0.72, LANE_Y2 + LANE_H * 0.95);

    ctx.restore();
  }

  // ── Panel render ──────────────────────────────────────────────────────────
  function renderPanel() {
    const sp = speedup();
    const eTokens = eTokensPerCycle();
    const cycleTime = K * costRatio + 1;
    const a = alpha;
    const attackThreshold = Math.max(0, a - 0.12); // ~12pp drop before detection

    panelEl.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'dr-title';
    title.textContent = 'Live stats';
    panelEl.appendChild(title);

    const mkRow = (label: string, val: string, cls = '') => {
      const r = document.createElement('div');
      r.className = 'dr-metric';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); if (cls) b.className = cls;
      b.textContent = val;
      r.append(s, b);
      return r;
    };

    panelEl.append(
      mkRow('speedup', `${sp.toFixed(2)}×`, sp >= 2.5 ? 'cyan' : sp >= 1.5 ? 'amber' : 'red'),
      mkRow('E[tokens/cycle]', eTokens.toFixed(2), 'cyan'),
      mkRow('cycle cost', `${cycleTime.toFixed(2)} × T_v`, ''),
      mkRow('draft cost ratio', `${(costRatio * 100).toFixed(0)}%`, ''),
    );

    const divider = document.createElement('hr');
    divider.className = 'dr-divider';
    panelEl.appendChild(divider);

    const title2 = document.createElement('div');
    title2.className = 'dr-title';
    title2.textContent = 'Attack surface';
    panelEl.appendChild(title2);

    panelEl.append(
      mkRow('α committed', `${(a * 100).toFixed(0)}%`, ''),
      mkRow('attack floor', `${(attackThreshold * 100).toFixed(0)}%`, 'red'),
      mkRow('bias headroom', `${((a - attackThreshold) * 100).toFixed(0)}pp`, 'amber'),
    );

    const divider2 = document.createElement('hr');
    divider2.className = 'dr-divider';
    panelEl.appendChild(divider2);

    const fml = document.createElement('div');
    fml.className = 'dr-formula';
    fml.innerHTML =
      `<b>E[tok/cycle]</b> = (1–α<sup>K+1</sup>)/(1–α)<br>` +
      `= (1–${a.toFixed(2)}<sup>${K + 1}</sup>)/(1–${a.toFixed(2)})<br>` +
      `= <b>${eTokens.toFixed(2)}</b><br>` +
      `<b>Speedup</b> = ${eTokens.toFixed(2)} / ${cycleTime.toFixed(2)} = <b>${sp.toFixed(2)}×</b>`;
    panelEl.appendChild(fml);
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────
  let raf = 0;
  let hidden = false;
  let resetNeeded = false;

  function reset() {
    arTokens = [];
    sdTokens = [];
    arCount = 0;
    sdOutputCount = 0;
    sdCycleStart = 0;
    sdPhase = 'draft';
    sdDraftEmitted = 0;
    sdDraftSlots = [];
    lastArToken = 0;
    startTime = performance.now();
    prevTime = startTime;
    resetNeeded = false;
  }

  function loop(ts: number) {
    raf = requestAnimationFrame(loop);
    if (hidden) return;
    if (resetNeeded) reset();
    // DPR-aware canvas resize
    const { clientWidth: w, clientHeight: h } = canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    if (canvas.width === 0 || canvas.height === 0) return;

    // Reset every 30 cycles to prevent memory bloat
    const cycleMs = (K * costRatio + 1) * T_VERIFY;
    if (ts - startTime > 30 * cycleMs) resetNeeded = true;

    draw(ts);
    renderPanel();
  }

  const onVisible = () => { hidden = document.hidden; };
  document.addEventListener('visibilitychange', onVisible);

  // Sync sliders
  aCtrl.inp.addEventListener('input', () => {
    alpha = Number(aCtrl.inp.value) / 100;
    aCtrl.out.textContent = `${aCtrl.inp.value}%`;
    resetNeeded = true;
    renderPanel();
  });
  kCtrl.inp.addEventListener('input', () => {
    K = Number(kCtrl.inp.value);
    kCtrl.out.textContent = String(K);
    resetNeeded = true;
    renderPanel();
  });
  cCtrl.inp.addEventListener('input', () => {
    costRatio = Number(cCtrl.inp.value) / 100;
    cCtrl.out.textContent = `${cCtrl.inp.value}%`;
    resetNeeded = true;
    renderPanel();
  });

  reset();
  raf = requestAnimationFrame(loop);
  renderPanel();

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisible);
    layout.dispose();
    style.remove();
  };
}
