/** Global site + brand constants. Single source of truth for links and copy. */
export const SITE = {
  name: 'Blokz',
  org: 'Blokz Development Co.',
  title: 'Blokz — Where the Brain Meets the Chain',
  /** Canonical tagline. Lowercase brand moments use CSS `lowercase`, never a second string. */
  tagline: 'Where the brain meets the chain',
  description:
    'blokz.dev — where the brain meets the chain. Deep technical writing and interactive artifacts on AI × blockchain: agents, zero-knowledge, LLMs, smart contracts, and the infrastructure binding them.',
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
