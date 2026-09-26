import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiWacService, WacQuarantineItem } from '../../../core/api/api-wac.service';
@Component({ selector: 'app-wac-quarantine-page', standalone: true, imports: [CommonModule], template: `<section class="surface-card p-6"><h2 class="text-xl font-bold">WAC quarantine</h2>@if (loading()) { <p>Loading…</p> } @else if (error()) { <p class="text-rose-700">{{ error() }}</p> } @else { <table class="mt-4 w-full"><tbody>@for (item of items(); track item.id) { <tr><td>{{ item.productoNombre }}</td><td>{{ item.motivo }}</td><td>{{ item.movimientoOrigenId ?? '—' }}</td></tr> }</tbody></table> }</section>` })
export class WacQuarantinePageComponent { private readonly api = inject(ApiWacService); readonly items = signal<WacQuarantineItem[]>([]); readonly loading = signal(true); readonly error = signal<string | null>(null); async ngOnInit() { try { this.items.set(await firstValueFrom(this.api.quarantine())); } catch { this.error.set('Could not load WAC quarantine.'); } finally { this.loading.set(false); } } }
