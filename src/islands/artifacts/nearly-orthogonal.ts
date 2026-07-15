/**
 * Artifact: nearly-orthogonal — Nearly Orthogonal
 * Manifest: content/artifacts/nearly-orthogonal/manifest.json
 *
 * Why DiFR's random-orthogonal-projection activation fingerprints work: in high
 * dimensions, two random vectors are almost always near-orthogonal. Each point
 * is a random unit vector in R^d; its polar angle to a fixed reference (+Y) is
 * drawn from the EXACT distribution of <u, e> for a uniform unit vector u —
 * cosine density ∝ (1 − c²)^((d−3)/2), so Var(cos) = 1/d exactly. Slide d and
 * the cloud collapses onto the equator (cos ≈ 0). The reported "spread" is the
 * measured std of the displayed cosines; it tracks the exact theory 1/√d.
 *
 * This is a mathematical demonstration (no measured/sourced data → no data.json).
 * It complements `the-activation-receipt`, which shows *that* fingerprints
 * diverge under quantization; this shows *why* a random projection separates them
 * (Johnson–Lindenstrauss preserves distances because random rows are near-orthonormal).
 *
 * Contract: default-export mount(container) → cleanup releasing every resource.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit } from '@/lib/orbit';

const R = 9; // sphere radius (scene units)
const D_STEPS = [3, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
const N = isSmallScreen() ? 240 : 440; // random directions
const EXACT_MAX = 300; // sum d−1 squared gaussians below this; normal-approx above

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Exact-in-distribution cosine between a uniform unit vector in R^d and a fixed axis. */
function sampleCos(d: number): number {
  const z = randn();
  let s: number; // chi-square(d−1)
  if (d - 1 <= EXACT_MAX) {
    s = 0;
    for (let j = 0; j < d - 1; j++) {
      const g = randn();
      s += g * g;
    }
  } else {
    // normal approximation to chi-square(d−1): mean d−1, variance 2(d−1)
    s = d - 1 + Math.sqrt(2 * (d - 1)) * randn();
    if (s < 0.25) s = 0.25;
  }
  return z / Math.sqrt(z * z + s);
}

// cyan (orthogonal, common) → amber (aligned, rare)
const C_ORTH = new THREE.Color(0x22d3ee);
const C_ALIGN = new THREE.Color(0xffb020);
const _c = new THREE.Color();

export default function mount(container: HTMLElement): () => void {
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // ── HUD ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .no-hud { position:absolute;inset:0;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c7cfe6; }
    .no-stats {
      position:absolute;top:10px;left:10px;max-width:min(62%,300px);
      background:rgba(5,7,13,.72);border:1px solid rgba(124,140,255,.24);
      border-radius:8px;padding:9px 12px;font-size:11px;line-height:1.7;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .no-eyebrow { color:#8d95ad;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px; }
    .no-stats b { color:#e7eaf3;font-weight:600; }
    .no-row { display:flex;justify-content:space-between;gap:12px;min-width:0; }
    .no-row span:first-child { color:#8d95ad; }
    .no-cyan { color:#22d3ee; }
    .no-note { margin-top:7px;padding-top:6px;border-top:1px solid rgba(124,140,255,.16);color:#8d95ad;font-size:10px;line-height:1.55; }
    .no-note b { color:#8fa2ff; }
    .no-ctrl {
      position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
      pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:5px;
      background:rgba(5,7,13,.78);border:1px solid rgba(124,140,255,.24);
      border-radius:10px;padding:9px 14px;width:min(84%,360px);
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .no-ctrl-top { display:flex;justify-content:space-between;align-items:baseline;width:100%;font-size:11px;gap:10px; }
    .no-ctrl-top .no-d { color:#e7eaf3;font-weight:600;font-size:13px;text-align:right;min-width:0; }
    .no-ctrl-top .no-lbl { color:#8d95ad;letter-spacing:.1em;text-transform:uppercase;font-size:9.5px;white-space:nowrap; }
    .no-slider { width:100%;accent-color:#5b8cff;cursor:pointer;height:20px; }
    .no-hint { color:#5b6378;font-size:9.5px;text-align:center; }
  `;
  container.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'no-hud';
  const stats = document.createElement('div');
  stats.className = 'no-stats';
  hud.appendChild(stats);

  const ctrl = document.createElement('div');
  ctrl.className = 'no-ctrl';
  ctrl.innerHTML = `
    <div class="no-ctrl-top">
      <span class="no-lbl">dimension&nbsp;d</span>
      <span class="no-d"></span>
    </div>
    <input class="no-slider" type="range" min="0" max="${D_STEPS.length - 1}" step="1"
           aria-label="vector dimension d" />
    <div class="no-hint">drag the sphere to orbit · tap to mark the orthogonal plane</div>`;
  hud.appendChild(ctrl);
  container.appendChild(hud);

  const slider = ctrl.querySelector('.no-slider') as HTMLInputElement;
  const dLabel = ctrl.querySelector('.no-d') as HTMLElement;

  // ── geometry ────────────────────────────────────────────────────────────────
  const world = new THREE.Group();
  world.rotation.x = 0.42; // fixed 3/4 tilt so the equator reads as an ellipse

  // faint geodesic globe for spatial reference
  const globe = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(R, 2)),
    new THREE.LineBasicMaterial({
      color: 0x5b8cff, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  world.add(globe);

  // equator ring (the plane orthogonal to the reference)
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
  }
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  world.add(ring);

  // orthogonal-plane disk, revealed on tap
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.985, 64),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  disk.rotation.x = -Math.PI / 2;
  world.add(disk);

  // reference axis (+Y) with a marker cap
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -R * 1.06, 0), new THREE.Vector3(0, R * 1.06, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0xe7eaf3, transparent: true, opacity: 0.5 }),
  );
  world.add(axis);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  cap.position.y = R * 1.06;
  world.add(cap);

  // the point cloud of random directions
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const azim = new Float32Array(N); // fixed azimuth per point
  const curCos = new Float32Array(N);
  const tgtCos = new Float32Array(N);
  for (let i = 0; i < N; i++) azim[i] = Math.random() * Math.PI * 2;

  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  cloudGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const cloud = new THREE.Points(
    cloudGeo,
    new THREE.PointsMaterial({
      size: isSmallScreen() ? 0.34 : 0.26,
      sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  world.add(cloud);

  function writePoint(i: number) {
    const c = curCos[i];
    const r = Math.sqrt(Math.max(0, 1 - c * c)) * R;
    posArr[i * 3] = Math.cos(azim[i]) * r;
    posArr[i * 3 + 1] = c * R;
    posArr[i * 3 + 2] = Math.sin(azim[i]) * r;
    const t = Math.min(1, Math.abs(c) / 0.6); // saturate colour by |cos|
    _c.copy(C_ORTH).lerp(C_ALIGN, t * t);
    colArr[i * 3] = _c.r;
    colArr[i * 3 + 1] = _c.g;
    colArr[i * 3 + 2] = _c.b;
  }

  // ── state ────────────────────────────────────────────────────────────────
  let dIdx = 0; // start at d=3 (uniform on the sphere)
  let measuredStd = 0;
  let pOrth = 0;
  let diskOn = false;
  let diskTarget = 0;

  function resample() {
    const d = D_STEPS[dIdx];
    let sum = 0;
    let sq = 0;
    let near = 0;
    for (let i = 0; i < N; i++) {
      const c = sampleCos(d);
      tgtCos[i] = c;
      sum += c;
      sq += c * c;
      if (Math.abs(c) < 0.0872) near++; // within ~5° of orthogonal (cos 85°)
    }
    const mean = sum / N;
    measuredStd = Math.sqrt(Math.max(0, sq / N - mean * mean));
    pOrth = (near / N) * 100;
    renderHud();
  }

  function renderHud() {
    const d = D_STEPS[dIdx];
    const theory = 1 / Math.sqrt(d);
    dLabel.textContent = d.toLocaleString() + (d === 4096 ? '  ·  GPT-class' : '');
    slider.value = String(dIdx);
    stats.innerHTML = `
      <div class="no-eyebrow">random unit vectors · dim ${d.toLocaleString()}</div>
      <div class="no-row"><span>angle spread (std cos)</span><b>${measuredStd.toFixed(3)}</b></div>
      <div class="no-row"><span>theory&nbsp;1/√d</span><b>${theory.toFixed(3)}</b></div>
      <div class="no-row"><span>within&nbsp;5°&nbsp;of&nbsp;⟂</span><b class="no-cyan">${pOrth.toFixed(0)}%</b></div>
      <div class="no-note">Random rows are <b>near-orthonormal</b> in high d, so DiFR's
        random projection preserves activation distances (Johnson–Lindenstrauss) and a
        swapped model can't hide.</div>`;
  }

  // initial fill (no transition on first mount)
  resample();
  for (let i = 0; i < N; i++) {
    curCos[i] = tgtCos[i];
    writePoint(i);
  }
  cloudGeo.attributes.position.needsUpdate = true;
  cloudGeo.attributes.color.needsUpdate = true;

  slider.addEventListener('input', () => {
    dIdx = Number(slider.value);
    resample(); // sets new tgtCos; frame loop eases curCos toward it
  });

  const orbit = attachOrbit(canvas, {
    ambient: 0.06,
    onTap: () => {
      diskOn = !diskOn;
      diskTarget = diskOn ? 0.09 : 0;
    },
  });

  let lastT = 0;
  const handle = createScene(canvas, (t) => {
    const dt = Math.min(t - lastT, 0.05);
    lastT = t;

    // ease cosines toward the current dimension's sample
    const k = Math.min(1, dt * 4);
    let moving = false;
    for (let i = 0; i < N; i++) {
      const diff = tgtCos[i] - curCos[i];
      if (Math.abs(diff) > 1e-4) {
        curCos[i] += diff * k;
        writePoint(i);
        moving = true;
      } else if (curCos[i] !== tgtCos[i]) {
        curCos[i] = tgtCos[i];
        writePoint(i);
        moving = true;
      }
    }
    if (moving) {
      cloudGeo.attributes.position.needsUpdate = true;
      cloudGeo.attributes.color.needsUpdate = true;
    }

    // ring brightens as the band tightens; disk eases toward its target
    const rmat = ring.material as THREE.LineBasicMaterial;
    const bandTight = 1 - Math.min(1, measuredStd / 0.58);
    rmat.opacity += (0.15 + bandTight * 0.45 - rmat.opacity) * 0.08;
    const dmat = disk.material as THREE.MeshBasicMaterial;
    dmat.opacity += (diskTarget - dmat.opacity) * 0.1;

    world.rotation.y += orbit.step(dt);
  }, { fov: 55, z: 26 });

  handle.scene.fog = new THREE.FogExp2(0x05070d, 0.012);
  handle.scene.add(world);

  return () => {
    orbit.dispose();
    handle.dispose();
    hud.remove();
    style.remove();
    canvas.remove();
  };
}
