/**
 * Artifact: attention-lens — Attention Lens
 * Manifest: content/artifacts/attention-lens/manifest.json
 *
 * A synthetic single-head attention matrix over a fixed sentence, rendered as
 * Bézier arcs from the focused token to every other token (width and alpha ∝
 * weight, eased between focus changes) with token glow ∝ incoming attention.
 * Hover or tap focuses a token; idle, the lens auto-cycles every 2.5s and
 * stands down for 8s after user input. Canvas 2D, DPR-aware (capped at 2).
 */

const TOKENS = ['the', 'agent', 'signs', 'the', 'transaction', 'and', 'the', 'chain', 'verifies', 'it'];

// Plausible linguistic structure: verbs → objects, subjects → verbs,
// pronoun coreference, determiners → following nouns.
const BOOSTS: Array<[number, number, number]> = [
  [1, 2, 2.2], // agent → signs
  [2, 4, 2.6], // signs → transaction
  [7, 8, 2.2], // chain → verifies
  [8, 4, 1.8], // verifies → transaction
  [9, 4, 2.4], // it → transaction (coreference)
  [0, 1, 1.6], // the → agent
  [3, 4, 1.6], // the → transaction
  [6, 7, 1.6], // the → chain
  [8, 9, 1.2], // verifies → it
];

function buildMatrix(): number[][] {
  let s = 1337;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const n = TOKENS.length;
  const logits = Array.from({ length: n }, () => Array.from({ length: n }, () => rand() * 0.8));
  for (const [i, j, w] of BOOSTS) {
    logits[i]![j]! += w;
    logits[j]![i]! += w * 0.45; // attention is asymmetric but related
  }
  return logits.map((row, i) =>
    (() => {
      const exps = row.map((v, j) => (i === j ? 0 : Math.exp(v * 1.6)));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map((e) => e / sum);
    })(),
  );
}

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const matrix = buildMatrix();
  const n = TOKENS.length;
  let focus = 1;
  const current = [...matrix[focus]!];

  let W = 0;
  let H = 0;
  let dpr = 1;
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];

  function layout() {
    dpr = Math.min(window.devicePixelRatio, 2);
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    boxes.length = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `500 ${Math.max(11, Math.min(15, W / 56))}px 'JetBrains Mono', monospace`;
    const padX = Math.max(10, W * 0.018);
    const gap = Math.max(6, W * 0.012);
    const widths = TOKENS.map((t) => ctx.measureText(t).width + padX * 2);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
    const boxH = Math.max(26, Math.min(36, H * 0.13));
    let x = (W - total) / 2;
    const y = H - boxH - Math.max(14, H * 0.07);
    for (let i = 0; i < n; i++) {
      boxes.push({ x, y, w: widths[i]!, h: boxH });
      x += widths[i]! + gap;
    }
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  /* ---- Interaction ---- */
  let lastInput = -Infinity;
  const hit = (e: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    return boxes.findIndex(
      (b) => px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 8 && py <= b.y + b.h + 8,
    );
  };
  const onPointer = (e: PointerEvent) => {
    const i = hit(e);
    if (i >= 0) {
      focus = i;
      lastInput = performance.now();
    }
  };
  canvas.addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('pointerdown', onPointer);

  /* ---- Render loop ---- */
  let rafId = 0;
  let lastT = performance.now();
  let cycleAt = 0;

  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) return;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    // Idle auto-cycle, suspended for 8s after user input.
    if (now - lastInput > 8000 && now > cycleAt) {
      focus = (focus + 1) % n;
      cycleAt = now + 2500;
    }

    // Ease the displayed weights toward the focused row.
    const target = matrix[focus]!;
    const k = 1 - Math.exp(-dt * 7);
    for (let j = 0; j < n; j++) current[j]! += (target[j]! - current[j]!) * k;

    ctx.clearRect(0, 0, W, H);
    const fb = boxes[focus]!;
    const fx = fb.x + fb.w / 2;
    const fy = fb.y;

    // Attention arcs from the focused token.
    for (let j = 0; j < n; j++) {
      if (j === focus) continue;
      const w = current[j]!;
      if (w < 0.015) continue;
      const b = boxes[j]!;
      const tx = b.x + b.w / 2;
      const span = Math.abs(tx - fx);
      const peak = Math.min(fy - 24 - span * 0.36, fy - 24);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo((fx + tx) / 2, peak, tx, b.y);
      const hue = 190 + 70 * w; // cyan → violet as weight rises
      ctx.strokeStyle = `hsl(${hue} 85% 70% / ${0.15 + w * 0.8})`;
      ctx.lineWidth = 0.8 + w * 5;
      ctx.stroke();
    }

    // Token boxes; glow ∝ incoming attention from the focused token.
    for (let j = 0; j < n; j++) {
      const b = boxes[j]!;
      const w = j === focus ? 1 : current[j]!;
      const isFocus = j === focus;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 8);
      if (isFocus) {
        ctx.fillStyle = 'rgba(91,140,255,0.18)';
        ctx.strokeStyle = 'rgba(91,140,255,0.9)';
        ctx.shadowColor = 'rgba(91,140,255,0.8)';
        ctx.shadowBlur = 18;
      } else {
        ctx.fillStyle = `rgba(13,19,34,0.9)`;
        ctx.strokeStyle = `hsl(190 85% 70% / ${0.15 + w * 0.7})`;
        ctx.shadowColor = 'rgba(34,211,238,0.7)';
        ctx.shadowBlur = w * 22;
      }
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isFocus ? '#ffffff' : `rgba(231,234,243,${0.45 + w * 0.55})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TOKENS[j]!, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }

    // Focused row caption.
    ctx.fillStyle = 'rgba(91,99,120,0.9)';
    ctx.textAlign = 'left';
    ctx.font = `500 10px 'JetBrains Mono', monospace`;
    ctx.fillText(`attention(“${TOKENS[focus]}” → …)`, 16, 20);
    ctx.font = `500 ${Math.max(11, Math.min(15, W / 56))}px 'JetBrains Mono', monospace`;
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onPointer);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.remove();
  };
}
