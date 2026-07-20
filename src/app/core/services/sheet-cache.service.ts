import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safe-storage';

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

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
    const raw = safeGetItem(key, 'session');
    const ts = Number(safeGetItem(tsKey, 'session') ?? '0');

    if (raw && Date.now() - ts < ttlMs) {
      try {
        return of(JSON.parse(raw) as T);
      } catch {
        // corrupt entry — fall through to fetch
      }
    }

    return fetcher$.pipe(
      tap((data) => {
        // Best-effort: a blocked/full store just means no caching this run.
        if (safeSetItem(key, JSON.stringify(data), 'session')) {
          safeSetItem(tsKey, String(Date.now()), 'session');
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
    safeRemoveItem(key, 'session');
    safeRemoveItem(`${key}_ts`, 'session');
  }
}
