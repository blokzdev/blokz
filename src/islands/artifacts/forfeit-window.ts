/**
 * Artifact: forfeit-window — The Forfeit Window
 * Manifest: content/artifacts/forfeit-window/manifest.json
 *
 * Olas's Mech Marketplace (Gnosis, v1.1.0) posts an AI-task request to a single
 * chosen "priority mech" with an exclusive response window bounded on-chain to
 * [minResponseTimeout, maxResponseTimeout] = [60s, 300s]. Inside that window
 * only the priority mech may deliver; if it does, it earns the fee and +1 Karma.
 * If block.timestamp passes the window before delivery, any other staked mech
 * may step in: it delivers, takes the fee, and the marketplace docks the
 * no-show priority mech −1 Karma (MechMarketplace.deliverMarketplace).
 *
 * This piece makes that branch drivable. Drag the priority mech's actual
 * response time across the window edge and watch the request resolve one way or
 * the other: the delivering mech, the Karma deltas, and the fee split (the
 * universal 15% marketplace fee → BuyBackBurner, the rest → the mech) all flip.
 *
 * Pure DOM + inline SVG, no deps, no RAF (a CSS transition animates the
 * playhead; reduced motion is a no-op). Live on-chain anchors live in
 * ./data.json.
 *
 * Layout: shared responsive primitive — stage timeline · panel verdict + Karma
 * ledger + fee split · footer window/response/rate sliders · caption source.
 */
import data from '../../../content/artifacts/forfeit-window/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const SVG = 'http://www.w3.org/2000/svg';

// On-chain window bounds (seconds) and fee.
const WIN_MIN = data.minResponseTimeout; // 60
const WIN_MAX = data.maxResponseTimeout; // 300
const FEE = data.feeBps / 10_000; // 0.15
const AXIS_MAX = 360; // seconds shown on the timeline (window max + headroom)

// SVG viewBox geometry (scales to the stage via width:100%).
const VB_W = 340;
const VB_H = 132;
const PAD_L = 12;
const PAD_R = 14;
const PLOT_W = VB_W - PAD_L - PAD_R;
const Y_PRIO = 40; // priority-mech lane baseline
const Y_BACK = 84; // backup-mech lane baseline
const Y_AXIS = 112; // time axis

const xOf = (t: number) => PAD_L + (Math.min(t, AXIS_MAX) / AXIS_MAX) * PLOT_W;

const fmt = (n: number) => n.toLocaleString('en-US');
const rate = (x: number) => (x < 1 ? x.toFixed(3) : x.toFixed(2));

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'footer',
    stageAspect: `${VB_W}/${VB_H}`,
  });
  const { stage, panel, controls: controlsSlot, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .fw-stage, .fw-panel, .fw-controls, .fw-cap {
      font:500 12px/1.45 'JetBrains Mono', monospace; color:#8d95ad; }
    .fw-wrap { position:absolute; inset:0; background:#05070d; border-radius:12px;
      border:1px solid rgba(124,140,255,.14); }
    .fw-svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .fw-play { transition:transform .35s cubic-bezier(.4,0,.2,1); }
    .fw-mk { transition:transform .35s cubic-bezier(.4,0,.2,1), opacity .25s; }

    .fw-panel { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%; }
    .fw-verdict { display:flex; align-items:center; gap:10px; border-radius:10px; padding:9px 12px;
      transition:.25s; flex-wrap:wrap; min-width:0; }
    .fw-verdict.fw-ok { background:rgba(34,211,238,.08); box-shadow:inset 0 0 0 1px rgba(34,211,238,.4); }
    .fw-verdict.fw-forfeit { background:rgba(240,136,62,.08); box-shadow:inset 0 0 0 1px rgba(240,136,62,.45); }
    .fw-vicon { font-size:19px; line-height:1; flex:0 0 auto; }
    .fw-vbody { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1 1 180px; }
    .fw-vtitle { font:700 12px 'JetBrains Mono', monospace; }
    .fw-verdict.fw-ok .fw-vtitle { color:#22d3ee; }
    .fw-verdict.fw-forfeit .fw-vtitle { color:#f0883e; }
    .fw-vsub { font-size:10px; color:#7c8299; line-height:1.45; overflow-wrap:anywhere; }
    .fw-vsub b { color:#cdd3e3; font-weight:600; }

    .fw-sect { font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:#5b6378; }

    .fw-karma { display:flex; flex-direction:column; gap:6px; }
    .fw-krow { display:flex; align-items:center; gap:8px; border-radius:8px; padding:7px 10px;
      background:#0a0f1c; box-shadow:inset 0 0 0 1px rgba(124,140,255,.12); min-width:0; }
    .fw-kdot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
    .fw-kdot.fw-p { background:#22d3ee; } .fw-kdot.fw-b { background:#f0883e; }
    .fw-kname { font-size:10.5px; color:#cdd3e3; min-width:0; overflow-wrap:anywhere; flex:1 1 auto; }
    .fw-kname span { color:#5b6378; }
    .fw-kdelta { font:700 12px 'JetBrains Mono', monospace; font-variant-numeric:tabular-nums;
      flex:0 0 auto; white-space:nowrap; }
    .fw-kdelta.fw-up { color:#22d3ee; } .fw-kdelta.fw-down { color:#f0883e; }
    .fw-kdelta.fw-zero { color:#5b6378; }

    .fw-split { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
    .fw-cell { border-radius:8px; padding:7px 9px; background:#0a0f1c;
      box-shadow:inset 0 0 0 1px rgba(124,140,255,.12); display:flex; flex-direction:column; gap:2px;
      min-width:0; }
    .fw-cn { font-size:8.5px; letter-spacing:.05em; text-transform:uppercase; color:#5b6378;
      overflow-wrap:anywhere; }
    .fw-cv { font:700 14px 'JetBrains Mono', monospace; font-variant-numeric:tabular-nums;
      color:#cdd3e3; overflow-wrap:anywhere; }
    .fw-cell.fw-mech .fw-cv { color:#22d3ee; }
    .fw-cell.fw-burn .fw-cv { color:#a78bfa; }
    .fw-cs { font-size:8.5px; color:#7c8299; overflow-wrap:anywhere; }

    .fw-controls { display:flex; gap:13px; align-items:end; flex-wrap:wrap; min-width:0; max-width:100%; }
    .fw-field { display:flex; flex-direction:column; gap:4px; flex:1 1 150px; min-width:0; }
    .fw-field label { display:flex; justify-content:space-between; gap:8px; font-size:9px;
      letter-spacing:.04em; text-transform:uppercase; color:#5b6378; }
    .fw-field label output { color:#e7eaf3; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .fw-field input[type=range] { width:100%; cursor:pointer; margin:0; }
    .fw-field.fw-win input { accent-color:#7c8cff; }
    .fw-field.fw-resp input { accent-color:#22d3ee; }
    .fw-field.fw-rate input { accent-color:#a78bfa; }

    .fw-cap { font-size:9.5px; color:#5b6378; line-height:1.55; min-width:0; max-width:100%;
      overflow-wrap:anywhere; }
    .fw-cap b { color:#cdd3e3; font-weight:600; }
    .fw-cap a { color:#22d3ee; text-decoration:none; }
    .fw-cap a:hover { text-decoration:underline; }
  `;
  stage.appendChild(style);
  stage.classList.add('fw-stage');
  panel.classList.add('fw-panel');

  // ---------------------------------------------------------------- state
  let win = 120; // priority window (s) — responseTimeout
  let resp = 75; // priority mech actual response time (s)
  let payRate = 0.01; // delivery rate (xDAI) — illustrative price

  // ---------------------------------------------------------------- SVG stage
  const wrap = document.createElement('div');
  wrap.className = 'fw-wrap';
  const svg = el('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, class: 'fw-svg' });
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Mech request timeline showing the priority response window');

  // window band (priority-exclusive region)
  const band = el('rect', {
    x: xOf(0), y: 22, width: 1, height: Y_AXIS - 22, rx: 4,
    fill: 'rgba(124,140,255,.09)', stroke: 'rgba(124,140,255,.35)', 'stroke-width': 1,
  });
  svg.appendChild(band);
  const bandLbl = el('text', {
    x: 0, y: 18, 'font-size': 8.5, 'font-family': 'JetBrains Mono, monospace',
    fill: '#7c8cff', 'text-anchor': 'start',
  });
  bandLbl.textContent = 'priority-exclusive window';
  svg.appendChild(bandLbl);

  // axis
  svg.appendChild(el('line', {
    x1: PAD_L, y1: Y_AXIS, x2: VB_W - PAD_R, y2: Y_AXIS,
    stroke: '#1b2336', 'stroke-width': 1.5,
  }));
  const ticks: { line: SVGLineElement; txt: SVGTextElement }[] = [];
  for (let i = 0; i < 3; i++) {
    const line = el('line', {
      x1: 0, y1: Y_AXIS - 3, x2: 0, y2: Y_AXIS + 3, stroke: '#2c3550', 'stroke-width': 1,
    });
    const txt = el('text', {
      x: 0, y: Y_AXIS + 13, 'font-size': 8, 'font-family': 'JetBrains Mono, monospace',
      fill: '#5b6378', 'text-anchor': 'middle',
    });
    svg.append(line, txt);
    ticks.push({ line, txt });
  }

  // lane baselines + labels
  const mkLane = (y: number, label: string, color: string) => {
    svg.appendChild(el('line', {
      x1: PAD_L, y1: y, x2: VB_W - PAD_R, y2: y, stroke: '#141a2b', 'stroke-width': 1,
      'stroke-dasharray': '2 3',
    }));
    const t = el('text', {
      x: PAD_L, y: y - 7, 'font-size': 8.5, 'font-family': 'JetBrains Mono, monospace',
      fill: color, 'text-anchor': 'start', 'letter-spacing': '.04em',
    });
    t.textContent = label;
    svg.appendChild(t);
  };
  mkLane(Y_PRIO, 'PRIORITY MECH', '#22d3ee');
  mkLane(Y_BACK, 'BACKUP MECHS', '#f0883e');

  // request origin node (t=0)
  svg.appendChild(el('circle', { cx: xOf(0), cy: Y_AXIS, r: 3, fill: '#e7eaf3' }));

  // priority "intended" delivery tick (where the priority mech WOULD land)
  const intentG = el('g', { class: 'fw-mk' });
  const intentNode = el('circle', {
    cx: 0, cy: Y_PRIO, r: 3.5, fill: 'none', stroke: '#5b6378', 'stroke-width': 1.5,
    'stroke-dasharray': '2 2',
  });
  intentG.appendChild(intentNode);
  svg.appendChild(intentG);

  // delivery marker (sits on the delivering lane)
  const mkGroup = el('g', { class: 'fw-mk' });
  const mkStem = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#22d3ee', 'stroke-width': 1.5 });
  const mkGlow = el('circle', { cx: 0, cy: 0, r: 5, fill: '#22d3ee', opacity: 0.18 });
  const mkNode = el('circle', { cx: 0, cy: 0, r: 5, fill: '#05070d', stroke: '#22d3ee', 'stroke-width': 2 });
  mkGroup.append(mkStem, mkGlow, mkNode);
  svg.appendChild(mkGroup);

  // playhead (resolution time)
  const playG = el('g', { class: 'fw-play' });
  const playLine = el('line', {
    x1: 0, y1: 22, x2: 0, y2: Y_AXIS, stroke: '#22d3ee', 'stroke-width': 1,
    'stroke-dasharray': '3 3', opacity: 0.55,
  });
  playG.appendChild(playLine);
  svg.appendChild(playG);

  wrap.appendChild(svg);
  stage.appendChild(wrap);

  // ---------------------------------------------------------------- panel
  const verdict = document.createElement('div');
  verdict.className = 'fw-verdict';
  const vIcon = document.createElement('div');
  vIcon.className = 'fw-vicon';
  const vBody = document.createElement('div');
  vBody.className = 'fw-vbody';
  const vTitle = document.createElement('div');
  vTitle.className = 'fw-vtitle';
  const vSub = document.createElement('div');
  vSub.className = 'fw-vsub';
  vBody.append(vTitle, vSub);
  verdict.append(vIcon, vBody);
  panel.appendChild(verdict);

  const karmaSect = document.createElement('div');
  karmaSect.className = 'fw-sect';
  karmaSect.textContent = 'karma ledger (this request)';
  panel.appendChild(karmaSect);

  const karma = document.createElement('div');
  karma.className = 'fw-karma';
  const mkKrow = (cls: string, name: string) => {
    const row = document.createElement('div');
    row.className = 'fw-krow';
    const dot = document.createElement('span');
    dot.className = `fw-kdot ${cls}`;
    const nm = document.createElement('span');
    nm.className = 'fw-kname';
    nm.innerHTML = name;
    const d = document.createElement('span');
    d.className = 'fw-kdelta';
    row.append(dot, nm, d);
    karma.appendChild(row);
    return d;
  };
  const kPrio = mkKrow('fw-p', 'priority mech <span>(chosen)</span>');
  const kBack = mkKrow('fw-b', 'backup mech <span>(steps in)</span>');
  panel.appendChild(karma);

  const splitSect = document.createElement('div');
  splitSect.className = 'fw-sect';
  splitSect.textContent = `fee split · ${(FEE * 100).toFixed(0)}% marketplace fee`;
  panel.appendChild(splitSect);

  const split = document.createElement('div');
  split.className = 'fw-split';
  const mkCell = (cls: string, name: string) => {
    const c = document.createElement('div');
    c.className = `fw-cell ${cls}`;
    const cn = document.createElement('div');
    cn.className = 'fw-cn';
    cn.textContent = name;
    const cv = document.createElement('div');
    cv.className = 'fw-cv';
    const cs = document.createElement('div');
    cs.className = 'fw-cs';
    c.append(cn, cv, cs);
    split.appendChild(c);
    return { cv, cs };
  };
  const cReq = mkCell('', 'requester pays');
  const cMech = mkCell('fw-mech', 'delivering mech');
  const cBurn = mkCell('fw-burn', 'buyback-burner');
  panel.appendChild(split);

  // ---------------------------------------------------------------- controls
  const controls = document.createElement('div');
  controls.className = 'fw-controls';
  const mkField = (
    cls: string, id: string, label: string, min: number, max: number, step: number, val: number,
  ) => {
    const f = document.createElement('div');
    f.className = `fw-field ${cls}`;
    const lab = document.createElement('label');
    lab.htmlFor = id;
    const nm = document.createElement('span');
    nm.textContent = label;
    const out = document.createElement('output');
    lab.append(nm, out);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = id;
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(val);
    f.append(lab, inp);
    controls.appendChild(f);
    return { inp, out };
  };
  const winF = mkField('fw-win', 'fw-win', 'response window', WIN_MIN, WIN_MAX, 5, win);
  const respF = mkField('fw-resp', 'fw-resp', 'priority response', 0, AXIS_MAX, 5, resp);
  const rateF = mkField('fw-rate', 'fw-rate', 'delivery rate (xDAI)', 0.001, 0.05, 0.001, payRate);
  controlsSlot.appendChild(controls);

  // ---------------------------------------------------------------- caption
  const cap = document.createElement('div');
  cap.className = 'fw-cap';
  const deliveredPct = ((data.numTotalRequests - data.numUndeliveredRequests) / data.numTotalRequests) * 100;
  cap.innerHTML =
    `Live on <b>Gnosis</b> MechMarketplace v${data.version}: <b>${fmt(data.numTotalRequests)}</b> ` +
    `total requests across <b>${data.numMechs}</b> mechs, <b>${deliveredPct.toFixed(1)}%</b> delivered, ` +
    `window bounded on-chain to <b>${WIN_MIN}–${WIN_MAX}s</b>, fee <b>${(FEE * 100).toFixed(0)}%</b>. ` +
    `The rate is illustrative; the window, fee and Karma deltas are the contract's. ` +
    `<a href="${data.explorerUrl}" target="_blank" rel="noopener">contract ↗</a>`;
  caption.appendChild(cap);

  // ---------------------------------------------------------------- render
  function render(): void {
    // resolve outcome: priority delivers iff its response lands inside the window
    const onTime = resp <= win;
    const deliverT = onTime ? resp : win; // backup steps in right at the window edge
    const deliverY = onTime ? Y_PRIO : Y_BACK;
    const color = onTime ? '#22d3ee' : '#f0883e';

    // window band geometry
    const bx0 = xOf(0);
    const bx1 = xOf(win);
    band.setAttribute('x', String(bx0));
    band.setAttribute('width', String(Math.max(1, bx1 - bx0)));
    bandLbl.setAttribute('x', String(bx0 + 1));

    // axis ticks: 0, window edge, axis max
    const tickVals = [0, win, AXIS_MAX];
    for (let i = 0; i < ticks.length; i++) {
      const tv = tickVals[i]!;
      const x = xOf(tv);
      ticks[i]!.line.setAttribute('x1', String(x));
      ticks[i]!.line.setAttribute('x2', String(x));
      ticks[i]!.txt.setAttribute('x', String(x));
      ticks[i]!.txt.textContent = `${Math.round(tv)}s`;
    }
    ticks[1]!.txt.setAttribute('fill', '#7c8cff'); // mark the window edge

    // priority intended marker (only meaningful when the priority mech is late)
    const showIntent = !onTime && resp <= AXIS_MAX;
    intentG.setAttribute('opacity', showIntent ? '1' : '0');
    intentNode.setAttribute('cx', String(xOf(Math.min(resp, AXIS_MAX))));

    // delivery marker + stem to the axis
    const dx = xOf(deliverT);
    mkGroup.setAttribute('transform', `translate(${dx},${deliverY})`);
    mkStem.setAttribute('y2', String(Y_AXIS - deliverY));
    mkStem.setAttribute('stroke', color);
    mkNode.setAttribute('stroke', color);
    mkGlow.setAttribute('fill', color);

    // playhead
    playG.setAttribute('transform', `translate(${dx},0)`);
    playLine.setAttribute('stroke', color);

    // verdict
    verdict.className = 'fw-verdict ' + (onTime ? 'fw-ok' : 'fw-forfeit');
    vIcon.textContent = onTime ? '✓' : '⤳';
    vIcon.style.color = color;
    if (onTime) {
      vTitle.textContent = 'DELIVERED · priority mech';
      vSub.innerHTML =
        `Responded in <b>${Math.round(resp)}s</b>, inside the <b>${Math.round(win)}s</b> window. ` +
        `It earns the fee and the marketplace credits it <b>+1 Karma</b>.`;
    } else {
      vTitle.textContent = 'FORFEIT · backup mech delivers';
      vSub.innerHTML =
        `Priority mech would land at <b>${Math.round(resp)}s</b>, past the <b>${Math.round(win)}s</b> ` +
        `window. Once it expires a backup mech delivers, takes the fee, and the no-show is docked ` +
        `<b>−1 Karma</b>.`;
    }

    // karma deltas
    if (onTime) {
      kPrio.textContent = '+1';
      kPrio.className = 'fw-kdelta fw-up';
      kBack.textContent = '0';
      kBack.className = 'fw-kdelta fw-zero';
    } else {
      kPrio.textContent = '−1';
      kPrio.className = 'fw-kdelta fw-down';
      kBack.textContent = '+1';
      kBack.className = 'fw-kdelta fw-up';
    }

    // fee split
    const mechCut = payRate * (1 - FEE);
    const burnCut = payRate * FEE;
    cReq.cv.textContent = rate(payRate);
    cReq.cs.textContent = 'xDAI · escrowed';
    cMech.cv.textContent = rate(mechCut);
    cMech.cs.textContent = `xDAI · ${onTime ? 'priority' : 'backup'}`;
    cBurn.cv.textContent = rate(burnCut);
    cBurn.cs.textContent = 'xDAI · buys + burns OLAS';

    // outputs
    winF.out.textContent = `${Math.round(win)}s`;
    respF.out.textContent = `${Math.round(resp)}s`;
    rateF.out.textContent = rate(payRate);
  }

  // ---------------------------------------------------------------- events
  const onWin = () => { win = Number(winF.inp.value); render(); };
  const onResp = () => { resp = Number(respF.inp.value); render(); };
  const onRate = () => { payRate = Number(rateF.inp.value); render(); };
  winF.inp.addEventListener('input', onWin);
  respF.inp.addEventListener('input', onResp);
  rateF.inp.addEventListener('input', onRate);

  render();

  return () => {
    winF.inp.removeEventListener('input', onWin);
    respF.inp.removeEventListener('input', onResp);
    rateF.inp.removeEventListener('input', onRate);
    style.remove();
    layout.dispose();
  };
}
