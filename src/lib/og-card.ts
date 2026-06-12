import { readFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { SITE } from '@/lib/site';
import type { Constellation } from '@/lib/constellation';

/**
 * Build-time OG card renderer shared by /og/[slug].png (site + articles) and
 * /og/artifacts/[slug].png (artifacts, which add their seeded constellation).
 * Satori constraints: flexbox only, woff fonts, explicit display:flex on
 * multi-child elements.
 */

const font = (file: string) =>
  readFile(path.join(process.cwd(), 'node_modules/@fontsource/space-grotesk/files', file));

interface OgCardOptions {
  title: string;
  meta: string;
  /** Optional slug-seeded constellation drawn behind the content. */
  stars?: Constellation;
}

type SatoriNode = {
  type: string;
  props: Record<string, unknown> & { children?: SatoriNode | SatoriNode[] | string };
};

function constellationLayer(stars: Constellation): SatoriNode {
  const lines: SatoriNode[] = stars.lines.map(({ a, b }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return {
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: `${a.x}px`,
          top: `${a.y}px`,
          width: `${len}px`,
          height: '2px',
          backgroundColor: 'rgba(124,140,255,0.22)',
          transform: `rotate(${angle}deg)`,
          transformOrigin: '0 0',
        },
      },
    };
  });
  const dots: SatoriNode[] = stars.pts.map((p) => ({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        left: `${p.x - p.r * 4}px`,
        top: `${p.y - p.r * 4}px`,
        width: `${p.r * 8}px`,
        height: `${p.r * 8}px`,
        borderRadius: '9999px',
        backgroundColor: p.c,
        opacity: 0.8,
      },
    },
  }));
  return {
    type: 'div',
    props: {
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' },
      children: [...lines, ...dots],
    },
  };
}

export async function renderOgCard({ title, meta, stars }: OgCardOptions): Promise<Buffer> {
  const children: SatoriNode[] = [];
  if (stars) children.push(constellationLayer(stars));
  children.push(
    {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center', gap: '14px' },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '26px',
                height: '26px',
                background: 'linear-gradient(135deg, #5b8cff, #8b5cf6 60%, #22d3ee)',
                transform: 'rotate(45deg)',
                borderRadius: '6px',
              },
            },
          },
          {
            type: 'span',
            props: {
              style: { fontSize: '30px', fontWeight: 700, color: '#fff' },
              children: 'BLOKZ.dev',
            },
          },
        ],
      },
    },
    {
      type: 'div',
      props: {
        style: {
          fontSize: title.length > 70 ? '52px' : '62px',
          fontWeight: 700,
          lineHeight: 1.12,
          color: '#ffffff',
          maxWidth: '1000px',
        },
        children: title,
      },
    },
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '40px',
          fontSize: '24px',
          fontWeight: 500,
          color: '#8d95ad',
        },
        children: [
          { type: 'span', props: { style: { maxWidth: '700px' }, children: meta } },
          {
            type: 'span',
            props: { style: { flexShrink: 0 }, children: `${SITE.tagline} · ${SITE.xHandle}` },
          },
        ],
      },
    },
  );

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          backgroundColor: '#05070d',
          backgroundImage:
            'radial-gradient(80% 80% at 100% 0%, rgba(139,92,246,0.25), transparent 60%), radial-gradient(70% 70% at 0% 100%, rgba(91,140,255,0.25), transparent 60%)',
          color: '#e7eaf3',
          fontFamily: 'Space Grotesk',
        },
        children,
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Space Grotesk', data: await font('space-grotesk-latin-500-normal.woff'), weight: 500, style: 'normal' },
        { name: 'Space Grotesk', data: await font('space-grotesk-latin-700-normal.woff'), weight: 700, style: 'normal' },
      ],
    },
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}
