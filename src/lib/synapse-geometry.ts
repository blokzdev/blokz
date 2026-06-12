import * as THREE from 'three';

/**
 * Shared scene DNA for the brand visual: a neural cluster (the brain) bridged
 * by a particle stream to a cubic block lattice (the chain). Used by the
 * homepage hero (src/islands/hero-scene.ts) and the `synapse-chain` artifact
 * so the two stay in sync. All colors come from the design tokens
 * (docs/DESIGN-SYSTEM.md); everything is additive + depthWrite:false.
 */

const ACCENT = new THREE.Color(0x5b8cff);
const VIOLET = new THREE.Color(0x8b5cf6);
const CYAN = new THREE.Color(0x22d3ee);
const NODE_BLUE = new THREE.Color(0x7c9aff);

export interface SynapseOptions {
  /** Neuron count in the brain cluster. */
  brainCount: number;
  /** Particle count flowing across the bridge. */
  bridgeCount: number;
  /** Lattice nodes per axis (cube). */
  latticeSize?: number;
  /** Distance between brain and lattice centers. */
  span?: number;
}

export interface Synapse {
  group: THREE.Group;
  /** Advance the scene. `t` is elapsed seconds, `dt` the frame delta. */
  update: (t: number, dt: number) => void;
  /** A cohort of bridge particles respawns at the brain and surges across at
   *  3× speed; a lattice block mints with a flash when the cohort lands. */
  fireThought: () => void;
  /** Release resources not reachable by SceneHandle.dispose() (sprite glow
   *  material + canvas texture). Call from the artifact/hero cleanup. */
  dispose: () => void;
}

const expoOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

/* Soft round points with per-vertex color and shader-side synaptic jitter —
 * the brain shimmers without any per-frame CPU buffer writes. */
function makePointsMaterial(pixelRatio: number, jitter: number, size: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uJitter: { value: jitter },
      uSize: { value: size * pixelRatio },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uJitter;
      uniform float uSize;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec3 p = position + uJitter * vec3(
          sin(uTime * 1.7 + aPhase),
          cos(uTime * 1.3 + aPhase * 1.7),
          sin(uTime * 1.1 + aPhase * 2.3)
        );
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * aSize * (90.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d);
        gl_FragColor = vec4(vColor, a * 0.9);
      }
    `,
  });
}

export function buildSynapse({
  brainCount,
  bridgeCount,
  latticeSize = 5,
  span = 32,
}: SynapseOptions): Synapse {
  const group = new THREE.Group();
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const brainCenter = new THREE.Vector3(-span / 2, 0, 0);
  const latticeCenter = new THREE.Vector3(span / 2, 0, 0);

  /* ---- Brain: noise-clumped ellipsoid of neurons + static k-nearest links ---- */
  const lobes = Array.from({ length: 4 }, () =>
    new THREE.Vector3().randomDirection().multiply(new THREE.Vector3(4, 3, 3)),
  );
  const brainPos = new Float32Array(brainCount * 3);
  const brainCol = new Float32Array(brainCount * 3);
  const brainPhase = new Float32Array(brainCount);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < brainCount; i++) {
    const lobe = lobes[Math.floor(Math.random() * lobes.length)]!;
    const p = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(Math.pow(Math.random(), 0.6))
      .multiply(new THREE.Vector3(7.5, 6, 6))
      .add(lobe.clone().multiplyScalar(0.5))
      .add(brainCenter);
    brainPos.set([p.x, p.y, p.z], i * 3);
    // Violet core fading to node-blue at the cortex.
    const r = p.distanceTo(brainCenter) / 9;
    tmpColor.lerpColors(VIOLET, NODE_BLUE, Math.min(r, 1));
    brainCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    brainPhase[i] = Math.random() * Math.PI * 2;
  }
  const brainGeo = new THREE.BufferGeometry();
  brainGeo.setAttribute('position', new THREE.BufferAttribute(brainPos, 3));
  brainGeo.setAttribute('aColor', new THREE.BufferAttribute(brainCol, 3));
  brainGeo.setAttribute('aPhase', new THREE.BufferAttribute(brainPhase, 1));
  brainGeo.setAttribute(
    'aSize',
    new THREE.BufferAttribute(new Float32Array(brainCount).map(() => 0.8 + Math.random() * 0.5), 1),
  );
  const brainMat = makePointsMaterial(pixelRatio, 0.18, 1.5);
  group.add(new THREE.Points(brainGeo, brainMat));

  // k=2 nearest-neighbour synapses, precomputed once (no per-frame rebuild).
  const linkVerts: number[] = [];
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < brainCount; i++) {
    v.fromArray(brainPos, i * 3);
    const nearest: { d: number; j: number }[] = [];
    for (let j = 0; j < brainCount; j++) {
      if (j === i) continue;
      const d = v.distanceToSquared(w.fromArray(brainPos, j * 3));
      if (nearest.length < 2) nearest.push({ d, j });
      else if (d < nearest[nearest.length - 1]!.d) {
        nearest[nearest.length - 1] = { d, j };
      }
      nearest.sort((a, b) => a.d - b.d);
    }
    for (const { j } of nearest) {
      linkVerts.push(
        brainPos[i * 3]!, brainPos[i * 3 + 1]!, brainPos[i * 3 + 2]!,
        brainPos[j * 3]!, brainPos[j * 3 + 1]!, brainPos[j * 3 + 2]!,
      );
    }
  }
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linkVerts), 3));
  group.add(
    new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({
        color: VIOLET,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  /* ---- Chain: cubic lattice of points + minting wireframe cells ---- */
  const spacing = 3.2;
  const half = ((latticeSize - 1) * spacing) / 2;
  const latticePos = new Float32Array(latticeSize ** 3 * 3);
  const latticeCol = new Float32Array(latticeSize ** 3 * 3);
  const latticePhase = new Float32Array(latticeSize ** 3);
  let li = 0;
  for (let x = 0; x < latticeSize; x++)
    for (let y = 0; y < latticeSize; y++)
      for (let z = 0; z < latticeSize; z++) {
        latticePos.set(
          [
            latticeCenter.x + x * spacing - half,
            latticeCenter.y + y * spacing - half,
            latticeCenter.z + z * spacing - half,
          ],
          li * 3,
        );
        tmpColor.lerpColors(ACCENT, CYAN, (x + y + z) / (3 * (latticeSize - 1)));
        latticeCol.set([tmpColor.r, tmpColor.g, tmpColor.b], li * 3);
        latticePhase[li] = Math.random() * Math.PI * 2;
        li++;
      }
  const latticeGeo = new THREE.BufferGeometry();
  latticeGeo.setAttribute('position', new THREE.BufferAttribute(latticePos, 3));
  latticeGeo.setAttribute('aColor', new THREE.BufferAttribute(latticeCol, 3));
  latticeGeo.setAttribute('aPhase', new THREE.BufferAttribute(latticePhase, 1));
  latticeGeo.setAttribute(
    'aSize',
    new THREE.BufferAttribute(new Float32Array(latticeSize ** 3).fill(1), 1),
  );
  group.add(new THREE.Points(latticeGeo, makePointsMaterial(pixelRatio, 0.04, 1.2)));

  const cellEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(spacing, spacing, spacing));
  interface Cell {
    lines: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
    born: number;
  }
  const cells: Cell[] = [];
  const cellSlots = new Set<number>();
  for (let i = 0; i < 8; i++) {
    let slot = Math.floor(Math.random() * latticeSize ** 3);
    while (cellSlots.has(slot)) slot = Math.floor(Math.random() * latticeSize ** 3);
    cellSlots.add(slot);
    const mat = new THREE.LineBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(cellEdges, mat);
    lines.position.fromArray(latticePos, slot * 3);
    cells.push({ lines, born: -10 });
    group.add(lines);
  }

  /* ---- Bridge: particle stream along a sagging curve, accent→cyan ---- */
  const curve = new THREE.CatmullRomCurve3([
    brainCenter.clone().add(new THREE.Vector3(4, 1, 0)),
    new THREE.Vector3(-span / 6, -2.5, 1.5),
    new THREE.Vector3(span / 6, -2.5, -1.5),
    latticeCenter.clone().add(new THREE.Vector3(-4, 1, 0)),
  ]);
  const progress = new Float32Array(bridgeCount);
  const speed = new Float32Array(bridgeCount);
  const surging = new Uint8Array(bridgeCount);
  const offsets = new Float32Array(bridgeCount * 3);
  for (let i = 0; i < bridgeCount; i++) {
    progress[i] = Math.random();
    speed[i] = 0.05 + Math.random() * 0.07;
    const o = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 1.4);
    offsets.set([o.x, o.y, o.z], i * 3);
  }
  const bridgePos = new Float32Array(bridgeCount * 3);
  const bridgeCol = new Float32Array(bridgeCount * 3);
  const bridgePhase = new Float32Array(bridgeCount).map(() => Math.random() * Math.PI * 2);
  const bridgeBase = new Float32Array(bridgeCount).map(() => 0.85 + Math.random() * 0.45);
  const bridgeSize = new Float32Array(bridgeBase);
  const bridgeGeo = new THREE.BufferGeometry();
  bridgeGeo.setAttribute('position', new THREE.BufferAttribute(bridgePos, 3));
  bridgeGeo.setAttribute('aColor', new THREE.BufferAttribute(bridgeCol, 3));
  bridgeGeo.setAttribute('aPhase', new THREE.BufferAttribute(bridgePhase, 1));
  bridgeGeo.setAttribute('aSize', new THREE.BufferAttribute(bridgeSize, 1));
  const bridgeMat = makePointsMaterial(pixelRatio, 0, 1.1);
  group.add(new THREE.Points(bridgeGeo, bridgeMat));

  /* ---- Core glow: a soft additive bloom at mid-bridge for depth ---- */
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d')!;
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: ACCENT,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(30);
  glow.position.set(0, -2, 0);
  group.add(glow);

  /* ---- Animation state ---- */
  let lastMint = 0;
  let surgeArrivals = 0;
  const point = new THREE.Vector3();

  function mint(now: number) {
    const cell = cells[Math.floor(Math.random() * cells.length)]!;
    cell.born = now;
    lastMint = now;
  }

  function fireThought() {
    const cohort = Math.max(8, Math.floor(bridgeCount * 0.12));
    let fired = 0;
    for (let i = 0; i < bridgeCount && fired < cohort; i++) {
      if (surging[i]) continue;
      surging[i] = 1;
      progress[i] = Math.random() * 0.06;
      fired++;
    }
    surgeArrivals = fired;
  }

  function update(t: number, dt: number) {
    brainMat.uniforms.uTime!.value = t;
    bridgeMat.uniforms.uTime!.value = t;

    // Bridge particles advance; surging ones travel 3×, run bigger and
    // brighter, and mint a block on landing.
    let surgingNow = 0;
    for (let i = 0; i < bridgeCount; i++) {
      progress[i]! += speed[i]! * dt * (surging[i] ? 3 : 1);
      if (progress[i]! >= 1) {
        progress[i]! %= 1;
        if (surging[i]) {
          surging[i] = 0;
          if (--surgeArrivals <= 0) mint(t);
        }
      }
      const p = progress[i]!;
      curve.getPoint(p, point);
      const sag = Math.sin(p * Math.PI); // loose mid-span, tight at the ends
      bridgePos[i * 3] = point.x + offsets[i * 3]! * sag;
      bridgePos[i * 3 + 1] = point.y + offsets[i * 3 + 1]! * sag;
      bridgePos[i * 3 + 2] = point.z + offsets[i * 3 + 2]! * sag;
      tmpColor.lerpColors(ACCENT, CYAN, p);
      if (surging[i]) {
        tmpColor.lerp(CYAN, 0.5).multiplyScalar(1.4);
        surgingNow++;
      }
      bridgeCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
      bridgeSize[i] = surging[i] ? bridgeBase[i]! * 2 : bridgeBase[i]!;
    }
    (bridgeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (bridgeGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (bridgeGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;

    // Core glow breathes; brightens while a thought is in flight.
    glowMat.opacity = 0.2 + 0.05 * Math.sin(t * 0.7) + (surgingNow > 0 ? 0.12 : 0);

    // Lattice cells: scale-in with expo ease + decaying flash; ambient mint ~4s.
    if (t - lastMint > 4) mint(t);
    for (const cell of cells) {
      const age = t - cell.born;
      const s = expoOut(Math.min(Math.max(age / 1.2, 0), 1));
      cell.lines.scale.setScalar(Math.max(s, 0.001));
      cell.lines.material.opacity = 0.3 + 0.5 * Math.exp(-Math.max(age, 0) * 2.5);
    }
  }

  function dispose() {
    glowMat.dispose();
    glowTexture.dispose();
  }

  return { group, update, fireThought, dispose };
}
