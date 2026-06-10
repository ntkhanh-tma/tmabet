import { Injectable } from '@angular/core';

const BET_KEY_1 = 'tmabet_bet_1';
const BET_KEY_2 = 'tmabet_bet_2';
const LOCK_MS = 60 * 60 * 1000; // 1 hour

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

  /** Returns true when the bet was placed less than 1 hour ago. */
  isLocked(record: LocalBetRecord): boolean {
    return Date.now() - record.betTime < LOCK_MS;
  }
}
