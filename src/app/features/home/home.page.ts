import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { StatusBadge } from '../../shared/status-badge';
import { EmptyState } from '../../shared/empty-state';
import { ProjectRepository, type ProjectMeta, type ToolId } from '../../core/storage/project-repository';
import { LocaleService } from '../../core/locale.service';
import { Button, ConfirmService, Icon, Kbd, ToastService } from '../../ui';
import { WelcomeTour, shouldShowTour } from './welcome-tour';

interface ToolCard {
  path: string;
  key: string;
  standard: string;
  status: 'ok' | 'warn';
  icon: string;
  tone: string;
  keyNo: number;
}

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TranslocoPipe, StatusBadge, EmptyState, Button, Icon, Kbd, WelcomeTour],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class HomePage implements OnInit {
  private readonly repo = inject(ProjectRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly locale = inject(LocaleService);
  readonly recent = signal<ProjectMeta[]>([]);
  readonly tourOpen = signal(false);

  readonly tools: ToolCard[] = [
    { path: '/lv-cable-sizing', key: 'lv', standard: 'IEC 60364', status: 'ok', icon: 'zap', tone: '#0f5fc9', keyNo: 2 },
    { path: '/power-network', key: 'power', standard: 'Capacity + SLD', status: 'ok', icon: 'network', tone: '#0f9d8a', keyNo: 3 },
    { path: '/lightning-risk', key: 'lightning', standard: 'IEC 62305-2', status: 'ok', icon: 'lightning', tone: '#c9700f', keyNo: 4 },
    { path: '/earthing', key: 'earthing', standard: 'IEC 60364-5-54', status: 'warn', icon: 'ground', tone: '#6b7a90', keyNo: 5 },
    { path: '/pue', key: 'pue', standard: 'ISO/IEC 30134-2', status: 'warn', icon: 'gauge', tone: '#6b7a90', keyNo: 6 },
  ];

  readonly availableCount = this.tools.filter((t) => t.status === 'ok').length;
  readonly projectCount = computed(() => this.recent().length);

  ngOnInit(): void {
    void this.refresh();
    // Let the hero paint before the first-run tour dims the page.
    if (shouldShowTour()) setTimeout(() => this.tourOpen.set(true), 300);
  }

  async refresh(): Promise<void> {
    this.recent.set(await this.repo.list());
  }

  fmtDate(ts: number): string {
    return this.locale.formatDate(new Date(ts));
  }

  openPath(meta: ProjectMeta): string {
    return '/' + meta.toolId;
  }

  toolIcon(toolId: ToolId): string {
    return this.tools.find((t) => t.path === '/' + toolId)?.icon ?? 'folder';
  }

  toolKey(toolId: ToolId): string {
    return this.tools.find((t) => t.path === '/' + toolId)?.key ?? 'lv';
  }

  async duplicate(meta: ProjectMeta): Promise<void> {
    await this.repo.duplicate(meta.id);
    await this.refresh();
    this.toast.success(this.transloco.translate('common.duplicate'), meta.name);
  }

  async remove(meta: ProjectMeta): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.transloco.translate('home.deleteProject'),
      body: `${meta.name} · ${this.transloco.translate('home.deleteBody')}`,
      confirmLabel: this.transloco.translate('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await this.repo.delete(meta.id);
    await this.refresh();
  }
}
