#!/usr/bin/env node
/**
 * Scaffolds a new article in the canonical location with valid frontmatter,
 * then refreshes the content index. The required path for new articles —
 * never hand-build article directories.
 *
 * Usage:
 *   npm run new:article -- --title "My Title" --topics ai,agents \
 *     [--description "…"] [--slug custom-slug] [--date YYYY-MM-DD] \
 *     [--series slug --series-order N] [--difficulty intro|intermediate|advanced] \
 *     [--draft]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { ARTICLES_DIR, ROOT, SLUG_RE, loadTaxonomy, slugify } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    title: { type: 'string' },
    description: { type: 'string' },
    topics: { type: 'string' },
    slug: { type: 'string' },
    date: { type: 'string' },
    series: { type: 'string' },
    'series-order': { type: 'string' },
    difficulty: { type: 'string', default: 'intermediate' },
    draft: { type: 'boolean', default: false },
  },
});

if (!args.title || !args.topics) {
  console.error('Usage: npm run new:article -- --title "…" --topics ai,agents [options]');
  process.exit(1);
}

const slug = args.slug ?? slugify(args.title);
if (!SLUG_RE.test(slug)) {
  console.error(`✗ derived slug "${slug}" is not kebab-case — pass --slug explicitly`);
  process.exit(1);
}

const known = new Set(loadTaxonomy().map((t) => t.id));
const topics = args.topics.split(',').map((t) => t.trim());
for (const t of topics) {
  if (!known.has(t)) {
    console.error(`✗ unknown topic "${t}". Known: ${[...known].join(', ')}`);
    process.exit(1);
  }
}

const date = args.date ? new Date(args.date) : new Date();
const yyyy = String(date.getUTCFullYear());
const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
// Full ISO timestamp so same-day articles sort by true publish time. The
// displayed date is still the date part (formatDate); the directory uses YYYY/MM.
const pubDate = date.toISOString();

const dir = path.join(ARTICLES_DIR, yyyy, mm, slug);
const file = path.join(dir, 'index.mdx');
if (existsSync(file)) {
  console.error(`✗ already exists: ${path.relative(ROOT, file)}`);
  process.exit(1);
}

const frontmatter = [
  '---',
  `slug: ${slug}`,
  `title: ${JSON.stringify(args.title)}`,
  `description: ${JSON.stringify(args.description ?? 'TODO: 40–300 char summary that earns the click and reads well in search results.')}`,
  `pubDate: ${pubDate}`,
  'author: blokz',
  `topics: [${topics.join(', ')}]`,
  'tags: []',
  ...(args.series ? [`series: ${args.series}`, `seriesOrder: ${args['series-order'] ?? 1}`] : []),
  'artifacts: []',
  `difficulty: ${args.difficulty}`,
  ...(args.draft ? ['draft: true'] : []),
  'sources: []',
  '---',
].join('\n');

const body = `
TODO: opening hook — why this matters, in two or three sentences.

## Section heading

TODO: body. House style: docs/CONTENT-AUTHORING.md.

## Takeaways

TODO.
`;

mkdirSync(dir, { recursive: true });
writeFileSync(file, frontmatter + '\n' + body);
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-index.mjs')], { stdio: 'inherit' });

console.log(`✓ created ${path.relative(ROOT, file)}`);
console.log('  next: write the body, then run `npm run validate`');
