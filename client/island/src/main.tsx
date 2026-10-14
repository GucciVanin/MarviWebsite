import { createRoot, type Root } from 'react-dom/client';
import { Ribbons } from './Ribbons';

/**
 * <marvi-ribbons>: the hero's animated ribbons. The Angular page ships the static SVG as this element's content; when
 * this script loads and the element is defined, React takes the element over and draws the animated version in its place.
 */
class MarviRibbons extends HTMLElement {
  private root?: Root;

  connectedCallback(): void {
    this.root = createRoot(this);
    this.root.render(<Ribbons />);
  }

  disconnectedCallback(): void {
    this.root?.unmount();
    this.root = undefined;
  }
}

if (!customElements.get('marvi-ribbons')) {
  customElements.define('marvi-ribbons', MarviRibbons);
}
