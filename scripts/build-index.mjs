#!/usr/bin/env node
/**
 * Regenerates content/_index.json — the machine-readable catalog of every
 * article and artifact. Routines should read this file (one read) instead of
 * globbing the content tree. Output is deterministic: no timestamps, stable
 * sort, so diffs stay meaningful.
 *
 * Usage: npm run index
 */
import { writeFileSync } from 'node:fs';
import { buildIndex, INDEX_FILE } from './lib.mjs';

const index = buildIndex();
writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
console.log(
  `✓ content/_index.json — ${index.counts.articles} articles, ${index.counts.artifacts} artifacts`,
);
