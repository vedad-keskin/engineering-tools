import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PrintService {
  printHtml(title: string, innerHtml: string): void {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Inter, Segoe UI, system-ui, sans-serif; color: #1a2229; margin: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #d5dde5; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d5dde5; padding: 4px 6px; text-align: left; }
  th { background: #eef2f5; }
  .meta { color: #5b6675; font-size: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 12px; }
  .ok { color: #0f7a3d; font-weight: 600; }
  .fail { color: #b3241c; font-weight: 600; }
  .warn { color: #b26a00; font-weight: 600; }
  .page { page-break-after: always; }
  svg { max-width: 100%; height: auto; }
  @media print { body { margin: 12mm; } }
</style></head><body>${innerHtml}</body></html>`);
    doc.close();
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    };
  }
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
