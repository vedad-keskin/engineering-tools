import { Injectable, signal } from '@angular/core';

/** Chromium-only event; typed here because it is not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallResult = 'accepted' | 'dismissed' | 'unavailable';

/** Live connectivity + install state for the PWA shell chips. */
@Injectable({ providedIn: 'root' })
export class PwaService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly canInstall = signal(false);
  readonly installed = signal(detectStandalone());
  private deferred: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
      this.installed.set(true);
    });
    globalThis.matchMedia?.('(display-mode: standalone)').addEventListener('change', (e) => {
      if (e.matches) this.installed.set(true);
    });
  }

  async promptInstall(): Promise<InstallResult> {
    const ev = this.deferred;
    if (!ev) return 'unavailable';
    this.deferred = null;
    this.canInstall.set(false);
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'dismissed') {
      // Browser may fire beforeinstallprompt again later; until then keep the chip hidden.
      return 'dismissed';
    }
    this.installed.set(true);
    return 'accepted';
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return globalThis.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}
