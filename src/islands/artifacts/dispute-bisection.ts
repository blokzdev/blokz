/**
 * Artifact: dispute-bisection — Dispute Bisection
 * Manifest: content/artifacts/dispute-bisection/manifest.json
 *
 * The fraud-proof bisection game from optimistic ML oracles, played out on
 * two execution traces. The proposer's claimed trace silently diverges from
 * the watcher's honest re-execution at one step; both parties agree on the
 * genesis state and disagree on the final one, so binary search over the
 * trace corners the fault in log2(n) midpoint probes — and the chain only
 * ever re-executes that single step. Click/tap a column to plant the fault
 * there and replay. Canvas 2D, DPR-aware (capped at 2).
 */

type Phase = 'idle' | 'scan' | 'compare' | 'narrow' | 'verdict';

const SCAN_MS = 650;
const COMPARE_MS = 800;
const NARROW_MS = 550;
const VERDICT_MS = 3400;
const IDLE_MS = 900;

const ACCENT = '91,140,255';
const CYAN = '34,211,238';
const VIOLET = '139,92,246';
const TEXT = '231,234,243';

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;touch-action:pan-y;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  // Shorter trace on narrow stages so columns stay tappable.
  const N = container.clientWidth >= 560 ? 32 : 16;
  const ROUNDS = Math.log2(N);

  /* ---- Layout ---- */
  let W = 0;
  let H = 0;
  let traceX = 0; // left edge of the trace band
  let cellW = 0;
  let cellH = 0;
  let claimedY = 0;
  let honestY = 0;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    traceX = Math.max(16, W * 0.06);
    cellW = (W - traceX * 2) / N;
    cellH = Math.max(16, Math.min(34, H * 0.14));
    claimedY = H * 0.3;
    honestY = H * 0.6;
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  // Center x of the state cell written by step i (steps are 1-based; state 0
  // is the agreed genesis just left of the band).
  const stateX = (i: number) => traceX + (i - 0.5) * cellW;
  const boundaryX = (i: number) => traceX + i * cellW;

  /* ---- Game state ---- */
  let fault = 0; // claimed state i is wrong for all i >= fault
  let lo = 0; // greatest state index where both traces are known to agree
  let hi = 0; // least state index where they are known to disagree
  let round = 0;
  let mid = 0;
  let phase: Phase = 'idle';
  let phaseStart = 0;
  let scanFromX = 0;
  let revealed: Array<{ idx: number; match: boolean }> = [];
  // Smoothed dispute-band edges (in state-index space).
  let loAnim = 0;
  let hiAnim = N;

  function reset(now: number, faultAt?: number) {
    fault = faultAt ?? 1 + Math.floor(Math.random() * N);
    lo = 0;
    hi = N;
    round = 0;
    revealed = [];
    phase = 'idle';
    phaseStart = now;
    scanFromX = traceX;
  }
  reset(performance.now());

  function startScan(now: number) {
    mid = (lo + hi) >> 1;
    round++;
    phase = 'scan';
    phaseStart = now;
  }

  function advance(now: number) {
    if (phase === 'idle') {
      startScan(now);
    } else if (phase === 'scan') {
      phase = 'compare';
      phaseStart = now;
    } else if (phase === 'compare') {
      const match = mid < fault;
      revealed.push({ idx: mid, match });
      if (match) lo = mid;
      else hi = mid;
      phase = 'narrow';
      phaseStart = now;
    } else if (phase === 'narrow') {
      scanFromX = stateX(mid);
      if (hi - lo === 1) {
        phase = 'verdict';
        phaseStart = now;
      } else {
        startScan(now);
      }
    } else if (phase === 'verdict') {
      reset(now);
    }
  }

  /* ---- Interaction: plant the fault ---- */
  const onPointerDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - traceX) / cellW) + 1;
    reset(performance.now(), Math.min(N, Math.max(1, i)));
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  /* ---- Drawing ---- */
  function drawCell(x: number, y: number, alpha: number, stroke: string, fillA: number, glow = 0) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(x + 1, y, cellW - 2, cellH, Math.min(4, cellW * 0.2));
    ctx.fillStyle = `rgba(13,19,34,${0.55 + fillA})`;
    if (glow > 0) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = glow;
    }
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function label(text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', px = 10) {
    ctx.font = `500 ${px}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  let rafId = 0;
  let lastT = performance.now();

  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) return;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    const durations: Record<Phase, number> = {
      idle: IDLE_MS,
      scan: SCAN_MS,
      compare: COMPARE_MS,
      narrow: NARROW_MS,
      verdict: VERDICT_MS,
    };
    const p = Math.min((now - phaseStart) / durations[phase], 1);
    if (p >= 1) advance(now);

    // Ease the dispute band toward the live interval.
    const k = 1 - Math.exp(-dt * 9);
    loAnim += (lo - loAnim) * k;
    hiAnim += (hi - hiAnim) * k;

    ctx.clearRect(0, 0, W, H);

    /* Dispute band spanning both rows. */
    const bandX0 = boundaryX(loAnim);
    const bandX1 = boundaryX(hiAnim);
    const bandTop = claimedY - 8;
    const bandBot = honestY + cellH + 8;
    ctx.fillStyle = `rgba(${ACCENT},0.07)`;
    ctx.fillRect(bandX0, bandTop, bandX1 - bandX0, bandBot - bandTop);
    ctx.strokeStyle = `rgba(${ACCENT},0.4)`;
    ctx.lineWidth = 1;
    for (const bx of [bandX0, bandX1]) {
      ctx.beginPath();
      ctx.moveTo(bx, bandTop);
      ctx.lineTo(bx, bandBot);
      ctx.stroke();
    }

    /* Trace rows. */
    const verdictPulse = phase === 'verdict' ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
    for (let i = 1; i <= N; i++) {
      const x = traceX + (i - 1) * cellW;
      const inBand = i > lo && i <= hi;
      const dim = inBand ? 1 : 0.3;
      const probe = revealed.find((r) => r.idx === i);

      // Claimed row: neutral until probed; the convicted step burns violet.
      let cStroke = `rgba(${ACCENT},0.3)`;
      let cGlow = 0;
      let cFill = 0;
      if (probe) {
        cStroke = probe.match ? `rgba(${CYAN},0.75)` : `rgba(${VIOLET},0.85)`;
        cGlow = 7;
        cFill = 0.2;
      }
      if (phase === 'verdict' && i === hi) {
        cStroke = `rgba(${VIOLET},${0.7 + verdictPulse * 0.3})`;
        cGlow = 10 + verdictPulse * 14;
        cFill = 0.3;
      }
      drawCell(x, claimedY, dim, cStroke, cFill, cGlow);

      let hStroke = `rgba(${CYAN},0.3)`;
      let hGlow = 0;
      if (probe) {
        hStroke = `rgba(${CYAN},0.7)`;
        hGlow = 6;
      }
      if (phase === 'verdict' && i === hi) {
        hStroke = `rgba(${CYAN},${0.7 + verdictPulse * 0.3})`;
        hGlow = 10 + verdictPulse * 12;
      }
      drawCell(x, honestY, dim, hStroke, probe ? 0.2 : 0, hGlow);
    }

    /* Genesis: the one state everyone signed off on. */
    ctx.beginPath();
    ctx.arc(traceX - 8, (claimedY + honestY + cellH) / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${CYAN},0.8)`;
    ctx.fill();

    /* Fault marker on the claimed row (the secret the search converges on). */
    const fx = stateX(fault);
    ctx.beginPath();
    ctx.moveTo(fx, claimedY - 12);
    ctx.lineTo(fx - 4, claimedY - 19);
    ctx.lineTo(fx + 4, claimedY - 19);
    ctx.closePath();
    ctx.fillStyle = `rgba(${VIOLET},0.5)`;
    ctx.fill();

    /* Probe verdict glyphs between the rows. */
    const glyphY = (claimedY + cellH + honestY) / 2;
    for (const r of revealed) {
      const isCurrent = phase === 'compare' && r.idx === mid;
      label(
        r.match ? '✓' : '✕',
        stateX(r.idx),
        glyphY,
        r.match ? `rgba(${CYAN},0.9)` : `rgba(${VIOLET},0.95)`,
        'center',
        isCurrent ? 14 : 11,
      );
    }

    /* Scan line dropping onto the midpoint state. */
    if (phase === 'scan' || phase === 'compare') {
      const targetX = stateX(mid);
      const sx = phase === 'scan' ? scanFromX + (targetX - scanFromX) * easeOutCubic(p) : targetX;
      ctx.strokeStyle = `rgba(${ACCENT},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = `rgba(${ACCENT},0.9)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(sx, claimedY - 10);
      ctx.lineTo(sx, honestY + cellH + 10);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /* Captions. */
    const small = W < 480;
    label('claimed trace — proposer', traceX, claimedY - (small ? 14 : 18), `rgba(${ACCENT},0.75)`);
    label('honest trace — watcher', traceX, honestY + cellH + (small ? 14 : 18), `rgba(${CYAN},0.75)`);

    const top = H * 0.1;
    if (phase === 'verdict') {
      label(
        small ? `step ${hi}: fraud proven` : `step ${hi} re-executed on-chain → claim rejected, bond slashed`,
        W / 2,
        top,
        `rgba(${VIOLET},${0.75 + verdictPulse * 0.25})`,
        'center',
        small ? 10 : 11,
      );
    } else if (round > 0) {
      label(
        `round ${round}/${ROUNDS} · ${hi - lo} step${hi - lo > 1 ? 's' : ''} in dispute`,
        W / 2,
        top,
        `rgba(${TEXT},0.55)`,
        'center',
        small ? 10 : 11,
      );
    } else {
      label(
        small ? `1 of ${N} steps is corrupt` : `traces disagree on the output — one of ${N} steps is corrupt`,
        W / 2,
        top,
        `rgba(${TEXT},0.45)`,
        'center',
        small ? 10 : 11,
      );
    }
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.remove();
  };
}
