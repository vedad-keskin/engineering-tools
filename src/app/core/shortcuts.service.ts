import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ShortcutId = 'undo' | 'redo' | 'save' | 'help' | 'nav';

export interface ShortcutEvent {
  id: ShortcutId;
  /** 0-based navigation index for `nav` (key 1 → 0). */
  index?: number;
  event: KeyboardEvent;
}

/** Number of digit shortcuts handled (keys 1..NAV_KEYS). */
export const NAV_KEYS = 6;

@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  readonly commands = new Subject<ShortcutEvent>();

  handle(event: KeyboardEvent): void {
    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const typing = isTyping(event);

    if (!meta && !event.altKey && !typing && /^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      if (index < NAV_KEYS) {
        event.preventDefault();
        this.commands.next({ id: 'nav', index, event });
      }
      return;
    }
    if (key === '?' && !typing) {
      event.preventDefault();
      this.commands.next({ id: 'help', event });
      return;
    }
    if (meta && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.commands.next({ id: 'undo', event });
      return;
    }
    if (meta && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.commands.next({ id: 'redo', event });
      return;
    }
    if (meta && key === 's') {
      event.preventDefault();
      this.commands.next({ id: 'save', event });
    }
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}
