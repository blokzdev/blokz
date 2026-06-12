/**
 * Artifact: dispute-bisection — Dispute Bisection
 * Manifest: content/artifacts/dispute-bisection/manifest.json
 *
 * An interactive fraud proof: a proposer posts a 64-step inference trace with
 * one corrupted step. Each probe compares the claimed intermediate state
 * against an honest re-execution, halving the disagreement window until a
 * single operation remains — the one the chain re-executes. Tap a step inside
 * the highlighted window to probe it yourself; left alone, an automated
 * challenger bisects optimally.
 */
export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const SMALL = window.matchMedia('(max-width: 768px)').matches;
  const STEPS = SMALL ? 32 : 64;

  // Palette (design tokens, docs/DESIGN-SYSTEM.md).
  const ACCENT = '91, 140, 255'; // --color-accent
  const VIOLET = '139, 92, 246'; // --color-violet
  const CYAN = '34, 211, 238'; // --color-cyan
  const TEXT = '231, 234, 243'; // --color-text
  const MUTED = '141, 149, 173'; // --color-muted
  const MONO = '"JetBrains Mono", ui-monospace, monospace';

  // ---- layout (recomputed on resize) ----
  let W = 0;
  let H = 0;
  let stripX = 0;
  let stripY = 0;
  let stripH = 0;
  let cellW = 0;
  let gap = 0;
  let funnelTop = 0;
  let funnelBottom = 0;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padX = Math.max(W * 0.05, 18);
    gap = Math.max(1, W * 0.0022);
    cellW = (W - padX * 2 - gap * (STEPS - 1)) / STEPS;
    stripX = padX;
    stripY = H * 0.16;
    stripH = Math.max(14, H * 0.085);
    funnelTop = stripY + stripH + H * 0.075;
    funnelBottom = H * 0.84;
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  const cellX = (i: number) => stripX + i * (cellW + gap);

  // ---- game state ----
  // Trace states 0..STEPS-1; the claimed state at index i is honest iff
  // i < fault. lo = greatest index known to agree (-1 = the public input),
  // hi = least index known to disagree (starts at the disputed output).
  let fault = 0;
  let lo = -1;
  let hi = STEPS - 1;
  let probes = 0;
  let rounds: Array<{ lo: number; hi: number; t0: number }> = [];
  let phase: 'idle' | 'probing' | 'resolved' = 'idle';
  let probe = { index: 0, t0: 0, manual: false };
  let verdictAt = 0; // when the active probe's verdict landed (0 = pending)
  let nextAutoAt = 0;
  let resolvedAt = 0;
  let hovered = -1;

  const PROBE_MS = 520; // marker drop
  const VERDICT_MS = 480; // flash + window update settle
  const AUTO_EVERY = 1700;
  const RESOLVED_HOLD = 4600;

  function resetGame(now: number) {
    fault = 3 + Math.floor(Math.random() * (STEPS - 5));
    lo = -1;
    hi = STEPS - 1;
    probes = 0;
    rounds = [{ lo, hi, t0: now }];
    phase = 'idle';
    nextAutoAt = now + 2400;
  }
  resetGame(performance.now());

  function startProbe(m: number, now: number, manual = false) {
    phase = 'probing';
    probe = { index: m, t0: now, manual };
    verdictAt = 0;
    probes++;
  }

  function settleProbe(now: number) {
    // Verdict: the claimed state at probe.index matches re-execution iff the
    // corrupted op hasn't happened yet at that point in the trace.
    if (probe.index < fault) lo = probe.index;
    else hi = probe.index;
    rounds.push({ lo, hi, t0: now });
    if (hi - lo === 1) {
      phase = 'resolved';
      resolvedAt = now;
    } else {
      phase = 'idle';
      // After a manual probe, hold the auto-challenger back — the user is driving.
      nextAutoAt = now + (probe.manual ? AUTO_EVERY * 2.5 : AUTO_EVERY);
    }
  }

  // ---- pointer interaction ----
  const cellAt = (clientX: number) => {
    const x = clientX - canvas.getBoundingClientRect().left;
    const i = Math.floor((x - stripX) / (cellW + gap));
    return i >= 0 && i < STEPS ? i : -1;
  };
  const probeable = (i: number) => phase === 'idle' && i > lo && i < hi;

  const onClick = (e: MouseEvent) => {
    const now = performance.now();
    if (phase === 'resolved') {
      resetGame(now);
      return;
    }
    const i = cellAt(e.clientX);
    if (probeable(i)) {
      startProbe(i, now, true);
    }
  };
  const onMove = (e: PointerEvent) => {
    hovered = cellAt(e.clientX);
    canvas.style.cursor = probeable(hovered) || phase === 'resolved' ? 'pointer' : 'default';
  };
  const onLeave = () => {
    hovered = -1;
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  // ---- drawing helpers ----
  const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function glowDot(x: number, y: number, r: number, rgb: string, a: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${TEXT}, ${Math.min(1, a + 0.2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- render loop ----
  let rafId = 0;
  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) return;
    ctx.clearRect(0, 0, W, H);

    // Advance the state machine.
    if (phase === 'probing') {
      if (verdictAt === 0 && now - probe.t0 >= PROBE_MS) verdictAt = now;
      if (verdictAt !== 0 && now - verdictAt >= VERDICT_MS) settleProbe(now);
    } else if (phase === 'idle' && now >= nextAutoAt) {
      startProbe(lo + Math.ceil((hi - lo) / 2), now);
    } else if (phase === 'resolved' && now - resolvedAt >= RESOLVED_HOLD) {
      resetGame(now);
    }

    const pulse = 0.5 + 0.5 * Math.sin(now / 480);
    const resolved = phase === 'resolved';

    // --- the trace strip ---
    for (let i = 0; i < STEPS; i++) {
      const x = cellX(i);
      let fill: string;
      let stroke: string;
      if (i <= lo) {
        fill = `rgba(${CYAN}, 0.18)`;
        stroke = `rgba(${CYAN}, 0.45)`;
      } else if (i >= hi) {
        fill = `rgba(${VIOLET}, 0.18)`;
        stroke = `rgba(${VIOLET}, 0.45)`;
      } else {
        const hot = probeable(i) && i === hovered ? 0.3 : 0;
        fill = `rgba(${ACCENT}, ${0.08 + 0.05 * pulse + hot})`;
        stroke = `rgba(${ACCENT}, ${0.3 + 0.15 * pulse + hot})`;
      }
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      roundRect(x, stripY, cellW, stripH, Math.min(3, cellW / 3));
      ctx.fill();
      ctx.stroke();
    }

    // Anchors: agreed input on the left, disputed claim on the right.
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(${CYAN}, 0.8)`;
    ctx.fillText('input ✓', stripX, stripY - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${VIOLET}, 0.9)`;
    ctx.fillText('claimed output ✗', stripX + STEPS * (cellW + gap) - gap, stripY - 8);

    // Probe counter.
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${MUTED}, 0.9)`;
    ctx.fillText(`probes ${probes} · log₂(${STEPS}) = ${Math.log2(STEPS)}`, W - stripX, H * 0.07);

    // --- probe marker: drops onto the cell, then flashes the verdict ---
    if (phase === 'probing') {
      const x = cellX(probe.index) + cellW / 2;
      const yTop = stripY - Math.max(16, H * 0.06);
      const yHit = stripY + stripH / 2;
      if (verdictAt === 0) {
        const t = ease((now - probe.t0) / PROBE_MS);
        glowDot(x, yTop + (yHit - yTop) * t, 3, ACCENT, 0.8);
      } else {
        const t = (now - verdictAt) / VERDICT_MS;
        const agree = probe.index < fault;
        const rgb = agree ? CYAN : VIOLET;
        glowDot(x, yHit, 3 + t * 4, rgb, 0.8 * (1 - t));
        ctx.font = `bold 12px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(${rgb}, ${1 - t})`;
        ctx.fillText(agree ? '✓ states match' : '✗ states diverge', x, yTop - 4);
      }
    }

    // --- the bisection funnel: one bar per round, halving toward the fault ---
    const rowH = Math.max(10, H * 0.052);
    const rowGap = Math.max(6, H * 0.022);
    const maxRows = Math.max(2, Math.floor((funnelBottom - funnelTop) / (rowH + rowGap)));
    const shown = rounds.slice(-maxRows);
    shown.forEach((r, k) => {
      const y = funnelTop + k * (rowH + rowGap);
      const grow = ease((now - r.t0) / 380);
      // Window interior spans cells lo+1 .. hi-1; the terminal round is empty,
      // so pin its bar on the single disputed op instead.
      const final = r.hi - r.lo === 1;
      const x0 = final ? cellX(r.hi) : cellX(r.lo + 1);
      const x1 = final ? cellX(r.hi) + cellW : cellX(r.hi - 1) + cellW;
      const w = Math.max(cellW, (x1 - x0) * grow);
      const last = k === shown.length - 1;
      const alpha = last ? 0.32 + 0.12 * pulse : 0.14;
      const rgb = final ? VIOLET : ACCENT;
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.strokeStyle = `rgba(${rgb}, ${alpha + 0.25})`;
      ctx.lineWidth = 1;
      roundRect(x0 + (x1 - x0 - w) / 2, y, w, rowH, 3);
      ctx.fill();
      ctx.stroke();
      if (w > 46) {
        ctx.font = `9px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(${MUTED}, ${last ? 0.95 : 0.55})`;
        ctx.fillText(`${r.hi - r.lo - 1} steps`, x0 + (x1 - x0) / 2, y + rowH / 2 + 3);
      }
    });

    // --- resolution: burst on the corrupted op, then the slate resets ---
    if (resolved) {
      const t = Math.min((now - resolvedAt) / 900, 1);
      const x = cellX(fault) + cellW / 2;
      const y = stripY + stripH / 2;
      glowDot(x, y, 4 + 10 * ease(t), VIOLET, 0.9 * (1 - t * 0.6));
      ctx.strokeStyle = `rgba(${TEXT}, ${0.7 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6 + ease(t) * Math.max(30, H * 0.12), 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- status line ---
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${resolved ? CYAN : MUTED}, 0.95)`;
    const status = resolved
      ? `fraud isolated to op #${fault} in ${probes} probes — chain re-executes one step, liar's bond slashed`
      : probes === 0
        ? 'a watcher disputes the claimed output — tap any step in the window to probe it'
        : `disagreement window: ${hi - lo - 1} step${hi - lo - 1 === 1 ? '' : 's'} — probing where claimed and honest states diverge`;
    ctx.fillText(status, W / 2, H * 0.93);
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    ro.disconnect();
    canvas.remove();
  };
}
