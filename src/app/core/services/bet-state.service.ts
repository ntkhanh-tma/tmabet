import { Injectable } from '@angular/core';
import { Match } from '../models/dashboard.model';

const BET_KEY_1 = 'tmabet_bet_1';
const BET_KEY_2 = 'tmabet_bet_2';
const LOCK_MS = 60 * 60 * 1000; // 1 hour (post-bet cooldown)
const KICKOFF_LOCK_MS = 8 * 60 * 60 * 1000; // 8 hours before kickoff

export interface LocalBetRecord {
  /** "HomeTeam|AwayTeam" — scopes the record to the current match rotation */
  matchKey: string;
  /** The team the player bet on */
  chosenTeam: string;
  /** Epoch ms when the bet was placed */
  betTime: number;
}

@Injectable({ providedIn: 'root' })
export class BetStateService {
  private storageKey(slot: 1 | 2): string {
    return slot === 1 ? BET_KEY_1 : BET_KEY_2;
  }

  /**
   * Returns the stored bet record for the given slot, or null if none exists
   * or the stored record belongs to a different match (team rotation).
   */
  getRecord(slot: 1 | 2, matchKey: string): LocalBetRecord | null {
    try {
      const raw = localStorage.getItem(this.storageKey(slot));
      if (!raw) return null;
      const record: LocalBetRecord = JSON.parse(raw);
      return record.matchKey === matchKey ? record : null;
    } catch {
      return null;
    }
  }

  /** Persists a bet record to localStorage with the current timestamp. */
  saveRecord(slot: 1 | 2, matchKey: string, chosenTeam: string): void {
    const record: LocalBetRecord = { matchKey, chosenTeam, betTime: Date.now() };
    localStorage.setItem(this.storageKey(slot), JSON.stringify(record));
  }

  /** Returns true when the bet was placed less than 1 hour ago (post-bet cooldown). */
  isLocked(record: LocalBetRecord): boolean {
    return Date.now() - record.betTime < LOCK_MS;
  }

  /**
   * Parses the match's date + time fields into a UTC-aware Date object.
   * matchDate is YYYY-MM-DD, matchTime is HH:MM (local/server time as stored in the sheet).
   * Returns null when either field is missing or unparseable.
   */
  kickoffTime(match: Match): Date | null {
    if (!match.matchDate || !match.matchTime) return null;
    const dt = new Date(`${match.matchDate}T${match.matchTime}:00`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  /**
   * Returns true when the current time is within 8 hours of kickoff (or past it).
   * Betting is locked for the entire 8-hour window leading up to the match.
   */
  isKickoffLocked(match: Match): boolean {
    const kickoff = this.kickoffTime(match);
    if (!kickoff) return false;
    return Date.now() >= kickoff.getTime() - KICKOFF_LOCK_MS;
  }

  /**
   * Returns the epoch ms at which the kickoff lock activates for this match,
   * i.e. kickoffTime - 8h. Returns null if the kickoff cannot be parsed.
   */
  kickoffLockActivatesAt(match: Match): number | null {
    const kickoff = this.kickoffTime(match);
    if (!kickoff) return null;
    return kickoff.getTime() - KICKOFF_LOCK_MS;
  }
}
