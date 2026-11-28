import type { Ticket } from '../store/restaurantStore';

export type StationLedgerEntry = {
  seq: number;
  ticketId: string;
  tableId?: string;
  tableName?: string;
  server?: string;
  isAddOn?: boolean;
  roundNumber?: number;
  timePlaced?: number;
  itemCount?: number;
  itemsSummary?: string;
  status?: string;
  printStatus?: string;
  printError?: string | null;
  stationAckAt?: number | null;
  updatedAt?: number;
};

export type StationSequenceStatusResponse = {
  success: boolean;
  shiftId: string | null;
  shiftStartedAt: number;
  kitchenSeq: number;
  juiceSeq: number;
  currentSeq: number;
  ledger: StationLedgerEntry[];
};

export type RecoveredSeqReport = {
  seq: number;
  found: boolean;
  ticket?: Ticket | null;
  ledgerEntry?: StationLedgerEntry | null;
  reason: string;
  canReprint: boolean;
};

export function getTicketStationSeq(ticket: Partial<Ticket> | null | undefined, station: 'main' | 'juice'): number {
  if (!ticket) return 0;
  return station === 'juice' ? Number(ticket.juiceKotSeq || 0) : Number(ticket.kitchenKotSeq || 0);
}

export function formatStationTicketCode(ticket: Partial<Ticket> | null | undefined, station: 'main' | 'juice'): string {
  if (!ticket) return 'KOT';
  const seq = getTicketStationSeq(ticket, station);
  if (seq > 0) {
    return `${station === 'juice' ? 'SOT' : 'KOT'} #${seq}`;
  }
  return String(ticket.id || 'KOT');
}

export function computeStationSequenceGaps(params: {
  station: 'main' | 'juice';
  stationTickets: Ticket[];
  serverSeqStatus: StationSequenceStatusResponse | null;
  dismissedKeys?: Set<string>;
}) {
  const { station, stationTickets, serverSeqStatus, dismissedKeys } = params;
  const activeShiftId =
    serverSeqStatus?.shiftId ||
    stationTickets.find((t) => !!t?.kotShiftId)?.kotShiftId ||
    '';

  const presentSeqSet = new Set<number>();
  let maxPresentSeq = 0;

  for (const t of stationTickets) {
    if (!t) continue;
    const seq = getTicketStationSeq(t, station);
    if (seq <= 0) continue;
    if (activeShiftId && t.kotShiftId && t.kotShiftId !== activeShiftId) continue;
    presentSeqSet.add(seq);
    if (seq > maxPresentSeq) maxPresentSeq = seq;
  }

  const serverSeq = serverSeqStatus ? Number(serverSeqStatus.currentSeq || 0) : 0;
  const highestSeq = Math.max(maxPresentSeq, serverSeq);
  const missingSeqs: number[] = [];

  for (let s = 1; s <= highestSeq; s++) {
    if (!presentSeqSet.has(s)) {
      const dismissKey = `${activeShiftId}:${s}`;
      if (!dismissedKeys?.has(dismissKey)) {
        missingSeqs.push(s);
      }
    }
  }

  const ledger = Array.isArray(serverSeqStatus?.ledger) ? serverSeqStatus.ledger : [];
  const failedPrintEntries = ledger.filter((entry) => {
    if (!entry || entry.printStatus !== 'failed') return false;
    const printDismissKey = `${activeShiftId}:print:${entry.seq}`;
    return !dismissedKeys?.has(printDismissKey);
  });

  return {
    shiftId: activeShiftId,
    highestSeq,
    presentCount: presentSeqSet.size,
    missingSeqs,
    failedPrintEntries,
  };
}
