import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { MatchDay, Match } from '../../core/models/dashboard.model';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule, MatChipsModule, MatIconModule, MatTooltipModule],
  templateUrl: './matches.component.html',
  styleUrl: './matches.component.scss',
})
export class MatchesComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);

  matchDays: MatchDay[] = [];
  loading = true;

  ngOnInit(): void {
    this.sheetsService.getMatches().subscribe((days) => {
      this.matchDays = days;
      this.loading = false;
    });
  }

  oddsDisplay(match: Match): { home: string; away: string } {
    if (!match.odds || !match.upper) return { home: '', away: '' };
    const isHomeUpper = match.upper.trim().toLowerCase() === match.homeTeam.trim().toLowerCase();
    return isHomeUpper
      ? { home: match.odds, away: '0' }
      : { home: '0', away: match.odds };
  }
}
