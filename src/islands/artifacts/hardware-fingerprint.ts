/**
 * Artifact: hardware-fingerprint — The Hardware Fingerprint
 * Manifest: content/artifacts/hardware-fingerprint/manifest.json
 *
 * A decentralized GPU network can't take a provider's word for what silicon it
 * runs — device metadata is trivially forged. The durable defence is to *measure*
 * the device: run a fixed benchmark and read back achieved FP16 throughput,
 * memory bandwidth, and visible VRAM. Real GPU models occupy distinct points in
 * that space, so a provider who bills for an H100 while running an A100 lands far
 * from the H100's reference fingerprint and gets flagged.
 *
 * This is a scatter of nine real NVIDIA accelerators in (FP16 TFLOPS × memory
 * bandwidth) with bubble area ∝ VRAM. Pick the GPU a provider is BILLED for and
 * the GPU it's ACTUALLY running; the artifact measures the real device and
 * computes the fingerprint deviation from the claimed reference across all three
 * signals. Past the measurement-tolerance band the spoof is caught; the verdict
 * names the signal that gave it away. Choosing the same card on both sides is an
 * honest match. Spec numbers are NVIDIA datasheet peaks (see data.json).
 *
 * SVG chart. Two native selects drive it; ← → cycle the "actually running" card;
 * no RAF (renders on input). Layout via the shared responsive primitive.
 */
import data from '../../../content/artifacts/hardware-fingerprint/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

interface Gpu { id: string; label: string; arch: string; fp16: number; vram: number; bandwidth: number }

const GPUS = data.gpus as Gpu[];
const TOL = data.tolerance; // combined relative-deviation tolerance band
const FP16_MAX = data.axes.fp16.max;
const BW_MAX = data.axes.bandwidth.max;

const NS = 'http://www.w3.org/2000/svg';

/* --- Chart geometry (viewBox units) --- */
const VB_W = 820;
const VB_H = 470;
const X0 = 64;
const X1 = 792;
const Y_TOP = 30;
const Y_BASE = 404;

const xOf = (fp16: number) => X0 + (fp16 / FP16_MAX) * (X1 - X0);
const yOf = (bw: number) => Y_BASE - (bw / BW_MAX) * (Y_BASE - Y_TOP);
// bubble radius scales with sqrt(VRAM) so area ∝ capacity
const rOf = (vram: number) => 6 + Math.sqrt(vram / 141) * 12;

/* --- fingerprint deviation: relative to the CLAIMED reference, across 3 signals --- */
function deviations(claimed: Gpu, actual: Gpu) {
  return {
    fp16: (actual.fp16 - claimed.fp16) / claimed.fp16,
    bandwidth: (actual.bandwidth - claimed.bandwidth) / claimed.bandwidth,
    vram: (actual.vram - claimed.vram) / claimed.vram,
  };
}
const distance = (d: { fp16: number; bandwidth: number; vram: number }) =>
  Math.sqrt(d.fp16 * d.fp16 + d.bandwidth * d.bandwidth + d.vram * d.vram);

const SIGNAL_LABEL: Record<string, string> = {
  fp16: 'compute throughput',
  bandwidth: 'memory bandwidth',
  vram: 'VRAM capacity',
};

const pctSigned = (x: number) => `${x >= 0 ? '+' : '−'}${(Math.abs(x) * 100).toFixed(0)}%`;
const ARCH_HUE: Record<string, string> = {
  Hopper: '#7c8cff', Ampere: '#22d3ee', Ada: '#f5a524', Volta: '#9b8cff',
};

export default function mount(container: HTMLElement): () => void {
  let claimed = Math.max(0, GPUS.findIndex((g) => g.id === data.defaults.claimed));
  let actual = Math.max(0, GPUS.findIndex((g) => g.id === data.defaults.actual));

  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: '820/470',
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .hfp-chartwrap { position:absolute; inset:0;
      border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322; }
    .hfp-chartwrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:manipulation; }
    .hfp-grid { stroke:rgba(124,140,255,.09); }
    .hfp-axis { fill:#8d95ad; font:500 11px 'JetBrains Mono', monospace; }
    .hfp-axislab { fill:#5b6378; font:500 9.5px 'JetBrains Mono', monospace; }
    .hfp-band { fill:rgba(124,140,255,.07); stroke:rgba(124,140,255,.5); stroke-width:1.2; stroke-dasharray:4 4; }
    .hfp-link { stroke:#f97362; stroke-width:1.6; stroke-dasharray:5 4; opacity:.8; }
    .hfp-link-ok { stroke:#22d3ee; stroke-width:1.6; opacity:.7; }
    .hfp-node { outline:none; cursor:pointer; }
    .hfp-bub { stroke:#05070d; stroke-width:1.2; }
    .hfp-node:focus-visible .hfp-ring { opacity:1; }
    .hfp-ring { fill:none; stroke:#e7eaf3; stroke-width:1.4; opacity:0; }
    .hfp-lab { font:600 9.5px 'JetBrains Mono', monospace; pointer-events:none; fill:#8d95ad; }
    .hfp-claimed-mk { fill:none; stroke:#e7eaf3; stroke-width:1.8; }
    .hfp-actual-mk { stroke:#05070d; stroke-width:1.6; }
    .hfp-tag { font:600 9px 'JetBrains Mono', monospace; pointer-events:none; }

    .hfp-controls { display:flex; align-items:flex-end; gap:12px 18px; flex-wrap:wrap;
      max-width:100%; min-width:0; font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .hfp-cgroup { display:flex; flex-direction:column; gap:5px; min-width:0; flex:1 1 200px; }
    .hfp-cgroup > span { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }
    .hfp-cgroup > span b { color:#8d95ad; font-weight:700; }
    .hfp-sel { appearance:none; width:100%; min-width:0; border:1px solid rgba(124,140,255,.2); border-radius:8px;
      background:#10172a; color:#e7eaf3; font:600 12px 'JetBrains Mono', monospace; padding:9px 11px; cursor:pointer;
      background-image:linear-gradient(45deg,transparent 50%,#5b6378 50%),linear-gradient(135deg,#5b6378 50%,transparent 50%);
      background-position:calc(100% - 16px) 17px,calc(100% - 11px) 17px; background-size:5px 5px,5px 5px; background-repeat:no-repeat; }
    .hfp-sel:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }
    .hfp-swap { appearance:none; border:1px solid rgba(124,140,255,.2); border-radius:8px; background:transparent;
      color:#8d95ad; font:600 11px 'JetBrains Mono', monospace; padding:9px 12px; cursor:pointer; align-self:flex-end;
      transition:color .2s, border-color .2s; flex:0 0 auto; }
    .hfp-swap:hover { color:#e7eaf3; border-color:rgba(124,140,255,.5); }
    .hfp-swap:focus-visible { outline:2px solid #5b8cff; outline-offset:2px; }

    .hfp-readout { display:flex; flex-direction:column; gap:9px; min-width:0; max-width:100%;
      font:500 12px/1.5 'JetBrains Mono', monospace; color:#8d95ad; font-variant-numeric:tabular-nums; }
    .hfp-hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
    .hfp-hd .hfp-name { color:#e7eaf3; font-weight:700; font-size:13.5px; }
    .hfp-hd .hfp-arrow { color:#5b6378; }
    .hfp-rows { display:flex; flex-direction:column; gap:4px; }
    .hfp-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:baseline; gap:6px 10px; }
    .hfp-row > span { font-size:10.5px; color:#8d95ad; min-width:0; }
    .hfp-row b { font-size:12px; font-weight:700; color:#e7eaf3; text-align:right; }
    .hfp-row .hfp-dev { font-size:11px; font-weight:700; min-width:46px; text-align:right; }
    .hfp-dev.up { color:#22d3ee; } .hfp-dev.dn { color:#f97362; } .hfp-dev.eq { color:#5b6378; }
    .hfp-verdict { padding:9px 11px; border-radius:8px; font-size:11.5px; line-height:1.45; min-width:0; overflow-wrap:anywhere; }
    .hfp-verdict.bad { background:rgba(249,115,98,.1); color:#ffb3a8; border:1px solid rgba(249,115,98,.24); }
    .hfp-verdict.good { background:rgba(34,211,238,.1); color:#9fe9f5; border:1px solid rgba(34,211,238,.22); }
    .hfp-verdict b { font-weight:700; }
    .hfp-cap { font:500 9.5px/1.6 'JetBrains Mono', monospace; color:#5b6378; letter-spacing:.01em; min-width:0; overflow-wrap:anywhere; }
    .hfp-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---- Chart scaffold ---- */
  const chartWrap = document.createElement('div');
  chartWrap.className = 'hfp-chartwrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'GPU fingerprint scatter: FP16 throughput versus memory bandwidth, bubble size by VRAM');
  svg.setAttribute('tabindex', '0');
  chartWrap.appendChild(svg);
  stage.appendChild(chartWrap);
  const gPlot = document.createElementNS(NS, 'g');
  svg.appendChild(gPlot);

  const mkText = (x: number, y: number, cls: string, text: string, anchor = 'start') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('class', cls); t.setAttribute('text-anchor', anchor);
    t.textContent = text; gPlot.appendChild(t); return t;
  };
  const mkLine = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls); gPlot.appendChild(l); return l;
  };

  /* ---- Controls ---- */
  const controls = document.createElement('div');
  controls.className = 'hfp-controls';

  const mkSelect = (ariaLabel: string, onChange: (i: number) => void) => {
    const group = document.createElement('div');
    group.className = 'hfp-cgroup';
    const lab = document.createElement('span');
    const sel = document.createElement('select');
    sel.className = 'hfp-sel';
    sel.setAttribute('aria-label', ariaLabel);
    GPUS.forEach((g, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${g.label} · ${g.fp16} TF · ${g.vram}GB · ${g.bandwidth}GB/s`;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(Number(sel.value)));
    group.append(lab, sel);
    return { group, sel, lab };
  };

  const claimedCtl = mkSelect('GPU the provider is billed for', (i) => { claimed = i; render(); });
  const actualCtl = mkSelect('GPU actually in the machine', (i) => { actual = i; render(); });

  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'hfp-swap';
  swapBtn.textContent = '⇄ swap';
  swapBtn.setAttribute('aria-label', 'swap billed and actual GPUs');
  swapBtn.addEventListener('click', () => { const t = claimed; claimed = actual; actual = t; render(); });

  controls.append(claimedCtl.group, actualCtl.group, swapBtn);
  controlsSlot.appendChild(controls);

  /* ---- Panel readout ---- */
  const readout = document.createElement('div');
  readout.className = 'hfp-readout';
  panel.appendChild(readout);

  /* ---- Caption ---- */
  const cap = document.createElement('div');
  cap.className = 'hfp-cap';
  cap.innerHTML =
    'Each bubble is a real accelerator at its NVIDIA datasheet peak — <b>FP16 dense Tensor TFLOPS</b> (x), ' +
    '<b>memory bandwidth</b> (y), area ∝ <b>VRAM</b>. A verifier benchmarks the device that is actually running and ' +
    'measures its deviation from the claimed model across all three signals; beyond the <b>' + (TOL * 100).toFixed(0) +
    '%</b> measurement-tolerance band the spoof is caught. Pick two cards, or use ← →.';
  caption.appendChild(cap);

  const nodes: SVGGElement[] = [];

  function render() {
    while (gPlot.firstChild) gPlot.removeChild(gPlot.firstChild);
    nodes.length = 0;

    const cG = GPUS[claimed];
    const aG = GPUS[actual];
    const dev = deviations(cG, aG);
    const dist = distance(dev);
    const caught = dist > TOL;
    const isMatch = claimed === actual;

    /* axes */
    mkText(X0 - 8, 20, 'hfp-axis', 'memory bandwidth (GB/s)', 'start');
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = (BW_MAX / yTicks) * i;
      const y = yOf(v);
      mkLine(X0, y, X1, y, 'hfp-grid');
      mkText(X0 - 8, y + 3.5, 'hfp-axislab', `${(v / 1000).toFixed(1)}T`, 'end');
    }
    mkLine(X0, Y_BASE, X1, Y_BASE, 'hfp-grid');
    for (let i = 0; i <= 5; i++) {
      const v = (FP16_MAX / 5) * i;
      const x = xOf(v);
      if (i > 0) mkLine(x, Y_TOP, x, Y_BASE, 'hfp-grid');
      mkText(x, Y_BASE + 16, 'hfp-axislab', `${Math.round(v)}`, 'middle');
    }
    mkText((X0 + X1) / 2, Y_BASE + 31, 'hfp-axis', 'FP16 dense Tensor-Core TFLOPS  →', 'middle');

    /* tolerance band around the claimed reference (ellipse: TOL on each visible axis) */
    const cx = xOf(cG.fp16);
    const cy = yOf(cG.bandwidth);
    const rx = (TOL * cG.fp16 / FP16_MAX) * (X1 - X0);
    const ry = (TOL * cG.bandwidth / BW_MAX) * (Y_BASE - Y_TOP);
    const band = document.createElementNS(NS, 'ellipse');
    band.setAttribute('cx', String(cx)); band.setAttribute('cy', String(cy));
    band.setAttribute('rx', String(Math.max(rx, 7))); band.setAttribute('ry', String(Math.max(ry, 7)));
    band.setAttribute('class', 'hfp-band');
    gPlot.appendChild(band);

    /* connector from claimed → actual */
    if (!isMatch) {
      mkLine(cx, cy, xOf(aG.fp16), yOf(aG.bandwidth), caught ? 'hfp-link' : 'hfp-link-ok');
    }

    /* all GPU bubbles */
    GPUS.forEach((g, i) => {
      const x = xOf(g.fp16);
      const y = yOf(g.bandwidth);
      const r = rOf(g.vram);
      const hue = ARCH_HUE[g.arch] ?? '#8d95ad';
      const isClaimed = i === claimed;
      const isActual = i === actual;

      const node = document.createElementNS(NS, 'g') as SVGGElement;
      node.setAttribute('class', 'hfp-node');
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label',
        `${g.label}: ${g.fp16} FP16 teraflops, ${g.bandwidth} gigabytes per second, ${g.vram} gigabytes. Set as actually running.`);

      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'hfp-ring');
      ring.setAttribute('cx', String(x)); ring.setAttribute('cy', String(y));
      ring.setAttribute('r', String(r + 4));
      node.appendChild(ring);

      const bub = document.createElementNS(NS, 'circle');
      bub.setAttribute('class', 'hfp-bub');
      bub.setAttribute('cx', String(x)); bub.setAttribute('cy', String(y));
      bub.setAttribute('r', String(r));
      bub.setAttribute('fill', hue);
      bub.style.opacity = isClaimed || isActual ? '0.92' : '0.42';
      node.appendChild(bub);

      // claimed = white hollow ring marker; actual = solid dot marker
      if (isClaimed) {
        const m = document.createElementNS(NS, 'circle');
        m.setAttribute('class', 'hfp-claimed-mk');
        m.setAttribute('cx', String(x)); m.setAttribute('cy', String(y));
        m.setAttribute('r', String(r + 2.5));
        node.appendChild(m);
      }
      if (isActual) {
        const m = document.createElementNS(NS, 'circle');
        m.setAttribute('class', 'hfp-actual-mk');
        m.setAttribute('cx', String(x)); m.setAttribute('cy', String(y));
        m.setAttribute('r', '3.4');
        m.setAttribute('fill', caught && !isMatch ? '#f97362' : '#e7eaf3');
        node.appendChild(m);
      }

      // label placement: above the bubble, flipped down if near the top
      const anchor = x > X1 - 70 ? 'end' : x < X0 + 50 ? 'start' : 'middle';
      const above = y - r - 6 > Y_TOP + 8;
      const lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', String(x));
      lab.setAttribute('y', String(above ? y - r - 6 : y + r + 12));
      lab.setAttribute('text-anchor', anchor);
      lab.setAttribute('class', 'hfp-lab');
      if (isClaimed || isActual) lab.setAttribute('fill', '#e7eaf3');
      lab.textContent = g.label;
      node.appendChild(lab);

      const select = () => { actual = i; render(); };
      node.addEventListener('click', select);
      node.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      gPlot.appendChild(node);
      nodes[i] = node;
    });

    // role tags next to the two active bubbles
    const tag = (g: Gpu, text: string, color: string) => {
      const t = mkText(xOf(g.fp16) + rOf(g.vram) + 6, yOf(g.bandwidth) + 3, 'hfp-tag', text, 'start');
      t.setAttribute('fill', color);
    };
    if (isMatch) {
      tag(cG, 'BILLED = RUN', '#9fe9f5');
    } else {
      tag(cG, 'BILLED', '#e7eaf3');
      tag(aG, 'RUNNING', caught ? '#f97362' : '#9fe9f5');
    }

    // sync selects + labels
    claimedCtl.sel.value = String(claimed);
    actualCtl.sel.value = String(actual);
    claimedCtl.lab.innerHTML = `billed as · <b>${cG.label}</b>`;
    actualCtl.lab.innerHTML = `actually running · <b>${aG.label}</b>`;

    renderPanel(cG, aG, dev, dist, caught, isMatch);
  }

  function renderPanel(
    cG: Gpu, aG: Gpu,
    dev: { fp16: number; bandwidth: number; vram: number },
    dist: number, caught: boolean, isMatch: boolean,
  ) {
    readout.innerHTML = '';

    const hd = document.createElement('div');
    hd.className = 'hfp-hd';
    const nm = document.createElement('span');
    nm.className = 'hfp-name';
    nm.textContent = cG.label;
    hd.appendChild(nm);
    if (!isMatch) {
      const ar = document.createElement('span'); ar.className = 'hfp-arrow'; ar.textContent = '→ runs';
      const rn = document.createElement('span'); rn.className = 'hfp-name'; rn.textContent = aG.label;
      hd.append(ar, rn);
    }

    const rows = document.createElement('div');
    rows.className = 'hfp-rows';
    const mkRow = (label: string, actualV: string, d: number) => {
      const r = document.createElement('div');
      r.className = 'hfp-row';
      const s = document.createElement('span'); s.textContent = label;
      const b = document.createElement('b'); b.textContent = actualV;
      const dv = document.createElement('b');
      dv.className = 'hfp-dev ' + (Math.abs(d) < 1e-9 ? 'eq' : d > 0 ? 'up' : 'dn');
      dv.textContent = Math.abs(d) < 1e-9 ? '—' : pctSigned(d);
      r.append(s, b, dv);
      return r;
    };
    rows.append(
      mkRow('FP16 TFLOPS', `${aG.fp16}`, dev.fp16),
      mkRow('bandwidth GB/s', `${aG.bandwidth}`, dev.bandwidth),
      mkRow('VRAM GB', `${aG.vram}`, dev.vram),
    );

    // dominant signal driving the deviation
    const entries = Object.entries(dev) as [keyof typeof dev, number][];
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const lead = entries[0];

    const verdict = document.createElement('div');
    verdict.className = `hfp-verdict ${caught ? 'bad' : 'good'}`;
    if (isMatch) {
      verdict.innerHTML =
        `Honest: the measured device <b>is</b> the ${cG.label}. Fingerprint deviation <b>0%</b> — inside the ${(TOL * 100).toFixed(0)}% band. ` +
        `Identity checks out; whether it actually ran <i>your</i> job is a separate, work-verification question.`;
    } else if (caught) {
      verdict.innerHTML =
        `Caught: a ${aG.label} can't pass for a ${cG.label}. Fingerprint deviation <b>${(dist * 100).toFixed(0)}%</b> ` +
        `(tolerance ${(TOL * 100).toFixed(0)}%), led by <b>${SIGNAL_LABEL[lead[0]]}</b> at <b>${pctSigned(lead[1])}</b>. ` +
        `Bill the claimed rate, deliver ${(aG.fp16 / cG.fp16 * 100).toFixed(0)}% of the compute — the benchmark gives it away.`;
    } else {
      verdict.innerHTML =
        `Slips through: at <b>${(dist * 100).toFixed(0)}%</b> deviation the ${aG.label} sits inside the ${cG.label}'s ${(TOL * 100).toFixed(0)}% band. ` +
        `Fingerprints this close need a tighter benchmark — or a cryptographic device proof — to separate.`;
    }
    readout.append(hd, rows, verdict);
  }

  // arrow keys cycle the "actually running" card
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      actual = (actual + 1) % GPUS.length; render(); nodes[actual]?.focus(); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      actual = (actual - 1 + GPUS.length) % GPUS.length; render(); nodes[actual]?.focus(); e.preventDefault();
    }
  };
  svg.addEventListener('keydown', onKey);

  render();

  return () => {
    layout.dispose();
    svg.removeEventListener('keydown', onKey);
    style.remove();
  };
}
