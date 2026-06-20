// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * Wrap every markdown `<table>` in `<div class="table-scroll">` so a table wider
 * than the prose column scrolls horizontally within its own box instead of
 * overflowing the page (which clipped wide tables and left the page horizontally
 * offset after device rotation).
 */
function rehypeTableScroll() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'element' && child.tagName === 'table') {
          node.children[i] = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-scroll'] },
            children: [child],
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://blokz.dev',
  // Alternate article sort orders (/articles/sort/*) are duplicate content —
  // keep them out of the sitemap (they're also robots noindex).
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes('/articles/sort/') })],
  markdown: {
    shikiConfig: {
      theme: 'tokyo-night',
    },
    rehypePlugins: [rehypeTableScroll],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
