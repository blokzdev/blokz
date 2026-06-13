/**
 * Artifact: web-proof-trust — Web-Proof Trust
 * Manifest: content/artifacts/web-proof-trust/manifest.json
 *
 * Contract: default-export a mount function that builds the scene inside
 * `container` and returns a cleanup function that releases every resource
 * (RAF loops, listeners, observers, GPU objects). See docs/ARTIFACTS.md.
 */
export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // TODO: build the artifact. For Three.js, use createScene() from
  // '@/lib/three-utils' — it handles DPR caps, resize, and pause-offscreen.

  return () => {
    canvas.remove();
  };
}
