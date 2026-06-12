import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { buildSynapse } from '@/lib/synapse-geometry';

/**
 * Homepage hero: the brand visual rendered live — a neural cluster (brain)
 * bridged by a particle stream to a block lattice (chain), i.e. the tagline.
 *
 * Composition adapts to the viewport: landscape runs the bridge left→right;
 * portrait rotates it vertical (brain above the headline, chain below) and
 * pulls the camera back so nothing crops. Parallax comes from the pointer on
 * desktop and from device tilt on phones (where supported — no permission
 * prompt is ever raised). Thoughts fire across the bridge on their own every
 * few seconds. Mounted lazily; callers must check reduced-motion first.
 */
export default function mount(canvas: HTMLCanvasElement): () => void {
  const small = isSmallScreen();
  const synapse = buildSynapse({
    brainCount: small ? 350 : 700,
    bridgeCount: small ? 160 : 320,
  });

  // Mobile GPUs shed contexts under memory pressure; preventing default lets
  // the browser restore it and the render loop resume instead of going black.
  const onContextLost = (e: Event) => e.preventDefault();
  canvas.addEventListener('webglcontextlost', onContextLost);

  /* ---- Parallax: pointer (desktop) or device tilt (phones) ---- */
  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    // gamma: left/right roll; beta: pitch (≈45° is a natural hold).
    const tx = clamp(e.gamma, -30, 30) / 30;
    const ty = clamp(e.beta - 45, -30, 30) / -30;
    pointer.x += (tx - pointer.x) * 0.08;
    pointer.y += (ty - pointer.y) * 0.08;
  };
  window.addEventListener('deviceorientation', onTilt);

  /* ---- Scene + frame loop ---- */
  let last = 0;
  let nextThought = 4 + Math.random() * 3;
  const handle = createScene(
    canvas,
    (t, { camera }) => {
      const dt = Math.min(t - last, 0.05);
      last = t;
      synapse.update(t, dt);

      // Ambient cognition: a thought streaks the bridge every 6–10s.
      if (t > nextThought) {
        synapse.fireThought();
        nextThought = t + 6 + Math.random() * 4;
      }

      synapse.group.rotation.y = t * 0.03 + pointer.x * 0.12;
      synapse.group.rotation.x = pointer.y * 0.07;
      camera.position.x = Math.sin(t * 0.05) * 1.5;
      camera.lookAt(0, 0, 0);
    },
    { z: 34 },
  );

  /* ---- Orientation-aware composition ---- */
  const portrait = window.matchMedia('(orientation: portrait)');
  const applyOrientation = () => {
    const p = portrait.matches;
    // Portrait: rotate the bridge vertical — brain up top, chain below the
    // fold — and step back so the full span fits the narrow viewport.
    synapse.group.rotation.z = p ? -Math.PI / 2 : 0;
    handle.camera.position.z = p ? 41 : 34;
  };
  applyOrientation();
  portrait.addEventListener('change', applyOrientation);

  handle.scene.add(synapse.group);
  handle.scene.fog = new THREE.Fog(0x05070d, 30, 100);

  // Ease the scene in instead of popping after the lazy import lands.
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 1.2s ease';
  const fadeIn = setTimeout(() => {
    canvas.style.opacity = '1';
  }, 60);

  return () => {
    clearTimeout(fadeIn);
    portrait.removeEventListener('change', applyOrientation);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('deviceorientation', onTilt);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    synapse.dispose();
    handle.dispose();
  };
}
