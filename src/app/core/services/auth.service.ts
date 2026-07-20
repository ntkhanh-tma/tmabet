import { Injectable, signal } from '@angular/core';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safe-storage';

const STORAGE_KEY = 'tmabet_username';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Seed from localStorage when readable; safeGetItem never throws, so a
  // browser that blocks storage just starts logged-out instead of crashing DI.
  readonly username = signal<string | null>(safeGetItem(STORAGE_KEY));

  login(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Persist best-effort. Even if storage is blocked (private mode / cookies
    // disabled), still update the signal so the user is logged in for the
    // session — the login must never silently fail.
    safeSetItem(STORAGE_KEY, trimmed);
    this.username.set(trimmed);
  }

  logout(): void {
    safeRemoveItem(STORAGE_KEY);
    this.username.set(null);
  }
}
