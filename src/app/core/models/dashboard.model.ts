export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO 3166-1 alpha-2 code used with flag-icons */
  homeFlag: string;
  /** ISO 3166-1 alpha-2 code used with flag-icons */
  awayFlag: string;
  matchDate: string;
  matchTime: string;
  group: string;
  groupColor: string;
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
}

/** Raw row shape from matches.json (column names match the sheet headers) */
export interface SheetMatch {
  Date: string;
  Time: string;
  /** Column header is "Team A" in the sheet */
  'Team A': string;
  /** Column header is "Team B" in the sheet */
  'Team B': string;
  /** Combined score "X-Y", "?", or empty */
  Result: string;
  Group: string;
  Stage?: string;
}

/** Matches grouped by calendar date for the Matches page */
export interface MatchDay {
  date: string;
  matches: Match[];
}

/** One row from the Points range: player name + total points */
export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  totalPoints: number;
}

/** One row from the Bets range */
export interface BetRow {
  playerName: string;
  /** Team the player bet for match 1 */
  match1Bet: string;
  /** Team the player bet for match 2 */
  match2Bet: string;
  /** Modifier value */
  modifier: string;
}

export interface DashboardData {
  /** Next 4 upcoming matches (from Matches sheet / JSON) */
  featuringMatches: Match[];
  /** Players from Players range sorted by points descending */
  leaderboard: LeaderboardEntry[];
  /** Match from the Matches list that corresponds to I2/I3 (null if no match found or cells empty) */
  betMatch1: Match | null;
  /** Match from the Matches list that corresponds to I4/I5 (null if no match found or cells empty) */
  betMatch2: Match | null;
  /** All bet rows from Bets range */
  bets: BetRow[];
}

export interface Participant {
  name: string;
}
