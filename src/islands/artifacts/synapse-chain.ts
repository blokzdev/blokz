/**
 * Artifact: synapse-chain — Synapse Chain
 * Manifest: content/artifacts/synapse-chain/manifest.json
 *
 * The brand visual as an explorable scene: shares its geometry with the
 * homepage hero via src/lib/synapse-geometry.ts. Drag to orbit; a click
 * (without dragging) fires a "thought" — a particle cohort surges across
 * the bridge at 3× speed and mints a lattice block when it lands.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { buildSynapse } from '@/lib/synapse-geometry';
import { attachOrbit, hapticTick } from '@/lib/orbit';

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const small = isSmallScreen();
  const synapse = buildSynapse({
    brainCount: small ? 300 : 600,
    bridgeCount: small ? 140 : 280,
  });

  const orbit = attachOrbit(canvas, {
    ambient: 0.05,
    onTap: () => {
      synapse.fireThought();
      hapticTick();
    },
  });

  let last = 0;
  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - last, 0.05);
      last = t;
      synapse.update(t, dt);
      synapse.group.rotation.y += orbit.step(dt);
    },
    { z: 42 },
  );

  handle.scene.add(synapse.group);
  handle.scene.fog = new THREE.Fog(0x05070d, 30, 115);

  return () => {
    orbit.dispose();
    synapse.dispose();
    handle.dispose();
    canvas.remove();
  };
}
