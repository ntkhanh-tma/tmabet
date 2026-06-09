import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { MatchesComponent } from './features/matches/matches.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: DashboardComponent },
  { path: 'matches', component: MatchesComponent },
  { path: '**', redirectTo: 'home' },
];
