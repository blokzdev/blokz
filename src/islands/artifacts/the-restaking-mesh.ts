/**
 * Artifact: the-restaking-mesh — The Restaking Mesh
 * Manifest: content/artifacts/the-restaking-mesh/manifest.json
 *
 * Shared security as a 3D topology. EigenLayer-style restaking lets ONE pool of
 * staked ETH be extended to many services: each operator opts its full delegated
 * stake into several AVSs at once. That reuse is the whole value proposition — and
 * the whole risk. The mesh here makes both legible at the same time:
 *
 *   core (restaked ETH)  →  operators (inner ring)  →  AVSs (outer ring)
 *
 * The "overlap" slider is services-per-operator k. Every honest number is read off
 * the generated topology, not invented:
 *
 *   reuse factor        = k           (each staked unit backs k services at once)
 *   avg backing / AVS   = O·k / A     (operators securing a typical service)
 *   fault blast radius  = k of A      (services a single slashed operator drags down)
 *
 * Tap an operator to slash it: an amber pulse runs its security edges and every AVS
 * it backs loses 1/backing of its collateral simultaneously — correlated slashing,
 * the failure mode "The Social Slash" and "The Shadow Peg" describe. Tap an AVS to
 * see how many operators back it and how many it shares with its neighbours. Tap
 * empty space to clear.
 *
 * This is a closed mechanism model (counts + overlap), not a data snapshot, so there
 * is no data.json / dataSource — same footing as `the-liquidity-surface`. EigenLayer's
 * slashing release adds per-AVS "unique stake" allocations that can carve a slice per
 * service and blunt (not erase) this correlation; noted in the caption.
 *
 * Contract: default-export mount(container) → cleanup releasing every resource.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit, hapticTick } from '@/lib/orbit';

// ── palette (design tokens only) ────────────────────────────────────────────
const C_VOID = 0x05070d;
const C_ACCENT = 0x5b8cff; // operators / stake
const C_VIOLET = 0x8b5cf6; // restaked core
const C_CYAN = 0x22d3ee; // AVSs / services
const C_HOT = 0xffb020; // slash / correlated fault

// ── layout extents (world units) ────────────────────────────────────────────
const R_OP = 6.2; // operator ring radius
const R_AVS = 12.4; // AVS ring radius
const Y_AVS = 1.6; // lift the service ring so the cone reads in 3D

export default function mount(container: HTMLElement): () => void {
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const small = isSmallScreen();
  const O = small ? 6 : 8; // operators
  const A = small ? 5 : 6; // AVSs (services)
  const K_DEFAULT = Math.min(3, A);

  // ── node positions (fixed; only edges change with overlap) ──────────────────
  const opPos: THREE.Vector3[] = [];
  for (let i = 0; i < O; i++) {
    const a = (2 * Math.PI * i) / O;
    opPos.push(new THREE.Vector3(R_OP * Math.cos(a), 0, R_OP * Math.sin(a)));
  }
  const avsPos: THREE.Vector3[] = [];
  for (let j = 0; j < A; j++) {
    const a = (2 * Math.PI * (j + 0.5)) / A; // interleave with operators
    avsPos.push(new THREE.Vector3(R_AVS * Math.cos(a), Y_AVS, R_AVS * Math.sin(a)));
  }
  const corePos = new THREE.Vector3(0, 0, 0);

  // ── topology: operator i secures AVSs {(i + t) mod A : t < k} ────────────────
  let k = K_DEFAULT;
  let secures: number[][] = []; // per operator → list of AVS indices
  let backing: number[] = []; // per AVS → count of operators
  const rebuildTopology = () => {
    secures = [];
    backing = new Array(A).fill(0);
    for (let i = 0; i < O; i++) {
      const set: number[] = [];
      for (let t = 0; t < k; t++) {
        const a = (i + t) % A;
        set.push(a);
        backing[a]++;
      }
      secures.push(set);
    }
  };
  rebuildTopology();

  // ── world group (tilted so the rings read as a 3D cone) ──────────────────────
  const world = new THREE.Group();
  world.rotation.x = 0.52;
  world.position.y = -0.6;

  // ── nodes ────────────────────────────────────────────────────────────────────
  const coreGeo = new THREE.IcosahedronGeometry(1.5, 1);
  const opGeo = new THREE.SphereGeometry(0.62, 18, 12);
  const avsGeo = new THREE.SphereGeometry(0.9, 20, 14);

  const core = new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({ color: C_VIOLET, transparent: true, opacity: 0.92 }),
  );
  core.position.copy(corePos);
  world.add(core);
  const coreWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.9, 1)),
    new THREE.LineBasicMaterial({
      color: C_VIOLET,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  world.add(coreWire);

  interface NodeDatum {
    kind: 'op' | 'avs';
    index: number;
    base: number; // base emissive opacity
  }
  const opMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < O; i++) {
    const m = new THREE.Mesh(
      opGeo,
      new THREE.MeshBasicMaterial({ color: C_ACCENT, transparent: true, opacity: 0.95 }),
    );
    m.position.copy(opPos[i]);
    m.userData = { kind: 'op', index: i, base: 0.95 } as NodeDatum;
    world.add(m);
    opMeshes.push(m);
  }
  const avsMeshes: THREE.Mesh[] = [];
  for (let j = 0; j < A; j++) {
    const m = new THREE.Mesh(
      avsGeo,
      new THREE.MeshBasicMaterial({ color: C_CYAN, transparent: true, opacity: 0.9 }),
    );
    m.position.copy(avsPos[j]);
    m.userData = { kind: 'avs', index: j, base: 0.9 } as NodeDatum;
    world.add(m);
    avsMeshes.push(m);
  }
  const pickable = [...opMeshes, ...avsMeshes];

  // ── static edges: core → operators (stake inflow) ────────────────────────────
  const inflowPts: THREE.Vector3[] = [];
  for (let i = 0; i < O; i++) {
    inflowPts.push(corePos.clone(), opPos[i].clone());
  }
  const inflow = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(inflowPts),
    new THREE.LineBasicMaterial({
      color: C_VIOLET,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  world.add(inflow);

  // ── dynamic edges: operators → AVSs (security), rebuilt on overlap change ─────
  const secGeo = new THREE.BufferGeometry();
  const secMat = new THREE.LineBasicMaterial({
    color: C_ACCENT,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const security = new THREE.LineSegments(secGeo, secMat);
  world.add(security);

  // highlight overlay for the selected node's edges (amber when slashing an op)
  const hiGeo = new THREE.BufferGeometry();
  const hiMat = new THREE.LineBasicMaterial({
    color: C_HOT,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const highlight = new THREE.LineSegments(hiGeo, hiMat);
  world.add(highlight);

  const rebuildSecurityEdges = () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < O; i++) {
      for (const a of secures[i]) pts.push(opPos[i].clone(), avsPos[a].clone());
    }
    secGeo.setFromPoints(pts);
    secGeo.computeBoundingSphere();
  };
  rebuildSecurityEdges();

  // ── selection + slash state (declared before the HUD so the initial render,
  //    which runs inside applyNarrow() below, can read it) ──────────────────────
  type Sel = { kind: 'op' | 'avs'; index: number } | null;
  let sel: Sel = null;
  let slashT = 0; // animates 0→1 when an operator is slashed

  const setHighlightEdges = (pts: THREE.Vector3[]) => {
    hiGeo.setFromPoints(pts.length ? pts : [corePos.clone(), corePos.clone()]);
    hiGeo.computeBoundingSphere();
  };

  const AVS_NAME = (j: number) => `AVS ${String.fromCharCode(65 + j)}`;
  const OP_NAME = (i: number) => `operator ${i + 1}`;

  // ── HUD (absolute over the canvas; full-bleed scenes don't use the layout
  //    primitive — same approach as the-liquidity-surface) ──────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .rm-hud { position:absolute;inset:0;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c7cfe6; }
    .rm-stats {
      position:absolute;top:10px;left:10px;max-width:min(72%,310px);
      background:rgba(5,7,13,.74);border:1px solid rgba(124,140,255,.24);
      border-radius:8px;padding:9px 12px;font-size:11px;line-height:1.6;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .rm-eyebrow { color:#8d95ad;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px; }
    .rm-row { display:flex;justify-content:space-between;gap:10px;min-width:0; }
    .rm-row span:first-child { color:#8d95ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .rm-row b { color:#e7eaf3;font-weight:600;white-space:nowrap; }
    .rm-accent { color:#5b8cff; }
    .rm-cyan { color:#22d3ee; }
    .rm-violet { color:#8b5cf6; }
    .rm-hot { color:#ffb020; }
    .rm-detail { margin-top:7px;padding-top:6px;border-top:1px solid rgba(124,140,255,.16);color:#8d95ad;font-size:10px;line-height:1.55;overflow-wrap:anywhere; }
    .rm-detail b { color:#e7eaf3;font-weight:600; }
    .rm-legend {
      position:absolute;right:10px;top:10px;max-width:42%;
      background:rgba(5,7,13,.6);border:1px solid rgba(124,140,255,.18);
      border-radius:8px;padding:8px 10px;font-size:9.5px;line-height:1.7;color:#8d95ad;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .rm-legend .rm-dot { display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle; }
    .rm-ctrl {
      position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
      pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px;
      background:rgba(5,7,13,.8);border:1px solid rgba(124,140,255,.24);
      border-radius:10px;padding:9px 14px;width:min(88%,392px);
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .rm-ctrl-top { display:flex;justify-content:space-between;align-items:baseline;width:100%;font-size:11px;gap:10px; }
    .rm-ctrl-top .rm-lbl { color:#8d95ad;letter-spacing:.1em;text-transform:uppercase;font-size:9.5px;white-space:nowrap; }
    .rm-ctrl-top .rm-val { color:#e7eaf3;font-weight:600;font-size:13px;text-align:right;min-width:0; }
    .rm-slider { width:100%;accent-color:#5b8cff;cursor:pointer;height:20px; }
    .rm-mapline { display:none;color:#8d95ad;font-size:9.5px;text-align:center;line-height:1.5; }
    .rm-mapline .rm-dot { display:inline-block;width:7px;height:7px;border-radius:50%;margin:0 3px 0 7px;vertical-align:middle; }
    .rm-hint { color:#5b6378;font-size:9.5px;text-align:center;line-height:1.5; }
    .rm-hint b { color:#8d95ad;font-weight:600; }
    /* Narrow layouts (portrait phone, rotated fullscreen) drop the side legend —
       it would collide with the stats panel — and reveal the folded legend line. */
    .rm-hud.is-narrow .rm-legend { display:none; }
    .rm-hud.is-narrow .rm-mapline { display:block; }
    .rm-hud.is-narrow .rm-stats { max-width:min(88%,340px); }
  `;
  container.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'rm-hud';

  const stats = document.createElement('div');
  stats.className = 'rm-stats';
  hud.appendChild(stats);

  const legend = document.createElement('div');
  legend.className = 'rm-legend';
  legend.innerHTML = `
    <div><span class="rm-dot" style="background:#8b5cf6"></span><b style="color:#c7cfe6">restaked ETH</b></div>
    <div><span class="rm-dot" style="background:#5b8cff"></span>operators</div>
    <div><span class="rm-dot" style="background:#22d3ee"></span>AVSs (services)</div>
    <div style="margin-top:5px;color:#5b6378">one stake, many services</div>`;
  hud.appendChild(legend);

  const ctrl = document.createElement('div');
  ctrl.className = 'rm-ctrl';
  ctrl.innerHTML = `
    <div class="rm-ctrl-top">
      <span class="rm-lbl">services&nbsp;per&nbsp;operator&nbsp;(overlap&nbsp;k)</span>
      <span class="rm-val"></span>
    </div>
    <input class="rm-slider" type="range" min="1" max="${A}" step="1" value="${k}"
           aria-label="services secured per operator (overlap)" />
    <div class="rm-mapline">
      <span class="rm-dot" style="background:#8b5cf6"></span>stake
      <span class="rm-dot" style="background:#5b8cff"></span>operators
      <span class="rm-dot" style="background:#22d3ee"></span>services
    </div>
    <div class="rm-hint">drag to orbit · slide overlap · <b>tap an operator to slash it</b></div>`;
  hud.appendChild(ctrl);
  container.appendChild(hud);

  const slider = ctrl.querySelector('.rm-slider') as HTMLInputElement;
  const kVal = ctrl.querySelector('.rm-val') as HTMLElement;

  const isNarrow = () => container.clientWidth < 560;
  const applyNarrow = () => {
    hud.classList.toggle('is-narrow', isNarrow());
    renderHud();
  };
  applyNarrow();
  const hudRo = new ResizeObserver(applyNarrow);
  hudRo.observe(container);

  function renderHud() {
    kVal.textContent = `${k} of ${A}`;
    slider.value = String(k);

    const totalStake = O; // one unit each
    const promised = O * k; // security-relationships = reuse of that stake
    const avgBacking = (O * k) / A;

    let detail: string;
    if (sel?.kind === 'op') {
      const list = secures[sel.index]
        .slice()
        .sort((a, b) => a - b)
        .map(AVS_NAME)
        .join(', ');
      const losses = secures[sel.index]
        .map((a) => Math.round((100 * 1) / backing[a]))
        .sort((x, y) => y - x);
      const worst = losses.length ? losses[0] : 0;
      detail = `<b class="rm-hot">${OP_NAME(sel.index)} slashed.</b> One fault hits
        <b>${secures[sel.index].length} of ${A}</b> services at once —
        ${list} — each losing up to <b class="rm-hot">${worst}%</b> of its backing
        the same instant. That is correlated slashing.`;
    } else if (sel?.kind === 'avs') {
      const j = sel.index;
      const ops = opMeshes.map((_, i) => i).filter((i) => secures[i].includes(j));
      // operators of this AVS that also secure some other AVS (shared, not exclusive)
      const shared = ops.filter((i) => secures[i].some((a) => a !== j)).length;
      detail = `<b class="rm-cyan">${AVS_NAME(j)}</b> is backed by <b>${backing[j]}</b>
        operator${backing[j] === 1 ? '' : 's'}; <b>${shared}</b> of them also secure other
        services, so those operators' faults are shared across the mesh. Tap an operator to
        trace its blast radius.`;
    } else {
      detail = `<b>Shared security:</b> every operator opts its one stake into
        <b class="rm-accent">k=${k}</b> services, so each staked unit is reused
        <b>${k}×</b>. Raising k lifts every service's backing — and widens the blast
        radius of a single fault. Tap a node to inspect.`;
    }

    // On the tightest inline box (portrait phone) the two secondary rows are
    // dropped so the mesh keeps the vertical room; the reuse factor and blast
    // radius — the actual point — always stay.
    const secondary = isNarrow()
      ? ''
      : `<div class="rm-row"><span>security promised / staked</span><b>${promised} / ${totalStake} units</b></div>
         <div class="rm-row"><span>avg backing · service</span><b class="rm-cyan">${avgBacking.toFixed(1)} ops</b></div>`;
    stats.innerHTML = `
      <div class="rm-eyebrow">restaking · shared security</div>
      <div class="rm-row"><span>operators · services</span><b>${O} · ${A}</b></div>
      <div class="rm-row"><span>stake reuse factor</span><b class="rm-accent">${k}×</b></div>
      ${secondary}
      <div class="rm-row"><span>1 fault → services hit</span><b class="rm-hot">${k} of ${A}</b></div>
      <div class="rm-detail">${detail}</div>`;
  }

  // reflect selection into node materials + highlight edges
  function applySelectionVisuals() {
    // reset
    for (const m of opMeshes) (m.material as THREE.MeshBasicMaterial).color.setHex(C_ACCENT);
    for (const m of avsMeshes) (m.material as THREE.MeshBasicMaterial).color.setHex(C_CYAN);
    secMat.opacity = 0.2;

    if (sel?.kind === 'op') {
      const i = sel.index;
      (opMeshes[i].material as THREE.MeshBasicMaterial).color.setHex(C_HOT);
      const pts: THREE.Vector3[] = [];
      for (const a of secures[i]) {
        pts.push(opPos[i].clone(), avsPos[a].clone());
        (avsMeshes[a].material as THREE.MeshBasicMaterial).color.setHex(C_HOT);
      }
      setHighlightEdges(pts);
      secMat.opacity = 0.09; // dim the rest so the blast radius pops
    } else if (sel?.kind === 'avs') {
      const j = sel.index;
      (avsMeshes[j].material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < O; i++) {
        if (secures[i].includes(j)) {
          pts.push(opPos[i].clone(), avsPos[j].clone());
          (opMeshes[i].material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        }
      }
      hiMat.color.setHex(C_CYAN);
      setHighlightEdges(pts);
      secMat.opacity = 0.1;
    } else {
      hiMat.color.setHex(C_HOT);
      setHighlightEdges([]);
    }
  }

  slider.addEventListener('input', () => {
    k = Number(slider.value);
    rebuildTopology();
    rebuildSecurityEdges();
    // keep a valid selection
    applySelectionVisuals();
    renderHud();
  });

  // ── pick on tap ──────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let lastT = 0;

  // orbit is declared before createScene because createScene runs one loop tick
  // synchronously; onTap refers to `handle` (assigned just below, before any tap).
  const orbit = attachOrbit(canvas, {
    ambient: 0.045,
    onTap: (e) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, handle.camera);
      const hits = raycaster.intersectObjects(pickable, false);
      if (hits.length) {
        const d = hits[0].object.userData as NodeDatum;
        sel = { kind: d.kind, index: d.index };
        slashT = 0;
        hapticTick();
      } else {
        sel = null;
      }
      // restore any AVS opacity the flash left behind
      for (const m of avsMeshes) (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
      applySelectionVisuals();
      renderHud();
    },
  });

  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - lastT, 0.05);
      lastT = t;
      world.rotation.y += orbit.step(dt);

      // gentle breathing on the core
      const pulse = 1 + 0.05 * Math.sin(t * 1.3);
      core.scale.setScalar(pulse);
      coreWire.scale.setScalar(pulse);

      // slash animation: amber edges swell then settle, slashed AVSs flash
      if (sel?.kind === 'op') {
        slashT = Math.min(1, slashT + dt * 1.6);
        hiMat.opacity = 0.35 + 0.4 * Math.abs(Math.sin(t * 2.4)) * (1 - 0.5 * slashT);
        const flash = 0.9 + 0.1 * Math.sin(t * 3);
        for (const a of secures[sel.index]) {
          (avsMeshes[a].material as THREE.MeshBasicMaterial).opacity = flash;
        }
      } else if (sel?.kind === 'avs') {
        hiMat.opacity += (0.5 - hiMat.opacity) * 0.1;
      } else {
        hiMat.opacity += (0 - hiMat.opacity) * 0.12;
      }
    },
    { fov: 55, z: 31 },
  );

  handle.scene.fog = new THREE.FogExp2(C_VOID, 0.012);
  handle.scene.add(world);

  applySelectionVisuals();
  renderHud();

  return () => {
    hudRo.disconnect();
    orbit.dispose();
    handle.dispose();
    hud.remove();
    style.remove();
    canvas.remove();
    // shared geometries createScene.dispose() won't reach (used by multiple meshes
    // it disposes once each — harmless — but the overlay/edge geometries are its own)
    coreGeo.dispose();
    opGeo.dispose();
    avsGeo.dispose();
  };
}
