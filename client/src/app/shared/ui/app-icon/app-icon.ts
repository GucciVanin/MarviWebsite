import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ICONS, type IconName } from './icons';

/**
 * `<app-icon name="mail" />` draws an icon in the current text colour at the current font size (1em), or at `size`
 * (any CSS length). It is decorative (hidden from screen readers) unless a `label` is given, which makes it an image
 * with that accessible name. Icon-only controls should put the name on the control instead and keep the icon decorative.
 */
@Component({
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  host: {
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[style.--icon-size]': 'size()',
  },
  template: '<svg [lucideIcon]="data()" />',
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--icon-size, 1em);
      height: var(--icon-size, 1em);
      vertical-align: -0.125em;
    }
    // Opt in with class="icon-filled" (e.g. a rating star): the shape is filled with the text colour.
    :host(.icon-filled) svg {
      fill: currentColor;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class AppIcon {
  readonly name = input.required<IconName>();
  readonly label = input<string>('');
  readonly size = input<string | null>(null);

  protected readonly data = computed(() => ICONS[this.name()]);
}
