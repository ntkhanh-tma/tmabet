import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Match, BetRow } from '../../core/models/dashboard.model';

export interface DailyWelcomeDialogData {
  betMatch1: Match | null;
  betMatch2: Match | null;
  bets: BetRow[];
  /** Current total points for the logged-in user; null when not logged in. */
  userPoints: number | null;
}

@Component({
  selector: 'app-daily-welcome-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-welcome-dialog.component.html',
  styleUrl: './daily-welcome-dialog.component.scss',
})
export class DailyWelcomeDialogComponent {
  readonly data = inject<DailyWelcomeDialogData>(MAT_DIALOG_DATA);

  get betMatches(): Match[] {
    return [this.data.betMatch1, this.data.betMatch2].filter((m): m is Match => m !== null);
  }

  slotFor(match: Match): 1 | 2 | null {
    if (this.data.betMatch1?.id === match.id) return 1;
    if (this.data.betMatch2?.id === match.id) return 2;
    return null;
  }

  getStatusColor(status: Match['status']): string {
    return status === 'live' ? 'warn' : status === 'finished' ? 'accent' : 'primary';
  }

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

  bettersForTeam(match: Match, team: string, slot: 1 | 2 | null): { animal: string; playerName: string }[] {
    const betters = this.data.bets.filter((b) => {
      if (!slot) return false;
      const pick = slot === 1 ? b.match1Bet : b.match2Bet;
      return pick?.trim().toLowerCase() === team.trim().toLowerCase();
    });
    return betters.map((b, i) => {
      const seed = (b.playerName.length * 7 + i * 13) % DailyWelcomeDialogComponent.ANIMALS.length;
      return { animal: DailyWelcomeDialogComponent.ANIMALS[seed], playerName: b.playerName };
    });
  }
}
