import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Simplified 3:2 country flags as inline SVG (viewBox 0 0 60 40). */
const FLAGS: Record<string, string> = {
  gb: `<rect width="60" height="40" fill="#012169"/>
<path d="M0 0 60 40M60 0 0 40" stroke="#fff" stroke-width="8"/>
<path d="M0 0 60 40M60 0 0 40" stroke="#C8102E" stroke-width="4"/>
<path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/>
<path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="7"/>`,
  nl: `<rect width="60" height="40" fill="#21468B"/><rect width="60" height="26.7" fill="#fff"/><rect width="60" height="13.3" fill="#AE1C28"/>`,
  de: `<rect width="60" height="40" fill="#FFCE00"/><rect width="60" height="26.7" fill="#DD0000"/><rect width="60" height="13.3" fill="#000"/>`,
  fr: `<rect width="60" height="40" fill="#ED2939"/><rect width="40" height="40" fill="#fff"/><rect width="20" height="40" fill="#002395"/>`,
  es: `<rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/>`,
  it: `<rect width="60" height="40" fill="#CE2B37"/><rect width="40" height="40" fill="#fff"/><rect width="20" height="40" fill="#009246"/>`,
};

@Component({
  selector: 'app-flag',
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" [attr.width]="size()" [attr.height]="size() * 2 / 3" aria-hidden="true" [innerHTML]="markup()"></svg>
  `,
  styles: `
    :host { display: inline-flex; line-height: 0; flex: none; }
    svg { border-radius: 3px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12); }
  `,
})
export class Flag {
  private readonly sanitizer = inject(DomSanitizer);
  readonly code = input.required<string>();
  readonly size = input(24);
  readonly markup = computed(() => this.sanitizer.bypassSecurityTrustHtml(FLAGS[this.code()] ?? ''));
}
