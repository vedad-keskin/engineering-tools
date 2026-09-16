import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'et.theme.mode';

/**
 * Day / night theme. On first start the mode follows the OS preference and keeps
 * following it until the user toggles explicitly, at which point the choice is stored.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly stored = signal<ThemeMode | null>(this.readStored());
  readonly mode = signal<ThemeMode>(this.stored() ?? (this.mq?.matches ? 'dark' : 'light'));
  readonly isDark = () => this.mode() === 'dark';

  constructor() {
    effect(() => {
      this.document.documentElement.classList.toggle('app-dark', this.mode() === 'dark');
    });
    this.mq?.addEventListener('change', (e) => {
      if (this.stored() === null) this.mode.set(e.matches ? 'dark' : 'light');
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    this.stored.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  toggle(): void {
    this.setMode(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private readStored(): ThemeMode | null {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  }
}
