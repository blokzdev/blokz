import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/**
 * Content collections — the single source of truth for content shape.
 *
 * Layout contract (enforced here + in scripts/validate.mjs):
 *   content/articles/YYYY/MM/<slug>/index.mdx   (assets colocated in ./assets/)
 *   content/artifacts/<slug>/manifest.json      (code in src/islands/artifacts/<slug>.ts)
 *   content/series/<slug>.json
 *   content/authors/<id>.json
 *   content/taxonomy/topics.json                (controlled vocabulary)
 */

const articles = defineCollection({
  loader: glob({
    pattern: '*/*/*/index.mdx',
    base: './content/articles',
    generateId: ({ data }) => String(data.slug),
  }),
  schema: ({ image }) =>
    z.object({
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
      title: z.string().min(8).max(120),
      description: z.string().min(40).max(300),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      author: z.string().default('blokz'),
      /** Must exist in content/taxonomy/topics.json (checked by validate.mjs). */
      topics: z.array(z.string()).min(1).max(5),
      /** Free-form, lowercase; finer-grained than topics. */
      tags: z.array(z.string()).default([]),
      series: z.string().optional(),
      seriesOrder: z.number().int().positive().optional(),
      hero: image().optional(),
      heroAlt: z.string().optional(),
      /** Slugs of interactive artifacts embedded in or related to this article. */
      artifacts: z.array(z.string()).default([]),
      difficulty: z.enum(['intro', 'intermediate', 'advanced']).default('intermediate'),
      featured: z.boolean().default(false),
      sources: z
        .array(z.object({ label: z.string(), url: z.string().url() }))
        .default([]),
    }),
});

const artifacts = defineCollection({
  loader: glob({
    pattern: '*/manifest.json',
    base: './content/artifacts',
    generateId: ({ data }) => String(data.slug),
  }),
  schema: z.object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
    title: z.string().min(4).max(80),
    description: z.string().min(20).max(300),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    /** Rendering technology — drives the mount container + gallery badge. */
    type: z.enum(['three', 'canvas', 'svg', 'dom']),
    topics: z.array(z.string()).min(1).max(5),
    /** Aspect ratio of the stage, e.g. "16/9". */
    aspect: z.string().default('16/9'),
    featured: z.boolean().default(false),
    /** Short hints rendered under the stage (interactions, controls). */
    controls: z.array(z.string()).default([]),
  }),
});

const series = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/series' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    status: z.enum(['ongoing', 'complete']).default('ongoing'),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/authors' }),
  schema: z.object({
    name: z.string(),
    bio: z.string(),
    url: z.string().url().optional(),
  }),
});

const taxonomy = defineCollection({
  loader: file('./content/taxonomy/topics.json'),
  schema: z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    /** Accent hue (degrees) used for topic theming across the UI. */
    hue: z.number().min(0).max(360),
  }),
});

export const collections = { articles, artifacts, series, authors, taxonomy };
