import { useAuthStore } from '../store/authStore';
import { useRestaurantStore } from '../store/restaurantStore';
import { useOpsStore } from '../store/opsStore';
import { useKitchenStore } from '../store/kitchenStore';
import { useShiftStore } from '../store/shiftStore';
import { useDiscountStore } from '../store/discountStore';
import { useRoleStore } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePlaylandStore } from '../store/playlandStore';
import { useCallStore } from '../store/callStore';
import { recordSystemLog, type LogEventInput } from './auditLogService';
import type { AuditActionType, AuditModule, AuditSeverity } from '../store/systemLogStore';

let installed = false;
let internalDepth = 0;

/** Actions that are purely internal plumbing / sync / UI-filter state and must NOT pollute audit logs */
const IGNORED_ACTIONS = new Set([
  'syncFromServer',
  'setHasHydrated',
  'getActiveShift',
  'getRoleById',
  'getEffectivePermissions',
  'setFilter',
  'setSearchQuery',
  'setActiveShiftId',
  'processNewTickets',
  'clearBillPaidAlert',
  'clearFoodReadyAlert',
  'clearPendingFloorOrderAlert',
  'clearBeverageOrderAlert',
  'clearTableMoveAlert',
  'clearOrderCancelledAlert',
  'dismissActiveCall',
  'syncServiceStatus',
  'registerStaffSession',
  'unregisterStaffSession',
]);

type ActionDescriptor = (
  args: any[],
  prevState: any,
  result: any
) => LogEventInput | null;

function fmtRs(val?: number): string {
  const n = Number(val || 0);
  return `Rs. ${n.toLocaleString()}`;
}

function findTableName(state: any, tableId?: string): string {
  if (!tableId) return 'Unknown Table';
  if (tableId === 'takeaway') return 'Takeaway';
  if (tableId === 'delivery') return 'Delivery';
  const t = (state?.tables || []).find((x: any) => x && x.id === tableId);
  return t ? `${t.name}${t.floor ? ` (${t.floor})` : ''}` : String(tableId);
}

function findTicketLabel(state: any, ticketId?: string): string {
  const tk = (state?.tickets || []).find((x: any) => x && x.id === ticketId);
  if (!tk) return String(ticketId || 'Ticket');
  return `${tk.id} • ${tk.tableName || tk.tableId}`;
}

function findById(list: any[] | undefined, id?: string): any {
  if (!Array.isArray(list) || !id) return null;
  return list.find((x) => x && x.id === id) || null;
}

const AUTH_HANDLERS: Record<string, ActionDescriptor> = {
  login: ([name, role, meta]) => ({
    module: 'AUTH',
    action: 'USER_LOGIN',
    actionType: 'AUTH',
    severity: 'success',
    entityType: 'Staff',
    entityId: meta?.staffId,
    entityName: name,
    summary: `${name} (${meta?.username || role}) signed in to the system`,
    details: { role, username: meta?.username, assignedZones: meta?.assignedZones, sessionId: meta?.sessionId },
    actorOverride: {
      id: meta?.staffId || name,
      name: String(name || 'Staff'),
      username: meta?.username,
      role: String(meta?.customRoleId === 'role-cashier' ? 'Cashier' : role || 'Staff'),
      sessionId: meta?.sessionId,
    },
  }),
  logout: (_args, prev) => {
    const u = prev?.user;
    if (!u) return null;
    return {
      module: 'AUTH',
      action: 'USER_LOGOUT',
      actionType: 'AUTH',
      severity: 'info',
      entityType: 'Staff',
      entityId: u.staffId || u.id,
      entityName: u.name,
      summary: `${u.name} (${u.username || u.role}) logged out`,
      details: { sessionId: u.sessionId, role: u.role },
      actorOverride: {
        id: u.staffId || u.id,
        name: u.name,
        username: u.username,
        role: u.customRoleId === 'role-cashier' ? 'Cashier' : String(u.role || 'Staff'),
        sessionId: u.sessionId,
      },
    };
  },
  silentLogout: (_args, prev) => {
    const u = prev?.user;
    if (!u) return null;
    return {
      module: 'AUTH',
      action: 'SESSION_FORCE_LOGOUT',
      actionType: 'SECURITY',
      severity: 'warning',
      entityType: 'Staff',
      entityId: u.staffId || u.id,
      entityName: u.name,
      summary: `${u.name} session was force-logged out (another device login or admin kick)`,
      details: { sessionId: u.sessionId, role: u.role },
      actorOverride: {
        id: u.staffId || u.id,
        name: u.name,
        username: u.username,
        role: u.customRoleId === 'role-cashier' ? 'Cashier' : String(u.role || 'Staff'),
        sessionId: u.sessionId,
      },
    };
  },
  updateUserZones: ([zone, zones], prev) => ({
    module: 'AUTH',
    action: 'UPDATE_USER_ZONES',
    actionType: 'UPDATE',
    severity: 'info',
    entityType: 'Staff',
    entityName: prev?.user?.name,
    summary: `Updated active floor zones to ${(zones && zones.join(', ')) || zone || 'All'}`,
    details: { zone, zones },
  }),
};

const RESTAURANT_HANDLERS: Record<string, ActionDescriptor> = {
  placeOrder: ([tableId, serverName, orderItems, isAddOn], prev) => {
    const tName = findTableName(prev, tableId);
    const items = Array.isArray(orderItems) ? orderItems : [];
    const totalQty = items.reduce((s: number, it: any) => s + Number(it?.qty || 1), 0);
    const totalAmt = items.reduce((s: number, it: any) => s + Number(it?.item?.price || 0) * Number(it?.qty || 1), 0);
    const names = items.slice(0, 4).map((it: any) => `${it?.qty || 1}x ${it?.item?.name || 'Item'}`).join(', ');
    return {
      module: 'POS_ORDERS',
      action: isAddOn ? 'PLACE_ADDON_KOT' : 'PLACE_ORDER_KOT',
      actionType: 'PLACE',
      severity: 'success',
      entityType: 'Table',
      entityId: tableId,
      entityName: tName,
      amount: totalAmt,
      summary: `${isAddOn ? 'Placed Add-On KOT' : 'Placed Order KOT'} for ${tName} (${totalQty} items: ${names}${items.length > 4 ? ` +${items.length - 4} more` : ''})`,
      details: { tableId, tableName: tName, serverName, isAddOn: !!isAddOn, itemCount: items.length, totalQty, totalAmt, items: items.map((i: any) => ({ name: i?.item?.name, qty: i?.qty, price: i?.item?.price, notes: i?.notes, station: i?.item?.station })) },
    };
  },
  startCookingTicket: ([ticketId, station], prev) => ({
    module: station === 'juice' ? 'JUICE_BAR' : 'KITCHEN_KDS',
    action: 'START_COOKING',
    actionType: 'STATUS_CHANGE',
    severity: 'info',
    entityType: 'Ticket',
    entityId: ticketId,
    entityName: findTicketLabel(prev, ticketId),
    summary: `Started cooking ${findTicketLabel(prev, ticketId)} (${station === 'juice' ? 'Juice Bar' : 'Main Kitchen'})`,
    details: { ticketId, station: station || 'main' },
  }),
  markItemReady: ([ticketId, itemId, station], prev) => {
    const tk = findById(prev?.tickets, ticketId);
    const item = findById(tk?.items, itemId);
    return {
      module: station === 'juice' ? 'JUICE_BAR' : 'KITCHEN_KDS',
      action: 'MARK_ITEM_READY',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'TicketItem',
      entityId: itemId,
      entityName: item?.name || itemId,
      summary: `Marked "${item?.name || itemId}" READY on ${findTicketLabel(prev, ticketId)}`,
      details: { ticketId, itemId, itemName: item?.name, station: station || item?.station || 'main' },
    };
  },
  markItemServed: ([ticketId, itemId, station], prev) => {
    const tk = findById(prev?.tickets, ticketId);
    const item = findById(tk?.items, itemId);
    return {
      module: 'POS_ORDERS',
      action: 'MARK_ITEM_SERVED',
      actionType: 'STATUS_CHANGE',
      severity: 'info',
      entityType: 'TicketItem',
      entityId: itemId,
      entityName: item?.name || itemId,
      summary: `Marked "${item?.name || itemId}" SERVED on ${findTicketLabel(prev, ticketId)}`,
      details: { ticketId, itemId, itemName: item?.name, station: station || item?.station || 'main' },
    };
  },
  toggleTicketItem: ([ticketId, itemId], prev) => {
    const tk = findById(prev?.tickets, ticketId);
    const item = findById(tk?.items, itemId);
    return {
      module: 'KITCHEN_KDS',
      action: 'TOGGLE_TICKET_ITEM',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'TicketItem',
      entityId: itemId,
      entityName: item?.name || itemId,
      summary: `Toggled item "${item?.name || itemId}" completion on ${findTicketLabel(prev, ticketId)}`,
      details: { ticketId, itemId, wasCompleted: item?.completed },
    };
  },
  bumpTicket: ([ticketId, station], prev) => ({
    module: station === 'juice' ? 'JUICE_BAR' : 'KITCHEN_KDS',
    action: 'BUMP_TICKET_READY',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'Ticket',
    entityId: ticketId,
    entityName: findTicketLabel(prev, ticketId),
    summary: `Bumped / Marked READY ticket ${findTicketLabel(prev, ticketId)} (${station || 'all'})`,
    details: { ticketId, station: station || 'all' },
  }),
  updateTicketStatus: ([ticketId, status, station], prev) => ({
    module: station === 'juice' ? 'JUICE_BAR' : 'KITCHEN_KDS',
    action: `TICKET_STATUS_${String(status || '').toUpperCase()}`,
    actionType: 'STATUS_CHANGE',
    severity: status === 'ready' || status === 'served' ? 'success' : 'info',
    entityType: 'Ticket',
    entityId: ticketId,
    entityName: findTicketLabel(prev, ticketId),
    summary: `Changed ${findTicketLabel(prev, ticketId)} status to ${String(status || '').toUpperCase()}`,
    details: { ticketId, status, station: station || 'all' },
  }),
  serveTableTickets: ([tableId], prev) => ({
    module: 'POS_ORDERS',
    action: 'SERVE_TABLE_ORDERS',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'Table',
    entityId: tableId,
    entityName: findTableName(prev, tableId),
    summary: `Marked all ready orders SERVED for ${findTableName(prev, tableId)}`,
    details: { tableId },
  }),
  dismissTicket: ([ticketId, options], prev) => {
    if (options?.isSettlementCleanup) return null;
    const tk = findById(prev?.tickets, ticketId);
    const items = Array.isArray(tk?.items) ? tk.items : [];
    const totalAmt = items.reduce((s: number, it: any) => s + Number(it?.price || 0) * Number(it?.qty || 1), 0);
    const totalQty = items.reduce((s: number, it: any) => s + Number(it?.qty || 1), 0);
    const reason = typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : '';
    const itemSummary = items.slice(0, 4).map((i: any) => `${i.qty || 1}x ${i.name}`).join(', ');
    return {
      module: 'POS_ORDERS',
      action: 'CANCEL_PUNCHED_ORDER',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'Ticket',
      entityId: ticketId,
      entityName: findTicketLabel(prev, ticketId),
      amount: totalAmt,
      summary: `Cancelled punched KOT ${findTicketLabel(prev, ticketId)} (${totalQty} items, ${fmtRs(totalAmt)}: ${itemSummary}${items.length > 4 ? ` +${items.length - 4} more` : ''})${reason ? ` • Reason: "${reason}"` : ''}`,
      details: {
        ticketId,
        tableId: tk?.tableId,
        tableName: tk?.tableName,
        server: tk?.server,
        cancelledBy: options?.cancelledBy,
        reason: reason || 'Cancelled from POS Running Orders',
        source: options?.source || 'cancel_ticket',
        totalQty,
        totalAmount: totalAmt,
        items: items.map((i: any) => ({ name: i.name, qty: i.qty, price: i.price, lineTotal: (i.price || 0) * (i.qty || 1), notes: i.notes, station: i.station })),
      },
    };
  },
  clearTableTickets: ([tableId, options], prev) => {
    if (options?.isSettlementCleanup) return null;
    const tableTickets = (prev?.tickets || []).filter((t: any) => t?.tableId === tableId);
    const count = tableTickets.length;
    const allItems = tableTickets.flatMap((t: any) => t?.items || []);
    const totalAmt = allItems.reduce((s: number, it: any) => s + Number(it?.price || 0) * Number(it?.qty || 1), 0);
    const reason = typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : '';
    return {
      module: 'POS_ORDERS',
      action: 'CANCEL_TABLE_PUNCHED_ORDERS',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'Table',
      entityId: tableId,
      entityName: findTableName(prev, tableId),
      amount: totalAmt,
      summary: `Cancelled ${count} punched KOT(s) & released ${findTableName(prev, tableId)} (${allItems.length} lines, ${fmtRs(totalAmt)})${reason ? ` • Reason: "${reason}"` : ''}`,
      details: {
        tableId,
        clearedCount: count,
        cancelledBy: options?.cancelledBy,
        reason: reason || 'Table released without billing',
        source: options?.source || 'release_table',
        totalAmount: totalAmt,
        ticketIds: tableTickets.map((t: any) => t.id),
        items: allItems.map((i: any) => ({ name: i.name, qty: i.qty, price: i.price, lineTotal: (i.price || 0) * (i.qty || 1) })),
      },
    };
  },
  clearAllOldTickets: ([options], prev) => {
    if (options?.isSettlementCleanup) return null;
    const allTickets = prev?.tickets || [];
    const totalAmt = allTickets.reduce(
      (sum: number, tk: any) => sum + (tk?.items || []).reduce((s: number, it: any) => s + Number(it?.price || 0) * Number(it?.qty || 1), 0),
      0
    );
    const reason = typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : '';
    return {
      module: 'KITCHEN_KDS',
      action: 'PURGE_ALL_PUNCHED_ORDERS',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'KDS',
      amount: totalAmt,
      summary: `Purged/cancelled all ${allTickets.length} active punched KOT tickets (${fmtRs(totalAmt)})${reason ? ` • Reason: "${reason}"` : ''}`,
      details: {
        previousTicketCount: allTickets.length,
        totalAmount: totalAmt,
        cancelledBy: options?.cancelledBy,
        reason: reason || 'Purged all running tickets',
      },
    };
  },
  logCancelledPunchedItems: ([entry]) => ({
    module: 'POS_ORDERS',
    action: 'CANCEL_PUNCHED_ITEMS_AT_BILLING',
    actionType: 'CANCEL',
    severity: 'critical',
    entityType: 'Ticket',
    entityId: entry?.ticketId,
    entityName: `${entry?.tableName || entry?.tableId || 'POS'} (${entry?.ticketId || 'Punched'})`,
    amount: Number(entry?.totalAmount || 0),
    summary: `Removed ${entry?.totalQty || 0} punched dish(es) (${fmtRs(entry?.totalAmount)}) from ${entry?.tableName || 'order'} during billing • Reason: "${entry?.reason || 'Removed at billing'}"`,
    details: {
      ticketId: entry?.ticketId,
      tableId: entry?.tableId,
      tableName: entry?.tableName,
      cancelledBy: entry?.cancelledBy,
      reason: entry?.reason,
      items: entry?.items,
      totalAmount: entry?.totalAmount,
    },
  }),
  markTableBilled: ([tableId, invoiceId], prev) => {
    const t = findById(prev?.tables, tableId);
    return {
      module: 'INVOICES_BILLING',
      action: 'TABLE_BILLED',
      actionType: 'PAYMENT',
      severity: 'info',
      entityType: 'Table',
      entityId: tableId,
      entityName: findTableName(prev, tableId),
      amount: t?.billTotal,
      summary: `Marked ${findTableName(prev, tableId)} as BILLED${invoiceId ? ` (Invoice ${invoiceId})` : ''} — ${fmtRs(t?.billTotal)}`,
      details: { tableId, invoiceId, billTotal: t?.billTotal },
    };
  },
  settleBill: ([tableId], prev) => {
    const t = findById(prev?.tables, tableId);
    return {
      module: 'TABLES_FLOORS',
      action: 'SETTLE_RELEASE_TABLE',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'Table',
      entityId: tableId,
      entityName: findTableName(prev, tableId),
      amount: t?.billTotal,
      summary: `Released & settled ${findTableName(prev, tableId)} (back to Available)`,
      details: { tableId, previousBillTotal: t?.billTotal, previousStatus: t?.status },
    };
  },
  saveInvoice: ([invoice]) => {
    const methods = (invoice?.payments || []).map((p: any) => `${p.type}:${p.amount}`).join(', ');
    return {
      module: 'INVOICES_BILLING',
      action: 'SAVE_INVOICE_PAYMENT',
      actionType: 'PAYMENT',
      severity: 'success',
      entityType: 'Invoice',
      entityId: invoice?.id,
      entityName: `${invoice?.id} • ${invoice?.tableName || invoice?.orderType || 'POS'}`,
      amount: Number(invoice?.total || 0),
      summary: `Settled Invoice ${invoice?.id} (${invoice?.tableName || invoice?.orderType}) — ${fmtRs(invoice?.total)}${invoice?.discount ? ` (Disc ${fmtRs(invoice.discount)})` : ''} [${methods || 'Cash'}]`,
      details: {
        invoiceId: invoice?.id,
        orderType: invoice?.orderType,
        tableName: invoice?.tableName,
        customerName: invoice?.customerName,
        subTotal: invoice?.subTotal,
        discount: invoice?.discount,
        tax: invoice?.tax,
        total: invoice?.total,
        payments: invoice?.payments,
        itemsCount: (invoice?.items || []).length,
      },
    };
  },
  voidInvoice: ([invoiceId, reason, voidedBy], prev) => {
    const inv = findById(prev?.invoices, invoiceId);
    return {
      module: 'INVOICES_BILLING',
      action: 'VOID_INVOICE',
      actionType: 'VOID',
      severity: 'critical',
      entityType: 'Invoice',
      entityId: invoiceId,
      entityName: inv?.tableName ? `${invoiceId} • ${inv.tableName}` : invoiceId,
      amount: Number(inv?.total || 0),
      summary: `VOIDED Invoice ${invoiceId} (${fmtRs(inv?.total)})${reason ? ` — Reason: ${reason}` : ''}`,
      details: { invoiceId, reason, voidedBy, previousTotal: inv?.total, tableName: inv?.tableName },
    };
  },
  deleteInvoice: ([invoiceId], prev) => {
    const inv = findById(prev?.invoices, invoiceId);
    return {
      module: 'INVOICES_BILLING',
      action: 'DELETE_INVOICE',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Invoice',
      entityId: invoiceId,
      amount: Number(inv?.total || 0),
      summary: `DELETED Invoice ${invoiceId} (${fmtRs(inv?.total)}) permanently`,
      details: { invoiceId, previousTotal: inv?.total, tableName: inv?.tableName },
    };
  },
  processSalesReturn: ([input]) => ({
    module: 'RETURNS_REFUNDS',
    action: 'PROCESS_SALES_RETURN',
    actionType: 'REFUND',
    severity: 'warning',
    entityType: 'SalesReturn',
    entityId: input?.invoiceId,
    entityName: input?.invoiceId,
    amount: Number(input?.refundAmount || 0),
    summary: `Processed Sales Return / Refund of ${fmtRs(input?.refundAmount)} against Invoice ${input?.invoiceId} (${input?.reason || 'Return'})`,
    details: { invoiceId: input?.invoiceId, refundAmount: input?.refundAmount, refundMethod: input?.refundMethod, reason: input?.reason, items: input?.items },
  }),
  cancelSalesReturn: ([returnId, by], prev) => {
    const sr = findById(prev?.salesReturns, returnId);
    return {
      module: 'RETURNS_REFUNDS',
      action: 'CANCEL_SALES_RETURN',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'SalesReturn',
      entityId: returnId,
      amount: Number(sr?.refundAmount || 0),
      summary: `Cancelled Sales Return ${returnId} (${fmtRs(sr?.refundAmount)})`,
      details: { returnId, by, previousRefund: sr?.refundAmount },
    };
  },
  confirmOnlineOrder: ([orderId, assignedWaiter], prev) => {
    const ord = (prev?.onlineOrders || []).find((o: any) => o && (o.id === orderId || o.orderNumber === orderId));
    return {
      module: 'ONLINE_DELIVERY',
      action: 'CONFIRM_ONLINE_ORDER',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'OnlineOrder',
      entityId: orderId,
      entityName: ord?.orderNumber || orderId,
      amount: Number(ord?.total || 0),
      summary: `Confirmed Online/App Order ${ord?.orderNumber || orderId} (${ord?.orderType || 'order'}, ${fmtRs(ord?.total)})${assignedWaiter ? ` → Assigned: ${assignedWaiter}` : ''}`,
      details: { orderId, orderNumber: ord?.orderNumber, orderType: ord?.orderType, assignedWaiter, customer: ord?.customer, total: ord?.total },
    };
  },
  rejectOnlineOrder: ([orderId, reason], prev) => {
    const ord = (prev?.onlineOrders || []).find((o: any) => o && (o.id === orderId || o.orderNumber === orderId));
    return {
      module: 'ONLINE_DELIVERY',
      action: 'CANCEL_REJECT_ONLINE_ORDER',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'OnlineOrder',
      entityId: orderId,
      entityName: ord?.orderNumber || orderId,
      amount: Number(ord?.total || 0),
      summary: `Cancelled/Rejected Online Order ${ord?.orderNumber || orderId} (${fmtRs(ord?.total)})${reason ? ` — Reason: ${reason}` : ''}`,
      details: { orderId, orderNumber: ord?.orderNumber, reason, total: ord?.total },
    };
  },
  transferTable: ([fromId, toId, note, movedBy], prev) => {
    const fromTable = findById(prev?.tables, fromId);
    const toTable = findById(prev?.tables, toId);
    const fromName = findTableName(prev, fromId);
    const toName = findTableName(prev, toId);
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    const activeTicketCount = (prev?.tickets || []).filter((tk: any) => tk?.tableId === fromId).length;
    const billTotal = Number(fromTable?.billTotal || 0);
    return {
      module: 'TABLES_FLOORS',
      action: 'MOVE_TABLE',
      actionType: 'TRANSFER',
      severity: 'warning',
      entityType: 'Table',
      entityId: `${fromId}->${toId}`,
      entityName: `${fromName} → ${toName}`,
      ...(billTotal > 0 ? { amount: billTotal } : {}),
      summary: `Moved table ${fromName} → ${toName} (${activeTicketCount} KOT${billTotal > 0 ? `, ${fmtRs(billTotal)}` : ''})${cleanNote ? ` • Note: "${cleanNote}"` : ''}`,
      details: {
        fromTableId: fromId,
        fromTableName: fromTable?.name || fromName,
        fromFloor: fromTable?.floor || fromTable?.zone,
        toTableId: toId,
        toTableName: toTable?.name || toName,
        toFloor: toTable?.floor || toTable?.zone,
        note: cleanNote || '(No note entered)',
        movedBy: movedBy || fromTable?.server || undefined,
        activeTicketCount,
        billTotal,
        previousStatus: fromTable?.status,
      },
    };
  },
  mergeTables: ([primaryId, secondaryId], prev) => ({
    module: 'TABLES_FLOORS',
    action: 'MERGE_TABLES',
    actionType: 'UPDATE',
    severity: 'warning',
    entityType: 'Table',
    entityId: primaryId,
    summary: `Merged table ${findTableName(prev, secondaryId)} into ${findTableName(prev, primaryId)}`,
    details: { primaryTableId: primaryId, secondaryTableId: secondaryId },
  }),
  assignTableServer: ([tableId, serverName], prev) => ({
    module: 'TABLES_FLOORS',
    action: 'ASSIGN_TABLE_SERVER',
    actionType: 'UPDATE',
    severity: 'info',
    entityType: 'Table',
    entityId: tableId,
    entityName: findTableName(prev, tableId),
    summary: `Assigned server "${serverName}" to ${findTableName(prev, tableId)}`,
    details: { tableId, serverName },
  }),
  addTable: ([tbl]) => ({
    module: 'TABLES_FLOORS',
    action: 'CREATE_TABLE',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Table',
    entityName: tbl?.name,
    summary: `Created table/unit "${tbl?.name}" (${tbl?.seats || 4} seats, ${tbl?.floor || tbl?.zone || 'Floor'})`,
    details: { table: tbl },
  }),
  updateTable: ([id, patch], prev) => ({
    module: 'TABLES_FLOORS',
    action: 'UPDATE_TABLE',
    actionType: 'UPDATE',
    severity: 'info',
    entityType: 'Table',
    entityId: id,
    entityName: findTableName(prev, id),
    summary: `Updated ${findTableName(prev, id)} (${Object.keys(patch || {}).join(', ')})`,
    details: { id, patch },
  }),
  deleteTable: ([id], prev) => ({
    module: 'TABLES_FLOORS',
    action: 'DELETE_TABLE',
    actionType: 'DELETE',
    severity: 'critical',
    entityType: 'Table',
    entityId: id,
    entityName: findTableName(prev, id),
    summary: `Deleted table/unit ${findTableName(prev, id)}`,
    details: { id },
  }),
  addFloor: ([fl]) => ({
    module: 'TABLES_FLOORS',
    action: 'CREATE_FLOOR',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Floor',
    entityName: fl?.name,
    summary: `Added new floor "${fl?.name}"`,
    details: { floor: fl },
  }),
  updateFloor: ([id, patch], prev) => {
    const f = findById(prev?.floors, id);
    return {
      module: 'TABLES_FLOORS',
      action: 'UPDATE_FLOOR',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Floor',
      entityId: id,
      entityName: f?.name || id,
      summary: `Updated floor "${f?.name || id}"`,
      details: { id, patch },
    };
  },
  deleteFloor: ([id, cascade], prev) => {
    const f = findById(prev?.floors, id);
    return {
      module: 'TABLES_FLOORS',
      action: 'DELETE_FLOOR',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Floor',
      entityId: id,
      entityName: f?.name || id,
      summary: `Deleted floor "${f?.name || id}"${cascade ? ' (including its tables)' : ''}`,
      details: { id, cascadeDeleteTables: !!cascade },
    };
  },
  addReservation: ([res]) => ({
    module: 'RESERVATIONS',
    action: 'CREATE_RESERVATION',
    actionType: 'CREATE',
    severity: 'success',
    entityType: 'Reservation',
    entityName: res?.customerName,
    summary: `Booked reservation for ${res?.customerName} (${res?.guests || res?.partySize || '?'} guests, ${res?.date || ''} ${res?.time || ''})`,
    details: { reservation: res },
  }),
  updateReservation: ([id, patch], prev) => {
    const r = findById(prev?.reservations, id);
    return {
      module: 'RESERVATIONS',
      action: 'UPDATE_RESERVATION',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Reservation',
      entityId: id,
      entityName: r?.customerName || id,
      summary: `Updated reservation for ${r?.customerName || id}`,
      details: { id, patch },
    };
  },
  cancelReservation: ([id], prev) => {
    const r = findById(prev?.reservations, id);
    return {
      module: 'RESERVATIONS',
      action: 'CANCEL_RESERVATION',
      actionType: 'CANCEL',
      severity: 'critical',
      entityType: 'Reservation',
      entityId: id,
      entityName: r?.customerName || id,
      summary: `Cancelled reservation for ${r?.customerName || id}`,
      details: { id, customerName: r?.customerName, phone: r?.customerPhone },
    };
  },
  seatReservation: ([id], prev) => {
    const r = findById(prev?.reservations, id);
    return {
      module: 'RESERVATIONS',
      action: 'SEAT_RESERVATION',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'Reservation',
      entityId: id,
      entityName: r?.customerName || id,
      summary: `Seated reserved guests (${r?.customerName || id})`,
      details: { id },
    };
  },
  addMenuItem: ([item]) => ({
    module: 'MENU_CATALOG',
    action: 'CREATE_MENU_ITEM',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'MenuItem',
    entityName: item?.name,
    amount: Number(item?.price || 0),
    summary: `Added menu dish "${item?.name}" (${item?.category || 'Menu'}) at ${fmtRs(item?.price)}`,
    details: { name: item?.name, category: item?.category, price: item?.price, station: item?.station },
  }),
  updateMenuItem: ([id, patch], prev) => {
    const old = findById(prev?.menuItems, id);
    const priceChanged = patch?.price !== undefined && old && patch.price !== old.price;
    return {
      module: 'MENU_CATALOG',
      action: 'UPDATE_MENU_ITEM',
      actionType: 'UPDATE',
      severity: priceChanged ? 'warning' : 'info',
      entityType: 'MenuItem',
      entityId: id,
      entityName: old?.name || patch?.name || id,
      amount: patch?.price !== undefined ? Number(patch.price) : undefined,
      summary: `Updated dish "${old?.name || id}"${priceChanged ? ` (Price ${fmtRs(old.price)} → ${fmtRs(patch.price)})` : ` (${Object.keys(patch || {}).join(', ')})`}`,
      details: { id, oldPrice: old?.price, patch },
    };
  },
  deleteMenuItem: ([id], prev) => {
    const old = findById(prev?.menuItems, id);
    return {
      module: 'MENU_CATALOG',
      action: 'DELETE_MENU_ITEM',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'MenuItem',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted menu dish "${old?.name || id}"`,
      details: { id, name: old?.name, price: old?.price },
    };
  },
  adjustMenuItemStock: ([id, delta, mode], prev) => {
    const old = findById(prev?.menuItems, id);
    return {
      module: 'MENU_CATALOG',
      action: 'ADJUST_MENU_STOCK',
      actionType: 'UPDATE',
      severity: 'warning',
      entityType: 'MenuItem',
      entityId: id,
      entityName: old?.name || id,
      summary: `Adjusted stock for "${old?.name || id}" (${mode || 'add'}: ${delta})`,
      details: { id, delta, mode, prevStock: old?.stockQty },
    };
  },
  addCustomer: ([c]) => ({
    module: 'CUSTOMERS_CRM',
    action: 'CREATE_CUSTOMER',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Customer',
    entityName: c?.name,
    summary: `Added CRM customer "${c?.name}" (${c?.phone || 'No phone'})`,
    details: { name: c?.name, phone: c?.phone, tier: c?.tier },
  }),
  updateCustomer: ([id, patch], prev) => {
    const old = findById(prev?.customers, id);
    return {
      module: 'CUSTOMERS_CRM',
      action: 'UPDATE_CUSTOMER',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Customer',
      entityId: id,
      entityName: old?.name || id,
      summary: `Updated CRM customer "${old?.name || id}"`,
      details: { id, patch },
    };
  },
  deleteCustomer: ([id], prev) => {
    const old = findById(prev?.customers, id);
    return {
      module: 'CUSTOMERS_CRM',
      action: 'DELETE_CUSTOMER',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Customer',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted CRM customer "${old?.name || id}"`,
      details: { id, name: old?.name, phone: old?.phone },
    };
  },
  addStaff: ([st]) => ({
    module: 'STAFF_HR',
    action: 'CREATE_STAFF',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Staff',
    entityName: st?.name,
    summary: `Added staff "${st?.name}" (Role: ${st?.role}, Login: ${st?.username || (st?.hasSystemAccess === false ? 'Denied' : 'Auto')})`,
    details: { name: st?.name, role: st?.role, username: st?.username, hasSystemAccess: st?.hasSystemAccess },
  }),
  updateStaff: ([id, patch], prev) => {
    const old = findById(prev?.staff, id);
    const pinChanged = patch?.pin !== undefined && old && patch.pin !== old.pin;
    return {
      module: 'STAFF_HR',
      action: 'UPDATE_STAFF',
      actionType: 'UPDATE',
      severity: pinChanged || patch?.hasSystemAccess !== undefined ? 'warning' : 'info',
      entityType: 'Staff',
      entityId: id,
      entityName: old?.name || patch?.name || id,
      summary: `Updated staff "${old?.name || id}"${pinChanged ? ' (PIN changed)' : ''} [${Object.keys(patch || {}).filter((k) => k !== 'pin').join(', ') || 'profile'}]`,
      details: { id, changedKeys: Object.keys(patch || {}), role: patch?.role, status: patch?.status, hasSystemAccess: patch?.hasSystemAccess },
    };
  },
  deleteStaff: ([id], prev) => {
    const old = findById(prev?.staff, id);
    return {
      module: 'STAFF_HR',
      action: 'DELETE_STAFF',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Staff',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted staff member "${old?.name || id}" (${old?.role || ''})`,
      details: { id, name: old?.name, role: old?.role },
    };
  },
  markAttendance: ([recOrList]) => {
    const count = Array.isArray(recOrList) ? recOrList.length : 1;
    const first = Array.isArray(recOrList) ? recOrList[0] : recOrList;
    return {
      module: 'STAFF_HR',
      action: 'MARK_ATTENDANCE',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Attendance',
      summary: count > 1 ? `Marked attendance for ${count} staff members (${first?.date || 'today'})` : `Marked attendance: ${first?.status || 'Present'} (${first?.date || ''})`,
      details: { count, date: first?.date, status: first?.status },
    };
  },
  recordSalaryPayment: ([payment]) => ({
    module: 'STAFF_HR',
    action: 'PAY_SALARY',
    actionType: 'PAYMENT',
    severity: 'success',
    entityType: 'SalaryPayment',
    entityName: payment?.staffName || payment?.staffId,
    amount: Number(payment?.amount || 0),
    summary: `Paid salary ${fmtRs(payment?.amount)} to ${payment?.staffName || payment?.staffId} (${payment?.month || ''})`,
    details: { staffId: payment?.staffId, staffName: payment?.staffName, amount: payment?.amount, month: payment?.month, method: payment?.paymentMethod },
  }),
  deleteSalaryPayment: ([id]) => ({
    module: 'STAFF_HR',
    action: 'DELETE_SALARY_PAYMENT',
    actionType: 'DELETE',
    severity: 'critical',
    entityType: 'SalaryPayment',
    entityId: id,
    summary: `Deleted salary payment record ${id}`,
    details: { id },
  }),
  terminateStaffSession: ([sessionId, reason], prev) => {
    const sess = (prev?.activeStaffSessions || []).find((s: any) => s?.sessionId === sessionId);
    return {
      module: 'ROLES_SECURITY',
      action: 'ADMIN_KICK_SESSION',
      actionType: 'SECURITY',
      severity: 'critical',
      entityType: 'Session',
      entityId: sessionId,
      entityName: sess?.staffName || sessionId,
      summary: `Force-logged out ${sess?.staffName || sessionId} (${sess?.deviceName || 'terminal'})${reason ? ` — ${reason}` : ''}`,
      details: { sessionId, staffName: sess?.staffName, deviceName: sess?.deviceName, reason },
    };
  },
  terminateAllStaffSessions: ([_exceptSid, _exceptDev, reason], _prev, result) => ({
    module: 'ROLES_SECURITY',
    action: 'ADMIN_LOGOUT_ALL_USERS',
    actionType: 'SECURITY',
    severity: 'critical',
    entityType: 'Session',
    summary: `Master Admin triggered LOGOUT ALL USERS (${typeof result === 'number' ? result : 'all'} active sessions terminated)`,
    details: { kickedCount: result, reason },
  }),
};

const OPS_HANDLERS: Record<string, ActionDescriptor> = {
  addInventoryItem: ([item]) => ({
    module: 'INVENTORY_STOCK',
    action: 'CREATE_INVENTORY_ITEM',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'InventoryItem',
    entityName: item?.name,
    summary: `Created inventory item "${item?.name}" (${item?.currentStock ?? 0} ${item?.unit || ''}, ${item?.category || ''})`,
    details: { name: item?.name, category: item?.category, unit: item?.unit, currentStock: item?.currentStock, costPerUnit: item?.costPerUnit },
  }),
  updateInventoryItem: ([id, patch], prev) => {
    const old = findById(prev?.inventory, id);
    return {
      module: 'INVENTORY_STOCK',
      action: 'UPDATE_INVENTORY_ITEM',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'InventoryItem',
      entityId: id,
      entityName: old?.name || id,
      summary: `Updated inventory item "${old?.name || id}" (${Object.keys(patch || {}).join(', ')})`,
      details: { id, oldStock: old?.currentStock, patch },
    };
  },
  deleteInventoryItem: ([id], prev) => {
    const old = findById(prev?.inventory, id);
    return {
      module: 'INVENTORY_STOCK',
      action: 'DELETE_INVENTORY_ITEM',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'InventoryItem',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted inventory item "${old?.name || id}"`,
      details: { id, name: old?.name },
    };
  },
  recordStockMovement: ([itemId, type, qty, reason], prev) => {
    const item = findById(prev?.inventory, itemId);
    return {
      module: 'INVENTORY_STOCK',
      action: `STOCK_${String(type || 'MOVE').toUpperCase()}`,
      actionType: 'UPDATE',
      severity: type === 'waste' || type === 'out' ? 'warning' : 'info',
      entityType: 'InventoryItem',
      entityId: itemId,
      entityName: item?.name || itemId,
      summary: `Stock ${String(type || '').toUpperCase()}: ${qty} ${item?.unit || ''} of "${item?.name || itemId}"${reason ? ` — ${reason}` : ''}`,
      details: { itemId, itemName: item?.name, type, qty, reason },
    };
  },
  handoverBeveragesToFloor: ([params]) => ({
    module: 'JUICE_BAR',
    action: 'BEVERAGE_FLOOR_HANDOVER',
    actionType: 'TRANSFER',
    severity: 'info',
    entityType: 'ChillerHandover',
    entityName: params?.floor,
    summary: `Handed over ${(params?.items || []).length} beverage item(s) to ${params?.floor || 'floor chiller'}`,
    details: params,
  }),
  addExpense: ([exp]) => ({
    module: 'EXPENSES_ASSETS',
    action: 'CREATE_EXPENSE',
    actionType: 'PAYMENT',
    severity: 'info',
    entityType: 'Expense',
    entityName: exp?.title || exp?.category,
    amount: Number(exp?.amount || 0),
    summary: `Recorded expense "${exp?.title || exp?.category}" — ${fmtRs(exp?.amount)} (${exp?.paymentMethod || 'Cash'})`,
    details: exp,
  }),
  updateExpense: ([id, patch], prev) => {
    const old = findById(prev?.expenses, id);
    return {
      module: 'EXPENSES_ASSETS',
      action: 'UPDATE_EXPENSE',
      actionType: 'UPDATE',
      severity: 'warning',
      entityType: 'Expense',
      entityId: id,
      entityName: old?.title || id,
      amount: patch?.amount !== undefined ? Number(patch.amount) : old?.amount,
      summary: `Updated expense "${old?.title || id}"`,
      details: { id, oldAmount: old?.amount, patch },
    };
  },
  deleteExpense: ([id], prev) => {
    const old = findById(prev?.expenses, id);
    return {
      module: 'EXPENSES_ASSETS',
      action: 'DELETE_EXPENSE',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Expense',
      entityId: id,
      entityName: old?.title || id,
      amount: Number(old?.amount || 0),
      summary: `Deleted expense "${old?.title || id}" (${fmtRs(old?.amount)})`,
      details: { id, old },
    };
  },
  setItemAvailability: ([menuItemId, available]) => {
    const m = findById(useRestaurantStore.getState().menuItems, menuItemId);
    return {
      module: 'KITCHEN_KDS',
      action: available ? 'RESTORE_ITEM_AVAILABLE' : 'MARK_ITEM_86_SOLD_OUT',
      actionType: 'STATUS_CHANGE',
      severity: available ? 'success' : 'warning',
      entityType: 'MenuItem',
      entityId: menuItemId,
      entityName: m?.name || menuItemId,
      summary: available ? `Restored "${m?.name || menuItemId}" to AVAILABLE` : `Marked "${m?.name || menuItemId}" as 86'd / SOLD OUT`,
      details: { menuItemId, available },
    };
  },
  addSupplier: ([sup]) => ({
    module: 'SUPPLIERS_PO',
    action: 'CREATE_SUPPLIER',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Supplier',
    entityName: sup?.name,
    summary: `Added supplier "${sup?.name}" (${sup?.category || ''})`,
    details: { name: sup?.name, phone: sup?.phone, category: sup?.category },
  }),
  updateSupplier: ([id, patch], prev) => {
    const old = findById(prev?.suppliers, id);
    return {
      module: 'SUPPLIERS_PO',
      action: 'UPDATE_SUPPLIER',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Supplier',
      entityId: id,
      entityName: old?.name || id,
      summary: `Updated supplier "${old?.name || id}"`,
      details: { id, patch },
    };
  },
  deleteSupplier: ([id], prev) => {
    const old = findById(prev?.suppliers, id);
    return {
      module: 'SUPPLIERS_PO',
      action: 'DELETE_SUPPLIER',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Supplier',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted supplier "${old?.name || id}"`,
      details: { id, name: old?.name },
    };
  },
  addPurchaseOrder: ([po]) => ({
    module: 'SUPPLIERS_PO',
    action: 'CREATE_PURCHASE_ORDER',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'PurchaseOrder',
    entityName: po?.supplierName,
    amount: Number(po?.totalAmount || po?.total || 0),
    summary: `Created Purchase Order / GRN for ${po?.supplierName || 'Supplier'} (${(po?.items || []).length} items, ${fmtRs(po?.totalAmount || po?.total)})`,
    details: { supplierId: po?.supplierId, supplierName: po?.supplierName, total: po?.totalAmount || po?.total, itemsCount: (po?.items || []).length },
  }),
  receivePurchaseOrder: ([poId], prev) => {
    const po = findById(prev?.purchaseOrders, poId);
    return {
      module: 'SUPPLIERS_PO',
      action: 'RECEIVE_PURCHASE_ORDER',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'PurchaseOrder',
      entityId: poId,
      entityName: po?.supplierName || poId,
      amount: Number(po?.totalAmount || 0),
      summary: `Received GRN / Purchase Order ${poId} from ${po?.supplierName || 'Supplier'} (${fmtRs(po?.totalAmount)})`,
      details: { poId, supplierName: po?.supplierName, totalAmount: po?.totalAmount },
    };
  },
  deletePurchaseOrder: ([poId], prev) => {
    const po = findById(prev?.purchaseOrders, poId);
    return {
      module: 'SUPPLIERS_PO',
      action: 'DELETE_PURCHASE_ORDER',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'PurchaseOrder',
      entityId: poId,
      amount: Number(po?.totalAmount || 0),
      summary: `Deleted Purchase Order ${poId} (${po?.supplierName || ''}, ${fmtRs(po?.totalAmount)})`,
      details: { poId, supplierName: po?.supplierName },
    };
  },
  recordSupplierPayment: ([p]) => ({
    module: 'SUPPLIERS_PO',
    action: 'SUPPLIER_PAYMENT',
    actionType: 'PAYMENT',
    severity: 'success',
    entityType: 'SupplierPayment',
    entityName: p?.supplierName || p?.supplierId,
    amount: Number(p?.amount || 0),
    summary: `Paid ${fmtRs(p?.amount)} to supplier ${p?.supplierName || p?.supplierId} (${p?.method || 'Cash'})`,
    details: p,
  }),
  deleteSupplierPayment: ([id], prev) => {
    const p = findById(prev?.supplierPayments, id);
    return {
      module: 'SUPPLIERS_PO',
      action: 'DELETE_SUPPLIER_PAYMENT',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'SupplierPayment',
      entityId: id,
      amount: Number(p?.amount || 0),
      summary: `Deleted supplier payment ${id} (${fmtRs(p?.amount)})`,
      details: { id, prev: p },
    };
  },
  addAsset: ([asset]) => ({
    module: 'EXPENSES_ASSETS',
    action: 'CREATE_ASSET',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'Asset',
    entityName: asset?.name,
    amount: Number(asset?.purchaseCost || asset?.value || 0),
    summary: `Added Capex Asset "${asset?.name}" (${fmtRs(asset?.purchaseCost || asset?.value)})`,
    details: asset,
  }),
  updateAsset: ([id, patch], prev) => {
    const old = findById(prev?.assets, id);
    return {
      module: 'EXPENSES_ASSETS',
      action: 'UPDATE_ASSET',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'Asset',
      entityId: id,
      entityName: old?.name || id,
      summary: `Updated asset "${old?.name || id}"`,
      details: { id, patch },
    };
  },
  deleteAsset: ([id], prev) => {
    const old = findById(prev?.assets, id);
    return {
      module: 'EXPENSES_ASSETS',
      action: 'DELETE_ASSET',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Asset',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted asset "${old?.name || id}"`,
      details: { id, name: old?.name },
    };
  },
  logDamageIncident: ([dmg]) => ({
    module: 'DAMAGES',
    action: 'LOG_DAMAGE_INCIDENT',
    actionType: 'CREATE',
    severity: 'warning',
    entityType: 'DamageRecord',
    entityName: dmg?.itemName || dmg?.title,
    amount: Number(dmg?.estimatedLoss || dmg?.cost || 0),
    summary: `Logged damage incident: "${dmg?.itemName || dmg?.title}" — Est. Loss ${fmtRs(dmg?.estimatedLoss || dmg?.cost)}`,
    details: dmg,
  }),
  deleteDamageRecord: ([id], prev) => {
    const old = findById(prev?.damageRecords, id);
    return {
      module: 'DAMAGES',
      action: 'DELETE_DAMAGE_RECORD',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'DamageRecord',
      entityId: id,
      summary: `Deleted damage record "${old?.itemName || id}"`,
      details: { id },
    };
  },
  resolveDamageRecord: ([id], prev) => {
    const old = findById(prev?.damageRecords, id);
    return {
      module: 'DAMAGES',
      action: 'RESOLVE_DAMAGE_RECORD',
      actionType: 'STATUS_CHANGE',
      severity: 'success',
      entityType: 'DamageRecord',
      entityId: id,
      summary: `Resolved damage record "${old?.itemName || id}"`,
      details: { id },
    };
  },
};

const KITCHEN_HANDLERS: Record<string, ActionDescriptor> = {
  saveRecipe: ([input]) => ({
    module: 'RECIPES_BOM',
    action: input?.id ? 'UPDATE_RECIPE_BOM' : 'CREATE_RECIPE_BOM',
    actionType: input?.id ? 'UPDATE' : 'CREATE',
    severity: 'info',
    entityType: 'Recipe',
    entityId: input?.menuItemId || input?.id,
    entityName: input?.dishName || input?.menuItemName,
    summary: `${input?.id ? 'Updated' : 'Created'} Recipe BOM for "${input?.dishName || input?.menuItemName || 'Dish'}" (${(input?.ingredients || []).length} ingredients)`,
    details: { menuItemId: input?.menuItemId, ingredientsCount: (input?.ingredients || []).length },
  }),
  deleteRecipe: ([id], prev) => {
    const r = findById(prev?.recipes, id);
    return {
      module: 'RECIPES_BOM',
      action: 'DELETE_RECIPE_BOM',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Recipe',
      entityId: id,
      summary: `Deleted Recipe BOM "${r?.dishName || id}"`,
      details: { id },
    };
  },
  issueSession: ([id, by]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'ISSUE_KITCHEN_HANDOVER',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'KitchenSession',
    entityId: id,
    summary: `Issued kitchen stock handover session ${id} (by ${by})`,
    details: { id, by },
  }),
  acknowledgeSession: ([id, chef]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'CHEF_ACK_HANDOVER',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'KitchenSession',
    entityId: id,
    summary: `Chef "${chef}" acknowledged kitchen handover session ${id}`,
    details: { id, chef },
  }),
  issueTopUp: ([sessionId, itemId, qty, by]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'KITCHEN_STOCK_TOPUP',
    actionType: 'UPDATE',
    severity: 'info',
    entityType: 'KitchenSession',
    entityId: sessionId,
    summary: `Issued mid-shift top-up (+${qty}) for item ${itemId} on session ${sessionId}`,
    details: { sessionId, itemId, qty, by },
  }),
  recordManualUsage: ([input]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'KITCHEN_MANUAL_USAGE_WASTE',
    actionType: 'CREATE',
    severity: 'warning',
    entityType: 'KitchenManualUsage',
    summary: `Recorded kitchen ${input?.reason || 'usage'}: ${input?.qty} of ${input?.itemId}${input?.note ? ` (${input.note})` : ''}`,
    details: input,
  }),
  addCashEntry: ([input]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'KITCHEN_PETTY_CASH',
    actionType: 'PAYMENT',
    severity: 'warning',
    entityType: 'KitchenCash',
    amount: Number(input?.amount || 0),
    summary: `Recorded kitchen cash entry of ${fmtRs(input?.amount)} — ${input?.note || 'Kitchen expense'}`,
    details: input,
  }),
  submitClosing: ([input]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'SUBMIT_KITCHEN_CLOSING',
    actionType: 'STATUS_CHANGE',
    severity: 'info',
    entityType: 'KitchenSession',
    entityId: input?.sessionId,
    summary: `Submitted kitchen closing counts for session ${input?.sessionId}`,
    details: { sessionId: input?.sessionId, cashReturned: input?.cashReturned, by: input?.by },
  }),
  approveSession: ([sessionId, by, note]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'APPROVE_KITCHEN_CLOSING',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'KitchenSession',
    entityId: sessionId,
    summary: `Approved kitchen handover closing ${sessionId} (by ${by})`,
    details: { sessionId, by, note },
  }),
  rejectClosing: ([sessionId, by, note]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'REJECT_KITCHEN_CLOSING',
    actionType: 'CANCEL',
    severity: 'critical',
    entityType: 'KitchenSession',
    entityId: sessionId,
    summary: `Rejected kitchen closing ${sessionId} — ${note}`,
    details: { sessionId, by, note },
  }),
  cancelSession: ([sessionId]) => ({
    module: 'KITCHEN_HANDOVER',
    action: 'CANCEL_KITCHEN_SESSION',
    actionType: 'CANCEL',
    severity: 'critical',
    entityType: 'KitchenSession',
    entityId: sessionId,
    summary: `Cancelled kitchen handover session ${sessionId}`,
    details: { sessionId },
  }),
};

const SHIFT_HANDLERS: Record<string, ActionDescriptor> = {
  openShift: ([params]) => ({
    module: 'SHIFTS_CASH',
    action: 'OPEN_SHIFT',
    actionType: 'CREATE',
    severity: 'success',
    entityType: 'Shift',
    entityName: params?.cashierName,
    amount: Number(params?.openingFloat || 0),
    summary: `Opened Shift for ${params?.cashierName || 'Cashier'} with Opening Float ${fmtRs(params?.openingFloat)}`,
    details: params,
  }),
  closeShiftBlind: ([shiftId, params]) => ({
    module: 'SHIFTS_CASH',
    action: 'CLOSE_SHIFT_BLIND',
    actionType: 'STATUS_CHANGE',
    severity: 'warning',
    entityType: 'Shift',
    entityId: shiftId,
    amount: Number(params?.declaredCash || 0),
    summary: `Closed Shift ${shiftId} (Blind Declared Cash: ${fmtRs(params?.declaredCash)})`,
    details: { shiftId, ...params },
  }),
  auditShift: ([shiftId, params]) => ({
    module: 'SHIFTS_CASH',
    action: 'AUDIT_SHIFT',
    actionType: 'STATUS_CHANGE',
    severity: 'success',
    entityType: 'Shift',
    entityId: shiftId,
    summary: `Audited Shift ${shiftId} (Status: ${params?.status || 'audited'})`,
    details: { shiftId, ...params },
  }),
  reopenShift: ([shiftId, by]) => ({
    module: 'SHIFTS_CASH',
    action: 'REOPEN_SHIFT',
    actionType: 'UPDATE',
    severity: 'warning',
    entityType: 'Shift',
    entityId: shiftId,
    summary: `Re-opened closed Shift ${shiftId} (by ${by})`,
    details: { shiftId, reopenedBy: by },
  }),
};

const DISCOUNT_HANDLERS: Record<string, ActionDescriptor> = {
  addCampaign: ([data]) => ({
    module: 'DISCOUNTS_PROMOS',
    action: 'CREATE_DISCOUNT_CAMPAIGN',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'DiscountCampaign',
    entityName: data?.name,
    summary: `Created discount/promo campaign "${data?.name}" (${data?.code || data?.type || ''})`,
    details: data,
  }),
  updateCampaign: ([id, updates], prev) => {
    const old = findById(prev?.campaigns, id);
    return {
      module: 'DISCOUNTS_PROMOS',
      action: 'UPDATE_DISCOUNT_CAMPAIGN',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'DiscountCampaign',
      entityId: id,
      entityName: old?.name || id,
      summary: `Updated discount campaign "${old?.name || id}"`,
      details: { id, updates },
    };
  },
  toggleCampaignStatus: ([id, newStatus], prev) => {
    const old = findById(prev?.campaigns, id);
    return {
      module: 'DISCOUNTS_PROMOS',
      action: 'TOGGLE_DISCOUNT_STATUS',
      actionType: 'STATUS_CHANGE',
      severity: 'info',
      entityType: 'DiscountCampaign',
      entityId: id,
      entityName: old?.name || id,
      summary: `Changed discount campaign "${old?.name || id}" status → ${newStatus || 'toggled'}`,
      details: { id, prevStatus: old?.status, newStatus },
    };
  },
  deleteCampaign: ([id], prev) => {
    const old = findById(prev?.campaigns, id);
    return {
      module: 'DISCOUNTS_PROMOS',
      action: 'DELETE_DISCOUNT_CAMPAIGN',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'DiscountCampaign',
      entityId: id,
      entityName: old?.name || id,
      summary: `Deleted discount campaign "${old?.name || id}"`,
      details: { id },
    };
  },
  recordRedemption: ([params]) => ({
    module: 'DISCOUNTS_PROMOS',
    action: 'APPLY_DISCOUNT_PROMO',
    actionType: 'PAYMENT',
    severity: 'info',
    entityType: 'DiscountRedemption',
    entityName: params?.campaignName || params?.promoCode,
    amount: Number(params?.discountAmount || 0),
    summary: `Applied discount "${params?.campaignName || params?.promoCode}" (-${fmtRs(params?.discountAmount)}) on Invoice ${params?.invoiceId || ''}`,
    details: params,
  }),
};

const ROLE_HANDLERS: Record<string, ActionDescriptor> = {
  addRole: ([role]) => ({
    module: 'ROLES_SECURITY',
    action: 'CREATE_ROLE',
    actionType: 'CREATE',
    severity: 'warning',
    entityType: 'Role',
    entityName: role?.name,
    summary: `Created custom security role "${role?.name}" (base: ${role?.baseRole})`,
    details: { name: role?.name, baseRole: role?.baseRole },
  }),
  updateRole: ([id, updates], prev) => {
    const r = findById(prev?.roles, id);
    return {
      module: 'ROLES_SECURITY',
      action: 'UPDATE_ROLE',
      actionType: 'UPDATE',
      severity: 'warning',
      entityType: 'Role',
      entityId: id,
      entityName: r?.name || id,
      summary: `Updated role "${r?.name || id}"`,
      details: { id, updates },
    };
  },
  updateRolePermissions: ([roleId, patch], prev) => {
    const r = findById(prev?.roles, roleId);
    return {
      module: 'ROLES_SECURITY',
      action: 'UPDATE_ROLE_PERMISSIONS',
      actionType: 'SECURITY',
      severity: 'warning',
      entityType: 'Role',
      entityId: roleId,
      entityName: r?.name || roleId,
      summary: `Updated permissions on role "${r?.name || roleId}" (${Object.keys(patch || {}).join(', ')})`,
      details: { roleId, patch },
    };
  },
  togglePermission: ([roleId, permKey], prev) => {
    const r = findById(prev?.roles, roleId);
    const oldVal = r?.permissions?.[permKey];
    return {
      module: 'ROLES_SECURITY',
      action: 'TOGGLE_ROLE_PERMISSION',
      actionType: 'SECURITY',
      severity: 'warning',
      entityType: 'Role',
      entityId: roleId,
      entityName: r?.name || roleId,
      summary: `Toggled permission "${permKey}" on role "${r?.name || roleId}" (${String(oldVal)} → ${String(!oldVal)})`,
      details: { roleId, permKey, oldVal, newVal: !oldVal },
    };
  },
  setPermission: ([roleId, permKey, val], prev) => {
    const r = findById(prev?.roles, roleId);
    return {
      module: 'ROLES_SECURITY',
      action: 'SET_ROLE_PERMISSION',
      actionType: 'SECURITY',
      severity: 'warning',
      entityType: 'Role',
      entityId: roleId,
      entityName: r?.name || roleId,
      summary: `Set permission "${permKey}" = ${String(val)} on role "${r?.name || roleId}"`,
      details: { roleId, permKey, val },
    };
  },
  deleteRole: ([id], prev) => {
    const r = findById(prev?.roles, id);
    return {
      module: 'ROLES_SECURITY',
      action: 'DELETE_ROLE',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'Role',
      entityId: id,
      entityName: r?.name || id,
      summary: `Deleted role "${r?.name || id}"`,
      details: { id },
    };
  },
  resetToDefaultRoles: () => ({
    module: 'ROLES_SECURITY',
    action: 'RESET_DEFAULT_ROLES',
    actionType: 'SECURITY',
    severity: 'critical',
    entityType: 'Role',
    summary: 'Reset all roles & permissions to system defaults',
  }),
};

const SETTINGS_HANDLERS: Record<string, ActionDescriptor> = {
  updateSettings: ([partial], prev) => {
    const keys = Object.keys(partial || {}).filter((k) => k !== 'updatedAt');
    if (keys.length === 0) return null;
    const diff: Record<string, { from: any; to: any }> = {};
    for (const k of keys) {
      diff[k] = { from: prev?.settings?.[k], to: partial[k] };
    }
    return {
      module: 'SETTINGS',
      action: 'UPDATE_SYSTEM_SETTINGS',
      actionType: 'UPDATE',
      severity: 'warning',
      entityType: 'SystemSettings',
      summary: `Updated System Settings: ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ` +${keys.length - 4} more` : ''}`,
      details: { changes: diff },
    };
  },
  resetSettingsToDefaults: () => ({
    module: 'SETTINGS',
    action: 'RESET_SYSTEM_SETTINGS',
    actionType: 'SECURITY',
    severity: 'critical',
    entityType: 'SystemSettings',
    summary: 'Reset all System Settings to factory defaults',
  }),
};

const PLAYLAND_HANDLERS: Record<string, ActionDescriptor> = {
  issueTicket: ([params], _prev, result) => ({
    module: 'PLAYLAND',
    action: 'ISSUE_PLAYLAND_TICKET',
    actionType: 'PAYMENT',
    severity: 'success',
    entityType: 'PlaylandTicket',
    entityId: result?.id,
    entityName: params?.childName,
    amount: Number(result?.totalAmount || result?.total || 0),
    summary: `Issued Playland ticket for "${params?.childName || 'Child'}" (${params?.parentPhone || ''}) — ${fmtRs(result?.totalAmount || result?.total)}`,
    details: { childName: params?.childName, parentName: params?.parentName, paymentMethod: params?.paymentMethod, ticketId: result?.id },
  }),
  refundTicket: ([ticketId], prev) => {
    const tk = findById(prev?.tickets, ticketId);
    return {
      module: 'PLAYLAND',
      action: 'REFUND_PLAYLAND_TICKET',
      actionType: 'REFUND',
      severity: 'critical',
      entityType: 'PlaylandTicket',
      entityId: ticketId,
      amount: Number(tk?.totalAmount || tk?.total || 0),
      summary: `Refunded/Cancelled Playland ticket ${ticketId} (${tk?.childName || ''}, ${fmtRs(tk?.totalAmount || tk?.total)})`,
      details: { ticketId, childName: tk?.childName },
    };
  },
  redeemTicket: ([code]) => ({
    module: 'PLAYLAND',
    action: 'REDEEM_PLAYLAND_TICKET',
    actionType: 'STATUS_CHANGE',
    severity: 'info',
    entityType: 'PlaylandTicket',
    entityId: code,
    summary: `Redeemed Playland ticket ${code}`,
    details: { code },
  }),
  addNewRide: ([ride]) => ({
    module: 'PLAYLAND',
    action: 'CREATE_PLAYLAND_RIDE',
    actionType: 'CREATE',
    severity: 'info',
    entityType: 'PlaylandRide',
    entityName: ride?.name,
    summary: `Added Playland ride "${ride?.name}" (${fmtRs(ride?.price)})`,
    details: ride,
  }),
  updateRide: ([id, updates], prev) => {
    const r = findById(prev?.rides, id);
    return {
      module: 'PLAYLAND',
      action: 'UPDATE_PLAYLAND_RIDE',
      actionType: 'UPDATE',
      severity: 'info',
      entityType: 'PlaylandRide',
      entityId: id,
      entityName: r?.name || id,
      summary: `Updated Playland ride "${r?.name || id}"`,
      details: { id, updates },
    };
  },
  deleteRide: ([id], prev) => {
    const r = findById(prev?.rides, id);
    return {
      module: 'PLAYLAND',
      action: 'DELETE_PLAYLAND_RIDE',
      actionType: 'DELETE',
      severity: 'critical',
      entityType: 'PlaylandRide',
      entityId: id,
      entityName: r?.name || id,
      summary: `Deleted Playland ride "${r?.name || id}"`,
      details: { id },
    };
  },
};

const CALL_HANDLERS: Record<string, ActionDescriptor> = {
  handleIncomingCall: ([phone]) => ({
    module: 'CALL_CENTER',
    action: 'INCOMING_CALL',
    actionType: 'SYSTEM',
    severity: 'info',
    entityType: 'Call',
    entityName: phone,
    summary: `Incoming phone call from ${phone}`,
    details: { phone },
  }),
  handleMissedCall: ([phone]) => ({
    module: 'CALL_CENTER',
    action: 'MISSED_CALL',
    actionType: 'SYSTEM',
    severity: 'warning',
    entityType: 'Call',
    entityName: phone,
    summary: `Missed phone call from ${phone || 'caller'}`,
    details: { phone },
  }),
  clearCallLog: () => ({
    module: 'CALL_CENTER',
    action: 'CLEAR_CALL_LOG',
    actionType: 'DELETE',
    severity: 'warning',
    entityType: 'Call',
    summary: 'Cleared phone call log history',
  }),
};

function inferFallbackAction(
  storeName: string,
  defaultModule: AuditModule,
  fnName: string,
  args: any[]
): LogEventInput {
  const lower = fnName.toLowerCase();
  let actionType: AuditActionType = 'UPDATE';
  let severity: AuditSeverity = 'info';

  if (lower.startsWith('delete') || lower.startsWith('remove') || lower.startsWith('clear')) {
    actionType = 'DELETE';
    severity = 'critical';
  } else if (lower.startsWith('cancel') || lower.startsWith('reject') || lower.startsWith('dismiss')) {
    actionType = 'CANCEL';
    severity = 'critical';
  } else if (lower.startsWith('void')) {
    actionType = 'VOID';
    severity = 'critical';
  } else if (lower.startsWith('refund')) {
    actionType = 'REFUND';
    severity = 'warning';
  } else if (lower.startsWith('add') || lower.startsWith('create') || lower.startsWith('record') || lower.startsWith('issue') || lower.startsWith('log')) {
    actionType = 'CREATE';
  } else if (lower.startsWith('place')) {
    actionType = 'PLACE';
    severity = 'success';
  } else if (lower.includes('pay') || lower.includes('settle')) {
    actionType = 'PAYMENT';
    severity = 'success';
  } else if (lower.includes('transfer') || lower.includes('handover')) {
    actionType = 'TRANSFER';
    severity = 'warning';
  }

  const label = fnName.replace(/([A-Z])/g, ' $1').trim();
  const firstArgSummary =
    typeof args[0] === 'string'
      ? args[0]
      : typeof args[0]?.name === 'string'
        ? args[0].name
        : typeof args[0]?.id === 'string'
          ? args[0].id
          : '';

  return {
    module: defaultModule,
    action: fnName.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, ''),
    actionType,
    severity,
    entityType: storeName,
    ...(firstArgSummary ? { entityName: firstArgSummary } : {}),
    summary: `${label}${firstArgSummary ? ` — ${firstArgSummary}` : ''}`,
    details: args.length > 0 ? { args: args.slice(0, 3) } : undefined,
  };
}

function instrumentZustandStore(
  store: any,
  storeName: string,
  defaultModule: AuditModule,
  handlers: Record<string, ActionDescriptor>,
  extraSkip?: Set<string>
) {
  const currentState = store.getState();
  const patch: Record<string, any> = {};

  for (const key of Object.keys(currentState)) {
    const val = currentState[key];
    if (typeof val !== 'function') continue;
    if (IGNORED_ACTIONS.has(key) || extraSkip?.has(key)) continue;
    if ((val as any).__sultanAudited) continue;

    const origFn = val;
    const wrapped = function (this: any, ...args: any[]) {
      const prevState = store.getState();
      const isTopLevel = internalDepth === 0;
      internalDepth++;
      let result: any;
      try {
        result = origFn.apply(this, args);
      } finally {
        internalDepth--;
      }

      if (isTopLevel) {
        try {
          const handler = handlers[key];
          const eventInput = handler
            ? handler(args, prevState, result)
            : inferFallbackAction(storeName, defaultModule, key, args);
          if (eventInput) {
            recordSystemLog(eventInput);
          }
        } catch {
          // Audit logging must NEVER break a POS action
        }
      }
      return result;
    };
    (wrapped as any).__sultanAudited = true;
    patch[key] = wrapped;
  }

  if (Object.keys(patch).length > 0) {
    store.setState(patch);
  }
}

/**
 * Installs non-invasive interceptors across ALL 10 Zustand stores once on app boot.
 * Every create/update/delete/cancel/place/payment/security action from any role on any page
 * is automatically logged with timestamp, actor, role, device, page, and metadata.
 */
export function installAuditInterceptors() {
  if (installed) return;
  installed = true;

  instrumentZustandStore(useAuthStore, 'Auth', 'AUTH', AUTH_HANDLERS);
  instrumentZustandStore(useRestaurantStore, 'Restaurant', 'POS_ORDERS', RESTAURANT_HANDLERS);
  instrumentZustandStore(useOpsStore, 'Operations', 'INVENTORY_STOCK', OPS_HANDLERS);
  instrumentZustandStore(useKitchenStore, 'Kitchen', 'KITCHEN_HANDOVER', KITCHEN_HANDLERS);
  instrumentZustandStore(useShiftStore, 'Shift', 'SHIFTS_CASH', SHIFT_HANDLERS);
  instrumentZustandStore(useDiscountStore, 'Discounts', 'DISCOUNTS_PROMOS', DISCOUNT_HANDLERS);
  instrumentZustandStore(useRoleStore, 'Roles', 'ROLES_SECURITY', ROLE_HANDLERS);
  instrumentZustandStore(useSettingsStore, 'Settings', 'SETTINGS', SETTINGS_HANDLERS);
  instrumentZustandStore(
    usePlaylandStore,
    'Playland',
    'PLAYLAND',
    PLAYLAND_HANDLERS,
    new Set(['addToCart', 'removeFromCart', 'updateQty', 'clearCart'])
  );
  instrumentZustandStore(
    useCallStore,
    'CallCenter',
    'CALL_CENTER',
    CALL_HANDLERS,
    new Set(['setServiceRunning', 'setDetectionEnabled'])
  );
}
