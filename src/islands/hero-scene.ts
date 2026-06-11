import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';

/**
 * Homepage hero: a drifting particle network — nodes and links evoking
 * blockchain topology and neural connectivity. Pointer movement applies a
 * gentle parallax. Mounted lazily; callers must check reduced-motion first.
 */
export default function mount(canvas: HTMLCanvasElement): () => void {
  const NODE_COUNT = isSmallScreen() ? 110 : 220;
  const RANGE = 46;
  const LINK_DISTANCE = 9.5;

  const positions = new Float32Array(NODE_COUNT * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RANGE * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE;
    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.018,
        (Math.random() - 0.5) * 0.018,
        (Math.random() - 0.5) * 0.018,
      ),
    );
  }

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const nodes = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({
      color: 0x7c9aff,
      size: 0.55,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Worst-case capacity; actual segment count is set per-frame via setDrawRange.
  const maxLinks = NODE_COUNT * 6;
  const linkPositions = new Float32Array(maxLinks * 6);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
  const links = new THREE.LineSegments(
    linkGeo,
    new THREE.LineBasicMaterial({
      color: 0x5b6cff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const group = new THREE.Group();
  group.add(nodes, links);

  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const handle = createScene(canvas, (t) => {
    const pos = nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < NODE_COUNT; i++) {
      const v = velocities[i]!;
      let x = pos.getX(i) + v.x;
      let y = pos.getY(i) + v.y;
      let z = pos.getZ(i) + v.z;
      if (Math.abs(x) > RANGE) v.x *= -1;
      if (Math.abs(y) > RANGE / 2) v.y *= -1;
      if (Math.abs(z) > RANGE / 2) v.z *= -1;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;

    // Rebuild links between nearby nodes.
    let seg = 0;
    for (let i = 0; i < NODE_COUNT && seg < maxLinks; i++) {
      for (let j = i + 1; j < NODE_COUNT && seg < maxLinks; j++) {
        const dx = pos.getX(i) - pos.getX(j);
        const dy = pos.getY(i) - pos.getY(j);
        const dz = pos.getZ(i) - pos.getZ(j);
        if (dx * dx + dy * dy + dz * dz < LINK_DISTANCE * LINK_DISTANCE) {
          linkPositions.set(
            [pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(j), pos.getY(j), pos.getZ(j)],
            seg * 6,
          );
          seg++;
        }
      }
    }
    linkGeo.setDrawRange(0, seg * 2);
    (linkGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    group.rotation.y = t * 0.04 + pointer.x * 0.12;
    group.rotation.x = pointer.y * 0.08;
  });

  handle.scene.add(group);
  handle.scene.fog = new THREE.Fog(0x05070d, 30, 90);

  return () => {
    window.removeEventListener('pointermove', onPointer);
    handle.dispose();
  };
}
