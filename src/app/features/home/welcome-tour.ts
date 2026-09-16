import { Component, ElementRef, HostListener, afterNextRender, inject, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PwaService } from '../../core/pwa.service';
import { Button, Icon, Kbd } from '../../ui';

export const TOUR_STORAGE_KEY = 'et.tour.v1';

/** True when the first-run tour has not been completed or skipped on this device. */
export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    /* storage unavailable: tour simply shows again next visit */
  }
}

const STEPS = ['welcome', 'privacy', 'keys', 'go'] as const;

@Component({
  selector: 'app-welcome-tour',
  imports: [TranslocoPipe, Button, Icon, Kbd],
  template: `
    <div class="scrim" (click)="skip()"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" (click)="$event.stopPropagation()">
      <button type="button" class="skip" (click)="skip()">{{ 'tour.skip' | transloco }}</button>

      @switch (stepId()) {
        @case ('welcome') {
          <div class="body" [attr.data-step]="step()">
            <img src="logo-192.png" width="72" height="72" alt="" class="logo" />
            <h2 id="tour-title">{{ 'tour.welcome.title' | transloco }}</h2>
            <p>{{ 'tour.welcome.body' | transloco }}</p>
          </div>
        }
        @case ('privacy') {
          <div class="body" [attr.data-step]="step()">
            <div class="glyph"><app-icon name="shield" [size]="30" /></div>
            <h2 id="tour-title">{{ 'tour.privacy.title' | transloco }}</h2>
            <p>{{ 'tour.privacy.body' | transloco }}</p>
            <span class="net" [class.off]="!pwa.online()">
              <app-icon [name]="pwa.online() ? 'wifi' : 'wifi_off'" [size]="13" />
              {{ (pwa.online() ? 'tour.privacy.onlineNow' : 'tour.privacy.offlineNow') | transloco }}
            </span>
          </div>
        }
        @case ('keys') {
          <div class="body" [attr.data-step]="step()">
            <div class="keys">
              @for (k of keys; track k) {
                <app-kbd>{{ k }}</app-kbd>
              }
              <span class="sep"></span>
              <app-kbd>?</app-kbd>
            </div>
            <h2 id="tour-title">{{ 'tour.keys.title' | transloco }}</h2>
            <p>{{ 'tour.keys.body' | transloco }}</p>
          </div>
        }
        @case ('go') {
          <div class="body" [attr.data-step]="step()">
            <div class="glyph"><app-icon name="zap" [size]="30" /></div>
            <h2 id="tour-title">{{ 'tour.go.title' | transloco }}</h2>
            <p>{{ 'tour.go.body' | transloco }}</p>
          </div>
        }
      }

      <footer>
        <div class="dots" role="tablist" [attr.aria-label]="'tour.progress' | transloco">
          @for (s of steps; track s; let i = $index) {
            <button
              type="button"
              class="dot"
              role="tab"
              [class.on]="i === step()"
              [class.done]="i < step()"
              [attr.aria-selected]="i === step()"
              [attr.aria-label]="i + 1"
              (click)="step.set(i)"
            ></button>
          }
        </div>
        <div class="actions">
          @if (step() > 0) {
            <app-button variant="ghost" [label]="'common.back' | transloco" (clicked)="prev()" />
          }
          @if (isLast()) {
            <app-button variant="primary" icon="arrow_right" [label]="'tour.start' | transloco" (clicked)="finish()" />
          } @else {
            <app-button variant="primary" [label]="'common.next' | transloco" (clicked)="next()" />
          }
        </div>
      </footer>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: rgba(6, 14, 28, 0.55);
      backdrop-filter: blur(2px);
      animation: fade-in var(--dur-2) var(--ease);
    }
    .tour-card {
      position: relative;
      width: min(100%, 26rem);
      background: var(--et-surface);
      border-radius: 16px;
      box-shadow: 0 24px 70px rgba(4, 12, 26, 0.35), 0 0 0 1px var(--et-border);
      overflow: hidden;
      animation: tour-in var(--dur-2) var(--ease);
    }
    .skip {
      position: absolute;
      top: 0.8rem;
      right: 0.9rem;
      border: 0;
      background: transparent;
      color: var(--et-ink-faint);
      font: inherit;
      font-size: 0.74rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.25rem 0.4rem;
      border-radius: 6px;
    }
    .skip:hover { color: var(--et-ink); background: var(--et-surface-2); }
    .skip:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--et-accent-soft); }

    .body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.6rem;
      padding: 2.4rem 1.75rem 1.5rem;
      min-height: 15.5rem;
      animation: tour-in var(--dur-2) var(--ease);
    }
    .logo { border-radius: 16px; }
    .glyph {
      display: grid;
      place-items: center;
      width: 3.6rem;
      height: 3.6rem;
      border-radius: 14px;
      background: var(--et-accent-soft);
      color: var(--et-accent);
    }
    h2 { margin: 0.4rem 0 0; font-size: 1.15rem; letter-spacing: -0.01em; color: var(--et-ink); }
    p { margin: 0; font-size: 0.86rem; line-height: 1.55; color: var(--et-ink-soft); max-width: 22rem; }

    .net {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 0.3rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 650;
      color: var(--et-ok);
      background: var(--et-ok-bg);
      border: 1px solid var(--et-ok-border);
    }
    .net.off { color: var(--et-warn); background: var(--et-warn-bg); border-color: var(--et-warn-border); }

    .keys { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.3rem; }
    .keys app-kbd { transform: scale(1.35); margin: 0 0.2rem; }
    .sep { width: 1px; height: 1.2rem; background: var(--et-border-strong); margin: 0 0.5rem; }

    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.85rem 1.25rem;
      border-top: 1px solid var(--et-border);
      background: var(--et-surface-2);
    }
    .dots { display: flex; gap: 0.4rem; }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--et-border-strong);
      cursor: pointer;
      transition: width var(--dur-2) var(--ease), background var(--dur-2) var(--ease);
    }
    .dot.done { background: var(--et-accent-glow); }
    .dot.on { width: 1.35rem; background: var(--et-accent); }
    .dot:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--et-accent-soft); }
    .actions { display: flex; gap: 0.4rem; }

    @keyframes tour-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .scrim, .tour-card, .body { animation: none; }
    }
  `,
})
export class WelcomeTour {
  readonly pwa = inject(PwaService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly closed = output<void>();

  readonly steps = STEPS;
  readonly keys = [1, 2, 3, 4, 5, 6];
  readonly step = signal(0);

  constructor() {
    afterNextRender(() => this.focusPrimary());
  }

  stepId(): (typeof STEPS)[number] {
    return STEPS[this.step()];
  }

  isLast(): boolean {
    return this.step() === STEPS.length - 1;
  }

  next(): void {
    if (this.isLast()) return this.finish();
    this.step.update((s) => s + 1);
    this.focusPrimary();
  }

  prev(): void {
    this.step.update((s) => Math.max(0, s - 1));
  }

  skip(): void {
    this.finish();
  }

  finish(): void {
    markTourSeen();
    this.closed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.skip();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.closest('button, a')) return;
      this.next();
    } else if (e.key === 'ArrowLeft') {
      this.prev();
    }
  }

  private focusPrimary(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.actions .primary')?.focus());
  }
}
