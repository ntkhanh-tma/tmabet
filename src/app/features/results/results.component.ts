import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { ResultData } from '../../core/models/dashboard.model';
import { AuthService } from '../../core/services/auth.service';
import {
  ScreenshotDialogComponent,
  ScreenshotDialogData,
} from './screenshot-dialog.component';

/** A playful "award" highlighting a standout player in the results. */
export interface ResultAward {
  key: string;
  emoji: string;
  label: string;
  /** Colour variant key shared between the CSS cards and the canvas footer. */
  variant: 'gold' | 'blue' | 'green' | 'red' | 'orange' | 'frost';
  /** Winning player name(s); '—' when nobody qualifies. */
  player: string;
  /** Short value descriptor, e.g. "+42 pts", "8 wins", "5 in a row". */
  detail: string;
}

interface PlayerStat {
  name: string;
  points: number;
  wins: number;
  losses: number;
  bestWinStreak: number;
  bestLoseStreak: number;
}

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
})
export class ResultsComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  data: ResultData | null = null;
  loading = true;
  capturing = false;

  private readonly flagCache = new Map<string, Promise<HTMLImageElement | null>>();

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

  /** Per-player win/loss counts and streaks over the visible (ordered) columns. */
  private playerStats(): PlayerStat[] {
    const rows = this.data?.rows ?? [];
    const cols = this.visibleColumns;
    return rows.map((r) => {
      let wins = 0;
      let losses = 0;
      let curWin = 0;
      let curLose = 0;
      let bestWinStreak = 0;
      let bestLoseStreak = 0;
      for (const col of cols) {
        const cls = this.pickClass(r.picks[col.matchNumber] || '');
        if (cls === 'result-cell--win') {
          wins++;
          curWin++;
          curLose = 0;
          bestWinStreak = Math.max(bestWinStreak, curWin);
        } else if (cls === 'result-cell--loss') {
          losses++;
          curLose++;
          curWin = 0;
          bestLoseStreak = Math.max(bestLoseStreak, curLose);
        } else {
          curWin = 0;
          curLose = 0;
        }
      }
      return { name: r.playerName, points: r.totalPoints, wins, losses, bestWinStreak, bestLoseStreak };
    });
  }

  private joinNames(names: string[]): string {
    if (names.length === 0) return '—';
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }

  /** Standout-player awards shown above the table and in the screenshot footer. */
  get awards(): ResultAward[] {
    const stats = this.playerStats();
    if (stats.length === 0) return [];

    const winnersBy = (value: number, sel: (s: PlayerStat) => number): string =>
      this.joinNames(stats.filter((s) => sel(s) === value).map((s) => s.name));

    const max = (sel: (s: PlayerStat) => number) => Math.max(...stats.map(sel));
    const min = (sel: (s: PlayerStat) => number) => Math.min(...stats.map(sel));

    const fmtPts = (p: number) => `${p > 0 ? '+' : ''}${p} pts`;
    // Count-based awards are only meaningful when someone actually scored one.
    const countAward = (
      value: number,
      sel: (s: PlayerStat) => number,
      detail: (v: number) => string
    ) => (value > 0 ? { player: winnersBy(value, sel), detail: detail(value) } : { player: '—', detail: '—' });

    const maxPoints = max((s) => s.points);
    const minPoints = min((s) => s.points);
    const maxWins = max((s) => s.wins);
    const maxLosses = max((s) => s.losses);
    const maxWinStreak = max((s) => s.bestWinStreak);
    const maxLoseStreak = max((s) => s.bestLoseStreak);

    return [
      {
        key: 'highest',
        emoji: '🏆',
        label: 'Highest Point',
        variant: 'gold',
        player: winnersBy(maxPoints, (s) => s.points),
        detail: fmtPts(maxPoints),
      },
      {
        key: 'lowest',
        emoji: '📉',
        label: 'Lowest Point',
        variant: 'blue',
        player: winnersBy(minPoints, (s) => s.points),
        detail: fmtPts(minPoints),
      },
      {
        key: 'most-win',
        emoji: '🎯',
        label: 'Most Win',
        variant: 'green',
        ...countAward(maxWins, (s) => s.wins, (v) => `${v} ${v === 1 ? 'win' : 'wins'}`),
      },
      {
        key: 'most-lose',
        emoji: '🤡',
        label: 'Most Lose',
        variant: 'red',
        ...countAward(maxLosses, (s) => s.losses, (v) => `${v} ${v === 1 ? 'loss' : 'losses'}`),
      },
      {
        key: 'win-streak',
        emoji: '🔥',
        label: 'Longest Win Streak',
        variant: 'orange',
        ...countAward(maxWinStreak, (s) => s.bestWinStreak, (v) => `${v} in a row`),
      },
      {
        key: 'lose-streak',
        emoji: '🥶',
        label: 'Longest Lose Streak',
        variant: 'frost',
        ...countAward(maxLoseStreak, (s) => s.bestLoseStreak, (v) => `${v} in a row`),
      },
    ];
  }

  /**
   * Render the whole result grid (excluding the Wallet column) to a high-resolution
   * PNG and open it in a preview dialog with Copy / Download actions. The grid is
   * drawn manually onto a canvas rather than screenshotting the DOM so it captures
   * every column left-to-right regardless of horizontal scroll, and stays crisp at
   * ~4K width.
   */
  async captureScreenshot(): Promise<void> {
    if (!this.data || this.capturing) return;
    this.capturing = true;
    try {
      const blob = await this.renderGridImage();
      if (!blob) {
        this.snackBar.open('Could not generate the screenshot', 'OK', { duration: 4000 });
        return;
      }
      this.dialog.open<ScreenshotDialogComponent, ScreenshotDialogData>(
        ScreenshotDialogComponent,
        {
          data: { blob, filename: this.screenshotFilename() },
          maxWidth: '95vw',
          width: 'auto',
          panelClass: 'screenshot-dialog-panel',
        }
      );
    } catch {
      this.snackBar.open('Could not generate the screenshot', 'OK', { duration: 4000 });
    } finally {
      this.capturing = false;
    }
  }

  private screenshotFilename(): string {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    return `wc2026-results_${stamp}.png`;
  }

  /**
   * Resolve the flag-icons background image for an ISO code into a drawable
   * <img>. Uses a hidden probe element so we reuse the exact same asset URL the
   * CSS references (same-origin, so the canvas is never tainted). Cached per code.
   */
  private loadFlag(code: string): Promise<HTMLImageElement | null> {
    if (!code) return Promise.resolve(null);
    const cached = this.flagCache.get(code);
    if (cached) return cached;

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const probe = document.createElement('span');
      probe.className = `fi fi-${code}`;
      probe.style.position = 'absolute';
      probe.style.left = '-9999px';
      probe.style.width = '16px';
      probe.style.height = '12px';
      document.body.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundImage;
      document.body.removeChild(probe);

      const match = /url\((['"]?)(.*?)\1\)/.exec(bg);
      if (!match || !match[2] || match[2] === 'none') {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = match[2];
    });

    this.flagCache.set(code, promise);
    return promise;
  }

  private async renderGridImage(): Promise<Blob | null> {
    const data = this.data;
    if (!data) return null;
    const columns = this.visibleColumns;
    const rows = data.rows;

    // ── Layout (base CSS px; scaled up for the final bitmap) ──────────────────
    const pad = 28;
    const titleH = 52;
    const headerH = 72;
    const rowH = 46;
    const playerW = 190;
    const matchW = 92;
    const totalW = 150;
    const flagW = 26;
    const flagH = 18;

    const awards = this.awards;
    const footerGap = 22;
    const footerTitleH = 30;
    const footerCardH = 82;
    const footerH = awards.length ? footerGap + footerTitleH + footerCardH : 0;

    const gridW = playerW + matchW * columns.length + totalW;
    const contentW = gridW + pad * 2;
    const contentH = pad + titleH + headerH + rowH * rows.length + footerH + pad;

    // Scale so the image is at least ~4K wide, capped to stay within canvas limits.
    const MAX_DIM = 12000;
    let scale = Math.max(2, 3840 / contentW);
    scale = Math.min(scale, MAX_DIM / contentW, MAX_DIM / contentH);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(contentW * scale);
    canvas.height = Math.round(contentH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.textBaseline = 'middle';

    // ── Palette (matches the dark app theme) ──────────────────────────────────
    const C = {
      bg: '#161616',
      surface: '#232323',
      text: '#e8e6ea',
      muted: '#9a9a9a',
      faint: '#6f6f6f',
      gold: '#ffd740',
      line: 'rgba(255,255,255,0.09)',
      meRow: 'rgba(102,187,106,0.16)',
      winText: '#7bd67f',
      winBg: 'rgba(102,187,106,0.16)',
      lossText: '#f4776f',
      lossBg: 'rgba(239,83,80,0.14)',
      pos: '#7bd67f',
      neg: '#f4776f',
    };

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, contentW, contentH);

    const originX = pad;
    let y = pad;

    // ── Title ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = C.gold;
    ctx.font = '700 26px Roboto, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('World Cup 2026 — Results', originX, y + titleH / 2 - 8);
    ctx.fillStyle = C.muted;
    ctx.font = '400 13px Roboto, "Segoe UI", sans-serif';
    ctx.fillText(
      `${rows.length} players · ${columns.length} matches`,
      originX,
      y + titleH / 2 + 14
    );
    y += titleH;

    // ── Preload flags ──────────────────────────────────────────────────────────
    const flagImgs = await Promise.all(
      columns.map(async (c) => ({
        home: await this.loadFlag(c.homeFlag),
        away: await this.loadFlag(c.awayFlag),
      }))
    );

    // Column x-positions.
    const playerX = originX;
    const matchX = (i: number) => originX + playerW + matchW * i;
    const totalX = originX + playerW + matchW * columns.length;

    // ── Header row ──────────────────────────────────────────────────────────────
    const headerTop = y;
    ctx.fillStyle = C.surface;
    ctx.fillRect(originX, headerTop, gridW, headerH);

    ctx.fillStyle = C.muted;
    ctx.font = '700 12px Roboto, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PLAYER', playerX + 10, headerTop + headerH / 2);

    columns.forEach((col, i) => {
      const cx = matchX(i) + matchW / 2;
      const imgs = flagImgs[i];
      const flagsW = flagW * 2 + 18; // two flags + "vs" gap
      let fx = cx - flagsW / 2;
      const fy = headerTop + headerH / 2 - 14;

      this.drawFlag(ctx, imgs.home, fx, fy, flagW, flagH, C);
      fx += flagW + 3;
      ctx.fillStyle = C.faint;
      ctx.font = '400 10px Roboto, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('vs', fx + 6, fy + flagH / 2);
      fx += 12;
      this.drawFlag(ctx, imgs.away, fx, fy, flagW, flagH, C);

      ctx.fillStyle = C.muted;
      ctx.font = '600 11px Roboto, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${col.matchNumber}`, cx, headerTop + headerH / 2 + 20);
    });

    ctx.fillStyle = C.gold;
    ctx.font = '700 12px Roboto, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOTAL', totalX + totalW / 2, headerTop + headerH / 2);

    y += headerH;

    // Header underline.
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX, y + 0.5);
    ctx.lineTo(originX + gridW, y + 0.5);
    ctx.stroke();

    const maxPoints = this.getMaxPoints();

    // ── Player rows ──────────────────────────────────────────────────────────────
    rows.forEach((row) => {
      const rowTop = y;
      const midY = rowTop + rowH / 2;
      const me = this.isMe(row.playerName);

      if (me) {
        ctx.fillStyle = C.meRow;
        ctx.fillRect(originX, rowTop, gridW, rowH);
      }

      // Player name (+ "You" badge).
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.font = `${me ? 700 : 600} 14px Roboto, "Segoe UI", sans-serif`;
      const name = row.playerName;
      ctx.fillText(name, playerX + 10, midY);
      if (me) {
        const nameW = ctx.measureText(name).width;
        const bx = playerX + 10 + nameW + 8;
        const bw = 34;
        const bh = 16;
        ctx.fillStyle = C.gold;
        this.roundRect(ctx, bx, midY - bh / 2, bw, bh, 8);
        ctx.fill();
        ctx.fillStyle = '#161616';
        ctx.font = '700 10px Roboto, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('You', bx + bw / 2, midY + 0.5);
      }

      // Pick cells.
      columns.forEach((col, i) => {
        const val = row.picks[col.matchNumber] || '';
        const cellX = matchX(i);
        const cx = cellX + matchW / 2;
        const cls = this.pickClass(val);
        if (cls === 'result-cell--win') {
          ctx.fillStyle = C.winBg;
          ctx.fillRect(cellX + 4, rowTop + 5, matchW - 8, rowH - 10);
          ctx.fillStyle = C.winText;
          ctx.font = '700 13px Roboto, "Segoe UI", sans-serif';
        } else if (cls === 'result-cell--loss') {
          ctx.fillStyle = C.lossBg;
          ctx.fillRect(cellX + 4, rowTop + 5, matchW - 8, rowH - 10);
          ctx.fillStyle = C.lossText;
          ctx.font = '700 13px Roboto, "Segoe UI", sans-serif';
        } else {
          ctx.fillStyle = C.faint;
          ctx.font = '400 13px Roboto, "Segoe UI", sans-serif';
        }
        ctx.textAlign = 'center';
        ctx.fillText(val || '–', cx, midY);
      });

      // Total value + bar.
      const tp = row.totalPoints;
      ctx.fillStyle = tp > 0 ? C.pos : tp < 0 ? C.neg : C.text;
      ctx.font = '700 14px Roboto, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${tp > 0 ? '+' : ''}${tp}`, totalX + totalW / 2, midY - 6);

      const barW = totalW - 40;
      const barX = totalX + 20;
      const barY = midY + 10;
      ctx.fillStyle = C.line;
      this.roundRect(ctx, barX, barY, barW, 4, 2);
      ctx.fill();
      if (tp > 0) {
        const w = Math.max(2, (tp / maxPoints) * barW);
        ctx.fillStyle = C.pos;
        this.roundRect(ctx, barX, barY, w, 4, 2);
        ctx.fill();
      }

      // Row separator.
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, rowTop + rowH + 0.5);
      ctx.lineTo(originX + gridW, rowTop + rowH + 0.5);
      ctx.stroke();

      y += rowH;
    });

    // ── Awards footer ────────────────────────────────────────────────────────────
    if (awards.length) {
      const awardColors: Record<ResultAward['variant'], { accent: string; bg: string }> = {
        gold: { accent: '#ffd740', bg: 'rgba(255,215,64,0.13)' },
        blue: { accent: '#64b5f6', bg: 'rgba(100,181,246,0.13)' },
        green: { accent: '#7bd67f', bg: 'rgba(102,187,106,0.15)' },
        red: { accent: '#f4776f', bg: 'rgba(239,83,80,0.15)' },
        orange: { accent: '#ffa726', bg: 'rgba(255,167,38,0.15)' },
        frost: { accent: '#90caf9', bg: 'rgba(144,202,249,0.14)' },
      };

      y += footerGap;
      ctx.fillStyle = C.gold;
      ctx.font = '700 17px Roboto, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🏅 Awards', originX, y + footerTitleH / 2);
      y += footerTitleH;

      const n = awards.length;
      const cardGap = 12;
      const cardW = (gridW - cardGap * (n - 1)) / n;
      const cardTop = y;

      awards.forEach((a, i) => {
        const x = originX + i * (cardW + cardGap);
        const col = awardColors[a.variant];

        ctx.fillStyle = col.bg;
        this.roundRect(ctx, x, cardTop, cardW, footerCardH, 12);
        ctx.fill();
        // Left accent bar.
        ctx.fillStyle = col.accent;
        this.roundRect(ctx, x, cardTop + 10, 5, footerCardH - 20, 2.5);
        ctx.fill();

        // Emoji badge.
        ctx.textAlign = 'left';
        ctx.font = '400 30px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.fillText(a.emoji, x + 16, cardTop + footerCardH / 2);

        const tx = x + 58;
        const textMaxW = cardW - (tx - x) - 12;
        ctx.fillStyle = col.accent;
        ctx.font = '700 10px Roboto, "Segoe UI", sans-serif';
        ctx.fillText(this.fitText(ctx, a.label.toUpperCase(), textMaxW), tx, cardTop + 22);

        ctx.fillStyle = C.text;
        ctx.font = '700 15px Roboto, "Segoe UI", sans-serif';
        ctx.fillText(this.fitText(ctx, a.player, textMaxW), tx, cardTop + 44);

        ctx.fillStyle = C.muted;
        ctx.font = '400 12px Roboto, "Segoe UI", sans-serif';
        ctx.fillText(this.fitText(ctx, a.detail, textMaxW), tx, cardTop + 64);
      });

      y += footerCardH;
    }

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }

  /** Truncate `text` with an ellipsis so it fits within `maxW` at the current font. */
  private fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  private drawFlag(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | null,
    x: number,
    y: number,
    w: number,
    h: number,
    palette: { line: string; faint: string }
  ): void {
    if (img) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      // Fallback placeholder so a missing flag doesn't leave a blank gap.
      ctx.fillStyle = palette.line;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = palette.faint;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
