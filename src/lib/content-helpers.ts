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

/* ------------------------------------------------------------------ sorting */

export type ArticleSortKey = 'newest' | 'oldest' | 'az' | 'za' | 'short' | 'long';

/** Sort options for the /articles archive — order drives the sort bar. */
export const ARTICLE_SORTS: ReadonlyArray<{
  key: ArticleSortKey;
  label: string;
  href: string;
}> = [
  { key: 'newest', label: 'Newest', href: '/articles/' },
  { key: 'oldest', label: 'Oldest', href: '/articles/sort/oldest/' },
  { key: 'az', label: 'A–Z', href: '/articles/sort/az/' },
  { key: 'za', label: 'Z–A', href: '/articles/sort/za/' },
  { key: 'short', label: 'Shortest', href: '/articles/sort/short/' },
  { key: 'long', label: 'Longest', href: '/articles/sort/long/' },
];

/** The non-default orders that get their own pre-rendered routes. */
export const ARTICLE_SORT_VARIANTS = ['oldest', 'az', 'za', 'short', 'long'] as const;

/** Return a new array sorted by `key`; every order has a deterministic tiebreak. */
export function sortArticles(list: Article[], key: ArticleSortKey): Article[] {
  const out = [...list];
  switch (key) {
    case 'oldest':
      return out.sort(
        (a, b) =>
          a.data.pubDate.valueOf() - b.data.pubDate.valueOf() ||
          a.data.slug.localeCompare(b.data.slug),
      );
    case 'az':
      return out.sort((a, b) => a.data.title.localeCompare(b.data.title) || byPubDateDesc(a, b));
    case 'za':
      return out.sort((a, b) => b.data.title.localeCompare(a.data.title) || byPubDateDesc(a, b));
    case 'short':
      return out.sort((a, b) => readingTime(a.body) - readingTime(b.body) || byPubDateDesc(a, b));
    case 'long':
      return out.sort((a, b) => readingTime(b.body) - readingTime(a.body) || byPubDateDesc(a, b));
    default:
      return out.sort(byPubDateDesc);
  }
}

/* ----------------------------------------------------------- date archives */

/** Nested year → month → day counts for the date navigator and routes. */
export interface DateTree {
  years: Array<{
    year: string;
    count: number;
    months: Array<{
      month: string;
      count: number;
      days: Array<{ day: string; count: number }>;
    }>;
  }>;
}

/** Zero-padded UTC parts of an article's pubDate (consistent with formatDate). */
function dateParts(d: Date): { year: string; month: string; day: string } {
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
  };
}

/** True if `article` falls in the given UTC year (+ optional month/day). */
export function filterArticlesByDate(
  articles: Article[],
  year: string,
  month?: string,
  day?: string,
): Article[] {
  return articles.filter((a) => {
    const p = dateParts(a.data.pubDate);
    if (p.year !== year) return false;
    if (month && p.month !== month) return false;
    if (day && p.day !== day) return false;
    return true;
  });
}

/**
 * Nested year → month → day tree with per-bucket counts, all descending
 * (newest first). Powers the /articles/date navigator. Input is assumed
 * newest-first (from getArticles), so insertion order is already correct.
 */
export function groupArticlesByDate(articles: Article[]): DateTree {
  const years: DateTree['years'] = [];
  for (const a of articles) {
    const { year, month, day } = dateParts(a.data.pubDate);
    let y = years.find((e) => e.year === year);
    if (!y) {
      y = { year, count: 0, months: [] };
      years.push(y);
    }
    y.count++;
    let m = y.months.find((e) => e.month === month);
    if (!m) {
      m = { month, count: 0, days: [] };
      y.months.push(m);
    }
    m.count++;
    let d = m.days.find((e) => e.day === day);
    if (!d) {
      d = { day, count: 0 };
      m.days.push(d);
    }
    d.count++;
  }
  return { years };
}

/** Human label for a date bucket: "2026" / "June 2026" / "June 20, 2026" (UTC). */
export function dateArchiveLabel(year: string, month?: string, day?: string): string {
  if (!month) return year;
  // Build a UTC date from the parts; day defaults to the 1st for month labels.
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? '1')));
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    ...(day ? { day: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/**
 * Breadcrumb pills (SortBar-shaped) from "All dates" down to the active bucket.
 * The deepest segment is the active `current` key.
 */
export function dateArchiveCrumbs(
  year: string,
  month?: string,
  day?: string,
): Array<{ key: string; label: string; href: string }> {
  const crumbs = [{ key: 'all', label: 'All dates', href: '/articles/date/' }];
  crumbs.push({ key: year, label: year, href: `/articles/date/${year}/` });
  if (month) {
    crumbs.push({
      key: month,
      label: dateArchiveLabel(year, month).replace(` ${year}`, ''),
      href: `/articles/date/${year}/${month}/`,
    });
  }
  if (day) {
    crumbs.push({ key: day, label: day, href: `/articles/date/${year}/${month}/${day}/` });
  }
  return crumbs;
}
