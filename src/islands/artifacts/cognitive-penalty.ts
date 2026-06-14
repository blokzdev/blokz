/**
 * Artifact: cognitive-penalty — The Cognitive Penalty
 * Manifest: content/artifacts/cognitive-penalty/manifest.json
 *
 * A dumbbell chart of Sentinel-Bench's intra-model ablation (Rizvi, "The
 * Cognitive Penalty", arXiv:2604.16913): one frozen Qwen-3.5-9B ruling on an
 * adversarial Optimism DAO dataset with deliberation OFF (System 1) vs ON
 * (System 2), 840 inferences total. Each row connects the System-1 value to
 * the System-2 value; the gap is the penalty. Four governance-safety metrics
 * (0-100%, higher = safer) sit over a shared axis; a separated latency row
 * (its own seconds scale) carries the Governance-Extractable-Value window.
 *
 * Numbers are a static snapshot in ./data.json — no runtime fetches. Pure DOM
 * so it reflows cleanly at any width; every row is a focusable control with a
 * pointer + keyboard path.
 */
import data from '../../../content/artifacts/cognitive-penalty/data.json';

interface Row {
  label: string;
  off: number;
  on: number;
  unit: string;
  scaleMax: number;
  penalty: string;
  detail: string;
  kind: 'safety' | 'cost';
}

const OFF_C = '#22d3ee'; // System 1 — think off
const ON_C = '#ff6b6b'; // System 2 — think on (the penalty)

/* Inset the scale so edge dots and their labels never clip. */
const pos = (v: number, max: number) => 4 + (v / max) * 92;

export default function mount(container: HTMLElement): () => void {
  const safety = data.safety as { label: string; off: number; on: number; detail: string }[];
  const cost = data.cost as {
    label: string;
    off: number;
    on: number;
    axisMax: number;
    blocks: number;
    detail: string;
  };

  const rows: Row[] = [
    ...safety.map((r) => ({
      label: r.label,
      off: r.off,
      on: r.on,
      detail: r.detail,
      unit: '%',
      scaleMax: 100,
      penalty: `−${(r.off - r.on).toFixed(1)} pts`,
      kind: 'safety' as const,
    })),
    {
      label: cost.label,
      off: cost.off,
      on: cost.on,
      unit: 's',
      scaleMax: cost.axisMax,
      penalty: `${Math.round(cost.on / cost.off)}×`,
      detail: cost.detail,
      kind: 'cost' as const,
    },
  ];

  let pinned = -1;

  const root = document.createElement('div');
  root.className = 'cp-root';
  container.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .cp-root { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px;
      padding:14px 16px 12px; background:#05070d; overflow-y:auto;
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .cp-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px;
      flex-wrap:wrap; }
    .cp-title { font-size:11px; letter-spacing:.04em; color:#8d95ad; }
    .cp-title b { color:#e7eaf3; font-weight:600; }
    .cp-legend { display:flex; gap:14px; font-size:10px; color:#5b6378; }
    .cp-legend i { display:inline-block; width:9px; height:9px; border-radius:50%;
      margin-right:5px; vertical-align:-1px; }
    .cp-stage { flex:1; min-height:0; display:flex; flex-direction:column;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:8px 12px; gap:2px; }
    .cp-rows { display:flex; flex-direction:column; }
    .cp-row { appearance:none; border:0; background:transparent; text-align:left;
      display:grid; grid-template-columns:minmax(78px,128px) 1fr; align-items:center;
      gap:10px; padding:6px 6px 16px; cursor:pointer; border-radius:8px;
      position:relative; transition:background .18s; }
    .cp-row:hover, .cp-row[data-active="true"] { background:rgba(124,140,255,.06); }
    .cp-row:focus-visible { outline:2px solid #22d3ee; outline-offset:-2px; }
    .cp-rowlabel { font-size:11px; color:#c4cadb; line-height:1.25; }
    .cp-track { position:relative; height:30px; }
    .cp-base { position:absolute; left:4%; right:4%; top:50%; height:1px;
      background:rgba(124,140,255,.16); }
    .cp-conn { position:absolute; top:50%; height:4px; transform:translateY(-50%);
      border-radius:2px; background:linear-gradient(90deg, ${OFF_C}, ${ON_C});
      opacity:.55; transition:left .5s cubic-bezier(.2,.7,.3,1), width .5s cubic-bezier(.2,.7,.3,1); }
    .cp-dot { position:absolute; top:50%; width:12px; height:12px; border-radius:50%;
      transform:translate(-50%,-50%); box-shadow:0 0 8px currentColor;
      transition:left .5s cubic-bezier(.2,.7,.3,1); }
    .cp-dot.off { background:${OFF_C}; color:${OFF_C}; }
    .cp-dot.on { background:${ON_C}; color:${ON_C}; }
    .cp-vlabel { position:absolute; top:-2px; transform:translate(-50%,-100%);
      font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cp-vlabel.off { color:${OFF_C}; }
    .cp-vlabel.on { color:${ON_C}; }
    .cp-delta { position:absolute; bottom:-3px; transform:translate(-50%,100%);
      font-size:9.5px; color:#8d95ad; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cp-axis { position:relative; height:14px; margin:2px 6px 0; }
    .cp-tick { position:absolute; top:0; transform:translateX(-50%); font-size:9px;
      color:#5b6378; font-variant-numeric:tabular-nums; }
    .cp-divider { display:flex; align-items:center; gap:8px; margin:6px 6px 2px;
      font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .cp-divider::before, .cp-divider::after { content:''; flex:1; height:1px;
      background:rgba(124,140,255,.12); }
    .cp-readout { min-height:44px; font-size:11px; line-height:1.5; color:#8d95ad;
      font-variant-numeric:tabular-nums; }
    .cp-readout b { color:#e7eaf3; font-weight:600; }
    .cp-readout .pen { color:#ff8f8f; font-weight:600; }
    .cp-root.cp-narrow .cp-row { grid-template-columns:1fr; gap:3px; padding-bottom:18px; }
    .cp-root.cp-narrow .cp-axis { margin-left:6px; }
  `;
  root.appendChild(style);

  /* ---- Header ---- */
  const head = document.createElement('div');
  head.className = 'cp-head';
  const title = document.createElement('div');
  title.className = 'cp-title';
  title.innerHTML = `One frozen model, two minds — <b>System&nbsp;1</b> vs <b>System&nbsp;2</b>`;
  const legend = document.createElement('div');
  legend.className = 'cp-legend';
  legend.innerHTML =
    `<span><i style="background:${OFF_C}"></i>think&nbsp;off · System&nbsp;1</span>` +
    `<span><i style="background:${ON_C}"></i>think&nbsp;on · System&nbsp;2</span>`;
  head.append(title, legend);
  root.appendChild(head);

  /* ---- Stage ---- */
  const stage = document.createElement('div');
  stage.className = 'cp-stage';

  const safetyWrap = document.createElement('div');
  safetyWrap.className = 'cp-rows';
  safetyWrap.setAttribute('role', 'group');
  safetyWrap.setAttribute('aria-label', 'Governance-safety metrics, higher is safer');
  stage.appendChild(safetyWrap);

  const rowEls: HTMLButtonElement[] = [];
  const conns: HTMLElement[] = [];
  const onDots: HTMLElement[] = [];

  function makeRow(r: Row, idx: number, parent: HTMLElement) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-row';
    btn.dataset.idx = String(idx);
    const sense = r.kind === 'safety' ? 'higher is safer' : 'lower is faster';
    btn.setAttribute(
      'aria-label',
      `${r.label}: System 1 ${r.off}${r.unit}, System 2 ${r.on}${r.unit}, penalty ${r.penalty}. ${sense}.`,
    );

    const lab = document.createElement('span');
    lab.className = 'cp-rowlabel';
    lab.textContent = r.label;

    const track = document.createElement('span');
    track.className = 'cp-track';

    const base = document.createElement('span');
    base.className = 'cp-base';

    const pOff = pos(r.off, r.scaleMax);
    const pOn = pos(r.on, r.scaleMax);
    const lo = Math.min(pOff, pOn);
    const hi = Math.max(pOff, pOn);

    const conn = document.createElement('span');
    conn.className = 'cp-conn';
    conn.style.left = `${pOff}%`; // start collapsed at the off dot
    conn.style.width = '0%';
    conns.push(conn);

    const dotOff = document.createElement('span');
    dotOff.className = 'cp-dot off';
    dotOff.style.left = `${pOff}%`;

    const dotOn = document.createElement('span');
    dotOn.className = 'cp-dot on';
    dotOn.style.left = `${pOff}%`; // animates to pOn
    dotOn.dataset.target = String(pOn);
    onDots.push(dotOn);

    const vOff = document.createElement('span');
    vOff.className = 'cp-vlabel off';
    vOff.style.left = `${pOff}%`;
    vOff.textContent = `${r.off}${r.unit}`;

    const vOn = document.createElement('span');
    vOn.className = 'cp-vlabel on';
    vOn.style.left = `${pOn}%`;
    vOn.textContent = `${r.on}${r.unit}`;
    if (Math.abs(pOff - pOn) < 9) {
      vOff.style.transform = 'translate(-88%,-100%)';
      vOn.style.transform = 'translate(-12%,-100%)';
    }

    const delta = document.createElement('span');
    delta.className = 'cp-delta';
    delta.style.left = `${(lo + hi) / 2}%`;
    delta.textContent = r.penalty;

    track.append(base, conn, delta, dotOff, dotOn, vOff, vOn);
    btn.append(lab, track);
    parent.appendChild(btn);
    rowEls.push(btn);
  }

  safety.forEach((_, i) => makeRow(rows[i]!, i, safetyWrap));

  const axis = document.createElement('div');
  axis.className = 'cp-axis';
  [0, 25, 50, 75, 100].forEach((t) => {
    const s = document.createElement('span');
    s.className = 'cp-tick';
    s.style.left = `${pos(t, 100)}%`;
    s.textContent = `${t}%`;
    axis.appendChild(s);
  });
  stage.appendChild(axis);

  const divider = document.createElement('div');
  divider.className = 'cp-divider';
  divider.textContent = 'the cost of thinking';
  stage.appendChild(divider);

  const costWrap = document.createElement('div');
  costWrap.className = 'cp-rows';
  stage.appendChild(costWrap);
  const costIdx = rows.length - 1;
  makeRow(rows[costIdx]!, costIdx, costWrap);

  const caxis = document.createElement('div');
  caxis.className = 'cp-axis';
  [0, 60, 120, 180, 240].forEach((t) => {
    const s = document.createElement('span');
    s.className = 'cp-tick';
    s.style.left = `${pos(t, cost.axisMax)}%`;
    s.textContent = `${t}s`;
    caxis.appendChild(s);
  });
  stage.appendChild(caxis);

  root.appendChild(stage);

  /* ---- Readout ---- */
  const readout = document.createElement('div');
  readout.className = 'cp-readout';
  root.appendChild(readout);

  const defaultText =
    `Think-off (<b>System&nbsp;1</b>) holds every governance metric at <b>100%</b>. ` +
    `Switching on deliberation — the same weights, just reasoning — pays a ` +
    `<span class="pen">penalty</span> on all four, and 17× the latency. Tap a row.`;

  function setReadout(i: number) {
    rowEls.forEach((el, j) => el.setAttribute('data-active', String(j === i)));
    if (i < 0) {
      readout.innerHTML = defaultText;
      return;
    }
    const r = rows[i]!;
    readout.innerHTML =
      `<b>${r.label}</b> — System 1 <b>${r.off}${r.unit}</b> → System 2 ` +
      `<b style="color:${ON_C}">${r.on}${r.unit}</b> ` +
      `(<span class="pen">${r.penalty}</span>). ${r.detail}`;
  }
  setReadout(-1);

  /* ---- Interaction ---- */
  const onEnter = (e: Event) => {
    const el = (e.target as Element).closest<HTMLButtonElement>('.cp-row');
    if (el) setReadout(Number(el.dataset.idx));
  };
  const onLeave = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    setReadout(pinned);
  };
  const onClick = (e: Event) => {
    const el = (e.target as Element).closest<HTMLButtonElement>('.cp-row');
    if (!el) return;
    pinned = Number(el.dataset.idx);
    setReadout(pinned);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cur = rowEls.indexOf(document.activeElement as HTMLButtonElement);
    if (cur < 0) return;
    e.preventDefault();
    const next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + rowEls.length) % rowEls.length;
    rowEls[next]!.focus();
  };
  stage.addEventListener('pointerover', onEnter);
  stage.addEventListener('pointerout', onLeave);
  stage.addEventListener('focusin', onEnter);
  stage.addEventListener('focusout', onLeave);
  stage.addEventListener('click', onClick);
  stage.addEventListener('keydown', onKey);

  /* ---- Reveal: expand connectors + slide the System-2 dots into place ---- */
  const reveal = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rows.forEach((r, i) => {
        const pOff = pos(r.off, r.scaleMax);
        const pOn = Number(onDots[i]!.dataset.target);
        const lo = Math.min(pOff, pOn);
        const hi = Math.max(pOff, pOn);
        conns[i]!.style.left = `${lo}%`;
        conns[i]!.style.width = `${hi - lo}%`;
        onDots[i]!.style.left = `${pOn}%`;
      });
    });
  });

  /* ---- Responsive ---- */
  const ro = new ResizeObserver(([entry]) => {
    root.classList.toggle('cp-narrow', (entry?.contentRect.width ?? 600) < 420);
  });
  ro.observe(container);

  return () => {
    cancelAnimationFrame(reveal);
    ro.disconnect();
    stage.removeEventListener('pointerover', onEnter);
    stage.removeEventListener('pointerout', onLeave);
    stage.removeEventListener('focusin', onEnter);
    stage.removeEventListener('focusout', onLeave);
    stage.removeEventListener('click', onClick);
    stage.removeEventListener('keydown', onKey);
    root.remove();
  };
}
