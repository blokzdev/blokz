import type { APIRoute, GetStaticPaths } from 'astro';
import { constellation } from '@/lib/constellation';
import { getArtifacts, formatDate } from '@/lib/content-helpers';
import { renderOgCard } from '@/lib/og-card';

/**
 * Build-time OG images for artifacts: /og/artifacts/<slug>.png. Each card
 * carries the artifact's slug-seeded constellation — the same one shown in
 * gallery cards and stage placeholders — so the identity survives the share.
 */
export const getStaticPaths = (async () => {
  const artifacts = await getArtifacts();
  return artifacts.map((a) => ({
    params: { slug: a.data.slug },
    props: {
      title: a.data.title,
      meta: `interactive artifact · ${formatDate(a.data.pubDate)} · ${a.data.topics.join(' / ')}`,
      slug: a.data.slug,
    },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { title, meta, slug } = props as { title: string; meta: string; slug: string };
  const png = await renderOgCard({
    title,
    meta,
    stars: constellation(slug, { count: 16, w: 1200, h: 630 }),
  });
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
