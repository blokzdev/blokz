import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Article = CollectionEntry<'articles'>;
export type Artifact = CollectionEntry<'artifacts'>;
export type Topic = CollectionEntry<'taxonomy'>;

/**
 * Newest first, with a deterministic slug tiebreaker. `pubDate` carries a time
 * (set by the scaffold), so same-day items order by their true publish time;
 * the slug tiebreaker keeps the order stable on the rare exact tie. Mirrors the
 * index builder in `scripts/lib.mjs`.
 */
export function byPubDateDesc(a: Article | Artifact, b: Article | Artifact): number {
  return (
    b.data.pubDate.valueOf() - a.data.pubDate.valueOf() ||
    a.data.slug.localeCompare(b.data.slug)
  );
}

/** Published articles, newest first. Drafts are excluded outside dev. */
export async function getArticles(): Promise<Article[]> {
  const all = await getCollection('articles', ({ data }) =>
    import.meta.env.DEV ? true : !data.draft,
  );
  return all.sort(byPubDateDesc);
}

export async function getArtifacts(): Promise<Artifact[]> {
  const all = await getCollection('artifacts', ({ data }) =>
    import.meta.env.DEV ? true : !data.draft,
  );
  return all.sort(byPubDateDesc);
}

export async function getTopics(): Promise<Topic[]> {
  return getCollection('taxonomy');
}

export async function getTopic(id: string): Promise<Topic | undefined> {
  return getEntry('taxonomy', id);
}

/** ~220 wpm, code-heavy content reads slower; floor of 1 minute. */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Articles sharing the most topics with `article`, newest first as tiebreak. */
export function relatedArticles(article: Article, pool: Article[], limit = 3): Article[] {
  return pool
    .filter((a) => a.id !== article.id)
    .map((a) => ({
      a,
      score: a.data.topics.filter((t) => article.data.topics.includes(t)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((x, y) => y.score - x.score || byPubDateDesc(x.a, y.a))
    .slice(0, limit)
    .map(({ a }) => a);
}

export function articleUrl(article: Article): string {
  return `/articles/${article.data.slug}`;
}

export function artifactUrl(artifact: Artifact): string {
  return `/artifacts/${artifact.data.slug}`;
}
