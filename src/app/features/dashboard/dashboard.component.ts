import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardData, Match, BetRow } from '../../core/models/dashboard.model';
import { getCountryCode } from '../../core/utils/country-flags';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatChipsModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly auth = inject(AuthService);

  data: DashboardData | null = null;
  loading = true;

  ngOnInit(): void {
    this.sheetsService.getDashboardData().subscribe((d) => {
      this.data = d;
      this.loading = false;
    });
  }

  getStatusColor(status: Match['status']): string {
    return status === 'live' ? 'warn' : status === 'finished' ? 'accent' : 'primary';
  }

  getMaxPoints(): number {
    return this.data?.leaderboard[0]?.totalPoints ?? 1;
  }

  /** Returns true when this leaderboard entry belongs to the logged-in player. */
  isMe(playerName: string): boolean {
    const me = this.auth.username();
    return !!me && me.trim().toLowerCase() === playerName.trim().toLowerCase();
  }

  /** The bet row for the currently logged-in player, or null. */
  get myBet(): BetRow | null {
    const me = this.auth.username();
    if (!me || !this.data) return null;
    return (
      this.data.bets.find(
        (b) => b.playerName.trim().toLowerCase() === me.trim().toLowerCase()
      ) ?? null
    );
  }

  /** Columns shown in the bets table depend on which match picks are present in the data. */
  get betColumns(): string[] {
    const cols = ['player'];
    if (this.data?.betMatch1 || this.hasMatch1Bets) cols.push('match1');
    if (this.data?.betMatch2 || this.hasMatch2Bets) cols.push('match2');
    cols.push('modifier');
    return cols;
  }

  get hasMatch1Bets(): boolean {
    return this.data?.bets.some((b) => b.match1Bet) ?? false;
  }

  get hasMatch2Bets(): boolean {
    return this.data?.bets.some((b) => b.match2Bet) ?? false;
  }

  /** Returns true when the given match is one of the two current bet matches (I2/I3 or I4/I5). */
  isBetMatch(match: Match): boolean {
    if (!this.data) return false;
    return (
      (this.data.betMatch1 !== null && this.data.betMatch1.id === match.id) ||
      (this.data.betMatch2 !== null && this.data.betMatch2.id === match.id)
    );
  }

  getFlag(team: string): string {
    return getCountryCode(team) ?? 'un';
  }
}

