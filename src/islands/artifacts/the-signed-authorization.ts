/**
 * Artifact: the-signed-authorization — The Signed Authorization
 * Manifest: content/artifacts/the-signed-authorization/manifest.json
 *
 * The mechanism behind x402's trust boundary: an EIP-3009
 * `transferWithAuthorization` is an EIP-712 signature over *every* field —
 * payer, payee, amount, validity window, nonce — domain-separated to one token
 * on one chain. The facilitator broadcasts it and fronts the gas, but it can't
 * alter a byte: change one field and the digest the payer signed no longer
 * matches, so `verify()` recovers a different address and reverts.
 *
 * The reader plays the facilitator/attacker against the REAL authorization
 * behind a Base USDC settlement (content/.../data.json, decoded from
 * tx 0xb571fe…d52d14): skim the amount, redirect the payee, stretch the
 * window, or replay it on another chain. The EIP-712 digest is recomputed
 * LIVE with a from-scratch keccak256 (validated: the baseline digest and the
 * domain separator reproduce USDC's on-chain DOMAIN_SEPARATOR()) — no runtime
 * fetch, no canned hashes.
 *
 * Layout: shared responsive primitive. Stage = the typed-message card + live
 * digest + verdict; panel = the trust-boundary narrative; controls = tamper
 * chips + skim slider + chain selector + reset; caption = provenance/hint.
 */
import data from '../../../content/artifacts/the-signed-authorization/data.json';
import { createArtifactLayout } from '@/lib/artifact-layout';

/* ------------------------------------------------------------------ *
 *  keccak256 (Keccak-f[1600], 0x01/0x80 padding) — pure, dependency-free.
 *  Validated against test vectors AND against USDC's on-chain
 *  DOMAIN_SEPARATOR() at build time; see the PR / data.json provenance.
 * ------------------------------------------------------------------ */
const MASK = (1n << 64n) - 1n;
const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT: number[][] = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
];
function rotl(x: bigint, n: number): bigint {
  const b = BigInt(n % 64);
  return ((x << b) | (x >> (64n - b))) & MASK;
}
function keccakF(S: bigint[][]): void {
  for (let r = 0; r < 24; r++) {
    const C = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) C[x] = S[x]![0]! ^ S[x]![1]! ^ S[x]![2]! ^ S[x]![3]! ^ S[x]![4]!;
    const D = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5]! ^ rotl(C[(x + 1) % 5]!, 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) S[x]![y]! ^= D[x]!;
    const B = [
      [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n],
    ];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y]![(2 * x + 3 * y) % 5] = rotl(S[x]![y]!, ROT[x]![y]!);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) S[x]![y] = B[x]![y]! ^ ((~B[(x + 1) % 5]![y]! & MASK) & B[(x + 2) % 5]![y]!);
    S[0]![0]! ^= RC[r]!;
  }
}
function keccak256(msg: Uint8Array): Uint8Array {
  const rate = 136;
  const plen = (Math.floor(msg.length / rate) + 1) * rate;
  const pad = new Uint8Array(plen);
  pad.set(msg);
  pad[msg.length]! ^= 0x01;
  pad[plen - 1]! ^= 0x80;
  const S: bigint[][] = [
    [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n],
  ];
  for (let off = 0; off < plen; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(pad[off + i * 8 + b]!);
      S[i % 5]![Math.floor(i / 5)]! ^= lane;
    }
    keccakF(S);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = S[i % 5]![Math.floor(i / 5)]!;
    for (let b = 0; b < 8; b++) { out[i * 8 + b] = Number(lane & 0xffn); lane >>= 8n; }
  }
  return out;
}

/* ---- byte / ABI helpers ---- */
const enc = new TextEncoder();
const utf8 = (s: string): Uint8Array => enc.encode(s);
function hexToBytes(h: string): Uint8Array {
  const s = h.replace(/^0x/, '');
  const a = new Uint8Array(s.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return a;
}
function toHex(b: Uint8Array): string {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
function concat(...arr: Uint8Array[]): Uint8Array {
  const n = arr.reduce((s, x) => s + x.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const x of arr) { o.set(x, p); p += x.length; }
  return o;
}
const enc32 = (b: Uint8Array): Uint8Array => { const o = new Uint8Array(32); o.set(b, 32 - b.length); return o; };
const encAddr = (a: string): Uint8Array => enc32(hexToBytes(a));
const encUint = (v: bigint): Uint8Array => {
  let h = v.toString(16);
  if (h.length % 2) h = '0' + h;
  return enc32(hexToBytes('0x' + h));
};
const encB32 = (h: string): Uint8Array => hexToBytes(h);

/* ---- EIP-712 (EIP-3009 TransferWithAuthorization) ---- */
const DOMAIN_TYPEHASH = keccak256(utf8(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
));
const TRANSFER_TYPEHASH = keccak256(utf8(
  'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)',
));
function domainSeparator(name: string, version: string, chainId: bigint, vc: string): Uint8Array {
  return keccak256(concat(
    DOMAIN_TYPEHASH, keccak256(utf8(name)), keccak256(utf8(version)), encUint(chainId), encAddr(vc),
  ));
}
function structHash(
  from: string, to: string, value: bigint, va: bigint, vb: bigint, nonce: string,
): Uint8Array {
  return keccak256(concat(
    TRANSFER_TYPEHASH, encAddr(from), encAddr(to), encUint(value), encUint(va), encUint(vb), encB32(nonce),
  ));
}
function eip712Digest(ds: Uint8Array, sh: Uint8Array): Uint8Array {
  return keccak256(concat(new Uint8Array([0x19, 0x01]), ds, sh));
}

/* ------------------------------------------------------------------ *
 *  Real authorization (decoded from the Base settlement) + presentation
 * ------------------------------------------------------------------ */
const A = data.authorization;
const T = data.token;
const SIGNED_DIGEST = data.eip712.digest.toLowerCase();

const ATTACKER = '0xbadc0ffee0ddf00dbadc0ffee0ddf00dbadc0ffe'; // illustrative payee
const short = (h: string, l = 6, r = 4): string =>
  h.length <= l + r + 2 ? h : `${h.slice(0, l + 2)}…${h.slice(-r)}`;
const fmtUsdc = (base: bigint): string => {
  const whole = base / 1_000_000n;
  const frac = (base % 1_000_000n).toString().padStart(6, '0');
  return `${whole.toString()}.${frac}`;
};
const utcTime = (ts: bigint): string => {
  const d = new Date(Number(ts) * 1000);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
};

interface Chain { label: string; chainId: number }
const CHAINS: Chain[] = [
  { label: 'Base', chainId: data.settlement.chainId },
  ...(data.altChains as Chain[]),
];

interface State {
  skim: number;      // integer multiplier on value, 1 … 1000
  redirect: boolean; // to → attacker
  stretch: boolean;  // validBefore += 3600s
  chainIdx: number;  // index into CHAINS; 0 = Base (the signed chain)
}
const PRISTINE: State = { skim: 1, redirect: false, stretch: false, chainIdx: 0 };

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    wideTemplate: 'rail',
    stageMin: 'clamp(340px, 86vw, 560px)',
    stageFr: '1.45fr',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  style.textContent = `
    .sa-stage { position:relative; width:100%; min-height:100%; display:flex; flex-direction:column;
      gap:10px; min-width:0; }
    .sa-card { border:1px solid rgba(124,140,255,.14); border-radius:12px; background:#0d1322;
      padding:11px 13px; min-width:0; max-width:100%; }
    .sa-card + .sa-card { margin-top:0; }
    .sa-hd { display:flex; align-items:baseline; gap:8px; margin:0 0 7px; min-width:0; flex-wrap:wrap; }
    .sa-hd b { font:700 10px 'JetBrains Mono',monospace; letter-spacing:.16em; text-transform:uppercase; }
    .sa-hd span { font:400 11px Inter,sans-serif; color:#5b6378; min-width:0; overflow-wrap:anywhere; }
    .sa-dom b { color:#8b5cf6; }
    .sa-msg b { color:#5b8cff; }
    .sa-sig b { color:#5b6378; }
    .sa-rows { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:3px 14px;
      align-items:baseline; min-width:0; }
    .sa-k { color:#5b6378; font:500 11px 'JetBrains Mono',monospace; white-space:nowrap; }
    .sa-v { color:#e7eaf3; font:500 12px 'JetBrains Mono',monospace; text-align:right;
      font-variant-numeric:tabular-nums; min-width:0; overflow-wrap:anywhere; transition:color .2s; }
    .sa-v em { color:#5b6378; font-style:normal; }
    .sa-row-tampered .sa-v { color:#fca5a5; }
    .sa-row-tampered .sa-k { color:#fca5a5; }
    .sa-digest { border:1px solid rgba(124,140,255,.14); border-radius:12px; padding:11px 13px;
      background:linear-gradient(180deg,#0d1322,#0a0e1a); min-width:0; }
    .sa-digest.sa-ok { border-color:rgba(34,211,238,.4); box-shadow:0 0 18px rgba(34,211,238,.14); }
    .sa-digest.sa-bad { border-color:rgba(248,113,113,.45); box-shadow:0 0 18px rgba(248,113,113,.14); }
    .sa-dlabel { font:700 10px 'JetBrains Mono',monospace; letter-spacing:.14em; text-transform:uppercase;
      color:#5b6378; margin:0 0 5px; min-width:0; overflow-wrap:anywhere; }
    .sa-dhex { font:600 12.5px 'JetBrains Mono',monospace; letter-spacing:.02em; word-break:break-all;
      line-height:1.5; transition:color .2s; }
    .sa-ok .sa-dhex { color:#22d3ee; }
    .sa-bad .sa-dhex { color:#fca5a5; }
    .sa-verdict { display:flex; align-items:center; gap:8px; margin-top:9px; font:600 12.5px Inter,sans-serif;
      min-width:0; overflow-wrap:anywhere; }
    .sa-badge { flex:0 0 auto; width:18px; height:18px; border-radius:50%; display:inline-grid;
      place-items:center; font:700 12px 'JetBrains Mono',monospace; }
    .sa-ok .sa-badge { background:rgba(34,211,238,.16); color:#22d3ee; }
    .sa-bad .sa-badge { background:rgba(248,113,113,.16); color:#fca5a5; }
    .sa-ok .sa-verdict { color:#e7eaf3; }
    .sa-bad .sa-verdict { color:#fca5a5; }

    /* panel narrative */
    .sa-panel { display:flex; flex-direction:column; gap:10px; height:100%; min-width:0; max-width:100%; }
    .sa-ptitle { font:700 13px 'Space Grotesk',sans-serif; color:#e7eaf3; min-width:0; overflow-wrap:anywhere; }
    .sa-pbody { font:400 12.5px Inter,sans-serif; line-height:1.58; color:#8d95ad; min-width:0;
      overflow-wrap:anywhere; }
    .sa-pbody b { color:#e7eaf3; font-weight:600; }
    .sa-pbody .hl { color:#fca5a5; font-weight:600; }
    .sa-pbody .ok { color:#22d3ee; font-weight:600; }
    .sa-facts { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); gap:3px 12px;
      margin-top:auto; padding-top:9px; border-top:1px solid rgba(124,140,255,.12); min-width:0; }
    .sa-facts dt { color:#5b6378; font:500 10.5px 'JetBrains Mono',monospace; }
    .sa-facts dd { margin:0; color:#8d95ad; font:500 10.5px 'JetBrains Mono',monospace; text-align:right;
      min-width:0; overflow-wrap:anywhere; }

    /* controls */
    .sa-controls { display:flex; flex-direction:column; gap:11px; min-width:0; max-width:100%; }
    .sa-grp { min-width:0; }
    .sa-glabel { font:700 9.5px 'JetBrains Mono',monospace; letter-spacing:.14em; text-transform:uppercase;
      color:#5b6378; margin:0 0 6px; }
    .sa-chips { display:flex; flex-wrap:wrap; gap:7px; min-width:0; }
    .sa-chip { flex:0 0 auto; border:1px solid rgba(124,140,255,.24); border-radius:8px; cursor:pointer;
      background:transparent; color:#8d95ad; font:600 11.5px Inter,sans-serif; padding:6px 11px;
      min-height:34px; transition:border-color .18s, background .18s, color .18s; }
    .sa-chip:hover, .sa-chip:focus-visible { border-color:#fca5a5; color:#e7eaf3; outline:none; }
    .sa-chip.sa-on { background:rgba(248,113,113,.14); border-color:#fca5a5; color:#fecaca; }
    .sa-seg { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
    .sa-seg button { flex:0 0 auto; border:1px solid rgba(124,140,255,.24); border-radius:8px; cursor:pointer;
      background:transparent; color:#8d95ad; font:600 11.5px 'JetBrains Mono',monospace; padding:6px 10px;
      min-height:34px; transition:border-color .18s, background .18s, color .18s; }
    .sa-seg button:hover, .sa-seg button:focus-visible { border-color:#5b8cff; color:#e7eaf3; outline:none; }
    .sa-seg button.sa-on { background:rgba(91,140,255,.14); border-color:#5b8cff; color:#cfe0ff; }
    .sa-seg button.sa-base.sa-on { background:rgba(34,211,238,.14); border-color:#22d3ee; color:#bdf3fb; }
    .sa-slider { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .sa-slabel { display:flex; justify-content:space-between; gap:8px; align-items:baseline; min-width:0; }
    .sa-slabel span { color:#8d95ad; font:600 11px Inter,sans-serif; }
    .sa-slabel output { color:#fca5a5; font:600 11px 'JetBrains Mono',monospace; white-space:nowrap;
      font-variant-numeric:tabular-nums; }
    .sa-slabel output.sa-neutral { color:#8d95ad; }
    .sa-slider input[type=range] { width:100%; accent-color:#fca5a5; cursor:pointer; min-height:28px; }
    .sa-slider input[type=range].sa-neutral { accent-color:#5b8cff; }
    .sa-reset { align-self:flex-start; border:1px solid rgba(124,140,255,.28); border-radius:8px; cursor:pointer;
      background:transparent; color:#8d95ad; font:600 11.5px Inter,sans-serif; padding:6px 12px; min-height:34px;
      transition:border-color .18s, color .18s; }
    .sa-reset:hover, .sa-reset:focus-visible { border-color:#22d3ee; color:#e7eaf3; outline:none; }
    .sa-reset[disabled] { opacity:.4; cursor:default; }

    .sa-cap { font:500 11px 'JetBrains Mono',monospace; color:#5b6378; line-height:1.5; min-width:0;
      overflow-wrap:anywhere; }
    .sa-cap b { color:#8d95ad; font-weight:600; }
  `;
  stage.appendChild(style);

  /* ---------------- STAGE: typed-message card + digest + verdict --------------- */
  stage.classList.add('sa-stage');

  // Domain card
  const domCard = document.createElement('div');
  domCard.className = 'sa-card sa-dom';
  domCard.innerHTML =
    `<div class="sa-hd"><b>EIP-712 Domain</b><span>binds the signature to one token on one chain</span></div>`;
  const domRows = document.createElement('div');
  domRows.className = 'sa-rows';
  domCard.appendChild(domRows);

  // Message card
  const msgCard = document.createElement('div');
  msgCard.className = 'sa-card sa-msg';
  msgCard.innerHTML =
    `<div class="sa-hd"><b>TransferWithAuthorization</b><span>what the payer signed — every field</span></div>`;
  const msgRows = document.createElement('div');
  msgRows.className = 'sa-rows';
  msgCard.appendChild(msgRows);

  // Signature card
  const sigCard = document.createElement('div');
  sigCard.className = 'sa-card sa-sig';
  sigCard.innerHTML =
    `<div class="sa-hd"><b>Signature</b><span>65 bytes · produced once by the payer, never re-signed</span></div>`;
  const sigRows = document.createElement('div');
  sigRows.className = 'sa-rows';
  sigRows.innerHTML =
    `<span class="sa-k">v / r / s</span>` +
    `<span class="sa-v">${data.signature.v} · ${short(data.signature.r, 6, 4)} · ${short(data.signature.s, 6, 4)}</span>`;
  sigCard.appendChild(sigRows);

  // Digest + verdict
  const digestBox = document.createElement('div');
  digestBox.className = 'sa-digest';
  const dLabel = document.createElement('div');
  dLabel.className = 'sa-dlabel';
  dLabel.textContent = 'EIP-712 digest · keccak256(0x1901 ‖ domainSeparator ‖ structHash)';
  const dHex = document.createElement('div');
  dHex.className = 'sa-dhex';
  const verdict = document.createElement('div');
  verdict.className = 'sa-verdict';
  const badge = document.createElement('span');
  badge.className = 'sa-badge';
  const verdictText = document.createElement('span');
  verdict.append(badge, verdictText);
  digestBox.append(dLabel, dHex, verdict);

  stage.append(domCard, msgCard, sigCard, digestBox);

  const mkRow = (parent: HTMLElement, key: string): { row: HTMLElement; val: HTMLElement } => {
    const k = document.createElement('span');
    k.className = 'sa-k';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'sa-v';
    parent.append(k, v);
    // pair them for tamper-highlight toggling via a shared wrapper marker
    (k as HTMLElement).dataset.pair = key;
    (v as HTMLElement).dataset.pair = key;
    return { row: k, val: v };
  };

  // Domain rows
  const rName = mkRow(domRows, 'name');
  const rVersion = mkRow(domRows, 'version');
  const rChain = mkRow(domRows, 'chainId');
  const rVC = mkRow(domRows, 'verifyingContract');
  const rSep = mkRow(domRows, 'domainSeparator');
  rName.val.innerHTML = `"${T.name}"`;
  rVersion.val.innerHTML = `"${T.version}"`;
  rVC.val.innerHTML = `${short(T.address)} <em>${T.symbol}</em>`;

  // Message rows
  const rFrom = mkRow(msgRows, 'from');
  const rTo = mkRow(msgRows, 'to');
  const rValue = mkRow(msgRows, 'value');
  const rVA = mkRow(msgRows, 'validAfter');
  const rVB = mkRow(msgRows, 'validBefore');
  const rNonce = mkRow(msgRows, 'nonce');
  rFrom.val.innerHTML = `${short(A.from)} <em>payer</em>`;
  rVA.val.innerHTML = `${utcTime(BigInt(A.validAfter))}`;
  rNonce.val.innerHTML = `${short(A.nonce, 6, 4)} <em>once</em>`;

  const setTampered = (pair: { row: HTMLElement; val: HTMLElement }, on: boolean): void => {
    pair.row.classList.toggle('sa-row-tampered', on);
    pair.val.classList.toggle('sa-row-tampered', on);
  };

  /* ---------------- PANEL: trust-boundary narrative --------------- */
  panel.classList.add('sa-panel');
  const pTitle = document.createElement('div');
  pTitle.className = 'sa-ptitle';
  const pBody = document.createElement('div');
  pBody.className = 'sa-pbody';
  const facts = document.createElement('dl');
  facts.className = 'sa-facts';
  facts.innerHTML =
    `<dt>relays</dt><dd>facilitator (fronts gas)</dd>` +
    `<dt>can censor?</dt><dd>yes — refuse to broadcast</dd>` +
    `<dt>can redirect?</dt><dd>no — payee is signed</dd>` +
    `<dt>can skim?</dt><dd>no — amount is signed</dd>`;
  panel.append(pTitle, pBody, facts);

  /* ---------------- CONTROLS --------------- */
  controls.classList.add('sa-controls');

  // skim slider
  const skimGrp = document.createElement('div');
  skimGrp.className = 'sa-grp';
  skimGrp.innerHTML = `<div class="sa-glabel">Skim — inflate the amount relayed</div>`;
  const skimWrap = document.createElement('div');
  skimWrap.className = 'sa-slider';
  const skimLab = document.createElement('div');
  skimLab.className = 'sa-slabel';
  const skimName = document.createElement('span');
  skimName.textContent = 'value ×';
  const skimOut = document.createElement('output');
  skimLab.append(skimName, skimOut);
  const skim = document.createElement('input');
  skim.type = 'range';
  skim.min = '1';
  skim.max = '1000';
  skim.step = '1';
  skim.value = '1';
  skim.setAttribute('aria-label', 'Skim multiplier on the signed payment value');
  skimWrap.append(skimLab, skim);
  skimGrp.append(skimWrap);

  // tamper chips
  const tamperGrp = document.createElement('div');
  tamperGrp.className = 'sa-grp';
  tamperGrp.innerHTML = `<div class="sa-glabel">Tamper the message</div>`;
  const chipRow = document.createElement('div');
  chipRow.className = 'sa-chips';
  const redirectChip = document.createElement('button');
  redirectChip.type = 'button';
  redirectChip.className = 'sa-chip';
  redirectChip.textContent = 'Redirect payee →';
  const stretchChip = document.createElement('button');
  stretchChip.type = 'button';
  stretchChip.className = 'sa-chip';
  stretchChip.textContent = 'Stretch window +1h';
  chipRow.append(redirectChip, stretchChip);
  tamperGrp.append(chipRow);

  // chain selector
  const chainGrp = document.createElement('div');
  chainGrp.className = 'sa-grp';
  chainGrp.innerHTML = `<div class="sa-glabel">Replay on another chain</div>`;
  const seg = document.createElement('div');
  seg.className = 'sa-seg';
  const chainBtns: HTMLButtonElement[] = CHAINS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label;
    b.dataset.idx = String(i);
    if (i === 0) b.classList.add('sa-base');
    seg.append(b);
    return b;
  });
  chainGrp.append(seg);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'sa-reset';
  reset.textContent = '↩ reset to the real signed authorization';

  controls.append(skimGrp, tamperGrp, chainGrp, reset);

  /* ---------------- CAPTION --------------- */
  caption.classList.add('sa-cap');
  caption.innerHTML =
    `<b>keccak256 runs in your browser</b> — every digest here is recomputed from the fields, not canned. ` +
    `The baseline digest and domain separator reproduce USDC's on-chain <code>DOMAIN_SEPARATOR()</code>. ` +
    `The payer signs once; the facilitator only relays.`;

  /* ---------------- STATE + RENDER --------------- */
  let state: State = { ...PRISTINE };

  function render(): void {
    const chain = CHAINS[state.chainIdx]!;
    const chainId = BigInt(chain.chainId);
    const onBase = state.chainIdx === 0;

    // effective (possibly tampered) fields
    const value = BigInt(A.value) * BigInt(state.skim);
    const to = state.redirect ? ATTACKER : A.to;
    const validBefore = BigInt(A.validBefore) + (state.stretch ? 3600n : 0n);

    // live hashes
    const ds = domainSeparator(T.name, T.version, chainId, T.address);
    const sh = structHash(A.from, to, value, BigInt(A.validAfter), validBefore, A.nonce);
    const digest = toHex(eip712Digest(ds, sh)).toLowerCase();
    const valid = digest === SIGNED_DIGEST;

    // --- domain rows ---
    rChain.val.innerHTML = `${chainId.toString()} <em>${chain.label}</em>`;
    rSep.val.textContent = short(toHex(ds), 10, 6);
    setTampered(rChain, !onBase);
    setTampered(rVC, false);
    setTampered(rSep, !onBase);

    // --- message rows ---
    rTo.val.innerHTML = state.redirect
      ? `${short(ATTACKER)} <em>attacker</em>`
      : `${short(A.to)} <em>payTo</em>`;
    rValue.val.innerHTML = `${fmtUsdc(value)} <em>USDC</em>`;
    rVB.val.innerHTML = `${utcTime(validBefore)}`;
    setTampered(rTo, state.redirect);
    setTampered(rValue, state.skim !== 1);
    setTampered(rVB, state.stretch);

    // --- digest + verdict ---
    dHex.textContent = digest;
    digestBox.classList.toggle('sa-ok', valid);
    digestBox.classList.toggle('sa-bad', !valid);
    badge.textContent = valid ? '✓' : '✗';
    verdictText.innerHTML = valid
      ? `<b>verify() passes</b> — ecrecover resolves to the payer ${short(A.from)}`
      : `<b>verify() reverts</b> — this digest recovers a different address, not ${short(A.from)}`;

    // --- control chrome ---
    skimOut.textContent = `${state.skim} → ${fmtUsdc(value)} USDC`;
    skimOut.classList.toggle('sa-neutral', state.skim === 1);
    skim.classList.toggle('sa-neutral', state.skim === 1);
    redirectChip.classList.toggle('sa-on', state.redirect);
    stretchChip.classList.toggle('sa-on', state.stretch);
    chainBtns.forEach((b, i) => b.classList.toggle('sa-on', i === state.chainIdx));
    const pristine = state.skim === 1 && !state.redirect && !state.stretch && onBase;
    reset.disabled = pristine;

    // --- narrative ---
    if (valid) {
      pTitle.textContent = 'The real authorization';
      pBody.innerHTML =
        `This is exactly what the payer signed for a <b>${fmtUsdc(BigInt(A.value))} USDC</b> payment on Base. ` +
        `The facilitator broadcasts it and <b>fronts the gas</b> — it never holds the funds. ` +
        `Now play the facilitator: try to <span class="hl">skim</span>, <span class="hl">redirect</span>, ` +
        `<span class="hl">stretch the window</span>, or <span class="hl">replay it elsewhere</span>.`;
    } else if (!onBase) {
      pTitle.textContent = `Replayed on ${chain.label}`;
      pBody.innerHTML =
        `The <b>chainId</b> is inside the domain separator. Signed for Base (<b>8453</b>), the authorization ` +
        `hashes to a <span class="ok">different digest</span> under ${chain.label}'s domain (<b>${chainId.toString()}</b>) — ` +
        `so the payer's signature recovers a stranger and <span class="hl">verify() reverts</span>. ` +
        `A signature minted for USDC on Base is <b>worthless on another chain</b>.`;
    } else {
      const acts: string[] = [];
      if (state.skim !== 1) acts.push(`inflated the amount to <span class="hl">${fmtUsdc(value)} USDC</span>`);
      if (state.redirect) acts.push(`pointed <span class="hl">to</span> at your own address`);
      if (state.stretch) acts.push(`stretched <span class="hl">validBefore</span> by an hour`);
      pTitle.textContent = 'The facilitator can’t touch it';
      pBody.innerHTML =
        `You ${acts.join(', and ')}. But that field is <b>inside the signed digest</b> — change one byte and ` +
        `the digest no longer matches the one the payer's signature was made over. <code>transferWithAuthorization</code> ` +
        `recovers a <span class="hl">different address</span>, it isn't the <b>from</b>, and the token <span class="hl">reverts</span>. ` +
        `Authorization is cryptographically bound to the amount and the destination.`;
    }
  }

  /* ---------------- INTERACTION --------------- */
  const onSkim = (): void => { state.skim = Number(skim.value); render(); };
  const onRedirect = (): void => { state.redirect = !state.redirect; render(); };
  const onStretch = (): void => { state.stretch = !state.stretch; render(); };
  const onReset = (): void => { state = { ...PRISTINE }; skim.value = '1'; render(); };
  const onChain = (e: Event): void => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-idx]');
    if (!b) return;
    state.chainIdx = Number(b.dataset.idx);
    render();
  };
  skim.addEventListener('input', onSkim);
  redirectChip.addEventListener('click', onRedirect);
  stretchChip.addEventListener('click', onStretch);
  seg.addEventListener('click', onChain);
  reset.addEventListener('click', onReset);

  render();

  return () => {
    skim.removeEventListener('input', onSkim);
    redirectChip.removeEventListener('click', onRedirect);
    stretchChip.removeEventListener('click', onStretch);
    seg.removeEventListener('click', onChain);
    reset.removeEventListener('click', onReset);
    layout.dispose();
    style.remove();
  };
}
