import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <div class="login-dialog">
      <h2 mat-dialog-title class="login-dialog__title">
        <mat-icon class="login-dialog__icon">sports_soccer</mat-icon>
        Who are you, champion?
      </h2>
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="login-dialog__field">
          <mat-label>Your name</mat-label>
          <input
            matInput
            [(ngModel)]="username"
            placeholder="e.g. Khanh"
            (keyup.enter)="submit()"
            autofocus
          />
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!username.trim()"
          (click)="submit()"
        >
          Go 🚀
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .login-dialog {
      min-width: 300px;

      &__title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      &__icon {
        color: var(--mat-sys-primary);
      }

      &__field {
        width: 100%;
      }
    }
  `],
})
export class LoginDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<LoginDialogComponent>);

  username = this.authService.username() ?? '';

  submit(): void {
    if (!this.username.trim()) return;
    this.authService.login(this.username);
    this.dialogRef.close();
  }
}
