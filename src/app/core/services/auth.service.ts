import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'tmabet_username';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly username = signal<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  );

  login(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    this.username.set(trimmed);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.username.set(null);
  }
}
