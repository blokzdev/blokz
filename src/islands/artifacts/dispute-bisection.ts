/**
 * Artifact: dispute-bisection — Dispute Bisection
 * Manifest: content/artifacts/dispute-bisection/manifest.json
 *
 * An interactive fraud-proof dispute game: a proposer posts a trace of state
 * commitments for an N-step computation, a watcher re-executes it, and the
 * chain bisects their disagreement — each round it queries one midpoint
 * commitment, halving the suspect window until a single step remains to
 * re-execute on-chain. Tap any column to plant the fault and replay.
 * Canvas 2D, DPR-aware (capped at 2).
 */

const PROBE_MS = 700;
const VERDICT_MS = 800;
const NARROW_MS = 450;
const DONE_MS = 4200;

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const N = window.matchMedia('(max-width: 768px)').matches ? 32 : 64;
  const ROUNDS = Math.ceil(Math.log2(N - 1));

  // Deterministic 3-bar "hash glyph" per state; corrupting flips the seed so
  // a lying proposer's commitments visibly differ once revealed.
  const glyph = (state: number, corrupt: boolean): [number, number, number] => {
    let s = ((state + 1) * 2654435761) >>> 0;
    if (corrupt) s = (s ^ 0x9e3779b9) >>> 0;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    return [rand(), rand(), rand()];
  };

  /* ---- Game state ---- */
  // Invariant: commitment `lo` is agreed, `hi` is disputed; the divergent
  // step lives in (lo, hi]. Proposer's trace is corrupt from `fault` onward.
  let fault = 1;
  let lo = 0;
  let hi = N - 1;
  let loF = 0; // eased bracket positions for the narrowing animation
  let hiF = N - 1;
  let mid = 0;
  let round = 1;
  let phase: 'probe' | 'verdict' | 'narrow' | 'done' = 'probe';
  let phaseAt = performance.now();
  let verdictMatch = false;
  const revealed = new Map<number, boolean>(); // state index → hashes match

  function restart(f: number, now: number) {
    fault = Math.min(Math.max(f, 1), N - 1);
    lo = 0;
    hi = N - 1;
    loF = 0;
    hiF = N - 1;
    round = 1;
    mid = (lo + hi) >> 1;
    revealed.clear();
    revealed.set(0, true); // input commitment — agreed by construction
    revealed.set(N - 1, false); // claimed result — the disputed assertion
    phase = 'probe';
    phaseAt = now;
  }
  restart(Math.floor(N * (0.25 + Math.random() * 0.55)), performance.now());

  /* ---- Layout ---- */
  let W = 0;
  let H = 0;
  let padX = 0;
  let cellW = 0;
  let gap = 0;
  let cellH = 0;
  let yP = 0; // proposer row top
  let yW = 0; // watcher row top
  let yM = 0; // marker line between rows

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    padX = Math.max(16, W * 0.045);
    cellW = (W - padX * 2) / N;
    gap = Math.max(1, cellW * 0.18);
    // Vertical bands reserved top-down so no text ever shares a band:
    // caption(20) · probe spawn · proposer label · row · midline · row ·
    // watcher label · status(H-14). Short stages shrink rows, never labels.
    const topBand = 28;
    const labelH = 14;
    const bottomBand = H - 30;
    const avail = bottomBand - topBand - labelH * 2;
    cellH = Math.min(52, Math.max(10, avail * 0.36));
    let rowGap = avail - 2 * cellH;
    if (rowGap < 14) {
      cellH = Math.max(8, (avail - 14) / 2);
      rowGap = 14;
    }
    yP = topBand + labelH;
    yW = yP + cellH + rowGap;
    yM = yP + cellH + rowGap / 2;
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  /* ---- Interaction ---- */
  let hoverCol = -1;
  const colAt = (e: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - padX) / cellW);
    return col >= 0 && col < N ? col : -1;
  };
  const onMove = (e: PointerEvent) => {
    // Hover preview is a mouse affordance; on touch it would stick forever.
    hoverCol = e.pointerType === 'mouse' ? colAt(e) : -1;
  };
  const onLeave = () => {
    hoverCol = -1;
  };
  const onDown = (e: PointerEvent) => {
    const col = colAt(e);
    if (col >= 0) restart(col, performance.now());
  };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);

  /* ---- Phase machine ---- */
  function update(now: number) {
    const elapsed = now - phaseAt;
    if (phase === 'probe' && elapsed >= PROBE_MS) {
      verdictMatch = mid < fault; // honest prefix: commitments agree before the fault
      revealed.set(mid, verdictMatch);
      phase = 'verdict';
      phaseAt = now;
    } else if (phase === 'verdict' && elapsed >= VERDICT_MS) {
      if (verdictMatch) lo = mid;
      else hi = mid;
      phase = hi - lo === 1 ? 'done' : 'narrow';
      phaseAt = now;
    } else if (phase === 'narrow' && elapsed >= NARROW_MS) {
      round++;
      mid = (lo + hi) >> 1;
      phase = 'probe';
      phaseAt = now;
    } else if (phase === 'done' && elapsed >= DONE_MS) {
      restart(1 + Math.floor(Math.random() * (N - 1)), now);
    }
  }

  /* ---- Render loop ---- */
  const colX = (j: number) => padX + j * cellW;
  const colCX = (j: number) => padX + (j + 0.5) * cellW;
  const easeInOut = (t: number) => t * t * (3 - 2 * t);
  const mono = (px: number) => `500 ${px}px 'JetBrains Mono', monospace`;

  let rafId = 0;
  let lastT = performance.now();

  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) return;
    // Returning from a hidden tab: shift the phase clock by the pause so the
    // protocol resumes where it left off instead of fast-forwarding.
    if (now - lastT > 400) phaseAt += now - lastT;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    update(now);

    // Ease the bracket toward the current suspect window.
    const k = 1 - Math.exp(-dt * 9);
    loF += (lo - loF) * k;
    hiF += (hi - hiF) * k;

    ctx.clearRect(0, 0, W, H);
    const small = W < 560;
    const fs = Math.max(9, Math.min(12, W / 64));

    // Suspect-window bracket spanning both rows.
    const bx = colX(loF) - 3;
    const bw = (hiF - loF + 1) * cellW - gap + 6;
    ctx.beginPath();
    ctx.roundRect(bx, yP - 6, bw, yW + cellH - yP + 12, 8);
    ctx.fillStyle = 'rgba(91,140,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(91,140,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Hover highlight — where a tap would plant the fault.
    if (hoverCol >= 0 && phase !== 'done') {
      ctx.fillStyle = 'rgba(34,211,238,0.07)';
      ctx.fillRect(colX(hoverCol), yP - 6, cellW - gap, yW + cellH - yP + 12);
    }

    // Fraud spotlight behind the isolated column.
    if (phase === 'done') {
      const cx = colCX(hi);
      const pulse = 0.22 + 0.12 * Math.sin(now / 180);
      const g = ctx.createRadialGradient(cx, yM, 0, cx, yM, cellH * 4.5);
      g.addColorStop(0, `rgba(255,99,99,${pulse})`);
      g.addColorStop(1, 'rgba(255,99,99,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, yM, cellH * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Commitment cells, proposer (violet) and watcher (blue) rows.
    for (let j = 0; j < N; j++) {
      const inside = j + 0.25 >= loF && j - 0.25 <= hiF;
      const alpha = inside ? 1 : 0.32;
      const x = colX(j);
      const w = cellW - gap;
      const isRevealed = revealed.has(j);
      const match = revealed.get(j);

      for (const [y, corrupt, barColor] of [
        [yP, j >= fault, '139,92,246'],
        [yW, false, '139,165,255'],
      ] as Array<[number, boolean, string]>) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, cellH, 2);
        ctx.fillStyle = `rgba(13,19,34,${0.9 * alpha})`;
        ctx.fill();
        if (isRevealed) {
          const liar = phase === 'done' && j === hi && y === yP;
          ctx.strokeStyle =
            match === false
              ? `rgba(255,99,99,${(liar ? 0.95 : 0.55) * alpha})`
              : `rgba(34,211,238,${0.55 * alpha})`;
          ctx.shadowColor = liar ? 'rgba(255,99,99,0.9)' : 'transparent';
          ctx.shadowBlur = liar ? 14 : 0;
        } else {
          ctx.strokeStyle = `rgba(124,140,255,${0.18 * alpha})`;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (isRevealed) {
          // The revealed hash: three deterministic bars.
          const bars = glyph(j, corrupt);
          const bw3 = w / 5;
          bars.forEach((b, i) => {
            const bh = (0.3 + b * 0.6) * (cellH - 6);
            ctx.fillStyle = `rgba(${barColor},${(0.45 + b * 0.5) * alpha})`;
            ctx.fillRect(x + bw3 * (i + 1) - bw3 / 2, y + cellH - 3 - bh, Math.max(1.2, bw3 * 0.55), bh);
          });
        } else {
          // Off-chain: the chain hasn't seen this commitment.
          ctx.fillStyle = `rgba(91,99,120,${0.5 * alpha})`;
          ctx.beginPath();
          ctx.arc(x + w / 2, y + cellH / 2, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Match/mismatch verdict between the rows — dots, not glyphs: at 64
      // columns adjacent text characters collide. The active probe gets the
      // full = / ≠ glyph inside its verdict ring instead.
      if (isRevealed) {
        ctx.fillStyle = match ? `rgba(34,211,238,${0.85 * alpha})` : `rgba(255,99,99,${0.9 * alpha})`;
        ctx.beginPath();
        ctx.arc(x + w / 2, yM, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Where the viewer planted the fault: an underline bar under the watcher
    // row (a glyph here collided with the row label and the status line).
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    ctx.fillRect(colX(fault), yW + cellH + 3, Math.max(cellW - gap, 2), 2);

    // Probe pulse: the chain's query descending onto the midpoint commitment.
    if (phase === 'probe') {
      const t = easeInOut(Math.min((now - phaseAt) / PROBE_MS, 1));
      const px = colCX(mid);
      const py = 26 + (yP - 10 - 26) * t;
      ctx.strokeStyle = `rgba(34,211,238,${0.35 * t})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 26);
      ctx.lineTo(px, py);
      ctx.stroke();
      const g = ctx.createRadialGradient(px, py, 0, px, py, 14);
      g.addColorStop(0, 'rgba(34,211,238,0.85)');
      g.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Verdict flash: an expanding ring colored by the comparison, with the
    // = / ≠ glyph for the probed commitment at its center.
    if (phase === 'verdict') {
      const t = Math.min((now - phaseAt) / VERDICT_MS, 1);
      const r = 6 + t * 22;
      const col = verdictMatch ? '34,211,238' : '255,99,99';
      ctx.strokeStyle = `rgba(${col},${0.8 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(colCX(mid), yM, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = mono(Math.max(11, fs + 2));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${col},0.95)`;
      ctx.fillText(verdictMatch ? '=' : '≠', colCX(mid), yM);
    }

    /* ---- Captions ---- */
    ctx.textBaseline = 'alphabetic';
    ctx.font = mono(10);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(91,99,120,0.9)';
    ctx.fillText(`bisection fraud proof · ${N} state commitments · ≤${ROUNDS} rounds`, padX, 20);
    if (!small) {
      ctx.textAlign = 'right';
      ctx.fillText('tap a step to plant the fault', W - padX, 20);
    }

    // Row labels (each in its own reserved band — see layout()).
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(139,92,246,0.75)';
    ctx.fillText('proposer claim', padX, yP - 5);
    ctx.fillStyle = 'rgba(139,165,255,0.75)';
    ctx.fillText('watcher re-execution', padX, yW + cellH + 14);

    // Status line narrating the protocol.
    let status: string;
    let statusColor = 'rgba(141,149,173,0.95)';
    if (phase === 'probe') {
      status = `round ${round}/${ROUNDS} — chain queries commitment #${mid}`;
    } else if (phase === 'verdict') {
      status = verdictMatch
        ? `#${mid} matches — divergence is right of #${mid}`
        : `#${mid} differs — divergence is at or left of #${mid}`;
      statusColor = verdictMatch ? 'rgba(34,211,238,0.95)' : 'rgba(255,99,99,0.95)';
    } else if (phase === 'narrow') {
      status = `suspect window narrows to (${lo}, ${hi}]`;
    } else {
      status = `step ${hi} isolated — re-executed on-chain — proposer slashed`;
      statusColor = 'rgba(255,99,99,0.95)';
    }
    ctx.font = mono(Math.max(10, fs));
    ctx.textAlign = 'left';
    ctx.fillStyle = statusColor;
    ctx.fillText(status, padX, H - 14);
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.remove();
  };
}
