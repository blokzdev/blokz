/**
 * Artifact: gradient-descent — Gradient Descent
 * Manifest: content/artifacts/gradient-descent/manifest.json
 *
 * An analytic loss surface (sum of seeded Gaussian bowls and mounds plus a
 * global convex term) rendered as a height-colored point field over a dim
 * wireframe. A glowing marker runs real gradient descent with momentum,
 * leaving a fading trail; on convergence it pauses and respawns. Drag to
 * orbit; a click raycasts the terrain and drops a new start point there.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit, hapticTick } from '@/lib/orbit';

const SIZE = 40; // world units per side
const ACCENT = new THREE.Color(0x5b8cff);
const VIOLET = new THREE.Color(0x8b5cf6);

// Loss surface: negative-amplitude Gaussians carve valleys, positive build peaks;
// the quadratic term keeps every descent path inside the terrain.
const BUMPS = [
  { a: 6, x: -9, z: -6, s: 6 },
  { a: -7, x: 8, z: 7, s: 7 },
  { a: 5, x: 10, z: -9, s: 5 },
  { a: -5, x: -7, z: 9, s: 6 },
  { a: 4, x: 0, z: -2, s: 9 },
];

function loss(x: number, z: number): number {
  let y = 0.015 * (x * x + z * z);
  for (const b of BUMPS) {
    y += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.s * b.s));
  }
  return y;
}

function grad(x: number, z: number): [number, number] {
  let gx = 0.03 * x;
  let gz = 0.03 * z;
  for (const b of BUMPS) {
    const e = b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.s * b.s));
    gx += e * (-(x - b.x) / (b.s * b.s));
    gz += e * (-(z - b.z) / (b.s * b.s));
  }
  return [gx, gz];
}

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;';
  container.appendChild(canvas);

  const seg = isSmallScreen() ? 44 : 88;
  const group = new THREE.Group();

  /* ---- Terrain: displaced plane → dim wireframe + height-colored points ---- */
  const plane = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.getAttribute('position') as THREE.BufferAttribute;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = loss(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.lerpColors(ACCENT, VIOLET, (pos.getY(i) - minY) / (maxY - minY));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  group.add(
    new THREE.LineSegments(
      new THREE.WireframeGeometry(plane),
      new THREE.LineBasicMaterial({
        color: 0x5b6cff,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
    new THREE.Points(
      plane,
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.28,
        transparent: true,
        opacity: 0.75,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  // Invisible solid copy of the terrain for click raycasts.
  const hitMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ visible: false }));
  group.add(hitMesh);

  /* ---- Marker + fading trail ---- */
  const markerGeo = new THREE.BufferGeometry();
  markerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const marker = new THREE.Points(
    markerGeo,
    new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 1.6,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(marker);

  const TRAIL_MAX = 360;
  const trailPos = new Float32Array(TRAIL_MAX * 3);
  let trailLen = 0;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(trail);

  /* ---- Descent state ---- */
  let px = 0;
  let pz = 0;
  let vx = 0;
  let vz = 0;
  let pausedUntil = 0;
  let needRespawn = false;
  const ETA = 0.55; // step size (per second)
  const MOMENTUM = 0.86;

  function respawn(x?: number, z?: number) {
    px = x ?? (Math.random() - 0.5) * 32;
    pz = z ?? (Math.random() - 0.5) * 32;
    vx = vz = 0;
    trailLen = 0;
    trailGeo.setDrawRange(0, 0);
  }
  respawn();

  function pushTrail(x: number, y: number, z: number) {
    if (trailLen === TRAIL_MAX) {
      trailPos.copyWithin(0, 3);
      trailLen--;
    }
    trailPos.set([x, y, z], trailLen * 3);
    trailLen++;
    trailGeo.setDrawRange(0, trailLen);
    (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /* ---- Orbit flick + tap-to-respawn (shared model: src/lib/orbit.ts) ---- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const orbit = attachOrbit(canvas, {
    ambient: 0.07,
    onTap: (e) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, handle.camera);
      const hit = raycaster.intersectObject(hitMesh, false)[0];
      if (hit) {
        const local = group.worldToLocal(hit.point.clone());
        respawn(local.x, local.z);
        pausedUntil = 0;
        needRespawn = false;
        hapticTick();
      }
    },
  });

  /* ---- Frame loop ---- */
  let last = 0;
  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - last, 0.05);
      last = t;

      if (t >= pausedUntil) {
        if (needRespawn) {
          respawn();
          needRespawn = false;
        }
        const [gx, gz] = grad(px, pz);
        vx = MOMENTUM * vx - ETA * gx * dt;
        vz = MOMENTUM * vz - ETA * gz * dt;
        px += vx;
        pz += vz;
        const speed = Math.hypot(vx, vz);
        if (Math.hypot(gx, gz) < 0.04 && speed < 0.01) {
          // Converged: linger on the minimum for a second, then start over.
          pausedUntil = t + 1;
          needRespawn = true;
        }
        const y = loss(px, pz) + 0.35;
        (markerGeo.getAttribute('position') as THREE.BufferAttribute).setXYZ(0, px, y, pz);
        (markerGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        pushTrail(px, y, pz);
      }

      group.rotation.y += orbit.step(dt);
    },
    { z: 40 },
  );

  handle.camera.position.set(0, 22, 40);
  handle.camera.lookAt(0, 0, 0);
  handle.scene.add(group);
  handle.scene.fog = new THREE.Fog(0x05070d, 40, 120);

  return () => {
    orbit.dispose();
    handle.dispose();
    canvas.remove();
  };
}
