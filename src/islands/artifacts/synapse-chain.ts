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

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;';
  container.appendChild(canvas);

  const small = isSmallScreen();
  const synapse = buildSynapse({
    brainCount: small ? 300 : 600,
    bridgeCount: small ? 140 : 280,
  });

  let dragging = false;
  let moved = false;
  let dragVel = 0;
  let lastX = 0;
  let downX = 0;
  let downY = 0;
  const down = (e: PointerEvent) => {
    dragging = true;
    moved = false;
    lastX = downX = e.clientX;
    downY = e.clientY;
    canvas.style.cursor = 'grabbing';
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    dragVel = (e.clientX - lastX) * 0.004;
    lastX = e.clientX;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
  };
  const up = () => {
    if (dragging && !moved) synapse.fireThought();
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);

  let last = 0;
  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - last, 0.05);
      last = t;
      synapse.update(t, dt);
      synapse.group.rotation.y += 0.0008 + dragVel;
      dragVel *= 0.94;
    },
    { z: 42 },
  );

  handle.scene.add(synapse.group);
  handle.scene.fog = new THREE.Fog(0x05070d, 30, 115);

  return () => {
    canvas.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    handle.dispose();
    canvas.remove();
  };
}
