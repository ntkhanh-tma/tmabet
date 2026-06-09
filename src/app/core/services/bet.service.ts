import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface BetPayload {
  player: string;
  match1Bet: string;
  match2Bet: string;
  modifier: string;
}

export interface BetResponse {
  ok: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class BetService {
  private readonly http = inject(HttpClient);
  private readonly appsScriptUrl = environment.appsScriptUrl;

  /**
   * Submits a player's bet picks to the Google Apps Script web app which
   * writes them directly to the Google Sheet's WC2026!Bets range.
   *
   * Apps Script web apps only support no-cors requests, so we send the JSON
   * payload as a plain-text body and read back a JSON response via JSONP-style
   * redirect. Angular HttpClient handles the actual POST.
   */
  submitBet(payload: BetPayload): Observable<BetResponse> {
    if (!this.appsScriptUrl) {
      return throwError(() => new Error('Apps Script URL is not configured.'));
    }

    // Apps Script requires Content-Type text/plain to avoid CORS preflight
    const headers = new HttpHeaders({ 'Content-Type': 'text/plain' });

    return this.http
      .post<BetResponse>(this.appsScriptUrl, JSON.stringify(payload), { headers })
      .pipe(
        catchError((err) => {
          const message = err.error?.message ?? err.message ?? 'Unknown error';
          return throwError(() => new Error(message));
        })
      );
  }
}
