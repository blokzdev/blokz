import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit } from '@/lib/orbit';

/**
 * Artifact: block-mesh — a 3D blockchain network with transaction pulses
 * propagating along peer links. Drag horizontally to orbit.
 * Manifest: content/artifacts/block-mesh/manifest.json
 */
export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const NODE_COUNT = isSmallScreen() ? 60 : 110;
  const RADIUS = 17;

  // Nodes on a fuzzy sphere — reads as a p2p overlay network.
  const nodePos: THREE.Vector3[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const v = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(RADIUS * (0.75 + Math.random() * 0.45));
    nodePos.push(v);
  }

  // Connect each node to its 3 nearest peers.
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  nodePos.forEach((p, i) => {
    nodePos
      .map((q, j) => ({ j, d: p.distanceToSquared(q) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push(i < j ? [i, j] : [j, i]);
        }
      });
  });

  const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodePos);
  const nodes = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({
      color: 0x8aa6ff,
      size: 0.7,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const linePts: THREE.Vector3[] = [];
  edges.forEach(([a, b]) => linePts.push(nodePos[a]!, nodePos[b]!));
  const links = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(linePts),
    new THREE.LineBasicMaterial({
      color: 0x4d5cff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Transaction pulses: bright points lerping along random edges.
  // Speeds are per-second so 120Hz displays don't run the network 2× hot.
  const PULSES = isSmallScreen() ? 10 : 18;
  const pulses = Array.from({ length: PULSES }, () => ({
    edge: Math.floor(Math.random() * edges.length),
    t: Math.random(),
    speed: 0.24 + Math.random() * 0.6,
  }));
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSES * 3), 3));
  const pulsePoints = new THREE.Points(
    pulseGeo,
    new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 1.4,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const group = new THREE.Group();
  group.add(nodes, links, pulsePoints);

  // Pointer flick → orbit with momentum (shared model: src/lib/orbit.ts).
  const orbit = attachOrbit(canvas, { ambient: 0.1 });

  let last = 0;
  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - last, 0.05);
      last = t;
      const attr = pulseGeo.getAttribute('position') as THREE.BufferAttribute;
      pulses.forEach((p, i) => {
        p.t += p.speed * dt;
        if (p.t >= 1) {
          // Hop: continue from the node we arrived at.
          const arrivedAt = edges[p.edge]![1];
          const next = edges
            .map((e, idx) => ({ e, idx }))
            .filter(({ e }) => e[0] === arrivedAt || e[1] === arrivedAt);
          p.edge = next.length
            ? next[Math.floor(Math.random() * next.length)]!.idx
            : Math.floor(Math.random() * edges.length);
          p.t = 0;
        }
        const [a, b] = edges[p.edge]!;
        const v = new THREE.Vector3().lerpVectors(nodePos[a]!, nodePos[b]!, p.t);
        attr.setXYZ(i, v.x, v.y, v.z);
      });
      attr.needsUpdate = true;

      group.rotation.y += orbit.step(dt);
    },
    { z: 42 },
  );

  handle.scene.add(group);
  handle.scene.fog = new THREE.Fog(0x05070d, 35, 95);

  return () => {
    orbit.dispose();
    handle.dispose();
    canvas.remove();
  };
}
