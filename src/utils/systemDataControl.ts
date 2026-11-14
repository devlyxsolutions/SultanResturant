import { SULTAN_DEFAULT_CATEGORIES, SULTAN_DEFAULT_MENU } from '../constants/defaultMenu';
import { useRestaurantStore } from '../store/restaurantStore';
import { useRoleStore } from '../store/roleStore';
import { useShiftStore } from '../store/shiftStore';
import { useSettingsStore } from '../store/settingsStore';
import { useOpsStore, getOpsSyncState } from '../store/opsStore';
import { useKitchenStore, getKitchenSyncState } from '../store/kitchenStore';
import { broadcastImmediately } from '../services/syncService';

export interface SystemBackupPayload {
  version: number;
  exportedAt: number;
  exportedAtIso: string;
  data: {
    tables: any[];
    tickets: any[];
    deletedTicketIds: string[];
    invoices: any[];
    customers: any[];
    menuItems: any[];
    categories: string[];
    regions: string[];
    zones: string[];
    staff: any[];
    reservations: any[];
    onlineOrders: any[];
    roles: any[];
    shifts: any[];
    activeShiftId: string | null;
    systemSettings: any;
    ops: Record<string, any>;
    kitchen: Record<string, any>;
  };
}

export function buildSystemBackupPayload(): SystemBackupPayload {
  const rs = useRestaurantStore.getState();
  const roleState = useRoleStore.getState();
  const shiftState = useShiftStore.getState();
  const settingsState = useSettingsStore.getState();
  const now = Date.now();

  return {
    version: 1,
    exportedAt: now,
    exportedAtIso: new Date(now).toISOString(),
    data: {
      tables: rs.tables || [],
      tickets: rs.tickets || [],
      deletedTicketIds: rs.deletedTicketIds || [],
      invoices: rs.invoices || [],
      customers: rs.customers || [],
      menuItems: rs.menuItems || [],
      categories: rs.categories || [],
      regions: rs.regions || [],
      zones: rs.zones || [],
      staff: rs.staff || [],
      reservations: rs.reservations || [],
      onlineOrders: rs.onlineOrders || [],
      roles: roleState.roles || [],
      shifts: shiftState.shifts || [],
      activeShiftId: shiftState.activeShiftId || null,
      systemSettings: settingsState.settings,
      ops: getOpsSyncState(),
      kitchen: getKitchenSyncState(),
    },
  };
}

export function restoreSystemBackupPayload(rawJson: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const data = parsed?.data || parsed;
    if (!data || typeof data !== 'object') {
      return { ok: false, message: 'Invalid backup JSON structure.' };
    }

    useRestaurantStore.setState((prev) => ({
      ...prev,
      ...(Array.isArray(data.tables) ? { tables: data.tables } : {}),
      ...(Array.isArray(data.tickets) ? { tickets: data.tickets } : {}),
      ...(Array.isArray(data.deletedTicketIds) ? { deletedTicketIds: data.deletedTicketIds } : {}),
      ...(Array.isArray(data.invoices) ? { invoices: data.invoices } : {}),
      ...(Array.isArray(data.customers) ? { customers: data.customers } : {}),
      ...(Array.isArray(data.menuItems) ? { menuItems: data.menuItems } : {}),
      ...(Array.isArray(data.categories) ? { categories: data.categories } : {}),
      ...(Array.isArray(data.regions) ? { regions: data.regions } : {}),
      ...(Array.isArray(data.zones) ? { zones: data.zones } : {}),
      ...(Array.isArray(data.staff) ? { staff: data.staff } : {}),
      ...(Array.isArray(data.reservations) ? { reservations: data.reservations } : {}),
      ...(Array.isArray(data.onlineOrders) ? { onlineOrders: data.onlineOrders } : {}),
    }));

    if (Array.isArray(data.roles)) {
      useRoleStore.setState({ roles: data.roles });
    }
    if (Array.isArray(data.shifts)) {
      useShiftStore.setState({
        shifts: data.shifts,
        activeShiftId: data.activeShiftId ?? null,
      });
    }
    if (data.systemSettings && typeof data.systemSettings === 'object') {
      useSettingsStore.getState().updateSettings(data.systemSettings);
    }
    if (data.ops && typeof data.ops === 'object') {
      useOpsStore.getState().syncFromServer(data.ops);
    }
    if (data.kitchen && typeof data.kitchen === 'object') {
      useKitchenStore.getState().syncFromServer(data.kitchen);
    }

    broadcastImmediately();
    return { ok: true, message: 'System backup restored and synced across devices.' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to parse backup JSON.' };
  }
}

export function clearAllActiveTicketsAndReleaseTables(): number {
  const rs = useRestaurantStore.getState();
  const ticketIds = (rs.tickets || []).map((t) => t.id);
  const nextDeleted = Array.from(new Set([...(rs.deletedTicketIds || []), ...ticketIds])).slice(-200);

  useRestaurantStore.setState((state) => ({
    tickets: [],
    deletedTicketIds: nextDeleted,
    pendingFloorOrderAlert: null,
    tables: (state.tables || []).map((t) => ({
      ...t,
      status: 'available',
      assignedWaiter: undefined,
      seatedAt: undefined,
      activeOrderId: undefined,
    })),
  }));

  broadcastImmediately();
  return ticketIds.length;
}

export function clearSalesAndInvoices(): number {
  const rs = useRestaurantStore.getState();
  const count = (rs.invoices || []).length;
  useRestaurantStore.setState({
    invoices: [],
    onlineOrders: [],
  });
  broadcastImmediately();
  return count;
}

export function clearCustomerCrm(): number {
  const rs = useRestaurantStore.getState();
  const count = (rs.customers || []).length;
  useRestaurantStore.setState({ customers: [] });
  broadcastImmediately();
  return count;
}

export function resetMenuToFactoryDefaults(): void {
  useRestaurantStore.setState({
    menuItems: SULTAN_DEFAULT_MENU,
    categories: SULTAN_DEFAULT_CATEGORIES,
  });
  broadcastImmediately();
}

export function resetAllOperationalData(): void {
  clearAllActiveTicketsAndReleaseTables();
  useRestaurantStore.setState({
    invoices: [],
    onlineOrders: [],
    reservations: [],
  });
  useShiftStore.setState({
    shifts: [],
    activeShiftId: null,
  });
  broadcastImmediately();
}

