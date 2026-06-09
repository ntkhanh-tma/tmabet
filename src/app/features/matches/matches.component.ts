import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { MatchDay } from '../../core/models/dashboard.model';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule, MatChipsModule, MatIconModule],
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
}
