/**
 * Artifact: the-liquidity-surface — The Liquidity Surface
 * Manifest: content/artifacts/the-liquidity-surface/manifest.json
 *
 * The Width Paradox as a 3D landscape. A Uniswap v3 LP's fee reward and its
 * rebalancing burden both climb toward the narrow-range edge — the tension the
 * article "The Width Paradox" names. This renders both on one surface over the
 * (range half-width δ, annualized volatility σ) plane:
 *
 *   height  = expected rebalances / year   = 365 / MFPT,  MFPT = a² / σ_daily²
 *   colour  = gross fee APR (in range)      = base_APR · multiplier(δ)
 *   multiplier(δ) = 1 / (√(1+δ) − 1)        a = ln(1+δ)   σ_daily = σ / √252
 *   base_APR = f·v·365 = 0.05% · 0.15 · 365 ≈ 2.74%/yr
 *
 * Every constant and formula is the article's own (Uniswap v3 whitepaper first-
 * passage / capital-efficiency math; Milionis et al. cadence framing). This is a
 * closed-form model, not a data snapshot → no data.json / no dataSource.
 *
 * The paradox reads literally: the hottest-coloured (highest-fee) terrain is the
 * tallest (most rebalancing). A togglable "human ceiling" plane at 52 rebalances/yr
 * (weekly) splits the surface — everything above it is agent-only territory, the
 * cadence a human LP can't sustain by hand.
 *
 * Contract: default-export mount(container) → cleanup releasing every resource.
 */
import * as THREE from 'three';
import { createScene, isSmallScreen } from '@/lib/three-utils';
import { attachOrbit, hapticTick } from '@/lib/orbit';

// ── model constants (all from "The Width Paradox") ──────────────────────────
const BASE_APR = 0.0005 * 0.15 * 365; // f·v·365 ≈ 0.027375 /yr
const TRADING_DAYS = 252;
const WEEKLY = 52; // rebalances/yr a human can plausibly sustain (article: ±10% ⇒ ~54/yr)
const D_MIN = 0.05; // ±5%
const D_MAX = 1.0; // ±100%
const S_MIN = 0.2; // 20% annualized vol
const S_MAX = 1.2; // 120%
const S_DEFAULT = 0.58; // ETH realized vol in the article

// ── scene extents (world units) ─────────────────────────────────────────────
const HALFX = 11; // width axis (δ)
const HALFZ = 7; // depth axis (σ)
const YSCALE = 12.5; // height axis (rebalances/yr, log-compressed)
const CADENCE_CAP = 400; // clamp rebalances for the height map

const mult = (d: number) => 1 / (Math.sqrt(1 + d) - 1);
const feeApr = (d: number) => BASE_APR * mult(d);
const rebalances = (d: number, sig: number) => {
  const a = Math.log(1 + d);
  const sd = sig / Math.sqrt(TRADING_DAYS); // daily log-vol
  const mfpt = (a * a) / (sd * sd); // mean first-passage, days
  return 365 / mfpt; // per year
};
const mfptDays = (d: number, sig: number) => 365 / rebalances(d, sig);
/** width δ at which cadence hits `perYear` for volatility σ. */
const widthForCadence = (sig: number, perYear: number) => {
  const sd = sig / Math.sqrt(TRADING_DAYS);
  const a = sd * Math.sqrt(365 / perYear);
  return Math.exp(a) - 1;
};

// index → world position
const xOf = (i: number, nx: number) => -HALFX + (2 * HALFX * i) / (nx - 1);
const zOf = (sig: number) => -HALFZ + (2 * HALFZ * (sig - S_MIN)) / (S_MAX - S_MIN);
const yOf = (rebal: number) =>
  YSCALE * (Math.log(1 + Math.min(rebal, CADENCE_CAP)) / Math.log(1 + CADENCE_CAP));
// log-spaced widths so the narrow edge (where everything happens) gets resolution
const dOf = (i: number, nx: number) => D_MIN * Math.pow(D_MAX / D_MIN, i / (nx - 1));

// colour ramp: cool accent (low fee) → violet → amber (high fee)
const C_COOL = new THREE.Color(0x5b8cff);
const C_MID = new THREE.Color(0x8b5cf6);
const C_HOT = new THREE.Color(0xffb020);
const _c = new THREE.Color();
const LOG_FEE_MIN = Math.log(feeApr(D_MAX)); // widest → lowest fee
const LOG_FEE_MAX = Math.log(feeApr(D_MIN)); // narrowest → highest fee
function feeColor(d: number): THREE.Color {
  let t = (Math.log(feeApr(d)) - LOG_FEE_MIN) / (LOG_FEE_MAX - LOG_FEE_MIN);
  t = Math.pow(t, 0.62); // push the warm band outward so the gradient reads across the sheet
  if (t < 0.5) return _c.copy(C_COOL).lerp(C_MID, t * 2);
  return _c.copy(C_MID).lerp(C_HOT, (t - 0.5) * 2);
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export default function mount(container: HTMLElement): () => void {
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // ── HUD ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .ls-hud { position:absolute;inset:0;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c7cfe6; }
    .ls-stats {
      position:absolute;top:10px;left:10px;max-width:min(66%,320px);
      background:rgba(5,7,13,.72);border:1px solid rgba(124,140,255,.24);
      border-radius:8px;padding:9px 12px;font-size:11px;line-height:1.6;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .ls-eyebrow { color:#8d95ad;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px; }
    .ls-sig { color:#e7eaf3;font-weight:600; }
    .ls-row { display:flex;justify-content:space-between;gap:10px;min-width:0; }
    .ls-row span:first-child { color:#8d95ad;white-space:nowrap; }
    .ls-row b { color:#e7eaf3;font-weight:600; }
    .ls-hot { color:#ffb020; }
    .ls-cool { color:#5b8cff; }
    .ls-cyan { color:#22d3ee; }
    .ls-sub { color:#8d95ad;font-size:10px; }
    .ls-note { margin-top:7px;padding-top:6px;border-top:1px solid rgba(124,140,255,.16);color:#8d95ad;font-size:10px;line-height:1.5; }
    .ls-note b { color:#8fa2ff;font-weight:600; }
    .ls-legend {
      position:absolute;right:10px;top:10px;max-width:44%;
      background:rgba(5,7,13,.6);border:1px solid rgba(124,140,255,.18);
      border-radius:8px;padding:8px 10px;font-size:9.5px;line-height:1.65;color:#8d95ad;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .ls-legend b { color:#c7cfe6;font-weight:600; }
    .ls-ramp { height:6px;border-radius:3px;margin:4px 0 2px;
      background:linear-gradient(90deg,#5b8cff,#8b5cf6,#ffb020); }
    /* Narrow layouts (portrait phone, rotated fullscreen) drop the side legend —
       it would collide with the stats panel — and reveal the folded map line. */
    .ls-map { display:none; }
    .ls-hud.is-narrow .ls-legend { display:none; }
    .ls-hud.is-narrow .ls-map { display:block; }
    .ls-ctrl {
      position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
      pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:5px;
      background:rgba(5,7,13,.78);border:1px solid rgba(124,140,255,.24);
      border-radius:10px;padding:9px 14px;width:min(86%,380px);
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    }
    .ls-ctrl-top { display:flex;justify-content:space-between;align-items:baseline;width:100%;font-size:11px;gap:10px; }
    .ls-ctrl-top .ls-val { color:#e7eaf3;font-weight:600;font-size:13px;text-align:right;min-width:0; }
    .ls-ctrl-top .ls-lbl { color:#8d95ad;letter-spacing:.1em;text-transform:uppercase;font-size:9.5px;white-space:nowrap; }
    .ls-slider { width:100%;accent-color:#5b8cff;cursor:pointer;height:20px; }
    .ls-hint { color:#5b6378;font-size:9.5px;text-align:center;line-height:1.5; }
    .ls-hint b { color:#8d95ad;font-weight:600; }
  `;
  container.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'ls-hud';

  const stats = document.createElement('div');
  stats.className = 'ls-stats';
  hud.appendChild(stats);

  // On roomy layouts a dedicated side legend reads best; when the container is
  // narrow (portrait phone, rotated fullscreen) it would collide with the stats
  // panel, so CSS hides it and reveals the folded map line below the slider. A
  // ResizeObserver drives the switch off the real container width (not a
  // mount-time guess, which breaks when fullscreen is entered wide then rotated).
  const legend = document.createElement('div');
  legend.className = 'ls-legend';
  legend.innerHTML = `
    <div><b>height</b> = rebalances / yr</div>
    <div><b>colour</b> = fee APR (in range)</div>
    <div class="ls-ramp"></div>
    <div><span class="ls-cool">wide, low fee</span> → <span class="ls-hot">narrow, high fee</span></div>
    <div style="margin-top:5px"><b>depth</b> ← calm · volatile →</div>`;
  hud.appendChild(legend);

  const ctrl = document.createElement('div');
  ctrl.className = 'ls-ctrl';
  ctrl.innerHTML = `
    <div class="ls-ctrl-top">
      <span class="ls-lbl">annualized&nbsp;volatility&nbsp;σ</span>
      <span class="ls-val"></span>
    </div>
    <input class="ls-slider" type="range" min="${S_MIN}" max="${S_MAX}" step="0.01" value="${S_DEFAULT}"
           aria-label="annualized volatility" />
    <div class="ls-hint ls-map"><b>height</b> rebalances/yr · <b>colour</b> fee APR · <b>depth</b> volatility</div>
    <div class="ls-hint">drag to orbit · slide σ · <b>tap</b> for the human ceiling</div>`;
  hud.appendChild(ctrl);
  container.appendChild(hud);

  const applyNarrow = () => hud.classList.toggle('is-narrow', container.clientWidth < 560);
  applyNarrow();
  const hudRo = new ResizeObserver(applyNarrow);
  hudRo.observe(container);

  const slider = ctrl.querySelector('.ls-slider') as HTMLInputElement;
  const sigVal = ctrl.querySelector('.ls-val') as HTMLElement;

  // ── surface geometry ────────────────────────────────────────────────────────
  const small = isSmallScreen(); // mount-time vertex budget (halve on phones)
  const nx = small ? 40 : 60; // width samples
  const ny = small ? 28 : 40; // volatility samples

  const world = new THREE.Group();
  world.rotation.x = 0.7; // tilt so the cadence height reads as a landscape
  world.rotation.y = -0.55; // swing the tall narrow/volatile corner to the open right
  world.position.set(1.2, -1.8, 0);

  // vertex buffers
  const vcount = nx * ny;
  const pos = new Float32Array(vcount * 3);
  const col = new Float32Array(vcount * 3);
  for (let j = 0; j < ny; j++) {
    const sig = S_MIN + ((S_MAX - S_MIN) * j) / (ny - 1);
    const zd = zOf(sig);
    for (let i = 0; i < nx; i++) {
      const d = dOf(i, nx);
      const k = j * nx + i;
      pos[k * 3] = xOf(i, nx);
      pos[k * 3 + 1] = yOf(rebalances(d, sig));
      pos[k * 3 + 2] = zd;
      const c = feeColor(d);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  // triangle indices
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const dd = cc + 1;
      idx.push(a, cc, b, b, cc, dd);
    }
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  surfGeo.setIndex(idx);
  surfGeo.computeVertexNormals();

  // solid fill (occludes the far side, gives the surface real form)
  const fill = new THREE.Mesh(
    surfGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: true,
    }),
  );
  world.add(fill);

  // glowing wireframe over the fill
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(surfGeo),
    new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  world.add(wire);

  // ── static reference: base frame + cadence gridlines ────────────────────────
  const faint = new THREE.LineBasicMaterial({
    color: 0x5b8cff,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rect = (y: number) =>
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-HALFX, y, -HALFZ),
        new THREE.Vector3(HALFX, y, -HALFZ),
        new THREE.Vector3(HALFX, y, HALFZ),
        new THREE.Vector3(-HALFX, y, HALFZ),
      ]),
      faint,
    );
  world.add(rect(0)); // floor
  const monthly = rect(yOf(12));
  world.add(monthly);

  // human weekly-cadence ceiling plane (toggle) — everything above is agent-only
  const ceilY = yOf(WEEKLY);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * HALFX, 2 * HALFZ),
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = ceilY;
  world.add(ceil);
  const ceilEdge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALFX, ceilY, -HALFZ),
      new THREE.Vector3(HALFX, ceilY, -HALFZ),
      new THREE.Vector3(HALFX, ceilY, HALFZ),
      new THREE.Vector3(-HALFX, ceilY, HALFZ),
    ]),
    new THREE.LineBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  world.add(ceilEdge);

  // ── moving iso-σ contour + weekly-frontier marker ───────────────────────────
  const contourPos = new Float32Array(nx * 3);
  const contourGeo = new THREE.BufferGeometry();
  contourGeo.setAttribute('position', new THREE.BufferAttribute(contourPos, 3));
  const contour = new THREE.Line(
    contourGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  world.add(contour);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
  );
  world.add(marker);

  let curSig = S_DEFAULT;

  function updateContour() {
    const zd = zOf(curSig);
    for (let i = 0; i < nx; i++) {
      const d = dOf(i, nx);
      contourPos[i * 3] = xOf(i, nx);
      contourPos[i * 3 + 1] = yOf(rebalances(d, curSig)) + 0.06;
      contourPos[i * 3 + 2] = zd;
    }
    contourGeo.attributes.position.needsUpdate = true;
    contourGeo.computeBoundingSphere();

    // weekly frontier: where cadence crosses 52/yr at this σ
    const dFront = widthForCadence(curSig, WEEKLY);
    // map δ back to the (log-spaced) index x-position
    const fi = (Math.log(dFront / D_MIN) / Math.log(D_MAX / D_MIN)) * (nx - 1);
    const fx = -HALFX + (2 * HALFX * Math.max(0, Math.min(nx - 1, fi))) / (nx - 1);
    marker.position.set(fx, yOf(WEEKLY) + 0.06, zd);
  }

  function renderHud() {
    const r10 = rebalances(0.1, curSig);
    const r30 = rebalances(0.3, curSig);
    const dFront = widthForCadence(curSig, WEEKLY);
    const isEth = Math.abs(curSig - 0.58) < 0.015;
    sigVal.textContent = pct(curSig) + (isEth ? '  · ETH today' : '');
    slider.value = String(curSig);
    stats.innerHTML = `
      <div class="ls-eyebrow">volatility σ = ${pct(curSig)}${isEth ? ' · ETH' : ''}</div>
      <div class="ls-row"><span>±10% range · fee APR</span><b class="ls-hot">${pct(feeApr(0.1))}</b></div>
      <div class="ls-row"><span>±10% · rebalances/yr</span><b>${r10.toFixed(0)}</b></div>
      <div class="ls-row"><span>±10% · days in range</span><b>${mfptDays(0.1, curSig).toFixed(1)}d</b></div>
      <div class="ls-row" style="margin-top:4px"><span>±30% range · fee APR</span><b class="ls-cool">${pct(feeApr(0.3))}</b></div>
      <div class="ls-row"><span>±30% · rebalances/yr</span><b>${r30.toFixed(0)}</b></div>
      <div class="ls-row"><span>±30% · days in range</span><b>${mfptDays(0.3, curSig).toFixed(0)}d</b></div>
      <div class="ls-note">Human weekly frontier ≈ <b class="ls-cyan">±${(dFront * 100).toFixed(0)}%</b>.
        Ranges narrower rebalance more than weekly — an agent's cadence, not a human's.</div>`;
  }

  updateContour();
  renderHud();

  slider.addEventListener('input', () => {
    curSig = Number(slider.value);
    updateContour();
    renderHud();
  });

  // ── interaction ──────────────────────────────────────────────────────────────
  let ceilOn = false;
  let ceilTarget = 0;
  const orbit = attachOrbit(canvas, {
    ambient: 0.05,
    onTap: () => {
      ceilOn = !ceilOn;
      ceilTarget = ceilOn ? 0.14 : 0;
      hapticTick();
    },
  });

  let lastT = 0;
  const handle = createScene(
    canvas,
    (t) => {
      const dt = Math.min(t - lastT, 0.05);
      lastT = t;
      world.rotation.y += orbit.step(dt);

      const cm = ceil.material as THREE.MeshBasicMaterial;
      cm.opacity += (ceilTarget - cm.opacity) * 0.1;
      const em = ceilEdge.material as THREE.LineBasicMaterial;
      em.opacity += ((ceilOn ? 0.55 : 0) - em.opacity) * 0.1;
    },
    { fov: 55, z: 28 },
  );

  handle.scene.fog = new THREE.FogExp2(0x05070d, 0.011);
  handle.scene.add(world);

  return () => {
    hudRo.disconnect();
    orbit.dispose();
    handle.dispose();
    hud.remove();
    style.remove();
    canvas.remove();
  };
}
