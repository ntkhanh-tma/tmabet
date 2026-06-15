import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AuthService } from '../../core/services/auth.service';
import { BetService } from '../../core/services/bet.service';
import { BetStateService } from '../../core/services/bet-state.service';
import { DashboardData, Match, BetRow } from '../../core/models/dashboard.model';
import { getCountryCode } from '../../core/utils/country-flags';
import { DailyWelcomeDialogComponent, DailyWelcomeDialogData } from './daily-welcome-dialog.component';

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
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly betService = inject(BetService);
  private readonly betState = inject(BetStateService);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);

  data: DashboardData | null = null;
  loading = true;

  /** Which slot (1|2) is currently submitting. null = none. */
  readonly submitting = signal<1 | 2 | null>(null);
  /** True whenever any bet submission is in flight — drives the full-screen overlay. */
  readonly isBetting = computed(() => this.submitting() !== null);
  /** Error message per slot, null = no error. */
  readonly betError = signal<{ slot: 1 | 2; message: string } | null>(null);
  /**
   * Bets placed in the current session — used to immediately reflect a new
   * pick without waiting for the next sheet fetch.
   */
  readonly sessionBets = signal<Partial<Record<1 | 2, string>>>({});

  /**
   * Set of match IDs that are currently kickoff-locked (≤ 8 h to kickoff).
   * Updated on load and reactively via scheduled timers.
   */
  readonly kickoffLockedIds = signal<Set<string>>(new Set());

  /** Timer handles scheduled to flip a match into kickoff-lock state. */
  private lockTimers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    this.sheetsService.getDashboardData().subscribe((d) => {
      this.data = d;
      this.loading = false;
      this.scheduleLockTimers(d);
      this.showDailyWelcomeIfNeeded(d);
    });
  }

  ngOnDestroy(): void {
    this.lockTimers.forEach((t) => clearTimeout(t));
    this.lockTimers = [];
  }

  private static readonly DAILY_POPUP_KEY = 'tmabet_daily_popup_date';

  private showDailyWelcomeIfNeeded(d: DashboardData): void {
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem(DashboardComponent.DAILY_POPUP_KEY);
    if (lastShown === today) return;
    if (!d.betMatch1 && !d.betMatch2) return;

    localStorage.setItem(DashboardComponent.DAILY_POPUP_KEY, today);

    const me = this.auth.username();
    const userPoints = me
      ? d.leaderboard.find(
          (e) => e.playerName.trim().toLowerCase() === me.trim().toLowerCase()
        )?.totalPoints ?? null
      : null;

    this.dialog.open<DailyWelcomeDialogComponent, DailyWelcomeDialogData>(
      DailyWelcomeDialogComponent,
      {
        data: { betMatch1: d.betMatch1, betMatch2: d.betMatch2, bets: d.bets, userPoints },
        width: '600px',
        maxWidth: '95vw',
      }
    );
  }

  /**
   * For each bet match, check immediately whether it is kickoff-locked and
   * update the signal. If it is not yet locked, schedule a timer to flip the
   * signal at exactly kickoffTime - 8h so the UI reacts without a page reload.
   */
  private scheduleLockTimers(d: DashboardData): void {
    // Clear any previously scheduled timers
    this.lockTimers.forEach((t) => clearTimeout(t));
    this.lockTimers = [];

    const betMatches = [d.betMatch1, d.betMatch2].filter((m): m is Match => m !== null);
    const initialLocked = new Set<string>();

    for (const match of betMatches) {
      if (this.betState.isKickoffLocked(match)) {
        initialLocked.add(match.id);
      } else {
        const activatesAt = this.betState.kickoffLockActivatesAt(match);
        if (activatesAt !== null) {
          const msUntilLock = activatesAt - Date.now();
          if (msUntilLock > 0) {
            const timer = setTimeout(() => {
              this.kickoffLockedIds.update((s) => new Set([...s, match.id]));
            }, msUntilLock);
            this.lockTimers.push(timer);
          }
        }
      }
    }

    this.kickoffLockedIds.set(initialLocked);
  }

  /**
   * Returns a human-readable reason string when a bet match is kickoff-locked,
   * or null when betting is open. Used for tooltips and the lock badge.
   */
  kickoffLockReason(match: Match): string | null {
    if (!this.kickoffLockedIds().has(match.id)) return null;
    const kickoff = this.betState.kickoffTime(match);
    if (!kickoff) return 'Bets are closed for this match';
    const hhmm = kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateLabel = kickoff.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const now = Date.now();
    return now >= kickoff.getTime()
      ? `Match already started (${dateLabel} ${hhmm})`
      : `Bets closed – kicks off ${dateLabel} at ${hhmm}`;
  }

  // ─── Bet helpers ──────────────────────────────────────────────────────────

  // ─── Bet confirmation ────────────────────────────────────────────────────

  /**
   * The match + team selection awaiting confirmation.
   * null means no confirmation dialog is open.
   */
  readonly pendingBet = signal<{ match: Match; team: string } | null>(null);

  /** Optional comment the user types in the confirmation panel. */
  readonly pendingComment = signal<string>('');

  /** Modifier multiplier selected in the confirmation panel (1–5, default 1). */
  readonly pendingModifier = signal<number>(1);

  /** Available modifier values shown in the dropdown. */
  readonly modifierOptions = [1, 2, 3, 4, 5];

  /** Open the inline confirmation panel instead of immediately placing a bet. */
  openBetConfirm(match: Match, team: string): void {
    const slot = this.betSlot(match);
    const player = this.auth.username();
    if (!slot || !player || this.isBetLocked(match) || this.submitting() !== null) return;
    this.pendingBet.set({ match, team });
    this.pendingComment.set('');
    this.pendingModifier.set(1);
  }

  cancelBet(): void {
    this.pendingBet.set(null);
    this.pendingComment.set('');
    this.pendingModifier.set(1);
  }

  confirmBet(): void {
    const pending = this.pendingBet();
    if (!pending) return;
    const comment = this.pendingComment().trim();
    const modifier = this.pendingModifier();
    this.pendingBet.set(null);
    this.pendingComment.set('');
    this.pendingModifier.set(1);
    this.placeBet(pending.match, pending.team, comment, modifier);
  }

  isPendingBet(match: Match, team: string): boolean {
    const p = this.pendingBet();
    return p !== null && p.match.id === match.id && p.team === team;
  }

  isConfirmOpen(match: Match): boolean {
    const p = this.pendingBet();
    return p !== null && p.match.id === match.id;
  }

  // ─────────────────────────────────────────────────────────────────────────

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
   * Returns the team the user has already bet on for this match.
   * Priority: sheet data (myBet) → session signal (placed this page load).
   */
  chosenTeam(match: Match): string | null {
    const slot = this.betSlot(match);
    if (!slot) return null;
    // Prefer sheet-loaded pick; fall back to in-session pick
    const sheetPick = slot === 1 ? this.myBet?.match1Bet : this.myBet?.match2Bet;
    if (sheetPick) return sheetPick;
    return this.sessionBets()[slot] ?? null;
  }

  /**
   * Returns true when betting is locked for this match.
   * Locked when:
   *  - The match is within 8 hours of kickoff (kickoff-based lock), OR
   *  - The user placed a bet within the last hour (post-bet cooldown)
   */
  isBetLocked(match: Match): boolean {
    // Kickoff-based lock: within 8h of kickoff
    if (this.kickoffLockedIds().has(match.id)) return true;
    // Post-bet cooldown: 1h after placing a bet
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

  placeBet(match: Match, team: string, comment = '', modifier = 1): void {
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
        modifier: String(modifier),
        betTeam: team,
        ...(comment ? { comment } : {}),
      })
      .subscribe({
        next: () => {
          // Record the lock timestamp in localStorage
          this.betState.saveRecord(slot, this.matchKey(match), team);
          // Immediately reflect the pick in the UI via session signal
          this.sessionBets.update((s) => ({ ...s, [slot]: team }));
          // Re-fetch WC2026 data directly from the API so the UI reflects
          // the saved bet without waiting for the next CI run.
          this.sheetsService.refreshWc2026Data().subscribe((fresh) => {
            this.data = fresh;
            this.sessionBets.set({});
          });
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

  /**
   * Returns the odds formatted as "X – 0" (home is upper) or "0 – X" (away is upper).
   * Both sides are empty strings when odds or upper is missing.
   */
  oddsDisplay(match: Match): { home: string; away: string } {
    if (!match.odds || !match.upper) return { home: '', away: '' };
    const isHomeUpper = match.upper.trim().toLowerCase() === match.homeTeam.trim().toLowerCase();
    return isHomeUpper
      ? { home: match.odds, away: '0' }
      : { home: '0', away: match.odds };
  }

  private static readonly ANIMALS = [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
    '🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌',
    '🐞','🐜','🦗','🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀',
  ];

  /**
   * Returns bettors for the given team on a match, each with an animal emoji and player name.
   * Works for BOTH current bet matches (slot-based) and falls back to scanning all bets
   * so the counter also appears when the bets cache is stale.
   */
  bettersForTeam(match: Match, team: string): { animal: string; playerName: string }[] {
    if (!this.data) return [];
    const slot = this.betSlot(match);
    // Slot-based: exact match against match1/match2 bet columns
    let betters = this.data.bets.filter((b) => {
      if (!slot) return false;
      const pick = slot === 1 ? b.match1Bet : b.match2Bet;
      return pick?.trim().toLowerCase() === team.trim().toLowerCase();
    });
    // Fallback: if slot-based returns nothing but there are bets with this team name anywhere, use those
    if (betters.length === 0) {
      betters = this.data.bets.filter((b) =>
        [b.match1Bet, b.match2Bet].some((p) => p?.trim().toLowerCase() === team.trim().toLowerCase())
      );
    }
    return betters.map((b, i) => {
      const seed = (b.playerName.length * 7 + i * 13) % DashboardComponent.ANIMALS.length;
      return { animal: DashboardComponent.ANIMALS[seed], playerName: b.playerName };
    });
  }
}

