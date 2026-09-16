import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../ui';

@Component({
  selector: 'app-coming-soon-page',
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="soon">
      <div class="orbit">
        <img src="logo-128.png" width="64" height="64" alt="" />
        <span class="ring"></span>
      </div>
      <span class="badge warn">{{ 'home.soon' | transloco }}</span>
      <h1>{{ ('comingSoon.' + tool() + '.title') | transloco }}</h1>
      <p>{{ ('comingSoon.' + tool() + '.body') | transloco }}</p>
      <a routerLink="/" class="back">
        <app-icon name="chevron-right" [size]="15" class="flip" />
        {{ 'nav.home' | transloco }}
        <kbd>1</kbd>
      </a>
    </div>
  `,
  styles: `
    .soon {
      max-width: 34rem;
      margin: 4rem auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      animation: soon-in 320ms var(--ease);
    }
    .orbit { position: relative; width: 96px; height: 96px; display: grid; place-items: center; margin-bottom: 0.5rem; }
    .orbit img { position: relative; opacity: 0.85; filter: grayscale(0.35); }
    .ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 1.5px dashed var(--et-border-strong);
      animation: spin 24s linear infinite;
    }
    h1 { font-size: 1.35rem; }
    p { margin: 0; color: var(--et-ink-soft); line-height: 1.5; max-width: 40ch; }
    .back {
      margin-top: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      text-decoration: none;
      font-weight: 650;
      color: var(--et-accent);
      padding: 0.5rem 0.9rem;
      border-radius: 8px;
      border: 1px solid var(--et-border);
      background: var(--et-surface);
      transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
    }
    .back:hover { background: var(--et-accent-soft); border-color: var(--et-accent); }
    .flip { transform: rotate(180deg); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes soon-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  `,
})
export class ComingSoonPage {
  private readonly route = inject(ActivatedRoute);
  readonly tool = toSignal(this.route.data.pipe(map((d) => String(d['tool'] ?? 'earthing'))), {
    initialValue: 'earthing',
  });
}
