import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { getArticles, formatDate } from '@/lib/content-helpers';
import { SITE } from '@/lib/site';

/**
 * Build-time OG images: /og/<article-slug>.png for every article, plus
 * /og/site.png as the site-wide default card.
 */
export const getStaticPaths = (async () => {
  const articles = await getArticles();
  return [
    { params: { slug: 'site' }, props: { title: SITE.title, meta: 'blokz.dev' } },
    ...articles.map((a) => ({
      params: { slug: a.data.slug },
      props: {
        title: a.data.title,
        meta: `${formatDate(a.data.pubDate)} · ${a.data.topics.join(' / ')}`,
      },
    })),
  ];
}) satisfies GetStaticPaths;

const font = (file: string) =>
  readFile(path.join(process.cwd(), 'node_modules/@fontsource/space-grotesk/files', file));

export const GET: APIRoute = async ({ props }) => {
  const { title, meta } = props as { title: string; meta: string };

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
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
        children: [
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
                { type: 'span', props: { style: { flexShrink: 0 }, children: `AI × Blockchain · ${SITE.xHandle}` } },
              ],
            },
          },
        ],
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

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
