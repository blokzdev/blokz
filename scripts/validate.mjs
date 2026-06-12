#!/usr/bin/env node
/**
 * Content validation — the gate every content change must pass before commit.
 * Structural/cross-reference checks that Astro's per-entry Zod schemas can't
 * express (taxonomy membership, path↔frontmatter agreement, dangling refs,
 * index freshness). Exit code 1 on any error.
 *
 * Usage: npm run validate
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  ARTIFACTS_DIR,
  ARCHETYPES,
  ISLANDS_DIR,
  INDEX_FILE,
  SLUG_RE,
  buildIndex,
  loadArticles,
  loadArtifacts,
  loadAuthors,
  loadSeries,
  loadTaxonomy,
} from './lib.mjs';

const errors = [];
const warn = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

const topics = new Set(loadTaxonomy().map((t) => t.id));
const authors = new Set(loadAuthors());
const series = new Set(loadSeries());
const articles = loadArticles();
const artifacts = loadArtifacts();
const artifactSlugs = new Set(artifacts.filter((a) => a.manifest).map((a) => a.manifest.slug));

// ---- Articles ----
const seenSlugs = new Map();
const REQUIRED = ['slug', 'title', 'description', 'pubDate', 'topics'];

for (const article of articles) {
  const { relPath, year, month, dir, frontmatter: fm, error } = article;
  if (error) {
    fail(relPath, error);
    continue;
  }

  for (const field of REQUIRED) {
    if (fm[field] === undefined) fail(relPath, `missing required frontmatter field "${field}"`);
  }
  if (!fm.slug) continue;

  if (!SLUG_RE.test(fm.slug)) fail(relPath, `slug "${fm.slug}" is not kebab-case`);
  if (fm.slug !== dir) fail(relPath, `slug "${fm.slug}" ≠ directory name "${dir}"`);
  if (seenSlugs.has(fm.slug)) fail(relPath, `duplicate slug (also in ${seenSlugs.get(fm.slug)})`);
  seenSlugs.set(fm.slug, relPath);

  const pub = new Date(fm.pubDate);
  if (Number.isNaN(pub.valueOf())) {
    fail(relPath, `invalid pubDate "${fm.pubDate}"`);
  } else {
    const y = String(pub.getUTCFullYear());
    const m = String(pub.getUTCMonth() + 1).padStart(2, '0');
    if (y !== year || m !== month)
      fail(relPath, `pubDate ${y}-${m} disagrees with directory ${year}/${month}`);
    if (fm.updatedDate && new Date(fm.updatedDate) < pub)
      fail(relPath, 'updatedDate is before pubDate');
  }

  for (const t of fm.topics ?? []) {
    if (!topics.has(t))
      fail(relPath, `unknown topic "${t}" — add it to content/taxonomy/topics.json or fix the typo`);
  }
  if (fm.author && !authors.has(fm.author)) fail(relPath, `unknown author "${fm.author}"`);
  if (fm.series) {
    if (!series.has(fm.series)) fail(relPath, `unknown series "${fm.series}"`);
    if (fm.seriesOrder === undefined) fail(relPath, 'series set but seriesOrder missing');
  }
  for (const a of fm.artifacts ?? []) {
    if (!artifactSlugs.has(a)) fail(relPath, `references unknown artifact "${a}"`);
  }
  for (const s of fm.sources ?? []) {
    if (!s.label || !s.url) fail(relPath, 'each source needs { label, url }');
  }

  // Embedded artifacts must be declared in frontmatter (keeps the index honest).
  for (const [, embedded] of article.body.matchAll(/<Artifact\s+slug="([^"]+)"/g)) {
    if (!(fm.artifacts ?? []).includes(embedded))
      fail(relPath, `embeds <Artifact slug="${embedded}"> but doesn't list it in frontmatter artifacts[]`);
  }

  if (article.body.trim().split(/\s+/).length < 150)
    warn.push(`${relPath}: body is under 150 words — is this a stub?`);
}

// ---- Artifacts ----
for (const { relPath, dir, manifest: m, error } of artifacts) {
  if (error) {
    fail(relPath, error);
    continue;
  }
  for (const field of ['slug', 'title', 'description', 'pubDate', 'type', 'topics']) {
    if (m[field] === undefined) fail(relPath, `missing required manifest field "${field}"`);
  }
  if (m.slug && m.slug !== dir) fail(relPath, `slug "${m.slug}" ≠ directory name "${dir}"`);
  if (m.slug && !existsSync(path.join(ISLANDS_DIR, `${m.slug}.ts`)))
    fail(relPath, `no entry module at src/islands/artifacts/${m.slug}.ts`);
  for (const t of m.topics ?? []) {
    if (!topics.has(t)) fail(relPath, `unknown topic "${t}"`);
  }

  if (m.archetype !== undefined && !ARCHETYPES.includes(m.archetype)) {
    fail(relPath, `unknown archetype "${m.archetype}" — one of: ${ARCHETYPES.join(', ')}`);
  } else if (m.archetype === undefined) {
    warn.push(`${relPath}: no archetype set — pick one of: ${ARCHETYPES.join(', ')}`);
  }

  // Data-backed artifacts must carry provenance (no orphaned numbers).
  const dataFile = path.join(ARTIFACTS_DIR, dir, 'data.json');
  if (existsSync(dataFile)) {
    try {
      JSON.parse(readFileSync(dataFile, 'utf8'));
    } catch (e) {
      fail(relPath, `data.json is not valid JSON: ${e.message}`);
    }
    if (!m.dataAsOf || Number.isNaN(new Date(m.dataAsOf).valueOf()))
      fail(relPath, 'data.json present but manifest lacks a valid dataAsOf date');
    if (!m.dataSource?.label || !m.dataSource?.url)
      fail(relPath, 'data.json present but manifest lacks dataSource { label, url }');
  }
}

// ---- Index freshness ----
const expected = JSON.stringify(buildIndex(), null, 2) + '\n';
const actual = existsSync(INDEX_FILE) ? readFileSync(INDEX_FILE, 'utf8') : '';
if (expected !== actual) {
  fail(path.relative(ROOT, INDEX_FILE), 'stale — run `npm run index` and commit the result');
}

// ---- Report ----
for (const w of warn) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} validation error(s).`);
  process.exit(1);
}
console.log(
  `✓ content valid — ${articles.length} articles, ${artifacts.length} artifacts, ${topics.size} topics`,
);
