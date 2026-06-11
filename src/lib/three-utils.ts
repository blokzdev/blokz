import * as THREE from 'three';

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Stop the loop and release GPU resources. */
  dispose: () => void;
}

/**
 * Shared boilerplate for every Three.js island: renderer with capped DPR,
 * resize handling, and a render loop that pauses when the canvas leaves the
 * viewport or the tab is hidden (battery-friendly on mobile).
 */
export function createScene(
  canvas: HTMLCanvasElement,
  onFrame: (t: number, handle: SceneHandle) => void,
  { fov = 60, z = 30 } = {},
): SceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
  camera.position.z = z;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? canvas);

  let visible = true;
  let rafId = 0;
  const clock = new THREE.Clock();

  const handle: SceneHandle = { renderer, scene, camera, dispose };

  const loop = () => {
    rafId = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    onFrame(clock.getElapsedTime(), handle);
    renderer.render(scene, camera);
  };
  loop();

  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  io.observe(canvas);

  function dispose() {
    cancelAnimationFrame(rafId);
    io.disconnect();
    ro.disconnect();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
  }

  return handle;
}

export const isSmallScreen = () => window.matchMedia('(max-width: 768px)').matches;
