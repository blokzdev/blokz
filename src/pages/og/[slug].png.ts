import type { APIRoute, GetStaticPaths } from 'astro';
import { getArticles, formatDate } from '@/lib/content-helpers';
import { renderOgCard } from '@/lib/og-card';
import { SITE } from '@/lib/site';

/**
 * Build-time OG images: /og/<article-slug>.png for every article, plus
 * /og/site.png as the site-wide default card. Artifact cards live at
 * /og/artifacts/<slug>.png (namespaced, so slugs can never collide).
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

export const GET: APIRoute = async ({ props }) => {
  const { title, meta } = props as { title: string; meta: string };
  const png = await renderOgCard({ title, meta });
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
