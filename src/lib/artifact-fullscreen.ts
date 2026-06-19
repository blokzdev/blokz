/**
 * Fullscreen viewer for artifacts.
 *
 * Inline embeds are intentionally modest; this is the escape hatch that gives
 * an artifact the whole viewport — the roomy experience, especially on a phone
 * the reader can rotate into landscape. It builds a fixed overlay (sized in
 * dvh/svh so iOS Safari, which has no element Fullscreen API, still fills the
 * screen), best-effort enters true fullscreen where supported, and re-mounts
 * the island into a large host.
 *
 * Re-mount (rather than relocating the live node) keeps the existing
 * `mount(el) => cleanup` contract intact and lets the layout primitive's
 * ResizeObserver lay the artifact out wide. The tradeoff — in-progress state
 * resets — is acceptable: artifacts seed an initial state on mount.
 *
 * Autorotation is automatic: nothing locks `screen.orientation`, so the
 * dvh/svh overlay plus the primitive's aspect-based reflow re-lay-out on
 * rotate.
 */

const STYLE_ID = 'artifact-fs-styles';

const STYLE = `
.artifact-fs {
  position: fixed; inset: 0; z-index: 90;
  height: 100dvh; min-height: 100svh;
  display: flex; flex-direction: column;
  background: #05070d;
  animation: artifact-fs-in .18s ease-out;
}
@keyframes artifact-fs-in { from { opacity: 0; } to { opacity: 1; } }
.artifact-fs-bar {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px;
  border-bottom: 1px solid rgba(124, 140, 255, 0.14);
}
.artifact-fs-title {
  font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .06em;
  text-transform: uppercase; color: #8d95ad; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.artifact-fs-close {
  flex: 0 0 auto; cursor: pointer;
  border: 1px solid rgba(124, 140, 255, 0.28); border-radius: 8px;
  background: #0d1322; color: #cdd3e3;
  font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .05em;
  padding: 6px 12px; transition: .2s;
}
.artifact-fs-close:hover, .artifact-fs-close:focus-visible {
  outline: none; color: #fff; border-color: rgba(124, 140, 255, 0.5);
}
.artifact-fs-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export interface FullscreenOptions {
  slug: string;
  title: string;
  /** The island's default export, already loaded by the caller. */
  mount: (el: HTMLElement) => () => void;
}

let openCount = 0;

/** Open `slug` filling the viewport. Returns a function that closes it. */
export function openArtifactFullscreen(opts: FullscreenOptions): () => void {
  ensureStyles();

  const overlay = document.createElement('div');
  overlay.className = 'artifact-fs';

  const bar = document.createElement('div');
  bar.className = 'artifact-fs-bar';
  const title = document.createElement('span');
  title.className = 'artifact-fs-title';
  title.textContent = opts.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'artifact-fs-close';
  close.textContent = '✕ close';
  bar.append(title, close);

  const host = document.createElement('div');
  host.className = 'artifact-fs-stage';
  host.dataset.artifactFsStage = opts.slug;

  overlay.append(bar, host);
  document.body.appendChild(overlay);

  // Lock body scroll for the duration.
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  openCount++;

  // Best-effort true fullscreen (OS rotation on Android/desktop); the fixed
  // overlay already covers the viewport where this is unsupported (iOS).
  const reqFs = (overlay as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  }).requestFullscreen?.bind(overlay) ??
    (overlay as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }).webkitRequestFullscreen?.bind(overlay);
  try {
    const r = reqFs?.();
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch(() => {});
    }
  } catch {
    /* unsupported — overlay fallback covers it */
  }

  const cleanup = opts.mount(host);

  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') doClose();
  };
  const onFsChange = () => {
    const fsEl =
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    // Only react to an *exit* that left our overlay still mounted.
    if (!fsEl && !closed && overlay.isConnected) doClose();
  };

  function doClose(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    try {
      cleanup();
    } catch {
      /* island cleanup should not block teardown */
    }
    const exitFs =
      document.exitFullscreen?.bind(document) ??
      (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.bind(
        document,
      );
    if (
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
    ) {
      try {
        exitFs?.();
      } catch {
        /* ignore */
      }
    }
    overlay.remove();
    if (--openCount <= 0) {
      openCount = 0;
      document.body.style.overflow = prevOverflow;
    }
  }

  close.addEventListener('click', doClose);
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  close.focus();
  return doClose;
}
