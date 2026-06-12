/**
 * Artifact: dispute-bisection — Dispute Bisection
 * Manifest: content/artifacts/dispute-bisection/manifest.json
 *
 * An optimistic fraud-proof dispute game over a 64-step computation trace.
 * A dishonest proposer posts a result with one faulty step; an honest watcher
 * challenges, and the two bisect their disagreement with six state-hash
 * comparisons until a single step remains for the chain to re-execute.
 * Click/tap the trace to plant the fault yourself.
 */

const N = 64;

function hash32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

type Round = { m: number; agree: boolean; lo: number; hi: number; nextLo: number; nextHi: number };
type Phase = 'propose' | 'challenge' | 'round' | 'verdict' | 'rest';

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  // ---- Protocol state ------------------------------------------------------
  // States s_0..s_N bracket the N steps; a fault at step f means the parties
  // agree on states 0..f and disagree on f+1..N. Each round compares hashes
  // at the midpoint of the disputed interval and keeps the disagreeing half.
  let seed = 0;
  let fault = 0;
  let rounds: Round[] = [];

  function newRun(f: number) {
    seed = (Math.random() * 0xffffffff) >>> 0;
    fault = f;
    rounds = [];
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      const agree = m <= fault;
      const nextLo = agree ? m : lo;
      const nextHi = agree ? hi : m;
      rounds.push({ m, agree, lo, hi, nextLo, nextHi });
      lo = nextLo;
      hi = nextHi;
    }
  }

  // The proposer's claimed states diverge from honest re-execution after the
  // faulty step; everyone agrees up to and including state `fault`.
  const stateHash = (i: number, honest: boolean) => {
    const tampered = !honest && i > fault;
    return hash32(seed ^ Math.imul(i + 1, 0x9e3779b9) ^ (tampered ? 0x5bd1e995 : 0))
      .toString(16)
      .padStart(8, '0');
  };

  // ---- Phase machine -------------------------------------------------------
  const DUR = { propose: 1600, challenge: 1700, probe: 420, compare: 1150, shrink: 480, verdict: 3200, rest: 900 };
  const ROUND_TOTAL = DUR.probe + DUR.compare + DUR.shrink;

  let phase: Phase = 'propose';
  let phaseStart = performance.now();
  let roundIdx = 0;
  let animLo = 0;
  let animHi = N;

  function restart(f: number) {
    newRun(f);
    phase = 'propose';
    phaseStart = performance.now();
    roundIdx = 0;
    animLo = 0;
    animHi = N;
  }
  newRun(17 + Math.floor(Math.random() * 30));

  const onClick = (e: MouseEvent) => {
    const w = container.clientWidth;
    const padX = w * 0.06;
    const idx = Math.floor((e.offsetX - padX) / ((w - padX * 2) / N));
    restart(Math.max(0, Math.min(N - 1, idx)));
  };
  canvas.addEventListener('click', onClick);

  // ---- Render --------------------------------------------------------------
  let rafId = 0;
  let lastNow = performance.now();

  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) {
      lastNow = now;
      return;
    }
    let dt = (now - lastNow) / 1000;
    if (dt > 0.5) {
      // Tab was hidden / frame gap: keep the phase clock continuous.
      phaseStart += now - lastNow;
      dt = 0.016;
    }
    lastNow = now;

    const t = now - phaseStart;
    if (phase === 'propose' && t >= DUR.propose) {
      phase = 'challenge';
      phaseStart = now;
    } else if (phase === 'challenge' && t >= DUR.challenge) {
      phase = 'round';
      roundIdx = 0;
      phaseStart = now;
    } else if (phase === 'round' && t >= ROUND_TOTAL) {
      roundIdx += 1;
      phaseStart = now;
      if (roundIdx >= rounds.length) phase = 'verdict';
    } else if (phase === 'verdict' && t >= DUR.verdict) {
      phase = 'rest';
      phaseStart = now;
    } else if (phase === 'rest' && t >= DUR.rest) {
      restart(Math.floor(Math.random() * N));
    }
    const pt = now - phaseStart;

    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const padX = w * 0.06;
    const stepW = (w - padX * 2) / N;
    const traceY = h * 0.46;
    const traceH = h * 0.15;
    const bracketY = h * 0.35;
    const fs = Math.max(10, Math.min(14, w / 54));
    const mono = `500 ${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;

    // Disputed-interval easing toward the current round's bracket.
    let tgtLo = 0;
    let tgtHi = N;
    if (phase === 'round') {
      const rd = rounds[roundIdx]!;
      const shrunk = pt >= DUR.probe + DUR.compare;
      tgtLo = shrunk ? rd.nextLo : rd.lo;
      tgtHi = shrunk ? rd.nextHi : rd.hi;
    } else if (phase === 'verdict' || phase === 'rest') {
      tgtLo = fault;
      tgtHi = fault + 1;
    }
    const k = 1 - Math.exp(-dt * 9);
    animLo += (tgtLo - animLo) * k;
    animHi += (tgtHi - animHi) * k;

    // Trace segments: bright inside the disputed interval, dim once cleared.
    for (let i = 0; i < N; i++) {
      const x = padX + i * stepW;
      let a: number;
      if (phase === 'propose') {
        a = i < (pt / DUR.propose) * N ? 0.34 : 0.07;
      } else {
        const cov = Math.max(0, Math.min(i + 1, animHi) - Math.max(i, animLo));
        a = 0.09 + cov * 0.28;
      }
      ctx.fillStyle = i === fault ? `rgba(139,92,246,${a + 0.18})` : `rgba(91,140,255,${a})`;
      ctx.fillRect(x + 0.5, traceY, stepW - 1, traceH);
    }

    // Proposer's execution sweep head.
    if (phase === 'propose') {
      const xh = padX + (pt / DUR.propose) * (w - padX * 2);
      const g = ctx.createRadialGradient(xh, traceY + traceH / 2, 0, xh, traceY + traceH / 2, traceH * 1.4);
      g.addColorStop(0, 'rgba(103,232,249,0.5)');
      g.addColorStop(1, 'rgba(103,232,249,0)');
      ctx.fillStyle = g;
      ctx.fillRect(xh - traceH * 1.4, traceY - traceH, traceH * 2.8, traceH * 3);
    }

    // Planted-fault marker (always visible so you can watch the hunt close in).
    const fx = padX + (fault + 0.5) * stepW;
    ctx.fillStyle = 'rgba(139,92,246,0.9)';
    ctx.beginPath();
    ctx.moveTo(fx, traceY + traceH + 5);
    ctx.lineTo(fx - 4.5, traceY + traceH + 13);
    ctx.lineTo(fx + 4.5, traceY + traceH + 13);
    ctx.closePath();
    ctx.fill();

    // Verdict glow on the cornered step.
    if (phase === 'verdict' || phase === 'rest') {
      const pulse = 0.55 + 0.45 * Math.sin(now / 170);
      const flash = phase === 'verdict' ? Math.exp(-pt / 280) : 0;
      const cy = traceY + traceH / 2;
      const g = ctx.createRadialGradient(fx, cy, 0, fx, cy, traceH * 2.4);
      g.addColorStop(0, `rgba(139,92,246,${0.35 * pulse + flash * 0.5})`);
      g.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, cy, traceH * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(231,234,243,${0.25 * pulse + flash})`;
      ctx.fillRect(padX + fault * stepW + 0.5, traceY, stepW - 1, traceH);
    }

    // Dispute bracket over the still-contested interval.
    if (phase !== 'propose') {
      const xLo = padX + animLo * stepW;
      const xHi = padX + animHi * stepW;
      ctx.strokeStyle = 'rgba(34,211,238,0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(xLo, traceY - 6);
      ctx.lineTo(xLo, bracketY);
      ctx.lineTo(xHi, bracketY);
      ctx.lineTo(xHi, traceY - 6);
      ctx.stroke();
      ctx.font = mono;
      ctx.fillStyle = 'rgba(141,149,173,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(String(tgtLo), xLo, bracketY - 7);
      ctx.fillText(String(tgtHi), xHi, bracketY - 7);
    }

    // Past checkpoints leave a tick: cyan = states matched, violet = differed.
    const done = phase === 'round' ? roundIdx : phase === 'verdict' || phase === 'rest' ? rounds.length : 0;
    for (let r = 0; r < done; r++) {
      const rd = rounds[r]!;
      const x = padX + rd.m * stepW;
      ctx.strokeStyle = rd.agree ? 'rgba(34,211,238,0.55)' : 'rgba(139,92,246,0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, traceY - 3);
      ctx.lineTo(x, traceY - 11);
      ctx.stroke();
    }

    // Active probe: drop a line at the midpoint state, then hold to compare.
    let line2 = '';
    let line2Color = 'rgba(141,149,173,0.95)';
    if (phase === 'round') {
      const rd = rounds[roundIdx]!;
      const x = padX + rd.m * stepW;
      const drop = Math.min(1, pt / DUR.probe);
      const yEnd = bracketY + (traceY + traceH + 16 - bracketY) * drop;
      ctx.strokeStyle = 'rgba(103,232,249,0.85)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, bracketY);
      ctx.lineTo(x, yEnd);
      ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(x, yEnd, 0, x, yEnd, 9);
      g.addColorStop(0, 'rgba(103,232,249,0.9)');
      g.addColorStop(1, 'rgba(103,232,249,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, yEnd, 9, 0, Math.PI * 2);
      ctx.fill();
      if (pt >= DUR.probe) {
        line2 = `proposer ${stateHash(rd.m, false)} · watcher ${stateHash(rd.m, true)} ${
          rd.agree ? '✓ match — fault is to the right' : '✗ differ — fault is to the left'
        }`;
        line2Color = rd.agree ? 'rgba(34,211,238,0.95)' : 'rgba(167,139,250,0.95)';
      }
    }

    // Narration.
    let line1 = '';
    if (phase === 'propose') {
      line1 = `proposer executes ${N} steps off-chain · posts result + bond`;
    } else if (phase === 'challenge') {
      line1 = 'watcher re-executes · final state differs — challenge opened';
      line2 = `claimed ${stateHash(N, false)} · recomputed ${stateHash(N, true)} ✗`;
      line2Color = 'rgba(167,139,250,0.95)';
    } else if (phase === 'round') {
      line1 = `bisection round ${roundIdx + 1} of ${rounds.length} · checkpoint at state ${rounds[roundIdx]!.m}`;
    } else {
      line1 = `narrowed to step ${fault} — the chain re-executes just that step`;
      line2 = `${rounds.length} hash comparisons, not ${N} re-runs · fraud proven · bond slashed`;
      line2Color = 'rgba(34,211,238,0.95)';
    }
    ctx.font = mono;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(231,234,243,0.88)';
    ctx.fillText(line1, w / 2, h * 0.13);
    if (line2) {
      ctx.fillStyle = line2Color;
      ctx.fillText(line2, w / 2, h * 0.13 + fs * 1.7);
    }

    // Round progress dots.
    const dotGap = fs * 1.1;
    for (let i = 0; i < rounds.length; i++) {
      const x = w - padX - (rounds.length - 1 - i) * dotGap;
      const active = phase === 'round' && i === roundIdx;
      const filled = i < done;
      ctx.fillStyle = filled
        ? 'rgba(34,211,238,0.85)'
        : active
          ? `rgba(103,232,249,${0.4 + 0.4 * Math.sin(now / 150)})`
          : 'rgba(91,140,255,0.25)';
      ctx.beginPath();
      ctx.arc(x, h * 0.92, fs * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hint.
    ctx.fillStyle = 'rgba(141,149,173,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('tap the trace to plant the fault', padX, h * 0.92 + fs * 0.35);
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('click', onClick);
    ro.disconnect();
    canvas.remove();
  };
}
