import { Component, useEffect, useRef, type ReactNode } from 'react';

// Same geometry as the static SVG the Angular page ships as its fallback (viewBox 0 0 400 200).
const WIDTH = 400;
const HEIGHT = 200;
const STEP = 16;

interface Ribbon {
  color: string;
  /** Height of the ribbon's top edge at the left and at the right end. */
  from: number;
  to: number;
  amplitude: number;
  phase: number;
}

const RIBBONS: Ribbon[] = [
  { color: '#f5b700', from: 40, to: 190, amplitude: 9, phase: 0 },
  { color: '#d8202f', from: 80, to: 196, amplitude: 7, phase: 1.6 },
  { color: '#1f3fa8', from: 125, to: 199, amplitude: 5, phase: 3.1 },
];

/** The ribbon's outline at animation time `t` seconds: a descending swoosh with a gentle wave that fades to the right. */
export function ribbonPath(ribbon: Ribbon, t: number): string {
  const points: string[] = [];
  for (let x = 0; x <= WIDTH; x += STEP) {
    const along = x / WIDTH;
    const base = ribbon.from + (ribbon.to - ribbon.from) * (1 - Math.pow(1 - along, 2.2));
    const wave = Math.sin(along * 7 + t * 0.9 + ribbon.phase) * ribbon.amplitude * (1 - along);
    points.push(`L${x} ${(base + wave).toFixed(1)}`);
  }
  return `M0 ${HEIGHT} ${points.join(' ')} L${WIDTH} ${HEIGHT} Z`;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The ribbons at rest: what is shown with reduced motion, and what an error falls back to. */
export function StaticRibbons() {
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {RIBBONS.map((ribbon) => (
        <path key={ribbon.color} d={ribbonPath(ribbon, 0)} fill={ribbon.color} />
      ))}
    </svg>
  );
}

function AnimatedRibbons() {
  const svg = useRef<SVGSVGElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    if (reducedMotion()) {
      return;
    }
    let frame = 0;
    let running = true;
    let visible = true;
    const start = performance.now();

    const tick = (now: number) => {
      if (!running) {
        return;
      }
      if (visible && !document.hidden) {
        const t = (now - start) / 1000;
        RIBBONS.forEach((ribbon, i) => paths.current[i]?.setAttribute('d', ribbonPath(ribbon, t)));
      }
      frame = requestAnimationFrame(tick);
    };

    // Stop drawing while the hero is scrolled out of view.
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
          })
        : null;
    if (svg.current) {
      observer?.observe(svg.current);
    }

    frame = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return (
    <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {RIBBONS.map((ribbon, i) => (
        <path
          key={ribbon.color}
          ref={(element) => {
            paths.current[i] = element;
          }}
          d={ribbonPath(ribbon, 0)}
          fill={ribbon.color}
        />
      ))}
    </svg>
  );
}

/** If anything in the animation throws, show the ribbons at rest instead of a hole in the hero. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <StaticRibbons /> : this.props.children;
  }
}

export function Ribbons() {
  return <Boundary>{reducedMotion() ? <StaticRibbons /> : <AnimatedRibbons />}</Boundary>;
}
