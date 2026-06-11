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
 *
 * Everything is skipped (content shown immediately) under reduced motion.
 */
export function initMotion(): void {
  if (prefersReducedMotion()) return;

  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
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
}
