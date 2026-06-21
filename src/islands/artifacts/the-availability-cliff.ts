/**
 * Artifact: the-availability-cliff — The Availability Cliff
 * Manifest: content/artifacts/the-availability-cliff/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * `container` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    // 'footer' = controls span full width under [stage | panel];
    // 'rail' = panel + controls stack in a right rail beside the stage.
    wideTemplate: 'footer',
    // For a fixed-shape chart/diagram, set stageAspect (e.g. '16/9') so the
    // stage fits with no dead gap. Use stageMin only for variable-height DOM.
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  // Visual styles only — the primitive owns the responsive layout + outer
  // padding. Do NOT add a position:absolute root or your own resize logic. The
  // frame is overflow-hidden, so use shrinkable grids (minmax(0,1fr)),
  // flex-wrap on control rows, min-width:0, and overflow-wrap so nothing clips.
  style.textContent = ``;
  stage.appendChild(style);

  // TODO: build the primary visualization into `stage`, the secondary readout
  // (legend / detail / tally) into `panel`, inputs (sliders / tabs / buttons)
  // into `controls`, and the source/provenance/hint line into `caption`.
  // Omit a slot you don't need via the options, e.g. { panel: false }.

  return () => {
    layout.dispose();
    style.remove();
  };
}
