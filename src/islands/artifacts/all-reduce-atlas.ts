/**
 * Artifact: all-reduce-atlas — The All-Reduce Atlas
 * Manifest: content/artifacts/all-reduce-atlas/manifest.json
 *
 * A self-drawn SVG world map (equirectangular, hand-traced continent
 * silhouettes — never external tiles) of why the bandwidth wall in
 * decentralized training is *geographic*. INTELLECT-1 ran across the USA,
 * Europe and Asia; the further the DiLoCo ring-all-reduce has to reach, the
 * longer every outer step waits. Switching between the three configurations
 * measured in the technical report (Table 2) redraws the ring across the
 * active node regions and a pulse crawls it — its loop time scaled to the
 * 103 → 382 → 469 s median all-reduce, so the global ring visibly drags.
 *
 * Numbers are a static snapshot of INTELLECT-1 Technical Report Table 2
 * (arXiv:2412.01152) in ./data.json — no runtime fetches. Tap a configuration
 * (or use ← / →) to switch; tap / focus a node for its region.
 *
 * Layout: shared responsive primitive (stage map · panel readout · footer
 * controls · caption note). The config switch and the median-all-reduce
 * readout are de-baked to HTML slots so they stay tappable/readable on
 * portrait phones; only the geographic map + ring-all-reduce pulse live in
 * the stage SVG.
 */
import data from '../../../content/artifacts/all-reduce-atlas/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

interface Region {
  id: string;
  label: string;
  lon: number;
  lat: number;
  continent: string;
}
interface Config {
  id: string;
  label: string;
  active: string[];
  medianAllReduceSec: number;
  mfuPct: number;
  computeUtilPct: number;
  span: string;
}

const REGIONS = data.regions as Region[];
const CONFIGS = data.configs as Config[];
const RUN = data.run as Record<string, string | number>;
const BASELINE_SEC = CONFIGS[0]!.medianAllReduceSec;

/* ---- Geometry (viewBox units) ---- */
const VB_W = 800;
const VB_H = 400;
const MAP_X0 = 24;
const MAP_X1 = 776;
const MAP_Y0 = 24;
const MAP_Y1 = 376;
const projX = (lon: number) => MAP_X0 + ((lon + 180) / 360) * (MAP_X1 - MAP_X0);
const projY = (lat: number) => MAP_Y0 + ((90 - lat) / 180) * (MAP_Y1 - MAP_Y0);

/* Hand-traced, deliberately rough continent outlines as [lon,lat] vertices.
 * A stylized basemap for context — not a precise cartographic boundary. */
const CONTINENTS: [number, number][][] = [
  // North America
  [[-168, 65], [-140, 70], [-95, 70], [-62, 60], [-55, 47], [-80, 25], [-97, 16], [-106, 23], [-123, 40], [-130, 55], [-168, 65]],
  // South America
  [[-80, 9], [-62, 10], [-35, -5], [-40, -23], [-58, -35], [-72, -52], [-75, -30], [-81, -4], [-80, 9]],
  // Europe
  [[-10, 36], [-9, 44], [0, 51], [2, 58], [28, 70], [41, 66], [40, 46], [28, 40], [10, 38], [-6, 36], [-10, 36]],
  // Africa
  [[-17, 15], [-5, 5], [10, 4], [42, 12], [51, 11], [40, -15], [20, -35], [12, -18], [8, 4], [-10, 8], [-17, 15]],
  // Asia
  [[40, 66], [60, 72], [105, 78], [140, 72], [160, 66], [145, 45], [122, 30], [105, 18], [95, 8], [80, 8], [68, 24], [55, 25], [40, 46], [40, 66]],
  // Australia
  [[114, -22], [130, -12], [145, -15], [153, -28], [140, -38], [120, -34], [114, -22]],
];

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageMin: 'clamp(190px, 50vw, 320px)',
    stageFr: '1.8fr',
  });
  const { stage, panel, controls: controlsSlot, caption: captionSlot } = layout;

  const style = document.createElement('style');
  style.textContent = `
    /* ---- Map (stage SVG) visuals ---- */
    .ara-mapwrap { position:absolute; inset:0; min-height:180px;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#080c16; }
    .ara-mapwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .ara-ocean { fill:#080c16; stroke:rgba(124,140,255,.10); }
    .ara-grat { stroke:rgba(124,140,255,.07); fill:none; }
    .ara-land { fill:#0d1322; stroke:rgba(124,140,255,.16); stroke-linejoin:round; }
    .ara-ring-glow { fill:none; stroke:#22d3ee; stroke-width:7; opacity:.14; stroke-linecap:round; }
    .ara-ring { fill:none; stroke:#5b8cff; stroke-width:1.6; stroke-linecap:round; }
    .ara-pulse { fill:#67e8f9; }
    .ara-pulse-halo { fill:#22d3ee; opacity:.22; }
    .ara-node circle.dot { fill:#0d1322; stroke:#5b6378; stroke-width:1.5; transition:stroke .3s, fill .3s; }
    .ara-node text { fill:#5b6378; font:500 9.5px 'JetBrains Mono',monospace; transition:fill .3s; }
    .ara-node.active circle.dot { fill:rgba(34,211,238,.18); stroke:#22d3ee; }
    .ara-node.active text { fill:#cdeffd; }
    .ara-node { cursor:pointer; }
    .ara-node:focus-visible { outline:none; }
    .ara-node:focus-visible circle.dot, .ara-node:hover circle.dot { stroke:#67e8f9; }
    .ara-node .halo { fill:#22d3ee; opacity:0; transition:opacity .3s; }
    .ara-node.active .halo { opacity:.10; }

    /* ---- Config switch (HTML controls slot) ---- */
    .ara-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .ara-eyebrow { font:500 10px 'JetBrains Mono',monospace; letter-spacing:.18em;
      color:#5b6378; text-transform:uppercase; }
    .ara-tabs { display:inline-flex; flex-wrap:wrap; gap:8px; flex:1; }
    .ara-tabs button { appearance:none; flex:1; min-width:96px; border:1px solid rgba(124,140,255,.18);
      border-radius:8px; background:#0d1322; color:#8d95ad;
      font:600 11px 'JetBrains Mono',monospace; padding:9px 12px; cursor:pointer;
      transition:color .25s, border-color .25s, background .25s; }
    .ara-tabs button:hover, .ara-tabs button:focus-visible { border-color:rgba(124,140,255,.42); }
    .ara-tabs button:focus-visible { outline:2px solid #5b8cff; outline-offset:-2px; }
    .ara-tabs button[aria-pressed="true"] { border-color:#22d3ee;
      background:rgba(34,211,238,.10); color:#cdeffd; }

    /* ---- Readout (HTML panel slot) ---- */
    .ara-panel { display:flex; flex-direction:column; gap:8px; height:100%;
      border:1px solid rgba(124,140,255,.16); border-radius:10px; background:#0d1322;
      padding:14px 16px; box-sizing:border-box; min-height:0; }
    .ara-p-eyebrow { font:500 10px 'JetBrains Mono',monospace; letter-spacing:.16em;
      color:#5b6378; text-transform:uppercase; }
    .ara-big { color:#67e8f9; font:600 38px 'Space Grotesk','Inter',sans-serif; line-height:1;
      font-variant-numeric:tabular-nums; }
    .ara-mult { color:#8b5cf6; font:600 12px 'JetBrains Mono',monospace; }
    .ara-stats { display:flex; flex-direction:column; gap:4px; margin-top:2px; }
    .ara-stat { color:#e7eaf3; font:500 12.5px 'JetBrains Mono',monospace;
      font-variant-numeric:tabular-nums; }
    .ara-stat .k { color:#8d95ad; }
    .ara-divider { border:0; border-top:1px solid rgba(124,140,255,.16); margin:4px 0; }
    .ara-facts { display:flex; flex-direction:column; gap:3px; }
    .ara-fact { color:#8d95ad; font:500 10.5px 'JetBrains Mono',monospace; }

    /* ---- Caption (HTML caption slot) ---- */
    .ara-caption { font:500 12px 'JetBrains Mono',monospace; color:#8d95ad;
      letter-spacing:.01em; }
    .ara-caption .hot { color:#67e8f9; }
  `;
  stage.appendChild(style);

  /* ---- Map scaffold (stage SVG) ---- */
  const mapWrap = document.createElement('div');
  mapWrap.className = 'ara-mapwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Map of decentralized training node regions and the ring all-reduce across the active continents');
  mapWrap.appendChild(svg);
  stage.appendChild(mapWrap);

  /* ---- Basemap ---- */
  const ocean = document.createElementNS(NS, 'rect');
  ocean.setAttribute('class', 'ara-ocean');
  ocean.setAttribute('x', String(MAP_X0));
  ocean.setAttribute('y', String(MAP_Y0));
  ocean.setAttribute('width', String(MAP_X1 - MAP_X0));
  ocean.setAttribute('height', String(MAP_Y1 - MAP_Y0));
  ocean.setAttribute('rx', '8');
  svg.appendChild(ocean);

  // Graticule: meridians + parallels every 30°.
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = projX(lon);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'ara-grat');
    ln.setAttribute('x1', String(x));
    ln.setAttribute('y1', String(MAP_Y0));
    ln.setAttribute('x2', String(x));
    ln.setAttribute('y2', String(MAP_Y1));
    svg.appendChild(ln);
  }
  for (let lat = 60; lat >= -60; lat -= 30) {
    const y = projY(lat);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'ara-grat');
    ln.setAttribute('x1', String(MAP_X0));
    ln.setAttribute('y1', String(y));
    ln.setAttribute('x2', String(MAP_X1));
    ln.setAttribute('y2', String(y));
    svg.appendChild(ln);
  }

  // Clip continents to the ocean rect so rough outlines never bleed out.
  const clip = document.createElementNS(NS, 'clipPath');
  clip.setAttribute('id', 'ara-mapclip');
  const clipRect = document.createElementNS(NS, 'rect');
  clipRect.setAttribute('x', String(MAP_X0));
  clipRect.setAttribute('y', String(MAP_Y0));
  clipRect.setAttribute('width', String(MAP_X1 - MAP_X0));
  clipRect.setAttribute('height', String(MAP_Y1 - MAP_Y0));
  clipRect.setAttribute('rx', '8');
  clip.appendChild(clipRect);
  svg.appendChild(clip);

  const landG = document.createElementNS(NS, 'g');
  landG.setAttribute('clip-path', 'url(#ara-mapclip)');
  for (const poly of CONTINENTS) {
    const pts = poly.map(([lon, lat]) => `${projX(lon).toFixed(1)},${projY(lat).toFixed(1)}`).join(' ');
    const pg = document.createElementNS(NS, 'polygon');
    pg.setAttribute('class', 'ara-land');
    pg.setAttribute('points', pts);
    landG.appendChild(pg);
  }
  svg.appendChild(landG);

  /* ---- Ring (drawn under nodes) ---- */
  const ringGlow = document.createElementNS(NS, 'path');
  ringGlow.setAttribute('class', 'ara-ring-glow');
  const ring = document.createElementNS(NS, 'path');
  ring.setAttribute('class', 'ara-ring');
  svg.append(ringGlow, ring);

  const pulseHalo = document.createElementNS(NS, 'circle');
  pulseHalo.setAttribute('class', 'ara-pulse-halo');
  pulseHalo.setAttribute('r', '7');
  const pulse = document.createElementNS(NS, 'circle');
  pulse.setAttribute('class', 'ara-pulse');
  pulse.setAttribute('r', '3');
  svg.append(pulseHalo, pulse);

  /* ---- Node markers ---- */
  const nodeEls = new Map<string, { g: SVGGElement }>();
  for (const r of REGIONS) {
    const x = projX(r.lon);
    const y = projY(r.lat);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ara-node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${r.label}, ${r.continent}`);
    g.dataset.region = r.id;

    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'halo');
    halo.setAttribute('cx', String(x));
    halo.setAttribute('cy', String(y));
    halo.setAttribute('r', '12');

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'dot');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '5');

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(y + 20));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = r.label;

    g.append(halo, dot, label);
    svg.appendChild(g);
    nodeEls.set(r.id, { g });
  }

  /* ---- Readout panel (HTML) ---- */
  const panelEl = document.createElement('div');
  panelEl.className = 'ara-panel';

  const pEyebrow = document.createElement('div');
  pEyebrow.className = 'ara-p-eyebrow';
  pEyebrow.textContent = 'MEDIAN ALL-REDUCE';
  const pBig = document.createElement('div');
  pBig.className = 'ara-big';
  const pMult = document.createElement('div');
  pMult.className = 'ara-mult';

  const stats = document.createElement('div');
  stats.className = 'ara-stats';
  const pMfu = document.createElement('div');
  pMfu.className = 'ara-stat';
  const pUtil = document.createElement('div');
  pUtil.className = 'ara-stat';
  stats.append(pMfu, pUtil);

  const divider = document.createElement('hr');
  divider.className = 'ara-divider';

  const factsEl = document.createElement('div');
  factsEl.className = 'ara-facts';
  const facts = [
    `${RUN.model}`,
    `${RUN.tokens} tokens · ${RUN.window}`,
    `≤${RUN.maxGpus} ${RUN.gpu} · ${RUN.providers} providers`,
    `${RUN.bandwidthReduction} bandwidth cut · int8`,
    `comm = 2–10% of training time`,
  ];
  for (const f of facts) {
    const el = document.createElement('div');
    el.className = 'ara-fact';
    el.textContent = f;
    factsEl.appendChild(el);
  }

  panelEl.append(pEyebrow, pBig, pMult, stats, divider, factsEl);
  panel.appendChild(panelEl);

  /* ---- Config switch (HTML controls slot) ---- */
  const controls = document.createElement('div');
  controls.className = 'ara-controls';

  const ctrlEyebrow = document.createElement('span');
  ctrlEyebrow.className = 'ara-eyebrow';
  ctrlEyebrow.textContent = '⬢ Configuration';

  const tabs = document.createElement('div');
  tabs.className = 'ara-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Node configuration — the three INTELLECT-1 geographic spans');
  const buttons = CONFIGS.map((cfg, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = cfg.label;
    b.dataset.config = String(i);
    b.setAttribute('aria-pressed', 'false');
    tabs.appendChild(b);
    return b;
  });

  controls.append(ctrlEyebrow, tabs);
  controlsSlot.appendChild(controls);

  /* ---- Caption (HTML) ---- */
  const caption = document.createElement('div');
  caption.className = 'ara-caption';
  captionSlot.appendChild(caption);

  /* ---- Ring geometry: connect active regions ordered W→E, then close ---- */
  function ringPath(active: string[]): string {
    const ordered = active
      .map((id) => REGIONS.find((r) => r.id === id)!)
      .sort((a, b) => a.lon - b.lon)
      .map((r) => ({ x: projX(r.lon), y: projY(r.lat) }));
    if (ordered.length < 2) return '';
    let d = `M ${ordered[0]!.x.toFixed(1)} ${ordered[0]!.y.toFixed(1)}`;
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i]!;
      const b = ordered[(i + 1) % ordered.length]!;
      // Bulge the arc toward the north pole to read as a great-circle route.
      const mx = (a.x + b.x) / 2;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const my = Math.min(a.y, b.y) - dist * 0.18 - 6;
      d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d + ' Z';
  }

  /* ---- State + render ---- */
  let current = 0;
  let ringLen = 0;
  let periodMs = 1;

  function setConfig(idx: number) {
    current = ((idx % CONFIGS.length) + CONFIGS.length) % CONFIGS.length;
    const cfg = CONFIGS[current]!;
    const activeSet = new Set(cfg.active);

    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
    for (const [id, n] of nodeEls) n.g.classList.toggle('active', activeSet.has(id));

    // Ring: redraw with a dash sweep so the new span draws in.
    const d = ringPath(cfg.active);
    ring.setAttribute('d', d);
    ringGlow.setAttribute('d', d);
    ringLen = ring.getTotalLength();
    ring.style.transition = 'none';
    ring.setAttribute('stroke-dasharray', String(ringLen));
    ring.setAttribute('stroke-dashoffset', String(ringLen));
    requestAnimationFrame(() => {
      ring.style.transition = 'stroke-dashoffset .6s ease-out';
      ring.setAttribute('stroke-dashoffset', '0');
    });

    // Pulse loop time scales with the measured all-reduce seconds.
    periodMs = cfg.medianAllReduceSec * 18;

    // Readout
    pBig.textContent = `${cfg.medianAllReduceSec} s`;
    const mult = cfg.medianAllReduceSec / BASELINE_SEC;
    pMult.textContent = current === 0 ? 'the in-country baseline' : `${mult.toFixed(1)}× the USA-only sync`;
    pMfu.innerHTML = `<span class="k">MFU </span>${cfg.mfuPct}%`;
    pUtil.innerHTML = `<span class="k">compute util </span>${cfg.computeUtilPct}%`;

    caption.innerHTML =
      `the ring spans <span class="hot">${cfg.span}</span> — every outer step waits ` +
      `<span class="hot">${cfg.medianAllReduceSec}s</span> on the slowest link`;
  }

  /* ---- Pulse animation (refresh-rate independent: phase from wall clock) ---- */
  let raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (document.hidden || ringLen === 0) return;
    const phase = (now % periodMs) / periodMs;
    const pt = ring.getPointAtLength(phase * ringLen);
    pulse.setAttribute('cx', pt.x.toFixed(1));
    pulse.setAttribute('cy', pt.y.toFixed(1));
    pulseHalo.setAttribute('cx', pt.x.toFixed(1));
    pulseHalo.setAttribute('cy', pt.y.toFixed(1));
  };

  /* ---- Interaction ---- */
  function showRegion(id: string) {
    const r = REGIONS.find((x) => x.id === id)!;
    const inRing = CONFIGS[current]!.active.includes(id);
    caption.innerHTML =
      `<span class="hot">${r.label}</span> · ${r.continent} — ` +
      (inRing ? 'in the ring this configuration' : 'idle in this configuration');
  }

  // Config switch: HTML buttons (click + Arrow-key roving) in the controls slot.
  const onTabClick = (e: Event) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-config]');
    if (btn) setConfig(Number(btn.dataset.config));
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = ((current + (e.key === 'ArrowRight' ? 1 : -1)) % CONFIGS.length + CONFIGS.length) % CONFIGS.length;
    setConfig(next);
    buttons[next]!.focus();
  };
  tabs.addEventListener('click', onTabClick);
  tabs.addEventListener('keydown', onTabKey);

  // Map nodes: tap / focus a node for its region readout (still SVG-native).
  const onNodeClick = (e: Event) => {
    const node = (e.target as Element).closest<SVGGElement>('[data-region]');
    if (node) showRegion(node.dataset.region!);
  };
  const onNodeKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = (e.target as Element).closest<SVGGElement>('[data-region]');
    if (node) {
      e.preventDefault();
      showRegion(node.dataset.region!);
    }
  };
  svg.addEventListener('click', onNodeClick);
  svg.addEventListener('keydown', onNodeKey);

  setConfig(0);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    tabs.removeEventListener('click', onTabClick);
    tabs.removeEventListener('keydown', onTabKey);
    svg.removeEventListener('click', onNodeClick);
    svg.removeEventListener('keydown', onNodeKey);
    layout.dispose();
    style.remove();
  };
}
