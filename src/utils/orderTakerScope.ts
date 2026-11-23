import type { User } from '../store/authStore';
import type { StaffMember, Table, Ticket } from '../store/restaurantStore';

function normalizeName(val?: string | null): string {
  if (!val) return '';
  return val
    .replace(/\s*\((order taker|waiter|pos|staff|cashier|manager|admin)\)\s*/gi, '')
    .trim()
    .toLowerCase();
}

/**
 * Returns true strictly when the logged-in user is an Order Taker / Waiter.
 * Admins, Managers, Floor Managers, Cashiers, Kitchen, Juice Bar, and Playland return false.
 */
export function isOrderTakerUser(
  user?: User | null,
  activeStaff?: StaffMember | null,
  roleName?: string | null
): boolean {
  if (!user) return false;
  const uRole = (user.role || '').toString().trim().toLowerCase();
  if (
    uRole === 'admin' ||
    uRole === 'manager' ||
    uRole === 'floor_manager' ||
    uRole === 'floor manager' ||
    uRole === 'cashier' ||
    uRole === 'kitchen' ||
    uRole === 'juicebar' ||
    uRole === 'playland'
  ) {
    return false;
  }

  const customId = (user.customRoleId || activeStaff?.customRoleId || '').toLowerCase();
  const staffRole = (activeStaff?.role || '').toLowerCase();
  const rName = (roleName || '').toLowerCase();

  return (
    uRole === 'waiter' ||
    uRole === 'order_taker' ||
    uRole === 'ordertaker' ||
    uRole === 'order taker' ||
    customId === 'role-waiter' ||
    customId === 'role-order-taker' ||
    staffRole === 'waiter' ||
    staffRole === 'order taker' ||
    rName === 'waiter' ||
    rName === 'order taker'
  );
}

/**
 * Resolves the canonical identity (staffId, username, name) of the logged-in user.
 */
export function resolveOrderTakerIdentity(
  user?: User | null,
  staffList: StaffMember[] = []
): { staffId: string; username: string; name: string } {
  if (!user) return { staffId: '', username: '', name: '' };

  const matchedStaff = staffList.find(
    (s) =>
      (user.staffId && s.id === user.staffId) ||
      (user.id && s.id === user.id) ||
      (user.username && s.username && s.username.trim().toLowerCase() === user.username.trim().toLowerCase()) ||
      (user.name && s.name && normalizeName(s.name) === normalizeName(user.name))
  );

  return {
    staffId: (matchedStaff?.id || user.staffId || user.id || '').trim(),
    username: (matchedStaff?.username || user.username || '').trim().toLowerCase(),
    name: normalizeName(matchedStaff?.name || user.name || ''),
  };
}

/**
 * Strict ownership check: returns true ONLY when the given order/ticket/alert was placed by this exact user.
 * Prevents Order Taker A from seeing Order Taker B's orders or receiving Order Taker B's KDS notifications.
 */
export function doesOrderBelongToUser(
  orderRef: { server?: string | null; serverId?: string | null } | null | undefined,
  user?: User | null,
  staffList: StaffMember[] = []
): boolean {
  if (!orderRef || !user) return false;
  const identity = resolveOrderTakerIdentity(user, staffList);

  const refId = (orderRef.serverId || '').trim();
  if (refId && identity.staffId) {
    return refId === identity.staffId;
  }

  const refName = normalizeName(orderRef.server);
  if (!refName) return false;

  if (identity.name && refName === identity.name) return true;
  if (identity.username && refName === identity.username) return true;

  // Also check raw user.name in case staff record name differs slightly from auth display name
  const rawAuthName = normalizeName(user.name);
  if (rawAuthName && refName === rawAuthName) return true;

  return false;
}

/**
 * Checks whether an occupied/billed table belongs to this Order Taker
 * (either via table.server/serverId or via any active ticket on that table).
 */
export function isTableOwnedByUser(
  table: Table,
  tickets: Ticket[],
  user?: User | null,
  staffList: StaffMember[] = []
): boolean {
  if (doesOrderBelongToUser({ server: table.server, serverId: table.serverId }, user, staffList)) {
    return true;
  }
  const tableTickets = tickets.filter((t) => t.tableId === table.id);
  return tableTickets.some((t) =>
    doesOrderBelongToUser({ server: t.server, serverId: t.serverId }, user, staffList)
  );
}
