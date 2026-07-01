import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AuthService } from '../../core/services/auth.service';
import { OrderService } from '../../core/services/order.service';
import { MenuItem, OrderEntry, ConfirmedOrderEntry, ConfirmedRound } from '../../core/models/dashboard.model';

const ADMIN_NAME = 'Khanh Nguyen';
const LOCK_DURATION_MS = 10 * 60 * 1000;

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatCheckboxModule, MatProgressBarModule],
  templateUrl: './order.component.html',
  styleUrl: './order.component.scss',
})
export class OrderComponent implements OnInit, OnDestroy {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly orderService = inject(OrderService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  loading = true;
  loadingHistory = false;
  submitting = false;
  adminConfirmStep = false;
  submittingAll = false;

  menu: MenuItem[] = [];
  orders: OrderEntry[] = [];
  savedRounds: ConfirmedRound[] = [];

  pendingDrink: string | null = null;
  lockRemainingMs = 0;
  useWallets = true;
  private lockInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.checkLock();
    this.load();
    this.loadOrderHistory();
  }

  ngOnDestroy(): void {
    this.clearLockInterval();
  }

  load(): void {
    this.loading = true;
    this.sheetsService.getOrderPageData().subscribe(({ menu, orders }) => {
      this.menu = menu;
      this.orders = orders;
      this.loading = false;
    });
  }

  // ── Menu interaction ──────────────────────────────────────────────────────

  clickTile(drink: string): void {
    if (this.isLocked || !this.auth.username()) return;
    this.pendingDrink = this.pendingDrink === drink ? null : drink;
  }

  cancelPending(): void {
    this.pendingDrink = null;
  }

  submitOrder(): void {
    const player = this.auth.username();
    const drink = this.pendingDrink;
    if (!player || !drink) return;
    this.submitting = true;
    this.orderService.submitOrder({ player, drink }).subscribe({
      next: () => {
        this.snackBar.open(`Ordered: ${drink}`, 'OK', { duration: 3000 });
        this.pendingDrink = null;
        this.submitting = false;
        this.setLock(drink);
        this.load();
      },
      error: (err: Error) => {
        this.snackBar.open(`Error: ${err.message}`, 'Dismiss', { duration: 5000 });
        this.pendingDrink = null;
        this.submitting = false;
      },
    });
  }

  // ── Admin: settle all orders ──────────────────────────────────────────────

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

    const round: ConfirmedRound = {
      confirmedAt: new Date().toISOString(),
      orders: enriched.map(({ playerName, drink, price }) => ({ playerName, drink, price })),
    };

    const players = enriched.map((e) => e.playerName);
    this.submittingAll = true;

    const clearAndFinalize = () => {
      this.orderService.clearOrders(players).subscribe({
        next: () => this.finalizeSettle(round),
        error: () => this.finalizeSettle(round), // finalize even if clear fails
      });
    };

    if (!this.useWallets) {
      clearAndFinalize();
      return;
    }

    this.orderService.addToUsed(enriched.map((e) => ({ player: e.playerName, amount: e.amount }))).subscribe({
      next: clearAndFinalize,
      error: (err: Error) => {
        this.snackBar.open(`Error: ${err.message}`, 'Dismiss', { duration: 5000 });
        this.adminConfirmStep = false;
        this.submittingAll = false;
      },
    });
  }

  private finalizeSettle(round: ConfirmedRound): void {
    this.orderService.appendOrderHistory(round.confirmedAt, JSON.stringify(round.orders)).subscribe({
      next: () => this.afterHistorySaved(),
      error: () => this.afterHistorySaved(),
    });
  }

  private afterHistorySaved(): void {
    this.sheetsService.invalidateOrderHistoryCache();
    this.snackBar.open('Round confirmed!', 'OK', { duration: 3000 });
    this.adminConfirmStep = false;
    this.submittingAll = false;
    this.load();
    this.loadOrderHistory();
  }

  // ── Lock logic ────────────────────────────────────────────────────────────

  private get lockKey(): string {
    return `tmabet_order_lock_${(this.auth.username() ?? 'anon').toLowerCase().replace(/\s+/g, '_')}`;
  }

  private checkLock(): void {
    try {
      const raw = localStorage.getItem(this.lockKey);
      if (!raw) return;
      const lock = JSON.parse(raw) as { drink: string; lockedAt: number };
      const elapsed = Date.now() - lock.lockedAt;
      if (elapsed >= LOCK_DURATION_MS) {
        localStorage.removeItem(this.lockKey);
        return;
      }
      this.lockRemainingMs = LOCK_DURATION_MS - elapsed;
      this.startLockInterval();
    } catch {
      /* ignore */
    }
  }

  private setLock(drink: string): void {
    localStorage.setItem(this.lockKey, JSON.stringify({ drink, lockedAt: Date.now() }));
    this.lockRemainingMs = LOCK_DURATION_MS;
    this.startLockInterval();
  }

  private startLockInterval(): void {
    this.clearLockInterval();
    this.lockInterval = setInterval(() => {
      this.lockRemainingMs = Math.max(0, this.lockRemainingMs - 1000);
      if (this.lockRemainingMs === 0) {
        this.clearLockInterval();
        localStorage.removeItem(this.lockKey);
      }
    }, 1000);
  }

  private clearLockInterval(): void {
    if (this.lockInterval !== null) {
      clearInterval(this.lockInterval);
      this.lockInterval = null;
    }
  }

  get isLocked(): boolean {
    return this.lockRemainingMs > 0;
  }

  get lockRemainingLabel(): string {
    const totalSecs = Math.ceil(this.lockRemainingMs / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  // ── Order history (loaded from Sheets) ───────────────────────────────────

  loadOrderHistory(): void {
    this.loadingHistory = true;
    this.sheetsService.getOrderHistory().subscribe({
      next: (rounds) => {
        this.savedRounds = rounds;
        this.loadingHistory = false;
      },
      error: () => {
        this.loadingHistory = false;
      },
    });
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

  get orderedCount(): number {
    return this.orders.filter((o) => o.order).length;
  }

  get ordersWithDrinks(): OrderEntry[] {
    return this.orders.filter((o) => o.order.trim() !== '');
  }

  getPriceForOrder(drink: string): string {
    return this.menu.find((m) => m.drink === drink)?.price ?? '—';
  }

  get totalPrice(): number {
    return this.ordersWithDrinks.reduce((sum, o) => {
      const item = this.menu.find((m) => m.drink === o.order);
      return sum + this.parsePrice(item?.price ?? '0');
    }, 0);
  }

  formatTotal(n: number): string {
    return n.toLocaleString('en-US');
  }

  groupRound(orders: ConfirmedOrderEntry[]): { drink: string; count: number; players: string[]; total: number }[] {
    const map = new Map<string, { players: string[]; total: number }>();
    for (const o of orders) {
      const entry = map.get(o.drink);
      const amount = this.parsePrice(o.price);
      if (entry) {
        entry.players.push(o.playerName);
        entry.total += amount;
      } else {
        map.set(o.drink, { players: [o.playerName], total: amount });
      }
    }
    return Array.from(map.entries()).map(([drink, d]) => ({
      drink,
      count: d.players.length,
      players: d.players,
      total: d.total,
    }));
  }

  roundTotal(orders: ConfirmedOrderEntry[]): number {
    return orders.reduce((sum, o) => sum + this.parsePrice(o.price), 0);
  }
}
