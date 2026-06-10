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
  /** The favoured/upper team name from the sheet */
  upper: string;
  /** Handicap odds value (e.g. "0.5", "1") */
  odds: string;
  /** Analyst comment from the sheet */
  comment: string;
}

/** Raw row shape from matches.json (column names match the sheet headers) */
export interface SheetMatch {
  /** Sequential match number */
  Match: string;
  /** Single letter group identifier, e.g. "A", "B" */
  Group: string;
  /** Date in DD/MM/YYYY format */
  Date: string;
  Time: string;
  Home: string;
  Away: string;
  /** The favoured team name (handicap upper) */
  Upper: string;
  /** Handicap odds value */
  Odds: string;
  Comment: string;
  /** Combined score "X-Y", "?", or empty */
  Result: string;
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

/** One row from the Comments sheet */
export interface CommentEntry {
  /** ISO datetime string parsed from the sheet value */
  dateTime: string;
  /** Player/author name */
  player: string;
  /** Message text */
  message: string;
}
