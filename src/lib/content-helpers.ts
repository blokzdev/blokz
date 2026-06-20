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

/** Sort option for a collection archive — drives the sort bar. */
export interface SortOption {
  key: string;
  label: string;
  href: string;
}

/** Orders shared by any pubDate+title collection (articles and artifacts). */
export type BaseSortKey = 'newest' | 'oldest' | 'az' | 'za';
/** Articles add reading-length orders (artifacts have no body). */
export type ArticleSortKey = BaseSortKey | 'short' | 'long';
export type ArtifactSortKey = BaseSortKey;

/** Sort options for the /articles archive — order drives the sort bar. */
export const ARTICLE_SORTS: ReadonlyArray<SortOption & { key: ArticleSortKey }> = [
  { key: 'newest', label: 'Newest', href: '/articles/' },
  { key: 'oldest', label: 'Oldest', href: '/articles/sort/oldest/' },
  { key: 'az', label: 'A–Z', href: '/articles/sort/az/' },
  { key: 'za', label: 'Z–A', href: '/articles/sort/za/' },
  { key: 'short', label: 'Shortest', href: '/articles/sort/short/' },
  { key: 'long', label: 'Longest', href: '/articles/sort/long/' },
];

/** Sort options for the /artifacts archive (no reading-length — no body). */
export const ARTIFACT_SORTS: ReadonlyArray<SortOption & { key: ArtifactSortKey }> = [
  { key: 'newest', label: 'Newest', href: '/artifacts/' },
  { key: 'oldest', label: 'Oldest', href: '/artifacts/sort/oldest/' },
  { key: 'az', label: 'A–Z', href: '/artifacts/sort/az/' },
  { key: 'za', label: 'Z–A', href: '/artifacts/sort/za/' },
];

/** The non-default orders that get their own pre-rendered routes. */
export const ARTICLE_SORT_VARIANTS = ['oldest', 'az', 'za', 'short', 'long'] as const;
export const ARTIFACT_SORT_VARIANTS = ['oldest', 'az', 'za'] as const;

/** Shared orders for any Article|Artifact; every order has a deterministic tiebreak. */
function sortEntries<T extends Article | Artifact>(list: T[], key: BaseSortKey): T[] {
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
    default:
      return out.sort(byPubDateDesc);
  }
}

/** Return a new array sorted by `key`. Adds reading-length orders to the shared set. */
export function sortArticles(list: Article[], key: ArticleSortKey): Article[] {
  switch (key) {
    case 'short':
      return [...list].sort(
        (a, b) => readingTime(a.body) - readingTime(b.body) || byPubDateDesc(a, b),
      );
    case 'long':
      return [...list].sort(
        (a, b) => readingTime(b.body) - readingTime(a.body) || byPubDateDesc(a, b),
      );
    default:
      return sortEntries(list, key);
  }
}

/** Return a new array of artifacts sorted by `key` (shared orders only). */
export function sortArtifacts(list: Artifact[], key: ArtifactSortKey): Artifact[] {
  return sortEntries(list, key);
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

/** Entries (articles or artifacts) falling in the given UTC year (+ month/day). */
export function filterByDate<T extends Article | Artifact>(
  entries: T[],
  year: string,
  month?: string,
  day?: string,
): T[] {
  return entries.filter((e) => {
    const p = dateParts(e.data.pubDate);
    if (p.year !== year) return false;
    if (month && p.month !== month) return false;
    if (day && p.day !== day) return false;
    return true;
  });
}

/**
 * Nested year → month → day tree with per-bucket counts, all descending
 * (newest first). Powers a date navigator. Input is assumed newest-first
 * (from getArticles/getArtifacts), so insertion order is already correct.
 */
export function groupByDate(entries: Array<Article | Artifact>): DateTree {
  const years: DateTree['years'] = [];
  for (const a of entries) {
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
 * `base` is the collection root, e.g. "/articles" or "/artifacts". The deepest
 * segment is the active `current` key.
 */
export function dateArchiveCrumbs(
  base: string,
  year: string,
  month?: string,
  day?: string,
): SortOption[] {
  const crumbs: SortOption[] = [{ key: 'all', label: 'All dates', href: `${base}/date/` }];
  crumbs.push({ key: year, label: year, href: `${base}/date/${year}/` });
  if (month) {
    crumbs.push({
      key: month,
      label: dateArchiveLabel(year, month).replace(` ${year}`, ''),
      href: `${base}/date/${year}/${month}/`,
    });
  }
  if (day) {
    crumbs.push({ key: day, label: day, href: `${base}/date/${year}/${month}/${day}/` });
  }
  return crumbs;
}

/**
 * The sort bar for a date-archive page, scoped to that date bucket: `newest`
 * links back to the plain date URL; each other order links to its
 * `${base}/date/<seg>/sort/<key>/` variant. Pass the collection's full SORTS
 * list (ARTICLE_SORTS / ARTIFACT_SORTS) — labels come from it.
 */
export function dateScopedSorts(
  base: string,
  sorts: ReadonlyArray<SortOption>,
  year: string,
  month?: string,
  day?: string,
): SortOption[] {
  const seg = [year, month, day].filter(Boolean).join('/');
  const plain = `${base}/date/${seg}/`;
  return sorts.map((s) => ({
    key: s.key,
    label: s.label,
    href: s.key === 'newest' ? plain : `${base}/date/${seg}/sort/${s.key}/`,
  }));
}
