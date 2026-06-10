import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AuthService } from '../../core/services/auth.service';
import { BetService } from '../../core/services/bet.service';
import { BetStateService } from '../../core/services/bet-state.service';
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
    MatProgressSpinnerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly betService = inject(BetService);
  private readonly betState = inject(BetStateService);
  readonly auth = inject(AuthService);

  data: DashboardData | null = null;
  loading = true;

  /** Which slot (1|2) is currently submitting. null = none. */
  readonly submitting = signal<1 | 2 | null>(null);
  /** True whenever any bet submission is in flight — drives the full-screen overlay. */
  readonly isBetting = computed(() => this.submitting() !== null);
  /** Error message per slot, null = no error. */
  readonly betError = signal<{ slot: 1 | 2; message: string } | null>(null);

  ngOnInit(): void {
    this.sheetsService.getDashboardData().subscribe((d) => {
      this.data = d;
      this.loading = false;
    });
  }

  // ─── Bet helpers ──────────────────────────────────────────────────────────

  /** Stable "HomeTeam|AwayTeam" key for a match; used to scope localStorage. */
  matchKey(match: Match): string {
    return `${match.homeTeam}|${match.awayTeam}`;
  }

  /**
   * Returns the bet slot number for the given match (1 or 2), or null when
   * the match is not a current bet match.
   */
  betSlot(match: Match): 1 | 2 | null {
    if (!this.data) return null;
    if (this.data.betMatch1?.id === match.id) return 1;
    if (this.data.betMatch2?.id === match.id) return 2;
    return null;
  }

  /**
   * For a bet-match card, returns the team the user already chose (from
   * localStorage), or null if no bet exists for this match.
   */
  chosenTeam(match: Match): string | null {
    const slot = this.betSlot(match);
    if (!slot) return null;
    const record = this.betState.getRecord(slot, this.matchKey(match));
    return record?.chosenTeam ?? null;
  }

  /**
   * Returns true when the user placed a bet on this match within the last hour,
   * locking out any further changes.
   */
  isBetLocked(match: Match): boolean {
    const slot = this.betSlot(match);
    if (!slot) return false;
    const record = this.betState.getRecord(slot, this.matchKey(match));
    return record ? this.betState.isLocked(record) : false;
  }

  /** True while a submission is in flight for this match's slot. */
  isSubmitting(match: Match): boolean {
    const slot = this.betSlot(match);
    return !!slot && this.submitting() === slot;
  }

  /** Error message for this match's bet slot, or null. */
  matchBetError(match: Match): string | null {
    const slot = this.betSlot(match);
    const err = this.betError();
    return err && err.slot === slot ? err.message : null;
  }

  placeBet(match: Match, team: string): void {
    const slot = this.betSlot(match);
    const player = this.auth.username();
    if (!slot || !player || this.isBetLocked(match) || this.submitting() !== null) return;

    this.submitting.set(slot);
    this.betError.set(null);

    // Build payload — preserve the opposite slot's existing pick
    const otherSlot: 1 | 2 = slot === 1 ? 2 : 1;
    const otherRecord = this.data
      ? this.betState.getRecord(
          otherSlot,
          slot === 1
            ? this.data.betMatch2 ? this.matchKey(this.data.betMatch2) : ''
            : this.data.betMatch1 ? this.matchKey(this.data.betMatch1) : ''
        )
      : null;

    // Also check the bets table from the sheet for the current user
    const sheetBet = this.myBet;
    const match1Bet = slot === 1 ? team : (otherRecord?.chosenTeam ?? sheetBet?.match1Bet ?? '');
    const match2Bet = slot === 2 ? team : (otherRecord?.chosenTeam ?? sheetBet?.match2Bet ?? '');

    this.betService
      .submitBet({
        player,
        match1Bet,
        match2Bet,
        modifier: sheetBet?.modifier ?? '',
      })
      .subscribe({
        next: () => {
          this.betState.saveRecord(slot, this.matchKey(match), team);
          this.submitting.set(null);
        },
        error: (err: Error) => {
          this.submitting.set(null);
          this.betError.set({
            slot,
            message:
              'Could not save your bet. Please try again in 10–30 seconds (server limit).',
          });
          console.error('[Bet] Submit failed:', err.message);
        },
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

