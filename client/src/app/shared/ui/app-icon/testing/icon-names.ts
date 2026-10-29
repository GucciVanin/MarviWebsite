import type { DebugElement } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppIcon } from '../app-icon';
import type { IconName } from '../icons';

/** The names of the `<app-icon>`s inside the first element matching `selector` (the whole fixture when omitted), in order. */
export function iconNames(fixture: ComponentFixture<unknown>, selector?: string): IconName[] {
  const root: DebugElement | null = selector ? fixture.debugElement.query(By.css(selector)) : fixture.debugElement;
  if (!root) {
    throw new Error(`no element matches "${selector}"`);
  }
  return root.queryAll(By.directive(AppIcon)).map((icon) => (icon.componentInstance as AppIcon).name());
}
