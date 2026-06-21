import { createArtifactLayout } from '@/lib/artifact-layout';

const NS = 'http://www.w3.org/2000/svg';
type Chain = 'off' | 'bridge' | 'on' | 'ai';

interface PipelineStep {
  label: string;
  sub: string;
  chain: Chain;
  headline: string;
  bullets: string[];
}

const STEPS: PipelineStep[] = [
  {
    label: 'Snapshot\nVote',
    sub: 'off-chain governance',
    chain: 'off',
    headline: 'Off-chain Proposal',
    bullets: [
      'Researchers post a funding proposal to Snapshot.org.',
      'VITA holders vote via signed EIP-712 messages — zero gas cost.',
      'Passing threshold: typically >50% weighted by VITA balance.',
      'VitaDAO has funded 47+ longevity projects via this mechanism.',
    ],
  },
  {
    label: 'Research\nAgreement',
    sub: 'IPFS CID · legal doc',
    chain: 'bridge',
    headline: 'Legal IP → IPFS CID',
    bullets: [
      'A Research Agreement (PDF) specifies IP clauses, milestones, and licensing terms.',
      'The signed document is pinned to IPFS; the CID becomes the on-chain pointer.',
      "Molecule's legal wrapper makes the NFT enforceable under civil law.",
      'The CID is immutable — any edit to the document breaks the hash.',
    ],
  },
  {
    label: 'Mint\nIP-NFT',
    sub: '~150k gas · ERC-721',
    chain: 'on',
    headline: 'mintIpnft() — Molecule IPNFT',
    bullets: [
      "Molecule's IPNFT contract mints an ERC-721 whose tokenURI points to the IPFS CID.",
      'Gas: ~150,000 units (≈ $4–12 at 20 gwei on Ethereum mainnet).',
      'Token ownership = control of the IP: sell, license, or fractionalize it.',
      'VITA-FAST IP-NFT backed Korolchuk lab longevity research at Newcastle Univ.',
    ],
  },
  {
    label: 'Fraction-\nalize',
    sub: '486k gas · ERC-20 IPTs',
    chain: 'on',
    headline: 'tokenizeIpnft() — Molecule Tokenizer',
    bullets: [
      'Molecule Tokenizer (0x58EB89…) wraps the NFT and issues ERC-20 IP Tokens (IPTs).',
      'Verified gas: 486,321 units for VITA-FAST fractionalization on June 12 2023.',
      'VITA-FAST: 1,029,555 tokens · 366 holders · $0.840/token · $839K market cap.',
      'The raise was 1,700% oversubscribed — demand far exceeded token supply.',
    ],
  },
  {
    label: 'AI Research\nLoop',
    sub: '74.4th pct · 24 tasks',
    chain: 'ai',
    headline: 'AutoScientists (arXiv:2605.28655)',
    bullets: [
      'Decentralized AI agent teams autonomously run long-horizon biological experiments.',
      '74.4th percentile on BioML-Bench (24 tasks); +8.33% over best prior AI agent.',
      '+12.5% Spearman correlation on ACE2-Spike binding vs. single-agent baselines.',
      '1.9× faster than Autoresearch on GPT hyperparameter optimization.',
    ],
  },
  {
    label: 'Revenue\nShare',
    sub: 'multisig → distribute()',
    chain: 'on',
    headline: 'On-chain Revenue Distribution',
    bullets: [
      'License fees or acquisition proceeds flow into the IPT token contract.',
      'distribute() splits proceeds pro-rata among all ERC-20 IPT holders.',
      'Milestone releases gated by Gnosis Safe multisig — DAO approves each tranche.',
      'VitaDAO portfolio: $40M Series A (Rubedo), $300M+ licensing deal (Turn Bio).',
    ],
  },
];

const STYLE: Record<Chain, { fill: string; stroke: string; shadow: string; badge: string }> = {
  off:    { fill: '#090f1c', stroke: '#37607e', shadow: '',        badge: 'OFF-CHAIN' },
  bridge: { fill: '#091518', stroke: '#25806a', shadow: '',        badge: 'BRIDGE'    },
  on:     { fill: '#090c20', stroke: '#5050b4', shadow: '#1e2060', badge: 'ON-CHAIN'  },
  ai:     { fill: '#100824', stroke: '#7848c8', shadow: '#300e60', badge: 'AI LAYER'  },
};

const VW = 900;
const VH = 330;
const NW = 116;
const NH = 84;
const NY = 108;
const STEP_W = 150;
const X0 = Math.round((VW - (5 * STEP_W + NW)) / 2);

function ncx(i: number) { return X0 + i * STEP_W + NW / 2; }

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  txt?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (txt !== undefined) e.textContent = txt;
  return e;
}

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageAspect: `${VW}/${VH}`,
  });
  const { stage, panel, caption } = layout;

  const css = document.createElement('style');
  css.textContent = `
    .ipnp-node { cursor: pointer; }
    .ipnp-node .nb { transition: filter 0.12s; }
    .ipnp-node:hover .nb { filter: brightness(1.5); }
    .ipnp-node.sel .nb { filter: brightness(2); }
    .ipnp-panel {
      padding: 16px 14px;
      color: #c0c8dc;
      font: 13px/1.55 system-ui, sans-serif;
    }
    .ipnp-panel h3 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 700;
      color: #d8deff;
    }
    .ipnp-panel ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ipnp-panel li {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .ipnp-panel li::before {
      content: '▸';
      color: #7848c8;
      flex: none;
    }
    .ipnp-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
      padding: 16px;
      text-align: center;
      font: 12px/1.5 system-ui, sans-serif;
      color: #405060;
    }
  `;
  stage.appendChild(css);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    'aria-label': 'The IP-NFT Pipeline — six-step lifecycle from governance to revenue',
    style: 'width:100%;height:100%;display:block',
  });

  const defs = svgEl('defs', {});
  const mkr = svgEl('marker', { id: 'ipnp-tip', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto' });
  mkr.appendChild(svgEl('polygon', { points: '0 0 6 3 0 6', fill: '#2a3550' }));
  defs.appendChild(mkr);
  svg.appendChild(defs);

  svg.appendChild(svgEl('rect', { width: VW, height: VH, fill: '#06090f' }));

  svg.appendChild(svgEl('text', {
    x: VW / 2,
    y: 24,
    'text-anchor': 'middle',
    font: '700 10px/1 ui-monospace, monospace',
    'letter-spacing': '0.12em',
    fill: '#28385a',
  }, 'THE IP-NFT PIPELINE'));

  // Connector arrows
  for (let i = 0; i < STEPS.length - 1; i++) {
    const x1 = ncx(i) + NW / 2 + 2;
    const x2 = ncx(i + 1) - NW / 2 - 8;
    const y = NY + NH / 2;
    svg.appendChild(svgEl('line', {
      x1, y1: y, x2, y2: y,
      stroke: '#2a3550',
      'stroke-width': 2,
      'marker-end': 'url(#ipnp-tip)',
    }));
  }

  // Nodes
  const nodeEls: SVGGElement[] = [];
  STEPS.forEach((step, i) => {
    const x = X0 + i * STEP_W;
    const s = STYLE[step.chain];
    const g = svgEl('g', {
      class: 'ipnp-node',
      role: 'button',
      tabindex: 0,
      'aria-label': step.label.replace('\n', ' '),
    }) as SVGGElement;

    if (s.shadow) {
      g.appendChild(svgEl('rect', {
        x: x - 4, y: NY - 4, width: NW + 8, height: NH + 8,
        rx: 10, fill: s.shadow, opacity: 0.5,
      }));
    }

    g.appendChild(svgEl('rect', {
      class: 'nb',
      x, y: NY, width: NW, height: NH,
      rx: 7, fill: s.fill, stroke: s.stroke, 'stroke-width': 1.5,
    }));

    const bw = 60;
    const bx = x + NW / 2 - bw / 2;
    const badgeY = NY + 8;
    g.appendChild(svgEl('rect', { x: bx, y: badgeY, width: bw, height: 12, rx: 3, fill: s.stroke, opacity: 0.22 }));
    g.appendChild(svgEl('text', {
      x: x + NW / 2,
      y: badgeY + 9,
      'text-anchor': 'middle',
      font: '600 7.5px/1 ui-monospace, monospace',
      'letter-spacing': '0.06em',
      fill: s.stroke,
    }, s.badge));

    g.appendChild(svgEl('text', {
      x: x + 5,
      y: NY + 10,
      font: '600 8px/1 ui-monospace, monospace',
      fill: '#283848',
    }, String(i + 1)));

    const lines = step.label.split('\n');
    const labelBaseY = lines.length === 2 ? NY + 45 : NY + 52;
    lines.forEach((ln, li) => {
      g.appendChild(svgEl('text', {
        x: x + NW / 2,
        y: labelBaseY + li * 14,
        'text-anchor': 'middle',
        font: '600 12px/1 system-ui, sans-serif',
        fill: '#d8daf0',
      }, ln));
    });

    g.appendChild(svgEl('text', {
      x: x + NW / 2,
      y: NY + NH - 7,
      'text-anchor': 'middle',
      font: '400 8px/1 ui-monospace, monospace',
      fill: '#485868',
    }, step.sub));

    nodeEls.push(g);
    svg.appendChild(g);
  });

  // Legend
  const LEG: Array<[Chain, string]> = [
    ['off', 'Off-chain'],
    ['bridge', 'Bridge'],
    ['on', 'On-chain'],
    ['ai', 'AI Layer'],
  ];
  const legY = VH - 14;
  const legStart = (VW - 400) / 2;
  LEG.forEach(([chain, label], i) => {
    const lx = legStart + i * 100;
    const s = STYLE[chain];
    svg.appendChild(svgEl('rect', { x: lx, y: legY - 7, width: 10, height: 10, rx: 2, fill: s.fill, stroke: s.stroke, 'stroke-width': 1 }));
    svg.appendChild(svgEl('text', { x: lx + 14, y: legY + 2, font: '10px system-ui, sans-serif', fill: '#384858' }, label));
  });

  stage.appendChild(svg);

  // Panel — hint until a node is clicked
  const hint = document.createElement('div');
  hint.className = 'ipnp-hint';
  hint.textContent = 'Click any step for on-chain details and verified numbers.';
  panel.appendChild(hint);

  function select(idx: number) {
    const step = STEPS[idx];
    panel.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'ipnp-panel';
    const h = document.createElement('h3');
    h.textContent = step.headline;
    d.appendChild(h);
    const ul = document.createElement('ul');
    for (const b of step.bullets) {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    }
    d.appendChild(ul);
    panel.appendChild(d);
    nodeEls.forEach((g, j) => g.classList.toggle('sel', j === idx));
  }

  const offs: (() => void)[] = [];
  nodeEls.forEach((g, i) => {
    const onClick = () => select(i);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    };
    g.addEventListener('click', onClick);
    g.addEventListener('keydown', onKey);
    offs.push(() => {
      g.removeEventListener('click', onClick);
      g.removeEventListener('keydown', onKey);
    });
  });

  caption.textContent =
    'Data: VITA-FAST fractionalization tx on Blockscout (June 2023) · AutoScientists arXiv:2605.28655';

  return () => {
    offs.forEach(fn => fn());
    layout.dispose();
    css.remove();
  };
}
