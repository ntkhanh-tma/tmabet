import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, catchError } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DashboardData,
  Match,
  MatchDay,
  SheetMatch,
  LeaderboardEntry,
  BetRow,
  CommentEntry,
  ResultData,
  ResultColumn,
  ResultRow,
} from '../models/dashboard.model';
import { getCountryCode, getGroupColor } from '../utils/country-flags';
import { SheetCacheService } from './sheet-cache.service';

interface Wc2026Data {
  players: string[][];
  bets: string[][];
  points: string[][];
  currentMatch: string[][];
}

const CACHE_KEYS = {
  wc2026: 'tmabet_cache_wc2026',
  matches: 'tmabet_cache_matches',
  comments: 'tmabet_cache_comments',
  results: 'tmabet_cache_results',
} as const;

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(SheetCacheService);

  private readonly apiKey = 'AIzaSyAD9--6nWYRTNhBFGga0KF9GTDgAp_Z57M';
  private readonly spreadsheetId = '1KN7r6qdlnDKLbAitcn_KeN8ztP05KO2ZhW0nJ81WI78';
  private readonly baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the count of players who have placed bets (non-empty rows in Bets range).
   * Shares the wc2026 cache with getDashboardData — no extra API call when both run.
   */
  getBetCount(): Observable<number> {
    return this.loadWc2026Data().pipe(
      map((data) => data.bets.filter((r) => r[0]?.trim()).length)
    );
  }

  /** Builds the full dashboard data, served from sessionStorage cache when within 5 min TTL. */
  getDashboardData(): Observable<DashboardData> {
    return forkJoin({
      wc2026: this.loadWc2026Data(),
      matchDays: this.getMatches(),
    }).pipe(
      map(({ wc2026, matchDays }) => this.buildDashboard(wc2026, matchDays))
    );
  }

  /** Returns all matches grouped by date ascending, served from sessionStorage cache when within 5 min TTL. */
  getMatches(): Observable<MatchDay[]> {
    const fetcher$ = this.rawRange('Matches').pipe(
      map((rawRows) => {
        if (rawRows.length === 0) return [] as SheetMatch[];
        const [headers, ...dataRows] = rawRows;
        return dataRows.map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => (obj[h] = row[i] ?? ''));
          return obj as unknown as SheetMatch;
        });
      })
    );
    return this.cache.getCached<SheetMatch[]>(CACHE_KEYS.matches, fetcher$).pipe(
      map((rows) => this.sheetRowsToMatchDays(rows))
    );
  }

  /**
   * Invalidates the WC2026 sessionStorage cache and re-fetches fresh data directly
   * from the API. Called immediately after a bet is placed so the UI reflects the
   * saved pick without waiting for the TTL to expire.
   */
  refreshWc2026Data(): Observable<DashboardData> {
    this.cache.invalidate(CACHE_KEYS.wc2026);
    return forkJoin({
      wc2026: this.loadWc2026Data(),
      matchDays: this.getMatches(),
    }).pipe(
      map(({ wc2026, matchDays }) => this.buildDashboard(wc2026, matchDays))
    );
  }

  getSheetRange(range: string): Observable<string[][]> {
    return this.rawRange(range).pipe(
      catchError((err) => {
        console.error(`[GoogleSheetsService] Failed to fetch range "${range}":`, err);
        return of([]);
      })
    );
  }

  /**
   * Fetches up to 50 most recent comments from the Comments sheet.
   * Served from sessionStorage cache when within 5 min TTL; falls back to
   * stale cache on API error rather than showing an empty list.
   * Returned array is already sorted newest-first.
   */
  getComments(): Observable<CommentEntry[]> {
    const fetcher$ = this.rawRange('Comments!A:ZZ').pipe(
      map((rawRows) => {
        if (rawRows.length === 0) return [] as CommentEntry[];
        const [headers, ...dataRows] = rawRows;
        const dtIdx = headers.findIndex((h) => h.toLowerCase().includes('date'));
        const playerIdx = headers.findIndex((h) => h.toLowerCase() === 'player');
        const msgIdx = headers.findIndex((h) => h.toLowerCase() === 'message' || h.toLowerCase() === 'comment');
        const betIdx = headers.findIndex((h) => h.toLowerCase() === 'bet' || h.toLowerCase() === 'country');
        const rows = dataRows.map((r) => [r[dtIdx] ?? '', r[playerIdx] ?? '', r[msgIdx] ?? '', betIdx >= 0 ? (r[betIdx] ?? '') : '']);
        return this.parseCommentRows(rows);
      })
    );
    return this.cache.getCached<CommentEntry[]>(CACHE_KEYS.comments, fetcher$);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches a raw sheet range from the API without swallowing errors, so that
   * SheetCacheService can fall back to stale sessionStorage data on failure.
   */
  private rawRange(range: string): Observable<string[][]> {
    const url = `${this.baseUrl}/${encodeURIComponent(range)}?key=${this.apiKey}`;
    return this.http.get<{ values: string[][] }>(url).pipe(
      map((res) => res.values ?? [])
    );
  }

  /**
   * Fetches all four WC2026 ranges in parallel and stores the result in
   * sessionStorage under CACHE_KEYS.wc2026 for up to 5 minutes.
   */
  private loadWc2026Data(): Observable<Wc2026Data> {
    const fetcher$ = forkJoin({
      players: this.rawRange('WC2026!Players'),
      bets: this.rawRange('WC2026!Bets'),
      points: this.rawRange('WC2026!Points'),
      currentMatch: this.rawRange('WC2026!I2:I5'),
    });
    return this.cache.getCached<Wc2026Data>(CACHE_KEYS.wc2026, fetcher$);
  }

  /** Converts raw range arrays into `DashboardData`. */
  private buildDashboard(data: Wc2026Data, matchDays: MatchDay[]): DashboardData {
    const allMatches = matchDays.flatMap((d) => d.matches);

    // ── Featuring matches: next 4 that kicked off within the last 2 h or are still upcoming ──
    // A match drops off the list only once its kickoff was more than 2 hours ago, which
    // covers the full duration of a typical football match.
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const featuringMatches = allMatches
      .filter((m) => {
        const kickoff = m.matchTime
          ? new Date(`${m.matchDate}T${m.matchTime}:00`)
          : new Date(`${m.matchDate}T00:00:00`);
        return !isNaN(kickoff.getTime()) && kickoff >= cutoff;
      })
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
      .slice(0, 10)
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
        matchNumber: row.Match ?? String(i + 1),
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

  /** Converts raw [dateTime, player, message, bet] rows to CommentEntry[], newest first, max 50. */
  private parseCommentRows(rows: string[][]): CommentEntry[] {
    return rows
      .filter((r) => r[2]?.trim())
      .map((r) => ({ dateTime: r[0] ?? '', player: r[1] ?? '', message: r[2] ?? '', bet: r[3] ?? '' }))
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
      .slice(0, 50);
  }

  /**
   * Fetches the Results sheet (read-only), served from sessionStorage cache
   * when within 5 min TTL. Falls back to stale cache on API error.
   * Columns: Player | <matchNumber> | <matchNumber> | …
   */
  getResults(): Observable<ResultData> {
    const resultFetcher$ = this.rawRange('Result!A:ZZ').pipe(
      map((sheetRows) => {
        if (sheetRows.length === 0) return [] as Record<string, string>[];
        // Normalise blank first-column header → "Player"
        const rawHeaders = sheetRows[0];
        const headers = rawHeaders.map((h, i) => (i === 0 && !h.trim() ? 'Player' : h));
        const dataRows = sheetRows.slice(1);
        return dataRows.map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => (obj[h] = row[i] ?? ''));
          return obj;
        });
      })
    );
    return forkJoin({
      matchDays: this.getMatches(),
      rawRows: this.cache.getCached<Record<string, string>[]>(CACHE_KEYS.results, resultFetcher$),
    }).pipe(
      map(({ matchDays, rawRows }) =>
        this.buildResultData(rawRows, matchDays.flatMap((d) => d.matches))
      )
    );
  }

  /** Converts raw Result-sheet rows into ResultData, resolving match numbers → team labels. */
  private buildResultData(rows: Record<string, string>[], allMatches: Match[]): ResultData {
    if (rows.length === 0) return { columns: [], rows: [] };

    // Build a lookup: matchNumber → Match
    const matchByNumber = new Map<string, Match>();
    for (const m of allMatches) {
      matchByNumber.set(m.matchNumber.trim(), m);
    }

    const sampleRow = rows[0];
    const allKeys = Object.keys(sampleRow);

    // Column A header is blank → player names; last column "Points" → pre-computed total
    const playerKey = allKeys.find((k) => k.trim().toLowerCase() === 'player') ?? '';
    const pointsKey = allKeys.find((k) => k.trim().toLowerCase() === 'points') ?? 'Points';

    // Match-number columns: everything except the player key and the Points key
    const matchNumberKeys = allKeys.filter(
      (k) => k !== playerKey && k.trim().toLowerCase() !== 'points' && k.trim() !== ''
    );

    const columns: ResultColumn[] = matchNumberKeys.map((key) => {
      const m = matchByNumber.get(key.trim());
      return {
        matchNumber: key.trim(),
        label: m ? `${m.homeTeam} vs ${m.awayTeam}` : key,
        homeTeam: m?.homeTeam ?? '',
        awayTeam: m?.awayTeam ?? '',
        homeFlag: m?.homeFlag ?? 'un',
        awayFlag: m?.awayFlag ?? 'un',
      };
    });

    const resultRows: ResultRow[] = rows
      .filter((r) => r[playerKey]?.trim())
      .map((r) => {
        const picks: Record<string, string> = {};
        for (const key of matchNumberKeys) {
          picks[key.trim()] = (r[key] ?? '').trim();
        }
        const totalPoints = Number(r[pointsKey] ?? '0') || 0;
        return { playerName: r[playerKey].trim(), totalPoints, picks };
      })
      .sort((a, b) => a.totalPoints - b.totalPoints);

    return { columns, rows: resultRows };
  }
}
