import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface BetPayload {
  player: string;
  match1Bet: string;
  match2Bet: string;
  modifier1: string;
  modifier2: string;
  /** The specific team chosen in this action — used to tag the comment row */
  betTeam?: string;
  /** Optional chat-style comment submitted alongside the bet */
  comment?: string;
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
   * Submits a player's bet picks to the Google Apps Script web app.
   *
   * Apps Script web apps redirect POST requests (302) which causes the browser
   * to re-issue them as GET, losing the body. We side-step this by encoding
   * the payload as a single `payload` query parameter on a GET request.
   * The doGet handler in Code.gs detects the parameter and writes the sheet.
   */
  submitBet(payload: BetPayload): Observable<BetResponse> {
    if (!this.appsScriptUrl) {
      return throwError(() => new Error('Apps Script URL is not configured.'));
    }

    const params = new HttpParams().set('payload', JSON.stringify(payload));

    return this.http
      .get<BetResponse>(this.appsScriptUrl, { params })
      .pipe(
        map((res) => {
          if (!res.ok) {
            throw new Error(res.message ?? 'Server returned ok: false');
          }
          return res;
        }),
        catchError((err) => {
          const message = err.error?.message ?? err.message ?? 'Unknown error';
          return throwError(() => new Error(message));
        })
      );
  }
}
