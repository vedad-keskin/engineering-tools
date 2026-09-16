import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  confirm(opts: ConfirmOptions): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise<boolean>((resolve) => this.pending.set({ ...opts, resolve }));
  }

  answer(ok: boolean): void {
    const p = this.pending();
    this.pending.set(null);
    p?.resolve(ok);
  }
}
