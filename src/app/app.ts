import { Component, DestroyRef, ElementRef, HostListener, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ThemeService } from './core/theme.service';
import { APP_LANGS, AppLang, LocaleService } from './core/locale.service';
import { ShortcutsService } from './core/shortcuts.service';
import { PwaService } from './core/pwa.service';
import { Icon, Kbd, Flag, Dialog, ToastHost, ConfirmHost, ToastService } from './ui';

export interface NavItem {
  path: string;
  key: string;
  icon: string;
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', key: 'home', icon: 'home' },
  { path: '/lv-cable-sizing', key: 'lv', icon: 'zap' },
  { path: '/power-network', key: 'power', icon: 'network' },
  { path: '/lightning-risk', key: 'lightning', icon: 'lightning' },
  { path: '/earthing', key: 'earthing', icon: 'ground', soon: true },
  { path: '/pue', key: 'pue', icon: 'gauge', soon: true },
];

const FLAG_BY_LANG: Record<AppLang, string> = { en: 'gb', nl: 'nl', de: 'de', fr: 'fr', es: 'es', it: 'it' };
const RAIL_PIN_KEY = 'et.rail.pinned';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, Icon, Kbd, Flag, Dialog, ToastHost, ConfirmHost],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly theme = inject(ThemeService);
  readonly locale = inject(LocaleService);
  readonly shortcuts = inject(ShortcutsService);
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly pwa = inject(PwaService);
  /** True for ~600ms after connectivity flips, drives the chip pulse. */
  readonly netPulse = signal(false);

  readonly nav = NAV_ITEMS;
  readonly langs = APP_LANGS;
  readonly helpVisible = signal(false);
  readonly langOpen = signal(false);
  readonly pinned = signal(localStorage.getItem(RAIL_PIN_KEY) === '1');
  readonly currentUrl = signal(this.router.url);
  readonly pulsing = signal<number | null>(null);
  private readonly langPop = viewChild<ElementRef<HTMLElement>>('langPop');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.langOpen.set(false);
      });

    this.shortcuts.commands.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => {
      if (c.id === 'help') this.helpVisible.update((v) => !v);
      if (c.id === 'nav' && c.index !== undefined) this.goIndex(c.index);
    });

    let prevOnline = this.pwa.online();
    effect(() => {
      const cur = this.pwa.online();
      if (cur === prevOnline) return;
      prevOnline = cur;
      untracked(() => {
        this.netPulse.set(true);
        setTimeout(() => this.netPulse.set(false), 600);
      });
    });

    if (this.updates?.isEnabled) {
      this.updates.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => {
          this.toast.add({
            severity: 'info',
            summary: 'Update ready',
            detail: 'Reload to use the new version.',
            sticky: true,
            action: { label: 'Reload', run: () => location.reload() },
          });
        });
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.langOpen()) {
      this.langOpen.set(false);
      return;
    }
    // Digit / letter shortcuts must not fire behind an open modal.
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
    this.shortcuts.handle(event);
  }

  @HostListener('document:pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (!this.langOpen()) return;
    const pop = this.langPop()?.nativeElement;
    if (pop && !pop.contains(event.target as Node)) this.langOpen.set(false);
  }

  goIndex(i: number): void {
    const item = this.nav[i];
    if (!item) return;
    this.pulsing.set(i);
    setTimeout(() => this.pulsing.set(null), 340);
    void this.router.navigateByUrl(item.path);
  }

  isActive(path: string): boolean {
    const url = this.currentUrl();
    return path === '/' ? url === '/' : url.startsWith(path);
  }

  activeIndex(): number {
    return Math.max(0, this.nav.findIndex((n) => this.isActive(n.path)));
  }

  flag(lang: string = this.locale.lang()): string {
    return FLAG_BY_LANG[lang as AppLang] ?? 'gb';
  }

  pickLang(lang: AppLang): void {
    this.locale.setLang(lang);
    this.langOpen.set(false);
  }

  async installApp(): Promise<void> {
    const result = await this.pwa.promptInstall();
    if (result === 'accepted') this.toast.success(this.transloco.translate('pwa.installOk'));
  }

  togglePin(): void {
    this.pinned.update((v) => !v);
    localStorage.setItem(RAIL_PIN_KEY, this.pinned() ? '1' : '0');
  }
}
