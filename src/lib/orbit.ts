/**
 * Shared touch/drag model for every orbitable Three.js scene (hero +
 * artifacts) — the single source of truth for how rotation feels:
 *
 *   - horizontal drag/flick → angular velocity, blended per event so a flick
 *     carries momentum, decayed with exp(-dt·k) so it feels identical on
 *     60Hz and 120Hz displays (frame-count decay like `*= 0.94` does not)
 *   - a clean tap (<8px travel, <400ms) calls `onTap` — taps on links,
 *     buttons, or inputs inside the stage are ignored
 *   - pointercancel (the browser claiming a scroll) drops the gesture
 *     without firing a tap
 *
 * The helper owns cursor affordances and `touch-action: pan-y` (vertical
 * swipes keep scrolling the page; horizontal ones reach the scene).
 * Call `step(dt)` once per frame and add the returned delta to rotation.y.
 */

export interface OrbitOptions {
  /** Ambient spin in rad/s while idle. */
  ambient?: number;
  /** Fired on a clean tap; receives the pointer event (e.g. for raycasts). */
  onTap?: (e: PointerEvent) => void;
}

export interface OrbitHandle {
  /** Advance the model; returns this frame's rotation delta in radians. */
  step: (dt: number) => number;
  dispose: () => void;
}

const FLICK_GAIN = 2.2; // px/ms → rad/s
const DECAY = 1.6; // exp decay rate of momentum, 1/s

export function attachOrbit(stage: HTMLElement, { ambient = 0.05, onTap }: OrbitOptions = {}): OrbitHandle {
  stage.style.touchAction = 'pan-y';
  stage.style.cursor = 'grab';

  let vel = 0;
  let tracking = false;
  let pointerId = -1;
  let lastX = 0;
  let lastMoveAt = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('a, button, input')) return;
    tracking = true;
    pointerId = e.pointerId;
    lastX = downX = e.clientX;
    downY = e.clientY;
    lastMoveAt = downAt = performance.now();
    stage.style.cursor = 'grabbing';
  };
  const move = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== pointerId) return;
    const now = performance.now();
    const dt = Math.max(now - lastMoveAt, 1);
    vel = vel * 0.5 + ((e.clientX - lastX) / dt) * FLICK_GAIN * 0.5;
    lastX = e.clientX;
    lastMoveAt = now;
  };
  const up = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== pointerId) return;
    tracking = false;
    stage.style.cursor = 'grab';
    const travel = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (travel < 8 && performance.now() - downAt < 400) onTap?.(e);
  };
  const cancel = () => {
    tracking = false;
    stage.style.cursor = 'grab';
  };
  stage.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', cancel, { passive: true });

  return {
    step(dt: number) {
      const delta = (ambient + vel) * dt;
      vel *= Math.exp(-dt * DECAY);
      return delta;
    },
    dispose() {
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    },
  };
}

/** Soft haptic tick where supported (Android); silently inert elsewhere. */
export const hapticTick = (ms = 8) => navigator.vibrate?.(ms);

/** Clamp utility shared by tilt/parallax consumers. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
