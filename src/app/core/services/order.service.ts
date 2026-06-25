import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface OrderPayload {
  player: string;
  drink: string;
}

export interface UsedDeduction {
  player: string;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly appsScriptUrl = environment.appsScriptUrl;

  addToUsed(deductions: UsedDeduction[]): Observable<{ ok: boolean }> {
    if (!this.appsScriptUrl) {
      return throwError(() => new Error('Apps Script URL is not configured.'));
    }

    const params = new HttpParams().set('payload', JSON.stringify({ action: 'addToUsed', deductions }));

    return this.http
      .get<{ ok: boolean; message?: string }>(this.appsScriptUrl, { params })
      .pipe(
        map((res) => {
          if (!res.ok) throw new Error(res.message ?? 'Server returned ok: false');
          return res;
        }),
        catchError((err) => {
          const message = err.error?.message ?? err.message ?? 'Unknown error';
          return throwError(() => new Error(message));
        })
      );
  }

  submitOrder(payload: OrderPayload): Observable<{ ok: boolean }> {
    if (!this.appsScriptUrl) {
      return throwError(() => new Error('Apps Script URL is not configured.'));
    }

    const params = new HttpParams().set('payload', JSON.stringify({ action: 'order', ...payload }));

    return this.http
      .get<{ ok: boolean; message?: string }>(this.appsScriptUrl, { params })
      .pipe(
        map((res) => {
          if (!res.ok) throw new Error(res.message ?? 'Server returned ok: false');
          return res;
        }),
        catchError((err) => {
          const message = err.error?.message ?? err.message ?? 'Unknown error';
          return throwError(() => new Error(message));
        })
      );
  }
}
