/** Shared helpers for the content automation scripts. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const ARTICLES_DIR = path.join(ROOT, 'content/articles');
export const ARTIFACTS_DIR = path.join(ROOT, 'content/artifacts');
export const ISLANDS_DIR = path.join(ROOT, 'src/islands/artifacts');
export const INDEX_FILE = path.join(ROOT, 'content/_index.json');

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Editorial categories for artifacts (manifest `archetype`; `type` is rendering tech). */
export const ARCHETYPES = ['chart', 'map', 'diagram', 'simulation', 'calculator', 'scene'];

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function loadTaxonomy() {
  return JSON.parse(readFileSync(path.join(ROOT, 'content/taxonomy/topics.json'), 'utf8'));
}

export function loadAuthors() {
  const dir = path.join(ROOT, 'content/authors');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

export function loadSeries() {
  const dir = path.join(ROOT, 'content/series');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/** All articles as { relPath, year, month, dir, frontmatter, body }. */
export function loadArticles() {
  const articles = [];
  if (!existsSync(ARTICLES_DIR)) return articles;
  for (const year of readdirSync(ARTICLES_DIR)) {
    const yearDir = path.join(ARTICLES_DIR, year);
    for (const month of readdirSync(yearDir)) {
      const monthDir = path.join(yearDir, month);
      for (const dir of readdirSync(monthDir)) {
        const file = path.join(monthDir, dir, 'index.mdx');
        const relPath = path.relative(ROOT, file);
        if (!existsSync(file)) {
          articles.push({ relPath, year, month, dir, error: 'missing index.mdx' });
          continue;
        }
        const { data, content } = matter(readFileSync(file, 'utf8'));
        articles.push({ relPath, year, month, dir, frontmatter: data, body: content });
      }
    }
  }
  return articles;
}

/** All artifacts as { relPath, dir, manifest }. */
export function loadArtifacts() {
  const artifacts = [];
  if (!existsSync(ARTIFACTS_DIR)) return artifacts;
  for (const dir of readdirSync(ARTIFACTS_DIR)) {
    const file = path.join(ARTIFACTS_DIR, dir, 'manifest.json');
    const relPath = path.relative(ROOT, file);
    if (!existsSync(file)) {
      artifacts.push({ relPath, dir, error: 'missing manifest.json' });
      continue;
    }
    artifacts.push({ relPath, dir, manifest: JSON.parse(readFileSync(file, 'utf8')) });
  }
  return artifacts;
}

/** Deterministic catalog of all content — written to content/_index.json. */
export function buildIndex() {
  const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
  const articles = loadArticles()
    .filter((a) => !a.error)
    .map(({ relPath, frontmatter: fm }) => ({
      slug: fm.slug,
      path: relPath,
      url: `/articles/${fm.slug}`,
      title: fm.title,
      description: fm.description,
      pubDate: isoDate(fm.pubDate),
      ...(fm.updatedDate ? { updatedDate: isoDate(fm.updatedDate) } : {}),
      topics: fm.topics ?? [],
      tags: fm.tags ?? [],
      ...(fm.series ? { series: fm.series, seriesOrder: fm.seriesOrder } : {}),
      artifacts: fm.artifacts ?? [],
      difficulty: fm.difficulty ?? 'intermediate',
      draft: Boolean(fm.draft),
    }))
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : a.slug.localeCompare(b.slug)));

  const artifacts = loadArtifacts()
    .filter((a) => !a.error)
    .map(({ relPath, manifest: m }) => ({
      slug: m.slug,
      path: relPath,
      module: `src/islands/artifacts/${m.slug}.ts`,
      url: `/artifacts/${m.slug}`,
      title: m.title,
      description: m.description,
      pubDate: isoDate(m.pubDate),
      type: m.type,
      archetype: m.archetype ?? null,
      topics: m.topics ?? [],
      draft: Boolean(m.draft),
    }))
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : a.slug.localeCompare(b.slug)));

  const topicCounts = {};
  for (const a of articles) for (const t of a.topics) topicCounts[t] = (topicCounts[t] ?? 0) + 1;

  return {
    counts: { articles: articles.length, artifacts: artifacts.length },
    topicCounts: Object.fromEntries(Object.entries(topicCounts).sort()),
    articles,
    artifacts,
  };
}
