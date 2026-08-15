/**
 * Artifact: the-exclusion-map — The Exclusion Map
 * Manifest: content/artifacts/the-exclusion-map/manifest.json
 *
 * A 2D trust/power MAP of Ethereum's MEV-Boost relay market, as an AI agent's
 * transaction experiences it. Each relay is a node positioned by:
 *   x — inclusion policy: neutral (left) → OFAC-censoring (right)
 *   y — block-delivery share (higher share sits higher on the map)
 * Node radius also scales with share. The right half is the "exclusion zone":
 * a filterable transaction routed through those relays can be silently dropped.
 *
 * The panel reports the network-level exclusion risk derived from the sourced
 * 38.6% censoring share (expected inclusion delay + tail probability), and a
 * per-relay detail on tap. A FOCIL toggle collapses the exclusion risk to zero
 * — the article's thesis: with fork-choice-enforced inclusion, the censoring
 * share becomes structurally irrelevant.
 *
 * Data: content/artifacts/the-exclusion-map/data.json — MEV Watch, 2026-06-22.
 * Layout: shared responsive primitive — stage map, panel detail, controls rail.
 */
import data from '../../../content/artifacts/the-exclusion-map/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

type Relay = (typeof data.relays)[number];

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ── SVG viewport + plot geometry ─────────────────────────────────────────── */
const VW = 520;
const VH = 430;
const ML = 30;   // left margin (y-axis label sits outside via rotated text)
const MR = 22;
const MT = 42;
const MB = 58;
const PLOT_W = VW - ML - MR;
const PLOT_H = VH - MT - MB;
const SHARE_MAX = 34; // headroom above the largest share (~31.4%)
const FRONTIER_X = 50; // stance midpoint: neutral < 50 < censoring

function xPx(stance: number): number {
  return ML + (stance / 100) * PLOT_W;
}
function yPx(share: number): number {
  return MT + PLOT_H * (1 - share / SHARE_MAX);
}
function radius(share: number): number {
  return 6 + Math.sqrt(share) * 2.6;
}

const NEUTRAL = '#4ade80';
const CENSOR = '#f0883e';
const CENSOR_HOT = '#f87171';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage, panel, controls, caption } = layout;

  let selectedId: string | null = null;
  let focil = false;

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .xm-stage { display:flex; align-items:center; justify-content:center; }
    .xm-stage svg { width:100%; height:100%; display:block; }

    .xm-zone-neutral { fill:rgba(74,222,128,.045); }
    .xm-zone-censor  { fill:rgba(240,136,62,.075); transition:fill .3s ease; }
    .xm-zone-censor.xm-focil { fill:rgba(74,222,128,.05); }
    .xm-frontier { stroke:rgba(240,136,62,.5); stroke-width:1.2; stroke-dasharray:4 4; transition:stroke .3s ease; }
    .xm-frontier.xm-focil { stroke:rgba(74,222,128,.45); }

    .xm-axis { stroke:rgba(124,140,255,.16); stroke-width:1; }
    .xm-axlbl { font:600 8px 'JetBrains Mono',monospace; fill:#5b6378; letter-spacing:.06em; text-transform:uppercase; }
    .xm-axend { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.04em; }
    .xm-tick { font:500 7.5px 'JetBrains Mono',monospace; fill:#4a5268; text-anchor:end; }
    .xm-grid { stroke:rgba(124,140,255,.07); stroke-width:1; }
    .xm-zlbl { font:600 8.5px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase; text-anchor:middle; transition:fill .3s ease; }

    .xm-node { cursor:pointer; }
    .xm-ndisk { stroke-width:1.6; transition:opacity .2s ease, stroke-width .2s ease; }
    .xm-nring { fill:none; stroke-width:1.4; opacity:0; transition:opacity .2s ease; }
    .xm-node.xm-sel .xm-nring { opacity:.9; }
    .xm-node.xm-dim .xm-ndisk { opacity:.28; }
    .xm-node.xm-dim .xm-nabbr { opacity:.4; }
    .xm-nabbr { font:700 9px 'JetBrains Mono',monospace; fill:#0d1322; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }
    .xm-nshare { font:700 8px 'JetBrains Mono',monospace; text-anchor:middle; pointer-events:none; }
    .xm-nname { font:500 7px 'JetBrains Mono',monospace; fill:#8d95ad; text-anchor:middle; pointer-events:none; letter-spacing:.02em; }
    .xm-focil-ring { fill:none; stroke:#4ade80; stroke-width:1.4; stroke-dasharray:3 3; opacity:0; transition:opacity .3s ease; pointer-events:none; }

    .xm-panel { display:flex; flex-direction:column; gap:9px; font:500 11px/1.45 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; }
    .xm-risk { border:1px solid rgba(240,136,62,.26); background:rgba(240,136,62,.06); border-radius:8px; padding:9px 10px; display:flex; flex-direction:column; gap:6px; transition:border-color .3s,background .3s; }
    .xm-risk.xm-focil { border-color:rgba(74,222,128,.3); background:rgba(74,222,128,.06); }
    .xm-risk-hd { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .xm-risk-ttl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .xm-risk-tag { font:700 7.5px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:5px; white-space:nowrap; }
    .xm-tag-mev { color:#f0883e; background:rgba(240,136,62,.12); border:1px solid rgba(240,136,62,.34); }
    .xm-tag-focil { color:#4ade80; background:rgba(74,222,128,.12); border:1px solid rgba(74,222,128,.34); }
    .xm-metric { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
    .xm-metric-lbl { font-size:9.5px; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .xm-metric-val { font:700 12px 'JetBrains Mono',monospace; color:#e7eaf3; white-space:nowrap; }
    .xm-metric-val.xm-good { color:#6ee7b7; }
    .xm-mnote { font-size:8.5px; line-height:1.5; color:#5b6378; overflow-wrap:anywhere; }

    .xm-rule { height:1px; background:rgba(124,140,255,.1); }
    .xm-pname { font:700 13px/1.2 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .xm-badge { display:inline-flex; align-items:center; gap:5px; width:fit-content; font:600 8.5px 'JetBrains Mono',monospace; letter-spacing:.07em; text-transform:uppercase; padding:3px 8px; border-radius:5px; }
    .xm-bdot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
    .xm-row { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .xm-rlbl { font:500 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .xm-rval { font:500 10px/1.5 'JetBrains Mono',monospace; color:#c4cbde; min-width:0; overflow-wrap:anywhere; }
    .xm-rval b { color:#e7eaf3; }
    .xm-hint { color:#5b6378; font:500 9.5px/1.5 'JetBrains Mono',monospace; overflow-wrap:anywhere; }
    .xm-stat { display:flex; align-items:baseline; justify-content:space-between; gap:8px; font-size:9.5px; }
    .xm-stat b { color:#cdd3e3; font-weight:700; white-space:nowrap; }

    .xm-ctls { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%; }
    .xm-btns { display:flex; flex-wrap:wrap; gap:5px; min-width:0; max-width:100%; }
    .xm-btn { display:flex; align-items:center; gap:5px; border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer; background:#0d1322; color:#8d95ad; font:600 9px 'JetBrains Mono',monospace; letter-spacing:.03em; padding:5px 9px; white-space:nowrap; transition:.16s; flex:0 0 auto; }
    .xm-btn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .xm-btn.xm-on { color:#e7eaf3; }
    .xm-btn-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
    .xm-focil-btn { border-color:rgba(74,222,128,.3); color:#8d95ad; }
    .xm-focil-btn.xm-on { border-color:rgba(74,222,128,.6); background:rgba(74,222,128,.13); color:#6ee7b7; }
    .xm-legend { display:flex; flex-wrap:wrap; gap:4px 12px; min-width:0; }
    .xm-leg { display:flex; align-items:center; gap:4px; font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }
    .xm-ldot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }

    .xm-cap { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .xm-cap b { color:#8d95ad; font-weight:600; }
  `;
  container.appendChild(style);
  stage.classList.add('xm-stage');

  /* ── SVG map ────────────────────────────────────────────────────────────── */
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label':
      "Map of Ethereum MEV-Boost relays positioned by inclusion policy (neutral to OFAC-censoring) and block-delivery share",
  });

  /* Zone backdrops */
  const frontierPx = xPx(FRONTIER_X);
  svg.appendChild(svgEl('rect', {
    x: String(ML), y: String(MT),
    width: String(frontierPx - ML), height: String(PLOT_H),
    class: 'xm-zone-neutral',
  }));
  const censorZone = svgEl('rect', {
    x: String(frontierPx), y: String(MT),
    width: String(ML + PLOT_W - frontierPx), height: String(PLOT_H),
    class: 'xm-zone-censor',
  });
  svg.appendChild(censorZone);

  /* Horizontal gridlines + y ticks (share %) */
  for (const s of [0, 10, 20, 30]) {
    const y = yPx(s);
    svg.appendChild(svgEl('line', {
      x1: String(ML), y1: String(y), x2: String(ML + PLOT_W), y2: String(y),
      class: s === 0 ? 'xm-axis' : 'xm-grid',
    }));
    const t = svgEl('text', { x: String(ML - 5), y: String(y + 2.5), class: 'xm-tick' });
    t.textContent = `${s}%`;
    svg.appendChild(t);
  }

  /* Frontier divider */
  const frontier = svgEl('line', {
    x1: String(frontierPx), y1: String(MT - 4),
    x2: String(frontierPx), y2: String(MT + PLOT_H),
    class: 'xm-frontier',
  });
  svg.appendChild(frontier);

  /* Zone labels */
  const neutralLbl = svgEl('text', {
    x: String((ML + frontierPx) / 2), y: String(MT - 12), class: 'xm-zlbl',
  });
  neutralLbl.setAttribute('fill', NEUTRAL);
  neutralLbl.textContent = 'inclusive · 61.4%';
  svg.appendChild(neutralLbl);

  const censorLbl = svgEl('text', {
    x: String((frontierPx + ML + PLOT_W) / 2), y: String(MT - 12), class: 'xm-zlbl',
  });
  censorLbl.setAttribute('fill', CENSOR);
  censorLbl.textContent = 'exclusion zone · 38.6%';
  svg.appendChild(censorLbl);

  /* Axis labels */
  const xlbl = svgEl('text', {
    x: String(ML + PLOT_W / 2), y: String(VH - 30), class: 'xm-axlbl', 'text-anchor': 'middle',
  });
  xlbl.textContent = 'inclusion policy';
  svg.appendChild(xlbl);

  const xLeft = svgEl('text', { x: String(ML), y: String(VH - 30), class: 'xm-axend', 'text-anchor': 'start' });
  xLeft.setAttribute('fill', NEUTRAL);
  xLeft.textContent = '◄ neutral';
  svg.appendChild(xLeft);

  const xRight = svgEl('text', { x: String(ML + PLOT_W), y: String(VH - 30), class: 'xm-axend', 'text-anchor': 'end' });
  xRight.setAttribute('fill', CENSOR);
  xRight.textContent = 'OFAC-censoring ►';
  svg.appendChild(xRight);

  const ylbl = svgEl('text', {
    x: String(ML + PLOT_W / 2), y: String(VH - 15), class: 'xm-axlbl', 'text-anchor': 'middle',
  });
  ylbl.textContent = 'node height + size = block-delivery share';
  svg.appendChild(ylbl);

  /* Relay nodes */
  interface NodeEls { group: SVGGElement; ring: SVGCircleElement; focilRing: SVGCircleElement | null; }
  const nodeEls = new Map<string, NodeEls>();

  for (const relay of data.relays) {
    const cx = xPx(relay.x);
    const cy = yPx(relay.share);
    const r = radius(relay.share);
    const censoring = relay.stance === 'censoring';
    const color = censoring ? CENSOR : NEUTRAL;

    const g = svgEl('g', { class: 'xm-node', role: 'button', tabindex: '0' });
    g.setAttribute('aria-label',
      `${relay.label}: ${relay.stance}, ${relay.share}% of blocks. Tap for detail.`);

    const ring = svgEl('circle', {
      cx: String(cx), cy: String(cy), r: String(r + 4.5), class: 'xm-nring',
    });
    ring.setAttribute('stroke', color);

    const disk = svgEl('circle', {
      cx: String(cx), cy: String(cy), r: String(r), class: 'xm-ndisk',
    });
    disk.setAttribute('fill', `${color}2b`);
    disk.setAttribute('stroke', color);

    const abbr = svgEl('text', { x: String(cx), y: String(cy), class: 'xm-nabbr' });
    abbr.setAttribute('fill', color);
    abbr.textContent = relay.abbr;

    const share = svgEl('text', { x: String(cx), y: String(cy + r + 9), class: 'xm-nshare' });
    share.setAttribute('fill', color);
    share.textContent = `${relay.share}%`;

    let focilRing: SVGCircleElement | null = null;
    if (censoring) {
      focilRing = svgEl('circle', {
        cx: String(cx), cy: String(cy), r: String(r + 3), class: 'xm-focil-ring',
      });
    }

    /* Two-line name below the share, wrapped for the longer aggregate labels */
    const nameWords = relay.label.split(' ');
    const mid = Math.ceil(nameWords.length / 2);
    const line1 = nameWords.slice(0, mid).join(' ');
    const line2 = nameWords.slice(mid).join(' ');
    const nameEl = svgEl('text', { x: String(cx), y: String(cy + r + 19), class: 'xm-nname' });
    const tsp1 = svgEl('tspan', { x: String(cx) });
    tsp1.textContent = line1;
    nameEl.appendChild(tsp1);
    if (line2) {
      const tsp2 = svgEl('tspan', { x: String(cx), dy: '8.5' });
      tsp2.textContent = line2;
      nameEl.appendChild(tsp2);
    }

    if (focilRing) g.appendChild(focilRing);
    g.append(ring, disk, abbr, share, nameEl);
    svg.appendChild(g);

    nodeEls.set(relay.id, { group: g, ring, focilRing });

    const onSelect = () => select(relay.id);
    g.addEventListener('click', onSelect);
    g.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
    });
  }

  stage.appendChild(svg);

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  panel.className = 'xm-panel';

  /* Exclusion-risk model, derived from the sourced censoring share */
  const pCensor = data.totalCensoringShare / 100;
  const pInclude = 1 - pCensor;
  const expectedSlots = 1 / pInclude;                 // geometric mean, filterable tx
  const expectedSecs = expectedSlots * data.slotSeconds;
  const pTail6 = Math.pow(pCensor, 6);                // P(≥6 consecutive censoring slots)

  function fmt(n: number, d = 1): string {
    return n.toFixed(d);
  }

  function buildRisk(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'xm-risk' + (focil ? ' xm-focil' : '');

    const hd = document.createElement('div');
    hd.className = 'xm-risk-hd';
    const ttl = document.createElement('span');
    ttl.className = 'xm-risk-ttl';
    ttl.textContent = 'Exclusion risk';
    const tag = document.createElement('span');
    tag.className = 'xm-risk-tag ' + (focil ? 'xm-tag-focil' : 'xm-tag-mev');
    tag.textContent = focil ? 'FOCIL on' : 'today';
    hd.append(ttl, tag);
    box.appendChild(hd);

    const metrics: Array<[string, string, boolean]> = focil
      ? [
          ['Censoring block still?', 'yes, 38.6%', false],
          ['Can it exclude you?', 'no', true],
          ['Guaranteed inclusion', '≤ 1 slot', true],
        ]
      : [
          ['P(block censors a filterable tx)', `${fmt(pCensor * 100)}%`, false],
          ['Expected inclusion delay', `${fmt(expectedSlots)} slots · ~${Math.round(expectedSecs)}s`, false],
          ['P(≥6 slots excluded · 72s)', `${fmt(pTail6 * 100, 2)}%`, false],
        ];

    for (const [lbl, val, good] of metrics) {
      const m = document.createElement('div');
      m.className = 'xm-metric';
      const l = document.createElement('span');
      l.className = 'xm-metric-lbl';
      l.textContent = lbl;
      const v = document.createElement('span');
      v.className = 'xm-metric-val' + (good ? ' xm-good' : '');
      v.textContent = val;
      m.append(l, v);
      box.appendChild(m);
    }

    const note = document.createElement('div');
    note.className = 'xm-mnote';
    note.textContent = focil
      ? 'A 1-of-16 committee’s inclusion list is enforced by the fork-choice rule — the 38.6% censoring share becomes structurally irrelevant.'
      : 'For a transaction censoring relays screen out (operator wallet touched a sanctioned path). Ordering, not shown here, stays adversarial.';
    box.appendChild(note);

    return box;
  }

  function addRow(label: string, value: string): void {
    const row = document.createElement('div');
    row.className = 'xm-row';
    const lbl = document.createElement('div');
    lbl.className = 'xm-rlbl';
    lbl.textContent = label;
    const val = document.createElement('div');
    val.className = 'xm-rval';
    val.innerHTML = value;
    row.append(lbl, val);
    panel.appendChild(row);
  }

  function renderPanel(): void {
    panel.innerHTML = '';
    panel.appendChild(buildRisk());
    panel.appendChild(Object.assign(document.createElement('div'), { className: 'xm-rule' }));

    if (selectedId === null) {
      const hint = document.createElement('div');
      hint.className = 'xm-hint';
      hint.textContent = 'Tap a relay to inspect what it can deny an AI agent, and why exclusion — unlike ordering — can’t be outbid.';
      panel.appendChild(hint);

      const s1 = document.createElement('div');
      s1.className = 'xm-stat';
      s1.innerHTML = `<span>Builder oligopoly</span><b>${data.builderOligopoly.count} build ${data.builderOligopoly.share}%</b>`;
      panel.appendChild(s1);

      const s2 = document.createElement('div');
      s2.className = 'xm-stat';
      s2.innerHTML = `<span>Censoring peak (Oct 2022)</span><b>${data.peakCensoringShare}%</b>`;
      panel.appendChild(s2);
      return;
    }

    const relay = data.relays.find((r) => r.id === selectedId);
    if (!relay) return;
    const censoring = relay.stance === 'censoring';
    const color = censoring ? CENSOR : NEUTRAL;

    const nameEl = document.createElement('div');
    nameEl.className = 'xm-pname';
    nameEl.textContent = relay.label;
    panel.appendChild(nameEl);

    const badge = document.createElement('div');
    badge.className = 'xm-badge';
    badge.style.cssText = `color:${color};background:${color}18;border:1px solid ${color}44;`;
    const bdot = document.createElement('span');
    bdot.className = 'xm-bdot';
    bdot.style.cssText = `background:${color};box-shadow:0 0 5px ${color};`;
    badge.append(bdot, censoring ? 'OFAC-censoring' : 'neutral');
    panel.appendChild(badge);

    addRow('Block-delivery share', `<b>${relay.share}%</b>${'aggregate' in relay && relay.aggregate ? ' · aggregate' : ''}`);
    addRow('Inclusion policy', relay.policy);
    addRow('What it can deny an agent', relay.denies);
    addRow('Agent note', relay.agentNote);
  }

  /* ── Visual state ───────────────────────────────────────────────────────── */
  function updateVisuals(): void {
    for (const [id, els] of nodeEls) {
      const sel = id === selectedId;
      const dim = selectedId !== null && !sel;
      els.group.classList.toggle('xm-sel', sel);
      els.group.classList.toggle('xm-dim', dim);
      if (els.focilRing) els.focilRing.style.opacity = focil ? '0.9' : '0';
    }
    censorZone.classList.toggle('xm-focil', focil);
    frontier.classList.toggle('xm-focil', focil);
    censorLbl.setAttribute('fill', focil ? NEUTRAL : CENSOR);
    censorLbl.textContent = focil ? 'inclusion enforced · 38.6%' : 'exclusion zone · 38.6%';
  }

  function select(id: string | null): void {
    selectedId = id === selectedId ? null : id;
    updateVisuals();
    renderPanel();
    for (const [rid, btn] of relayBtns) {
      const active = rid === selectedId;
      btn.classList.toggle('xm-on', active);
      const relay = data.relays.find((r) => r.id === rid)!;
      const color = relay.stance === 'censoring' ? CENSOR : NEUTRAL;
      btn.style.borderColor = active ? `${color}66` : '';
      btn.style.color = active ? color : '';
    }
    allBtn.classList.toggle('xm-on', selectedId === null);
    allBtn.style.color = selectedId === null ? '#22d3ee' : '';
    allBtn.style.borderColor = selectedId === null ? 'rgba(34,211,238,.5)' : '';
  }

  /* ── Controls ───────────────────────────────────────────────────────────── */
  const ctls = document.createElement('div');
  ctls.className = 'xm-ctls';

  const btnRow = document.createElement('div');
  btnRow.className = 'xm-btns';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'xm-btn xm-on';
  allBtn.textContent = 'All';
  allBtn.style.color = '#22d3ee';
  allBtn.style.borderColor = 'rgba(34,211,238,.5)';
  btnRow.appendChild(allBtn);

  const relayBtns = new Map<string, HTMLButtonElement>();
  for (const relay of data.relays) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'xm-btn';
    const dot = document.createElement('span');
    dot.className = 'xm-btn-dot';
    const color = relay.stance === 'censoring' ? CENSOR : NEUTRAL;
    dot.style.cssText = `background:${color};box-shadow:0 0 4px ${color};`;
    btn.append(dot, document.createTextNode(relay.abbr === '…' ? relay.label : relay.abbr));
    btnRow.appendChild(btn);
    relayBtns.set(relay.id, btn);
  }

  const focilBtn = document.createElement('button');
  focilBtn.type = 'button';
  focilBtn.className = 'xm-btn xm-focil-btn';
  focilBtn.textContent = 'FOCIL: off';
  btnRow.appendChild(focilBtn);

  ctls.appendChild(btnRow);

  const legend = document.createElement('div');
  legend.className = 'xm-legend';
  for (const [color, label] of [[NEUTRAL, 'neutral relay'], [CENSOR, 'censoring relay']] as const) {
    const item = document.createElement('span');
    item.className = 'xm-leg';
    const dot = document.createElement('span');
    dot.className = 'xm-ldot';
    dot.style.background = color;
    item.append(dot, document.createTextNode(label));
    legend.appendChild(item);
  }
  ctls.appendChild(legend);
  controls.appendChild(ctls);

  /* ── Handlers ───────────────────────────────────────────────────────────── */
  const onAll = () => select(null);
  allBtn.addEventListener('click', onAll);

  const relayHandlers: Array<[HTMLButtonElement, () => void]> = [];
  for (const relay of data.relays) {
    const btn = relayBtns.get(relay.id)!;
    const h = () => select(relay.id);
    btn.addEventListener('click', h);
    relayHandlers.push([btn, h]);
  }

  const onFocil = () => {
    focil = !focil;
    focilBtn.classList.toggle('xm-on', focil);
    focilBtn.textContent = focil ? 'FOCIL: on' : 'FOCIL: off';
    updateVisuals();
    renderPanel();
  };
  focilBtn.addEventListener('click', onFocil);

  /* ── Caption ────────────────────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'xm-cap';
  cap.innerHTML =
    'Tap a relay for detail · toggle <b>FOCIL</b> to see EIP-7805 collapse the exclusion risk · shares + censoring status from MEV Watch, 2026-06-22';
  caption.appendChild(cap);

  /* ── Init ───────────────────────────────────────────────────────────────── */
  updateVisuals();
  renderPanel();

  return () => {
    layout.dispose();
    allBtn.removeEventListener('click', onAll);
    focilBtn.removeEventListener('click', onFocil);
    for (const [btn, h] of relayHandlers) btn.removeEventListener('click', h);
    style.remove();
  };
}
