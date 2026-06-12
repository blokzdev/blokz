import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { buildSynapse } from '@/lib/synapse-geometry';

/**
 * Homepage hero: the brand visual rendered live — a neural cluster (brain)
 * bridged by a particle stream to a block lattice (chain), i.e. the tagline.
 *
 * Composition adapts to the viewport: landscape runs the bridge left→right;
 * portrait rotates it vertical and pulls the camera back so nothing crops.
 *
 * Input model (everything is a *target*; the frame loop applies critically-
 * damped smoothing, so no source can ever jolt the scene):
 *   - mouse position   → parallax (hover-capable devices only)
 *   - device tilt      → parallax (phones; permission-less, inert where gated)
 *   - horizontal flick → spin momentum with exponential decay
 *   - tap / click      → fires a thought across the bridge (+ a soft haptic)
 * Touch pointermove never steers parallax — on phones it used to fight the
 * tilt sensor and scroll-position jumps, which is what made the scene jitter.
 *
 * Mounted lazily; callers must check reduced-motion first.
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

  // Gestures attach to the whole hero section (text sits over the canvas).
  const stage: HTMLElement = canvas.closest('section') ?? canvas.parentElement ?? canvas;

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  /* ---- Parallax targets (smoothed in the frame loop) ---- */
  const target = new THREE.Vector2();
  const smoothed = new THREE.Vector2();

  const hoverCapable = window.matchMedia('(hover: hover)').matches;
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  if (hoverCapable) window.addEventListener('pointermove', onPointerMove, { passive: true });

  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    // gamma: left/right roll; beta: pitch (≈45° is a natural hold).
    target.x = clamp(e.gamma, -30, 30) / 30;
    target.y = clamp(e.beta - 45, -30, 30) / -30;
  };
  window.addEventListener('deviceorientation', onTilt);

  /* ---- Flick-to-spin + tap-to-fire ---- */
  let spinVel = 0; // rad/s, decays exponentially in the frame loop
  let tracking = false;
  let pointerId = -1;
  let lastX = 0;
  let lastMoveAt = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('a, button, input')) return;
    tracking = true;
    pointerId = e.pointerId;
    lastX = downX = e.clientX;
    downY = e.clientY;
    lastMoveAt = downAt = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== pointerId) return;
    const now = performance.now();
    const dt = Math.max(now - lastMoveAt, 1); // ms
    const v = ((e.clientX - lastX) / dt) * 2.2; // px/ms → rad/s feel
    spinVel = spinVel * 0.5 + v * 0.5;
    lastX = e.clientX;
    lastMoveAt = now;
  };
  const onUp = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== pointerId) return;
    tracking = false;
    const travel = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (travel < 8 && performance.now() - downAt < 400) {
      synapse.fireThought();
      navigator.vibrate?.(8); // soft haptic where supported; silently inert elsewhere
    }
  };
  // The browser fires pointercancel when it claims the gesture for scrolling —
  // drop tracking without firing, otherwise every scroll would launch thoughts.
  const onCancel = () => {
    tracking = false;
  };
  stage.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onCancel, { passive: true });

  /* ---- Scene + frame loop ---- */
  let last = 0;
  let rotY = 0;
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

      // Critically-damped parallax; flick momentum decays toward ambient drift.
      const k = 1 - Math.exp(-dt * 5);
      smoothed.x += (target.x - smoothed.x) * k;
      smoothed.y += (target.y - smoothed.y) * k;
      spinVel *= Math.exp(-dt * 1.6);
      rotY += (0.03 + spinVel) * dt;

      synapse.group.rotation.y = rotY + smoothed.x * 0.12;
      synapse.group.rotation.x = smoothed.y * 0.07;
      camera.position.x = Math.sin(t * 0.05) * 1.5;
      camera.lookAt(0, 0, 0);
    },
    { z: 34 },
  );

  /* ---- Orientation-aware composition ---- */
  const portrait = window.matchMedia('(orientation: portrait)');
  const applyOrientation = () => {
    const p = portrait.matches;
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
    if (hoverCapable) window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('deviceorientation', onTilt);
    stage.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    synapse.dispose();
    handle.dispose();
  };
}
