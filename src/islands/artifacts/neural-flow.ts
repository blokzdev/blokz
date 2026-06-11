/**
 * Artifact: neural-flow — a 2D canvas animation of forward passes through a
 * small feed-forward network. Click/tap fires an extra pass.
 * Manifest: content/artifacts/neural-flow/manifest.json
 */
export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const LAYERS = [4, 7, 7, 5, 2];
  let nodes: Array<{ x: number; y: number; layer: number; heat: number }> = [];
  let edges: Array<{ a: number; b: number; w: number }> = [];

  function layout() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = container.clientWidth;
    const h = container.clientHeight;
    const padX = w * 0.12;
    nodes = [];
    edges = [];
    LAYERS.forEach((count, li) => {
      const x = padX + (li / (LAYERS.length - 1)) * (w - padX * 2);
      for (let n = 0; n < count; n++) {
        const y = (h / (count + 1)) * (n + 1);
        nodes.push({ x, y, layer: li, heat: 0 });
      }
    });
    let offset = 0;
    for (let li = 0; li < LAYERS.length - 1; li++) {
      const a0 = offset;
      const b0 = offset + LAYERS[li]!;
      for (let a = 0; a < LAYERS[li]!; a++)
        for (let b = 0; b < LAYERS[li + 1]!; b++)
          edges.push({ a: a0 + a, b: b0 + b, w: 0.25 + Math.random() * 0.75 });
      offset += LAYERS[li]!;
    }
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(container);

  // Signals travel one inter-layer hop in HOP_MS; a forward pass is a wave.
  const HOP_MS = 420;
  let passes: number[] = [performance.now()];
  const firePass = () => {
    passes.push(performance.now());
    if (passes.length > 6) passes.shift();
  };
  canvas.addEventListener('click', firePass);
  const auto = setInterval(firePass, 3200);

  let rafId = 0;
  const draw = (now: number) => {
    rafId = requestAnimationFrame(draw);
    if (document.hidden) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Edges.
    for (const e of edges) {
      const A = nodes[e.a]!;
      const B = nodes[e.b]!;
      ctx.strokeStyle = `rgba(91, 108, 255, ${0.05 + e.w * 0.07})`;
      ctx.lineWidth = e.w;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    // Signals: for each active pass, position within the current hop.
    passes = passes.filter((t0) => now - t0 < HOP_MS * LAYERS.length);
    for (const t0 of passes) {
      const progress = (now - t0) / HOP_MS; // in units of hops
      const hop = Math.floor(progress);
      if (hop >= LAYERS.length - 1) continue;
      const frac = progress - hop;
      for (const e of edges) {
        if (nodes[e.a]!.layer !== hop) continue;
        const A = nodes[e.a]!;
        const B = nodes[e.b]!;
        const x = A.x + (B.x - A.x) * frac;
        const y = A.y + (B.y - A.y) * frac;
        const r = 1.2 + e.w * 1.6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(103, 232, 249, ${0.55 * e.w})`);
        g.addColorStop(1, 'rgba(103, 232, 249, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        if (frac > 0.92) nodes[e.b]!.heat = 1;
      }
    }

    // Nodes with cooling activation glow.
    for (const n of nodes) {
      n.heat *= 0.95;
      const r = 3.2 + n.heat * 2.5;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
      g.addColorStop(0, `rgba(139, 92, 246, ${0.35 + n.heat * 0.5})`);
      g.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(231, 234, 243, ${0.7 + n.heat * 0.3})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    clearInterval(auto);
    canvas.removeEventListener('click', firePass);
    ro.disconnect();
    canvas.remove();
  };
}
