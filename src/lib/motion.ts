import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Page-wide motion, driven by data attributes so layouts stay declarative:
 *   data-split            — headline split into masked lines that rise in
 *   data-reveal           — fades/rises in when scrolled into view
 *   data-reveal-group     — children stagger in (direct children, or [data-reveal-item])
 *   data-scroll-progress  — scaleX 0→1 scrubbed against document scroll (reading bar)
 *   data-magnetic         — element leans ±6px toward the pointer (hover devices only)
 *   data-counter="N"      — counts up to N on scroll; final value must be server-rendered
 *   data-parallax-glow    — decorative backdrop drifts vertically with scroll (scrubbed)
 *   data-toc-spy          — TOC container; `.is-active` tracks the heading in view
 *
 * Everything except toc-spy (state, not motion) is skipped under reduced motion;
 * content renders fully legible with zero JS.
 */
export function initMotion(): void {
  initTocSpy();
  if (prefersReducedMotion()) return;

  initSplits();

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 28,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      delay: Number(el.dataset.reveal) || 0,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  document.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = group.querySelectorAll('[data-reveal-item]');
    const targets = items.length ? items : group.children;
    gsap.from(targets, {
      y: 32,
      opacity: 0,
      duration: 0.85,
      ease: 'power3.out',
      stagger: 0.08,
      scrollTrigger: { trigger: group, start: 'top 85%', once: true },
    });
  });

  document.querySelectorAll<HTMLElement>('[data-scroll-progress]').forEach((el) => {
    gsap.to(el, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
      },
    });
  });

  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
      const pull = 6;
      const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo(((e.clientX - r.left) / r.width - 0.5) * 2 * pull);
        yTo(((e.clientY - r.top) / r.height - 0.5) * 2 * pull);
      });
      el.addEventListener('pointerleave', () => {
        xTo(0);
        yTo(0);
      });
    });
  }

  document.querySelectorAll<HTMLElement>('[data-counter]').forEach((el) => {
    const target = Number(el.dataset.counter ?? el.textContent);
    if (!Number.isFinite(target)) return;
    const state = { v: 0 };
    gsap.to(state, {
      v: target,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = String(Math.round(state.v));
      },
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  document.querySelectorAll<HTMLElement>('[data-parallax-glow]').forEach((el) => {
    gsap.fromTo(
      el,
      { yPercent: -12 },
      {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement ?? el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      },
    );
  });
}

/** Split after fonts load so line breaks are final (no CLS from font swap);
 *  300ms timeout race keeps the headline from waiting on a slow font. */
function initSplits(): void {
  const els = document.querySelectorAll<HTMLElement>('[data-split]');
  if (!els.length) return;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    els.forEach((el) => {
      const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
      gsap.from(split.lines, {
        yPercent: 110,
        opacity: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.09,
        delay: Number(el.dataset.split) || 0,
      });
    });
  };
  document.fonts.ready.then(run);
  setTimeout(run, 300);
}

/** Highlight the TOC link for the heading currently in view. Runs regardless
 *  of reduced motion — it's navigation state; CSS owns any transition. */
function initTocSpy(): void {
  const toc = document.querySelector<HTMLElement>('[data-toc-spy]');
  if (!toc) return;
  const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  if (!links.length) return;
  const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  let active: HTMLAnchorElement | null = null;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = byId.get(entry.target.id);
        if (!link || link === active) continue;
        active?.classList.remove('is-active');
        link.classList.add('is-active');
        active = link;
      }
    },
    { rootMargin: '-15% 0px -75% 0px' },
  );
  for (const id of byId.keys()) {
    const heading = document.getElementById(id);
    if (heading) io.observe(heading);
  }
}
