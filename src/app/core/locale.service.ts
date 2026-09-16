import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export const APP_LANGS = [
  { id: 'en', label: 'English', locale: 'en-GB' },
  { id: 'nl', label: 'Nederlands', locale: 'nl-NL' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE' },
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
  { id: 'es', label: 'Español', locale: 'es-ES' },
  { id: 'it', label: 'Italiano', locale: 'it-IT' },
] as const;

export type AppLang = (typeof APP_LANGS)[number]['id'];

const STORAGE_KEY = 'et.lang';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  readonly lang = signal<AppLang>(this.readStored());
  readonly locale = computed(() => APP_LANGS.find((l) => l.id === this.lang())?.locale ?? 'en-GB');

  constructor() {
    this.transloco.setActiveLang(this.lang());
    effect(() => {
      const lang = this.lang();
      this.transloco.setActiveLang(lang);
      this.document.documentElement.lang = lang;
      localStorage.setItem(STORAGE_KEY, lang);
    });
  }

  setLang(lang: AppLang): void {
    this.lang.set(lang);
  }

  formatNumber(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '–';
    return new Intl.NumberFormat(this.locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  formatDate(iso: string | Date): string {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(d);
  }

  private readStored(): AppLang {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (APP_LANGS.some((l) => l.id === stored)) return stored as AppLang;
    const nav = (navigator.language || 'en').slice(0, 2);
    if (APP_LANGS.some((l) => l.id === nav)) return nav as AppLang;
    return 'en';
  }
}
