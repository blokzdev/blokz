/**
 * Artifact: the-phantom-token-cloud — The Phantom Token Cloud
 *
 * Real reasoning token embeddings projected to 3D PCA space form tight
 * semantic clusters. Phantom (inflated) billing tokens scatter as noise
 * outside the cluster. CoIn's detection boundary (wireframe sphere) encloses
 * legitimate embeddings; phantom tokens land outside it.
 *
 * Drag to orbit. Toggle the inflate button to inject phantom tokens and watch
 * the detection surface respond.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit } from '@/lib/orbit';

// Seeded LCG — reproducible positions, no runtime fetches
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Cluster { cx: number; cy: number; cz: number; spread: number; count: number }

// Four reasoning-domain clusters in projected embedding space
const CLUSTERS: Cluster[] = [
  { cx: 2.8,  cy: 0.6,  cz: 1.2,  spread: 1.5, count: 55 }, // math
  { cx: -2.2, cy: 1.4,  cz: 0.8,  spread: 1.3, count: 45 }, // logic
  { cx: 0.4,  cy: -2.0, cz: 2.6,  spread: 1.4, count: 50 }, // factual
  { cx: -0.8, cy: 2.2,  cz: -1.8, spread: 1.2, count: 40 }, // code
];
const TOTAL_REAL = CLUSTERS.reduce((s, c) => s + c.count, 0); // 190
const PHANTOM_COUNT = isSmallScreen() ? 60 : 100;
const BOUNDARY_R = 6.0; // CoIn detection-sphere radius in embedding units

function buildRealPositions(rng: () => number): Float32Array {
  const pos: number[] = [];
  for (const cl of CLUSTERS) {
    for (let i = 0; i < cl.count; i++) {
      const box = () => {
        const u = Math.max(rng(), 1e-9);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
      };
      pos.push(cl.cx + box() * cl.spread, cl.cy + box() * cl.spread * 0.7, cl.cz + box() * cl.spread);
    }
  }
  return new Float32Array(pos);
}

function buildPhantomPositions(rng: () => number): Float32Array {
  const pos: number[] = [];
  const R = BOUNDARY_R * 2.1;
  for (let i = 0; i < PHANTOM_COUNT; i++) {
    let x: number, y: number, z: number;
    do {
      x = (rng() * 2 - 1) * R;
      y = (rng() * 2 - 1) * R;
      z = (rng() * 2 - 1) * R;
    } while (Math.hypot(x, y, z) < BOUNDARY_R * 0.95); // keep outside boundary
    pos.push(x, y, z);
  }
  return new Float32Array(pos);
}

function makeCloud(positions: Float32Array, color: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color, size: isSmallScreen() ? 0.16 : 0.13,
    sizeAttenuation: true,
    transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function makeWireframeSphere(): THREE.LineSegments {
  const geo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(BOUNDARY_R, 2));
  const mat = new THREE.LineBasicMaterial({
    color: 0x22ff88, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.LineSegments(geo, mat);
}

export default function mount(container: HTMLElement): () => void {
  container.style.position = 'relative';

  // ── canvas ─────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // ── HUD (built before render loop so refs are available in closure) ────────
  const hudStyle = document.createElement('style');
  hudStyle.textContent = `
    .ptc-hud { position:absolute;inset:0;pointer-events:none;font-family:ui-monospace,monospace; }
    .ptc-stats {
      position:absolute;top:10px;right:10px;
      background:rgba(4,8,20,.72);border:1px solid rgba(255,255,255,.12);
      border-radius:6px;padding:8px 12px;font-size:11px;line-height:1.85;min-width:188px;
      color:#ccd;
    }
    .ptc-stats b { color:#fff; }
    .ptc-legend { margin-top:6px;border-top:1px solid rgba(255,255,255,.1);padding-top:6px; }
    .ptc-dot { display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle; }
    .ptc-btn {
      position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
      pointer-events:all;background:rgba(4,8,20,.78);
      border:1px solid rgba(255,255,255,.22);color:#eef;
      padding:6px 20px;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;
      font-family:ui-monospace,monospace;
    }
    .ptc-btn:hover { background:rgba(255,255,255,.1); }
  `;
  container.appendChild(hudStyle);

  const hud = document.createElement('div');
  hud.className = 'ptc-hud';
  container.appendChild(hud);

  const statsEl = document.createElement('div');
  statsEl.className = 'ptc-stats';
  hud.appendChild(statsEl);

  const btn = document.createElement('button');
  btn.className = 'ptc-btn';
  btn.textContent = '⚡ Inflate billing 5×';
  hud.appendChild(btn);

  // ── scene objects ───────────────────────────────────────────────────────────
  const rng = lcg(0xd3adb33f);
  const realCloud = makeCloud(buildRealPositions(rng), 0x4488ff);
  const phantomCloud = makeCloud(buildPhantomPositions(rng), 0xff3322);
  const boundary = makeWireframeSphere();

  phantomCloud.visible = false;
  (phantomCloud.material as THREE.PointsMaterial).opacity = 0;

  const world = new THREE.Group();
  world.add(realCloud, boundary, phantomCloud);

  // ── state ────────────────────────────────────────────────────────────────
  let inflated = false;
  let phantomOpacity = 0;
  let lastT = 0;

  const orbit = attachOrbit(canvas, { ambient: 0.04 });

  const handle = createScene(canvas, (t) => {
    const dt = Math.min(t - lastT, 0.05);
    lastT = t;

    world.rotation.y += orbit.step(dt);

    // fade phantom cloud
    if (inflated && phantomOpacity < 0.9) {
      phantomOpacity = Math.min(0.9, phantomOpacity + dt * 1.6);
      phantomCloud.visible = true;
      (phantomCloud.material as THREE.PointsMaterial).opacity = phantomOpacity;
    } else if (!inflated && phantomOpacity > 0) {
      phantomOpacity = Math.max(0, phantomOpacity - dt * 1.6);
      (phantomCloud.material as THREE.PointsMaterial).opacity = phantomOpacity;
      if (phantomOpacity === 0) phantomCloud.visible = false;
    }

    // pulse boundary when inflated
    const bmat = boundary.material as THREE.LineBasicMaterial;
    const targetAlpha = inflated ? 0.4 + 0.22 * Math.abs(Math.sin(t * 3.2)) : 0.18;
    bmat.opacity += (targetAlpha - bmat.opacity) * 0.1;

    // ── HUD stats ─────────────────────────────────────────────────────────
    const detected = inflated ? Math.round(PHANTOM_COUNT * 0.947) : 0;
    const claimed = inflated ? TOTAL_REAL + PHANTOM_COUNT : TOTAL_REAL;
    const inflationPct = inflated ? Math.round((PHANTOM_COUNT / claimed) * 100) : 0;

    statsEl.innerHTML = `
      <div style="color:#778;font-size:10px;letter-spacing:.06em;margin-bottom:3px">TOKEN AUDIT</div>
      <div>Claimed: <b>${claimed}</b></div>
      <div style="color:#4af">Verified real: <b>${TOTAL_REAL + (inflated ? PHANTOM_COUNT - detected : 0)}</b></div>
      ${inflated
        ? `<div style="color:#f65">Phantom detected: <b>${detected}</b> <span style="opacity:.7">(94.7%)</span></div>
           <div style="color:#fa4">Billing inflation: <b>+${inflationPct}%</b></div>`
        : `<div style="color:#3d9">Billing: <b>clean</b></div>`}
      <div class="ptc-legend">
        <div><span class="ptc-dot" style="background:#4488ff"></span>Real CoT embeddings</div>
        ${inflated ? `<div><span class="ptc-dot" style="background:#ff3322"></span>Phantom tokens</div>` : ''}
        <div><span class="ptc-dot" style="background:#22ff88;border-radius:1px"></span>CoIn detection surface</div>
      </div>`;
  }, { fov: 50, z: 28 });

  handle.scene.background = new THREE.Color(0x060a14);
  handle.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const fill = new THREE.DirectionalLight(0x8899ff, 0.55);
  fill.position.set(-6, 8, 4);
  handle.scene.add(fill, world);

  // ── toggle ────────────────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    inflated = !inflated;
    btn.textContent = inflated ? '✓ Reset to honest billing' : '⚡ Inflate billing 5×';
  });

  return () => {
    orbit.dispose();
    handle.dispose();
    hudStyle.remove();
    hud.remove();
    canvas.remove();
  };
}
