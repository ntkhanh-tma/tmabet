import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { GoogleSheetsService } from '../../../core/services/google-sheets.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoginDialogComponent } from '../../components/login-dialog/login-dialog.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);

  greeting = '';
  currentDate = new Date();
  addictCount = 0;

  ngOnInit(): void {
    this.setGreeting();
    this.sheetsService.getBetCount().subscribe((count) => {
      this.addictCount = count;
    });
  }

  onRefresh(): void {
    this.sheetsService.triggerRefresh();
    this.sheetsService.getBetCount().subscribe((count) => {
      this.addictCount = count;
    });
  }

  openLogin(): void {
    this.dialog.open(LoginDialogComponent, { width: '360px' });
  }

  logout(): void {
    this.auth.logout();
  }

  private setGreeting(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.greeting = 'Good morning';
    else if (hour < 17) this.greeting = 'Good afternoon';
    else this.greeting = 'Good evening';
  }
}
