import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { GoogleSheetsService } from '../../../core/services/google-sheets.service';
import { CommentEntry } from '../../../core/models/dashboard.model';
import { getCountryCode } from '../../../core/utils/country-flags';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule, MatTooltipModule, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly sheetsService = inject(GoogleSheetsService);

  comments: CommentEntry[] = [];

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/' },
    { label: 'Matches', icon: 'sports_soccer', route: '/matches' },
    { label: 'Results', icon: 'emoji_events', route: '/results' },
  ];

  ngOnInit(): void {
    this.loadComments();
  }

  loadComments(): void {
    this.sheetsService.getComments().subscribe((c) => (this.comments = c));
  }

  /** Formats a datetime string for display: "Jun 10, 14:32" */
  formatDateTime(dt: string): string {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  getFlag(country: string): string {
    return getCountryCode(country) ?? 'un';
  }
}
