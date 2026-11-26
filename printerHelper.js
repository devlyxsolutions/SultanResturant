const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');

const RAW_PRINTER_EXE = path.join(__dirname, 'bin', 'RawPrinter.exe');
const DEFAULT_THERMAL_PRINTER = 'POS-80';
const ESCPOS_SULTAN_LOGO_BUF = Buffer.from('HXYwABgAtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAB+P4AAAAAAAAAAAAAAAAAAAAAAAAAAAAH+H8AAAAAAAAAAAAAAAAAAAAAAAAAAAAP8D/AAAAAAAAAAAAAAAAAAAAAAAAAAAAfwB/gAAAAAAAAAAAAAAAAAAAAAAAAAAB/gA/4AAAAAAAAAAAAAAAAAAAAAAAAAAH/AAf8AAAAAAAAAAAAAAAAAAAAAAAAAAf+AAH/AAAAAAAAAAAAAAAAAAAAAAAAAB/4AAD/4AAAAAAAAAAAAAAAAAAAAAAAAP/wAAA/+AAAAAAAAAAAAAAAAAAAAAAAB//AAAAf/wAAAAAAAAAAAAAAAAAAAAAAH/8AAAAH/+AAAAAAAAAAAAAAAAAAAAAA//wAAAAA//wAAAAAAAAAAAAAAAAAAAAD//AAAAAAP/4AAAAAAAAAAAAAAAAAAAAH/4AAAAAAB/+AAAAAAAAAAAAAAAAAAAAf+AAAAAAAAP/AAAAAAAAAAAAAAAAAAAA/4AAAAAAAAB/wAAAAAAAAAAAAAAAAAAB/gAAAAAAAAAf4AAAAAAAAAAAAAAAAAAD+AAAAAAAAAAP8AAAAAAAAAAAAAAAAAAH8AAAAAAAAAAD+AAAAAAAAAAAAAAAAAAP4AAAAAAAAAAB+AAAAAAAAAAAAAAAAAAPwAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAfgAAAAAAAAAAAfgAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAPgAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAPwAAAAAAAAAAAAAAAAB+AAAAAAAAAAAAHwAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAH4AAAAAAAAAAAAAAAAD8AAAAAAAAAAAAD4AAAAAAAAAAAAAAAAD4AAAAAAAAAAAAD8AAAAAAAAAAAAAAAAD4AAAAAAAAAAAAB8AAAAAAAAAAAAAAAAH4AAAAAAAAAAAAB8AAAAAAAAAAAAAAAAHwAAAAAAAAAAAAB+AAAAAAAAAAAAAAAAHwAAAAAfvwAAAAA+AAAAAAAAAAAAAAAAHwAAAAHcaPAAAAA+AAAAAAAAAAAAAAAAHgAAAAfTB0wAAAA+AAAAAAAAAAAAAAAAPgAAAA4xGBcAAAA+AAAAAAAAAAAAAAAAPgAAADOMwNjAAAA+AAAAAAAAAAAAAAAAPgAAAHCARm3wAAAeAAAAAAAAAAAAAAAA/gAAAI5j+//+AAAfgAAAAAAAAAAAAAAH/gAAB//f////AAAf+AAAAAAAAAAAAAA//gAAD///////AAAf/gAAAAAAAAAAAAB//gAAD///////gAAf/4AAAAAAAAAAAAH/4AAAD+//////wAAB/+AAAAAAAAAAAAP8AAAAH////8//wAAAH/AAAAAAAAAAAAfwAAAAH//uxGQ0wAAAB/gAAAAAAAAAAA/AAAAAHrWTJn/zYAAAAfgAAAAAAAAAAA+AAAAAEWkDMyabfAAAAPwAAAAAAAAAAB8AAAAALQCNkYHb9gAAAH4AAAAAAAAAAD4AAAAAKAM8ZQH71gAAAD4AAAAAAAAAAD4AAAAAYL5mDAADxgAAAB8AAAAAAAAAADwAAAAAVrRrMAABNAAAAB8AAAAAAAAAADwAAAAA1DOxwAABjAAAAA8AAAAAAAAAAHwAAAAAxWMPB/ABSAAAAA8AAAAAAAAAAPwAAAAAh1+OH/8BOAAAAA/AAAAAAAAAA/wAAAABMFhoEH8fkAAAAA/wAAAAAAAAD/wAAAAAQPAwA/4foAAAAA/8AAAAAAAAP/AAAAABAuMgD/A9YAAAAAf+AAAAAAAAf4AAAAABGNPAAbA+QAAAAAB/gAAAAAAA/AAAAAACUbTAAAA/gAAAAAAfwAAAAAAB+AAAAAACF03AAAAzgAAAAAAH4AAAAAAD4AAAAAADFsLAAAATAAAAAAAD8AAAAAAHwAAAAAACZCTgAAASAAAAAAAB+AAAAAAPgAAAAAAA8i7gAAABAAAAAAAAeAAAAAAPAAAAAAAHMJDwAAABAAAAAAAAfAAAAAAeAAAAAAAFKaDwABAJAAAAAAAAPgAAAAAeAAAAAAAGSGD4AAuJAAAAAAAAHgAAAAA8AAAAAAAG5nD8AAAxAAAAAAAAHwAAAAA8AAAAAAAFYX7+AA/hAAAAAAAADwAAAAB4AAAAAAAFmHr/AP/7AAAAAAAADwAAAAB4AAAAAAADBPj/wf/6AAAAAAAAB4AAAAB4AAAAAAAGwfh/4fweAAAAAAAAB4AAAABwAAAAAAAMMXh/4wP+AAAAAAAAB4AAAABwAAAAAAALI3h/8wAcAAAAAAAAB4AAAADwAAAAAAAJ43g//gYYAAAAAAAAA4AAAADwAAAAAAALR/gf/wewAAAAAAAAA4AAAADwAAAAAAAPjPAP/wMwAAAAAAAAA4AAAADwAAAAAAAJifAH/+/gAAAAAAAAA8AAAADgAAAAAAAbG9AD///gAAAAAAAAA8AAAADgAAAAAAAmMcgA///AAAAAAAAAA4AAAADgAAAAAAA8d8YAf//wAAAAAAAAA4AAAADgAAAAAAAY94MAD/4QAAAAAAAAA4AAAADgAAAAAAEzj4DAA/6QAAAAAAAAA4AAAADgAAAAAAHnfYAgAPqwAAAAAAAAA4AAAADgAAAAAAP8eMAYADYQAAAAAAAAA4AAAADgAAAAAAP84OAGAAcYAAAAAAAAA4AAAADgAAAAAAf/hnAAwAd4AAAAAAAAA4AAAADgAAAAAAf+AnwAMAeQAAAAAAAAA4AAAADgAAAAAAf/Az4ADw7EAAAAAAAAA4AAAADgAAAAAAf/gZeAAIp8AAAAAAAAA4AAAADgAAAAAA//wJvgAFM+AAAAAAAAA4AAAADgAAAAAA//8MiYAFefgAAAAAAAA4AAAADgAAAAAA/n+ERjAFfP4AAAAAAAA4AAAADgAAAAAA/B/iQw4F9E+AAAAAAAA4AAAABgAAAAAAMAfyIQH/siTAAAAAAAA4AAAABgAAAAAAAAP5AMBwkQIwAAAAAAA4AAAABgAAAAAAAAD8AEMxUQEYAAAAAAA4AAAABgAAAAAAAAB+BgDbQAAEAAAAAAA4AAAABgAAAAAAAAA/HwBoIBwCAAAAAAA4AAAABgAAAAAAAAAfH/w8MD4gAAAAAAA4AAAABgAAAAAAAAAPz/4cEX/wAAAAAAA4AAAABgAAAAAAAAAH4AAAAAAAAAAAAAAYAAAABgAAAAAAAAAB4AAAAAAAAAAAAAAYAAAABgAAAAAAAAAAgAAACAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAgAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAAAAAAAAAAAAAAAAA4AAAABgAAAAAAAAAAAAAAAAAAAAAAAAAYAAAABgAAAAAAAAAfAAAAAAAAAAAAAAAYAAAABgAAAAAAAA/+AAAAAAAAAAAAAAAYAAAABgAAAAAAAH/+AAAAAAAAAAAAAAAYAAAABgAAAAAAAH/+AAAAAAAAAAAAAAAYAAAABgAAAAAAAP/+AAAAAAAAAAAAAAAYAAAABgAAAAAAAP/8AMAAAAAAAAAAAAAYAAAABgAAAAP8AP/8AP4AAA4AAAAAAAAYAAAABgAAAAP+AP/8AP/4AH4ABgAAAAAYAAAABgAAAAB+AP/4AP/4A/4APgAAAAAYAAAABgAAAAAeAP/4AP/wH/AB/gAAAAAYAAAABgAAAAD4AP/4AP/gH4AP/wAAAAAYAAAABgAAAAHwAP/4AP/gHAAf/wAAAAAYAAAABgAAAAHAAP/4AP/AAAAP/wAAAAAQAAAABgAAAAAAAP/wAP/AAAAP/wAAAAAQAAAABgAAAAAAAP/wAP+AAAAP/wAAAAAQAAAABgAAAAAAAP/wAP+AAPAP/wAAAAAQAAAABgAAAAAAAP/wAP8AH/4P/wAAAAAQAAAABgAAAAAAAP/wAP8Af/8P/gAAAAAQAAAABgBwAAAAAP/wAP8B//8P/gBwAAAQAAAABgD/+AAAAH/wAP4D//+P/gH8AAAQAAAAAgD/+AAYAH/wAP4Pwf+P/gP+AAAQAAAAAAD/8AB8AH/wAP4PAP+P/gP+AAAQAAAAAAH/8AD8AH/wAP4cAH+P/gH+AAAQAAAAAAH/8AP+AH/wAP44AH+P/gD+AAAQAAAAAAH/4Af/AH/wAP5wAD+P/gB+AAAAAAAAAAH/4B//wH/wAPxgAD+P/AD8AAAAAAAAAAH/4D//4H/wAPzAAH+P/Af4AAAAAAAAAAH/4D//8H/wAHzAAH+P/ADgAAAAAAAAAAH/4B//4D/wAH2AAH8P+AAAAAAAAAAAAAH/4A//gD/wAH+AAP8P+AAAAAAAAAAAAAH/4Af/AD/wAH8AAP8P+AAAAAAAAAAAAAD/4AP+AD/4AH8AAf4f8AAAAAAAAAAAAAD/4AH8AD/4AH8AAf4f8AAAAAAAAAAAAAD/8AB4AB/4AD4AA/wf8AAAeAAAAAAAAAD/8AAwAB/8AD4AB/wf4AD//8AAAAAAAAB/+AAAAB/8AD4AD/g/4B///8AAAAAAAAB/+AAAAA/+AB4AD/g/wP///8AAAAAAAAA//AAAAA/+AB4AH/A/w////8AAAAAAAAA//gAAAA//AB4Af+B/j////4AAAAAAAAAf/wAAAAf/gA4A/8B/P////4AAAAAAAAAf/4AAAAf/wA4B/4D/f////4AAAAAAAAAP/+AAAIP/8A4H/wH//////4AAAAAAAAAH//gAA8H//AYf/gH//////wAAAAAAAAAD//8AH8H//+f//AP///8AAAAAAAAAAAAB/////+D/////+Af//+AAAAAAAAAAAAAA//////B/////8A///gAAAAAAAAAAAAAAf/////A/////wD//8AAAAAAAAAAAAAAAH////+Af////AH//gAAAAAAAAAAAAAAAD////4AH////4//+AAAAAAAAAAAAAAAAA////gAD///////wAAAAAAAAAAAAAAAAAH//8AAAf/4P//+AAAAAAAAAAAAAAAAAAAf/AAAAAAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAAA=', 'base64');

/**
 * Canonical Juice Bar / Beverage categories.
 * Items in these categories ALWAYS route strictly to the Juice Bar station & printer.
 */
const JUICE_BAR_CATEGORIES = new Set([
  'hot coffee & tea',
  'ice coffee',
  'mocktail',
  'mocktails',
  'ice cream',
  'cold drinks & water',
  'cold drinks',
  'drinks',
  'beverages',
  'juice',
  'juices',
  'juice bar',
  'shakes',
  'milkshakes',
  'smoothies',
  'tea & coffee',
  'coffee',
  'tea',
]);

/**
 * Resolve the canonical station ('main' | 'juice') for a menu or ticket item.
 */
function resolveItemStation(item, menuItems = [], autoRouteBeverages = true) {
  if (!autoRouteBeverages) return 'main';
  if (!item) return 'main';

  // Explicit station on item takes priority when already tagged 'juice'
  if (item.station === 'juice') return 'juice';

  // Direct category / region check on the item itself
  const itemCat = String(item.category || '').trim().toLowerCase();
  if (itemCat && JUICE_BAR_CATEGORIES.has(itemCat)) return 'juice';
  const itemReg = String(item.region || '').trim().toLowerCase();
  if (itemReg === 'beverages' || itemReg === 'juice bar' || itemReg === 'drinks') return 'juice';

  // Cross-check against live menu catalog (handles older waiter APKs & variant names like "Soft Drink (Tin)")
  if (Array.isArray(menuItems) && menuItems.length > 0) {
    const rawId = String(item.id || '').trim();
    const rawName = String(item.name || '').trim().toLowerCase();
    const baseName = rawName.includes('(') ? rawName.split('(')[0].trim() : rawName;

    const matched = menuItems.find((m) => {
      if (!m) return false;
      if (rawId && m.id && (m.id === rawId || rawId.startsWith(`${m.id}-`))) return true;
      const mName = String(m.name || '').trim().toLowerCase();
      if (mName && (mName === rawName || mName === baseName)) return true;
      return false;
    });

    if (matched) {
      if (matched.station === 'juice') return 'juice';
      const mCat = String(matched.category || '').trim().toLowerCase();
      if (mCat && JUICE_BAR_CATEGORIES.has(mCat)) return 'juice';
      const mReg = String(matched.region || '').trim().toLowerCase();
      if (mReg === 'beverages' || mReg === 'juice bar' || mReg === 'drinks') return 'juice';
      if (matched.station === 'main') return 'main';
    }
  }

  // Fallback: respect explicit 'main' or default to 'main'
  return item.station === 'juice' ? 'juice' : 'main';
}

/**
 * Normalize every item's station on a ticket & compute accurate station presence.
 */
function normalizeTicketStations(ticket, menuItems = [], autoRouteBeverages = true) {
  if (!ticket || !Array.isArray(ticket.items)) {
    return { hasMain: false, hasJuice: false, mainItems: [], juiceItems: [] };
  }

  const mainItems = [];
  const juiceItems = [];

  for (const it of ticket.items) {
    if (!it) continue;
    const resolved = resolveItemStation(it, menuItems, autoRouteBeverages);
    it.station = resolved;
    if (resolved === 'juice') {
      juiceItems.push(it);
    } else {
      mainItems.push(it);
    }
  }

  const hasMain = mainItems.length > 0;
  const hasJuice = juiceItems.length > 0;

  // Keep stationStatuses strictly aligned with items actually present on this ticket
  const prevStatuses = ticket.stationStatuses || {};
  const fallbackStatus = ticket.status || 'pending';
  const STATUS_RANK = { pending: 0, cooking: 1, ready: 2, served: 3 };
  const deriveStationFromItems = (itemsList) => {
    if (!Array.isArray(itemsList) || itemsList.length === 0) return fallbackStatus;
    if (itemsList.every((it) => it && (it.itemStatus === 'served'))) return 'served';
    if (itemsList.every((it) => it && (it.itemStatus === 'ready' || it.itemStatus === 'served' || it.completed))) return 'ready';
    if (itemsList.some((it) => it && (it.itemStatus === 'cooking' || it.itemStatus === 'ready' || it.itemStatus === 'served' || it.completed))) return 'cooking';
    return fallbackStatus;
  };
  const pickHigherStatus = (a, b) => {
    const rA = a && STATUS_RANK[a] !== undefined ? STATUS_RANK[a] : -1;
    const rB = b && STATUS_RANK[b] !== undefined ? STATUS_RANK[b] : -1;
    return rA >= rB ? (a || b || 'pending') : (b || a || 'pending');
  };
  const nextStatuses = {};
  if (hasMain) {
    nextStatuses.main = pickHigherStatus(prevStatuses.main, deriveStationFromItems(mainItems));
  }
  if (hasJuice) {
    nextStatuses.juice = pickHigherStatus(prevStatuses.juice, deriveStationFromItems(juiceItems));
  }
  ticket.stationStatuses = nextStatuses;

  // Reconcile overall ticket.status with active stationStatuses so a single-station or all-served ticket never stays stuck in 'cooking'/'ready'
  const activeVals = Object.values(nextStatuses).filter(Boolean);
  if (activeVals.length > 0) {
    if (activeVals.every((s) => s === 'served')) {
      ticket.status = 'served';
    } else if (activeVals.every((s) => s === 'ready' || s === 'served')) {
      ticket.status = 'ready';
      if (!ticket.readyAt) ticket.readyAt = Date.now();
    } else if (activeVals.some((s) => s === 'cooking' || s === 'ready' || s === 'served')) {
      if (ticket.status === 'pending') ticket.status = 'cooking';
    }
  }

  return { hasMain, hasJuice, mainItems, juiceItems };
}

/**
 * Filter ticket items strictly for a specific station.
 * NEVER leaks Juice Bar items to Kitchen or Kitchen items to Juice Bar!
 */
function filterItemsForStation(items, station = 'all') {
  const list = Array.isArray(items) ? items : [];
  if (station === 'main') {
    return list.filter((i) => (i?.station || 'main') === 'main');
  }
  if (station === 'juice') {
    return list.filter((i) => i?.station === 'juice');
  }
  return list;
}

/**
 * Format a ticket into ESC/POS binary buffer for 80mm thermal printers.
 * Returns null if there are ZERO items matching the requested station (prevents cross-station slip leaks).
 */
function buildEscPosKotBuffer(ticket, station = 'all') {
  const items = Array.isArray(ticket?.items) ? ticket.items : [];
  const activeItems = filterItemsForStation(items, station);

  // STRICT STATION ISOLATION: Never print an empty slip or fall back to other station's items!
  if (activeItems.length === 0) {
    return null;
  }

  const esc = '\x1b';
  const gs = '\x1d';
  const parts = [];

  // Init printer & explicitly set zero left margin + safe 512-dot printable width (prevents right-side cutoff on POS-80)
  parts.push(Buffer.from(esc + '@', 'ascii'));
  parts.push(Buffer.from(gs + 'L\x00\x00', 'ascii'));
  parts.push(Buffer.from(gs + 'W\x00\x02', 'ascii'));

  // Center: Header (Sultan Restaurant word removed per user request)
  parts.push(Buffer.from(esc + 'a\x01', 'ascii')); // Align center
  parts.push(Buffer.from(esc + '!\x18', 'ascii')); // Double height + bold
  let stationTitle = 'KITCHEN KOT';
  if (station === 'juice') stationTitle = 'JUICE BAR KOT';
  else if (station === 'main') stationTitle = 'MAIN KITCHEN KOT';
  parts.push(Buffer.from(stationTitle + '\n', 'ascii'));

  parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal
  if (ticket.isAddOn) {
    parts.push(Buffer.from(`*** ADD-ON ROUND #${ticket.roundNumber || 2} ***\n`, 'ascii'));
  } else {
    parts.push(Buffer.from('--- NEW ORDER ---\n', 'ascii'));
  }

  parts.push(Buffer.from('------------------------------------\n', 'ascii'));

  // Table / Order Type (Double-height + bold so long table names never cut off on the side)
  parts.push(Buffer.from(esc + '!\x18', 'ascii'));
  const tableText = String(ticket.tableName || ticket.tableId || 'Takeaway').toUpperCase().substring(0, 30);
  parts.push(Buffer.from(`[ ${tableText} ]\n`, 'ascii'));

  parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal
  parts.push(Buffer.from('------------------------------------\n', 'ascii'));

  // Meta: Left aligned
  parts.push(Buffer.from(esc + 'a\x00', 'ascii')); // Align left
  const dateStr = new Date(ticket.timePlaced || Date.now()).toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

  const kotId = String(ticket.id || 'N/A').substring(0, 14);
  const serverName = String(ticket.server || ticket.orderTakenBy || 'Staff').substring(0, 14);
  const totalQty = activeItems.reduce((sum, it) => sum + (it?.qty || 1), 0);

  parts.push(Buffer.from(`KOT: #${kotId}`.padEnd(18) + `${dateStr}\n`, 'ascii'));
  parts.push(Buffer.from(`Staff: ${serverName}`.padEnd(20) + `Qty: ${totalQty}\n`, 'ascii'));
  if (ticket.notes && String(ticket.notes).trim()) {
    parts.push(Buffer.from('------------------------------------\n', 'ascii'));
    parts.push(Buffer.from(esc + '!\x08', 'ascii')); // Bold
    parts.push(Buffer.from(`ORDER NOTE: ${String(ticket.notes).trim().substring(0, 120)}\n`, 'ascii'));
    parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  }
  parts.push(Buffer.from('====================================\n', 'ascii'));

  // Items List
  parts.push(Buffer.from('QTY  ITEM DESCRIPTION\n', 'ascii'));
  parts.push(Buffer.from('------------------------------------\n', 'ascii'));

  for (const item of activeItems) {
    const qtyStr = `${item.qty || 1}x`.padEnd(5);
    const stationBadge = (station === 'all' && item.station === 'juice') ? ' [J]' : '';
    const nameStr = ((item.name || '') + stationBadge).substring(0, 31);

    // Print item with double height/bold
    parts.push(Buffer.from(esc + '!\x18', 'ascii')); // Double height + bold
    parts.push(Buffer.from(`${qtyStr}${nameStr}\n`, 'ascii'));
    parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal

    if (item.notes) {
      parts.push(Buffer.from(`     * ${String(item.notes).substring(0, 64)}\n`, 'ascii'));
    }
  }

  parts.push(Buffer.from('====================================\n', 'ascii'));

  // Footer: Centered
  parts.push(Buffer.from(esc + 'a\x01', 'ascii')); // Align center
  parts.push(Buffer.from(esc + '!\x01', 'ascii')); // Bold
  parts.push(Buffer.from(`TOTAL ITEMS: ${totalQty}\n`, 'ascii'));
  parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  parts.push(Buffer.from('Powered & Designed by Nizaam Digital Solution\n', 'ascii'));

  // Feed 4 lines & cut
  parts.push(Buffer.from('\n\n\n\n', 'ascii'));
  parts.push(Buffer.from(gs + 'V\x00', 'ascii')); // Full cut

  return Buffer.concat(parts);
}

/**
 * Format a ticket into clean 80mm plain-text lines for Windows GDI PrintDocument fallback.
 * Uses the exact same strict station isolation as buildEscPosKotBuffer (returns null if 0 matching items).
 */
function buildPlainTextKot(ticket, station = 'all') {
  const items = Array.isArray(ticket?.items) ? ticket.items : [];
  const activeItems = filterItemsForStation(items, station);

  if (activeItems.length === 0) {
    return null;
  }

  let stationTitle = 'KITCHEN KOT';
  if (station === 'juice') stationTitle = 'JUICE BAR KOT';
  else if (station === 'main') stationTitle = 'MAIN KITCHEN KOT';

  const tableText = String(ticket.tableName || ticket.tableId || 'Takeaway').toUpperCase();
  const dateStr = new Date(ticket.timePlaced || Date.now()).toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
  const kotId = ticket.id || 'N/A';
  const serverName = ticket.server || ticket.orderTakenBy || 'Staff';
  const totalQty = activeItems.reduce((sum, it) => sum + (it?.qty || 1), 0);

  const lines = [
    stationTitle,
    ticket.isAddOn ? `*** ADD-ON ROUND #${ticket.roundNumber || 2} ***` : '--- NEW ORDER ---',
    '------------------------------------',
    `[ ${tableText.substring(0, 30)} ]`,
    '------------------------------------',
    `KOT: #${kotId}`,
    `Time: ${dateStr}`,
    `Staff: ${String(serverName).substring(0, 14)}  Qty: ${totalQty}`,
    ...(ticket.notes && String(ticket.notes).trim()
      ? ['------------------------------------', `ORDER NOTE: ${String(ticket.notes).trim().substring(0, 120)}`]
      : []),
    '====================================',
    'QTY  ITEM DESCRIPTION',
    '------------------------------------',
  ];

  for (const item of activeItems) {
    const qtyStr = `${item.qty || 1}x`.padEnd(5);
    const stationBadge = (station === 'all' && item.station === 'juice') ? ' [J]' : '';
    const nameStr = ((item.name || '') + stationBadge).substring(0, 30);
    lines.push(`${qtyStr}${nameStr}`);
    if (item.notes) {
      lines.push(`     * ${String(item.notes).substring(0, 64)}`);
    }
  }

  lines.push('====================================');
  lines.push(`TOTAL ITEMS: ${totalQty}`);
  lines.push('Powered & Designed by Nizaam Digital Solution');

  return lines.join('\n');
}

function buildEscPosBillBuffer(invoice) {
  if (!invoice) return null;
  const esc = '\x1b';
  const gs = '\x1d';
  const parts = [];
  const isUnpaid = invoice.isUnpaidBill || invoice.status === 'unpaid';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const dateStr = new Date(invoice.timeSettled || invoice.timePlaced || Date.now()).toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

  parts.push(Buffer.from(esc + '@', 'ascii'));
  parts.push(Buffer.from(gs + 'L\x00\x00', 'ascii'));
  parts.push(Buffer.from(gs + 'W\x00\x02', 'ascii'));

  parts.push(Buffer.from(esc + 'a\x01', 'ascii'));
  parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  parts.push(Buffer.from('LUXURY DINING & BANQUET\n', 'ascii'));
  if (isUnpaid) {
    parts.push(Buffer.from(esc + '!\x08', 'ascii'));
    parts.push(Buffer.from('*** UNPAID PROVISIONAL BILL ***\n', 'ascii'));
    parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  }
  parts.push(Buffer.from('------------------------------------\n', 'ascii'));

  parts.push(Buffer.from(esc + 'a\x00', 'ascii'));
  parts.push(Buffer.from(`INV: #${String(invoice.id || '').substring(0, 14)}`.padEnd(20) + `${dateStr}\n`, 'ascii'));
  parts.push(Buffer.from(`Type: ${String(invoice.orderType || 'DINE-IN').toUpperCase()}`.padEnd(20) + `${invoice.tableName ? String(invoice.tableName).substring(0, 15) : ''}\n`, 'ascii'));
  const billedByText = String(invoice.cashier || invoice.server || 'Cashier').replace(/\(Manager\)/i, '(Cashier)');
  if (invoice.orderTakenBy && invoice.orderTakenBy !== invoice.cashier) {
    parts.push(Buffer.from(`Order Taken: ${String(invoice.orderTakenBy).substring(0, 22)}\n`, 'ascii'));
  }
  parts.push(Buffer.from(`Billed By: ${billedByText.substring(0, 24)}\n`, 'ascii'));
  parts.push(Buffer.from('====================================\n', 'ascii'));
  parts.push(Buffer.from('ITEM             QTY  PRICE    TOTAL\n', 'ascii'));
  parts.push(Buffer.from('------------------------------------\n', 'ascii'));

  for (const it of items) {
    const nm = String(it.name || '').substring(0, 16).padEnd(17);
    const q = `${it.qty || 1}x`.padEnd(4);
    const rate = String(Number(it.price || 0).toLocaleString()).padStart(6);
    const amt = String(((it.price || 0) * (it.qty || 1)).toLocaleString()).padStart(9);
    parts.push(Buffer.from(`${nm}${q}${rate}${amt}\n`, 'ascii'));
  }

  parts.push(Buffer.from('------------------------------------\n', 'ascii'));
  parts.push(Buffer.from(`Sub Total:`.padEnd(24) + `Rs. ${Number(invoice.subTotal || 0).toLocaleString()}\n`, 'ascii'));
  if ((invoice.discount || 0) > 0) {
    parts.push(Buffer.from(`Discount:`.padEnd(24) + `-Rs. ${Number(invoice.discount || 0).toLocaleString()}\n`, 'ascii'));
  }
  if ((invoice.tax || 0) > 0) {
    parts.push(Buffer.from(`Tax:`.padEnd(24) + `Rs. ${Number(invoice.tax || 0).toLocaleString()}\n`, 'ascii'));
  }
  parts.push(Buffer.from('====================================\n', 'ascii'));
  parts.push(Buffer.from(esc + '!\x18', 'ascii'));
  parts.push(Buffer.from(`TOTAL: Rs. ${Number(invoice.total || 0).toLocaleString()}\n`, 'ascii'));
  parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  parts.push(Buffer.from('====================================\n', 'ascii'));
  parts.push(Buffer.from(esc + 'a\x01', 'ascii'));
  parts.push(Buffer.from('Thank you for dining with Sultan!\n', 'ascii'));
  parts.push(Buffer.from('Powered & Designed by Nizaam Digital Solution\n\n\n\n', 'ascii'));
  parts.push(Buffer.from(gs + 'V\x00', 'ascii'));

  return Buffer.concat(parts);
}

/**
 * Send raw ESC/POS buffer directly to a local/shared Windows printer via RawPrinter.exe
 */
function printRawBufferToWindows(buffer, printerName = DEFAULT_THERMAL_PRINTER, ticketId = '') {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(RAW_PRINTER_EXE)) {
      return reject(new Error(`RawPrinter binary not found at ${RAW_PRINTER_EXE}`));
    }

    const tempFile = path.join(__dirname, `temp_kot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.bin`);
    fs.writeFile(tempFile, buffer, (writeErr) => {
      if (writeErr) return reject(writeErr);

      execFile(RAW_PRINTER_EXE, [printerName, tempFile], (execErr, stdout, stderr) => {
        try { fs.unlinkSync(tempFile); } catch (_) {}

        if (execErr) {
          console.warn(`[PrinterHelper] Windows direct print to ${printerName} failed:`, stderr || execErr.message);
          return reject(execErr);
        }

        console.log(`[PrinterHelper] Direct KOT printed successfully to ${printerName} (ticket: ${ticketId})`);
        resolve({ success: true, printer: printerName, ticketId });
      });
    });
  });
}

/**
 * Send raw ESC/POS buffer directly to a LAN/Wi-Fi Thermal Printer over raw TCP (Port 9100)
 */
function printRawBufferToNetworkTcp(buffer, host, port = 9100, ticketId = '') {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Network printer IP/host not configured'));
    const socket = new net.Socket();
    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) {}
      if (err) reject(err);
      else resolve(result);
    };

    socket.setTimeout(5000);
    socket.on('timeout', () => finish(new Error(`Network printer ${host}:${port} timed out`)));
    socket.on('error', (err) => finish(err));

    socket.connect(Number(port) || 9100, host, () => {
      socket.write(buffer, () => {
        console.log(`[PrinterHelper] Network TCP KOT printed successfully to ${host}:${port} (ticket: ${ticketId})`);
        // Give printer a brief moment to accept bytes before closing
        setTimeout(() => {
          finish(null, { success: true, printer: `${host}:${port}`, ticketId });
        }, 120);
      });
    });
  });
}

/**
 * Print a ticket directly to a Windows or Network TCP printer.
 * Safely skips if there are no items matching the requested station.
 */
function printTicketDirect(ticket, options = {}) {
  const station = options.station || 'main';
  const buffer = buildEscPosKotBuffer(ticket, station);

  if (!buffer) {
    return Promise.resolve({
      success: true,
      skipped: true,
      reason: `No ${station} items on ticket #${ticket?.id || ''}`,
      ticketId: ticket?.id,
      station,
    });
  }

  if (options.mode === 'network' && options.host) {
    return printRawBufferToNetworkTcp(buffer, options.host, options.port || 9100, ticket?.id);
  }

  const printerName = options.printerName || DEFAULT_THERMAL_PRINTER;
  return printRawBufferToWindows(buffer, printerName, ticket?.id);
}

// Cache installed Windows printers on Server PC for 20s
let cachedServerPrinters = [];
let cachedServerPrintersAt = 0;

function getLocalWindowsPrinters() {
  return new Promise((resolve) => {
    if (Date.now() - cachedServerPrintersAt < 20000 && cachedServerPrinters.length > 0) {
      return resolve(cachedServerPrinters);
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
      { timeout: 5000 },
      (err, stdout) => {
        if (!err && stdout) {
          const list = stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (list.length > 0) {
            cachedServerPrinters = list;
            cachedServerPrintersAt = Date.now();
            return resolve(list);
          }
        }
        resolve(cachedServerPrinters.length > 0 ? cachedServerPrinters : [DEFAULT_THERMAL_PRINTER]);
      }
    );
  });
}

/**
 * Pure zero-dependency PKZIP archive builder (Store method + standard IEEE CRC32)
 * Used to serve the 1-click downloadable Sultan-JuiceBar-Printer-Setup.zip directly from server.js!
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const checksum = crc32(dataBuf);
    const size = dataBuf.length;

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(0, 8);          // method: 0 (STORE)
    localHeader.writeUInt16LE(0, 10);         // mod time
    localHeader.writeUInt16LE(0x5421, 12);    // mod date
    localHeader.writeUInt32LE(checksum, 14);  // crc32
    localHeader.writeUInt32LE(size, 18);      // compressed size
    localHeader.writeUInt32LE(size, 22);      // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28);         // extra length

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0, 8);          // flags
    centralHeader.writeUInt16LE(0, 10);         // method: 0 (STORE)
    centralHeader.writeUInt16LE(0, 12);         // mod time
    centralHeader.writeUInt16LE(0x5421, 14);    // mod date
    centralHeader.writeUInt32LE(checksum, 16);  // crc32
    centralHeader.writeUInt32LE(size, 20);      // compressed size
    centralHeader.writeUInt32LE(size, 24);      // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // filename length
    centralHeader.writeUInt16LE(0, 30);         // extra length
    centralHeader.writeUInt16LE(0, 32);         // comment length
    centralHeader.writeUInt16LE(0, 34);         // disk number
    centralHeader.writeUInt16LE(0, 36);         // internal attrs
    centralHeader.writeUInt32LE(0, 38);         // external attrs
    centralHeader.writeUInt32LE(offset, 42);    // relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // signature
  eocd.writeUInt16LE(0, 4);                   // disk number
  eocd.writeUInt16LE(0, 6);                   // disk with central dir
  eocd.writeUInt16LE(files.length, 8);        // entries on this disk
  eocd.writeUInt16LE(files.length, 10);       // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // central dir size
  eocd.writeUInt32LE(offset, 16);             // central dir offset
  eocd.writeUInt16LE(0, 20);                  // comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

module.exports = {
  JUICE_BAR_CATEGORIES,
  resolveItemStation,
  normalizeTicketStations,
  filterItemsForStation,
  buildEscPosKotBuffer,
  buildPlainTextKot,
  buildEscPosBillBuffer,
  printRawBufferToWindows,
  printRawBufferToNetworkTcp,
  printTicketDirect,
  getLocalWindowsPrinters,
  buildZipBuffer,
  DEFAULT_THERMAL_PRINTER,
};
