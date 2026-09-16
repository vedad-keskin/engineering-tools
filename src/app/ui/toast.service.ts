import { Injectable, signal } from '@angular/core';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

export interface ToastMessage {
  id: number;
  severity: ToastSeverity;
  summary: string;
  detail?: string;
  sticky?: boolean;
  action?: { label: string; run: () => void };
}

export type ToastInput = Omit<ToastMessage, 'id'>;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<ToastMessage[]>([]);

  add(msg: ToastInput): number {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { ...msg, id }]);
    if (!msg.sticky) setTimeout(() => this.dismiss(id), msg.severity === 'error' ? 6000 : 3800);
    return id;
  }

  success(summary: string, detail?: string): void {
    this.add({ severity: 'success', summary, detail });
  }
  info(summary: string, detail?: string): void {
    this.add({ severity: 'info', summary, detail });
  }
  warn(summary: string, detail?: string): void {
    this.add({ severity: 'warn', summary, detail });
  }
  error(summary: string, detail?: string): void {
    this.add({ severity: 'error', summary, detail });
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
