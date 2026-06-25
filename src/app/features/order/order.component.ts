import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AuthService } from '../../core/services/auth.service';
import { OrderService } from '../../core/services/order.service';
import { MenuItem, OrderEntry } from '../../core/models/dashboard.model';

interface ConfirmedOrderEntry {
  playerName: string;
  drink: string;
  price: string;
}

interface ConfirmedRound {
  confirmedAt: string;
  orders: ConfirmedOrderEntry[];
}

const ADMIN_NAME = 'Khanh Nguyen';
const STORAGE_KEY = 'tmabet_confirmed_orders';

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './order.component.html',
  styleUrl: './order.component.scss',
})
export class OrderComponent implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly orderService = inject(OrderService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  loading = true;
  submitting = false;
  confirming = false;
  adminConfirmStep = false;
  submittingAll = false;
  menu: MenuItem[] = [];
  orders: OrderEntry[] = [];
  selectedDrink: string | null = null;
  savedRounds: ConfirmedRound[] = [];

  ngOnInit(): void {
    this.loadSavedRounds();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.sheetsService.getOrderPageData().subscribe(({ menu, orders }) => {
      this.menu = menu;
      this.orders = orders;
      this.loading = false;
    });
  }

  // ── Single drink ordering ──────────────────────────────────────────────────

  selectDrink(drink: string): void {
    if (!this.auth.username()) return;
    this.selectedDrink = this.selectedDrink === drink ? null : drink;
    this.confirming = false;
  }

  confirmOrder(): void { this.confirming = true; }
  cancelConfirm(): void { this.confirming = false; }

  submitOrder(): void {
    const player = this.auth.username();
    if (!player || !this.selectedDrink) return;
    this.submitting = true;
    this.orderService.submitOrder({ player, drink: this.selectedDrink }).subscribe({
      next: () => {
        this.snackBar.open(`Ordered: ${this.selectedDrink}`, 'OK', { duration: 3000 });
        this.confirming = false;
        this.submitting = false;
        this.selectedDrink = null;
        this.load();
      },
      error: (err: Error) => {
        this.snackBar.open(`Error: ${err.message}`, 'Dismiss', { duration: 5000 });
        this.confirming = false;
        this.submitting = false;
      },
    });
  }

  // ── Admin: settle all orders ───────────────────────────────────────────────

  openAdminConfirm(): void { this.adminConfirmStep = true; }
  cancelAdminConfirm(): void { this.adminConfirmStep = false; }

  settleOrders(): void {
    const enriched = this.orders
      .filter((o) => o.order.trim())
      .map((o) => {
        const item = this.menu.find((m) => m.drink === o.order);
        return { playerName: o.playerName, drink: o.order, price: item?.price ?? '', amount: this.parsePrice(item?.price ?? '0') };
      });

    if (!enriched.length) return;

    this.submittingAll = true;
    this.orderService.addToUsed(enriched.map((e) => ({ player: e.playerName, amount: e.amount }))).subscribe({
      next: () => {
        const round: ConfirmedRound = {
          confirmedAt: new Date().toISOString(),
          orders: enriched.map(({ playerName, drink, price }) => ({ playerName, drink, price })),
        };
        this.saveRound(round);
        this.snackBar.open('Wallets updated successfully!', 'OK', { duration: 3000 });
        this.adminConfirmStep = false;
        this.submittingAll = false;
        this.load();
      },
      error: (err: Error) => {
        this.snackBar.open(`Error: ${err.message}`, 'Dismiss', { duration: 5000 });
        this.adminConfirmStep = false;
        this.submittingAll = false;
      },
    });
  }

  // ── localStorage ───────────────────────────────────────────────────────────

  private loadSavedRounds(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.savedRounds = raw ? (JSON.parse(raw) as ConfirmedRound[]) : [];
    } catch {
      this.savedRounds = [];
    }
  }

  private saveRound(round: ConfirmedRound): void {
    this.savedRounds = [...this.savedRounds, round];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedRounds));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parsePrice(priceStr: string): number {
    return parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;
  }

  formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  get myOrder(): string {
    const me = this.auth.username();
    if (!me) return '';
    return this.orders.find((o) => o.playerName.toLowerCase() === me.toLowerCase())?.order ?? '';
  }

  isMe(playerName: string): boolean {
    const me = this.auth.username();
    return !!me && me.trim().toLowerCase() === playerName.trim().toLowerCase();
  }

  get isAdmin(): boolean {
    return this.auth.username()?.trim().toLowerCase() === ADMIN_NAME.toLowerCase();
  }

  get allOrdered(): boolean {
    return this.orders.length > 0 && this.orders.every((o) => o.order.trim() !== '');
  }

  get orderedCount(): number {
    return this.orders.filter((o) => o.order).length;
  }
}
