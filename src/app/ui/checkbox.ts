import { Component, input, model } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-checkbox',
  imports: [Icon],
  template: `
    <label class="cb" [class.on]="checked()">
      <input type="checkbox" [checked]="checked()" (change)="checked.set($any($event.target).checked)" />
      <span class="box"><app-icon name="check" [size]="12" [stroke]="3" /></span>
      @if (label()) {
        <span class="lbl">{{ label() }}</span>
      }
    </label>
  `,
  styles: `
    :host { display: block; }
    .cb {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      cursor: pointer;
      padding: 0.45rem 0.55rem;
      border-radius: 7px;
      font-size: 0.86rem;
      transition: background var(--dur-1) var(--ease);
      user-select: none;
    }
    .cb:hover { background: var(--et-surface-2); }
    input { position: absolute; opacity: 0; width: 0; height: 0; }
    .box {
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 4px;
      border: 1.5px solid var(--et-border-strong);
      background: var(--et-surface);
      display: grid;
      place-items: center;
      color: #fff;
      transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
    }
    .box app-icon { opacity: 0; transform: scale(0.6); transition: opacity var(--dur-1) var(--ease), transform var(--dur-1) var(--ease); }
    .cb.on .box { background: var(--et-accent); border-color: var(--et-accent); }
    .cb.on .box app-icon { opacity: 1; transform: none; }
    input:focus-visible + .box { box-shadow: 0 0 0 3px var(--et-accent-soft); }
  `,
})
export class Checkbox {
  readonly checked = model(false);
  readonly label = input('');
}
