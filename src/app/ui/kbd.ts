import { Component, input } from '@angular/core';

/** Keyboard key badge. `pulse` briefly highlights it (used when the shortcut fires). */
@Component({
  selector: 'app-kbd',
  template: `<kbd [class.pulse]="pulse()" [class.dark]="dark()"><ng-content /></kbd>`,
  styles: `
    :host { display: inline-flex; }
    kbd {
      display: inline-grid;
      place-items: center;
      min-width: 1.35rem;
      height: 1.35rem;
      padding: 0 0.3rem;
      font-family: var(--et-mono);
      font-size: 0.68rem;
      font-weight: 600;
      line-height: 1;
      color: var(--et-ink-soft);
      background: var(--et-surface-2);
      border: 1px solid var(--et-border-strong);
      border-bottom-width: 2px;
      border-radius: 5px;
      transition: transform var(--dur-1) var(--ease), background var(--dur-1) var(--ease),
        color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
    }
    kbd.dark {
      color: #9fb3cc;
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
    }
    kbd.pulse {
      animation: kbd-pulse 320ms var(--ease);
    }
    @keyframes kbd-pulse {
      0% { transform: translateY(0); background: var(--et-accent); color: #fff; border-color: var(--et-accent); }
      40% { transform: translateY(1px) scale(0.92); }
      100% { transform: translateY(0); }
    }
  `,
})
export class Kbd {
  readonly pulse = input(false);
  readonly dark = input(false);
}
