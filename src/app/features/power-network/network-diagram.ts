import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import type { PowerNode, PowerState, PowerSystem } from './engine/data';
import { dgBounds, dgIsBoard, dgLayout, dgRouteLink, dgTerminals } from './engine/geometry';
import { downloadPng, downloadSvg } from '../../core/export/svg-png';
import { Button } from '../../ui/button';

@Component({
  selector: 'app-network-diagram',
  template: `
    <div class="toolbar-row" style="margin-bottom:.6rem">
      <app-button size="sm" icon="refresh" label="Relayout" (clicked)="relayout.emit()" />
      <app-button size="sm" icon="search" label="Fit" (clicked)="fit()" />
      <span class="sep"></span>
      <app-button size="sm" icon="plus" title="Zoom in" (clicked)="zoomBy(1.15)" />
      <app-button size="sm" label="−" title="Zoom out" (clicked)="zoomBy(1/1.15)" />
      <span class="sep"></span>
      <app-button size="sm" icon="download" label="SVG" (clicked)="exportSvg()" />
      <app-button size="sm" icon="download" label="PNG" (clicked)="exportPng()" />
    </div>
    <div class="diagram-canvas" (wheel)="onWheel($event)" (pointerdown)="onPanStart($event)" (pointermove)="onPanMove($event)" (pointerup)="onPanEnd()">
      <svg #svgEl [attr.viewBox]="viewBox()" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        <g [attr.transform]="'translate(' + panX() + ' ' + panY() + ') scale(' + zoom() + ')'">
          @for (link of links(); track link.id) {
            <path [attr.d]="link.d" fill="none" [attr.stroke]="link.redundant ? '#b26a00' : '#7a8b97'" [attr.stroke-dasharray]="link.redundant ? '6 4' : null" stroke-width="1.6" />
            @if (link.label) {
              <text [attr.x]="link.lx" [attr.y]="link.ly" font-size="10" fill="currentColor" opacity="0.7">{{ link.label }}</text>
            }
          }
          @for (node of nodes(); track node.id) {
            <g [attr.transform]="'translate(' + (node.x || 0) + ' ' + (node.y || 0) + ')'" (pointerdown)="onNodeDown($event, node)" style="cursor:grab">
              @if (isBoard(node)) {
                <rect [attr.x]="-busHalf(node)" y="-4" [attr.width]="busWidth(node)" height="8" rx="2" [attr.fill]="colorOf(node)" />
              } @else if (node.type === 'load') {
                <rect x="-13" y="-13" width="26" height="26" [attr.fill]="colorOf(node)" stroke="currentColor" stroke-width="1.2" />
              } @else if (node.type === 'transformer') {
                <circle cy="-10" r="12" fill="none" stroke="currentColor" stroke-width="2.2" />
                <circle cy="10" r="12" fill="none" stroke="currentColor" stroke-width="2.2" />
              } @else {
                <rect x="-22" y="-16" width="44" height="32" rx="6" [attr.fill]="colorOf(node)" stroke="currentColor" stroke-width="1.4" />
              }
              <text y="28" text-anchor="middle" font-size="11" fill="currentColor">{{ node.tag || node.name }}</text>
            </g>
          }
        </g>
      </svg>
    </div>
  `,
  styles: `
    :host { display: block; }
    svg text { font-family: var(--et-sans); }
    svg { color: var(--et-ink); }
    .diagram-canvas { background-color: var(--et-surface); }
  `,
  imports: [Button],
})
export class NetworkDiagramComponent {
  readonly state = input.required<PowerState>();
  readonly nodeChange = output<PowerNode>();
  readonly relayout = output<void>();
  private readonly svgEl = viewChild<ElementRef<SVGSVGElement>>('svgEl');

  readonly zoom = computed(() => this.state().diagram.zoom || 1);
  readonly panX = computed(() => this.state().diagram.panX || 0);
  readonly panY = computed(() => this.state().diagram.panY || 0);
  readonly nodes = computed(() => this.state().nodes);

  readonly viewBox = computed(() => {
    const nodes = this.nodes();
    if (!nodes.length) return '0 0 1200 800';
    const xs = nodes.map((n) => n.x || 0);
    const ys = nodes.map((n) => n.y || 0);
    const minX = Math.min(...xs) - 80;
    const minY = Math.min(...ys) - 80;
    const maxX = Math.max(...xs) + 80;
    const maxY = Math.max(...ys) + 80;
    return `${minX} ${minY} ${Math.max(400, maxX - minX)} ${Math.max(300, maxY - minY)}`;
  });

  readonly links = computed(() => {
    const nodes = this.nodes();
    const out: { id: string; d: string; redundant: boolean; label?: string; lx: number; ly: number }[] = [];
    for (const n of nodes) {
      if (n.parentId != null) {
        const p = nodes.find((x) => x.id === n.parentId);
        if (p) out.push(this.buildLink(p, n, false));
      }
      if (n.redundantParentId != null) {
        const p = nodes.find((x) => x.id === n.redundantParentId);
        if (p) out.push(this.buildLink(p, n, true));
      }
    }
    return out;
  });

  private dragging: { id: number; dx: number; dy: number } | null = null;
  private panning: { x: number; y: number; px: number; py: number } | null = null;

  isBoard(node: PowerNode): boolean {
    return dgIsBoard(node.type);
  }

  busWidth(node: PowerNode): number {
    return Math.max(64, node.busLen || 64);
  }

  busHalf(node: PowerNode): number {
    return this.busWidth(node) / 2;
  }

  colorOf(node: PowerNode): string {
    const sys: PowerSystem | undefined = this.state().systems.find((s) => s.id === node.systemId);
    return sys?.color || '#0f5fc9';
  }

  onNodeDown(event: PointerEvent, node: PowerNode): void {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging = { id: node.id, dx: event.clientX - (node.x || 0), dy: event.clientY - (node.y || 0) };
  }

  onPanStart(event: PointerEvent): void {
    if (this.dragging) return;
    this.panning = { x: this.panX(), y: this.panY(), px: event.clientX, py: event.clientY };
  }

  onPanMove(event: PointerEvent): void {
    if (this.dragging) {
      const node = this.nodes().find((n) => n.id === this.dragging!.id);
      if (!node) return;
      this.nodeChange.emit({
        ...node,
        x: event.clientX - this.dragging.dx,
        y: event.clientY - this.dragging.dy,
      });
      return;
    }
    if (this.panning) {
      const dx = event.clientX - this.panning.px;
      const dy = event.clientY - this.panning.py;
      this.patchDiagram({ panX: this.panning.x + dx, panY: this.panning.y + dy });
    }
  }

  onPanEnd(): void {
    this.dragging = null;
    this.panning = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
  }

  zoomBy(factor: number): void {
    this.patchDiagram({ zoom: Math.min(2.4, Math.max(0.25, this.zoom() * factor)) });
  }

  fit(): void {
    this.patchDiagram({ zoom: 1, panX: 0, panY: 0 });
  }

  exportSvg(): void {
    const svg = this.svgEl()?.nativeElement;
    if (svg) downloadSvg(svg, 'network-diagram');
  }

  exportPng(): void {
    const svg = this.svgEl()?.nativeElement;
    if (svg) void downloadPng(svg, 'network-diagram');
  }

  ensureLayout(): void {
    const s = this.state();
    if (!s.diagram.laidOut && s.nodes.length) dgLayout(s.nodes, s.systems, true);
  }

  private patchDiagram(partial: Partial<PowerState['diagram']>): void {
    const s = this.state();
    Object.assign(s.diagram, partial);
  }

  private buildLink(parent: PowerNode, child: PowerNode, redundant: boolean) {
    const pt = this.terminalPoint(parent, 'out');
    const ct = this.terminalPoint(child, 'in');
    const segs = dgRouteLink(`${parent.id}-${child.id}-${redundant ? 'r' : 'p'}`, pt, ct, 'top');
    const d = segs
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`)
      .join(' ');
    return {
      id: `${parent.id}-${child.id}-${redundant ? 'r' : 'p'}`,
      d,
      redundant,
      label: redundant ? 'R' : 'P',
      lx: (pt.x + ct.x) / 2,
      ly: (pt.y + ct.y) / 2 - 6,
    };
  }

  private terminalPoint(node: PowerNode, dir: 'in' | 'out'): { x: number; y: number } {
    const terms = dgTerminals(node.type).filter((t) => t.dir === dir);
    const t = terms[0];
    const b = dgBounds(node);
    const x = (node.x || 0) + (t?.x ?? 0);
    const y = (node.y || 0) + (t?.y ?? (dir === 'out' ? b.ht : -b.ht));
    return { x, y };
  }
}
