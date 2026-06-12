import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { buildSynapse } from '@/lib/synapse-geometry';

/**
 * Homepage hero: the brand visual rendered live — a neural cluster (brain)
 * bridged by a particle stream to a block lattice (chain), i.e. the tagline.
 * Pointer movement applies a gentle parallax; the camera drifts slowly.
 * Mounted lazily; callers must check reduced-motion first.
 */
export default function mount(canvas: HTMLCanvasElement): () => void {
  const small = isSmallScreen();
  const synapse = buildSynapse({
    brainCount: small ? 350 : 700,
    bridgeCount: small ? 160 : 320,
  });

  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let last = 0;
  const handle = createScene(
    canvas,
    (t, { camera }) => {
      const dt = Math.min(t - last, 0.05);
      last = t;
      synapse.update(t, dt);
      synapse.group.rotation.y = t * 0.03 + pointer.x * 0.12;
      synapse.group.rotation.x = pointer.y * 0.07;
      camera.position.x = Math.sin(t * 0.05) * 1.5;
      camera.lookAt(0, 0, 0);
    },
    { z: 34 },
  );

  handle.scene.add(synapse.group);
  handle.scene.fog = new THREE.Fog(0x05070d, 30, 95);

  return () => {
    window.removeEventListener('pointermove', onPointer);
    handle.dispose();
  };
}
