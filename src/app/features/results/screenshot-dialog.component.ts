import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface ScreenshotDialogData {
  /** PNG image of the result grid. */
  blob: Blob;
  /** Suggested download filename. */
  filename: string;
}

@Component({
  selector: 'app-screenshot-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './screenshot-dialog.component.html',
  styleUrl: './screenshot-dialog.component.scss',
})
export class ScreenshotDialogComponent implements OnDestroy {
  readonly data = inject<ScreenshotDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ScreenshotDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  /** Object URL for previewing/downloading the blob; revoked on destroy. */
  readonly url = URL.createObjectURL(this.data.blob);

  copying = false;

  async copyToClipboard(): Promise<void> {
    this.copying = true;
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.write([
        new ClipboardItem({ [this.data.blob.type || 'image/png']: this.data.blob }),
      ]);
      this.snackBar.open('Screenshot copied to clipboard', 'OK', { duration: 2500 });
    } catch {
      this.snackBar.open('Could not copy — use Download instead', 'OK', { duration: 4000 });
    } finally {
      this.copying = false;
    }
  }

  download(): void {
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  close(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    URL.revokeObjectURL(this.url);
  }
}
