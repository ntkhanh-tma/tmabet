import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class SheetCacheService {
  /**
   * Returns cached data from sessionStorage when within TTL; otherwise subscribes
   * to `fetcher$`, stores the result, and returns it.
   * On API failure, falls back to stale cached data if available rather than
   * propagating the error.
   */
  getCached<T>(key: string, fetcher$: Observable<T>, ttlMs = CACHE_TTL_MS): Observable<T> {
    const tsKey = `${key}_ts`;
    const raw = sessionStorage.getItem(key);
    const ts = Number(sessionStorage.getItem(tsKey) ?? '0');

    if (raw && Date.now() - ts < ttlMs) {
      try {
        return of(JSON.parse(raw) as T);
      } catch {
        // corrupt entry — fall through to fetch
      }
    }

    return fetcher$.pipe(
      tap((data) => {
        try {
          sessionStorage.setItem(key, JSON.stringify(data));
          sessionStorage.setItem(tsKey, String(Date.now()));
        } catch {
          // sessionStorage quota exceeded — silently ignore
        }
      }),
      catchError((err) => {
        if (raw) {
          try {
            console.warn(`[SheetCacheService] API error for "${key}", serving stale cache.`, err);
            return of(JSON.parse(raw) as T);
          } catch {
            // corrupt stale entry — re-throw original error
          }
        }
        throw err;
      })
    );
  }

  /** Removes both the data and timestamp entries for the given key. */
  invalidate(key: string): void {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(`${key}_ts`);
  }
}
