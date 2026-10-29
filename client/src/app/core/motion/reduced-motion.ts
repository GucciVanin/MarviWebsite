/** True when the visitor asked the system for less motion. False where matchMedia does not exist (tests, old engines). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
