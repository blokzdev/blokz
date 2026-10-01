/**
 * Artifact: the-vouch-graph — The Vouch Graph
 * Manifest: content/artifacts/the-vouch-graph/manifest.json
 *
 * A topological MAP of ERC-8004's on-chain reputation, read straight off Base.
 * One agent (#25,975) sits at the centre; every reviewer ("client") that has
 * filed feedback for it orbits as a node whose size + inbound edge scale with
 * the number of vouches it has filed. A firehose of pulses flows inward — the
 * manufactured reputation accumulating in real time.
 *
 * The three-stage INTEGRITY FILTER is the article's prescription made tactile:
 *   naive    — count every NewFeedback event      → 24,119 reviews, 1.00/1 ★
 *   evidence — demand a non-zero feedbackHash      → 0 admissible
 *   allowlist— keep only reviewers you've vetted   → 0 admissible
 * Tightening the filter dims the whole graph and collapses the centre's
 * "trust score" from a flawless five stars to UNSCORED — the thesis that the
 * ledger gives you a tamper-evident log, never a score.
 *
 * Data: content/artifacts/the-vouch-graph/data.json — Base via Blockscout,
 * 2026-10-01 (ReputationRegistry 0x8004BAa1…9b63).
 * Layout: shared responsive primitive — stage map, panel scorecard, controls rail.
 */
import data from '../../../content/artifacts/the-vouch-graph/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ── SVG viewport + radial geometry ───────────────────────────────────────── */
const VW = 460;
const VH = 430;
const CX = VW / 2;
const CY = 198;
const RING = 126;            // orbit radius for client nodes
const CENTRE_R = 30;         // agent node radius

type Client = (typeof data.clients)[number];
type Stage = 'naive' | 'evidence' | 'allowlist';

const clients = data.clients;
const maxV = Math.max(...clients.map((c) => c.vouches));
const totalV = clients.reduce((s, c) => s + c.vouches, 0);
const withEvidence = clients.filter((c) => c.evidence).length;
const allowlisted = 0; // no reviewer in this cluster is independently vetted

function nodeR(v: number): number {
  return 8 + Math.sqrt(v / maxV) * 24;         // 8 … 32 px
}
function edgeW(v: number): number {
  return 1.2 + Math.sqrt(v / maxV) * 9;        // 1.2 … 10.2 px
}

/* Palette (design tokens) */
const SPAM = '#f0883e';      // manufactured vouch (amber)
const SPAM_HOT = '#f87171';  // emphasis red
const GOOD = '#4ade80';      // admissible / vetted (green — never lights up here)
const CYAN = '#22d3ee';      // the subject agent
const FAINT = '#5b6378';

/* A reviewer is admitted under the active filter stage. */
function admitted(c: Client, stage: Stage): boolean {
  if (stage === 'naive') return true;
  if (stage === 'evidence') return c.evidence;
  return c.evidence && false; // allowlist: none vetted
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
    panel: true,
  });
  const { stage: stageSlot, panel, controls, caption } = layout;

  let stage: Stage = 'naive';
  let selected: string | null = null;

  const reduceMotion =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .vg-stage { display:flex; align-items:center; justify-content:center; }
    .vg-stage svg { width:100%; height:100%; display:block; }

    .vg-halo { fill:rgba(240,136,62,.05); transition:fill .35s ease; }
    .vg-halo.vg-cold { fill:rgba(124,140,255,.04); }
    .vg-orbit { fill:none; stroke:rgba(124,140,255,.12); stroke-width:1; stroke-dasharray:3 5; }

    .vg-edge { transition:opacity .3s ease, stroke .3s ease; }
    .vg-pulse { pointer-events:none; transition:opacity .3s ease; }

    .vg-node { cursor:pointer; }
    .vg-ndisk { stroke-width:1.6; transition:opacity .25s ease, stroke .3s ease, fill .3s ease; }
    .vg-nring { fill:none; stroke-width:1.5; opacity:0; transition:opacity .2s ease; }
    .vg-node.vg-sel .vg-nring { opacity:.95; }
    .vg-node.vg-rej .vg-ndisk { opacity:.3; }
    .vg-node.vg-rej .vg-nlbl { opacity:.45; }
    .vg-nlbl { font:600 8px 'JetBrains Mono',monospace; fill:#8d95ad; text-anchor:middle; pointer-events:none; letter-spacing:.02em; }
    .vg-nv { font:700 8.5px 'JetBrains Mono',monospace; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }

    .vg-cdisk { stroke-width:2; transition:stroke .35s ease, fill .35s ease; }
    .vg-cscore { font:800 17px 'JetBrains Mono',monospace; text-anchor:middle; dominant-baseline:middle; pointer-events:none; transition:fill .35s ease; }
    .vg-cstar  { font:700 10px 'JetBrains Mono',monospace; text-anchor:middle; pointer-events:none; transition:fill .35s ease; letter-spacing:1px; }
    .vg-clbl   { font:700 9px 'JetBrains Mono',monospace; fill:#8d95ad; text-anchor:middle; pointer-events:none; letter-spacing:.04em; }

    .vg-panel { display:flex; flex-direction:column; gap:9px; font:500 11px/1.45 'JetBrains Mono',monospace; color:#8d95ad; min-width:0; }
    .vg-score { border:1px solid rgba(240,136,62,.26); background:rgba(240,136,62,.06); border-radius:8px; padding:9px 10px; display:flex; flex-direction:column; gap:6px; transition:border-color .3s,background .3s; }
    .vg-score.vg-dead { border-color:rgba(124,140,255,.2); background:rgba(124,140,255,.045); }
    .vg-score-hd { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .vg-score-ttl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .vg-score-tag { font:700 7.5px 'JetBrains Mono',monospace; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:5px; white-space:nowrap; }
    .vg-tag-spam { color:#f0883e; background:rgba(240,136,62,.12); border:1px solid rgba(240,136,62,.34); }
    .vg-tag-dead { color:#8d95ad; background:rgba(124,140,255,.08); border:1px solid rgba(124,140,255,.22); }
    .vg-big { display:flex; align-items:baseline; gap:8px; min-width:0; }
    .vg-big-v { font:800 22px 'JetBrains Mono',monospace; line-height:1; white-space:nowrap; }
    .vg-big-u { font-size:9px; color:#5b6378; overflow-wrap:anywhere; }
    .vg-metric { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
    .vg-metric-lbl { font-size:9.5px; color:#8d95ad; min-width:0; overflow-wrap:anywhere; }
    .vg-metric-val { font:700 11px 'JetBrains Mono',monospace; color:#e7eaf3; white-space:nowrap; }
    .vg-metric-val.vg-bad { color:#f0883e; }
    .vg-metric-val.vg-good { color:#6ee7b7; }
    .vg-mnote { font-size:8.5px; line-height:1.5; color:#5b6378; overflow-wrap:anywhere; }

    .vg-rule { height:1px; background:rgba(124,140,255,.1); }
    .vg-pname { font:700 12px/1.25 'JetBrains Mono',monospace; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .vg-badge { display:inline-flex; align-items:center; gap:5px; width:fit-content; font:600 8px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; padding:3px 8px; border-radius:5px; }
    .vg-bdot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
    .vg-row { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .vg-rlbl { font:500 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .vg-rval { font:500 10px/1.5 'JetBrains Mono',monospace; color:#c4cbde; min-width:0; overflow-wrap:anywhere; }
    .vg-rval b { color:#e7eaf3; }
    .vg-hint { color:#5b6378; font:500 9.5px/1.5 'JetBrains Mono',monospace; overflow-wrap:anywhere; }
    .vg-stat { display:flex; align-items:baseline; justify-content:space-between; gap:8px; font-size:9px; min-width:0; }
    .vg-stat span { overflow-wrap:anywhere; min-width:0; }
    .vg-stat b { color:#cdd3e3; font-weight:700; white-space:nowrap; }

    .vg-ctls { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:100%; }
    .vg-grp-lbl { font:600 8px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6378; }
    .vg-btns { display:flex; flex-wrap:wrap; gap:5px; min-width:0; max-width:100%; }
    .vg-btn { display:flex; align-items:center; gap:5px; border:1px solid rgba(124,140,255,.2); border-radius:7px; cursor:pointer; background:#0d1322; color:#8d95ad; font:600 9px 'JetBrains Mono',monospace; letter-spacing:.02em; padding:5px 9px; white-space:nowrap; transition:.16s; flex:0 0 auto; }
    .vg-btn:hover { color:#cdd3e3; border-color:rgba(124,140,255,.42); }
    .vg-btn.vg-on { color:#e7eaf3; border-color:rgba(240,136,62,.6); background:rgba(240,136,62,.13); }
    .vg-btn.vg-on.vg-on-cold { border-color:rgba(124,140,255,.55); background:rgba(124,140,255,.12); }
    .vg-step { position:relative; }
    .vg-step-n { font:800 8px 'JetBrains Mono',monospace; opacity:.6; }
    .vg-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
    .vg-legend { display:flex; flex-wrap:wrap; gap:4px 12px; min-width:0; }
    .vg-leg { display:flex; align-items:center; gap:4px; font:500 8.5px 'JetBrains Mono',monospace; color:#5b6378; white-space:nowrap; }

    .vg-cap { font:500 9px/1.5 'JetBrains Mono',monospace; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .vg-cap b { color:#8d95ad; font-weight:600; }
  `;
  container.appendChild(style);
  stageSlot.classList.add('vg-stage');

  /* ── SVG scaffold ─────────────────────────────────────────────────────────── */
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label':
      'Radial map of ERC-8004 reputation: agent 25975 at centre surrounded by reviewer wallets, each edge sized by the number of vouches it has filed.',
  });

  const halo = svgEl('circle', {
    cx: String(CX), cy: String(CY), r: String(RING + 34), class: 'vg-halo',
  });
  svg.appendChild(halo);
  svg.appendChild(svgEl('circle', {
    cx: String(CX), cy: String(CY), r: String(RING), class: 'vg-orbit',
  }));

  /* Layers: edges < pulses < nodes */
  const edgeLayer = svgEl('g');
  const pulseLayer = svgEl('g');
  const nodeLayer = svgEl('g');
  svg.append(edgeLayer, pulseLayer, nodeLayer);

  interface Geo {
    c: Client; x: number; y: number;
    edge: SVGLineElement;
    group: SVGGElement; ring: SVGCircleElement;
    pulses: { el: SVGCircleElement; t: number }[];
    len: number;
  }
  const geos: Geo[] = [];
  const PULSE_SPEED = 46; // px/sec

  clients.forEach((c, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / clients.length;
    const x = CX + RING * Math.cos(ang);
    const y = CY + RING * Math.sin(ang);
    const r = nodeR(c.vouches);

    // Edge from client toward centre (stops at both node rims).
    const dx = CX - x, dy = CY - y;
    const d = Math.hypot(dx, dy);
    const ux = dx / d, uy = dy / d;
    const ax = x + ux * r, ay = y + uy * r;
    const bx = CX - ux * CENTRE_R, by = CY - uy * CENTRE_R;
    const len = Math.hypot(bx - ax, by - ay);

    const edge = svgEl('line', {
      x1: String(ax), y1: String(ay), x2: String(bx), y2: String(by),
      class: 'vg-edge', stroke: SPAM, 'stroke-width': String(edgeW(c.vouches)),
      'stroke-linecap': 'round', opacity: '0.55',
    });
    edgeLayer.appendChild(edge);

    // Pulses flowing inward (count scales with vouch share, capped for perf).
    const nPulse = Math.max(1, Math.min(5, Math.round((c.vouches / maxV) * 5)));
    const pulses: Geo['pulses'] = [];
    for (let p = 0; p < nPulse; p++) {
      const el = svgEl('circle', {
        r: String(Math.min(3.2, 1.3 + edgeW(c.vouches) * 0.18)),
        class: 'vg-pulse', fill: SPAM_HOT,
      });
      pulseLayer.appendChild(el);
      const t = p / nPulse;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      el.setAttribute('cx', String(px));
      el.setAttribute('cy', String(py));
      pulses.push({ el, t });
    }

    // Node group
    const g = svgEl('g', { class: 'vg-node', role: 'button', tabindex: '0' });
    g.setAttribute('aria-label',
      `Reviewer ${c.short}: ${c.vouches.toLocaleString()} vouches, tag ${c.tag1}, no evidence. Activate for detail.`);
    const ring = svgEl('circle', { cx: String(x), cy: String(y), r: String(r + 4), class: 'vg-nring', stroke: CYAN });
    const disk = svgEl('circle', {
      cx: String(x), cy: String(y), r: String(r), class: 'vg-ndisk',
      fill: `${SPAM}24`, stroke: SPAM,
    });
    const vtxt = svgEl('text', { x: String(x), y: String(y), class: 'vg-nv' });
    vtxt.setAttribute('fill', SPAM);
    vtxt.textContent = c.vouches >= 1000 ? `${Math.round(c.vouches / 1000)}k` : String(c.vouches);
    const lbl = svgEl('text', { x: String(x), y: String(y + r + 11), class: 'vg-nlbl' });
    lbl.textContent = c.short;

    g.append(ring, disk, vtxt, lbl);
    nodeLayer.appendChild(g);

    const onSel = () => select(c.address);
    g.addEventListener('click', onSel);
    g.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(); }
    });

    geos.push({ c, x, y, edge, group: g, ring, pulses, len });
  });

  /* Centre agent node */
  const cDisk = svgEl('circle', { cx: String(CX), cy: String(CY), r: String(CENTRE_R), class: 'vg-cdisk', fill: `${CYAN}1f`, stroke: CYAN });
  const cScore = svgEl('text', { x: String(CX), y: String(CY - 2), class: 'vg-cscore' });
  const cStar = svgEl('text', { x: String(CX), y: String(CY + 13), class: 'vg-cstar' });
  const cLbl = svgEl('text', { x: String(CX), y: String(CY + CENTRE_R + 14), class: 'vg-clbl' });
  cLbl.textContent = data.target.label;
  nodeLayer.append(cDisk, cScore, cStar, cLbl);

  stageSlot.appendChild(svg);

  /* ── Panel ─────────────────────────────────────────────────────────────── */
  panel.className = 'vg-panel';

  function scoreModel(s: Stage): { reviews: number; mean: string; verdict: string; dead: boolean } {
    const kept = clients.filter((c) => admitted(c, s));
    const reviews = kept.reduce((a, c) => a + c.vouches, 0);
    if (reviews === 0) return { reviews: 0, mean: '—', verdict: 'UNSCORED', dead: true };
    const mean = (kept.reduce((a, c) => a + c.value * c.vouches, 0) / reviews).toFixed(2);
    return { reviews, mean, verdict: `${mean} / 1`, dead: false };
  }

  function buildScore(): HTMLElement {
    const m = scoreModel(stage);
    const box = document.createElement('div');
    box.className = 'vg-score' + (m.dead ? ' vg-dead' : '');

    const hd = document.createElement('div');
    hd.className = 'vg-score-hd';
    const ttl = document.createElement('span');
    ttl.className = 'vg-score-ttl';
    ttl.textContent = 'Reputation score · ' + data.target.label;
    const tag = document.createElement('span');
    tag.className = 'vg-score-tag ' + (m.dead ? 'vg-tag-dead' : 'vg-tag-spam');
    tag.textContent = m.dead ? 'inadmissible' : 'naïve read';
    hd.append(ttl, tag);
    box.appendChild(hd);

    const big = document.createElement('div');
    big.className = 'vg-big';
    const bv = document.createElement('span');
    bv.className = 'vg-big-v';
    bv.style.color = m.dead ? '#8d95ad' : '#f0883e';
    bv.textContent = m.dead ? '—' : `★ ${m.mean}`;
    const bu = document.createElement('span');
    bu.className = 'vg-big-u';
    bu.textContent = m.dead
      ? 'no admissible feedback'
      : `${m.reviews.toLocaleString()} reviews · looks flawless`;
    big.append(bv, bu);
    box.appendChild(big);

    const rows: Array<[string, string, string]> = [
      ['Reviews counted', m.reviews.toLocaleString(), m.dead ? 'vg-good' : 'vg-bad'],
      ['Distinct reviewers', String(clients.length), ''],
      ['…with committed evidence', `${withEvidence} of ${clients.length}`, 'vg-bad'],
      ['…on a vetted allowlist', `${allowlisted} of ${clients.length}`, 'vg-bad'],
    ];
    for (const [lbl, val, cls] of rows) {
      const row = document.createElement('div');
      row.className = 'vg-metric';
      const l = document.createElement('span');
      l.className = 'vg-metric-lbl';
      l.textContent = lbl;
      const v = document.createElement('span');
      v.className = 'vg-metric-val ' + cls;
      v.textContent = val;
      row.append(l, v);
      box.appendChild(row);
    }

    const note = document.createElement('div');
    note.className = 'vg-mnote';
    note.textContent =
      stage === 'naive'
        ? `${clients.length} wallets filed ${totalV.toLocaleString()} identical value=1 vouches — a mean of ${Math.round(totalV / clients.length).toLocaleString()} each — all tagged “${clients[0].tag1}”. Averaging this is worthless.`
        : stage === 'evidence'
          ? 'Every sampled vouch carries feedbackHash = 0x0. Demanding committed evidence drops the entire cluster to zero.'
          : 'No reviewer here is one you could independently verify or whose stake you can slash. Score is undefined — consume the registry as an event bus, not a number.';
    box.appendChild(note);
    return box;
  }

  function addRow(label: string, value: string): void {
    const row = document.createElement('div');
    row.className = 'vg-row';
    const l = document.createElement('div');
    l.className = 'vg-rlbl';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'vg-rval';
    v.innerHTML = value;
    row.append(l, v);
    panel.appendChild(row);
  }

  function renderPanel(): void {
    panel.innerHTML = '';
    panel.appendChild(buildScore());
    panel.appendChild(Object.assign(document.createElement('div'), { className: 'vg-rule' }));

    const sel = selected ? clients.find((c) => c.address === selected) : null;
    if (!sel) {
      const hint = document.createElement('div');
      hint.className = 'vg-hint';
      hint.textContent = 'Tap a reviewer node to inspect its vouch stream, or step the integrity filter to watch the score collapse.';
      panel.appendChild(hint);

      const perHolder = (data.registry.baseRegistrations / data.registry.baseHolders).toFixed(1);
      const s1 = document.createElement('div');
      s1.className = 'vg-stat';
      s1.innerHTML = `<span>Base registrations</span><b>${data.registry.baseRegistrations.toLocaleString()}</b>`;
      const s2 = document.createElement('div');
      s2.className = 'vg-stat';
      s2.innerHTML = `<span>Holders (Base · Ethereum)</span><b>${data.registry.baseHolders.toLocaleString()} · ${data.registry.ethHolders.toLocaleString()}</b>`;
      const s3 = document.createElement('div');
      s3.className = 'vg-stat';
      s3.innerHTML = `<span>Agents per holder (Base)</span><b>${perHolder}×</b>`;
      panel.append(s1, s2, s3);
      return;
    }

    const ok = admitted(sel, stage);
    const name = document.createElement('div');
    name.className = 'vg-pname';
    name.textContent = sel.short;
    panel.appendChild(name);

    const badge = document.createElement('div');
    badge.className = 'vg-badge';
    const col = ok ? GOOD : SPAM;
    badge.style.cssText = `color:${col};background:${col}18;border:1px solid ${col}44;`;
    const bdot = document.createElement('span');
    bdot.className = 'vg-bdot';
    bdot.style.cssText = `background:${col};box-shadow:0 0 5px ${col};`;
    badge.append(bdot, ok ? 'admitted' : 'rejected by filter');
    panel.appendChild(badge);

    addRow('Vouches filed (feedbackIndex)', `<b>${sel.vouches.toLocaleString()}</b> · all value=${sel.value}`);
    addRow('Tags', `${sel.tag1} / ${sel.tag2}`);
    addRow('Committed evidence', sel.evidence ? 'yes' : '<b>none</b> — feedbackHash 0x0');
    addRow('Coordinator endpoint', sel.endpoint);
    addRow('Address', sel.address);
    return;
  }

  /* ── Map visual state ─────────────────────────────────────────────────────── */
  function updateVisuals(): void {
    const dead = stage !== 'naive'; // nothing is admitted past the naïve read
    halo.classList.toggle('vg-cold', dead);

    for (const g of geos) {
      const ok = admitted(g.c, stage);
      const isSel = g.c.address === selected;
      g.group.classList.toggle('vg-rej', !ok);
      g.group.classList.toggle('vg-sel', isSel);
      g.edge.setAttribute('stroke', ok ? SPAM : FAINT);
      g.edge.setAttribute('opacity', ok ? '0.55' : '0.14');
      for (const p of g.pulses) p.el.setAttribute('opacity', ok && !reduceMotion ? '0.9' : '0');
    }

    // Centre score badge mirrors the panel.
    const m = scoreModel(stage);
    cDisk.setAttribute('stroke', m.dead ? FAINT : CYAN);
    cDisk.setAttribute('fill', m.dead ? `${FAINT}14` : `${CYAN}1f`);
    cScore.setAttribute('fill', m.dead ? '#5b6378' : '#f0883e');
    cScore.textContent = m.dead ? '—' : m.mean;
    cStar.setAttribute('fill', m.dead ? '#5b6378' : '#f0883e');
    cStar.textContent = m.dead ? 'UNSCORED' : '★★★★★';
  }

  function select(addr: string | null): void {
    selected = addr === selected ? null : addr;
    updateVisuals();
    renderPanel();
  }

  /* ── Controls ─────────────────────────────────────────────────────────────── */
  const ctls = document.createElement('div');
  ctls.className = 'vg-ctls';

  const filterLbl = document.createElement('div');
  filterLbl.className = 'vg-grp-lbl';
  filterLbl.textContent = 'Integrity filter';
  ctls.appendChild(filterLbl);

  const stepRow = document.createElement('div');
  stepRow.className = 'vg-btns';
  const stepDefs: Array<[Stage, string]> = [
    ['naive', 'naïve average'],
    ['evidence', '+ require evidence'],
    ['allowlist', '+ reviewer allowlist'],
  ];
  const stepBtns = new Map<Stage, HTMLButtonElement>();
  stepDefs.forEach(([s, label], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vg-btn vg-step';
    const n = document.createElement('span');
    n.className = 'vg-step-n';
    n.textContent = `${i + 1}`;
    btn.append(n, document.createTextNode(label));
    stepRow.appendChild(btn);
    stepBtns.set(s, btn);
  });
  ctls.appendChild(stepRow);

  const revLbl = document.createElement('div');
  revLbl.className = 'vg-grp-lbl';
  revLbl.textContent = 'Reviewers';
  ctls.appendChild(revLbl);

  const revRow = document.createElement('div');
  revRow.className = 'vg-btns';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'vg-btn';
  allBtn.textContent = 'all';
  revRow.appendChild(allBtn);
  const revBtns = new Map<string, HTMLButtonElement>();
  for (const c of clients) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vg-btn';
    const dot = document.createElement('span');
    dot.className = 'vg-dot';
    dot.style.cssText = `background:${SPAM};box-shadow:0 0 4px ${SPAM};`;
    btn.append(dot, document.createTextNode(c.short));
    revRow.appendChild(btn);
    revBtns.set(c.address, btn);
  }
  ctls.appendChild(revRow);

  const legend = document.createElement('div');
  legend.className = 'vg-legend';
  for (const [col, label] of [[SPAM, 'manufactured vouch'], [GOOD, 'admissible (none)'], [CYAN, 'subject agent']] as const) {
    const item = document.createElement('span');
    item.className = 'vg-leg';
    const dot = document.createElement('span');
    dot.className = 'vg-dot';
    dot.style.background = col;
    item.append(dot, document.createTextNode(label));
    legend.appendChild(item);
  }
  ctls.appendChild(legend);
  controls.appendChild(ctls);

  function syncButtons(): void {
    for (const [s, btn] of stepBtns) {
      const on = s === stage;
      btn.classList.toggle('vg-on', on);
      btn.classList.toggle('vg-on-cold', on && s !== 'naive');
    }
    allBtn.classList.toggle('vg-on', selected === null);
    allBtn.classList.toggle('vg-on-cold', selected === null);
    for (const [addr, btn] of revBtns) btn.classList.toggle('vg-on', addr === selected);
  }

  /* ── Handlers ─────────────────────────────────────────────────────────────── */
  const stepHandlers: Array<[HTMLButtonElement, () => void]> = [];
  for (const [s, btn] of stepBtns) {
    const h = () => { stage = s; updateVisuals(); renderPanel(); syncButtons(); };
    btn.addEventListener('click', h);
    stepHandlers.push([btn, h]);
  }
  const onAll = () => { select(null); syncButtons(); };
  allBtn.addEventListener('click', onAll);
  const revHandlers: Array<[HTMLButtonElement, () => void]> = [];
  for (const [addr, btn] of revBtns) {
    const h = () => { select(addr); syncButtons(); };
    btn.addEventListener('click', h);
    revHandlers.push([btn, h]);
  }

  /* ── Caption ─────────────────────────────────────────────────────────────── */
  const cap = document.createElement('div');
  cap.className = 'vg-cap';
  cap.innerHTML =
    'Step the <b>integrity filter</b> to collapse the score · tap a reviewer for its vouch stream · reviewer wallets + vouch counts read from ERC-8004 ReputationRegistry on Base via Blockscout, 2026-10-01';
  caption.appendChild(cap);

  /* ── Animation (dt-based inward pulses) ─────────────────────────────────────── */
  let raf = 0;
  let last = 0;
  function frame(now: number): void {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (stage === 'naive') {
      for (const g of geos) {
        const step = (PULSE_SPEED * dt) / g.len;
        const ax = +g.edge.getAttribute('x1')!, ay = +g.edge.getAttribute('y1')!;
        const bx = +g.edge.getAttribute('x2')!, by = +g.edge.getAttribute('y2')!;
        for (const p of g.pulses) {
          p.t += step;
          if (p.t > 1) p.t -= 1;
          p.el.setAttribute('cx', String(ax + (bx - ax) * p.t));
          p.el.setAttribute('cy', String(ay + (by - ay) * p.t));
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  if (!reduceMotion) raf = requestAnimationFrame(frame);

  /* ── Init ─────────────────────────────────────────────────────────────────── */
  updateVisuals();
  renderPanel();
  syncButtons();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    layout.dispose();
    for (const [btn, h] of stepHandlers) btn.removeEventListener('click', h);
    allBtn.removeEventListener('click', onAll);
    for (const [btn, h] of revHandlers) btn.removeEventListener('click', h);
    style.remove();
  };
}
