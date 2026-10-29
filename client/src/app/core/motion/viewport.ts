/** Shared by the reveal directive and the count-up so a block and the number inside it wake up together (MRV-7.3). */
export const REVEAL_ROOT_MARGIN = '0px 0px -8% 0px';

/** True when the element already sits in the visible part of the viewport (the same area REVEAL_ROOT_MARGIN observes). */
export function isInReveal(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const visibleBottom = (typeof innerHeight === 'number' ? innerHeight : 0) * 0.92;
  return rect.height > 0 && rect.bottom > 0 && rect.top < visibleBottom;
}
