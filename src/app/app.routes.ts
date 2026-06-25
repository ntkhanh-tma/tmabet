import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { MatchesComponent } from './features/matches/matches.component';
import { ResultsComponent } from './features/results/results.component';
import { OrderComponent } from './features/order/order.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'matches', component: MatchesComponent },
  { path: 'results', component: ResultsComponent },
  { path: 'order', component: OrderComponent },
  { path: '**', redirectTo: '' },
];
