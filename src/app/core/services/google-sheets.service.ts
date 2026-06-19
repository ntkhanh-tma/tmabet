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
  bets: string[][];
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
    const PLAYER_HEADERS = new Set(['player', 'name', 'player name', 'players']);
    return this.loadWc2026Data().pipe(
      map((data) => data.bets.filter((r) => r[1]?.trim() && !PLAYER_HEADERS.has(r[1].trim().toLowerCase())).length)
    );
  }

  /** Builds the full dashboard data, served from sessionStorage cache when within 5 min TTL. */
  getDashboardData(): Observable<DashboardData> {
    return forkJoin({
      wc2026: this.loadWc2026Data(),
      matchDays: this.getMatches(),
      resultRows: this.loadResultRows(),
    }).pipe(
      map(({ wc2026, matchDays, resultRows }) => this.buildDashboard(wc2026, matchDays, resultRows))
    );
  }

  /** Returns all matches grouped by date ascending, served from sessionStorage cache when within 5 min TTL. */
  getMatches(): Observable<MatchDay[]> {
    const fetcher$ = this.rawRange('Matches').pipe(
      map((rawRows) => {
        if (rawRows.length === 0) return [] as SheetMatch[];
        const [headers, ...dataRows] = rawRows;
        // The sheet column may be named "Match Number/Name" or similar variants;
        // normalize it to "Match" so that row.Match is always populated correctly.
        const normalizedHeaders = headers.map((h) => {
          const lower = h.trim().toLowerCase();
          if (
            lower === 'match' ||
            lower === 'match number/name' ||
            lower === 'match number' ||
            lower === 'match name' ||
            lower === 'match no.' ||
            lower === 'match no' ||
            lower === 'match #'
          ) {
            return 'Match';
          }
          return h;
        });
        return dataRows.map((row) => {
          const obj: Record<string, string> = {};
          normalizedHeaders.forEach((h, i) => (obj[h] = row[i] ?? ''));
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
      resultRows: this.loadResultRows(),
    }).pipe(
      map(({ wc2026, matchDays, resultRows }) => this.buildDashboard(wc2026, matchDays, resultRows))
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
      // Use an explicit range instead of the named "Bets" range so that the
      // new Wallet (col E) and Used (col F) columns are included. The named
      // range was defined before those columns existed and is frozen at A:D.
      bets: this.rawRange('WC2026!A:I'),
      currentMatch: this.rawRange('WC2026!I2:I5'),
    });
    return this.cache.getCached<Wc2026Data>(CACHE_KEYS.wc2026, fetcher$);
  }

  /** Fetches and caches the raw Result sheet rows (shared by getResults and getDashboardData). */
  private loadResultRows(): Observable<Record<string, string>[]> {
    const fetcher$ = this.rawRange('Result!A:ZZ').pipe(
      map((sheetRows) => {
        if (sheetRows.length === 0) return [] as Record<string, string>[];
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
    return this.cache.getCached<Record<string, string>[]>(CACHE_KEYS.results, fetcher$);
  }

  /** Converts raw range arrays into `DashboardData`. */
  private buildDashboard(data: Wc2026Data, matchDays: MatchDay[], resultRows: Record<string, string>[]): DashboardData {
    const allMatches = matchDays.flatMap((d) => d.matches);

    // ── Resolve bet matches FIRST — they drive the featuring-match pinning ──
    // I2:I5 is a single-column range: I2=home1, I3=away1, I4=home2, I5=away2.
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

    // ── Featuring matches ────────────────────────────────────────────────────
    // A match is "active" until its kickoff was more than 2 hours ago
    // (covers the full duration of a typical match).
    // Bet matches are PINNED into the list regardless of their chronological
    // position — they must always be visible so users can place their bets.
    // Remaining slots (up to 4 total) are filled with the next upcoming matches.
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const isActive = (m: Match): boolean => {
      const kickoff = m.matchTime
        ? new Date(`${m.matchDate}T${m.matchTime}:00`)
        : new Date(`${m.matchDate}T00:00:00`);
      return !isNaN(kickoff.getTime()) && kickoff >= cutoff;
    };

    // Each bet match is an independent entity: pin it only if it is still active.
    const pinnedIds = new Set<string>();
    if (betMatch1 && isActive(betMatch1)) pinnedIds.add(betMatch1.id);
    if (betMatch2 && isActive(betMatch2)) pinnedIds.add(betMatch2.id);

    const pinned = allMatches.filter((m) => pinnedIds.has(m.id));
    const fillers = allMatches
      .filter((m) => !pinnedIds.has(m.id) && isActive(m))
      .sort((a, b) => `${a.matchDate}T${a.matchTime}`.localeCompare(`${b.matchDate}T${b.matchTime}`))
      .slice(0, Math.max(0, 4 - pinned.length));

    const featuringMatches = [...pinned, ...fillers]
      .sort((a, b) => `${a.matchDate}T${a.matchTime}`.localeCompare(`${b.matchDate}T${b.matchTime}`));

    // ── Parse Bets range ────────────────────────────────────────────────────
    // Sheet layout (A:I): A=Points, B=Player, C=1stMatch, D=2ndMatch,
    // E=Modifier, F=Comment, G=BetTeam, H=Wallet, I=Used.
    // Rows above the header (metadata) and the header row itself are skipped
    // by filtering on a non-empty, non-header value in column B (index 1).
    const PLAYER_HEADERS = new Set(['player', 'name', 'player name', 'players']);
    const bets: BetRow[] = (data.bets ?? [])
      .filter((r) => r[1]?.trim() && !PLAYER_HEADERS.has(r[1].trim().toLowerCase()))
      .map((r) => ({
        playerName: r[1] ?? '',
        match1Bet: r[2] ?? '',
        match2Bet: r[3] ?? '',
        modifier: r[4] ?? '',
        wallet: r[7] ?? '',
        used: r[8] ?? '',
      }));

    // ── Leaderboard: top 10 by Points from the Result sheet ─────────────────
    const playerKey = resultRows.length > 0
      ? (Object.keys(resultRows[0]).find((k) => k.trim().toLowerCase() === 'player') ?? '')
      : '';
    const pointsKey = resultRows.length > 0
      ? (Object.keys(resultRows[0]).find((k) => k.trim().toLowerCase() === 'points') ?? '')
      : '';
    const allResultKeys = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];
    const matchNumberKeys = allResultKeys.filter(
      (k) => k !== playerKey && k.trim().toLowerCase() !== 'points' && k.trim() !== ''
    );
    const leaderboard: LeaderboardEntry[] = resultRows
      .filter((r) => r[playerKey]?.trim())
      .map((r) => ({
        rank: 0,
        playerName: r[playerKey].trim(),
        totalPoints: Number(r[pointsKey] ?? '0') || 0,
        results: matchNumberKeys.map((k) => (r[k] ?? '').trim()).filter(Boolean),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 10)
      .map((e, i) => ({ ...e, rank: i + 1 }));

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
    return forkJoin({
      matchDays: this.getMatches(),
      rawRows: this.loadResultRows(),
      wc2026: this.loadWc2026Data(),
    }).pipe(
      map(({ matchDays, rawRows, wc2026 }) => {
        const walletByPlayer = new Map(
          (wc2026.bets ?? [])
            .filter((r) => r[1]?.trim())
            .map((r) => [r[1].trim().toLowerCase(), r[7] ?? ''])
        );
        return this.buildResultData(rawRows, matchDays.flatMap((d) => d.matches), walletByPlayer);
      })
    );
  }

  /** Converts raw Result-sheet rows into ResultData, resolving match numbers → team labels. */
  private buildResultData(rows: Record<string, string>[], allMatches: Match[], walletByPlayer = new Map<string, string>()): ResultData {
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
        const name = r[playerKey].trim();
        return { playerName: name, totalPoints, picks, wallet: walletByPlayer.get(name.toLowerCase()) };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return { columns, rows: resultRows };
  }
}
