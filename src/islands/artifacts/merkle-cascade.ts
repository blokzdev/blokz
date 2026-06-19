/**
 * Artifact: merkle-cascade — Merkle Cascade
 * Manifest: content/artifacts/merkle-cascade/manifest.json
 *
 * A depth-4 Merkle tree (16 leaves) in pure SVG. Clicking a leaf re-hashes it
 * and cascades the change to the root: path nodes light accent, the sibling
 * hashes that form the inclusion proof glow cyan, traversed edges draw in,
 * and the root flashes with its new value. Leaves are keyboard-focusable.
 *
 * Layout: shared responsive primitive. The tree SVG fills the stage; there is
 * no separate readout, so the panel/controls slots are off (tapping leaves
 * drives everything). The explainer line — de-baked from the in-SVG caption so
 * it stays legible on portrait phones — lives in the HTML caption slot and is
 * updated live as the cascade reaches the root.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
const LEAVES = 16;
const LEVELS = 5; // 16 → 8 → 4 → 2 → 1
const LEVEL_Y = [402, 322, 240, 156, 66];
const HOP_MS = 420;
const SCRAMBLE_MS = 320;
/* Tree-only viewBox: top level rect spans 53…79, bottom 389…415. Trimming the
   caption's old reserved band (it's HTML now) lets the tree fill the stage. */
const VB_Y0 = 44;
const VB_H = 380;

const randHex = () => Math.floor(Math.random() * 16).toString(16);
const fakeHash = () => Array.from({ length: 6 }, randHex).join('');

interface Node {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  tag: SVGTextElement;
  x: number;
  y: number;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageMin: 'clamp(200px, 54vw, 360px)',
    panel: false,
    controls: false,
  });
  const { stage, caption: captionSlot } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .mc-treewrap { position: absolute; inset: 0; }
    .mc-treewrap svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .mc-node rect { fill: #0d1322; stroke: rgba(124,140,255,0.18); transition: stroke .25s, fill .25s; }
    .mc-node text { fill: #8d95ad; font: 500 10px 'JetBrains Mono', monospace; transition: fill .25s; }
    .mc-leaf { cursor: pointer; }
    .mc-leaf:hover rect, .mc-leaf:focus-visible rect, .mc-shimmer rect { stroke: rgba(124,140,255,0.5); }
    .mc-leaf:focus-visible { outline: none; }
    .mc-path rect { stroke: #5b8cff; fill: rgba(91,140,255,0.13); }
    .mc-path text { fill: #ffffff; }
    .mc-proof rect { stroke: #22d3ee; fill: rgba(34,211,238,0.08); }
    .mc-proof text { fill: #67e8f9; }
    .mc-tag { fill: #22d3ee; font: 500 8px 'JetBrains Mono', monospace; letter-spacing: .12em; opacity: 0; transition: opacity .25s; }
    .mc-proof .mc-tag { opacity: 1; }
    .mc-edge { stroke: rgba(124,140,255,0.16); fill: none; transition: none; }
    .mc-edge-lit { stroke: #5b8cff; transition: stroke-dashoffset .3s ease-out; }
    .mc-root-flash rect { stroke: #67e8f9; fill: rgba(34,211,238,0.16); }

    /* HTML caption (replaces the in-SVG mc-caption explainer line) */
    .mc-caption { color: #5b6378; font: 500 11px 'JetBrains Mono', monospace;
      letter-spacing: .08em; padding: 2px 2px; }
  `;
  stage.appendChild(style);

  const treeWrap = document.createElement('div');
  treeWrap.className = 'mc-treewrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 ${VB_Y0} 800 ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Depth-4 Merkle tree of 16 leaves');
  treeWrap.appendChild(svg);
  stage.appendChild(treeWrap);

  /* ---- Build tree geometry ---- */
  const levels: Node[][] = [];
  const edges = new Map<string, { el: SVGLineElement; len: number }>();

  for (let l = 0; l < LEVELS; l++) {
    const count = LEAVES >> l;
    const row: Node[] = [];
    for (let i = 0; i < count; i++) {
      const x =
        l === 0 ? 25 + i * 50 : (levels[l - 1]![i * 2]!.x + levels[l - 1]![i * 2 + 1]!.x) / 2;
      const y = LEVEL_Y[l]!;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `mc-node${l === 0 ? ' mc-leaf' : ''}`);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x - 23));
      rect.setAttribute('y', String(y - 13));
      rect.setAttribute('width', '46');
      rect.setAttribute('height', '26');
      rect.setAttribute('rx', '6');
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y + 3.5));
      label.setAttribute('text-anchor', 'middle');
      label.textContent = fakeHash();
      const tag = document.createElementNS(NS, 'text');
      tag.setAttribute('class', 'mc-tag');
      tag.setAttribute('x', String(x));
      tag.setAttribute('y', String(y - 18));
      tag.setAttribute('text-anchor', 'middle');
      tag.textContent = 'PROOF';
      g.append(rect, label, tag);
      if (l === 0) {
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `Trace inclusion proof for leaf ${i}`);
        g.dataset.leaf = String(i);
      }
      row.push({ g, rect, label, tag, x, y });
    }
    levels.push(row);
  }

  // Edges child→parent, drawn beneath nodes.
  for (let l = 0; l < LEVELS - 1; l++) {
    for (let i = 0; i < levels[l]!.length; i++) {
      const child = levels[l]![i]!;
      const parent = levels[l + 1]![i >> 1]!;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(child.x));
      line.setAttribute('y1', String(child.y - 13));
      line.setAttribute('x2', String(parent.x));
      line.setAttribute('y2', String(parent.y + 13));
      line.setAttribute('class', 'mc-edge');
      const len = Math.hypot(parent.x - child.x, parent.y + 13 - (child.y - 13));
      edges.set(`${l}:${i}`, { el: line, len });
      svg.appendChild(line);
    }
  }
  for (const row of levels) for (const n of row) svg.appendChild(n.g);

  /* ---- HTML caption (replaces the in-SVG mc-caption explainer line) ---- */
  const caption = document.createElement('div');
  caption.className = 'mc-caption';
  caption.textContent = 'click a leaf to update it and trace its inclusion proof';
  captionSlot.appendChild(caption);

  /* ---- Cascade animation ---- */
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  };

  function scramble(node: Node) {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      rafs.delete(raf);
      node.label.textContent = fakeHash();
      if (now - start < SCRAMBLE_MS) {
        raf = requestAnimationFrame(tick);
        rafs.add(raf);
      }
    };
    raf = requestAnimationFrame(tick);
    rafs.add(raf);
  }

  function resetClasses() {
    for (const row of levels)
      for (const n of row) n.g.classList.remove('mc-path', 'mc-proof', 'mc-root-flash');
    for (const { el } of edges.values()) {
      el.classList.remove('mc-edge-lit');
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-dashoffset');
    }
  }

  function drawEdge(l: number, i: number) {
    const edge = edges.get(`${l}:${i}`);
    if (!edge) return;
    edge.el.setAttribute('stroke-dasharray', String(edge.len));
    edge.el.setAttribute('stroke-dashoffset', String(edge.len));
    edge.el.classList.add('mc-edge-lit');
    // Next frame so the transition from full offset → 0 actually runs.
    rafs.add(
      requestAnimationFrame(() => edge.el.setAttribute('stroke-dashoffset', '0')),
    );
  }

  function cascade(leaf: number) {
    timeouts.forEach((id) => clearTimeout(id));
    timeouts.clear();
    resetClasses();

    const leafNode = levels[0]![leaf]!;
    leafNode.g.classList.add('mc-path');
    scramble(leafNode);

    let idx = leaf;
    for (let l = 0; l < LEVELS - 1; l++) {
      const hopIdx = idx;
      const level = l;
      later(() => {
        const sibling = levels[level]![hopIdx ^ 1]!;
        const parent = levels[level + 1]![hopIdx >> 1]!;
        sibling.g.classList.add('mc-proof');
        drawEdge(level, hopIdx);
        drawEdge(level, hopIdx ^ 1);
        parent.g.classList.add('mc-path');
        scramble(parent);
        if (level === LEVELS - 2) {
          parent.g.classList.add('mc-root-flash');
          caption.textContent = `4 sibling hashes prove leaf #${leaf} → new root ${'✓'}`;
          later(() => parent.g.classList.remove('mc-root-flash'), 900);
        }
      }, (l + 1) * HOP_MS);
      idx >>= 1;
    }
  }

  /* ---- Interaction (delegated) ---- */
  const onClick = (e: Event) => {
    const leafEl = (e.target as Element).closest<SVGGElement>('[data-leaf]');
    if (leafEl) cascade(Number(leafEl.dataset.leaf));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const leafEl = (e.target as Element).closest<SVGGElement>('[data-leaf]');
    if (leafEl) {
      e.preventDefault();
      cascade(Number(leafEl.dataset.leaf));
    }
  };
  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKey);

  // Idle shimmer: a random leaf glints every ~6s while the tab is visible.
  const shimmer = setInterval(() => {
    if (document.hidden) return;
    const leaf = levels[0]![Math.floor(Math.random() * LEAVES)]!;
    leaf.g.classList.add('mc-shimmer');
    later(() => leaf.g.classList.remove('mc-shimmer'), 1200);
  }, 6000);

  return () => {
    clearInterval(shimmer);
    timeouts.forEach((id) => clearTimeout(id));
    rafs.forEach((id) => cancelAnimationFrame(id));
    svg.removeEventListener('click', onClick);
    svg.removeEventListener('keydown', onKey);
    layout.dispose();
    style.remove();
  };
}
