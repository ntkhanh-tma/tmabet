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

  /** Returns a CSS class based on whether the pick value is positive, negative, or empty. */
  pickClass(val: string): string {
    if (!val || val === '') return 'result-cell--empty';
    const n = Number(val);
    if (isNaN(n)) return '';
    if (n > 0) return 'result-cell--win';
    if (n < 0) return 'result-cell--loss';
    return 'result-cell--neutral';
  }

  getMaxPoints(): number {
    if (!this.data || this.data.rows.length === 0) return 1;
    return Math.max(...this.data.rows.map((r) => r.totalPoints), 1);
  }

  getMinPoints(): number {
    if (!this.data || this.data.rows.length === 0) return 0;
    return Math.min(...this.data.rows.map((r) => r.totalPoints), 0);
  }
}
