/** Global site + brand constants. Single source of truth for links and copy. */
export const SITE = {
  name: 'Blokz',
  org: 'Blokz Development Co.',
  title: 'Blokz — AI × Blockchain Engineering',
  description:
    'The Blokz dev blog: deep technical writing and interactive artifacts at the intersection of AI and blockchain — agents, zero-knowledge, LLMs, smart contracts, and the infrastructure that binds them.',
  url: 'https://blokz.dev',
  repo: 'https://github.com/blokzdev/blokz',
  github: 'https://github.com/blokzdev',
  x: 'https://x.com/blokzdev',
  xHandle: '@blokzdev',
  linkedin: 'https://www.linkedin.com/company/blokzdev',
} as const;

export const NAV = [
  { label: 'Articles', href: '/articles' },
  { label: 'Artifacts', href: '/artifacts' },
  { label: 'Topics', href: '/topics' },
  { label: 'About', href: '/about' },
] as const;
