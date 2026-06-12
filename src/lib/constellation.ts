/**
 * Deterministic generative constellations, seeded by an artifact slug — every
 * artifact gets a unique, stable visual identity at build time with zero
 * runtime cost. Pure math (no DOM), so it renders as inline SVG in cards and
 * stage placeholders and as positioned divs in satori OG cards.
 */

export interface ConstellationPoint {
  x: number;
  y: number;
  r: number;
  c: string;
}

export interface ConstellationLine {
  a: ConstellationPoint;
  b: ConstellationPoint;
}

export interface Constellation {
  pts: ConstellationPoint[];
  lines: ConstellationLine[];
}

const PALETTE = ['#5b8cff', '#8b5cf6', '#22d3ee'];

export function constellation(
  seedStr: string,
  { count = 14, w = 100, h = 56 }: { count?: number; w?: number; h?: number } = {},
): Constellation {
  const seed = [...seedStr].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 9);
  let s = seed || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  const pts: ConstellationPoint[] = Array.from({ length: count }, () => ({
    x: w * (0.06 + rand() * 0.88),
    y: h * (0.14 + rand() * 0.72),
    r: 0.6 + rand() * 0.9,
    c: PALETTE[Math.floor(rand() * PALETTE.length)]!,
  }));

  const d2 = (a: ConstellationPoint, b: ConstellationPoint) =>
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const lines = pts.flatMap((p) =>
    [...pts]
      .filter((q) => q !== p)
      .sort((q1, q2) => d2(p, q1) - d2(p, q2))
      .slice(0, 2)
      .map((q) => ({ a: p, b: q })),
  );

  return { pts, lines };
}
