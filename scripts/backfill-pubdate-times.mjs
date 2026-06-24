#!/usr/bin/env node
/**
 * One-time migration: give existing date-only `pubDate`s a precise time so
 * same-day articles/artifacts order by true creation time.
 *
 * For each item we read its git "added" timestamp (the commit that first added
 * the file). Within each calendar day we order items by that git time and
 * rewrite `pubDate` to `<original-YYYY-MM-DD>T12:MM:00Z`, sequential by order.
 * The calendar DATE is preserved, so the displayed date and the directory/path
 * validation (`YYYY/MM`) are unchanged — only the within-day order becomes
 * truly chronological.
 *
 * Idempotent: re-running reproduces the same assignment from git history.
 * After running: `npm run index && npm run validate`.
 *
 * Usage: node scripts/backfill-pubdate-times.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadArticles, loadArtifacts, ROOT } from './lib.mjs';

/** Earliest commit that added `relPath`, as an ISO string (or '' if untracked). */
function gitAddedAt(relPath) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', relPath],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    if (!out) return '';
    return out.split('\n').pop(); // oldest add is the last line
  } catch {
    return '';
  }
}

const day = (v) => new Date(v).toISOString().slice(0, 10);

/** Build the work list for one collection. */
function collect(items, getPubDate, kind) {
  return items
    .filter((it) => !it.error)
    .map((it) => {
      const relPath = it.relPath;
      const abs = path.join(ROOT, relPath);
      return {
        kind,
        abs,
        relPath,
        day: day(getPubDate(it)),
        addedAt: gitAddedAt(relPath),
      };
    });
}

const work = [
  ...collect(loadArticles(), (it) => it.frontmatter.pubDate, 'article'),
  ...collect(loadArtifacts(), (it) => it.manifest.pubDate, 'artifact'),
];

// Group by calendar day, order each group by git-added time ascending, and
// assign sequential within-day times (oldest → 12:00, then +1 min each).
const groups = new Map();
for (const w of work) {
  const key = `${w.kind}:${w.day}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(w);
}

let changed = 0;
for (const [, group] of groups) {
  group.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : a.relPath.localeCompare(b.relPath)));
  group.forEach((w, i) => {
    const mm = String(i).padStart(2, '0'); // up to 60 items/day
    const newPubDate = `${w.day}T12:${mm}:00Z`;
    const raw = readFileSync(w.abs, 'utf8');
    let next;
    if (w.abs.endsWith('.json')) {
      next = raw.replace(/("pubDate":\s*")[^"]*(")/, `$1${newPubDate}$2`);
    } else {
      next = raw.replace(/^pubDate:.*$/m, `pubDate: ${newPubDate}`);
    }
    if (next !== raw) {
      writeFileSync(w.abs, next);
      changed++;
      console.log(`  ${w.kind}  ${w.day} #${i}  ${w.relPath}`);
    }
  });
}

console.log(`\n✓ backfilled ${changed} pubDate(s). Next: npm run index && npm run validate`);
