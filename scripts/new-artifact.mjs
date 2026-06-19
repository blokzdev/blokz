#!/usr/bin/env node
/**
 * Scaffolds a new interactive artifact: manifest + entry-module stub, then
 * refreshes the content index.
 *
 * Usage:
 *   npm run new:artifact -- --title "My Artifact" --type three|canvas|svg|dom \
 *     --topics ai,blockchain [--archetype chart|map|diagram|simulation|calculator|scene] \
 *     [--description "…"] [--slug custom-slug]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { ARCHETYPES, ARTIFACTS_DIR, ISLANDS_DIR, ROOT, SLUG_RE, loadTaxonomy, slugify } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    title: { type: 'string' },
    description: { type: 'string' },
    type: { type: 'string' },
    archetype: { type: 'string' },
    topics: { type: 'string' },
    slug: { type: 'string' },
  },
});

const TYPES = ['three', 'canvas', 'svg', 'dom'];
if (!args.title || !args.type || !args.topics || !TYPES.includes(args.type)) {
  console.error('Usage: npm run new:artifact -- --title "…" --type three|canvas|svg|dom --topics ai,…');
  process.exit(1);
}
const archetype = args.archetype ?? 'simulation';
if (!ARCHETYPES.includes(archetype)) {
  console.error(`✗ unknown archetype "${archetype}". One of: ${ARCHETYPES.join(', ')}`);
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

const manifestFile = path.join(ARTIFACTS_DIR, slug, 'manifest.json');
const moduleFile = path.join(ISLANDS_DIR, `${slug}.ts`);
if (existsSync(manifestFile) || existsSync(moduleFile)) {
  console.error(`✗ artifact "${slug}" already exists`);
  process.exit(1);
}

const manifest = {
  slug,
  title: args.title,
  description:
    args.description ?? 'TODO: 20–300 char description of what this artifact shows and how to interact with it.',
  // Full ISO timestamp so same-day artifacts sort by true publish time (the
  // displayed date is still the date part).
  pubDate: new Date().toISOString(),
  type: args.type,
  archetype,
  topics,
  aspect: '16/9',
  featured: false,
  controls: [],
};

// Full-bleed renderers (three/canvas) fill a single surface; multi-region
// dom/svg artifacts compose into the shared responsive layout primitive.
const bleedStub = `/**
 * Artifact: ${slug} — ${args.title}
 * Manifest: content/artifacts/${slug}/manifest.json
 *
 * Contract: default-export a mount function that builds the scene inside
 * \`container\` and returns a cleanup function that releases every resource
 * (RAF loops, listeners, observers, GPU objects). See docs/ARTIFACTS.md.
 */
export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // TODO: build the artifact. For Three.js, use createScene() from
  // '@/lib/three-utils' — it handles DPR caps, resize, and pause-offscreen.

  return () => {
    canvas.remove();
  };
}
`;

const layoutStub = `/**
 * Artifact: ${slug} — ${args.title}
 * Manifest: content/artifacts/${slug}/manifest.json
 *
 * Contract: default-export a mount function that builds the artifact inside
 * \`container\` and returns a cleanup that releases every resource. Uses the
 * shared responsive layout primitive — it arranges the four slots (stage ·
 * panel · controls · caption) beside each other in landscape and stacked in
 * portrait, so you never hand-roll reflow. See docs/ARTIFACTS.md.
 */
import { createArtifactLayout } from '@/lib/artifact-layout';

export default function mount(container: HTMLElement): () => void {
  const layout = createArtifactLayout(container, {
    // 'footer' = controls span full width under [stage | panel];
    // 'rail' = panel + controls stack in a right rail beside the stage.
    wideTemplate: 'footer',
    // For a fixed-shape chart/diagram, set stageAspect (e.g. '16/9') so the
    // stage fits with no dead gap. Use stageMin only for variable-height DOM.
    stageAspect: '16/9',
  });
  const { stage, panel, controls, caption } = layout;

  const style = document.createElement('style');
  // Visual styles only — the primitive owns the responsive layout + outer
  // padding. Do NOT add a position:absolute root or your own resize logic. The
  // frame is overflow-hidden, so use shrinkable grids (minmax(0,1fr)),
  // flex-wrap on control rows, min-width:0, and overflow-wrap so nothing clips.
  style.textContent = \`\`;
  stage.appendChild(style);

  // TODO: build the primary visualization into \`stage\`, the secondary readout
  // (legend / detail / tally) into \`panel\`, inputs (sliders / tabs / buttons)
  // into \`controls\`, and the source/provenance/hint line into \`caption\`.
  // Omit a slot you don't need via the options, e.g. { panel: false }.

  return () => {
    layout.dispose();
    style.remove();
  };
}
`;

const stub = args.type === 'three' || args.type === 'canvas' ? bleedStub : layoutStub;

mkdirSync(path.dirname(manifestFile), { recursive: true });
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(moduleFile, stub);
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-index.mjs')], { stdio: 'inherit' });

console.log(`✓ created ${path.relative(ROOT, manifestFile)}`);
console.log(`✓ created ${path.relative(ROOT, moduleFile)}`);
console.log('  next: implement the module, then run `npm run validate`');
