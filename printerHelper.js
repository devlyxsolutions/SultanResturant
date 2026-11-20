const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAW_PRINTER_EXE = path.join(__dirname, 'bin', 'RawPrinter.exe');
const DEFAULT_THERMAL_PRINTER = 'POS-80';

/**
 * Format a ticket into ESC/POS binary buffer for 80mm thermal printers
 */
function buildEscPosKotBuffer(ticket, station = 'main') {
  const esc = '\x1b';
  const gs = '\x1d';

  const parts = [];

  // Init printer
  parts.push(Buffer.from(esc + '@', 'ascii'));

  // Center: Header
  parts.push(Buffer.from(esc + 'a\x01', 'ascii')); // Align center
  parts.push(Buffer.from(esc + '!\x30', 'ascii')); // Double width + double height + bold
  parts.push(Buffer.from('SULTAN RESTAURANT\n', 'ascii'));

  parts.push(Buffer.from(esc + '!\x10', 'ascii')); // Double height
  const stationTitle = station === 'juice' ? 'JUICE BAR KOT' : 'MAIN KITCHEN KOT';
  parts.push(Buffer.from(stationTitle + '\n', 'ascii'));

  parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal
  if (ticket.isAddOn) {
    parts.push(Buffer.from(`*** ADD-ON ROUND #${ticket.roundNumber || 2} ***\n`, 'ascii'));
  } else {
    parts.push(Buffer.from('--- NEW ORDER ---\n', 'ascii'));
  }

  parts.push(Buffer.from('------------------------------------------\n', 'ascii'));

  // Table / Order Type (Huge, centered)
  parts.push(Buffer.from(esc + '!\x38', 'ascii')); // Huge bold double size
  const tableText = (ticket.tableName || ticket.tableId || 'Takeaway').toUpperCase();
  parts.push(Buffer.from(`[ ${tableText} ]\n`, 'ascii'));

  parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal
  parts.push(Buffer.from('------------------------------------------\n', 'ascii'));

  // Meta: Left aligned
  parts.push(Buffer.from(esc + 'a\x00', 'ascii')); // Align left
  const dateStr = new Date(ticket.timePlaced || Date.now()).toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

  const kotId = ticket.id || 'N/A';
  const serverName = ticket.server || ticket.orderTakenBy || 'Staff';
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const filteredItems = items.filter(i => (i?.station || 'main') === station);
  const activeItems = filteredItems.length > 0 ? filteredItems : items;
  const totalQty = activeItems.reduce((sum, it) => sum + (it?.qty || 1), 0);

  parts.push(Buffer.from(`KOT: #${kotId}`.padEnd(21) + `Time: ${dateStr}\n`, 'ascii'));
  parts.push(Buffer.from(`Server: ${serverName}`.padEnd(21) + `Total Qty: ${totalQty}\n`, 'ascii'));
  parts.push(Buffer.from('==========================================\n', 'ascii'));

  // Items List
  parts.push(Buffer.from('QTY   ITEM DESCRIPTION\n', 'ascii'));
  parts.push(Buffer.from('------------------------------------------\n', 'ascii'));

  for (const item of activeItems) {
    const qtyStr = `${item.qty || 1}x`.padEnd(6);
    const nameStr = (item.name || '').substring(0, 36);

    // Print item with double height/bold
    parts.push(Buffer.from(esc + '!\x10', 'ascii')); // Double height
    parts.push(Buffer.from(`${qtyStr}${nameStr}\n`, 'ascii'));
    parts.push(Buffer.from(esc + '!\x00', 'ascii')); // Normal

    if (item.notes) {
      parts.push(Buffer.from(`      * Notes: ${item.notes}\n`, 'ascii'));
    }
  }

  parts.push(Buffer.from('==========================================\n', 'ascii'));

  // Footer: Centered
  parts.push(Buffer.from(esc + 'a\x01', 'ascii')); // Align center
  parts.push(Buffer.from(esc + '!\x01', 'ascii')); // Bold
  parts.push(Buffer.from(`TOTAL ITEMS: ${totalQty}\n`, 'ascii'));
  parts.push(Buffer.from(esc + '!\x00', 'ascii'));
  parts.push(Buffer.from('SULTAN RESTAURANT - AUTO KOT\n', 'ascii'));

  // Feed 4 lines & cut
  parts.push(Buffer.from('\n\n\n\n', 'ascii'));
  parts.push(Buffer.from(gs + 'V\x00', 'ascii')); // Full cut

  return Buffer.concat(parts);
}

/**
 * Print a ticket buffer directly to a Windows printer using RawPrinter.exe
 */
function printTicketDirect(ticket, options = {}) {
  return new Promise((resolve, reject) => {
    const printerName = options.printerName || DEFAULT_THERMAL_PRINTER;
    const station = options.station || 'main';

    if (!fs.existsSync(RAW_PRINTER_EXE)) {
      return reject(new Error(`RawPrinter binary not found at ${RAW_PRINTER_EXE}`));
    }

    const buffer = buildEscPosKotBuffer(ticket, station);
    const tempFile = path.join(__dirname, `temp_kot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.bin`);

    fs.writeFile(tempFile, buffer, (writeErr) => {
      if (writeErr) return reject(writeErr);

      execFile(RAW_PRINTER_EXE, [printerName, tempFile], (execErr, stdout, stderr) => {
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (_) {}

        if (execErr) {
          console.warn(`[PrinterHelper] Direct print to ${printerName} failed:`, stderr || execErr.message);
          return reject(execErr);
        }

        console.log(`[PrinterHelper] Direct KOT printed successfully to ${printerName} (ticket: ${ticket.id})`);
        resolve({ success: true, printer: printerName, ticketId: ticket.id });
      });
    });
  });
}

module.exports = {
  buildEscPosKotBuffer,
  printTicketDirect,
  DEFAULT_THERMAL_PRINTER,
};
