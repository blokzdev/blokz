/**
 * Artifact: falsifier-gate — the load-bearing stage of an agentic audit
 * swarm, animated. Hypothesis particles leave the contract and hold at the
 * Falsifier gate while a proof-of-concept "runs": hallucinated findings
 * burst into debris, executable ones pass through and stack up in the
 * report. Tap a code line to plant a bug and watch the swarm catch it.
 * Manifest: content/artifacts/falsifier-gate/manifest.json
 */

// Token palette (docs/DESIGN-SYSTEM.md) as "r, g, b" for rgba() templating.
const ACCENT = '91, 140, 255';
const VIOLET = '139, 92, 246';
const CYAN = '34, 211, 238';
const TEXT = '231, 234, 243';
const MUTED = '141, 149, 173';
const FAINT = '91, 99, 120';

// Layout in unit space (fractions of stage width/height) so state survives
// resizes without re-projection.
const PANEL_X0 = 0.055;
const PANEL_X1 = 0.315;
const GATE_X = 0.6;
const REPORT_X0 = 0.7;
const REPORT_X1 = 0.95;
const LINE_Y0 = 0.2;
const LINE_Y1 = 0.87;

const FLY_S = 1.5; // contract → gate
const TEST_S = 0.95; // PoC run at the gate
const PASS_S = 0.75; // gate → report
const MAX_ROWS = 6;
const MAX_HYPOS = 8;
const REAL_ODDS = 0.3; // most raw LLM hypotheses don't survive the PoC

type Phase = 'fly' | 'test' | 'pass';

interface Hypo {
  line: number;
  real: boolean;
  planted: boolean;
  phase: Phase;
  t: number; // seconds within the current phase
  x0: number;
  y0: number;
  yGate: number;
  bend: number;
  slotY: number;
  seed: number;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Row {
  len: number;
  glow: number;
  planted: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const quad = (a: number, c: number, b: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'width:100%;height:100%;display:block;cursor:pointer;touch-action:manipulation;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  // The "contract": indent follows a random walk so the bars read as code.
  const LINE_COUNT = container.clientWidth < 560 ? 10 : 13;
  let depth = 0;
  const lines = Array.from({ length: LINE_COUNT }, () => {
    if (Math.random() < 0.45) depth += Math.random() < 0.5 ? -1 : 1;
    depth = Math.max(0, Math.min(2, depth));
    return { indent: depth * 0.045, len: 0.32 + Math.random() * 0.5, heat: 0, bug: false };
  });
  const lineY = (i: number) => LINE_Y0 + ((LINE_Y1 - LINE_Y0) * i) / (LINE_COUNT - 1);
  const lineEndX = (i: number) => {
    const l = lines[i]!;
    return PANEL_X0 + 0.012 + l.indent + l.len * (PANEL_X1 - PANEL_X0 - 0.024 - l.indent);
  };
  const rowY = (k: number) => 0.215 + k * 0.113;

  const hypos: Hypo[] = [];
  const shards: Shard[] = [];
  const rows: Row[] = [];
  const pending: Array<{ line: number; in: number }> = [];
  const stats = { proposed: 0, falsified: 0, confirmed: 0 };

  function spawn(line: number, real: boolean, planted = false) {
    hypos.push({
      line,
      real,
      planted,
      phase: 'fly',
      t: 0,
      x0: lineEndX(line),
      y0: lineY(line),
      yGate: 0.52 + (Math.random() - 0.5) * 0.46,
      bend: (Math.random() - 0.5) * 0.3,
      slotY: 0,
      seed: Math.random() * Math.PI * 2,
    });
    lines[line]!.heat = 1;
    stats.proposed++;
  }

  function pos(h: Hypo, t = h.t): { x: number; y: number } {
    if (h.phase === 'fly') {
      const e = smooth(Math.min(t / FLY_S, 1));
      const cy = (h.y0 + h.yGate) / 2 + h.bend;
      return { x: quad(h.x0, (h.x0 + GATE_X) / 2, GATE_X, e), y: quad(h.y0, cy, h.yGate, e) };
    }
    if (h.phase === 'test') return { x: GATE_X, y: h.yGate };
    const e = smooth(Math.min(t / PASS_S, 1));
    const xEnd = REPORT_X0 + 0.012;
    const cy = (h.yGate + h.slotY) / 2 + h.bend * 0.5;
    return { x: quad(GATE_X, (GATE_X + xEnd) / 2, xEnd, e), y: quad(h.yGate, cy, h.slotY, e) };
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  const onPointer = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width;
    const fy = (ev.clientY - r.top) / r.height;
    if (fx < PANEL_X1 + 0.03) {
      // Plant a real bug on the nearest code line; the swarm hunts it down.
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < LINE_COUNT; i++) {
        const d = Math.abs(lineY(i) - fy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (!lines[best]!.bug) {
        lines[best]!.bug = true;
        pending.push({ line: best, in: 0.45 });
      }
    } else {
      // Provoke the swarm: a burst of fresh hypotheses, usual survival odds.
      for (let k = 0; k < 3; k++)
        spawn(Math.floor(Math.random() * LINE_COUNT), Math.random() < REAL_ODDS);
    }
  };
  canvas.addEventListener('pointerdown', onPointer);

  // Open with one survivor so the full pipeline is visible immediately.
  spawn(Math.floor(Math.random() * LINE_COUNT), true);

  let spawnIn = 0.6;
  let sweep = 0;
  let last = 0;
  let rafId = 0;

  const frame = (now: number) => {
    rafId = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    // ---- simulate ----
    spawnIn -= dt;
    if (spawnIn <= 0 && hypos.length < MAX_HYPOS) {
      spawn(Math.floor(Math.random() * LINE_COUNT), Math.random() < REAL_ODDS);
      spawnIn = 1.1 + Math.random() * 0.9;
    }

    for (const p of [...pending]) {
      p.in -= dt;
      if (p.in <= 0) {
        lines[p.line]!.bug = false;
        spawn(p.line, true, true);
        pending.splice(pending.indexOf(p), 1);
      }
    }

    // Mapper sweep: a scan beam that warms the lines it passes.
    sweep = (sweep + dt / 7) % 1;
    const sweepY = LINE_Y0 - 0.04 + (LINE_Y1 - LINE_Y0 + 0.08) * sweep;
    const decay = Math.exp(-dt * 2.4); // refresh-rate independent cooling
    lines.forEach((l, i) => {
      if (Math.abs(lineY(i) - sweepY) < 0.015) l.heat = Math.max(l.heat, 0.55);
      l.heat *= decay;
    });

    for (const hyp of [...hypos]) {
      hyp.t += dt;
      if (hyp.phase === 'fly' && hyp.t >= FLY_S) {
        hyp.phase = 'test';
        hyp.t = 0;
      } else if (hyp.phase === 'test' && hyp.t >= TEST_S) {
        if (hyp.real) {
          hyp.phase = 'pass';
          hyp.t = 0;
          hyp.slotY = rowY(Math.min(rows.length, MAX_ROWS - 1));
        } else {
          // Falsified: no compiling PoC, no finding.
          for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = 0.04 + Math.random() * 0.1;
            shards.push({
              x: GATE_X,
              y: hyp.yGate,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              life: 0.55 + Math.random() * 0.3,
            });
          }
          stats.falsified++;
          hypos.splice(hypos.indexOf(hyp), 1);
        }
      } else if (hyp.phase === 'pass' && hyp.t >= PASS_S) {
        rows.push({ len: 0.45 + Math.random() * 0.5, glow: 1, planted: hyp.planted });
        if (rows.length > MAX_ROWS) rows.shift();
        stats.confirmed++;
        hypos.splice(hypos.indexOf(hyp), 1);
      }
    }

    for (const s of [...shards]) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) shards.splice(shards.indexOf(s), 1);
    }
    rows.forEach((r) => (r.glow *= decay));

    // ---- draw ----
    ctx.clearRect(0, 0, w, h);
    const fs = Math.max(9, Math.min(13, h * 0.027));
    ctx.font = `500 ${fs}px "JetBrains Mono", ui-monospace, monospace`;

    // Panel hairlines.
    ctx.strokeStyle = 'rgba(124, 140, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PANEL_X0 * w - 10, 0.145 * h, (PANEL_X1 - PANEL_X0) * w + 20, 0.79 * h, 10);
    ctx.roundRect(REPORT_X0 * w - 10, 0.145 * h, (REPORT_X1 - REPORT_X0) * w + 20, 0.79 * h, 10);
    ctx.stroke();

    // Stage labels.
    ctx.fillStyle = `rgba(${FAINT}, 1)`;
    ctx.textAlign = 'left';
    ctx.fillText('contract.sol', PANEL_X0 * w - 10, 0.115 * h);
    ctx.fillText('report', REPORT_X0 * w - 10, 0.115 * h);
    ctx.textAlign = 'center';
    ctx.fillText('falsifier', GATE_X * w, 0.115 * h);
    if (w >= 560) ctx.fillText('no poc, no finding', GATE_X * w, 0.97 * h);

    // Mapper scan beam.
    if (sweepY > 0.16 && sweepY < 0.92) {
      const beam = ctx.createLinearGradient(PANEL_X0 * w - 10, 0, PANEL_X1 * w + 10, 0);
      beam.addColorStop(0, `rgba(${ACCENT}, 0)`);
      beam.addColorStop(0.5, `rgba(${ACCENT}, 0.3)`);
      beam.addColorStop(1, `rgba(${ACCENT}, 0)`);
      ctx.strokeStyle = beam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PANEL_X0 * w - 10, sweepY * h);
      ctx.lineTo(PANEL_X1 * w + 10, sweepY * h);
      ctx.stroke();
    }

    // Contract lines (+ planted-bug markers in the gutter).
    const bh = Math.max(2.5, h * 0.011);
    lines.forEach((l, i) => {
      const y = lineY(i) * h;
      const x = (PANEL_X0 + 0.012 + l.indent) * w;
      ctx.fillStyle = `rgba(${ACCENT}, ${0.2 + l.heat * 0.55})`;
      ctx.beginPath();
      ctx.roundRect(x, y - bh / 2, lineEndX(i) * w - x, bh, bh / 2);
      ctx.fill();
      if (l.bug) {
        const gx = PANEL_X0 * w - 3;
        const pr = 2.5 + Math.sin(now * 0.008) * 1;
        const g = ctx.createRadialGradient(gx, y, 0, gx, y, pr * 4);
        g.addColorStop(0, `rgba(${CYAN}, 0.9)`);
        g.addColorStop(1, `rgba(${CYAN}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, y, pr * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // The Falsifier gate: a shimmering dashed barrier.
    ctx.save();
    ctx.strokeStyle = `rgba(${VIOLET}, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.lineDashOffset = -now * 0.012;
    ctx.beginPath();
    ctx.moveTo(GATE_X * w, 0.15 * h);
    ctx.lineTo(GATE_X * w, 0.93 * h);
    ctx.stroke();
    ctx.restore();

    // Report rows: severity dot + finding bar, glow cooling after arrival.
    const rbh = Math.max(4, h * 0.03);
    rows.forEach((r, k) => {
      const y = rowY(k) * h;
      const x0 = (REPORT_X0 + 0.012) * w;
      const maxLen = (REPORT_X1 - REPORT_X0 - 0.045) * w;
      ctx.fillStyle = `rgba(${CYAN}, ${0.5 + r.glow * 0.5})`;
      ctx.beginPath();
      ctx.arc(x0, y, rbh * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${CYAN}, ${0.16 + r.glow * 0.4})`;
      ctx.beginPath();
      ctx.roundRect(x0 + rbh * 0.8, y - rbh / 2, r.len * maxLen, rbh, rbh / 2);
      ctx.fill();
    });

    // Debris from falsified hypotheses.
    for (const s of shards) {
      ctx.fillStyle = `rgba(${VIOLET}, ${Math.max(s.life, 0) * 0.55})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hypotheses: trail, glowing core, and PoC rings while under test.
    for (const hyp of hypos) {
      const { x, y } = pos(hyp);
      const col = hyp.planted || hyp.phase === 'pass' ? CYAN : VIOLET;
      const jx = hyp.phase === 'test' ? Math.sin(now * 0.03 + hyp.seed) * 1.5 : 0;
      const px = x * w + jx;
      const py = y * h;
      if (hyp.phase !== 'test') {
        for (let k = 1; k <= 4; k++) {
          const tp = pos(hyp, Math.max(hyp.t - k * 0.05, 0));
          ctx.fillStyle = `rgba(${col}, ${0.3 * (1 - k / 5)})`;
          ctx.beginPath();
          ctx.arc(tp.x * w, tp.y * h, 2.2 * (1 - k / 6), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const g = ctx.createRadialGradient(px, py, 0, px, py, 12);
      g.addColorStop(0, `rgba(${col}, 0.9)`);
      g.addColorStop(0.25, `rgba(${col}, 0.4)`);
      g.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${TEXT}, 0.95)`;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      if (hyp.phase === 'test') {
        for (const off of [0, 0.5]) {
          const fr = (hyp.t / TEST_S + off) % 1;
          ctx.strokeStyle = `rgba(${col}, ${(1 - fr) * 0.45})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(px, py, 4 + fr * Math.min(w * 0.04, 30), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Tally.
    ctx.textAlign = 'left';
    let cx = PANEL_X0 * w - 10;
    const cy = 0.97 * h;
    const stat = (label: string, n: number, col: string) => {
      ctx.fillStyle = `rgba(${col}, 0.9)`;
      ctx.beginPath();
      ctx.arc(cx + 3, cy - fs * 0.32, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${MUTED}, 0.9)`;
      const text = `${label} ${n}`;
      ctx.fillText(text, cx + 9, cy);
      cx += ctx.measureText(text).width + 9 + fs * 1.4;
    };
    stat('proposed', stats.proposed, VIOLET);
    stat('falsified', stats.falsified, FAINT);
    stat('confirmed', stats.confirmed, CYAN);
  };
  rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('pointerdown', onPointer);
    ro.disconnect();
    canvas.remove();
  };
}
