import { AfterViewInit, Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-category-chart',
  template: `<canvas #canvas aria-label="Demand by category"></canvas>`,
  styles: `:host { display: block; max-width: 22rem; margin: 1rem auto; }`,
})
export class CategoryChart implements AfterViewInit {
  readonly critical = input(0);
  readonly essential = input(0);
  readonly nonEssential = input(0);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      this.critical();
      this.essential();
      this.nonEssential();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.render();
  }

  private render(): void {
    const el = this.canvas()?.nativeElement;
    if (!el) return;
    const data = [this.critical(), this.essential(), this.nonEssential()];
    if (this.chart) {
      this.chart.data.datasets[0].data = data;
      this.chart.update();
      return;
    }
    this.chart = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'Essential', 'Non-essential'],
        datasets: [{ data, backgroundColor: ['#0f5fc9', '#0f9d8a', '#8b95a3'], borderWidth: 0, hoverOffset: 6 }],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, color: '#8b95a3', font: { family: 'Inter', size: 12 } },
          },
        },
      },
    });
  }
}
