import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { ResultData } from '../../core/models/dashboard.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
})
export class ResultsComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly auth = inject(AuthService);

  data: ResultData | null = null;
  loading = true;

  ngOnInit(): void {
    this.sheetsService.getResults().subscribe((d) => {
      this.data = d;
      this.loading = false;
    });
  }

  isMe(playerName: string): boolean {
    const me = this.auth.username();
    return !!me && me.trim().toLowerCase() === playerName.trim().toLowerCase();
  }

  /** Returns a CSS class for a pick cell: W/W2…W5 = win (green), L/L2…L5 = loss (red), empty = muted. */
  pickClass(val: string): string {
    if (!val) return 'result-cell--empty';
    const upper = val.toUpperCase();
    if (upper.startsWith('W')) return 'result-cell--win';
    if (upper.startsWith('L')) return 'result-cell--loss';
    return '';
  }

  getMaxPoints(): number {
    if (!this.data || this.data.rows.length === 0) return 1;
    return Math.max(...this.data.rows.map((r) => r.totalPoints), 1);
  }

  /** Only columns where at least one player has a result. */
  get visibleColumns() {
    if (!this.data) return [];
    return this.data.columns.filter((col) =>
      this.data!.rows.some((row) => !!row.picks[col.matchNumber])
    );
  }
}
