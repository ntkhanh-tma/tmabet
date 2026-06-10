import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, catchError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  DashboardData,
  Match,
  MatchDay,
  SheetMatch,
  LeaderboardEntry,
  BetRow,
  CommentEntry,
} from '../models/dashboard.model';
import { getCountryCode, getGroupColor } from '../utils/country-flags';

/** Shape of public/data/wc2026-data.json written by the GitHub Actions script */
interface Wc2026Data {
  players: string[][];
  bets: string[][];
  points: string[][];
  currentMatch: string[][];
}

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly http = inject(HttpClient);

  private readonly apiKey = 'AIzaSyAD9--6nWYRTNhBFGga0KF9GTDgAp_Z57M';
  private readonly spreadsheetId = '1KN7r6qdlnDKLbAitcn_KeN8ztP05KO2ZhW0nJ81WI78';
  private readonly baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the count of players who have placed bets (non-empty rows in Bets range).
   * Used by the header label.
   */
  getBetCount(): Observable<number> {
    return this.loadWc2026Data().pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.bets.filter((r) => r[0]?.trim()).length);
        }
        return this.getSheetRange('WC2026!Bets').pipe(
          map((rows) => rows.filter((r) => r[0]?.trim()).length)
        );
      })
    );
  }

  /** Builds the full dashboard data from wc2026-data.json (or direct API fallback). */
  getDashboardData(): Observable<DashboardData> {
    return forkJoin({
      wc2026: this.loadWc2026Data(),
      matchDays: this.getMatches(),
    }).pipe(
      switchMap(({ wc2026, matchDays }) => {
        if (wc2026) {
          return of(this.buildDashboard(wc2026, matchDays));
        }
        // JSON not available — fetch all ranges directly
        return forkJoin({
          playersRows: this.getSheetRange('WC2026!Players'),
          betsRows: this.getSheetRange('WC2026!Bets'),
          pointsRows: this.getSheetRange('WC2026!Points'),
          currentMatch: this.getSheetRange('WC2026!I2:I5'),
        }).pipe(
          map((ranges) =>
            this.buildDashboard(
              {
                players: ranges.playersRows,
                bets: ranges.betsRows,
                points: ranges.pointsRows,
                currentMatch: ranges.currentMatch,
              },
              matchDays
            )
          )
        );
      })
    );
  }

  /**
   * Returns all matches grouped by date ascending.
   * Reads from matches.json first; falls back to the Matches sheet when empty/missing.
   */
  getMatches(): Observable<MatchDay[]> {
    return this.http.get<SheetMatch[]>('data/matches.json').pipe(
      catchError(() => of([] as SheetMatch[])),
      switchMap((rows) => {
        if (rows && rows.length > 0) {
          return of(this.sheetRowsToMatchDays(rows));
        }
        return this.getSheetRange('Matches').pipe(
          map((rawRows) => {
            if (rawRows.length === 0) return [];
            const [headers, ...dataRows] = rawRows;
            const objects: SheetMatch[] = dataRows.map((row) => {
              const obj: Record<string, string> = {};
              headers.forEach((h, i) => (obj[h] = row[i] ?? ''));
              return obj as unknown as SheetMatch;
            });
            return this.sheetRowsToMatchDays(objects);
          })
        );
      })
    );
  }

  /**
   * Fetches WC2026 ranges directly from the API (bypasses the JSON cache).
   * Used to refresh data immediately after a bet is placed.
   */
  refreshWc2026Data(): Observable<DashboardData> {
    return forkJoin({
      matchDays: this.getMatches(),
      playersRows: this.getSheetRange('WC2026!Players'),
      betsRows: this.getSheetRange('WC2026!Bets'),
      pointsRows: this.getSheetRange('WC2026!Points'),
      currentMatch: this.getSheetRange('WC2026!I2:I5'),
    }).pipe(
      map(({ matchDays, playersRows, betsRows, pointsRows, currentMatch }) =>
        this.buildDashboard(
          { players: playersRows, bets: betsRows, points: pointsRows, currentMatch },
          matchDays
        )
      )
    );
  }

  getSheetRange(range: string): Observable<string[][]> {
    const url = `${this.baseUrl}/${encodeURIComponent(range)}?key=${this.apiKey}`;
    return this.http.get<{ values: string[][] }>(url).pipe(
      map((res) => res.values ?? []),
      catchError((err) => {
        console.error(`[GoogleSheetsService] Failed to fetch range "${range}":`, err);
        return of([]);
      })
    );
  }

  /**
   * Fetches up to 50 most recent comments from the Comments sheet.
   * Tries the cached JSON first, falls back to the live API.
   * Returned array is already sorted newest-first.
   */
  getComments(): Observable<CommentEntry[]> {
    return this.http.get<{ DateTime: string; Player: string; Message: string }[]>('data/comments.json').pipe(
      catchError(() => of([])),
      switchMap((cached) => {
        if (cached && cached.length > 0) {
          return of(this.parseCommentRows(cached.map((r) => [r.DateTime ?? '', r.Player ?? '', r.Message ?? ''])));
        }
        return this.getSheetRange('Comments!A:ZZ').pipe(
          map((rawRows) => {
            if (rawRows.length === 0) return [];
            const [headers, ...dataRows] = rawRows;
            const dtIdx = headers.findIndex((h) => h.toLowerCase().includes('date') || h.toLowerCase() === 'datetime');
            const playerIdx = headers.findIndex((h) => h.toLowerCase() === 'player');
            const msgIdx = headers.findIndex((h) => h.toLowerCase() === 'message');
            const rows = dataRows.map((r) => [r[dtIdx] ?? '', r[playerIdx] ?? '', r[msgIdx] ?? '']);
            return this.parseCommentRows(rows);
          })
        );
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Tries to load public/data/wc2026-data.json.
   * Returns null when the file is missing or all four ranges are empty.
   */
  private loadWc2026Data(): Observable<Wc2026Data | null> {
    return this.http.get<Wc2026Data>('data/wc2026-data.json').pipe(
      map((d) => {
        const hasData =
          (d.players?.length ?? 0) > 0 ||
          (d.bets?.length ?? 0) > 0 ||
          (d.points?.length ?? 0) > 0;
        return hasData ? d : null;
      }),
      catchError(() => of(null))
    );
  }

  /** Converts raw range arrays into `DashboardData`. */
  private buildDashboard(data: Wc2026Data, matchDays: MatchDay[]): DashboardData {
    const allMatches = matchDays.flatMap((d) => d.matches);

    // ── Featuring matches: next 4 from today 00:00 ──────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const featuringMatches = allMatches
      .filter((m) => new Date(m.matchDate) >= todayStart)
      .sort((a, b) => `${a.matchDate}T${a.matchTime}`.localeCompare(`${b.matchDate}T${b.matchTime}`))
      .slice(0, 4);

    // ── Parse Bets range ────────────────────────────────────────────────────
    const bets: BetRow[] = (data.bets ?? [])
      .filter((r) => r[0]?.trim())
      .map((r) => ({
        playerName: r[0] ?? '',
        match1Bet: r[1] ?? '',
        match2Bet: r[2] ?? '',
        modifier: r[3] ?? '',
      }));

    // ── Leaderboard: Players range ordered by Points descending ─────────────
    const players = (data.players ?? []).flat().filter(Boolean);
    const pointsMap = new Map<string, number>();
    for (const r of (data.points ?? []).filter((r) => r[1]?.trim())) {
      // Column order in sheet: [score, playerName]
      pointsMap.set(r[1].trim().toLowerCase(), Number(r[0]) || 0);
    }
    const leaderboard: LeaderboardEntry[] = players
      .map((name) => ({
        rank: 0,
        playerName: name,
        totalPoints: pointsMap.get(name.trim().toLowerCase()) ?? 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    // ── Resolve I2:I5 against the flat matches list ─────────────────────────
    const t = (data.currentMatch ?? []).map((r) => (r[0] ?? '').trim());
    const findMatch = (home: string, away: string): Match | null => {
      if (!home || !away) return null;
      const h = home.toLowerCase();
      const a = away.toLowerCase();
      return (
        allMatches.find(
          (m) => m.homeTeam.toLowerCase() === h && m.awayTeam.toLowerCase() === a
        ) ?? null
      );
    };

    const betMatch1 = findMatch(t[0] ?? '', t[1] ?? '');
    const betMatch2 = findMatch(t[2] ?? '', t[3] ?? '');

    return { featuringMatches, leaderboard, betMatch1, betMatch2, bets };
  }

  private sheetRowsToMatchDays(rows: SheetMatch[]): MatchDay[] {
    const matches: Match[] = rows.map((row, i) => {
      const homeTeam = row.Home ?? '';
      const awayTeam = row.Away ?? '';

      // Result field is "X-Y", "?", or empty
      const resultParts = row.Result && row.Result !== '?' ? row.Result.split('-') : [];
      const homeScore = resultParts.length === 2 ? Number(resultParts[0].trim()) : undefined;
      const awayScore = resultParts.length === 2 ? Number(resultParts[1].trim()) : undefined;
      const hasResult =
        homeScore !== undefined &&
        awayScore !== undefined &&
        !isNaN(homeScore) &&
        !isNaN(awayScore);

      // Date comes as DD/MM/YYYY — convert to YYYY-MM-DD for consistent sorting
      const rawDate = row.Date ?? '';
      let isoDate = rawDate;
      const dmyMatch = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dmyMatch) {
        isoDate = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
      }

      // Group column is a single letter — prefix for display
      const groupLabel = row.Group ? `Group ${row.Group}` : '';

      return {
        id: `sheet-${row.Match || i}`,
        homeTeam,
        awayTeam,
        homeFlag: getCountryCode(homeTeam) ?? 'un',
        awayFlag: getCountryCode(awayTeam) ?? 'un',
        matchDate: isoDate,
        matchTime: row.Time ?? '',
        group: groupLabel,
        groupColor: getGroupColor(groupLabel),
        homeScore: hasResult ? homeScore : undefined,
        awayScore: hasResult ? awayScore : undefined,
        status: hasResult ? 'finished' : 'upcoming',
        upper: row.Upper ?? '',
        odds: row.Odds ?? '',
        comment: row.Comment ?? '',
      };
    });

    matches.sort((a, b) =>
      `${a.matchDate}T${a.matchTime}`.localeCompare(`${b.matchDate}T${b.matchTime}`)
    );

    const dayMap = new Map<string, Match[]>();
    for (const m of matches) {
      const existing = dayMap.get(m.matchDate);
      if (existing) existing.push(m);
      else dayMap.set(m.matchDate, [m]);
    }

    return Array.from(dayMap.entries()).map(([date, dayMatches]) => ({ date, matches: dayMatches }));
  }

  /** Converts raw [dateTime, player, message] rows to CommentEntry[], newest first, max 50. */
  private parseCommentRows(rows: string[][]): CommentEntry[] {
    return rows
      .filter((r) => r[2]?.trim())
      .map((r) => ({ dateTime: r[0] ?? '', player: r[1] ?? '', message: r[2] ?? '' }))
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
      .slice(0, 50);
  }
}

