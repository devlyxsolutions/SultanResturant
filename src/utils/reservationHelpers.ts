import { getTableFloor } from '../constants/floors';
import type { Reservation, Table } from '../store/restaurantStore';

/**
 * Finds the active ('confirmed' or 'seated') reservation associated with a table,
 * checking direct reservationId, primary tableId, mergedInto primary table, AND linkedTableIds.
 */
export function findTableReservation(
  table: Table | null | undefined,
  reservations: Reservation[] | null | undefined,
  statuses: Reservation['status'][] = ['confirmed', 'seated']
): Reservation | undefined {
  if (!table || !Array.isArray(reservations) || reservations.length === 0) return undefined;

  return reservations.find((r) => {
    if (!r || !statuses.includes(r.status)) return false;
    if (table.reservationId && r.id === table.reservationId) return true;
    if (r.tableId === table.id) return true;
    if (Array.isArray(r.linkedTableIds) && r.linkedTableIds.includes(table.id)) return true;
    if (table.mergedInto && (r.tableId === table.mergedInto || (Array.isArray(r.linkedTableIds) && r.linkedTableIds.includes(table.mergedInto)))) {
      return true;
    }
    return false;
  });
}

/**
 * Returns true if the reservation represents a multi-table or large-party Group / Event Arrangement.
 */
export function isGroupReservation(res: Reservation | null | undefined): boolean {
  if (!res) return false;
  if (res.bookingType === 'group_event') return true;
  if (res.isFullFloor) return true;
  if ((res.guestsCount || 0) >= 10) return true;
  if (Array.isArray(res.linkedTableIds) && res.linkedTableIds.length > 0) return true;
  return false;
}

/**
 * Resolves the floor name for a reservation (preferring explicit res.floor, falling back to primary table's floor).
 */
export function getReservationFloor(res: Reservation, tables: Table[]): string {
  if (res.floor && res.floor.trim()) return res.floor.trim();
  const primary = tables.find((t) => t.id === res.tableId);
  if (primary) return getTableFloor(primary);
  return 'Main Floor';
}

/**
 * Returns all active ('confirmed' or 'seated') reservations hosted on a given floor.
 */
export function getFloorActiveReservations(
  reservations: Reservation[] | null | undefined,
  tables: Table[] | null | undefined,
  floorName: string
): Reservation[] {
  if (!Array.isArray(reservations)) return [];
  const safeTables = Array.isArray(tables) ? tables : [];
  const target = (floorName || '').trim().toLowerCase();
  return reservations
    .filter((r) => {
      if (!r || (r.status !== 'confirmed' && r.status !== 'seated')) return false;
      if (!target || target === 'all') return true;
      const rFloor = getReservationFloor(r, safeTables).toLowerCase();
      return rFloor === target || rFloor.includes(target) || target.includes(rFloor);
    })
    .sort((a, b) => (a.reservationDate + a.timeSlot).localeCompare(b.reservationDate + b.timeSlot));
}

/**
 * Returns total unit count covered by a reservation (primary + linked tables).
 */
export function getReservationTableCount(res: Reservation): number {
  return 1 + (Array.isArray(res.linkedTableIds) ? res.linkedTableIds.length : 0);
}
