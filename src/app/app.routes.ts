import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'lv-cable-sizing',
    loadComponent: () => import('./features/lv-cable-sizing/lv-cable.page').then((m) => m.LvCablePage),
  },
  {
    path: 'power-network',
    loadComponent: () => import('./features/power-network/power-network.page').then((m) => m.PowerNetworkPage),
  },
  {
    path: 'lightning-risk',
    loadComponent: () =>
      import('./features/lightning-risk/lightning-risk.page').then((m) => m.LightningRiskPage),
  },
  {
    path: 'earthing',
    loadComponent: () => import('./features/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { tool: 'earthing' },
  },
  {
    path: 'pue',
    loadComponent: () => import('./features/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    data: { tool: 'pue' },
  },
  { path: '**', redirectTo: '' },
];
